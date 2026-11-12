import type { Transaction } from "@codemirror/state";
import { t } from "../../../shared/i18n";
import { transitionSurface, type SurfaceEvent, type SurfaceState } from "../input/surface-state";
import type { PmModeDisplay } from "../pm/view";
import type { PmModeMount } from "./mount";
import type { PmModeSourceOwner } from "./source-owner";
import { createInputSurface, type InputSurface, type SurfaceRecord } from "./input-surface";
import { createFocusSafety } from "./focus-safety";
import { createKeyRouter } from "./key-router";
import { createPointerLending } from "./pointer-lending";
import { createRangePresenter, type RangePresenter } from "./range-presenter";
import { createRangeOverlay, type RangeDisplayMode, type RangeOverlay } from "./range-overlay";
import { createCaretReveal } from "./caret-reveal";
import { readDisplayCaret } from "./display-geometry";
import { showPmModeBlockWarnNotice, showPmModeClipboardBusyNotice, showPmModeKeylessNotice } from "./input-notice";
import { createNavigation } from "./navigation/navigation";
import type { NavigationOp } from "./navigation/rules";
import { createDisplayVisuals, createFocusVisual, type DisplayVisuals, type FocusVisual } from "./display-visuals";
import { sameDisplaySettings, type PmModeDisplaySettings } from "./display-settings";
import { createCompositionPresentation, type PreeditDisplay } from "./composition-presentation";
import { createSurfaceClipboard } from "./clipboard";
import { createPmModeContextMenu } from "./context-menu";

export type PmModeFocusEntry = "active-leaf" | "open";

export interface PmModeInputDeps {
	container: HTMLElement;
	mount: PmModeMount;
	display: PmModeDisplay;
	owner: PmModeSourceOwner;
	/** How this window shows a range: the CSS Custom Highlight, or (without that registry) the rect layer of `range-overlay.ts` (M3b, D-M3-10). */
	rangeDisplay: RangeDisplayMode;
	/** M3c: what the pseudo caret, the current line band, the visual focus and Typewriter read from the settings (`display-settings.ts`). */
	displaySettings: PmModeDisplaySettings;
	/** Put the display selection back in line with CodeMirror's. */
	resync(): void;
	/** J28: keep the committed caret line at the reveal position through the following chunk resizes. */
	onRevealPosition?(line: HTMLElement, startOffset: number, scale: number): void;
	isActive?(): boolean;
	/** M4b (D-M4-8): the setting "display while composing" (push the following text aside, or draw over it); the surface reads it when a composition starts. */
	preeditDisplay?(): PreeditDisplay;
	record?: SurfaceRecord;
}

/**
 * M2-2b: the input surface and what keeps the focus on it. One surface per session (it is not rebuilt), made with
 * the session and gone with it (J13). This class connects the parts:
 *
 *   - focus: entered by `focusFromEntry` (the leaf became active, the view opened while active), by the end of a
 *     pointer gesture, and by the safety net (`focus-safety.ts`); never by a timer;
 *   - the range of the display selection is drawn while the surface holds the focus;
 *   - the surface is placed at the caret whenever the display selection moves.
 */
export class PmModeInput {
	readonly surface: InputSurface;
	readonly ranges: RangePresenter;
	/** M3b: what a range shows that the highlight cannot paint (the line breaks, the parts), and the text itself in the rect-layer environment. */
	readonly overlay: RangeOverlay;
	/** The surface state of the Nyoze machine (M2 design §6.2); diagnostics and tests read it. */
	state: SurfaceState = "inactive";
	private readonly display: PmModeDisplay;
	private rangeDisplay: PmModeInputDeps["rangeDisplay"];
	private readonly lending: ReturnType<typeof createPointerLending>;
	private readonly disposers: (() => void)[] = [];
	private destroyed = false;
	readonly reveal: ReturnType<typeof createCaretReveal>;
	readonly navigation: ReturnType<typeof createNavigation>;
	/** M3c: the pseudo caret, the current line band, the visual focus and Typewriter (one display job in the display frame, `display-visuals.ts`). */
	readonly visuals: DisplayVisuals;
	/** M3c round 2 (R2-4, R2-5): the visual focus (the dimmed lines and the tint), decided at the selection sync and drawn by the display's own update, not by the frame. */
	readonly focusVisual: FocusVisual;
	private displaySettings: PmModeDisplaySettings;
	/** R2-10: Escape closes a range to its head caret. Called by the view's window-capture Escape guard (the key never reaches the surface). */
	readonly escape: (event: KeyboardEvent) => boolean;

	constructor(deps: PmModeInputDeps) {
		const { container, mount, display, owner, record } = deps;
		this.display = display;
		this.rangeDisplay = deps.rangeDisplay;
		this.displaySettings = deps.displaySettings;
		// (the surface is made before the display job that reads it: its callbacks reach the job through this local, once it exists)
		let visuals: DisplayVisuals | null = null;
		this.surface = createInputSurface({
			scrollHost: mount.scroll, host: mount.pmHost, treeRoot: mount.shadowRoot, ariaLabel: t("pm.input.label"),
			// R2-1 (Nyoze `insertionCaretRect`): a collapsed selection is placed with the navigation's affinity (the end of a
			// wrapped column after End); a range keeps its `from` (the head side of the glyph). The surface may place itself while it is made, before `navigation` exists: `head` then.
			currentOwner: () => owner, caret: () => readDisplayCaret(display, "from", display.view.state.selection.empty ? (this.navigation as PmModeInput["navigation"] | undefined)?.affinity ?? "head" : "head"), notify: reason => { record?.("notice", { reason, operation: "keyless" }); showPmModeKeylessNotice(reason); },
			// BLOCK-WARN1: a direct input stopped before it came in, or a composition begun, where a commit is refused by where it goes.
			onInputRestricted: (reason, via) => { record?.("notice", { reason, operation: "block-warn", via }); showPmModeBlockWarnNotice(reason, via); }, record,
			// M3c: a change of the surface's text or state, or a composition's update, is told to the display job (next frame; a composition's update also asks Typewriter to follow).
			onStateChange: () => visuals?.request(), onDisplayChange: () => visuals?.requestFollow(),
			// M4b (D-M4-1): the room the display reserves for the composing text (the navigation's affinity is read where it is used: it is made after the surface).
			presentation: createCompositionPresentation({ display, owner, affinity: () => (this.navigation as PmModeInput["navigation"] | undefined)?.affinity ?? "head" }),
			preeditDisplay: deps.preeditDisplay,
		});
		const isAllSelection = (): boolean => { const state = owner.cm.state, s = state.selection.main; return !s.empty && s.from === 0 && s.to === state.doc.length; };
		this.navigation = createNavigation({ display, scrollHost: mount.scroll, tailExtent: () => display.tailSpacerExtent, select: (anchor, head, hints) => owner.select(anchor, head, hints), selectAll: () => owner.selectAll(), isAllSelection, resync: deps.resync, record });
		this.reveal = createCaretReveal({ display, scrollHost: mount.scroll, surface: this.surface,
			isEligible: () => !this.destroyed, getGeneration: () => owner.identity,
			caret: () => readDisplayCaret(display, "head", this.navigation.affinity),
			// M3c (D-M3-8): the reveal's one step takes Typewriter's follow in place of its own rule on the main axis, so a frame never scrolls twice.
			follow: (caret, context) => visuals?.followForReveal(caret, context) ?? null,
			// R2-5: the surface's placement after a reveal reads in the frame's read stage and writes in its write stage.
			onCaretPosition: deps.onRevealPosition, prepareRevealed: () => this.surface.preparePlacement(), record });
		const cmSelection = (): { anchor: number; head: number } => { const main = owner.cm.state.selection.main; return { anchor: main.anchor, head: main.head }; };
		this.focusVisual = createFocusVisual({ display, scrollHost: mount.scroll, selection: cmSelection, settings: () => this.displaySettings });
		this.visuals = visuals = createDisplayVisuals({ display, scrollHost: mount.scroll, surface: this.surface, selection: cmSelection, focus: () => this.focusVisual.visual,
			state: () => this.state, isLent: () => this.lending.isLent(), affinity: () => this.navigation.affinity, settings: () => this.displaySettings,
			isEligible: () => !this.destroyed, requestFrame: job => this.reveal.requestDisplay(job),
			// R2-2 (J28): the display job's own scroll hands the caret's line to the chunks' anchor, as the reveal's does.
			onCaretPosition: deps.onRevealPosition, record });
		this.ranges = createRangePresenter({ host: mount.pmHost, treeRoot: mount.shadowRoot, display, isAllSelection, record });
		this.overlay = createRangeOverlay({ display, scrollHost: mount.scroll, mode: () => this.rangeDisplay, paint: this.ranges.paint, isAllSelection,
			requestFrame: job => this.reveal.requestDisplay(job), record });
		// M3c: Home, End, the Page keys and the document's edge are jumps: Typewriter does not follow what they change (V's one-shot mark; valid for the frame they are in).
		const navigation = this.navigation;
		const routed = { get mode() { return navigation.mode; }, selectAll: () => navigation.selectAll(), closeRange: () => navigation.closeRange(),
			navigate: (op: NavigationOp): boolean => { if (op.axis === "line-edge" || op.axis === "document" || op.axis === "page") visuals?.mark("navigation"); return navigation.navigate(op); } };
		// R2-1: with held text the arrow keys and Home / End move the surface's own caret by the browser's default; the display job reads where it is after that (the next frame).
		const router = createKeyRouter({ surface: this.surface, currentOwner: () => owner, isEligible: () => !this.destroyed, navigation: routed, onKeyDown: event => owner.noteKeyDown(event), onHeldTextKey: () => visuals?.request(), record });
		// R2-1, round 3 (P3-1): the window's Escape guard stops the key before the surface's `keydown` (which ends the mark of an end's echo, D-M4-16) sees it: the guard's call ends the mark too.
		// D-C-21 (O-1): the Escape that closed the context menu only closes the menu (the menu's own handler ran first, `context-menu.ts`): a range is not closed by it, and CodeMirror gets no transaction.
		this.escape = (event: KeyboardEvent): boolean => {
			this.surface.releaseCommitEcho();
			if (menu.closedByEscape(event)) { record?.("navigation-escape", { closed: false, menu: true }); return false; }
			return router.escape(event);
		};
		this.lending = createPointerLending({
			container, display, surface: this.surface, record,
			select: (anchor, head, hints) => owner.select(anchor, head, hints),
			resync: deps.resync,
			transition: event => this.transition(event),
			boundary: () => { this.surface.releaseRecentInput(); owner.releaseKeyNotice(); router.releaseRetainedDeletion(); },
		});
		const canRestoreFocus = (): boolean => !this.destroyed && deps.isActive?.() !== false && container.ownerDocument.hasFocus();
		// The safety net also stands aside for an inactive/background view, as it does for a gesture.
		const safety = createFocusSafety({ container, treeRoot: mount.shadowRoot, surface: this.surface, isLent: () => this.lending.isLent() || !canRestoreFocus(), record });
		const onHostFocus = (event: FocusEvent): void => {
			// Shadow child focus is retargeted to the host too; only its own focus is an entry.
			if (event.composedPath()[0] === mount.host && canRestoreFocus() && !this.lending.isLent()) this.surface.focus();
		};
		mount.host.addEventListener("focus", onHostFocus);
		const element = this.surface.element;
		const onInputBlur = (): void => owner.releaseKeyNotice();
		const onFocusIn = (): void => {
			this.transition({ type: "surface-focus", range: !display.view.state.selection.empty });
			this.paintRange();
			this.visuals.request();
		};
		const onFocusOut = (): void => {
			// A gesture's `pointerdown` takes the focus from the surface before it ends: that is the lease, not the end of the surface.
			if (this.state !== "lent") this.transition({ type: "deactivate" });
			this.ranges.update(false);
			this.overlay.update(false);
			this.visuals.request();
		};
		// The clipboard stage: the copy, the cut and the paste of the surface, and the display's context menu (Copy, Cut, Paste).
		const note: SurfaceRecord = record ?? (() => {});
		const clipboard = createSurfaceClipboard({ surface: this.surface, owner, isEligible: () => !this.destroyed, record: note, notify: showPmModeClipboardBusyNotice });
		const menu = createPmModeContextMenu({ container, surface: this.surface, owner, isEligible: () => !this.destroyed, refocus: () => { this.surface.focus(); }, record: note, notify: showPmModeClipboardBusyNotice });
		this.disposers.push(() => clipboard.destroy(), () => menu.destroy());
		element.addEventListener("blur", onInputBlur);
		element.addEventListener("focusin", onFocusIn);
		element.addEventListener("focusout", onFocusOut);
		this.disposers.push(() => this.lending.destroy(), () => safety.destroy(), () => router.destroy(), () => {
			mount.host.removeEventListener("focus", onHostFocus);
			element.removeEventListener("blur", onInputBlur);
			element.removeEventListener("focusin", onFocusIn);
			element.removeEventListener("focusout", onFocusOut);
		});
	}
	private transition(event: SurfaceEvent): void { this.state = transitionSurface(this.state, event); }
	private paintRange(): void {
		const show = this.surface.hasFocus();
		this.ranges.update(this.rangeDisplay === "custom-highlight" && show);
		this.overlay.update(show);
	}
	/**
	 * R2-5: the visual focus for CodeMirror's selection, decided before the display's selection is updated so that update draws it (`syncDisplaySelection`; the session calls this just before it).
	 * The decorations are set, not drawn.
	 */
	prepareFocus(): void { if (!this.destroyed) this.focusVisual.prepare(); }
	/** The display selection changed (CodeMirror changed, or the display was rebuilt): state, range and place follow, synchronously. */
	selectionSynced(transactions: readonly Transaction[] = []): void {
		if (this.destroyed) return;
		this.navigation.sync(transactions);
		this.transition({ type: "selection", range: !this.display.view.state.selection.empty });
		// M4b (D-M4-4): a rebuild of the display (not only a CodeMirror transaction) can drop the room of a composition.
		this.surface.presentationChanged();
		this.paintRange();
		// (the focus decorations the selection's update did not draw are drawn before the surface's placement reads the display)
		this.focusVisual.flush();
		if (this.surface.hasFocus() && !this.surface.isComposing()) this.surface.place();
		this.visuals.request();
	}
	/** Called after CM's transaction was synchronously reflected into the read-only display. */
	transactionsApplied(transactions: readonly Transaction[], history = false): void {
		this.reveal.note(transactions, history);
		// M4b (D-M4-4): a CodeMirror change (an outside edit, another editor on the note) dropped the room of the composition in the display, in this same synchronous step: the overlay display
		// comes back now, not at the next `compositionupdate`.
		this.surface.presentationChanged();
	}
	/** Chunk ResizeObserver: one notification after its anchor and sizes were handled. */
	chunkLayoutChanged(): void { if (!this.destroyed) { this.surface.chunkLayoutChanged(); this.overlay.invalidate(); this.visuals.request(); } }
	/** A chunk that was skipped is laid out again (M3b R2-2): the range overlay reads what lies in it in the next display frame (no surface placement: nothing moved). */
	chunkShown(): void { if (!this.destroyed) this.overlay.refresh(); }
	/** The view's size, its fonts or its writing mode changed (M3b): what the range overlay drew is read again in the next display frame. */
	layoutChanged(): void { if (!this.destroyed) { this.overlay.invalidate(); this.visuals.request(); this.reveal.layoutChanged(); } }
	/** D-C-22 (O-3): the writing mode changed: the next display frame shows the caret in the new layout, once (`caret-reveal.ts`). */
	writingModeChanged(): void { if (!this.destroyed) this.reveal.writingModeChanged(); }
	/** M3c: the settings changed (the caret's width and color, the three flags, Typewriter): the display job draws again; turning Typewriter on follows the caret once. */
	setDisplaySettings(next: PmModeDisplaySettings): void {
		if (this.destroyed || sameDisplaySettings(this.displaySettings, next)) return;
		const previous = this.displaySettings;
		this.displaySettings = next;
		// The visual focus does not wait for a frame, or for the focus: a flag changed in a settings dialog shows at once (R2-4).
		this.focusVisual.prepare(); this.focusVisual.flush();
		this.visuals.settingsChanged(previous, next);
	}
	get isLent(): boolean { return this.lending.isLent(); }
	/** An entry of the focus: the leaf became active, or the view opened while active. Not during a gesture (J15): its end brings the focus. */
	focusFromEntry(_reason: PmModeFocusEntry): boolean {
		if (this.destroyed || this.lending.isLent()) return false;
		return this.surface.focus();
	}
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		for (const dispose of this.disposers.splice(0)) dispose();
		this.visuals.destroy();
		this.focusVisual.destroy();
		this.reveal.destroy();
		this.overlay.destroy();
		this.ranges.destroy();
		this.surface.destroy();
	}
}
