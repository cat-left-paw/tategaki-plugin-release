// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/compositionPresentation.ts @ 58a98a90 (2026-11-06; the file is the same as at 020b5501)
// Local changes: M4b (D-M4-1, D-M4-10). The rules of `apply` are Nyoze's: the reserved area is a transparent widget decoration that is made by a transaction that only carries a
//   meta, is never mapped (any change of the document drops it in the same `apply`), and is told as present only while it is still the cycle that was asked for. What the new mode's
//   display has instead of Nyoze's editable ProseMirror: the display is read-only (`editable: () => false`, so Nyoze's `view.editable` condition goes), the owner's snapshot is
//   CodeMirror's (its `docRef` is a CodeMirror `Text`, and its offsets are source offsets), so the check that the owner still holds the snapshot is a `valid()` that the caller
//   (`obsidian/`) gives, and the check on the display itself is that the display document is the one the cycle was asked on and the display selection is the one it began with (Nyoze:
//   `snapshot.docRef === state.doc`, `selection.from === snapshot.from`). The widget's element is made by `obsidian/` (the Obsidian-free layer draws no style: its rules are the shadow root's
//   stylesheet's classes; `createCompositionWidget`, the way `createTailSpacer` is given). The widget goes in no mark (`marks: []`): the surface draws no inline format (M2 design §3), so a
//   widget in bold would take more room than the text that is drawn over it. Out are Nyoze's range reconversion (`reconversion-hidden`, M6), the selection mirror and range commit marks (M6),
//   Ruby's boundary normalization (the display selection is already on the outer side of a Ruby, B14), the `<style>` written into the document head, and the paragraph-end ZWSP rule
//   (the new mode's lines have none). A position inside a Ruby's base or a TCY (the parent is not a text line) is not reserved (D-M4-10): the overlay display stays there.
//   M4c round 2 (R2-2): except at the edge of a Ruby's base. A click on the first or the last character of a Ruby's base puts the display selection at the base's start or end *inside* the Ruby
//   (a keyboard puts it outside: B14), and the owner writes a text typed there outside the Ruby, before it or after it. The room is made where the text will be written: outside the Ruby
//   at that edge. A position between two characters of the base is where the text is written inside the Ruby: no room there, as before.
import { Decoration, DecorationSet, Plugin, PluginKey, type EditorView, type PMNode } from "./prosemirror";

/** A box in viewport coordinates. */
export interface CompositionRect { left: number; right: number; top: number; bottom: number }
/** Makes the widget's element with `text` in it; `obsidian/` gives one that carries the stylesheet's class. */
export type PmModeCompositionWidgetFactory = (text: string) => HTMLElement;

interface Cycle {
	readonly id: number;
	/** The display document the cycle was asked on, and the display selection it began with. */
	readonly doc: PMNode;
	readonly anchor: number;
	readonly head: number;
	readonly pos: number;
	/** Whether text of the same line follows the room (the surface's rows then break as the body's do, where a text that ends the line is broken by `text-wrap: pretty`'s own rule; R2-3). */
	readonly following: boolean;
	/** Whether the owner still holds the snapshot the cycle began with (the caller's; CodeMirror's document and the owner's identity). */
	readonly valid: () => boolean;
	// What the widget shows, copied from the surface; never the document or the committed text. The element factory reads the latest value, too.
	text: string;
	dom: HTMLElement | null;
	decorations: DecorationSet;
}
type Action = { readonly doc: PMNode; readonly text: string; readonly valid: () => boolean } | "clear";

/**
 * Where the room goes for a display selection at `pos`: `pos` itself between the characters of a text line; at the start or the end of a Ruby's base or of a TCY, the outside of it at that
 * edge (R2-2, and round 3's P3-5 for a TCY: the commit writes outside at both edges); null anywhere else (inside a Ruby's base, inside a TCY): the overlay display stays there (D-M4-10).
 */
export function roomPosition(state: { doc: PMNode }, pos: number): number | null {
	const $pos = state.doc.resolve(pos), parent = $pos.parent;
	if (parent.type.name === "line") return pos;
	if ((parent.type.name !== "ruby" && parent.type.name !== "tcy") || $pos.depth < 1 || $pos.node($pos.depth - 1).type.name !== "line") return null;
	if ($pos.parentOffset === 0) return $pos.before();
	if ($pos.parentOffset === parent.content.size) return $pos.after();
	return null;
}

/** The reserved area of a composition that stays out of the document: a plugin of the display and the way to ask for it. */
export function createCompositionWidgetPlugin(createElement: PmModeCompositionWidgetFactory | undefined) {
	const key = new PluginKey<Cycle | null>("tategaki-pm-composition");
	let view: EditorView | null = null, nextCycle = 0;
	const make: PmModeCompositionWidgetFactory = text => {
		if (createElement) return createElement(text);
		const dom = (view as EditorView).dom.ownerDocument.createElement("span");
		dom.textContent = text;
		return dom;
	};
	const plugin = new Plugin<Cycle | null>({
		key,
		state: {
			init: () => null,
			apply(tr, cycle, _oldState, state) {
				// Whatever the cause, a change of the document drops it in the same application: nothing is mapped, nothing is asked again.
				if (tr.docChanged) return null;
				const action = tr.getMeta(key) as Action | undefined;
				if (action === "clear") return null;
				if (!action) return cycle;
				const { selection } = state;
				if (state.doc !== action.doc || !selection.empty || !action.valid()) return null;
				// D-M4-10: only between the characters of a text line, never inside a Ruby's base or a TCY (their layout is not made room in); R2-2: at the edge of a Ruby's base, outside it.
				const at = roomPosition(state, selection.from);
				if (at === null) return null;
				const $at = state.doc.resolve(at);
				const record: Cycle = { id: ++nextCycle, doc: state.doc, anchor: selection.anchor, head: selection.head, pos: at, following: $at.parentOffset < $at.parent.content.size, valid: action.valid, text: action.text, dom: null, decorations: DecorationSet.empty };
				const widget = Decoration.widget(record.pos, () => {
					const dom = make(record.text);
					record.dom = dom;
					return dom;
				}, {
					key: `tategaki-pm-preedit-${record.id}`, side: 1, relaxedSide: true,
					marks: [], ignoreSelection: true, stopEvent: () => true,
					destroy(dom) { if (record.dom === dom) record.dom = null; },
				});
				record.decorations = DecorationSet.create(state.doc, [widget]);
				return record;
			},
		},
		props: { decorations: state => key.getState(state)?.decorations ?? DecorationSet.empty },
	});
	const current = (): Cycle | null => (view && !view.isDestroyed ? key.getState(view.state) ?? null : null);
	/** The cycle that is still the one asked for: its widget is drawn, the display document and selection are the ones it began with, and the owner still holds the snapshot. */
	const ready = (): boolean => {
		const cycle = current();
		if (!cycle || !view || !cycle.dom?.isConnected || !view.dom.contains(cycle.dom)) return false;
		const { selection } = view.state;
		return cycle.doc === view.state.doc && selection.anchor === cycle.anchor && selection.head === cycle.head && cycle.valid();
	};
	const clear = (): void => {
		if (!view || view.isDestroyed || !current()) return;
		view.dispatch(view.state.tr.setMeta(key, "clear").setMeta("addToHistory", false));
	};
	return {
		key, plugin,
		attach(next: EditorView): void { view = next; },
		/** Reserve the area at the display selection (a collapsed one in a text line). One transaction that carries only a meta. Whether it is reserved. */
		present(text: string, valid: () => boolean): boolean {
			if (!view || view.isDestroyed) return false;
			const action: Action = { doc: view.state.doc, text, valid };
			view.dispatch(view.state.tr.setMeta(key, action).setMeta("addToHistory", false));
			return ready();
		},
		/** The widget's text only (no transaction). A cycle that is no longer the one asked for is dropped. */
		update(text: string): void {
			const cycle = current();
			if (!cycle) return;
			if (!ready()) { clear(); return; }
			if (cycle.text === text) return;
			cycle.text = text;
			if (cycle.dom) cycle.dom.textContent = text;
		},
		clear,
		isPresented: ready,
		/** R2-3: text of the line follows the room (read once the room is reserved). */
		followedByText(): boolean { return current()?.following ?? false; },
		/**
		 * INLINE-2B: the box of the first character of the reserved area, read from the layout only; the DOM, the selection and the state are not changed. Null when it is not drawn, is empty
		 * or its box cannot be read.
		 */
		firstCharacterRect(): CompositionRect | null {
			const dom = current()?.dom, node = dom && ready() ? dom.firstChild : null;
			if (!node || node.nodeType !== 3 || !view) return null;
			const data = (node as Text).data;
			if (!data) return null;
			const code = data.charCodeAt(0), range = view.dom.ownerDocument.createRange();
			range.setStart(node, 0);
			range.setEnd(node, code >= 0xd800 && code <= 0xdbff && data.length > 1 ? 2 : 1);
			const rect = range.getBoundingClientRect();
			return rect.width || rect.height ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
		},
		/** For tests and diagnostics. */
		snapshot() {
			const cycle = current();
			return cycle ? { cycle: cycle.id, pos: cycle.pos, text: cycle.text, reserved: ready(), following: cycle.following } : null;
		},
	};
}
export type PmModeCompositionWidget = ReturnType<typeof createCompositionWidgetPlugin>;
