import type { LineRange } from "./line-ranges";
import { parseListLine } from "./sot-line-parse";

export type SoTListOutlinerHost = {
	getDoc: () => string | null;
	getSelection: () => { anchor: number; head: number } | null;
	getLineRanges: () => LineRange[];
	getLineBlockKinds: () => string[];
	replaceRange: (from: number, to: number, insert: string) => void;
	updatePendingText: (text: string, force?: boolean) => void;
	setSelectionNormalized: (anchor: number, head: number) => void;
	setSelectionRaw?: (anchor: number, head: number) => void;
	focusInputSurface: (preventScroll?: boolean) => void;
	getWritingMode: () => string;
	markImmediateRender?: () => void;
};

type ListOutlinerAction = "indent" | "outdent" | "move-up" | "move-down";

const arrowKeys = new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
]);

export function handleListOutlinerKeydown(
	host: SoTListOutlinerHost,
	event: KeyboardEvent,
): boolean {
	const action = resolveAction(host, event);
	if (!action) return false;
	const applied = runListOutlinerAction(host, action);
	return action === "indent" || action === "outdent" ? true : applied;
}

function resolveAction(
	host: SoTListOutlinerHost,
	event: KeyboardEvent,
): ListOutlinerAction | null {
	const isMod = event.metaKey || event.ctrlKey;
	if (!isMod && !event.altKey && event.key === "Tab") {
		return event.shiftKey ? "outdent" : "indent";
	}
	if (!isMod || event.shiftKey || event.altKey) return null;
	if (!arrowKeys.has(event.key)) return null;

	const writingMode = host.getWritingMode();
	const isVertical = writingMode === "vertical-rl";
	if (isVertical) {
		if (event.key === "ArrowRight") return "move-up";
		if (event.key === "ArrowLeft") return "move-down";
		return null;
	}
	if (event.key === "ArrowUp") return "move-up";
	if (event.key === "ArrowDown") return "move-down";
	return null;
}

function runListOutlinerAction(
	host: SoTListOutlinerHost,
	action: ListOutlinerAction,
): boolean {
	if (action === "indent" || action === "outdent") {
		return applyIndentOutdent(host, action);
	}
	return applyMove(host, action);
}

function applyIndentOutdent(
	host: SoTListOutlinerHost,
	action: "indent" | "outdent",
): boolean {
	const doc = host.getDoc();
	const selection = host.getSelection();
	if (!doc || !selection) return false;

	const lines = doc.split("\n");
	const ranges = ensureLineRanges(lines, host.getLineRanges());
	const lineBlockKinds = host.getLineBlockKinds();
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	const startLine = findLineIndexFromRanges(from, ranges);
	let endLine = findLineIndexFromRanges(to, ranges);
	if (startLine === null || endLine === null) return false;
	const endRange = ranges[endLine];
	if (endRange && to === endRange.from && to > from) {
		endLine = Math.max(startLine, endLine - 1);
	}

	const stableSelection = (() => {
		if (selection.anchor !== selection.head) return null;
		const lineIndex = findLineIndexFromRanges(selection.head, ranges);
		if (lineIndex === null) return null;
		const range = ranges[lineIndex];
		if (!range) return null;
		return {
			lineIndex,
			offset: selection.head - range.from,
		};
	})();

	const candidates: number[] = [];
	for (let i = startLine; i <= endLine; i += 1) {
		if (!isNormalLine(lineBlockKinds, i)) continue;
		const info = parseListLine(lines[i] ?? "");
		if (info.kind === "none") continue;
		candidates.push(i);
	}
	if (candidates.length === 0) return false;

	const blocks: ListBlock[] = [];
	let lastEnd = -1;
	for (const index of candidates) {
		if (index <= lastEnd) continue;
		const block = getListItemBlock(lines, lineBlockKinds, index);
		if (!block) continue;
		blocks.push(block);
		lastEnd = block.end;
	}
	if (blocks.length === 0) return false;

	const changes: Array<{ from: number; to: number; insert: string }> = [];
	for (const block of blocks) {
		const unit = getIndentUnit(block.rootKind);
		const rootIndentNormalized = normalizeIndentColumns(
			block.rootIndentColumns,
		);
		const rootLevel = toIndentLevel(rootIndentNormalized);
		let targetLevel = rootLevel;
		if (action === "indent") {
			const prevLevel = findPreviousListItemLevel(
				lines,
				lineBlockKinds,
				block.start,
				block.rootPrefix,
				unit,
			);
			if (prevLevel === null) {
				continue;
			}
			targetLevel = Math.min(rootLevel + 1, prevLevel + 1);
		} else {
			targetLevel = Math.max(0, rootLevel - 1);
		}
		if (targetLevel === rootLevel && action === "indent") {
			continue;
		}
		const deltaLevels = targetLevel - rootLevel;
		const shouldRemoveMarker =
			action === "outdent" && rootLevel === 0;
		for (let i = block.start; i <= block.end; i += 1) {
			if (!isNormalLine(lineBlockKinds, i)) continue;
			const lineText = lines[i] ?? "";
			const info = parseListLine(lineText);
			const prefix = info.prefix;
			const indent = info.indent;
			const indentColumns = countIndentColumns(indent);
			const normalizedColumns = normalizeIndentColumns(indentColumns);
			const lineLevel = toIndentLevel(normalizedColumns);
			const nextLevel = Math.max(0, lineLevel + deltaLevels);
			const nextIndent = " ".repeat(nextLevel * unit);
			let nextText: string;
			if (shouldRemoveMarker && i === block.start) {
				const afterIndent = lineText.slice(
					prefix.length + indent.length,
				);
				nextText = `${prefix}${nextIndent}${stripListMarker(
					afterIndent,
					block.rootKind,
				)}`;
			} else {
				const afterIndent = lineText.slice(
					prefix.length + indent.length,
				);
				nextText = `${prefix}${nextIndent}${afterIndent}`;
			}
			if (nextText !== lineText) {
				const range = ranges[i];
				if (!range) continue;
				changes.push({
					from: range.from,
					to: range.to,
					insert: nextText,
				});
			}
		}
	}

	if (changes.length === 0) return false;
	applyChangesWithSelection(host, changes, selection, stableSelection);

	// 番号付きリストのリナンバリング:
	// インデント/アウトデント後に、影響範囲周辺の番号付きリストの番号を
	// 各インデントレベルごとに振り直す
	renumberOrderedListsAround(host, lineBlockKinds, blocks);

	return true;
}

function applyMove(
	host: SoTListOutlinerHost,
	action: "move-up" | "move-down",
): boolean {
	const doc = host.getDoc();
	const selection = host.getSelection();
	if (!doc || !selection) return false;

	const lines = doc.split("\n");
	const ranges = ensureLineRanges(lines, host.getLineRanges());
	const lineBlockKinds = host.getLineBlockKinds();
	const headLine = findLineIndexFromRanges(selection.head, ranges);
	if (headLine === null) return false;
	if (!isNormalLine(lineBlockKinds, headLine)) return false;
	const rootInfo = parseListLine(lines[headLine] ?? "");
	if (rootInfo.kind === "none") return false;

	const block = getListItemBlock(lines, lineBlockKinds, headLine);
	if (!block) return false;
	const baseIndent = block.rootIndentColumns;
	const basePrefix = block.rootPrefix;

	if (action === "move-up") {
		const prevStart = findPreviousSiblingStart(
			lines,
			lineBlockKinds,
			block.start,
			baseIndent,
			basePrefix,
		);
		if (prevStart === null) return false;
		const prevBlock = getListItemBlock(lines, lineBlockKinds, prevStart);
		if (!prevBlock) return false;
		return swapBlocks(
			host,
			lines,
			ranges,
			selection,
			prevBlock,
			block,
			true,
		);
	}

	const nextStart = findNextSiblingStart(
		lines,
		lineBlockKinds,
		block.end,
		baseIndent,
		basePrefix,
	);
	if (nextStart === null) return false;
	const nextBlock = getListItemBlock(lines, lineBlockKinds, nextStart);
	if (!nextBlock) return false;
	return swapBlocks(host, lines, ranges, selection, block, nextBlock, false);
}

type ListBlock = {
	start: number;
	end: number;
	rootKind: "bullet" | "ordered" | "task";
	rootIndentColumns: number;
	rootPrefix: string;
};

function getListItemBlock(
	lines: string[],
	lineBlockKinds: string[],
	startIndex: number,
): ListBlock | null {
	const lineText = lines[startIndex] ?? "";
	const rootInfo = parseListLine(lineText);
	if (rootInfo.kind === "none") return null;
	const rootIndentColumns = countIndentColumns(rootInfo.indent);
	const rootPrefix = rootInfo.prefix;
	let end = startIndex;
	for (let i = startIndex + 1; i < lines.length; i += 1) {
		if (!isNormalLine(lineBlockKinds, i)) break;
		const text = lines[i] ?? "";
		const info = parseListLine(text);
		if (info.prefix !== rootPrefix) break;
		const indentColumns = countIndentColumns(info.indent);
		const isBlank = text.trim().length === 0;
		if (info.kind !== "none") {
			if (indentColumns <= rootIndentColumns) break;
			end = i;
			continue;
		}
		if (isBlank) {
			if (indentColumns > rootIndentColumns) {
				end = i;
				continue;
			}
			break;
		}
		if (indentColumns <= rootIndentColumns) break;
		end = i;
	}
	return {
		start: startIndex,
		end,
		rootKind: rootInfo.kind,
		rootIndentColumns,
		rootPrefix,
	};
}

function findPreviousSiblingStart(
	lines: string[],
	lineBlockKinds: string[],
	startIndex: number,
	baseIndent: number,
	basePrefix: string,
): number | null {
	for (let i = startIndex - 1; i >= 0; i -= 1) {
		if (!isNormalLine(lineBlockKinds, i)) return null;
		const text = lines[i] ?? "";
		const info = parseListLine(text);
		if (info.prefix !== basePrefix) return null;
		const indentColumns = countIndentColumns(info.indent);
		const isBlank = text.trim().length === 0;
		if (isBlank) continue;
		if (info.kind !== "none") {
			if (indentColumns < baseIndent) return null;
			if (indentColumns === baseIndent) return i;
			continue;
		}
		if (indentColumns <= baseIndent) return null;
	}
	return null;
}

function findNextSiblingStart(
	lines: string[],
	lineBlockKinds: string[],
	startIndex: number,
	baseIndent: number,
	basePrefix: string,
): number | null {
	for (let i = startIndex + 1; i < lines.length; i += 1) {
		if (!isNormalLine(lineBlockKinds, i)) return null;
		const text = lines[i] ?? "";
		const info = parseListLine(text);
		if (info.prefix !== basePrefix) return null;
		const indentColumns = countIndentColumns(info.indent);
		const isBlank = text.trim().length === 0;
		if (isBlank) continue;
		if (info.kind !== "none") {
			if (indentColumns < baseIndent) return null;
			if (indentColumns === baseIndent) return i;
			continue;
		}
		if (indentColumns <= baseIndent) return null;
	}
	return null;
}

function swapBlocks(
	host: SoTListOutlinerHost,
	lines: string[],
	ranges: LineRange[],
	selection: { anchor: number; head: number },
	first: ListBlock,
	second: ListBlock,
	movedIsSecond: boolean,
): boolean {
	const swapStart = ranges[first.start];
	const swapEnd = ranges[second.end];
	if (!swapStart || !swapEnd) return false;

	const firstLines = lines.slice(first.start, first.end + 1);
	const secondLines = lines.slice(second.start, second.end + 1);
	const middleLines = lines.slice(first.end + 1, second.start);

	const replacementLines = [
		...secondLines,
		...middleLines,
		...firstLines,
	];
	const replacementText = replacementLines.join("\n");

	host.updatePendingText("", true);
	host.markImmediateRender?.();
	host.replaceRange(swapStart.from, swapEnd.to, replacementText);

	const firstOffset = ranges[first.start]?.from ?? swapStart.from;
	const secondPrefixLength = (() => {
		const prefixLines = [...secondLines, ...middleLines];
		if (prefixLines.length === 0) return 0;
		return prefixLines.join("\n").length + 1;
	})();
	const newBlockStart = movedIsSecond
		? firstOffset
		: firstOffset + secondPrefixLength;

	const movedBlock = movedIsSecond ? second : first;
	const blockStart = ranges[movedBlock.start]?.from ?? swapStart.from;
	const blockEnd = ranges[movedBlock.end]?.to ?? swapEnd.to;

	const adjust = (pos: number): number => {
		if (pos < blockStart || pos > blockEnd) return pos;
		return newBlockStart + (pos - blockStart);
	};

	const nextAnchor = adjust(selection.anchor);
	const nextHead = adjust(selection.head);
	const setSelection =
		host.setSelectionRaw ?? host.setSelectionNormalized;
	setSelection(nextAnchor, nextHead);
	host.focusInputSurface(true);
	return true;
}

function applyChangesWithSelection(
	host: SoTListOutlinerHost,
	changes: Array<{ from: number; to: number; insert: string }>,
	selection: { anchor: number; head: number },
	stableSelection?: { lineIndex: number; offset: number } | null,
): void {
	if (changes.length === 0) return;
	host.updatePendingText("", true);
	host.markImmediateRender?.();

	// 複数の変更を1回の replaceRange にまとめる。
	// 個別に replaceRange を呼ぶと、各呼び出しで CodeMirror の dispatch が
	// 発火し、immediateRender が最初の dispatch で消費されるため、
	// 2回目以降の変更が遅延レンダリングになってしまう。
	const sorted = changes.slice().sort((a, b) => a.from - b.from);
	const doc = host.getDoc() ?? "";
	const mergedFrom = sorted[0]!.from;
	const mergedTo = sorted[sorted.length - 1]!.to;

	// 変更間の未変更テキストを含めて、置換テキストを構築する
	const parts: string[] = [];
	let cursor = mergedFrom;
	for (const change of sorted) {
		if (change.from > cursor) {
			parts.push(doc.slice(cursor, change.from));
		}
		parts.push(change.insert);
		cursor = change.to;
	}
	const mergedInsert = parts.join("");

	host.replaceRange(mergedFrom, mergedTo, mergedInsert);

	// 選択位置を調整
	let nextAnchor = selection.anchor;
	let nextHead = selection.head;
	// 後ろから順に各変更のオフセット差分を適用
	const reverseSorted = sorted.slice().reverse();
	for (const change of reverseSorted) {
		const delta = change.insert.length - (change.to - change.from);
		const adjust = (pos: number): number => {
			if (pos > change.to) return pos + delta;
			if (pos < change.from) return pos;
			const shifted = pos + delta;
			const min = change.from;
			const max = change.from + change.insert.length;
			return Math.max(min, Math.min(shifted, max));
		};
		nextAnchor = adjust(nextAnchor);
		nextHead = adjust(nextHead);
	}
	const setSelection =
		host.setSelectionRaw ?? host.setSelectionNormalized;
	setSelection(nextAnchor, nextHead);
	if (stableSelection) {
		const newDoc = host.getDoc();
		if (newDoc) {
			const lines = newDoc.split("\n");
			if (
				stableSelection.lineIndex >= 0 &&
				stableSelection.lineIndex < lines.length
			) {
				const ranges = computeLineRangesFromLines(lines);
				const range = ranges[stableSelection.lineIndex];
				if (range) {
					const offset = Math.max(
						range.from,
						Math.min(
							range.to,
							range.from + stableSelection.offset,
						),
					);
					setSelection(offset, offset);
				}
			}
		}
	}
	host.focusInputSurface(true);
}

function stripListMarker(
	text: string,
	kind: "bullet" | "ordered" | "task",
): string {
	if (kind === "task") {
		return text.replace(/^[-+*][ \t]+\[[ xX]\][ \t]+/, "");
	}
	if (kind === "ordered") {
		return text.replace(/^\d{1,9}[.)][ \t]+/, "");
	}
	return text.replace(/^[-+*][ \t]+/, "");
}

function countIndentColumns(indent: string): number {
	let columns = 0;
	for (const ch of indent) {
		if (ch === "\t") {
			columns += 4;
		} else {
			columns += 1;
		}
	}
	return columns;
}

function getIndentUnit(kind: "bullet" | "ordered" | "task"): number {
	void kind;
	return 4;
}

function normalizeIndentColumns(columns: number): number {
	if (!Number.isFinite(columns) || columns <= 0) return 0;
	const unit = getIndentUnit("bullet");
	return Math.floor(columns / unit) * unit;
}

function toIndentLevel(columns: number): number {
	const unit = getIndentUnit("bullet");
	return Math.max(0, Math.floor(columns / unit));
}

function findPreviousListItemLevel(
	lines: string[],
	lineBlockKinds: string[],
	startIndex: number,
	prefix: string,
	unit: number,
): number | null {
	for (let i = startIndex - 1; i >= 0; i -= 1) {
		if (!isNormalLine(lineBlockKinds, i)) return null;
		const text = lines[i] ?? "";
		const info = parseListLine(text);
		if (info.kind === "none") return null;
		if (info.prefix !== prefix) return null;
		const indentColumns = countIndentColumns(info.indent);
		return Math.max(0, Math.floor(indentColumns / unit));
	}
	return null;
}

function isNormalLine(lineBlockKinds: string[], index: number): boolean {
	const kind = lineBlockKinds[index];
	if (!kind) return true;
	return kind === "normal";
}

function ensureLineRanges(
	lines: string[],
	cached: LineRange[],
): LineRange[] {
	void cached;
	return computeLineRangesFromLines(lines);
}

function computeLineRangesFromLines(lines: string[]): LineRange[] {
	const ranges: LineRange[] = [];
	let offset = 0;
	for (const line of lines) {
		const from = offset;
		const to = offset + line.length;
		ranges.push({ from, to });
		offset = to + 1;
	}
	return ranges;
}

function findLineIndexFromRanges(
	offset: number,
	ranges: LineRange[],
): number | null {
	if (!Number.isFinite(offset)) return null;
	if (offset < 0) return null;
	for (let i = 0; i < ranges.length; i += 1) {
		const range = ranges[i];
		if (!range) continue;
		if (offset <= range.to) return i;
	}
	return ranges.length > 0 ? ranges.length - 1 : null;
}

/**
 * インデント/アウトデント後に番号付きリストの番号を振り直す。
 * 影響を受けたブロック周辺で、同じインデントレベルの連続した番号付きリスト
 * を検索し、1から順に番号を更新する。
 */
function renumberOrderedListsAround(
	host: SoTListOutlinerHost,
	lineBlockKinds: string[],
	blocks: ListBlock[],
): void {
	const doc = host.getDoc();
	if (!doc) return;
	const lines = doc.split("\n");
	const ranges = computeLineRangesFromLines(lines);

	// 影響範囲を特定（ブロック全体の前後を含む）
	let regionStart = lines.length;
	let regionEnd = -1;
	for (const block of blocks) {
		regionStart = Math.min(regionStart, block.start);
		regionEnd = Math.max(regionEnd, block.end);
	}
	if (regionStart > regionEnd) return;

	// 影響範囲を含む連続リスト領域まで拡張する
	while (regionStart > 0) {
		const prev = regionStart - 1;
		if (!isNormalLine(lineBlockKinds, prev)) break;
		const info = parseListLine(lines[prev] ?? "");
		if (info.kind === "none") break;
		regionStart = prev;
	}
	while (regionEnd < lines.length - 1) {
		const next = regionEnd + 1;
		if (!isNormalLine(lineBlockKinds, next)) break;
		const info = parseListLine(lines[next] ?? "");
		if (info.kind === "none") break;
		regionEnd = next;
	}

	// 領域内の各インデントレベルの番号付きリストを振り直す
	const changes: Array<{ from: number; to: number; insert: string }> = [];
	const counters = new Map<number, number>(); // indentColumns → currentNumber

	for (let i = regionStart; i <= regionEnd; i += 1) {
		if (!isNormalLine(lineBlockKinds, i)) continue;
		const lineText = lines[i] ?? "";
		const info = parseListLine(lineText);
		if (info.kind !== "ordered") {
			// 非番号付きリストや空行ではカウンターをリセットしない
			// （同一レベルの番号付きリストは非番号リストを挟んでも連番にならない）
			continue;
		}
		const indentColumns = countIndentColumns(info.indent);

		// このレベルより深いカウンターをリセット
		for (const [level] of counters) {
			if (level > indentColumns) {
				counters.delete(level);
			}
		}

		const current = (counters.get(indentColumns) ?? 0) + 1;
		counters.set(indentColumns, current);

		// 既存の番号と一致するか確認
		const afterPrefix = lineText.slice(info.prefix.length);
		const numMatch = afterPrefix.match(
			/^([ \t]*)(\d{1,9})([.)])([ \t]+.*)$/,
		);
		if (!numMatch) continue;
		const existingNum = Number.parseInt(numMatch[2] ?? "1", 10);
		if (existingNum === current) continue;

		// 番号を更新
		const newLine = `${info.prefix}${numMatch[1]}${current}${numMatch[3]}${numMatch[4]}`;
		const range = ranges[i];
		if (!range) continue;
		changes.push({ from: range.from, to: range.to, insert: newLine });
	}

	if (changes.length === 0) return;

	// 選択位置を保持したまま番号を更新
	const selection = host.getSelection();
	if (!selection) return;
	applyChangesWithSelection(host, changes, selection, null);
}
