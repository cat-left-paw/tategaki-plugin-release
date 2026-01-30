import { App, Notice, TFile } from "obsidian";
import { TategakiV2Settings, SyncMode } from "../../types/settings";
import {
	ConflictResolutionModal,
	type ConflictData,
	type ConflictResolutionResult,
} from "../../shared/ui/conflict-resolution-modal";
import {
	FileSwitchConfirmationModal,
	type FileSwitchConfirmationResult,
	type FileSwitchData,
} from "../../shared/ui/file-switch-confirmation-modal";
import {
	type MarkdownSyncEditor,
	type SyncState,
} from "../contenteditable/sync-manager";
import {
	areMarkdownContentsEquivalent,
	writeSyncBackupPair,
	type BackupReason,
} from "../../shared/sync-backup";
import { BackupTriggerDetector } from "../../shared/backup-trigger";
import { debugWarn } from "../../shared/logger";

interface BlockSyncManagerOptions {
	app: App;
	editor: MarkdownSyncEditor;
	getSettings: () => TategakiV2Settings;
	onStateChange?: (state: SyncState) => void;
	onBeforeApplyMarkdown?: (
		markdown: string,
		context: { file: TFile; source: "load" | "external" }
	) =>
		| Promise<MarkdownApplyDecision | null>
		| MarkdownApplyDecision
		| null;
}

const SAVE_DEBOUNCE_MS = 500;

export type MarkdownApplyDecision =
	| { action: "apply"; markdown?: string; markDirty?: boolean }
	| { action: "cancel" };

export class BlockContentSyncManager {
	private readonly app: App;
	private readonly editor: MarkdownSyncEditor;
	private readonly getSettings: () => TategakiV2Settings;
	private readonly onStateChange?: (state: SyncState) => void;
	private readonly onBeforeApplyMarkdown?: BlockSyncManagerOptions["onBeforeApplyMarkdown"];

	private currentFile: TFile | null = null;
	private lastSavedMarkdown = "";
	private lastAppliedMarkdown = "";
	private isApplyingExternalUpdate = false;
	private isSaving = false;
	private dirty = false;
	private saveTimer: number | null = null;
	private state: SyncState;
	private isHandlingFileSwitch = false;
	private lastCancelledFileSwitch:
		| { currentFilePath: string; newFilePath: string; at: number }
		| null = null;
	private static readonly FILE_SWITCH_CANCEL_COOLDOWN_MS = 800;

	/** スマートバックアップトリガー検出器 */
	private backupTriggerDetector: BackupTriggerDetector;
	/** 手動同期フラグ（persistChanges内で参照） */
	private isManualSyncInProgress = false;

	constructor(options: BlockSyncManagerOptions) {
		this.app = options.app;
		this.editor = options.editor;
		this.getSettings = options.getSettings;
		this.onStateChange = options.onStateChange;
		this.onBeforeApplyMarkdown = options.onBeforeApplyMarkdown;
		this.backupTriggerDetector = new BackupTriggerDetector();
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

	async initialize(initialFile?: TFile | null): Promise<void> {
		if (initialFile !== undefined) {
			await this.loadFile(initialFile);
		}
	}

	dispose(): void {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.currentFile = null;
		this.lastSavedMarkdown = "";
		this.lastAppliedMarkdown = "";
		this.dirty = false;
		this.isApplyingExternalUpdate = false;
		this.isSaving = false;
		this.isHandlingFileSwitch = false;
	}

	async flush(): Promise<void> {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.dirty) {
			await this.persistChanges({ force: true });
		}
	}

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

	handleEditorUpdate(): void {
		if (this.isApplyingExternalUpdate) return;
		if (!this.currentFile) return;
		if (!this.dirty) {
			const currentMarkdown = this.editor.getMarkdown();
			if (
				areMarkdownContentsEquivalent(
					currentMarkdown,
					this.lastSavedMarkdown
				) ||
				areMarkdownContentsEquivalent(
					currentMarkdown,
					this.lastAppliedMarkdown
				)
			) {
				return;
			}
			this.dirty = true;
			this.updateState({ dirty: true });
		}
		if (this.resolveSyncMode() === "auto") {
			this.scheduleSave();
		}
	}

	async triggerManualSync(): Promise<void> {
		if (!this.currentFile) {
			new Notice("同期するファイルが開かれていません。", 2000);
			return;
		}

		this.isManualSyncInProgress = true;
		try {
			await this.persistChanges({ force: true });
			new Notice("ファイルを保存しました。", 2000);
		} finally {
			this.isManualSyncInProgress = false;
		}
	}

	async loadFile(file: TFile | null, options: { forceReload?: boolean } = {}): Promise<void> {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}

		if (!file) {
			this.currentFile = null;
			this.lastSavedMarkdown = "";
			this.lastAppliedMarkdown = "";
			this.dirty = false;
			this.backupTriggerDetector.reset();
			this.updateState({
				currentFilePath: null,
				dirty: false,
				saving: false,
				lastSavedAt: null,
			});
			return;
		}

		// 初回ロード
		if (!this.currentFile) {
			// 新しいファイルを開くのでトリガー検出器をリセット
			this.backupTriggerDetector.reset();
			const applied = await this.applyMarkdownFromFile(file, "load");
			if (applied) {
				this.currentFile = file;
			}
			return;
		}

		// 同じファイルの場合は再読み込み
		if (this.currentFile.path === file.path || options.forceReload) {
			await this.applyMarkdownFromFile(file, "load");
			return;
		}

		// 異なるファイルへの切り替え
		if (this.isHandlingFileSwitch) {
			return;
		}
		this.isHandlingFileSwitch = true;
		const prevState = this.getState();
		const prevFile = this.currentFile;
		const prevLastSaved = this.lastSavedMarkdown;
		const prevLastApplied = this.lastAppliedMarkdown;
		const prevDirty = this.dirty;
		try {
			const allowSwitch = await this.showFileSwitchConfirmation(
				this.currentFile.path,
				file.path,
				this.dirty
			);
			if (!allowSwitch) {
				return;
			}

			// 異なるファイルへの切り替え時にトリガー検出器をリセット
			this.backupTriggerDetector.reset();
			this.currentFile = file;
			this.dirty = false;
			const applied = await this.applyMarkdownFromFile(file, "load");
			if (!applied) {
				this.currentFile = prevFile;
				this.lastSavedMarkdown = prevLastSaved;
				this.lastAppliedMarkdown = prevLastApplied;
				this.dirty = prevDirty;
				this.updateState(prevState);
				return;
			}
		} finally {
			this.isHandlingFileSwitch = false;
		}
	}

	getState(): SyncState {
		return { ...this.state };
	}

	/**
	 * 外部ソース（Obsidianエディタの未保存バッファ等）を「現在のベースライン」として採用する。
	 *
	 * - dirtyフラグは落とす（ユーザー編集ではないため）
	 * - disk同期は行わない（保存はObsidian側に任せる）
	 * - 次回のvault modifyを競合扱いにしないための安全策
	 */
	adoptExternalBaseline(markdown: string): void {
		this.lastSavedMarkdown = markdown;
		this.lastAppliedMarkdown = this.editor.getMarkdown();
		if (this.dirty) {
			this.dirty = false;
			this.updateState({ dirty: false });
		} else {
			this.updateState({ lastSavedAt: Date.now() });
		}
	}

	/**
	 * 未保存の変更があるかどうかを確認
	 */
	hasUnsavedChanges(): boolean {
		return this.dirty;
	}

	/**
	 * 未保存の変更を保存せずにクリア
	 */
	clearDirtyFlag(): void {
		this.dirty = false;
		this.lastAppliedMarkdown = this.editor.getMarkdown();
		this.updateState({ dirty: false });
	}

	async handleExternalChange(file: TFile): Promise<boolean> {
		if (!this.currentFile || file.path !== this.currentFile.path) {
			return false;
		}
		if (this.isSaving) {
			return false;
		}

		const externalMarkdown = await this.app.vault.read(file);
		if (externalMarkdown === this.lastSavedMarkdown) {
			return false;
		}

		const currentMarkdown = this.editor.getMarkdown();
		const hasUnsavedChanges =
			this.dirty || currentMarkdown !== this.lastAppliedMarkdown;
		if (hasUnsavedChanges && !this.dirty) {
			this.dirty = true;
			this.updateState({ dirty: true });
		}

		if (hasUnsavedChanges) {
			await this.showConflictResolutionDialog(externalMarkdown);
			return true;
		}

		const result = await this.applyMarkdownWithDecision(
			externalMarkdown,
			file,
			"external"
		);
		if (!result.applied) {
			return false;
		}
		this.lastSavedMarkdown = externalMarkdown;
		this.updateState({
			dirty: this.dirty,
			saving: false,
			lastSavedAt: Date.now(),
		});
		return true;
	}

	private resolveSyncMode(settings?: TategakiV2Settings): SyncMode {
		const activeSettings = settings ?? this.getSettings();
		return activeSettings.wysiwyg.syncMode ?? "manual";
	}

	private scheduleSave(): void {
		if (this.saveTimer != null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.persistChanges();
		}, SAVE_DEBOUNCE_MS);
	}

	private async persistChanges(options: { force?: boolean; skipConflictCheck?: boolean } = {}): Promise<void> {
		if (!this.currentFile) return;

		const markdown = this.editor.getMarkdown();
		const hasChanges = markdown !== this.lastAppliedMarkdown;
		if (!options.force && !this.dirty && !hasChanges) {
			return;
		}
		if (!options.force && !hasChanges) {
			this.dirty = false;
			this.updateState({ dirty: false });
			return;
		}

		let diskMarkdownBefore: string;
		try {
			diskMarkdownBefore = await this.app.vault.read(this.currentFile);
		} catch (error) {
			console.error("Tategaki BlockSync: failed to read file before save", error);
			new Notice("保存前の読み取りに失敗しました。", 3000);
			this.updateState({
				lastSyncResult: "error",
				lastSyncMessage: "保存前の読み取りに失敗しました。",
			});
			return;
		}

		if (!options.skipConflictCheck) {
			if (diskMarkdownBefore !== this.lastSavedMarkdown) {
				await this.showConflictResolutionDialog(diskMarkdownBefore);
				return;
			}
		}

		this.isSaving = true;
		this.updateState({
			saving: true,
			lastSyncResult: null,
			lastSyncMessage: null,
		});
		try {
			const enableSyncBackup =
				this.getSettings().wysiwyg.enableSyncBackup ?? true;
			if (enableSyncBackup) {
				// スマートバックアップ: トリガー条件を判定
				const backupReason = this.backupTriggerDetector.detectBackupReason(
					diskMarkdownBefore,
					markdown,
					this.isManualSyncInProgress,
					this.dirty
				);

				if (backupReason) {
					try {
						await writeSyncBackupPair(
							this.app,
							this.currentFile,
							diskMarkdownBefore,
							markdown,
							{ reason: backupReason }
						);
						// バックアップ完了を記録
						if (backupReason === "session-start") {
							this.backupTriggerDetector.markSessionStartBackupDone();
						} else {
							this.backupTriggerDetector.recordBackup();
						}
					} catch (error) {
						console.error("Tategaki BlockSync: failed to write sync backup", error);
						new Notice(
							"バックアップの作成に失敗しました（保存は続行します）。",
							3500
						);
					}
				}
			}

			await this.app.vault.modify(this.currentFile, markdown);

			let readBack: string;
			try {
				readBack = await this.app.vault.read(this.currentFile);
			} catch (error) {
				console.error("Tategaki BlockSync: failed to read back file after save", error);
				new Notice(
					"保存後の読み戻し検証に失敗しました（バックアップ済み）。",
					4000
				);
				this.lastSavedMarkdown = markdown;
				this.lastAppliedMarkdown = markdown;
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
				console.error("Tategaki BlockSync: read-back verification mismatch after save", {
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
					console.error("Tategaki BlockSync: rollback failed", rollbackError);
					new Notice(
						"ロールバックに失敗しました。バックアップから復元してください。",
						6000
					);
				}

				this.lastSavedMarkdown = diskMarkdownBefore;
				this.lastAppliedMarkdown = markdown;
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
			this.lastAppliedMarkdown = markdown;
			this.dirty = false;
			this.updateState({
				saving: false,
				dirty: false,
				lastSavedAt: Date.now(),
				lastSyncResult: "ok",
				lastSyncMessage: null,
			});
		} catch (error) {
			console.error("Tategaki BlockSync: failed to save file", error);
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

	private setEditorMarkdown(markdown: string): void {
		this.isApplyingExternalUpdate = true;
		try {
			this.editor.setMarkdown(markdown);
		} finally {
			this.isApplyingExternalUpdate = false;
		}
	}

	private async applyMarkdownFromFile(
		file: TFile,
		source: "load" | "external"
	): Promise<boolean> {
		try {
			const markdown = await this.app.vault.read(file);
			const result = await this.applyMarkdownWithDecision(
				markdown,
				file,
				source
			);
			if (!result.applied) {
				return false;
			}
			this.lastSavedMarkdown = markdown;
			this.updateState({
				currentFilePath: file.path,
				dirty: this.dirty,
				saving: false,
				lastSavedAt: Date.now(),
				lastSyncResult: null,
				lastSyncMessage: null,
			});
			return true;
		} catch (error) {
			console.error("Tategaki BlockSync: failed to load file", error);
			new Notice("ファイルの読み込みに失敗しました。", 2000);
			return false;
		}
	}

	private async applyMarkdownWithDecision(
		markdown: string,
		file: TFile,
		source: "load" | "external"
	): Promise<{ applied: boolean; markDirty: boolean }> {
		let decision: MarkdownApplyDecision | null = null;
		if (this.onBeforeApplyMarkdown) {
			try {
				decision = await this.onBeforeApplyMarkdown(markdown, {
					file,
					source,
				});
			} catch (error) {
				debugWarn(
					"Tategaki BlockSync: before-apply hook failed",
					error
				);
				decision = null;
			}
		}

		if (decision && decision.action === "cancel") {
			return { applied: false, markDirty: false };
		}

		const applyMarkdown =
			decision?.action === "apply" && decision.markdown != null
				? decision.markdown
				: markdown;
		const markDirty =
			decision?.action === "apply" && decision.markDirty === true;

		this.setEditorMarkdown(applyMarkdown);
		if (markDirty) {
			this.lastAppliedMarkdown = markdown;
			this.dirty = true;
			this.updateState({ dirty: true });
		} else {
			this.lastAppliedMarkdown = this.editor.getMarkdown();
			this.dirty = false;
			this.updateState({ dirty: false });
		}

		return { applied: true, markDirty };
	}

	private async showConflictResolutionDialog(externalMarkdown: string): Promise<void> {
		if (!this.currentFile) return;

		const currentMarkdown = this.editor.getMarkdown();
		const conflictData: ConflictData = {
			currentContent: currentMarkdown,
			externalContent: externalMarkdown,
			filePath: this.currentFile.path,
		};

		return new Promise((resolve) => {
			const modal = new ConflictResolutionModal(
				this.app,
				conflictData,
				async (result: ConflictResolutionResult | null) => {
					if (!result || result.action === "cancel") {
						new Notice("競合解決がキャンセルされました。", 3000);
						resolve();
						return;
					}

					try {
						switch (result.action) {
							case "overwrite":
								await this.persistChanges({ force: true, skipConflictCheck: true });
								new Notice("現在の内容で上書き保存しました。", 3000);
								break;

							case "accept-external":
								this.setEditorMarkdown(externalMarkdown);
								this.lastSavedMarkdown = externalMarkdown;
								this.lastAppliedMarkdown = this.editor.getMarkdown();
								this.dirty = false;
								this.updateState({
									dirty: false,
									saving: false,
									lastSavedAt: Date.now(),
								});
								new Notice("外部変更を取り込みました。", 3000);
								break;

							case "keep-both":
								await this.saveBothVersions(currentMarkdown, externalMarkdown);
								break;
						}
					} catch (error) {
						console.error("Tategaki BlockSync: conflict resolution failed", error);
						new Notice("競合解決処理でエラーが発生しました。", 4000);
					}

					resolve();
				}
			);
			modal.open();
		});
	}

	private async saveBothVersions(currentMarkdown: string, externalMarkdown: string): Promise<void> {
		if (!this.currentFile) {
			return;
		}

		const directoryPath = this.currentFile.parent?.path ?? "";
		const baseName = this.currentFile.basename;
		const extension = this.currentFile.extension || "md";
		const timestamp = this.formatTimestamp(new Date());

		let counter = 0;
		let targetPath: string;
		do {
			const suffix = counter === 0 ? "" : `-${counter}`;
			const fileName = `${baseName} (競合コピー ${timestamp}${suffix}).${extension}`;
			targetPath = directoryPath ? `${directoryPath}/${fileName}` : fileName;
			counter += 1;
		} while (this.app.vault.getAbstractFileByPath(targetPath));

		await this.app.vault.create(targetPath, currentMarkdown);

		this.setEditorMarkdown(externalMarkdown);
		this.lastSavedMarkdown = externalMarkdown;
		this.lastAppliedMarkdown = this.editor.getMarkdown();
		this.dirty = false;
		this.updateState({
			dirty: false,
			saving: false,
			lastSavedAt: Date.now(),
		});

		const copyName = this.extractFileName(targetPath);
		new Notice(`現在の内容を「${copyName}」として保存し、外部変更を反映しました。`, 4000);
	}

	private formatTimestamp(date: Date): string {
		const yyyy = date.getFullYear();
		const mm = String(date.getMonth() + 1).padStart(2, "0");
		const dd = String(date.getDate()).padStart(2, "0");
		const hh = String(date.getHours()).padStart(2, "0");
		const min = String(date.getMinutes()).padStart(2, "0");
		const ss = String(date.getSeconds()).padStart(2, "0");
		return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
	}

	private extractFileName(path: string): string {
		const parts = path.split("/");
		return parts[parts.length - 1] ?? path;
	}

	private async showFileSwitchConfirmation(
		currentFilePath: string,
		newFilePath: string,
		hasUnsavedChanges: boolean
	): Promise<boolean> {
		if (!hasUnsavedChanges) {
			return true;
		}
		const lastCancelled = this.lastCancelledFileSwitch;
		if (
			lastCancelled &&
			lastCancelled.currentFilePath === currentFilePath &&
			lastCancelled.newFilePath === newFilePath &&
			Date.now() - lastCancelled.at <
				BlockContentSyncManager.FILE_SWITCH_CANCEL_COOLDOWN_MS
		) {
			return false;
		}
		const fileSwitchData: FileSwitchData = {
			currentFilePath,
			newFilePath,
			hasUnsavedChanges,
		};

		return new Promise((resolve) => {
			const modal = new FileSwitchConfirmationModal(
				this.app,
				fileSwitchData,
				(result: FileSwitchConfirmationResult | null) => {
					if (!result || result.action === "cancel") {
						this.lastCancelledFileSwitch = {
							currentFilePath,
							newFilePath,
							at: Date.now(),
						};
						resolve(false);
						return;
					}
					this.lastCancelledFileSwitch = null;
					this.executeFileSwitchAction(result.action)
						.then(() => resolve(true))
						.catch((error) => {
							console.error(
								"Tategaki BlockSync: file switch action failed",
								error
							);
							new Notice(
								"ファイル切り替え処理でエラーが発生しました。",
								3000
							);
							resolve(false);
						});
				}
			);
			modal.open();
		});
	}

	private async executeFileSwitchAction(action: "save-and-switch" | "discard-and-switch"): Promise<void> {
		switch (action) {
			case "save-and-switch":
				await this.persistChanges({ force: true });
				new Notice("変更を保存してファイルを切り替えました。", 2000);
				break;
			case "discard-and-switch":
				this.dirty = false;
				this.updateState({ dirty: false });
				new Notice("変更を破棄してファイルを切り替えました。", 2000);
				break;
		}
	}

	private updateState(partial: Partial<SyncState>): void {
		this.state = {
			...this.state,
			...partial,
		};
		this.onStateChange?.(this.getState());
	}
}
