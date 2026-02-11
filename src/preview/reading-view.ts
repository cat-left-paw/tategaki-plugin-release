import {
	ItemView,
	Notice,
	Platform,
	setIcon,
	TFile,
	type ViewStateResult,
	WorkspaceLeaf,
} from "obsidian";
import type TategakiV2Plugin from "../core/plugin";
import type { CommonSettings, TategakiV2Settings } from "../types/settings";
import { PagedReadingMode } from "../wysiwyg/reading-mode/paged-reading-mode";
import { SettingsPanelModal } from "../wysiwyg/contenteditable/settings-panel";
import {
	extractFrontmatterBlock,
	normalizeMarkdownForTipTap,
	protectIndentation,
} from "../wysiwyg/tiptap-compat/markdown-adapter";

export const TATEGAKI_READING_VIEW_TYPE = "tategaki-reading-view";

type FrontmatterData = {
	title?: string;
	subtitle?: string;
	original_title?: string;
	author?: string;
	translator?: string;
	co_authors?: string[];
	co_translators?: string[];
};

type ReadingReturnMode = "edit" | "sot";

type ReadingViewState = {
	filePath?: string;
	returnViewMode?: ReadingReturnMode;
};

type OutlineItem = {
	level: number;
	text: string;
	pageIndex: number;
};

export class TategakiReadingView extends ItemView {
	private plugin: TategakiV2Plugin;
	private rootEl: HTMLElement | null = null;
	private hostEl: HTMLElement | null = null;
	private toolbarLeftEl: HTMLElement | null = null;
	private toolbarRightEl: HTMLElement | null = null;
	private modeBadgeEl: HTMLElement | null = null;
	private writingModeButton: HTMLButtonElement | null = null;
	private readingModeButton: HTMLButtonElement | null = null;
	private outlineButton: HTMLButtonElement | null = null;
	private rubyToggleButton: HTMLButtonElement | null = null;
	private searchButton: HTMLButtonElement | null = null;
	private pinButton: HTMLButtonElement | null = null;
	private outlinePanelEl: HTMLElement | null = null;
	private outlineItems: OutlineItem[] = [];
	private pager: PagedReadingMode | null = null;
	private filePath: string | null = null;
	private returnViewMode: ReadingReturnMode = "sot";
	private pendingState: ReadingViewState | null = null;
	private isReady = false;
	private renderToken = 0;
	private renderTimer: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TategakiV2Plugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TATEGAKI_READING_VIEW_TYPE;
	}

	getDisplayText(): string {
		const file = this.getDisplayFile();
		const title = this.getFrontmatterTitle(file);
		if (title) {
			return `Tategaki 書籍: - ${title} -`;
		}
		return "Tategaki 書籍";
	}

	getState(): Record<string, unknown> {
		return {
			filePath: this.filePath ?? undefined,
			returnViewMode: this.returnViewMode,
		};
	}

	setState(
		state: ReadingViewState,
		_result: ViewStateResult
	): Promise<void> {
		if (state?.filePath) {
			this.filePath = state.filePath;
		} else {
			this.filePath = null;
		}
		if (state?.returnViewMode) {
			// v1.2.0: "preview" は廃止（互換のため "edit" として扱う）
			this.returnViewMode =
				(state.returnViewMode as any) === "preview"
					? "edit"
					: state.returnViewMode;
			this.updateReturnButton();
		}
		if (!this.isReady) {
			this.pendingState = state;
			return Promise.resolve();
		}
		this.scheduleRender();
		return Promise.resolve();
	}

	onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("tategaki-reading-view-container");
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
			container.style.paddingBottom = isPhone
				? "var(--tategaki-reading-bottom-offset, 0px)"
				: "0px";
		};
		updateHeaderInset();
		window.setTimeout(updateHeaderInset, 0);
		this.registerDomEvent(window, "resize", updateHeaderInset);
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
			"tategaki-reading-toolbar-row"
		);

		const toolbarLeft = toolbarRow.createDiv("tategaki-reading-toolbar-left");
		this.toolbarLeftEl = toolbarLeft;

		const toolbarRight = toolbarRow.createDiv("tategaki-reading-toolbar-right");
		this.toolbarRightEl = toolbarRight;

		this.buildToolbar(toolbarLeft, toolbarRight);

		const contentArea = container.createDiv(
			"tategaki-reading-view-area"
		);

		this.rootEl = contentArea.createDiv("tategaki-reading-view-root");

		this.hostEl = this.rootEl.createDiv("tategaki-reading-view-host");

		this.isReady = true;

		if (this.pendingState?.filePath) {
			this.filePath = this.pendingState.filePath;
		}
		if (this.pendingState?.returnViewMode) {
			this.returnViewMode =
				(this.pendingState.returnViewMode as any) === "preview"
					? "edit"
					: this.pendingState.returnViewMode;
		}
		this.pendingState = null;
		this.updateReturnButton();

		if (!this.filePath) {
			window.setTimeout(() => {
					if (!this.filePath) {
						try {
							this.leaf.detach();
						} catch (_) {
							// noop: detach失敗は無視
						}
						return;
					}
				this.registerFileWatchers();
				this.scheduleRender();
			}, 0);
			return Promise.resolve();
		}

		this.registerFileWatchers();
		this.scheduleRender();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.clearRenderTimer();
		this.destroyPager();
		if (this.outlinePanelEl) {
			this.outlinePanelEl.remove();
			this.outlinePanelEl = null;
		}
		this.rootEl = null;
		this.hostEl = null;
		this.toolbarLeftEl = null;
		this.toolbarRightEl = null;
		this.modeBadgeEl = null;
		this.writingModeButton = null;
		this.readingModeButton = null;
		this.outlineButton = null;
		this.rubyToggleButton = null;
		this.searchButton = null;
		this.pinButton = null;
		this.outlineItems = [];
		this.isReady = false;
		this.pendingState = null;
		this.returnViewMode = "sot";
		return Promise.resolve();
	}

	updateSettings(settings: TategakiV2Settings): Promise<void> {
		this.plugin.settings = settings;
		this.updateWritingModeButton();
		this.scheduleRender();
		return Promise.resolve();
	}

	getCurrentFilePath(): string | null {
		return this.filePath;
	}

	getReturnViewMode(): ReadingReturnMode {
		return this.returnViewMode;
	}

	private buildToolbar(
		toolbarLeft: HTMLElement,
		toolbarRight: HTMLElement
	): void {
		toolbarLeft.empty();
		toolbarRight.empty();
		this.applyToolbarLayout(toolbarLeft);

		this.writingModeButton = this.createToolbarButton(
			toolbarLeft,
			"arrow-down-up",
			"書字方向切り替え",
			() => void this.toggleWritingMode()
		);
		this.updateWritingModeButton();
		this.createSeparator(toolbarLeft);

		this.outlineButton = this.createToolbarButton(
			toolbarLeft,
			"list-tree",
			"アウトライン",
			() => this.toggleOutlinePanel()
		);
		this.createSeparator(toolbarLeft);

		this.readingModeButton = this.createToolbarButton(
			toolbarLeft,
			"corner-left-up",
			"戻る",
			() => this.exitReadingView()
		);
		this.setButtonActive(this.readingModeButton, true);
		this.updateReturnButton();

		const modeBadge = toolbarRight.createDiv();
		modeBadge.textContent = "書籍";
		modeBadge.addClass("tategaki-reading-mode-badge");
		this.modeBadgeEl = modeBadge;
	}

	private applyToolbarLayout(toolbarLeft: HTMLElement): void {
		toolbarLeft.addClass("contenteditable-toolbar");

		const isMobile = Platform.isMobile || Platform.isMobileApp;
		if (isMobile) {
			toolbarLeft.addClass("tiptap-toolbar-mobile");
			toolbarLeft.addClass("tategaki-reading-toolbar-left-mobile");
			toolbarLeft.removeClass("tategaki-reading-toolbar-left-desktop");
		} else {
			toolbarLeft.removeClass("tiptap-toolbar-mobile");
			toolbarLeft.removeClass("tategaki-reading-toolbar-left-mobile");
			toolbarLeft.addClass("tategaki-reading-toolbar-left-desktop");
		}
	}

	private createToolbarButton(
		container: HTMLElement,
		icon: string,
		title: string,
		action: () => void
	): HTMLButtonElement {
		const button = container.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
			attr: {
				"aria-label": title,
			},
		}) as HTMLButtonElement;

		setIcon(button, icon);
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			action();
		});
		return button;
	}

	private createDisabledToolbarButton(
		container: HTMLElement,
		icon: string,
		title: string
	): HTMLButtonElement {
		const button = container.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
			attr: {
				"aria-label": title,
				"aria-disabled": "true",
			},
		}) as HTMLButtonElement;
		setIcon(button, icon);
		button.disabled = true;
		button.addClass("is-disabled");
		return button;
	}

	private createSeparator(container: HTMLElement): void {
		container.createDiv(
			"contenteditable-toolbar-separator"
		);
	}

	private setButtonActive(button: HTMLButtonElement | null, active: boolean): void {
		if (!button) return;
		if (active) {
			button.addClass("is-active");
		} else {
			button.removeClass("is-active");
		}
	}

	private updateWritingModeButton(): void {
		if (!this.writingModeButton) {
			return;
		}
		const mode = this.getEffectiveCommonSettings().writingMode;
		const isVertical = mode === "vertical-rl";
		this.writingModeButton.empty();
		const iconEl = this.writingModeButton.createSpan();
		setIcon(iconEl, isVertical ? "arrow-down-up" : "arrow-left-right");
		this.writingModeButton.setAttribute(
			"aria-label",
			isVertical ? "横書きに切り替え" : "縦書きに切り替え"
		);
	}

	private updateReturnButton(): void {
		if (!this.readingModeButton) {
			return;
		}
		const label = this.getReturnViewLabel();
		this.readingModeButton.empty();
		const iconEl = this.readingModeButton.createSpan();
		setIcon(iconEl, "corner-left-up");
		this.readingModeButton.setAttribute(
			"aria-label",
			`${label}へ戻る`
		);
	}

	private async toggleWritingMode(): Promise<void> {
		const current = this.plugin.settings.common.writingMode;
		const next = current === "vertical-rl" ? "horizontal-tb" : "vertical-rl";
		try {
			await this.plugin.updateSettings({
				common: {
					...this.plugin.settings.common,
					writingMode: next,
				},
			});
		} catch (error) {
			console.error("[Tategaki] Failed to toggle writing mode", error);
			new Notice("書字方向の切り替えに失敗しました。", 2500);
		}
	}

	private openSettingsPanel(): void {
		// 書籍モード中に設定モーダルを開くと、DOM/レイアウト変化でページ再計算が走りやすい。
		// 既存の「レイアウト変更時は元のビューへ切替」方針に合わせ、先に戻してから開く。
		const label = this.getReturnViewLabel();
		new Notice(
			`表示設定を開くため、${label}へ切り替えます。`,
			2000
		);
		void this.returnToOriginView().finally(() => {
			const mode = this.returnViewMode === "edit" ? "compat" : "sot";
			const modal = new SettingsPanelModal(
				this.app,
				this.plugin,
				async (newSettings) => {
					await this.plugin.updateSettings(newSettings);
				},
				{ mode }
			);
			modal.open();
		});
	}

	private exitReadingView(): void {
		void this.returnToOriginView();
	}

	private getReturnViewLabel(): string {
		switch (this.returnViewMode) {
			case "sot":
				return "SoT編集ビュー";
			case "edit":
				return "互換モード";
			default:
				return "互換モード";
		}
	}

	private async returnToOriginView(): Promise<void> {
		const file = this.getDisplayFile();
		if (!file) {
			new Notice("対象ファイルが見つかりません。", 2500);
			return;
		}
		if (this.returnViewMode === "sot") {
			await this.plugin.modeManager.openSoTWysiwygViewInLeaf(
				file,
				this.leaf
			);
			return;
		}
		await this.plugin.modeManager.openTipTapViewInLeaf(
			file,
			this.leaf,
			this.returnViewMode
		);
	}

	private toggleOutlinePanel(): void {
		if (!this.rootEl) {
			return;
		}
		if (this.outlinePanelEl) {
			this.outlinePanelEl.remove();
			this.outlinePanelEl = null;
			return;
		}

		const panel = this.rootEl.createDiv(
			"tategaki-reading-outline-panel"
		);
		this.outlinePanelEl = panel;
		this.renderOutline(panel);
	}

	private renderOutline(panel: HTMLElement): void {
		panel.empty();
		const header = panel.createDiv("tategaki-reading-outline-header");
		header.createSpan({ text: "アウトライン" });
		const closeBtn = header.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
			attr: { "aria-label": "閉じる" },
		}) as HTMLButtonElement;
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", (event) => {
			event.preventDefault();
			this.toggleOutlinePanel();
		});

		const list = panel.createDiv("tategaki-reading-outline-list");

		if (this.outlineItems.length === 0) {
			const empty = list.createDiv("tategaki-reading-outline-empty");
			empty.textContent = "見出しがありません";
			return;
		}

		for (const item of this.outlineItems) {
			const row = list.createDiv("tategaki-reading-outline-row");
			row.style.setProperty(
				"--tategaki-reading-outline-indent",
				`${12 + Math.max(0, item.level - 1) * 12}px`,
			);
			row.textContent = item.text;
			row.addEventListener("click", (event) => {
				event.preventDefault();
				this.pager?.scrollToPage(item.pageIndex, true);
			});
		}
	}

	private appendOutlineItemsFromPage(
		page: HTMLElement,
		pageIndex: number
	): void {
		const headings = Array.from(
			page.querySelectorAll<HTMLElement>(
				"h1, h2, h3, h4, h5, h6"
			)
		);
		let added = false;
		for (const heading of headings) {
			const text = heading.textContent?.trim() ?? "";
			if (!text) continue;
			const level = Number(heading.tagName.replace("H", "")) || 1;
			this.outlineItems.push({ level, text, pageIndex });
			added = true;
		}
		if (added && this.outlinePanelEl) {
			this.renderOutline(this.outlinePanelEl);
		}
	}

	private updateOutlineItems(pages: HTMLElement[]): void {
		const items: OutlineItem[] = [];
		pages.forEach((page, pageIndex) => {
			const headings = Array.from(
				page.querySelectorAll<HTMLElement>(
					"h1, h2, h3, h4, h5, h6"
				)
			);
			for (const heading of headings) {
				const text = heading.textContent?.trim() ?? "";
				if (!text) continue;
				const level = Number(heading.tagName.replace("H", "")) || 1;
				items.push({ level, text, pageIndex });
			}
		});
		this.outlineItems = items;
		if (this.outlinePanelEl) {
			this.renderOutline(this.outlinePanelEl);
		}
	}

	private registerFileWatchers(): void {
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.path === this.filePath) {
					this.scheduleRender();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile)) {
					return;
				}
				if (this.filePath && oldPath === this.filePath) {
					this.filePath = file.path;
					void this.leaf.setViewState({
						type: TATEGAKI_READING_VIEW_TYPE,
						state: { filePath: file.path },
						active: false,
					});
					this.scheduleRender();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (!(file instanceof TFile)) {
					return;
				}
					if (this.filePath && file.path === this.filePath) {
						this.filePath = null;
						try {
							this.leaf.detach();
						} catch (_) {
							// noop: detach失敗は無視
						}
					}
				})
			);
	}

	private scheduleRender(): void {
		if (!this.isReady) {
			return;
		}
		this.clearRenderTimer();
		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			void this.render();
		}, 80);
	}

	private clearRenderTimer(): void {
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
	}

	private async render(): Promise<void> {
		const token = ++this.renderToken;
		if (!this.hostEl || !this.filePath) {
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(this.filePath);
		if (!(file instanceof TFile)) {
			this.destroyPager();
			this.hostEl.empty();
			return;
		}

		let content = "";
		try {
			content = await this.app.vault.read(file);
		} catch (error) {
			console.error("[Tategaki] Failed to read reading view file", error);
			return;
		}
		if (token !== this.renderToken) {
			return;
		}

		const settings = this.plugin.settings;
		const effectiveCommon = this.getEffectiveCommonSettings();
		const snapshotHtml = this.buildSnapshotHtml(
			content,
			file.path,
			settings,
			effectiveCommon
		);

		this.destroyPager();
		this.hostEl.empty();
		this.outlineItems = [];
		if (this.outlinePanelEl) {
			this.renderOutline(this.outlinePanelEl);
		}

		// タイトルを取得（フロントマターのtitle、なければファイル名）
		const frontmatterTitle = this.getFrontmatterTitle(file);
		const title = frontmatterTitle ?? file.basename;

		try {
			this.pager = new PagedReadingMode({
				container: this.hostEl,
				contentHtml: snapshotHtml,
				writingMode: effectiveCommon.writingMode,
				settings: effectiveCommon,
				previewSettings: settings.preview,
				title,
				onPageAdded: (page, pageIndex) => {
					this.appendOutlineItemsFromPage(page, pageIndex);
				},
				onRepaginationRequired: () => {
					const label = this.getReturnViewLabel();
					new Notice(
						`レイアウト変更を検出したため、${label}へ切り替えました。`,
						2500
					);
					this.exitReadingView();
				},
				onRendered: ({ pages }) => {
					this.updateOutlineItems(pages);
				},
			});
		} catch (error) {
			console.error("[Tategaki] Failed to start reading view", error);
			this.pager = null;
		}
	}

	private destroyPager(): void {
		if (!this.pager) {
			return;
		}
			try {
				this.pager.destroy();
			} catch (_) {
				// noop: 破棄失敗は無視
			}
			this.pager = null;
			this.outlineItems = [];
			if (this.outlinePanelEl) {
				this.renderOutline(this.outlinePanelEl);
		}
	}

	private buildSnapshotHtml(
		content: string,
		filePath: string,
		settings: TategakiV2Settings,
		common: CommonSettings
	): string {
		const extracted = extractFrontmatterBlock(content);
		const enableRuby = settings.wysiwyg.enableRuby !== false;
		const protectedMarkdown = protectIndentation(extracted.body);
		const normalizedMarkdown = normalizeMarkdownForTipTap(
			protectedMarkdown,
			{
				enableRuby,
				contextFilePath: filePath,
				resolveImageSrc: (src, contextFilePath) =>
					this.resolveImageSrc(src, contextFilePath),
			}
		);

		const doc = this.hostEl?.ownerDocument ?? document;
		const wrapper = doc.createElement("div");
		wrapper.className = "tategaki-reading-view-snapshot";

		const { frontmatter } = this.parseFrontmatter(content);
		if (frontmatter && !settings.preview.hideFrontmatter) {
			const frontmatterEl = this.renderFrontmatter(frontmatter, settings);
			if (frontmatterEl) {
				this.applyFrontmatterWritingMode(
					frontmatterEl,
					common.writingMode
				);
				wrapper.appendChild(frontmatterEl);
			}
		}

		const proseMirror = doc.createElement("div");
		proseMirror.className = "tiptap ProseMirror";
		proseMirror.setAttribute("contenteditable", "false");
		proseMirror.innerHTML = normalizedMarkdown;
		wrapper.appendChild(proseMirror);

		return wrapper.innerHTML;
	}

	private resolveImageSrc(src: string, contextFilePath: string | null): string {
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
	}

	private parseFrontmatter(content: string): {
		frontmatter: FrontmatterData | null;
		contentWithoutFrontmatter: string;
	} {
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

		const frontmatter: FrontmatterData = {};
		const lines = yamlContent.split("\n");

		let currentKey = "";
		let currentArray: string[] = [];
		let isInArray = false;

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine.startsWith("#")) continue;

			if (trimmedLine.startsWith("- ")) {
				if (isInArray) {
					currentArray.push(trimmedLine.slice(2).trim());
				}
				continue;
			}

			if (isInArray && !trimmedLine.startsWith("- ")) {
				if (currentKey === "co_authors") {
					frontmatter.co_authors = currentArray;
				} else if (currentKey === "co_translators") {
					frontmatter.co_translators = currentArray;
				}
				isInArray = false;
				currentArray = [];
			}

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
							isInArray = true;
							currentKey = key;
							currentArray = [];
						} else {
							frontmatter.co_authors = [value];
						}
						break;
					case "co_translators":
						if (!value) {
							isInArray = true;
							currentKey = key;
							currentArray = [];
						} else {
							frontmatter.co_translators = [value];
						}
						break;
				}
			}
		}

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
		const doc = this.hostEl?.ownerDocument ?? document;
		const container = doc.createElement("div");
		container.className = "tategaki-frontmatter";

		let hasContent = false;

		const topAlignedContainer = doc.createElement("div");
		topAlignedContainer.className = "tategaki-frontmatter-top";
		container.appendChild(topAlignedContainer);

		if (data.title && settings.preview.showFrontmatterTitle) {
			const titleEl = doc.createElement("h1");
			titleEl.className = "tategaki-frontmatter-title";
			titleEl.textContent = data.title;
			topAlignedContainer.appendChild(titleEl);
			hasContent = true;
		}

		if (data.subtitle && settings.preview.showFrontmatterSubtitle) {
			const subtitleEl = doc.createElement("h2");
			subtitleEl.className = "tategaki-frontmatter-subtitle";
			subtitleEl.textContent = data.subtitle;
			topAlignedContainer.appendChild(subtitleEl);
			hasContent = true;
		}

		if (
			data.original_title &&
			settings.preview.showFrontmatterOriginalTitle
		) {
			const originalTitleEl = doc.createElement("h2");
			originalTitleEl.className = "tategaki-frontmatter-original-title";
			originalTitleEl.textContent = data.original_title;
			topAlignedContainer.appendChild(originalTitleEl);
			hasContent = true;
		}

		const bottomAlignedContainer = doc.createElement("div");
		bottomAlignedContainer.className = "tategaki-frontmatter-bottom";
		container.appendChild(bottomAlignedContainer);

		if (data.author && settings.preview.showFrontmatterAuthor) {
			const authorEl = doc.createElement("h4");
			authorEl.className = "tategaki-frontmatter-author";
			authorEl.textContent = data.author;
			this.applyFrontmatterInlineEndAlignment(authorEl);
			bottomAlignedContainer.appendChild(authorEl);
			hasContent = true;
		}

		if (data.co_authors && settings.preview.showFrontmatterCoAuthors) {
			for (const coAuthor of data.co_authors) {
				const coAuthorEl = doc.createElement("h4");
				coAuthorEl.className = "tategaki-frontmatter-co-author";
				coAuthorEl.textContent = coAuthor;
				this.applyFrontmatterInlineEndAlignment(coAuthorEl);
				bottomAlignedContainer.appendChild(coAuthorEl);
				hasContent = true;
			}
		}

		if (data.translator && settings.preview.showFrontmatterTranslator) {
			const translatorEl = doc.createElement("h5");
			translatorEl.className = "tategaki-frontmatter-translator";
			translatorEl.textContent = data.translator;
			this.applyFrontmatterInlineEndAlignment(translatorEl);
			bottomAlignedContainer.appendChild(translatorEl);
			hasContent = true;
		}

		if (
			data.co_translators &&
			settings.preview.showFrontmatterCoTranslators
		) {
			for (const coTranslator of data.co_translators) {
				const coTranslatorEl = doc.createElement("h5");
				coTranslatorEl.className = "tategaki-frontmatter-co-translator";
				coTranslatorEl.textContent = coTranslator;
				this.applyFrontmatterInlineEndAlignment(coTranslatorEl);
				bottomAlignedContainer.appendChild(coTranslatorEl);
				hasContent = true;
			}
		}

		return hasContent ? container : null;
	}

	private applyFrontmatterInlineEndAlignment(element: HTMLElement): void {
		element.addClass("tategaki-frontmatter-inline-end");
	}

	private applyFrontmatterWritingMode(
		element: HTMLElement,
		writingMode: string
	): void {
		element.addClass("tategaki-frontmatter-writing-mode");
		element.style.writingMode = writingMode;
	}

	private getDisplayFile(): TFile | null {
		if (!this.filePath) {
			return null;
		}
		const abstract = this.app.vault.getAbstractFileByPath(this.filePath);
		return abstract instanceof TFile ? abstract : null;
	}

	private getFrontmatterTitle(file: TFile | null): string | null {
		if (!file) return null;
		const cache = this.app.metadataCache.getFileCache(file);
		const raw = cache?.frontmatter?.title;
		if (raw === null || raw === undefined) return null;
		const text = String(raw).trim();
		return text.length > 0 ? text : null;
	}

	private getEffectiveCommonSettings(): CommonSettings {
		return typeof (this.plugin as any).getEffectiveCommonSettings ===
			"function"
			? (this.plugin as any).getEffectiveCommonSettings()
			: this.plugin.settings.common;
	}
}
