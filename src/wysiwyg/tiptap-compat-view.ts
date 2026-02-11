import {
	ItemView,
	MarkdownView,
	Notice,
	Platform,
	TAbstractFile,
	TFile,
	TFolder,
	WorkspaceLeaf,
	normalizePath,
	setIcon,
} from "obsidian";
import { Editor } from "@tiptap/core";
import {
	Selection as PMSelection,
	TextSelection as PMTextSelection,
} from "@tiptap/pm/state";
import TategakiV2Plugin from "../core/plugin";
import {
	DEFAULT_V2_SETTINGS,
	AppCloseAction,
	SyncMode,
	TategakiV2Settings,
	CommonSettings,
	WritingMode,
} from "../types/settings";
import { debugWarn } from "../shared/logger";
import { BlockContentSyncManager } from "./contenteditable-block";
import type { MarkdownApplyDecision } from "./contenteditable-block/block-sync-manager";
import { UnsavedChangesModal } from "./contenteditable-block/unsaved-changes-modal";
import { SettingsPanelModal } from "./contenteditable/settings-panel";
import type { SyncState } from "./contenteditable/sync-manager";
import { AuxiliaryInputPanel } from "./auxiliary-input-panel";
import { createTategakiCompatEditor } from "./tiptap-compat/tiptap-setup";
import { TipTapCompatToolbar } from "./tiptap-compat/toolbar";
import { TipTapCompatContextMenu } from "./tiptap-compat/context-menu";
import { SearchReplacePanel } from "./tiptap-compat/search-replace-panel";
import { PlainEditMode } from "./tiptap-compat/plain-edit-mode";
	import {
		createTipTapMarkdownAdapter,
		MarkdownAdapter,
		normalizeMarkdownForTipTap,
		protectIndentation,
		extractFrontmatterBlock,
	} from "./tiptap-compat/markdown-adapter";
	import { writeSyncBackupPair } from "../shared/sync-backup";
import { UnsupportedHtmlModal } from "../shared/ui/unsupported-html-modal";
import { PagedReadingMode } from "./reading-mode/paged-reading-mode";
import { FileSwitchModal } from "../shared/ui/file-switch-modal";
import { NewNoteModal } from "../shared/ui/new-note-modal";
import { isPhoneLikeMobile } from "./shared/device-profile";

export const TIPTAP_COMPAT_VIEW_TYPE = "tategaki-tiptap-compat-view";
export const TIPTAP_COMPAT_VIEW_TYPE_LEGACY = "tategaki-tiptap-dev-view";
const INITIAL_FILE_PROP = "__tategakiInitialFile";
const INITIAL_VIEW_MODE_PROP = "__tategakiInitialViewMode";
// 特殊なUnicode文字の組み合わせをマーカーとして使用（ZERO WIDTH SPACE + ZERO WIDTH NON-JOINER + ZERO WIDTH JOINER）
const CURSOR_MARK = "\u200B\u200C\u200D";
// v1.2.0 以降、TipTap ビューの「参照モード（preview）」は廃止し、
// 参照は SoT/書籍モードに集約する。
export type TategakiViewMode = "edit";
type ArrowDirection = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
type EditorCoords = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};
type ScrollMarginValue =
	| number
	| { top: number; right: number; bottom: number; left: number };

interface FrontmatterData {
	title?: string;
	subtitle?: string;
	original_title?: string;
	author?: string;
	co_authors?: string[];
	translator?: string;
	co_translators?: string[];
}

function insertCursorMarker(src: string, offset: number): string {
	const safeOffset = Math.max(0, Math.min(offset, src.length));
	return src.slice(0, safeOffset) + CURSOR_MARK + src.slice(safeOffset);
}

function getOffsetFromPos(
	pos: { line: number; ch: number },
	content: string
): number {
	const lines = content.split("\n");
	const line = Math.max(0, Math.min(pos.line, lines.length - 1));
	const ch = Math.max(0, pos.ch);
	let offset = 0;
	for (let i = 0; i < line; i++) {
		offset += (lines[i]?.length ?? 0) + 1;
	}
	offset += Math.min(ch, lines[line]?.length ?? 0);
	return Math.max(0, Math.min(offset, content.length));
}

export class TipTapCompatView extends ItemView {
	plugin: TategakiV2Plugin;
	private currentFile: TFile | null = null;
	private readingModeActive = false;
	private readingModePager: PagedReadingMode | null = null;
	private readingModeContainerEl: HTMLElement | null = null;
	private readingModeLayoutBackup: {
		pageContainerPadding: string;
		pageContainerAlignItems: string;
		pageContainerJustifyContent: string;
		pageContainerBackground: string;
		borderWrapperBoxShadow: string;
		borderWrapperBackground: string;
		borderWrapperTransform: string;
		borderWrapperBorder: string;
		borderWrapperOutline: string;
		contentWrapperBackground: string;
	} | null = null;
	private proseMirrorBeforeReadingStyle: {
		display: string;
		visibility: string;
		pointerEvents: string;
	} | null = null;
	private editor: Editor | null = null;
	private syncManager: BlockContentSyncManager | null = null;
	private markdownAdapter: MarkdownAdapter | null = null;
	private isComposing = false;
	private compositionStartHandler:
		| ((event: CompositionEvent) => void)
		| null = null;
	private compositionEndHandler: ((event: CompositionEvent) => void) | null =
		null;
	private editorHostEl: HTMLElement | null = null;
	private editorPaddingTopPx = 0;
	private editorPaddingBottomPx = 0;
	private frontmatterContainer: HTMLElement | null = null;
	private keyHandler: ((event: KeyboardEvent) => void) | null = null;
	private formattingToolbar: TipTapCompatToolbar | null = null;
	private contextMenu: TipTapCompatContextMenu | null = null;
	private contextMenuHandler: ((event: MouseEvent) => void) | null = null;
	private searchReplacePanel: SearchReplacePanel | null = null;
	private plainEditMode: PlainEditMode | null = null;
	private editorAreaEl: HTMLElement | null = null;
	private boundWheelHandler: ((event: WheelEvent) => void) | null = null;
	private wheelThrottleTimer: number | null = null;
	private cursorSyncTimer: number | null = null;
	private cursorSyncDebounceTimer: number | null = null;
	private pendingExternalCursor: {
		filePath: string;
		pos: { line: number; ch: number };
		content: string;
	} | null = null;
	private lastExternalCursor: { line: number; ch: number } | null = null;
	private fileUpdateDebounceTimer: number | null = null;

	// SoT と同等の「ファイル切替」用（最近開いたファイル優先）
	private recentFilePaths: string[] = [];
	private recentFilePathsInitialized = false;
	private modeBadgeEl: HTMLElement | null = null;
	private initialScrollApplied = false;
	private frontmatterUpdateToken = 0;
	private beforeInputHandler: ((event: InputEvent) => void) | null = null;
	private beforeInputKeydownHandler:
		| ((event: KeyboardEvent) => void)
		| null = null;
	private lastEnterKeydownAt = 0;
	private lastEnterKeydownShift = false;
	private updateDebounceTimer: number | null = null;
	private pendingUpdate = false;
	private readonly UPDATE_DEBOUNCE_MS = 180;
	private cursorSyncPausedByFocus = false;
	private cursorSyncPausedByAuxiliary = false;
	private cursorFocusInHandler: ((event: FocusEvent) => void) | null = null;
	private cursorFocusOutHandler: ((event: FocusEvent) => void) | null = null;
	private cursorPointerDownHandler: ((event: PointerEvent) => void) | null =
		null;
	private cursorGlobalPointerDownHandler:
		| ((event: PointerEvent) => void)
		| null = null;
	private lastPointerDownInsideViewAt = 0;
	private lastPointerDownInsideLeafAt = 0;
	private lastAppliedSettings: TategakiV2Settings | null = null;
	private lastSyncState: SyncState | null = null;
	private auxiliaryInputPanel: AuxiliaryInputPanel | null = null;
	private auxiliaryCaretEl: HTMLElement | null = null;
	private lastAuxiliaryRange: Range | null = null;
	private lastAuxiliaryPos: number | null = null;
	private scrollHandlerForAuxiliaryCaret: (() => void) | null = null;
	private outlinePanelEl: HTMLElement | null = null;
	private outlineUpdateTimer: number | null = null;
	private pageContainerEl: HTMLElement | null = null;
	private borderWrapperEl: HTMLElement | null = null;
	private contentWrapperEl: HTMLElement | null = null;
	private viewRootEl: HTMLElement | null = null;
	private visualViewportResizeHandler: (() => void) | null = null;
	private editorFocusHandler: ((event: FocusEvent) => void) | null = null;
	private selectionUpdateHandler: (() => void) | null = null;
	private selectionUpdateTimer: number | null = null;
	private lastViewportHeight = 0;
	private lastViewportOffsetTop = 0;
	private lastViewportOffsetLeft = 0;
	private viewportResizeTimer: number | null = null;
	private originalDetach: (() => void) | undefined;
	private isReadOnlyProtected = false;
	private readOnlyProtectionReason: "unsupported" | null = null;
	private unsupportedHtmlDecisions = new Map<
		string,
		"read-only" | "discard"
	>();
	private unsupportedHtmlBackedUp = new Set<string>();
	private unsupportedHtmlCancelState = new Map<
		string,
		{ at: number; signature: string }
	>();
	private static readonly UNSUPPORTED_HTML_CANCEL_COOLDOWN_MS = 1200;
	private unsupportedHtmlPromptInFlight = new Map<
		string,
		{
			signature: string;
			promise: Promise<"read-only" | "discard" | "cancel">;
		}
	>();
	private suppressEditorUpdates = false;
	private readonly viewTypeOverride: string | null;
	private listItemMoveCaptureHandler:
		| ((event: KeyboardEvent) => void)
		| null = null;

	constructor(
		leaf: WorkspaceLeaf,
		plugin: TategakiV2Plugin,
		viewTypeOverride: string | null = null,
	) {
		super(leaf);
		this.plugin = plugin;
		this.viewTypeOverride = viewTypeOverride;
	}

	getViewType(): string {
		return this.viewTypeOverride ?? TIPTAP_COMPAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		const file = this.getDisplayFile();
		const title =
			this.getFrontmatterTitle(file) ?? (file ? file.basename : "");
		if (!title) {
			return "Tategaki";
		}
		return `Tategaki: - ${title} -`;
	}

	private updatePaneHeaderTitle(): void {
		const title = this.getDisplayText();
		const headerTitle =
			this.containerEl.querySelector(".view-header-title");
		if (headerTitle) {
			headerTitle.textContent = title;
		}
	}

	private ensureRecentFilePathsInitialized(): void {
		if (this.recentFilePathsInitialized) return;
		this.recentFilePathsInitialized = true;
		const paths = this.app.workspace.getLastOpenFiles();
		for (const path of paths) {
			const abs = this.app.vault.getAbstractFileByPath(path);
			if (!(abs instanceof TFile)) continue;
			if (abs.extension !== "md") continue;
			this.pushRecentFilePath(abs.path, false);
		}
	}

	private pushRecentFilePath(path: string, preferFront = true): void {
		const trimmed = path.trim();
		if (!trimmed) return;
		const existing = this.recentFilePaths.indexOf(trimmed);
		if (existing === 0 && preferFront) return;
		if (existing >= 0) {
			this.recentFilePaths.splice(existing, 1);
		}
		if (preferFront) {
			this.recentFilePaths.unshift(trimmed);
		} else {
			this.recentFilePaths.push(trimmed);
		}
		if (this.recentFilePaths.length > 20) {
			this.recentFilePaths.length = 20;
		}
	}

	private recordRecentFile(file: TFile | null): void {
		if (!file) return;
		if (file.extension !== "md") return;
		this.ensureRecentFilePathsInitialized();
		this.pushRecentFilePath(file.path, true);
	}

	private buildFileSwitchItems(): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		if (files.length === 0) return [];
		this.ensureRecentFilePathsInitialized();

		const fileMap = new Map<string, TFile>();
		for (const file of files) {
			fileMap.set(file.path, file);
		}

		const ordered: TFile[] = [];
		const used = new Set<string>();
		for (const path of this.recentFilePaths) {
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

	private openFileSwitcher(): void {
		const files = this.buildFileSwitchItems();
		const modal = new FileSwitchModal(
			this.app,
			files,
			(file) => void this.switchToFile(file),
			(input) => this.openNewNoteModal(input)
		);
		modal.open();
		if (files.length === 0) {
			new Notice("切り替え可能なファイルが見つかりません。", 2000);
		}
	}

	private openNewNoteModal(initialValue = ""): void {
		const baseFolder = this.currentFile?.parent?.path ?? "";
		const modal = new NewNoteModal(
			this.app,
			{
				defaultFolder: baseFolder,
				initialValue,
			},
			(name) => void this.createNewNote(name, baseFolder)
		);
		modal.open();
	}

	private async createNewNote(name: string, baseFolder: string): Promise<void> {
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
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			new Notice("既存ノートを開きます。", 2000);
			await this.switchToFile(existing);
			return;
		}
		const folderPath = filePath.split("/").slice(0, -1).join("/");
		if (folderPath) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				try {
					await this.app.vault.createFolder(folderPath);
				} catch (error) {
					console.error("[Tategaki TipTap] Failed to create folder", error);
					new Notice("フォルダの作成に失敗しました。", 2500);
					return;
				}
			} else if (!(folder instanceof TFolder)) {
				new Notice("フォルダ名が不正です。", 2500);
				return;
			}
		}
		try {
			const file = await this.app.vault.create(filePath, "");
			await this.switchToFile(file);
		} catch (error) {
			console.error("[Tategaki TipTap] Failed to create note", error);
			new Notice("新規ノートの作成に失敗しました。", 2500);
		}
	}

	private async switchToFile(file: TFile): Promise<void> {
		if (!this.syncManager) return;
		if (this.currentFile?.path === file.path) {
			new Notice("既に表示中のファイルです。", 1500);
			return;
		}
		const ok = await this.checkUnsavedChanges();
		if (!ok) return;
		this.initialScrollApplied = false;
		await this.loadFile(file);
		this.currentFile = file;
		this.recordRecentFile(file);
		this.updatePaneHeaderTitle();
	}

	private getDisplayFile(): TFile | null {
		// currentFileを優先的に使用
		if (this.currentFile) {
			return this.currentFile;
		}

		// getCurrentFilePathからファイルを取得
		const currentPath = this.getCurrentFilePath();
		if (currentPath) {
			const abs = this.app.vault.getAbstractFileByPath(currentPath);
			if (abs instanceof TFile) {
				return abs;
			}
		}

		// アクティブなファイルを取得
		const active = this.app.workspace.getActiveFile?.();
		return active ?? null;
	}

	private getFrontmatterTitle(file: TFile | null): string | null {
		if (!file) return null;
		const cache = this.app.metadataCache.getFileCache(file);
		const raw = cache?.frontmatter?.title;
		if (raw === null || raw === undefined) return null;
		const text = String(raw).trim();
		return text.length > 0 ? text : null;
	}

	async onOpen(): Promise<void> {
		const initialFile = (this.leaf as any)[INITIAL_FILE_PROP] as
			| TFile
			| undefined;
		if (!initialFile) {
			// 起動時のレイアウト復元で空表示になるのを防ぐため、明示的に開かれた場合のみ表示する
				window.setTimeout(() => {
					try {
						this.leaf.detach();
					} catch (_) {
						// noop: detach失敗は無視
					}
				}, 0);
				return;
			}
		delete (this.leaf as any)[INITIAL_FILE_PROP];

		// ファイル情報を保持
		this.currentFile = initialFile;
		// TipTap は互換モードとして扱い、参照は SoT/書籍モードに集約する。
		delete (this.leaf as any)[INITIAL_VIEW_MODE_PROP];

		const container = this.containerEl.children[1] as HTMLElement;
		this.viewRootEl = container;
		container.empty();
		container.addClass("tategaki-tiptap-view-container");
		const phoneQuery =
			"(hover: none) and (pointer: coarse) and (max-width: 700px)";
		const updateHeaderInset = (): void => {
			const headerEl = this.containerEl.querySelector(
				".view-header"
			) as HTMLElement | null;
			const height = headerEl
				? Math.ceil(headerEl.getBoundingClientRect().height)
				: 0;
			container.style.setProperty(
				"--tategaki-view-header-height",
				`${height}px`
			);
			const isPhone = window.matchMedia(phoneQuery).matches;
			container.style.paddingTop = isPhone
				? "calc(var(--tategaki-safe-area-top, 0px) + var(--tategaki-view-header-height, 0px))"
				: "0px";
			let isEditing = false;
			const activeEl = container.ownerDocument
				.activeElement as HTMLElement | null;
			if (activeEl && container.contains(activeEl)) {
				isEditing =
					activeEl.isContentEditable ||
					activeEl.tagName === "TEXTAREA" ||
					activeEl.tagName === "INPUT";
			}
			container.style.paddingBottom =
				isPhone && !isEditing
					? "var(--tategaki-reading-bottom-offset, 0px)"
					: "0px";
		};
		updateHeaderInset();
		window.setTimeout(updateHeaderInset, 0);
		this.registerDomEvent(window, "resize", updateHeaderInset);
		this.registerDomEvent(
			container.ownerDocument,
			"focusin",
			updateHeaderInset
		);
		this.registerDomEvent(
			container.ownerDocument,
			"focusout",
			updateHeaderInset
		);
		const headerEl = this.containerEl.querySelector(
			".view-header"
		) as HTMLElement | null;
		if (headerEl && "ResizeObserver" in window) {
			const observer = new ResizeObserver(() => {
				updateHeaderInset();
			});
			observer.observe(headerEl);
			this.register(() => observer.disconnect());
		}

		const toolbarRow = container.createDiv(
			"tategaki-tiptap-compat-toolbar-row"
		);
		const toolbarLeft = toolbarRow.createDiv(
			"tategaki-tiptap-compat-toolbar-left",
		);

		const toolbarRight = toolbarRow.createDiv(
			"tategaki-tiptap-compat-toolbar-right",
		);

		// モード表示（互換）
		const modeBadge = toolbarRight.createDiv();
		modeBadge.textContent = "互換";
		modeBadge.addClass("tategaki-tiptap-mode-badge");
		this.modeBadgeEl = modeBadge;

		const editorArea = container.createDiv(
			"tategaki-tiptap-compat-editor-area"
		);
		this.editorAreaEl = editorArea;

		// ページコンテナ（CE版のページサイズUIと同等の構造）
		this.pageContainerEl = editorArea.createDiv(
			"tategaki-tiptap-page-container"
		);

		this.borderWrapperEl = this.pageContainerEl.createDiv(
			"tategaki-tiptap-border-wrapper"
		);

		this.contentWrapperEl = this.borderWrapperEl.createDiv(
			"tategaki-tiptap-content-wrapper"
		);

		this.editorHostEl = this.contentWrapperEl.createDiv(
			"tategaki-tiptap-compat-editor-host"
		);

		this.suppressEditorUpdates = true;
		this.editor = createTategakiCompatEditor({
			element: this.editorHostEl,
			settings: this.plugin.settings,
			onUpdate: () => {
				this.handleEditorContentUpdate();
			},
		});
		this.setupCursorSyncFocusGuards();
		this.setupCompositionGuards();
		this.setupMobileKeyboardSupport();

		this.formattingToolbar = new TipTapCompatToolbar(
			toolbarLeft,
			this.editor,
			this.app,
			{
				app: this.app,
				onToggleWritingMode: () => this.toggleWritingMode(),
				getWritingMode: () => this.plugin.settings.common.writingMode,
				onToggleReadingMode: () => this.toggleReadingMode(),
				getReadingModeEnabled: () =>
					this.isReadingViewOpenForCurrentFile(),
				onSettings: () => this.openSettingsPanel(),
				onFindReplace: (replaceMode) =>
					this.searchReplacePanel?.show(replaceMode ?? true),
				onManualSync: () => void this.requestManualSync(),
				onToggleSyncMode: () => void this.toggleSyncMode(),
				onToggleRuby: () => void this.toggleRubyVisibility(),
				getRubyEnabled: () =>
					this.plugin.settings.wysiwyg.enableRuby !== false,
				onToggleAuxiliary: () => void this.toggleAuxiliaryPanel(),
				getAuxiliaryEnabled: () =>
					!!this.plugin.settings.wysiwyg.enableAssistantInput,
				onToggleOutline: () => this.toggleOutlinePanel(),
				onPlainEditCommand: (command) =>
					this.plainEditMode?.applyInlineCommand(command) ?? false,
				getPlainEditSelectionText: () =>
					this.plainEditMode?.getSelectionText() ?? "",
				onOpenFileSwitcher: () => this.openFileSwitcher(),
				onTogglePlainEdit: () => void this.togglePlainEditMode(),
				getPlainEditEnabled: () =>
					this.plainEditMode?.isPlainMode() ?? false,
			}
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.formattingToolbar?.updateReadingModeButton();
			})
		);
		this.updatePaneHeaderTitle();
		this.searchReplacePanel = new SearchReplacePanel(
			editorArea,
			this.editor,
			() => {
				this.handleEditorContentUpdate();
			}
		);

		// プレーン執筆モードの初期化
		this.plainEditMode = new PlainEditMode({
			editor: this.editor,
			getRubyEnabled: () =>
				this.plugin.settings.wysiwyg?.enableRuby !== false,
			getViewRoot: () => this.viewRootEl,
			canFocusOverlay: () => this.isViewLeafActive(),
			onModeChange: () => {
				this.formattingToolbar?.updatePlainEditButton();
			},
			onUpdate: () => {
				// 必要に応じて更新処理
			},
			onCommit: () => {
				this.flushPendingEditorUpdate();
			},
		});

			this.contextMenu = new TipTapCompatContextMenu(this.editor, {
			app: this.app,
			onFindReplace: () => {
				this.searchReplacePanel?.show(true);
			},
			onTogglePlainEdit: () => void this.togglePlainEditMode(),
			getPlainEditEnabled: () =>
				this.plainEditMode?.isPlainMode() ?? false,
			isReadOnly: () => this.isEditorReadOnly(),
			onPlainEditCommand: (command) =>
				this.plainEditMode?.applyInlineCommand(command) ?? false,
			getPlainEditSelectionText: () =>
				this.plainEditMode?.getSelectionText() ?? "",
				getRubyEnabled: () =>
					this.plugin.settings.wysiwyg.enableRuby !== false,
			});
			this.contextMenuHandler = (event: MouseEvent) => {
				if (!this.contextMenu || !this.editor) return;
				const hostWindow =
					this.editorHostEl?.ownerDocument.defaultView ?? window;
				if (isPhoneLikeMobile(hostWindow)) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				const isPlainEditing = this.plainEditMode?.isPlainMode() ?? false;
				const keepOverlayFocus =
					isPlainEditing &&
					this.plainEditMode?.isOverlayTarget(event.target);
				if (!isPlainEditing && !keepOverlayFocus) {
					this.editor.commands.focus();
				}
				this.contextMenu.show(event);
			};
		this.editorHostEl.addEventListener(
			"contextmenu",
			this.contextMenuHandler
		);

		this.applySettingsToEditor(this.plugin.settings);
		this.suppressEditorUpdates = false;
		this.setupWheelScroll();
		this.setupBeforeInputFixes();
		this.updateReadOnlyState();

		this.markdownAdapter = createTipTapMarkdownAdapter(this.editor, {
			getSettings: () => this.plugin.settings,
			getContextFilePath: () =>
				this.syncManager?.getState().currentFilePath ??
				this.currentFile?.path ??
				null,
			resolveImageSrc: (src, contextFilePath) => {
				const trimmed = String(src || "").trim();
				if (!trimmed) return trimmed;
				if (/^(https?:|data:|app:|obsidian:|file:)/i.test(trimmed)) {
					return trimmed;
				}
				const withoutFragment = trimmed.split("#")[0] ?? trimmed;
				const normalized = withoutFragment.replace(/^\.\//, "");
				if (!contextFilePath) {
					return trimmed;
				}
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					normalized,
					contextFilePath
				);
				if (!dest) {
					return trimmed;
				}
				try {
					return this.app.vault.getResourcePath(dest);
				} catch (_) {
					return trimmed;
				}
			},
		});
		this.syncManager = new BlockContentSyncManager({
			app: this.app,
			editor: this.markdownAdapter,
			getSettings: () => this.plugin.settings,
			onStateChange: (state) => this.handleSyncStateChange(state),
			onBeforeApplyMarkdown: (markdown, context) =>
				this.handleBeforeApplyMarkdown(
					markdown,
					context.file,
					context.source
				),
		});
		this.registerFileWatchers();
		this.registerEditorChangeWatchers();

		await this.syncManager.initialize(initialFile);
		this.recordRecentFile(initialFile);
		this.registerEvent(
			this.app.workspace.on("file-open", (file: TFile | null) => {
				this.recordRecentFile(file);
			})
		);

		this.applyCursorSyncSetting(this.plugin.settings);
		this.applyInitialScrollPosition();
		this.updateRubyPluginState(this.plugin.settings);
		await this.updateFrontmatterDisplay();
		this.initializeAuxiliaryInput();
		this.handleSyncStateChange(this.syncManager.getState());

		// leafのdetachメソッドをインターセプトして、タブを閉じる前に未保存チェック
		this.originalDetach = this.leaf.detach.bind(this.leaf);
		this.leaf.detach = () => {
			void this.handleInterceptedLeafDetach();
		};

		this.keyHandler = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) {
				return;
			}
			const key = event.key.toLowerCase();
			if (key === "s") {
				if (!event.shiftKey) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				void this.syncManager?.triggerManualSync();
				return;
			}
			if (key === "f") {
				event.preventDefault();
				event.stopPropagation();
				this.searchReplacePanel?.show(false);
				return;
			}
			if (key === "h") {
				event.preventDefault();
				event.stopPropagation();
				this.searchReplacePanel?.show(true);
				return;
			}
		};
		container.addEventListener("keydown", this.keyHandler, true);

		// リスト項目移動用のcaptureフェーズリスナー（Outliner等との競合回避）
		this.setupListItemMoveCaptureHandler();
	}

	private async handleInterceptedLeafDetach(): Promise<void> {
		if (this.isReadOnlyProtected) {
			if (this.originalDetach) {
				this.originalDetach();
			}
			return;
		}
		if (this.syncManager && this.syncManager.hasUnsavedChanges()) {
			if (this.plugin.settings.wysiwyg.syncMode === "manual") {
				const modal = new UnsavedChangesModal(
					this.app,
					"未保存の変更があります。タブを閉じる前に保存しますか？"
				);
				const choice = await modal.waitForChoice();

				if (choice === "save") {
					await this.syncManager.triggerManualSync();
				} else if (choice === "discard") {
					this.syncManager.clearDirtyFlag();
				} else if (choice === "cancel") {
					return;
				}
			}
		}

		if (this.originalDetach) {
			this.originalDetach();
		}
	}

	async onClose(): Promise<void> {
		this.disableReadingMode();

		// リスト項目移動用captureリスナーの解除
		this.teardownListItemMoveCaptureHandler();

		const container = this.containerEl.children[1] as HTMLElement;
		if (this.keyHandler) {
			container.removeEventListener("keydown", this.keyHandler, true);
			this.keyHandler = null;
		}

		this.stopCursorSync();
		this.teardownBeforeInputFixes();
		this.teardownCompositionGuards();
		this.teardownCursorSyncFocusGuards();
		this.teardownMobileKeyboardSupport();

		// ファイル更新デバウンスタイマーをクリア
		if (this.fileUpdateDebounceTimer != null) {
			window.clearTimeout(this.fileUpdateDebounceTimer);
			this.fileUpdateDebounceTimer = null;
		}

		this.teardownWheelScroll();

		if (this.formattingToolbar) {
			this.formattingToolbar.destroy();
			this.formattingToolbar = null;
		}
		if (this.searchReplacePanel) {
			this.searchReplacePanel.destroy();
			this.searchReplacePanel = null;
		}
		if (this.plainEditMode) {
			this.plainEditMode.destroy();
			this.plainEditMode = null;
		}
		if (this.auxiliaryInputPanel) {
			this.removeAuxiliaryPanelPadding();
			this.auxiliaryInputPanel.destroy();
			this.auxiliaryInputPanel = null;
		}
		if (this.outlinePanelEl) {
			this.outlinePanelEl.remove();
			this.outlinePanelEl = null;
		}
		if (this.updateDebounceTimer != null) {
			window.clearTimeout(this.updateDebounceTimer);
			this.updateDebounceTimer = null;
			this.pendingUpdate = false;
		}
		if (this.outlineUpdateTimer != null) {
			window.clearTimeout(this.outlineUpdateTimer);
			this.outlineUpdateTimer = null;
		}
		this.editorAreaEl = null;
		if (this.editorHostEl && this.contextMenuHandler) {
			this.editorHostEl.removeEventListener(
				"contextmenu",
				this.contextMenuHandler
			);
		}
		this.contextMenuHandler = null;
		if (this.contextMenu) {
			this.contextMenu.destroy();
			this.contextMenu = null;
		}

		const syncManager = this.syncManager;
		this.syncManager = null;
		this.markdownAdapter = null;
		if (syncManager) {
			try {
				await syncManager.flush();
			} catch (error) {
				debugWarn(
					"Tategaki TipTap: failed to flush on close",
					error
				);
			}
			syncManager.dispose();
		}

		if (this.editor) {
			try {
				this.editor.destroy();
			} finally {
				this.editor = null;
			}
		}
		this.clearAuxiliaryCaret();
		this.detachScrollHandlerForAuxiliaryCaret();
		if (this.frontmatterContainer) {
			this.frontmatterContainer.remove();
			this.frontmatterContainer = null;
		}
		this.editorHostEl = null;
		this.viewRootEl = null;
		this.contentWrapperEl = null;
		this.borderWrapperEl = null;
		this.pageContainerEl = null;
		if (this.originalDetach) {
			this.leaf.detach = this.originalDetach;
			this.originalDetach = undefined;
		}

		// ファイル情報をクリア
		this.currentFile = null;
	}

		async updateSettings(settings: TategakiV2Settings): Promise<void> {
			const prev = this.lastAppliedSettings;
			const frontmatterChanged = !prev
				? true
				: prev.preview.hideFrontmatter !== settings.preview.hideFrontmatter ||
					prev.preview.showFrontmatterTitle !==
						settings.preview.showFrontmatterTitle ||
					prev.preview.showFrontmatterSubtitle !==
						settings.preview.showFrontmatterSubtitle ||
					prev.preview.showFrontmatterOriginalTitle !==
						settings.preview.showFrontmatterOriginalTitle ||
					prev.preview.showFrontmatterAuthor !==
						settings.preview.showFrontmatterAuthor ||
					prev.preview.showFrontmatterCoAuthors !==
						settings.preview.showFrontmatterCoAuthors ||
					prev.preview.showFrontmatterTranslator !==
						settings.preview.showFrontmatterTranslator ||
					prev.preview.showFrontmatterCoTranslators !==
						settings.preview.showFrontmatterCoTranslators;
			const writingModeChanged = !prev
				? true
				: prev.common.writingMode !== settings.common.writingMode;
			const rubyChanged = !prev
				? true
				: prev.wysiwyg.enableRuby !== settings.wysiwyg.enableRuby;
			const auxiliaryChanged = !prev
				? true
				: prev.wysiwyg.enableAssistantInput !==
						settings.wysiwyg.enableAssistantInput;

		if (settings.wysiwyg.enableAssistantInput) {
			this.deactivatePlainEditMode();
		}

		this.applySettingsToEditor(settings);
		this.setupWheelScroll();
		this.syncManager?.onSettingsChanged(settings);
		this.applyCursorSyncSetting(settings);
		this.updateReadOnlyState();
		this.updateRubyPluginState(settings);
		if (this.auxiliaryInputPanel && writingModeChanged) {
			this.auxiliaryInputPanel.updateLayout(
				settings.common.writingMode === "vertical-rl"
			);
			this.addAuxiliaryPanelPadding();
		}

		if (this.formattingToolbar) {
			if (writingModeChanged) {
				this.formattingToolbar.updateWritingModeButton();
				this.formattingToolbar.updateHorizontalRuleIcon();
			}
			if (auxiliaryChanged) {
				this.initializeAuxiliaryInput();
				this.formattingToolbar.updateAuxiliaryButton();
			}
			if (rubyChanged) {
				this.refreshRubyRendering();
				this.formattingToolbar.refreshRubyToggle();
			}
		}

		if (frontmatterChanged || writingModeChanged) {
			await this.updateFrontmatterDisplay();
		}

		this.lastAppliedSettings = JSON.parse(JSON.stringify(settings));
		if (this.readingModeActive) {
			this.rebuildReadingMode();
		}
	}

	private toggleWritingMode(): void {
		const currentMode = this.plugin.settings.common.writingMode;
		const newMode: WritingMode =
			currentMode === "vertical-rl" ? "horizontal-tb" : "vertical-rl";

		// 設定を更新
		this.plugin.settings.common.writingMode = newMode;
		void this.plugin.saveSettings();

		// エディタに適用
		this.applySettingsToEditor(this.plugin.settings);

		// エディタに書字方向を設定
		if (this.editor) {
			this.withSuppressedEditorUpdates(() => {
				this.editor?.commands.setWritingMode(newMode);
			});
		}

		if (this.frontmatterContainer) {
			this.applyFrontmatterWritingMode(
				this.frontmatterContainer,
				newMode
			);
		} else {
			void this.updateFrontmatterDisplay();
		}

		if (this.auxiliaryInputPanel) {
			this.auxiliaryInputPanel.updateLayout(newMode === "vertical-rl");
			this.addAuxiliaryPanelPadding();
			if (
				this.auxiliaryInputPanel.textareaEl === document.activeElement
			) {
				const range = this.captureCurrentInsertionRange();
				this.renderAuxiliaryCaret(range);
			}
		}

		if (this.readingModeActive) {
			this.rebuildReadingMode();
		}
	}

	private async togglePlainEditMode(): Promise<void> {
		if (!this.plainEditMode) return;
		if (this.isEditorReadOnly()) {
			new Notice("読み取り専用ではソーステキスト編集は使用できません。", 2500);
			return;
		}
		const isPlainMode = this.plainEditMode.isPlainMode();
		if (!isPlainMode) {
			await this.activatePlainEditMode();
		} else {
			this.deactivatePlainEditMode();
		}
	}

	private async activatePlainEditMode(): Promise<boolean> {
		if (!this.plainEditMode) return false;
		if (this.isEditorReadOnly()) return false;
		if (!this.isViewLeafActive()) return false;
		if (this.plainEditMode.isPlainMode()) {
			return true;
		}
		const auxiliaryEnabled =
			this.plugin.settings.wysiwyg.enableAssistantInput ?? false;
		if (auxiliaryEnabled) {
			const disabled = await this.setAuxiliaryPanelEnabled(false);
			if (!disabled) {
				return false;
			}
		}
		this.plainEditMode.activate();
		this.applyCursorSyncSetting(this.plugin.settings);
		return true;
	}

	private deactivatePlainEditMode(
		options?: { restoreEditorFocus?: boolean }
	): void {
		if (!this.plainEditMode?.isPlainMode()) {
			return;
		}
		this.plainEditMode.deactivate();

		// プレーン執筆モード解除後、エディタにフォーカスを戻してから
		// カーソル同期設定を適用する（focusoutイベント後の意図しないカーソル同期を防ぐ）
		const restoreEditorFocus = options?.restoreEditorFocus ?? true;
		if (restoreEditorFocus && this.editor && this.isViewLeafActive()) {
			this.editor.commands.focus();
		}

		// フォーカスが安定してからカーソル同期を再開
		window.setTimeout(() => {
			this.applyCursorSyncSetting(this.plugin.settings);
		}, 50);
	}

	private async setAuxiliaryPanelEnabled(enabled: boolean): Promise<boolean> {
		const current =
			this.plugin.settings.wysiwyg.enableAssistantInput ?? false;
		if (current === enabled) {
			return true;
		}
		try {
			await this.plugin.updateSettings({
				wysiwyg: {
					...this.plugin.settings.wysiwyg,
					enableAssistantInput: enabled,
				},
			});
			await this.updateSettings(this.plugin.settings);
			return true;
		} catch (error) {
			console.error(
				"[Tategaki TipTap] Failed to toggle auxiliary panel",
				error
			);
			new Notice("補助入力パネルの切り替えに失敗しました。", 2500);
			return false;
		}
	}

	private handleSyncStateChange(state: SyncState): void {
		this.lastSyncState = state;
		this.formattingToolbar?.updateSyncStatus(state);
	}

	private openSettingsPanel(): void {
		const modal = new SettingsPanelModal(
			this.app,
			this.plugin,
			async (newSettings) => {
				await this.plugin.updateSettings(newSettings);
			},
			{ mode: "compat" },
		);
		modal.open();
	}

	private async toggleSyncMode(): Promise<void> {
		if (this.isReadOnlyProtected) {
			new Notice("読み取り専用では同期モードは変更できません。", 2500);
			return;
		}
		const currentMode: SyncMode =
			this.plugin.settings.wysiwyg.syncMode ?? "auto";
		const nextMode: SyncMode = currentMode === "manual" ? "auto" : "manual";
		try {
			await this.plugin.updateSettings({
				wysiwyg: {
					...this.plugin.settings.wysiwyg,
					syncMode: nextMode,
					autoSave: nextMode === "auto",
				},
			});
			this.syncManager?.onSettingsChanged(this.plugin.settings);
			this.handleSyncStateChange(
				this.syncManager?.getState() ??
					this.lastSyncState ?? {
						mode: nextMode,
						dirty: false,
						saving: false,
						lastSavedAt: null,
						currentFilePath: this.getCurrentFilePath(),
						lastSyncResult: null,
						lastSyncMessage: null,
					}
			);
			new Notice(
				nextMode === "manual"
					? "手動同期モードに切り替えました。"
					: "自動同期モードに切り替えました。",
				2000
			);
		} catch (error) {
			console.error(
				"[Tategaki TipTap] Failed to toggle sync mode",
				error
			);
			new Notice("同期モードの切り替えに失敗しました。", 3000);
		}
	}

	private async requestManualSync(): Promise<void> {
		if (this.isReadOnlyProtected) {
			new Notice("読み取り専用では保存できません。", 2500);
			return;
		}
		await this.syncManager?.triggerManualSync();
	}

	private async toggleRubyVisibility(): Promise<void> {
		const current = this.plugin.settings.wysiwyg.enableRuby !== false;
		const next = !current;
		try {
			await this.plugin.updateSettings({
				wysiwyg: {
					...this.plugin.settings.wysiwyg,
					enableRuby: next,
				},
			});
			await this.updateSettings(this.plugin.settings);
			new Notice(
				next
					? "ルビ表示をオンにしました。"
					: "ルビ表示をオフにしました。",
				1800
			);
		} catch (error) {
			console.error("[Tategaki TipTap] Failed to toggle ruby", error);
			new Notice("ルビ表示の切り替えに失敗しました。", 2500);
		} finally {
			this.formattingToolbar?.refreshRubyToggle();
		}
	}

	private refreshRubyRendering(): void {
		if (!this.markdownAdapter) return;
		try {
			const snapshot = this.markdownAdapter.getMarkdown();
			this.markdownAdapter.setMarkdown(snapshot);
		} catch (error) {
			debugWarn(
				"Tategaki TipTap: failed to refresh ruby rendering",
				error
			);
		}
	}

	private updateRubyPluginState(
		settings: TategakiV2Settings = this.plugin.settings
	): void {
		const rubyEnabled = settings.wysiwyg?.enableRuby !== false;
		const active = rubyEnabled && this.isJapaneseNovelRubyActive();
		const rubySize = Math.max(
			0.2,
			Math.min(1.0, settings.common.rubySize ?? 0.5)
		);
		const value = rubySize.toString();

		const apply = (el: HTMLElement | null | undefined) => {
			if (!el) return;
			el.classList.toggle("tategaki-ruby-plugin-active", active);
			el.style.setProperty("--tategaki-ruby-size", value);
			el.style.setProperty("--ruby-size", value);
		};

		apply(this.editorHostEl ?? null);
		apply((this.editor?.view.dom as HTMLElement | undefined) ?? null);
	}

	private isJapaneseNovelRubyActive(): boolean {
		const pluginManager = (this.app as any)?.plugins;
		if (!pluginManager) {
			return false;
		}
		try {
			if (pluginManager.enabledPlugins instanceof Set) {
				return pluginManager.enabledPlugins.has("japanese-novel-ruby");
			}
			if (
				pluginManager.enabledPlugins &&
				typeof pluginManager.enabledPlugins.has === "function"
			) {
				return pluginManager.enabledPlugins.has("japanese-novel-ruby");
			}
		} catch (_) {
			// ignore capability errors
		}
		return Boolean(pluginManager.plugins?.["japanese-novel-ruby"]);
	}

	private async toggleAuxiliaryPanel(): Promise<void> {
		if (this.isEditorReadOnly()) {
			new Notice("読み取り専用では補助入力パネルは使用できません。", 2500);
			return;
		}
		const current =
			this.plugin.settings.wysiwyg.enableAssistantInput ?? false;
		const next = !current;
		if (next) {
			this.deactivatePlainEditMode();
		}
		try {
			await this.plugin.updateSettings({
				wysiwyg: {
					...this.plugin.settings.wysiwyg,
					enableAssistantInput: next,
				},
			});
			await this.updateSettings(this.plugin.settings);
		} catch (error) {
			console.error(
				"[Tategaki TipTap] Failed to toggle auxiliary panel",
				error
			);
			new Notice("補助入力パネルの切り替えに失敗しました。", 2500);
		}
	}

	private initializeAuxiliaryInput(): void {
		const enabled =
			!this.isEditorReadOnly() &&
			!!this.plugin.settings.wysiwyg.enableAssistantInput;
		if (!enabled) {
			if (this.auxiliaryInputPanel) {
				this.removeAuxiliaryPanelPadding();
				this.auxiliaryInputPanel.destroy();
				this.auxiliaryInputPanel = null;
			}
			this.clearAuxiliaryCaret();
			this.detachScrollHandlerForAuxiliaryCaret();
			this.cursorSyncPausedByAuxiliary = false;
			return;
		}
		if (this.auxiliaryInputPanel) {
			this.auxiliaryInputPanel.show();
			this.addAuxiliaryPanelPadding();
			return;
		}
		if (!this.editorAreaEl) return;

		this.auxiliaryInputPanel = new AuxiliaryInputPanel({
			parent: this.editorAreaEl,
			isVertical:
				this.plugin.settings.common.writingMode === "vertical-rl",
			onInsert: (text) => this.handleAuxiliaryInsert(text),
			onFocus: () => {
				this.cursorSyncPausedByAuxiliary = true;
				this.stopCursorSync();
				const range = this.captureCurrentInsertionRange();
				this.renderAuxiliaryCaret(range);
				this.attachScrollHandlerForAuxiliaryCaret();
			},
			onBlur: () => {
				this.clearAuxiliaryCaret();
				this.detachScrollHandlerForAuxiliaryCaret();
				this.cursorSyncPausedByAuxiliary = false;
				if (
					this.plugin.settings.wysiwyg.syncCursor &&
					!this.cursorSyncPausedByFocus
				) {
					this.startCursorSync();
				}
			},
			onResize: () => this.addAuxiliaryPanelPadding(),
			onBackspace: () => this.handleAuxiliaryBackspace(),
			onBackspaceEmpty: () => void this.toggleAuxiliaryPanel(),
			onNavigate: (event) => this.handleAuxiliaryNavigate(event),
		});
		this.addAuxiliaryPanelPadding();
	}

	private addAuxiliaryPanelPadding(): void {
		if (!this.editorHostEl || !this.auxiliaryInputPanel) return;
		const isVertical =
			this.plugin.settings.common.writingMode === "vertical-rl";
		if (isVertical) {
			const width = Math.max(
				0,
				this.auxiliaryInputPanel.containerEl.offsetWidth
			);
			this.editorHostEl.style.paddingLeft = `${width}px`;
			this.editorHostEl.style.paddingBottom = `${this.editorPaddingBottomPx}px`;
			return;
		}
		const height = Math.max(
			0,
			this.auxiliaryInputPanel.containerEl.offsetHeight
		);
		this.editorHostEl.style.paddingBottom = `${this.editorPaddingBottomPx + height}px`;
		this.editorHostEl.style.paddingLeft = "";
	}

	private removeAuxiliaryPanelPadding(): void {
		if (!this.editorHostEl) return;
		this.editorHostEl.style.paddingLeft = "";
		this.editorHostEl.style.paddingBottom = `${this.editorPaddingBottomPx}px`;
	}

	private isSelectionInsideEditor(sel: Selection): boolean {
		const root = this.editor?.view?.dom as HTMLElement | undefined;
		if (!root || sel.rangeCount === 0) return false;
		let container = sel.getRangeAt(0).commonAncestorContainer;
		if (container.nodeType === Node.TEXT_NODE) {
			container = container.parentNode as Node;
		}
		return root.contains(container);
	}

	private captureCurrentInsertionRange(): Range | null {
		const sel = window.getSelection();
		if (sel && sel.rangeCount > 0 && this.isSelectionInsideEditor(sel)) {
			this.lastAuxiliaryRange = sel.getRangeAt(0).cloneRange();
			if (this.editor) {
				this.lastAuxiliaryPos = this.editor.state.selection.from;
			}
		}
		return this.lastAuxiliaryRange;
	}

	private updateAuxiliaryRangeFromEditor(): void {
		if (!this.editor) return;

		try {
			const { state, view } = this.editor;
			const { from } = state.selection;
			this.lastAuxiliaryPos = from;

			// TipTapの位置をDOMの位置に変換
			const domPos = view.domAtPos(from);
			if (!domPos || !domPos.node) return;

			// Rangeを作成
			const range = document.createRange();

			// テキストノードの場合
			if (domPos.node.nodeType === Node.TEXT_NODE) {
				range.setStart(domPos.node, domPos.offset);
				range.setEnd(domPos.node, domPos.offset);
			} else {
				// 要素ノードの場合
				const childNode = domPos.node.childNodes[domPos.offset];
				if (childNode) {
					range.setStartBefore(childNode);
					range.setEndBefore(childNode);
				} else {
					// 子ノードがない場合は、親要素の最後に設定
					range.selectNodeContents(domPos.node as Element);
					range.collapse(false);
				}
			}

			this.lastAuxiliaryRange = range;
		} catch (error) {
			debugWarn("Failed to update auxiliary range from editor", error);
		}
	}

	private renderAuxiliaryCaret(range: Range | null): void {
		if (!this.editorHostEl) {
			this.clearAuxiliaryCaret();
			return;
		}

		let rect: DOMRect | null = this.getAuxiliaryCaretRect(range);
		if (!rect) {
			this.clearAuxiliaryCaret();
			return;
		}

		if (this.scrollAuxiliaryCaretIntoView(rect)) {
			rect = this.getAuxiliaryCaretRect(range);
		}
		if (!rect) {
			this.clearAuxiliaryCaret();
			return;
		}

		const containerRect = this.editorHostEl.getBoundingClientRect();
		const scrollTop = this.editorHostEl.scrollTop;
		const scrollLeft = this.editorHostEl.scrollLeft;
		const visibleTop = rect.top - containerRect.top;
		const visibleLeft = rect.left - containerRect.left;
		const top = visibleTop + scrollTop;
		const left = visibleLeft + scrollLeft;
		const isVertical =
			this.plugin.settings.common.writingMode === "vertical-rl";
		const panelRect =
			this.auxiliaryInputPanel?.containerEl.getBoundingClientRect();
		const panelHeight = panelRect?.height ?? 0;
		const panelWidth = panelRect?.width ?? 0;

		const fontSize =
			parseFloat(getComputedStyle(this.editorHostEl).fontSize) || 16;
		const caretWidth = isVertical ? fontSize * 1.4 : 2;
		const caretHeight = isVertical ? 3 : fontSize * 1.4;

		const visibleTopLimit = 0;
		const visibleLeftLimit = isVertical ? panelWidth : 0;
		const visibleBottomLimit =
			containerRect.height - (isVertical ? 0 : panelHeight);
		const visibleRightLimit = containerRect.width;

		const isOutOfBounds =
			visibleTop < visibleTopLimit ||
			visibleLeft < visibleLeftLimit ||
			visibleTop + caretHeight > visibleBottomLimit ||
			visibleLeft + caretWidth > visibleRightLimit;

		if (!this.auxiliaryCaretEl) {
			this.auxiliaryCaretEl = document.createElement("div");
			this.auxiliaryCaretEl.className = "tategaki-auxiliary-caret";
			this.auxiliaryCaretEl.style.pointerEvents = "none";
			this.auxiliaryCaretEl.style.overflow = "hidden";
			this.editorHostEl.appendChild(this.auxiliaryCaretEl);
		}

		this.auxiliaryCaretEl.classList.remove("vertical", "horizontal");
		this.auxiliaryCaretEl.classList.add(
			isVertical ? "vertical" : "horizontal"
		);
		this.auxiliaryCaretEl.style.top = `${top}px`;
		this.auxiliaryCaretEl.style.left = `${left}px`;
		this.auxiliaryCaretEl.style.display = isOutOfBounds ? "none" : "";
	}

	private getAuxiliaryCaretRect(range: Range | null): DOMRect | null {
		if (this.editor && this.lastAuxiliaryPos !== null) {
			try {
				const pos = this.lastAuxiliaryPos;
				const resolved = this.editor.state.doc.resolve(pos);
				const isVertical =
					this.plugin.settings.common.writingMode === "vertical-rl";
				const hasContent = resolved.parent.content.size > 0;
				const atEnd =
					resolved.parentOffset >= resolved.parent.content.size;

				// 縦書きモードではRangeの座標を使用（折り返しと段落末尾に対応）
				if (isVertical && range) {
					const rangeRect = this.getRangeRectWithFallback(range);
					if (rangeRect) {
						return rangeRect;
					}
				}

				const side = isVertical && atEnd && hasContent ? -1 : 1;
				const coords = this.editor.view.coordsAtPos(pos, side);
				return new DOMRect(
					coords.left,
					coords.top,
					coords.right - coords.left,
					coords.bottom - coords.top
				);
			} catch (_) {
				// ignore
			}
		}
		return range ? this.getRangeRectWithFallback(range) : null;
	}

	private scrollAuxiliaryCaretIntoView(rect: DOMRect): boolean {
		if (!this.editorHostEl) {
			return false;
		}
		const isVertical =
			this.plugin.settings.common.writingMode === "vertical-rl";
		const scrollTarget = this.getScrollableElement(isVertical);
		if (!scrollTarget) {
			return this.scrollCoordsIntoView({
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
			});
		}

		const containerRect = this.editorHostEl.getBoundingClientRect();
		const panelRect =
			this.auxiliaryInputPanel?.containerEl.getBoundingClientRect();
		const panelHeight = panelRect?.height ?? 0;
		const panelWidth = panelRect?.width ?? 0;
		const margin = 12;

		let didScroll = false;
		if (isVertical) {
			const visibleLeft = containerRect.left + panelWidth + margin;
			const visibleRight = containerRect.right - margin;
			if (rect.left < visibleLeft) {
				scrollTarget.scrollLeft -= visibleLeft - rect.left;
				didScroll = true;
			} else if (rect.right > visibleRight) {
				scrollTarget.scrollLeft += rect.right - visibleRight;
				didScroll = true;
			}
		} else {
			const visibleTop = containerRect.top + margin;
			const visibleBottom = containerRect.bottom - panelHeight - margin;
			if (rect.bottom > visibleBottom) {
				scrollTarget.scrollTop += rect.bottom - visibleBottom;
				didScroll = true;
			} else if (rect.top < visibleTop) {
				scrollTarget.scrollTop -= visibleTop - rect.top;
				didScroll = true;
			}
		}

		return didScroll;
	}

	private scrollCoordsIntoView(
		coords: EditorCoords,
		options?: { startNode?: Node | null; margin?: number }
	): boolean {
		if (!this.editor) {
			return false;
		}

		const view = this.editor.view;
		const doc = view.dom.ownerDocument;
		const scrollThreshold =
			(view.someProp("scrollThreshold") as ScrollMarginValue | null) ?? 0;
		const scrollMarginValue =
			options?.margin ??
			(view.someProp("scrollMargin") as ScrollMarginValue | null) ??
			12;
		let didScroll = false;
		let currentRect: EditorCoords = { ...coords };

		for (
			let parent: Node | null = options?.startNode ?? view.dom;
			parent;

		) {
			if (parent.nodeType !== Node.ELEMENT_NODE) {
				parent = this.getParentNode(parent);
				continue;
			}

			const element = parent as HTMLElement;
			const atTop = element === doc.body;
			const bounding = atTop
				? this.getWindowRect(doc)
				: this.getClientRect(element);

			let moveX = 0;
			let moveY = 0;
			if (
				currentRect.top <
				bounding.top + this.getScrollSide(scrollThreshold, "top")
			) {
				moveY = -(
					bounding.top -
					currentRect.top +
					this.getScrollSide(scrollMarginValue, "top")
				);
				} else if (
					currentRect.bottom >
					bounding.bottom - this.getScrollSide(scrollThreshold, "bottom")
				) {
					const isOverflowing =
						currentRect.bottom - currentRect.top >
						bounding.bottom - bounding.top;
					if (isOverflowing) {
						moveY =
							currentRect.top +
							this.getScrollSide(scrollMarginValue, "top") -
							bounding.top;
					} else {
						moveY =
							currentRect.bottom -
							bounding.bottom +
							this.getScrollSide(scrollMarginValue, "bottom");
					}
				}

			if (
				currentRect.left <
				bounding.left + this.getScrollSide(scrollThreshold, "left")
			) {
				moveX = -(
					bounding.left -
					currentRect.left +
					this.getScrollSide(scrollMarginValue, "left")
				);
			} else if (
				currentRect.right >
				bounding.right - this.getScrollSide(scrollThreshold, "right")
			) {
				moveX =
					currentRect.right -
					bounding.right +
					this.getScrollSide(scrollMarginValue, "right");
			}

			if (moveX || moveY) {
				didScroll = true;
				if (atTop) {
					doc.defaultView?.scrollBy(moveX, moveY);
				} else {
					const startX = element.scrollLeft;
					const startY = element.scrollTop;
					if (moveY) {
						element.scrollTop += moveY;
					}
					if (moveX) {
						element.scrollLeft += moveX;
					}
					const deltaX = element.scrollLeft - startX;
					const deltaY = element.scrollTop - startY;
					currentRect = {
						left: currentRect.left - deltaX,
						right: currentRect.right - deltaX,
						top: currentRect.top - deltaY,
						bottom: currentRect.bottom - deltaY,
					};
				}
			}

			const position = atTop
				? "fixed"
				: getComputedStyle(element).position;
			if (/^(fixed|sticky)$/.test(position)) {
				break;
			}
			parent =
				position === "absolute"
					? element.offsetParent
					: this.getParentNode(element);
		}

		return didScroll;
	}

	private getScrollSide(
		value: ScrollMarginValue,
		side: "top" | "right" | "bottom" | "left"
	): number {
		return typeof value === "number" ? value : value[side] ?? 0;
	}

	private getWindowRect(doc: Document): EditorCoords {
		const viewport = doc.defaultView?.visualViewport;
		if (viewport) {
			return {
				left: viewport.offsetLeft,
				right: viewport.offsetLeft + viewport.width,
				top: viewport.offsetTop,
				bottom: viewport.offsetTop + viewport.height,
			};
		}
		return {
			left: 0,
			right: doc.documentElement.clientWidth,
			top: 0,
			bottom: doc.documentElement.clientHeight,
		};
	}

	private getClientRect(element: HTMLElement): EditorCoords {
		const rect = element.getBoundingClientRect();
		const scaleX = rect.width / element.offsetWidth || 1;
		const scaleY = rect.height / element.offsetHeight || 1;
		return {
			left: rect.left,
			right: rect.left + element.clientWidth * scaleX,
			top: rect.top,
			bottom: rect.top + element.clientHeight * scaleY,
		};
	}

	private getParentNode(node: Node): Node | null {
		const parent =
			(node as HTMLElement & { assignedSlot?: Node | null })
				.assignedSlot ?? node.parentNode;
		if (parent && parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
			return (parent as ShadowRoot).host ?? null;
		}
		return parent;
	}

	private clearAuxiliaryCaret(): void {
		if (this.auxiliaryCaretEl) {
			this.auxiliaryCaretEl.remove();
			this.auxiliaryCaretEl = null;
		}
		this.lastAuxiliaryPos = null;
	}

	private attachScrollHandlerForAuxiliaryCaret(): void {
		if (this.scrollHandlerForAuxiliaryCaret) {
			return;
		}
		const target = this.editorHostEl;
		if (!target) return;
		this.scrollHandlerForAuxiliaryCaret = () => {
			if (this.lastAuxiliaryRange) {
				this.renderAuxiliaryCaret(this.lastAuxiliaryRange);
			}
		};
		target.addEventListener("scroll", this.scrollHandlerForAuxiliaryCaret, {
			passive: true,
		});
	}

	private detachScrollHandlerForAuxiliaryCaret(): void {
		if (!this.scrollHandlerForAuxiliaryCaret || !this.editorHostEl) {
			return;
		}
		this.editorHostEl.removeEventListener(
			"scroll",
			this.scrollHandlerForAuxiliaryCaret
		);
		this.scrollHandlerForAuxiliaryCaret = null;
	}

	private getRangeRectWithFallback(range: Range): DOMRect | null {
		const rect = range.getBoundingClientRect();
		if (rect && !(rect.width === 0 && rect.height === 0)) {
			return rect;
		}

		const clientRects = range.getClientRects();
		if (clientRects.length > 0) {
			const r = clientRects[0];
			if (!(r.width === 0 && r.height === 0)) {
				return r;
			}
		}

		const probeRange = range.cloneRange();
		const marker = document.createElement("span");
		marker.className = "tategaki-auxiliary-caret-probe";
		marker.style.display = "inline-block";
		marker.style.width = "0";
		marker.style.height = "1em";
		marker.style.pointerEvents = "none";
		marker.style.opacity = "0";

		try {
			probeRange.insertNode(marker);
			return marker.getBoundingClientRect();
		} catch (e) {
			debugWarn("Failed to measure auxiliary caret position", e);
			return null;
		} finally {
			marker.remove();
		}
	}

	private handleAuxiliaryInsert(text: string): void {
		if (!this.editor || this.isEditorReadOnly()) {
			return;
		}

		const payload = text.length > 0 ? text : "\n";
		try {
			// フォーカスせずにコマンドを実行（段落区切りの改行を優先）
			if (payload === "\n" || payload === "") {
				if (!this.editor.commands.splitBlock()) {
					this.editor.commands.setHardBreak();
				}
			} else {
				const lines = payload.replace(/\r\n?/g, "\n").split("\n");
				for (let index = 0; index < lines.length; index++) {
					const line = lines[index];
					if (line.length > 0) {
						this.editor.commands.insertContent(line);
					}
					if (index < lines.length - 1) {
						if (!this.editor.commands.splitBlock()) {
							this.editor.commands.setHardBreak();
						}
					}
				}
			}

			// 挿入後の位置を保存
			this.updateAuxiliaryRangeFromEditor();
		} catch (error) {
			debugWarn(
				"Tategaki TipTap: failed to insert auxiliary text",
				error
			);
		} finally {
			// 挿入後、補助入力パネルにフォーカスを戻し、擬似キャレットを更新
			setTimeout(() => {
				if (this.auxiliaryInputPanel && this.lastAuxiliaryRange) {
					this.auxiliaryInputPanel.textareaEl.focus();
					this.renderAuxiliaryCaret(this.lastAuxiliaryRange);
				}
			}, 10);
		}
	}

	private handleAuxiliaryBackspace(): void {
		if (!this.editor || this.isEditorReadOnly()) {
			return;
		}

		// フォーカスせずに前の文字を削除
		try {
			const { selection } = this.editor.state;
			const { from, empty, $from } = selection;
			if (!empty) {
				this.editor.commands.deleteSelection();
			} else if ($from.parentOffset === 0) {
				// 行頭では直前の改行を削除（段落結合）
				const joined = this.editor.commands.joinBackward();
				if (!joined && from > 0) {
					this.editor
						.chain()
						.deleteRange({
							from: from - 1,
							to: from,
						})
						.run();
				}
			} else if (from > 0) {
				this.editor
					.chain()
					.deleteRange({
						from: from - 1,
						to: from,
					})
					.run();
			}

			// 削除後の位置を保存
			this.updateAuxiliaryRangeFromEditor();
		} catch (error) {
			debugWarn("Tategaki TipTap: failed to delete character", error);
		} finally {
			// 削除後、補助入力パネルにフォーカスを戻し、擬似キャレットを更新
			setTimeout(() => {
				if (this.auxiliaryInputPanel && this.lastAuxiliaryRange) {
					this.auxiliaryInputPanel.textareaEl.focus();
					this.renderAuxiliaryCaret(this.lastAuxiliaryRange);
				}
			}, 10);
		}
	}

	private handleAuxiliaryNavigate(event: KeyboardEvent): void {
		if (
			!this.editor ||
			!this.auxiliaryInputPanel ||
			this.isEditorReadOnly()
		) {
			return;
		}

		if (!this.isArrowKey(event.key)) {
			return;
		}

		const { state, view } = this.editor;
		const direction = event.key as ArrowDirection;
		const head = state.selection.head;
		const nextPos = this.getNextPosForArrow(view, direction, head);
		if (nextPos == null) {
			return;
		}
		const resolved = state.doc.resolve(nextPos);
		const bias = this.getArrowBias(direction);
		const nextSelection = event.shiftKey
			? PMTextSelection.create(state.doc, state.selection.anchor, nextPos)
			: PMSelection.near(resolved, bias);

		if (nextSelection.eq(state.selection)) {
			return;
		}

		view.dispatch(state.tr.setSelection(nextSelection).scrollIntoView());

		setTimeout(() => {
			if (!this.editor || !this.auxiliaryInputPanel) return;
			this.updateAuxiliaryRangeFromEditor();
			if (this.lastAuxiliaryRange) {
				this.renderAuxiliaryCaret(this.lastAuxiliaryRange);
			}
		}, 0);
	}

	private isArrowKey(key: string): key is ArrowDirection {
		return (
			key === "ArrowLeft" ||
			key === "ArrowRight" ||
			key === "ArrowUp" ||
			key === "ArrowDown"
		);
	}

	private getArrowBias(direction: ArrowDirection): -1 | 1 {
		return direction === "ArrowLeft" || direction === "ArrowUp" ? -1 : 1;
	}

	private getNextPosForArrow(
		view: Editor["view"],
		direction: ArrowDirection,
		head: number
	): number | null {
		const maxPos = view.state.doc.content.size;
		const clampedHead = Math.max(0, Math.min(head, maxPos));
		let nextPos = this.getNextPosFromCoords(view, direction, clampedHead);

		if (nextPos == null || nextPos === clampedHead) {
			const fallback =
				direction === "ArrowLeft" || direction === "ArrowUp"
					? clampedHead - 1
					: clampedHead + 1;
			nextPos = Math.max(0, Math.min(fallback, maxPos));
		}

		return nextPos;
	}

	private getNextPosFromCoords(
		view: Editor["view"],
		direction: ArrowDirection,
		head: number
	): number | null {
		let rect: EditorCoords;
		try {
			rect = view.coordsAtPos(head);
		} catch (_) {
			return null;
		}

		const baseX = (rect.left + rect.right) / 2;
		const baseY = (rect.top + rect.bottom) / 2;
		const computed = window.getComputedStyle(view.dom);
		const fontSize = parseFloat(computed.fontSize) || 16;
		const lineHeightRaw = parseFloat(computed.lineHeight);
		const lineHeight = Number.isFinite(lineHeightRaw)
			? lineHeightRaw
			: fontSize * 1.6;
		const isVertical =
			this.plugin.settings.common.writingMode === "vertical-rl";
		const inlineStep = Math.max(1, fontSize * 0.8);
		const blockStep = Math.max(inlineStep, lineHeight);
		const stepX = isVertical ? blockStep : inlineStep;
		const stepY = isVertical ? inlineStep : blockStep;

		const deltaX =
			direction === "ArrowLeft"
				? -stepX
				: direction === "ArrowRight"
				? stepX
				: 0;
		const deltaY =
			direction === "ArrowUp"
				? -stepY
				: direction === "ArrowDown"
				? stepY
				: 0;

		// 現在の段落を取得
		const currentResolved = view.state.doc.resolve(head);
		const currentParent = currentResolved.parent;
		const currentParentPos = currentResolved.start() - 1;

		for (let attempt = 1; attempt <= 6; attempt++) {
			const targetX = baseX + deltaX * attempt;
			const targetY = baseY + deltaY * attempt;

			// 座標上のDOM要素を取得してルビテキスト要素かチェック
			const elementAtPoint = document.elementFromPoint(targetX, targetY);
			if (elementAtPoint) {
				let node: Element | null = elementAtPoint;
				let isInRubyText = false;

				// 祖先ノードをチェックしてルビテキスト要素内かどうか判定
				while (node && node !== view.dom) {
					if (
						node.classList?.contains("tategaki-aozora-ruby-rt") ||
						node.getAttribute("data-pm-ignore") === "true"
					) {
						isInRubyText = true;
						break;
					}
					node = node.parentElement;
				}

				// ルビテキスト要素内の場合はスキップ
				if (isInRubyText) {
					continue;
				}
			}

			const result = view.posAtCoords({
				left: targetX,
				top: targetY,
			});
			if (result && result.pos !== head) {
				// 取得した位置が同じ段落内かチェック
				try {
					const nextResolved = view.state.doc.resolve(result.pos);
					const nextParent = nextResolved.parent;
					const nextParentPos = nextResolved.start() - 1;

					// ArrowDown/ArrowUpの場合は段落をまたぐ移動を許可
					const allowCrossParagraph =
						direction === "ArrowDown" || direction === "ArrowUp";

					// 同じ段落内、または段落間移動が許可されている場合
					if (
						(currentParent === nextParent &&
							currentParentPos === nextParentPos) ||
						allowCrossParagraph
					) {
						return result.pos;
					}
				} catch (_) {
					// 解決に失敗した場合はスキップ
					continue;
				}
			}
		}

		return null;
	}

	private toggleOutlinePanel(): void {
		if (!this.editorAreaEl) {
			return;
		}
		if (this.outlinePanelEl) {
			this.outlinePanelEl.remove();
			this.outlinePanelEl = null;
			return;
		}

		const panel = this.editorAreaEl.createDiv(
			"tategaki-tiptap-outline-panel"
		);
		this.outlinePanelEl = panel;
		this.renderOutline(panel);
	}

	private renderOutline(panel: HTMLElement): void {
		if (!this.editor) return;
		panel.empty();

		const header = panel.createDiv("tategaki-tiptap-outline-header");
		header.createSpan({ text: "アウトライン" });
		const closeBtn = header.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
			attr: { "aria-label": "閉じる" },
		});
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			this.toggleOutlinePanel();
		});

		const list = panel.createDiv("tategaki-tiptap-outline-list");

		const items: Array<{ level: number; text: string; pos: number }> = [];
		try {
			this.editor.state.doc.descendants((node: any, pos: number) => {
				if (node.type?.name === "heading") {
					const level = Number(node.attrs?.level ?? 1);
					const text = node.textContent ?? "";
					if (text.trim().length > 0) {
						items.push({ level, text, pos });
					}
				}
				return true;
			});
		} catch (error) {
			debugWarn("Tategaki TipTap: failed to build outline", error);
		}

		if (items.length === 0) {
			const empty = list.createDiv("tategaki-tiptap-outline-empty");
			empty.textContent = "見出しがありません";
			return;
		}

		for (const item of items) {
			const row = list.createDiv("tategaki-tiptap-outline-row");
			row.style.setProperty(
				"--tategaki-tiptap-outline-indent",
				`${12 + Math.max(0, item.level - 1) * 12}px`,
			);
			row.textContent = item.text;
			row.addEventListener("click", (event) => {
				event.preventDefault();
					try {
						this.editor?.commands.focus();
						this.editor?.commands.setTextSelection(item.pos + 1);
						this.ensureExternalCursorVisible(item.pos + 1);
					} catch (_) {
						// noop: カーソル操作失敗は無視
					}
				});
			}
		}

	private registerEditorChangeWatchers(): void {
		const leafRef = (this.app.workspace as any).on(
			"active-leaf-change",
			() => {
				this.handleWorkspaceFocusChange();
			}
		);
		this.registerEvent(leafRef);
	}

	private handleWorkspaceFocusChange(): void {
		this.syncPlainEditModeWithWorkspace();
	}

	private syncPlainEditModeWithWorkspace(): void {
		const activeView =
			(this.app.workspace.getMostRecentLeaf?.() ?? null)?.view;
		if (
			activeView !== this ||
			(activeView instanceof MarkdownView &&
				activeView.getMode?.() !== "preview")
		) {
			this.deactivatePlainEditMode({ restoreEditorFocus: false });
		}
	}

	private isViewLeafActive(): boolean {
		return (this.app.workspace.getMostRecentLeaf?.() ?? null)?.view === this;
	}


	private async handleBeforeApplyMarkdown(
		markdown: string,
		file: TFile,
		source: "load" | "external"
	): Promise<MarkdownApplyDecision | null> {
		const tags = this.detectUnsupportedHtmlTags(markdown);
		if (tags.length === 0) {
			if (this.readOnlyProtectionReason === "unsupported") {
				this.setReadOnlyProtection(false);
			}
			return { action: "apply" };
		}

		await this.ensureUnsupportedHtmlBackup(file, markdown);

		const signature = tags.slice().sort().join(",");
		const lastCancel = this.unsupportedHtmlCancelState.get(file.path);
		if (
			lastCancel &&
			lastCancel.signature === signature &&
			Date.now() - lastCancel.at <
				TipTapCompatView.UNSUPPORTED_HTML_CANCEL_COOLDOWN_MS
		) {
			return { action: "cancel" };
		}

		const cached = this.unsupportedHtmlDecisions.get(file.path);
		if (cached) {
			this.unsupportedHtmlCancelState.delete(file.path);
			return this.buildUnsupportedHtmlDecision(cached);
		}

		const inFlight = this.unsupportedHtmlPromptInFlight.get(file.path);
		let choice: "read-only" | "discard" | "cancel";
		if (inFlight) {
			choice = await inFlight.promise;
		} else {
			const promise = (async () => {
				const modal = new UnsupportedHtmlModal(this.app, tags);
				return await modal.waitForChoice();
			})().finally(() => {
				this.unsupportedHtmlPromptInFlight.delete(file.path);
			});
			this.unsupportedHtmlPromptInFlight.set(file.path, {
				signature,
				promise,
			});
			choice = await promise;
		}

		if (choice === "cancel") {
			this.unsupportedHtmlCancelState.set(file.path, {
				at: Date.now(),
				signature,
			});
			return { action: "cancel" };
		}

		this.unsupportedHtmlCancelState.delete(file.path);
		this.unsupportedHtmlDecisions.set(file.path, choice);
		return this.buildUnsupportedHtmlDecision(choice);
	}

	private buildUnsupportedHtmlDecision(
		choice: "read-only" | "discard"
	): MarkdownApplyDecision {
		if (choice === "read-only") {
			this.setReadOnlyProtection(true, "unsupported");
			new Notice("未対応タグがあるため読み取り専用で開きました。", 3500);
			return { action: "apply" };
		}

		this.setReadOnlyProtection(false);
		return { action: "apply" };
	}

	private async ensureUnsupportedHtmlBackup(
		file: TFile,
		markdown: string
	): Promise<void> {
		if (!this.plugin.settings.wysiwyg.enableSyncBackup) {
			return;
		}
		if (this.unsupportedHtmlBackedUp.has(file.path)) {
			return;
		}
		try {
			await writeSyncBackupPair(this.app, file, markdown, markdown);
			this.unsupportedHtmlBackedUp.add(file.path);
		} catch (error) {
			debugWarn(
				"Tategaki TipTap: failed to write unsupported tag backup",
				error
			);
			new Notice("未対応タグのバックアップ作成に失敗しました。", 3500);
		}
	}

	private detectUnsupportedHtmlTags(markdown: string): string[] {
		const allowed = new Set([
			"span",
			"ruby",
			"rt",
			"rp",
			"mark",
			"u",
			"sup",
			"sub",
			"small",
			"br",
			"wbr",
			"img",
		]);
		const strippedFences = this.stripFencedCodeBlocks(markdown);
		const strippedInline = this.stripInlineCode(strippedFences);
		const withoutComments = strippedInline.replace(/<!--[\s\S]*?-->/g, "");
		const tagPattern = /<\s*\/?\s*([a-zA-Z][\w:-]*)\b[^>]*>/g;
		const unsupported = new Set<string>();
		let match: RegExpExecArray | null = null;
		while ((match = tagPattern.exec(withoutComments)) !== null) {
			const tag = match[1]?.toLowerCase();
			if (tag && !allowed.has(tag)) {
				unsupported.add(tag);
			}
		}
		return Array.from(unsupported.values()).sort();
	}

	private stripFencedCodeBlocks(markdown: string): string {
		const lines = markdown.split("\n");
		const kept: string[] = [];
		let inFence = false;
		let fenceChar = "";
		let fenceLength = 0;

		for (const line of lines) {
			const trimmed = line.trim();
			if (!inFence) {
				const fenceStart = trimmed.match(/^(`{3,}|~{3,})/);
				if (fenceStart) {
					inFence = true;
					fenceChar = fenceStart[1][0];
					fenceLength = fenceStart[1].length;
					continue;
				}
				kept.push(line);
				continue;
			}

			const fenceEnd = trimmed.match(/^(`{3,}|~{3,})\s*$/);
			if (
				fenceEnd &&
				fenceEnd[1][0] === fenceChar &&
				fenceEnd[1].length >= fenceLength
			) {
				inFence = false;
				fenceChar = "";
				fenceLength = 0;
			}
		}

		return kept.join("\n");
	}

	private stripInlineCode(text: string): string {
		let result = "";
		let inCode = false;
		let fenceLength = 0;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (ch === "`") {
				let j = i;
				while (text[j] === "`") {
					j++;
				}
				const len = j - i;
				if (!inCode) {
					inCode = true;
					fenceLength = len;
					i = j - 1;
					continue;
				}
				if (len >= fenceLength) {
					inCode = false;
					fenceLength = 0;
					i = j - 1;
					continue;
				}
			}

			if (!inCode) {
				result += ch;
			}
		}

		return result;
	}

	private applyInitialScrollPosition(): void {
		if (this.initialScrollApplied) {
			return;
		}
		if (!this.editorHostEl) {
			return;
		}
		const isVertical =
			this.plugin.settings.common.writingMode === "vertical-rl";
		if (!isVertical) {
			this.initialScrollApplied = true;
			return;
		}
		const scroller = this.getScrollableElement(true);
		if (!scroller) {
			this.initialScrollApplied = true;
			return;
		}
		// 縦書きは右端が開始位置になりやすい（環境によって初期scrollLeft=0で空表示になる）
		requestAnimationFrame(() => {
			try {
				const max = Math.max(
					0,
					scroller.scrollWidth - scroller.clientWidth
				);
				if (max > 0 && scroller.scrollLeft < 1) {
					scroller.scrollLeft = max;
				}
			} finally {
				this.initialScrollApplied = true;
			}
		});
	}

	private setupBeforeInputFixes(): void {
		if (!this.editor || this.beforeInputHandler) {
			return;
		}
		const dom = this.editor.view.dom as HTMLElement;
		const keydownHandler = (event: KeyboardEvent) => {
			if (event.key !== "Enter") return;
			this.lastEnterKeydownAt = Date.now();
			this.lastEnterKeydownShift = event.shiftKey;
		};
		const handler = (event: InputEvent) => {
			// 一部モバイル環境で Enter が改行にならない（insertParagraph/insertLineBreakが期待通り反映されない）ため、
			// beforeinputで捕捉して明示的に段落分割/HardBreakを挿入する。
			if (this.isEditorReadOnly()) {
				return;
			}
			const type = (event as any).inputType as string | undefined;
			if (type === "insertParagraph") {
				event.preventDefault();
				this.consumeShiftEnterFlag();
				try {
					if (!this.runInsertParagraphCommand()) {
						this.editor?.commands.setHardBreak();
					}
				} catch (_error) {
					// beforeinput由来の例外は無視（編集体験を優先）
				}
				return;
			}
			if (type === "insertLineBreak") {
				event.preventDefault();
				const useHardBreak = this.consumeShiftEnterFlag();
				try {
					if (useHardBreak) {
						this.editor?.commands.setHardBreak();
					} else if (!this.runInsertParagraphCommand()) {
						this.editor?.commands.setHardBreak();
					}
				} catch (_error) {
					// beforeinput由来の例外は無視（編集体験を優先）
				}
			}
		};
		this.beforeInputHandler = handler;
		this.beforeInputKeydownHandler = keydownHandler;
		dom.addEventListener("beforeinput", handler as any);
		dom.addEventListener("keydown", keydownHandler, true);
	}

	private teardownBeforeInputFixes(): void {
		if (!this.editor) {
			this.beforeInputHandler = null;
			this.beforeInputKeydownHandler = null;
			return;
		}
		if (!this.beforeInputHandler && !this.beforeInputKeydownHandler) {
			this.beforeInputHandler = null;
			this.beforeInputKeydownHandler = null;
			return;
		}
		try {
			const dom = this.editor.view.dom as HTMLElement;
			if (this.beforeInputHandler) {
				dom.removeEventListener(
					"beforeinput",
					this.beforeInputHandler as any
				);
			}
			if (this.beforeInputKeydownHandler) {
				dom.removeEventListener(
					"keydown",
					this.beforeInputKeydownHandler,
					true
				);
			}
		} finally {
			this.beforeInputHandler = null;
			this.beforeInputKeydownHandler = null;
		}
	}

	private consumeShiftEnterFlag(): boolean {
		const now = Date.now();
		const isRecent =
			this.lastEnterKeydownShift &&
			now - this.lastEnterKeydownAt < 400;
		this.lastEnterKeydownShift = false;
		this.lastEnterKeydownAt = 0;
		return isRecent;
	}

	private runInsertParagraphCommand(): boolean {
		if (!this.editor?.isEditable) return false;
		if (this.editor.isActive("listItem")) {
			return this.editor.commands.splitListItem("listItem");
		}
		return this.editor.commands.splitBlock();
	}

	private setupCompositionGuards(): void {
		if (
			!this.editor ||
			this.compositionStartHandler ||
			this.compositionEndHandler
		) {
			return;
		}
		const dom = this.editor.view.dom as HTMLElement;
		this.compositionStartHandler = () => {
			this.isComposing = true;
			// 変換開始時にキャレットを可視領域に（変換候補表示に対応）
			// 変換候補が表示されるまで少し待つ
			this.ensureCaretVisible(200);
		};
		this.compositionEndHandler = () => {
			const wasComposing = this.isComposing;
			this.isComposing = false;
			if (wasComposing) {
				this.flushPendingEditorUpdate();
			}
		};
		dom.addEventListener(
			"compositionstart",
			this.compositionStartHandler,
			true
		);
		dom.addEventListener(
			"compositionend",
			this.compositionEndHandler,
			true
		);
	}

	private teardownCompositionGuards(): void {
		if (!this.editor) {
			this.compositionStartHandler = null;
			this.compositionEndHandler = null;
			this.isComposing = false;
			return;
		}
		const dom = this.editor.view.dom as HTMLElement;
		if (this.compositionStartHandler) {
			dom.removeEventListener(
				"compositionstart",
				this.compositionStartHandler,
				true
			);
		}
		if (this.compositionEndHandler) {
			dom.removeEventListener(
				"compositionend",
				this.compositionEndHandler,
				true
			);
		}
		this.compositionStartHandler = null;
		this.compositionEndHandler = null;
		this.isComposing = false;
	}

	private ensureCaretVisible(delay = 300): void {
		if (!this.editor) return;

		// キーボードのアニメーションが完了してから実行
		window.setTimeout(() => {
			if (!this.editor) return;

			const { state, view } = this.editor;
			const { selection } = state;
			const { from } = selection;

			try {
				// カーソル位置のDOM座標を取得
				const coords = view.coordsAtPos(from);
				if (!coords) return;

				const domAtPos = view.domAtPos(from);
				const startNode = domAtPos?.node ?? view.dom;
				const didScroll = this.scrollCoordsIntoView(
					{
						left: coords.left,
						right: coords.right,
						top: coords.top,
						bottom: coords.bottom,
					},
					{ startNode, margin: 80 }
				);
				if (!didScroll) {
					view.dispatch(state.tr.scrollIntoView());
				}
			} catch (error) {
				debugWarn(
					"[Tategaki TipTap] Failed to ensure caret visible:",
					error
				);
			}
		}, delay);
	}

	private setupMobileKeyboardSupport(): void {
		// visualViewportのresizeイベントをリッスン
		// モバイルキーボードの表示/非表示を検出
		if (
			typeof window.visualViewport !== "undefined" &&
			window.visualViewport
		) {
			// 初期高さを記録
			this.lastViewportHeight = window.visualViewport.height;
			this.lastViewportOffsetTop = window.visualViewport.offsetTop;
			this.lastViewportOffsetLeft = window.visualViewport.offsetLeft;

			this.visualViewportResizeHandler = () => {
				if (!window.visualViewport) return;

				// デバウンス処理: 連続したイベントをまとめる
				if (this.viewportResizeTimer != null) {
					window.clearTimeout(this.viewportResizeTimer);
				}

				this.viewportResizeTimer = window.setTimeout(() => {
					if (!window.visualViewport) return;

					const currentHeight = window.visualViewport.height;
					const heightDiff = this.lastViewportHeight - currentHeight;
					const offsetTopDiff = Math.abs(
						window.visualViewport.offsetTop -
							this.lastViewportOffsetTop
					);
					const offsetLeftDiff = Math.abs(
						window.visualViewport.offsetLeft -
							this.lastViewportOffsetLeft
					);

					// キーボード表示/表示領域移動を検知してキャレットを補正
					// 高さ/オフセットの変化が大きい場合に実行
					if (
						heightDiff > 50 ||
						offsetTopDiff > 24 ||
						offsetLeftDiff > 24
					) {
						this.ensureCaretVisible(400);
					}

					// 現在の高さを記録
					this.lastViewportHeight = currentHeight;
					this.lastViewportOffsetTop =
						window.visualViewport.offsetTop;
					this.lastViewportOffsetLeft =
						window.visualViewport.offsetLeft;
					this.viewportResizeTimer = null;
				}, 100); // 100msのデバウンス
			};
			window.visualViewport.addEventListener(
				"resize",
				this.visualViewportResizeHandler
			);
			window.visualViewport.addEventListener(
				"scroll",
				this.visualViewportResizeHandler
			);
		}

		// エディタのフォーカス時にもキャレットを確認
		if (this.editor) {
			const dom = this.editor.view.dom as HTMLElement;
			this.editorFocusHandler = () => {
				// フォーカス時は遅延を長めに（キーボードアニメーション待ち）
				this.ensureCaretVisible(350);
			};
			dom.addEventListener("focus", this.editorFocusHandler, true);
		}

		// モバイル端末では選択変更時にもキャレットを可視領域へ補正
		if (this.editor && (Platform.isMobile || Platform.isMobileApp)) {
			this.selectionUpdateHandler = () => {
				if (!window.visualViewport) {
					return;
				}
				const keyboardOpen =
					window.visualViewport.height < window.innerHeight - 80;
				if (!keyboardOpen) {
					return;
				}
				if (this.selectionUpdateTimer != null) {
					window.clearTimeout(this.selectionUpdateTimer);
				}
				this.selectionUpdateTimer = window.setTimeout(() => {
					this.selectionUpdateTimer = null;
					this.ensureCaretVisible(80);
				}, 60);
			};
			this.editor.on("selectionUpdate", this.selectionUpdateHandler);
		}
	}

	private teardownMobileKeyboardSupport(): void {
		// タイマーをクリア
		if (this.viewportResizeTimer != null) {
			window.clearTimeout(this.viewportResizeTimer);
			this.viewportResizeTimer = null;
		}

		if (
			this.visualViewportResizeHandler &&
			typeof window.visualViewport !== "undefined" &&
			window.visualViewport
		) {
			window.visualViewport.removeEventListener(
				"resize",
				this.visualViewportResizeHandler
			);
			window.visualViewport.removeEventListener(
				"scroll",
				this.visualViewportResizeHandler
			);
			this.visualViewportResizeHandler = null;
		}

		if (this.editorFocusHandler && this.editor) {
			const dom = this.editor.view.dom as HTMLElement;
			dom.removeEventListener("focus", this.editorFocusHandler, true);
			this.editorFocusHandler = null;
		}

		if (this.selectionUpdateTimer != null) {
			window.clearTimeout(this.selectionUpdateTimer);
			this.selectionUpdateTimer = null;
		}
		if (this.selectionUpdateHandler && this.editor) {
			this.editor.off("selectionUpdate", this.selectionUpdateHandler);
			this.selectionUpdateHandler = null;
		}

		// 状態をリセット
		this.lastViewportHeight = 0;
		this.lastViewportOffsetTop = 0;
		this.lastViewportOffsetLeft = 0;
	}

	/**
	 * リスト項目移動用のwindow captureフェーズリスナーを設定
	 * Outliner等の他プラグインより先にイベントを処理するため
	 */
	private setupListItemMoveCaptureHandler(): void {
		this.listItemMoveCaptureHandler = (event: KeyboardEvent) => {
			// Mod+方向キー以外は無視
			const isMod = event.metaKey || event.ctrlKey;
			if (!isMod) return;

			const arrowKeys = [
				"ArrowUp",
				"ArrowDown",
				"ArrowLeft",
				"ArrowRight",
			];
			if (!arrowKeys.includes(event.key)) return;

			// Shift/Alt が押されている場合は無視（別のショートカット用）
			if (event.shiftKey || event.altKey) return;

			// エディタが存在し、フォーカスされているか確認
			if (!this.editor || !this.editor.isFocused) return;
			if (this.isEditorReadOnly()) return;

			// リスト項目内かどうかを確認
			const { $from } = this.editor.state.selection;
			let isInListItem = false;
			for (let depth = $from.depth; depth > 0; depth--) {
				const node = $from.node(depth);
				if (node.type.name === "listItem") {
					isInListItem = true;
					break;
				}
			}

			if (!isInListItem) return;

			// 書字方向に応じた移動方向を判定
			const writingMode = this.plugin.settings.common.writingMode;
			const isVertical = writingMode === "vertical-rl";

			let direction: "up" | "down" | null = null;

			if (isVertical) {
				// 縦書き: Right = up, Left = down
				if (event.key === "ArrowRight") {
					direction = "up";
				} else if (event.key === "ArrowLeft") {
					direction = "down";
				}
			} else {
				// 横書き: Up = up, Down = down
				if (event.key === "ArrowUp") {
					direction = "up";
				} else if (event.key === "ArrowDown") {
					direction = "down";
				}
			}

			if (!direction) return;

			// イベントを先取りして他プラグインに渡さない
			event.preventDefault();
			event.stopImmediatePropagation();

			// コマンドを実行
			if (direction === "up") {
				this.editor.commands.moveListItemUp();
			} else {
				this.editor.commands.moveListItemDown();
			}
		};

		window.addEventListener("keydown", this.listItemMoveCaptureHandler, {
			capture: true,
		});
	}

	/**
	 * リスト項目移動用のwindow captureフェーズリスナーを解除
	 */
	private teardownListItemMoveCaptureHandler(): void {
		if (this.listItemMoveCaptureHandler) {
			window.removeEventListener(
				"keydown",
				this.listItemMoveCaptureHandler,
				{ capture: true }
			);
			this.listItemMoveCaptureHandler = null;
		}
	}

	private handleEditorContentUpdate(): void {
		// IME変換中は重い処理を止める
		if (this.isComposing || this.editor?.view.composing) {
			return;
		}
		if (this.suppressEditorUpdates) {
			return;
		}
		if (this.markdownAdapter?.isApplyingExternalUpdate()) {
			return;
		}
		if (!this.syncManager) return;
		this.pendingUpdate = true;
		if (this.updateDebounceTimer != null) {
			return;
		}
		this.updateDebounceTimer = window.setTimeout(() => {
			this.updateDebounceTimer = null;
			if (!this.pendingUpdate) return;
			this.pendingUpdate = false;
			this.syncManager?.handleEditorUpdate();
		}, this.UPDATE_DEBOUNCE_MS);

		if (this.outlinePanelEl && this.outlineUpdateTimer == null) {
			this.outlineUpdateTimer = window.setTimeout(() => {
				this.outlineUpdateTimer = null;
				if (this.outlinePanelEl) {
					this.renderOutline(this.outlinePanelEl);
				}
			}, 200);
		}
	}

	private flushPendingEditorUpdate(): void {
		if (!this.syncManager) return;
		if (this.updateDebounceTimer != null) {
			window.clearTimeout(this.updateDebounceTimer);
			this.updateDebounceTimer = null;
		}
		this.pendingUpdate = false;
		this.syncManager.handleEditorUpdate();
	}

	private updateReadOnlyState(): void {
		if (!this.editor) {
			return;
		}
			const readOnly = this.isEditorReadOnly();
			try {
				this.editor.setEditable(!readOnly);
			} catch (_) {
				// noop: setEditable失敗は無視
			}
			this.formattingToolbar?.setReadOnly(readOnly, {
				hideEditingButtons: false,
			});
			this.searchReplacePanel?.setReadOnly(readOnly);
	}

	private isEditorReadOnly(): boolean {
		return this.isReadOnlyProtected;
	}

	private toggleReadingMode(): void {
		if (this.readingModeActive) {
			this.disableReadingMode();
		}

		const file = this.getDisplayFile();
		if (!file) {
			new Notice("対象ファイルが見つかりません。", 2500);
			return;
		}

		void this.plugin.modeManager
			.toggleReadingView(file, {
				targetLeaf: this.leaf,
				returnViewMode: "edit",
			})
			.then((opened) => {
				this.formattingToolbar?.updateReadingModeButton();
				new Notice(
					opened
						? "書籍モードビューを開きました。"
						: "書籍モードビューを閉じました。",
					2000
				);
			});
	}

	private isReadingViewOpenForCurrentFile(): boolean {
		const path =
			this.getCurrentFilePath() ?? this.currentFile?.path ?? null;
		return this.plugin.modeManager.isReadingViewOpenForFile(path);
	}

	private getEffectiveCommonSettings(settings: TategakiV2Settings) {
		return typeof (this.plugin as any).getEffectiveCommonSettings ===
			"function"
			? (this.plugin as any).getEffectiveCommonSettings()
			: settings.common;
	}

	private getCurrentBorderScale(settings: TategakiV2Settings): number {
		const effectiveCommon = this.getEffectiveCommonSettings(settings);
		const rawScale = Number(effectiveCommon.pageScale ?? 1);
		const fillMode = rawScale > 1;
		return fillMode ? 1 : Math.max(0.7, Math.min(1, rawScale));
	}

	private enableReadingMode(): boolean {
		if (!this.editor || !this.editorHostEl) {
			return false;
		}

		this.disableReadingMode();

		const proseMirror = this.editorHostEl.querySelector(
			".ProseMirror"
		) as HTMLElement | null;
		if (!proseMirror) {
			return false;
		}

		const container = document.createElement("div");
		container.className = "tategaki-reading-mode-container";
		const isPhone = window.matchMedia(
			"(hover: none) and (pointer: coarse) and (max-width: 700px)"
		).matches;
		container.style.paddingBottom = isPhone
			? "var(--tategaki-reading-bottom-offset, 0px)"
			: "0px";
		container.addEventListener(
				"pointerdown",
				() => {
					try {
						container.focus();
					} catch (_) {
						// noop: focus失敗は無視
					}
				},
				{ capture: true }
			);

		const settings = this.plugin.settings;
		const effectiveCommon = this.getEffectiveCommonSettings(settings);
		const rawScale = Number(effectiveCommon.pageScale ?? 1);
		const fillMode = rawScale > 1;

		this.applyReadingModeLayout(effectiveCommon.backgroundColor);
		container.style.color = effectiveCommon.textColor;
		container.style.setProperty(
			"--tategaki-text-color",
			effectiveCommon.textColor
		);
		container.style.setProperty(
			"--tategaki-page-background-color",
			fillMode
				? effectiveCommon.backgroundColor
				: effectiveCommon.pageBackgroundColor
		);

		const snapshotRoot = document.createElement("div");
		snapshotRoot.className = "tategaki-reading-mode-snapshot";

		if (this.frontmatterContainer) {
			snapshotRoot.appendChild(this.frontmatterContainer.cloneNode(true));
		}

		const proseMirrorClone = proseMirror.cloneNode(true) as HTMLElement;
		proseMirrorClone.removeAttribute("contenteditable");
		proseMirrorClone.setAttribute("contenteditable", "false");
		proseMirrorClone.removeAttribute("tabindex");
		proseMirrorClone.style.visibility = "";
		proseMirrorClone.style.color = effectiveCommon.textColor;
		snapshotRoot.appendChild(proseMirrorClone);

		const snapshotHtml = snapshotRoot.innerHTML;
		this.editorHostEl.appendChild(container);

		this.proseMirrorBeforeReadingStyle = {
			display: proseMirror.style.display,
			visibility: proseMirror.style.visibility,
			pointerEvents: proseMirror.style.pointerEvents,
		};
		proseMirror.style.visibility = "hidden";
		proseMirror.style.pointerEvents = "none";

		// タイトルを取得（フロントマターのtitle、なければファイル名）
		const frontmatterTitle = this.currentFile
			? this.getFrontmatterTitle(this.currentFile)
			: null;
		const title = frontmatterTitle ?? this.currentFile?.basename ?? "";

		try {
			this.readingModePager = new PagedReadingMode({
				container,
				contentHtml: snapshotHtml,
				writingMode: effectiveCommon.writingMode,
				settings: effectiveCommon,
				previewSettings: settings.preview,
				title,
				onRepaginationRequired: () => {
					new Notice(
						"レイアウト変更を検出したため、書籍モードを終了しました。",
						2500
					);
					this.disableReadingMode();
				},
			});
		} catch (error) {
				console.error("[Tategaki] Failed to start reading mode", error);
				try {
					this.readingModePager?.destroy();
				} catch (_) {
					// noop: 破棄失敗は無視
				}
				this.readingModePager = null;
				container.remove();
				proseMirror.style.visibility =
					this.proseMirrorBeforeReadingStyle.visibility;
			proseMirror.style.pointerEvents =
				this.proseMirrorBeforeReadingStyle.pointerEvents;
			this.proseMirrorBeforeReadingStyle = null;
			return false;
		}

		this.readingModeContainerEl = container;
		this.readingModeActive = true;
		this.formattingToolbar?.updateReadingModeButton();

			// キーボードでページ送りできるようにフォーカスする
			try {
				container.focus();
			} catch (_) {
				// noop: focus失敗は無視
			}

			return true;
		}

	private disableReadingMode(): void {
		if (!this.readingModeActive && !this.readingModePager) {
			return;
		}

			if (this.readingModePager) {
				try {
					this.readingModePager.destroy();
				} catch (_) {
					// noop: 破棄失敗は無視
				}
				this.readingModePager = null;
			}

		if (this.readingModeContainerEl) {
			this.readingModeContainerEl.remove();
			this.readingModeContainerEl = null;
		}

		if (this.editorHostEl) {
			const proseMirror = this.editorHostEl.querySelector(
				".ProseMirror"
			) as HTMLElement | null;
			if (proseMirror && this.proseMirrorBeforeReadingStyle) {
				proseMirror.style.display =
					this.proseMirrorBeforeReadingStyle.display;
				proseMirror.style.visibility =
					this.proseMirrorBeforeReadingStyle.visibility;
				proseMirror.style.pointerEvents =
					this.proseMirrorBeforeReadingStyle.pointerEvents;
			}
		}
		this.proseMirrorBeforeReadingStyle = null;
		this.restoreReadingModeLayout();

		this.readingModeActive = false;
		this.formattingToolbar?.updateReadingModeButton();
	}

	private applyReadingModeLayout(backgroundColor: string): void {
		if (
			this.readingModeLayoutBackup ||
			!this.pageContainerEl ||
			!this.borderWrapperEl ||
			!this.contentWrapperEl
		) {
			return;
		}

		this.readingModeLayoutBackup = {
			pageContainerPadding: this.pageContainerEl.style.padding,
			pageContainerAlignItems: this.pageContainerEl.style.alignItems,
			pageContainerJustifyContent:
				this.pageContainerEl.style.justifyContent,
			pageContainerBackground: this.pageContainerEl.style.background,
			borderWrapperBoxShadow: this.borderWrapperEl.style.boxShadow,
			borderWrapperBackground: this.borderWrapperEl.style.background,
			borderWrapperTransform: this.borderWrapperEl.style.transform,
			borderWrapperBorder: this.borderWrapperEl.style.border,
			borderWrapperOutline: this.borderWrapperEl.style.outline,
			contentWrapperBackground: this.contentWrapperEl.style.background,
		};

		this.pageContainerEl.style.padding = "0";
		this.pageContainerEl.style.alignItems = "stretch";
		this.pageContainerEl.style.justifyContent = "stretch";
		this.pageContainerEl.style.background = "transparent";

		this.borderWrapperEl.style.boxShadow = "none";
		this.borderWrapperEl.style.transform = "none";
		this.borderWrapperEl.style.border = "none";
		this.borderWrapperEl.style.outline = "none";
		this.borderWrapperEl.style.background = "transparent";

		this.contentWrapperEl.style.background = backgroundColor;
	}

	private restoreReadingModeLayout(): void {
		if (
			!this.readingModeLayoutBackup ||
			!this.pageContainerEl ||
			!this.borderWrapperEl ||
			!this.contentWrapperEl
		) {
			this.readingModeLayoutBackup = null;
			return;
		}

		this.pageContainerEl.style.padding =
			this.readingModeLayoutBackup.pageContainerPadding;
		this.pageContainerEl.style.alignItems =
			this.readingModeLayoutBackup.pageContainerAlignItems;
		this.pageContainerEl.style.justifyContent =
			this.readingModeLayoutBackup.pageContainerJustifyContent;
		this.pageContainerEl.style.background =
			this.readingModeLayoutBackup.pageContainerBackground;

		this.borderWrapperEl.style.boxShadow =
			this.readingModeLayoutBackup.borderWrapperBoxShadow;
		this.borderWrapperEl.style.transform =
			this.readingModeLayoutBackup.borderWrapperTransform;
		this.borderWrapperEl.style.border =
			this.readingModeLayoutBackup.borderWrapperBorder;
		this.borderWrapperEl.style.outline =
			this.readingModeLayoutBackup.borderWrapperOutline;
		this.borderWrapperEl.style.background =
			this.readingModeLayoutBackup.borderWrapperBackground;

		this.contentWrapperEl.style.background =
			this.readingModeLayoutBackup.contentWrapperBackground;

		this.readingModeLayoutBackup = null;
	}

	private rebuildReadingMode(): void {
		if (!this.readingModeActive) {
			return;
		}
		const progress = this.readingModePager?.getProgress() ?? 0;
			const enabled = this.enableReadingMode();
			if (!enabled) {
				return;
			}
			try {
				this.readingModePager?.jumpToProgress(progress);
			} catch (_) {
				// noop: 進捗復元失敗は無視
			}
		}

	private setReadOnlyProtection(
		active: boolean,
		reason?: "unsupported"
	): void {
		if (
			this.isReadOnlyProtected === active &&
			this.readOnlyProtectionReason ===
				(active ? reason ?? "unsupported" : null)
		) {
			return;
		}
		this.isReadOnlyProtected = active;
		this.readOnlyProtectionReason = active ? reason ?? "unsupported" : null;
		this.updateReadOnlyState();
	}

	private isEditorInputFocused(): boolean {
		const active = document.activeElement;
		if (!active) {
			return false;
		}
		if (this.auxiliaryInputPanel?.textareaEl === active) {
			return true;
		}
		return !!this.editorHostEl?.contains(active);
	}

	private withSuppressedEditorUpdates(action: () => void): void {
		if (this.suppressEditorUpdates) {
			action();
			return;
		}
		this.suppressEditorUpdates = true;
		try {
			action();
		} finally {
			this.suppressEditorUpdates = false;
		}
	}

	private registerFileWatchers(): void {
		const modifyRef = this.app.vault.on("modify", (file: TAbstractFile) => {
			if (file instanceof TFile) {
				void this.handleExternalFileModify(file);
			}
		});
		this.registerEvent(modifyRef);
	}

	private async handleExternalFileModify(file: TFile): Promise<void> {
		if (!this.syncManager) return;
		const state = this.syncManager.getState();
		if (!state.currentFilePath || file.path !== state.currentFilePath) {
			return;
		}

		// 更新間隔の設定を取得
		const interval = this.plugin.settings.preview.updateInterval ?? 300;

		// 更新間隔が0の場合は即座に更新（デバウンスなし）
		if (interval === 0) {
			try {
				await this.syncManager.handleExternalChange(file);
				await this.updateFrontmatterDisplay();
			} catch (error) {
				console.error(
					"Tategaki TipTap: failed to process external modification",
					error
				);
			}
			return;
		}

		// それ以外の場合はデバウンス処理
		if (this.fileUpdateDebounceTimer != null) {
			window.clearTimeout(this.fileUpdateDebounceTimer);
		}

		this.fileUpdateDebounceTimer = window.setTimeout(() => {
			this.fileUpdateDebounceTimer = null;
			void (async () => {
				try {
					if (this.syncManager) {
						await this.syncManager.handleExternalChange(file);
						await this.updateFrontmatterDisplay();
					}
				} catch (error) {
					console.error(
						"Tategaki TipTap: failed to process external modification",
						error
					);
				}
			})();
		}, interval);
	}

	private applyCursorSyncSetting(settings: TategakiV2Settings): void {
		// 設定が変更された場合、タイマーを再起動して新しい間隔を適用
		this.stopCursorSync();
		if (
			settings.wysiwyg.syncCursor &&
			!this.cursorSyncPausedByFocus &&
			!this.cursorSyncPausedByAuxiliary
		) {
			if (this.plainEditMode?.isPlainMode()) {
				return;
			}
			this.startCursorSync();
		}
	}

	private startCursorSync(): void {
		if (this.cursorSyncTimer != null) {
			return;
		}
		const interval = this.plugin.settings.preview.updateInterval || 300;
		this.cursorSyncTimer = window.setInterval(() => {
			this.pollExternalCursor();
		}, interval);
	}

	private stopCursorSync(): void {
		if (this.cursorSyncTimer != null) {
			window.clearInterval(this.cursorSyncTimer);
			this.cursorSyncTimer = null;
		}
		if (this.cursorSyncDebounceTimer != null) {
			window.clearTimeout(this.cursorSyncDebounceTimer);
			this.cursorSyncDebounceTimer = null;
		}
		this.pendingExternalCursor = null;
		this.lastExternalCursor = null;
		try {
			this.editor?.commands.clearExternalCursor();
		} catch (_) {
			// ignore
		}
	}

	private pollExternalCursor(): void {
		if (!this.editor || !this.syncManager) {
			return;
		}
		if (this.cursorSyncPausedByFocus) {
			return;
		}
		if (this.plainEditMode?.isPlainMode()) {
			return;
		}
		if (!this.plugin.settings.wysiwyg.syncCursor) {
			this.stopCursorSync();
			return;
		}

			const state = this.syncManager.getState();
			if (!state.currentFilePath) {
				try {
					this.editor.commands.clearExternalCursor();
				} catch (_) {
					// noop: 外部カーソルの消去失敗は無視
				}
				this.pendingExternalCursor = null;
				this.lastExternalCursor = null;
				return;
			}

		const mdView = this.getMarkdownViewForFile(state.currentFilePath);
		if (!mdView?.file || mdView.file.path !== state.currentFilePath) {
			return;
		}

		const pos = mdView.editor.getCursor();
		if (!pos) {
			return;
		}
		if (
			this.lastExternalCursor &&
			this.lastExternalCursor.line === pos.line &&
			this.lastExternalCursor.ch === pos.ch
		) {
			return;
		}
		this.lastExternalCursor = { line: pos.line, ch: pos.ch };

		const content = mdView.editor.getValue();
		this.pendingExternalCursor = {
			filePath: mdView.file.path,
			pos: { line: pos.line, ch: pos.ch },
			content,
		};

		if (this.cursorSyncDebounceTimer != null) {
			window.clearTimeout(this.cursorSyncDebounceTimer);
		}
		const interval = this.getExternalSyncInterval();
		if (interval <= 0) {
			this.cursorSyncDebounceTimer = null;
			void this.applyExternalCursorFromPending();
		} else {
			this.cursorSyncDebounceTimer = window.setTimeout(() => {
				this.cursorSyncDebounceTimer = null;
				void this.applyExternalCursorFromPending();
			}, interval);
		}
	}

	private getMarkdownViewForFile(filePath: string): MarkdownView | null {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (active?.file?.path === filePath) {
			return active;
		}

		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === filePath) {
				return view;
			}
		}
		return null;
	}

	private getExternalSyncInterval(): number {
		const interval = this.plugin.settings.preview.updateInterval ?? 300;
		if (!Number.isFinite(interval)) {
			return 300;
		}
		return Math.max(0, interval);
	}

	private applyExternalCursorFromPending(): void {
		if (!this.editor || !this.editorHostEl || !this.syncManager) {
			return;
		}
		const pending = this.pendingExternalCursor;
		if (!pending) {
			return;
		}
		const state = this.syncManager.getState();
		if (
			!state.currentFilePath ||
			state.currentFilePath !== pending.filePath
		) {
			return;
		}

		const offset = getOffsetFromPos(pending.pos, pending.content);
		const extracted = extractFrontmatterBlock(pending.content);
		const frontmatterLen = extracted.frontmatter.length;
			if (offset <= frontmatterLen) {
				try {
					this.editor.commands.clearExternalCursor();
				} catch (_) {
					// noop: 外部カーソルの消去失敗は無視
				}
				return;
			}

		const bodyOffset = Math.max(0, offset - frontmatterLen);
		const bodyWithMarker = insertCursorMarker(extracted.body, bodyOffset);
		const enableRuby = this.plugin.settings.wysiwyg.enableRuby !== false;
		const normalized = normalizeMarkdownForTipTap(
			protectIndentation(bodyWithMarker),
			{ enableRuby }
		);

		// 一時的なエディタを作成してパース
		const tempDiv = document.createElement("div");
		tempDiv.style.display = "none";
		document.body.appendChild(tempDiv);

		let tempEditor: Editor | null = null;
		let foundPos: number | null = null;

		try {
			tempEditor = createTategakiCompatEditor({
				element: tempDiv,
				settings: this.plugin.settings,
				content: normalized,
			});

			foundPos = this.findCursorMarkerPos(tempEditor.state.doc);
		} catch (error) {
			debugWarn(
				"Tategaki TipTap: failed to parse markdown for cursor sync",
				error
			);
		} finally {
			if (tempEditor) {
				tempEditor.destroy();
			}
			document.body.removeChild(tempDiv);
		}

			if (foundPos == null) {
				try {
					this.editor.commands.clearExternalCursor();
				} catch (_) {
					// noop: 外部カーソルの消去失敗は無視
				}
				return;
			}

		try {
			this.editor.commands.setExternalCursor(foundPos);
			this.ensureExternalCursorVisible(foundPos);
		} catch (error) {
			debugWarn(
				"Tategaki TipTap: failed to apply external cursor",
				error
			);
		}
	}

	private findCursorMarkerPos(doc: any): number | null {
		let found: number | null = null;
		try {
			doc.descendants((node: any, pos: number) => {
				if (found != null) {
					return false;
				}

				// テキストノードでマーカー文字列を探す
				if (node?.isText && typeof node.text === "string") {
					const index = node.text.indexOf(CURSOR_MARK);
					if (index !== -1) {
						found = pos + index;
						return false;
					}
				}

				return true;
			});
		} catch (error) {
			return null;
		}
		return found;
	}

	private isFocusInsideView(target: EventTarget | null): boolean {
		if (!target || !(target instanceof Node)) {
			return false;
		}
		const root = this.viewRootEl ?? this.editorHostEl;
		if (!root) {
			return false;
		}
		return root.contains(target);
	}

	private isRecentPointerDownInsideView(thresholdMs: number): boolean {
		if (!this.lastPointerDownInsideViewAt) {
			return false;
		}
		return Date.now() - this.lastPointerDownInsideViewAt <= thresholdMs;
	}

	private getLeafRootEl(): HTMLElement | null {
		if (!this.containerEl) {
			return null;
		}
		return this.containerEl.closest(".workspace-leaf");
	}

	private isPointerInsideLeaf(target: EventTarget | null): boolean {
		if (!target || !(target instanceof Node)) {
			return false;
		}
		const leafRoot = this.getLeafRootEl();
		if (!leafRoot) {
			return false;
		}
		return leafRoot.contains(target);
	}

	private isRecentPointerDownInsideLeaf(thresholdMs: number): boolean {
		if (!this.lastPointerDownInsideLeafAt) {
			return false;
		}
		return Date.now() - this.lastPointerDownInsideLeafAt <= thresholdMs;
	}

	private setupCursorSyncFocusGuards(): void {
		if (
			!this.editorHostEl ||
			this.cursorFocusInHandler ||
			this.cursorFocusOutHandler ||
			this.cursorPointerDownHandler ||
			this.cursorGlobalPointerDownHandler
		) {
			return;
		}
		const dom = this.viewRootEl ?? this.editorHostEl;
		this.cursorFocusInHandler = () => {
			this.cursorSyncPausedByFocus = true;
			this.stopCursorSync();
		};
		this.cursorFocusOutHandler = (event: FocusEvent) => {
			if (this.isFocusInsideView(event.relatedTarget)) {
				return;
			}
			if (this.isPointerInsideLeaf(event.relatedTarget)) {
				return;
			}
			if (
				!event.relatedTarget &&
				(this.isRecentPointerDownInsideView(200) ||
					this.isRecentPointerDownInsideLeaf(200))
			) {
				return;
			}
			this.captureCurrentInsertionRange();
			this.cursorSyncPausedByFocus = false;
			window.setTimeout(() => {
				if (this.cursorSyncPausedByAuxiliary) {
					return;
				}
				if (this.cursorSyncPausedByFocus) {
					return;
				}
				if (this.isFocusInsideView(document.activeElement)) {
					return;
				}
				if (this.plugin.settings.wysiwyg.syncCursor) {
					this.startCursorSync();
				}
			}, 0);
		};
		this.cursorPointerDownHandler = () => {
			this.lastPointerDownInsideViewAt = Date.now();
			this.lastPointerDownInsideLeafAt = this.lastPointerDownInsideViewAt;
		};
		this.cursorGlobalPointerDownHandler = (event: PointerEvent) => {
			const now = Date.now();
			if (this.isPointerInsideLeaf(event.target)) {
				this.lastPointerDownInsideLeafAt = now;
				if (this.isFocusInsideView(event.target)) {
					this.lastPointerDownInsideViewAt = now;
				}
				return;
			}
			if (!this.cursorSyncPausedByFocus) {
				return;
			}
			this.lastPointerDownInsideViewAt = 0;
			this.lastPointerDownInsideLeafAt = 0;
			this.captureCurrentInsertionRange();
			this.cursorSyncPausedByFocus = false;
			if (
				this.plugin.settings.wysiwyg.syncCursor &&
				!this.cursorSyncPausedByAuxiliary &&
				!this.plainEditMode?.isPlainMode()
			) {
				this.startCursorSync();
			}
		};
		dom.addEventListener("focusin", this.cursorFocusInHandler, true);
		dom.addEventListener("focusout", this.cursorFocusOutHandler, true);
		dom.addEventListener(
			"pointerdown",
			this.cursorPointerDownHandler,
			true
		);
		document.addEventListener(
			"pointerdown",
			this.cursorGlobalPointerDownHandler,
			true
		);
	}

	private teardownCursorSyncFocusGuards(): void {
		const dom = this.viewRootEl ?? this.editorHostEl;
		if (dom && this.cursorFocusInHandler) {
			dom.removeEventListener("focusin", this.cursorFocusInHandler, true);
		}
		if (dom && this.cursorFocusOutHandler) {
			dom.removeEventListener(
				"focusout",
				this.cursorFocusOutHandler,
				true
			);
		}
		if (dom && this.cursorPointerDownHandler) {
			dom.removeEventListener(
				"pointerdown",
				this.cursorPointerDownHandler,
				true
			);
		}
		if (this.cursorGlobalPointerDownHandler) {
			document.removeEventListener(
				"pointerdown",
				this.cursorGlobalPointerDownHandler,
				true
			);
		}
		this.cursorFocusInHandler = null;
		this.cursorFocusOutHandler = null;
		this.cursorPointerDownHandler = null;
		this.cursorGlobalPointerDownHandler = null;
		this.cursorSyncPausedByFocus = false;
		this.cursorSyncPausedByAuxiliary = false;
		this.lastPointerDownInsideViewAt = 0;
		this.lastPointerDownInsideLeafAt = 0;
	}

	private ensureExternalCursorVisible(pos: number): void {
		if (this.readingModeActive) {
			return;
		}
		if (!this.editor || !this.editorHostEl) return;
		const scroller = this.getScrollableElement(true);
		if (!scroller) return;

		const maxPos = Math.max(0, this.editor.state.doc.content.size);
		const safePos = Math.max(0, Math.min(pos, maxPos));

		let coords: {
			left: number;
			right: number;
			top: number;
			bottom: number;
		};
		try {
			coords = this.editor.view.coordsAtPos(safePos);
		} catch (_) {
			return;
		}

		const rect = scroller.getBoundingClientRect();
		const margin = 20;
		const isVertical =
			this.plugin.settings.common.writingMode === "vertical-rl";

		if (isVertical) {
			let delta = 0;
			if (coords.right < rect.left + margin) {
				delta = rect.left - coords.right + margin;
			} else if (coords.left > rect.right - margin) {
				delta = rect.right - coords.left - margin;
			}
			if (delta !== 0) {
				scroller.scrollLeft -= delta;
			}
			return;
		}

		if (coords.top < rect.top + margin) {
			scroller.scrollTop -= rect.top - coords.top + margin;
		} else if (coords.bottom > rect.bottom - margin) {
			scroller.scrollTop += coords.bottom - rect.bottom + margin;
		}
	}

	private applySettingsToEditor(settings: TategakiV2Settings): void {
		if (!this.editorHostEl || !this.editor || !this.editorAreaEl) return;
		const effectiveCommon =
			typeof (this.plugin as any).getEffectiveCommonSettings ===
			"function"
				? (this.plugin as any).getEffectiveCommonSettings()
				: settings.common;

		this.applyPageLayout(settings);

		// CSS変数を親要素（editorAreaEl）に設定して、補助パネル等でも共有できるようにする
		const targetEl = this.editorAreaEl;

		targetEl.style.setProperty(
			"--tategaki-writing-mode",
			effectiveCommon.writingMode
		);
		targetEl.style.setProperty(
			"--tategaki-font-family",
			effectiveCommon.fontFamily
		);
		targetEl.style.setProperty(
			"--tategaki-font-size",
			`${effectiveCommon.fontSize}px`
		);
		targetEl.style.setProperty(
			"--tategaki-line-height",
			`${effectiveCommon.lineHeight}`
		);
		targetEl.style.setProperty(
			"--tategaki-letter-spacing",
			`${effectiveCommon.letterSpacing}em`
		);
		targetEl.style.setProperty(
			"--tategaki-text-color",
			effectiveCommon.textColor
		);
		targetEl.style.setProperty(
			"--tategaki-background-color",
			effectiveCommon.backgroundColor
		);
		targetEl.style.setProperty(
			"--tategaki-accent-color",
			effectiveCommon.accentColor
		);
		const caretColor = this.resolveCaretColor(settings, effectiveCommon);
		targetEl.style.setProperty("--tategaki-caret-color", caretColor);
		const verticalGap =
			effectiveCommon.rubyVerticalGap ??
			DEFAULT_V2_SETTINGS.common.rubyVerticalGap;
		const horizontalGap =
			effectiveCommon.rubyHorizontalGap ??
			DEFAULT_V2_SETTINGS.common.rubyHorizontalGap;
		targetEl.style.setProperty(
			"--tategaki-ruby-gap-vertical",
			`${verticalGap}em`
		);
		targetEl.style.setProperty(
			"--tategaki-ruby-gap-horizontal",
			`${horizontalGap}em`
		);
		const rubySize = Math.max(
			0.2,
			Math.min(1.0, effectiveCommon.rubySize ?? 0.5)
		);
		const rubyValue = rubySize.toString();
		targetEl.style.setProperty("--tategaki-ruby-size", rubyValue);
		targetEl.style.setProperty("--ruby-size", rubyValue);

		// 見出しスタイル
		const headingFont =
			effectiveCommon.headingFontFamily || effectiveCommon.fontFamily;
		const headingColor =
			effectiveCommon.headingTextColor || effectiveCommon.textColor;
		targetEl.style.setProperty(
			"--tategaki-heading-font-family",
			headingFont
		);
		targetEl.style.setProperty(
			"--tategaki-heading-text-color",
			headingColor
		);

		this.editorHostEl.setAttribute(
			"data-writing-mode",
			effectiveCommon.writingMode
		);
		this.withSuppressedEditorUpdates(() => {
			this.editor?.commands.setWritingMode(effectiveCommon.writingMode);
		});

		this.applyScrollbarVisibility(effectiveCommon.writingMode);

		// SoT と同じ「ページ内余白（物理Top/Bottom）」を TipTap 側にも適用する。
		// scroll container（editorHostEl）に設定して、表示/編集の挙動を揃える。
		this.applyEditorPadding(settings);
		if (this.auxiliaryInputPanel) {
			this.addAuxiliaryPanelPadding();
		} else {
			this.removeAuxiliaryPanelPadding();
		}
	}

	private resolveCaretColor(
		settings: TategakiV2Settings,
		effectiveCommon: CommonSettings
	): string {
		const mode = settings.wysiwyg.caretColorMode ?? "accent";
		if (mode === "text") {
			return effectiveCommon.textColor;
		}
		if (mode === "custom") {
			const custom = settings.wysiwyg.caretCustomColor?.trim();
			if (custom) return custom;
		}
		return effectiveCommon.accentColor;
	}

	private applyEditorPadding(settings: TategakiV2Settings): void {
		if (!this.editorHostEl) return;
		this.editorPaddingTopPx = settings.wysiwyg.sotPaddingTop ?? 32;
		this.editorPaddingBottomPx = settings.wysiwyg.sotPaddingBottom ?? 16;
		this.editorHostEl.style.paddingTop = `${this.editorPaddingTopPx}px`;
		// paddingBottom は補助入力パネル表示時に加算されるため、ここでは base を設定だけする。
		this.editorHostEl.style.paddingBottom = `${this.editorPaddingBottomPx}px`;
	}

	private applyPageLayout(settings: TategakiV2Settings): void {
		const effectiveCommon =
			typeof (this.plugin as any).getEffectiveCommonSettings ===
			"function"
				? (this.plugin as any).getEffectiveCommonSettings()
				: settings.common;

		const rawScale = Number(effectiveCommon.pageScale ?? 1);
		const fillMode = rawScale > 1;
		const scaled = fillMode ? 1 : Math.max(0.7, Math.min(1, rawScale));
		const rubySize = Math.max(
			0.2,
			Math.min(1.0, effectiveCommon.rubySize ?? 0.5)
		);
		const rubyValue = rubySize.toString();
		const rubyVerticalGap =
			effectiveCommon.rubyVerticalGap ??
			DEFAULT_V2_SETTINGS.common.rubyVerticalGap;
		const rubyHorizontalGap =
			effectiveCommon.rubyHorizontalGap ??
			DEFAULT_V2_SETTINGS.common.rubyHorizontalGap;
		const rubyVerticalGapValue = `${rubyVerticalGap}em`;
		const rubyHorizontalGapValue = `${rubyHorizontalGap}em`;

		if (this.borderWrapperEl) {
			this.borderWrapperEl.style.transformOrigin = "center center";
			this.borderWrapperEl.style.transform = `scale(${
				fillMode ? 1 : scaled
			})`;
			this.borderWrapperEl.style.boxShadow = fillMode
				? "none"
				: "0 6px 12px rgba(0,0,0,0.4)";
			this.borderWrapperEl.style.setProperty(
				"background",
				effectiveCommon.backgroundColor,
				"important"
			);
			this.borderWrapperEl.style.setProperty(
				"border",
				"none",
				"important"
			);
			this.borderWrapperEl.style.setProperty(
				"outline",
				"none",
				"important"
			);
		}

		if (this.pageContainerEl) {
			this.pageContainerEl.style.alignItems = fillMode
				? "stretch"
				: "center";
			this.pageContainerEl.style.justifyContent = fillMode
				? "stretch"
				: "center";
			this.pageContainerEl.style.padding = fillMode
				? "0"
				: "40px 32px 22px 32px";
			this.pageContainerEl.style.background = "transparent";
		}

		const container = this.containerEl.children[1] as
			| HTMLElement
			| undefined;
		if (container) {
			container.style.background = fillMode
				? effectiveCommon.backgroundColor
				: effectiveCommon.pageBackgroundColor;
		}

		if (this.contentWrapperEl) {
			this.contentWrapperEl.style.background =
				effectiveCommon.backgroundColor;
			this.contentWrapperEl.style.color = effectiveCommon.textColor;
			this.contentWrapperEl.style.letterSpacing = `${effectiveCommon.letterSpacing}em`;
			this.contentWrapperEl.style.setProperty(
				"--tategaki-font-family",
				effectiveCommon.fontFamily
			);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-font-size",
				`${effectiveCommon.fontSize}px`
			);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-line-height",
				effectiveCommon.lineHeight.toString()
			);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-letter-spacing",
				`${effectiveCommon.letterSpacing}em`
			);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-text-color",
				effectiveCommon.textColor
			);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-background-color",
				effectiveCommon.backgroundColor
			);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-ruby-size",
				rubyValue
			);
			this.contentWrapperEl.style.setProperty("--ruby-size", rubyValue);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-ruby-gap-vertical",
				rubyVerticalGapValue
			);
			this.contentWrapperEl.style.setProperty(
				"--tategaki-ruby-gap-horizontal",
				rubyHorizontalGapValue
			);
		}

		// 見出しと本文のスタイルをプラグイン設定で統一（Obsidianテーマの色を上書き）
		if (this.editorHostEl) {
			const proseMirror = this.editorHostEl.querySelector(".ProseMirror");
			if (proseMirror) {
				// 既存のスタイル要素を削除
				const existingStyle = proseMirror.querySelector(
					"style[data-tategaki-heading-style]"
				);
				if (existingStyle) {
					existingStyle.remove();
				}

				// 見出しと本文の色と行間を設定するスタイルを追加
				const styleEl = document.createElement("style");
				styleEl.setAttribute("data-tategaki-heading-style", "true");
				styleEl.textContent = `
					.ProseMirror h1,
					.ProseMirror h2,
					.ProseMirror h3,
					.ProseMirror h4,
					.ProseMirror h5,
					.ProseMirror h6,
					.ProseMirror p {
						color: ${effectiveCommon.textColor} !important;
						line-height: ${effectiveCommon.lineHeight} !important;
					}
				`;
				proseMirror.appendChild(styleEl);
			}
		}
	}

	private applyScrollbarVisibility(writingMode: WritingMode): void {
		if (!this.editorHostEl) return;
		const isHorizontal = writingMode === "horizontal-tb";
		this.editorHostEl.style.overflowX = isHorizontal ? "hidden" : "scroll";
		this.editorHostEl.style.overflowY = isHorizontal ? "scroll" : "hidden";
		this.editorHostEl.style.scrollbarGutter = "stable";
	}

	private async updateFrontmatterDisplay(): Promise<void> {
		const token = ++this.frontmatterUpdateToken;

		if (this.frontmatterContainer) {
			this.frontmatterContainer.remove();
			this.frontmatterContainer = null;
		}
		if (!this.editorHostEl || !this.editor) {
			return;
		}

		const filePath = this.getCurrentFilePath();
		if (!filePath) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return;
		}

		// ファイル情報を更新
		this.currentFile = file;

		try {
			const content = await this.app.vault.read(file);
			if (token !== this.frontmatterUpdateToken) {
				return;
			}
			if (this.getCurrentFilePath() !== file.path) {
				return;
			}
			const settings = this.plugin.settings;
			const { frontmatter } = this.parseFrontmatter(content);

			if (frontmatter && !settings.preview.hideFrontmatter) {
				const frontmatterEl = this.renderFrontmatter(
					frontmatter,
					settings
				);
				if (frontmatterEl) {
					this.applyFrontmatterWritingMode(
						frontmatterEl,
						settings.common.writingMode
					);
					const editorRoot = this.editor.view?.dom as
						| HTMLElement
						| undefined;
					if (editorRoot && this.editorHostEl.contains(editorRoot)) {
						this.editorHostEl.insertBefore(
							frontmatterEl,
							editorRoot
						);
					} else {
						this.editorHostEl.appendChild(frontmatterEl);
					}
					this.frontmatterContainer = frontmatterEl;
				}
			}
		} catch (error) {
			console.error(
				"[Tategaki] Failed to update frontmatter display:",
				error
			);
		}

		// タブヘッダーを更新（frontmatterのtitleが変更された可能性があるため）
		// updateHeader()は内部APIのため型アサーションを使用
		if (typeof (this.leaf as any).updateHeader === "function") {
			(this.leaf as any).updateHeader();
		}
		this.updatePaneHeaderTitle();

		if (this.readingModeActive) {
			this.rebuildReadingMode();
		}
	}

	private parseFrontmatter(content: string): {
		frontmatter: FrontmatterData | null;
		contentWithoutFrontmatter: string;
	} {
		// フロントマターは --- で始まり --- で終わる
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = content.match(frontmatterRegex);

		if (!match) {
			return {
				frontmatter: null,
				contentWithoutFrontmatter: content,
			};
		}

		const yamlContent = match[1];
		const contentWithoutFrontmatter = content.slice(match[0].length);

		// 簡易的なYAMLパーサー（基本的なキー: 値形式のみ対応）
		const frontmatter: FrontmatterData = {};
		const lines = yamlContent.split("\n");

		let currentKey = "";
		let currentArray: string[] = [];
		let isInArray = false;

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine.startsWith("#")) continue;

			// 配列項目
			if (trimmedLine.startsWith("- ")) {
				if (isInArray) {
					currentArray.push(trimmedLine.slice(2).trim());
				}
				continue;
			}

			// 配列終了時に保存
			if (isInArray && !trimmedLine.startsWith("- ")) {
				if (currentKey === "co_authors") {
					frontmatter.co_authors = currentArray;
				} else if (currentKey === "co_translators") {
					frontmatter.co_translators = currentArray;
				}
				isInArray = false;
				currentArray = [];
			}

			// キー: 値形式
			const colonIndex = trimmedLine.indexOf(":");
			if (colonIndex !== -1) {
				const key = trimmedLine.slice(0, colonIndex).trim();
				const value = trimmedLine.slice(colonIndex + 1).trim();

				switch (key) {
					case "title":
						frontmatter.title = value;
						currentKey = key;
						break;
					case "subtitle":
						frontmatter.subtitle = value;
						currentKey = key;
						break;
					case "original_title":
						frontmatter.original_title = value;
						currentKey = key;
						break;
					case "author":
						frontmatter.author = value;
						currentKey = key;
						break;
					case "translator":
						frontmatter.translator = value;
						currentKey = key;
						break;
					case "co_authors":
						if (!value) {
							// 次の行から配列が始まる
							isInArray = true;
							currentKey = key;
							currentArray = [];
						} else {
							// インライン値
							frontmatter.co_authors = [value];
						}
						break;
					case "co_translators":
						if (!value) {
							// 次の行から配列が始まる
							isInArray = true;
							currentKey = key;
							currentArray = [];
						} else {
							// インライン値
							frontmatter.co_translators = [value];
						}
						break;
				}
			}
		}

		// 最後の配列を保存
		if (isInArray) {
			if (currentKey === "co_authors") {
				frontmatter.co_authors = currentArray;
			} else if (currentKey === "co_translators") {
				frontmatter.co_translators = currentArray;
			}
		}

		return {
			frontmatter:
				Object.keys(frontmatter).length > 0 ? frontmatter : null,
			contentWithoutFrontmatter,
		};
	}

	private renderFrontmatter(
		data: FrontmatterData,
		settings: TategakiV2Settings
	): HTMLElement | null {
		const container = document.createElement("div");
		container.className = "tategaki-frontmatter";

		let hasContent = false;

		// 上付き要素（タイトル系）
		const topAlignedContainer = container.createDiv(
			"tategaki-frontmatter-top"
		);

		// title (H1, 上付き)
		if (data.title && settings.preview.showFrontmatterTitle) {
			const titleEl = topAlignedContainer.createEl("h1", {
				cls: "tategaki-frontmatter-title",
			});
			titleEl.textContent = data.title;
			hasContent = true;
		}

		// subtitle (H2, 上付き)
		if (data.subtitle && settings.preview.showFrontmatterSubtitle) {
			const subtitleEl = topAlignedContainer.createEl("h2", {
				cls: "tategaki-frontmatter-subtitle",
			});
			subtitleEl.textContent = data.subtitle;
			hasContent = true;
		}

		// original_title (H2, 上付き)
		if (
			data.original_title &&
			settings.preview.showFrontmatterOriginalTitle
		) {
			const originalTitleEl = topAlignedContainer.createEl("h2", {
				cls: "tategaki-frontmatter-original-title",
			});
			originalTitleEl.textContent = data.original_title;
			hasContent = true;
		}

		// 地付き要素（著者系）
		const bottomAlignedContainer = container.createDiv(
			"tategaki-frontmatter-bottom"
		);

		// author (H4, 地付き)
		if (data.author && settings.preview.showFrontmatterAuthor) {
			const authorEl = bottomAlignedContainer.createEl("h4", {
				cls: "tategaki-frontmatter-author",
			});
			authorEl.textContent = data.author;
			this.applyFrontmatterInlineEndAlignment(authorEl);
			hasContent = true;
		}

		// co_authors (H4, 地付き)
		if (data.co_authors && settings.preview.showFrontmatterCoAuthors) {
			for (const coAuthor of data.co_authors) {
				const coAuthorEl = bottomAlignedContainer.createEl("h4", {
					cls: "tategaki-frontmatter-co-author",
				});
				coAuthorEl.textContent = coAuthor;
				this.applyFrontmatterInlineEndAlignment(coAuthorEl);
				hasContent = true;
			}
		}

		// translator (H5, 地付き)
		if (data.translator && settings.preview.showFrontmatterTranslator) {
			const translatorEl = bottomAlignedContainer.createEl("h5", {
				cls: "tategaki-frontmatter-translator",
			});
			translatorEl.textContent = data.translator;
			this.applyFrontmatterInlineEndAlignment(translatorEl);
			hasContent = true;
		}

		// co_translators (H5, 地付き)
		if (
			data.co_translators &&
			settings.preview.showFrontmatterCoTranslators
		) {
			for (const coTranslator of data.co_translators) {
				const coTranslatorEl = bottomAlignedContainer.createEl("h5", {
					cls: "tategaki-frontmatter-co-translator",
				});
				coTranslatorEl.textContent = coTranslator;
				this.applyFrontmatterInlineEndAlignment(coTranslatorEl);
				hasContent = true;
			}
		}

		return hasContent ? container : null;
	}

	private applyFrontmatterInlineEndAlignment(element: HTMLElement): void {
		element.style.display = "block";
		element.style.setProperty("text-align", "end", "important");
		element.style.setProperty("text-align-last", "end", "important");
		element.style.marginInlineStart = "auto";
		element.style.marginInlineEnd = "0";
		element.style.marginLeft = "auto";
		element.style.marginRight = "0";
		element.style.justifySelf = "end";
	}

	private applyFrontmatterWritingMode(
		element: HTMLElement,
		writingMode: string
	): void {
		element.style.writingMode = writingMode;
		element.style.textOrientation = "mixed";
	}

	private setupWheelScroll(): void {
		if (!this.editorHostEl) return;
		if (this.boundWheelHandler) {
			this.editorHostEl.removeEventListener(
				"wheel",
				this.boundWheelHandler
			);
			this.boundWheelHandler = null;
		}
		const handler = (event: WheelEvent) => this.handleWheel(event);
		this.boundWheelHandler = handler;
		this.editorHostEl.addEventListener("wheel", handler, {
			passive: false,
		});
	}

	private teardownWheelScroll(): void {
		if (!this.editorHostEl || !this.boundWheelHandler) return;
		this.editorHostEl.removeEventListener("wheel", this.boundWheelHandler);
		this.boundWheelHandler = null;
		this.wheelThrottleTimer = null;
	}

	private handleWheel(event: WheelEvent): void {
		if (this.readingModeActive) {
			return;
		}
		if (!this.editorHostEl) return;
		const isHorizontalWriting =
			this.plugin.settings.common.writingMode === "horizontal-tb";
		const { deltaX, deltaY, shiftKey } = event;

		const scroller = this.getScrollableElement(true);
		if (!scroller) {
			return;
		}

		if (isHorizontalWriting) {
			// 横書き: 通常=縦スクロール、Shift=横スクロール
			if (!shiftKey) {
				return;
			}
			event.preventDefault();
			this.throttledWheelScroll(() => {
				scroller.scrollLeft -= deltaY;
			});
			return;
		}

		// 縦書き: 通常=横スクロール、Shift=縦スクロール
		if (shiftKey) {
			return;
		}

		event.preventDefault();
		this.throttledWheelScroll(() => {
			const scrollAmount = -deltaY * 0.8 + deltaX;
			scroller.scrollLeft += scrollAmount;
		});
	}

	private throttledWheelScroll(callback: () => void): void {
		if (this.wheelThrottleTimer !== null) {
			return;
		}
		callback();
		this.wheelThrottleTimer = window.setTimeout(() => {
			this.wheelThrottleTimer = null;
		}, 16);
	}

	private getScrollableElement(horizontal: boolean): HTMLElement | null {
		const candidates: (HTMLElement | null)[] = [
			this.editorHostEl,
			(this.editor?.view.dom as HTMLElement | undefined) ?? null,
		];
		for (const el of candidates) {
			if (!el) continue;
			if (horizontal) {
				if (el.scrollWidth - el.clientWidth > 1) {
					return el;
				}
			} else {
				if (el.scrollHeight - el.clientHeight > 1) {
					return el;
				}
			}
		}
		return this.editorHostEl;
	}

	async loadFile(file: TFile | null): Promise<void> {
		await this.syncManager?.loadFile(file);
		await this.updateFrontmatterDisplay();
		this.formattingToolbar?.updateReadingModeButton();
		if (this.readingModeActive) {
			this.rebuildReadingMode();
		}
	}

	getCurrentFilePath(): string | null {
		return this.syncManager?.getState()?.currentFilePath ?? null;
	}

	async checkUnsavedChanges(): Promise<boolean> {
		if (!this.syncManager?.hasUnsavedChanges()) {
			return true;
		}

		const modal = new UnsavedChangesModal(this.app);
		modal.open();
		const choice = await modal.waitForChoice();
		switch (choice) {
			case "save":
				await this.syncManager.triggerManualSync();
				this.syncManager.clearDirtyFlag();
				return true;
			case "discard":
				this.syncManager.clearDirtyFlag();
				return true;
			case "cancel":
			default:
				return false;
		}
	}

	// タブを閉じる前に呼ばれる - 未保存の変更があればダイアログを表示
	async requestSave(): Promise<void> {
		if (this.isReadOnlyProtected) {
			return;
		}
		if (!this.syncManager || !this.syncManager.hasUnsavedChanges()) {
			return;
		}
		// 手動同期モードのみチェック
		if (this.plugin.settings.wysiwyg.syncMode !== "manual") {
			return;
		}

		const modal = new UnsavedChangesModal(
			this.app,
			"未保存の変更があります。タブを閉じる前に保存しますか？"
		);
		const choice = await modal.waitForChoice();

		if (choice === "save") {
			await this.syncManager.triggerManualSync();
		} else if (choice === "discard") {
			this.syncManager.clearDirtyFlag();
		} else if (choice === "cancel") {
			throw new Error("User cancelled");
		}
	}

	async handleAppQuit(action: AppCloseAction): Promise<void> {
		if (!this.syncManager) {
			return;
		}
		if (this.isReadOnlyProtected) {
			return;
		}
		if (action === "save") {
			this.flushPendingEditorUpdate();
			await this.syncManager.flush();
			return;
		}

		if (this.updateDebounceTimer != null) {
			window.clearTimeout(this.updateDebounceTimer);
			this.updateDebounceTimer = null;
			this.pendingUpdate = false;
		}
		this.syncManager.clearDirtyFlag();
	}

	/**
	 * ビューの状態を保存しない（次回起動時に自動復元されないようにする）
	 */
	getState(): Record<string, never> {
		return {};
	}
}
