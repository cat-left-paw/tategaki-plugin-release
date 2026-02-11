import { Notice, Plugin } from "obsidian";
import * as path from "path";
import {
	AppCloseAction,
	TategakiV2Settings,
	ThemePreset,
	validateV2Settings,
} from "../types/settings";
import { TategakiV2SettingTab } from "../shared/ui/settings-tab";
import { ModeManager } from "./mode-manager";
import {
	TIPTAP_COMPAT_VIEW_TYPE,
	TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
} from "../wysiwyg/tiptap-compat-view";
import { TATEGAKI_READING_VIEW_TYPE } from "../preview/reading-view";
import {
	SoTWysiwygView,
	TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
} from "../wysiwyg/sot-wysiwyg-view";
import { moveSyncBackupsToTrash, SYNC_BACKUP_ROOT } from "../shared/sync-backup";
import { debugWarn, setDebugLogging } from "../shared/logger";
import { showConfirmModal } from "../shared/ui/confirm-modal";

/**
 * Tategaki Plugin v2.0 - メインプラグインクラス
 */
export default class TategakiV2Plugin extends Plugin {
	settings: TategakiV2Settings;
	public modeManager: ModeManager;

	async onload() {
		// 既存のビューが残っている場合は強制クリーンアップ
		try {
			const existingPreviewLeaves = this.app.workspace.getLeavesOfType(
				"tategaki-preview-view"
			);
			const existingWysiwygLeaves = this.app.workspace.getLeavesOfType(
				"tategaki-wysiwyg-view"
			);
			const existingTipTapLeaves = [
				...this.app.workspace.getLeavesOfType(
					TIPTAP_COMPAT_VIEW_TYPE,
				),
				...this.app.workspace.getLeavesOfType(
					TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
				),
			];
			const existingReadingLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_READING_VIEW_TYPE
			);
			const existingSoTLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_SOT_WYSIWYG_VIEW_TYPE
			);

			if (
				existingPreviewLeaves.length > 0 ||
				existingWysiwygLeaves.length > 0 ||
				existingTipTapLeaves.length > 0 ||
				existingReadingLeaves.length > 0 ||
				existingSoTLeaves.length > 0
			) {
				// 旧インスタンスのビューが残っている場合、破棄前に可能なら同期を試みる
				const leavesToClose = [
					...existingPreviewLeaves,
					...existingWysiwygLeaves,
					...existingTipTapLeaves,
					...existingReadingLeaves,
					...existingSoTLeaves,
				];
				for (const leaf of leavesToClose) {
					const view = leaf.view as any;
					try {
						if (typeof view?.handleAppQuit === "function") {
							await view.handleAppQuit("save");
						} else if (view?.syncManager?.getState?.()?.dirty) {
							await view.syncManager.flush?.();
						}
					} catch (flushError) {
						debugWarn(
							"Tategaki: failed to flush view before cleanup",
							flushError
						);
					}
				}

				existingPreviewLeaves.forEach((leaf) => leaf.detach());
				existingWysiwygLeaves.forEach((leaf) => leaf.detach());
				existingTipTapLeaves.forEach((leaf) => leaf.detach());
				existingReadingLeaves.forEach((leaf) => leaf.detach());
				existingSoTLeaves.forEach((leaf) => leaf.detach());

				// レジストリからも削除を試行
				const viewRegistry = (this.app as any).viewRegistry;
				if (viewRegistry?.viewByType) {
					delete viewRegistry.viewByType["tategaki-preview-view"];
					delete viewRegistry.viewByType["tategaki-wysiwyg-view"];
					delete viewRegistry.viewByType[TIPTAP_COMPAT_VIEW_TYPE];
					delete viewRegistry.viewByType[
						TIPTAP_COMPAT_VIEW_TYPE_LEGACY
					];
					delete viewRegistry.viewByType[TATEGAKI_READING_VIEW_TYPE];
					delete viewRegistry.viewByType[TATEGAKI_SOT_WYSIWYG_VIEW_TYPE];
				}

				// 少し待つ
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		} catch (error) {
			debugWarn("Tategaki: Error during pre-load cleanup", error);
		}

		// 設定を読み込み
		await this.loadSettings();

		// モードマネージャーを初期化
		this.modeManager = new ModeManager(this.app, this.settings, this);

		// 設定タブを追加
		this.addSettingTab(new TategakiV2SettingTab(this.app, this));

		// ビューを登録
		await this.modeManager.registerViews();

		// コマンドを追加
		this.addCommands();

		// アプリ終了時の処理を登録
		this.registerQuitHandler();

		// リボンアイコンを追加
		this.addRibbonIcon("tally-4", "縦書きビューを開く", () => {
			void this.modeManager.openView();
		});

		// 初期化完了
	}

	onunload() {
		// モードマネージャーをクリーンアップ
		if (this.modeManager) {
			this.modeManager.cleanup();
		}

		// 追加の強制クリーンアップ
		try {
			// 全てのビューを閉じる
			const allPreviewLeaves = this.app.workspace.getLeavesOfType(
				"tategaki-preview-view"
			);
			const allWysiwygLeaves = this.app.workspace.getLeavesOfType(
				"tategaki-wysiwyg-view"
			);
			const allTipTapCompatLeaves = [
				...this.app.workspace.getLeavesOfType(
					TIPTAP_COMPAT_VIEW_TYPE,
				),
				...this.app.workspace.getLeavesOfType(
					TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
				),
			];
			const allReadingLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_READING_VIEW_TYPE
			);
			const allSoTLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_SOT_WYSIWYG_VIEW_TYPE
			);

			allPreviewLeaves.forEach((leaf) => leaf.detach());
			allWysiwygLeaves.forEach((leaf) => leaf.detach());
			allTipTapCompatLeaves.forEach((leaf) => leaf.detach());
			allReadingLeaves.forEach((leaf) => leaf.detach());
			allSoTLeaves.forEach((leaf) => leaf.detach());

			// ビューレジストリから削除
			const viewRegistry = (this.app as any).viewRegistry;
			if (viewRegistry?.viewByType) {
				delete viewRegistry.viewByType["tategaki-preview-view"];
				delete viewRegistry.viewByType["tategaki-wysiwyg-view"];
				delete viewRegistry.viewByType[TIPTAP_COMPAT_VIEW_TYPE];
				delete viewRegistry.viewByType[
					TIPTAP_COMPAT_VIEW_TYPE_LEGACY
				];
				delete viewRegistry.viewByType[TATEGAKI_READING_VIEW_TYPE];
				delete viewRegistry.viewByType[TATEGAKI_SOT_WYSIWYG_VIEW_TYPE];
			}
		} catch (error) {
			debugWarn("Tategaki: Error during unload cleanup", error);
		}
	}

	/**
	 * コマンドを追加
	 */
	private addCommands(): void {
		// ビューを開くコマンド（右に分割表示）
		this.addCommand({
			id: "open-view",
			name: "縦書きビューを開く",
			callback: async () => {
				await this.modeManager.openView({ openOnRightSide: true });
			},
		});

		this.addCommand({
			id: "sot-list-move-up",
			name: "リスト項目を上へ移動",
			callback: () => this.runSoTListOutlinerAction("move-up"),
		});

		this.addCommand({
			id: "sot-list-move-down",
			name: "リスト項目を下へ移動",
			callback: () => this.runSoTListOutlinerAction("move-down"),
		});

	}

	private getActiveSoTView(): SoTWysiwygView | null {
		const active = this.app.workspace.getActiveViewOfType(SoTWysiwygView);
		if (active) return active;
		const leaves = this.app.workspace.getLeavesOfType(
			TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
		);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof SoTWysiwygView) {
				return view;
			}
		}
		return null;
	}

	private runSoTListOutlinerAction(
		action: "move-up" | "move-down",
	): void {
		const view = this.getActiveSoTView();
		if (!view) return;
		view.runListOutlinerAction(action);
	}

	async moveSyncBackupsToTrash(): Promise<void> {
		const ok = await showConfirmModal(this.app, {
			title: "同期バックアップをゴミ箱へ移動",
			message:
				"同期バックアップをゴミ箱へ移動しますか？\n\n移動すると、バックアップからの復元はできなくなります。",
			confirmText: "移動する",
			cancelText: "キャンセル",
			confirmIsWarning: true,
		});
		if (!ok) {
			return;
		}
		try {
			const result = await moveSyncBackupsToTrash(this.app);
			if (result === "none") {
				new Notice("同期バックアップは見つかりませんでした。", 2500);
				return;
			}
			if (result === "system") {
				new Notice("同期バックアップをゴミ箱へ移動しました。", 3000);
			} else {
				new Notice("同期バックアップを .trash に移動しました。", 3500);
			}
		} catch (error) {
			console.error(
				"Tategaki: failed to move sync backups to trash",
				error
			);
			new Notice("同期バックアップの移動に失敗しました。", 3500);
		}
	}

	async openSyncBackupFolder(): Promise<void> {
		const adapter = this.app.vault.adapter as any;
		const basePath =
			typeof adapter.getBasePath === "function"
				? adapter.getBasePath()
				: null;
		if (!basePath) {
			new Notice(
				"バックアップフォルダを開くにはデスクトップ版が必要です。",
				3000
			);
			return;
		}
		const fullPath = path.join(basePath, SYNC_BACKUP_ROOT);
		const fs = (() => {
			try {
				return (window as any).require?.("fs");
			} catch {
				return null;
			}
		})();
		if (fs?.existsSync && !fs.existsSync(fullPath)) {
			new Notice(
				"同期バックアップフォルダが見つかりませんでした。",
				3000,
			);
			return;
		}
		const shell = (() => {
			try {
				return (window as any).require?.("electron")?.shell;
			} catch {
				return null;
			}
		})();
		if (shell?.openPath) {
			const result = await shell.openPath(fullPath);
			if (!result) return;
			if (
				/(enoent|no such file|not found)/i.test(result)
			) {
				new Notice(
					"同期バックアップフォルダが見つかりませんでした。",
					3000
				);
				return;
			}
		}
		if (shell?.showItemInFolder) {
			shell.showItemInFolder(fullPath);
			return;
		}
		const appAny = this.app as any;
		if (typeof appAny.openWithDefaultApp === "function") {
			try {
				await appAny.openWithDefaultApp(fullPath);
				return;
			} catch {
				// fall through
			}
		}
		new Notice("バックアップフォルダを開けませんでした。", 3000);
	}

	private registerQuitHandler(): void {
		this.registerEvent(
			this.app.workspace.on("quit", (tasks) => {
				const action: AppCloseAction =
					this.settings.wysiwyg.appCloseAction ?? "save";
				const leaves = this.collectSyncLeaves();
				if (action === "save" && this.hasDirtyLeaves(leaves)) {
					tasks.add(async () => {
						await this.handleAppQuit(action, {
							awaitSaves: true,
							leaves,
						});
					});
					return;
				}
				void this.handleAppQuit(action, { awaitSaves: false, leaves });
			})
		);
	}

	private collectSyncLeaves(): any[] {
		return [
			...this.app.workspace.getLeavesOfType(TIPTAP_COMPAT_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(
				TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
			),
		];
	}

	private hasDirtyLeaves(leaves: any[]): boolean {
		for (const leaf of leaves) {
			const view = leaf.view as any;
			const state = view?.syncManager?.getState?.();
			if (state?.dirty) {
				return true;
			}
		}
		return false;
	}

	private async handleAppQuit(
		action: AppCloseAction,
		options: { awaitSaves?: boolean; leaves?: any[] } = {}
	): Promise<void> {
		const awaitSaves = options.awaitSaves !== false;
		const leaves = options.leaves ?? this.collectSyncLeaves();

		for (const leaf of leaves) {
			const view = leaf.view as any;
			if (typeof view?.handleAppQuit === "function") {
				const task = view.handleAppQuit(action);
				if (awaitSaves) {
					await task;
				} else {
					void task;
				}
				continue;
			}
			if (action !== "save") {
				continue;
			}
			if (view?.syncManager) {
				const state = view.syncManager.getState?.();
				if (state?.dirty) {
					const task = view.syncManager.flush();
					if (awaitSaves) {
						await task;
					} else {
						void task;
					}
				}
			}
		}

		// ビューを閉じて次回起動時の自動復元を防ぐ
		for (const leaf of leaves) {
			leaf.detach();
		}
	}

	/**
	 * 設定を読み込み
	 */
	async loadSettings() {
		const stored = (await this.loadData()) ?? {};
		this.settings = validateV2Settings(stored);
		setDebugLogging(!!this.settings.common.debugLogging);
	}

	/**
	 * 設定を保存
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 設定を更新
	 */
	async updateSettings(changes: Partial<TategakiV2Settings>) {
		const nextChanges: Partial<TategakiV2Settings> = { ...changes };
		const commonChanged = nextChanges.common !== undefined;
		const currentPreview = this.settings.preview;
		const currentCommon = this.settings.common;
		const previewChanges = nextChanges.preview;
		const hasExplicitPageModeSetting =
			previewChanges &&
			Object.prototype.hasOwnProperty.call(
				previewChanges,
				"pageModeEnabled"
			);

		if (
			commonChanged &&
			currentPreview.pageModeEnabled &&
			!hasExplicitPageModeSetting
		) {
			nextChanges.preview = {
				...currentPreview,
				...previewChanges,
				pageModeEnabled: false,
			};
		}

		this.settings = Object.assign(this.settings, nextChanges);
		if (nextChanges.preview) {
			this.settings.preview = Object.assign(
				{},
				currentPreview,
				nextChanges.preview
			);
		}
		if (nextChanges.common) {
			this.settings.common = Object.assign(
				{},
				currentCommon,
				nextChanges.common
			);
		}
		await this.saveSettings();
		setDebugLogging(!!this.settings.common.debugLogging);

		// モードマネージャーに設定変更を通知
		await this.modeManager.onSettingsChanged(this.settings);
	}

	/**
	 * テーマを保存
	 */
	async saveTheme(theme: ThemePreset): Promise<void> {
		// 既存のテーマIDをチェック
		const existingIndex = this.settings.themes.findIndex(
			(t) => t.id === theme.id
		);

		if (existingIndex >= 0) {
			// 既存のテーマを更新
			this.settings.themes[existingIndex] = theme;
		} else {
			// 新しいテーマを追加
			this.settings.themes.push(theme);
		}

		await this.saveSettings();
	}

	/**
	 * RGB色を16進数に変換
	 */
	private rgbToHex(rgb: string): string {
		// rgb(r, g, b) または rgba(r, g, b, a) の形式から数値を抽出
		const match = rgb.match(/\d+/g);
		if (!match || match.length < 3) {
			return rgb;
		}

		const r = parseInt(match[0]);
		const g = parseInt(match[1]);
		const b = parseInt(match[2]);

		// 16進数に変換
		const toHex = (n: number) => {
			const hex = n.toString(16);
			return hex.length === 1 ? "0" + hex : hex;
		};

		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	}

	/**
	 * CSS変数から実際の色値を取得（16進数形式に変換）
	 */
	private getCssVariableColor(varName: string): string {
		// CSS変数の形式をチェック
		if (!varName.startsWith("var(")) {
			return varName;
		}

		// var(--variable-name) から --variable-name を抽出
		const variableName = varName.slice(4, -1).trim();

		// 一時的な要素を作成してCSS変数の色を適用
		const tempElement = document.createElement("div");
		tempElement.style.color = `var(${variableName})`;
		document.body.appendChild(tempElement);

		// 計算済みスタイルからRGB値を取得
		const computedColor = getComputedStyle(tempElement).color;

		// 要素を削除
		document.body.removeChild(tempElement);

		// RGB形式を16進数に変換
		if (computedColor && computedColor.startsWith("rgb")) {
			const hex = this.rgbToHex(computedColor);
			return hex || varName;
		}

		return computedColor || varName;
	}

	/**
	 * CSS変数から実際のフォント名を取得
	 */
	private getCssVariableFont(varName: string): string {
		// CSS変数の形式をチェック
		if (!varName.startsWith("var(")) {
			return varName;
		}

		// var(--variable-name) から --variable-name を抽出
		const variableName = varName.slice(4, -1).trim();

		// 一時的な要素を作成してCSS変数のフォントを適用
		const tempElement = document.createElement("div");
		tempElement.style.fontFamily = `var(${variableName})`;
		document.body.appendChild(tempElement);

		// 計算済みスタイルからフォント名を取得
		const computedFont = getComputedStyle(tempElement).fontFamily;

		// 要素を削除
		document.body.removeChild(tempElement);

		return computedFont || varName;
	}

	/**
	 * Obsidianテーマから見出しのスタイル（色・フォント）を取得
	 * 実際のh1要素を作成してcomputedStyleから取得する
	 */
	private getHeadingStyleFromObsidian(): {
		color: string;
		fontFamily: string;
	} {
		// Obsidianのエディタコンテナを探す
		const editorContainer =
			document.querySelector(".markdown-source-view") ||
			document.querySelector(".markdown-preview-view") ||
			document.body;

		// 一時的なh1要素を作成
		const tempH1 = document.createElement("h1");
		tempH1.textContent = "Test";
		tempH1.style.cssText =
			"position: absolute; visibility: hidden; pointer-events: none;";

		// エディタコンテナに追加してObsidianのテーマスタイルを適用
		editorContainer.appendChild(tempH1);

		// computedStyleから色とフォントを取得
		const computedStyle = getComputedStyle(tempH1);
		const color = computedStyle.color;
		const fontFamily = computedStyle.fontFamily;

		// 要素を削除
		editorContainer.removeChild(tempH1);

		// 色をRGBから16進数に変換
		let hexColor = "";
		if (color && color.startsWith("rgb")) {
			hexColor = this.rgbToHex(color) || "";
		} else if (color) {
			hexColor = color;
		}

		return {
			color: hexColor,
			fontFamily: fontFamily || "",
		};
	}

	/**
	 * テーマを読み込んで適用
	 */
	async loadTheme(themeId: string): Promise<void> {
		if (themeId === "obsidian-base") {
			// Obsidianベーステーマに戻す
			this.settings.activeTheme = "obsidian-base";
			// temporaryOverridesをクリア
			this.settings.temporaryOverrides = {};

			// ObsidianのCSS変数から実際の値を取得
			const fontText =
				this.getCssVariableFont("var(--font-text)") || "inherit";
			const textNormal =
				this.getCssVariableColor("var(--text-normal)") || "#2e2e2e";
			const bgPrimary =
				this.getCssVariableColor("var(--background-primary)") ||
				"#ffffff";
			const bgSecondary =
				this.getCssVariableColor("var(--background-secondary)") ||
				"#f5f5f5";
			const textAccent =
				this.getCssVariableColor("var(--text-accent)") || "#1e90ff";

			// Obsidianテーマから見出しのスタイルを取得
			const headingStyle = this.getHeadingStyleFromObsidian();
			// 見出しの色が本文と同じ場合は空文字（本文と同じ扱い）
			const headingColor =
				headingStyle.color === textNormal ? "" : headingStyle.color;
			// 見出しのフォントが本文と同じ場合は空文字（本文と同じ扱い）
			const headingFont =
				headingStyle.fontFamily === fontText
					? ""
					: headingStyle.fontFamily;

			// 取得した値をcommon設定に適用
			await this.updateSettings({
				activeTheme: "obsidian-base",
				common: {
					...this.settings.common,
					fontFamily: fontText,
					fontSize: 16,
					lineHeight: 1.6,
					textColor: textNormal,
					backgroundColor: bgPrimary,
					pageBackgroundColor: bgSecondary,
					accentColor: textAccent,
					headingFontFamily: headingFont,
					headingTextColor: headingColor,
				},
				temporaryOverrides: {},
			});
			return;
		}

		const theme = this.settings.themes.find((t) => t.id === themeId);
		if (!theme) {
			console.error(`テーマが見つかりません: ${themeId}`);
			return;
		}

		// テーマ設定をcommon設定に適用
		// 見出し設定がundefinedの場合は空文字（本文と同じ）を明示的に設定
		await this.updateSettings({
			activeTheme: themeId,
			common: {
				...this.settings.common,
				fontFamily: theme.settings.fontFamily,
				fontSize: theme.settings.fontSize,
				lineHeight: theme.settings.lineHeight,
				letterSpacing:
					theme.settings.letterSpacing ??
					this.settings.common.letterSpacing,
				rubySize:
					theme.settings.rubySize ?? this.settings.common.rubySize,
				headingFontFamily: theme.settings.headingFontFamily ?? "",
				textColor: theme.settings.colors.text,
				backgroundColor: theme.settings.colors.background,
				pageBackgroundColor: theme.settings.colors.pageBackground,
				accentColor: theme.settings.colors.accent,
				headingTextColor: theme.settings.colors?.headingText ?? "",
				headingSpacing: theme.settings.spacing.headingSpacing,
			},
			// temporaryOverridesをクリア
			temporaryOverrides: {},
		});
	}

	/**
	 * テーマ一覧を取得
	 */
	getThemes(): ThemePreset[] {
		return this.settings.themes;
	}

	/**
	 * アクティブなテーマIDを取得
	 */
	getActiveThemeId(): string {
		return this.settings.activeTheme;
	}

	/**
	 * テーマを削除
	 */
	async deleteTheme(themeId: string): Promise<void> {
		// obsidian-baseは削除できない
		if (themeId === "obsidian-base") {
			console.error("Obsidianベーステーマは削除できません");
			return;
		}

		// テーマを削除
		this.settings.themes = this.settings.themes.filter(
			(t) => t.id !== themeId
		);

		// 削除したテーマがアクティブだった場合、obsidian-baseに戻す
		if (this.settings.activeTheme === themeId) {
			await this.loadTheme("obsidian-base");
		} else {
			await this.saveSettings();
		}
	}

	/**
	 * 現在の設定から新しいテーマを作成
	 */
	async createThemeFromCurrentSettings(
		name: string,
		description = "ユーザー作成テーマ"
	): Promise<ThemePreset> {
		const themeId = `theme-${Date.now()}`;

		// 実効設定を取得（temporaryOverridesも考慮）
		const effectiveSettings = this.getEffectiveCommonSettings();

		const newTheme: ThemePreset = {
			id: themeId,
			name: name,
			description: description,
			mode: "custom",
			settings: {
				fontFamily: effectiveSettings.fontFamily,
				fontSize: effectiveSettings.fontSize,
				lineHeight: effectiveSettings.lineHeight,
				letterSpacing: effectiveSettings.letterSpacing,
				rubySize: effectiveSettings.rubySize,
				headingFontFamily: effectiveSettings.headingFontFamily,
				colors: {
					text: effectiveSettings.textColor,
					background: effectiveSettings.backgroundColor,
					pageBackground: effectiveSettings.pageBackgroundColor,
					accent: effectiveSettings.accentColor,
					headingText: effectiveSettings.headingTextColor,
				},
				spacing: {
					paragraphSpacing: 1.5, // デフォルト値
					headingSpacing: effectiveSettings.headingSpacing,
				},
			},
		};

		await this.saveTheme(newTheme);
		await this.loadTheme(themeId);

		return newTheme;
	}

	/**
	 * 実効設定を取得（common設定とtemporaryOverridesをマージ）
	 */
	getEffectiveCommonSettings() {
		const base = this.settings.common;
		const overrides = this.settings.temporaryOverrides;

		return {
			...base,
			...(overrides.fontFamily !== undefined && {
				fontFamily: overrides.fontFamily,
			}),
			...(overrides.fontSize !== undefined && {
				fontSize: overrides.fontSize,
			}),
			...(overrides.lineHeight !== undefined && {
				lineHeight: overrides.lineHeight,
			}),
			...(overrides.letterSpacing !== undefined && {
				letterSpacing: overrides.letterSpacing,
			}),
			...(overrides.textColor !== undefined && {
				textColor: overrides.textColor,
			}),
			...(overrides.backgroundColor !== undefined && {
				backgroundColor: overrides.backgroundColor,
			}),
			...(overrides.pageBackgroundColor !== undefined && {
				pageBackgroundColor: overrides.pageBackgroundColor,
			}),
			...(overrides.accentColor !== undefined && {
				accentColor: overrides.accentColor,
			}),
			...(overrides.rubySize !== undefined && {
				rubySize: overrides.rubySize,
			}),
			...(overrides.headingSpacing !== undefined && {
				headingSpacing: overrides.headingSpacing,
			}),
			...(overrides.rubyVerticalGap !== undefined && {
				rubyVerticalGap: overrides.rubyVerticalGap,
			}),
			...(overrides.rubyHorizontalGap !== undefined && {
				rubyHorizontalGap: overrides.rubyHorizontalGap,
			}),
			...(overrides.headingFontFamily !== undefined && {
				headingFontFamily: overrides.headingFontFamily,
			}),
			...(overrides.headingTextColor !== undefined && {
				headingTextColor: overrides.headingTextColor,
			}),
		};
	}

	/**
	 * 一時的な上書き設定を更新
	 */
	async updateTemporaryOverride<
		K extends keyof TategakiV2Settings["temporaryOverrides"]
	>(
		key: K,
		value: TategakiV2Settings["temporaryOverrides"][K]
	): Promise<void> {
		this.settings.temporaryOverrides[key] = value;
		await this.saveSettings();
		await this.modeManager.onSettingsChanged(this.settings);
	}

	/**
	 * 一時的な上書き設定をクリア
	 */
	async clearTemporaryOverrides(): Promise<void> {
		this.settings.temporaryOverrides = {};
		await this.saveSettings();
		await this.modeManager.onSettingsChanged(this.settings);
	}
	// toggleControlPanelVisibility は削除されました
}
