import { PmModeView } from "../wysiwyg/pm-mode/obsidian/pm-mode-view";
import { TATEGAKI_PM_VIEW_TYPE, canOpenPmMode, resolvePmModePreference } from "../wysiwyg/pm-mode/obsidian/entry";
import { App, WorkspaceLeaf, EventRef, TFile } from "obsidian";
import type { TategakiV2Settings } from "../types/settings";
import {
	LegacyCompatRedirectView,
	TIPTAP_COMPAT_VIEW_TYPE,
	TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
} from "../wysiwyg/legacy-compat-redirect-view";
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

type ReadingReturnMode = "sot";

type SyncStateLike = {
	dirty?: boolean;
};

type SyncManagerLike = {
	getState?: () => SyncStateLike | null | undefined;
	flush?: () => Promise<void> | void;
};

type ManagedLeafView = {
	handleAppQuit?: (action: "save") => Promise<void> | void;
	syncManager?: SyncManagerLike;
	getCurrentFilePath?: () => string | null;
};

type ViewRegistryLike = {
	viewByType?: Record<string, unknown>;
};

type AppWithViewRegistry = App & {
	viewRegistry?: ViewRegistryLike;
};

type WorkspaceWithLeafEvents = App["workspace"] & {
	on: (
		name: "leaf-open" | "leaf-detach",
		callback: () => void,
	) => EventRef;
};

type ManagedLeaf = WorkspaceLeaf & {
	__tategakiManaged?: boolean;
	__tategakiPopout?: boolean;
	containerEl?: HTMLElement;
	[key: string]: unknown;
};

function getManagedLeafView(view: unknown): ManagedLeafView {
	return typeof view === "object" && view !== null
		? (view)
		: {};
}

/**
 * Tategaki のビュー（執筆・参照モード・新執筆モード・書籍モード）の管理クラス
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
	private enforceTimer: number | null = null;
	private static readonly INITIAL_FILE_PROP = "__tategakiInitialFile";
	private nextViewMode: ViewModeSelectionType | null = null;

	constructor(app: App, settings: TategakiV2Settings, plugin: TategakiV2Plugin) {
		this.app = app;
		this.settings = settings;
		this.plugin = plugin;
	}

	private getViewRegistry(): ViewRegistryLike | null {
		return (this.app as AppWithViewRegistry).viewRegistry ?? null;
	}

	private getManagedLeaf(leaf: WorkspaceLeaf): ManagedLeaf {
		return leaf as ManagedLeaf;
	}

	/** M4a: the open views of the new writing mode. */
	private pmViews(): PmModeView[] {
		const views: PmModeView[] = [];
		for (const leaf of this.app.workspace.getLeavesOfType(TATEGAKI_PM_VIEW_TYPE)) if (leaf.view instanceof PmModeView) views.push(leaf.view);
		return views;
	}

	/**
	 * M4a (D-M4-11, a stoppable entry): opening, replacing or closing Tategaki's views would close a new writing mode view (a view is reused, or the single-view constraint closes the
	 * others). While one is composing, committing or holds text (a write that was refused), nothing is done: it tells why in one notice (`PmModeView.requestLeave`).
	 */
	private mayLeavePmViews(): boolean {
		return this.pmViews().every(view => view.requestLeave());
	}

	/** M4a (D-M4-12, a way out that cannot be stopped): every new writing mode view ends its composition while it is shown and tells what it still holds, before its leaf is detached. */
	private settlePmViews(): void {
		for (const view of this.pmViews()) view.settleBeforeClose();
	}

	/**
	 * ビューを登録
	 */
	registerViews(): void {
		// ビューが既に登録されているかチェック
		const viewRegistry = this.getViewRegistry();
		// 互換モード（廃止）の leaf が workspace に残っているときの受け口。執筆・参照モードで開き直す（1.6.0 で消す）。
		for (const retiredType of [
			TIPTAP_COMPAT_VIEW_TYPE,
			TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
		]) {
			if (!viewRegistry?.viewByType?.[retiredType]) {
				this.plugin.registerView(
					retiredType,
					(leaf) =>
						new LegacyCompatRedirectView(leaf, this.plugin, retiredType),
				);
			}
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

		if (!viewRegistry?.viewByType?.[TATEGAKI_PM_VIEW_TYPE]) {
			this.plugin.registerView(TATEGAKI_PM_VIEW_TYPE, leaf => new PmModeView(leaf, this.plugin));
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
				defaultMode: resolvePmModePreference(this.settings.lastViewMode ?? "edit", this.settings.enablePmMode, this.plugin.pmModeCapabilities),
				showPm: canOpenPmMode(this.settings.enablePmMode, this.plugin.pmModeCapabilities),
				placement: storedPlacement,
			});
			const result = await modal.openAndWait();
			if (!result.mode) {
				return;
			}
			this.openInNewWindow = result.openInNewWindow;
			this.openOnRightSide = result.openOnRightSide;
			this.nextViewMode = result.mode;

			// 配置設定とモード設定を保存
			await this.plugin.updateSettings({
				lastViewMode: result.mode,
				lastViewOpenPlacement: result.placement,
			});
		} else {
			this.openInNewWindow = storedPlacement === "window";
			this.openOnRightSide = storedPlacement === "right";
			const last =
				this.settings.lastViewMode === "preview"
					? "edit"
					: this.settings.lastViewMode ?? "edit";
			this.nextViewMode = resolvePmModePreference(last, this.settings.enablePmMode, this.plugin.pmModeCapabilities);
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
			} else if (this.nextViewMode === "pm") {
				const file = this.resolveRetainedFile();
				if (file) await this.openPmModeView(file, { openInNewWindow: this.openInNewWindow, openOnRightSide: this.openOnRightSide });
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
		if (!settings.enablePmMode) {
			// M4a (D-M4-12): turning the setting off cannot be stopped; the views settle first.
			this.settlePmViews();
			for (const leaf of this.app.workspace.getLeavesOfType(TATEGAKI_PM_VIEW_TYPE)) leaf.detach();
		}
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
		// M4a (D-M4-12): the plugin unloads (or is reloaded): the views settle before any leaf is detached.
		this.settlePmViews();
		for (const leaf of this.managedLeaves) {
			try {
				const managedLeaf = this.getManagedLeaf(leaf);
				if (managedLeaf.__tategakiManaged) {
					void leaf.detach();
					delete managedLeaf.__tategakiManaged;
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
		this.settlePmViews();
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
			// M4a (D-M4-11): the target leaf's view is replaced by this entry.
			if (targetLeaf.view instanceof PmModeView && !targetLeaf.view.requestLeave()) return false;
			const currentType = targetLeaf.view?.getViewType?.();
			if (currentType === TATEGAKI_READING_VIEW_TYPE) {
				await this.openSoTWysiwygViewInLeaf(file, targetLeaf);
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
		// M4a (D-M4-11): a new writing mode view in this leaf is replaced by this entry.
		if (leaf.view instanceof PmModeView && !leaf.view.requestLeave()) return;
		await leaf.setViewState({
			type: TATEGAKI_READING_VIEW_TYPE,
			state: { filePath: file.path, returnViewMode },
			active: true,
		});
		this.app.workspace.setActiveLeaf(leaf);
	}

	async openSoTWysiwygViewInLeaf(
		file: TFile,
		leaf: WorkspaceLeaf
	): Promise<void> {
		// M4a (D-M4-11): this entry replaces the leaf's view and closes the other Tategaki views.
		if (!this.mayLeavePmViews()) return;
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
		// M4a (D-M4-11): opening a view reuses a Tategaki leaf or lets the single-view constraint close the others.
		if (!this.mayLeavePmViews()) return;
		this.openInNewWindow = options?.openInNewWindow ?? false;
		this.openOnRightSide = options?.openOnRightSide ?? true;

		if (this.openInNewWindow) {
			await this.openInPopout(TATEGAKI_SOT_WYSIWYG_VIEW_TYPE, file);
		} else {
			await this.openInPane(TATEGAKI_SOT_WYSIWYG_VIEW_TYPE, file);
		}

		this.openInNewWindow = false;
		this.openOnRightSide = true;
		this.applySingleViewConstraints();
	}

	async openPmModeView(file: TFile, options?: { openInNewWindow?: boolean; openOnRightSide?: boolean }): Promise<void> {
		if (!canOpenPmMode(this.settings.enablePmMode, this.plugin.pmModeCapabilities)) {
			await this.openSoTWysiwygView(file, options);
			return;
		}
		// M4a (D-M4-11): opening a view reuses a Tategaki leaf or lets the single-view constraint close the others.
		if (!this.mayLeavePmViews()) return;
		this.openInNewWindow = options?.openInNewWindow ?? false;
		this.openOnRightSide = options?.openOnRightSide ?? true;
		try {
			if (this.openInNewWindow) await this.openInPopout(TATEGAKI_PM_VIEW_TYPE, file);
			else await this.openInPane(TATEGAKI_PM_VIEW_TYPE, file);
		} finally {
			this.openInNewWindow = false;
			this.openOnRightSide = true;
		}
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

	private async openInPane(
		viewType: string,
		initialFile: TFile | null = null
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
		await leaf.setViewState({ type: viewType, active: true });
		this.app.workspace.setActiveLeaf(leaf);
		this.getManagedLeaf(leaf).__tategakiPopout = false;
		this.trackManagedLeaf(leaf);
		return leaf;
	}

	private async openInPopout(
		viewType: string,
		initialFile: TFile | null = null
	): Promise<WorkspaceLeaf> {
		try {
			const leaf = this.getReusableLeaf(true) ?? this.app.workspace.getLeaf("window");
			this.prepareLeafInitialFile(leaf, initialFile);
				await leaf.setViewState({ type: viewType, active: true });
			this.app.workspace.setActiveLeaf(leaf);
			this.getManagedLeaf(leaf).__tategakiPopout = true;
			this.trackManagedLeaf(leaf);
			return leaf;
		} catch (error) {
			debugWarn("Tategaki: popout failed, falling back to pane", error);
			return await this.openInPane(viewType, initialFile);
		}
	}

	private trackManagedLeaf(leaf: WorkspaceLeaf): void {
		const managedLeaf = this.getManagedLeaf(leaf);
		if (!managedLeaf.__tategakiManaged) {
			managedLeaf.__tategakiManaged = true;
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
		const view = getManagedLeafView(leaf.view);
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
		const managedLeaf = this.getManagedLeaf(leaf);
		if (file) {
			managedLeaf[ModeManager.INITIAL_FILE_PROP] = file;
		} else {
			delete managedLeaf[ModeManager.INITIAL_FILE_PROP];
		}
	}

	private getAllEditorLeaves(): WorkspaceLeaf[] {
		return [
			...this.app.workspace.getLeavesOfType(TATEGAKI_SOT_WYSIWYG_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(TATEGAKI_PM_VIEW_TYPE),
		];
	}

	private getAllReadingLeaves(): WorkspaceLeaf[] {
		return this.app.workspace.getLeavesOfType(TATEGAKI_READING_VIEW_TYPE);
	}

	private setupWorkspaceGuards(): void {
		this.disposeWorkspaceGuards();
		const enforce = () => this.scheduleEnforceSingleView();
		this.workspaceGuards.push(this.app.workspace.on("layout-change", enforce));
		const workspaceWithLeafEvents =
			this.app.workspace as WorkspaceWithLeafEvents;
		this.workspaceGuards.push(
			workspaceWithLeafEvents.on("leaf-open", enforce)
		);
		this.workspaceGuards.push(
			workspaceWithLeafEvents.on("leaf-detach", enforce)
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
		this.enforceTimer = window.setTimeout(() => {
			this.enforceTimer = null;
			this.applySingleViewConstraints();
		}, 16);
	}

	private clearEnforcementTimer(): void {
		if (this.enforceTimer !== null) {
			window.clearTimeout(this.enforceTimer);
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

		// 現在アクティブなleafが閉じられる場合のみ keepLeaf へリダイレクトする。
		// ユーザーが別ノートを開いた場合（recentLeaf が Tategaki leaf でない）は
		// フォーカスを奪わない。
		// M4a (D-M4-11): a new writing mode view that is composing or holds text is not closed here (the notice says it once for its state); the constraint comes again with the next
		// event of the workspace, and closes it once it is ready.
		const leavesToClose = leaves.filter(leaf => leaf !== keepLeaf && !(leaf.view instanceof PmModeView && !leaf.view.requestLeave({ repeat: false })));
		const activeLeafIsBeingClosed =
			recentLeaf !== null && leavesToClose.includes(recentLeaf);

		for (const leaf of leavesToClose) {
			this.managedLeaves.delete(leaf);
			const managedLeaf = this.getManagedLeaf(leaf);
			delete managedLeaf.__tategakiManaged;
			delete managedLeaf.__tategakiPopout;
			try {
				void leaf.detach();
			} catch (error) {
				debugWarn("Tategaki: failed to close extra leaf", error);
			}
		}

		if (activeLeafIsBeingClosed) {
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
		const container = this.getManagedLeaf(leaf).containerEl;
		return !!container?.isConnected;
	}

	private isPopoutLeaf(leaf: WorkspaceLeaf | null | undefined): boolean {
		return Boolean(leaf && this.getManagedLeaf(leaf).__tategakiPopout);
	}
}
