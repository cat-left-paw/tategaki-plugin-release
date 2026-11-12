// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/rangePresenter.ts @ 020b5501 (2026-10-22)
// Local changes: the range is the display selection of the new mode's PM view (`rangeForPresentation()` of Nyoze's
//   owner becomes `displayRanges`); the rule goes into the view's shadow root; the highlight name is
//   `tategaki-pm-range-n` (not the prototype's or Nyoze's). An environment without the highlight registry
//   (`rangeDisplay: "rect-layer"`) draws no highlight here: its text is drawn by `range-overlay.ts` (M3b, D-M3-10).
//   M3b (PIS-RANGE-DISPLAY1, Nyoze c63cd4a0): the text color of a selected range follows the native selection by platform (macOS writes
//   no `color`; Windows and Linux write `HighlightText`, or the `::selection` color when it sets one); the same background goes to the
//   range overlay (newline bands, atoms, rects) through `readSelectionPaint`.
import type { PmModeDisplay } from "../pm/view";
import { appendHighlightStyle, highlightWindow, highlightsSupported, nextHighlightName, type HighlightWindow } from "./highlight-support";
import type { SurfaceRecord } from "./input-surface";
import { projectAllSelectionToText } from "./navigation/all-selection";
import { HIDDEN_LINE_KINDS } from "../input/model-position";

/** The colors of a selected range, read once from the native `::selection` of the view (`color` is null where the native selection does not change the text color). */
export interface SelectionPaint {
	/** The background of the range (a highlight and the newline bands). */
	readonly background: string;
	/** The text color of the range, or null: macOS keeps the text color (a color there turns the selected text black, unreadable on a dark theme). */
	readonly color: string | null;
	/** The opacity the range's background gets where it is drawn over the text (the rects of the rect layer, an atom), so that the text shows: 1 when the background is translucent already. */
	readonly washOpacity: number;
}
/** The alpha of a computed `rgb()` / `rgba()` color; 1 when it cannot be read. */
function alphaOf(color: string): number {
	const match = /^rgba?\(([^)]*)\)$/.exec(color.trim());
	if (!match) return 1;
	const parts = match[1].split(/[\s,/]+/).filter(Boolean);
	if (parts.length < 4) return 1;
	const value = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
	return Number.isFinite(value) ? value : 1;
}
/**
 * Nyoze c63cd4a0 (4a): the UA's native selection color may compute to transparent; then the system colors are used, never a transparent
 * highlight. `platform` is for the tests (the product reads `navigator.platform`).
 */
export function readSelectionPaint(win: HighlightWindow, host: Element, platform?: string): SelectionPaint {
	const selection = win.getComputedStyle(host, "::selection");
	const systemColor = !selection.backgroundColor || selection.backgroundColor === "transparent" || /^rgba\([^)]*,\s*0\)$/.test(selection.backgroundColor);
	const background = systemColor ? "Highlight" : selection.backgroundColor;
	const mac = /Mac/.test(platform ?? win.navigator.platform);
	return { background, color: mac ? null : systemColor ? "HighlightText" : selection.color,
		washOpacity: systemColor || alphaOf(background) >= 0.9 ? 0.5 : 1 };
}

/** The display selection as a range of text to paint, or null for a caret and for a selection that is not text. `all`: the CM all-selection, projected to its first..last visible position. */
export function paintSelection(display: PmModeDisplay, all = false): PmModeDisplay["view"]["state"]["selection"] | null {
	const view = display.view, selection = all ? projectAllSelectionToText(view.state.doc) : view.state.selection;
	if (!selection || selection.empty) return null;
	if (!selection.$from.parent.inlineContent || !selection.$to.parent.inlineContent) return null;
	return selection;
}

/**
 * The DOM ranges of the display selection when it is a range of text; empty for a caret or a selection that is not text.
 * One range, except where it starts inside the base of a Ruby and goes on past it: the Ruby's reading is then not
 * painted (a part of the base is selected and an edit leaves the reading, D14 (b)), so the range is split around the
 * `<rt>`. A Ruby chosen whole (its start at or before the Ruby) is painted with its reading: an edit removes both.
 */
export function displayRanges(display: PmModeDisplay, all = false): Range[] {
	const view = display.view, selection = paintSelection(display, all);
	if (!selection) return [];
	try {
		if (all) {
			// The text of the projection is painted here; the block parts, the rules, the fence lines and inline math in it are
			// not text: the range overlay marks them as selected (M3b, H4 (b)).
			const spans: { from: number; to: number }[] = [];
			let start = selection.from;
			view.state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
				const excluded = node.type.name === "inlineMath" || (node.isBlock && node.type.name !== "chunk" &&
					(node.type.name !== "line" || HIDDEN_LINE_KINDS.has(String(node.attrs.kind))));
				if (!excluded) return true;
				if (pos > start) spans.push({ from: start, to: Math.min(pos, selection.to) });
				start = Math.max(start, pos + node.nodeSize); return false;
			});
			if (start < selection.to) spans.push({ from: start, to: selection.to });
			return spans.map(span => {
				const a = view.domAtPos(span.from), b = view.domAtPos(span.to), range = view.dom.ownerDocument.createRange();
				range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset); return range;
			});
		}
		const from = view.domAtPos(selection.from), to = view.domAtPos(selection.to);
		const range = view.dom.ownerDocument.createRange();
		range.setStart(from.node, from.offset);
		range.setEnd(to.node, to.offset);
		const start = range.startContainer, startElement = start.nodeType === 1 ? start as Element : start.parentElement;
		const ruby = startElement?.closest("ruby") ?? null;
		const reading = ruby?.querySelector(":scope > rt") ?? null;
		// PM domAtPos returns a base span or its text inside Ruby, never (ruby, offset). At the Ruby front
		// it returns the outside parent, so closest("ruby") alone establishes the partial start (M2-2b T5).
		if (ruby && reading && view.dom.contains(ruby) && range.intersectsNode(reading)) {
			const before = range.cloneRange(), after = range.cloneRange();
			before.setEndBefore(reading);
			after.setStartAfter(reading);
			// (A part with no text, such as what is left after the reading to the end of the Ruby, paints nothing.)
			return [before, after].filter(part => part.toString() !== "");
		}
		return [range];
	} catch { return []; }
}

/**
 * Draws the display selection's range with the CSS Custom Highlight while the surface holds the focus. The caller
 * calls `update` when the selection or the focus changes (synchronously, in the same event or callback).
 */
export function createRangePresenter(options: { host: HTMLElement; treeRoot: Node; display: PmModeDisplay; isAllSelection?(): boolean; record?: SurfaceRecord; platform?: string }) {
	const { host, display } = options;
	const record: SurfaceRecord = options.record ?? (() => {});
	const win = highlightWindow(host);
	const name = nextHighlightName("range");
	const paint = readSelectionPaint(win, host, options.platform);
	const style = appendHighlightStyle(options.treeRoot,
		`::highlight(${name}) { background-color: ${paint.background};${paint.color ? ` color: ${paint.color};` : ""} }`, "tategakiPmRange");
	const clear = (): void => { win.CSS?.highlights?.delete(name); };
	return {
		name,
		/** The colors the highlight uses; the range overlay draws its bands and washes with the same ones. */
		paint,
		get supported(): boolean { return highlightsSupported(win); },
		clear,
		update(show: boolean): void {
			if (!show || !highlightsSupported(win)) { clear(); return; }
			const start = performance.now();
			const ranges = displayRanges(display, options.isAllSelection?.() === true);
			if (ranges.length && win.Highlight && win.CSS?.highlights) win.CSS.highlights.set(name, new win.Highlight(...ranges));
			else clear();
			record("range-present", { durationMs: performance.now() - start, visible: ranges.length > 0, supported: !!win.Highlight });
		},
		destroy(): void { clear(); style.remove(); },
	};
}
export type RangePresenter = ReturnType<typeof createRangePresenter>;
