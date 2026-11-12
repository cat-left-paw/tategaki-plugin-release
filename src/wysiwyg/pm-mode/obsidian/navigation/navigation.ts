// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/navigation.ts @ 020b5501 (2026-10-22)
// Local changes: normalized flat/source endpoints go only to SourceOwner.select; CM annotation tracks origin;
//   per-view Home/End; no NodeSelection, DOM Selection, content transaction or Host focus; existing reveal port;
//   D-C-20: a character move whose selection write was taken back by the note's own editor writes the next stops (selection only, bounded).
import { EditorState as CmState, type Transaction as CmTransaction } from "@codemirror/state";
import { EditorState, TextSelection, type Transaction } from "../../pm/prosemirror";
import type { PmModeDisplay } from "../../pm/view";
import type { SourcePoint } from "../../source/source-map";
import { pmModeInput } from "../edit-guard";
import { normalizeNavigationSelection } from "./normalize";
import { readContentOrigin } from "../content-coordinates";
import { createLineGeometry } from "./line-geometry";
import { characterMove } from "./characters";
import { createHomeEndState } from "./home-end";
import { resolveRubyBoundaryArrowAnchor } from "./ruby-boundary";
import { resolveRubyAwareVisualLineEdge } from "./ruby-visual-edge";
import { inlineStart } from "./geometry";
import { pageTarget } from "./page";
import { projectAllSelectionToText } from "./all-selection";
import { documentEdge, extendDirectionalEdge, navigationAnchor, nextGoal, rangeLineOrigin, retainLineGoal, stopAtAnchor, type NavigationAffinity, type NavigationOp } from "./rules";
import { resolveSupportedEditorWritingMode, type SupportedEditorWritingMode } from "./writing-mode";
import { pmModeNavigation } from "./origin";
export { pmModeNavigation } from "./origin";

/**
 * D-C-20: the most selection-only writes a character move repeats after the first one, when each was taken back to the selection before the key
 * (the note's Live Preview does that at what it hides: an unclosed emphasis mark, a footnote definition's label). It only bounds the walk along
 * a line; a move that is not taken back writes once.
 */
export const NAVIGATION_RETRY_LIMIT = 64;

/** Extra provenance on the same transaction; the existing selection port and its audit stay unchanged. */
export function createNavigation(options: {
	display: PmModeDisplay; scrollHost: HTMLElement;
	/** M3c round 2 (R2-7): the extent of the tail spacer now (Typewriter's room after the last line; 0 without it): a PageDown does not go into it. */
	tailExtent?(): number;
	select(anchor: number, head: number, hints: { anchor: SourcePoint; head: SourcePoint }): boolean;
	selectAll(): boolean;
	isAllSelection(): boolean;
	resync(): void;
	record?(kind: string, detail?: Record<string, unknown>): void;
}) {
	const { display, scrollHost } = options, view = display.view, token = {}, homeEnd = createHomeEndState();
	let mode: SupportedEditorWritingMode = "horizontal-tb", geometry: ReturnType<typeof createLineGeometry> | null = null;
	let goal: number | null = null, affinity: NavigationAffinity = "head", selecting = false;
	let rememberedDoc = view.state.doc, rememberedSelection = view.state.selection;
	const clear = () => { goal = null; affinity = "head"; homeEnd.reset(); };
	const sync = (transactions: readonly CmTransaction[] = []) => {
		const nextMode = resolveSupportedEditorWritingMode(view.dom.ownerDocument.defaultView?.getComputedStyle(view.dom).writingMode ?? "") ?? "horizontal-tb";
		if (!geometry || nextMode !== mode) { mode = nextMode; geometry = createLineGeometry(view, mode); clear(); }
		const ours = transactions.length > 0 && transactions.every(tr => tr.annotation(pmModeNavigation) === token);
		if (!ours && (rememberedDoc !== view.state.doc || !rememberedSelection.eq(view.state.selection))) clear();
		rememberedDoc = view.state.doc; rememberedSelection = view.state.selection;
	};
	const flat = (pos: number) => display.displayLayout?.toFlat(pos, display.state.sourceMap.pmFrom) ?? pos;
	const shown = (pos: number) => display.displayLayout?.toDisplay(pos, display.state.sourceMap.pmFrom) ?? pos;
	/**
	 * The only navigation write: fail closed, then one CM selection transaction. Never dispatch to PM here. `attempted` is whether a transaction was
	 * made; `pulledBack` (D-C-20) whether it left the display on the selection it had before the write, though another one was asked for.
	 */
	const putSelection = (anchor: number, head: number, againstCm = false): { written: boolean; attempted: boolean; pulledBack: boolean } => {
		const model = display.state, beforeDoc = view.state.doc, none = { written: false, attempted: false, pulledBack: false };
		const ends = normalizeNavigationSelection(model, anchor, head);
		if (!ends) { options.record?.("navigation-end-not-visible", { anchor, head }); return none; }
		const selection = TextSelection.create(beforeDoc, shown(ends.anchor), shown(ends.head));
		if (!selection.$anchor.parent.inlineContent || !selection.$head.parent.inlineContent || beforeDoc !== view.state.doc) return none;
		// Closing an exact CM all-selection onto a one-position display compares equal to the display, not to CM: write it.
		if (!againstCm && selection.eq(view.state.selection)) return none;
		const beforeSelection = view.state.selection;
		geometry?.endReadBatch();
		selecting = true;
		try {
			const written = options.select(ends.anchor, ends.head, { anchor: model.sourceMap.point(ends.anchor), head: model.sourceMap.point(ends.head) });
			options.resync();
			if (view.state.doc !== beforeDoc) throw new Error("Navigation attempted a content transaction");
			const differs = !selection.eq(view.state.selection);
			if (differs) options.record?.("navigation-selection-difference", { anchor: ends.anchor, head: ends.head });
			return { written, attempted: true, pulledBack: written && differs && beforeSelection.eq(view.state.selection) };
		} finally { selecting = false; rememberedDoc = view.state.doc; rememberedSelection = view.state.selection; }
	};
	const put = (anchor: number, head: number, againstCm = false): boolean => putSelection(anchor, head, againstCm).written;
	const dispatch = (tr: Transaction) => {
		if (tr.docChanged || tr.doc !== view.state.doc) throw new Error("Navigation attempted a content transaction");
		if (!tr.selection.$anchor.parent.inlineContent || !tr.selection.$head.parent.inlineContent) return false;
		return put(flat(tr.selection.anchor), flat(tr.selection.head));
	};
	/** What navigation moves from: an exact CM all-selection is projected to its first..last visible text position, its direction kept. */
	const originSelection = () => {
		const actual = view.state.selection;
		if (!options.isAllSelection()) return actual;
		const projected = projectAllSelectionToText(view.state.doc);
		// A Shift-created whole-document range can be backward. Projection changes endpoints, never its direction.
		return projected && (actual.anchor > actual.head ? TextSelection.create(view.state.doc, projected.to, projected.from) : projected);
	};
	return {
		// transactionExtender adds only provenance, without a second dispatch or changing the selection audit.
		extension: CmState.transactionExtender.of(tr => selecting && tr.annotation(pmModeInput) === "selection" ? { annotations: pmModeNavigation.of(token) } : null),
		sync,
		get mode(): SupportedEditorWritingMode { sync(); return mode; },
		get affinity(): NavigationAffinity { return affinity; },
		get goal(): number | null { return goal; },
		selectAll(): boolean {
			sync(); clear();
			selecting = true;
			try { const written = options.selectAll(); options.resync(); return written; }
			finally { selecting = false; rememberedDoc = view.state.doc; rememberedSelection = view.state.selection; }
		},
		/**
		 * R2-10 (H11, as CodeMirror's `simplifySelection`): close a range, an all-selection included, to its head caret. One `select`
		 * write with hints. A collapsed selection, or an all-selection without a visible position, writes nothing. The goal and the Home/End phase
		 * end; the affinity stays (a head that was shown at the end of a wrapped column stays there).
		 */
		closeRange(): boolean {
			sync();
			const all = options.isAllSelection();
			if (!all && view.state.selection.empty) return false;
			const before = originSelection();
			if (!before) return false;
			goal = null; homeEnd.reset();
			const head = flat(before.head);
			return put(head, head, all);
		},
		navigate(op: NavigationOp): boolean {
			sync(); const g = geometry;
			if (!g) return false;
			const before = originSelection();
			if (!before) return false;
			const forward = op.direction === "forward", sign = forward ? 1 : -1;
			const selectionAt = (head: number) => {
				const anchor = op.extend ? resolveRubyBoundaryArrowAnchor(view.state, op.direction) : before.anchor;
				if (op.extend && (op.axis === "document" || op.axis === "line-edge")) {
					const next = extendDirectionalEdge(anchor, before.empty ? anchor : before.head, head, op.direction);
					return TextSelection.create(view.state.doc, next.anchor, next.head);
				}
				const target = op.extend && !before.empty && op.axis === "line" ? stopAtAnchor(anchor, before.head, head) : head;
				return TextSelection.create(view.state.doc, navigationAnchor(anchor, target, op.extend), target);
			};
			const setHead = (head: number) => dispatch(view.state.tr.setSelection(selectionAt(head)));
			const edge = () => { const blocks = g.all(); return blocks.length ? documentEdge(blocks[0].start, blocks[blocks.length - 1].end, op.direction) : before.head; };
			if (op.axis !== "line") goal = null;
			if (op.axis !== "line-edge") homeEnd.reset();
			g.beginReadBatch();
			try {
				if (op.axis === "document") { affinity = forward ? "end" : "head"; return setHead(edge()); }
				if (op.axis === "page") {
					affinity = "head";
					// R2-3: a point is taken only if the selection it makes is on visible text (the same rule as the write); else the next point.
					const visibleHead = (head: number): boolean => {
						try {
							const target = selectionAt(head);
							return target.$anchor.parent.inlineContent && target.$head.parent.inlineContent
								&& normalizeNavigationSelection(display.state, flat(target.anchor), flat(target.head)) !== null;
						} catch { return false; }
					};
					const result = pageTarget(view, scrollHost, mode, before.head, forward, !before.empty && !op.extend, visibleHead, options.tailExtent?.() ?? 0);
					// R3-1: no visible text in the viewport (a part taller than a page): the edge of the next visible line beyond what the point hit, in document
					// order in the paging direction, nearest edge (the start going forward, the end going back). One select; the reveal scrolls there. None: nothing is written.
					// A point that hit nothing the model knows (a rule's own box, say) leaves no hit: the caret's own position is the reference then. A hit on
					// this side of the caret (the padding of a chunk that is not laid out yet) is not beyond anything: the reference is never behind the caret.
					if (result.head === null && result.reason === "page-no-visible-point") {
						let tried = 0;
						const reference = result.hit == null ? before.head : forward ? Math.max(result.hit, before.head) : Math.min(result.hit, before.head);
						for (const block of g.blocksBeyond(reference, sign)) {
							const edge = forward ? block.start : block.end;
							if (visibleHead(edge)) { options.record?.("navigation-page", { reason: "page-neighbor-block", hit: result.hit ?? null, edge }); return setHead(edge); }
							if (++tried >= 2000) break; // a long run of rules is walked; the bound only guards a pathological document
						}
					}
					options.record?.("navigation-page", { reason: result.reason });
					return result.head === null ? false : setHead(result.head);
				}
				if (op.axis === "line-edge") {
					const originAffinity = !op.extend && !before.empty ? "head" : affinity;
					affinity = forward ? "end" : "head";
					const origin = before.empty ? before.head : forward ? before.to : before.from, block = g.blockAt(origin);
					if (!block) return false;
					const current = g.locate(origin, originAffinity);
					const visual = resolveRubyAwareVisualLineEdge(view, forward ? "end" : "home", block.start, block.end)
						?? (current ? g.position(current.line, 0, forward ? "end" : "home")?.pos ?? null : null);
					const target = op.visualOnly ? visual : homeEnd.plan({ ...block, origin, forward, extend: op.extend, empty: before.empty, visual }).head;
					return target === null ? false : setHead(target);
				}
				if (op.axis === "character") {
					// R2-2: forward (toward the end of the document) shows the caret at the end of a wrapped column, backward at the head
					// of the next one, as Obsidian's editor does. Nyoze keeps `head` for characters: a difference (ORIGIN.md).
					affinity = forward ? "end" : "head";
					const block = g.blockAt(before.head); if (!block) return false;
					const adjacent = g.neighborBlock(block, sign), model = display.state;
					const state = EditorState.create({ doc: model.doc, selection: TextSelection.create(model.doc, flat(before.anchor), flat(before.head)) });
					// An exact CM all-selection is not retried: what takes a write back is compared with the display selection, which an all-selection projects.
					const move = characterMove(state, model, { start: flat(block.start), end: flat(block.end) }, adjacent ? { start: flat(adjacent.start), end: flat(adjacent.end) } : null, op, options.isAllSelection() ? 0 : NAVIGATION_RETRY_LIMIT);
					let result = putSelection(move.first.anchor, move.first.head);
					if (!result.pulledBack) return result.written;
					// D-C-20 (the one exception to "a key press writes once", D-M3-1): the write was taken back to where the caret was, by the note's own editor
					// (Live Preview). The same selection-only write, to the next stop in the same direction, until one is kept or the line and its neighbour's edge are
					// used up. A different selection than before ends it, even if it is not the one asked for: the display follows what the note's editor placed.
					let tried = 0, last = result;
					for (const next of move.retries) {
						tried++; result = putSelection(next.anchor, next.head);
						if (result.attempted) last = result;
						if (!result.pulledBack) break;
					}
					if (!result.attempted || result.pulledBack) options.record?.("navigation-pulled-back", { tried, requested: move.first.head });
					else if (result.written) options.record?.("navigation-retried", { tried, requested: move.first.head, landed: flat(view.state.selection.head) });
					return last.written;
				}
				const current = g.locate(before.head, rangeLineOrigin(before.anchor, before.head, goal, affinity));
				if (!current) return false;
				const empty = current.block.start === current.block.end, retain = retainLineGoal(mode, op.extend, before.empty);
				const fromEmpty = empty && (goal === null || !retain), emptyRect = empty ? (view.nodeDOM(current.block.start - 1) as Element).getBoundingClientRect() : null;
				// A range with no goal yet takes its goal from the caret of the row it starts the line move from (the upstream row at a soft wrap: `current`), however the
				// range was made (R3-2 for line-edge ranges, R4-1 for the others; native and V do the same). Nyoze takes it from the downstream caret.
				const goalRect = current.rect;
				const inlineScroll = (mode === "vertical-rl" ? scrollHost.scrollTop : scrollHost.scrollLeft) * readContentOrigin(scrollHost).scale;
				goal = nextGoal(goal, inlineStart(emptyRect ?? goalRect, mode) + inlineScroll, "line", retain);
				const line = g.neighbor(current, sign);
				if (!line) { affinity = forward ? "end" : "head"; options.record?.("navigation-line-edge", { direction: op.direction }); return setHead(edge()); }
				const target = g.position(line, (goal ?? 0) - inlineScroll, fromEmpty ? "home" : undefined);
				if (!target || !g.accept(target.pos, line, target.affinity)) return false;
				if (fromEmpty && retain) { const landed = g.read(target.pos, target.affinity); if (landed) goal = nextGoal(null, inlineStart(landed, mode) + inlineScroll, "line"); }
				affinity = target.affinity; return setHead(target.pos);
			} finally { g.endReadBatch(); rememberedDoc = view.state.doc; rememberedSelection = view.state.selection; }
		},
	};
}
