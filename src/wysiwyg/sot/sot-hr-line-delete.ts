/**
 * SoT 水平線（`mdKind === "hr"` 相当のソース行）の caret アンカーと削除。
 * 描画は全文 hidden のため、可視セグメント無し行として `range.to` にアンカーする。
 */

import type { LineRange } from "./line-ranges";

const HR_LINE_SOURCE_RE = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

export function isSoTHorizontalRuleLine(lineText: string): boolean {
	return HR_LINE_SOURCE_RE.test(lineText);
}

/**
 * 水平線ソース行をドキュメントから除去する [from, to) 範囲。
 * 次行があれば直後の単一 `\n` も含めて削除する。
 */
export function computeSoTHorizontalRuleLineDeletionRange(
	doc: string,
	lineRanges: readonly LineRange[],
	lineIndex: number,
): { from: number; to: number } | null {
	const range = lineRanges[lineIndex];
	if (!range) return null;
	const lineText = doc.slice(range.from, range.to);
	if (!isSoTHorizontalRuleLine(lineText)) return null;
	let to = range.to;
	if (lineIndex < lineRanges.length - 1 && doc.charCodeAt(to) === 10) {
		to += 1;
	}
	return { from: range.from, to };
}

export type SoTHrCollapsedDeleteResult = {
	deleteFrom: number;
	deleteTo: number;
	nextCaret: number;
};

/** Backspace: caret が水平線行末尾（`range.to`）のとき、行まるごと削除 */
export function trySoTHorizontalRuleCollapsedBackspace(
	doc: string,
	lineRanges: readonly LineRange[],
	lineIndex: number,
	collapsedOffset: number,
): SoTHrCollapsedDeleteResult | null {
	const range = lineRanges[lineIndex];
	if (!range) return null;
	if (collapsedOffset !== range.to) return null;
	const lineText = doc.slice(range.from, range.to);
	if (!isSoTHorizontalRuleLine(lineText)) return null;
	const del = computeSoTHorizontalRuleLineDeletionRange(
		doc,
		lineRanges,
		lineIndex,
	);
	if (!del) return null;
	return {
		deleteFrom: del.from,
		deleteTo: del.to,
		nextCaret: del.from,
	};
}

/**
 * Delete: caret が水平線行の先頭または末尾アンカーのとき、行全体（＋次行へ続く `\n`）を削除。
 */
export function trySoTHorizontalRuleCollapsedDeleteForward(
	doc: string,
	lineRanges: readonly LineRange[],
	lineIndex: number,
	collapsedOffset: number,
): SoTHrCollapsedDeleteResult | null {
	const range = lineRanges[lineIndex];
	if (!range) return null;
	if (collapsedOffset !== range.from && collapsedOffset !== range.to) {
		return null;
	}
	const lineText = doc.slice(range.from, range.to);
	if (!isSoTHorizontalRuleLine(lineText)) return null;
	const del = computeSoTHorizontalRuleLineDeletionRange(
		doc,
		lineRanges,
		lineIndex,
	);
	if (!del) return null;
	return {
		deleteFrom: del.from,
		deleteTo: del.to,
		nextCaret: del.from,
	};
}
