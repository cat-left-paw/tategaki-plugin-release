/**
 * Tategaki Plugin v2.0 設定型定義
 */

export type WritingMode = "vertical-rl" | "horizontal-tb";
export type EditorMode = "tiptap";
export type SyncMode = "manual" | "auto";
export type ThemeMode = "obsidian-base" | "custom";
export type AppCloseAction = "save" | "discard";
export type SoTSelectionMode = "fast-click" | "native-drag";
export type ViewModePreference = "edit" | "preview" | "compat" | "reading";
export type HeaderFooterContent = "none" | "title" | "pageNumber";
export type HeaderFooterAlign = "left" | "center" | "right";
export type PageNumberFormat = "current" | "currentTotal";
export type PageTransitionEffect =
	| "none"
	| "fade"
	| "slide"
	| "blur";

export type HeadingAlign = "start" | "center" | "end";

// 書籍モード：フロントマター表示方式
export type BookFrontmatterDisplayMode = "inline" | "separate-page";
// 書籍モード：独立ページのレイアウト
export type BookFrontmatterPageLayout = "normal" | "center";
// 書籍モード：独立ページの文字方向
export type BookFrontmatterPageWritingMode = "inherit" | "horizontal-tb" | "vertical-rl";
// 書籍モード：見出しのページ扱い
export type BookHeadingPaginationMode = "none" | "page-break" | "title-page";
// 書籍モード：見出しレベル
export type BookHeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingDividerLevels {
	h1: boolean;
	h2: boolean;
	h3: boolean;
	h4: boolean;
	h5: boolean;
	h6: boolean;
}

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
		headingMarginAfter?: number; // 見出し後マージン（オプショナル：後方互換性のため）
		headingDividerLevels?: HeadingDividerLevels; // 見出し区切り線（オプショナル：後方互換性のため）
		headingAlign?: HeadingAlign; // 見出し位置（オプショナル：後方互換性のため）
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
	headingMarginAfter: number; // 見出し後マージン (em)
	headingDividerLevels: HeadingDividerLevels; // 見出し区切り線
	headingAlign: HeadingAlign; // 見出しの位置
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
	bookFrontmatterAsCoverPage?: boolean; // [旧] フロントマターを表紙ページとして独立させる（後方互換用）
	bookPageBreakBeforeHeadingLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6; // [旧] 見出し前改ページのレベル（後方互換用）
	// 新設定
	bookFrontmatterDisplayMode?: BookFrontmatterDisplayMode; // フロントマター表示方式
	bookFrontmatterSeparatePageLayout?: BookFrontmatterPageLayout; // 独立ページのレイアウト
	bookFrontmatterSeparatePageWritingMode?: BookFrontmatterPageWritingMode; // 独立ページの文字方向
	bookHeadingPaginationMode?: BookHeadingPaginationMode; // 見出しのページ扱い
	bookHeadingPaginationLevel?: BookHeadingLevel; // 見出しレベル
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
	// ceUseNativeCaret / useNativeSelection: PR5で削除。旧データは正規化時に無視される。
	sotSelectionMode?: SoTSelectionMode; // SoT選択モード
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
		headingMarginAfter?: number;
		headingDividerLevels?: HeadingDividerLevels;
		headingAlign?: HeadingAlign;
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
		headingMarginAfter: 0.45,
		headingDividerLevels: { h1: true, h2: true, h3: false, h4: false, h5: false, h6: false },
		headingAlign: "start",
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
		bookFrontmatterAsCoverPage: false,
		bookPageBreakBeforeHeadingLevel: 0,
		bookFrontmatterDisplayMode: "inline",
		bookFrontmatterSeparatePageLayout: "normal",
		bookFrontmatterSeparatePageWritingMode: "inherit",
		bookHeadingPaginationMode: "none",
		bookHeadingPaginationLevel: 0,
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
		sotSelectionMode: "fast-click",
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
			settings.lastViewMode === "compat" ||
			settings.lastViewMode === "reading"
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
			// headingMarginAfter
			const headingMarginAfter = Number(mergedCommon.headingMarginAfter);
			mergedCommon.headingMarginAfter = Number.isFinite(headingMarginAfter)
				? Math.max(0, Math.min(1.5, headingMarginAfter))
				: DEFAULT_V2_SETTINGS.common.headingMarginAfter;
			// headingDividerLevels
			const rawDividers: unknown = mergedCommon.headingDividerLevels;
			if (!rawDividers || typeof rawDividers !== "object") {
				mergedCommon.headingDividerLevels = { ...DEFAULT_V2_SETTINGS.common.headingDividerLevels };
			} else {
				const d = rawDividers as Record<string, unknown>;
				const def = DEFAULT_V2_SETTINGS.common.headingDividerLevels;
				mergedCommon.headingDividerLevels = {
					h1: typeof d["h1"] === "boolean" ? d["h1"] : def.h1,
					h2: typeof d["h2"] === "boolean" ? d["h2"] : def.h2,
					h3: typeof d["h3"] === "boolean" ? d["h3"] : def.h3,
					h4: typeof d["h4"] === "boolean" ? d["h4"] : def.h4,
					h5: typeof d["h5"] === "boolean" ? d["h5"] : def.h5,
					h6: typeof d["h6"] === "boolean" ? d["h6"] : def.h6,
				};
			}
			// headingAlign
			const rawAlign: unknown = mergedCommon.headingAlign;
			if (rawAlign !== "start" && rawAlign !== "center" && rawAlign !== "end") {
				mergedCommon.headingAlign = DEFAULT_V2_SETTINGS.common.headingAlign;
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

		// 旧設定→新設定へのマイグレーション
		// bookFrontmatterAsCoverPage → bookFrontmatterDisplayMode
		if (
			validated.preview.bookFrontmatterDisplayMode === undefined ||
			(validated.preview.bookFrontmatterDisplayMode as string) === ""
		) {
			validated.preview.bookFrontmatterDisplayMode =
				validated.preview.bookFrontmatterAsCoverPage
					? "separate-page"
					: "inline";
		}
		// bookPageBreakBeforeHeadingLevel → bookHeadingPaginationMode + Level
		if (
			validated.preview.bookHeadingPaginationMode === undefined ||
			(validated.preview.bookHeadingPaginationMode as string) === ""
		) {
			const oldLevel = validated.preview.bookPageBreakBeforeHeadingLevel ?? 0;
			if (oldLevel > 0) {
				validated.preview.bookHeadingPaginationMode = "page-break";
				validated.preview.bookHeadingPaginationLevel = oldLevel as 0 | 1 | 2 | 3 | 4 | 5 | 6;
			} else {
				validated.preview.bookHeadingPaginationMode = "none";
				validated.preview.bookHeadingPaginationLevel = 0;
			}
		}
		// 新設定のバリデーション
		const fmMode = validated.preview.bookFrontmatterDisplayMode;
		if (fmMode !== "inline" && fmMode !== "separate-page") {
			validated.preview.bookFrontmatterDisplayMode = "inline";
		}
		const fmLayout = validated.preview.bookFrontmatterSeparatePageLayout;
		if (fmLayout !== "normal" && fmLayout !== "center") {
			validated.preview.bookFrontmatterSeparatePageLayout = "normal";
		}
		const fmWm = validated.preview.bookFrontmatterSeparatePageWritingMode;
		if (fmWm !== "inherit" && fmWm !== "horizontal-tb" && fmWm !== "vertical-rl") {
			validated.preview.bookFrontmatterSeparatePageWritingMode = "inherit";
		}
		const hpMode = validated.preview.bookHeadingPaginationMode;
		if (hpMode !== "none" && hpMode !== "page-break" && hpMode !== "title-page") {
			validated.preview.bookHeadingPaginationMode = "none";
		}
		const hpLevel = Number(validated.preview.bookHeadingPaginationLevel);
		if (!Number.isFinite(hpLevel) || hpLevel < 0 || hpLevel > 6) {
			validated.preview.bookHeadingPaginationLevel = 0;
		}
		// 旧設定を新設定と同期（旧設定を参照するコードの後方互換）
		validated.preview.bookFrontmatterAsCoverPage =
			validated.preview.bookFrontmatterDisplayMode === "separate-page";
		validated.preview.bookPageBreakBeforeHeadingLevel =
			(validated.preview.bookHeadingPaginationMode !== "none"
				? validated.preview.bookHeadingPaginationLevel
				: 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
			// PR5: ceUseNativeCaret / useNativeSelection は削除済み。
			// 旧データに残っていても無視（delete で除去）。
			delete (validated.wysiwyg as any).ceUseNativeCaret;
			delete (validated.wysiwyg as any).useNativeSelection;
			// sotSelectionMode のバリデーション
			const sotSelMode = (validated.wysiwyg as any).sotSelectionMode;
			if (sotSelMode !== "fast-click" && sotSelMode !== "native-drag") {
				validated.wysiwyg.sotSelectionMode =
					DEFAULT_V2_SETTINGS.wysiwyg.sotSelectionMode;
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
const IME_OFFSET_RELATIVE_RANGE = 1;
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

function normalizeImeOffset(
	value: unknown,
	fallback: number,
	relativeRange = IME_OFFSET_RELATIVE_RANGE,
): number {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return fallback;
	}
	const min = fallback - relativeRange;
	const max = fallback + relativeRange;
	if (num < min) return min;
	if (num > max) return max;
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
