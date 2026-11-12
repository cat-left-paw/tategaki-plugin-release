// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/contentCoordinates.ts @ 020b5501 (2026-10-22)
// Local changes: comments in English; the repo's style (tabs, semicolons, double quotes). The formulas are Nyoze's, with a
//   scale: the new mode's page frame can be drawn with `transform: scale()` (the page scale setting), which Nyoze has not.
//   Viewport lengths are CSS pixels times the scale; with scale 1 every value is Nyoze's.

/**
 * The input surface is an absolutely positioned child of the scrolling element, placed in content
 * coordinates, so the browser itself moves it with the text when the view scrolls (Nyoze PREEDIT-FOLLOW1).
 * A placement is computed from viewport rects (`getBoundingClientRect()`, `Range` rects) and converted just
 * before the write, so all reads are done before the first write (no extra layout).
 *
 * In an absolutely positioned child `left` / `top` / `right` are measured from the padding box of the
 * scrolling element and move with its content. In vertical writing `scrollLeft` is 0 or less and the content
 * extends to the left:
 *   - left edge of the origin (viewport) = rect.left + clientLeft - scrollLeft
 *   - right edge of the origin (viewport) = that + clientWidth
 */
export interface ContentOrigin {
	/** The viewport x of the origin of `left`. */
	readonly x: number;
	/** The viewport y of the origin of `top`. */
	readonly y: number;
	/** The viewport x of the origin of `right` (the right edge of the padding box). */
	readonly right: number;
	/** Viewport pixels per CSS pixel of the scrolling element (its ancestors' `scale()`); 1 without one. */
	readonly scale: number;
}

export interface ContentOriginMetrics {
	readonly left: number;
	readonly top: number;
	readonly clientLeft: number;
	readonly clientTop: number;
	readonly clientWidth: number;
	readonly scrollLeft: number;
	readonly scrollTop: number;
	/** Viewport pixels per CSS pixel; 1 when omitted. */
	readonly scale?: number;
}

export function contentOriginFromMetrics(metrics: ContentOriginMetrics): ContentOrigin {
	const scale = metrics.scale ?? 1;
	// The border, the scroll offsets and the width are CSS pixels: the box's own left and top are already in the viewport.
	const x = metrics.left + (metrics.clientLeft - metrics.scrollLeft) * scale;
	return { x, y: metrics.top + (metrics.clientTop - metrics.scrollTop) * scale, right: x + metrics.clientWidth * scale, scale };
}

/** One read of the origin. Call it with the other reads, before writing. */
export function readContentOrigin(scrollHost: HTMLElement): ContentOrigin {
	const rect = scrollHost.getBoundingClientRect();
	// The bounding box is the transformed border box; the used width of a border-box element is not (`offsetWidth` rounds).
	const win = scrollHost.ownerDocument.defaultView;
	const layoutWidth = win ? parseFloat(win.getComputedStyle(scrollHost).width) : NaN;
	const scale = layoutWidth > 0 && rect.width > 0 ? rect.width / layoutWidth : 1;
	return contentOriginFromMetrics({
		left: rect.left, top: rect.top, clientLeft: scrollHost.clientLeft, clientTop: scrollHost.clientTop,
		clientWidth: scrollHost.clientWidth, scrollLeft: scrollHost.scrollLeft, scrollTop: scrollHost.scrollTop, scale,
	});
}

export const toContentLeft = (origin: ContentOrigin, viewportX: number): number => (viewportX - origin.x) / origin.scale;
export const toContentTop = (origin: ContentOrigin, viewportY: number): number => (viewportY - origin.y) / origin.scale;
/** The viewport x of the right end of the first column (vertical writing) as a value of `right`. */
export const toContentRight = (origin: ContentOrigin, viewportLineEnd: number): number => (origin.right - viewportLineEnd) / origin.scale;

export interface ContentRect { left: number; right: number; top: number; bottom: number }
/** A viewport rect in content coordinates. */
export const toContentRect = (origin: ContentOrigin, rect: ContentRect): ContentRect => ({
	left: (rect.left - origin.x) / origin.scale, right: (rect.right - origin.x) / origin.scale, top: (rect.top - origin.y) / origin.scale, bottom: (rect.bottom - origin.y) / origin.scale,
});
/** A line end in content coordinates (the right end of the first column) as a value of `right`. */
export const rightFromContentLineEnd = (origin: ContentOrigin, contentLineEnd: number): number => (origin.right - origin.x) / origin.scale - contentLineEnd;
