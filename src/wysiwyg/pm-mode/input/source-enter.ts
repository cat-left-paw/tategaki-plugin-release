import { resolveSoTBlockquoteContinuationEdit, resolveSoTListContinuationEdit, type SoTListContinuationEdit } from "../../sot/sot-list-enter";
import type { PmModeDocumentState } from "../pm/document-state";
import { pmModeSchema as schema } from "../pm/schema";
import { applyCandidate, firstExact, keepsComposedMarks, keepsHiddenMarks, keepsNotationOf, lineTable, preservesText } from "./edit-check";
import { blocked, boundaryOnly, caretContext, composeEdits, contextAfter, editAtSource, emptyLine, insertionPlaces, joinsFormats, newTransform, editAt, type Plan, type PlannedEdit } from "./edit-plan";
import { resolveEditTarget, type EditContext } from "./edit-target";
import { contentStart, insideFormat, outsideAtEdges, textPositionAt } from "./model-position";
import { seamJunctions } from "./notation-inventory";
import { renumberOrderedList } from "./ordered-list";
import { applySourceChanges, type SourceChange } from "./source-change";
import { planDeletion } from "./source-deletion";

/** Line kinds shown as a list item or a blockquote. */
const LIST_KINDS: ReadonlySet<string> = new Set(["list", "olist", "task", "blockquote"]);

/** The line holding `offset` and its start, in `text`. */
function lineAt(text: string, offset: number): { index: number; start: number } {
	let index = 0, start = 0;
	for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) { index++; start = i + 1; }
	return { index, start };
}
function lineText(text: string, start: number): string {
	const end = text.indexOf("\n", start);
	return text.slice(start, end < 0 ? text.length : end);
}

/**
 * The current mode's list / blockquote continuation (`S/sot-list-enter.ts`, as in `V:11986-12007`),
 * with the ordered-list renumbering, as one change in the old document's coordinates and the caret
 * in the new one.
 */
function continuationChange(source: string, lineKinds: readonly string[], edit: SoTListContinuationEdit): { change: SourceChange; caret: number } {
	const middle = applySourceChanges(source, [{ from: edit.from, to: edit.to, insert: edit.insert }]);
	// The kinds of the lines after the continuation: the lines it adds take the kind of the line they
	// come from (so the renumbering skips code lines; M2-1 review m-2). Unknown when it removes lines.
	const extra = middle.split("\n").length - lineKinds.length;
	let kinds: string[] = [...lineKinds];
	if (extra > 0) { const at = lineAt(source, edit.from).index; kinds.splice(at + 1, 0, ...new Array<string>(extra).fill(kinds[at] ?? "normal")); }
	else if (extra < 0) kinds = [];
	const renumber = renumberOrderedList(middle, kinds, edit.renumberStartLine, edit.renumberEndLine);
	const final = applySourceChanges(middle, renumber);
	// The caret keeps its place in its line; a renumbered marker before it changes the line's length.
	const caretLine = lineAt(middle, edit.nextCaret);
	// Renumbering replaces whole lines and adds none: the caret's line moves by the changes before it.
	let finalLine = caretLine.start;
	for (const change of renumber) if (change.to < caretLine.start) finalLine += change.insert.length - (change.to - change.from);
	const before = lineText(middle, caretLine.start), after = lineText(final, finalLine);
	let common = 0;
	while (common < before.length && common < after.length && before[common] === after[common]) common++;
	const inLine = edit.nextCaret - caretLine.start;
	const caret = finalLine + (inLine > common ? inLine + after.length - before.length : inLine);
	// One change: the common prefix and suffix of the old and new text are cut off.
	let prefix = 0;
	while (prefix < source.length && prefix < final.length && source[prefix] === final[prefix]) prefix++;
	let suffix = 0;
	while (suffix < source.length - prefix && suffix < final.length - prefix && source[source.length - 1 - suffix] === final[final.length - 1 - suffix]) suffix++;
	return { change: { from: prefix, to: source.length - suffix, insert: final.slice(prefix, final.length - suffix) }, caret };
}

/**
 * Two plans in a row as one edit, checked as a whole for hidden runs that meet (review 4 B-5) and math
 * between unlike runs (review 9 B-10; its first step may keep a seam beside math). Which
 * runs stay inert or beside math (`keepsInertRuns`) each step checked with its own changes: one change
 * for the whole cannot tell which of two equal runs went (`**$x$**\n**太**` without `$x$` and the
 * line breaks keeps the first `**` and takes the second).
 */
function checkedComposed(state: PmModeDocumentState, first: PlannedEdit, second: PlannedEdit): Plan {
	const composed = composeEdits(state, first, second);
	return keepsComposedMarks(state, composed.changes, composed.checked.after) ? composed : blocked("structure");
}

/**
 * Whether `final` is `middle` with a line break at `at`: the text before it is the same, and the line
 * after the break ends with the rest of that line (behind the marker a continuation adds; the lines
 * after it may be renumbered).
 */
function breaksAt(middle: string, final: string, at: number): boolean {
	if (final[at] !== "\n" || final.slice(0, at) !== middle.slice(0, at)) return false;
	const end = middle.indexOf("\n", at), rest = middle.slice(at, end < 0 ? middle.length : end);
	const next = final.indexOf("\n", at + 1);
	return final.slice(at + 1, next < 0 ? final.length : next).endsWith(rest);
}

/**
 * Enter and Shift+Enter (M2 design §5.3, D27): the current mode's list and blockquote continuation,
 * else a line break where the caret shows (a new line before a heading when at its start; a
 * footnote definition is a plain line since M1-7: its `[^1]:` shows, so Enter splits it like any line).
 * Shift+Enter only continues lists and blockquotes, as in the current mode.
 */
export function planEnter(ctx: EditContext, shift: boolean, typedBreak = true): Plan {
	const { state, options } = ctx, map = state.sourceMap;
	const target = resolveEditTarget(ctx);
	if (target.kind === "blocked") return blocked(target.reason);
	if (target.kind === "all") {
		if (shift) return { kind: "noop", reason: "shift" };
		// Everything after the frontmatter becomes two empty lines (the caret on the second).
		const lines = target.from < state.doc.content.size ? [emptyLine(), emptyLine()] : [emptyLine()];
		const tr = newTransform(state).replaceWith(target.from, state.doc.content.size, lines);
		const checked = firstExact(state, options, [{ changes: [{ from: target.srcFrom, to: state.source.length, insert: "\n" }], note: "all" }], { doc: tr.doc }, { from: target.srcFrom, to: state.source.length, insert: false });
		return checked ? editAt(checked, tr.doc.content.size - 1, "input") : blocked("structure");
	}
	if (target.kind === "block") {
		if (shift) return { kind: "noop", reason: "shift" };
		const block = map.blockAtPm(map.pmFrom[target.index]);
		const tr = newTransform(state).insert(block.pmTo, emptyLine());
		const checked = firstExact(state, options, [{ changes: [{ from: block.to, to: block.to, insert: "\n" }], note: "after-block" }], { doc: tr.doc, anyKind: new Set([target.index + 1]) }, { from: block.to, to: block.to, insert: true });
		return checked ? editAt(checked, block.pmTo + 1, "input") : blocked("structure");
	}

	// Shift+Enter over a range follows the current mode (V: `handleOverlayHardBreakEnter` in sot-wysiwyg-view.ts): its continuation is decided by the selection as it is, the list's
	// (`resolveSoTListContinuationEdit`, mode "hard-break") or, on a blockquote line, the blockquote's; when neither decides, it does nothing (a range over two lines never decides:
	// `sot-list-enter.ts` returns null). Removing the range first and deciding at its caret wrote a hard break and took the next item's marker (`1. 前の項  \n   後の項`). When one decides,
	// the way below (remove, then the continuation at the caret) stays. Within one line of a list or a blockquote the text that results is V's replacement (a list line: `1.   \n   の項\n2. 後の項`).
	// It is not V's literal replacement for a range that ends at the start of the next line (a selection put from outside; the display's own ranges end after the marker and decide nothing):
	// after the removal the text goes on in the form the continuation gives, e.g. for `- 前の項\n- 後の項` and the range `3..6` (`の項\n`) this gives `- 前  \n  後の項`, where V gives
	// `- 前  \n  - 後の項`. What is removed is the selected break and the next item's marker by the rule of Backspace, never what the range does not show; the oracle (R1) agrees (M3d review P3-4).
	// Enter is not changed (V replaces the range with `\n` when nothing decides).
	if (target.kind === "range" && shift) {
		const start = textPositionAt(state, target.from);
		const hardBreak = { doc: state.source, lineRanges: [...state.lineRanges], selection: ctx.selection, mode: "hard-break" as const };
		const decided = resolveSoTListContinuationEdit({ ...hardBreak, lineBlockKinds: state.lineModel.lineBlockKinds })
			?? (start && String(start.line.attrs.kind) === "blockquote" ? resolveSoTBlockquoteContinuationEdit(hardBreak) : null);
		if (!decided) return { kind: "noop", reason: "shift" };
	}
	// A range: removed as a checked deletion first, then the break at its caret (never across the
	// hidden source of the range; M2-1 review B2).
	if (target.kind === "range" && boundaryOnly(state, target.from, target.to)) return planEnter(caretContext(ctx, target.from), shift, typedBreak);
	if (target.kind === "range") {
		// First removed keeping the hidden runs it makes meet (`a**b**c\na**b**c`, the range `c\na`, gives
		// `a**b****b**c`): when they meet at one place and the break goes exactly there, the two formats
		// stay apart (`a**b**\n**b**c`). Else the runs go as far as they pair (M2-1 review 3 B-3; review 4
		// B-5: the break of a list continuation that renumbers is one change up to the last number, so
		// the final text is what tells where it went).
		let removed = planDeletion(ctx, "Backspace", true);
		const junctions = removed.kind === "edit" ? seamJunctions(state.source, removed.changes, lineTable(state)) : [];
		if (removed.kind === "edit" && junctions.length === 1) {
			// CodeMirror's caret at the junction: the break is tried there first (inside the hidden run).
			const broken = planEnter({ ...contextAfter(removed), selection: { anchor: junctions[0], head: junctions[0] } }, shift, false);
			if (broken.kind === "edit" && breaksAt(removed.checked.source, broken.checked.source, junctions[0])) return checkedComposed(state, removed, broken);
		}
		// Without a seam, the first step stands when it passes the check it skipped.
		if (removed.kind !== "edit" || junctions.length || !keepsHiddenMarks(state, removed.changes, removed.checked.after)) removed = planDeletion(ctx, "Backspace");
		if (removed.kind !== "edit") return removed.kind === "blocked" ? removed : blocked("structure");
		// A break written as typed (D27) only when the range was inside one format: when it joined two
		// (`` `a`x`b` `` → `` `ab` ``), the marks of the break would show where none were.
		const broken = planEnter(contextAfter(removed), shift, !joinsFormats(state, target.from, target.to));
		return broken.kind === "edit" ? checkedComposed(state, removed, broken) : broken;
	}
	const position = textPositionAt(state, target.pos);
	if (!position) {
		if (shift) return { kind: "noop", reason: "shift" };
		// Between blocks: an empty line there.
		const index = map.blockIndexAtPm(target.pos), before = map.pmFrom[index] === target.pos && target.pos < state.doc.content.size;
		const at = before ? map.srcFrom[index] : state.source.length;
		const tr = newTransform(state).insert(target.pos, emptyLine());
		const checked = firstExact(state, options, [{ changes: [{ from: at, to: at, insert: "\n" }], note: "gap" }], { doc: tr.doc, anyKind: new Set([before ? index : state.doc.childCount]) }, { from: at, to: at, insert: true });
		return checked ? editAt(checked, target.pos + 1, "input") : blocked("structure");
	}
	// D27: not inside a Ruby base or a TCY (their inner edges are outside, B14).
	const pos = outsideAtEdges(position);
	if (position.container && pos === target.pos) return blocked("inside-inline");
	// Where the break may go: CodeMirror's caret in the hidden run there, the places outside every
	// notation, where the caret shows (`offset`), the other cut places (`- \n- **b**`, not `- **\n- b**`).
	const { places, offset, intent } = insertionPlaces(ctx, position.block, pos, false);
	const keeps = (change: SourceChange, after: string) => keepsNotationOf(state, [change], after, intent);

	const kinds = state.lineModel.lineBlockKinds;
	// The blockquote continuation does not read the line kinds: only on a line shown as a blockquote (not in code).
	const quoteLine = String(position.line.attrs.kind) === "blockquote";
	const continuation = (at: number) => {
		const sel = { anchor: at, head: at }, mode = shift ? "hard-break" as const : "enter" as const;
		return resolveSoTListContinuationEdit({ doc: state.source, lineRanges: [...state.lineRanges], lineBlockKinds: kinds, selection: sel, mode })
			?? (quoteLine ? resolveSoTBlockquoteContinuationEdit({ doc: state.source, lineRanges: [...state.lineRanges], selection: sel, mode }) : null);
	};
	const startLine = position.block, kind = String(position.line.attrs.kind);
	const note = shift ? "continuation-hard-break" : "continuation";
	let typed: { checked: ReturnType<typeof applyCandidate>; caret: number } | null = null, continued = false;
	const inFormat = insideFormat(state.doc, pos);
	for (const at of places) {
		const edit = continuation(at);
		if (!edit) continue;
		continued = true;
		const { change, caret } = continuationChange(state.source, kinds, edit);
		const after = applySourceChanges(state.source, [change]);
		if (!keeps(change, after)) continue;
		const checked = applyCandidate(state, options, { changes: [change], note }, after);
		if (preservesText(state.doc, checked.after.doc) && keepsHiddenMarks(state, [change], checked.after)) return editAtSource(checked, caret, "input");
		if (at === offset && edit.from === edit.to && inFormat) typed = { checked: applyCandidate(state, options, { changes: [change], note: `${note}-break-in-format` }, after), caret };
	}
	// D27: strictly inside a format, the continuation is written as in the current mode (its marks show
	// on both lines). It only inserts (and renumbers): no visible character may be lost. Not inside a
	// link, an image or a footnote: the notation check refuses that (its URL or target would show as
	// text and the link would be gone; M2-1 review S-6).
	if (typed && typedBreak && preservesText(state.doc, typed.checked.after.doc, true) && keepsHiddenMarks(state, typed.checked.changes, typed.checked.after)) return editAtSource(typed.checked, typed.caret, "input");
	// A line shown as a list item or blockquote that cannot be continued is not broken otherwise. One
	// shown as a plain line (an indented line after an item, which the current mode continues) breaks
	// as a plain line.
	if (continued && LIST_KINDS.has(kind)) return blocked("structure");
	if (shift) return { kind: "noop", reason: "shift" };

	// At the start of a heading, the new line goes before it (the heading stays).
	if (pos === contentStart(startLine) && kind === "heading") {
		const tr = newTransform(state).insert(startLine.pmFrom, emptyLine());
		const checked = firstExact(state, options, [{ changes: [{ from: startLine.from, to: startLine.from, insert: "\n" }], note: "line-before" }], { doc: tr.doc }, { from: startLine.from, to: startLine.from, insert: true });
		return checked ? editAt(checked, pos + 2, "input") : blocked("structure");
	}
	const tr = newTransform(state);
	tr.split(pos, 1, [{ type: schema.nodes.line, attrs: { kind: "normal", classes: [], dataset: {}, styleVars: {} } }]);
	const newIndex = tr.doc.resolve(pos + 2).index(0);
	const anyKind = kind === "code" || kind === "code-fence" ? new Set([newIndex]) : undefined;
	// The cut places of a hidden run at the caret (before a format's opening marks: `\n**b**`, not
	// `**\nb**`; after a link's closing marks at a line's end; between two links).
	const bases: { changes: SourceChange[]; note: string }[] = places.map(at => ({ changes: [{ from: at, to: at, insert: "\n" }], note: at === offset ? "break" : "break-at-gap" }));
	const checked = firstExact(state, options, bases, { doc: tr.doc, anyKind }, intent);
	if (checked) return editAt(checked, pos + 2, "input");
	// D27: a break inside a format is written as in the current mode (its marks show on both lines). It
	// only inserts: nothing of the source is lost, and no visible character may be. Never next to a
	// format (between two links, before an image): there a break that keeps them is looked for. Never
	// inside a link, an image or a footnote (the notation check; review S-6).
	if (!inFormat || !typedBreak) return blocked("structure");
	const change = { from: offset, to: offset, insert: "\n" }, after = applySourceChanges(state.source, [change]);
	if (!keeps(change, after)) return blocked("structure");
	const raw = applyCandidate(state, options, { changes: [change], note: "break-in-format" }, after);
	return preservesText(state.doc, raw.after.doc, true) && keepsHiddenMarks(state, [change], raw.after) ? editAtSource(raw, offset + 1, "input") : blocked("structure");
}
