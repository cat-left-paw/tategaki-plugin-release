// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/emptySurfaceCaret.ts @ 020b5501 (2026-10-22)
// Local changes: the repo's style only.

/** Range boundaries are DOM data; `Selection.isCollapsed` resolves the visual selection and may lay out the text. */
export function hasCanonicalEmptySurfaceCaret(element: HTMLElement, selection: Selection | null): boolean {
	if (selection?.rangeCount !== 1) return false;
	const range = selection.getRangeAt(0);
	return range.collapsed && range.startContainer === element && range.startOffset === 0;
}
