// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/surfacePlacement.ts @ 58a98a90 (2026-11-06; the file is the same as at 020b5501)
// Local changes: `OwnerCaretGeometry` is the local `PlacementRect`. M4b (D-M4-5): `SurfaceFrozenPlacement` and `surfaceFollowStart` (INLINE-2B, following the reserved area of the
//   owner's presentation) are taken as they are. Where they are called (`input-surface.ts`) the rects are in content coordinates with the page scale, and the frozen inline start is the
//   line's own (`placedLine`), which the chunks' translation moves, so it follows the chunks (`toContentRect`, `content-coordinates.ts`).

export interface PlacementRect { left: number; right: number; top: number; bottom: number }

/** Align block centers; preserve the inline start, including zero-width empty caret rects. */
export function surfacePlacement(rect: PlacementRect, blockSize: number, vertical: boolean): { left: number; top: number } {
	return vertical
		? { left: (rect.left + rect.right - blockSize) / 2, top: rect.top }
		: { left: rect.left, top: (rect.top + rect.bottom - blockSize) / 2 };
}

export interface SurfaceBlockPlacement { left: number; top: number; inlineSize: number; indent: number; firstLineEnd: number }

/** The textblock content box supplies the inline origin and the wrap width. */
export function surfaceBlockPlacement(
	caret: PlacementRect,
	block: PlacementRect,
	edges: { left: number; right: number; top: number; bottom: number },
	blockSize: number,
	vertical: boolean,
): SurfaceBlockPlacement {
	const first = surfacePlacement(caret, blockSize, vertical);
	const inlineStart = vertical ? block.top + edges.top : block.left + edges.left;
	const inlineEnd = vertical ? block.bottom - edges.bottom : block.right - edges.right;
	const caretStart = vertical ? caret.top : caret.left;
	return {
		left: vertical ? first.left : inlineStart,
		top: vertical ? inlineStart : first.top,
		inlineSize: Math.max(1, inlineEnd - inlineStart),
		indent: Math.max(0, caretStart - inlineStart),
		firstLineEnd: vertical ? first.left + blockSize : first.top + blockSize,
	};
}

/** `inlineStart` is in the scrolling element's content coordinates (`content-coordinates.ts`); the rect given to `surfaceFollowStart` is in the same coordinates. `size` is the surface's block size. */
export interface SurfaceFrozenPlacement { vertical: boolean; inlineStart: number; size: number }

/**
 * INLINE-2B: where the surface starts so that its first character is on the reserved area's first character. The inline direction is the indent; the block direction is the first line's
 * box edges (the left and right in vertical writing, the top and bottom in horizontal writing).
 */
export function surfaceFollowStart(
	first: PlacementRect,
	placement: SurfaceFrozenPlacement,
): { indent: number; lineStart: number; lineEnd: number } {
	const center = placement.vertical ? (first.left + first.right) / 2 : (first.top + first.bottom) / 2;
	return {
		indent: Math.max(0, (placement.vertical ? first.top : first.left) - placement.inlineStart),
		lineStart: center - placement.size / 2,
		lineEnd: center + placement.size / 2,
	};
}
