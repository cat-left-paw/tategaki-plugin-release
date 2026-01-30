import {
	MarkdownView,
	Notice,
	TFile,
	TFolder,
	WorkspaceLeaf,
	normalizePath,
	setIcon,
} from "obsidian";
import type { KeymapEventHandler } from "obsidian";
import { FileSwitchModal } from "../../shared/ui/file-switch-modal";
import { NewNoteModal } from "../../shared/ui/new-note-modal";
import { MarkdownViewSoTEditor } from "./markdownview-sot-editor";

const PAIRED_MARKDOWN_BADGE_CLASS = "tategaki-paired-tab-badge";
const PAIRED_MARKDOWN_BADGE_ICON_CLASS = "tategaki-paired-tab-badge-icon";
const PAIRED_MARKDOWN_BADGE_TEXT_CLASS = "tategaki-paired-tab-badge-text";
const PAIRED_MARKDOWN_BADGE_TEXT = "縦";
const PAIRED_MARKDOWN_BADGE_TITLE = "Tategaki編集中";
const SOT_TAB_BADGE_CLASS = "tategaki-sot-tab-badge";
const SOT_TAB_BADGE_TITLE = "Tategaki SoT";
const RECENT_FILE_LIMIT = 50;

export class SoTWorkspaceController {
	private readonly host: any;
	private escapeKeymapHandler: KeymapEventHandler | null = null;

	constructor(host: any) {
		this.host = host;
	}

	async openFile(file: TFile): Promise<void> {
		this.host.showLoadingOverlay();
		const markdownView = await this.ensureMarkdownViewForFile(file);
		if (!markdownView) {
			new Notice("MarkdownView が見つからないため閉じます。", 2500);
			this.host.closeSelf();
			return;
		}
		if (!this.verifyPairedMarkdownViewFile(markdownView, file)) {
			this.host.closeSelf();
			return;
		}
		this.host.currentFile = file;
		this.recordRecentFile(file);
		this.host.updateToolbar();
		this.host.attachSoTEditor(new MarkdownViewSoTEditor(markdownView));
		this.host.scheduleRender(true);
	}

	registerWorkspacePairGuards(): void {
		const ensurePaired = () => {
			this.ensurePairedMarkdownView();
			this.applySoTTabBadge();
		};
		ensurePaired();
		this.host.registerEvent(
			this.host.app.workspace.on("file-open", (file: TFile | null) => {
				this.recordRecentFile(file);
				ensurePaired();
			})
		);
		this.host.registerEvent(
			this.host.app.workspace.on("active-leaf-change", () => ensurePaired())
		);
		this.host.registerEvent(
			this.host.app.workspace.on("layout-change", ensurePaired)
		);
	}

	registerEscapeGuard(): void {
		const doc = this.host.containerEl.ownerDocument ?? document;
		const win = doc.defaultView ?? window;
		const handler = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") return;
			if (!this.isLeafActive()) return;
			const activeEl = doc.activeElement as HTMLElement | null;
			const target = event.target as HTMLElement | null;
			if (this.isInModalLayer(activeEl) || this.isInModalLayer(target)) {
				return;
			}
			const composing =
				this.host.plainEditComposing ||
				(this.host.overlayTextarea?.isImeVisible() ?? false) ||
				event.isComposing;
			if (!composing) {
				event.preventDefault();
			}
			if (typeof event.stopImmediatePropagation === "function") {
				event.stopImmediatePropagation();
			}
			event.stopPropagation();
			this.host.focusInputSurface(true);
		};
		win.addEventListener("keydown", handler, true);
		win.addEventListener("keyup", handler, true);
		this.host.register(() => {
			win.removeEventListener("keydown", handler, true);
			win.removeEventListener("keyup", handler, true);
		});
	}

	registerEscapeKeymap(): void {
		if (!this.host.scope || this.escapeKeymapHandler) return;
		this.escapeKeymapHandler = this.host.scope.register(
			null,
			"Escape",
			(event: KeyboardEvent) => {
				if (!this.isLeafActive()) return;
				const doc = this.host.containerEl.ownerDocument ?? document;
				const activeEl = doc.activeElement as HTMLElement | null;
				const target = event.target as HTMLElement | null;
				if (this.isInModalLayer(activeEl) || this.isInModalLayer(target)) {
					return;
				}
				const composing =
					this.host.plainEditComposing ||
					(this.host.overlayTextarea?.isImeVisible() ?? false) ||
					event.isComposing;
				if (!composing) {
					event.preventDefault();
				}
				if (typeof event.stopImmediatePropagation === "function") {
					event.stopImmediatePropagation();
				}
				event.stopPropagation();
				this.host.focusInputSurface(true);
				return false;
			}
		);
		this.host.register(() => {
			if (this.host.scope && this.escapeKeymapHandler) {
				this.host.scope.unregister(this.escapeKeymapHandler);
			}
			this.escapeKeymapHandler = null;
		});
	}

	isLeafActive(): boolean {
		return (this.host.app.workspace as any).activeLeaf === this.host.leaf;
	}

	isInModalLayer(el: HTMLElement | null): boolean {
		if (!el) return false;
		return Boolean(
			el.closest(".modal, .prompt, .suggestion-container, .menu, .popover")
		);
	}

	getValidPairedMarkdownLeaf(): WorkspaceLeaf | null {
		if (!this.host.pairedMarkdownLeaf) return null;
		const leaves = this.host.app.workspace.getLeavesOfType("markdown");
		if (!leaves.includes(this.host.pairedMarkdownLeaf)) return null;
		if (!(this.host.pairedMarkdownLeaf.view instanceof MarkdownView)) {
			return null;
		}
		return this.host.pairedMarkdownLeaf;
	}

	ensureRecentFilePathsInitialized(): void {
		if (this.host.recentFilePathsInitialized) return;
		this.host.recentFilePathsInitialized = true;
		const paths = this.host.app.workspace.getLastOpenFiles();
		for (const path of paths) {
			const abs = this.host.app.vault.getAbstractFileByPath(path);
			if (!(abs instanceof TFile)) continue;
			if (abs.extension !== "md") continue;
			this.pushRecentFilePath(abs.path, false);
		}
	}

	pushRecentFilePath(path: string, preferFront = true): void {
		const trimmed = path.trim();
		if (!trimmed) return;
		const existing = this.host.recentFilePaths.indexOf(trimmed);
		if (existing === 0 && preferFront) return;
		if (existing >= 0) {
			this.host.recentFilePaths.splice(existing, 1);
		}
		if (preferFront) {
			this.host.recentFilePaths.unshift(trimmed);
		} else {
			this.host.recentFilePaths.push(trimmed);
		}
		if (this.host.recentFilePaths.length > RECENT_FILE_LIMIT) {
			this.host.recentFilePaths.length = RECENT_FILE_LIMIT;
		}
	}

	recordRecentFile(file: TFile | null): void {
		if (!file) return;
		if (file.extension !== "md") return;
		this.ensureRecentFilePathsInitialized();
		this.pushRecentFilePath(file.path, true);
	}

	buildFileSwitchItems(): TFile[] {
		const files = this.host.app.vault.getMarkdownFiles();
		if (files.length === 0) return [];
		this.ensureRecentFilePathsInitialized();

		const fileMap = new Map<string, TFile>();
		for (const file of files) {
			fileMap.set(file.path, file);
		}

		const ordered: TFile[] = [];
		const used = new Set<string>();
		for (const path of this.host.recentFilePaths) {
			const file = fileMap.get(path);
			if (!file) continue;
			ordered.push(file);
			used.add(path);
		}

		for (const file of files) {
			if (used.has(file.path)) continue;
			ordered.push(file);
		}
		return ordered;
	}

	openFileSwitcher(): void {
		const files = this.buildFileSwitchItems();
		const modal = new FileSwitchModal(
			this.host.app,
			files,
			(file) => {
				void this.switchToFile(file);
			},
			(input) => {
				this.openNewNoteModal(input);
			}
		);
		modal.open();
		if (files.length === 0) {
			new Notice("切り替え可能なファイルが見つかりません。", 2000);
		}
	}

	openNewNoteModal(initialValue = ""): void {
		const baseFolder = this.host.currentFile?.parent?.path ?? "";
		const modal = new NewNoteModal(
			this.host.app,
			{
				defaultFolder: baseFolder,
				initialValue,
			},
			(name) => {
				void this.createNewNote(name, baseFolder);
			}
		);
		modal.open();
	}

	async createNewNote(name: string, baseFolder: string): Promise<void> {
		const trimmed = name.trim();
		if (!trimmed) {
			new Notice("ファイル名を入力してください。", 2000);
			return;
		}
		const cleaned = trimmed.replace(/^[\\/]+/, "").replace(/^\.\//, "");
		const hasExtension = cleaned.toLowerCase().endsWith(".md");
		const fileName = hasExtension ? cleaned : `${cleaned}.md`;
		const joined = baseFolder ? `${baseFolder}/${fileName}` : fileName;
		const filePath = normalizePath(joined);
		const existing = this.host.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			new Notice("既存ノートを開きます。", 2000);
			await this.switchToFile(existing);
			return;
		}
		const folderPath = filePath.split("/").slice(0, -1).join("/");
		if (folderPath) {
			const folder = this.host.app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				try {
					await this.host.app.vault.createFolder(folderPath);
				} catch (error) {
					console.error(
						"[Tategaki SoT] Failed to create folder",
						error
					);
					new Notice("フォルダの作成に失敗しました。", 2500);
					return;
				}
			} else if (!(folder instanceof TFolder)) {
				new Notice("フォルダ名が不正です。", 2500);
				return;
			}
		}
		try {
			const file = await this.host.app.vault.create(filePath, "");
			await this.switchToFile(file);
		} catch (error) {
			console.error("[Tategaki SoT] Failed to create note", error);
			new Notice("新規ノートの作成に失敗しました。", 2500);
		}
	}

	async switchToFile(file: TFile): Promise<void> {
		if (this.host.currentFile?.path === file.path) {
			new Notice("既に表示中のファイルです。", 1500);
			return;
		}
		const pairedLeaf = this.getValidPairedMarkdownLeaf();
		if (!pairedLeaf) {
			new Notice(
				"ペアのMarkdownViewが見つからないため切り替えできません。",
				2500
			);
			return;
		}
		this.host.suppressPairCheck = true;
		try {
			await pairedLeaf.openFile(file, {
				active: false,
				state: { mode: "source" },
			});
			const leaf = this.host.leaf;
			await leaf.setViewState({ type: "empty", active: false });
			await this.host.plugin.modeManager.openSoTWysiwygViewInLeaf(
				file,
				leaf
			);
		} catch (error) {
			this.host.suppressPairCheck = false;
			console.error("[Tategaki SoT] Failed to switch file", error);
			new Notice("ファイル切り替えに失敗しました。", 2500);
		}
	}

	async ensureMarkdownViewForFile(
		file: TFile
	): Promise<MarkdownView | null> {
		if (
			this.host.pairedMarkdownView &&
			this.host.pairedMarkdownView.file?.path === file.path
		) {
			if (this.host.pairedMarkdownLeaf) {
				this.applyPairedMarkdownBadge(
					this.host.pairedMarkdownLeaf,
					this.host.pairedMarkdownView
				);
			}
			return this.host.pairedMarkdownView;
		}
		const existingLeaf = this.findMarkdownLeafForFile(file.path);
		if (existingLeaf) {
			const view = existingLeaf.view;
			if (view instanceof MarkdownView) {
				if (!(view.editor as any)?.cm) {
					return null;
				}
				this.host.pairedMarkdownLeaf = existingLeaf;
				this.host.pairedMarkdownView = view;
				this.applyPairedMarkdownBadge(existingLeaf, view);
				return view;
			}
		}
		const leaf = this.host.app.workspace.getLeaf("tab");
		await leaf.openFile(file, {
			active: false,
			state: { mode: "source" },
		});
		if (leaf.view instanceof MarkdownView) {
			if (!(leaf.view.editor as any)?.cm) {
				return null;
			}
			this.host.pairedMarkdownLeaf = leaf;
			this.host.pairedMarkdownView = leaf.view;
			this.applyPairedMarkdownBadge(leaf, leaf.view);
			return leaf.view;
		}
		return null;
	}

	findMarkdownLeafForFile(filePath: string): WorkspaceLeaf | null {
		const leaves = this.host.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === filePath) {
				return leaf;
			}
		}
		return null;
	}

	ensurePairedMarkdownView(): void {
		if (this.host.suppressPairCheck) return;
		if (!this.host.currentFile || !this.host.pairedMarkdownLeaf) return;
		const leaves = this.host.app.workspace.getLeavesOfType("markdown");
		if (!leaves.includes(this.host.pairedMarkdownLeaf)) {
			this.clearPairedMarkdownBadge();
			this.host.closeSelf();
			return;
		}
		const view = this.host.pairedMarkdownLeaf.view;
		if (!(view instanceof MarkdownView)) {
			this.clearPairedMarkdownBadge();
			this.host.closeSelf();
			return;
		}
		if (!this.verifyPairedMarkdownViewFile(view, this.host.currentFile)) {
			this.clearPairedMarkdownBadge();
			this.host.closeSelf();
			return;
		}
		this.host.pairedMarkdownView = view;
		this.applyPairedMarkdownBadge(this.host.pairedMarkdownLeaf, view);
	}

	verifyPairedMarkdownViewFile(
		view: MarkdownView,
		file: TFile
	): boolean {
		if (view.file?.path === file.path) {
			this.host.pairedMismatchNotified = false;
			return true;
		}
		if (!this.host.pairedMismatchNotified) {
			this.host.pairedMismatchNotified = true;
			new Notice(
				"ペアのMarkdownViewが対象ファイルと一致しないため閉じます。",
				2500
			);
		}
		return false;
	}

	applyPairedMarkdownBadge(
		leaf: WorkspaceLeaf,
		view: MarkdownView
	): void {
		const tabHeaderEl = this.getLeafTabHeaderEl(leaf);
		const badgeHost =
			(tabHeaderEl
				? this.getTabHeaderTitleHost(tabHeaderEl)
				: null) ?? this.getViewHeaderTitleHost(view.containerEl);
		if (!badgeHost) return;
		if (
			this.host.pairedMarkdownBadgeLeaf === leaf &&
			this.host.pairedMarkdownBadgeEl
		) {
			if (this.host.pairedMarkdownBadgeEl.isConnected) return;
		}
		this.clearPairedMarkdownBadge();
		const existing = badgeHost.querySelector(
			`.${PAIRED_MARKDOWN_BADGE_CLASS}`
		) as HTMLElement | null;
		const doc = badgeHost.ownerDocument ?? document;
		const badge = existing ?? doc.createElement("span");
		if (!existing) {
			badge.className = PAIRED_MARKDOWN_BADGE_CLASS;
			badgeHost.appendChild(badge);
		}
		badge.setAttribute("aria-label", PAIRED_MARKDOWN_BADGE_TITLE);
		badge.setAttribute("title", PAIRED_MARKDOWN_BADGE_TITLE);
		if (
			!badge.querySelector(`.${PAIRED_MARKDOWN_BADGE_ICON_CLASS}`)
		) {
			const iconEl = doc.createElement("span");
			iconEl.className = PAIRED_MARKDOWN_BADGE_ICON_CLASS;
			badge.appendChild(iconEl);
			setIcon(iconEl, "user-round-pen");
		}
		if (
			!badge.querySelector(`.${PAIRED_MARKDOWN_BADGE_TEXT_CLASS}`)
		) {
			const textEl = doc.createElement("span");
			textEl.className = PAIRED_MARKDOWN_BADGE_TEXT_CLASS;
			textEl.textContent = PAIRED_MARKDOWN_BADGE_TEXT;
			badge.appendChild(textEl);
		}
		if (badge.parentElement !== badgeHost) {
			badgeHost.insertBefore(badge, badgeHost.firstChild);
		} else if (badgeHost.firstChild !== badge) {
			badgeHost.insertBefore(badge, badgeHost.firstChild);
		}
		this.host.pairedMarkdownBadgeLeaf = leaf;
		this.host.pairedMarkdownBadgeEl = badge;
	}

	clearPairedMarkdownBadge(): void {
		if (this.host.pairedMarkdownBadgeEl?.isConnected) {
			this.host.pairedMarkdownBadgeEl.remove();
		}
		this.host.pairedMarkdownBadgeLeaf = null;
		this.host.pairedMarkdownBadgeEl = null;
	}

	applySoTTabBadge(): void {
		const tabHeaderEl = this.getLeafTabHeaderEl(this.host.leaf);
		const badgeHost =
			(tabHeaderEl
				? this.getTabHeaderTitleHost(tabHeaderEl)
				: null) ?? this.getViewHeaderTitleHost(this.host.containerEl);
		if (!badgeHost) return;
		if (this.host.sotTabBadgeEl?.isConnected) return;
		this.clearSoTTabBadge();
		const doc = badgeHost.ownerDocument ?? document;
		const badge = doc.createElement("span");
		badge.className = SOT_TAB_BADGE_CLASS;
		badge.setAttribute("aria-label", SOT_TAB_BADGE_TITLE);
		badge.setAttribute("title", SOT_TAB_BADGE_TITLE);
		const iconEl = doc.createElement("span");
		iconEl.className = PAIRED_MARKDOWN_BADGE_ICON_CLASS;
		badge.appendChild(iconEl);
		setIcon(iconEl, "user-round-pen");
		const textEl = doc.createElement("span");
		textEl.className = PAIRED_MARKDOWN_BADGE_TEXT_CLASS;
		textEl.textContent = PAIRED_MARKDOWN_BADGE_TEXT;
		badge.appendChild(textEl);
		badgeHost.insertBefore(badge, badgeHost.firstChild);
		this.host.sotTabBadgeEl = badge;
	}

	clearSoTTabBadge(): void {
		if (this.host.sotTabBadgeEl?.isConnected) {
			this.host.sotTabBadgeEl.remove();
		}
		this.host.sotTabBadgeEl = null;
	}

	getLeafTabHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
		const leafAny = leaf as any;
		const tabHeaderEl = leafAny?.tabHeaderEl;
		if (tabHeaderEl instanceof HTMLElement) {
			return tabHeaderEl;
		}
		const tabHeader = leafAny?.tabHeader?.el;
		if (tabHeader instanceof HTMLElement) {
			return tabHeader;
		}
		const containerEl =
			(leafAny?.containerEl as HTMLElement | undefined) ?? undefined;
		const leafId =
			leafAny?.id ??
			containerEl?.getAttribute("data-id") ??
			containerEl?.dataset?.id;
		const doc = containerEl?.ownerDocument ?? document;
		if (leafId) {
			const byId = doc.querySelector(
				`.workspace-tab-header[data-id="${leafId}"]`
			) as HTMLElement | null;
			if (byId) return byId;
			const byLeafId = doc.querySelector(
				`.workspace-tab-header[data-leaf-id="${leafId}"]`
			) as HTMLElement | null;
			if (byLeafId) return byLeafId;
		}
		return null;
	}

	getTabHeaderTitleHost(
		tabHeaderEl: HTMLElement
	): HTMLElement | null {
		return (
			(tabHeaderEl.querySelector(
				".workspace-tab-header-inner-title"
			) as HTMLElement | null) ??
			(tabHeaderEl.querySelector(
				".workspace-tab-header-inner"
			) as HTMLElement | null) ??
			tabHeaderEl
		);
	}

	getViewHeaderTitleHost(
		containerEl: HTMLElement
	): HTMLElement | null {
		const viewHeader = containerEl.querySelector(
			".view-header-title"
		) as HTMLElement | null;
		if (!viewHeader) return null;
		return (viewHeader.parentElement as HTMLElement | null) ?? viewHeader;
	}
}
