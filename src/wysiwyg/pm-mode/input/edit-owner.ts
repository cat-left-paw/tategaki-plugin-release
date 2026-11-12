// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/editOwner.ts @ 020b5501 (2026-10-22)
// Local changes: the M2 part of the port only (snapshot, commit, keys, history); `docRef` is the
//   owner's document object (CodeMirror's `Text`) as `unknown`; the receipts add the new mode's
//   reasons (M2 design §9). Mirror, presentation, navigation and geometry come in M3, M4 and M6.
import type { BlockedReason } from "./edit-target";

/** Taken at `compositionstart` (direct input: `beforeinput`); `from`/`to` are source offsets. */
export interface InsertionSnapshot {
	readonly identity: string;
	readonly docRef: unknown;
	readonly from: number;
	readonly to: number;
}

/**
 * `committed`, or why the text was not written (it stays on the input surface; for direct input
 * `protected-target` drops it, as in Nyoze). `stopped`: the view stopped writing after a mismatch
 * (D26). `out-of-scope`: not a document the new mode writes (H9 (b): a Markdown note of the vault; and not a view whose range display is the rect layer, J4).
 */
export type CommitReceipt =
	| "committed"
	| "stale"
	| "newline-in-payload"
	| "dispatch-rejected"
	| "protected-target"
	| "stopped"
	| "reading-view"
	| "out-of-scope"
	| Exclude<BlockedReason, "newline-in-payload">;

export interface EditOwner {
	readonly identity: string;
	snapshotInsertion(): InsertionSnapshot | null;
	commitText(snapshot: InsertionSnapshot, text: string): CommitReceipt;
	handleKeyDown(event: KeyboardEvent): "handled" | "unhandled";
}
