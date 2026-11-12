import { MarkdownEditingModeError } from "../../sot/markdown-editing-mode";
import { ItemView, MarkdownView, Notice, Scope, TFile, type WorkspaceLeaf } from "obsidian";
import type { EditorView as CmView } from "@codemirror/view";
import type TategakiV2Plugin from "../../../core/plugin";
import type { TategakiV2Settings } from "../../../types/settings";
import { t } from "../../../shared/i18n";
import { TATEGAKI_PM_VIEW_TYPE, canOpenPmMode } from "./entry";
import { resolvePmModeCapabilities, type PmModeCapabilities } from "./capabilities";
import { PmWorkspaceController } from "./pm-workspace";
import { PmModeSession } from "./session";
import type { PmModeObsidianEnv } from "./parts";
import { PmModeWriteLifetime } from "./source-owner";
import { showPmModeEditNotice } from "./key-notice";
import { ownerScopeKeys } from "./key-router";
import { PmModeCompositionRecovery } from "./composition-recovery";
import type { DocumentActionStatus } from "./document-action";
import { showPmModeLeaveBlockedNotice, showPmModeLostTextNotice } from "./input-notice";
import { navigationScopeKeys } from "./navigation/scope-keys";
import { createPmModeToolbar, type PmModeToolbar } from "./toolbar";
import { SettingsPanelModal } from "../../../shared/ui/settings-panel/settings-panel";
import { matchTabSwitchCommand, readTabSwitchHotkeys, type HotkeySource, type KeyContext } from "./tab-switch-keys";

export class PmModeView extends ItemView {
	currentFile: TFile | null = null;
	pairedMarkdownLeaf: WorkspaceLeaf | null = null;
	pairedMarkdownView: MarkdownView | null = null;
	pairedMarkdownBadgeLeaf: WorkspaceLeaf | null = null;
	pairedMarkdownBadgeEl: HTMLElement | null = null;
	pmTabBadgeEl: HTMLElement | null = null;
	pairedMismatchNotified = false;
	private closed = false;
	private session: PmModeSession | null = null;
	private readonly writeLifetime = new PmModeWriteLifetime();
	private readonly compositionRecovery = new PmModeCompositionRecovery(this.app, () => this.session?.input?.surface ?? null,
		() => !this.closed && this.app.workspace.getActiveViewOfType(PmModeView) === this);
	/** The running session, or null (for the development diagnostics, M1-5). */
	get activeSession(): PmModeSession | null { return this.session; }
	private readonly workspaceController = new PmWorkspaceController(this);
	private capabilities: PmModeCapabilities;
	/** The document the view's element was in when the view was made (R3-1): a popout move puts the element into another one (`checkWindow`). */
	private boundDocument: Document | null = null;
	/** A rebuild of the view for the window it moved into is going on (R3-1): the notices that come meanwhile are not acted on. */
	private reopening = false;
	private escapeDisposer: (() => void) | null = null;
	private navigationScopeDisposers: (() => void)[] = [];
	/** M4a (D-M4-12): the surface was settled for the closing of this view (a composition ended, what was left on it told); done once. */
	private settled = false;
	/** M4a (R4-1, D-M4-13): the text of a session that went away, until the session that takes it over has it (if none ever does, closing the view tells it). */
	private carried: string | null = null;
	/** M4a: this view's held text goes to the view that replaces it in a new window (`reopenInThisWindow`): closing this one tells nothing. */
	private handingOver = false;
	/** M4a (D-M4-11): the state an entry that events run again and again (the single-view constraint) last told about, so that it tells once for a state. */
	private lastBlockedNotice: DocumentActionStatus | null = null;
	/** C-d (D-T-1): the three-button toolbar above the display, and the element of the frame that holds the display (the session's container: its size is the display's). */
	private toolbar: PmModeToolbar | null = null;
	private frameBody: HTMLElement | null = null;
	constructor(leaf: WorkspaceLeaf, private readonly plugin: TategakiV2Plugin) {
		super(leaf);
		// Obsidian 1.14.5 View/ItemView do not create a scope. Workspace delegates to view.scope.
		this.scope = new Scope(this.app.scope);
		const win = this.containerEl.ownerDocument.defaultView;
		this.capabilities = win && win !== window ? resolvePmModeCapabilities(win) : plugin.pmModeCapabilities;
	}
	getViewType(): string { return TATEGAKI_PM_VIEW_TYPE; }
	getDisplayText(): string { return t("pm.view.title", { name: this.currentFile?.basename ?? "" }); }
	getIcon(): string { return "user-round-pen"; }
	getCurrentFilePath(): string | null { return this.currentFile?.path ?? null; }
	getState(): Record<string, never> { return {}; }
	isClosed(): boolean { return this.closed; }
	/** Command palette entry (K4); ordinary compositions have already ended when the palette opens. */
	requestCompositionRecovery(): void { this.compositionRecovery.request(); }
	closeSelf(): void {
		if (this.closed) return;
		// M4a (D-M4-12): before `closed` is set (the owner writes only for a view that is not closed) and before the leaf is detached.
		this.settleBeforeClose();
		this.closed = true;
		this.leaf.detach();
	}
	/** M4a (D-M4-11): what a document action finds on the input surface (composing, committing, held text); no side effect. */
	documentActionStatus(): DocumentActionStatus {
		const surface = this.session?.input?.surface;
		return surface ? surface.documentAction() : "ready";
	}
	/**
	 * M4a (D-M4-11): a stoppable entry (Tategaki's own opening, replacing or closing of its views: `mode-manager.ts`) asks whether this view may be left. While the surface is composing, is
	 * committing or holds text (a write that was refused), the answer is no: the entry does nothing, and one notice says to finish the composition, or to delete or copy the text, and to
	 * do it again (Nyoze `classifyInputSurfaceDocumentAction`: `wait-for-composition`, `busy-flushing`, `recovery-required`). `repeat: false` (an entry that events run again and again)
	 * tells once for a state, until the surface is ready again.
	 */
	requestLeave(options: { repeat?: boolean } = {}): boolean {
		const status = this.documentActionStatus();
		if (status === "ready") { this.lastBlockedNotice = null; return true; }
		if (options.repeat !== false || this.lastBlockedNotice !== status) showPmModeLeaveBlockedNotice(status);
		this.lastBlockedNotice = status;
		return false;
	}
	/**
	 * M4a (D-M4-12): this view is going away and nothing can stop it: the tab's close button, closing the window, quitting, the plugin unloading or its setting turned off, the paired
	 * leaf lost. In this order: (1) a composition is ended while the surface is still shown (the focus is taken off it, as for the tab keys, R-D2), so its text is written to the note
	 * if the paired Markdown can still be written; (2) what is left on the surface after that (text held because a write was refused, a composition that did not end) is told in a
	 * notice with its first characters (D10; never written to the clipboard). No character is dropped without a notice. It runs before `closed` is set and before the session is
	 * destroyed, once (`settled`). `final: false` is for Obsidian's `quit` event: the app is about to quit, but nothing here knows that it will, so the view is not marked settled and
	 * tells again (the same text) if it is closed later.
	 */
	settleBeforeClose(final = true): void {
		if (this.settled || this.handingOver) return;
		if (final) this.settled = true;
		const surface = this.session?.input?.surface;
		if (!surface) {
			const lost = this.carried; this.carried = null;
			if (lost) showPmModeLostTextNotice(lost);
			return;
		}
		const left = surface.settleBeforeLeave();
		if (left) showPmModeLostTextNotice(left);
	}
	async onOpen(): Promise<void> {
		const leaf = this.leaf as WorkspaceLeaf & { __tategakiInitialFile?: unknown; __tategakiReopenPair?: unknown; __tategakiReopenRetained?: unknown };
		const file = leaf.__tategakiInitialFile;
		const pair = leaf.__tategakiReopenPair;
		const retained = leaf.__tategakiReopenRetained;
		delete leaf.__tategakiInitialFile;
		delete leaf.__tategakiReopenPair;
		delete leaf.__tategakiReopenRetained;
		// M4a: text that the view this one replaces held goes with this view from here on: any way out before its surface has it tells it.
		const handedOver = (retained as { text?: unknown } | null | undefined)?.text;
		if (typeof handedOver === "string" && handedOver) this.carried = handedOver;
		if (!(file instanceof TFile)) { this.closeSelf(); return; }
		if (!canOpenPmMode(this.plugin.settings.enablePmMode, this.capabilities)) {
			new Notice(t("pm.notice.unavailable") + (this.capabilities.unavailableReason ?? ""), 3000);
			this.closeSelf(); return;
		}
		this.currentFile = file;
		// R3-1: a view that is made again for the window it moved into takes the Markdown leaf of the one it replaces, if that is still the file's, so that the
		// same CodeMirror (and its selection) is the owner.
		const pairedLeaf = pair as WorkspaceLeaf | null | undefined;
		if (pairedLeaf && pairedLeaf.view instanceof MarkdownView && pairedLeaf.view.file?.path === file.path && this.app.workspace.getLeavesOfType("markdown").includes(pairedLeaf)) {
			this.pairedMarkdownLeaf = pairedLeaf; this.pairedMarkdownView = pairedLeaf.view;
		}
		// (position, overflow and padding are the class's rule in styles.css)
		this.contentEl.classList.add("tategaki-pm-content");
		this.buildFrame();
		try {
			const markdown = await this.workspaceController.ensureMarkdownViewForFile(file);
			if (this.closed) return;
			const cm = (markdown?.editor as (MarkdownView["editor"] & { cm?: CmView }) | undefined)?.cm;
			if (!markdown || !cm?.state?.doc || !this.workspaceController.verifyPairedMarkdownViewFile(markdown, file)) {
				if (!this.pairedMismatchNotified) new Notice(t("pm.notice.cmMissing"), 3000);
				this.closeSelf(); return;
			}
			this.session = this.createSession(cm);
			// R4-1: the text the replaced view's input surface held (not written to the document) stays on this one's, with the reason it was not written.
			const held = retained as { text?: unknown; failure?: unknown } | null | undefined;
			if (held && typeof held.text === "string") {
				// M4a: if this surface does not take it over, it is told as lost (never dropped without a word).
				if (this.session.input?.surface.adoptRetained({ text: held.text, failure: (held.failure ?? null) as never })) this.carried = null;
				else if (held.text) { this.carried = null; showPmModeLostTextNotice(held.text); }
			}
			// Record every rename, including a rename away and back between two input events.
			const vault = this.app.vault;
			if (vault) this.registerEvent(vault.on("rename", (file, oldPath) => {
				const path = this.currentFile?.path;
				if (file === this.currentFile || path?.startsWith(file.path + "/") || path?.startsWith(oldPath + "/")) this.session?.sourceOwner.reconnect();
			}));
			this.workspaceController.registerWorkspacePairGuards();
			this.registerEvent(this.app.workspace.on("layout-change", () => { this.checkWindow(); this.checkFollow(); }));
			// The first entry of the focus (M2 design §6.1): the leaf became active. Synchronous, in the event (no timer).
			this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => { if (leaf === this.leaf) this.session?.focusInput("active-leaf"); }));
			// A theme or appearance change can change every block's size (offscreen-skip.ts).
			this.registerEvent(this.app.workspace.on("css-change", () => this.session?.remeasureLayout()));
			// M4a (D-M4-12): Obsidian quits. Nothing here can stop it, so a composition is ended while the surface is shown and what is left is told (the view is not closed by this: `final` is false).
			this.registerEvent(this.app.workspace.on("quit", () => this.settleBeforeClose(false)));
			const win = this.containerEl.ownerDocument.defaultView;
			this.boundDocument = this.containerEl.ownerDocument;
			this.bindEscapeGuard();
			this.register(() => { this.escapeDisposer?.(); this.escapeDisposer = null; });
			const scope = this.scope;
			if (scope) {
				// A specific scope record stops lookup even if it returns undefined. Delegate explicitly when
				// the surface is not focused, so paired editors and modals keep their application hotkeys.
				const route = (event: KeyboardEvent, context: unknown): unknown => {
					if (!this.closed && this.app.workspace.getActiveViewOfType(PmModeView) === this && this.session?.input?.surface.hasFocus()) return true;
					return (this.app.scope as Scope & { handleKey(event: KeyboardEvent, context: unknown): unknown }).handleKey(event, context);
				};
				// R4-2, R-D1: Escape is answered `false` (handled) while the surface holds the focus (a composition too: M3d). In a popout window Obsidian does not hand the key to the window's own
				// listeners only: its listener on the popout window (capture, made when the window was) sends a copy of the key to the main window first (app.js 1.15.0, the relay `PV`/`dI`),
				// and the main window's workspace listener for Escape (a `window` keydown listener that skips an event whose default was prevented) then moves the focus to the main
				// window's last note. Our own Escape guard on the popout window comes after the relay and stops only the original. `false` makes `Keymap` prevent the default on the copy
				// (the copy's `preventDefault` also calls the original's), which is how the current writing mode keeps the focus in its window, and it does not pass Escape to Obsidian while
				// composing either. Cancelling the composition is the IME's: the view's own Escape guard and the surface leave a composition's end as it is (`input.escape` does nothing while composing).
				const escape = (event: KeyboardEvent, context: unknown): unknown => {
					const surface = this.session?.input?.surface;
					if (!this.closed && surface && this.app.workspace.getActiveViewOfType(PmModeView) === this && surface.hasFocus()) return false;
					return (this.app.scope as Scope & { handleKey(event: KeyboardEvent, context: unknown): unknown }).handleKey(event, context);
				};
				const handler = scope.register(null, "Escape", escape);
				this.register(() => scope.unregister(handler));
				// D9: while the surface is focused, true stops app lookup and lets the surface handle the key once.
				for (const { modifiers, key } of ownerScopeKeys(/Mac/.test(win?.navigator.platform ?? ""))) {
					const owned = scope.register([...modifiers], key, route);
					this.register(() => scope.unregister(owned));
				}
				this.registerNavigationScope();
				this.register(() => this.clearNavigationScope());
				// R4-3: the keys that switch tabs, as Obsidian has them now (one record for all: it answers `undefined` to every other key, which goes on to the app).
				const mac = /Mac/.test(win?.navigator.platform ?? "");
				const tabKeys = scope.register(null, null, (event: KeyboardEvent, context: unknown) => this.onTabSwitchKey(event, context as KeyContext, mac));
				this.register(() => scope.unregister(tabKeys));
			}
			// The view opened while its leaf is the active one: the other entry of the focus.
			if (this.app.workspace.getActiveViewOfType(PmModeView) === this) this.session?.focusInput("open");
		} catch (error) {
			if (this.closed) return;
			new Notice(t(error instanceof MarkdownEditingModeError ? "notice.sotEditingModeFailed" : "pm.notice.cmMissing"), 3000);
			this.closeSelf();
		}
	}
	/** Obsidian parts (D23) render through the app and live as children of this view. */
	private partsEnv(): PmModeObsidianEnv {
		return { app: this.app, component: this, getSourcePath: () => this.currentFile?.path ?? "" };
	}
	/**
	 * M4a (D-M4-12): the paired Markdown leaf is still in the workspace. The editor of a leaf that was closed (or whose note was deleted) is not a place to write: Obsidian does not save what is
	 * written into it, so a composition that ended there would be lost without a word. A write to it is refused as stale and the text stays on the surface, to be told.
	 */
	private pairedLeafListed(): boolean {
		const leaf = this.pairedMarkdownLeaf;
		return !!leaf && this.app.workspace.getLeavesOfType("markdown").includes(leaf);
	}
	private createSession(cm: CmView): PmModeSession {
		return new PmModeSession(this.frameBody ?? this.contentEl, cm, this.plugin.settings, this.plugin.getEffectiveCommonSettings(), this.partsEnv(), { isActive: () => !this.closed && this.app.workspace.getActiveViewOfType(PmModeView) === this, sourceOwner: {
			lifetime: this.writeLifetime, getPath: () => this.currentFile?.path ?? null, getPair: () => this.pairedMarkdownLeaf,
			isCurrent: () => !this.closed && this.pairedMarkdownLeaf?.view === this.pairedMarkdownView && this.pairedMarkdownView?.file === this.currentFile
				&& (this.pairedMarkdownView?.editor as (MarkdownView["editor"] & { cm?: CmView }) | undefined)?.cm === cm && this.pairedLeafListed(),
			canWrite: () => this.pairedMarkdownView?.getMode() === "source",
			rangeDisplay: this.capabilities.rangeDisplay, notice: showPmModeEditNotice,
		} });
	}
	/**
	 * R2-10 (H11): the window's capture guard that stops every Escape inside the view before the surface sees it, and closes a range first. It is on the
	 * window the view's element is in when the view is made (a view whose element went into another window is made again: `checkWindow`, R3-1).
	 */
	private bindEscapeGuard(): void {
		this.escapeDisposer?.(); this.escapeDisposer = null;
		const win = this.containerEl.ownerDocument.defaultView;
		if (!win) return;
		const guard = (event: KeyboardEvent): void => {
			if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.composedPath().includes(this.containerEl)) {
				// R2-10 (H11): this guard stops the key before the surface sees it, so the range closing is asked here, once, first.
				// R3-4: the stop depends on the conditions above only: it runs even if the closing throws.
				try { this.session?.input?.escape(event); } finally { event.stopPropagation(); }
			}
		};
		win.addEventListener("keydown", guard, { capture: true });
		this.escapeDisposer = () => win.removeEventListener("keydown", guard, { capture: true });
	}
	/**
	 * R3-1: `moveLeafToPopout` (Obsidian 1.15.0 `app.js`) takes the leaf out of its tab group and puts it into a new window's split; the leaf and its
	 * element are the same, the view is not made again. The session is then the one made for the old window: Chromium's `ShadowRoot.getSelection()` stays
	 * the old window's, and `Selection.getComposedRanges` does not exist in Obsidian's Chromium (the author's console), so a click puts neither a caret nor a
	 * range there. The way back to "opened in that window from the start" (which works) is to make the view again: the leaf's view is closed and opened anew.
	 * The text is in CodeMirror (the paired Markdown leaf is kept, so its selection stays). Text held on the input surface (a write that was refused, R4-1) is taken over by the
	 * new view's surface as it is, not written; only a composition (or a commit) that is going on keeps the view as it is, until a later notice finds none. The notice
	 * that moved it comes from `layout-change` (the split's `insertChild` asks for it) and `onResize` (the new window's own resize). Neither starts a rebuild while one is going on.
	 */
	private checkWindow(): void {
		if (this.closed || this.reopening || !this.session) return;
		const doc = this.containerEl.ownerDocument;
		if (doc === this.boundDocument || !doc.defaultView) return;
		// A composition (or a commit) that is going on is not moved (a new surface would lose it): the next notice, with none, makes the view again.
		const surface = this.session.input?.surface;
		if (surface && (surface.isComposing() || surface.isCommitting())) return;
		void this.reopenInThisWindow();
	}
	/** Close this view and open a new one in its leaf (the public `setViewState` twice; Obsidian's own `rebuildView` does the same with `open(null)`). */
	private async reopenInThisWindow(): Promise<void> {
		const file = this.currentFile;
		if (!file) return;
		this.reopening = true;
		const leaf = this.leaf as WorkspaceLeaf & { __tategakiInitialFile?: unknown; __tategakiReopenPair?: unknown; __tategakiReopenRetained?: unknown };
		const active = this.app.workspace.getActiveViewOfType(PmModeView) === this;
		try {
			leaf.__tategakiInitialFile = file;
			leaf.__tategakiReopenPair = this.pairedMarkdownLeaf;
			// R4-1: text held on the input surface (not written, because the write was refused) goes to the new view's surface as it is.
			leaf.__tategakiReopenRetained = this.session?.input?.surface.retainedState() ?? null;
			const held = leaf.__tategakiReopenRetained as { text: string } | null;
			// M4a: closing this view does not tell that text lost: the new view has it (if it cannot take it, it tells it).
			this.handingOver = !!held;
			try {
				await leaf.setViewState({ type: "empty" });
				await leaf.setViewState({ type: TATEGAKI_PM_VIEW_TYPE, state: {}, active });
			} catch (error) {
				// No new view took the text: it is told here.
				if (held && !(this.leaf.view instanceof PmModeView)) showPmModeLostTextNotice(held.text);
				throw error;
			}
		} catch (error) {
			console.error("Tategaki: the new writing mode could not be opened again in its new window", error);
			new Notice(t("pm.notice.cmMissing"), 3000);
		} finally {
			this.handingOver = false;
			delete leaf.__tategakiInitialFile;
			delete leaf.__tategakiReopenPair;
			delete leaf.__tategakiReopenRetained;
			this.reopening = false;
		}
	}
	/** R3-1: the leaf's own resize hook (called for the leaves of a window when that window resizes): it can be the first sign that the element went into another window. */
	onResize(): void { this.checkWindow(); }
	/**
	 * R4-3: a key that Obsidian runs a tab command for. While the surface holds the focus and composes, the focus is taken off it first, so that the browser ends the composition
	 * (and the OS input method with it) while the surface is still shown and the text is committed to this note; then the same command runs, and `false` says the key is handled
	 * (as the app's own hotkey would). Without a composition, or without the focus on the surface, the command only runs (as before). Where the command cannot be run from here
	 * (no `executeCommandById`), the key goes on to the app (`undefined`) after the focus was taken off. A command that did not switch (one tab) gives the focus back.
	 */
	private onTabSwitchKey(event: KeyboardEvent, context: KeyContext, mac: boolean): unknown {
		if (this.closed || event.repeat) return undefined;
		const app = this.app as unknown as { hotkeyManager?: HotkeySource; commands?: { executeCommandById?(id: string): boolean } };
		const id = matchTabSwitchCommand(readTabSwitchHotkeys(app.hotkeyManager, mac), context, mac);
		if (!id || this.app.workspace.getActiveViewOfType(PmModeView) !== this) return undefined;
		const surface = this.session?.input?.surface;
		if (surface && surface.hasFocus() && surface.isComposing()) surface.element.blur();
		const run = app.commands?.executeCommandById;
		if (typeof run !== "function") return undefined;
		let executed = false;
		try { executed = run.call(app.commands, id) === true; } catch (error) { console.error("Tategaki: the tab command could not be run", error); }
		// (the command moves the active leaf at once when it switches; if this view is still the active one the focus it lost goes back to its surface)
		if (surface && this.app.workspace.getActiveViewOfType(PmModeView) === this && !surface.hasFocus()) surface.focus();
		return executed ? false : undefined;
	}
	private checkFollow(): void {
		if (this.closed || !this.session) return;
		try {
			const currentCm = (this.pairedMarkdownView?.editor as (MarkdownView["editor"] & { cm?: CmView }) | undefined)?.cm;
			if (!currentCm) throw new Error("Markdown editor missing");
			if (currentCm !== this.session.cm) {
				// M4a (D-M4-13, J13, J21): a composition (or a commit) that is going on is not cut off (a new surface would lose it): the next notice, with none, replaces the session.
				const surface = this.session.input?.surface;
				if (surface?.isComposing() || surface?.isCommitting()) return;
				// Text held on the surface goes to the new session's surface as it is (the same way a move into a new window hands it over, R4-1).
				const held = surface?.retainedState() ?? null;
				this.session.destroy(); this.session = null;
				this.carried = held?.text ?? null;
				this.session = this.createSession(currentCm);
				if (held && this.session.input?.surface.adoptRetained(held)) this.carried = null;
				else if (held) { this.carried = null; showPmModeLostTextNotice(held.text); }
				// A new session is a new surface (J13): it takes the focus when the leaf is active.
				if (this.app.workspace.getActiveViewOfType(PmModeView) === this) this.session.focusInput("open");
			} else if (!this.session.checkFollow()) throw new Error("Markdown subscription missing");
		} catch {
			new Notice(t("pm.notice.cmMissing"), 3000);
			this.closeSelf();
		}
	}
	async updateSettings(settings: TategakiV2Settings): Promise<void> {
		if (!settings.enablePmMode) { this.closeSelf(); return; }
		this.session?.updateSettings(settings, this.plugin.getEffectiveCommonSettings());
		this.registerNavigationScope();
		this.toolbar?.update();
		await Promise.resolve();
	}
	/**
	 * C-d (D-T-1): the frame of the view is a column: the toolbar (its height is its own) and the body, which holds the display and is what the session sizes the display from (so a toolbar
	 * that is there when the view opens is part of the first measure, and the chunks are measured against the body's height). Layout and look are classes (`styles.css`).
	 */
	private buildFrame(): void {
		const doc = this.contentEl.ownerDocument;
		this.contentEl.classList.add("tategaki-pm-frame");
		const bar = doc.createElement("div"), body = doc.createElement("div");
		body.className = "tategaki-pm-body";
		this.contentEl.append(bar, body);
		this.frameBody = body;
		this.toolbar = createPmModeToolbar(bar, {
			writingMode: () => this.plugin.settings.common.writingMode,
			toggleWritingMode: () => { void this.toggleWritingMode(); },
			openSettings: () => this.openSettingsPanel(),
			openOutline: () => this.openOutline(),
		});
	}
	/**
	 * D-T-2: the same switch as the current mode's: `common.writingMode` is changed and saved, and every open view is told (the plugin's `updateSettings`). A composition is not stopped by it.
	 * Round 2 (P3-7, the author's decision): the reading mode's page mode is not turned off by it, as the current writing mode's button leaves it: the plugin's rule turns it off for a change of
	 * `common` unless `preview.pageModeEnabled` is given, so it is given, as it is now.
	 */
	private async toggleWritingMode(): Promise<void> {
		const { common, preview } = this.plugin.settings;
		await this.plugin.updateSettings({ common: { ...common, writingMode: common.writingMode === "vertical-rl" ? "horizontal-tb" : "vertical-rl" }, preview: { ...preview, pageModeEnabled: preview.pageModeEnabled } });
	}
	/** D-T-3: the display settings panel of the current mode (`mode: "sot"`); what it changes is shared, so it reaches this view through the plugin's `updateSettings` too. */
	private openSettingsPanel(): void {
		new SettingsPanelModal(this.app, this.plugin, async newSettings => { await this.plugin.updateSettings(newSettings); }, { mode: "sot", isCeImeMode: false, sotTypewriterUnavailable: false }).open();
	}
	/** D-T-4: Obsidian's own outline (the command of its core plugin); a notice when there is none (the core plugin is off). */
	private openOutline(): void {
		const run = (this.app as unknown as { commands?: { executeCommandById?(id: string): boolean } }).commands?.executeCommandById;
		const commands = (this.app as unknown as { commands?: object }).commands;
		if (!run || !commands || run.call(commands, "outline:open") !== true) new Notice(t("notice.outline.openFailed"), 2000);
	}
	private clearNavigationScope(): void { for (const dispose of this.navigationScopeDisposers.splice(0)) dispose(); }
	private registerNavigationScope(): void {
		this.clearNavigationScope();
		const scope = this.scope, input = this.session?.input;
		if (!scope || !input) return;
		const mac = /Mac/.test(this.containerEl.ownerDocument.defaultView?.navigator.platform ?? "");
		for (const { modifiers, key } of navigationScopeKeys(mac, input.navigation.mode)) {
			const record = scope.register(modifiers, key, (event: KeyboardEvent, context: unknown): unknown => {
				if (!this.closed && this.app.workspace.getActiveViewOfType(PmModeView) === this && this.session?.input?.surface.hasFocus()) return true;
				return (this.app.scope as Scope & { handleKey(event: KeyboardEvent, context: unknown): unknown }).handleKey(event, context);
			});
			this.navigationScopeDisposers.push(() => scope.unregister(record));
		}
	}
	async onClose(): Promise<void> {
		// M4a (D-M4-12): the same settling as `closeSelf`, for a close that comes from Obsidian (the tab's close button, a close command, a window closing, the plugin unloading).
		this.settleBeforeClose();
		this.closed = true;
		this.compositionRecovery.destroy();
		this.toolbar?.destroy(); this.toolbar = null;
		this.session?.destroy(); this.session = null;
		this.workspaceController.clearPairedMarkdownBadge();
		this.workspaceController.clearPmTabBadge();
		await Promise.resolve();
	}
}
