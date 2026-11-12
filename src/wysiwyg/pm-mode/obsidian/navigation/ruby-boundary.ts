// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/rubyBoundaryArrowNavigation.ts @ 020b5501 (2026-10-22)
// Local changes: Pure anchor function only; ruby schema name; sole PM import boundary. No event/Host/DOM branch.
// Selection.near's atom-selection branch is replaced by canonical grapheme stops and shown-line neighbors.
import type { EditorState } from '../../pm/prosemirror'

export type RubyBoundaryArrowDirection = 'backward' | 'forward'
function resolveRubyAncestorDepth(state: EditorState, pos: number): number | null {
	const $pos = state.doc.resolve(pos)
	for (let depth = $pos.depth; depth > 0; depth--) {
		if ($pos.node(depth).type.name === 'ruby') return depth
	}
	return null
}

/** Shared duplicate-boundary authority, also used for a native range's initial anchor. */
export function resolveRubyBoundaryArrowAnchor(state: EditorState, direction: RubyBoundaryArrowDirection): number {
	const { selection } = state
	if (!selection.empty) return selection.anchor
	const pos = selection.anchor, $pos = state.doc.resolve(pos)
	if (direction === 'forward' && $pos.nodeAfter?.type.name === 'ruby') return pos + 1
	const depth = resolveRubyAncestorDepth(state, pos)
	if (direction === 'backward' && depth !== null && pos === $pos.start(depth)) return $pos.before(depth)
	return pos
}

