// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/clipboard.ts (`createInputSurfaceClipboard`: `beforecopy` / `beforecut`, `copy` / `cut`, `paste`) @ 58a98a90 (2026-11-06)
// Local changes: the clipboard stage (D-C-1 to D-C-4, D-C-10). The focus is the surface's own root's `activeElement` (the surface is in a shadow root, where the document's is the host). What a
//   copy, a cut and a paste do is the owner's (`source-owner.ts`: the source a cut of the same selection removes, the cut's deletion, the paste's verbatim insertion), not the host editor's
//   handlers. Only the text flavor is read (`text/plain`, `\r\n` and `\r` as `\n`, D-C-4) and two are written (`text/plain` and `text/markdown`, the same text, as V). The plain-paste chord
//   and the HTML flavor of Nyoze are not taken. An event taken is stopped (default and propagation: Obsidian's `window` handler and its synthetic `copy` must not make a second copy). A composition
//   and text held on the surface are the surface's own: the browser's default is left to them for a copy and a cut (D-C-3), and a paste is not written (D-C-6).
import type { CommitReceipt, InsertionSnapshot } from "../input/edit-owner";
import { mayCopyCutFromSurface, normalizePasteText } from "../input/clipboard-policy";
import type { InputSurface, SurfaceRecord } from "./input-surface";
import type { ViewRoot } from "./composed-tree";

/** What the clipboard events ask of the note's owner. */
export interface ClipboardOwner {
	selectionEmpty(): boolean;
	copyText(): string | null;
	cutText(snapshot?: InsertionSnapshot | null): { readonly receipt: CommitReceipt | "nothing"; readonly text: string | null };
	cutPlan(snapshot: InsertionSnapshot | null): { readonly receipt: "ready" | CommitReceipt | "nothing"; readonly text: string | null };
	pasteText(snapshot: InsertionSnapshot, text: string): CommitReceipt;
	snapshotInsertion(): InsertionSnapshot | null;
}

/** Why a write of the clipboard stage is not made though the view is the new mode's: the surface is composing, or it holds text that was not written (D-C-6; round 2, P3-5, P3-6). */
export type ClipboardBusy = "composing" | "retained";

export function createSurfaceClipboard(options: { surface: InputSurface; owner: ClipboardOwner; isEligible(): boolean; record: SurfaceRecord; notify?: (reason: ClipboardBusy) => void }) {
	const { surface, owner, record } = options, element = surface.element;
	const focused = (): boolean => (element.getRootNode() as ViewRoot).activeElement === element;
	const ready = (): boolean => mayCopyCutFromSurface({ focused: focused(), eligible: options.isEligible(), composing: surface.isComposing(), retained: !!surface.text(), selectionEmpty: owner.selectionEmpty() });
	/** A surface that is the new mode's (nothing composing, no text held), whether or not something is selected. */
	const plain = (): boolean => focused() && options.isEligible() && !surface.isComposing() && !surface.text();
	const take = (event: Event): void => { event.preventDefault(); event.stopPropagation(); };
	/** The top menu's Copy and Cut are on only where there is something to take (Nyoze: `beforecopy` / `beforecut` are stopped then). */
	const beforeCopyCut = (event: Event): void => {
		if (!ready()) return;
		event.preventDefault();
		record("surface-before-clipboard", { type: event.type, trusted: event.isTrusted });
	};
	const write = (event: ClipboardEvent, text: string): boolean => {
		const data = event.clipboardData;
		if (!data) return false;
		data.setData("text/plain", text);
		data.setData("text/markdown", text);
		return true;
	};
	const copy = (event: ClipboardEvent): void => {
		if (!plain()) return;
		if (!ready()) { take(event); record("surface-clipboard", { type: "copy", trusted: event.isTrusted, handled: false, reason: "nothing selected" }); return; }
		const text = owner.copyText(), written = text !== null && write(event, text);
		take(event);
		record("surface-clipboard", { type: "copy", trusted: event.isTrusted, handled: written, length: text?.length ?? 0 });
	};
	const cut = (event: ClipboardEvent): void => {
		if (!plain()) return;
		if (!ready()) { take(event); record("surface-clipboard", { type: "cut", trusted: event.isTrusted, handled: false, reason: "nothing selected" }); return; }
		// An event that carries no clipboard cannot take the text: the note keeps it (a cut writes the clipboard first, as the menu's does).
		if (!event.clipboardData) { take(event); record("surface-clipboard", { type: "cut", trusted: event.isTrusted, handled: false, reason: "no clipboard data" }); return; }
		// (D-C-12: a cut is an input of its own: the mark of an end's echo, D-M4-16, ends with it)
		surface.releaseCommitEcho();
		const result = owner.cutText(), written = result.receipt === "committed" && result.text !== null && write(event, result.text);
		take(event);
		record("surface-clipboard", { type: "cut", trusted: event.isTrusted, handled: written, receipt: result.receipt, length: result.text?.length ?? 0 });
	};
	const paste = (event: ClipboardEvent): void => {
		if (!focused()) return;
		const retained = !!surface.text(), composing = surface.isComposing(), eligible = options.isEligible();
		if (!eligible || retained || composing) {
			event.preventDefault();
			record("surface-paste-blocked", { retained, composing, eligible, trusted: event.isTrusted });
			// D-C-6 (round 2, P3-6): a paste that is not written says so once (the text stays on the clipboard).
			if (eligible) options.notify?.(composing ? "composing" : "retained");
			return;
		}
		const text = normalizePasteText(event.clipboardData?.getData("text/plain") ?? "");
		take(event);
		// D-C-12: a paste is an input of its own (it makes no `beforeinput`, which would end the mark of an end's echo, D-M4-16): it ends the mark.
		surface.releaseCommitEcho();
		if (!text) { record("surface-paste", { trusted: event.isTrusted, handled: false, reason: "empty" }); return; }
		const snapshot = owner.snapshotInsertion(), receipt = snapshot ? owner.pasteText(snapshot, text) : "stale";
		record("surface-paste", { trusted: event.isTrusted, handled: receipt === "committed", receipt, length: text.length });
	};
	element.addEventListener("beforecopy", beforeCopyCut);
	element.addEventListener("beforecut", beforeCopyCut);
	element.addEventListener("copy", copy);
	element.addEventListener("cut", cut);
	element.addEventListener("paste", paste);
	return {
		destroy(): void {
			element.removeEventListener("beforecopy", beforeCopyCut);
			element.removeEventListener("beforecut", beforeCopyCut);
			element.removeEventListener("copy", copy);
			element.removeEventListener("cut", cut);
			element.removeEventListener("paste", paste);
		},
	};
}
