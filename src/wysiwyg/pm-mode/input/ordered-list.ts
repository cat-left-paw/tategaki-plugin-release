// Copied from src/wysiwyg/sot/sot-list-enter.ts (collectOrderedListRenumberChanges, parseOrderedMarker,
// countIndentColumns, isNormalLine) @ 3b2c3dd (2026-10-22).
// Local changes: an ordered list keeps the number of its first item at each indent (the current mode
// renumbers from 1, so `5. 五\n6. 六` became `1. 2. 3.` after an Enter: a visible change of the
// writer's numbering, M2-1 review S6). Lines and kinds are passed as arrays.
import type { SourceChange } from "./source-change";

interface OrderedMarker { prefix: string; indent: string; indentColumns: number; number: number; delimiter: string; spacing: string; content: string }

function countIndentColumns(indent: string): number {
	let columns = 0;
	for (const ch of indent) columns += ch === "\t" ? 4 : 1;
	return columns;
}
function parseOrderedMarker(lineText: string): OrderedMarker | null {
	let prefix = "", rest = lineText;
	const quoteMatch = rest.match(/^([ \t]{0,3}(?:> ?)+)(.*)$/);
	if (quoteMatch) { prefix = quoteMatch[1] ?? ""; rest = quoteMatch[2] ?? ""; }
	const orderedMatch = rest.match(/^([ \t]*)(\d{1,9})([.)])([ \t]+)(.*)$/);
	if (!orderedMatch) return null;
	return {
		prefix, indent: orderedMatch[1] ?? "", indentColumns: countIndentColumns(orderedMatch[1] ?? ""),
		number: Number.parseInt(orderedMatch[2] ?? "1", 10), delimiter: orderedMatch[3] ?? ".", spacing: orderedMatch[4] ?? " ", content: orderedMatch[5] ?? "",
	};
}
function isNormalLine(kinds: readonly string[], index: number): boolean {
	const kind = kinds[index];
	return !kind || kind === "normal";
}

/** Renumber the ordered list around lines `[startLine, endLine]` of `text`, from each indent's first number. */
export function renumberOrderedList(text: string, kinds: readonly string[], startLine: number, endLine: number): SourceChange[] {
	const lines = text.split("\n");
	const usable = kinds.length === lines.length ? kinds : [];
	const starts: number[] = [];
	let offset = 0;
	for (const line of lines) { starts.push(offset); offset += line.length + 1; }
	let regionStart = Math.max(0, Math.min(startLine, endLine)), regionEnd = Math.min(lines.length - 1, Math.max(startLine, endLine));
	if (regionEnd < regionStart) return [];
	while (regionStart > 0 && isNormalLine(usable, regionStart - 1) && parseOrderedMarker(lines[regionStart - 1] ?? "")) regionStart--;
	while (regionEnd < lines.length - 1 && isNormalLine(usable, regionEnd + 1) && parseOrderedMarker(lines[regionEnd + 1] ?? "")) regionEnd++;
	const changes: SourceChange[] = [];
	const counters = new Map<number, number>();
	for (let i = regionStart; i <= regionEnd; i++) {
		if (!isNormalLine(usable, i)) continue;
		const ordered = parseOrderedMarker(lines[i] ?? "");
		if (!ordered) continue;
		for (const [level] of counters) if (level > ordered.indentColumns) counters.delete(level);
		const previous = counters.get(ordered.indentColumns);
		const nextNumber = previous === undefined ? ordered.number : previous + 1;
		counters.set(ordered.indentColumns, nextNumber);
		if (ordered.number === nextNumber) continue;
		changes.push({ from: starts[i], to: starts[i] + lines[i].length, insert: `${ordered.prefix}${ordered.indent}${nextNumber}${ordered.delimiter}${ordered.spacing}${ordered.content}` });
	}
	return changes;
}
