// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/characterNavigation.ts @ 020b5501 (2026-10-22)
// Local changes: shown line inventory, ruby/tcy schema names, pointer-normalized stops; never a NodeSelection;
//   D-C-20: the stops beyond the caret are also listed as retry targets (see `characterMove`).
import { TextSelection, type EditorState } from "../../pm/prosemirror";
import type { PmModeDocumentState } from "../../pm/document-state";
import { normalizeNavigationSelection } from "./normalize";
import { resolveRubyBoundaryArrowAnchor } from "./ruby-boundary";
import { stopAtAnchor, type NavigationOp } from "./rules";

export interface Textblock { start: number; end: number }
const Segmenter = (Intl as typeof Intl & { Segmenter: new (locale: string, options: { granularity: "grapheme" }) => { segment(text: string): Iterable<{ index: number; segment: string }> } }).Segmenter;
const segmenter = new Segmenter("ja", { granularity: "grapheme" });

/** Detached model positions, before any display/chunk projection. */
export function characterStops(model: PmModeDocumentState, block: Textblock): number[] {
	const boundaries = new Set([block.start, block.end]);
	model.doc.nodeAt(block.start - 1)?.descendants((child, offset) => {
		const start = block.start + offset;
		if (child.isText) {
			boundaries.add(start);
			for (const part of segmenter.segment(child.text ?? "")) boundaries.add(start + part.index + part.segment.length);
		} else if (child.isInline) {
			boundaries.add(start); boundaries.add(start + child.nodeSize);
			if (child.isAtom || child.type.name === "tcy") return false;
		}
		return true;
	});
	return [...boundaries].filter(pos => {
		const normalized = normalizeNavigationSelection(model, pos, pos);
		return normalized?.anchor === pos && normalized.head === pos;
	}).sort((a, b) => a - b);
}

/** The stops beyond `pos` in one direction, nearest first, and the edge of the neighbouring line last (D-C-20). */
function characterSteps(model: PmModeDocumentState, block: Textblock, adjacent: Textblock | null, forward: boolean, pos: number): number[] {
	const ordered = characterStops(model, block);
	const beyond = forward ? ordered.filter(p => p > pos) : ordered.filter(p => p < pos).reverse();
	const edge = forward ? adjacent?.start : adjacent?.end;
	return edge === undefined ? beyond : [...beyond, edge];
}

/**
 * The selection of a character move, and (D-C-20) the selections of the steps after it, in the same direction: what the move writes again if the
 * first write is taken back by the note's own editor (Live Preview). `retries` has at most `retryLimit` entries; it is empty for a range that only
 * collapses to its edge (no step is taken) and for `retryLimit` 0.
 */
export function characterMove(state: EditorState, model: PmModeDocumentState, block: Textblock, adjacent: Textblock | null, op: NavigationOp, retryLimit = 0): { first: EditorState["selection"]; retries: EditorState["selection"][] } {
	const { selection, doc } = state, forward = op.direction === "forward";
	// Pointer hints may name either Ruby boundary alias. Search from its canonical, visually identical end,
	// so the next step crosses a block atom via the shown-line inventory rather than Selection.near.
	const pos = normalizeNavigationSelection(model, selection.head, selection.head)?.head ?? selection.head;
	if (!selection.empty && !op.extend) return { first: TextSelection.create(doc, forward ? selection.to : selection.from), retries: [] };
	const boundaryAnchor = resolveRubyBoundaryArrowAnchor(state, op.direction), anchor = op.extend ? boundaryAnchor : pos;
	// Canonical stops already omit Ruby aliases. A range's anchor is a real stop (including the document end).
	const steps = characterSteps(model, block, adjacent, forward, pos);
	const at = (target: number) => {
		const head = op.extend && !selection.empty ? stopAtAnchor(anchor, pos, target) : target;
		return TextSelection.create(doc, op.extend ? anchor : head, head);
	};
	const first = at(steps[0] ?? pos), retries: EditorState["selection"][] = [];
	// A range that went over its anchor stops at it (`stopAtAnchor`): the steps beyond make that same selection again, which is not tried twice.
	let previous = first;
	for (const step of steps.slice(1, 1 + retryLimit)) {
		const next = at(step);
		if (next.anchor !== previous.anchor || next.head !== previous.head) { retries.push(next); previous = next; }
	}
	return { first, retries };
}

export function characterSelection(state: EditorState, model: PmModeDocumentState, block: Textblock, adjacent: Textblock | null, op: NavigationOp): EditorState["selection"] {
	return characterMove(state, model, block, adjacent, op).first;
}
