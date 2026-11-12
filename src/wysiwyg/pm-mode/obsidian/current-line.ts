// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: this repo's V, src/wysiwyg/sot-wysiwyg-view.ts: `getLineVisualRects` (V:15972-16011), `mergeVisualLineRects` (V:16043-16097) and the order of the calls in
//   `updateCurrentLineVisualOverlay` (V:14693-14721) @ the working tree of 2026-11-05. The decisions are V's pure functions, imported: `resolveSoTCurrentLineVisualRect`,
//   `resolveSoTCurrentLineVisualRectCandidates` and `resolveSoTCurrentLineDisplayRect` (src/wysiwyg/sot/sot-current-line-visual.ts). Nyoze's counterpart (`visualFocusCurrentLine*.ts`
//   @ 020b5501) is not copied (H7 (b)).
// Local changes: M3c (D-M3-18, H7 (b)). V's `updateSoTCurrentLineVisualOverlay` writes the overlay with `el.style.left = ...` (direct assignment, which the 1.3.4 rule forbids in new code), so the
//   box is written here with Obsidian's `setCssStyles`, only for the values that changed, and the band is placed in the scrolling element's content coordinates. V reads the line's text nodes
//   (without its pending spacer and EOL nodes); the new mode's line is a `tg-line` whose text nodes are the body text, so the Ruby readings (`rt`, `rp`) are left out instead. While a composition
//   or held text is on the input surface, the surface's text rects join the candidates (V's `usePendingCaret`: its pending spacer's rects), so the band follows the line the composing text is on.
//   The reads (`lineVisualRects`, the caret and the line's boxes) are done by the caller before any write. Round 2 (P3-6): `lineVisualRects` takes the font size that decides "the same visual line"
//   from the caller, which passes the root's (V's `getEffectiveFontSize()`), as V does.
import { resolveSoTCurrentLineDisplayRect, resolveSoTCurrentLineVisualRect, resolveSoTCurrentLineVisualRectCandidates } from "../../sot/sot-current-line-visual";
import type { ContentOrigin } from "./content-coordinates";
import type { PlacementRect } from "./surface-placement";

/** The text nodes of a line that carry body text: not the readings of a Ruby (`rt`, `rp`). */
function bodyTextNodes(line: HTMLElement): Text[] {
	const doc = line.ownerDocument, nodes: Text[] = [], walker = doc.createTreeWalker(line, 4 /* NodeFilter.SHOW_TEXT */);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node as Text, parent = text.parentElement;
		if (text.length === 0 || (parent && parent.closest("rt, rp"))) continue;
		nodes.push(text);
	}
	return nodes;
}

/** V:16043-16097 `mergeVisualLineRects`: the rects that lie on one visual line (the Ruby's inline blocks split it) become one box. */
export function mergeVisualLineRects(rects: DOMRect[], vertical: boolean, fontSize: number): DOMRect[] {
	if (rects.length <= 1) return rects;
	// The threshold of "the same visual line": half the font size (V).
	const threshold = Math.max(8, (fontSize || 18) * 0.5);
	const groups: DOMRect[][] = [];
	for (const rect of rects) {
		let found = false;
		for (const group of groups) {
			const representative = group[0];
			if (!representative) continue;
			const same = vertical
				? Math.abs(rect.left - representative.left) < threshold || Math.abs(rect.right - representative.right) < threshold
				: Math.abs(rect.top - representative.top) < threshold || Math.abs(rect.bottom - representative.bottom) < threshold;
			if (same) { group.push(rect); found = true; break; }
		}
		if (!found) groups.push([rect]);
	}
	return groups.map(group => {
		const first = group[0];
		if (group.length === 1 && first) return first;
		let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
		for (const r of group) { minLeft = Math.min(minLeft, r.left); minTop = Math.min(minTop, r.top); maxRight = Math.max(maxRight, r.right); maxBottom = Math.max(maxBottom, r.bottom); }
		return new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop);
	});
}

/** V:15972-16011 `getLineVisualRects`: the visual lines (columns, in vertical writing) of a text line, merged. */
export function lineVisualRects(line: HTMLElement, vertical: boolean, fontSize: number): DOMRect[] {
	const nodes = bodyTextNodes(line);
	if (nodes.length === 0) return [line.getBoundingClientRect()];
	const range = line.ownerDocument.createRange(), last = nodes[nodes.length - 1];
	range.setStart(nodes[0], 0);
	range.setEnd(last, last.length);
	const rects = Array.from(range.getClientRects());
	if (rects.length === 0) return [line.getBoundingClientRect()];
	const unique: DOMRect[] = [];
	for (const rect of rects) {
		if (rect.width <= 0 && rect.height <= 0) continue;
		if (!unique.some(existing => Math.abs(existing.left - rect.left) < 0.5 && Math.abs(existing.right - rect.right) < 0.5 && Math.abs(existing.top - rect.top) < 0.5 && Math.abs(existing.bottom - rect.bottom) < 0.5)) unique.push(rect);
	}
	return mergeVisualLineRects(unique, vertical, fontSize);
}

/** The visual rects of the text a composition (or held text) put on the input surface: its range's client rects. */
export function surfaceTextRects(surface: HTMLElement): DOMRect[] {
	if (!surface.firstChild || !surface.textContent) return [];
	const range = surface.ownerDocument.createRange();
	range.selectNodeContents(surface);
	return Array.from(range.getClientRects()).filter(rect => rect.width > 0 || rect.height > 0);
}

export interface CurrentLineBox { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

/**
 * What V's `updateCurrentLineVisualOverlay` decides, from the reads: the band's rect in the viewport. `surfaceRects` are the composing text's rects
 * (empty without a composition); the caret is then the surface's own. The result is then moved into content coordinates.
 */
export function currentLineRect(input: { line: HTMLElement; lineRects: DOMRect[]; surfaceRects: DOMRect[]; caret: PlacementRect; lineBox: DOMRect; writingMode: string; fontSize: number; lineHeight: number; origin: ContentOrigin }): CurrentLineBox | null {
	const caret = new DOMRect(input.caret.left, input.caret.top, input.caret.right - input.caret.left, input.caret.bottom - input.caret.top);
	const candidates = resolveSoTCurrentLineVisualRectCandidates({ lineVisualRects: input.lineRects, pendingLineVisualRects: input.surfaceRects, usePendingCaret: input.surfaceRects.length > 0 });
	const visualRect = resolveSoTCurrentLineVisualRect({ lineVisualRects: candidates, caretRect: caret });
	const rect = resolveSoTCurrentLineDisplayRect({ visualRect, lineRect: input.lineBox, caretRect: caret, writingMode: input.writingMode, fontSize: input.fontSize, lineHeight: input.lineHeight });
	if (!rect || !(rect.width >= 0) || !(rect.height >= 0)) return null;
	const { origin } = input;
	return { left: (rect.left - origin.x) / origin.scale, top: (rect.top - origin.y) / origin.scale, width: rect.width / origin.scale, height: rect.height / origin.scale };
}

/** The band's element: a child of the scrolling element under the range layer (z-index 0), written with changed values only. */
export function createCurrentLineOverlay(scrollHost: HTMLElement) {
	const element = scrollHost.ownerDocument.createElement("div");
	element.className = "tategaki-pm-current-line";
	element.setAttribute("aria-hidden", "true");
	element.dataset.shown = "off";
	scrollHost.appendChild(element);
	let applied: CurrentLineBox | null = null, shown = false, destroyed = false;
	return {
		element,
		set(box: CurrentLineBox | null): void {
			if (destroyed) return;
			if (!box) { if (shown) { shown = false; element.dataset.shown = "off"; } return; }
			const styles: Partial<CSSStyleDeclaration> = {};
			if (!applied || applied.left !== box.left) styles.left = `${box.left}px`;
			if (!applied || applied.top !== box.top) styles.top = `${box.top}px`;
			if (!applied || applied.width !== box.width) styles.width = `${box.width}px`;
			if (!applied || applied.height !== box.height) styles.height = `${box.height}px`;
			if (Object.keys(styles).length) element.setCssStyles(styles);
			applied = box;
			if (!shown) { shown = true; element.dataset.shown = "on"; }
		},
		get shown(): boolean { return shown; },
		destroy(): void { destroyed = true; element.remove(); },
	};
}
export type CurrentLineOverlay = ReturnType<typeof createCurrentLineOverlay>;
