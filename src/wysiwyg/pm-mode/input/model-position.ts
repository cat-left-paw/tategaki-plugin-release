import type { PmModeDocumentState } from "../pm/document-state";
import type { Mark, PMNode } from "../pm/prosemirror";
import type { BlockMapping, InlineMapping } from "../source/source-map";

/** A text position: a line of the model document and, when inside one, the Ruby or TCY around it. */
export interface TextPosition {
	readonly pos: number;
	readonly blockIndex: number;
	readonly block: BlockMapping;
	readonly line: PMNode;
	/** Ruby or TCY whose content holds the position (strictly inside: `pmFrom < pos < pmTo`). */
	readonly container: InlineMapping | null;
}

/** Kinds whose hidden prefix is a marker that Backspace at the line's start removes (D12). */
export const MARKER_KINDS: ReadonlySet<string> = new Set(["heading", "list", "olist", "task", "blockquote"]);
/** Lines shown without text whose source is not a marker: a horizontal rule, a code fence. */
export const HIDDEN_LINE_KINDS: ReadonlySet<string> = new Set(["hr", "code-fence"]);

/** The text position at a model position, or null between blocks. */
export function textPositionAt(state: PmModeDocumentState, pos: number): TextPosition | null {
	const map = state.sourceMap;
	// A position shared by two blocks belongs to the later block; a text position is inside one.
	const blockIndex = map.blockIndexAtPm(pos);
	for (const index of [blockIndex, blockIndex - 1]) {
		if (index < 0) continue;
		const block = map.blockAtPm(map.pmFrom[index]);
		if (block.type !== "line" || pos <= block.pmFrom || pos >= block.pmTo) continue;
		const container = block.inlines.find(inline => inline.kind !== "inlineMath" && inline.pmFrom < pos && pos < inline.pmTo) ?? null;
		return { pos, blockIndex: index, block, line: state.blocks[index].node, container };
	}
	return null;
}

export function contentStart(block: BlockMapping): number { return block.pmFrom + 1; }
export function contentEnd(block: BlockMapping): number { return block.pmTo - 1; }

/**
 * B14 for Ruby and TCY: a position at a container's inner start or end is the position outside it
 * (they show the same place). The middle stays inside.
 */
export function outsideAtEdges(position: TextPosition): number {
	const c = position.container;
	if (!c) return position.pos;
	if (position.pos === c.pmFrom + 1) return c.pmFrom;
	if (position.pos === c.pmTo - 1) return c.pmTo;
	return position.pos;
}

/** The end of the line's hidden prefix (its marker), or the line's start when it has none. */
export function prefixEnd(block: BlockMapping): number {
	let end = block.from;
	for (const range of block.decoration.hidden) if (range.from <= end && range.to > end) end = range.to;
	return end;
}
/** The start of the line's hidden suffix (a heading's closing `##`), or the line's end when it has none. */
export function suffixStart(block: BlockMapping): number {
	let start = block.to;
	for (const range of block.decoration.hidden) if (range.to >= start && range.from < start && range.from >= prefixEnd(block)) start = range.from;
	return start;
}
/**
 * Where the visible content starting at `pos` begins in the source (the start of a range). At the
 * line's end there is none: the line's end (its trailing marks stay with the text before them).
 */
export function sourceStartAt(block: BlockMapping, pos: number): number {
	if (pos === contentEnd(block)) return block.to;
	for (const inline of block.inlines) if (inline.pmFrom === pos) return inline.from;
	for (const run of block.runs) if (run.pmFrom <= pos && pos < run.pmTo) return run.from + pos - run.pmFrom;
	for (const run of block.runs) if (run.pmTo === pos) return run.to;
	for (const inline of block.inlines) if (inline.pmTo === pos) return inline.to;
	return pos <= contentStart(block) ? prefixEnd(block) : block.to;
}
/**
 * Where the visible content ending at `pos` ends in the source (the end of a range). At the line's
 * start there is none: the end of its marker (the marks before its first character stay with it).
 */
export function sourceEndAt(block: BlockMapping, pos: number): number {
	if (pos === contentStart(block)) return prefixEnd(block);
	for (const inline of block.inlines) if (inline.pmTo === pos) return inline.to;
	for (const run of block.runs) if (run.pmFrom < pos && pos <= run.pmTo) return run.from + pos - run.pmFrom;
	for (const run of block.runs) if (run.pmFrom === pos) return run.from;
	for (const inline of block.inlines) if (inline.pmFrom === pos) return inline.from;
	return pos <= contentStart(block) ? prefixEnd(block) : block.to;
}

/** Mark characters of the inline notations; each kind is its own token (a run of `**`, a `[`, a `](`). */
const MARK_CLASS: Readonly<Record<string, string>> = { "*": "*", _: "_", "~": "~", "=": "=", "`": "`", "[": "[", "]": "]", "(": "(", ")": ")", "<": "<", ">": ">", "!": "!", "^": "^", "|": "|", "｜": "｜", "《": "《", "》": "》", "｟": "｟", "｠": "｠" };
/**
 * Where the hidden source `[a, b]` of a line may be cut between two notations: `a`, `b`, the edges of
 * the line's hidden ranges (its marker), and each place where one kind of mark character meets
 * another or the text of a target (`**[`, `](u)[`, `]][[`). The source map keeps only the shown runs,
 * so these are candidates for the display check to accept or not (§5.4). Ascending.
 */
export function hiddenEdges(source: string, block: BlockMapping, a: number, b: number): number[] {
	const points = new Set([a, b]);
	for (const range of block.decoration.hidden) for (const p of [range.from, range.to]) if (p > a && p < b) points.add(p);
	// Inside a run of one emphasis mark (`****`: one format's closing and the next one's opening), every place.
	for (let i = a + 1; i < b; i++) if ((MARK_CLASS[source[i - 1]] ?? "text") !== (MARK_CLASS[source[i]] ?? "text") || (source[i - 1] === source[i] && "*_~=".includes(source[i]))) points.add(i);
	return [...points].sort((x, y) => x - y);
}
/** The cut places of the hidden run at model position `pos` of a line (from the shown text before it to the shown text after it). */
export function gapEdges(source: string, block: BlockMapping, pos: number): number[] {
	const before = sourceEndAt(block, pos), after = sourceStartAt(block, pos);
	return before <= after ? hiddenEdges(source, block, before, after) : [after];
}

/** A format or link mark (not the class every run has, nor code highlighting). */
export function formatMark(mark: Mark): boolean {
	if (mark.type.name !== "mdClass") return true;
	return (mark.attrs.classes as string[]).some(c => c !== "tategaki-sot-run" && !c.startsWith("hljs")) || mark.attrs.footnoteId !== null;
}
/** The marks of a format of the text itself (it points nowhere). */
const TEXT_FORMATS: ReadonlySet<string> = new Set(["strong", "em", "code", "strike", "highlight"]);
/**
 * Whether model position `pos` is strictly inside a format: the text on both sides has the same
 * format mark (D27: only there is a line break written as typed, showing the marks), and no link,
 * image or footnote holds both (a break there cuts it, and its URL shows as text; M2-1 review 3 S-A).
 */
export function insideFormat(doc: PMNode, pos: number): boolean {
	const $pos = doc.resolve(pos);
	if ($pos.parent.attrs.kind === "code") return false;
	const before = edgeMarks($pos.nodeBefore, true), after = edgeMarks($pos.nodeAfter, false);
	const shared = before.filter(mark => formatMark(mark) && mark.isInSet(after));
	return shared.some(mark => TEXT_FORMATS.has(mark.type.name)) && shared.every(mark => TEXT_FORMATS.has(mark.type.name));
}
/** The marks of the text at the end (`last`) or start of an inline node (a Ruby / TCY has none itself: its text's). */
export function edgeMarks(node: PMNode | null | undefined, last: boolean): readonly Mark[] {
	if (!node) return [];
	return node.isText || !node.childCount ? node.marks : edgeMarks(last ? node.lastChild : node.firstChild, last);
}

/** The first bare Ruby (no `｜`) of the line holding `offset`, starting at or after it (D22). */
export function bareRubyAfter(block: BlockMapping, offset: number): InlineMapping | null {
	if (block.type !== "line") return null;
	return block.inlines.find(inline => inline.kind === "ruby" && inline.baseFrom === inline.from && inline.from >= offset) ?? null;
}

/** Text of a parent's content with every non-text child as U+FFFC per position (positions = offsets). */
export function contentText(parent: PMNode): string {
	let text = "";
	parent.forEach(child => { text += child.isText ? child.text ?? "" : "￼".repeat(child.nodeSize); });
	return text;
}

type Segmenter = { segment(text: string): Iterable<{ index: number; segment: string }> };
let segmenter: Segmenter | null = null;
function graphemes(text: string): { index: number; segment: string }[] {
	if (!segmenter) {
		const Ctor = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: "grapheme" }) => Segmenter }).Segmenter;
		if (!Ctor) throw new Error("Intl.Segmenter is required (capabilities)");
		segmenter = new Ctor("ja", { granularity: "grapheme" });
	}
	return Array.from(segmenter.segment(text));
}

/**
 * Whether model position `pos` is inside one grapheme of its text (a surrogate pair's halves, an emoji
 * with its modifier). Next to a node that is not text (a Ruby, TCY, math, image) it is not (a
 * combining mark after one is its own: M2-1 review 10 m-AW).
 */
export function splitsGrapheme(doc: PMNode, pos: number): boolean {
	const $pos = doc.resolve(pos), parent = $pos.parent, offset = $pos.parentOffset;
	if (!parent.inlineContent || offset === 0 || offset >= parent.content.size || !$pos.nodeBefore?.isText || !$pos.nodeAfter?.isText) return false;
	return !graphemes(contentText(parent)).some(s => s.index === offset);
}

/**
 * The grapheme before (Backspace) or after (Delete) `pos` in `parent` whose content starts at
 * `start`, as a model range; null when that side is not text.
 */
export function graphemeAt(parent: PMNode, start: number, pos: number, backward: boolean): { from: number; to: number } | null {
	const text = contentText(parent), offset = pos - start;
	const found = graphemes(text).find(s => backward ? s.index < offset && s.index + s.segment.length === offset : s.index === offset);
	if (!found || found.segment.includes("￼")) return null;
	return { from: start + found.index, to: start + found.index + found.segment.length };
}

/**
 * The footnote reference (`[^id]`) whose shown text holds model position `pos` (its id is drawn as
 * a number): its model range and its whole notation in the source. Null when `pos` is not in one.
 */
export function footnoteReferenceAt(state: PmModeDocumentState, block: BlockMapping, pos: number): { pmFrom: number; pmTo: number; from: number; to: number } | null {
	const $pos = state.doc.resolve(pos);
	const node = $pos.parent.maybeChild($pos.index());
	const mark = node?.marks.find(m => m.type.name === "mdClass" && (m.attrs.classes as string[]).includes("tategaki-md-footnote-ref"));
	if (!node || !node.isText || !mark) return null;
	const pmFrom = pos - $pos.textOffset, pmTo = pmFrom + node.nodeSize;
	const idFrom = sourceStartAt(block, pmFrom), idTo = sourceEndAt(block, pmTo);
	const source = state.source;
	if (source.slice(idFrom - 2, idFrom) !== "[^" || source[idTo] !== "]") return null;
	return { pmFrom, pmTo, from: idFrom - 2, to: idTo + 1 };
}
