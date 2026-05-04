import type { LineRange } from "./line-ranges";
import type { SoTLineModelState } from "./sot-line-model";

export type SoTFocusBlockKind =
	| "paragraph"
	| "heading"
	| "callout"
	| "table"
	| "deflist"
	| "code-block"
	| "math-block"
	| "frontmatter-block";

export type SoTFocusBlockResolverState = Pick<
	SoTLineModelState,
	| "lineBlockKinds"
	| "lineCodeBlockPart"
	| "lineMathBlockStart"
	| "lineMathBlockEnd"
	| "lineCalloutBlockStart"
	| "lineCalloutBlockEnd"
	| "lineTableBlockStart"
	| "lineTableBlockEnd"
	| "lineDeflistBlockStart"
	| "lineDeflistBlockEnd"
	| "lineHeadingSectionEnd"
	| "lineHeadingHiddenBy"
> & {
	lineRanges: LineRange[];
};

export type SoTFocusBlockResolution = {
	kind: SoTFocusBlockKind;
	sourceLineKind: string;
	lineIndex: number;
	lineFrom: number;
	lineTo: number;
	blockStartLine: number;
	blockEndLine: number;
	blockFrom: number;
	blockTo: number;
};

type SoTSelectionHeadResolverParams = {
	selectionHead: number | null | undefined;
	findLineIndex: (offset: number) => number | null;
	state: SoTFocusBlockResolverState;
};

function isValidLineIndex(
	state: SoTFocusBlockResolverState,
	lineIndex: number | null | undefined,
): lineIndex is number {
	return (
		typeof lineIndex === "number" &&
		Number.isInteger(lineIndex) &&
		lineIndex >= 0 &&
		lineIndex < state.lineRanges.length &&
		lineIndex < state.lineBlockKinds.length
	);
}

function isEmptyLine(range: LineRange | undefined): boolean {
	return !range || range.to <= range.from;
}

function isFrontmatterKind(kind: string): boolean {
	return kind === "frontmatter" || kind === "frontmatter-fence";
}

function isCodeKind(kind: string): boolean {
	return kind === "code" || kind === "code-fence";
}

function isMathKind(kind: string): boolean {
	return kind === "math" || kind === "math-fence";
}

function isCalloutKind(kind: string): boolean {
	return kind === "callout" || kind === "callout-title";
}

function isTableKind(kind: string): boolean {
	return kind === "table-row" || kind === "table-sep";
}

function isHeadingLine(
	state: SoTFocusBlockResolverState,
	lineIndex: number,
): boolean {
	return state.lineHeadingSectionEnd[lineIndex] != null;
}

function isHiddenLine(
	state: SoTFocusBlockResolverState,
	lineIndex: number,
): boolean {
	return state.lineHeadingHiddenBy[lineIndex] != null;
}

function isParagraphLine(
	state: SoTFocusBlockResolverState,
	lineIndex: number,
): boolean {
	if (!isValidLineIndex(state, lineIndex)) return false;
	if (isHiddenLine(state, lineIndex)) return false;
	if (isHeadingLine(state, lineIndex)) return false;
	if ((state.lineBlockKinds[lineIndex] ?? "normal") !== "normal") return false;
	return !isEmptyLine(state.lineRanges[lineIndex]);
}

function buildResolution(
	state: SoTFocusBlockResolverState,
	lineIndex: number,
	kind: SoTFocusBlockKind,
	blockStartLine: number,
	blockEndLine: number,
): SoTFocusBlockResolution | null {
	if (!isValidLineIndex(state, lineIndex)) return null;
	if (!isValidLineIndex(state, blockStartLine)) return null;
	if (!isValidLineIndex(state, blockEndLine)) return null;
	if (blockEndLine < blockStartLine) return null;
	const lineRange = state.lineRanges[lineIndex];
	const blockStartRange = state.lineRanges[blockStartLine];
	const blockEndRange = state.lineRanges[blockEndLine];
	if (!lineRange || !blockStartRange || !blockEndRange) return null;
	return {
		kind,
		sourceLineKind: state.lineBlockKinds[lineIndex] ?? "normal",
		lineIndex,
		lineFrom: lineRange.from,
		lineTo: lineRange.to,
		blockStartLine,
		blockEndLine,
		blockFrom: blockStartRange.from,
		blockTo: blockEndRange.to,
	};
}

function resolveContiguousCodeBlockRange(
	state: SoTFocusBlockResolverState,
	lineIndex: number,
): { start: number; end: number } {
	let start = lineIndex;
	while (start > 0) {
		const prevKind = state.lineBlockKinds[start - 1] ?? "normal";
		if (!isCodeKind(prevKind)) break;
		start -= 1;
	}
	let end = lineIndex;
	while (end + 1 < state.lineBlockKinds.length) {
		const nextKind = state.lineBlockKinds[end + 1] ?? "normal";
		if (!isCodeKind(nextKind)) break;
		end += 1;
	}
	return { start, end };
}

function resolveContiguousFrontmatterRange(
	state: SoTFocusBlockResolverState,
	lineIndex: number,
): { start: number; end: number } {
	let start = lineIndex;
	while (start > 0) {
		const prevKind = state.lineBlockKinds[start - 1] ?? "normal";
		if (!isFrontmatterKind(prevKind)) break;
		start -= 1;
	}
	let end = lineIndex;
	while (end + 1 < state.lineBlockKinds.length) {
		const nextKind = state.lineBlockKinds[end + 1] ?? "normal";
		if (!isFrontmatterKind(nextKind)) break;
		end += 1;
	}
	return { start, end };
}

function resolveParagraphRange(
	state: SoTFocusBlockResolverState,
	lineIndex: number,
): { start: number; end: number } | null {
	if (!isValidLineIndex(state, lineIndex)) return null;
	if (isHiddenLine(state, lineIndex)) return null;
	if (isHeadingLine(state, lineIndex)) return { start: lineIndex, end: lineIndex };
	const lineKind = state.lineBlockKinds[lineIndex] ?? "normal";
	if (lineKind !== "normal") return null;
	if (isEmptyLine(state.lineRanges[lineIndex])) {
		return { start: lineIndex, end: lineIndex };
	}

	let start = lineIndex;
	while (start > 0 && isParagraphLine(state, start - 1)) {
		start -= 1;
	}
	let end = lineIndex;
	while (
		end + 1 < state.lineRanges.length &&
		isParagraphLine(state, end + 1)
	) {
		end += 1;
	}
	return { start, end };
}

export function resolveSoTFocusBlockForLineIndex(
	state: SoTFocusBlockResolverState,
	lineIndex: number | null | undefined,
): SoTFocusBlockResolution | null {
	if (!isValidLineIndex(state, lineIndex)) return null;
	if (isHiddenLine(state, lineIndex)) return null;

	const sourceLineKind = state.lineBlockKinds[lineIndex] ?? "normal";
	if (isHeadingLine(state, lineIndex)) {
		return buildResolution(state, lineIndex, "heading", lineIndex, lineIndex);
	}
	if (isCalloutKind(sourceLineKind)) {
		const start = state.lineCalloutBlockStart[lineIndex];
		const end = state.lineCalloutBlockEnd[lineIndex];
		if (start != null && end != null) {
			return buildResolution(state, lineIndex, "callout", start, end);
		}
	}
	if (isTableKind(sourceLineKind)) {
		const start = state.lineTableBlockStart[lineIndex];
		const end = state.lineTableBlockEnd[lineIndex];
		if (start != null && end != null) {
			return buildResolution(state, lineIndex, "table", start, end);
		}
	}
	if (sourceLineKind === "deflist") {
		const start = state.lineDeflistBlockStart[lineIndex];
		const end = state.lineDeflistBlockEnd[lineIndex];
		if (start != null && end != null) {
			return buildResolution(state, lineIndex, "deflist", start, end);
		}
	}
	if (isMathKind(sourceLineKind)) {
		const start = state.lineMathBlockStart[lineIndex];
		const end = state.lineMathBlockEnd[lineIndex];
		if (start != null && end != null) {
			return buildResolution(state, lineIndex, "math-block", start, end);
		}
	}
	if (isCodeKind(sourceLineKind)) {
		const range = resolveContiguousCodeBlockRange(state, lineIndex);
		return buildResolution(
			state,
			lineIndex,
			"code-block",
			range.start,
			range.end,
		);
	}
	if (isFrontmatterKind(sourceLineKind)) {
		const range = resolveContiguousFrontmatterRange(state, lineIndex);
		return buildResolution(
			state,
			lineIndex,
			"frontmatter-block",
			range.start,
			range.end,
		);
	}
	const range = resolveParagraphRange(state, lineIndex);
	if (!range) return null;
	return buildResolution(
		state,
		lineIndex,
		"paragraph",
		range.start,
		range.end,
	);
}

export function resolveSoTFocusBlockAtSelectionHead(
	params: SoTSelectionHeadResolverParams,
): SoTFocusBlockResolution | null {
	const { selectionHead, findLineIndex, state } = params;
	if (typeof selectionHead !== "number" || !Number.isFinite(selectionHead)) {
		return null;
	}
	const lineIndex = findLineIndex(selectionHead);
	return resolveSoTFocusBlockForLineIndex(state, lineIndex);
}
