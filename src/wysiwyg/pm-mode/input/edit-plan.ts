import type { PmModeDocumentState } from "../pm/document-state";
import { Transform, type Mark, type PMNode } from "../pm/prosemirror";
import { pmModeSchema as schema } from "../pm/schema";
import type { BlockMapping, SourcePoint } from "../source/source-map";
import { wildcardText } from "./display-signature";
import { applyCandidate, lineTable, type Candidate, type CheckedEdit } from "./edit-check";
import type { BlockedReason, SourceSelection } from "./edit-target";
import type { EditContext } from "./edit-target";
import { bareRubyAfter, HIDDEN_LINE_KINDS, contentEnd, contentStart, edgeMarks, formatMark, gapEdges, hiddenEdges, prefixEnd, sourceEndAt, sourceStartAt, suffixStart } from "./model-position";
import { holdsInertMarks, lineNotations, literalUnderscore, shownPart, type EditIntent } from "./notation-inventory";
import { sortChanges, type SourceChange } from "./source-change";

/** CodeMirror's `userEvent` for each kind of edit (M2 design §5.6). */
/** The clipboard stage: a cut is `delete.cut` and a paste `input.paste` (CodeMirror's own names; the paste is one step of the history). */
export type EditUserEvent = "input.type" | "delete.backward" | "delete.forward" | "delete.cut" | "input.paste" | "input";

/** A planned edit that displays as intended (or, for typed notation, as typed). */
export interface PlannedEdit {
	readonly kind: "edit";
	/** In the coordinates of the document before the edit. */
	readonly changes: readonly SourceChange[];
	/** CodeMirror's selection after the edit (new document). */
	readonly selection: SourceSelection;
	/** The display position of the caret (the selection field's hint), when it is known. */
	readonly hint: SourcePoint | null;
	readonly userEvent: EditUserEvent;
	readonly note: string;
	readonly checked: CheckedEdit;
}
export type Plan = PlannedEdit | { readonly kind: "blocked"; readonly reason: BlockedReason } | { readonly kind: "noop"; readonly reason: string };

export function blocked(reason: BlockedReason): Plan { return { kind: "blocked", reason }; }

/**
 * Text typed at model position `pos` as the expected display shows it: with the marks the text on
 * both sides shares, and no other (every mark is non-inclusive, as Nyoze's bold, italic, strike,
 * highlight and link; inline code too, by the author's decision of 2026-10-23). So at a format's or
 * a link's edge, typed text goes outside it (`x|**a**` → `xz**a**`, `**a**|` → `**a**z`), at a line's
 * start or end too; inside one it stays inside (`**a|b**` → `**azb**`).
 */
export function typedTextAt(doc: PMNode, pos: number, text: string): PMNode {
	const $pos = doc.resolve(pos);
	const before = edgeMarks($pos.nodeBefore, true), after = edgeMarks($pos.nodeAfter, false);
	return schema.text(text, before.filter(mark => mark.isInSet(after) && !isFootnoteReference(mark)));
}
/** A footnote reference's mark: typed text never takes it (its id is not shown; M2-1 review B3). */
export const isFootnoteReference = (mark: Mark) => mark.type.name === "mdClass" && mark.attrs.footnoteId !== null;

/** A new line of the expected display (its text takes any format, `wildcardText`). */
export function emptyLine(text = ""): PMNode {
	return schema.nodes.line.create({ kind: "normal" }, text ? wildcardText(text) : null);
}
export function newTransform(state: PmModeDocumentState): Transform { return new Transform(state.doc); }

/** The edit with its caret at a model position of the new text. */
export function editAt(checked: CheckedEdit, caretPm: number, userEvent: EditUserEvent): PlannedEdit {
	const point = checked.after.sourceMap.point(caretPm);
	return { kind: "edit", changes: checked.changes, selection: { anchor: point.offset, head: point.offset }, hint: point, userEvent, note: checked.note, checked };
}

/** Typed notation is written as typed: the caret is right after it in the source, without a display hint. */
export function editAtSource(checked: CheckedEdit, offset: number, userEvent: EditUserEvent): PlannedEdit {
	return { kind: "edit", changes: checked.changes, selection: { anchor: offset, head: offset }, hint: null, userEvent, note: checked.note, checked };
}

/**
 * D22: the same changes with `｜` added before the bare Ruby whose base holds an end of a change,
 * else the first one of the line where they end, so the Ruby keeps its base (a kanji typed or joined
 * before it is not taken into it, and a character typed into its base does not cut it). Null when
 * there is none.
 */
export function withRubyDelimiter(state: PmModeDocumentState, changes: readonly SourceChange[]): SourceChange[] | null {
	const sorted = sortChanges(changes, state.source.length);
	if (!sorted.length) return null;
	const end = sorted[sorted.length - 1].to;
	const block = state.sourceMap.blockAtSource(end);
	const ruby = bareRubyAfter(block, Math.min(end, block.to));
	// A base that holds an end of a change (a character typed into its middle; a range from inside it,
	// D14 (b), whose last change is after it).
	const holdingAt = (p: number) => { const b = state.sourceMap.blockAtSource(p); return b.type === "line" ? b.inlines.find(inline => inline.kind === "ruby" && inline.baseFrom === inline.from && inline.from < p && p < inline.to) : undefined; };
	let holding: ReturnType<typeof holdingAt>;
	for (const change of sorted) { holding = holdingAt(change.from) ?? holdingAt(change.to); if (holding) break; }
	const target = holding ?? ruby;
	if (!target) return null;
	// After text inserted at the same place (so `｜` stays next to the base), before a deletion starting there.
	const at = target.baseFrom, delimiter = { from: at, to: at, insert: "｜" };
	if (sorted.some(change => change.from < at && at < change.to)) return null;
	const index = sorted.findIndex(change => change.from > at || (change.from === at && change.to > at));
	return index < 0 ? [...sorted, delimiter] : [...sorted.slice(0, index), delimiter, ...sorted.slice(index)];
}

/** Whether source `[from, to)` holds a `_` inside a word. */
function hasLiteral(source: string, from: number, to: number): boolean {
	for (let i = from; i < to; i++) if (literalUnderscore(source, i)) return true;
	return false;
}

/**
 * The old source a shown range `[pmFrom, pmTo)` means to remove: from its first shown character's
 * source to its last one's (whole atom blocks at its ends). The notation check keeps what is outside.
 */
export function shownSpan(state: PmModeDocumentState, pmFrom: number, pmTo: number): { from: number; to: number } {
	const start = state.sourceMap.blockAtPm(pmFrom), end = blockEndingAt(state, pmTo);
	return { from: start.type === "line" ? sourceStartAt(start, pmFrom) : start.from, to: end.type === "line" ? sourceEndAt(end, pmTo) : end.to };
}

/** The block a range ending at model position `pos` ends in (at a block boundary, the block before it). */
export function blockEndingAt(state: PmModeDocumentState, pos: number): BlockMapping {
	const map = state.sourceMap;
	let index = map.blockIndexAtPm(pos);
	if (index > 0 && map.pmFrom[index] === pos) index--;
	return map.blockAtPm(map.pmFrom[index]);
}

/** The source of the visible units of a line shown in model range `[pmA, pmB)` (Ruby / TCY / math covered whole go whole). */
function shownPieces(block: BlockMapping, pmA: number, pmB: number): SourceChange[] {
	const out: SourceChange[] = [];
	const covered = block.inlines.filter(inline => inline.pmFrom >= pmA && inline.pmTo <= pmB);
	for (const inline of covered) out.push({ from: inline.from, to: inline.to, insert: "" });
	for (const run of block.runs) {
		if (covered.some(inline => run.pmFrom >= inline.pmFrom && run.pmTo <= inline.pmTo)) continue;
		const x = Math.max(run.pmFrom, pmA), y = Math.min(run.pmTo, pmB);
		if (x < y) out.push({ from: run.from + x - run.pmFrom, to: run.from + y - run.pmFrom, insert: "" });
	}
	return out;
}

/**
 * The source edits to try for the shown range `[pmFrom, pmTo)` replaced by `insert` (M2 design §5.1
 * B10, §5.2). They are made from what the range shows, never from CodeMirror's own range (an end
 * inside a link's URL would cut it; M2-1 review B2). At each end the edit may stop at any edge of the
 * hidden run there (from the shown character's own source out to the next shown character, never
 * into a line's marker or a heading's closing `##`): so a format or link whose text the range covers
 * whole goes whole with its marks, and the marks of one it only partly covers stay. Between the ends
 * the source goes whole, or (pieces) only the shown units go and every hidden mark inside stays (the
 * `**` of a format the range starts inside, the `｠` of a TCY it ends inside). In a range over lines,
 * the lines between, the line breaks and the last line's marker always go, and each end line is
 * whole or pieces. The text goes where the first removed source starts. A deletion tries the
 * cleanest edits first, a replacement first the edits from the range's first shown character (the
 * typed text's marks are the plan's, `marksAcross` in `source-commit.ts`: the check takes the first
 * candidate that shows them); with an end in a Ruby's base, the pieces and then the edits that keep
 * its `｜` come first (D14 (b)). Each is checked (§5.4), so an edit that moves a kept character's
 * format or link target never passes.
 */
export function rangeBases(state: PmModeDocumentState, pmFrom: number, pmTo: number, insert: string, note: string, kind: "delete" | "replace"): { changes: SourceChange[]; note: string }[] {
	const start = state.sourceMap.blockAtPm(pmFrom), end = blockEndingAt(state, pmTo), table = lineTable(state);
	type Side = { readonly changes: SourceChange[]; readonly label: string; readonly at: number };
	// The start line's part: whole from an edge of the hidden run before the range, or its pieces.
	const starts: Side[] = [], ends: Side[] = [];
	const single = start.from === end.from;
	if (start.type === "line") {
		const shownStart = sourceStartAt(start, pmFrom);
		// Never past a `_` inside a word (text in CommonMark, which M1 hides: `_a_b`'s a is not deleted as
		// `b`; M2-1 review 5 B-7).
		const lefts = hiddenEdges(state.source, start, Math.max(prefixEnd(start), Math.min(sourceEndAt(start, pmFrom), shownStart)), shownStart).filter(at => !hasLiteral(state.source, at, shownStart) && !holdsInertMarks(state.source, at, shownStart, table));
		const lineEnd = single ? null : start.to;
		for (const at of lefts) starts.push({ changes: lineEnd === null ? [] : [{ from: at, to: lineEnd, insert: "" }], label: at === shownStart ? "whole" : "wide", at });
		if (!single) starts.push({ changes: shownPieces(start, pmFrom, contentEnd(start)), label: "pieces", at: shownStart });
	} else starts.push({ changes: single ? [] : [{ from: start.from, to: start.to, insert: "" }], label: "block", at: start.from });
	if (end.type === "line") {
		const shownEnd = sourceEndAt(end, pmTo);
		const rights = hiddenEdges(state.source, end, shownEnd, Math.max(shownEnd, Math.min(sourceStartAt(end, pmTo), suffixStart(end)))).filter(at => !hasLiteral(state.source, shownEnd, at) && !holdsInertMarks(state.source, shownEnd, at, table)).reverse();
		const lineStart = single ? null : prefixEnd(end);
		for (const at of rights) ends.push({ changes: lineStart === null ? [] : [{ from: lineStart, to: at, insert: "" }], label: at === shownEnd ? "whole" : "wide", at });
		if (!single) ends.push({ changes: shownPieces(end, contentStart(end), pmTo), label: "pieces", at: end.to });
	} else ends.push({ changes: single ? [] : [{ from: end.from, to: end.to, insert: "" }], label: "block", at: end.to });
	// The text goes where the first removed source starts (never inside a removed piece).
	const withText = (changes: SourceChange[], first: number): SourceChange[] => {
		const sorted = changes.filter(c => c.from < c.to).sort((a, b) => a.from - b.from);
		const at = sorted.length ? Math.min(first, sorted[0].from) : first;
		return insert ? [{ from: at, to: at, insert }, ...sorted] : sorted;
	};
	// `tightLeft`: starts at the range's first shown character (text typed there would have its format).
	const wholes: { changes: SourceChange[]; note: string; width: number; tightLeft: boolean }[] = [], mixed: { changes: SourceChange[]; note: string }[] = [];
	let pieces: { changes: SourceChange[]; note: string } | null = null;
	// A range that ends in a Ruby's base it starts before (D14 (b)): whole or wide up to the Ruby, then
	// the base's chosen characters, so the author's `｜` stays (`**前**｜漢字《かんじ》後`, `前漢` replaced:
	// `x｜字《かんじ》後`; M2-1 review 10 S-V').
	const rubyKeeping: { changes: SourceChange[]; note: string }[] = [];
	if (single) {
		for (const s of starts) for (const e of ends) if (s.at <= e.at) wholes.push({ changes: withText([{ from: s.at, to: e.at, insert: "" }], s.at), note: `${note}-${s.label}-${e.label}`, width: e.at - s.at, tightLeft: s.label === "whole" });
		if (start.type === "line") pieces = { changes: withText(shownPieces(start, pmFrom, pmTo), sourceStartAt(start, pmFrom)), note: `${note}-pieces` };
		const ruby = start.type === "line" && state.doc.resolve(pmTo).parent.type.name === "ruby" ? start.inlines.find(inline => inline.kind === "ruby" && inline.pmFrom >= pmFrom && inline.pmFrom < pmTo && pmTo < inline.pmTo) : undefined;
		if (ruby) for (const s of starts) if (s.at <= ruby.from) rubyKeeping.push({ changes: withText([{ from: s.at, to: ruby.from, insert: "" }, ...shownPieces(start, ruby.pmFrom + 1, pmTo)], s.at), note: `${note}-${s.label}-ruby` });
	} else {
		const middle: SourceChange = { from: start.to, to: end.type === "line" ? prefixEnd(end) : end.from, insert: "" };
		for (const s of starts) for (const e of ends) {
			const changes = withText([...s.changes, middle, ...e.changes], s.at);
			const isWhole = s.label !== "pieces" && e.label !== "pieces";
			if (isWhole) wholes.push({ changes: withText([{ from: s.at, to: e.at, insert: "" }], s.at), note: `${note}-${s.label}-${e.label}`, width: e.at - s.at, tightLeft: s.label === "whole" });
			else if (s.label === "pieces" && e.label === "pieces") pieces = { changes, note: `${note}-pieces-pieces` };
			else mixed.push({ changes, note: `${note}-${s.label}-${e.label}` });
		}
	}
	// A deletion: the narrowest first, the shown units only (pieces), then the whole edits from the
	// tightest. The marks of a format whose shown text it removes go with it by the seam check
	// (`a**b**` without b is `a****`, tried as `a`; `firstExact`), and a link's by the shell check;
	// hidden marks that pair with nothing stay (M1 hides an unclosed `**`, which CommonMark shows:
	// `注意**ここ` without 意 is `注**ここ`; M2-1 review 4 S-C). A replacement: first the whole edits
	// from the range's first shown character (where text with that character's format goes), the tightest
	// first (`前[[A]][[B]]後`, `AB` → `前[[x]]後`, not `前[[x]][[]]後`; `前**a**x**b**後` → `前**y**後`; review
	// S-3), then the pieces. When the text kept on both sides has the same format, separately
	// (`[甲a](u)b[c乙](u)`, the range `abc`), the pieces first: a whole edit would join the two into one
	// (review S-4).
	const joins = joinsFormats(state, pmFrom, pmTo);
	wholes.sort((a, b) => a.width - b.width);
	const tightLeft = kind === "replace" ? wholes.filter(w => w.tightLeft) : [];
	const rest = wholes.filter(w => !tightLeft.includes(w));
	// The pieces, with every link, image, wikilink or footnote reference whose whole text the range
	// covers removed with its marks (no empty `[](u)` left; review S-2, S-3). For a replacement, the
	// one where the range starts stays: the typed text takes its place and format.
	const cleaned = pieces ? withoutShells(state, pieces, start, end, pmFrom, pmTo, kind, withText) : null;
	const piecesFirst = [...(cleaned ? [cleaned] : []), ...(pieces ? [pieces] : [])];
	// The same for the edits that take one end line's pieces (a range over lines).
	for (let i = mixed.length - 1; i >= 0; i--) {
		const clean = withoutShells(state, mixed[i], start, end, pmFrom, pmTo, kind, withText);
		if (clean) mixed.splice(i, 0, clean);
	}
	// A range with an end in a Ruby's base (D14 (b)): the pieces first too, so the author's `｜` stays (a
	// whole edit from the Ruby's start takes it: `前｜漢字《かんじ》後`, 漢 replaced by x, is
	// `前x｜字《かんじ》後`, not `前x字《かんじ》後`; M2-1 review 9 S-V).
	const inRuby = [pmFrom, pmTo].some(p => state.doc.resolve(p).parent.type.name === "ruby");
	const ordered = kind === "delete"
		? [...piecesFirst, ...rubyKeeping, ...wholes, ...mixed]
		: (joins || inRuby ? [...piecesFirst, ...rubyKeeping, ...tightLeft, ...mixed, ...rest] : [...(cleaned ? [cleaned] : []), ...tightLeft, ...piecesFirst, ...mixed, ...rest]);
	const seen = new Set<string>();
	// An edit that changes nothing is no candidate (a range between two blocks only; review 5 S-H).
	return ordered.filter(base => {
		const key = JSON.stringify(base.changes);
		if (seen.has(key) || !base.changes.some(c => c.from < c.to || c.insert)) return false;
		seen.add(key);
		return true;
	});
}

/** `pieces` (deletions, and the typed text for a replacement) with the notations the shown range covers whole removed. */
function withoutShells(state: PmModeDocumentState, pieces: { changes: SourceChange[]; note: string }, start: BlockMapping, end: BlockMapping, pmFrom: number, pmTo: number, kind: "delete" | "replace", withText: (changes: SourceChange[], first: number) => SourceChange[]): { changes: SourceChange[]; note: string } | null {
	const span = shownSpan(state, pmFrom, pmTo), table = lineTable(state);
	const notations = lineNotations(state.source.slice(start.from, end.to), start.from, table.defined).filter(n => {
		const part = shownPart(n, table.shown);
		return !!part && span.from <= part.from && part.to <= span.to && !(kind === "replace" && part.from === span.from);
	});
	if (!notations.length) return null;
	const ranges = [...pieces.changes.filter(c => c.from < c.to).map(c => ({ from: c.from, to: c.to })), ...notations.map(n => ({ from: n.from, to: n.to }))].sort((a, b) => a.from - b.from);
	const merged: { from: number; to: number }[] = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
		else merged.push({ ...range });
	}
	return { changes: withText(merged.map(r => ({ from: r.from, to: r.to, insert: "" })), span.from), note: `${pieces.note}+notations` };
}

/** Whether the text kept before and after model range `[from, to)` has a format mark the range interrupts (two separate formats). */
export function joinsFormats(state: PmModeDocumentState, from: number, to: number): boolean {
	const before = edgeMarks(state.doc.resolve(from).nodeBefore, true), after = edgeMarks(state.doc.resolve(to).nodeAfter, false);
	// Formats never go over a line break: in two lines they are two.
	const apart = state.sourceMap.blockIndexAtPm(from) !== state.sourceMap.blockIndexAtPm(to);
	return before.some(mark => formatMark(mark) && mark.isInSet(after) && (apart || !textOnlyWith(state.doc, from, to, mark)));
}
function textOnlyWith(doc: PMNode, from: number, to: number, mark: Mark): boolean {
	let all = true;
	doc.nodesBetween(from, to, node => { if (node.isText && !mark.isInSet(node.marks)) all = false; return all; });
	return all;
}

/**
 * The expected display of removing model range `[from, to)` (and the caret, at `from`). An end inside
 * a Ruby base or a TCY keeps that container with what is left of it: the part inside goes on its own
 * (PM's replace would otherwise join the rest of the range into the container).
 */
export function deleteShown(tr: Transform, from: number, to: number): Transform {
	const $from = tr.doc.resolve(from), $to = tr.doc.resolve(to);
	if ($from.start() === $to.start() || (!$from.parent.isInline && !$to.parent.isInline)) return tr.delete(from, to);
	// From the end backwards, so the earlier positions stay valid.
	let end = to;
	if ($to.parent.isInline) { tr.delete($to.start(), to); end = $to.before(); }
	if ($from.parent.isInline) {
		if ($from.after() < end) tr.delete($from.after(), end);
		return tr.delete(from, $from.end());
	}
	return tr.delete(from, end);
}

/**
 * Ranges the plans never write (M2-1 review S4): from inside one Ruby / TCY into another (what is
 * left of them would join into one). Null when the range may be edited. (M1-7, D-M17-6: S7's second
 * case, a range from an earlier line into a footnote definition, is gone: the label of a definition
 * shows as its own characters, so the range removes them like any other.)
 */
export function refusedRange(state: PmModeDocumentState, from: number, to: number): BlockedReason | null {
	const $from = state.doc.resolve(from), $to = state.doc.resolve(to);
	// Positions, not node identity: two containers with the same content may be one shared node.
	if ($from.start() !== $to.start() && $from.parent.isInline && $to.parent.isInline) return "structure";
	const map = state.sourceMap;
	// A heading with a closing `##` is not joined to another line (its `##` would show as text or go;
	// how is a design question, M2-1 REPORT §8 1): nor by a range over a line break (review 6 S-L).
	const startBlock = map.blockAtPm(from), endLine = blockEndingAt(state, to);
	if (startBlock.from !== endLine.from && [startBlock, endLine].some(b => b.type === "line" && b.kind === "heading" && suffixStart(b) < b.to)) return "structure";
	// A TCY is one unit (D13, 2026-10-23): no range ends strictly inside one (its inner edges are its outer ones).
	for (const $end of [$from, $to]) if ($end.parent.type.name === "tcy" && $end.parentOffset > 0 && $end.parentOffset < $end.parent.content.size) return "structure";
	return null;
}

/**
 * Whether model range `[from, to)` shows nothing and ends before a block that is no line (a
 * horizontal rule): it is only the end of a line. Typed text and a line break go where it starts,
 * as at a caret, rather than removing the block with the line break (M2-1 review 6 S-O).
 */
export function boundaryOnly(state: PmModeDocumentState, from: number, to: number): boolean {
	const map = state.sourceMap, block = map.blockAtPm(to);
	// Only the end of the line before it (not empty lines between: they are chosen; M2-1 review 7 m-W).
	return map.blockIndexAtPm(from) + 1 === map.blockIndexAtPm(to) && state.doc.textBetween(from, to, "", "\ufffc") === "" && (block.type !== "line" || HIDDEN_LINE_KINDS.has(block.kind));
}

/** The base candidate and its D22 variant, then the same for each alternative (in order). */
export function variants(state: PmModeDocumentState, bases: readonly { changes: readonly SourceChange[]; note: string }[]): Candidate[] {
	const result: Candidate[] = [];
	const seen = new Set<string>();
	const add = (changes: readonly SourceChange[], note: string) => {
		const key = JSON.stringify(sortChanges(changes, state.source.length));
		if (seen.has(key)) return;
		seen.add(key);
		result.push({ changes, note });
	};
	for (const base of bases) {
		add(base.changes, base.note);
		const delimited = withRubyDelimiter(state, base.changes);
		if (delimited) add(delimited, `${base.note}+ruby-delimiter`);
	}
	return result;
}

/**
 * Where text typed at model position `pos` of a line may go in the source (M2 design §5.1): the
 * cut places of the hidden run at the caret, with what shows the caret (`offset`, the later run's
 * start) and the intent for the notation check. First CodeMirror's own caret when it is in that run
 * (the source of truth: after a link's `]]` at a line's end it is outside the link; M2-1 review B-2),
 * then the places outside every notation (between two links, after a link's closing marks), then
 * where the caret shows, then the rest.
 */
export function insertionPlaces(ctx: EditContext, block: BlockMapping, pos: number, inside: boolean): { places: number[]; offset: number; intent: EditIntent } {
	const { state } = ctx, offset = state.sourceMap.pmToSource(pos);
	if (inside) return { places: [offset], offset, intent: { from: offset, to: offset, insert: true } };
	const gap = gapEdges(state.source, block, pos), from = gap[0], to = gap[gap.length - 1];
	// CodeMirror's caret is its own information only where it differs from the shown one (a caret the
	// new mode set is the shown position's offset).
	const { anchor, head } = ctx.selection, cm = anchor === head && head !== offset && from <= head && head <= to ? [head] : [];
	const notations = lineNotations(state.source.slice(block.from, block.to), block.from, lineTable(state).defined);
	const outside = (at: number) => !notations.some(n => n.from < at && at < n.to);
	const rest = [offset, ...gap];
	const places = [...new Set([...cm, ...rest.filter(outside), ...rest])];
	return { places, offset, intent: { from: Math.min(from, offset), to: Math.max(to, offset), insert: true } };
}

/**
 * Two checked plans in a row as one edit (a range removed, then a break or text at the caret): the
 * second was planned on the first's result. One change, from the first to the last difference
 * of the old and the final text (one CodeMirror transaction).
 */
export function composeEdits(state: PmModeDocumentState, first: PlannedEdit, second: PlannedEdit): PlannedEdit {
	const old = state.source, final = second.checked.source;
	let prefix = 0;
	while (prefix < old.length && prefix < final.length && old.charCodeAt(prefix) === final.charCodeAt(prefix)) prefix++;
	let suffix = 0;
	while (suffix < old.length - prefix && suffix < final.length - prefix && old.charCodeAt(old.length - 1 - suffix) === final.charCodeAt(final.length - 1 - suffix)) suffix++;
	const changes = [{ from: prefix, to: old.length - suffix, insert: final.slice(prefix, final.length - suffix) }];
	const note = `${first.note}>${second.note}`;
	return { ...second, changes, note, checked: { ...second.checked, changes, note } };
}

/** The context with a caret at model position `pos` (the display position as its hint). */
export function caretContext(ctx: EditContext, pos: number): EditContext {
	const point = ctx.state.sourceMap.point(pos);
	return { ...ctx, selection: { anchor: point.offset, head: point.offset }, anchorHint: point, headHint: point };
}

/** Context for planning on a plan's result, with its caret. */
export function contextAfter(plan: PlannedEdit) {
	return { state: plan.checked.after, options: plan.checked.options, selection: plan.selection, anchorHint: plan.hint, headHint: plan.hint };
}

export { applyCandidate };
