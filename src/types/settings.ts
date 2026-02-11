/**
 * Tategaki Plugin v2.0 設定型定義
 */

export type WritingMode = "vertical-rl" | "horizontal-tb";
export type EditorMode = "tiptap";
export type SyncMode = "manual" | "auto";
export type ThemeMode = "obsidian-base" | "custom";
export type AppCloseAction = "save" | "discard";
export type ViewModePreference = "edit" | "preview" | "compat";
export type HeaderFooterContent = "none" | "title" | "pageNumber";
export type HeaderFooterAlign = "left" | "center" | "right";
export type PageNumberFormat = "current" | "currentTotal";
export type PageTransitionEffect =
	| "none"
	| "fade"
	| "slide"
	| "blur";

/**
 * ビューを開く場所
 */
export type ViewOpenPlacement = "right" | "tab" | "window";

/**
 * テーマプリセット
 */
export interface ThemePreset {
	id: string;
	name: string;
	description: string;
	mode: ThemeMode; // テーマモード
	settings: {
		fontFamily: string;
		fontSize: number;
		lineHeight: number;
		letterSpacing?: number; // 文字間（オプショナル：後方互換性のため）
		rubySize?: number; // ルビサイズ（オプショナル：後方互換性のため）
		headingFontFamily?: string; // 見出しフォント（オプショナル：後方互換性のため）
		colors: {
			text: string;
			background: string;
			pageBackground: string;
			accent: string;
			headingText?: string; // 見出し文字色（オプショナル：後方互換性のため）
		};
		spacing: {
			paragraphSpacing: number;
			headingSpacing: number;
		};
	};
}

/**
 * 行末処理の種類
 */
export type LineEndProcessing = "none" | "hanging" | "force-end" | "allow-end";
export type CaretColorMode = "text" | "accent" | "custom";

/**
 * 共通スタイル設定
 */
export interface CommonSettings {
	writingMode: WritingMode;
	fontFamily: string;
	fontSize: number;
	lineHeight: number; // 行間
	letterSpacing: number; // 文字間隔（em単位、0 = 通常）
	pageScale: number; // ページ拡大率 (1.0 = 100%)
	textColor: string;
	backgroundColor: string;
	pageBackgroundColor: string; // ページ外側の背景色
	accentColor: string; // アクセント色
	lineEndProcessing: LineEndProcessing; // 行末処理設定
	rubySize: number; // ルビの相対サイズ（1.0 = 本文と同じ）
	headingSpacing: number; // 見出し間隔
	rubyVerticalGap: number; // 縦書き時のルビの左右距離（em）
	rubyHorizontalGap: number; // 横書き時のルビの上下距離（em）
	headingFontFamily: string; // 見出しフォント（空の場合は本文と同じ）
	headingTextColor: string; // 見出し文字色（空の場合は本文と同じ）
	debugLogging?: boolean; // デバッグログ出力
}

/**
 * 参照モード設定
 */
export interface PreviewSettings {
	syncCursor: boolean;
	updateInterval: number;
	showCaret?: boolean;
	pageModeEnabled?: boolean;
	outlineOpen?: boolean;
	hideFrontmatter?: boolean; // フロントマターを非表示
	showFrontmatterTitle?: boolean; // フロントマターのtitleを表示
	showFrontmatterSubtitle?: boolean; // フロントマターのsubtitleを表示
	showFrontmatterOriginalTitle?: boolean; // フロントマターのoriginal_titleを表示
	showFrontmatterAuthor?: boolean; // フロントマターのauthorを表示
	showFrontmatterCoAuthors?: boolean; // フロントマターのco_authorsを表示
	showFrontmatterTranslator?: boolean; // フロントマターのtranslatorを表示
	showFrontmatterCoTranslators?: boolean; // フロントマターのco_translatorsを表示
	followActiveFile?: boolean; // アクティブなファイルを自動的に追従して表示
	// ヘッダー/フッター設定（書籍モード用）
	headerContent?: HeaderFooterContent; // ヘッダーに表示する内容
	headerAlign?: HeaderFooterAlign; // ヘッダーの配置
	footerContent?: HeaderFooterContent; // フッターに表示する内容
	footerAlign?: HeaderFooterAlign; // フッターの配置
	pageNumberFormat?: PageNumberFormat; // ページ番号の形式
	pageTransitionEffect?: PageTransitionEffect; // ページ遷移効果（書籍モード用）
	bookPaddingTop?: number; // 書籍モードの上余白（px）
	bookPaddingBottom?: number; // 書籍モードの下余白（px）
}

/**
 * WYSIWYGモード設定
 */
export interface WysiwygSettings {
	autoSave: boolean;
	syncMode: SyncMode;
	syncCursor: boolean;
	enableRuby: boolean;
	customEmphasisChars?: string[]; // 傍点候補のユーザー登録文字
	enableTcy: boolean; // 縦中横
	enableAutoTcy: boolean; // 記号を増やさない自動縦中横（表示のみ）
	enableAssistantInput: boolean; // 補助入力パネル
	enableSyncBackup: boolean; // 互換モードの同期バックアップ
	plainTextView?: boolean; // SoTビューの全文プレーン表示
	appCloseAction: AppCloseAction; // アプリ終了時の未保存変更の扱い
	imeOffsetHorizontalEm?: number; // IME表示の縦方向補正（横書き）
	imeOffsetVerticalEm?: number; // IME表示の横方向補正（縦書き）
	caretColorMode?: CaretColorMode;
	caretCustomColor?: string;
	caretWidthPx?: number;
	ceUseNativeCaret?: boolean;
	useNativeSelection?: boolean; // SoTビューの選択操作をネイティブ選択に寄せる
	sotPaddingTop?: number; // SoTビューの上余白（px）
	sotPaddingBottom?: number; // SoTビューの下余白（px）
}

/**
 * 現在の設定バージョン
 * 新しい設定が追加された時にインクリメントする
 */
export const CURRENT_SETTINGS_VERSION = 3;

/**
 * メイン設定インターフェース
 */
export interface TategakiV2Settings {
	// 設定バージョン（マイグレーション用）
	settingsVersion?: number;

	// モード設定
	defaultMode: EditorMode;
	showModeDialog: boolean;
	lastViewMode: ViewModePreference;
	lastViewOpenPlacement: ViewOpenPlacement;
	enableLegacyTiptap: boolean;

	// 共通設定
	common: CommonSettings;

	// モード固有設定
	preview: PreviewSettings;
	wysiwyg: WysiwygSettings;

	// テーマシステム
	themes: ThemePreset[];
	activeTheme: string; // テーマID または "obsidian-base"
	customFonts: string[];

	// Obsidianテーマ使用中の一時的なカスタマイズ
	temporaryOverrides: {
		fontFamily?: string;
		fontSize?: number;
		lineHeight?: number;
		letterSpacing?: number;
		textColor?: string;
		backgroundColor?: string;
		pageBackgroundColor?: string;
		accentColor?: string;
		rubySize?: number;
		headingSpacing?: number;
		rubyVerticalGap?: number;
		rubyHorizontalGap?: number;
		headingFontFamily?: string;
		headingTextColor?: string;
	};

	// コントロールパネル設定
	controlPanel: {
		enabled: boolean;
		position: "top" | "bottom" | "floating";
		autoHide: boolean;
	};
}

/**
 * プリセットテーマID（削除不可）
 */
export const PRESET_THEME_IDS = [
	"default",
	"ashberry-light",
	"ashberry-dark",
	"dusty-navy",
	"dark",
	"paper-like",
] as const;

/**
 * デフォルト設定
 */
export const DEFAULT_V2_SETTINGS: TategakiV2Settings = {
	// 設定バージョン
	settingsVersion: CURRENT_SETTINGS_VERSION,

	// モード設定
	defaultMode: "tiptap",
	showModeDialog: true,
	lastViewMode: "edit",
	lastViewOpenPlacement: "right",
	enableLegacyTiptap: true,

	// 共通設定
		common: {
			writingMode: "vertical-rl",
			fontFamily: "Yu Mincho, Hiragino Mincho ProN, serif",
			fontSize: 18,
		lineHeight: 1.8, // 行間
		letterSpacing: 0,
		pageScale: 1,
		textColor: "#2e2e2e",
		backgroundColor: "#ffffff",
		pageBackgroundColor: "#f5f5f5",
		accentColor: "#1e90ff",
			lineEndProcessing: "allow-end",
			rubySize: 0.5,
			headingSpacing: 2,
			rubyVerticalGap: 0,
			rubyHorizontalGap: 0,
			headingFontFamily: "", // 空の場合は本文と同じ
		headingTextColor: "", // 空の場合は本文と同じ
		debugLogging: false,
	},

	// 参照設定
	preview: {
		syncCursor: true,
		updateInterval: 300,
		showCaret: true,
		pageModeEnabled: false,
		outlineOpen: false,
		hideFrontmatter: true, // デフォルトでフロントマターを非表示
		showFrontmatterTitle: true,
		showFrontmatterSubtitle: true,
		showFrontmatterOriginalTitle: true,
		showFrontmatterAuthor: true,
		showFrontmatterCoAuthors: true,
		showFrontmatterTranslator: true,
		showFrontmatterCoTranslators: true,
		followActiveFile: false, // デフォルトで編集ファイルを固定
		// ヘッダー/フッター設定
		headerContent: "none",
		headerAlign: "center",
		footerContent: "pageNumber",
		footerAlign: "center",
		pageNumberFormat: "currentTotal",
		pageTransitionEffect: "fade", // デフォルトはフェード効果（最も軽量で安定）
		bookPaddingTop: 44,
		bookPaddingBottom: 32,
	},

	// WYSIWYG設定
	wysiwyg: {
		autoSave: true,
		syncMode: "auto",
		syncCursor: true,
		enableRuby: true,
		customEmphasisChars: [],
		enableTcy: true,
		enableAutoTcy: false,
		enableAssistantInput: false,
		enableSyncBackup: true,
		plainTextView: false,
		appCloseAction: "save",
		imeOffsetHorizontalEm: 0.1,
		imeOffsetVerticalEm: 0.5,
		caretColorMode: "accent",
		caretCustomColor: "#1e90ff",
		caretWidthPx: 3,
		ceUseNativeCaret: true,
		useNativeSelection: false,
		sotPaddingTop: 32,
		sotPaddingBottom: 16,
	},

	// テーマシステム
	themes: [
		{
			id: "default",
			name: "デフォルト",
			description: "標準的な縦書きテーマ",
			mode: "custom",
			settings: {
				fontFamily: "Yu Mincho, Hiragino Mincho ProN, serif",
				fontSize: 18,
				lineHeight: 1.8,
				headingFontFamily: "", // 本文と同じ
				colors: {
					text: "#2e2e2e",
					background: "#ffffff",
					pageBackground: "#f5f5f5",
					accent: "#1e90ff",
					headingText: "", // 本文と同じ
				},
				spacing: {
					paragraphSpacing: 1,
					headingSpacing: 2,
				},
			},
		},
		{
			id: "ashberry-light",
			name: "アッシュベリー（ライト）",
			description: "淡いアッシュベリー調の明るいテーマ（丸ゴシック）",
			mode: "custom",
			settings: {
				fontFamily:
					"筑紫A丸ゴシック, Hiragino Maru Gothic ProN, Hiragino Sans, Noto Sans JP, Yu Gothic, Meiryo, sans-serif",
				fontSize: 20,
				lineHeight: 1.9,
				letterSpacing: 0.06,
				rubySize: 0.5,
				headingFontFamily: "", // 本文と同じ
				colors: {
					text: "#3f3d43",
					background: "#f0eaed",
					pageBackground: "#dfd4da",
					accent: "#1e90ff",
					headingText: "", // 本文と同じ
				},
				spacing: {
					paragraphSpacing: 1.5,
					headingSpacing: 2,
				},
			},
		},
		{
			id: "ashberry-dark",
			name: "アッシュベリー（ダーク）",
			description: "アッシュベリー調の落ち着いたダークテーマ（丸ゴシック）",
			mode: "custom",
			settings: {
				fontFamily:
					"筑紫A丸ゴシック, Hiragino Maru Gothic ProN, Hiragino Sans, Noto Sans JP, Yu Gothic, Meiryo, sans-serif",
				fontSize: 20,
				lineHeight: 1.9,
				letterSpacing: 0.06,
				rubySize: 0.5,
				headingFontFamily: "", // 本文と同じ
				colors: {
					text: "#f0eaed",
					background: "#956a7f",
					pageBackground: "#b495a4",
					accent: "#1e90ff",
					headingText: "", // 本文と同じ
				},
				spacing: {
					paragraphSpacing: 1.5,
					headingSpacing: 2,
				},
			},
		},
		{
			id: "dusty-navy",
			name: "ダスティネイビー",
			description: "くすんだダークブルーの落ち着いたテーマ（明朝）",
			mode: "custom",
			settings: {
				fontFamily:
					'"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", "Source Han Serif", Georgia, "Times New Roman", serif',
				fontSize: 20,
				lineHeight: 1.9,
				letterSpacing: 0.06,
				rubySize: 0.5,
				headingFontFamily: "", // 本文と同じ
				colors: {
					text: "#d5d9e1",
					background: "#30354a",
					pageBackground: "#3b415a",
					accent: "#1e90ff",
					headingText: "", // 本文と同じ
				},
				spacing: {
					paragraphSpacing: 1.5,
					headingSpacing: 2,
				},
			},
		},
		{
			id: "dark",
			name: "ダーク",
			description: "ダークモード縦書きテーマ",
			mode: "custom",
			settings: {
				fontFamily: "Yu Mincho, Hiragino Mincho ProN, serif",
				fontSize: 18,
				lineHeight: 1.8,
				headingFontFamily: "", // 本文と同じ
				colors: {
					text: "#e0e0e0",
					background: "#1a1a1a",
					pageBackground: "#0f0f0f",
					accent: "#4a9eff",
					headingText: "", // 本文と同じ
				},
				spacing: {
					paragraphSpacing: 1,
					headingSpacing: 2,
				},
			},
		},
		{
			id: "paper-like",
			name: "紙風",
			description: "紙のような温かみのあるテーマ",
			mode: "custom",
			settings: {
				fontFamily: "Yu Mincho, Hiragino Mincho ProN, serif",
				fontSize: 17,
				lineHeight: 1.9,
				headingFontFamily: "", // 本文と同じ
				colors: {
					text: "#3a3330",
					background: "#f9f7f3",
					pageBackground: "#e8e4df",
					accent: "#b8860b",
					headingText: "", // 本文と同じ
				},
				spacing: {
					paragraphSpacing: 1.3,
					headingSpacing: 2.2,
				},
			},
		},
	],
	activeTheme: "obsidian-base",
	customFonts: [],
	temporaryOverrides: {},

	// コントロールパネル
	controlPanel: {
		enabled: true,
		position: "top",
		autoHide: false,
	},
};

export function validateV2Settings(settings: any): TategakiV2Settings {
	const validated = { ...DEFAULT_V2_SETTINGS };

	if (settings && typeof settings === "object") {
		// 設定バージョンを確認してマイグレーションを行う
		const oldVersion = typeof settings.settingsVersion === "number" ? settings.settingsVersion : 0;
		const needsMigration = oldVersion < CURRENT_SETTINGS_VERSION;

		validated.defaultMode = "tiptap";
		if (
			settings.lastViewMode === "edit" ||
			settings.lastViewMode === "preview" ||
			settings.lastViewMode === "compat"
		) {
			validated.lastViewMode = settings.lastViewMode;
		}
		if (typeof settings.enableLegacyTiptap === "boolean") {
			validated.enableLegacyTiptap = settings.enableLegacyTiptap;
		}

		// ビューを開く場所のバリデーション
		if (
			settings.lastViewOpenPlacement === "right" ||
			settings.lastViewOpenPlacement === "tab" ||
			settings.lastViewOpenPlacement === "window"
		) {
			validated.lastViewOpenPlacement = settings.lastViewOpenPlacement;
		}

		// showModeDialog: バージョン2で追加
		// 古いバージョンからのマイグレーション時はデフォルト値(true)を使用
		if (typeof settings.showModeDialog === "boolean" && !needsMigration) {
			validated.showModeDialog = settings.showModeDialog;
		}
		// needsMigration の場合はデフォルト値(true)のまま

		// 設定バージョンを更新
		validated.settingsVersion = CURRENT_SETTINGS_VERSION;

		if (settings.common && typeof settings.common === "object") {
			const mergedCommon = {
				...validated.common,
				...settings.common,
			};
			mergedCommon.rubySize = normalizeRubySize(
				(settings.common as any).rubySize ?? mergedCommon.rubySize
			);
			mergedCommon.rubyVerticalGap = normalizeRubyGap(
				(settings.common as any).rubyVerticalGap ??
					mergedCommon.rubyVerticalGap,
				DEFAULT_V2_SETTINGS.common.rubyVerticalGap
			);
			mergedCommon.rubyHorizontalGap = normalizeRubyGap(
				(settings.common as any).rubyHorizontalGap ??
					mergedCommon.rubyHorizontalGap,
				DEFAULT_V2_SETTINGS.common.rubyHorizontalGap
			);
			if (typeof (mergedCommon as any).debugLogging !== "boolean") {
				mergedCommon.debugLogging =
					DEFAULT_V2_SETTINGS.common.debugLogging;
			}
			validated.common = mergedCommon;
		} else {
			validated.common = {
				...validated.common,
				rubySize: normalizeRubySize(validated.common.rubySize),
				rubyVerticalGap: normalizeRubyGap(
					validated.common.rubyVerticalGap,
					DEFAULT_V2_SETTINGS.common.rubyVerticalGap
				),
				rubyHorizontalGap: normalizeRubyGap(
					validated.common.rubyHorizontalGap,
					DEFAULT_V2_SETTINGS.common.rubyHorizontalGap
				),
			};
		}

		if (settings.preview && typeof settings.preview === "object") {
			validated.preview = { ...validated.preview, ...settings.preview };
		}
		const bookPaddingTop = Number((validated.preview as any).bookPaddingTop);
		validated.preview.bookPaddingTop = Number.isFinite(bookPaddingTop)
			? Math.max(0, Math.min(200, bookPaddingTop))
			: DEFAULT_V2_SETTINGS.preview.bookPaddingTop ?? 44;
		const bookPaddingBottom = Number(
			(validated.preview as any).bookPaddingBottom
		);
		validated.preview.bookPaddingBottom = Number.isFinite(bookPaddingBottom)
			? Math.max(0, Math.min(200, bookPaddingBottom))
			: DEFAULT_V2_SETTINGS.preview.bookPaddingBottom ?? 32;

		if (settings.wysiwyg && typeof settings.wysiwyg === "object") {
			validated.wysiwyg = { ...validated.wysiwyg, ...settings.wysiwyg };
			if (typeof (validated.wysiwyg as any).enableSyncBackup !== "boolean") {
				validated.wysiwyg.enableSyncBackup =
					DEFAULT_V2_SETTINGS.wysiwyg.enableSyncBackup;
			}
			if (typeof (validated.wysiwyg as any).enableAutoTcy !== "boolean") {
				validated.wysiwyg.enableAutoTcy =
					DEFAULT_V2_SETTINGS.wysiwyg.enableAutoTcy;
			}
			if (typeof (validated.wysiwyg as any).plainTextView !== "boolean") {
				validated.wysiwyg.plainTextView =
					DEFAULT_V2_SETTINGS.wysiwyg.plainTextView;
			}
			const action = (validated.wysiwyg as any).appCloseAction;
			if (action !== "save" && action !== "discard") {
				validated.wysiwyg.appCloseAction =
					DEFAULT_V2_SETTINGS.wysiwyg.appCloseAction;
			}
			validated.wysiwyg.imeOffsetHorizontalEm = normalizeImeOffset(
				(validated.wysiwyg as any).imeOffsetHorizontalEm,
				DEFAULT_V2_SETTINGS.wysiwyg.imeOffsetHorizontalEm ?? 0.1
			);
			validated.wysiwyg.imeOffsetVerticalEm = normalizeImeOffset(
				(validated.wysiwyg as any).imeOffsetVerticalEm,
				DEFAULT_V2_SETTINGS.wysiwyg.imeOffsetVerticalEm ?? 0.5
			);
			const caretMode = (validated.wysiwyg as any).caretColorMode;
			if (
				caretMode !== "text" &&
				caretMode !== "accent" &&
				caretMode !== "custom"
			) {
				validated.wysiwyg.caretColorMode =
					DEFAULT_V2_SETTINGS.wysiwyg.caretColorMode;
			}
			const caretWidth = Number(
				(validated.wysiwyg as any).caretWidthPx
			);
			if (!Number.isFinite(caretWidth)) {
				validated.wysiwyg.caretWidthPx =
					DEFAULT_V2_SETTINGS.wysiwyg.caretWidthPx;
			} else {
				validated.wysiwyg.caretWidthPx = Math.max(
					CARET_WIDTH_MIN,
					Math.min(CARET_WIDTH_MAX, caretWidth)
				);
			}
			if (
				typeof (validated.wysiwyg as any).caretCustomColor !== "string"
			) {
				validated.wysiwyg.caretCustomColor =
					DEFAULT_V2_SETTINGS.wysiwyg.caretCustomColor;
			}
			if (typeof (validated.wysiwyg as any).ceUseNativeCaret !== "boolean") {
				validated.wysiwyg.ceUseNativeCaret =
					DEFAULT_V2_SETTINGS.wysiwyg.ceUseNativeCaret;
			}
			if (
				typeof (validated.wysiwyg as any).useNativeSelection !== "boolean"
			) {
				validated.wysiwyg.useNativeSelection =
					DEFAULT_V2_SETTINGS.wysiwyg.useNativeSelection;
			}
			// SoT余白のバリデーション
			const sotPaddingTop = Number((validated.wysiwyg as any).sotPaddingTop);
			validated.wysiwyg.sotPaddingTop = Number.isFinite(sotPaddingTop)
				? Math.max(0, Math.min(200, sotPaddingTop))
				: DEFAULT_V2_SETTINGS.wysiwyg.sotPaddingTop;
			const sotPaddingBottom = Number((validated.wysiwyg as any).sotPaddingBottom);
			validated.wysiwyg.sotPaddingBottom = Number.isFinite(sotPaddingBottom)
				? Math.max(0, Math.min(200, sotPaddingBottom))
				: DEFAULT_V2_SETTINGS.wysiwyg.sotPaddingBottom;
			validated.wysiwyg.customEmphasisChars = normalizeCustomEmphasisChars(
				validated.wysiwyg.customEmphasisChars
			);
		}
		if (!settings.wysiwyg) {
			validated.wysiwyg.imeOffsetHorizontalEm = normalizeImeOffset(
				validated.wysiwyg.imeOffsetHorizontalEm,
				DEFAULT_V2_SETTINGS.wysiwyg.imeOffsetHorizontalEm ?? 0.1
			);
			validated.wysiwyg.imeOffsetVerticalEm = normalizeImeOffset(
				validated.wysiwyg.imeOffsetVerticalEm,
				DEFAULT_V2_SETTINGS.wysiwyg.imeOffsetVerticalEm ?? 0.5
			);
				const caretWidth = Number(validated.wysiwyg.caretWidthPx);
				validated.wysiwyg.caretWidthPx = Number.isFinite(caretWidth)
					? Math.max(CARET_WIDTH_MIN, Math.min(CARET_WIDTH_MAX, caretWidth))
					: DEFAULT_V2_SETTINGS.wysiwyg.caretWidthPx;
				validated.wysiwyg.customEmphasisChars =
					normalizeCustomEmphasisChars(
						validated.wysiwyg.customEmphasisChars
					);
			}

		if (
			settings.controlPanel &&
			typeof settings.controlPanel === "object"
		) {
			validated.controlPanel = {
				...validated.controlPanel,
				...settings.controlPanel,
			};
		}

		if (Array.isArray(settings.themes)) {
			const merged = new Map<string, (typeof validated.themes)[number]>();
			for (const theme of validated.themes) {
				merged.set(theme.id, theme);
			}
			for (const theme of settings.themes) {
				if (theme && typeof theme.id === "string") {
					// マイグレーション: modeプロパティがない古いテーマは"custom"として扱う
					if (!theme.mode) {
						theme.mode = "custom";
					}
					merged.set(theme.id, theme);
				}
			}
			validated.themes = Array.from(merged.values());
		}

		if (typeof settings.activeTheme === "string") {
			validated.activeTheme = settings.activeTheme;
		}

		if (Array.isArray(settings.customFonts)) {
			const customFontsSource = settings.customFonts as unknown[];
			const normalizedFonts = customFontsSource
				.filter((font): font is string => typeof font === "string")
				.map((font: string) => font.trim())
				.filter((font: string) => font.length > 0);
			const mergedFonts = [
				...DEFAULT_V2_SETTINGS.customFonts,
				...normalizedFonts,
			];
			const seen = new Set<string>();
			validated.customFonts = mergedFonts.filter((font: string) => {
				const key = font.toLowerCase();
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		} else {
			validated.customFonts = [...DEFAULT_V2_SETTINGS.customFonts];
		}

		// temporaryOverridesのマイグレーション
		if (
			settings.temporaryOverrides &&
			typeof settings.temporaryOverrides === "object"
		) {
			validated.temporaryOverrides = { ...settings.temporaryOverrides };
		} else {
			validated.temporaryOverrides = {};
		}
	}

	validated.common.rubySize = normalizeRubySize(validated.common.rubySize);
	validated.common.rubyVerticalGap = normalizeRubyGap(
		validated.common.rubyVerticalGap,
		DEFAULT_V2_SETTINGS.common.rubyVerticalGap
	);
	validated.common.rubyHorizontalGap = normalizeRubyGap(
		validated.common.rubyHorizontalGap,
		DEFAULT_V2_SETTINGS.common.rubyHorizontalGap
	);
	validated.customFonts = Array.isArray(validated.customFonts)
		? [...validated.customFonts]
		: [...DEFAULT_V2_SETTINGS.customFonts];

	return validated;
}

const RUBY_SIZE_MIN = 0.2;
const RUBY_SIZE_MAX = 1.0;
const RUBY_GAP_MIN = -5;
const RUBY_GAP_MAX = 5;
const IME_OFFSET_MIN = -1;
const IME_OFFSET_MAX = 1;
const CARET_WIDTH_MIN = 1;
const CARET_WIDTH_MAX = 8;
const MAX_CUSTOM_EMPHASIS_COUNT = 20;

function normalizeRubySize(value: unknown): number {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return DEFAULT_V2_SETTINGS.common.rubySize;
	}
	if (num < RUBY_SIZE_MIN) return RUBY_SIZE_MIN;
	if (num > RUBY_SIZE_MAX) return RUBY_SIZE_MAX;
	return num;
}

function normalizeRubyGap(value: unknown, fallback: number): number {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return fallback;
	}
	if (num < RUBY_GAP_MIN) return RUBY_GAP_MIN;
	if (num > RUBY_GAP_MAX) return RUBY_GAP_MAX;
	return num;
}

function normalizeImeOffset(value: unknown, fallback: number): number {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return fallback;
	}
	if (num < IME_OFFSET_MIN) return IME_OFFSET_MIN;
	if (num > IME_OFFSET_MAX) return IME_OFFSET_MAX;
	return num;
}

function normalizeCustomEmphasisChars(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const entry of value) {
		if (typeof entry !== "string") continue;
		const trimmed = entry.trim();
		if (!trimmed) continue;
		const firstChar = Array.from(trimmed)[0] ?? "";
		if (!firstChar || seen.has(firstChar)) continue;
		seen.add(firstChar);
		normalized.push(firstChar);
		if (normalized.length >= MAX_CUSTOM_EMPHASIS_COUNT) break;
	}
	return normalized;
}
