import { PmModeDocumentState } from "../pm/document-state";
import type { PMNode } from "../pm/prosemirror";
import { definitionLabelRange } from "../source/line-decoration";
import type { BlockMapping } from "../source/source-map";
import type { SourceModelOptions } from "../source/source-model";
import { changedBlocks, lineChars, lineShape, lineTokenKeys } from "./display-signature";
import { applyCandidate, keepsNotationOf } from "./edit-check";
import { blocked, boundaryOnly, caretContext, composeEdits, contextAfter, editAtSource, insertionPlaces, refusedRange, withRubyDelimiter, type Plan } from "./edit-plan";
import { resolveEditTarget, type EditContext } from "./edit-target";
import { contentEnd, contentStart, HIDDEN_LINE_KINDS, outsideAtEdges, textPositionAt } from "./model-position";
import { applySourceChanges, type SourceChange } from "./source-change";
import { planCommitChecked } from "./source-commit";
import { planDeletion } from "./source-deletion";
import type { EditUserEvent } from "./edit-plan";

/**
 * The clipboard stage (D-C-5 to D-C-9, D-C-13 to D-C-15; 2026-11-08): text written to the note as the source it is, not as characters the display must show. A paste is such an insertion, and so are
 * the two ways of typing that the checked commit refuses: marks and text in one commit (D-C-8) and text typed into an empty notation (D-C-9).
 *
 *   - a caret, text with no mark and no line break (D-C-15): the checked commit's plan (`planCommitChecked`), whole: where it writes, the note changes as the commit changes it (the same place, the same
 *     `｜` before a bare Ruby, the same display); where it refuses, the paste refuses for the same reason. Only the `userEvent` is the paste's
 *   - a caret, any other text: the text goes where a character typed there would go (the checked commit's place for one plain character, never between the hidden marks of an escape or on the
 *     wrong side of a format's mark), whole; on a line shown without text (a horizontal rule, a code fence) on a new line after it (D-C-13, B15 as a commit's); never inside a Ruby's base (D-C-14: its marks
 *     or line break would break the Ruby), nor a TCY (D13); and, where the text would be taken into the base of a Ruby with no `｜`, with a `｜` before the base (D-C-15, the commit's D22)
 *   - a range: the range is first removed as its Backspace removes it (the plan the cut uses, checked: never more than what is shown of the range goes), and the text goes at its caret, as one edit
 *   - everything (D15): the text replaces the body, the frontmatter stays; a block chosen whole (B15): the text goes on a new line after it; between blocks: on a new line there
 * What it keeps, as typed notation does (`keepsNotationOf`): no notation the text does not mean to remove is lost or changes where it points, no two hidden runs of the same mark meet, and no Ruby
 * of the note (its base and its reading) is changed by an insertion. What it does not check, for a text with marks, is the display the text makes: the marks in it work as marks (a `**` that closes an
 * earlier one, a ```` ``` ```` that makes the lines after it code), and the text stays in the note as written; one Undo takes it out. Never in the `[label]:` of a definition line (M1-7, D-M17-10: its
 * marks would make the line no definition).
 * The notes end in `notation`: a written plan the display is not compared with, only the source (`m2-1-rules.ts`). D-C-8 (the author's decision "narrow it", 2026-11-08) writes a text only when the text
 * itself is a notation (alone on a line it does not show as it is) and nothing outside of it changes how it shows (`outsideKept`: the characters and their marks, the line's kind, the Ruby).
 */

/** The characters of Markdown and Aozora marks, and the ASCII blanks (`isNotationPayload` of `source-commit.ts`, in one). */
const MARK = /[!-/:-@[-`{-~｜《》｟｠ \t]/;
const NOT_MARK = /[^!-/:-@[-`{-~｜《》｟｠ \t]/;

/** D-C-8: marks and other text together (marks alone are typed notation already, text alone is checked as it is). */
export function mixedNotation(text: string): boolean {
	return MARK.test(text) && NOT_MARK.test(text);
}

/** D-C-15: a text with no mark and no line break is a plain text (the checked commit's). */
export function plainText(text: string): boolean {
	return !MARK.test(text) && !/[\r\n]/.test(text);
}

/**
 * D-C-8 (narrowed): the tokens (characters with their marks, a Ruby's and a TCY's box) `text` shows as a line of its own, or null when it is not one line. What `text` shows alone is what it must show
 * where it is written too (`outsideKept`).
 */
export function aloneKeys(options: SourceModelOptions, text: string): string[] | null {
	const alone = PmModeDocumentState.build(text, { ...options, collapsedHeadingLines: new Set() });
	return alone.doc.childCount === 1 && alone.doc.child(0).type.name === "line" ? lineTokenKeys(alone.doc.child(0)) : null;
}

/**
 * D-C-8 (narrowed, 2026-11-08): whether `text`, as a line of its own, shows as it is (`(笑)`, `3.14`, `e-mail`): then it is no notation, and the checked commit's refusal stands. A text that does
 * not (`**太字**`, `｜漢字《かんじ》`, `[[メモ]]`, `[^1]`) is itself a notation.
 */
export function showsAsItself(options: SourceModelOptions, text: string): boolean {
	const alone = PmModeDocumentState.build(text, { ...options, collapsedHeadingLines: new Set() });
	return alone.doc.textBetween(0, alone.doc.content.size, "\n", "\ufffc") === text;
}

/**
 * M1-7 (D-M17-10): whether source `offset` is in the `[label]:` of a definition line, the line's start and the `:`'s end included (the blanks before the label too). Text typed
 * there is no typed notation: its marks would make the line no definition, and the label would read as a reference with nothing to show (`*[^1]: 注`).
 */
export function inDefinitionLabel(block: BlockMapping, offset: number): boolean {
	const label = definitionLabelRange(block.decoration.dataset);
	return label !== null && offset >= block.from && offset <= block.from + label.to;
}

/** D-C-9: the pairs of an empty notation's opening and closing marks. */
const EMPTY_PAIRS: readonly (readonly [string, string])[] = [["《", "》"], ["**", "**"], ["*", "*"], ["~~", "~~"], ["==", "=="], ["｟", "｠"], ["[[", "]]"], ["`", "`"]];
/** D-C-9: the mark the text in each pair has when the notation is made (a Ruby's and a TCY's is the box). */
const PAIR_MARKS: Readonly<Record<string, string>> = { "**": "strong", "*": "em", "~~": "strike", "==": "highlight", "`": "code" };

/** The text of the line holding model position `pos`, and where `pos` is in it (atoms are one character, a Ruby's reading is not shown). */
function shownLine(state: PmModeDocumentState, pos: number): { text: string; at: number; index: number } {
	const $pos = state.doc.resolve(pos), line = $pos.parent;
	return { text: line.textBetween(0, line.content.size, "", "￼"), at: line.textBetween(0, $pos.parentOffset, "", "￼").length, index: state.sourceMap.blockIndexAtPm(pos) };
}

/**
 * D-C-9: the empty notation's pair the caret is in, when both its marks are shown as the characters they are (an empty Ruby `《》`, bold `****`, a TCY `｟｠` show themselves), and the text has no
 * mark and no line break (a mark in it could make a notation with something outside the pair: that is the checked commit's, refused as before). Null otherwise.
 */
export function emptyPairAt(ctx: EditContext, text: string): { open: string; close: string; pos: number } | null {
	if (/[\r\n]/.test(text) || MARK.test(text) || !text) return null;
	const target = resolveEditTarget(ctx);
	if (target.kind !== "caret") return null;
	const $pos = ctx.state.doc.resolve(target.pos), before = $pos.nodeBefore, after = $pos.nodeAfter;
	if (!before?.isText || !after?.isText || !$pos.parent.inlineContent) return null;
	const left = before.text ?? "", right = after.text ?? "";
	for (const [open, close] of EMPTY_PAIRS) if (left.endsWith(open) && right.startsWith(close)) return { open, close, pos: target.pos };
	return null;
}

/**
 * D-C-9: the display after the text went in shows the pair as the notation it is, and nothing else changed. The marks are gone and the text is inside (a Ruby's reading is not shown: its `｜` goes
 * with it), the text has the mark of the notation (bold, italic, ..., a Ruby's or a TCY's box: P3-1, 2026-11-08), the characters outside keep their marks, and no other line changes.
 */
function becameNotation(state: PmModeDocumentState, after: PmModeDocumentState, pair: { open: string; close: string; pos: number }, text: string): boolean {
	const old = shownLine(state, pair.pos), now = after.doc.maybeChild(old.index);
	if (!now) return false;
	const diff = changedBlocks(state.doc, after.doc);
	if (diff.oldTo - diff.from !== 1 || diff.newTo - diff.from !== 1) return false;
	const was = lineChars(state.doc.child(old.index)), is = lineChars(now), start = old.at - pair.open.length, end = old.at + pair.close.length;
	if (was.length !== old.text.length) return false;
	const sameChars = (a: { ch: string; marks: string }, b: { ch: string; marks: string }) => a.ch === b.ch && a.marks === b.marks;
	const tail = was.slice(end);
	if (pair.open === "《") {
		// The base: bare, or after the author's `｜` (which goes with the notation).
		const head = was.slice(0, start), bar = head.map(c => c.ch).lastIndexOf("｜");
		for (const kept of bar >= 0 ? [head, [...head.slice(0, bar), ...head.slice(bar + 1)]] : [head]) {
			const expected = [...kept, ...tail];
			if (kept.length === 0 || is.length !== expected.length || !expected.every((c, i) => sameChars(c, is[i]))) continue;
			if (is[kept.length - 1].container === `ruby:${text}`) return true;
		}
		return false;
	}
	const head = was.slice(0, start);
	if (is.length !== head.length + text.length + tail.length) return false;
	if (!head.every((c, i) => sameChars(c, is[i])) || !tail.every((c, i) => sameChars(c, is[head.length + text.length + i]))) return false;
	for (let i = 0; i < text.length; i++) {
		const c = is[head.length + i];
		if (c.ch !== text[i]) return false;
		const mark = PAIR_MARKS[pair.open];
		if (mark ? !c.marks.split(",").includes(mark) : pair.open === "[[" ? !/(^|,)link/.test(c.marks) : !c.container.startsWith("tcy:")) return false;
	}
	return true;
}

/** The Rubies of a document, in order: each as its base's text and its reading. */
function rubiesOf(doc: PMNode): string[] {
	const out: string[] = [];
	doc.descendants(node => { if (node.type.name === "ruby") out.push(`${node.textContent}\u0000${String(node.attrs.reading ?? "")}`); return true; });
	return out;
}
/** D-C-15: every Ruby of `before` (its base and its reading) is still there in `after`, in order: text put into a note changes no Ruby it did not mean to (a base that took the text in, a Ruby cut in two). */
export function rubiesKept(before: PMNode, after: PMNode): boolean {
	const old = rubiesOf(before);
	if (!old.length) return true;
	let next = 0;
	for (const ruby of rubiesOf(after)) if (next < old.length && ruby === old[next]) next++;
	return next === old.length;
}

/**
 * D-C-8 (narrowed): nothing outside the text written changed how it shows, and the text shows as it does alone (`alone`: its tokens as a line of its own). Either one line gained a run (the old
 * line's tokens, with their marks and its Rubies and boxes, are the new line's before and after a run, the kind and levels of the line are the same, and the run is the text's own tokens: its
 * characters and marks as they are when the text is read alone) or a line of its own came (it shows the text's own tokens) and no other block changed. A text that shows nothing (`[^1]` in a
 * task line's start) or shows its marks (`**太字****太**字`) is not written.
 */
export function outsideKept(before: PMNode, after: PMNode, alone: readonly string[]): boolean {
	const { from, oldTo, newTo } = changedBlocks(before, after);
	const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((key, i) => key === y[i]);
	if (oldTo === from) {
		if (newTo - from === 0) return alone.length === 0;
		return newTo - from === 1 && after.child(from).type.name === "line" && same(lineTokenKeys(after.child(from)), alone);
	}
	if (oldTo - from !== 1 || newTo - from !== 1) return false;
	const a = before.child(from), b = after.child(from);
	if (a.type.name !== "line" || b.type.name !== "line" || lineShape(a) !== lineShape(b)) return false;
	const x = lineTokenKeys(a), y = lineTokenKeys(b), n = y.length - x.length;
	if (n !== alone.length) return false;
	let prefix = 0;
	while (prefix < x.length && x[prefix] === y[prefix]) prefix++;
	let suffix = 0;
	while (suffix < x.length && x[x.length - 1 - suffix] === y[y.length - 1 - suffix]) suffix++;
	for (let k = Math.max(0, x.length - suffix); k <= Math.min(prefix, x.length); k++) if (same(y.slice(k, k + n), alone)) return true;
	return false;
}

/** What a verbatim insertion is for besides a paste: D-C-9's pair (whose result must display as the notation) and D-C-8's check that nothing outside changed. */
export interface VerbatimIntent {
	readonly pair?: { open: string; close: string; pos: number } | null;
	/** D-C-8: the tokens the text shows alone (`aloneKeys`); the text is written only where nothing outside it changes and it shows as they are (`outsideKept`). */
	readonly outside?: readonly string[];
}

/**
 * The verbatim insertion of `text` (a paste, D-C-8, D-C-9), or why it cannot be written. `intent.pair`: D-C-9's pair, whose result must display as the notation (`becameNotation`).
 * `intent.outside`: D-C-8, whose text is written only where nothing outside it changes (`outsideKept`). `userEvent`: `input.paste` for a paste, `input.type` for the two ways of typing.
 */
export function planVerbatim(ctx: EditContext, text: string, userEvent: EditUserEvent, note: string, intent: VerbatimIntent = {}): Plan {
	if (!text) return { kind: "noop", reason: "empty" };
	const { state, options } = ctx, map = state.sourceMap, verbatimNote = `${note}-notation`, pair = intent.pair ?? null;
	const target = resolveEditTarget(ctx);
	if (target.kind === "blocked") return blocked(target.reason);
	// D-C-15: a plain text (no mark, no line break) is the checked commit's, whole, wherever an insertion goes: at a caret, between blocks, on a block chosen whole (a paste only: the two ways of typing are not plain).
	const viaCommit = (): Plan => { const checked = planCommitChecked(ctx, text); return checked.kind === "edit" ? { ...checked, userEvent } : checked; };
	const plain = plainText(text) && !pair;
	const written = (changes: SourceChange[], editIntent: { from: number; to: number; insert: boolean }, caret: number): Plan => {
		const attempt = (list: SourceChange[]) => {
			const result = applySourceChanges(state.source, list);
			return keepsNotationOf(state, list, result, editIntent) ? applyCandidate(state, options, { changes: list, note: verbatimNote }, result) : null;
		};
		let checked = attempt(changes);
		if (!checked) return blocked("structure");
		// D-C-15: an insertion changes no Ruby of the note. A text taken into the base of a Ruby with no `｜` goes with the `｜` before the base (the commit's D22; after the text, so the caret stays).
		if (editIntent.insert && !rubiesKept(state.doc, checked.after.doc)) {
			const delimited = intent.outside ? null : withRubyDelimiter(state, changes);
			checked = delimited ? attempt(delimited) : null;
			if (!checked || !rubiesKept(state.doc, checked.after.doc)) return blocked("structure");
		}
		if (intent.outside && !outsideKept(state.doc, checked.after.doc, intent.outside)) return blocked("structure");
		if (pair && !becameNotation(state, checked.after, pair, text)) return blocked("structure");
		return editAtSource(checked, caret, userEvent);
	};
	if (target.kind === "all") {
		// The text replaces the body; the frontmatter stays (D15). With nothing after the frontmatter the text goes on a line of its own (as a commit).
		const atEnd = target.srcFrom >= state.source.length && target.from > 0;
		if (atEnd) return written([{ from: state.source.length, to: state.source.length, insert: "\n" + text }], { from: state.source.length, to: state.source.length, insert: true }, state.source.length + 1 + text.length);
		return written([{ from: target.srcFrom, to: state.source.length, insert: text }], { from: target.srcFrom, to: state.source.length, insert: false }, target.srcFrom + text.length);
	}
	if (target.kind === "block") {
		if (plain) return viaCommit();
		// B15: the atom stays; the text goes on a new line after it.
		const block = map.blockAtPm(map.pmFrom[target.index]);
		return written([{ from: block.to, to: block.to, insert: "\n" + text }], { from: block.to, to: block.to, insert: true }, block.to + 1 + text.length);
	}
	if (target.kind === "range" && boundaryOnly(state, target.from, target.to)) return planVerbatim(caretContext(ctx, target.from), text, userEvent, note, intent);
	if (target.kind === "range") {
		const refused = refusedRange(state, target.from, target.to);
		if (refused) return blocked(refused);
		// The range goes as its Backspace removes it (checked), and the text goes at the caret that leaves: one edit.
		const removed = planDeletion(ctx, "Backspace");
		if (removed.kind !== "edit") return removed.kind === "blocked" ? removed : blocked("structure");
		const inserted = planVerbatim(contextAfter(removed), text, userEvent, note);
		return inserted.kind === "edit" ? composeEdits(state, removed, inserted) : inserted;
	}
	const position = textPositionAt(state, target.pos);
	if (!position) {
		const index = map.blockIndexAtPm(target.pos), after = map.pmFrom[index] === target.pos && target.pos < state.doc.content.size;
		// D-C-16 (2026-11-08, the gate's first review): never above the frontmatter, whatever the text is. A line before its `---` makes the properties no frontmatter (the rule shows as a horizontal rule and
		// the YAML as text); the commit refuses it here, and so does a paste.
		if (after && index === 0 && state.doc.firstChild?.type.name === "frontmatter") return blocked("structure");
		if (plain) return viaCommit();
		// Between blocks: a new line there.
		const at = after ? map.srcFrom[index] : state.source.length;
		return written([{ from: at, to: at, insert: after ? text + "\n" : "\n" + text }], { from: at, to: at, insert: true }, after ? at + text.length : at + 1 + text.length);
	}
	const pos = outsideAtEdges(position), inside = position.container !== null && pos === position.pos;
	if (inside && position.container?.kind === "tcy") return blocked("inside-inline");
	if (plain) return viaCommit();
	// D-C-13 (B15 as a commit's): a line shown without text (a horizontal rule, a code fence) takes the text on a new line after it, never into the line (the text would be the fence's info string,
	// or the rule would be a paragraph).
	const { block } = position;
	if (contentStart(block) === contentEnd(block) && HIDDEN_LINE_KINDS.has(String(position.line.attrs.kind))) {
		return written([{ from: block.to, to: block.to, insert: "\n" + text }], { from: block.to, to: block.to, insert: true }, block.to + 1 + text.length);
	}
	// D-C-14: a Ruby's base takes no mark and no line break (they would break the Ruby).
	if (inside && position.container?.kind === "ruby" && (MARK.test(text) || /[\r\n]/.test(text))) return blocked("inside-inline");
	// D-C-15: where a plain character typed here goes (the commit's place), not the first place the source has (it may be between the hidden marks of an escape).
	const { places, offset, intent: editIntent } = insertionPlaces(ctx, block, pos, inside);
	let at = places[0] ?? offset;
	// (D-C-9's pair is between its two marks, which show as the characters they are: the commit refuses a plain character there, and the place is the caret's.)
	if (!pair) {
		const probe = planCommitChecked(ctx, "あ");
		if (probe.kind !== "edit") return probe.kind === "blocked" ? probe : blocked("structure");
		const put = probe.changes.find(change => change.insert === "あ" && change.from === change.to);
		if (!put) return blocked("structure");
		at = put.from;
	}
	if (inDefinitionLabel(block, at) || inDefinitionLabel(block, offset)) return blocked("structure");
	return written([{ from: at, to: at, insert: text }], editIntent, at + text.length);
}

/** D-C-4 to D-C-7: a paste of `text` (already `\n` for every line break). */
export function planPaste(ctx: EditContext, text: string): Plan {
	return planVerbatim(ctx, text, "input.paste", "paste");
}
