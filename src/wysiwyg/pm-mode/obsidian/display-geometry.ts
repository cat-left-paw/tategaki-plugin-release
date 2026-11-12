// Reference: src/pm-mode-spike/geometry.ts `probeCaret` (S1, 2026-10-16). No import from the spike.
// Local changes: reads the new mode's display (PM, read-only); the caret is the display selection's start.
//   M3a: one reader for navigation/placement/reveal; optional head/end affinity, head for reveal, from for insertion.
//   M2-4d F6: a vertical empty line uses PM's BR box, after its marker and inline padding.
//   M3a round 2 (R2-2): the `end` affinity differs from `head` only across a soft wrap (same row: the head rect).
import type { EditorView, PMNode } from "../pm/prosemirror";
import type { PmModeDisplay } from "../pm/view";
import type { PlacementRect } from "./surface-placement";

/** What the input surface needs to sit at the caret: the caret's box and its line (viewport coordinates). */
export interface DisplayCaret {
	readonly rect: PlacementRect;
	/** The line's element (`tg-line`), or null when the position is not in a text line. */
	readonly block: HTMLElement | null;
}

function firstRect(range: Range): DOMRect | null {
	const rects = range.getClientRects();
	const first = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
	if (!first || (first.width === 0 && first.height === 0)) return null;
	return first;
}

/**
 * The box of the caret at `pos`. PM's `coordsAtPos` flattens a box to a vertical line, which is right for
 * horizontal text only. In vertical writing the caret is the start edge of the next character's box (or the end
 * edge of the previous one at a line's end), as a horizontal line (`top === bottom`), with the column's extent.
 */
export function readCaretRect(view: EditorView, pos: number, vertical: boolean, affinity: "head" | "end" = "head"): PlacementRect | null {
	const head = readRectAt(view, pos, vertical, "head");
	if (affinity === "head") return head;
	const end = readRectAt(view, pos, vertical, "end");
	if (!head || !end) return end ?? head;
	// R2-2: `end` differs from `head` only across a soft wrap, where the glyph before the position is on the previous column or row. Next to a
	// glyph of another size (TCY, a footnote mark) both boxes are on one row and differ only in their cross-axis extent: the caret stays at `head`.
	const center = (r: PlacementRect): number => vertical ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
	const span = (r: PlacementRect): number => vertical ? r.right - r.left : r.bottom - r.top;
	return Math.abs(center(end) - center(head)) <= Math.max(1, Math.max(span(end), span(head)) / 2 + 0.5) ? head : end;
}

function readRectAt(view: EditorView, pos: number, vertical: boolean, affinity: "head" | "end"): PlacementRect | null {
	if (!vertical) {
		try { return view.coordsAtPos(pos, affinity === "end" ? -1 : 1); } catch { return null; }
	}
	try {
		const { node, offset } = view.domAtPos(pos, affinity === "end" ? -1 : 0);
		const range = view.dom.ownerDocument.createRange();
		if (node.nodeType === 3) {
			const text = node as Text;
			if (offset < text.length && (affinity !== "end" || offset === 0)) {
				range.setStart(text, offset); range.setEnd(text, offset + 1);
				const r = firstRect(range);
				if (r) return { left: r.left, right: r.right, top: r.top, bottom: r.top };
			}
			if (offset > 0) {
				range.setStart(text, offset - 1); range.setEnd(text, offset);
				const r = firstRect(range);
				if (r) return { left: r.left, right: r.right, top: r.bottom, bottom: r.bottom };
			}
		} else if (node.nodeType === 1) {
			const element = node as Element, next = element.childNodes[offset], previous = offset > 0 ? element.childNodes[offset - 1] : undefined;
			// domAtPos may return the line outside a span that wraps over several columns. Its bounding box
			// covers all columns; use its first/last base character instead (never the Ruby reading).
			const edgeText = (candidate: Node | undefined, last: boolean): Text | null => {
				if (!candidate || ["BR", "RT", "RP"].includes(candidate.nodeName)) return null;
				if (candidate.nodeType === 3) return (candidate as Text).length ? candidate as Text : null;
				const children = Array.from(candidate.childNodes);
				if (last) children.reverse();
				for (const child of children) { const text = edgeText(child, last); if (text) return text; }
				return null;
			};
			const sides: readonly (readonly [Node | undefined, boolean])[] = affinity === "end" ? [[previous, true], [next, false]] : [[next, false], [previous, true]];
			for (const [candidate, last] of sides) {
				const text = edgeText(candidate, last);
				if (!text) continue;
				const at = last ? text.length - 1 : 0;
				range.setStart(text, at); range.setEnd(text, at + 1);
				const r = firstRect(range);
				if (r) { const y = last ? r.bottom : r.top; return { left: r.left, right: r.right, top: y, bottom: y }; }
			}
			// PM's empty-line BR follows the inline marker and padding. Leave nonempty lines unchanged.
			if (view.state.doc.resolve(pos).parent.content.size === 0) {
				const br = Array.from(element.children).find(child => child.nodeName === "BR");
				if (br) {
					const r = br.getBoundingClientRect();
					if (r.width || r.height) return { left: r.left, right: r.right, top: r.top, bottom: r.top };
				}
			}
			// No measurable BR: retain the original box fallback.
			const r = element.getBoundingClientRect();
			return { left: r.left, right: r.right, top: r.top, bottom: r.top };
		}
	} catch { /* No measurable base character. */ }
	return null;
}

/** The caret of the display selection's start, and its line; null when the selection is not in a text line. */
export function readDisplayCaret(display: PmModeDisplay, endpoint: "from" | "head" = "from", affinity: "head" | "end" = "head"): DisplayCaret | null {
	const view = display.view, pos = view.state.selection[endpoint];
	let $pos: ReturnType<PMNode["resolve"]>;
	try { $pos = view.state.doc.resolve(pos); } catch { return null; }
	if (!$pos.parent.inlineContent) return null;
	let block: HTMLElement | null = null;
	for (let depth = $pos.depth; depth > 0; depth--) {
		if ($pos.node(depth).type.name !== "line") continue;
		const dom = view.nodeDOM($pos.before(depth));
		if (dom && dom.nodeType === 1) block = dom as HTMLElement;
		break;
	}
	const win = view.dom.ownerDocument.defaultView;
	if (!win) return null;
	const vertical = win.getComputedStyle(block ?? view.dom).writingMode.startsWith("vertical");
	const rect = readCaretRect(view, pos, vertical, affinity);
	return rect ? { rect, block } : null;
}
