// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/allSelectionProjection.ts @ 020b5501 (2026-10-22)
// Local changes: only shown line nodes; frontmatter/parts/hidden lines are not text endpoints.
import { TextSelection, type PMNode } from "../../pm/prosemirror";
import { HIDDEN_LINE_KINDS } from "../../input/model-position";

export function projectAllSelectionToText(doc: PMNode) {
	let first: number | null = null, last: number | null = null;
	doc.descendants((node, pos) => {
		if (node.type.name !== "line") return !node.isAtom;
		if (!HIDDEN_LINE_KINDS.has(String(node.attrs.kind))) { first ??= pos + 1; last = pos + node.nodeSize - 1; }
		return false;
	});
	return first === null || last === null ? null : TextSelection.create(doc, first, last);
}
