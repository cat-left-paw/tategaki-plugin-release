// Reference: src/pm-mode-spike/pointerLending.ts (S1 / S3, 2026-10-16) and Nyoze's pointer lending. No import from the spike.
// Local changes: the lending of M2 design §6.2, as decided in the M2-2 brief (J7, J8, J14, J15): the whole gesture
//   is the browser's native selection; at the end it is read once, normalized, and put into CodeMirror by one
//   selection-only transaction, and the focus goes back to the surface in the same event.
//   M3b: the click count (H5, D-M3-14: a margin gesture of two or more clicks puts nothing; a triple click selects its line,
//   never the line break), the Shift gesture (D-M3-13: CodeMirror's anchor stays, the head is the point of the release), and
//   the drag from a footnote number (D-M3-11). A view whose element went into another window is made again (`pm-mode-view.ts`, R3-1),
//   so the listeners stay on the document they were made on.
import type { EditorView } from "../pm/prosemirror";
import type { PmModeDisplay } from "../pm/view";
import type { SurfaceEvent } from "../input/surface-state";
import type { SourcePoint } from "../source/source-map";
import type { InputSurface, SurfaceRecord } from "./input-surface";
import { asElement, containsComposed, eventOrigin, selectionOf, type ViewRoot } from "./composed-tree";
import { normalizePointerSelection } from "./pointer-selection";
import { positionAtPoint } from "./navigation/point";
import { textPositionAt } from "../input/model-position";

export type FlushResult = "ok" | "no-api" | "threw";

/**
 * Whether a press of a mouse button lends the pointer (begins a lease): the primary button with none of Ctrl, Cmd and Alt (Shift does: D-M3-13). A press that does not is not the new mode's: its
 * `mousedown` is stopped too (D-C-18, `context-menu.ts`), so that the browser's own handling of it cannot move the display's selection while CodeMirror's stays.
 */
export function lendsPointer(press: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "altKey">): boolean {
	return press.button === 0 && !press.ctrlKey && !press.metaKey && !press.altKey;
}

/**
 * Make PM read the DOM selection now. `domObserver.flush` is an internal API of ProseMirror (as in Nyoze's
 * `flushHostDomObserver`): this is the only place that touches it, and a missing or throwing API changes nothing.
 */
export function flushDomObserver(view: EditorView): FlushResult {
	const observer = (view as unknown as { domObserver?: { flush?: () => void } }).domObserver;
	if (!observer || typeof observer.flush !== "function") return "no-api";
	try { observer.flush(); return "ok"; } catch { return "threw"; }
}

export interface PointerLendingOptions {
	/** The view's element: a gesture is the user's when its pointerdown begins inside it (a part, the margin and the text alike: J7). */
	container: HTMLElement;
	display: PmModeDisplay;
	surface: InputSurface;
	/** The owner's selection port (`PmModeSourceOwner.select`): model positions and their source hints. */
	select(anchor: number, head: number, hints: { readonly anchor: SourcePoint; readonly head: SourcePoint }): boolean;
	/** Put the display selection back in line with CodeMirror's (after a gesture that changed only the display). */
	resync(): void;
	transition(event: SurfaceEvent): void;
	/** A pointer gesture began inside the view (any button): a boundary for what the surface remembers of the last input (S3). */
	boundary?(): void;
	record?: SurfaceRecord;
}

/**
 * The pointer lends the focus to the browser for one gesture and takes it back in the `pointerup` (or `pointercancel`).
 * A `pointerdown` of the primary button without Ctrl, Cmd or Alt inside the view begins a lease (Shift too: D-M3-13); nothing is
 * prevented, so the native selection, links and fold toggles act as before. At `pointerup`, in this order and in this event:
 * (1) when the DOM selection lies in the text of the PM root, PM reads it, the ends are normalized (J7, J8) and put
 * into CodeMirror by one selection-only transaction; otherwise CodeMirror's selection is not changed (a gesture of Shift
 * puts the anchor it has and the point of the release; a triple click puts its line; a margin gesture of two clicks puts
 * nothing); (2) the display
 * selection is put back in line with CodeMirror's; (3) the surface takes the focus. The keys typed during the gesture are
 * lost (a known limit, design §6.3).
 */
export function createPointerLending(options: PointerLendingOptions) {
	const { container, display, surface } = options;
	const record: SurfaceRecord = options.record ?? (() => {});
	const doc = container.ownerDocument;
	// `onText`: the gesture began on a text line of the PM root, not on the page's margin, the root's blank area or a part.
	// `extend`: Shift was held at the pointerdown (D-M3-13). `detail`: the click count of this gesture (1 until its `mousedown`: the
	// pointer events carry 0 in `detail`; the compatibility `mousedown` of the same gesture carries the count). `line`: the text line it began on.
	// `reference`: the gesture began on the number of a footnote reference: its element and the position under the pointer (display position).
	// `taskBox` (D-C-26): the gesture began on the checkbox of a task line (a widget ProseMirror does not read a selection in).
	let lease: { readonly pointerId: number; readonly onText: boolean; readonly extend: boolean; detail: number; readonly line: Element | null; readonly anchor: number | null; readonly reference: { readonly pos: number; readonly element: Element } | null; readonly taskBox: Element | null } | null = null;

	const onDown = (event: PointerEvent): void => {
		if (!event.isTrusted) return;
		const origin = asElement(eventOrigin(event));
		if (!containsComposed(container, origin)) return;
		options.boundary?.();
		if (!event.isPrimary || !lendsPointer(event)) return;
		if (lease) record("lease-overwritten", { pointerId: lease.pointerId });
		const inRoot = origin && display.view.dom.contains(origin) ? origin : null, line = inRoot?.closest("tg-line") ?? null, onText = !!line;
		// D-M3-11 (J25): the browser's own drag does not start a selection from the number of a footnote reference (an inline box with the number drawn over
		// its characters: the selection of the drag collapses to the pointer, observed in Chromium even with the generated number taking no pointer). A gesture
		// that begins there and moves is made from the two points, as Shift's is.
		const referenceElement = onText && !event.shiftKey ? inRoot?.closest(".tategaki-md-footnote-ref") ?? null : null;
		const pos = referenceElement ? positionAtPoint(display.view, event.clientX, event.clientY) : null;
		// D-M3-13: the anchor Shift keeps is read now, before the browser's own handling of the press (and PM's reading of it) can touch the display selection.
		const taskBox = onText ? inRoot?.closest(".tategaki-md-task-box") ?? null : null;
		lease = { pointerId: event.pointerId, onText, extend: event.shiftKey, detail: 1, line, anchor: event.shiftKey ? textAnchor() : null, reference: referenceElement && pos !== null ? { pos, element: referenceElement } : null, taskBox };
		options.transition({ type: "pointerdown" });
	};
	// H5 / D-M3-14: the click count is the `mousedown`'s `detail` (Chromium gives pointer events 0). It belongs to the lease it follows at once.
	const onMouseDown = (event: MouseEvent): void => {
		if (!event.isTrusted || !lease || event.button !== 0 || event.detail < 1) return;
		lease.detail = event.detail;
	};

	/** The anchor of the display selection (model position), or null when it is not a text selection. */
	const textAnchor = (): number | null => {
		const selection = display.view.state.selection;
		if ((selection as { node?: unknown }).node !== undefined || !selection.$anchor.parent.inlineContent || !selection.$head.parent.inlineContent) return null;
		return flatOf(selection.anchor);
	};
	/** The model (flat) position of a display position. */
	const flatOf = (pos: number): number => display.displayLayout ? display.displayLayout.toFlat(pos, display.state.sourceMap.pmFrom) : pos;
	/** Whether a range holds a character the display shows (text, a Ruby's base, TCY digits, an inline atom) and not only line breaks. */
	const holdsVisible = (a: number, b: number): boolean => {
		let found = false;
		display.state.doc.nodesBetween(Math.min(a, b), Math.max(a, b), node => {
			if (found) return false;
			if ((node.isText && !!node.text) || (node.isInline && node.isLeaf)) found = true;
			return !found;
		});
		return found;
	};
	/** `needsVisible`: a gesture of two or more clicks puts nothing when what it selected holds only line breaks (R2-6, H18: a click on the blank of a line must not join it to the next). */
	const putEnds = (anchor: number, head: number, tag: string, needsVisible = false): boolean => {
		const state = display.state, ends = normalizePointerSelection(state, anchor, head);
		if (!ends) { record("pointer-end-not-text"); return false; }
		if (needsVisible && ends.anchor !== ends.head && !holdsVisible(ends.anchor, ends.head)) { record("pointer-break-only"); return false; }
		const map = state.sourceMap;
		const written = options.select(ends.anchor, ends.head, { anchor: map.point(ends.anchor), head: map.point(ends.head) });
		record(tag, { anchor: ends.anchor, head: ends.head, written });
		return written;
	};
	/**
	 * D-M3-13: Shift keeps the anchor of the selection the display shows (CodeMirror's, as the display has synced it) and moves the head to the point
	 * of the release (the shadow-aware hit test, then the J8 normalization). The browser's own extension is not used: the DOM selection lives in the surface.
	 * A display selection that is not a text range or caret (an all-selection, a chosen block) has no anchor to keep: nothing is put.
	 */
	const putExtended = (event: PointerEvent, anchor: number | null): boolean => {
		if (anchor === null) { record("pointer-shift-no-anchor"); return false; }
		const hit = positionAtPoint(display.view, event.clientX, event.clientY);
		if (hit === null) { record("pointer-shift-no-position"); return false; }
		return putEnds(anchor, flatOf(hit), "pointer-shift-select");
	};
	/** D-M3-11: a drag that began on a footnote reference's number: the anchor is the position under the pointer at its start, the head the one at its release (J8 then takes an end inside the number to its outer end). */
	const putReferenceDrag = (event: PointerEvent, from: { readonly pos: number }): boolean => {
		const hit = positionAtPoint(display.view, event.clientX, event.clientY);
		if (hit === null) { record("pointer-reference-no-position"); return false; }
		return putEnds(flatOf(from.pos), flatOf(hit), "pointer-reference-select");
	};
	/**
	 * D-M3-14: a triple click (three or more clicks) on a text line selects that line's text, from its first to its last position. The line break
	 * is never in it: the range stops at the end of the clicked line and cannot join it to the next one. (Chromium gives no selection in the PM
	 * root for the third click, so the range is made here from the line the gesture began on.)
	 */
	const putLine = (line: Element | null): boolean => {
		if (!line || !display.view.dom.contains(line)) { record("pointer-line-missing"); return false; }
		let inside: number;
		try { inside = flatOf(display.view.posAtDOM(line, 0)); } catch { record("pointer-line-missing"); return false; }
		const at = textPositionAt(display.state, inside);
		if (!at) { record("pointer-line-missing"); return false; }
		return putEnds(at.block.pmFrom + 1, at.block.pmTo - 1, "pointer-line-select");
	};

	/** The ends of a DOM selection as positions of the display (null when one is not at a position inside a text line, or cannot be read: the state's selection is used then). */
	const domEnds = (dom: Selection): { readonly anchor: number; readonly head: number } | null => {
		if (!dom.anchorNode || !dom.focusNode) return null;
		try {
			// P3-a (brief 11.16): both ends with bias 1, as ProseMirror's own `selectionFromDOM` reads them (a node's end inside an inline atom, such as a formula, is the position after it).
			const view = display.view, anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset, 1), head = view.posAtDOM(dom.focusNode, dom.focusOffset, 1), doc = view.state.doc;
			return doc.resolve(anchor).parent.inlineContent && doc.resolve(head).parent.inlineContent ? { anchor, head } : null;
		} catch { return null; }
	};
	/** Put the gesture's selection into CodeMirror when it is a selection in the text of the PM root. Returns whether it did. */
	const putSelection = (onText: boolean, detail = 1, line: Element | null = null): boolean => {
		// H5 (J23, J32): a gesture of two or more clicks that began outside the text lines (the margin, the blank of the root, a part) is not
		// the user pointing at text, as a single click is not (J7): nothing is put, whatever the browser selected near it.
		if (!onText && detail >= 2) { record("pointer-margin-multi-click", { detail }); return false; }
		if (onText && detail >= 3) return putLine(line);
		const root = display.view.dom.getRootNode() as ViewRoot;
		const dom = selectionOf(root);
		const inRoot = (node: Node | null): boolean => !!node && display.view.dom.contains(node);
		// A selection that is not in the PM root (a part's light DOM, the margin outside it, none) is not ours (J7).
		if (!dom || dom.rangeCount === 0 || !inRoot(dom.anchorNode) || !inRoot(dom.focusNode)) { record("pointer-no-dom-selection"); return false; }
		// A click (no range) that did not begin on the PM root is on the margin: the browser puts its caret at the nearest
		// text, but that is not the user pointing at text (J7: the margin does not change CodeMirror's selection). A drag
		// from the margin into the text is a selection: it is put.
		if (!onText && dom.anchorNode === dom.focusNode && dom.anchorOffset === dom.focusOffset) { record("pointer-margin-click"); return false; }
		const flush = flushDomObserver(display.view);
		if (flush !== "ok") { record("pointer-select-skipped", { flush }); return false; }
		const selection = display.view.state.selection;
		// A node selection or an all-selection is not text.
		if ((selection as { node?: unknown }).node !== undefined || !selection.$anchor.parent.inlineContent || !selection.$head.parent.inlineContent) { record("pointer-not-text"); return false; }
		// F-4 (brief 11.13): the gesture's selection is the DOM selection as it is at the release, read here into positions. ProseMirror's state is only what it last read: a browser that puts the
		// caret where the DOM selection already was (a click on the point of the last click) sends no change, so the state is still what a key made after that (a range), and writing it would leave the range.
		const ends = domEnds(dom);
		const anchor = flatOf(ends ? ends.anchor : selection.anchor), head = flatOf(ends ? ends.head : selection.head);
		if (ends && (ends.anchor !== selection.anchor || ends.head !== selection.head)) record("pointer-dom-selection-read", { stateAnchor: selection.anchor, stateHead: selection.head, anchor: ends.anchor, head: ends.head });
		return putEnds(anchor, head, "pointer-select", detail >= 2);
	};

	const insideBox = (element: Element, x: number, y: number): boolean => Array.from(element.getClientRects()).some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);

	const finish = (event: PointerEvent, kind: "up" | "cancel"): void => {
		const current = lease;
		if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;
		lease = null;
		if (kind === "up") {
			// A composition that is still going on when the pointer is released (the click did not end it) is not
			// disturbed: no selection is put under it.
			if (surface.isComposing()) record("pointer-select-skipped", { reason: "composing" });
			else if (current.extend) {
				// R2-3: Shift on the margin, the blank of the root or a part is not the user pointing at text (J7, H5): nothing is put, the focus comes back.
				if (current.onText) putExtended(event, current.anchor); else record("pointer-shift-not-on-text");
			}
			// R2-4: a press on the number of a footnote reference is a drag only when the pointer is released outside the number's box (a click's own tremor stays a click).
			else if (current.reference && current.detail < 2 && !insideBox(current.reference.element, event.clientX, event.clientY)) putReferenceDrag(event, current.reference);
			// D-C-26 (review 3, P3-1): a click on a task's checkbox puts nothing (M1: the box is display only; switching it is M5). Reading the DOM selection at the release (F-4) would put the caret behind it:
			// ProseMirror does not read a selection inside that widget (`ignoreSelection`), and the DOM one is. A press on the box that was released outside it (a drag into the text) is a gesture as any other.
			else if (current.taskBox && current.detail < 3 && insideBox(current.taskBox, event.clientX, event.clientY)) record("pointer-task-box");
			else putSelection(current.onText, current.detail, current.line);
			options.resync();
			options.transition({ type: "pointerup", range: !display.view.state.selection.empty, inputStarted: false });
		} else {
			options.resync();
			options.transition({ type: "pointercancel" });
		}
		// The focus comes back in the same event, never by a timer.
		const focused = surface.focus();
		record("pointer-focus-back", { kind, focused });
	};
	const onUp = (event: PointerEvent): void => finish(event, "up");
	const onCancel = (event: PointerEvent): void => finish(event, "cancel");

	// The document's capture phase: a gesture that ends outside the view is still ended.
	const attach = (target: Document): void => {
		target.addEventListener("pointerdown", onDown, true);
		target.addEventListener("mousedown", onMouseDown, true);
		target.addEventListener("pointerup", onUp, true);
		target.addEventListener("pointercancel", onCancel, true);
	};
	const detach = (target: Document): void => {
		target.removeEventListener("pointerdown", onDown, true);
		target.removeEventListener("mousedown", onMouseDown, true);
		target.removeEventListener("pointerup", onUp, true);
		target.removeEventListener("pointercancel", onCancel, true);
	};
	attach(doc);
	return {
		isLent: (): boolean => lease !== null,
		destroy(): void {
			lease = null;
			detach(doc);
		},
	};
}
export type PointerLending = ReturnType<typeof createPointerLending>;
