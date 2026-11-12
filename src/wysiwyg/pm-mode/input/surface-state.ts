// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/surfaceState.ts @ 020b5501 (2026-10-22)
//         and readLocalImeAltGraphState from src/editor-core/features/localImeHistoryHandoffState.ts
// Local changes: no `host-keyboard` entry from the new mode's wiring (the PM is read-only: the
//   pure transitions stay as in Nyoze, the Obsidian layer never sends `handoff` / `host-focus`).
//   Tab and modifier Backspace / Delete classify as in Nyoze; the new mode consumes them (M2 design §8).

/** DOM・PM runtimeに依存しない入力面の判断（Nyoze S2）。 */
export type SurfaceState = "surface" | "lent" | "surface-range" | "host-keyboard" | "inactive";
export type SurfaceEvent =
	| { type: "surface-focus" | "selection"; range: boolean }
	| { type: "pointerdown" }
	| { type: "pointerup"; range: boolean; inputStarted: boolean }
	| { type: "host-focus" | "handoff" | "pointercancel" }
	| { type: "deactivate" };

export function transitionSurface(state: SurfaceState, event: SurfaceEvent): SurfaceState {
	switch (event.type) {
		case "pointerdown": return "lent";
		case "pointerup":
			return state !== "lent" ? state : event.inputStarted ? "host-keyboard" : event.range ? "surface-range" : "surface";
		case "surface-focus": return event.range ? "surface-range" : "surface";
		case "selection":
			return state === "surface" || state === "surface-range" ? event.range ? "surface-range" : "surface" : state;
		case "host-focus": return state === "lent" ? state : "host-keyboard";
		case "handoff": return "host-keyboard";
		case "pointercancel": return state === "lent" ? "host-keyboard" : state;
		case "deactivate": return "inactive";
	}
}

export function judgeInsertion(
	snapshot: { identity: string; docRef: unknown } | null,
	current: { identity: string; docRef: unknown },
	text: string,
): "ready" | "stale" | "newline-in-payload" {
	if (!snapshot || snapshot.identity !== current.identity || snapshot.docRef !== current.docRef) return "stale";
	return /[\n\r]/.test(text) ? "newline-in-payload" : "ready";
}

export function shouldNormalizeEmptySurface(composing: boolean, text: string): boolean {
	return !composing && text.length === 0;
}

/** inputの結果だけに使う。focus / normalize / compositionendからは解除しない。 */
export function shouldClearSurfaceFailure(hasFailure: boolean, composing: boolean, text: string): boolean {
	return hasFailure && !composing && text.length === 0;
}

export function isSurfaceInputAllowed(inputType: string, composing: boolean, hasRetainedText: boolean): boolean {
	return composing || inputType === "insertText" || /^(insert|delete).*Composition/.test(inputType) || (hasRetainedText && inputType.startsWith("delete"));
}

export type AltGraphState = "off" | "on" | "indeterminate";
export function readAltGraphState(event: Pick<KeyboardEvent, "getModifierState">): AltGraphState {
	if (typeof event.getModifierState !== "function") return "indeterminate";
	try {
		return event.getModifierState("AltGraph") ? "on" : "off";
	} catch {
		return "indeterminate";
	}
}

export type SurfaceKey = Pick<KeyboardEvent, "key" | "keyCode" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "getModifierState">;
export function isModifierOnly(key: string): boolean {
	return /^(Shift|Control|Alt|Meta|CapsLock|Fn|FnLock|NumLock|ScrollLock|AltGraph)$/.test(key);
}
export function isCompositionMismatch(composing: boolean, event: SurfaceKey): boolean {
	return composing && event.keyCode !== 229 && !isModifierOnly(event.key);
}
export function classifySurfaceKey(event: SurfaceKey): "retain" | "owner" | "navigation" | "shortcut" | "handoff" {
	if (isModifierOnly(event.key) || event.keyCode === 229) return "retain";
	if (readAltGraphState(event) !== "off") return "retain";
	const command = event.metaKey || event.ctrlKey;
	if (!command && event.key.length === 1) return "retain";
	if (command && !event.altKey && /^[cxv]$/i.test(event.key)) return "retain";
	if (command && !event.altKey && /^a$/i.test(event.key)) return "shortcut";
	if (/^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key)) return "navigation";
	if ((command || event.altKey) && /^(Backspace|Delete)$/.test(event.key)) return "shortcut";
	if (["Backspace", "Delete", "Enter"].includes(event.key) || (command && !event.altKey && /^[zy]$/i.test(event.key))) return "owner";
	if (!command && (event.key === "Dead" || event.key === "Process")) return "retain";
	if (event.key === "Escape") return "retain";
	return "shortcut";
}
