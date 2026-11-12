// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: this repo's V, src/wysiwyg/sot-wysiwyg-view.ts `refreshFocusVisualState` (V:14644-14671) and `buildFocusBlockResolverState` (V:14625-14640): the same pure functions
//   (`resolveSoTFocusVisualState`, `sot-focus-visual-state.ts`, and the block resolver `sot-focus-block-resolver.ts` it calls) on the same line model. Nyoze's
//   `visualFocusBlockDecoration.ts` (@ 020b5501) is not copied (H7 (b)).
// Local changes: M3c (D-M3-18). V asks its own `sotEditor.getSelection()` and `findLineIndex`; here the selection is CodeMirror's main selection (source offsets: the new mode's
//   selection of record) and the line index is found in the display state's line ranges. The answer is turned into the model blocks the lines belong to, which
//   `PmModeDisplay.setFocusBlocks` decorates. Nothing here reads the DOM. The computation of what is focused is V's (what "the focus block" is, which kinds make a block,
//   when the visual focus is inactive: a range, no block, the plain text view); the new mode only draws it.
import { resolveSoTFocusVisualState, type SoTFocusVisualState } from "../../sot/sot-focus-visual-state";
import type { SoTFocusBlockResolverState } from "../../sot/sot-focus-block-resolver";
import type { PmModeDocumentState } from "../pm/document-state";
import type { PMNode } from "../pm/prosemirror";
import { HIDDEN_LINE_KINDS } from "../input/model-position";
import type { PmModeDisplaySettings } from "./display-settings";

/** The line (0-based) that holds a source offset (a line holds the offsets from its start to its end, the break after it included in the line it ends). */
export function findLineIndex(state: Pick<PmModeDocumentState, "lineRanges">, offset: number): number | null {
	const ranges = state.lineRanges;
	if (!Number.isFinite(offset) || ranges.length === 0) return null;
	let low = 0, high = ranges.length - 1;
	while (low <= high) {
		const middle = (low + high) >>> 1, range = ranges[middle];
		if (offset < range.from) high = middle - 1; else if (offset > range.to) low = middle + 1; else return middle;
	}
	return null;
}

/** The index of the last block that starts at or before a line. */
export function blockIndexOfLine(blockLine: readonly number[], line: number): number {
	let low = 0, high = blockLine.length - 1;
	while (low < high) { const middle = Math.ceil((low + high) / 2); if (blockLine[middle] <= line) low = middle; else high = middle - 1; }
	return low;
}

/** Whether a line node takes the focus class: a text line that is shown (a rule and a fence line draw nothing of their own, `HIDDEN_LINE_KINDS`). */
export function takesFocusClass(node: PMNode): boolean {
	return node.type.name === "line" && !HIDDEN_LINE_KINDS.has(String(node.attrs.kind));
}

export interface FocusResolution {
	readonly visual: SoTFocusVisualState;
	/** The model blocks `first..last` that make the focused block, or null when the visual focus has none to draw (inactive, or no flag that draws a block). */
	readonly blocks: { readonly first: number; readonly last: number } | null;
}

/** V's visual focus state for the display's document and a (source) selection; collapsed selections only are active. */
export function resolveFocus(state: PmModeDocumentState, selection: { readonly anchor: number; readonly head: number } | null, settings: Pick<PmModeDisplaySettings, "blockHighlight" | "currentLine" | "nonFocusDim" | "plainTextView">): FocusResolution {
	const model = state.lineModel;
	const blockResolverState: SoTFocusBlockResolverState = {
		lineBlockKinds: model.lineBlockKinds, lineCodeBlockPart: model.lineCodeBlockPart, lineMathBlockStart: model.lineMathBlockStart, lineMathBlockEnd: model.lineMathBlockEnd,
		lineCalloutBlockStart: model.lineCalloutBlockStart, lineCalloutBlockEnd: model.lineCalloutBlockEnd, lineTableBlockStart: model.lineTableBlockStart, lineTableBlockEnd: model.lineTableBlockEnd,
		lineDeflistBlockStart: model.lineDeflistBlockStart, lineDeflistBlockEnd: model.lineDeflistBlockEnd, lineHeadingSectionEnd: model.lineHeadingSectionEnd, lineHeadingHiddenBy: model.lineHeadingHiddenBy,
		lineRanges: state.lineRanges as SoTFocusBlockResolverState["lineRanges"],
	};
	const visual = resolveSoTFocusVisualState({
		sourceModeEnabled: false, plainTextViewEnabled: settings.plainTextView, ceImeMode: false,
		blockHighlightEnabled: settings.blockHighlight, currentLineHighlightEnabled: settings.currentLine, nonFocusDimEnabled: settings.nonFocusDim,
		selection: selection ? { anchor: selection.anchor, head: selection.head } : null,
		findLineIndex: offset => findLineIndex(state, offset), blockResolverState,
	});
	if (!visual.active || visual.focusLineStart === null || visual.focusLineEnd === null || !(visual.blockHighlightEnabled || visual.nonFocusDimEnabled)) return { visual, blocks: null };
	return { visual, blocks: { first: blockIndexOfLine(state.blockLine, visual.focusLineStart), last: blockIndexOfLine(state.blockLine, visual.focusLineEnd) } };
}
