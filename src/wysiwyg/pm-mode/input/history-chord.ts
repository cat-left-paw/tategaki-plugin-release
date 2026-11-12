// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/localImeHistoryHandoffState.ts (classifyLocalImeHistoryChord) @ 020b5501 (2026-10-22)
// Local changes: renamed; the probe takes the AltGraph state as Nyoze's callers pass it.

export type HistoryOperation = "undo" | "redo";
export interface HistoryChordProbe {
	readonly key: string;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
	readonly altKey: boolean;
	readonly shiftKey: boolean;
	/** AltGraph on, or not known (`readAltGraphState` is `indeterminate`): never a history chord. */
	readonly altGraphKey?: boolean;
}

/**
 * `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z` and `Ctrl+Y` (Windows' Redo; `ctrlKey` only, not `Cmd+Y` or
 * `Ctrl+Shift+Y`). The input surface's key router and the view's scope registration (D9) use this
 * one classifier.
 */
export function classifyHistoryChord(probe: HistoryChordProbe): HistoryOperation | null {
	if (probe.altGraphKey === true) return null;
	if (probe.key === "Process" || probe.key === "Unidentified") return null;
	if ((!probe.metaKey && !probe.ctrlKey) || probe.altKey) return null;
	const key = probe.key.toLowerCase();
	if (key === "z") return probe.shiftKey ? "redo" : "undo";
	if (key === "y" && probe.ctrlKey && !probe.metaKey && !probe.shiftKey) return "redo";
	return null;
}
