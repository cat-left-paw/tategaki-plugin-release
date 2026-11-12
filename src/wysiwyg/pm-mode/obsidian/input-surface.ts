// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/inputSurface.ts @ 020b5501 (2026-10-22)
//   with the start and the end of a cycle after `reconversionState.ts` (beginReconversion / finishReconversion)
//   and `selectionMirrorController.ts` (noteKey / noteInputFinished) @ 020b5501, the subset without a mirror
// Local changes: out are the selection mirror and reconversion (M6), the pushed-out presentation of the composing text
//   (`presentComposition`, `isCompositionPresented`, M4), the context before and after it and the follow of the
//   start position (INLINE-2 / 2B, M4), the inline-format marks (`surfaceMarks`, M2 design §3) and the reveal at
//   compositionstart (M2 §7.3 reveals after commits only). The owner is the new mode's source owner (M2 design §4): it takes the snapshot and
//   writes to CodeMirror; the surface never writes the document. The geometry of the caret comes from the display
//   (`display-geometry.ts`). The surface is a child of the scrolling element inside the view's shadow root; its root
//   is the shadow root, so focus and the DOM selection go through that root. a `drop` is stopped
//   (M2 design §8; `paste` / `cut` / `copy` are the clipboard stage's, `clipboard.ts`). Comments in English; the repo's style.
//   Review 1 of M2-2b: a failed composition whose DOM is empty at the end keeps its text (Nyoze's `if (!text() && payload)` write,
//   by `replacePayloadIfDifferent` so the caret stays at the end); a composition no typed key began (over a range, or right
//   after an input at the same place) is not written but kept on the surface with a Notice (J20) where Nyoze drops it:
//   Nyoze's range holds a mirror of the text, this surface holds nothing, so what such a cycle makes is the user's input.
//   Review 2: Nyoze's `restoreRetained` (a refused cycle returns to the text held before it, the new text goes) is not written: the held
//   text and the new text are both kept (S3). A pointerdown or `setEnabled(false)` ends the mark of the last input and of the last key
//   (Nyoze's `invalidate`, S3). When the surface is empty at the end of a cycle that began with held text, the held text comes back
//   before the data (S5). When the focus comes back to a surface that holds text, the caret goes to its end (S1; Nyoze leaves it at the start).
//   M2-2c: blur ends recent input/key marks too (T2); caretToEnd selects all child nodes (T3). Chunk resize
//   notifications translate only the frozen line origin during composition (M2 design §7.4).
//   Review 1 R2: compositionstart forces Nyoze's typography read before freezing, including stylesheet-only changes.
//   With no caret rect, no typography is applied: the old implementation could only copy root typography then.
//   M2-2d J30: a composing typed key can hand off through compositionend to the next compositionstart, once.
//   A key, input, pointer boundary, blur or disable clears it; no time or ownership is inferred.
//   J31: Enter/NumpadEnter, Escape, Backspace and Delete terminate a cycle without handing off typing intent.
//   H24 (2026-11-06): Nyoze PIS-IME-KEYLESS-CONTINUATION1 (@ f25c5d35, 2026-10-29): the mark of the last input (`recent`) holds an armed state
//   (`input/recent-input.ts`). A successful commit leaves it unarmed; a finish that did not commit inherits the previous state; a keydown outside
//   a composition that does not release the mark arms it; a keyup outside a composition with no modifier held disarms it. Only an armed mark refuses
//   a keyless collapsed start (`keyless-after-input`): the rest of a partial commit and a dictated phrase start without a key right after a commit,
//   and are written; a reconversion right after a commit starts while Control (and Shift) is held, and is still refused. This replaces what J31's
//   key list did to that refusal; J30 (`continuation`) and J31's key list stay as they were. Diagnostics: `recent-armed`, `recent-disarmed`,
//   `keyless-after-input-allowed`.
//   M3c (H17): retained text is drawn in a red tone (`retained-display.ts`, Nyoze PIS-RETAINED-TEXT-COLOR1 @ 38750b33): the attribute is settled once when an
//   entry point is left (`settleRetained`), as in Nyoze, not at each assignment of `failure`; `onStateChange` and the composition's update also tell the
//   display (pseudo caret, current line band) in the next display frame (`options.onDisplayChange`).
//   M4a (D-M4-11, D-M4-12; Nyoze `classifyInputSurfaceDocumentAction` @ 58a98a90, `document-action.ts`): the surface tells what a document action finds on it
//   (`documentAction`: composing, committing, retained text) and, before its view goes away, ends a composition by taking the focus off it (`settleBeforeLeave`) and gives
//   back the text still on it, so that the view can tell it. Neither writes anything of its own: the end of the composition is the browser's, and its text goes through the same
//   `compositionend` and owner as any other.
//   M4b (D-M4-1 to D-M4-6; Nyoze `inputSurface.ts` @ 58a98a90: `followPresentation`, `restoreFrozenStart`, `endCompositionPresentation`, `updateCompositionPresentation`, `preeditPainted`, and
//   the branch of `onStart` that reserves the room): a composition that starts at a collapsed caret, with no held text, not as a rejected cycle (J20), after the setting says `inline`, asks the
//   display (`options.presentation`) to reserve room for the composing text at the caret (a transparent widget; nothing is written to the document), and the composing text is then drawn over
//   that room, not over body text: the paint under it is off. INLINE-2B: the surface's start follows the first character of the room, which can wrap before the surface would (the context,
//   INLINE-2, is not taken). The follow and the chunks' translation (`chunkLayoutChanged`) are composed: both move the same line origin, and what the follow wrote moves with it. When the
//   room is dropped by a change of the display (an outside edit, a rebuild) the overlay display comes back in the same synchronous step (`presentationChanged`). Where it is not reserved
//   (over a range, held text, a rejected cycle, the setting `overlay`, a Ruby's base or a TCY) the display is the overlay as before. Nyoze's context (`applyContext`, INLINE-2) is not taken.
//   The new writes go through `setCssStyles` (the 1.3.4 rule); the existing direct writes are as they were.
//   M4c round 2 (R2-3): while room is reserved, the surface's rows are broken as the body's line breaks the room's: a line that the body justifies is justified on the surface too (Nyoze copies the
//   block's `text-align`; the surface does not, since J33, so that a heading that is centered or put at the end is not aligned twice: only `justify` is taken, and the others stay `start`), and where
//   text of the line follows the room the surface does not avoid a last short row (`text-wrap: wrap` for `pretty`): the body's rows go on after the room, so the room's last row is not a last
//   row of the line, and `pretty` on the surface would break one character earlier than the line does (the surface's text alone would end in a one-character row). Written once when the room is
//   reserved, put back when it goes; the overlay display is as it was. INLINE-2 (the following text in the surface) is not needed for this.
//   M4c round 2 (R2-1, D-M4-16; not in Nyoze): Windows, when the focus leaves the surface in the middle of a composition (a click on the tab's close button), ends the composition (`compositionend`,
//   written once) and then sends the same characters again as a plain `insertText`, with no key and no `compositionstart` between (the author's records of 2026-11-07: Microsoft IME and ATOK; Ctrl+W
//   does not send it). Written as a direct input, that was the note's text twice. So the characters a composition ended with are remembered (`commitEcho`) until the next key, the next
//   `compositionstart`, the next other input or the disabling of the surface (no timer), and the first plain `insertText` of the same characters after that end is not taken: `beforeinput` is
//   cancelled, the surface does not get it (text held after a refused write is not doubled either) and `commit-echo-dropped` is recorded. The characters were already written or held: none is lost.
import type { CommitReceipt, EditOwner, InsertionSnapshot } from "../input/edit-owner";
import type { CommitTargetRestriction } from "./commit-target-restriction";
import { classifyInputSurfaceDocumentAction, type DocumentActionStatus } from "./document-action";
import { isSurfaceInputAllowed, shouldClearSurfaceFailure, shouldNormalizeEmptySurface } from "../input/surface-state";
import { isKeyStartedComposition, releasesAllModifiers, releasesRecentInput, sameSnapshot, type CompositionKey } from "../input/composition-intent";
import { allowsKeylessAfterInput, armRecentInput, disarmRecentInput, noteInputFinished as markInputFinished, rejectsKeylessAfterInput, type RecentInput } from "../input/recent-input";
import { readContentOrigin, rightFromContentLineEnd, toContentLeft, toContentRect, toContentRight, toContentTop } from "./content-coordinates";
import { shouldPresentCompositionAtStart, type CompositionPresentationPort, type PreeditDisplay } from "./composition-presentation";
import { hasCanonicalEmptySurfaceCaret } from "./empty-surface-caret";
import { createRetainedDisplay } from "./retained-display";
import { createPreeditHighlight } from "./preedit-highlight";
import { surfaceBlockPlacement, surfaceFollowStart, surfacePlacement } from "./surface-placement";
import { createSurfaceTypography } from "./surface-typography";
import { selectionOf, type ViewRoot } from "./composed-tree";
import type { DisplayCaret } from "./display-geometry";

export type SurfaceRecord = (kind: string, detail?: Record<string, unknown>) => void;
/** Why a composition no typed key began is not written (Nyoze `unmirrored-range` / `keyless-after-input`). */
export type KeylessReason = "keyless-range" | "keyless-after-input";
export type SurfaceFailure = Exclude<CommitReceipt, "committed"> | KeylessReason;

/** The owner side of the surface: the port of M2-1 plus the release of the notice suppression (M2-2a). */
export interface InputSurfaceOwner extends EditOwner {
	/** The surface emptied its retained text on purpose: the next failure may be told again. */
	releaseRetained(): void;
	/** BLOCK-WARN1: whether a commit at the snapshot is refused by where it would go, whatever the text (the owner's one function, which its commit calls too); null where it is not. Optional: an owner without it never warns. */
	commitTargetRestriction?(snapshot: InsertionSnapshot): CommitTargetRestriction | null;
}

/** One cycle of composition: how it began decides whether its end may be written (Nyoze reconversionState, without a mirror). */
interface CompositionCycle {
	readonly origin: "normal" | "rejected";
	/** Set when `origin` is "rejected". */
	readonly reason: KeylessReason | null;
	readonly keyed: boolean;
	/** The surface already held retained text when the cycle began. */
	readonly retained: boolean;
	/** That text (S5: it returns before the data when the browser empties the surface before the end). */
	readonly retainedText: string;
}

// J31: these keys finish/empty/cancel a cycle, rather than type the next segment.
/** Attributes of the surface that styles/stylesheet.ts has the rules for (styles are not written from code): vertical writing places the surface by `right`; the room's row rules (R2-3: tokens `trim`, `justify`, `wrap`). */
const SURFACE_VERTICAL_ATTRIBUTE = "data-tategaki-pm-vertical";
const ROW_RULES_ATTRIBUTE = "data-tategaki-pm-row";
const COMPOSITION_TERMINATING_CODES = new Set(["Enter", "NumpadEnter", "Escape", "Backspace", "Delete"]);

export function createInputSurface(options: {
	/** The scrolling element: the surface is its child, placed in content coordinates. */
	scrollHost: HTMLElement;
	/** The element of the displayed text (the PM root): its computed style is the surface's when no line is known. */
	host: HTMLElement;
	/** The tree the highlight rules go to (the view's shadow root). */
	treeRoot: Node;
	ariaLabel: string;
	currentOwner(): InputSurfaceOwner;
	/** The display's caret box and line, in viewport coordinates; null when the display has no text position. */
	caret(): DisplayCaret | null;
	onCommit?(): void;
	onStateChange?(): void;
	/** M3c: the surface's text, its composition or its caret changed (a composition update included): the display's next frame follows. */
	onDisplayChange?(): void;
	/** Tell the user a composition was kept and not written because no typed key began it (once per retention). */
	notify?(reason: KeylessReason): void;
	/**
	 * BLOCK-WARN1 (Nyoze `254120c9`): a direct input at a place where a commit is refused by where it goes was stopped before it came in (`direct`), or a composition began at one (`composition`: it is not stopped; what is
	 * confirmed is kept on the surface as a refused commit's text is). Once for the same place and way (a second character at the same place is not told again).
	 */
	onInputRestricted?(restriction: CommitTargetRestriction, via: "direct" | "composition"): void;
	/** M4b: the display's room for the composing text (a widget). Without it the composing text is always drawn over the body text. */
	presentation?: CompositionPresentationPort;
	/** M4b (D-M4-8): the setting "display while composing", read once when a composition starts (it holds for that composition). */
	preeditDisplay?(): PreeditDisplay;
	record?: SurfaceRecord;
}) {
	const { host, scrollHost, treeRoot } = options;
	const record: SurfaceRecord = options.record ?? (() => {});
	// M3b: the document and the window are read where they are used (`host.ownerDocument`): the element can go into another window (a popout move).
	if (!host.ownerDocument.defaultView) throw new Error("PM mode: no window for the input surface");
	const element = host.ownerDocument.createElement("div");
	element.className = "tategaki-pm-input-surface";
	element.dataset.tategakiPmInputSurface = "true";
	element.setAttribute("contenteditable", "plaintext-only");
	element.setAttribute("spellcheck", "false");
	element.setAttribute("autocapitalize", "off");
	element.setAttribute("autocorrect", "off");
	element.setAttribute("role", "textbox");
	element.setAttribute("aria-label", options.ariaLabel);
	// Created once and kept in the same parent until the session ends. During a composition and across owner
	// changes the parent, `position` and `display` are not changed, and the element is not moved or removed
	// (M2 design §7.1).
	scrollHost.appendChild(element);
	const preedit = createPreeditHighlight(element, treeRoot);
	const root = (): ViewRoot => element.getRootNode() as ViewRoot;
	const owner = (): InputSurfaceOwner => options.currentOwner();

	let composing = false;
	let discarding = false;
	let committing = false;
	let enabled = true;
	// The number of the current cycle (it advances at every start) and whether the surface held retained text then.
	let compositionCycle = 0;
	let retainedAtCompositionStart = false;
	let cycle: CompositionCycle | null = null;
	let compositionSnapshot: InsertionSnapshot | null = null;
	let insertionSnapshot: InsertionSnapshot | null = null;
	let failure: SurfaceFailure | null = null;
	/** BLOCK-WARN1: the place and way of the last warning, so that typing on at the same place is not told again (the next place that is not restricted, or another way, ends it). */
	let warned: { readonly docRef: unknown; readonly from: number; readonly to: number; readonly via: "direct" | "composition"; readonly restriction: CommitTargetRestriction } | null = null;
	// The last keydown with the snapshot it was seen at (a cycle that begins at the same snapshot after a typed key is a
	// typed cycle), and the snapshot where the last input finished with its armed state (H24: a cycle without a key at the same snapshot is refused
	// only while the mark is armed).
	let lastKey: (CompositionKey & { key: string }) | null = null;
	let recent: RecentInput | null = null;
	// R2-1 (D-M4-16): the characters the last composition ended with (`compositionend`'s data) while no key, `compositionstart`, other input or disabling has come since: the one plain `insertText`
	// of the same characters that follows is the input method's echo of the end, not typing. Used once.
	let commitEcho: string | null = null;
	// J30: one event-ordered handoff from a composing key through its end to the next start.
	let continuation = false;
	// M4b: the display reserved room for this composition (and has not been found to have lost it); whether the surface's start follows the room's first character (it does not when the
	// composition began at the end of a soft-wrapped column: the caret was drawn there, S3), what the follow wrote (relative to the same line origin the chunks' translation moves), and the
	// text the last follow was made for.
	let presented = false, followAllowed = false, followedText: string | null = null;
	let followed: { indent: number; cross: number } | null = null;
	// R2-3: whether the room's row rules are on the surface (the attribute `data-tategaki-pm-row` holds which; false: none put on).
	let rowRules = false;

	const rawText = (): string => element.textContent ?? "";
	const text = rawText;
	const hasFocus = (): boolean => root().activeElement === element;

	// M3c (H17): the retained display (an attribute) is settled once when an entry point (an event handler or a function the surface gives out) is left; in
	// the middle of an event (the typed character is on the surface and the owner has not taken it) the text is not classified yet, and asking then would
	// put the attribute on and take it off at every successful keystroke. Outside an entry the surface is settled, so `visual` asks at once.
	const retainedDisplay = createRetainedDisplay(element, () => ({ text: text(), composing, failure }));
	let entryDepth = 0;
	const settleRetained = <T>(run: () => T): T => {
		entryDepth++;
		try { return run(); } finally { if (--entryDepth === 0) retainedDisplay.refresh(); }
	};
	/** M4b (D-M4-3): the composing text has room reserved in the display, which is still the one asked for: there is no body text under it to hide. */
	const presentedNow = (): boolean => composing && presented && !!options.presentation?.isPresented();
	const visual = (): void => {
		// The composing text is drawn over the body text it replaces: an opaque paint under its range. Where room is reserved for it there is none to hide: it is not painted.
		preedit.update(!presentedNow());
		if (entryDepth === 0) retainedDisplay.refresh();
		element.style.opacity = enabled || text() ? "1" : "0";
	};
	const readTypography = createSurfaceTypography({ host, element, currentBlock: () => options.caret()?.block ?? null, preedit, visual });
	const setEmptyCaret = (): void => {
		if (composing || rawText() || !hasFocus()) return;
		const selection = selectionOf(root());
		// Removing the committed text already relocates its live Range here. Do not clear and add that
		// canonical caret again after the layout was dirtied.
		if (hasCanonicalEmptySurfaceCaret(element, selection)) return;
		const range = host.ownerDocument.createRange();
		range.setStart(element, 0);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);
	};
	const normalize = (): void => {
		if (!shouldNormalizeEmptySurface(composing, text())) return;
		if (element.childNodes.length) element.replaceChildren();
		setEmptyCaret();
		visual();
	};
	const refreshTypography = (force = false): void => { if (!composing) readTypography(force).apply(); };

	// Content coordinates of the last placed line. A scroll alone does not change these coordinates.
	// (`indent` and `size` are what INLINE-2B needs: the frozen start the follow gives back, and the surface's block size.)
	let placedLine: { block: HTMLElement; x: number; y: number; vertical: boolean; coordinate: number; top: number; indent: number; size: number } | null = null;
	/**
	 * Read everything (the caret, the line's box and edges, the content origin, the typography) and return the
	 * write, so the reads end before the first write. Null while composing: the geometry of a composition is frozen.
	 */
	const preparePlacement = (forceTypography = false): (() => void) | null => {
		if (composing) return null;
		const target = options.caret();
		const rect = target?.rect ?? null, block = target?.block ?? null;
		const currentWindow = host.ownerDocument.defaultView, style = block && currentWindow ? currentWindow.getComputedStyle(block) : null;
		const box = block?.getBoundingClientRect();
		const origin = readContentOrigin(scrollHost);
		// The line's own lengths (edges, line height) are CSS pixels; the rects are viewport pixels (CSS pixels times the scale
		// of the page frame, which is 1 unless the page scale setting is below 1).
		const scale = origin.scale;
		const px = (property: string): number => (parseFloat(style?.getPropertyValue(property) ?? "") || 0) * scale;
		const edges = {
			left: px("border-left-width") + px("padding-left"), right: px("border-right-width") + px("padding-right"),
			top: px("border-top-width") + px("padding-top"), bottom: px("border-bottom-width") + px("padding-bottom"),
		};
		// The geometry of the display is independent of the surface's typography. Finish these reads before the
		// surface's styles are written, then use the newly copied typography.
		const typography = readTypography(forceTypography, block);
		if (!rect) { record("caret-unavailable"); return () => {}; }
		const vertical = typography.writingMode.startsWith("vertical");
		const size = Number.isFinite(typography.lineHeight) ? typography.lineHeight : typography.fontSize;
		if (!block || !box) {
			const position = surfacePlacement(rect, size * scale, vertical);
			return () => {
				typography.apply();
				placedLine = null;
				// ("auto" and 0 are the stylesheet's values for the surface: with no inline value they show)
				element.style.removeProperty("inline-size");
				element.style.removeProperty("block-size");
				element.style.removeProperty("text-indent");
				element.style.removeProperty("right");
				element.removeAttribute(SURFACE_VERTICAL_ATTRIBUTE);
				element.style.left = `${toContentLeft(origin, position.left)}px`;
				element.style.top = `${toContentTop(origin, position.top)}px`;
			};
		}
		const position = surfaceBlockPlacement(rect, box, edges, size * scale, vertical);
		const right = toContentRight(origin, position.firstLineEnd);
		const lineOrigin = { block, x: toContentLeft(origin, vertical ? box.right : box.left), y: toContentTop(origin, box.top), vertical, coordinate: vertical ? right : toContentLeft(origin, position.left), top: toContentTop(origin, position.top), indent: position.indent / scale, size };
		return () => {
			typography.apply();
			placedLine = lineOrigin;
			// (a new placement is written: no follow is left over from an earlier one)
			followed = null; followedText = null;
			element.style.textIndent = `${position.indent / scale}px`;
			element.style.inlineSize = `${position.inlineSize / scale}px`;
			element.style.blockSize = `${size}px`;
			element.style.top = `${toContentTop(origin, position.top)}px`;
			// (`left: auto` is the class's value in vertical writing, `right: auto` the stylesheet's: with no inline value they show)
			if (vertical) { element.style.removeProperty("left"); element.setAttribute(SURFACE_VERTICAL_ATTRIBUTE, ""); element.style.right = `${right}px`; }
			else { element.style.removeProperty("right"); element.removeAttribute(SURFACE_VERTICAL_ATTRIBUTE); element.style.left = `${toContentLeft(origin, position.left)}px`; }
			record("placed", { vertical, inlineSize: position.inlineSize / scale, indent: position.indent / scale, scale });
		};
	};
	const place = (forceTypography = false): void => { settleRetained(() => { preparePlacement(forceTypography)?.(); }); };
	/** ResizeObserver's one notification: a composing surface follows only its line's start edge, never its typography or wrap. */
	const chunkLayoutChanged = (): void => {
		if (!composing) { place(); return; }
		const line = placedLine;
		if (!line?.block.isConnected) return;
		const box = line.block.getBoundingClientRect(), origin = readContentOrigin(scrollHost);
		const x = toContentLeft(origin, line.vertical ? box.right : box.left), y = toContentTop(origin, box.top);
		const dx = x - line.x, dy = y - line.y;
		// M4b (D-M4-5): what the follow wrote (the cross-axis value: `right` in vertical writing, `top` in horizontal) moves with the line, too, so neither overwrites the other: the value
		// written is the follow's when there is one, the frozen one otherwise.
		const follow = followed;
		if (follow && (line.vertical ? dx : dy)) follow.cross += line.vertical ? -dx : dy;
		// All reads above; only the coordinate properties below. No parent, position, display, inline size or inherited variable changes.
		if (dx) {
			if (line.vertical) element.style.right = `${follow ? follow.cross : line.coordinate - dx}px`;
			else element.style.left = `${line.coordinate + dx}px`;
		}
		if (dy) element.style.top = `${follow && !line.vertical ? follow.cross : line.top + dy}px`;
		placedLine = { ...line, x, y, coordinate: line.coordinate + (line.vertical ? -dx : dx), top: line.top + dy };
		record("composition-origin-shift", { dx, dy });
	};

	/** M4b (D-M4-5): put the surface's start back to the frozen one (what `placedLine` holds, which the chunks' translation has kept up) when the follow is dropped. */
	const restoreFrozenStart = (): void => {
		followedText = null;
		if (!followed) return;
		followed = null;
		const line = placedLine;
		if (!line) return;
		element.setCssStyles(line.vertical ? { textIndent: `${line.indent}px`, right: `${line.coordinate}px` } : { textIndent: `${line.indent}px`, top: `${line.top}px` });
	};
	/**
	 * M4b (D-M4-5, INLINE-2B): the surface's start goes to the first character of the reserved room, which the display lays out with the line (it can wrap before the surface would, and
	 * the characters before it can move). Only when the surface's text changed, once, after the room's text was written: the room's box is read, then the surface's own style is written
	 * (a read in the content coordinates of the line the surface was placed on, so a scroll or a chunk's translation does not move the answer). Typography, scroll and reveal stay frozen.
	 */
	const followPresentation = (): void => {
		const port = options.presentation, current = text(), line = placedLine;
		if (!composing || !presented || !followAllowed || !port || !line || !current || !port.isPresented()) { restoreFrozenStart(); return; }
		if (current === followedText) return;
		const rect = port.firstCharacterRect();
		// (unreadable: nothing is done)
		if (!rect) return;
		followedText = current;
		const origin = readContentOrigin(scrollHost);
		const start = surfaceFollowStart(toContentRect(origin, rect), { vertical: line.vertical, inlineStart: line.vertical ? line.top : line.coordinate, size: line.size });
		const cross = line.vertical ? rightFromContentLineEnd(origin, start.lineEnd) : start.lineStart;
		followed = { indent: start.indent, cross };
		element.setCssStyles(line.vertical ? { textIndent: `${start.indent}px`, right: `${cross}px` } : { textIndent: `${start.indent}px`, top: `${cross}px` });
		record("composition-followed", { vertical: line.vertical, indent: start.indent });
	};
	/**
	 * R2-3: the surface's rows break as the line breaks the room's. A line the body justifies is justified on the surface (only `justify`: a centered or end-aligned heading stays `start`, J33), and where
	 * text of the line follows the room `text-wrap` is `wrap`. Written once, after the surface is placed (the typography is frozen for the composition); `restoreRowRules` puts back what was there.
	 */
	const applyRowRules = (): void => {
		const port = options.presentation;
		if (!port || rowRules) return;
		const block = placedLine?.block;
		const lineStyle = block?.ownerDocument.defaultView?.getComputedStyle(block);
		const justify = lineStyle?.textAlign === "justify", followedByText = port.followedByText();
		rowRules = true;
		// P2-1 (round 3): the room (the widget) is not trimmed between adjacent punctuation (`text-spacing-trim: space-all`: the surface's characters are full-width, and the row would make a
		// bracket after a full stop half a character wide); the surface is not trimmed either, so the composing text lies on the room character by character.
		element.setAttribute(ROW_RULES_ATTRIBUTE, ["trim", ...(justify ? ["justify"] : []), ...(followedByText ? ["wrap"] : [])].join(" "));
		record("composition-row-rules", { justify, followedByText });
	};
	const restoreRowRules = (): void => {
		if (!rowRules) return;
		rowRules = false;
		element.removeAttribute(ROW_RULES_ATTRIBUTE);
	};
	/** The room is not reserved any more (or never was): the overlay display, from the frozen start. */
	const forgetPresentation = (): void => { presented = false; followAllowed = false; restoreRowRules(); restoreFrozenStart(); };
	/** M4b: the composition ends, is discarded or the surface goes away: take the room away and put the start back. */
	const endCompositionPresentation = (): void => {
		forgetPresentation();
		options.presentation?.clear();
		visual();
	};
	/**
	 * M4b (D-M4-2): reserve room for the composing text, where Nyoze does (`shouldPresentCompositionAtStart`) and where the new mode can: not over a range, not with text held on the surface (it is
	 * a retention of an earlier failure, drawn over the body as before), not for a cycle that no typed key began and that is held unwritten (J20), not after a failed commit, not with the
	 * setting `overlay`, not at a Ruby's base or a TCY (the display refuses it). The setting is read here, once.
	 */
	const startPresentation = (): void => {
		const port = options.presentation, snapshot = compositionSnapshot;
		if (!port || !enabled || failure || retainedAtCompositionStart || cycle?.origin === "rejected" || !snapshot) return;
		if (!shouldPresentCompositionAtStart({ preeditDisplay: options.preeditDisplay?.() ?? "inline", collapsed: snapshot.from === snapshot.to, reconversion: false })) return;
		// (read before the room is reserved: the caret at the end of a wrapped column is drawn there, the contract of S3)
		const atWrapEnd = port.atWrapEnd();
		if (!port.present(text(), snapshot)) { record("composition-not-presented"); return; }
		presented = true;
		followAllowed = !atWrapEnd;
		applyRowRules();
		record("composition-presented", { atWrapEnd });
	};
	/**
	 * M4b (D-M4-4): the display dropped the room, or the cycle it was reserved for is no longer the one asked for (an outside change of the document, a rebuild): the overlay display comes
	 * back in this same synchronous step, not at the next `compositionupdate`. The text is kept as it was (the commit is `stale` as before).
	 */
	const presentationChanged = (): void => settleRetained(() => {
		if (!composing || !presented || options.presentation?.isPresented()) return;
		forgetPresentation();
		// (a room that is still drawn, because the display's selection moved and not its text, is taken away too: it would leave a gap under the overlay)
		options.presentation?.clear();
		record("composition-presentation-lost");
		visual();
		options.onDisplayChange?.();
	});
	const updateCompositionPresentation = (): void => {
		const port = options.presentation;
		if (!composing || !presented || !port) return;
		// (a cycle that is no longer the one asked for is dropped by `update`)
		port.update(text());
		if (!port.isPresented()) { presentationChanged(); return; }
		followPresentation();
	};

	// The payload stays the source of truth; do not rebuild the same DOM (the IME's caret stays).
	/** The caret at the end of the surface's text, by the Selection API (never by writing a text node's data). */
	const caretToEnd = (): void => {
		if (!element.firstChild) return;
		const range = host.ownerDocument.createRange();
		range.selectNodeContents(element);
		range.collapse(false);
		const selection = selectionOf(root());
		selection?.removeAllRanges();
		selection?.addRange(range);
	};
	const replacePayloadIfDifferent = (payload: string): void => {
		if (rawText() === payload) return;
		element.replaceChildren(...(payload ? [host.ownerDocument.createTextNode(payload)] : []));
		if (!payload || !hasFocus()) return;
		caretToEnd();
	};
	/** H24: the mark of an input that finished. `committed` is whether the owner took the text (a finish that did not commit keeps the mark's armed state). */
	const noteInputFinished = (committed: boolean): void => { recent = markInputFinished(recent, owner().snapshotInsertion(), { committed }); };

	/** Whether the owner took the text (H24: it decides how the mark of the last input starts). */
	const commit = (payload: string, snapshot: InsertionSnapshot | null, via: string): boolean => {
		if (!payload) { normalize(); options.onStateChange?.(); return false; }
		// Retained text is not applied to a new snapshot, silently or by any later input.
		let result: CommitReceipt | KeylessReason;
		committing = true;
		try { result = failure ?? (snapshot ? owner().commitText(snapshot, payload) : "stale"); }
		finally { committing = false; }
		// Direct input the owner will never take (a protected target) is not retained but dropped.
		// Other failures, and every failed composition, are retained.
		if (result === "protected-target" && via === "insertText" && !failure) {
			record("owner-commit-dropped", { via, text: payload, from: snapshot?.from, to: snapshot?.to });
			element.replaceChildren();
			compositionSnapshot = insertionSnapshot = null;
			normalize();
			options.onStateChange?.();
			return false;
		}
		record(result === "committed" ? "commit" : result, { via, text: payload, from: snapshot?.from, to: snapshot?.to });
		if (result !== "committed") {
			failure = result;
			if (result === "newline-in-payload" && text() !== payload) element.textContent = payload;
			visual();
			options.onStateChange?.();
			return false;
		}
		element.replaceChildren();
		compositionSnapshot = insertionSnapshot = null;
		normalize();
		options.onStateChange?.();
		if (via === "insertText") noteInputFinished(true);
		options.onCommit?.();
		return true;
	};

	/**
	 * BLOCK-WARN1 (D-W-1): whether a commit at `snapshot` is refused by where it goes. Not asked while the surface holds text or a failure (retained text): no commit is tried then (`commit` takes `failure` first), so
	 * a warning would not be what happens.
	 */
	const restrictionAt = (snapshot: InsertionSnapshot | null): CommitTargetRestriction | null => {
		if (!snapshot || failure || text()) return null;
		return owner().commitTargetRestriction?.(snapshot) ?? null;
	};
	const warn = (restriction: CommitTargetRestriction, snapshot: InsertionSnapshot, via: "direct" | "composition"): void => {
		if (warned && warned.docRef === snapshot.docRef && warned.from === snapshot.from && warned.to === snapshot.to && warned.via === via && warned.restriction === restriction) return;
		warned = { docRef: snapshot.docRef, from: snapshot.from, to: snapshot.to, via, restriction };
		options.onInputRestricted?.(restriction, via);
	};
	const onStartBody = (event: CompositionEvent): void => {
		// The snapshot comes before any placement or change of the DOM selection.
		const startSnapshot = owner().snapshotInsertion();
		const keyed = (continuation && sameSnapshot(recent, startSnapshot)) || isKeyStartedComposition(lastKey, startSnapshot);
		continuation = false; // consumed by this start, including a start at a different owner/snapshot
		commitEcho = null;
		lastKey = null;
		recent = sameSnapshot(recent, startSnapshot) ? recent : null;
		// R-D5 (Nyoze `beginReconversion`, the `keyed` branch): a start that a typed key began clears the mark of the last input, whether the typed key was this one's own (`isKeyStartedComposition`)
		// or the J30 continuation took it for one. A cycle that then does not succeed does not leave a mark that a later keyless start would be refused by.
		if (keyed) recent = null;
		retainedAtCompositionStart = !!text();
		// A cycle that no typed key began could be the IME reconverting text this surface does not show (M6). Over a
		// range it is not written, and after an input at the same place it is not written (Nyoze refuses both).
		let origin: CompositionCycle["origin"] = "normal", reason: KeylessReason | null = null;
		if (!keyed) {
			if (startSnapshot && startSnapshot.from !== startSnapshot.to) { if (!retainedAtCompositionStart) { origin = "rejected"; reason = "keyless-range"; } }
			// H24: only an armed mark refuses (a collapsed start at the mark's own place); an unarmed one is the rest of a partial commit or a dictated phrase.
			else if (rejectsKeylessAfterInput(recent, startSnapshot, keyed)) { origin = "rejected"; reason = "keyless-after-input"; }
			else if (allowsKeylessAfterInput(recent, startSnapshot, keyed)) record("keyless-after-input-allowed", { from: startSnapshot?.from, to: startSnapshot?.to });
		}
		cycle = { origin, reason, keyed, retained: retainedAtCompositionStart, retainedText: text() };
		if (reason) record("reconversion-rejected", { reason });
		// BLOCK-WARN1 (D-W-3): a composition that begins where a commit is refused by where it goes says so now. It is not stopped: what is confirmed is kept on the surface as a refused commit's text is (the notice then
		// is the owner's, as it was). A cycle already rejected (J20) has its own notice at its end.
		else if (startSnapshot) {
			const restriction = restrictionAt(startSnapshot);
			if (restriction) { record("composition-restricted", { restriction, from: startSnapshot.from, to: startSnapshot.to }); warn(restriction, startSnapshot, "composition"); } else if (!failure && !text()) warned = null;
		}
		place(true);
		composing = true;
		discarding = false;
		compositionCycle++;
		// The text held at the start is the retained text of an earlier failure (whether or not `failure` is set).
		if (!failure) compositionSnapshot = startSnapshot;
		insertionSnapshot = null;
		// M4b: nothing of an earlier cycle's room is carried over; this cycle reserves its own where it can.
		forgetPresentation(); options.presentation?.clear();
		startPresentation();
		visual();
		record("compositionstart", { data: event.data, from: compositionSnapshot?.from, to: compositionSnapshot?.to, identity: compositionSnapshot?.identity });
		options.onStateChange?.();
	};
	const onStart = (event: CompositionEvent): void => settleRetained(() => { onStartBody(event); });
	// M3c: the composing text changed: the pseudo caret and the current line band follow the surface's own caret in the next display frame.
	const onUpdate = (): void => { updateCompositionPresentation(); visual(); options.onDisplayChange?.(); };
	const onEndBody = (event: CompositionEvent): void => {
		// Reuse the typed-key predicate for 229, modifiers, IME function codes and the cycle's snapshot.
		// Only its isComposing requirement differs here: this key belongs to the cycle that is ending.
		if (composing && !discarding && lastKey?.isComposing && !COMPOSITION_TERMINATING_CODES.has(lastKey.code) && isKeyStartedComposition({ ...lastKey, isComposing: false }, compositionSnapshot)) continuation = true;
		composing = false;
		// M4b: the room goes first (whatever follows: a commit, a retention, a discard); the display's change by the commit drops it anyway.
		endCompositionPresentation();
		const ended = cycle;
		cycle = null;
		record("compositionend", { data: event.data });
		if (discarding) {
			// E4: the late end of a composition the user confirmed to discard. Not committed, not retained.
			discarding = false;
			element.replaceChildren();
			compositionSnapshot = insertionSnapshot = null;
			if (!enabled) element.contentEditable = "false";
			noteInputFinished(false);
			record("compositionend-after-discard", { data: event.data });
			visual();
			options.onStateChange?.();
			return;
		}
		// R2-1: what the end's characters are (set below, once it is known that the composition was not discarded or empty).
		let echoOf = "";
		// A cycle with no data that no typed key began has nothing to write or keep (Nyoze `keyless-empty-end`).
		const empty = !!ended && ended.origin === "normal" && !ended.keyed && !ended.retained && !event.data && compositionSnapshot?.from === compositionSnapshot?.to;
		// H24: whether the owner took the text; a refused, empty, retained or discarded end is not a commit.
		let committed = false;
		if (empty) {
			replacePayloadIfDifferent("");
			record("composition-refused", { reason: "keyless-empty-end" });
			normalize();
		} else {
			// Chromium may empty the DOM before the end: the data of the end is the payload then. A line break is never trusted from the DOM.
			// With held text before the cycle (S5), what the surface holds is that text and the data, in that order.
			const before = ended?.retained ? ended.retainedText : "";
			const payload = /[\n\r]/.test(event.data) ? before + event.data : text() || before + (event.data || "");
			echoOf = event.data || "";
			// The text must be on the surface before a write that may fail (Nyoze `if (!text() && payload)`): a failure keeps it there.
			if (payload && !text()) replacePayloadIfDifferent(payload);
			if (ended?.origin === "rejected" && ended.reason && !failure && payload) {
				// J20: not written (it could be an IME reconverting text this surface does not show, M6), and not dropped: kept as a failure.
				failure = ended.reason;
				record("composition-retained-unwritten", { reason: ended.reason, text: payload });
				options.notify?.(ended.reason);
			} else {
				committed = commit(payload, compositionSnapshot, "compositionend");
				if (!payload) compositionSnapshot = null;
			}
		}
		// R2-1 (D-M4-16): written, retained or refused alike, the characters are in the note or on the surface now; an echo of them is not typing.
		commitEcho = echoOf || null;
		noteInputFinished(committed);
		if (!enabled) element.contentEditable = "false";
		visual();
		options.onStateChange?.();
	};
	const onEnd = (event: CompositionEvent): void => settleRetained(() => { onEndBody(event); });
	const onBeforeInput = (event: InputEvent): void => {
		record("beforeinput", { inputType: event.inputType, data: event.data, composing: event.isComposing });
		// R2-1 (D-M4-16): the mark is used once, by this input, whatever it is.
		const echo = commitEcho;
		commitEcho = null;
		if (echo !== null && !composing && !event.isComposing && event.inputType === "insertText" && event.data === echo) {
			event.preventDefault();
			insertionSnapshot = null;
			record("commit-echo-dropped", { text: echo });
			return;
		}
		if (!isSurfaceInputAllowed(event.inputType, composing || event.isComposing, !!text())) {
			event.preventDefault();
			insertionSnapshot = null;
			record("beforeinput-blocked", { inputType: event.inputType });
			return;
		}
		if (!composing && !event.isComposing && event.inputType === "insertText") {
			insertionSnapshot = owner().snapshotInsertion();
			// BLOCK-WARN1 (D-W-2): a direct input where a commit is refused by where it goes is stopped here and said at once, instead of being typed, kept on the surface in red, and refused after. Nothing comes
			// in (no `input` follows), and the snapshot is kept as a stopped `beforeinput`'s still is (a synthetic `input` that follows is refused by the owner for the same reason).
			const restriction = restrictionAt(insertionSnapshot);
			if (restriction && insertionSnapshot) {
				event.preventDefault();
				record("beforeinput-restricted", { inputType: event.inputType, data: event.data, restriction, from: insertionSnapshot.from, to: insertionSnapshot.to });
				warn(restriction, insertionSnapshot, "direct");
				return;
			}
			if (!failure && !text()) warned = null;
		}
	};
	const onInputBody = (rawEvent: Event): void => {
		continuation = false;
		const event = rawEvent as InputEvent;
		// M4b: the surface's text is in the DOM now (at `compositionupdate` it is not yet): the room's text and the follow are made from it, as Nyoze's `onInput` does.
		updateCompositionPresentation();
		visual();
		record("input", { inputType: event.inputType, data: event.data, composing: event.isComposing });
		if (shouldClearSurfaceFailure(failure !== null, composing || event.isComposing, text())) {
			const previous = failure;
			failure = compositionSnapshot = insertionSnapshot = null;
			// The user emptied the retained text on purpose (I5): the next failure may be told again.
			owner().releaseRetained();
			record("failure-cleared-by-user", { previous });
		}
		if (!composing && !event.isComposing && event.inputType === "insertText" && text()) {
			commit(event.data && /[\n\r]/.test(event.data) ? event.data : text(), insertionSnapshot, "insertText");
			insertionSnapshot = null;
		} else if (!composing && !event.isComposing && event.inputType === "insertText") insertionSnapshot = null;
		normalize();
		options.onStateChange?.();
	};
	const onInput = (rawEvent: Event): void => settleRetained(() => { onInputBody(rawEvent); });
	const onKeyDown = (event: KeyboardEvent): void => {
		continuation = false;
		commitEcho = null;
		const current = owner().snapshotInsertion();
		lastKey = { isComposing: event.isComposing, keyCode: event.keyCode, ctrlKey: event.ctrlKey, metaKey: event.metaKey, code: event.code, key: event.key, snapshot: current };
		if (releasesRecentInput(lastKey, current)) recent = null;
		// H24: a keydown outside a composition that does not release the mark (a modifier, a 229 with Ctrl / Meta, an IME function code) arms it. A keydown in a composition does not.
		else if (!event.isComposing && recent && !recent.armed) {
			recent = armRecentInput(recent);
			record("recent-armed", { key: event.key, code: event.code });
		}
	};
	// H24: a keyup outside a composition with no modifier held disarms the mark (the next modifier keydown arms it again). A keyup in a composition does not.
	const onKeyUp = (event: KeyboardEvent): void => {
		if (releasesAllModifiers(event) && recent?.armed) {
			recent = disarmRecentInput(recent);
			record("recent-disarmed", { key: event.key, code: event.code });
		}
	};
	const onBlur = (): void => { recent = null; lastKey = null; continuation = false; };
	// Pasting, cutting and dropping never reach the document through the surface (M5).
	const stop = (event: Event): void => { event.preventDefault(); record("clipboard-blocked", { type: event.type }); };

	element.addEventListener("compositionstart", onStart);
	element.addEventListener("compositionupdate", onUpdate);
	element.addEventListener("compositionend", onEnd);
	element.addEventListener("beforeinput", onBeforeInput);
	element.addEventListener("input", onInput);
	element.addEventListener("keydown", onKeyDown);
	element.addEventListener("keyup", onKeyUp);
	element.addEventListener("blur", onBlur);
	// The clipboard stage: the copy, the cut and the paste are the clipboard module's (`clipboard.ts`); a drop is still never taken.
	for (const type of ["drop"] as const) element.addEventListener(type, stop);
	refreshTypography();
	retainedDisplay.refresh();

	return {
		element, text, rawText, place, preparePlacement, chunkLayoutChanged, refreshTypography, hasFocus,
		/** The name of the highlight under the surface's text (for tests and diagnostics). */
		preeditHighlightName: preedit.name,
		isComposing: (): boolean => composing,
		/** Event-only handoff state (J30), for diagnostics; reading it never consumes it. */
		continuationPending: (): boolean => continuation,
		/** Only while composing: the number of the cycle, and whether E4 may discard it (no retained text at its start). */
		compositionState: (): { cycle: number; discardable: boolean } | null => composing ? { cycle: compositionCycle, discardable: !committing && !retainedAtCompositionStart } : null,
		isCommitting: (): boolean => committing,
		/** M4b: the composing text has room reserved in the display (a widget), which is still the one asked for. */
		isCompositionPresented: presentedNow,
		/** M4b (D-M4-4): the display changed (a CodeMirror transaction was applied, or it was rebuilt): if it dropped the room, the overlay display comes back now. */
		presentationChanged,
		/** M4a (D-M4-11): what a document action (a save, leaving the view) finds here: ready, a commit going on, a composition, or retained text. Reads only. */
		documentAction: (): DocumentActionStatus => classifyInputSurfaceDocumentAction({ committing, composing, text: text() }),
		failure: (): SurfaceFailure | null => failure,
		/** R4-1: the text held on the surface (a write was refused) and why, or null (nothing held, or a composition or a commit is going on). */
		retainedState(): { text: string; failure: SurfaceFailure | null } | null {
			return composing || committing || !text() ? null : { text: text(), failure };
		},
		/**
		 * R4-1: a surface made for the same note in another window (the view is made again when its leaf moves) takes over what the old one held, as it was: the text on the
		 * surface, not written, with the same reason. Only an empty surface that is not composing takes it; the user's ways with held text (delete it, Backspace) are the same.
		 */
		adoptRetained: (state: { text: string; failure: SurfaceFailure | null }): boolean => settleRetained(() => {
			if (composing || committing || text() || !state.text) return false;
			element.replaceChildren(host.ownerDocument.createTextNode(state.text));
			failure = state.failure; compositionSnapshot = insertionSnapshot = null;
			visual();
			record("retained-adopted", { text: state.text, failure: state.failure });
			options.onStateChange?.();
			return true;
		}),
		discardRetained: (): boolean => settleRetained(() => {
			if (composing || committing || !text()) return false;
			element.replaceChildren();
			failure = compositionSnapshot = insertionSnapshot = null;
			owner().releaseRetained();
			normalize();
			record("retained-discarded-by-user");
			options.onStateChange?.();
			return true;
		}),
		/**
		 * E4: the way out when a composition does not end. Only after the user confirmed. It drops the composing text and
		 * the `compositionend` that follows commits nothing. Disabling or blurring the surface is not enough: the end
		 * would still arrive with text and be committed. The confirmed E4 command calls this in M2-3b (K4).
		 */
		discardComposition: (): boolean => settleRetained(() => {
			// A composition that shares the surface with retained text is not discarded (it would delete text the user
			// was not told about).
			if (!composing || committing || retainedAtCompositionStart) return false;
			discarding = true;
			element.replaceChildren();
			composing = false;
			endCompositionPresentation();
			cycle = null;
			failure = compositionSnapshot = insertionSnapshot = null;
			owner().releaseRetained();
			visual();
			record("composition-discarded-by-user");
			options.onStateChange?.();
			return true;
		}),
		/**
		 * A boundary the user made (a pointer gesture began): a composition no key began is no longer "right after" the last input,
		 * and the last key says nothing about the next composition (Nyoze `invalidate`, `reconversionState.releaseReconversion`).
		 */
		releaseRecentInput(): void { recent = null; lastKey = null; continuation = false; },
		/**
		 * R2-1, round 3 (P3-1): a key the view's window guard stops before the surface's own `keydown` sees it (Escape) is a key press all the same: it ends the mark of an end's echo (D-M4-16). Only
		 * this mark: the pointer and the blur do not end it (the echo can come after them).
		 */
		releaseCommitEcho(): void { commitEcho = null; },
		/** Focus the surface (never while composing). Returns whether it holds the focus. */
		focus: (): boolean => settleRetained(() => {
			if (!enabled || composing) return false;
			const had = hasFocus();
			place();
			element.focus({ preventScroll: true });
			normalize();
			// A surface that holds text takes the focus with the caret at the start of it; the text typed next would go before it,
			// and Backspace would have nothing to remove (S1). A surface that already had the focus keeps the caret where the user put it.
			if (!had && hasFocus() && text()) caretToEnd();
			return hasFocus();
		}),
		setEnabled: (value: boolean): void => settleRetained(() => {
			if (value === enabled) return;
			enabled = value;
			if (!value) { recent = null; lastKey = null; continuation = false; commitEcho = null; }
			if (!composing) element.contentEditable = value ? "plaintext-only" : "false";
			visual();
		}),
		/**
		 * M4a (D-M4-12): the view goes away and nothing can stop it (the tab's close button, closing the window, quitting, the plugin unloading). A composition is ended first,
		 * while the surface is still shown: the focus is taken off it, so the browser ends the composition (and the input method with it) and its `compositionend` writes the text the
		 * way every other end does, to the note if the owner can still write there. Returns the text that is still on the surface afterwards (retained text, or a composition that did not end):
		 * what the view is about to lose. Call this before the surface is destroyed.
		 */
		settleBeforeLeave: (): string => settleRetained(() => {
			if (composing) { record("leave-composition-blurred"); element.blur(); }
			return text();
		}),
		destroy(): void {
			// M4b: the room of a composition that the view's closing cuts off goes with the view (the display is still alive here).
			if (presented) endCompositionPresentation();
			element.removeEventListener("compositionstart", onStart);
			element.removeEventListener("compositionupdate", onUpdate);
			element.removeEventListener("compositionend", onEnd);
			element.removeEventListener("beforeinput", onBeforeInput);
			element.removeEventListener("input", onInput);
			element.removeEventListener("keydown", onKeyDown);
			element.removeEventListener("keyup", onKeyUp);
			element.removeEventListener("blur", onBlur);
			for (const type of ["drop"] as const) element.removeEventListener(type, stop);
			element.remove();
			preedit.destroy();
		},
	};
}
export type InputSurface = ReturnType<typeof createInputSurface>;
