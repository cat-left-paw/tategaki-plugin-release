// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/rubyHomeEndVisualEdge.ts @ 020b5501 (2026-10-22)
// Local changes: ruby schema name; use the single detached caret reader, not a second geometry implementation.
import type { EditorState, EditorView } from '../../pm/prosemirror'
import { readCaretRect } from '../display-geometry'

type Direction = 'home' | 'end'
type WritingMode = 'horizontal-tb' | 'vertical-rl'

const LINE_AXIS_EPSILON = 1

function resolveRubyAncestorDepth(state: EditorState, pos: number): number | null {
	const $pos = state.doc.resolve(pos)
	for (let depth = $pos.depth; depth > 0; depth--) {
		if ($pos.node(depth).type.name === 'ruby') return depth
	}
	return null
}

function isWithinRuby(state: EditorState, pos: number): boolean {
	return resolveRubyAncestorDepth(state, pos) !== null
}

function resolveWritingMode(view: EditorView): WritingMode {
	const viewDom = view.dom
	const writingMode =
		viewDom?.ownerDocument?.defaultView?.getComputedStyle?.(viewDom).writingMode ?? ''
	return writingMode.startsWith('vertical') ? 'vertical-rl' : 'horizontal-tb'
}

function resolveLineAxisValue(
	view: EditorView,
	pos: number,
	writingMode: WritingMode,
): number | null {
	try {
		const coords = readCaretRect(view, pos, writingMode === 'vertical-rl')
		if (!coords) return null
		return writingMode === 'horizontal-tb' ? coords.top : coords.left
	} catch {
		return null
	}
}

function isSameVisualLine(a: number, b: number): boolean {
	return Math.abs(a - b) <= LINE_AXIS_EPSILON
}

function resolveReferenceLineAxis(
	view: EditorView,
	pos: number,
	writingMode: WritingMode,
	blockStart: number,
	blockEnd: number,
): number | null {
	const values = [pos - 1, pos, pos + 1]
		.filter((candidate) => candidate >= blockStart && candidate <= blockEnd)
		.map((candidate) => resolveLineAxisValue(view, candidate, writingMode))
		.filter((value): value is number => value !== null)
		.sort((a, b) => a - b)

	if (values.length === 0) return null
	return values[Math.floor(values.length / 2)] ?? null
}

export function resolveRubyAwareVisualLineEdge(
	view: EditorView,
	direction: Direction,
	blockStart: number,
	blockEnd: number,
): number | null {
	const { selection } = view.state
	if (!selection.empty) return null

	const cursorPos = selection.from
	if (resolveRubyAncestorDepth(view.state, cursorPos) === null) return null

	const writingMode = resolveWritingMode(view)
	const lineAxis = resolveReferenceLineAxis(view, cursorPos, writingMode, blockStart, blockEnd)
	if (lineAxis === null) return null

	let bestPos: number | null = null
	if (direction === 'home') {
		for (let pos = cursorPos; pos >= blockStart; pos--) {
			const axis = resolveLineAxisValue(view, pos, writingMode)
			if (axis === null) break
			if (!isSameVisualLine(axis, lineAxis)) {
				if (pos === cursorPos && bestPos === null) continue
				if (isWithinRuby(view.state, pos)) continue
				break
			}
			bestPos = pos
		}
		return bestPos
	}

	for (let pos = cursorPos; pos <= blockEnd; pos++) {
		const axis = resolveLineAxisValue(view, pos, writingMode)
		if (axis === null) break
		if (!isSameVisualLine(axis, lineAxis)) {
			if (pos === cursorPos && bestPos === null) continue
			if (isWithinRuby(view.state, pos)) continue
			break
		}
		bestPos = pos
	}
	if (bestPos === null) return null
	return bestPos < blockEnd ? bestPos + 1 : blockEnd
}
