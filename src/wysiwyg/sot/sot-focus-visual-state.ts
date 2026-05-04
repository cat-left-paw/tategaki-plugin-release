import {
	resolveSoTFocusBlockAtSelectionHead,
	type SoTFocusBlockResolution,
	type SoTFocusBlockResolverState,
} from "./sot-focus-block-resolver";

export type SoTFocusVisualSelection = {
	anchor: number;
	head: number;
};

export type SoTFocusVisualInactiveReason =
	| "visual-focus-disabled"
	| "source-mode"
	| "plain-text-view"
	| "ce-ime"
	| "selection-range"
	| "missing-selection"
	| "missing-block";

export type SoTFocusVisualState = {
	active: boolean;
	reason: SoTFocusVisualInactiveReason | null;
	block: SoTFocusBlockResolution | null;
	focusLineStart: number | null;
	focusLineEnd: number | null;
	currentLineIndex: number | null;
	blockHighlightEnabled: boolean;
	currentLineHighlightEnabled: boolean;
	nonFocusDimEnabled: boolean;
};

export type ResolveSoTFocusVisualStateParams = {
	sourceModeEnabled: boolean;
	plainTextViewEnabled: boolean;
	ceImeMode: boolean;
	suppressCurrentLineHighlight?: boolean;
	blockHighlightEnabled?: boolean;
	currentLineHighlightEnabled?: boolean;
	nonFocusDimEnabled?: boolean;
	selection: SoTFocusVisualSelection | null;
	findLineIndex: (offset: number) => number | null;
	blockResolverState: SoTFocusBlockResolverState;
};

export function createInactiveSoTFocusVisualState(
	reason: SoTFocusVisualInactiveReason,
): SoTFocusVisualState {
	return {
		active: false,
		reason,
		block: null,
		focusLineStart: null,
		focusLineEnd: null,
		currentLineIndex: null,
		blockHighlightEnabled: false,
		currentLineHighlightEnabled: false,
		nonFocusDimEnabled: false,
	};
}

export function resolveSoTFocusVisualState(
	params: ResolveSoTFocusVisualStateParams,
): SoTFocusVisualState {
	const blockHighlightEnabled = params.blockHighlightEnabled !== false;
	const currentLineHighlightEnabled =
		params.currentLineHighlightEnabled !== false;
	const nonFocusDimEnabled = params.nonFocusDimEnabled !== false;
	if (
		!blockHighlightEnabled &&
		!currentLineHighlightEnabled &&
		!nonFocusDimEnabled
	) {
		return createInactiveSoTFocusVisualState("visual-focus-disabled");
	}
	if (params.sourceModeEnabled) {
		return createInactiveSoTFocusVisualState("source-mode");
	}
	if (params.plainTextViewEnabled) {
		return createInactiveSoTFocusVisualState("plain-text-view");
	}
	if (params.ceImeMode) {
		return createInactiveSoTFocusVisualState("ce-ime");
	}
	if (!params.selection) {
		return createInactiveSoTFocusVisualState("missing-selection");
	}
	if (params.selection.anchor !== params.selection.head) {
		return createInactiveSoTFocusVisualState("selection-range");
	}

	const block = resolveSoTFocusBlockAtSelectionHead({
		selectionHead: params.selection.head,
		findLineIndex: params.findLineIndex,
		state: params.blockResolverState,
	});
	if (!block) {
		return createInactiveSoTFocusVisualState("missing-block");
	}

	const focusLineStart =
		block.kind === "paragraph" ? block.lineIndex : block.blockStartLine;
	const focusLineEnd =
		block.kind === "paragraph" ? block.lineIndex : block.blockEndLine;
	const currentLineIndex =
		!currentLineHighlightEnabled || params.suppressCurrentLineHighlight
		? null
		: block.lineIndex;

	return {
		active: true,
		reason: null,
		block,
		focusLineStart,
		focusLineEnd,
		currentLineIndex,
		blockHighlightEnabled,
		currentLineHighlightEnabled,
		nonFocusDimEnabled,
	};
}

export function isSoTFocusVisualLineInBlock(
	state: SoTFocusVisualState,
	lineIndex: number | null | undefined,
): boolean {
	if (!state.active) return false;
	if (typeof lineIndex !== "number" || !Number.isInteger(lineIndex)) return false;
	if (state.focusLineStart === null || state.focusLineEnd === null) return false;
	return lineIndex >= state.focusLineStart && lineIndex <= state.focusLineEnd;
}

export function isSoTFocusVisualCurrentLine(
	state: SoTFocusVisualState,
	lineIndex: number | null | undefined,
): boolean {
	if (!state.active) return false;
	if (typeof lineIndex !== "number" || !Number.isInteger(lineIndex)) return false;
	return state.currentLineIndex === lineIndex;
}
