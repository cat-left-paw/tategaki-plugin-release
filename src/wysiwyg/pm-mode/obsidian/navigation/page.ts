// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/pageUpDownNavigation.ts @ 020b5501 (2026-10-22)
// Local changes: explicit shadow scroll host and detached caret reader; no PM dispatch, Host focus or DOM Selection.
//   R2-3: the caller's `accept` filters the hit positions (visible text only); with none accepted, the nearest visible text along the paging
//   direction in the viewport is used, and with none there the scroll is restored; the hit position (null if no point hit the model) is returned for R3-1 (see navigation.ts).
//   M3c round 2 (R2-7): `tail` (the tail spacer's extent, 0 without one) keeps a PageDown out of the spacer, with V's `clampSoTPageDownDelta` (sot-scroll-past-end.ts, a pure function):
//   the scroll stops where the content ends. A PageUp, and any PageDown with no spacer (`tail` 0, which is every case outside Typewriter), are the plan as it was.
import type { EditorView } from "../../pm/prosemirror";
import { clampSoTPageDownDelta } from "../../../sot/sot-scroll-past-end";
import { readCaretRect } from "../display-geometry";
import { partPositionAtPoint, positionAtPoint } from "./point";
import type { SupportedEditorWritingMode } from "./writing-mode";
type PageUpDownDirection = "pageUp" | "pageDown";
type PageUpDownWritingMode = SupportedEditorWritingMode | "vertical-lr";
type PageUpDownAxis = "vertical" | "horizontal";
type ScrollHost = HTMLElement;
type TargetPoint = { left: number; top: number };
type PageScrollPlan = { axis: PageUpDownAxis; currentOffset: number; targetOffset: number; delta: number; viewportSpan: number };
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const midpoint = (start: number, end: number): number => start + (end - start) / 2;
function clampToRect(value: number, start: number, end: number): number {
 const min = start + 1, max = end - 1;
 return !Number.isFinite(value) || max < min ? midpoint(start, end) : clamp(value, min, max);
}
export function resolvePageScrollPlan(
	host: Pick<
		ScrollHost,
		'scrollTop' | 'scrollLeft' | 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'
	>,
	direction: PageUpDownDirection,
	writingMode: PageUpDownWritingMode,
	tail = 0,
): PageScrollPlan {
	const plan = resolveUnclampedPageScrollPlan(host, direction, writingMode);
	if (direction !== 'pageDown' || !(tail > 0) || plan.delta === 0) return plan;
	const vertical = plan.axis === 'vertical';
	const delta = clampSoTPageDownDelta({
		scrollAxis: vertical ? 'y' : 'x', writingMode, proposedDelta: plan.delta, scrollPosition: plan.currentOffset,
		scrollExtent: vertical ? host.scrollHeight : host.scrollWidth, clientExtent: vertical ? host.clientHeight : host.clientWidth, tailSpacerExtent: tail,
	});
	return { ...plan, delta, targetOffset: plan.currentOffset + delta };
}
function resolveUnclampedPageScrollPlan(
	host: Pick<
		ScrollHost,
		'scrollTop' | 'scrollLeft' | 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'
	>,
	direction: PageUpDownDirection,
	writingMode: PageUpDownWritingMode,
): PageScrollPlan {
	if (writingMode === 'horizontal-tb') {
		const max = Math.max(0, host.scrollHeight - host.clientHeight)
		const current = host.scrollTop
		const delta = direction === 'pageDown' ? host.clientHeight : -host.clientHeight
		const target = clamp(current + delta, 0, max)
		return {
			axis: 'vertical',
			currentOffset: current,
			targetOffset: target,
			delta: target - current,
			viewportSpan: host.clientHeight,
		}
	}

	const max = Math.max(0, host.scrollWidth - host.clientWidth)
	const current = host.scrollLeft
	const delta =
		direction === 'pageDown'
			? writingMode === 'vertical-rl'
				? -host.clientWidth
				: host.clientWidth
			: writingMode === 'vertical-rl'
				? host.clientWidth
				: -host.clientWidth

	const minOffset = writingMode === 'vertical-rl' ? -max : 0
	const maxOffset = writingMode === 'vertical-rl' ? 0 : max
	const target = clamp(current + delta, minOffset, maxOffset)

	return {
		axis: 'horizontal',
		currentOffset: current,
		targetOffset: target,
		delta: target - current,
		viewportSpan: host.clientWidth,
	}
}

export function resolvePageTargetPoints(
	surfaceRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
	caretPoint: TargetPoint,
	axis: PageUpDownAxis,
): TargetPoint[] {
	const primary = {
		left: clampToRect(caretPoint.left, surfaceRect.left, surfaceRect.right),
		top: clampToRect(caretPoint.top, surfaceRect.top, surfaceRect.bottom),
	}
	const center = {
		left: midpoint(surfaceRect.left, surfaceRect.right),
		top: midpoint(surfaceRect.top, surfaceRect.bottom),
	}

	if (axis === 'vertical') {
		return [primary, { left: center.left, top: primary.top }]
	}
	return [primary, { left: primary.left, top: center.top }]
}


/** Synchronous one-page scroll and point resolution. A range without Shift only scrolls (A3). */
export function pageTarget(view: EditorView, host: HTMLElement, mode: SupportedEditorWritingMode, head: number, forward: boolean, scrollOnly: boolean,
 accept: (pos: number) => boolean = () => true, tail = 0): { head: number | null; reason: string; hit?: number | null } {
 const plan = resolvePageScrollPlan(host, forward ? "pageDown" : "pageUp", mode, tail);
 if (plan.viewportSpan <= 0) return { head: null, reason: "page-unavailable" };
 const set = (value: number) => { if (plan.axis === "vertical") host.scrollTop = value; else host.scrollLeft = value; };
 if (plan.delta === 0 || scrollOnly) {
  if (scrollOnly) set(plan.targetOffset);
  return { head: null, reason: plan.delta === 0 ? "page-edge" : "page-scroll-only" };
 }
 const rect = readCaretRect(view, head, mode === "vertical-rl");
 if (!rect) return { head: null, reason: "page-no-caret" };
 const points = resolvePageTargetPoints(host.getBoundingClientRect(), { left: midpoint(rect.left, rect.right), top: midpoint(rect.top, rect.bottom) }, plan.axis);
 set(plan.targetOffset);
 // R3-1: the first position a point hit, visible text or not: with no visible text in the viewport it is where the next visible line is looked for.
 let hit: number | null = null;
 for (const point of points) {
  const pos = positionAtPoint(view, point.left, point.top);
  hit ??= pos;
  // R2-3: a point whose position is not visible text (a rule, a tall part) is skipped for the next point.
  if (pos !== null && accept(pos)) return { head: pos, reason: "page" };
 }
 // R2-3: none of the points is visible text: the nearest visible text along the paging direction at the same cross-axis coordinate, inside
 // the viewport (down for horizontal text; toward the later columns, to the left, for vertical-rl). None there: scroll back and write nothing.
 const vertical = mode === "vertical-rl", sign = forward ? 1 : -1, bounds = host.getBoundingClientRect();
 for (let distance = 6; ; distance += 6) {
  const left = vertical ? points[0].left - sign * distance : points[0].left, top = vertical ? points[0].top : points[0].top + sign * distance;
  if (left < bounds.left || left > bounds.right || top < bounds.top || top > bounds.bottom) break;
  const pos = positionAtPoint(view, left, top);
  hit ??= pos;
  if (pos !== null && accept(pos)) return { head: pos, reason: "page-nearest" };
 }
 // A part with no text under the points gives no caret position: its own position is the reference for the next visible line beyond it.
 if (hit === null) for (const point of points) { hit = partPositionAtPoint(view, point.left, point.top); if (hit !== null) break; }
 set(plan.currentOffset);
 return { head: null, reason: "page-no-visible-point", hit };
}
