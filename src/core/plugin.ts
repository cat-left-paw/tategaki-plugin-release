import { resolvePmModeCapabilities, type PmModeCapabilities } from "../wysiwyg/pm-mode/obsidian/capabilities";
import { TATEGAKI_PM_VIEW_TYPE } from "../wysiwyg/pm-mode/obsidian/entry";
import { PmModeView } from "../wysiwyg/pm-mode/obsidian/pm-mode-view";
import { Notice, Platform, Plugin } from "obsidian";
import {
	CommonSettings,
	TategakiV2Settings,
	ThemePreset,
	validateV2Settings,
} from "../types/settings";
import { TategakiV2SettingTab } from "../shared/ui/settings-tab";
import { ModeManager } from "./mode-manager";
import {
	TIPTAP_COMPAT_VIEW_TYPE,
	TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
} from "../wysiwyg/legacy-compat-redirect-view";
import { TATEGAKI_READING_VIEW_TYPE } from "../preview/reading-view";
import {
	SoTWysiwygView,
	TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
} from "../wysiwyg/sot-wysiwyg-view";
import { moveSyncBackupsToTrash } from "../shared/sync-backup";
import { debugWarn, debugError, setDebugLogging } from "../shared/logger";
import { showConfirmModal } from "../shared/ui/confirm-modal";
import { StatusBarOverlapController } from "../shared/ui/status-bar-overlap";
import { t } from "../shared/i18n";
import { registerPmModeDiagnostics } from "../wysiwyg/pm-mode/diagnostics";

type ObsidianSettingApi = {
	open?: () => void;
	openTabById?: (tabId: string) => void;
};

type ViewRegistryLike = {
	viewByType?: Record<string, unknown>;
};

type AppWithViewRegistry = typeof Plugin.prototype.app & {
	viewRegistry?: ViewRegistryLike;
};

function getViewRegistry(app: typeof Plugin.prototype.app): ViewRegistryLike | null {
	return (app as AppWithViewRegistry).viewRegistry ?? null;
}

/**
 * Tategaki Plugin v2.0 - メインプラグインクラス
 */
export default class TategakiV2Plugin extends Plugin {
	settings: TategakiV2Settings;
	public modeManager: ModeManager;
	pmModeCapabilities: PmModeCapabilities = { available: false, unavailableReason: "not-initialized", rangeDisplay: "rect-layer", scrollAnchoring: "degraded" };
	private statusBarOverlap: StatusBarOverlapController | null = null;
	/** 読み込んだ設定の「最後に使ったモード」が互換モード（廃止）だったか。通知の 1 度きりの判定に使う */
	private usedCompatModeBefore = false;

	async onload() {
		this.pmModeCapabilities = resolvePmModeCapabilities(window);
		// 既存のビューが残っている場合は強制クリーンアップ
		try {
			const existingPreviewLeaves = this.app.workspace.getLeavesOfType(
				"tategaki-preview-view",
			);
			const existingWysiwygLeaves = this.app.workspace.getLeavesOfType(
				"tategaki-wysiwyg-view",
			);
			const existingReadingLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_READING_VIEW_TYPE,
			);
			const existingSoTLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
			);

			const existingPmLeaves = this.app.workspace.getLeavesOfType(TATEGAKI_PM_VIEW_TYPE);

			if (
				existingPreviewLeaves.length > 0 ||
				existingWysiwygLeaves.length > 0 ||
				existingReadingLeaves.length > 0 ||
				existingSoTLeaves.length > 0 ||
				existingPmLeaves.length > 0
			) {
				existingPreviewLeaves.forEach((leaf) => leaf.detach());
				existingWysiwygLeaves.forEach((leaf) => leaf.detach());
				existingReadingLeaves.forEach((leaf) => leaf.detach());
				existingSoTLeaves.forEach((leaf) => leaf.detach());
				existingPmLeaves.forEach((leaf) => leaf.detach());

				// レジストリからも削除を試行
				const viewRegistry = getViewRegistry(this.app);
				if (viewRegistry?.viewByType) {
					delete viewRegistry.viewByType[TATEGAKI_PM_VIEW_TYPE];
					delete viewRegistry.viewByType["tategaki-preview-view"];
					delete viewRegistry.viewByType["tategaki-wysiwyg-view"];
					delete viewRegistry.viewByType[TATEGAKI_READING_VIEW_TYPE];
					delete viewRegistry.viewByType[
						TATEGAKI_SOT_WYSIWYG_VIEW_TYPE
					];
				}

				// 少し待つ
				await new Promise((resolve) => window.setTimeout(resolve, 200));
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
		this.modeManager.registerViews();

		// コマンドを追加
		this.addCommands();

		// 開発用: 新執筆モードの計測 M1-5（commandを実行するまで何も動かない）。
		// 製品の bundle には入れない（esbuild の define で __TATEGAKI_DEV__ = false にすると、この if ごと tree shaking で落ちる）。
		// define のない build（試験が直接 bundle する場合）では開発用として扱う。
		if (typeof __TATEGAKI_DEV__ === "undefined" || __TATEGAKI_DEV__) {
			registerPmModeDiagnostics(this);
		}

		// 1.3.5 以前で互換モードを使っていた人に、廃止を 1 度だけ知らせる
		if (this.usedCompatModeBefore) {
			this.noteCompatModeRetired();
		}

		// リボンアイコンを追加
		this.addRibbonIcon("tally-4", t("command.openView"), () => {
			void this.modeManager.openView();
		});

		// ステータスバーが縦書きビューのスクロールバーを隠す件の対処
		this.setupStatusBarOverlap();

		// 初期化完了
	}

	/**
	 * ステータスバーは main window にだけあり、mobile では表示されないので desktop だけで動かす。
	 */
	private setupStatusBarOverlap(): void {
		if (Platform.isMobile) return;
		const workspace = this.app.workspace;
		const controller = new StatusBarOverlapController(
			workspace.containerEl.ownerDocument,
			{
				subscribe: (refresh) => {
					const refs = [
						workspace.on("active-leaf-change", refresh),
						workspace.on("layout-change", refresh),
						workspace.on("css-change", refresh),
					];
					return () => refs.forEach((ref) => workspace.offref(ref));
				},
			},
		);
		this.statusBarOverlap = controller;
		this.register(() => {
			controller.destroy();
			if (this.statusBarOverlap === controller) {
				this.statusBarOverlap = null;
			}
		});
		workspace.onLayoutReady(() => {
			if (this.statusBarOverlap === controller) {
				controller.setMode(this.settings.statusBarOverlap);
			}
		});
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
				"tategaki-preview-view",
			);
			const allWysiwygLeaves = this.app.workspace.getLeavesOfType(
				"tategaki-wysiwyg-view",
			);
			const allRetiredCompatLeaves = [
				...this.app.workspace.getLeavesOfType(TIPTAP_COMPAT_VIEW_TYPE),
				...this.app.workspace.getLeavesOfType(
					TIPTAP_COMPAT_VIEW_TYPE_LEGACY,
				),
			];
			const allReadingLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_READING_VIEW_TYPE,
			);
			const allSoTLeaves = this.app.workspace.getLeavesOfType(
				TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
			);

			const allPmLeaves = this.app.workspace.getLeavesOfType(TATEGAKI_PM_VIEW_TYPE);
			// M4a (D-M4-12): unloading cannot be stopped. Each new writing mode view ends its composition while it is shown and tells what it still holds before its leaf is detached
			// (`modeManager.cleanup()` did it already for the views it knows; a view settles once).
			for (const leaf of allPmLeaves) if (leaf.view instanceof PmModeView) leaf.view.settleBeforeClose();
			allPmLeaves.forEach(leaf => leaf.detach());
			allPreviewLeaves.forEach((leaf) => leaf.detach());
			allWysiwygLeaves.forEach((leaf) => leaf.detach());
			allRetiredCompatLeaves.forEach((leaf) => leaf.detach());
			allReadingLeaves.forEach((leaf) => leaf.detach());
			allSoTLeaves.forEach((leaf) => leaf.detach());

			// ビューレジストリから削除
			const viewRegistry = getViewRegistry(this.app);
			if (viewRegistry?.viewByType) {
				delete viewRegistry.viewByType[TATEGAKI_PM_VIEW_TYPE];
				delete viewRegistry.viewByType["tategaki-preview-view"];
				delete viewRegistry.viewByType["tategaki-wysiwyg-view"];
				delete viewRegistry.viewByType[TIPTAP_COMPAT_VIEW_TYPE];
				delete viewRegistry.viewByType[TIPTAP_COMPAT_VIEW_TYPE_LEGACY];
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
		this.addCommand({
			id: "pm-discard-composition",
			name: t("pm.command.discardComposition"),
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(PmModeView);
				if (!view || view.isClosed()) return false;
				if (!checking) view.requestCompositionRecovery();
				return true;
			},
		});
		// ビューを開くコマンド（右に分割表示）
		this.addCommand({
			id: "open-view",
			name: t("command.openView"),
			callback: async () => {
				await this.modeManager.openView({ openOnRightSide: true });
			},
		});

		this.addCommand({
			id: "sot-list-move-up",
			name: t("command.listMoveUp"),
			callback: () => this.runSoTListOutlinerAction("move-up"),
		});

		this.addCommand({
			id: "sot-list-move-down",
			name: t("command.listMoveDown"),
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

	private runSoTListOutlinerAction(action: "move-up" | "move-down"): void {
		const view = this.getActiveSoTView();
		if (!view) return;
		view.runListOutlinerAction(action);
	}

	async moveSyncBackupsToTrash(): Promise<void> {
		const ok = await showConfirmModal(this.app, {
			title: t("plugin.syncBackupTrash.title"),
			message: t("plugin.syncBackupTrash.message"),
			confirmText: t("plugin.syncBackupTrash.confirm"),
			cancelText: t("common.cancel"),
			confirmIsWarning: true,
		});
		if (!ok) {
			return;
		}
		try {
			const result = await moveSyncBackupsToTrash(this.app);
			if (result === "none") {
				new Notice(t("plugin.notice.syncBackup.none"), 2500);
				return;
			}
			if (result === "system") {
				new Notice(t("plugin.notice.syncBackup.movedSystem"), 3000);
			} else {
				new Notice(t("plugin.notice.syncBackup.movedDotTrash"), 3500);
			}
		} catch (error) {
			debugError(
				"Tategaki: failed to move sync backups to trash",
				error,
			);
			new Notice(t("plugin.notice.syncBackup.moveFailed"), 3500);
		}
	}

	/**
	 * Obsidian のプラグイン設定タブを開く（内部 API 経由）
	 */
	openPluginSettings(): void {
		const setting = (
			this.app as typeof this.app & { setting?: ObsidianSettingApi }
		).setting;
		if (typeof setting?.open === "function") {
			setting.open();
		}
		if (typeof setting?.openTabById === "function") {
			setting.openTabById(this.manifest.id);
		}
	}

	/**
	 * 設定を読み込み
	 */
	async loadSettings() {
		const stored: unknown = (await this.loadData()) ?? {};
		this.settings = validateV2Settings(stored);
		setDebugLogging(!!this.settings.common.debugLogging);
		// 1.4.0 で互換モードを廃止した。validateV2Settings は "compat" を "edit"（執筆・参照モード）にするので、元の値をここで覚える。
		this.usedCompatModeBefore =
			(stored as { lastViewMode?: unknown }).lastViewMode === "compat";
	}

	/**
	 * 互換モードは 1.4.0 で廃止した。使っていた人（最後に使ったモードが互換、または互換の leaf が残っていた）に 1 度だけ知らせ、
	 * 出したことを設定に記録する。
	 */
	noteCompatModeRetired(): void {
		if (this.settings.compatModeRetiredNoticeShown) return;
		this.settings.compatModeRetiredNoticeShown = true;
		new Notice(t("notice.compatMode.retired"), 10000);
		void this.saveSettings();
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
			(Object.prototype.hasOwnProperty.call(
				previewChanges,
				"pageModeEnabled",
			) as boolean);

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
				nextChanges.preview,
			);
		}
		if (nextChanges.common) {
			this.settings.common = Object.assign(
				{},
				currentCommon,
				nextChanges.common,
			);
		}
		await this.saveSettings();
		setDebugLogging(!!this.settings.common.debugLogging);
		this.statusBarOverlap?.setMode(this.settings.statusBarOverlap);

		// モードマネージャーに設定変更を通知
		await this.modeManager.onSettingsChanged(this.settings);
	}

	/**
	 * テーマを保存
	 */
	async saveTheme(theme: ThemePreset): Promise<void> {
		// 既存のテーマIDをチェック
		const existingIndex = this.settings.themes.findIndex(
			(t) => t.id === theme.id,
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
		const tempElement = createDiv();
		tempElement.style.color = `var(${variableName})`;
		activeDocument.body.appendChild(tempElement);

		// 計算済みスタイルからRGB値を取得
		const computedColor = getComputedStyle(tempElement).color;

		// 要素を削除
		activeDocument.body.removeChild(tempElement);

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
		const tempElement = createDiv();
		tempElement.style.fontFamily = `var(${variableName})`;
		activeDocument.body.appendChild(tempElement);

		// 計算済みスタイルからフォント名を取得
		const computedFont = getComputedStyle(tempElement).fontFamily;

		// 要素を削除
		activeDocument.body.removeChild(tempElement);

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
		// Obsidianのエディタコンテナを探す（本体のwindowのdocumentで。popoutにエディタがなくても、1.3.5と同じ本体のエディタで測る）
		const mainDocument = this.app.workspace.containerEl.ownerDocument;
		const editorContainer =
			mainDocument.querySelector(".markdown-source-view") ||
			mainDocument.querySelector(".markdown-preview-view") ||
			mainDocument.body;

		// 一時的なh1要素を作成
		const tempH1 = createEl("h1");
		tempH1.textContent = "Test";
		tempH1.classList.add("tategaki-hidden-probe");

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
			debugError(`テーマが見つかりません: ${themeId}`);
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
				headingMarginAfter:
					theme.settings.headingMarginAfter ??
					this.settings.common.headingMarginAfter,
				headingDividerLevels:
					theme.settings.headingDividerLevels ??
					this.settings.common.headingDividerLevels,
				headingAlign:
					theme.settings.headingAlign ??
					this.settings.common.headingAlign,
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
			debugError("Obsidianベーステーマは削除できません");
			return;
		}

		// テーマを削除
		this.settings.themes = this.settings.themes.filter(
			(t) => t.id !== themeId,
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
		description?: string,
	): Promise<ThemePreset> {
		const safeDescription = description ?? t("theme.userCreatedDescription");
		const themeId = `theme-${Date.now()}`;

		// 実効設定を取得（temporaryOverridesも考慮）
		const effectiveSettings = this.getEffectiveCommonSettings();

		const newTheme: ThemePreset = {
			id: themeId,
			name: name,
			description: safeDescription,
			mode: "custom",
			settings: {
				fontFamily: effectiveSettings.fontFamily,
				fontSize: effectiveSettings.fontSize,
				lineHeight: effectiveSettings.lineHeight,
				letterSpacing: effectiveSettings.letterSpacing,
				rubySize: effectiveSettings.rubySize,
				headingFontFamily: effectiveSettings.headingFontFamily,
				headingMarginAfter: effectiveSettings.headingMarginAfter,
				headingDividerLevels: { ...effectiveSettings.headingDividerLevels },
				headingAlign: effectiveSettings.headingAlign,
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
	getEffectiveCommonSettings(): CommonSettings {
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
			...(overrides.headingMarginAfter !== undefined && {
				headingMarginAfter: overrides.headingMarginAfter,
			}),
			...(overrides.headingDividerLevels !== undefined && {
				headingDividerLevels: overrides.headingDividerLevels,
			}),
			...(overrides.headingAlign !== undefined && {
				headingAlign: overrides.headingAlign,
			}),
		};
	}

	/**
	 * 一時的な上書き設定を更新
	 */
	async updateTemporaryOverride<
		K extends keyof TategakiV2Settings["temporaryOverrides"],
	>(
		key: K,
		value: TategakiV2Settings["temporaryOverrides"][K],
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
