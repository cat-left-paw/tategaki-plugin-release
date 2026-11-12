import { Transaction, type Text } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { CommitReceipt, EditOwner, InsertionSnapshot } from "../input/edit-owner";
import { auditTransaction, type AuditedPlan } from "../input/edit-audit";
import type { EditContext } from "../input/edit-target";
import type { PlannedEdit } from "../input/edit-plan";
import { planCommit } from "../input/source-commit";
import { planDeletion } from "../input/source-deletion";
import { copySource } from "../input/source-copy";
import { planPaste } from "../input/source-paste";
import { planEnter } from "../input/source-enter";
import { sortChanges } from "../input/source-change";
import { judgeInsertion } from "../input/surface-state";
import type { CheckedEdit } from "../input/edit-check";
import type { SourcePoint } from "../source/source-map";
import { PmModeEditGuard, pmModeInput, pmModeSelectionHint, readSelectionHints, transactionShape } from "./edit-guard";
import { canDisplayEditTarget } from "./display-selection";
import { resolveCommitTargetRestriction, type CommitTargetRestriction } from "./commit-target-restriction";
import { PmModeHistory } from "./history-command";
import { classifyPmHistoryChord } from "./history-keys";

/**
 * H9 (b) (M3d; D29 and J3 ended): a note of the vault, that is a vault-relative path of a Markdown file (`.md`). The path is not normalized, so a path with `..`, a line break or NUL, an
 * absolute path and a file that is not `.md` are refused (`out-of-scope`). The generated samples (`pm-spike-samples/pm-spike-*.md`, the files the automated tests use) are such paths too.
 * The measuring tools (`diagnostics/`) keep their own, narrower check: they write only those samples (`PM_MODE_WRITABLE_SAMPLE`).
 */
export const PM_MODE_WRITABLE_SAMPLE = /^pm-spike-samples\/pm-spike-[^/\\]+\.md$/;
export function isPmModeWritablePath(path: string | null): boolean {
	return path !== null && path.length > 3 && !path.startsWith("/") && !path.includes("..") && !/[\r\n\0]/.test(path) && /\.md$/.test(path);
}
/** The narrow check of the measuring tools: only the generated samples (D29, kept for `diagnostics/`). */
export function isPmModeSamplePath(path: string | null): boolean {
	return path !== null && !path.includes("..") && !/[\r\n\0]/.test(path) && PM_MODE_WRITABLE_SAMPLE.test(path);
}
let viewSequence = 0;
/** Owned by PmModeView, never by its replaceable session (D26 / J5). */
export class PmModeWriteLifetime {
	readonly id = ++viewSequence;
	generation = 0;
	stopped = false;
}
/** Session copies this binding while adding mac. Use plain values/closures, never getters or values relying on this. */
export interface SourceOwnerBinding {
	readonly lifetime: PmModeWriteLifetime;
	/** Captured from the new-mode view window, also used by scope and key router. */
	readonly mac?: boolean;
	getPath(): string | null;
	/** The paired leaf identity; a re-pair invalidates every previous snapshot. */
	getPair(): unknown;
	isCurrent?(): boolean;
	/** Reading view has a CM object but Obsidian does not save its edits (L11). */
	canWrite?(): boolean;
	readonly rangeDisplay: "custom-highlight" | "rect-layer";
	/** `operation`: a refused key (Backspace, Delete, Enter) or a refused cut or paste (D-C-19) has no text kept on the input surface; a refused commit (none) has. */
	notice(reason: Exclude<CommitReceipt, "committed"> | "mismatch", operation?: "key" | "clipboard"): void;
}
type WriteOperation = "commit" | "delete" | "enter" | "paste";
type SavedContext = EditContext & { readonly ranges: number; readonly readingView: boolean };
interface PendingWrite { readonly operation: WriteOperation; readonly plan: PlannedEdit; readonly audit: AuditedPlan; readonly context: EditContext; readonly expected: Text; count: number; changes: number; transactions: number }

export class PmModeSourceOwner implements EditOwner {
	readonly history = new PmModeHistory();
	private generation: number;
	private path: string | null;
	private pair: unknown;
	private destroyed = false;
	private readonly snapshots = new WeakMap<InsertionSnapshot, SavedContext>();
	private pending: PendingWrite | null = null;
	private keyFailure: { reason: CommitReceipt; identity: string; docRef: Text; anchor: number; head: number } | null = null;
	private failure: Exclude<CommitReceipt, "committed"> | null = null;
	private keyStroke = "";
	/** Selection-only filters may change selection or provenance; CM remains the authority (J6 / K7). */
	selectionDifferences = 0;
	constructor(readonly cm: EditorView, readonly guard: PmModeEditGuard, private readonly context: () => EditContext, private readonly binding: SourceOwnerBinding, private readonly historyBlocked: () => boolean = () => false) {
		this.generation = ++binding.lifetime.generation;
		this.path = binding.getPath(); this.pair = binding.getPair();
	}
	get identity(): string {
		const path = this.binding.getPath(), pair = this.binding.getPair();
		if (path !== this.path || pair !== this.pair) { this.path = path; this.pair = pair; this.reconnect(); }
		return `${this.binding.lifetime.id}:${this.generation}`;
	}
	reconnect(): void { this.generation = ++this.binding.lifetime.generation; this.releaseKeyNotice(); }
	/** Called only when the input surface explicitly releases retained text (M2-2b). */
	releaseRetained(): void { this.failure = null; this.releaseKeyNotice(); }
	/** K2 / R2: a user boundary ends a run of blocked keys, even at the same CM selection. */
	releaseKeyNotice(): void { this.keyFailure = null; this.keyStroke = ""; }
	noteKeyDown(event: KeyboardEvent): void {
		const stroke = [event.key, event.code ?? "", !!event.ctrlKey, !!event.metaKey, !!event.altKey, !!event.shiftKey].join(":");
		if (stroke !== this.keyStroke) this.keyFailure = null;
		this.keyStroke = stroke;
	}
	private refuse(reason: Exclude<CommitReceipt, "committed">): CommitReceipt {
		if (this.failure !== reason) this.binding.notice(reason);
		this.failure = reason;
		return reason;
	}
	/**
	 * D-C-19 (F-3): a refusal of a cut or a paste. It is told once for each operation that was refused, in the key's sentence (nothing is kept on the input surface), and it neither reads nor writes
	 * `failure`, the mark that tells a text kept on the input surface once (J16): a refused paste does not make a later refused commit of the same reason silent, and a second refused paste of the
	 * same reason is told as the first was.
	 */
	private refuseClipboard(reason: Exclude<CommitReceipt, "committed">): CommitReceipt {
		this.binding.notice(reason, "clipboard");
		return reason;
	}
	private stop(): CommitReceipt {
		if (!this.binding.lifetime.stopped) { this.binding.lifetime.stopped = true; this.binding.notice("mismatch"); }
		this.failure = "stopped";
		return "stopped";
	}
	snapshotInsertion(): InsertionSnapshot {
		const identity = this.identity, context = this.context(), hints = readSelectionHints(this.cm.state);
		const selection = { anchor: this.cm.state.selection.main.anchor, head: this.cm.state.selection.main.head };
		const snapshot = Object.freeze({ identity, docRef: this.cm.state.doc, from: Math.min(selection.anchor, selection.head), to: Math.max(selection.anchor, selection.head) });
		// Keep direction and hints from the start of the operation, never the later CM selection.
		this.snapshots.set(snapshot, { ...context, selection, anchorHint: hints?.anchor, headHint: hints?.head, ranges: this.cm.state.selection.ranges.length, readingView: this.binding.canWrite?.() === false });
		return snapshot;
	}
	private accessFailure(): "out-of-scope" | "stopped" | null {
		if (!isPmModeWritablePath(this.binding.getPath()) || this.binding.rangeDisplay !== "custom-highlight") return "out-of-scope";
		return this.binding.lifetime.stopped ? "stopped" : null;
	}
	/** The clipboard stage (C-Q2): whether CodeMirror's selection is empty (a copy and a cut then do nothing). */
	selectionEmpty(): boolean { return this.cm.state.selection.main.empty; }
	/**
	 * The clipboard stage (D-C-1, C-Q1): the source a copy takes, which is what a cut of the same selection removes (`input/source-copy.ts`); null when nothing is selected or the
	 * note is not the one the display shows. Writes nothing, so no snapshot and no notice.
	 */
	copyText(): string | null {
		if (this.destroyed || this.binding.isCurrent?.() === false) return null;
		const context = this.context();
		if (context.state.source !== this.cm.state.doc.toString()) return null;
		const copy = copySource(context);
		return copy.kind === "text" ? copy.text : null;
	}
	/**
	 * The clipboard stage (D-C-2): a cut is the copy's text and the deletion the same selection gets from Backspace, in one transaction (`delete.cut`). `text` is given only when the cut was written (a
	 * cut that was refused changes nothing and takes nothing: the note keeps its text, the caller leaves the clipboard as it was). `nothing`: no selection (C-Q2). `snapshot`: the one the cut is asked
	 * for (the context menu takes it when its item is chosen and the text is already on the clipboard when it is used: a note that has changed since is `stale`).
	 */
	cutText(snapshot: InsertionSnapshot | null = this.snapshotInsertion()): { readonly receipt: CommitReceipt | "nothing"; readonly text: string | null } {
		const planned = this.planCut(snapshot);
		if (!("plan" in planned)) return { receipt: planned.receipt, text: null };
		const copy = copySource(planned.context), receipt = snapshot ? this.applyPlan(snapshot, planned.context, { ...planned.plan, userEvent: "delete.cut" }, "delete") : "stale";
		if (receipt === "committed") return { receipt, text: copy.kind === "text" ? copy.text : null };
		return { receipt: receipt === "stopped" ? receipt : this.refuseClipboard(receipt), text: null };
	}
	/**
	 * Round 2 (P2-3): what a cut of `snapshot` would take, asked before anything is written (the context menu writes the clipboard first, so the clipboard is not touched by a cut that is refused).
	 * `ready`: the cut can be written now, `text` is what it takes. Anything else is the reason, said once as the key's cut says it (nothing is written). The note may change before the cut is
	 * applied (`cutText` plans again and refuses a note that has: `stale`; the clipboard then keeps the copy, which the asynchronous API cannot avoid).
	 */
	cutPlan(snapshot: InsertionSnapshot | null): { readonly receipt: "ready"; readonly text: string } | { readonly receipt: CommitReceipt | "nothing"; readonly text: null } {
		const planned = this.planCut(snapshot);
		if (!("plan" in planned)) return { receipt: planned.receipt, text: null };
		const copy = copySource(planned.context);
		return copy.kind === "text" ? { receipt: "ready", text: copy.text } : { receipt: "nothing", text: null };
	}
	/** The cut's plan (D-C-2), nothing written: the checks of a write in their order, then the deletion the selection gets from Backspace. */
	private planCut(snapshot: InsertionSnapshot | null): { readonly context: SavedContext; readonly plan: PlannedEdit } | { readonly receipt: CommitReceipt | "nothing" } {
		this.releaseKeyNotice();
		const access = this.accessFailure(); if (access) return { receipt: this.refuseClipboard(access) };
		if (!snapshot) return { receipt: this.refuseClipboard("stale") };
		const context = this.preflight(snapshot, "");
		if (typeof context === "string") return { receipt: this.refuseClipboard(context) };
		if (context.selection.anchor === context.selection.head) return { receipt: "nothing" };
		if (!canDisplayEditTarget(context, "delete")) return { receipt: this.refuseClipboard("structure") };
		const plan = planDeletion(context, "Backspace");
		if (plan.kind === "noop") return { receipt: "nothing" };
		if (plan.kind === "blocked") return { receipt: this.refuseClipboard(plan.reason) };
		return { context, plan };
	}
	/**
	 * The clipboard stage (D-C-4 to D-C-7): `text` (line breaks as `\n`) written as the source it is, at the caret or over the range the snapshot has, in one transaction (`input.paste`, the operation
	 * `paste`). The preflight is the key's (its text is `""`: a paste has line breaks); it refuses a note that has changed since the snapshot (`stale`: the menu's Paste reads the clipboard
	 * between the two), a reading view, a path the new mode does not write, a stopped view. Where the display cannot show the target (an atom, a part, folded lines, the frontmatter, a range with a
	 * notation that shows nothing) or the plan refuses (the range's removal, a TCY, a definition's label), it writes nothing and says why once.
	 */
	pasteText(snapshot: InsertionSnapshot, text: string): CommitReceipt {
		this.releaseKeyNotice();
		const context = this.preflight(snapshot, "");
		if (typeof context === "string") return this.refuseClipboard(context);
		if (!canDisplayEditTarget(context, "commit")) return this.refuseClipboard("structure");
		const plan = planPaste(context, text);
		if (plan.kind !== "edit") return plan.kind === "blocked" ? this.refuseClipboard(plan.reason) : "committed";
		const receipt = this.applyPlan(snapshot, context, plan, "paste");
		return receipt === "committed" || receipt === "stopped" ? receipt : this.refuseClipboard(receipt);
	}
	/** Same ordered preflight for a composition snapshot and a key's fresh snapshot. */
	private preflight(snapshot: InsertionSnapshot, text: string): SavedContext | Exclude<CommitReceipt, "committed"> {
		const access = this.accessFailure(); if (access) return access;
		const identity = this.identity;
		const verdict = judgeInsertion(snapshot, { identity, docRef: this.cm.state.doc }, text);
		const context = this.snapshots.get(snapshot);
		if (this.destroyed || !this.guard.isInstalled(this.cm.state) || this.binding.isCurrent?.() === false || !context || verdict === "stale" || context.state !== this.context().state || context.state.source !== this.cm.state.doc.toString()) return "stale";
		if (context.readingView || this.binding.canWrite?.() === false) return "reading-view";
		if (verdict !== "ready") return verdict;
		if (context.ranges !== 1 || this.cm.state.selection.ranges.length !== 1) return "structure";
		return context;
	}
	/**
	 * BLOCK-WARN1 (D-W-1; Nyoze `254120c9`): whether a commit at `snapshot` is refused by where it would go, whatever the text is (`resolveCommitTargetRestriction`, the function `commitText` calls); null where it is
	 * not, and where the commit is refused for the environment (`reading-view`, `out-of-scope`, `stopped`, `stale`: the guards as they are). Writes nothing; no notice.
	 */
	commitTargetRestriction(snapshot: InsertionSnapshot): CommitTargetRestriction | null {
		const context = this.preflight(snapshot, "");
		return typeof context === "string" ? null : resolveCommitTargetRestriction(context);
	}
	commitText(snapshot: InsertionSnapshot, text: string): CommitReceipt {
		this.releaseKeyNotice();
		const context = this.preflight(snapshot, text);
		if (typeof context === "string") return this.refuse(context);
		// BLOCK-WARN1 (D-W-1): the refusals by where the text would go are one function's, which the pre-warning (`commitTargetRestriction`) calls too: a warning and a refusal cannot differ.
		const restriction = resolveCommitTargetRestriction(context, text);
		if (restriction) return this.refuse(restriction);
		const plan = planCommit(context, text);
		if (plan.kind !== "edit") return this.refuse(plan.kind === "blocked" ? plan.reason : "structure");
		const receipt = this.applyPlan(snapshot, context, plan, "commit");
		return receipt === "committed" || receipt === "stopped" ? receipt : this.refuse(receipt);
	}
	/** One audited dispatch for all planned edits, including an empty change set (selection only). */
	private applyPlan(snapshot: InsertionSnapshot, context: EditContext, plan: PlannedEdit, operation: WriteOperation): CommitReceipt {
		const changes = sortChanges(plan.changes, this.cm.state.doc.length), changeSet = this.cm.state.changes(changes);
		const expected = changeSet.apply(this.cm.state.doc), changesExpected = changeSet.empty ? 0 : 1;
		const audit: AuditedPlan = { docRef: snapshot.docRef, length: this.cm.state.doc.length, changes, selection: plan.selection };
		const pending: PendingWrite = { operation, plan, audit, expected, context, count: 0, changes: 0, transactions: 0 };
		this.pending = pending;
		try {
			this.guard.run(audit, changeSet.empty, () => this.cm.dispatch({ changes, selection: plan.selection,
				annotations: [Transaction.userEvent.of(plan.userEvent), pmModeInput.of(operation), ...(plan.hint ? [pmModeSelectionHint.of({ anchor: plan.hint, head: plan.hint })] : [])], scrollIntoView: false }));
		} catch {
			return this.cm.state.doc === snapshot.docRef ? "dispatch-rejected" : this.stop();
		} finally { this.pending = null; }
		if (this.cm.state.doc === snapshot.docRef && changesExpected) return "dispatch-rejected";
		const selection = this.cm.state.selection;
		const selectionOrProvenanceDiffers = selection.ranges.length !== 1 || selection.main.anchor !== plan.selection.anchor || selection.main.head !== plan.selection.head || pending.count !== 1 || pending.transactions !== 1 || pending.changes !== changesExpected;
		if (!changesExpected) {
			// K7: a selection-only plan has the same nonfatal differences as pointer selection (J6).
			if (this.cm.state.doc !== snapshot.docRef) return this.stop();
			if (selectionOrProvenanceDiffers) this.selectionDifferences++;
			if (this.guard.rejected) return "dispatch-rejected";
		} else if (!this.cm.state.doc.eq(expected) || selectionOrProvenanceDiffers) return this.stop();
		this.snapshots.delete(snapshot);
		this.failure = null; this.releaseKeyNotice();
		return "committed";
	}
	/** Follower calls synchronously. Reuse only the checked update of this exact transaction. */
	observe(update: ViewUpdate): CheckedEdit | null {
		// A real document/selection transition ends a run of repeated blocked keys (K2), even if it later moves back.
		if (update.docChanged || !update.startState.selection.eq(update.state.selection)) this.keyFailure = null;
		const pending = this.pending;
		if (!pending) return null;
		pending.transactions += update.transactions.length;
		const ours = update.transactions.filter(tr => tr.annotation(pmModeInput) === pending.operation);
		pending.count += ours.length; pending.changes += ours.filter(tr => tr.docChanged).length;
		return update.transactions.length === 1 && update.transactions[0].annotation(pmModeInput) === pending.operation
			&& !auditTransaction(pending.audit, transactionShape(update.transactions[0])) && update.state.doc.eq(pending.expected)
			&& this.context().state === pending.context.state ? pending.plan.checked : null;
	}
	/**
	 * Pointer/navigation supply already-normalized model endpoints and their source hints. The user event is `select`, not
	 * `select.pointer` (J18, M2-2b review 1): CodeMirror treats `select.pointer` as its own mouse selection and writes the
	 * DOM selection even without focus, which moved the browser's focus into the paired editor at every click. The
	 * origin is the `pmModeInput` annotation; the history's grouping of selections (`select` family) is the same.
	 */
	select(anchor: number, head: number, hints: { readonly anchor: SourcePoint; readonly head: SourcePoint }): boolean {
		this.releaseKeyNotice();
		if (this.destroyed || !this.guard.isInstalled(this.cm.state) || this.binding.lifetime.stopped || this.binding.isCurrent?.() === false) return false;
		void this.identity;
		const { state } = this.context(), map = state.sourceMap;
		if (state.source !== this.cm.state.doc.toString()) return false;
		for (const [pos, point] of [[anchor, hints.anchor], [head, hints.head]] as const) {
			if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size || point.affinity !== pos || point.offset !== map.pmToSource(pos)) return false;
		}
		const selection = { anchor: hints.anchor.offset, head: hints.head.offset }, docRef = this.cm.state.doc;
		try {
			this.guard.run({ docRef, length: docRef.length, changes: [], selection }, true, () => this.cm.dispatch({ selection,
				annotations: [Transaction.userEvent.of("select"), pmModeInput.of("selection"), pmModeSelectionHint.of(hints)], scrollIntoView: false }));
		} catch { if (this.cm.state.doc !== docRef) this.stop(); return false; }
		if (this.cm.state.doc !== docRef) { this.stop(); return false; }
		if (this.cm.state.selection.ranges.length !== 1 || this.cm.state.selection.main.anchor !== selection.anchor || this.cm.state.selection.main.head !== selection.head) this.selectionDifferences++;
		return !this.guard.rejected;
	}
	/** D-M3-6 (amended): CM's exact all selection has no hints; M2 retains frontmatter on edits. */
	selectAll(): boolean {
		this.releaseKeyNotice();
		if (this.destroyed || this.historyBlocked() || !this.guard.isInstalled(this.cm.state) || this.binding.lifetime.stopped || this.binding.isCurrent?.() === false) return false;
		void this.identity;
		const docRef = this.cm.state.doc, current = this.cm.state.selection.main;
		if (this.context().state.source !== docRef.toString()) return false;
		if (this.cm.state.selection.ranges.length === 1 && current.anchor === 0 && current.head === docRef.length && !readSelectionHints(this.cm.state)) return false;
		const selection = { anchor: 0, head: docRef.length };
		try {
			this.guard.run({ docRef, length: docRef.length, changes: [], selection }, true, () => this.cm.dispatch({ selection,
				annotations: [Transaction.userEvent.of("select"), pmModeInput.of("selection")], scrollIntoView: false }));
		} catch { if (this.cm.state.doc !== docRef) this.stop(); return false; }
		if (this.cm.state.doc !== docRef) { this.stop(); return false; }
		if (this.cm.state.selection.ranges.length !== 1 || this.cm.state.selection.main.anchor !== 0 || this.cm.state.selection.main.head !== docRef.length) this.selectionDifferences++;
		return !this.guard.rejected;
	}
	/** K2: event/selection based suppression only; it never retries an edit or waits for a quiet period. */
	private refuseKey(reason: Exclude<CommitReceipt, "committed">): "handled" {
		const identity = this.identity, docRef = this.cm.state.doc, { anchor, head } = this.cm.state.selection.main, previous = this.keyFailure;
		if (!previous || previous.reason !== reason || previous.identity !== identity || previous.docRef !== docRef || previous.anchor !== anchor || previous.head !== head) this.binding.notice(reason, "key");
		this.keyFailure = { reason, identity, docRef, anchor, head };
		return "handled";
	}
	handleKeyDown(event: KeyboardEvent): "handled" | "unhandled" {
		this.noteKeyDown(event);
		const key = event.key;
		const mac = this.binding.mac === true;
		const direction = classifyPmHistoryChord(event, mac);
		if (direction) return this.runHistory(event, direction);
		if (!/^(Backspace|Delete|Enter)$/.test(key) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229) return "unhandled";
		const access = this.accessFailure(); if (access) return this.refuseKey(access);
		const snapshot = this.snapshotInsertion(), context = this.preflight(snapshot, "");
		if (typeof context === "string") return this.refuseKey(context);
		const operation = key === "Enter" ? "enter" : "delete";
		if (!canDisplayEditTarget(context, operation)) return this.refuseKey("structure");
		const plan = key === "Enter" ? planEnter(context, event.shiftKey) : planDeletion(context, key as "Backspace" | "Delete");
		if (plan.kind === "noop") { this.keyFailure = null; return "handled"; }
		if (plan.kind === "blocked") return this.refuseKey(plan.reason);
		const receipt = this.applyPlan(snapshot, context, plan, operation);
		// A new D26 stop already reported the mismatch. Do not stack an immediate second Notice on it.
		return receipt === "committed" || receipt === "stopped" ? "handled" : this.refuseKey(receipt);
	}
	private runHistory(event: KeyboardEvent, direction: "undo" | "redo"): "handled" {
		if (event.isComposing || event.keyCode === 229 || this.historyBlocked()) return "handled";
		const access = this.accessFailure(); if (access) return this.refuseKey(access);
		void this.identity;
		// Undo/Redo use CM's command, without a planned edit or a display-target restriction (K3).
		if (this.destroyed || !this.guard.isInstalled(this.cm.state) || !this.history.isInstalled(this.cm) || this.binding.isCurrent?.() === false || this.context().state.source !== this.cm.state.doc.toString()) return this.refuseKey("stale");
		if (this.binding.canWrite?.() === false) return this.refuseKey("reading-view");
		const result = this.history.run(this.cm, direction);
		if (result === "mismatch") this.stop();
		else this.releaseKeyNotice();
		return "handled";
	}
	destroy(): void { this.destroyed = true; this.reconnect(); }
}
