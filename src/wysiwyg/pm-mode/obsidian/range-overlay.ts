// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/rangeNewlines.ts and rangeNewlineBands.ts @ c63cd4a0 (2026-11-04, PIS-RANGE-DISPLAY1;
//   later than the fixed commit 020b5501) for the newline bands, and this repo's src/pm-mode-spike/rangeDisplay.ts (S1 (6), the rect layer; no import from the spike).
// Local changes: M3b. One layer in the scrolling element (as in Nyoze's band layer: a box of no size, absolutely placed, content coordinates, takes no
//   pointer) holds what the CSS Custom Highlight cannot paint, and in an environment without that registry the text itself:
//   - the newline bands (Nyoze): the line breaks inside the range (the end of each shown text line and each empty line the range passes) as a thin
//     band after the last glyph. The newline list is made from the new mode's line blocks (the end of every shown text line), not from PM textblocks;
//   - the atoms (H4 (b), D-M3-10): a part, a rule, a fence line, the frontmatter and a line of inline math inside the range are drawn as selected by their
//     boxes (a wash that lets them show), so the range shows what an edit would take. Writing such a range stays stopped (`canDisplayEditTarget`);
//   - the text rects (D-M3-10, `rangeDisplay: "rect-layer"` only): the rects of the range's text as a wash over the text.
//   Nyoze writes the bands' style with `Object.assign(style, ...)`; here the boxes go through Obsidian's `setCssStyles` (1.3.4 rule), only for the
//   values that changed, and the colors through `setCssProps`. The layer is drawn at once when the selection syncs (the reads first, then the writes) and
//   redrawn in the display frame of `caret-reveal.ts` after a layout change (resize, font, chunk sizes); a scroll does not redraw it (content coordinates).
//   The rect layer draws nothing above the sizes of `sot-selection-policy.ts` (characters and lines) or 4000 rects. It only shows the range: a window without the highlight
//   registry still writes nothing (J4; H21 withdrew D-M3-10's "write there too"), so there is no guard on what was drawn.
//   What lies in a chunk that is skipped (`content-visibility`, chunk-skip.ts) is not read: reading a rect there forces that chunk's layout (3 to 10 ms each; 150 to 300 ms
//   for the 47 rule lines of the 700,000-character sample after Mod+A, measured), and it is not on the screen. It is drawn when the chunk is laid out, through the layout
//   notification (`invalidate`), not by a scroll.
import type { PmModeDisplay } from "../pm/view";
import type { PMNode } from "../pm/prosemirror";
import type { PmModeDocumentState } from "../pm/document-state";
import { HIDDEN_LINE_KINDS } from "../input/model-position";
import { HUGE_DOC_LENGTH, HUGE_DOC_LINE_COUNT } from "../../sot/sot-selection-policy";
import { readCaretRect } from "./display-geometry";
import { readContentOrigin } from "./content-coordinates";
import { displayRanges, paintSelection, type SelectionPaint } from "./range-presenter";
import type { SurfaceRecord } from "./input-surface";

export type RangeDisplayMode = "custom-highlight" | "rect-layer";
/** More text rects than this: the rect layer draws nothing. */
export const RECT_LAYER_MAX_DRAWN = 4000;
/** More line breaks than this in the range: no bands (a long all-selection). Nyoze's value. */
export const MAX_RANGE_NEWLINE_BANDS = 300;
/** More atoms than this in the range: none is drawn. */
export const MAX_RANGE_ATOMS = 300;
/** The band's length when the space of the font cannot be measured (em of the font size). */
export const NEWLINE_BAND_EM = 1 / 3;

const cache = new WeakMap<PMNode, readonly number[]>();
/**
 * The model (flat) positions of the line breaks: the end of each shown text line. A rule and a fence line are drawn as atoms; a part and the
 * frontmatter are blocks of no text. The break after the last line of the document has none to select: a range ends at a text position, so
 * `from <= n < to` never takes it. Made once per model document.
 */
export function newlinePositions(state: PmModeDocumentState): readonly number[] {
	const known = cache.get(state.doc);
	if (known) return known;
	const out: number[] = [], map = state.sourceMap;
	for (let index = 0; index < state.blocks.length; index++) {
		const node = state.blocks[index].node;
		if (node.type.name === "line" && !HIDDEN_LINE_KINDS.has(String(node.attrs.kind))) out.push(map.pmFrom[index] + node.nodeSize - 1);
	}
	cache.set(state.doc, out);
	return out;
}
function lowerBound(values: readonly number[], value: number): number {
	let low = 0, high = values.length;
	while (low < high) { const middle = (low + high) >>> 1; if (values[middle] < value) low = middle + 1; else high = middle; }
	return low;
}
/** How many line breaks are in `[from, to)`. */
export function countNewlinesBetween(positions: readonly number[], from: number, to: number): number {
	return from < to ? lowerBound(positions, to) - lowerBound(positions, from) : 0;
}
/** The line breaks of `[from, to)`, or null when there are more than `limit`. */
export function newlinesBetween(positions: readonly number[], from: number, to: number, limit: number): number[] | null {
	if (!(from < to)) return [];
	const start = lowerBound(positions, from), end = lowerBound(positions, to);
	return end - start > limit ? null : positions.slice(start, end);
}

interface Box { left: number; top: number; width: number; height: number }
type VisibilityCheck = Element & { checkVisibility?: (options: { contentVisibilityAuto: boolean }) => boolean };
/** Whether a node lies in a chunk whose lines are skipped by `content-visibility` (the chunk is not laid out; reading its geometry would lay it out). `memo` keeps one answer per chunk per draw. */
function inSkippedChunk(node: Node | null, memo: Map<Element, boolean>): boolean {
	const element = node && node.nodeType === 1 ? node as Element : node?.parentElement ?? null;
	const chunk = element?.closest("tg-chunk") ?? null;
	if (!chunk) return false;
	let skipped = memo.get(chunk);
	if (skipped === undefined) { skipped = (chunk.firstElementChild as VisibilityCheck | null)?.checkVisibility?.({ contentVisibilityAuto: true }) === false; memo.set(chunk, skipped); }
	return skipped;
}
type Kind = "text" | "newline" | "atom";
interface Pool { elements: HTMLElement[]; applied: Box[] }

export function createRangeOverlay(options: {
	display: PmModeDisplay;
	scrollHost: HTMLElement;
	/** The range display of this window (D-M3-10). Read at each draw: a popout move can change it. */
	mode(): RangeDisplayMode;
	paint: SelectionPaint;
	isAllSelection?(): boolean;
	/** The display frame of `caret-reveal.ts`: the job runs in the next frame, once however often it is asked for. */
	requestFrame(job: () => (() => void) | void): void;
	record?: SurfaceRecord;
}) {
	const { display, scrollHost } = options, view = display.view;
	const record: SurfaceRecord = options.record ?? (() => {});
	const doc0 = scrollHost.ownerDocument;
	const layer = doc0.createElement("div");
	layer.className = "tategaki-pm-range-layer";
	layer.setAttribute("aria-hidden", "true");
	scrollHost.appendChild(layer);
	const pools: Record<Kind, Pool> = { text: { elements: [], applied: [] }, newline: { elements: [], applied: [] }, atom: { elements: [], applied: [] } };
	const bands = new Map<number, Box | null>();
	let bandDoc: unknown = null, shown = false, dirty = false, destroyed = false, colors = false;
	const counts = { draws: 0, frames: 0, texts: 0, newlines: 0, atoms: 0, overLimit: 0, unreadable: 0 };
	let lastMs = 0;

	const flat = (pos: number): number => display.displayLayout ? display.displayLayout.toFlat(pos, display.state.sourceMap.pmFrom) : pos;
	const shownPos = (pos: number): number => display.displayLayout ? display.displayLayout.toDisplay(pos, display.state.sourceMap.pmFrom) : pos;

	const clearAll = (): void => {
		if (layer.firstChild) layer.replaceChildren();
		for (const kind of ["text", "newline", "atom"] as const) { pools[kind].elements.length = 0; pools[kind].applied.length = 0; }
		counts.texts = counts.newlines = counts.atoms = 0;
	};
	const write = (kind: Kind, boxes: readonly Box[]): void => {
		const pool = pools[kind], ownerDocument = layer.ownerDocument;
		for (let index = 0; index < boxes.length; index++) {
			let element = pool.elements[index];
			if (!element) { element = ownerDocument.createElement("div"); element.dataset.tategakiRange = kind; pool.elements[index] = element; }
			const next = boxes[index], previous = pool.applied[index], styles: Partial<CSSStyleDeclaration> = {};
			if (!previous || previous.left !== next.left) styles.left = `${next.left}px`;
			if (!previous || previous.top !== next.top) styles.top = `${next.top}px`;
			if (!previous || previous.width !== next.width) styles.width = `${next.width}px`;
			if (!previous || previous.height !== next.height) styles.height = `${next.height}px`;
			if (Object.keys(styles).length) element.setCssStyles(styles);
			pool.applied[index] = next;
			if (!element.isConnected) layer.appendChild(element);
		}
		while (pool.elements.length > boxes.length) { pool.elements.pop()?.remove(); pool.applied.pop(); }
	};

	/** The text rects of the DOM ranges (content coordinates), or null when there are more than the layer draws. */
	const textRects = (ranges: readonly Range[], origin: ReturnType<typeof readContentOrigin>, skipped: Map<Element, boolean>): Box[] | null => {
		const out: Box[] = [];
		const ownerDocument = view.dom.ownerDocument, sub = ownerDocument.createRange();
		for (const range of ranges) {
			const walker = ownerDocument.createTreeWalker(range.commonAncestorContainer, 4 /* NodeFilter.SHOW_TEXT */);
			for (let node = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer : walker.nextNode(); node; node = walker.nextNode()) {
				const text = node as Text;
				if (!range.intersectsNode(text) || inSkippedChunk(text, skipped)) continue;
				const start = text === range.startContainer ? range.startOffset : 0, end = text === range.endContainer ? range.endOffset : text.length;
				if (end <= start) continue;
				sub.setStart(text, start); sub.setEnd(text, end);
				const list = sub.getClientRects();
				for (let index = 0; index < list.length; index++) {
					const r = list[index];
					if (r.width < 0.5 && r.height < 0.5) continue;
					out.push({ left: (r.left - origin.x) / origin.scale, top: (r.top - origin.y) / origin.scale, width: r.width / origin.scale, height: r.height / origin.scale });
					if (out.length > RECT_LAYER_MAX_DRAWN) return null;
				}
				if (text === range.commonAncestorContainer) break;
			}
		}
		return out;
	};

	/** The font size and the advance of a space at a display position (reads only). */
	let canvas: CanvasRenderingContext2D | null | undefined;
	const metricsOf = (pos: number, perRender: { elements: Map<Element, { size: number; space: number } | null>; spaces: Map<string, number> }): { size: number; space: number } | null => {
		let element: Element | null = null;
		try { const at = view.domAtPos(pos, -1); element = at.node.nodeType === 3 ? at.node.parentElement : at.node as Element; } catch { return null; }
		if (!element) return null;
		const known = perRender.elements.get(element);
		if (known !== undefined) return known;
		const win = view.dom.ownerDocument.defaultView;
			if (!win) return null;
			const style = win.getComputedStyle(element), size = parseFloat(style.fontSize);
		let metrics: { size: number; space: number } | null = null;
		if (Number.isFinite(size) && size > 0) {
			const letterSpacing = parseFloat(style.letterSpacing) || 0, font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
			let space = perRender.spaces.get(font);
			if (space === undefined) {
				space = Number.NaN;
				if (canvas === undefined || canvas?.canvas.ownerDocument !== view.dom.ownerDocument) canvas = view.dom.ownerDocument.createElement("canvas").getContext("2d");
				if (canvas) { canvas.font = font; space = canvas.measureText(" ").width; }
				perRender.spaces.set(font, space);
			}
			metrics = { size, space: (Number.isFinite(space) && space > 0 ? space : size * NEWLINE_BAND_EM) + letterSpacing };
		}
		perRender.elements.set(element, metrics);
		return metrics;
	};

	/** What cannot be painted as text but is in the range: parts, rules, fence lines, the frontmatter, inline math (their elements). */
	const atomElements = (from: number, to: number, skipped: Map<Element, boolean>): HTMLElement[] | null => {
		const found: HTMLElement[] = [];
		let over = false;
		view.state.doc.nodesBetween(from, to, (node, pos) => {
			if (over) return false;
			const name = node.type.name;
			if (name === "widget" || name === "frontmatter" || name === "inlineMath" || (name === "line" && HIDDEN_LINE_KINDS.has(String(node.attrs.kind)))) {
				if (pos >= from && pos + node.nodeSize <= to) {
					const dom = view.nodeDOM(pos);
					if (dom && dom.nodeType === 1 && !inSkippedChunk(dom, skipped)) found.push(dom as HTMLElement);
					if (found.length > MAX_RANGE_ATOMS) over = true;
				}
				return false;
			}
			return true;
		});
		return over ? null : found;
	};

	/** The reads; the returned function writes (M3c round 2, R2-5: in the display frame the writes run after every other read of the frame). */
	const prepare = (): (() => void) | void => {
		if (destroyed) return;
		const started = performance.now();
		if (!shown) return clearAll;
		const all = options.isAllSelection?.() === true, selection = paintSelection(display, all);
		if (!selection) return clearAll;
		const win = view.dom.ownerDocument.defaultView;
		if (!win) return; // (the window is closing: nothing to read)
		counts.draws++;
		const state = view.state.doc, rect = options.mode() === "rect-layer";
		if (dirty || bandDoc !== state) { bands.clear(); bandDoc = state; dirty = false; }
		// All the reads (layout), then all the writes.
		const origin = readContentOrigin(scrollHost), scale = origin.scale, vertical = win.getComputedStyle(view.dom).writingMode.startsWith("vertical");
		const fromFlat = flat(selection.from), toFlat = flat(selection.to), skipped = new Map<Element, boolean>();
		let text: Box[] | null = [];
		if (rect) {
			// Sizes of `sot-selection-policy.ts` (V draws no overlay above them: characters, and lines) and the rect cap: nothing is drawn.
			text = toFlat - fromFlat >= HUGE_DOC_LENGTH || countNewlinesBetween(newlinePositions(display.state), fromFlat, toFlat) >= HUGE_DOC_LINE_COUNT ? null : textRects(displayRanges(display, all), origin, skipped);
			if (text === null) counts.overLimit++;
		}
		const newline: Box[] = [];
		const positions = newlinesBetween(newlinePositions(display.state), fromFlat, toFlat, MAX_RANGE_NEWLINE_BANDS);
		if (positions === null) counts.overLimit++;
		else {
			const perRender = { elements: new Map<Element, { size: number; space: number } | null>(), spaces: new Map<string, number>() };
			for (const n of positions) {
				let box = bands.get(n);
				if (box === undefined) {
					const at = shownPos(n);
					// A line in a skipped chunk is read when its chunk is laid out (not cached: the next draw asks again).
					let line: Node | null = null;
					try { line = view.domAtPos(at, -1).node; } catch { line = null; }
					if (inSkippedChunk(line, skipped)) continue;
					const caret = readCaretRect(view, at, vertical, "head"), metrics = caret ? metricsOf(at, perRender) : null;
					if (!caret || !metrics) box = null;
					else {
						// The band's thickness is the block extent of the caret's rect (the glyph box of the line); a caret with none gets the font size.
						const extent = (vertical ? caret.right - caret.left : caret.bottom - caret.top) / scale, thickness = extent > 0.5 ? extent : metrics.size;
						const left = (caret.left - origin.x) / scale, top = (caret.top - origin.y) / scale;
						box = vertical ? { left, top, width: thickness, height: metrics.space } : { left, top, width: metrics.space, height: thickness };
					}
					bands.set(n, box);
				}
				if (box) newline.push(box); else counts.unreadable++;
			}
		}
		const atom: Box[] = [];
		const elements = atomElements(selection.from, selection.to, skipped);
		if (elements === null) counts.overLimit++;
		else for (const element of elements) {
			const r = element.getBoundingClientRect();
			if (r.width < 0.5 || r.height < 0.5) continue;
			atom.push({ left: (r.left - origin.x) / scale, top: (r.top - origin.y) / scale, width: r.width / scale, height: r.height / scale });
		}
		return () => {
			if (!colors) { layer.setCssProps({ "--tategaki-pm-range-bg": options.paint.background, "--tategaki-pm-range-wash-opacity": String(options.paint.washOpacity) }); colors = true; }
			write("text", text ?? []);
			write("newline", newline);
			write("atom", atom);
			counts.texts = text?.length ?? 0; counts.newlines = newline.length; counts.atoms = atom.length;
			lastMs = performance.now() - started;
			record("range-overlay", { texts: counts.texts, newlines: counts.newlines, atoms: counts.atoms, durationMs: lastMs });
		};
	};
	/** At once (the selection synced): the reads, then the writes. */
	const render = (): void => { prepare()?.(); };
	const frameJob = (): (() => void) | void => { counts.frames++; if (!destroyed && shown) return prepare(); };

	return {
		/** The selection or the focus changed (`PmModeInput.paintRange`): draw at once when the range is to be shown, clear at once when it is not. */
		update(show: boolean): void { shown = show; render(); },
		/** A layout change (a resize, a font, the sizes of the chunks): the positions are read again in the next display frame. */
		invalidate(): void { dirty = true; if (shown && !destroyed) options.requestFrame(frameJob); },
		/**
		 * A chunk was laid out again (it came back on screen, `contentvisibilityautostatechange`): what lay in it was not read before, so the next display frame reads it.
		 * Nothing that was read is read again: a chunk that shows again has not changed size (the ResizeObserver says so, and then `invalidate` is called).
		 */
		refresh(): void { if (shown && !destroyed) options.requestFrame(frameJob); },
		counters: () => ({ ...counts, lastMs, children: layer.childElementCount }),
		element: layer,
		/** The element went into another window: what was read for it is read again; the elements move with the layer. */
		destroy(): void { destroyed = true; clearAll(); layer.remove(); },
	};
}
export type RangeOverlay = ReturnType<typeof createRangeOverlay>;
