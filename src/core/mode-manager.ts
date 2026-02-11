import { App, WorkspaceLeaf, EventRef, TFile, Notice } from "obsidian";
import type { TategakiV2Settings } from "../types/settings";
import {
	TipTapCompatView,
	TIPTAP_COMPAT_VIEW_TYPE,
	TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
	type TategakiViewMode,
} from "../wysiwyg/tiptap-compat-view";
import {
	TategakiReadingView,
	TATEGAKI_READING_VIEW_TYPE,
} from "../preview/reading-view";
import {
	SoTWysiwygView,
	TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
} from "../wysiwyg/sot-wysiwyg-view";
import TategakiV2Plugin from "./plugin";
import {
	ViewModeSelectionModal,
	type ViewModeSelectionType,
} from "../shared/ui/view-mode-selection-modal";
import { ViewAlreadyOpenModal } from "../shared/ui/view-already-open-modal";
import { debugWarn } from "../shared/logger";

type ReadingReturnMode = TategakiViewMode | "sot";

/**
 * Tiptap ビューの管理クラス
 */
export class ModeManager {
	private readonly app: App;
	private settings: TategakiV2Settings;
	private readonly plugin: TategakiV2Plugin;
	private openInNewWindow = false;
	private openOnRightSide = true; // デフォルトで右側に開く
	private readonly managedLeaves = new Set<WorkspaceLeaf>();
	private readonly workspaceGuards: EventRef[] = [];
	private primaryLeaf: WorkspaceLeaf | null = null;
	private enforceTimer: ReturnType<typeof setTimeout> | null = null;
	private static readonly INITIAL_FILE_PROP = "__tategakiInitialFile";
	private static readonly INITIAL_VIEW_MODE_PROP = "__tategakiInitialViewMode";
	private nextViewMode: ViewModeSelectionType | null = null;

	constructor(app: App, settings: TategakiV2Settings, plugin: TategakiV2Plugin) {
		this.app = app;
		this.settings = settings;
		this.plugin = plugin;
	}

	/**
	 * ビューを登録
	 */
	async registerViews(): Promise<void> {
		// 既に登録されているかチェック
		try {
			const existingTipTapLeaves = [
				...this.app.workspace.getLeavesOfType(
					TIPTAP_COMPAT_VIEW_TYPE,
				),
				...this.app.workspace.getLeavesOfType(
					TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
				),
			];

			// 既存のビューがある場合は強制的に閉じる
			if (existingTipTapLeaves.length > 0) {
				// 破棄前に可能なら同期を試みる（旧インスタンスが残っている場合の安全策）
				for (const leaf of existingTipTapLeaves) {
					const view = leaf.view as any;
					try {
						if (view?.syncManager?.getState?.()?.dirty) {
							await view.syncManager.flush?.();
						} else if (typeof view?.handleAppQuit === "function") {
							await view.handleAppQuit("save");
						}
					} catch (error) {
						debugWarn("Tategaki: failed to flush view before detach", error);
					}
				}

				existingTipTapLeaves.forEach(leaf => leaf.detach());

				// 少し待ってからビューを登録
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		} catch (error) {
			debugWarn("Tategaki: Error checking existing views", error);
		}

		// ビューが既に登録されているかチェック
		const viewRegistry = (this.app as any).viewRegistry;
		if (!viewRegistry?.viewByType?.[TIPTAP_COMPAT_VIEW_TYPE]) {
			this.plugin.registerView(TIPTAP_COMPAT_VIEW_TYPE, (leaf) =>
				new TipTapCompatView(
					leaf,
					this.plugin,
					TIPTAP_COMPAT_VIEW_TYPE,
				),
			);
		}
		if (!viewRegistry?.viewByType?.[TIPTAP_COMPAT_VIEW_TYPE_LEGACY]) {
			this.plugin.registerView(TIPTAP_COMPAT_VIEW_TYPE_LEGACY, (leaf) =>
				new TipTapCompatView(
					leaf,
					this.plugin,
					TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
				),
			);
		}
		if (!viewRegistry?.viewByType?.[TATEGAKI_READING_VIEW_TYPE]) {
			this.plugin.registerView(
				TATEGAKI_READING_VIEW_TYPE,
				(leaf) => new TategakiReadingView(leaf, this.plugin)
			);
		}
		if (!viewRegistry?.viewByType?.[TATEGAKI_SOT_WYSIWYG_VIEW_TYPE]) {
			this.plugin.registerView(
				TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
				(leaf) => new SoTWysiwygView(leaf, this.plugin)
			);
		}

		this.setupWorkspaceGuards();
		this.applySingleViewConstraints();
	}

	/**
	 * ビューを開く
	 */
	async openView(options?: { openInNewWindow?: boolean; openOnRightSide?: boolean }): Promise<void> {
		// 既にビューが開かれているかチェック
		const editorLeaves = this.getAllEditorLeaves();
		const readingLeaves = this.getAllReadingLeaves();
		if (editorLeaves.length > 0 || readingLeaves.length > 0) {
			const modal = new ViewAlreadyOpenModal(this.app);
			modal.open();
			return;
		}

		// 保存された配置設定から初期値を計算
		const storedPlacement = this.settings.lastViewOpenPlacement ?? "right";

		if (this.settings.showModeDialog) {
			const modal = new ViewModeSelectionModal(this.app, {
				defaultMode: this.settings.lastViewMode ?? "edit",
				placement: storedPlacement,
				showCompat: this.settings.enableLegacyTiptap ?? true,
			});
			const result = await modal.openAndWait();
			if (!result.mode) {
				return;
			}
			this.openInNewWindow = result.openInNewWindow;
			this.openOnRightSide = result.openOnRightSide;
			this.nextViewMode = result.mode;

			// 配置設定を保存（resultから直接取得）
			// 書籍モード以外の場合のみモード設定を保存、配置は常に保存
			if (result.mode !== "reading") {
				await this.plugin.updateSettings({
					lastViewMode: result.mode,
					lastViewOpenPlacement: result.placement,
				});
			} else {
				await this.plugin.updateSettings({
					lastViewOpenPlacement: result.placement,
				});
			}
		} else {
			this.openInNewWindow = storedPlacement === "window";
			this.openOnRightSide = storedPlacement === "right";
			const last =
				this.settings.lastViewMode === "preview"
					? "edit"
					: this.settings.lastViewMode ?? "edit";
			this.nextViewMode =
				last === "compat" && !this.settings.enableLegacyTiptap
					? "edit"
					: last;
		}

		try {
			// 書籍モードの場合は toggleReadingView を呼び出す
			if (this.nextViewMode === "reading") {
				const file = this.app.workspace.getActiveFile();
				if (file) {
					await this.toggleReadingView(file, {
						openInNewWindow: this.openInNewWindow,
						openOnRightSide: this.openOnRightSide,
					});
				}
			} else if (this.nextViewMode === "compat") {
				if (!this.settings.enableLegacyTiptap) {
					new Notice("互換モードが無効です。設定で有効化してください。", 2500);
					return;
				}
				await this.openTipTapView();
			} else {
				const file = this.resolveRetainedFile();
				if (!file) {
					return;
				}
				await this.openSoTWysiwygView(file, {
					openInNewWindow: this.openInNewWindow,
					openOnRightSide: this.openOnRightSide,
				});
			}
		} finally {
			this.nextViewMode = null;
		}
	}

	/**
	 * 設定変更時の処理
	 */
	async onSettingsChanged(settings: TategakiV2Settings): Promise<void> {
		this.settings = settings;
		const leaves = this.getAllEditorLeaves();
		for (const leaf of leaves) {
			const view = leaf.view as unknown as { updateSettings?: (s: TategakiV2Settings) => Promise<void> };
			await view.updateSettings?.(settings);
		}
		const readingLeaves = this.getAllReadingLeaves();
		for (const leaf of readingLeaves) {
			const view = leaf.view as unknown as { updateSettings?: (s: TategakiV2Settings) => Promise<void> };
			await view.updateSettings?.(settings);
		}
	}

	/**
	 * クリーンアップ
	 */
	cleanup(): void {
		for (const leaf of this.managedLeaves) {
			try {
				if ((leaf as any).__tategakiManaged) {
					void leaf.detach();
					delete (leaf as any).__tategakiManaged;
				}
			} catch (error) {
				debugWarn("Tategaki: failed to detach managed leaf", error);
			}
		}
		this.managedLeaves.clear();
		this.primaryLeaf = null;
		this.openInNewWindow = false;
		this.clearEnforcementTimer();
		this.disposeWorkspaceGuards();
		
		// ビューの登録を解除
		this.unregisterViews();
	}

	private unregisterViews(): void {
		try {
			// すべてのTategakiビューを閉じる
			const editorLeaves = this.getAllEditorLeaves();
			editorLeaves.forEach(leaf => leaf.detach());
			const readingLeaves = this.getAllReadingLeaves();
			readingLeaves.forEach(leaf => leaf.detach());
		} catch (error) {
			debugWarn("Tategaki: failed to close views", error);
		}
	}

	async toggleReadingView(
		file: TFile | null,
		options?: {
			openInNewWindow?: boolean;
			openOnRightSide?: boolean;
			targetLeaf?: WorkspaceLeaf | null;
			returnViewMode?: ReadingReturnMode;
		}
	): Promise<boolean> {
		if (!file) {
			return false;
		}

		// 既に執筆・参照モードのビューが開かれているかチェック
		const editorLeaves = this.getAllEditorLeaves();
		if (editorLeaves.length > 0 && !options?.targetLeaf) {
			const modal = new ViewAlreadyOpenModal(this.app);
			modal.open();
			return false;
		}

		const targetLeaf = options?.targetLeaf ?? null;
		if (targetLeaf) {
			const currentType = targetLeaf.view?.getViewType?.();
			if (currentType === TATEGAKI_READING_VIEW_TYPE) {
				const returnMode = options?.returnViewMode ?? "sot";
				if (returnMode === "sot") {
					await this.openSoTWysiwygViewInLeaf(file, targetLeaf);
				} else {
					await this.openTipTapViewInLeaf(file, targetLeaf, returnMode);
				}
				return false;
			}
			await this.openReadingViewInLeaf(
				file,
				targetLeaf,
				options?.returnViewMode ?? "sot"
			);
			return true;
		}

		const existing = this.findReadingLeafForFile(file.path);
		if (existing) {
			try {
				existing.detach();
			} catch (error) {
				debugWarn("Tategaki: failed to close reading view", error);
			}
			return false;
		}
		await this.openReadingView(file, options);
		return true;
	}

	isReadingViewOpenForFile(filePath: string | null): boolean {
		if (!filePath) {
			return false;
		}
		return Boolean(this.findReadingLeafForFile(filePath));
	}

	async openReadingViewInLeaf(
		file: TFile,
		leaf: WorkspaceLeaf,
		returnViewMode: ReadingReturnMode = "sot"
	): Promise<void> {
		await leaf.setViewState({
			type: TATEGAKI_READING_VIEW_TYPE,
			state: { filePath: file.path, returnViewMode },
			active: true,
		});
		this.app.workspace.setActiveLeaf(leaf);
	}

	async openTipTapViewInLeaf(
		file: TFile,
		leaf: WorkspaceLeaf,
		viewMode: TategakiViewMode = "edit"
	): Promise<void> {
		this.prepareLeafInitialFile(leaf, file);
		this.prepareLeafInitialViewMode(leaf, viewMode);
		await leaf.setViewState({
			type: TIPTAP_COMPAT_VIEW_TYPE,
			active: true,
		});
		this.app.workspace.setActiveLeaf(leaf);
		this.trackManagedLeaf(leaf);
	}

	async openSoTWysiwygViewInLeaf(
		file: TFile,
		leaf: WorkspaceLeaf
	): Promise<void> {
		this.prepareLeafInitialFile(leaf, file);
		await leaf.setViewState({
			type: TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
			active: true,
		});
		this.app.workspace.setActiveLeaf(leaf);
		this.trackManagedLeaf(leaf);
		this.applySingleViewConstraints();
	}

	async openSoTWysiwygView(
		file: TFile,
		options?: { openInNewWindow?: boolean; openOnRightSide?: boolean }
	): Promise<void> {
		this.openInNewWindow = options?.openInNewWindow ?? false;
		this.openOnRightSide = options?.openOnRightSide ?? true;

		if (this.openInNewWindow) {
			await this.openInPopout(
				TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
				file,
				"edit"
			);
		} else {
			await this.openInPane(TATEGAKI_SOT_WYSIWYG_VIEW_TYPE, file, "edit");
		}

		this.openInNewWindow = false;
		this.openOnRightSide = true;
		this.applySingleViewConstraints();
	}

	private async openReadingView(
		file: TFile,
		options?: {
			openInNewWindow?: boolean;
			openOnRightSide?: boolean;
			returnViewMode?: ReadingReturnMode;
		}
	): Promise<void> {
		const openInNewWindow = options?.openInNewWindow ?? false;
		const openOnRightSide = options?.openOnRightSide ?? true;

		let leaf: WorkspaceLeaf;
		if (openInNewWindow) {
			leaf = this.app.workspace.getLeaf("window");
		} else if (openOnRightSide) {
			const activeLeaf = this.app.workspace.getLeaf(false);
			leaf = this.app.workspace.createLeafBySplit(
				activeLeaf,
				"vertical",
				false
			);
		} else {
			leaf = this.app.workspace.getLeaf("tab");
		}
		await this.openReadingViewInLeaf(
			file,
			leaf,
			options?.returnViewMode ?? "sot"
		);
	}

	private async openTipTapView(): Promise<void> {
		const retainedFile = this.resolveRetainedFile();
		// nextViewMode が "reading" の場合はここには来ないはず
		const viewMode: TategakiViewMode = "edit";

		const wantsPopout = this.openInNewWindow || this.isPopoutLeaf(this.primaryLeaf);

		let targetLeaf: WorkspaceLeaf | null = null;
		if (this.isLeafAvailable(this.primaryLeaf)) {
			const isPrimaryPopout = this.isPopoutLeaf(this.primaryLeaf);
			if (wantsPopout === isPrimaryPopout) {
				targetLeaf = this.primaryLeaf;
			}
		}

		if (!targetLeaf) {
			targetLeaf = wantsPopout
				? await this.openInPopout(
						TIPTAP_COMPAT_VIEW_TYPE,
						retainedFile,
						viewMode
					)
				: await this.openInPane(
						TIPTAP_COMPAT_VIEW_TYPE,
						retainedFile,
						viewMode
					);
		} else {
			this.prepareLeafInitialFile(targetLeaf, retainedFile);
			this.prepareLeafInitialViewMode(targetLeaf, viewMode);
			await targetLeaf.setViewState({
				type: TIPTAP_COMPAT_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.setActiveLeaf(targetLeaf);
			this.trackManagedLeaf(targetLeaf);
		}

		this.openInNewWindow = false;
		this.openOnRightSide = true; // リセット
		this.applySingleViewConstraints();
	}

	private openInPane(viewType: string): Promise<WorkspaceLeaf>;
	private openInPane(viewType: string, initialFile: TFile | null): Promise<WorkspaceLeaf>;
	private openInPane(viewType: string, initialFile: TFile | null, viewMode: TategakiViewMode): Promise<WorkspaceLeaf>;
	private async openInPane(
		viewType: string,
		initialFile: TFile | null = null,
		viewMode: TategakiViewMode = "edit"
	): Promise<WorkspaceLeaf> {
		let leaf: WorkspaceLeaf;

		// 右側に開く場合は、アクティブなリーフの右側に分割
		if (this.openOnRightSide) {
			const activeLeaf = this.app.workspace.getLeaf(false);
			leaf = this.app.workspace.createLeafBySplit(activeLeaf, "vertical", false);
		} else {
			leaf = this.getReusableLeaf() ?? this.app.workspace.getLeaf("tab");
		}

		this.prepareLeafInitialFile(leaf, initialFile);
		this.prepareLeafInitialViewMode(leaf, viewMode);
		await leaf.setViewState({ type: viewType, active: true });
		this.app.workspace.setActiveLeaf(leaf);
		(leaf as any).__tategakiPopout = false;
		this.trackManagedLeaf(leaf);
		return leaf;
	}

	private openInPopout(viewType: string): Promise<WorkspaceLeaf>;
	private openInPopout(viewType: string, initialFile: TFile | null): Promise<WorkspaceLeaf>;
	private openInPopout(viewType: string, initialFile: TFile | null, viewMode: TategakiViewMode): Promise<WorkspaceLeaf>;
	private async openInPopout(
		viewType: string,
		initialFile: TFile | null = null,
		viewMode: TategakiViewMode = "edit"
	): Promise<WorkspaceLeaf> {
		try {
			const leaf = this.getReusableLeaf(true) ?? this.app.workspace.getLeaf("window");
			this.prepareLeafInitialFile(leaf, initialFile);
			this.prepareLeafInitialViewMode(leaf, viewMode);
			await leaf.setViewState({ type: viewType, active: true });
			this.app.workspace.setActiveLeaf(leaf);
			(leaf as any).__tategakiPopout = true;
			this.trackManagedLeaf(leaf);
			return leaf;
		} catch (error) {
			debugWarn("Tategaki: popout failed, falling back to pane", error);
			return await this.openInPane(viewType, initialFile, viewMode);
		}
	}

	private trackManagedLeaf(leaf: WorkspaceLeaf): void {
		if (!(leaf as any).__tategakiManaged) {
			(leaf as any).__tategakiManaged = true;
		}
		this.managedLeaves.add(leaf);
		this.primaryLeaf = leaf;
	}

	private resolveRetainedFile(): TFile | null {
		const path = this.getCurrentManagedFilePath();
		if (path) {
			const abstract = this.app.vault.getAbstractFileByPath(path);
			if (abstract instanceof TFile) {
				return abstract;
			}
		}

		// MarkdownView など getCurrentFilePath を持たないビューから起動した場合のフォールバック
		return this.app.workspace.getActiveFile() ?? null;
	}

	private getCurrentManagedFilePath(): string | null {
		const recentLeaf = this.getMostRecentLeaf();
		const activePath = this.extractFilePathFromLeaf(recentLeaf);
		if (activePath) {
			return activePath;
		}
		if (this.primaryLeaf && this.primaryLeaf !== recentLeaf) {
			const primaryPath = this.extractFilePathFromLeaf(this.primaryLeaf);
			if (primaryPath) {
				return primaryPath;
			}
		}
		return null;
	}

	private extractFilePathFromLeaf(leaf: WorkspaceLeaf | null): string | null {
		if (!leaf) return null;
		const view = leaf.view as any;
		if (view && typeof view.getCurrentFilePath === "function") {
			try {
				const path = view.getCurrentFilePath();
				return typeof path === "string" ? path : null;
			} catch (error) {
				debugWarn("Tategaki: failed to read current file path from view", error);
			}
		}
		return null;
	}

	private findReadingLeafForFile(filePath: string): WorkspaceLeaf | null {
		const leaves = this.getAllReadingLeaves();
		for (const leaf of leaves) {
			const view = leaf.view as unknown as {
				getCurrentFilePath?: () => string | null;
			};
			const path = view.getCurrentFilePath?.() ?? null;
			if (path === filePath) {
				return leaf;
			}
		}
		return null;
	}

	private prepareLeafInitialFile(leaf: WorkspaceLeaf | null, file: TFile | null): void {
		if (!leaf) return;
		if (file) {
			(leaf as any)[ModeManager.INITIAL_FILE_PROP] = file;
		} else {
			delete (leaf as any)[ModeManager.INITIAL_FILE_PROP];
		}
	}

	private prepareLeafInitialViewMode(
		leaf: WorkspaceLeaf | null,
		mode: TategakiViewMode | null
	): void {
		if (!leaf) return;
		if (mode === "edit") {
			(leaf as any)[ModeManager.INITIAL_VIEW_MODE_PROP] = mode;
		} else {
			delete (leaf as any)[ModeManager.INITIAL_VIEW_MODE_PROP];
		}
	}

	private getAllEditorLeaves(): WorkspaceLeaf[] {
		return [
			...this.app.workspace.getLeavesOfType(TIPTAP_COMPAT_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(
				TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
			),
			...this.app.workspace.getLeavesOfType(TATEGAKI_SOT_WYSIWYG_VIEW_TYPE),
		];
	}

	private getAllReadingLeaves(): WorkspaceLeaf[] {
		return this.app.workspace.getLeavesOfType(TATEGAKI_READING_VIEW_TYPE);
	}

	private setupWorkspaceGuards(): void {
		this.disposeWorkspaceGuards();
		const enforce = () => this.scheduleEnforceSingleView();
		this.workspaceGuards.push(this.app.workspace.on("layout-change", enforce));
		this.workspaceGuards.push(
			(this.app.workspace as any).on("leaf-open", enforce) as EventRef
		);
		this.workspaceGuards.push(
			(this.app.workspace as any).on("leaf-detach", enforce) as EventRef
		);
	}

	private disposeWorkspaceGuards(): void {
		while (this.workspaceGuards.length > 0) {
			const ref = this.workspaceGuards.pop();
			if (ref) {
				this.app.workspace.offref(ref);
			}
		}
	}

	private scheduleEnforceSingleView(): void {
		if (this.enforceTimer !== null) {
			return;
		}
		this.enforceTimer = setTimeout(() => {
			this.enforceTimer = null;
			this.applySingleViewConstraints();
		}, 16);
	}

	private clearEnforcementTimer(): void {
		if (this.enforceTimer !== null) {
			clearTimeout(this.enforceTimer);
			this.enforceTimer = null;
		}
	}

	private applySingleViewConstraints(): void {
		const leaves = this.getAllEditorLeaves().filter((leaf) => this.isLeafAvailable(leaf));

		if (leaves.length === 0) {
			this.primaryLeaf = null;
			return;
		}

		const recentLeaf = this.getMostRecentLeaf();

		let keepLeaf: WorkspaceLeaf | null = null;
		if (recentLeaf && leaves.includes(recentLeaf)) {
			keepLeaf = recentLeaf;
		} else if (this.isLeafAvailable(this.primaryLeaf) && this.primaryLeaf) {
			keepLeaf = this.primaryLeaf;
		} else {
			keepLeaf = leaves[0];
		}

		if (!keepLeaf) {
			return;
		}

		this.trackManagedLeaf(keepLeaf);

		for (const leaf of leaves) {
			if (leaf === keepLeaf) continue;
			this.managedLeaves.delete(leaf);
			delete (leaf as any).__tategakiManaged;
			delete (leaf as any).__tategakiPopout;
			try {
				void leaf.detach();
			} catch (error) {
				debugWarn("Tategaki: failed to close extra leaf", error);
			}
		}

		if (this.getMostRecentLeaf() !== keepLeaf) {
			this.app.workspace.setActiveLeaf(keepLeaf);
		}
	}

	private getMostRecentLeaf(): WorkspaceLeaf | null {
		return this.app.workspace.getMostRecentLeaf?.() ?? null;
	}

	private getReusableLeaf(popoutOnly = false): WorkspaceLeaf | null {
		if (this.isLeafAvailable(this.primaryLeaf)) {
			const isPopout = this.isPopoutLeaf(this.primaryLeaf);
			if ((!popoutOnly && !isPopout) || (popoutOnly && isPopout)) {
				return this.primaryLeaf;
			}
		}

		const candidates = this.getAllEditorLeaves();
		for (const leaf of candidates) {
			if (!this.isLeafAvailable(leaf)) continue;
			const isPopout = this.isPopoutLeaf(leaf);
			if (popoutOnly && !isPopout) continue;
			if (!popoutOnly && isPopout) continue;
			return leaf;
		}
		return null;
	}

	private isLeafAvailable(leaf: WorkspaceLeaf | null | undefined): leaf is WorkspaceLeaf {
		if (!leaf) return false;
		const container = (leaf as any)?.containerEl as HTMLElement | undefined;
		return !!container?.isConnected;
	}

	private isPopoutLeaf(leaf: WorkspaceLeaf | null | undefined): boolean {
		return Boolean(leaf && (leaf as any).__tategakiPopout);
	}
}
