// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/rules.ts @ 020b5501 (2026-10-22)
// Local changes: Local module paths and tab indentation; rules and H3 key table unchanged.
import { classifyWritingModeArrowKey, resolveWritingModeArrowMapping, type SupportedEditorWritingMode } from './writing-mode'

export type NavigationOp = {
	axis: 'character' | 'line' | 'line-edge' | 'document' | 'page'
	direction: 'backward' | 'forward'
	extend: boolean
	/** Modified line-boundary commands do not use bare Home/End's second stage. */
	visualOnly?: boolean
}
export type NavigationAffinity = 'head' | 'end'
export type NavigationReceipt = {
	handled: boolean
	moved: boolean
	anchor: number
	head: number
	affinity: NavigationAffinity
	reason: string
	calculationMs: number
	dispatchMs: number
	scrollMs: number
}

export function navigationOp(key: string, extend: boolean, mode: SupportedEditorWritingMode): NavigationOp | null {
	const arrow = classifyWritingModeArrowKey(key)
	if (arrow) return { ...resolveWritingModeArrowMapping(mode, arrow), extend }
	if (key === 'Home' || key === 'End') return { axis: 'line-edge', direction: key === 'Home' ? 'backward' : 'forward', extend }
	if (key === 'PageUp' || key === 'PageDown') return { axis: 'page', direction: key === 'PageUp' ? 'backward' : 'forward', extend }
	return null
}

/** The stored coordinate is in scroll content space, so scrolling cannot change the goal. */
export function nextGoal(previous: number | null, coordinate: number, axis: NavigationOp['axis'], retain = true): number | null {
	return axis === 'line' ? (retain ? previous : null) ?? Math.round(coordinate) : null
}

export function retainLineGoal(mode: SupportedEditorWritingMode, extend: boolean, collapsed: boolean): boolean {
	return mode !== 'vertical-rl' || extend || !collapsed
}

/** A newly acquired forward range has an upstream row at a soft wrap. Native
* line motion still takes its inline goal from the downstream caret rectangle. */
export function rangeLineOrigin(anchor: number, head: number, goal: number | null, affinity: NavigationAffinity): NavigationAffinity {
	return goal === null && head > anchor ? 'end' : affinity
}

/** Native Shift+Arrow stops once at the anchor before extending on its other side. */
export function stopAtAnchor(anchor: number, head: number, target: number): number {
	return (head < anchor && target > anchor) || (head > anchor && target < anchor) ? anchor : target
}

/** Move the directional endpoint and preserve both the other endpoint and orientation. */
export function extendDirectionalEdge(anchor: number, head: number, target: number, direction: NavigationOp['direction']) {
	const moveAnchor = anchor !== head && (direction === 'backward' ? anchor < head : anchor > head)
	return moveAnchor ? { anchor: target, head } : { anchor, head: target }
}

export function documentEdge(first: number, last: number, direction: NavigationOp['direction']): number {
	return direction === 'forward' ? last : first
}

export function navigationAnchor(anchor: number, target: number, extend: boolean): number {
	return extend ? anchor : target
}
