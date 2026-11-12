import type { PmModeDocumentState } from "../pm/document-state";
import { Fragment } from "../pm/prosemirror";
import type { BlockMapping } from "../source/source-map";
import type { SourceModelOptions } from "../source/source-model";
import type { DisplayExpectation } from "./display-signature";
import { firstExact } from "./edit-check";
import { blocked, boundaryOnly, caretContext, deleteShown, editAt, emptyLine, newTransform, rangeBases, refusedRange, shownSpan, variants, type EditUserEvent, type Plan } from "./edit-plan";
import { resolveEditTarget, type EditContext } from "./edit-target";
import { contentEnd, contentStart, footnoteReferenceAt, graphemeAt, HIDDEN_LINE_KINDS, MARKER_KINDS, prefixEnd, sourceEndAt, sourceStartAt, textPositionAt, type TextPosition } from "./model-position";
import type { EditIntent } from "./notation-inventory";
import type { SourceChange } from "./source-change";

export type DeleteKey = "Backspace" | "Delete";

/** `removes`: the old source the deletion means to remove (the notation check keeps everything else). */
function check(state: PmModeDocumentState, options: SourceModelOptions, bases: { changes: SourceChange[]; note: string }[], expected: DisplayExpectation, caret: number, userEvent: EditUserEvent, removes: { from: number; to: number }, withVariants = true, keepSeams = false): Plan {
	const intent: EditIntent = { ...removes, insert: false };
	const checked = firstExact(state, options, withVariants ? variants(state, bases) : bases, expected, intent, keepSeams);
	return checked ? editAt(checked, caret, userEvent) : blocked("structure");
}

/**
 * The deletion of the shown units `[pmFrom, pmTo)` of one line (a grapheme, a Ruby / TCY / math, a
 * footnote reference): `first` as given, then the edits a range over them would try (the marks of a
 * format or link they leave empty go with them, one edge of a hidden run at a time; M2-1 review S-2).
 */
function unitBases(state: PmModeDocumentState, first: SourceChange, pmFrom: number, pmTo: number, note: string): { changes: SourceChange[]; note: string }[] {
	return [...rangeBases(state, pmFrom, pmTo, "", note, "delete"), { changes: [first], note }];
}

/** A model document without block `index` (an empty line when it was the only one). */
function withoutBlock(state: PmModeDocumentState, index: number) {
	const children: import("../pm/prosemirror").PMNode[] = [];
	state.doc.forEach((child, _offset, i) => { if (i !== index) children.push(child); });
	if (!children.length) children.push(emptyLine());
	return state.doc.copy(Fragment.fromArray(children));
}
/** The source of a whole line with one of its line breaks (the following one, else the preceding one). */
function wholeLine(state: PmModeDocumentState, block: BlockMapping): SourceChange {
	return block.to < state.source.length ? { from: block.from, to: block.to + 1, insert: "" } : { from: Math.max(0, block.from - 1), to: block.to, insert: "" };
}
/** The model position of the caret after removing block `index` (the next line's start, else the previous line's end). */
function caretAfterRemoving(state: PmModeDocumentState, index: number): number {
	const map = state.sourceMap, start = map.pmFrom[index];
	const next = state.doc.childCount > index + 1 ? state.doc.child(index + 1) : null;
	if (next) return next.type.name === "line" ? start + 1 : start;
	if (index === 0) return 1;
	const previous = state.doc.child(index - 1);
	return previous.type.name === "line" ? start - 1 : start;
}

/** Delete one block (a horizontal rule) and keep the caret where it shows. */
function deleteBlock(ctx: EditContext, index: number, userEvent: EditUserEvent, caretAfter: number): Plan {
	const { state, options } = ctx, block = state.sourceMap.blockAtPm(state.sourceMap.pmFrom[index]);
	return check(state, options, [{ changes: [wholeLine(state, block)], note: "delete-line" }], { doc: withoutBlock(state, index) }, caretAfter, userEvent, block, false);
}

/**
 * Backspace / Delete (M2 design §5.2, D12, D28, D30): one grapheme, one Ruby / TCY / inline math
 * notation, a line's marker, a line break, a horizontal rule, or the selected range. Every plan is
 * checked to display the intended result (§5.4), or blocked.
 */
/** `keepSeams`: a range removed as the first step of its Enter (`firstExact`). */
export function planDeletion(ctx: EditContext, key: DeleteKey, keepSeams = false): Plan {
	const { state, options } = ctx, backward = key === "Backspace";
	const userEvent: EditUserEvent = backward ? "delete.backward" : "delete.forward";
	const target = resolveEditTarget(ctx);
	if (target.kind === "blocked") return blocked(target.reason);

	if (target.kind === "all") {
		const keep = target.from > 0 ? [state.doc.child(0)] : [emptyLine()];
		const doc = state.doc.copy(Fragment.fromArray(keep));
		const change: SourceChange = target.from > 0 ? { from: Math.max(0, target.srcFrom - 1), to: state.source.length, insert: "" } : { from: 0, to: state.source.length, insert: "" };
		if (change.from >= change.to) return { kind: "noop", reason: "empty" };
		return check(state, options, [{ changes: [change], note: "all" }], { doc }, target.from > 0 ? doc.content.size : 1, userEvent, change, false);
	}
	if (target.kind === "block") return deleteBlock(ctx, target.index, userEvent, caretAfterRemoving(state, target.index));
	// Only the end of a shown line before a horizontal rule or fence: as Delete there (D28; M2-1 review 6
	// S-O). From a hidden line itself (`---` to a fence) it is a range (the two lines join).
	if (target.kind === "range" && boundaryOnly(state, target.from, target.to) && !HIDDEN_LINE_KINDS.has(String(state.doc.resolve(target.from).parent.attrs.kind))) return planDeletion(caretContext(ctx, target.from), "Delete");
	if (target.kind === "range") {
		const refused = refusedRange(state, target.from, target.to);
		if (refused) return blocked(refused);
		const $from = state.doc.resolve(target.from), $to = state.doc.resolve(target.to);
		const tr = deleteShown(newTransform(state), target.from, target.to);
		const bases = rangeBases(state, target.from, target.to, "", "range", "delete");
		// A range that ends at block boundaries (whole blocks) takes one line break with it.
		const atBoundary = $from.parent === state.doc || $to.parent === state.doc;
		if (atBoundary) for (const base of [...bases]) {
			if (base.changes.length !== 1) continue;
			const only = base.changes[0];
			if (only.to < state.source.length && state.source[only.to] === "\n") bases.push({ changes: [{ ...only, to: only.to + 1 }], note: `${base.note}+line-break` });
			else if (only.from > 0 && state.source[only.from - 1] === "\n") bases.push({ changes: [{ ...only, from: only.from - 1 }], note: `${base.note}+line-break` });
		}
		return check(state, options, bases, { doc: tr.doc }, target.from, userEvent, shownSpan(state, target.from, target.to), true, keepSeams);
	}

	let position = textPositionAt(state, target.pos);
	if (!position) return blocked("gap");
	const { container } = position;
	let pos = target.pos;

	// Inside a Ruby or TCY (D30, D13; as in Nyoze, decided 2026-10-23): the inner start (Backspace) /
	// end (Delete) is outside; from anywhere else the whole notation goes (a Ruby's base is not
	// deleted one grapheme at a time, a TCY is one unit).
	if (container) {
		if (backward ? pos === container.pmFrom + 1 : pos === container.pmTo - 1) {
			pos = backward ? container.pmFrom : container.pmTo;
			position = { ...position, pos, container: null };
		} else return deleteInline(ctx, position, container.pmFrom, userEvent);
	}
	const $pos = state.doc.resolve(pos);
	const neighbor = backward ? $pos.nodeBefore : $pos.nodeAfter;
	if (neighbor && !neighbor.isText) return deleteInline(ctx, position, backward ? pos - neighbor.nodeSize : pos, userEvent);
	if (neighbor) return deleteGrapheme(ctx, position, pos, backward, userEvent);
	return backward ? deleteAtLineStart(ctx, position, userEvent) : deleteAtLineEnd(ctx, position, userEvent);
}

function deleteGrapheme(ctx: EditContext, position: TextPosition, pos: number, backward: boolean, userEvent: EditUserEvent): Plan {
	const { state, options } = ctx, { block, container } = position;
	const parent = container ? state.doc.resolve(container.pmFrom + 1).parent : position.line;
	const start = container ? container.pmFrom + 1 : contentStart(block);
	const range = graphemeAt(parent, start, pos, backward);
	if (!range) return blocked("structure");
	// A footnote reference shows a number, not its id: it goes whole (M2-1 review B3).
	const reference = footnoteReferenceAt(state, block, range.from);
	if (reference) {
		const tr = newTransform(state).delete(reference.pmFrom, reference.pmTo);
		const whole = { from: reference.from, to: reference.to, insert: "" };
		return check(state, options, [{ changes: [whole], note: "footnote-reference" }, ...unitBases(state, whole, reference.pmFrom, reference.pmTo, "footnote-reference")], { doc: tr.doc }, reference.pmFrom, userEvent, whole);
	}
	const change = { from: sourceStartAt(block, range.from), to: sourceEndAt(block, range.to), insert: "" };
	if (change.from >= change.to) return blocked("structure");
	const tr = newTransform(state).delete(range.from, range.to);
	return check(state, options, unitBases(state, change, range.from, range.to, "grapheme"), { doc: tr.doc }, range.from, userEvent, change);
}

function deleteInline(ctx: EditContext, position: TextPosition, at: number, userEvent: EditUserEvent): Plan {
	const { state, options } = ctx, { block } = position;
	const inline = block.inlines.find(item => item.pmFrom === at);
	if (!inline) return blocked("structure");
	const tr = newTransform(state).delete(inline.pmFrom, inline.pmTo);
	const whole = { from: inline.from, to: inline.to, insert: "" };
	return check(state, options, unitBases(state, whole, inline.pmFrom, inline.pmTo, inline.kind), { doc: tr.doc }, inline.pmFrom, userEvent, whole);
}

function lineKind(state: PmModeDocumentState, index: number): string | null {
	const node = state.doc.child(index);
	return node.type.name === "line" ? String(node.attrs.kind) : null;
}

function deleteAtLineStart(ctx: EditContext, position: TextPosition, userEvent: EditUserEvent): Plan {
	const { state, options } = ctx, map = state.sourceMap, { block, blockIndex } = position;
	const kind = String(position.line.attrs.kind);
	if (kind === "hr") return deleteBlock(ctx, blockIndex, userEvent, caretAfterRemoving(state, blockIndex));
	if (HIDDEN_LINE_KINDS.has(kind)) return blocked("atom-neighbor");
	if (MARKER_KINDS.has(kind)) {
		// D12: the marker goes; the line becomes a plain line with the same text.
		const end = prefixEnd(block);
		if (end > block.from) {
			const tr = newTransform(state).setNodeMarkup(block.pmFrom, undefined, { kind: "normal", classes: [], dataset: {}, styleVars: {} });
			return check(state, options, [{ changes: [{ from: block.from, to: end, insert: "" }], note: "marker" }], { doc: tr.doc }, position.pos, userEvent, { from: block.from, to: end });
		}
	}
	if (blockIndex === 0) return { kind: "noop", reason: "document-start" };
	const previousKind = lineKind(state, blockIndex - 1);
	if (previousKind === "hr") return deleteBlock(ctx, blockIndex - 1, userEvent, position.pos - state.doc.child(blockIndex - 1).nodeSize);
	if (previousKind === null || HIDDEN_LINE_KINDS.has(previousKind)) return blocked("atom-neighbor");
	// Join with the previous line (D12: a line without a marker).
	const previous = map.blockAtPm(map.pmFrom[blockIndex - 1]);
	const tr = newTransform(state).join(block.pmFrom);
	return check(state, options, [{ changes: [{ from: previous.to, to: block.from, insert: "" }], note: "join" }], { doc: tr.doc }, contentEnd(previous), userEvent, { from: previous.to, to: block.from });
}

function deleteAtLineEnd(ctx: EditContext, position: TextPosition, userEvent: EditUserEvent): Plan {
	const { state, options } = ctx, map = state.sourceMap, { block, blockIndex } = position;
	const kind = String(position.line.attrs.kind);
	if (kind === "hr") return deleteBlock(ctx, blockIndex, userEvent, caretAfterRemoving(state, blockIndex));
	if (HIDDEN_LINE_KINDS.has(kind)) return blocked("atom-neighbor");
	if (blockIndex === state.doc.childCount - 1) return { kind: "noop", reason: "document-end" };
	const nextKind = lineKind(state, blockIndex + 1);
	if (nextKind === "hr") return deleteBlock(ctx, blockIndex + 1, userEvent, position.pos);
	if (nextKind === null || HIDDEN_LINE_KINDS.has(nextKind)) return blocked("atom-neighbor");
	// Join with the next line; its marker goes (§5.2), its text follows.
	const next = map.blockAtPm(map.pmFrom[blockIndex + 1]);
	const to = MARKER_KINDS.has(nextKind) ? prefixEnd(next) : next.from;
	const tr = newTransform(state).join(next.pmFrom);
	return check(state, options, [{ changes: [{ from: block.to, to, insert: "" }], note: "join" }], { doc: tr.doc }, position.pos, userEvent, { from: block.to, to });
}
