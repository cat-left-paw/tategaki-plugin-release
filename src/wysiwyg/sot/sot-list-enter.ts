import { computeLineRanges, type LineRange } from "./line-ranges";
import { parseListLine } from "./sot-line-parse";

export const SOT_MARKDOWN_HARD_BREAK = "  \n";

export type SoTListContinuationMode = "enter" | "hard-break";

export type SoTListContinuationEdit = {
	from: number;
	to: number;
	insert: string;
	nextCaret: number;
	renumberStartLine: number;
	renumberEndLine: number;
};

export type SoTTextChange = {
	from: number;
	to: number;
	insert: string;
};

type ParsedListContinuation = {
	prefix: string;
	markerToken: string;
	nextMarkerToken: string;
	content: string;
};

export function resolveSoTListContinuationEdit(params: {
	doc: string;
	lineRanges?: LineRange[];
	lineBlockKinds?: string[];
	selection: { anchor: number; head: number };
	mode: SoTListContinuationMode;
}): SoTListContinuationEdit | null {
	const { doc, selection, mode } = params;
	const lineRanges = params.lineRanges ?? computeLineRanges(doc);
	const lines = doc.split("\n");
	const lineBlockKinds =
		params.lineBlockKinds &&
		params.lineBlockKinds.length === lines.length
			? params.lineBlockKinds
			: [];
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	const startLine = findLineIndexFromRanges(from, lineRanges);
	let endLine = findLineIndexFromRanges(to, lineRanges);
	if (startLine === null || endLine === null) return null;
	const endRange = lineRanges[endLine];
	if (endRange && to === endRange.from && to > from) {
		endLine = Math.max(startLine, endLine - 1);
	}
	if (startLine !== endLine) return null;
	if (!isNormalLine(lineBlockKinds, startLine)) return null;
	const lineRange = lineRanges[startLine];
	if (!lineRange) return null;
	const lineText = doc.slice(lineRange.from, lineRange.to);
	const parsedContext = resolveListContinuationContext(
		lines,
		lineBlockKinds,
		startLine,
		lineText,
	);
	if (!parsedContext) return null;
	const { parsed, ownerLine } = parsedContext;

	if (mode === "hard-break") {
		const continuationPrefix =
			parsed.prefix + " ".repeat(parsed.markerToken.length);
		const insert = `${SOT_MARKDOWN_HARD_BREAK}${continuationPrefix}`;
		return {
			from,
			to,
			insert,
			nextCaret: from + insert.length,
			renumberStartLine: startLine,
			renumberEndLine: startLine + 1,
		};
	}

	if (ownerLine !== startLine) {
		const insert = `\n${parsed.prefix}${parsed.nextMarkerToken}`;
		return {
			from,
			to,
			insert,
			nextCaret: from + insert.length,
			renumberStartLine: ownerLine,
			renumberEndLine: startLine + 1,
		};
	}

	const contentStart = lineText.length - parsed.content.length;
	const localFrom = Math.max(0, from - lineRange.from);
	const localTo = Math.max(0, to - lineRange.from);
	const contentFrom = Math.max(
		0,
		Math.min(parsed.content.length, localFrom - contentStart),
	);
	const contentTo = Math.max(
		contentFrom,
		Math.min(parsed.content.length, localTo - contentStart),
	);
	const remainingContent =
		parsed.content.slice(0, contentFrom) + parsed.content.slice(contentTo);

	if (remainingContent.trim().length === 0) {
		const insert = parsed.prefix;
		return {
			from: lineRange.from,
			to: lineRange.to,
			insert,
			nextCaret: lineRange.from + insert.length,
			renumberStartLine: Math.max(0, startLine - 1),
			renumberEndLine: startLine,
		};
	}

	const insert = `\n${parsed.prefix}${parsed.nextMarkerToken}`;
	return {
		from,
		to,
		insert,
		nextCaret: from + insert.length,
		renumberStartLine: startLine,
		renumberEndLine: startLine + 1,
	};
}

export function collectOrderedListRenumberChanges(params: {
	doc: string;
	lineBlockKinds?: string[];
	startLine: number;
	endLine: number;
	lineRanges?: LineRange[];
}): SoTTextChange[] {
	const { doc } = params;
	const lines = doc.split("\n");
	const ranges = params.lineRanges ?? computeLineRanges(doc);
	const lineBlockKinds =
		params.lineBlockKinds &&
		params.lineBlockKinds.length === lines.length
			? params.lineBlockKinds
			: [];
	let regionStart = Math.max(0, Math.min(params.startLine, params.endLine));
	let regionEnd = Math.min(
		lines.length - 1,
		Math.max(params.startLine, params.endLine),
	);
	if (regionEnd < regionStart) return [];

	while (regionStart > 0) {
		const prev = regionStart - 1;
		if (!isNormalLine(lineBlockKinds, prev)) break;
		const info = parseOrderedMarker(lines[prev] ?? "");
		if (!info) break;
		regionStart = prev;
	}
	while (regionEnd < lines.length - 1) {
		const next = regionEnd + 1;
		if (!isNormalLine(lineBlockKinds, next)) break;
		const info = parseOrderedMarker(lines[next] ?? "");
		if (!info) break;
		regionEnd = next;
	}

	const changes: SoTTextChange[] = [];
	const counters = new Map<number, number>();

	for (let i = regionStart; i <= regionEnd; i += 1) {
		if (!isNormalLine(lineBlockKinds, i)) continue;
		const lineText = lines[i] ?? "";
		const ordered = parseOrderedMarker(lineText);
		if (!ordered) continue;

		for (const [level] of counters) {
			if (level > ordered.indentColumns) {
				counters.delete(level);
			}
		}

		const nextNumber = (counters.get(ordered.indentColumns) ?? 0) + 1;
		counters.set(ordered.indentColumns, nextNumber);
		if (ordered.number === nextNumber) continue;
		const range = ranges[i];
		if (!range) continue;
		changes.push({
			from: range.from,
			to: range.to,
			insert:
				ordered.prefix +
				ordered.indent +
				`${nextNumber}${ordered.delimiter}${ordered.spacing}${ordered.content}`,
		});
	}

	return changes;
}

export function resolveSoTBlockquoteContinuationEdit(params: {
	doc: string;
	lineRanges?: LineRange[];
	selection: { anchor: number; head: number };
	mode: SoTListContinuationMode;
}): SoTListContinuationEdit | null {
	const { doc, selection, mode } = params;
	const lineRanges = params.lineRanges ?? computeLineRanges(doc);
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	const startLine = findLineIndexFromRanges(from, lineRanges);
	let endLine = findLineIndexFromRanges(to, lineRanges);
	if (startLine === null || endLine === null) return null;
	const endRange = lineRanges[endLine];
	if (endRange && to === endRange.from && to > from) {
		endLine = Math.max(startLine, endLine - 1);
	}
	if (startLine !== endLine) return null;

	const lineRange = lineRanges[startLine];
	if (!lineRange) return null;
	const lineText = doc.slice(lineRange.from, lineRange.to);

	// blockquote prefix を抽出
	const quoteMatch = lineText.match(/^((?:[ \t]{0,3}> ?)+)/);
	if (!quoteMatch) return null;
	const rawPrefix = quoteMatch[1] ?? "";
	const afterQuote = lineText.slice(rawPrefix.length);

	// リストマーカーがある行はリストハンドラに委ねる
	if (
		/^[ \t]*[-+*][ \t]/.test(afterQuote) ||
		/^[ \t]*\d{1,9}[.)][ \t]/.test(afterQuote)
	) {
		return null;
	}

	// depth チェック（blockquote でない行を弾く）
	const depth = (rawPrefix.match(/>/g) ?? []).length;
	if (depth === 0) return null;

	// 選択範囲を考慮した残存コンテンツを計算
	const localFrom = from - lineRange.from;
	const localTo = to - lineRange.from;
	const contentStart = rawPrefix.length;
	const contentFrom = Math.max(
		0,
		Math.min(afterQuote.length, localFrom - contentStart),
	);
	const contentTo = Math.max(
		contentFrom,
		Math.min(afterQuote.length, localTo - contentStart),
	);
	const remainingContent =
		afterQuote.slice(0, contentFrom) + afterQuote.slice(contentTo);
	const isEmpty = remainingContent.trim().length === 0;

	if (mode === "hard-break") {
		if (!isEmpty) {
			// 非空の引用行で Shift+Enter は no-op（hardBreak 挿入しない）
			return null;
		}
		// 空の引用行で Shift+Enter → 引用内空行を維持（同じ prefix で継続）
		const insert = `\n${rawPrefix}`;
		return {
			from,
			to,
			insert,
			nextCaret: from + insert.length,
			renumberStartLine: startLine,
			renumberEndLine: startLine + 1,
		};
	}

	// Enter: 空の blockquote 行では引用を終了する
	if (isEmpty) {
		return {
			from: lineRange.from,
			to: lineRange.to,
			insert: "",
			nextCaret: lineRange.from,
			renumberStartLine: Math.max(0, startLine - 1),
			renumberEndLine: startLine,
		};
	}

	// Enter: 同じ引用 prefix で継続
	const insert = `\n${rawPrefix}`;
	return {
		from,
		to,
		insert,
		nextCaret: from + insert.length,
		renumberStartLine: startLine,
		renumberEndLine: startLine + 1,
	};
}

export function isSoTMarkerOnlyListLine(lineText: string): boolean {
	const parsed = parseListContinuation(lineText);
	if (!parsed) return false;
	return parsed.content.trim().length === 0;
}

/** `> ` や `> > ` のような blockquote prefix だけの行かどうか */
export function isSoTBlockquoteOnlyLine(lineText: string): boolean {
	return lineText.length > 0 && /^(?:[ \t]{0,3}> ?)+$/.test(lineText);
}

function resolveListContinuationContext(
	lines: string[],
	lineBlockKinds: string[],
	lineIndex: number,
	lineText: string,
): { parsed: ParsedListContinuation; ownerLine: number } | null {
	const direct = parseListContinuation(lineText);
	if (direct) {
		return {
			parsed: direct,
			ownerLine: lineIndex,
		};
	}
	const currentInfo = parseListLine(lineText);
	if (currentInfo.kind !== "none") return null;
	if (currentInfo.content.trim().length === 0) return null;
	if (countIndentColumns(currentInfo.indent) <= 0) return null;
	for (let i = lineIndex - 1; i >= 0; i -= 1) {
		if (!isNormalLine(lineBlockKinds, i)) return null;
		const prevText = lines[i] ?? "";
		const prevInfo = parseListLine(prevText);
		if (prevInfo.prefix !== currentInfo.prefix) return null;
		const parsed = parseListContinuation(prevText);
		if (parsed) {
			return {
				parsed,
				ownerLine: i,
			};
		}
		if (
			prevInfo.kind !== "none" ||
			prevText.trim().length === 0 ||
			countIndentColumns(prevInfo.indent) <= 0
		) {
			return null;
		}
	}
	return null;
}

function parseListContinuation(lineText: string): ParsedListContinuation | null {
	let prefix = "";
	let rest = lineText;
	const quoteMatch = rest.match(/^([ \t]{0,3}(?:> ?)+)(.*)$/);
	if (quoteMatch) {
		prefix = quoteMatch[1] ?? "";
		rest = quoteMatch[2] ?? "";
	}

	const taskMatch = rest.match(
		/^([ \t]*)([-+*])[ \t]+\[([ xX])\]([ \t]*)(.*)$/,
	);
	if (taskMatch && taskMatch[0]) {
		const content = taskMatch[5] ?? "";
		const markerToken = taskMatch[0].slice(0, taskMatch[0].length - content.length);
		return {
			prefix,
			markerToken,
			nextMarkerToken: markerToken.replace(/\[[ xX]\]/, "[ ]"),
			content,
		};
	}

	const bulletMatch = rest.match(/^([ \t]*)([-+*])([ \t]+)(.*)$/);
	if (bulletMatch && bulletMatch[0]) {
		const content = bulletMatch[4] ?? "";
		return {
			prefix,
			markerToken: bulletMatch[0].slice(
				0,
				bulletMatch[0].length - content.length,
			),
			nextMarkerToken: bulletMatch[0].slice(
				0,
				bulletMatch[0].length - content.length,
			),
			content,
		};
	}

	const orderedMatch = rest.match(/^([ \t]*)(\d{1,9})([.)])([ \t]+)(.*)$/);
	if (orderedMatch && orderedMatch[0]) {
		const content = orderedMatch[5] ?? "";
		return {
			prefix,
			markerToken: orderedMatch[0].slice(
				0,
				orderedMatch[0].length - content.length,
			),
			nextMarkerToken:
				`${orderedMatch[1] ?? ""}${Number.parseInt(orderedMatch[2] ?? "1", 10) + 1}` +
				`${orderedMatch[3] ?? "."}${orderedMatch[4] ?? " "}`,
			content,
		};
	}

	return null;
}

function parseOrderedMarker(lineText: string): {
	prefix: string;
	indent: string;
	indentColumns: number;
	number: number;
	delimiter: string;
	spacing: string;
	content: string;
} | null {
	let prefix = "";
	let rest = lineText;
	const quoteMatch = rest.match(/^([ \t]{0,3}(?:> ?)+)(.*)$/);
	if (quoteMatch) {
		prefix = quoteMatch[1] ?? "";
		rest = quoteMatch[2] ?? "";
	}
	const orderedMatch = rest.match(/^([ \t]*)(\d{1,9})([.)])([ \t]+)(.*)$/);
	if (!orderedMatch) return null;
	return {
		prefix,
		indent: orderedMatch[1] ?? "",
		indentColumns: countIndentColumns(orderedMatch[1] ?? ""),
		number: Number.parseInt(orderedMatch[2] ?? "1", 10),
		delimiter: orderedMatch[3] ?? ".",
		spacing: orderedMatch[4] ?? " ",
		content: orderedMatch[5] ?? "",
	};
}

function countIndentColumns(indent: string): number {
	let columns = 0;
	for (const ch of indent) {
		columns += ch === "\t" ? 4 : 1;
	}
	return columns;
}

function isNormalLine(lineBlockKinds: string[], index: number): boolean {
	const kind = lineBlockKinds[index];
	if (!kind) return true;
	return kind === "normal";
}

function findLineIndexFromRanges(
	offset: number,
	ranges: LineRange[],
): number | null {
	if (!Number.isFinite(offset) || offset < 0) return null;
	for (let i = 0; i < ranges.length; i += 1) {
		const range = ranges[i];
		if (!range) continue;
		if (offset <= range.to) return i;
	}
	return ranges.length > 0 ? ranges.length - 1 : null;
}
