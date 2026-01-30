/**
 * Sync Manager for ContentEditable Editor
 * MarkdownファイルとContentEditableエディタの同期を管理
 */

import { App, TFile, Notice } from "obsidian";
import TategakiV2Plugin from "../../core/plugin";
import { TategakiV2Settings } from "../../types/settings";
import {
	areMarkdownContentsEquivalent,
	writeSyncBackupPair,
} from "../../shared/sync-backup";
import { debugWarn } from "../../shared/logger";

export type SyncMode = "auto" | "manual";

export type SyncResult = "ok" | "error";

export interface SyncState {
	mode: SyncMode;
	dirty: boolean;
	saving: boolean;
	lastSavedAt: number | null;
	currentFilePath: string | null;
	lastSyncResult: SyncResult | null;
	lastSyncMessage: string | null;
}


export interface MarkdownSyncEditor {
	setMarkdown(markdown: string): void;
	getMarkdown(): string;
}

export interface SyncManagerOptions {
	app: App;
	plugin: TategakiV2Plugin;
	editor: MarkdownSyncEditor;
	getSettings: () => TategakiV2Settings;
	onStateChange?: (state: SyncState) => void;
}

const SAVE_DEBOUNCE_MS = 2000; // 2秒

/**
 * ContentEditableエディタの同期マネージャー
 */
export class ContentEditableSyncManager {
	private readonly app: App;
	private readonly plugin: TategakiV2Plugin;
	private readonly editor: MarkdownSyncEditor;
	private readonly getSettings: () => TategakiV2Settings;
	private readonly onStateChange?: (state: SyncState) => void;

	private currentFile: TFile | null = null;
	private lastSavedMarkdown = "";
	private isApplyingExternalUpdate = false;
	private isSaving = false;
	private dirty = false;
	private saveTimer: number | null = null;
	private idleSaveHandle: number | null = null;
	private state: SyncState;

	constructor(options: SyncManagerOptions) {
		this.app = options.app;
		this.plugin = options.plugin;
		this.editor = options.editor;
		this.getSettings = options.getSettings;
		this.onStateChange = options.onStateChange;
		this.state = {
			mode: this.resolveSyncMode(),
			dirty: false,
			saving: false,
			lastSavedAt: null,
			currentFilePath: null,
			lastSyncResult: null,
			lastSyncMessage: null,
		};
	}

	/**
	 * 初期化
	 */
	async initialize(): Promise<void> {
		// ファイル変更監視は不要（ContentEditableViewで管理）
		// エディタの更新イベントをリスニング
	}

	/**
	 * クリーンアップ
	 */
	dispose(): void {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.idleSaveHandle != null && window.cancelIdleCallback) {
			window.cancelIdleCallback(this.idleSaveHandle);
			this.idleSaveHandle = null;
		}
		// 次回の初期化のためにファイルをリセット
		this.currentFile = null;
		this.lastSavedMarkdown = "";
		this.dirty = false;
	}

	/**
	 * 保留中の変更を即座に保存
	 */
	async flush(): Promise<void> {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.idleSaveHandle != null && window.cancelIdleCallback) {
			window.cancelIdleCallback(this.idleSaveHandle);
			this.idleSaveHandle = null;
		}
		if (this.dirty) {
			await this.persistChanges({ force: true });
		}
	}

	/**
	 * 設定変更時の処理
	 */
	onSettingsChanged(settings: TategakiV2Settings): void {
		const mode = this.resolveSyncMode(settings);
		this.updateState({ mode });
		if (mode === "manual") {
			if (this.saveTimer != null) {
				window.clearTimeout(this.saveTimer);
				this.saveTimer = null;
			}
		} else if (this.dirty) {
			this.scheduleSave();
		}
	}

	/**
	 * エディタ更新時の処理
	 */
	handleEditorUpdate(): void {
		if (this.isApplyingExternalUpdate) return;
		if (!this.currentFile) return;
		if (!this.dirty) {
			this.dirty = true;
			this.updateState({ dirty: true });
		}
		if (this.resolveSyncMode() === "auto") {
			this.scheduleSave();
		}
	}

	/**
	 * 手動同期をトリガー
	 */
	async triggerManualSync(): Promise<void> {
		if (!this.currentFile) {
			new Notice("同期するファイルが開かれていません。", 2000);
			return;
		}

		await this.persistChanges({ force: true });
		new Notice("ファイルを保存しました。", 2000);
	}

	/**
	 * ファイルを読み込む
	 */
	async loadFile(file: TFile | null, options: { forceReload?: boolean } = {}): Promise<void> {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.idleSaveHandle != null && window.cancelIdleCallback) {
			window.cancelIdleCallback(this.idleSaveHandle);
			this.idleSaveHandle = null;
		}

		if (!file) {
			this.currentFile = null;
			this.lastSavedMarkdown = "";
			this.dirty = false;
			this.updateState({
				currentFilePath: null,
				dirty: false,
				saving: false,
				lastSavedAt: null,
				lastSyncResult: null,
				lastSyncMessage: null,
			});
			return;
		}

		// 初回ロード
		if (!this.currentFile) {
			this.currentFile = file;
			await this.applyMarkdownFromFile(file);
			return;
		}

		// 同一ファイルの再読み込み
		if (this.currentFile.path === file.path || options.forceReload) {
			await this.applyMarkdownFromFile(file);
			return;
		}

		// 異なるファイルは切り替えを拒否
		debugWarn("[Tategaki ContentEditable SyncManager] loadFile: ファイル切り替えをブロック（既にロード済み）", {
			currentFile: this.currentFile.path,
			requestedFile: file.path
		});
	}

	/**
	 * 現在の状態を取得
	 */
	getState(): SyncState {
		return { ...this.state };
	}

	/**
	 * 外部変更を処理
	 */
	async handleExternalChange(file: TFile): Promise<boolean> {
		if (!this.currentFile || file.path !== this.currentFile.path) {
			return false;
		}
		if (this.isSaving) {
			return false;
		}
		if (this.state.lastSavedAt && Date.now() - this.state.lastSavedAt < 500) {
			return false;
		}
		if (this.dirty) {
			// 競合解決はContentEditable版では未対応のため、ユーザー操作を優先
			return false;
		}
		await this.applyMarkdownFromFile(file);
		return true;
	}

	/**
	 * 同期モードを解決
	 */
	private resolveSyncMode(settings?: TategakiV2Settings): SyncMode {
		const activeSettings = settings ?? this.getSettings();
		// ContentEditable版の設定から同期モードを取得
		// デフォルトは"manual"に変更（パフォーマンス改善のため）
		const contentEditableSettings = (activeSettings as any).contenteditable;
		return contentEditableSettings?.syncMode || "manual";
	}

	/**
	 * 保存をスケジュール
	 */
	private scheduleSave(): void {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
		}
		if (this.idleSaveHandle != null && window.cancelIdleCallback) {
			window.cancelIdleCallback(this.idleSaveHandle);
			this.idleSaveHandle = null;
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			if (window.requestIdleCallback) {
				this.idleSaveHandle = window.requestIdleCallback(
					() => {
						this.idleSaveHandle = null;
						void this.persistChanges();
					},
					{ timeout: SAVE_DEBOUNCE_MS }
				);
			} else {
				void this.persistChanges();
			}
		}, SAVE_DEBOUNCE_MS);
	}

	/**
	 * 変更を永続化
	 */
	private async persistChanges(options: { force?: boolean } = {}): Promise<void> {
		if (!this.currentFile) return;

		if (this.idleSaveHandle != null && window.cancelIdleCallback) {
			window.cancelIdleCallback(this.idleSaveHandle);
			this.idleSaveHandle = null;
		}

		const markdown = this.editor.getMarkdown();

		if (!options.force && !this.dirty && markdown === this.lastSavedMarkdown) {
			return;
		}
		if (!options.force && markdown === this.lastSavedMarkdown) {
			this.dirty = false;
			this.updateState({ dirty: false });
			return;
		}

		let diskMarkdownBefore: string;
		try {
			diskMarkdownBefore = await this.app.vault.read(this.currentFile);
		} catch (error) {
			console.error("Failed to read file before save:", error);
			new Notice("保存前の読み取りに失敗しました。", 3000);
			this.updateState({
				lastSyncResult: "error",
				lastSyncMessage: "保存前の読み取りに失敗しました。",
			});
			return;
		}

		const enableSyncBackup =
			this.getSettings().wysiwyg.enableSyncBackup ?? true;
		if (enableSyncBackup) {
			try {
				await writeSyncBackupPair(
					this.app,
					this.currentFile,
					diskMarkdownBefore,
					markdown
				);
			} catch (error) {
				console.error("Failed to write sync backup:", error);
				new Notice(
					"バックアップの作成に失敗しました（保存は続行します）。",
					3500
				);
			}
		}

		this.isSaving = true;
		this.updateState({
			saving: true,
			lastSyncResult: null,
			lastSyncMessage: null,
		});
		try {
			await this.app.vault.modify(this.currentFile, markdown);

			let readBack: string;
			try {
				readBack = await this.app.vault.read(this.currentFile);
			} catch (error) {
				console.error("Failed to read file after save:", error);
				new Notice(
					"保存後の読み戻し検証に失敗しました（バックアップ済み）。",
					4000
				);
				this.lastSavedMarkdown = markdown;
				this.dirty = false;
				this.updateState({
					saving: false,
					dirty: false,
					lastSavedAt: Date.now(),
					lastSyncResult: "error",
					lastSyncMessage: "保存後の読み戻し検証に失敗しました。",
				});
				return;
			}

			if (!areMarkdownContentsEquivalent(markdown, readBack)) {
				console.error("Read-back verification mismatch after save", {
					file: this.currentFile.path,
				});
				new Notice(
					"同期に失敗した可能性があります（読み戻し不一致）。バックアップ済みです。",
					5000
				);

				try {
					await this.app.vault.modify(this.currentFile, diskMarkdownBefore);
					new Notice(
						"安全のため同期前の内容へロールバックしました。",
						4500
					);
				} catch (rollbackError) {
					console.error("Rollback failed:", rollbackError);
					new Notice(
						"ロールバックに失敗しました。バックアップから復元してください。",
						6000
					);
				}

				this.lastSavedMarkdown = diskMarkdownBefore;
				this.dirty = true;
				this.updateState({
					saving: false,
					dirty: true,
					lastSyncResult: "error",
					lastSyncMessage: "読み戻し不一致のためロールバックしました。",
				});
				return;
			}

			this.lastSavedMarkdown = readBack;
			this.dirty = false;
			this.updateState({
				saving: false,
				dirty: false,
				lastSavedAt: Date.now(),
				lastSyncResult: "ok",
				lastSyncMessage: null,
			});
		} catch (error) {
			console.error("Failed to save file:", error);
			new Notice("ファイルの保存に失敗しました。", 3000);
			this.updateState({
				saving: false,
				lastSyncResult: "error",
				lastSyncMessage: "ファイルの保存に失敗しました。",
			});
		} finally {
			this.isSaving = false;
		}
	}

	/**
	 * 状態を更新
	 */
	private updateState(partial: Partial<SyncState>): void {
		this.state = {
			...this.state,
			...partial,
		};
		this.onStateChange?.(this.getState());
	}

	private async applyMarkdownFromFile(file: TFile): Promise<void> {
		try {
			const markdown = await this.app.vault.read(file);
			this.isApplyingExternalUpdate = true;
			this.editor.setMarkdown(markdown);
			this.isApplyingExternalUpdate = false;

			this.currentFile = file;
			this.lastSavedMarkdown = markdown;
			this.dirty = false;
			this.updateState({
				currentFilePath: file.path,
				dirty: false,
				saving: false,
				lastSavedAt: Date.now(),
				lastSyncResult: null,
				lastSyncMessage: null,
			});
		} catch (error) {
			console.error("Failed to load file:", error);
			new Notice("ファイルの読み込みに失敗しました。", 2000);
		}
	}
}
