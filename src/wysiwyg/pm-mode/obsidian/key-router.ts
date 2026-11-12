// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/keyRouter.ts @ 020b5501 (2026-10-22)
// Local changes: Host handoff/focusHost/I8 and native Shift+Tab are omitted. Owner edit/history keys go to CM.
//   M3a routes H3 navigation and Select All to the explicit selection ports, after retained-text/IME gating.
//   Unsupported navigation and modifier deletion are only prevented; unsupported keys have no view-scope entry.
//   `ownerScopeKeys` selects the platform edit/history keys for view.scope (D9),
//   including Shift+Backspace/Delete (R3). K2 observes all trusted surface keys. K8 keeps a held deletion on the surface
//   after retained text empties. M2-3b S1 ends that run at blur, pointerdown, another non-modifier key or compositionstart too.
//   M2-3b R6 stops retained-text history chords without handing them to the owner.
//   M2-4d item 10 normalizes Process/229 by physical code for the IME hold; legacy K8 still uses its key.
//   M3a adds H3 navigation and Select All after the unchanged retained/IME branches; handled keys also have view-scope entries.
//   M2-4d L14 also holds a deletion begun during IME after its end (empty or committed); keyup ends that hold.
//   M3a round 2 (R2-10): `escape` closes a range to its head caret; the view's window-capture Escape guard calls it.
import { classifySurfaceKey, isCompositionMismatch, isModifierOnly } from "../input/surface-state";
import { blocksUnclaimedWindowsCharacter } from "../input/composition-intent";
import type { EditOwner } from "../input/edit-owner";
import type { InputSurface, SurfaceRecord } from "./input-surface";
import type { ViewRoot } from "./composed-tree";
import { classifyPmHistoryChord } from "./history-keys";
import { resolveNavigationKey } from "./navigation/key-operation";
import type { NavigationOp } from "./navigation/rules";
import type { SupportedEditorWritingMode } from "./navigation/writing-mode";

/**
 * The full binding table, as `Scope.register(modifiers, key, …)` arguments (D9). `ownerScopeKeys` selects the platform. The view registers a
 * handler for each that returns `true` and does nothing: Obsidian's keymap (a `window` capture listener) then stops at
 * the view's scope — the hotkeys of the app scope are not looked up — and does not `preventDefault`, so the event
 * reaches the surface, which handles it once. (Obsidian 1.14.4 `app.js`: `Scope.handleKey` returns a handler's value
 * when it is not `undefined`; the keymap prevents the event only for `false`.)
 */
export const OWNER_SCOPE_KEYS: readonly { readonly modifiers: readonly ("Mod" | "Ctrl" | "Shift")[]; readonly key: string }[] = [
	{ modifiers: [], key: "Backspace" },
	{ modifiers: [], key: "Delete" },
	{ modifiers: ["Shift"], key: "Backspace" },
	{ modifiers: ["Shift"], key: "Delete" },
	{ modifiers: [], key: "Enter" },
	{ modifiers: ["Shift"], key: "Enter" },
	{ modifiers: ["Mod"], key: "z" },
	{ modifiers: ["Mod", "Shift"], key: "z" },
	{ modifiers: ["Ctrl"], key: "y" },
];

/** K10: Ctrl+Y belongs to the Windows/Linux history keys, not the Mac view scope. */
export function ownerScopeKeys(mac: boolean): typeof OWNER_SCOPE_KEYS {
	return mac ? OWNER_SCOPE_KEYS.filter(entry => entry.key !== "y") : OWNER_SCOPE_KEYS;
}

/** Windows IME reports Process/229; keep the physical deletion name across that boundary. */
function deletionKeyOf(event: Pick<KeyboardEvent, "key" | "code" | "keyCode">): "Backspace" | "Delete" | null {
	if (event.key === "Backspace" || event.key === "Delete") return event.key;
	if ((event.key === "Process" || event.keyCode === 229) && (event.code === "Backspace" || event.code === "Delete")) return event.code;
	return null;
}

export function createKeyRouter(options: {
	surface: InputSurface;
	currentOwner(): EditOwner;
	isEligible(): boolean;
	navigation?: { readonly mode: SupportedEditorWritingMode; navigate(op: NavigationOp): boolean; selectAll(): boolean; closeRange(): boolean };
	/** K2: observe every trusted key, including keys not passed to the owner. */
	onKeyDown?(event: KeyboardEvent): void;
	/** M3c round 2 (R2-1): a key goes to the surface's own held text (D-M3-16): the browser moves its caret by default, and the display (the pseudo caret) reads where the caret is after that, in the next frame. */
	onHeldTextKey?(): void;
	record?: SurfaceRecord;
}) {
	const { surface } = options;
	const record: SurfaceRecord = options.record ?? (() => {});
	const win = surface.element.ownerDocument.defaultView;
	// K8 / S1 / L14: failed-text and IME-started holds end at explicit boundaries, before any IME early return.
	const retainedDeletionKeys = new Set<string>();
	const compositionDeletionKeys = new Set<string>();
	const releaseRetainedDeletion = (): void => { retainedDeletionKeys.clear(); compositionDeletionKeys.clear(); };
	const onKeyDown = (event: KeyboardEvent): void => {
		// Keys that are not the user's, and keys while the surface does not hold the focus, are not ours.
		if (!event.isTrusted || event.target !== surface.element || (surface.element.getRootNode() as ViewRoot).activeElement !== surface.element || !options.isEligible()) return;
		const deletionKey = deletionKeyOf(event), deletion = deletionKey !== null;
		if (deletion && !event.repeat) { retainedDeletionKeys.delete(event.key); compositionDeletionKeys.delete(deletionKey); }
		if (!isModifierOnly(event.key) && (!deletion || !retainedDeletionKeys.has(event.key) && !compositionDeletionKeys.has(deletionKey))) releaseRetainedDeletion();
		// L14: remember only the first key of an IME deletion hold, before the IME/desync early returns.
		// The IME still owns it; neither compositionend nor its commit releases the physical hold.
		if (deletion && !event.repeat && (event.isComposing || event.keyCode === 229)) compositionDeletionKeys.add(deletionKey);
		options.onKeyDown?.(event);
		record("surface-keydown", { key: event.key, keyCode: event.keyCode, trusted: event.isTrusted });
		if (isCompositionMismatch(surface.isComposing() || event.isComposing, event)) {
			event.preventDefault();
			event.stopPropagation();
			record("ime-desync", { key: event.key, keyCode: event.keyCode });
			return;
		}
		// Whatever the IME is doing is the IME's.
		if (surface.isComposing() || event.isComposing || event.keyCode === 229) return;
		const blockUnclaimedWindowsKey = (): boolean => {
			if (!blocksUnclaimedWindowsCharacter(event, /Mac/.test(win?.navigator.platform ?? ""), surface.isComposing())) return false;
			event.preventDefault();
			record("unclaimed-windows-character-blocked", { key: event.key });
			return true;
		};
		// The focus never leaves the view by Tab, with or without retained text.
		if (event.key === "Tab") { event.preventDefault(); record("tab-default-blocked"); return; }
		// With retained text the keys work on that text only (Backspace and Delete empty it: I5). Nothing reaches the owner.
		if (surface.text()) {
			options.onHeldTextKey?.();
			if (classifyPmHistoryChord(event, /Mac/.test(win?.navigator.platform ?? ""))) {
				event.preventDefault(); event.stopPropagation();
				record("retained-history-key-blocked", { key: event.key });
				return;
			}
			if (deletion && surface.failure()) retainedDeletionKeys.add(event.key);
			blockUnclaimedWindowsKey(); return;
		}
		if (deletion && event.repeat && (retainedDeletionKeys.has(event.key) || compositionDeletionKeys.has(deletionKey))) {
			event.preventDefault(); event.stopPropagation();
			record("retained-delete-repeat-blocked", { key: event.key });
			return;
		}
		const mac = /Mac/.test(win?.navigator.platform ?? "");
		if ((mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey && !event.shiftKey && /^a$/i.test(event.key) && options.navigation) {
			event.preventDefault(); event.stopPropagation();
			const moved = options.navigation.selectAll(); record("navigation-all", { moved }); return;
		}
		const route = classifySurfaceKey(event);
		if (route === "retain") { blockUnclaimedWindowsKey(); return; }
		if (route === "owner") {
			// One owner operation; the native default never edits the empty surface and no bubbling listener sees it.
			const handled = options.currentOwner().handleKeyDown(event) === "handled";
			event.preventDefault();
			event.stopPropagation();
			record("owner-key", { key: event.key, handled });
			return;
		}
		if (route === "navigation") {
			event.preventDefault();
			const op = options.navigation ? resolveNavigationKey(event, options.navigation.mode, mac) : null;
			if (op && options.navigation) { event.stopPropagation(); const moved = options.navigation.navigate(op); record("navigation", { key: event.key, moved, ...op }); }
			else record("navigation-blocked", { key: event.key });
			return;
		}
		// "shortcut" and the rest: modifier deletion is blocked; others (Mod+P, Mod+O …) go on to the app's hotkeys.
		if (blockUnclaimedWindowsKey()) return;
		if ((event.metaKey || event.ctrlKey || event.altKey) && /^(Backspace|Delete)$/.test(event.key)) { event.preventDefault(); record("modifier-delete-blocked", { key: event.key }); }
	};
	const onKeyUp = (event: KeyboardEvent): void => { const deletionKey = deletionKeyOf(event); if (event.isTrusted && deletionKey) compositionDeletionKeys.delete(deletionKey); };
	surface.element.addEventListener("keydown", onKeyDown);
	surface.element.addEventListener("keyup", onKeyUp);
	surface.element.addEventListener("blur", releaseRetainedDeletion);
	surface.element.addEventListener("compositionstart", releaseRetainedDeletion);
	/**
	 * R2-10 (H11): a bare Escape closes a range to its head caret. The view's `window` capture guard stops every Escape inside
	 * the view (M2), so this key never reaches the surface's own listener: the guard calls this first, with the same gate
	 * as `onKeyDown` (trusted, the surface holds the focus, the view is eligible). The IME owns Escape while composing, and retained
	 * text belongs to the surface. A collapsed selection does nothing (M2 design §8). Returns true only if it wrote.
	 */
	const escape = (event: KeyboardEvent): boolean => {
		if (event.key !== "Escape" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !options.navigation) return false;
		if (!event.isTrusted || event.composedPath()[0] !== surface.element || !surface.hasFocus() || !options.isEligible()) return false;
		if (surface.isComposing() || event.isComposing || event.keyCode === 229 || surface.text()) return false;
		const closed = options.navigation.closeRange();
		if (closed) event.preventDefault();
		record("navigation-escape", { closed });
		return closed;
	};
	return { releaseRetainedDeletion, escape, destroy: (): void => {
		surface.element.removeEventListener("keydown", onKeyDown);
		surface.element.removeEventListener("keyup", onKeyUp);
		surface.element.removeEventListener("blur", releaseRetainedDeletion);
		surface.element.removeEventListener("compositionstart", releaseRetainedDeletion);
	} };
}
