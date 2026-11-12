import type { PmModeDocumentState } from "../pm/document-state";
import type { PMNode } from "../pm/prosemirror";
import type { SourcePoint } from "../source/source-map";
import type { SourceModelOptions } from "../source/source-model";
import { HIDDEN_LINE_KINDS, splitsGrapheme, textPositionAt } from "./model-position";

/** CodeMirror's selection (the SoT), as source offsets. */
export interface SourceSelection { readonly anchor: number; readonly head: number }

/** What an edit plan reads (M2 design §4): the display state that matches CodeMirror's text. */
export interface EditContext {
	readonly state: PmModeDocumentState;
	/** The display options now (folded headings, settings); edits map the folds through their changes. */
	readonly options: SourceModelOptions;
	readonly selection: SourceSelection;
	/** Display positions for offsets shared by two positions (a bare Ruby's outside-before and inside-start). */
	readonly anchorHint?: SourcePoint | null;
	readonly headHint?: SourcePoint | null;
}

export type BlockedReason =
	/**
	 * A range put from outside (no hint) that covers part of a Ruby's base (D14: never widen silently
	 * when editing; the new mode's own selection edits the part it shows, D14 (b)).
	 */
	| "partial-ruby"
	/** A range that ends inside the source of an atom (a widget, folded lines, inline math). */
	| "partial-atom"
	/** The re-read display would differ from the intended one (§5.4). */
	| "structure"
	/** Inside a Ruby base or a TCY (Enter, D27). */
	| "inside-inline"
	/** Next to a block that is not edited by keys (a widget, folded lines, frontmatter, a code fence; D28). */
	| "atom-neighbor"
	/** Between blocks (no text position). */
	| "gap"
	| "newline-in-payload";

/**
 * The edit's target in the model document (flat, `state.doc`). The display selection and every plan
 * resolve the selection here, so what is shown and what is edited are the same.
 */
export type EditTarget =
	| { readonly kind: "caret"; readonly pos: number }
	| { readonly kind: "range"; readonly from: number; readonly to: number; readonly srcFrom: number; readonly srcTo: number }
	/** The whole document: the text after the frontmatter (D15, recommended (b)). */
	| { readonly kind: "all"; readonly from: number; readonly srcFrom: number }
	/** Exactly one atom block (B15). */
	| { readonly kind: "block"; readonly index: number }
	| { readonly kind: "blocked"; readonly reason: BlockedReason };

function hintFor(point: SourcePoint | null | undefined, offset: number): SourcePoint | undefined {
	return point && point.offset === offset ? point : undefined;
}

/**
 * The model position that shows source `offset`: the hint when it is that offset's, else the source
 * map's position kept in the offset's own line. The map takes a hidden run at a line's end (after a
 * link's `)`, a format's `**`) to the next line's start; CodeMirror's caret there is in this line, at
 * its end (M2-1 review S-1).
 */
export function shownAt(state: PmModeDocumentState, offset: number, bias: -1 | 1, hint?: SourcePoint): number {
	const map = state.sourceMap, pm = map.sourceToPm(offset, bias, hint);
	if (hint && pm === hint.affinity) return pm;
	const block = map.blockAtSource(offset);
	if (block.type !== "line") return pm;
	return Math.min(Math.max(pm, block.pmFrom + 1), block.pmTo - 1);
}

export function resolveEditTarget(ctx: EditContext): EditTarget {
	const { state } = ctx, map = state.sourceMap, source = state.source;
	const { anchor, head } = ctx.selection;
	const srcFrom = Math.min(anchor, head), srcTo = Math.max(anchor, head);
	const fromHint = anchor <= head ? ctx.anchorHint : ctx.headHint, toHint = anchor <= head ? ctx.headHint : ctx.anchorHint;
	if (srcFrom === srcTo) {
		const pos = shownAt(state, srcFrom, 1, hintFor(ctx.anchorHint, srcFrom));
		// A caret put from outside inside one grapheme: text or a break there would split it (M2-1 review 10 S-X').
		return splitsGrapheme(state.doc, pos) ? { kind: "blocked", reason: "structure" } : { kind: "caret", pos };
	}
	const first = state.blocks[0];
	if (srcFrom === 0 && srcTo === source.length) {
		const skip = first.node.type.name === "frontmatter" ? 1 : 0;
		return { kind: "all", from: skip ? first.node.nodeSize : 0, srcFrom: skip ? map.srcFrom[1] ?? source.length : 0 };
	}
	const i = map.blockIndexAtSource(srcFrom), block = map.blockAtSource(srcFrom);
	if (block.type !== "line" && block.from === srcFrom && block.to === srcTo) return { kind: "block", index: i };
	// An end strictly inside an atom's source would edit what is not shown.
	for (const offset of [srcFrom, srcTo]) {
		const b = map.blockAtSource(offset);
		if (b.type !== "line" && b.from < offset && offset < b.to) return { kind: "blocked", reason: "partial-atom" };
		for (const inline of b.inlines) if (inline.kind === "inlineMath" && inline.from < offset && offset < inline.to) return { kind: "blocked", reason: "partial-atom" };
	}
	// D14 (b), the author's decision of 2026-10-23 (as Nyoze): the new mode's own selection edits the
	// part of a Ruby's base it shows (`｜漢字《かんじ》` without 字 is `｜漢《かんじ》`: the reading stays),
	// each end it would widen given by its hint in the base (an inner edge is the outer one, below). One
	// put from outside (CodeMirror's selection in the notation's source) stays refused.
	const normalized = map.normalizeRange(srcFrom, srcTo);
	const own = (offset: number, widened: boolean, hint: SourcePoint | null | undefined) => {
		if (!widened) return true;
		const point = hintFor(hint, offset);
		// The hint's position within the document and showing that offset (M2-1 review 9 m-AR, review 10 m-AY).
		return !!point && point.affinity >= 0 && point.affinity <= state.doc.content.size && map.pmToSource(point.affinity) === offset && state.doc.resolve(point.affinity).parent.type.name === "ruby";
	};
	if (!own(srcFrom, normalized.from !== srcFrom, fromHint) || !own(srcTo, normalized.to !== srcTo, toHint)) return { kind: "blocked", reason: "partial-ruby" };
	let from = shownAt(state, srcFrom, 1, hintFor(fromHint, srcFrom)), to = shownAt(state, srcTo, -1, hintFor(toHint, srcTo));
	// An end inside one grapheme would leave half of it (a lone surrogate, an emoji's modifier without
	// it; only a selection put from outside can end there; M2-1 review 9 S-X).
	if (splitsGrapheme(state.doc, from) || splitsGrapheme(state.doc, to)) return { kind: "blocked", reason: "structure" };
	// An end between two blocks (a hint there) goes to the next line's start: a range to it takes the
	// line break before it, as the same source range without hints does (`a\nb`, end of `a` to before
	// `b`, joins them; M2-1 review 5 S-H).
	// Not into a line shown without text (a horizontal rule, a fence): the range would take it (review 7).
	const hiddenLine = (node: PMNode | null | undefined) => node?.type.name === "line" && HIDDEN_LINE_KINDS.has(String(node.attrs.kind));
	// Both ends between blocks, around one such line: that line chosen whole, as an atom's source (B15).
	const $around = state.doc.resolve(from), around = $around.nodeAfter;
	if ($around.parent === state.doc && around && from + around.nodeSize === to && hiddenLine(around)) return { kind: "block", index: $around.index() };
	const intoLine = (pos: number) => { const $pos = state.doc.resolve(pos), next = $pos.nodeAfter; return $pos.parent === state.doc && next?.type.name === "line" && !hiddenLine(next) ? pos + 1 : pos; };
	from = intoLine(from); to = intoLine(to);
	const $to = state.doc.resolve(to);
	// An end before one, after text chosen in the line before it: that line's end (its line break is not
	// taken; only the line break alone is, as the boundary before it, `boundaryOnly`).
	if ($to.parent === state.doc && hiddenLine($to.nodeAfter) && $to.nodeBefore?.type.name === "line" && from < to - 1) to -= 1;
	// A range of hidden source only shows as a caret, and is edited as one: at its start, or where the
	// text it shows at is (a start between two blocks shows at the next line's start; M2-1 review S1).
	const caretAt = (a: number, b: number): EditTarget => ({ kind: "caret", pos: textPositionAt(state, a) || !textPositionAt(state, b) ? a : b });
	if (from >= to) return caretAt(from, to);
	// A Ruby's or TCY's inner edges show where its outer ones do (the start before it, the end after
	// it): a range's ends there move outside, and its source ends to the notation's ends. So a range
	// over a whole base takes the notation whole (`｜漢字《かんじ》`, never leaving `｜《かんじ》`), and
	// one that only touches it leaves it out. The selection shown does not change.
	let wideFrom = srcFrom, wideTo = srcTo;
	for (const offset of [srcFrom, srcTo]) {
		const block = map.blockAtSource(offset);
		if (block.type !== "line") continue;
		for (const inline of block.inlines) {
			if (inline.kind === "inlineMath") continue;
			if (from === inline.pmFrom + 1) { from = inline.pmFrom; wideFrom = Math.min(wideFrom, inline.from); }
			else if (from === inline.pmTo - 1) { from = inline.pmTo; wideFrom = Math.max(wideFrom, inline.to); }
			if (to === inline.pmFrom + 1) { to = inline.pmFrom; wideTo = Math.min(wideTo, inline.from); }
			else if (to === inline.pmTo - 1) { to = inline.pmTo; wideTo = Math.max(wideTo, inline.to); }
		}
	}
	if (from >= to || wideFrom >= wideTo) return caretAt(Math.min(from, to), Math.max(from, to));
	return { kind: "range", from, to, srcFrom: wideFrom, srcTo: wideTo };
}
