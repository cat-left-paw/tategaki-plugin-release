// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/caretReveal.ts @ 020b5501 (2026-10-22)
//   and revealDelta from src/editor-core/features/inputSurface/navigation/scroll.ts @ 020b5501
// Local changes: CM's pmModeInput edit annotation replaces PM's scrolledIntoView flag. The read-only display
//   supplies the caret through display-geometry.ts, and the explicit shadow scroll element supplies the viewport;
//   no TipTap EditOwner, NodeSelection, handleScrollToSelection, caretGeometry or pageUpDownNavigation dependency.
//   M2 draws text carets only. Selection ownership is read in the shadow tree and also requires surface focus.
//   Scroll deltas account for page scale. Placement runs in the same callback even if no scroll was needed.
//   J28: pass the committed caret line and its resulting edge to chunk skipping in this callback, after any scroll write.
//   M2-3b: CM history has no new-mode annotation; its synchronous command supplies the reveal mark instead.
//   M3c (D-M3-8): with Typewriter on, the reveal's one step takes the Typewriter's follow in place of the viewport rule on the main axis (`options.follow`, `typewriter.ts`): the follow
//   is decided here, with the caret already read, so the frame scrolls once and Typewriter and reveal never scroll twice. When Typewriter is off, suppressed for this key, or the caret is in
//   its band, the reveal's own rule applies as before.
//   M3c round 2 (R2-5): the frame has two stages. `run` is the reveal's reads and returns its writes (the scroll, the chunks' anchor, the surface's placement: `prepareRevealed` reads for it and
//   returns its writes); the display jobs read next (each returns its writes); then the writes run in that order. Nothing is read after the first write of the frame, so the frame's reads cost one
//   layout whoever asked (before, the job read after the reveal had written the surface's place).
//   C-d (D-T-5; not in Nyoze): a selection that another editor put in the note and asked to be shown (`tr.scrollIntoView`: the outline's click, typing or the arrow keys in the note's own editor)
//   also asks for the frame's reveal step. The new mode's own input has `pmModeInput` and is the case above (the surface owns the selection); this one is not the surface's: the focus is
//   elsewhere (the note's editor), and the step takes none and writes no transaction: it moves the display only. It is not asked for while a composition is going on or committing, and does
//   not run when the view is not shown (no layout); the generation, the view and the eligibility are read again in the frame, as for the other.
//   D-T-6 and D-T-7 (2026-11-11; not in Nyoze): the selection another editor put and asked to be shown is also one that only says `select` (CodeMirror's `select.pointer`: a caret put in the note by a
//   click, with no `scrollIntoView`), and a request that could not be sent because the view was not shown (another tab of the same group in front) is remembered, once, and sent once when the view is
//   shown again (the mount's `ResizeObserver` tells, `layoutChanged`; no timer, no polling).
//   D-C-22 (2026-11-11; not in Nyoze): a change of the writing mode (vertical to horizontal and back) asks for the same external step, once (`writingModeChanged`): the new layout starts at the head of
//   the document, and the step shows the caret (a range's head) from there, as a selection another editor put does; a view that is not shown waits for it as D-T-7 does.
//   D-C-25 (2026-11-12; review 3, P2-1): the step for a selection that only says `select` (D-T-6: a caret put by a click in the note, no `scrollIntoView`) does not take Typewriter's follow: it shows the caret only
//   if it is out of view (`revealDelta`), as the click of the new mode's own display does not follow Typewriter either. The step for a selection that asked to be shown (D-T-5) and the writing mode's (D-C-22)
//   keep the follow; a request remembered for a view that is not shown (D-T-7) is sent as the kind it was.
//   M3b: this display frame is the only one the new mode has: other display work (the range overlay's redraw after a layout
//   change, `range-overlay.ts`) joins it through `requestDisplay` and runs in the same animation frame, after the reveal's step.
import type { Transaction } from "@codemirror/state";
import type { PmModeDisplay } from "../pm/view";
import { pmModeInput } from "./edit-guard";
import { selectionOf, type ViewRoot } from "./composed-tree";
import { readDisplayCaret, type DisplayCaret } from "./display-geometry";
import { readContentOrigin } from "./content-coordinates";
import { pmModeNavigation } from "./navigation/origin";
import type { InputSurface, SurfaceRecord } from "./input-surface";
import type { TypewriterPlan } from "./typewriter";

export type RevealSelectionOwner = "surface" | "host" | "other";
/** D-C-25: `scroll` = the selection asked to be shown (`scrollIntoView`, D-T-5) or the writing mode changed (D-C-22); `select` = it only said `select` (D-T-6). */
export type ExternalKind = "scroll" | "select";
export function resolveRevealSelectionOwner(focusNode: Node | null, host: Node, surface: Node): RevealSelectionOwner {
	if (!focusNode) return "other";
	const target = focusNode.nodeType === 1 ? focusNode : focusNode.parentNode;
	if (!target) return "other";
	if (host.contains(target)) return "host";
	return surface.contains(target) ? "surface" : "other";
}
export function judgeCaretRevealRequest(input: { eligible: boolean; scrollRequested: boolean; owner: RevealSelectionOwner; surfaceComposing: boolean }) {
	if (!input.eligible) return "ineligible";
	if (!input.scrollRequested) return "no-scroll-request";
	if (input.owner === "host") return "host-owns-selection";
	if (input.owner === "other") return "selection-elsewhere";
	if (input.surfaceComposing) return "composing";
	return "request";
}
export function judgeCaretRevealRun(input: { viewDestroyed: boolean; eligible: boolean; sameGeneration: boolean; owner: RevealSelectionOwner; surfaceComposing: boolean }) {
	if (input.viewDestroyed) return "view-destroyed";
	if (!input.eligible) return "ineligible";
	if (!input.sameGeneration) return "generation-changed";
	if (input.owner !== "surface") return "selection-moved";
	if (input.surfaceComposing) return "composing";
	return "run";
}
/** C-d (D-T-5): whether a selection that another editor put (and asked to be shown) is asked of the next frame: not while the surface composes or commits. */
export function judgeExternalRevealRequest(input: { eligible: boolean; connected: boolean; action: string }) {
	if (!input.eligible || !input.connected) return "ineligible";
	if (input.action === "wait-for-composition" || input.action === "busy-flushing") return "composing";
	return "request";
}
/** C-d (D-T-5): the frame's own reading of that request: the view is still there, the same note, nothing composing, and laid out (a view that is not shown has no boxes to read). */
export function judgeExternalRevealRun(input: { viewDestroyed: boolean; eligible: boolean; sameGeneration: boolean; action: string; visible: boolean }) {
	if (input.viewDestroyed) return "view-destroyed";
	if (!input.eligible) return "ineligible";
	if (!input.sameGeneration) return "generation-changed";
	if (input.action === "wait-for-composition" || input.action === "busy-flushing") return "composing";
	if (!input.visible) return "not-shown";
	return "run";
}
/** Nyoze / PM: no movement inside the viewport, even within the margin. An outside caret takes 5 viewport px. */
export function revealDelta(start: number, end: number, viewStart: number, viewEnd: number, margin = 5): number {
	if (start < viewStart) return -(viewStart - start + margin);
	if (end > viewEnd) return end - start > viewEnd - viewStart ? start + margin - viewStart : end - viewEnd + margin;
	return 0;
}
export function createCaretReveal(options: {
	display: PmModeDisplay;
	scrollHost: HTMLElement;
	surface: InputSurface;
	isEligible(): boolean;
	getGeneration(): string;
	caret?(): DisplayCaret | null;
	/** M3c: Typewriter's follow for this caret (the viewport's box and the writing mode are read here); null when it does not apply: the reveal's rule is used. */
	follow?(caret: DisplayCaret, context: { box: DOMRect; writingMode: string }): TypewriterPlan | null;
	/** Keep the committed caret edge after any reveal scroll (J28), before ResizeObserver can undo that position. */
	onCaretPosition?(line: HTMLElement, startOffset: number, scale: number): void;
	/** Reads for the surface's placement after a reveal and returns the write (R2-5: the placement's reads are in the frame's read stage); null when it does not place now. */
	prepareRevealed(): (() => void) | null;
	record?: SurfaceRecord;
}) {
	const { display, scrollHost, surface } = options, view = display.view;
	const firstWindow = scrollHost.ownerDocument.defaultView;
	if (!firstWindow) throw new Error("PM mode: no window for caret reveal");
	const win: Window = firstWindow;
	const record = options.record ?? (() => {});
	const counts = { requested: 0, executed: 0, scrolled: 0, skipped: 0 };
	let displayJobs = 0;
	let frame = 0, destroyed = false, requestedGeneration = "", revealPending = false, externalPending = false;
	/** D-T-7: a request that another editor's selection made and that was not sent because the view was not shown: one mark, with the note (generation) it was made for. */
	let waiting: { readonly generation: string; readonly kind: ExternalKind } | null = null;
	/** D-C-25: what the pending external step is for: a selection that asked to be shown or the writing mode changing (`"scroll"`: the step takes Typewriter's follow), or one that only said `select` (`"select"`: it does not). */
	let externalKind: ExternalKind = "scroll";
	/** Display work that asked for the next frame (a set: asking twice runs once). A job reads and returns its writes (R2-5). */
	const jobs = new Set<() => (() => void) | void>();
	const owner = (): RevealSelectionOwner => surface.hasFocus()
		? resolveRevealSelectionOwner(selectionOf(surface.element.getRootNode() as ViewRoot)?.focusNode ?? null, view.dom, surface.element) : "other";
	/** `external`: the step another editor's selection asked for (D-T-5): it does not need the surface to hold the focus or the selection. */
	const run = (external = false, kind: ExternalKind = "scroll"): (() => void) | null => {
		counts.executed++;
		const verdict = external
			? judgeExternalRevealRun({ viewDestroyed: destroyed || view.isDestroyed, eligible: options.isEligible(), sameGeneration: requestedGeneration === options.getGeneration(), action: surface.documentAction(), visible: scrollHost.getClientRects().length > 0 })
			: judgeCaretRevealRun({ viewDestroyed: destroyed || view.isDestroyed, eligible: options.isEligible(),
				sameGeneration: requestedGeneration === options.getGeneration(), owner: owner(), surfaceComposing: surface.isComposing() });
		if (verdict !== "run") {
			counts.skipped++; record("caret-reveal-skipped", { reason: verdict, ...(external ? { external } : {}) });
			// D-T-7: the view has no layout (another tab in front): the step is not lost, it waits for the view to be shown (`layoutChanged`).
			if (external && verdict === "not-shown") { waiting = { generation: requestedGeneration, kind }; record("caret-reveal-external-waits"); }
			return null;
		}
		// Read only the caret's line (possibly forcing its one skipped chunk); no other chunk's descendants.
		const caret = options.caret ? options.caret() : readDisplayCaret(display, "head");
		if (!caret) { counts.skipped++; record("caret-reveal-skipped", { reason: "rect-unavailable" }); return null; }
		const origin = readContentOrigin(scrollHost), box = scrollHost.getBoundingClientRect(), scale = origin.scale;
		const left = box.left + scrollHost.clientLeft * scale, top = box.top + scrollHost.clientTop * scale;
		let dx = revealDelta(caret.rect.left, caret.rect.right, left, left + scrollHost.clientWidth * scale) / scale;
		let dy = revealDelta(caret.rect.top, caret.rect.bottom, top, top + scrollHost.clientHeight * scale) / scale;
		const lineRect = caret.block?.getBoundingClientRect();
		const writingMode = win.getComputedStyle(scrollHost).writingMode, vertical = writingMode.startsWith("vertical");
		// Typewriter's follow replaces the main axis' rule (V's `scrollDelta`, viewport px: the page scale is divided out as the reveal's own delta is).
		// (D-C-25: the step for a selection that only said `select` is not one of Typewriter's: no follow)
		const followed = external && kind === "select" ? null : options.follow?.(caret, { box, writingMode }) ?? null;
		if (followed) { if (followed.axis === "x") dx = followed.delta / scale; else dy = followed.delta / scale; }
		const beforeX = scrollHost.scrollLeft, beforeY = scrollHost.scrollTop;
		// (the surface's placement reads here too: R2-5; it returns its write)
		const placement = options.prepareRevealed();
		return () => {
			if (dx) scrollHost.scrollLeft += dx;
			if (dy) scrollHost.scrollTop += dy;
			if (scrollHost.scrollLeft !== beforeX || scrollHost.scrollTop !== beforeY) {
				counts.scrolled++;
				record("caret-reveal", { position: view.state.selection.from, ...(external ? { external } : {}) });
			}
			if (caret.block && lineRect) {
				// Keep the edge where this reveal put it. Reading it after the write could lay out estimated chunks
				// and silently accept their drift before ResizeObserver corrects it (especially under scale).
				// Native input may already have scrolled the surface into view before this callback: preserve that
				// position too, even when revealDelta is zero. Otherwise the old chunk anchor can still undo it.
				const startOffset = vertical
					? box.right - lineRect.right + (scrollHost.scrollLeft - beforeX) * scale
					: lineRect.top - box.top - (scrollHost.scrollTop - beforeY) * scale;
				options.onCaretPosition?.(caret.block, startOffset, scale);
			}
			placement?.();
		};
	};
	/** The one frame: the reveal's reads (when one is asked for), then each display job's reads, then all their writes in that order (R2-5). */
	const tick = (): void => {
		frame = 0;
		const due = [...jobs]; jobs.clear();
		const writes: (() => void)[] = [];
		// (a selection of another editor that asked to be shown (D-T-5) takes the same one step; where the surface's own request also stands and ran, that step has shown the caret)
		const own = revealPending, outside = externalPending, outsideKind = externalKind;
		revealPending = false; externalPending = false;
		let revealWrite = own ? run() : null;
		if (!revealWrite && outside) { revealWrite = run(true, outsideKind); record("caret-reveal-external-frame", { ran: !!revealWrite }); }
		if (revealWrite) writes.push(revealWrite);
		for (const job of due) { displayJobs++; if (!destroyed) { const write = job(); if (write) writes.push(write); } }
		for (const write of writes) write();
	};
	const ensureFrame = (): void => { if (!frame) frame = win.requestAnimationFrame(tick); };
	/** Drops the pending reveal step (and the frame, when no display job waits for it). */
	const cancel = (): void => { revealPending = false; externalPending = false; if (frame && jobs.size === 0) { win.cancelAnimationFrame(frame); frame = 0; } };
	/** Asks the next frame for the step another editor's selection wants (D-T-5; D-T-7 asks it again for a view that is shown). */
	const askExternal = (kind: ExternalKind): void => {
		// (two asks in one frame: the one that follows Typewriter, which a selection that asked to be shown or a writing mode change is, wins over one that only said `select`)
		if (externalPending) { if (kind === "scroll") externalKind = "scroll"; return; }
		externalPending = true; externalKind = kind;
		counts.requested++;
		ensureFrame();
	};
	return {
		/** One next-frame display update per batch of SourceOwner edits. No ownership, completion or focus is inferred. */
		note(transactions: readonly Transaction[], history = false): void {
			const scrollRequested = history || transactions.some(tr => { const origin = tr.annotation(pmModeInput); return origin === "commit" || origin === "delete" || origin === "enter" || origin === "paste" || origin === "selection" && !!tr.annotation(pmModeNavigation); });
			if (destroyed) return;
			// D-T-7: the view's own input or movement (any transaction of its own, its history too) comes before the view was shown: what waited is not sent any more.
			if (waiting && (history || transactions.some(tr => tr.annotation(pmModeInput) !== undefined))) waiting = null;
			if (!scrollRequested) {
				// F-2 (diagnostic only): every selection another editor puts in the note is recorded with what it asks (`scrollIntoView`, effects), so that a recording can tell a selection that did not
				// ask to be shown (a separate dispatch of Obsidian's `scrollIntoView` effect, say) from one that never reached this view.
				for (const tr of transactions) if (tr.selection !== undefined && tr.annotation(pmModeInput) === undefined) record("caret-reveal-external-selection", { scrollIntoView: tr.scrollIntoView, select: tr.isUserEvent("select"), effects: tr.effects.length, docChanged: tr.docChanged });
				// D-T-5: not this view's own input: a selection another editor put and asked to be shown. Only the display moves; no focus, no transaction.
				// D-T-6: one that only says `select` (a caret put by a click in the note: CodeMirror's `select.pointer`, no `scrollIntoView`) is followed too; the step moves nothing when the caret is in view.
				// A selection that says neither (another plugin changing it quietly) is not. The view's own selections carry `pmModeInput` and are not this path (it is checked first).
				// (the view's own history command is the case above, whatever the transactions carry: `history`)
				if (!transactions.some(tr => tr.selection !== undefined && tr.annotation(pmModeInput) === undefined && (tr.scrollIntoView || tr.isUserEvent("select")))) return;
				const asked = judgeExternalRevealRequest({ eligible: options.isEligible(), connected: scrollHost.isConnected, action: surface.documentAction() });
				// F-2 (diagnostic only, brief §11.11): what became of the ask, and which window the display's frame is bound to and the one the display is in, so that a recording of a popout can tell an ask
				// that was not made (this record says so, or is missing) from a frame that did not run (`caret-reveal-external-frame` is missing) or was skipped (`caret-reveal-skipped`).
				record("caret-reveal-external-ask", { verdict: asked, connected: scrollHost.isConnected, ownWindow: win === scrollHost.ownerDocument.defaultView, visibility: scrollHost.ownerDocument.visibilityState });
				if (asked !== "request") return;
				requestedGeneration = options.getGeneration();
				askExternal(transactions.some(tr => tr.selection !== undefined && tr.annotation(pmModeInput) === undefined && tr.scrollIntoView) ? "scroll" : "select");
				return;
			}
			if (judgeCaretRevealRequest({ eligible: options.isEligible(), scrollRequested, owner: owner(), surfaceComposing: surface.isComposing() }) !== "request") return;
			requestedGeneration = options.getGeneration();
			if (revealPending) return;
			revealPending = true;
			counts.requested++;
			ensureFrame();
		},
		/** M3b: run `job` in the next display frame (once, however often it is asked for), after the reveal's step of that frame. No new frame is made for it when one is pending. */
		requestDisplay(job: () => (() => void) | void): void {
			if (destroyed) return;
			jobs.add(job);
			ensureFrame();
		},
		cancel,
		/**
		 * D-T-7: the view's size changed (the mount's `ResizeObserver`, which reports a view that was hidden and is shown again as a size that went from nothing back). A request that waited because the
		 * view was not shown is sent now, once, if the view has a layout, it is still the note it was made for, and nothing composes (the rules of D-T-5): the step reads the display's caret as it is now.
		 */
		layoutChanged(): void {
			if (destroyed || !waiting || scrollHost.getClientRects().length === 0) return;
			const wait = waiting; waiting = null;
			const verdict = wait.generation !== options.getGeneration() ? "generation-changed" : judgeExternalRevealRequest({ eligible: options.isEligible(), connected: scrollHost.isConnected, action: surface.documentAction() });
			record("caret-reveal-external-shown", { verdict });
			if (verdict !== "request") return;
			requestedGeneration = wait.generation;
			askExternal(wait.kind);
		},
		/**
		 * D-C-22 (O-3): the writing mode changed (the settings reached the view): the caret, or a range's head, is shown in the new layout, once, by the step another editor's selection asks for (it moves the display only:
		 * no focus, no transaction). Not while a composition goes on or commits; a view with no layout waits for the view to be shown (D-T-7). A change of other settings does not call this.
		 */
		writingModeChanged(): void {
			if (destroyed) return;
			const asked = judgeExternalRevealRequest({ eligible: options.isEligible(), connected: scrollHost.isConnected, action: surface.documentAction() });
			record("caret-reveal-writing-mode", { verdict: asked });
			if (asked !== "request") return;
			requestedGeneration = options.getGeneration();
			askExternal("scroll");
		},
		counters: () => ({ ...counts, pending: !!frame && (revealPending || externalPending) }),
		/** M3b: what the display jobs that joined this frame did (for tests and diagnostics; `counters` keeps its M2 shape). */
		displayCounters: () => ({ jobs: displayJobs, boundToElementWindow: win === scrollHost.ownerDocument.defaultView }),
		destroy(): void { destroyed = true; waiting = null; jobs.clear(); revealPending = false; externalPending = false; if (frame) win.cancelAnimationFrame(frame); frame = 0; },
	};
}
