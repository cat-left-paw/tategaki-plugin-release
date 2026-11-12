// New for the clipboard stage (D-C-11; 2026-11-08). Not in Nyoze (its menu runs `execCommand` and synthetic events, which the product never does: `tests/pm-mode/boundaries.ts`). The shape of V's
// context menu (`src/wysiwyg/shared/command-context-menu.ts`: Obsidian's `Menu`, `showAtMouseEvent`, the clipboard items) with the clipboard of the window the view is in (`navigator.clipboard`
// of the element's own window: a popout's too), and only the three items the author decided on (Copy, Cut, Paste; the other commands are M5).
import { Menu } from "obsidian";
import { t } from "../../../shared/i18n";
import { mayCopyCutFromSurface, normalizePasteText } from "../input/clipboard-policy";
import type { ClipboardBusy, ClipboardOwner } from "./clipboard";
import type { InputSurface, SurfaceRecord } from "./input-surface";
import { lendsPointer } from "./pointer-lending";

/**
 * The context menu of the display: it stops the browser's own menu, puts Copy, Cut and Paste, and moves neither the caret nor the selection (the right button lends no pointer, `pointer-lending.ts`; nor
 * does a press with Ctrl, Cmd or Alt, which the macOS Ctrl+click is: D-C-18).
 * Copy and Cut are on only where there is a selection and nothing composing or held (D-C-11); Paste is on where nothing is composing or held. The surface is given the focus back when the menu is
 * closed (`refocus`). The clipboard is asked at the moment an item is chosen and read or written there (asynchronously, as the API is): the note it writes to is the one at the choosing
 * (`snapshotInsertion`), and the owner refuses it as `stale` if the note has changed while the clipboard was read (the text stays on the clipboard). A Cut writes the clipboard first and the
 * note second, so a clipboard that cannot be written never takes text out of the note.
 */
/** D-C-21: a `keydown` of Escape (what Obsidian's keymap hands to a menu's `hide`). Duck-typed: a popout window has its own `KeyboardEvent` class. */
const isEscapeKeydown = (event: unknown): event is KeyboardEvent => typeof event === "object" && event !== null && (event as { type?: unknown }).type === "keydown" && (event as { key?: unknown }).key === "Escape";

export function createPmModeContextMenu(options: { container: HTMLElement; surface: InputSurface; owner: ClipboardOwner; isEligible(): boolean; refocus(): void; record: SurfaceRecord; notify?: (reason: ClipboardBusy) => void }) {
	const { container, surface, owner, record } = options;
	/**
	 * D-C-21 (O-1): the Escape that closed the menu is not the one that closes a range (R2-10). Obsidian 1.15.0 (`app.js`): the keymap is a `window` capture listener made at the start of the app, so it runs
	 * before the view's own `window` capture guard; the open menu's scope (the top of the window's scope stack) holds `register([], "Escape", this.hide.bind(this))`, so `hide` is called with the key event as its
	 * first argument; it returns the menu, not `false`, so the keymap neither prevents nor stops the event: the guard gets it next, and by then the menu is closed (its `onHide` callback comes later, after the
	 * hide animation), so the guard cannot tell by the menu's state. The menu made here is the one thing that sees the event: its `hide` takes note of the Escape keydown it is called with, in a set of
	 * events (no mark that outlives the key press, no timer, no `window.event`). A menu closed by any other way (an item, a click outside, the API) calls `hide` with no key event: the next Escape closes a range as before.
	 */
	const closedByEscape = new WeakSet<KeyboardEvent>();
	/**
	 * D-C-23 (F-8): in a popout window the key is not the original event. Obsidian's listener on the popout window (capture, made when the window was: `PV`, app.js 1.15.0) dispatches a copy of every
	 * key event on the main `window` first (`dI`: a new event, `isRelayed`, whose `preventDefault`, `stopPropagation` and `stopImmediatePropagation` also call the original's, and whose `target` and
	 * `currentTarget` are the original's), and the main window's Keymap, which handles the active window's scope stack, hands the menu's `hide` that copy. The view's guard (the popout window's capture,
	 * after the relay) then gets the original, which is not in the set. `relayedClose` pairs them: the target of the Escape the menu was closed by (the copy's `target` is the original's), kept for the
	 * guard's one question about this key press, which comes next in the same dispatch (it is asked at every Escape the guard sees inside the view, and a menu opened again ends it): not a mark that waits for
	 * a later key. Only an Escape inside this view's own element is kept (the guard looks at the same thing).
	 */
	let relayedClose: { readonly target: EventTarget | null } | null = null;
	class EscapeAwareMenu extends Menu {
		override hide(event?: unknown): this {
			if (isEscapeKeydown(event)) {
				closedByEscape.add(event);
				relayedClose = container.contains(event.target as Node | null) ? { target: event.target } : null;
				// D-C-23 (F-8): the Escape that closed the menu is the menu's: its default is stopped. `hide` answers the key with the menu, not `false`, so Obsidian's keymap does not stop it, and the main window's
				// workspace listener for Escape (`window`, bubble, skipped for an event whose default was prevented) would move the focus to the main window's last note: the popout window went behind it. In
				// a popout this event is the relayed copy, whose `preventDefault` stops the original's default too (R4-2 relies on the same).
				event.preventDefault();
			}
			return super.hide();
		}
	}
	const clipboard = () => container.ownerDocument.defaultView?.navigator.clipboard;
	const copy = async (): Promise<void> => {
		const text = owner.copyText(), board = clipboard();
		if (text === null || !board) { record("menu-clipboard", { item: "copy", handled: false }); return; }
		try { await board.writeText(text); record("menu-clipboard", { item: "copy", handled: true, length: text.length }); } catch { record("menu-clipboard", { item: "copy", handled: false, reason: "clipboard refused" }); }
	};
	/** After the clipboard was waited for (round 2, P3-5): a composition may have begun, or text been held, while it was; then nothing is written and one notice says so. */
	const busy = (item: string): boolean => {
		const composing = surface.isComposing(), retained = !!surface.text();
		if (!composing && !retained) return false;
		record("menu-clipboard", { item, handled: false, reason: composing ? "composing" : "retained" });
		options.notify?.(composing ? "composing" : "retained");
		return true;
	};
	const cut = async (): Promise<void> => {
		// The plan first (round 2, P2-3: a cut that is refused takes nothing, not even the clipboard's old text); then the clipboard, then the note.
		const snapshot = owner.snapshotInsertion(), board = clipboard();
		if (!snapshot || !board) { record("menu-clipboard", { item: "cut", handled: false }); return; }
		const planned = owner.cutPlan(snapshot);
		if (planned.receipt !== "ready" || planned.text === null) { record("menu-clipboard", { item: "cut", handled: false, receipt: planned.receipt }); return; }
		try { await board.writeText(planned.text); } catch { record("menu-clipboard", { item: "cut", handled: false, reason: "clipboard refused" }); return; }
		if (busy("cut")) return;
		// (D-C-12: a cut is an input of its own: the mark of an end's echo, D-M4-16, ends with it)
		surface.releaseCommitEcho();
		const result = owner.cutText(snapshot);
		record("menu-clipboard", { item: "cut", handled: result.receipt === "committed", receipt: result.receipt, length: planned.text.length });
	};
	const paste = async (): Promise<void> => {
		const snapshot = owner.snapshotInsertion(), board = clipboard();
		if (!snapshot || !board) { record("menu-clipboard", { item: "paste", handled: false }); return; }
		let raw = "";
		try { raw = await board.readText(); } catch { record("menu-clipboard", { item: "paste", handled: false, reason: "clipboard refused" }); return; }
		const text = normalizePasteText(raw);
		if (!text) { record("menu-clipboard", { item: "paste", handled: false, reason: "empty" }); return; }
		if (busy("paste")) return;
		surface.releaseCommitEcho();
		const receipt = owner.pasteText(snapshot, text);
		record("menu-clipboard", { item: "paste", handled: receipt === "committed", receipt, length: text.length });
	};
	const onContextMenu = (event: MouseEvent): void => {
		if (!options.isEligible()) return;
		event.preventDefault();
		event.stopPropagation();
		const composing = surface.isComposing(), retained = !!surface.text();
		const takes = mayCopyCutFromSurface({ focused: true, eligible: true, composing, retained, selectionEmpty: owner.selectionEmpty() }), pastes = !composing && !retained;
		const menu = new EscapeAwareMenu();
		menu.addItem(item => item.setTitle(t("common.copy")).setIcon("copy").setDisabled(!takes).onClick(() => { void copy(); }));
		menu.addItem(item => item.setTitle(t("common.cut")).setIcon("scissors").setDisabled(!takes).onClick(() => { void cut(); }));
		menu.addItem(item => item.setTitle(t("common.paste")).setIcon("clipboard-paste").setDisabled(!pastes).onClick(() => { void paste(); }));
		relayedClose = null; // (a menu opened again: an Escape that closed the earlier one has been answered)
		menu.onHide(() => options.refocus());
		menu.showAtMouseEvent(event);
		record("context-menu", { takes, pastes });
	};
	// The press of the right button does not take the focus from the surface (the browser's default for a press on text that cannot be focused): a composition goes on under a right click, and the
	// pseudo caret stays. The menu's own `contextmenu` follows as before.
	// D-C-18 (F-1): nor does a press of the primary button that lends no pointer (with Ctrl, Cmd or Alt: `lendsPointer`). Its default would move the display's selection with no lease to put it into
	// CodeMirror, so that the two differ (macOS's Ctrl+click, which is also the menu's press, made the display show a caret over the range that CodeMirror kept: a Backspace then took the range that
	// was not shown). A press that is lent (no modifier, or Shift) is the lease's, and the fold toggles' `click` is not affected by a `mousedown` that is stopped.
	const onPress = (event: MouseEvent): void => {
		if (!options.isEligible()) return;
		if (event.button === 2 || (event.button === 0 && !lendsPointer(event))) event.preventDefault();
	};
	container.addEventListener("mousedown", onPress, true);
	container.addEventListener("contextmenu", onContextMenu);
	return {
		/** D-C-21: whether this Escape keydown is the one that closed the context menu (the view's Escape guard asks, so that the key does not also close a range). */
		closedByEscape: (event: KeyboardEvent): boolean => {
			const relayed = relayedClose; relayedClose = null;
			return closedByEscape.has(event) || (relayed !== null && relayed.target === event.target);
		},
		destroy(): void { container.removeEventListener("mousedown", onPress, true); container.removeEventListener("contextmenu", onContextMenu); },
	};
}
