// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/clipboardPolicy.ts (`mayCopyCutFromSurface`) @ 58a98a90 (2026-11-06)
// Local changes: the repo's style; `normalizePasteText` is new (the clipboard stage, D-C-4: only the text flavor is read, line breaks are `\n`). The HTML flavor and the plain-paste chord of Nyoze are not taken.

/** Independent of the DOM ownership and the PM runtime: whether a copy or a cut from the surface is the new mode's (a selection, nothing composing, no text held). */
export function mayCopyCutFromSurface(input: { focused: boolean; eligible: boolean; composing: boolean; retained: boolean; selectionEmpty: boolean }): boolean {
	return input.focused && input.eligible && !input.composing && !input.retained && !input.selectionEmpty;
}

/** D-C-4: `\r\n` and `\r` are `\n`. */
export function normalizePasteText(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}
