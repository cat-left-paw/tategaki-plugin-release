import type { PmModeDocumentState } from "../pm/document-state";
import type { Mark } from "../pm/prosemirror";
import { pmModeSchema as schema } from "../pm/schema";
import type { DisplayExpectation } from "./display-signature";
import { applyCandidate, firstExact, keepsComposedMarks, keepsNotationOf, lineTable } from "./edit-check";
import { blocked, boundaryOnly, caretContext, composeEdits, isFootnoteReference, typedTextAt, contextAfter, deleteShown, editAt, editAtSource, emptyLine, insertionPlaces, newTransform, rangeBases, refusedRange, shownSpan, variants, type Plan } from "./edit-plan";
import { resolveEditTarget, type EditContext } from "./edit-target";
import { contentEnd, contentStart, edgeMarks, HIDDEN_LINE_KINDS, outsideAtEdges, textPositionAt } from "./model-position";
import { applySourceChanges, lineStartAt, type SourceChange } from "./source-change";
import { seamJunctions } from "./notation-inventory";
import { planDeletion } from "./source-deletion";
import { aloneKeys, emptyPairAt, inDefinitionLabel, mixedNotation, planVerbatim, showsAsItself } from "./source-paste";

/**
 * Typed notation: input made only of Markdown and Aozora marks (ASCII symbols, `｜《》｟｠`) and ASCII
 * spaces, which complete a marker (`# `, `- `). Such input is written as typed when no candidate
 * keeps the display (M2 design §5.4.5): the writer is writing the notation. Input that mixes text
 * and marks is checked like any text (M2-1 review S2).
 */
export function isNotationPayload(text: string): boolean {
	return /^[!-/:-@[-`{-~｜《》｟｠ \t]+$/.test(text);
}
/**
 * Spaces alone are notation only where they complete a line's marker: the line's source before them
 * is marks, digits and spaces only (`#`, `- [ ]`, `1.`, `>`). Elsewhere they are text and are checked
 * (a space typed into an autolink's URL would end the link: not written, M2-1 second pass).
 */
function isNotationAt(text: string, source: string, offset: number): boolean {
	if (!isNotationPayload(text)) return false;
	if (!/^[ \t]+$/.test(text)) return true;
	const lineStart = lineStartAt(source, offset);
	return /^[ \t\d!-/:-@[-`{-~]*$/.test(source.slice(lineStart, offset));
}

/**
 * The commit of typed or converted text (M2 design §5.1): one source edit, checked to display the
 * text where the caret shows (§5.4), or blocked (the text is kept on the input surface).
 */
/**
 * The marks text replacing model range `[from, to)` takes: those of its first character that the
 * character after it has too (none at a line's end). A link's only when the two are one link's text
 * (the range inside it): typed text never joins another link with the same target (`[[A|**b**]]y`
 * and the next line's `[[A]]` stay two links; beyond Nyoze's `marksAcross`, whose links of one
 * target are one mark).
 */
function marksAcross(state: PmModeDocumentState, from: number, to: number): readonly Mark[] {
	const first = edgeMarks(state.doc.resolve(from).nodeAfter, false), next = edgeMarks(state.doc.resolve(to).nodeAfter, false);
	const shared = first.filter(mark => mark.isInSet(next) && !isFootnoteReference(mark) && (mark.type.name !== "link" || oneLink(state, from, to, mark)));
	// An image's or embed's class goes with its link (two images on two lines share the class, not a link).
	return shared.some(mark => mark.type.name === "link") ? shared : shared.filter(mark => !(mark.type.name === "mdClass" && (mark.attrs.classes as string[]).some(c => c === "tategaki-md-image" || c === "tategaki-md-embed")));
}
/** Whether all text of `[from, to)` has `link`, in one line: its first character and the one after it are one link's. */
function oneLink(state: PmModeDocumentState, from: number, to: number, link: Mark): boolean {
	const $from = state.doc.resolve(from), $to = state.doc.resolve(to);
	// By position: two lines of the same text may be one node object (the model reuses them).
	if ($from.depth < 1 || $to.depth < 1 || $from.before(1) !== $to.before(1)) return false;
	let whole = true;
	state.doc.nodesBetween(from, to, node => { if (node.isText && !link.isInSet(node.marks)) whole = false; return whole; });
	return whole;
}

/**
 * The commit of typed or converted text: the checked commit (`planCommitChecked`), and where it refuses a text because of what the display would show, the two ways of typing that the writer does
 * mean to write marks with (the clipboard stage; the author's decision of 2026-11-06): text typed into an empty notation (D-C-9: `《》` of a Ruby, `****`, `｟｠`, ...: the text goes between the marks, as
 * the notation's own) and marks and text in one commit (D-C-8: `**太字**`, `｜漢字《かんじ》`, `[[メモ]]`, ...). Both are written as the source they are (`source-paste.ts`); a refusal for another
 * reason, and every text with no mark in it (D-C-8), stay as they were. `marks` is the range commit's own recursion (its text goes as the checked commit's).
 */
export function planCommit(ctx: EditContext, text: string, marks?: readonly Mark[]): Plan {
	const plan = planCommitChecked(ctx, text, marks);
	if (plan.kind !== "blocked" || plan.reason !== "structure" || marks !== undefined) return plan;
	const pair = emptyPairAt(ctx, text);
	if (pair) {
		const written = planVerbatim(ctx, text, "input.type", "empty-pair", { pair });
		return written.kind === "edit" ? written : plan;
	}
	// D-C-8 (narrowed, 2026-11-08; round 3): only at a caret (never over a range: the range is the checked commit's, and a notation typed over it is refused), only a text that is itself a notation
	// (alone on a line it does not show as it is), and only where nothing outside it changes how it shows and it shows as it does alone.
	if (mixedNotation(text) && !/[\r\n]/.test(text) && !showsAsItself(ctx.options, text) && !overRange(ctx)) {
		const written = typedNotation(ctx, text);
		if (written) return written;
	}
	return plan;
}

/** Whether the selection is a range that something is removed from (the whole note, or more than the end of a line): D-C-8 does not write over one. */
function overRange(ctx: EditContext): boolean {
	const target = resolveEditTarget(ctx);
	return target.kind === "all" || (target.kind === "range" && !boundaryOnly(ctx.state, target.from, target.to));
}

/** D-C-17: a text that starts with a Ruby with no `｜` (`漢字《かんじ》`: a word registered with its reading). */
const BARE_RUBY_START = /^[\p{Script=Han}々〆ヵヶ]+《[^《》]*》/u;

/**
 * D-C-8 (and D-C-17): the notation `text` written as it is, or null. Where a Ruby with no `｜` starts the text and the kanji before the caret would be taken into its base (the checked
 * commit's D22: `東京` + `漢字《かんじ》`), the text goes with a `｜` before it (`東京｜漢字《かんじ》`), and that is checked as D-C-8 checks (it shows as the text alone does, nothing outside changes).
 */
function typedNotation(ctx: EditContext, text: string): Plan | null {
	const attempt = (written: string): Plan | null => {
		const keys = aloneKeys(ctx.options, written);
		if (!keys) return null;
		const plan = planVerbatim(ctx, written, "input.type", "mixed", { outside: keys });
		return plan.kind === "edit" ? plan : null;
	};
	return attempt(text) ?? (BARE_RUBY_START.test(text) ? attempt("｜" + text) : null);
}

/**
 * A text the commit does not write wherever it goes: it has a line break (`newline-in-payload`) or is empty (nothing to write). Said before the target is looked at, here and in the one function that says
 * what the target refuses (`commit-target-restriction.ts`, BLOCK-WARN1), so that the two rank the refusals alike.
 */
export function refusedWhereverItGoes(text: string): boolean {
	return !text || /[\r\n]/.test(text);
}

/** `marks`: the marks of the typed text (a range's, replaced as a deletion and then typed at its caret). */
export function planCommitChecked(ctx: EditContext, text: string, marks?: readonly Mark[]): Plan {
	if (refusedWhereverItGoes(text)) return /[\r\n]/.test(text) ? blocked("newline-in-payload") : { kind: "noop", reason: "empty" };
	const { state, options } = ctx, map = state.sourceMap;
	const target = resolveEditTarget(ctx);
	if (target.kind === "blocked") return blocked(target.reason);

	if (target.kind === "all") {
		const tr = newTransform(state).replaceWith(target.from, state.doc.content.size, emptyLine(text));
		const atEnd = target.srcFrom >= state.source.length && target.from > 0;
		const change: SourceChange = atEnd ? { from: state.source.length, to: state.source.length, insert: "\n" + text } : { from: target.srcFrom, to: state.source.length, insert: text };
		const checked = firstExact(state, options, [{ changes: [change], note: "all" }], { doc: tr.doc, anyKind: new Set([target.from > 0 ? 1 : 0]) }, { from: target.srcFrom, to: state.source.length, insert: false });
		return checked ? editAt(checked, target.from + 1 + text.length, "input.type") : blocked("structure");
	}
	if (target.kind === "block") {
		// B15: the atom stays; the text goes on a new line after it.
		const block = map.blockAtPm(map.pmFrom[target.index]);
		const tr = newTransform(state).insert(block.pmTo, emptyLine(text));
		const checked = firstExact(state, options, [{ changes: [{ from: block.to, to: block.to, insert: "\n" + text }], note: "after-block" }], { doc: tr.doc, anyKind: new Set([target.index + 1]) }, { from: block.to, to: block.to, insert: true });
		return checked ? editAt(checked, block.pmTo + 1 + text.length, "input.type") : blocked("structure");
	}
	if (target.kind === "range" && boundaryOnly(state, target.from, target.to)) return planCommit(caretContext(ctx, target.from), text);
	if (target.kind === "range") {
		const refused = refusedRange(state, target.from, target.to);
		if (refused) return blocked(refused);
		// The typed text takes the marks the range's first character and the character after it share
		// (PM's `marksAcross` with every mark non-inclusive, as Nyoze's range commit: a format or link
		// replaced in part goes on, one replaced whole or to its end does not; 2026-10-23). From inside a
		// Ruby's base (D14 (b)), the base's own: it goes on in the base, whose characters all have the
		// format and link around the Ruby (`**｜漢字《かんじ》**`, 字 replaced: `**｜漢x《かんじ》**`).
		const $start = state.doc.resolve(target.from);
		const marks = $start.parent.type.name === "ruby" ? edgeMarks($start.nodeAfter, false).filter(mark => !isFootnoteReference(mark)) : marksAcross(state, target.from, target.to);
		const tr = deleteShown(newTransform(state), target.from, target.to).insert(target.from, schema.text(text, marks));
		const bases = rangeBases(state, target.from, target.to, text, "range", "replace");
		const checked = firstExact(state, options, variants(state, bases), { doc: tr.doc }, { ...shownSpan(state, target.from, target.to), insert: false });
		if (checked) return editAt(checked, target.from + text.length, "input.type");
		// The range removed as a checked deletion, then the text at its caret (typed notation is written
		// there as typed, never across the hidden source of the range). First keeping the hidden runs it
		// makes meet, when they meet at one place: the text goes exactly there, between the two formats,
		// as a range's Enter breaks there (`**ab**x**cd**\n**$x$**`, `bxcd\n` replaced by あ, which the
		// math's format does not hold: `**a**あ**$x$**`).
		const kept = planDeletion(ctx, "Backspace", true);
		const junctions = kept.kind === "edit" ? seamJunctions(state.source, kept.changes, lineTable(state)) : [];
		if (kept.kind === "edit" && junctions.length === 1) {
			const at = junctions[0], typed = planCommit({ ...contextAfter(kept), selection: { anchor: at, head: at } }, text, marks);
			if (typed.kind === "edit" && typed.checked.source === kept.checked.source.slice(0, at) + text + kept.checked.source.slice(at)) {
				const composed = composeEdits(state, kept, typed);
				if (keepsComposedMarks(state, composed.changes, composed.checked.after)) return composed;
			}
		}
		const removed = planDeletion(ctx, "Backspace");
		if (removed.kind !== "edit") return removed.kind === "blocked" ? removed : blocked("structure");
		const typed = planCommit(contextAfter(removed), text, marks);
		return typed.kind === "edit" ? composeEdits(state, removed, typed) : typed;
	}

	const position = textPositionAt(state, target.pos);
	if (!position) {
		// Between blocks: a new line there (Nyoze's commit at a gap cursor).
		const index = map.blockIndexAtPm(target.pos), after = map.pmFrom[index] === target.pos && target.pos < state.doc.content.size;
		const change: SourceChange = after ? { from: map.srcFrom[index], to: map.srcFrom[index], insert: text + "\n" } : { from: state.source.length, to: state.source.length, insert: "\n" + text };
		const tr = newTransform(state).insert(target.pos, emptyLine(text));
		const newIndex = after ? index : state.doc.childCount;
		const checked = firstExact(state, options, [{ changes: [change], note: "gap" }], { doc: tr.doc, anyKind: new Set([newIndex]) }, { from: change.from, to: change.from, insert: true });
		return checked ? editAt(checked, target.pos + 1 + text.length, "input.type") : blocked("structure");
	}

	// B14 for Ruby and TCY: the inner start and end are outside. Text goes into a Ruby's base; a TCY is
	// one unit, as in Nyoze (an atom): nothing is typed into it (D13, decided again 2026-10-23).
	const pos = outsideAtEdges(position);
	const inside = position.container !== null && pos === position.pos;
	if (inside && position.container?.kind === "tcy") return blocked("inside-inline");
	const { places, offset, intent } = insertionPlaces(ctx, position.block, pos, inside);
	const tr = newTransform(state).insert(pos, marks ? schema.text(text, marks) : typedTextAt(state.doc, pos, text));
	const bases = places.map(at => ({ changes: [{ from: at, to: at, insert: text }], note: at === offset ? "direct" : "direct-gap" }));
	const checked = firstExact(state, options, variants(state, bases), { doc: tr.doc }, intent);
	if (checked) return editAt(checked, pos + text.length, "input.type");
	// A line shown without text (a horizontal rule, a code fence): the text goes on a new line after it (B15).
	const { block } = position;
	if (contentStart(block) === contentEnd(block) && HIDDEN_LINE_KINDS.has(String(position.line.attrs.kind))) {
		const after = newTransform(state).insert(block.pmTo, emptyLine(text));
		const next = firstExact(state, options, [{ changes: [{ from: block.to, to: block.to, insert: "\n" + text }], note: "after-line" }], { doc: after.doc, anyKind: new Set([position.blockIndex + 1]) }, { from: block.to, to: block.to, insert: true });
		if (next) return editAt(next, block.pmTo + 1 + text.length, "input.type");
	}
	// Typed notation, never inside a Ruby base or a TCY (it would break them), and never into another
	// notation's hidden part (a footnote reference's id, a URL: review m-1).
	const insert = [{ from: offset, to: offset, insert: text }], typed = applySourceChanges(state.source, insert);
	if (isNotationAt(text, state.source, offset) && !inside && !inDefinitionLabel(position.block, offset) && keepsNotationOf(state, insert, typed, intent)) return editAtSource(applyCandidate(state, options, { changes: insert, note: "notation" }, typed), offset + text.length, "input.type");
	return blocked("structure");
}

export type { DisplayExpectation };
