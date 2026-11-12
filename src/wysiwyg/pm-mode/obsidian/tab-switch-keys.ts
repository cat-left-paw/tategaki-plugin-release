// New in M3b round 4 (R4-3; no origin in Nyoze). The hotkeys of the commands that switch tabs, as the user has them, for `PmModeView`'s scope.
// M3d (R-D2): and of the commands that close the active leaf or put a new one in front of it (the same shape: the old leaf is hidden or taken out of the page before the focus moves).
//
// Why the view asks for them: Obsidian's tab commands (`workspace:next-tab` and the others below) hide the old leaf (`display: none`) first and move the focus
// after that (app.js 1.15.0, `workspace:next-tab` -> `selectTabIndex` -> `setActiveLeaf` -> `focusLeaf`). An IME composition on the input surface is then ended by
// the browser after the surface was hidden: the end carries no data and reaches the OS input method too late, so the IME keeps its text and offers it again in the
// note the user went to. A composition that ends while the surface is still shown (as when the focus moves by a click) is committed and the IME starts clean.
// The view therefore takes the focus off the surface (only while it composes) and runs the same command itself.
//
// The effective hotkeys are Obsidian's own: `app.hotkeyManager.getHotkeys(id)` (the user's, from `hotkeys.json`; an empty list means the user removed them) and, when
// the user has none for the command, `getDefaultHotkeys(id)` (what the command was registered with). The manager is internal API: where it is missing or throws,
// the defaults below (the same as the ones app.js 1.15.0 registers) are used. This file only reads and compares; it runs nothing.

export interface TabHotkey {
	readonly modifiers: readonly string[];
	readonly key?: string;
	readonly code?: string;
}
/** The part of Obsidian's `HotkeyManager` that is read. */
export interface HotkeySource {
	getHotkeys?(commandId: string): readonly TabHotkey[] | undefined;
	getDefaultHotkeys?(commandId: string): readonly TabHotkey[] | undefined;
}
/** What Obsidian's `Keymap` hands to a scope handler for one key event. */
export interface KeyContext { readonly modifiers: string; readonly key: string; readonly vkey: string }

/**
 * app.js 1.15.0: `next-tab`, `previous-tab`, `goto-tab-1..8` and `goto-last-tab` select another tab (`selectTabIndex` hides the old leaf, then `setActiveLeaf` moves the focus).
 * M3d (R-D2) adds what ends the active leaf in the same way: `workspace:close` (`leaf.detach()`: the leaf's element leaves the page, the view is closed), `workspace:close-window`
 * (`activeWindow.close()`), `workspace:close-tab-group` (detaches every leaf of the group, the active one too) and `workspace:new-tab` (a new leaf is made the selected tab, the old one is hidden).
 * Not added: `close-others` and `close-others-tab-group` (the active leaf stays), `new-window`, `open-in-new-window`, `undo-close-pane`, `split-*` (the old leaf stays shown: the focus moves
 * while the surface is still shown, as for a click), `move-to-new-window` (the element is moved, not hidden; the view is made again for its window: pm-mode-view.ts, R3-1) and `toggle-pin`,
 * `toggle-stacked-tabs` (the focus does not move).
 */
export const TAB_SWITCH_COMMANDS: readonly string[] = [
	"workspace:next-tab", "workspace:previous-tab",
	"workspace:goto-tab-1", "workspace:goto-tab-2", "workspace:goto-tab-3", "workspace:goto-tab-4", "workspace:goto-tab-5", "workspace:goto-tab-6", "workspace:goto-tab-7", "workspace:goto-tab-8",
	"workspace:goto-last-tab",
	"workspace:close", "workspace:close-window", "workspace:close-tab-group", "workspace:new-tab",
];

/** The defaults of app.js 1.15.0 (`addCommand` for each command): used only where the hotkey manager cannot be read. */
export function builtInTabSwitchHotkeys(mac: boolean): ReadonlyMap<string, readonly TabHotkey[]> {
	const map = new Map<string, readonly TabHotkey[]>();
	map.set("workspace:next-tab", [{ modifiers: ["Ctrl"], key: "Tab" }, mac ? { modifiers: ["Meta", "Shift"], key: "]" } : { modifiers: ["Ctrl"], key: "PageDown" }]);
	map.set("workspace:previous-tab", [{ modifiers: ["Ctrl", "Shift"], key: "Tab" }, mac ? { modifiers: ["Meta", "Shift"], key: "[" } : { modifiers: ["Ctrl"], key: "PageUp" }]);
	for (let n = 1; n <= 8; n++) map.set(`workspace:goto-tab-${n}`, [{ modifiers: ["Mod"], key: String(n) }]);
	map.set("workspace:goto-last-tab", [{ modifiers: ["Mod"], key: "9" }]);
	// (M3d) `close`: Mod+W, `close-window`: Mod+Shift+W, `new-tab`: Mod+T; `close-tab-group` has no default hotkey in app.js 1.15.0.
	map.set("workspace:close", [{ modifiers: ["Mod"], key: "W" }]);
	map.set("workspace:close-window", [{ modifiers: ["Mod", "Shift"], key: "W" }]);
	map.set("workspace:close-tab-group", []);
	map.set("workspace:new-tab", [{ modifiers: ["Mod"], key: "T" }]);
	return map;
}

/** Obsidian's `Keymap.compileModifiers`: `Mod` is Meta on macOS and Ctrl elsewhere; sorted, comma-joined. */
export function compileModifiers(modifiers: readonly string[], mac: boolean): string {
	return modifiers.map(modifier => modifier === "Mod" ? (mac ? "Meta" : "Ctrl") : modifier).sort().join(",");
}
/** Obsidian's `rne`: a physical `KeyA` is the key `A`. */
function keyOf(hotkey: TabHotkey): string {
	const code = hotkey.code;
	if (code) return code.startsWith("Key") && code.length === 4 ? code.charAt(3) : code;
	return hotkey.key ?? "";
}
function valid(list: unknown): list is readonly TabHotkey[] {
	return Array.isArray(list) && list.every(item => !!item && Array.isArray((item as TabHotkey).modifiers) && (item as TabHotkey).modifiers.every(m => typeof m === "string")
		&& ((item as TabHotkey).key === undefined || typeof (item as TabHotkey).key === "string") && ((item as TabHotkey).code === undefined || typeof (item as TabHotkey).code === "string"));
}

/** The hotkeys of every tab command now: the user's, else the command's default, else (the manager cannot be read) the built-in default. Read at every key, so a change in Obsidian's settings is seen at once. */
export function readTabSwitchHotkeys(source: HotkeySource | null | undefined, mac: boolean): ReadonlyMap<string, readonly TabHotkey[]> {
	const builtIn = builtInTabSwitchHotkeys(mac), out = new Map<string, readonly TabHotkey[]>();
	const readable = !!source && typeof source.getHotkeys === "function";
	for (const id of TAB_SWITCH_COMMANDS) {
		let list: unknown;
		if (readable) {
			try { list = source?.getHotkeys?.(id) ?? source?.getDefaultHotkeys?.(id); } catch { list = undefined; }
		}
		out.set(id, valid(list) ? list : builtIn.get(id) ?? []);
	}
	return out;
}

/** The tab command a key event runs, or null. The same comparison as Obsidian's `Keymap.isMatch` (the modifiers as a whole, the key by its virtual key or its name, any case); a hotkey with no key matches nothing. */
export function matchTabSwitchCommand(hotkeys: ReadonlyMap<string, readonly TabHotkey[]>, context: KeyContext, mac: boolean): string | null {
	for (const [id, list] of hotkeys) {
		for (const hotkey of list) {
			const key = keyOf(hotkey);
			if (!key || compileModifiers(hotkey.modifiers, mac) !== context.modifiers) continue;
			if (key === context.vkey || (!!context.key && key.toLowerCase() === context.key.toLowerCase())) return id;
		}
	}
	return null;
}
