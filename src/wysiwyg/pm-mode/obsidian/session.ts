import type { EditorView as CmView, ViewUpdate } from "@codemirror/view";
import { setIcon } from "obsidian";
import type { CommonSettings, TategakiV2Settings } from "../../../types/settings";
import { t } from "../../../shared/i18n";
import { resolveAutoTcyDigitRange } from "../../../shared/aozora-tcy";
import { PmModeDisplay, type PmModeOpenTimings, type PmModeUpdateTimings } from "../pm/view";
import type { PmModeDecorationSettings } from "../pm/decorations";
import { createPmModeMount, type PmModeMount } from "./mount";
import { PmModeCmFollower } from "./cm-follower";
import { PmModeOffscreenSkip } from "./offscreen-skip";
import { PmModeChunkSkip } from "./chunk-skip";
import { computePmModeStyle } from "./styles/settings-style";
import { ObsidianPmModeParts, type PmModeObsidianEnv } from "./parts";
import { PmModeEditGuard, readSelectionHints } from "./edit-guard";
import { PmModeSourceOwner, PmModeWriteLifetime, type SourceOwnerBinding } from "./source-owner";
import { syncDisplaySelection } from "./display-selection";
import { showPmModeEditNotice } from "./key-notice";
import { PmModeInput, type PmModeFocusEntry } from "./input-wiring";
import { readDisplaySettings } from "./display-settings";
import { createTailSpacerElement } from "./display-visuals";
import { createCompositionWidgetElement, normalizePreeditDisplay } from "./composition-presentation";
import type { SurfaceRecord } from "./input-surface";
import type { EditContext } from "../input/edit-target";

/**
 * The folded heading lines after a CM change. Each heading's line start is mapped through the
 * change (after text inserted there) and its line end before text inserted there; the line
 * holding the mapped start is the heading's new line. So a line break typed before the heading
 * moves the fold with it, and edits on both sides of an unedited heading in one transaction keep
 * it (M1-3/M1-4 review R3, Q1: an intended difference from V's shift by the total line delta,
 * M1 design §9). When the heading's whole text was deleted (the mapped end is not after the
 * mapped start), the fold is dropped rather than passed to the next line. The line model then
 * drops the lines that are no longer foldable headings.
 */
export function shiftCollapsedForUpdate(collapsed: ReadonlySet<number>, update: ViewUpdate): Set<number> {
	const mapped = new Set<number>();
	const before = update.startState.doc, after = update.state.doc;
	for (const line of collapsed) {
		if (line < 0 || line >= before.lines) continue;
		const heading = before.line(line + 1);
		const start = update.changes.mapPos(heading.from, 1), end = update.changes.mapPos(heading.to, -1);
		if (end <= start) continue;
		mapped.add(after.lineAt(start).number - 1);
	}
	return mapped;
}

/** The time of the last rebuild after a CM change, in ms (M1-5 diagnostics). */
export interface PmModeRebuildTimings {
	/** Reading CM's whole text. */
	text: number;
	/** The whole rebuild (folds, text, display update, presentation). */
	total: number;
	display: PmModeUpdateTimings | null;
}
/** The time of building the session (opening), in ms (M1-5 diagnostics). */
export interface PmModeSessionOpenTimings {
	/** The whole constructor. */
	total: number;
	/** The shadow root and its frame. */
	mount: number;
	/** The display: model, chunk layout, decorations, ProseMirror's view (`stages`). */
	display: number;
	stages: PmModeOpenTimings;
	/** The rest: the CodeMirror subscription and the presentation. */
	rest: number;
}

/** Switches for comparisons in tests and benches (not settings). */
export interface PmModeSessionOptions {
	/** Focus may return only to the active, open view. */
	isActive?(): boolean;
	/** The persistent view's identity, path, write stop and notices (M2-2a). */
	sourceOwner?: SourceOwnerBinding;
	/**
	 * The input surface, the focus, the pointer lending and the range display (M2-2b). On with `sourceOwner` (the
	 * product's way in) and off without it, unless set: the M1 tests open a display with no owner and no surface.
	 */
	inputSurface?: boolean;
	/** The view out of the accessibility tree (D25). On unless false. */
	accessibilityHidden?: boolean;
	/**
	 * Skip the layout of blocks outside the view (offscreen-skip.ts). Off unless true: turning it on costs time
	 * that grows with the square of the number of paragraphs (M1-5 report §12; D25 as revised on 2026-10-21).
	 */
	offscreenSkip?: boolean;
	/**
	 * Group runs of text lines into chunks in the view's document (CHUNK1). On unless false, and off with
	 * `offscreenSkip`: that skip is per line on the root's children, so it is measured on the flat view.
	 */
	chunked?: boolean;
	/**
	 * Skip the chunks outside the view, with estimated sizes until they are shown (CHUNK2-B, chunk-skip.ts;
	 * chunked-skip design §9). On unless false; only with chunks.
	 */
	chunkSkip?: boolean;
}

export class PmModeSession {
	private inputRecord: { record: SurfaceRecord; closed(): void } | null = null;
	/** Disabled: only this no-op hook runs; no recorder, DOM listener or serializer is called. */
	private readonly recordInput: SurfaceRecord = (kind, detail) => { try { this.inputRecord?.record(kind, detail); } catch { /* Diagnostics cannot interrupt an input. */ } };
	/** One read-only diagnostic subscriber per session; never replaces the surface. */
	subscribeInputRecords(record: SurfaceRecord, closed: () => void): () => void {
		if (this.destroyed || this.inputRecord) throw new Error("Input record subscription unavailable");
		const entry = { record, closed }; this.inputRecord = entry;
		return () => { if (this.inputRecord === entry) this.inputRecord = null; };
	}

	readonly editGuard = new PmModeEditGuard();
	readonly sourceOwner: PmModeSourceOwner;
	/** The input surface and what keeps the focus on it; null when the session was made without it. */
	readonly input: PmModeInput | null;
	readonly mount: PmModeMount;
	readonly display: PmModeDisplay;
	readonly skip: PmModeOffscreenSkip;
	/** Null without chunks or with `chunkSkip: false`. */
	readonly chunkSkip: PmModeChunkSkip | null;
	private follower: PmModeCmFollower;
	private destroyed = false;
	private renderedSettings: { enableRuby: boolean; plainTextView: boolean };
	/** Folded heading lines (the view's state; CM's text is not changed). */
	private collapsed = new Set<number>();
	private readonly parts: ObsidianPmModeParts | null;
	private timings: PmModeRebuildTimings | null = null;
	private readonly openTiming: PmModeSessionOpenTimings;
	/** The style the blocks were last measured with (offscreen-skip.ts). */
	private measuredStyle = "";
	/** D-C-22: the writing mode the display was last given; a change of it (not of any other setting) shows the caret again. */
	private presentedWritingMode = "";
	/** Without `env` (pure tests), Obsidian parts are not drawn and atoms show their source text. */
	constructor(container: HTMLElement, readonly cm: CmView, private settings: TategakiV2Settings, private common: CommonSettings = settings.common, env?: PmModeObsidianEnv, options: PmModeSessionOptions = {}) {
		const t0 = performance.now();
		this.mount = createPmModeMount(container, settings, common, changed => {
			if (changed.height) this.skip?.remeasure();
			this.chunkSkip?.onLineLengthChange();
			this.input?.layoutChanged();
		});
		const chunked = options.chunked !== false && options.offscreenSkip !== true;
		this.chunkSkip = chunked && options.chunkSkip !== false ? new PmModeChunkSkip(this.mount.pmHost, this.mount.scroll, () => this.input?.chunkLayoutChanged(), () => this.input?.chunkShown()) : null;
		const t1 = performance.now();
		this.parts = env ? new ObsidianPmModeParts(env, () => ({ settings: this.settings, writingMode: computePmModeStyle(this.settings, this.common).writingMode })) : null;
		try {
			const presentation = computePmModeStyle(settings, common);
			this.display = new PmModeDisplay(this.mount.pmHost, cm.state.doc.toString(), this.options(), {
				presentation: { classes: presentation.classes, writingMode: presentation.writingMode },
				parts: this.parts ?? undefined, partHost: this.mount.host,
				icon: (element, name) => setIcon(element, name), label: key => t(key),
				onToggleFold: line => this.toggleFold(line),
				decorationSettings: this.decorationSettings(),
				accessibilityHidden: options.accessibilityHidden !== false,
				chunked,
				chunks: this.chunkSkip?.hooks,
				// R2-6: Typewriter's tail spacer element is made here (it writes its size with Obsidian's helper), not in the pure layer.
				createTailSpacer: createTailSpacerElement,
				// M4b (D-M4-1): the reserved room of a composition: an element with the stylesheet's class (the window is the display's at the time it is made).
				createCompositionWidget: text => createCompositionWidgetElement(this.mount.pmHost.ownerDocument, text),
			});
			const t2 = performance.now();
			this.measuredStyle = this.styleKey();
			this.presentedWritingMode = computePmModeStyle(this.settings, this.common).writingMode;
			this.skip = new PmModeOffscreenSkip(this.display.view.dom, options.offscreenSkip === true);
			this.renderedSettings = this.options().settings;
			const notice = options.sourceOwner?.notice ?? showPmModeEditNotice;
			this.sourceOwner = new PmModeSourceOwner(cm, this.editGuard, () => this.editContext(), { ...(options.sourceOwner ?? {
				lifetime: new PmModeWriteLifetime(), getPath: () => env?.getSourcePath() ?? null, getPair: () => cm,
				rangeDisplay: "custom-highlight", notice: showPmModeEditNotice,
			}), mac: /Mac/.test(container.ownerDocument.defaultView?.navigator.platform ?? ""), notice: (reason, operation) => { this.recordInput("notice", { reason, operation }); notice(reason, operation); } }, () => !!this.input && (this.input.surface.isComposing() || !!this.input.surface.text()));
			this.input = (options.inputSurface ?? !!options.sourceOwner)
				? new PmModeInput({ container, mount: this.mount, display: this.display, owner: this.sourceOwner,
					isActive: options.isActive, record: this.recordInput, rangeDisplay: options.sourceOwner?.rangeDisplay ?? "custom-highlight", resync: () => this.syncSelection(),
					// M4b (D-M4-8): the setting is read where a composition starts, from the settings the view has now.
					preeditDisplay: () => normalizePreeditDisplay(this.settings.pmPreeditDisplay),
					// M3c: the settings of the pseudo caret, the band, the visual focus and Typewriter are the current writing mode's keys (`display-settings.ts`).
					displaySettings: readDisplaySettings(settings, common),
					onRevealPosition: (line, offset, scale) => this.chunkSkip?.keepAfterReveal(line, offset, scale) })
				: null;
			this.follower = this.createFollower();
			if (!this.follower.attach()) throw new Error("CodeMirror subscription failed");
			this.syncSelection();
			this.applyStyle();
			const t3 = performance.now();
			this.openTiming = { total: t3 - t0, mount: t1 - t0, display: t2 - t1, stages: this.display.openTimings, rest: t3 - t2 };
		} catch (error) {
			this.input?.destroy();
			this.sourceOwner?.destroy();
			this.follower?.detach();
			this.chunkSkip?.destroy();
			this.skip?.destroy();
			this.display?.destroy();
			this.mount.destroy();
			throw error;
		}
	}
	private createFollower(): PmModeCmFollower {
		return new PmModeCmFollower(this.cm, update => {
			const checked = this.sourceOwner.observe(update);
			if (update.docChanged) {
				if (checked) {
					this.display.applyChecked(this.display.state, checked.after);
					this.collapsed = new Set(checked.options.collapsedHeadingLines);
				} else this.rebuild(update);
			}
			this.syncSelection(update.transactions);
			this.input?.transactionsApplied(update.transactions, this.sourceOwner.history.running);
		}, [this.editGuard.extension, this.sourceOwner.history.extension, this.input?.navigation.extension ?? []]);
	}
	private editContext(): EditContext {
		const hints = readSelectionHints(this.cm.state);
		return { state: this.display.state, options: this.options(), selection: this.cm.state.selection.main, anchorHint: hints?.anchor, headHint: hints?.head };
	}
	private syncSelection(transactions: readonly import("@codemirror/state").Transaction[] = []): void {
		// R2-5: the visual focus is decided first, so the display's selection update (and its one ProseMirror update) draws it; `selectionSynced` draws what that update did not.
		this.input?.prepareFocus();
		syncDisplaySelection(this.display, this.editContext());
		this.input?.selectionSynced(transactions);
	}
	/** The leaf became active, or the view opened while active (the entries of the focus, M2 design §6.1). */
	focusInput(reason: PmModeFocusEntry): boolean { return !this.destroyed && !!this.input?.focusFromEntry(reason); }
	private options() {
		return { collapsedHeadingLines: new Set(this.collapsed), settings: { enableRuby: this.settings.wysiwyg.enableRuby !== false, plainTextView: this.settings.wysiwyg.plainTextView === true } };
	}
	private decorationSettings(): PmModeDecorationSettings {
		const range = resolveAutoTcyDigitRange(this.settings.wysiwyg);
		return { autoTcy: { enabled: this.settings.wysiwyg.enableAutoTcy === true, minDigits: range.minDigits, maxDigits: range.maxDigits, digitsOnly: this.settings.wysiwyg.autoTcyDigitsOnly === true },
			writingMode: computePmModeStyle(this.settings, this.common).writingMode };
	}
	private styleKey(): string {
		const style = computePmModeStyle(this.settings, this.common);
		return JSON.stringify([style.variables, style.classes, style.writingMode]);
	}
	private applyStyle(): void {
		const style = computePmModeStyle(this.settings, this.common);
		this.display.setPresentation(style.classes, style.writingMode);
		this.display.setDecorationSettings(this.decorationSettings());
	}
	private rebuild(update?: ViewUpdate): void {
		if (this.destroyed) return;
		const t0 = performance.now();
		if (update) this.collapsed = shiftCollapsedForUpdate(this.collapsed, update);
		const options = this.options();
		const t1 = performance.now();
		const text = this.cm.state.doc.toString();
		const t2 = performance.now();
		this.display.update(text, options);
		// The line model keeps only the lines that are still foldable headings.
		this.collapsed = new Set(this.display.state.lineModel.collapsedHeadingLines);
		this.renderedSettings = options.settings;
		this.applyStyle();
		this.syncSelection();
		this.timings = { text: t2 - t1, total: performance.now() - t0, display: this.display.lastTimings };
	}
	/** The last rebuild's stages (for diagnostics). */
	get lastRebuildTimings(): PmModeRebuildTimings | null { return this.timings; }
	/** The stages of building this session (for diagnostics). */
	get openTimings(): PmModeSessionOpenTimings { return this.openTiming; }
	/** A fold toggle was clicked (V:2017-2041 toggleHeadingFold, without the selection and scroll). */
	toggleFold(line: number): void {
		if (this.destroyed) return;
		const end = this.display.state.lineModel.lineHeadingSectionEnd[line];
		if (end === null || end === undefined || end <= line) return;
		const next = new Set(this.collapsed);
		if (next.has(line)) next.delete(line); else next.add(line);
		this.collapsed = next;
		this.rebuild();
	}
	/** Lay every block out once more and remember its size (a theme change; offscreen-skip.ts). */
	remeasureLayout(): void {
		if (this.destroyed) return;
		this.skip.remeasure();
		this.input?.layoutChanged();
	}
	/** Folded heading lines (for tests and diagnostics). */
	get collapsedLines(): ReadonlySet<number> { return this.collapsed; }
	checkFollow(): boolean {
		if (this.destroyed) return false;
		if (this.follower.isAttached()) return true;
		this.follower.detach();
		this.sourceOwner.reconnect();
		this.follower = this.createFollower();
		if (!this.follower.attach()) return false;
		this.rebuild();
		return true;
	}
	updateSettings(settings: TategakiV2Settings, common: CommonSettings = settings.common): void {
		const rebuild = this.renderedSettings.enableRuby !== (settings.wysiwyg.enableRuby !== false) || this.renderedSettings.plainTextView !== (settings.wysiwyg.plainTextView === true);
		this.settings = settings; this.common = common;
		this.mount.updateSettings(settings, common);
		// M3c: a change of the caret's width or color, the three flags or Typewriter reaches the open view here (the plugin's `updateSettings` calls every open view).
		this.input?.setDisplaySettings(readDisplaySettings(settings, common));
		if (rebuild) this.rebuild(); else this.applyStyle();
		// Font, line height, ruby and writing mode change the size of every block; a rebuild for the
		// settings replaces every block. Other settings do not need the full layout.
		const style = this.styleKey();
		if (rebuild || style !== this.measuredStyle) { this.measuredStyle = style; this.skip.remeasure(); this.chunkSkip?.onLineLengthChange(); this.input?.layoutChanged(); }
		// D-C-22 (O-3): the writing mode changed: the new layout starts at the head of the document; the caret (a range's head) is shown once, in the next display frame.
		const writingMode = computePmModeStyle(settings, common).writingMode;
		if (writingMode !== this.presentedWritingMode) { this.presentedWritingMode = writingMode; this.input?.writingModeChanged(); }
		// Frontmatter depends on the hide / show settings and the writing mode.
		this.parts?.refreshFrontmatter();
	}
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		try { this.inputRecord?.closed(); } catch { /* Diagnostics cannot interrupt closing a view. */ }
		this.inputRecord = null;
		this.input?.destroy();
		this.sourceOwner.destroy();
		this.follower.detach();
		this.chunkSkip?.destroy();
		this.skip.destroy();
		this.display.destroy();
		this.mount.destroy();
	}
}
