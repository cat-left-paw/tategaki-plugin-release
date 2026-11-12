// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/pseudoCaretSource.ts (`isInputSurfacePseudoCaretLive`), src/editor-core/features/pseudoCaretGeometry.ts
//   (`buildPseudoCaretShape`, `PSEUDO_CARET_MIN_LENGTH_PX`), src/editor-core/features/pseudoCaretOverlay.ts (the overlay's orientation, blink and hidden state) and the
//   input surface's branch of src/editor-core/features/pseudoCaretController.ts (`resolveDomCaretViewportRect`: the caret while composing or holding text is read from the
//   surface's DOM selection) @ 020b5501 (2026-10-22). `pseudoCaretWiring.ts` (the display callbacks) is replaced by `display-visuals.ts`.
// Local changes: M3c (D-M3-17). The pieces are the same; what differs:
//   - The overlay is a child of the scrolling element (content coordinates, so the browser moves it with the text), not of `.editor-surface`; its box goes through
//     Obsidian's `setCssStyles` (1.3.4 rule: no direct style assignment), only for the values that changed. It is shown and hidden by an attribute (`display: none` in the
//     CSS, which also takes it out of the scrollable overflow as Nyoze's zero box did).
//   - There is no PM view to ask: the caret of a collapsed selection with an empty, quiet surface is the display's caret (`readDisplayCaret`, the same read that places the
//     input surface, so the two agree); with a composition or held text it is the surface's DOM caret, read across the shadow root (`composed-tree.ts`).
//   - The native caret of the surface is hidden by an attribute only while the pseudo caret is drawn (D-M3-17, design §7.5).
//   - There is no setting to switch the caret off (Nyoze's `getEnabled`): V's caret has none either. The thickness and the color are the current writing mode's keys.
//   - Nyoze's wrap-boundary affinity picking (`pickVerticalWrapBoundaryRect` and the pointer intent) is not copied: the display caret already takes the navigation's affinity
//     (M3a, R2-1), and the DOM caret of a composition is not read at a wrap boundary.
//   - No rAF of its own and no polling: the frame job that draws it is `display-visuals.ts`'s, run in the display frame of `caret-reveal.ts`. The blink is a CSS animation.
import type { SurfaceState } from "../input/surface-state";
import { selectionOf, type ViewRoot } from "./composed-tree";
import type { PlacementRect } from "./surface-placement";
import type { ContentOrigin } from "./content-coordinates";

/** Minimum caret line length (long axis) so that a degenerate rect still gives a visible mark. */
export const PSEUDO_CARET_MIN_LENGTH_PX = 8;
const MAX_EXTENT = 1_000_000;

/** Nyoze `isInputSurfacePseudoCaretLive`: the pseudo caret is drawn only for a live surface (the state machine's `surface`; `surface-range` while composing is not drawn here, see `display-visuals.ts`). */
export function isInputSurfacePseudoCaretLive(input: { enabled: boolean; eligible: boolean; documentFocused: boolean; surfaceFocused: boolean; connected: boolean; state: SurfaceState; composing: boolean }): boolean {
	return input.enabled && input.eligible && input.documentFocused && input.surfaceFocused && input.connected &&
		(input.state === "surface" || (input.state === "surface-range" && input.composing));
}

/** A box in content coordinates (the scrolling element's), CSS px. */
export interface CaretShape { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

/**
 * The caret's box from a viewport caret rect (Nyoze `buildPseudoCaretShape`): a thin line whose long side is the caret's extent across the line.
 * Vertical writing: a horizontal line (long side = the rect's width, centered on the rect's y). Horizontal writing: a vertical line (long side = the rect's
 * height, centered on the rect's x). `null` for a non-finite or degenerate result (the caller hides the caret).
 */
export function buildPseudoCaretShape(args: { rect: PlacementRect; origin: ContentOrigin; vertical: boolean; thickness: number; minLength?: number }): CaretShape | null {
	const { rect, origin, vertical } = args;
	if (![rect.left, rect.right, rect.top, rect.bottom, origin.x, origin.y, origin.scale].every(Number.isFinite) || !(origin.scale > 0)) return null;
	const thickness = Number.isFinite(args.thickness) && args.thickness > 0 ? args.thickness : 2;
	const minLength = Number.isFinite(args.minLength) && (args.minLength as number) > 0 ? args.minLength as number : PSEUDO_CARET_MIN_LENGTH_PX;
	const toLeft = (x: number): number => (x - origin.x) / origin.scale, toTop = (y: number): number => (y - origin.y) / origin.scale;
	let shape: CaretShape;
	if (vertical) {
		const raw = (rect.right - rect.left) / origin.scale, length = raw > 0 ? Math.max(raw, minLength) : minLength;
		shape = { left: toLeft(rect.left), top: toTop((rect.top + rect.bottom) / 2) - thickness / 2, width: length, height: thickness };
	} else {
		const raw = (rect.bottom - rect.top) / origin.scale, length = raw > 0 ? Math.max(raw, minLength) : minLength;
		shape = { left: toLeft((rect.left + rect.right) / 2) - thickness / 2, top: toTop(rect.top), width: thickness, height: length };
	}
	const ok = [shape.left, shape.top, shape.width, shape.height].every(Number.isFinite) && shape.width > 0 && shape.height > 0 && shape.width <= MAX_EXTENT && shape.height <= MAX_EXTENT;
	return ok ? shape : null;
}

/**
 * The caret of the input surface's own text (a composition, or text held after a refused commit), in the viewport: the focus point of the DOM selection
 * inside the surface, as a collapsed range (Nyoze `resolveDomCaretViewportRect`: while composing, the live range spans the composing text and the caret follows its
 * focus). `null` when the selection is not inside the surface or the browser gives no box for it (the caller falls back to the display's caret, where the surface is placed).
 */
export function readSurfaceCaretRect(element: HTMLElement, root: ViewRoot): PlacementRect | null {
	const selection = selectionOf(root);
	if (!selection || selection.rangeCount === 0) return null;
	const focus = selection.focusNode;
	if (!focus || !element.contains(focus)) return null;
	try {
		const range = element.ownerDocument.createRange();
		range.setStart(focus, selection.focusOffset);
		range.collapse(true);
		const list = range.getClientRects(), rect = list.length > 0 ? list[0] : range.getBoundingClientRect();
		// A vertical caret has no height and a horizontal one no width: only a box with neither is no box.
		if (!rect || (rect.width === 0 && rect.height === 0)) return null;
		return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
	} catch { return null; }
}

/**
 * Whether the DOM selection is a range inside the input surface (the user selected text of the surface itself, for example held text, with Shift+arrow). Round 2 (R2-1): no caret is drawn
 * for it, as for a range of the document, and the surface's native caret shows. (A composition's own selection is a range too; the caller leaves a composition out.)
 */
export function isSurfaceRangeSelected(element: HTMLElement, root: ViewRoot): boolean {
	const selection = selectionOf(root);
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
	return !!selection.anchorNode && !!selection.focusNode && element.contains(selection.anchorNode) && element.contains(selection.focusNode);
}

/** The overlay element: made once, child of the scrolling element, above the input surface (z-index 20). */
export function createPseudoCaretOverlay(scrollHost: HTMLElement) {
	const element = scrollHost.ownerDocument.createElement("div");
	element.className = "tategaki-pm-pseudo-caret";
	element.setAttribute("aria-hidden", "true");
	element.dataset.shown = "off";
	element.dataset.blink = "off";
	scrollHost.appendChild(element);
	let applied: CaretShape | null = null, shown = false, color = "", destroyed = false;
	return {
		element,
		/** Show the caret in `shape` (only the changed values are written), or hide it. Writes only: the reads are done by the caller. */
		set(shape: CaretShape | null, orientation: "horizontal" | "vertical", paint: { color: string }): void {
			if (destroyed) return;
			if (!shape) { if (shown) { shown = false; element.dataset.shown = "off"; element.dataset.blink = "off"; } return; }
			const styles: Partial<CSSStyleDeclaration> = {};
			if (!applied || applied.left !== shape.left) styles.left = `${shape.left}px`;
			if (!applied || applied.top !== shape.top) styles.top = `${shape.top}px`;
			if (!applied || applied.width !== shape.width) styles.width = `${shape.width}px`;
			if (!applied || applied.height !== shape.height) styles.height = `${shape.height}px`;
			if (Object.keys(styles).length) element.setCssStyles(styles);
			applied = shape;
			if (color !== paint.color) { color = paint.color; element.setCssProps({ "--tategaki-pm-caret-color": paint.color }); }
			if (element.dataset.orientation !== orientation) element.dataset.orientation = orientation;
			if (!shown) {
				shown = true;
				element.dataset.shown = "on";
				// The animation starts again at every show, at full opacity (Nyoze's overlay does the same).
				element.dataset.blink = "on";
			}
		},
		get shown(): boolean { return shown; },
		destroy(): void { destroyed = true; element.remove(); },
	};
}
export type PseudoCaretOverlay = ReturnType<typeof createPseudoCaretOverlay>;
