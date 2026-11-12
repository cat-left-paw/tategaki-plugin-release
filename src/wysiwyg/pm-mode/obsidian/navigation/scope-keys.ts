import { resolveNavigationKey } from "./key-operation";
import type { SupportedEditorWritingMode } from "./writing-mode";

export type NavigationScopeKey = { modifiers: ("Mod" | "Ctrl" | "Alt" | "Shift")[]; key: string };
/** D-M3-15: register exactly the current writing-mode/platform table, including Select All. */
export function navigationScopeKeys(mac: boolean, mode: SupportedEditorWritingMode): NavigationScopeKey[] {
	const out: NavigationScopeKey[] = [{ modifiers: ["Mod"], key: "a" }];
	for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
		for (let mask = 0; mask < 16; mask++) {
			const event = { key, keyCode: 0, getModifierState: () => false, shiftKey: !!(mask & 1), altKey: !!(mask & 2), ctrlKey: !!(mask & 4), metaKey: !!(mask & 8) };
			if (!resolveNavigationKey(event, mode, mac)) continue;
			const modifiers: NavigationScopeKey["modifiers"] = [];
			if (event.shiftKey) modifiers.push("Shift");
			if (event.altKey) modifiers.push("Alt");
			if (event.ctrlKey) modifiers.push(mac ? "Ctrl" : "Mod");
			if (event.metaKey) modifiers.push("Mod");
			out.push({ key, modifiers });
		}
	}
	return out;
}
