import type { LineRange } from "./line-ranges";
import { buildDisplayChunks } from "./sot-display-chunks";

export type CollapsedGapRange = {
	startLine: number;
	endLine: number;
	lineCount: number;
};

export type BuildCollapsedGapRangesParams = {
	lineRanges: LineRange[];
	isLineHidden: (index: number) => boolean;
};

/**
 * 折りたたみ見出し配下の hidden run を collapsed-gap 範囲として列挙する。
 * source mode 除外は呼び出し側の isLineHidden に委ね、この関数自体は純関数に保つ。
 */
export function buildCollapsedGapRanges(
	params: BuildCollapsedGapRangesParams,
): CollapsedGapRange[] {
	return buildDisplayChunks(params)
		.filter((chunk) => chunk.type === "collapsed-gap")
		.map((chunk) => ({
			startLine: chunk.startLine,
			endLine: chunk.endLine,
			lineCount: chunk.lineCount,
		}));
}

export type ResolveVisibleLineIndexAfterBudgetParams =
	BuildCollapsedGapRangesParams & {
		visibleLineBudget: number;
	};

/**
 * hidden run を viewport 消費ゼロ相当として扱い、
 * 先頭から visibleLineBudget 個目の可視行 index を返す。
 */
export function resolveVisibleLineIndexAfterBudget(
	params: ResolveVisibleLineIndexAfterBudgetParams,
): number {
	if (params.lineRanges.length === 0) return -1;

	let remaining = Math.max(1, Math.floor(params.visibleLineBudget));
	let lastVisibleLine = -1;

	for (const chunk of buildDisplayChunks(params)) {
		if (chunk.type !== "lines") continue;
		lastVisibleLine = chunk.endLine;
		if (remaining > chunk.lineCount) {
			remaining -= chunk.lineCount;
			continue;
		}
		return chunk.startLine + remaining - 1;
	}

	return lastVisibleLine;
}
