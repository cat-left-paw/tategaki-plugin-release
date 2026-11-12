// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: the order of Nyoze's display callbacks, `createInputSurfaceDisplayCallbacks` (src/editor-core/features/inputSurface/pseudoCaretWiring.ts @ 020b5501: the pseudo caret, the
//   visual focus and Typewriter are told of a display change and of a composition's update, and each draws once), kept as one display job; V's behavior for what is drawn
//   (see `current-line.ts`, `focus-block.ts`, `typewriter.ts`, `pseudo-caret.ts` for the origins of each).
// Local changes: M3c (D-M3-17, D-M3-18). Nyoze runs a pseudo caret controller, a visual focus controller and a Typewriter controller, each with its own rAF; here the caret, the band and
//   Typewriter are one display job that joins the display frame of `caret-reveal.ts` (`requestDisplay`, run once per frame however often it is asked for), so there is no new
//   `requestAnimationFrame`, no timer, and no frame that is asked for again by the job itself.
//   Round 2 (R2-5): the frame has two stages. The job's reads (the caret, the line's rects, the content origin, the viewport, the scroll offsets) are done with the reveal's reads, before
//   any write of the frame; the job returns its writes, which run after the reveal's (the reveal's scroll and the surface's placement, then the job's: Typewriter's scroll, the caret and the
//   band's boxes, the native caret's hidden attribute, the spacer). The caret, the band and the layer of `range-overlay.ts` are in the scrolling element's content coordinates, so a scroll written
//   by the same frame does not move them and what the job read does not go stale. They are drawn only while the surface holds the focus, the selection is collapsed and no pointer gesture is
//   going on: for a range none is drawn and no geometry is read (the writes only hide).
//   The visual focus (the dimmed lines and the tint) is not part of the job (R2-4, R2-5): it reads no geometry, and V keeps it whatever holds the focus (V's `refreshFocusVisualState`, V:14644-14671, has
//   no condition of focus or pointer: a range, the plain text view and the flags end it). `createFocusVisual` decides it with the selection, before the display's selection is updated, so the
//   same ProseMirror update draws the decorations (`PmModeDisplay.setFocusBlocks` with `defer`), and an edit that keeps the number of blocks draws them in its own update.
//   The band is V's (round 2, P3-6): it is drawn when the focus state is `active` and has a `currentLineIndex` (V:14693-14721; the flag is part of that state), and "the same visual line" is judged by the
//   root's own font size, V's `getEffectiveFontSize()`, not by the caret line's (a heading's or a code block's font size must not change what one visual line is).
import type { SurfaceState } from "../input/surface-state";
import type { PmModeDisplay } from "../pm/view";
import type { SoTFocusVisualState } from "../../sot/sot-focus-visual-state";
import { readDisplayCaret, type DisplayCaret } from "./display-geometry";
import { readContentOrigin } from "./content-coordinates";
import type { ViewRoot } from "./composed-tree";
import { buildPseudoCaretShape, createPseudoCaretOverlay, isInputSurfacePseudoCaretLive, isSurfaceRangeSelected, readSurfaceCaretRect } from "./pseudo-caret";
import { createCurrentLineOverlay, currentLineRect, lineVisualRects, surfaceTextRects, type CurrentLineBox } from "./current-line";
import { resolveFocus, takesFocusClass } from "./focus-block";
import { createTypewriter, planTypewriterFollow, tailSpacerExtent, type TypewriterMark, type TypewriterPlan } from "./typewriter";
import type { PmModeDisplaySettings } from "./display-settings";
import type { InputSurface, SurfaceRecord } from "./input-surface";
import type { PlacementRect } from "./surface-placement";

/** The scrolling element's attribute that says which parts of the visual focus the CSS draws (`dim`, `block`). */
export const FOCUS_ATTRIBUTE = "data-tategaki-pm-focus";
/** The input surface's attribute while the pseudo caret is drawn: its native caret is transparent then. */
export const NATIVE_CARET_HIDDEN_ATTRIBUTE = "data-tategaki-pm-caret-hidden";

/** The element of the tail spacer (given to the display as `createTailSpacer`, R2-6): its length along the lines' direction of travel is written with Obsidian's `setCssStyles`. */
export function createTailSpacerElement(ownerDocument: Document, extent: number): HTMLElement {
	const spacer = ownerDocument.createElement("div");
	spacer.className = "tategaki-pm-tail-spacer";
	spacer.setAttribute("aria-hidden", "true");
	spacer.setCssStyles({ blockSize: `${extent}px` });
	return spacer;
}

/**
 * The visual focus (the other lines dimmed, the focused block tinted): V's `resolveSoTFocusVisualState` for the CodeMirror selection and the display's state. It is decided when the selection is
 * synced (`prepare`, before the display's own selection update, so that update draws it) and when the settings change; it reads no geometry and needs no frame. It also owns the colors
 * the CSS reads (the focus's, and the band's, which `display-visuals` draws), written only when the settings changed.
 */
export function createFocusVisual(options: {
	display: PmModeDisplay;
	scrollHost: HTMLElement;
	/** CodeMirror's main selection (source offsets), the selection of record. */
	selection(): { anchor: number; head: number } | null;
	settings(): PmModeDisplaySettings;
}) {
	const { display, scrollHost } = options;
	let flags = "", visual: SoTFocusVisualState | null = null, written: PmModeDisplaySettings | null = null, destroyed = false;
	const counts = { prepared: 0 };
	const writeColors = (settings: PmModeDisplaySettings): void => {
		if (written === settings) return;
		written = settings;
		scrollHost.setCssProps({
			"--tategaki-pm-block-color": settings.blockColor, "--tategaki-pm-block-opacity": String(settings.blockOpacity),
			"--tategaki-pm-line-color": settings.currentLineColor, "--tategaki-pm-line-opacity": String(settings.currentLineOpacity),
			"--tategaki-pm-nonfocus-opacity": String(settings.nonFocusOpacity),
		});
	};
	const setFlags = (next: string): void => {
		if (next === flags) return;
		flags = next;
		if (next) scrollHost.setAttribute(FOCUS_ATTRIBUTE, next); else scrollHost.removeAttribute(FOCUS_ATTRIBUTE);
	};
	return {
		/** Decide the focus now. The decorations are set but not drawn: the display's selection update that follows draws them, or `flush` does. */
		prepare(): void {
			if (destroyed || display.view.isDestroyed) return;
			counts.prepared++;
			const settings = options.settings();
			writeColors(settings);
			const focus = resolveFocus(display.state, options.selection(), settings);
			visual = focus.visual;
			setFlags(focus.blocks ? [focus.visual.nonFocusDimEnabled ? "dim" : "", focus.visual.blockHighlightEnabled ? "block" : ""].filter(Boolean).join(" ") : "");
			display.setFocusBlocks(focus.blocks ? { ...focus.blocks, include: takesFocusClass } : null, { defer: true });
		},
		/** Draw the decorations `prepare` set, if no display update has (a move inside the same block, a settings change). */
		flush(): void { if (!destroyed && !display.view.isDestroyed) display.flushFocus(); },
		/** V's focus state as of the last `prepare` (the band reads `active`, `currentLineHighlightEnabled` and `currentLineIndex`). */
		get visual(): SoTFocusVisualState | null { return visual; },
		get flags(): string { return flags; },
		counters: () => ({ ...counts }),
		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			scrollHost.removeAttribute(FOCUS_ATTRIBUTE);
			// (the colors are written by the first `prepare`: a view that never prepared has none to take back)
			if (written) scrollHost.setCssProps({ "--tategaki-pm-block-color": "", "--tategaki-pm-block-opacity": "", "--tategaki-pm-line-color": "", "--tategaki-pm-line-opacity": "", "--tategaki-pm-nonfocus-opacity": "" });
		},
	};
}
export type FocusVisual = ReturnType<typeof createFocusVisual>;

export function createDisplayVisuals(options: {
	display: PmModeDisplay;
	scrollHost: HTMLElement;
	surface: InputSurface;
	/** CodeMirror's main selection (source offsets), the selection of record. */
	selection(): { anchor: number; head: number } | null;
	/** V's focus state, as decided at the last selection sync (the band's condition). */
	focus(): SoTFocusVisualState | null;
	state(): SurfaceState;
	/** A pointer gesture is going on (the surface lends the focus). */
	isLent(): boolean;
	affinity(): "head" | "end";
	settings(): PmModeDisplaySettings;
	isEligible(): boolean;
	/** `caret-reveal.ts`'s `requestDisplay`: the job (its reads; it returns its writes) runs in the next display frame, once. */
	requestFrame(job: () => (() => void) | void): void;
	/** R2-2 (J28): the job scrolled (Typewriter's follow of a composition, or turned on): keep the caret's line where it is through the chunk resizes, as the reveal does (`chunk-skip.ts`'s `keepAfterReveal`). */
	onCaretPosition?(line: HTMLElement, startOffset: number, scale: number): void;
	record?: SurfaceRecord;
}) {
	const { display, scrollHost, surface } = options, view = display.view;
	const record: SurfaceRecord = options.record ?? (() => {});
	const pseudoCaret = createPseudoCaretOverlay(scrollHost), band = createCurrentLineOverlay(scrollHost);
	const typewriter = createTypewriter({ settings: options.settings, isLent: options.isLent, record });
	const counts = { frames: 0, hidden: 0, drawn: 0, scrolls: 0 };
	let destroyed = false, nativeHidden = false;
	let lastSpacerExtent = 0, lastMs = 0;
	let lastFrame: { caret: boolean; band: boolean; scroll: number } = { caret: false, band: false, scroll: 0 };

	const setNativeCaretHidden = (hidden: boolean): void => {
		if (hidden === nativeHidden) return;
		nativeHidden = hidden;
		surface.element.toggleAttribute(NATIVE_CARET_HIDDEN_ATTRIBUTE, hidden);
	};

	/**
	 * What the reveal's one step asks (D-M3-8): the follow's plan for the display caret, with the marks used up. Null when Typewriter does not apply: also while the selection is a range (V:11916 returns
	 * for `selection.anchor !== selection.head`: R2-3).
	 */
	const followForReveal = (caret: DisplayCaret, context: { box: DOMRect; writingMode: string }): TypewriterPlan | null => {
		const selection = options.selection();
		if (selection && selection.anchor !== selection.head) return null;
		return typewriter.follow(() => planTypewriterFollow({ viewport: context.box, caret: caret.rect, writingMode: context.writingMode, settings: options.settings() }));
	};

	const hide = (): void => {
		counts.hidden++;
		pseudoCaret.set(null, "horizontal", { color: "" });
		band.set(null);
		setNativeCaretHidden(false);
		if (!options.settings().typewriter && !view.isDestroyed) display.setTailSpacer(0);
		lastFrame = { caret: false, band: false, scroll: 0 };
	};

	/** The display job's reads. Nothing is written here; the returned function writes (after the reveal's writes, in the same frame). */
	const prepare = (): (() => void) | void => {
		if (destroyed) return;
		counts.frames++;
		const started = performance.now();
		const settings = options.settings(), win = scrollHost.ownerDocument.defaultView;
		const selection = view.state.selection;
		const live = !!win && !view.isDestroyed && selection.empty && !options.isLent() && isInputSurfacePseudoCaretLive({
			enabled: true, eligible: options.isEligible(), documentFocused: scrollHost.ownerDocument.hasFocus(), surfaceFocused: surface.hasFocus(),
			connected: surface.element.isConnected, state: options.state(), composing: surface.isComposing(),
		});
		if (!live || !win) return () => { hide(); typewriter.endFrame(); lastMs = performance.now() - started; };

		// ---- reads (the geometry) ----
		const composing = surface.isComposing(), held = composing || surface.text() !== "";
		const caret = readDisplayCaret(display, "head", options.affinity());
		let rect: PlacementRect | null = caret?.rect ?? null;
		if (held) {
			const root = surface.element.getRootNode() as ViewRoot;
			// R2-1: a range the user made inside held text (Shift+arrow on the surface's own text) is not drawn: the surface's native caret shows. A composition's own selection is followed.
			if (!composing && isSurfaceRangeSelected(surface.element, root)) rect = null;
			else rect = readSurfaceCaretRect(surface.element, root) ?? rect;
		}
		const style = win.getComputedStyle(caret?.block ?? view.dom), writingMode = style.writingMode, vertical = writingMode.startsWith("vertical");
		const origin = readContentOrigin(scrollHost), box = scrollHost.getBoundingClientRect();
		const scrollLeft = scrollHost.scrollLeft, scrollTop = scrollHost.scrollTop;
		const blockRect = caret?.block ? caret.block.getBoundingClientRect() : null;
		// V:14693-14721 and V:16043: the band takes the focus state's `active`, `currentLineHighlightEnabled` and `currentLineIndex`; "the same visual line" is judged by the root's font size (`getEffectiveFontSize`).
		const visual = options.focus();
		let lineBox: CurrentLineBox | null = null;
		if (settings.currentLine && rect && caret?.block && blockRect && visual && visual.active && visual.currentLineHighlightEnabled && visual.currentLineIndex !== null) {
			const fontSize = parseFloat(style.fontSize) || 18, lineHeight = parseFloat(style.lineHeight) || fontSize * 1.8, rootFontSize = parseFloat(win.getComputedStyle(view.dom).fontSize) || 18;
			// M4b (D-M4-9): while the display reserves room for the composing text, that room is a widget in the line: the line's own text rects already hold it, so the surface's rects are not added
			// again (the caret stays the surface's own; the band is then the box of the line the widget is in, as in the overlay display).
			lineBox = currentLineRect({ line: caret.block, lineRects: lineVisualRects(caret.block, vertical, rootFontSize), surfaceRects: held && !surface.isCompositionPresented() ? surfaceTextRects(surface.element) : [], caret: rect,
				lineBox: blockRect, writingMode, fontSize, lineHeight, origin });
		}
		let plan: TypewriterPlan | null = null;
		if (settings.typewriter && typewriter.followRequested && !typewriter.decidedThisFrame && rect) {
			const at = rect;
			plan = typewriter.follow(() => planTypewriterFollow({ viewport: box, caret: at, writingMode, settings }));
		}
		const extent = tailSpacerExtent(settings, vertical, scrollHost.clientWidth, scrollHost.clientHeight);
		lastSpacerExtent = extent;
		const shape = rect ? buildPseudoCaretShape({ rect, origin, vertical, thickness: settings.caretWidth }) : null;

		// ---- writes ----
		return () => {
			if (plan) {
				counts.scrolls++;
				const delta = plan.delta / origin.scale;
				if (plan.axis === "x") scrollHost.scrollLeft = scrollLeft + delta; else scrollHost.scrollTop = scrollTop + delta;
				// R2-2 (J28), as the reveal does: the line's edge from what was read before this write, moved by the scroll that happened, then handed to the chunks' anchor.
				if (caret?.block && blockRect) {
					const moved = plan.axis === "x" ? scrollHost.scrollLeft - scrollLeft : scrollHost.scrollTop - scrollTop;
					options.onCaretPosition?.(caret.block, vertical ? box.right - blockRect.right + moved * origin.scale : blockRect.top - box.top - moved * origin.scale, origin.scale);
				}
			}
			pseudoCaret.set(shape, vertical ? "vertical" : "horizontal", { color: settings.caretColor });
			setNativeCaretHidden(shape !== null);
			band.set(lineBox);
			display.setTailSpacer(extent);
			counts.drawn++;
			lastFrame = { caret: shape !== null, band: lineBox !== null, scroll: plan ? plan.delta : 0 };
			typewriter.endFrame();
			lastMs = performance.now() - started;
			record("display-visuals", { ...lastFrame, durationMs: lastMs });
		};
	};

	return {
		/** Something that the pseudo caret or the band show changed: draw in the next display frame (once, however often it is asked for). */
		request(): void { if (!destroyed) options.requestFrame(prepare); },
		/** A composition's update, or Typewriter turned on: the display job follows the caret (a commit's follow is the reveal's). */
		requestFollow(): void { if (destroyed) return; typewriter.requestFollow(); options.requestFrame(prepare); },
		/** Home, End, a Page key or the document's edge: Typewriter does not follow what this key changes (V's one-shot mark, valid for one frame). */
		mark(kind: TypewriterMark): void { if (destroyed) return; typewriter.mark(kind); options.requestFrame(prepare); },
		/** The reveal's step (D-M3-8): the follow's plan for the display caret, so the reveal scrolls once. */
		followForReveal,
		/** The settings were changed (`session.updateSettings`): the next frame draws; turning Typewriter on follows the caret once. */
		settingsChanged(previous: PmModeDisplaySettings, next: PmModeDisplaySettings): void {
			if (destroyed) return;
			if (!previous.typewriter && next.typewriter) typewriter.requestFollow();
			options.requestFrame(prepare);
		},
		/** Run the display job now, reads then writes (tests and the layout-count probe): the same job as the frame's. */
		renderNow(): void { prepare()?.(); },
		counters: () => ({ ...counts, lastMs, typewriter: typewriter.counters(), last: { ...lastFrame }, spacer: lastSpacerExtent, caretShown: pseudoCaret.shown, bandShown: band.shown, nativeHidden }),
		caretElement: pseudoCaret.element,
		bandElement: band.element,
		destroy(): void {
			destroyed = true;
			pseudoCaret.destroy(); band.destroy();
			surface.element.removeAttribute(NATIVE_CARET_HIDDEN_ATTRIBUTE);
		},
	};
}
export type DisplayVisuals = ReturnType<typeof createDisplayVisuals>;
