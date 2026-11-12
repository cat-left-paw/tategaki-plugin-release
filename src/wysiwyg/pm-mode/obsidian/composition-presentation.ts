// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/surfacePreferences.ts (`shouldPresentCompositionAtStart`, the type `InputSurfacePreeditDisplay`) and the owner's side of
//   compositionPresentation.ts (`present`, `firstCharacterRect`, the validity of the cycle) @ 58a98a90 (2026-11-06; both are the same as at 020b5501 except `surfacePreferences.ts`,
//   which is new in `c80df99f`, PIS-S10-PREEDIT-DISPLAY1)
// Local changes: M4b (D-M4-1, D-M4-2, D-M4-8, D-M4-10). `shouldPresentCompositionAtStart` is Nyoze's, as it is (its reconversion branch comes into use in M6; the new mode has none yet, so
//   it is always false). Nyoze's module-global setting (the UI writes it, the surface reads it at `compositionstart`) is a closure that the view gives to the surface (`options.preeditDisplay`),
//   which reads the plugin's setting at the start of a composition (the new key `pmPreeditDisplay`). The widget's element carries a class of the shadow root's stylesheet (Nyoze writes
//   `dom.style` directly: the 1.3.4 rule). The owner is the new mode's: the snapshot's `docRef` is CodeMirror's document and the cycle is valid while that document and the owner's identity are
//   the ones it began with (Nyoze: `snapshot.docRef === view.state.doc`, `identity`). `atWrapEnd` is Nyoze's `insertionCaretAtWrapEnd`: the surface began at the end of a soft-wrapped column
//   (the display's caret rect at the `end` affinity is not the one at `head`).
import type { EditorView as CmView } from "@codemirror/view";
import type { InsertionSnapshot } from "../input/edit-owner";
import type { PmModeDisplay } from "../pm/view";
import { readDisplayCaret } from "./display-geometry";
import type { PlacementRect } from "./surface-placement";

/** Nyoze `InputSurfacePreeditDisplay`: push the following text aside (`inline`, the default) or draw over it (`overlay`). */
export type PreeditDisplay = "inline" | "overlay";
/** The stored value, or `inline` for anything else. */
export function normalizePreeditDisplay(value: unknown): PreeditDisplay { return value === "overlay" ? "overlay" : "inline"; }

/**
 * Whether room is reserved for a composition when it starts (Nyoze `shouldPresentCompositionAtStart`).
 *
 * - A reconversion of text the surface shows (M6): always (it is pushed aside whatever the setting).
 * - A composition over a range (a typed key replaces a selection): never (it is drawn over).
 * - A composition from a collapsed caret: `inline` reserves it, `overlay` does not.
 */
export function shouldPresentCompositionAtStart(input: { preeditDisplay: PreeditDisplay; collapsed: boolean; reconversion: boolean }): boolean {
	if (input.reconversion) return true;
	if (!input.collapsed) return false;
	return input.preeditDisplay === "inline";
}

/** The class of the reserved area's element (the shadow root's stylesheet makes it transparent, so it takes room and draws nothing; the surface draws the text). */
export const PREEDIT_WIDGET_CLASS = "tategaki-pm-preedit-widget";

/** Makes the reserved area's element. It is made when the display draws the widget; `text` is the surface's text then. */
export function createCompositionWidgetElement(doc: Document, text: string): HTMLElement {
	const dom = doc.createElement("span");
	dom.className = PREEDIT_WIDGET_CLASS;
	dom.setAttribute("aria-hidden", "true");
	dom.contentEditable = "false";
	dom.textContent = text;
	return dom;
}

/** What the input surface asks of the display for the room of its composing text (the owner's presentation of Nyoze, as one port). */
export interface CompositionPresentationPort {
	/** Reserve the room at the display selection (one meta transaction, no change of the document). Whether it was reserved (not at a Ruby's base or a TCY, not if the owner moved). */
	present(text: string, snapshot: InsertionSnapshot): boolean;
	/** The text only (no transaction). */
	update(text: string): void;
	clear(): void;
	/** Reserved, and still the one that was asked for. */
	isPresented(): boolean;
	/** INLINE-2B: the box of the reserved area's first character (viewport coordinates), or null. */
	firstCharacterRect(): PlacementRect | null;
	/** R2-3: text of the same line follows the room (so the body's rows go on after the composing text). */
	followedByText(): boolean;
	/** The surface began at the end of a soft-wrapped column (the caret is drawn at the end of the column, where the next character would be on the next one). */
	atWrapEnd(): boolean;
}

export function createCompositionPresentation(options: {
	display: PmModeDisplay;
	/** The new mode's owner: CodeMirror and the identity of the connection (a rename or a re-pair changes it). */
	owner: { readonly cm: CmView; readonly identity: string };
	affinity(): "head" | "end";
}): CompositionPresentationPort {
	const { display, owner } = options;
	const same = (a: PlacementRect, b: PlacementRect): boolean => Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.right - b.right) < 0.5 && Math.abs(a.bottom - b.bottom) < 0.5;
	return {
		present: (text, snapshot) => display.presentComposition(text, () => owner.cm.state.doc === snapshot.docRef && owner.identity === snapshot.identity),
		update: text => display.updateComposition(text),
		clear: () => display.clearComposition(),
		isPresented: () => display.compositionPresented,
		firstCharacterRect: () => display.compositionFirstCharacterRect(),
		followedByText: () => display.compositionFollowedByText,
		atWrapEnd(): boolean {
			if (options.affinity() !== "end") return false;
			const head = readDisplayCaret(display, "from", "head")?.rect, end = readDisplayCaret(display, "from", "end")?.rect;
			return !!head && !!end && !same(head, end);
		},
	};
}
