import type { PmModeDocumentState } from "../pm/document-state";
import { HIDDEN_LINE_KINDS, footnoteReferenceAt, textPositionAt } from "../input/model-position";

/** The ends of a pointer selection in model (flat) positions, `anchor` where the gesture began. */
export interface PointerEnds { readonly anchor: number; readonly head: number }

/** A notation that is one unit to the pointer: no caret and no end of a range stays inside it (J8). */
interface PointerUnit {
	/** The model range of the whole notation (outer ends). */
	readonly from: number;
	readonly to: number;
	/** The positions that are inside the unit but show where its outer ends do: its inner start and inner end. */
	readonly innerStart: number | null;
	readonly innerEnd: number | null;
	/** The number of characters the unit shows. */
	readonly size: number;
	/** The position of the first of those characters. */
	readonly first: number;
}

function unitAt(state: PmModeDocumentState, pos: number): PointerUnit | null {
	const text = textPositionAt(state, pos);
	if (!text) return null;
	const container = text.container;
	// TCY is an atom (D13): its content is the digits, between an inner start and an inner end that show the outer ends.
	if (container?.kind === "tcy") {
		return { from: container.pmFrom, to: container.pmTo, innerStart: container.pmFrom + 1, innerEnd: container.pmTo - 1, size: container.pmTo - container.pmFrom - 2, first: container.pmFrom + 1 };
	}
	// A footnote reference shows its number, not the id characters the position counts (M2-1 report §8, 2). Positions
	// inside it are not a place a caret or an end of a range can be.
	const reference = footnoteReferenceAt(state, text.block, pos);
	if (reference && reference.pmFrom < pos && pos < reference.pmTo) {
		return { from: reference.pmFrom, to: reference.pmTo, innerStart: null, innerEnd: null, size: reference.pmTo - reference.pmFrom, first: reference.pmFrom };
	}
	return null;
}

function inVisibleText(state: PmModeDocumentState, pos: number): boolean {
	if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
	const text = textPositionAt(state, pos);
	return !!text && !HIDDEN_LINE_KINDS.has(String(text.line.attrs.kind));
}

/**
 * J7 and J8: the ends of a pointer selection, as the display can honor them. An end that is not a position in the
 * text of a line the display shows (an atom, a part, a gap, a line shown without text) gives null: the gesture does
 * not put a selection (CodeMirror's stays). An end inside a unit (TCY, the number of a footnote reference):
 *   - a click (one position) goes to the nearer outer end, the exact middle to the later one;
 *   - a range end goes to the outer end on the side that contains the whole unit (its start moves before the unit, its end
 *     after it), except at an inner edge, which shows an outer end already and goes to that one;
 *   - both ends in one unit select that unit whole.
 * An end in the base of a Ruby is left as it is (D14 (b)): the part of the base is selected, never widened.
 * The reading of a Ruby is no position at all (it is an attribute the display draws): the display maps what is
 * drawn there to an edge of the base, and that is kept as it is.
 */
export function normalizePointerSelection(state: PmModeDocumentState, anchor: number, head: number): PointerEnds | null {
	if (!inVisibleText(state, anchor) || !inVisibleText(state, head)) return null;
	if (anchor === head) {
		const unit = unitAt(state, anchor);
		if (!unit) return { anchor, head };
		const offset = anchor - unit.first;
		// Half of the characters decides; the exact middle goes to the end after.
		const pos = offset * 2 < unit.size ? unit.from : unit.to;
		return { anchor: pos, head: pos };
	}
	const forward = anchor < head;
	let from = forward ? anchor : head, to = forward ? head : anchor;
	const startUnit = unitAt(state, from), endUnit = unitAt(state, to);
	if (startUnit) from = from === startUnit.innerEnd ? startUnit.to : startUnit.from;
	if (endUnit) to = to === endUnit.innerStart ? endUnit.from : endUnit.to;
	// An end that moved to the other end of the range (an inner edge) leaves nothing selected: a caret.
	if (from >= to) return { anchor: from, head: from };
	return forward ? { anchor: from, head: to } : { anchor: to, head: from };
}
