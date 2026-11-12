// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:3405-3460, 3528-3564) @ d65c4c7 (2026-10-17).
// Local changes: Keep the parser and math-widget collector; omit unrelated clear-format commands.
// Local changes: Remove redundant non-null assertions on bounds-checked indexes (lint).
import type { HiddenRange, InlineWidget } from "./types";
export function parseInlineMathSpansForLine(
	lineText: string,
): Array<{ open: number; close: number; source: string }> {
	const spans: Array<{ open: number; close: number; source: string }> =
		[];
	const isEscaped = (index: number): boolean => {
		let backslashes = 0;
		for (let i = index - 1; i >= 0; i -= 1) {
			if (lineText[i] !== "\\") break;
			backslashes += 1;
		}
		return backslashes % 2 === 1;
	};
	let inCodeFenceLen: number | null = null;
	for (let i = 0; i < lineText.length; i += 1) {
		const ch = lineText[i];
		if (ch === "`" && !isEscaped(i)) {
			let fenceLen = 1;
			while (
				i + fenceLen < lineText.length &&
				lineText[i + fenceLen] === "`"
			) {
				fenceLen += 1;
			}
			if (inCodeFenceLen === null) {
				inCodeFenceLen = fenceLen;
			} else if (inCodeFenceLen === fenceLen) {
				inCodeFenceLen = null;
			}
			i += fenceLen - 1;
			continue;
		}
		if (inCodeFenceLen !== null) continue;
		if (ch !== "$" || isEscaped(i)) continue;
		if (lineText[i + 1] === "$") continue;

		let close = -1;
		for (let j = i + 1; j < lineText.length; j += 1) {
			if (lineText[j] !== "$") continue;
			if (isEscaped(j)) continue;
			if (lineText[j + 1] === "$") continue;
			close = j;
			break;
		}
		if (close === -1) continue;

		const content = lineText.slice(i + 1, close);
		if (content.trim().length === 0) {
			i = close;
			continue;
		}
		spans.push({ open: i, close, source: content });
		i = close;
	}
	return spans;
}

export function collectInlineMathRangesForLine(
	absFrom: number,
	absTo: number,
	lineText: string,
	hidden: HiddenRange[],
): InlineWidget[] {
	// インライン数式 `$...$` は MathJax のウィジェットで表示する（編集はソース側）。
	// マッピングの安定性を優先し、`$...$` 全体を不可視にしてウィジェットを挿入する。
	const clampRel = (rel: number): number =>
		Math.max(0, Math.min(rel, lineText.length));
	const spans = parseInlineMathSpansForLine(lineText);
	const widgets: InlineWidget[] = [];
	for (const span of spans) {
		const open = clampRel(span.open);
		const close = clampRel(span.close);
		const from = absFrom + open;
		const to = absFrom + clampRel(close + 1);
		if (to <= from) continue;
		hidden.push({ from, to });
		widgets.push({
			kind: "math-inline",
			from,
			to,
			source: span.source,
		});
	}

	// 安全のためクランプ
	const clampedHidden: HiddenRange[] = [];
	for (const r of hidden) {
		const from = Math.max(absFrom, Math.min(r.from, absTo));
		const to = Math.max(absFrom, Math.min(r.to, absTo));
		if (to > from) clampedHidden.push({ from, to });
	}
	hidden.splice(0, hidden.length, ...clampedHidden);
	return widgets;
}
