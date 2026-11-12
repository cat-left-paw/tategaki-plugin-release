import type { EditorView } from "../../pm/prosemirror";

/** D21: PM's posAtCoords is not a vertical Shadow DOM authority. Read only detached geometry. */
export function positionAtPoint(view: EditorView, x: number, y: number): number | null {
	const doc = view.dom.ownerDocument, root = view.dom.getRootNode();
	const shadow = root.nodeType === 11 ? root as ShadowRoot : null;
	// A target chunk can still have estimated auto content. Read its descendant layout before hit testing,
	// without changing styles or the chunk controller's measured-size/anchor protocol.
	const element = shadow?.elementFromPoint(x, y) ?? doc.elementFromPoint(x, y);
	const chunk = element?.closest("tg-chunk");
	if (chunk && view.dom.contains(chunk)) {
		const line = chunk.querySelector("tg-line");
		if (line) { const range = doc.createRange(); range.selectNodeContents(line); range.getClientRects(); }
	}
	const api = doc as Document & { caretPositionFromPoint?: (x: number, y: number, options?: { shadowRoots: ShadowRoot[] }) => { offsetNode: Node; offset: number } | null };
	const hit = api.caretPositionFromPoint?.(x, y, { shadowRoots: shadow ? [shadow] : [] });
	if (!hit || !view.dom.contains(hit.offsetNode)) return null;
	try { return view.posAtDOM(hit.offsetNode, hit.offset); } catch { return null; }
}

/**
 * R3-1: the position of the part under a point, for a point that has no caret position (a tall part's box holds no text). Null when the point is not
 * on a part (`tg-widget`) of this view. Read only; used to find where the next visible line beyond that part is.
 */
export function partPositionAtPoint(view: EditorView, x: number, y: number): number | null {
	const doc = view.dom.ownerDocument, root = view.dom.getRootNode();
	const shadow = root.nodeType === 11 ? root as ShadowRoot : null;
	const element = (shadow?.elementFromPoint(x, y) ?? doc.elementFromPoint(x, y))?.closest("tg-widget");
	if (!element || !view.dom.contains(element)) return null;
	try { return view.posAtDOM(element, 0); } catch { return null; }
}
