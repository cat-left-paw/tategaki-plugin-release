/**
 * Settings Panel for ContentEditable Editor
 * コントロールパネルの機能をモーダル形式で提供
 */

import {
	DEFAULT_V2_SETTINGS,
	TategakiV2Settings,
	PRESET_THEME_IDS,
} from "../../types/settings";
import { App, Modal, Setting, setIcon } from "obsidian";
import TategakiV2Plugin from "../../core/plugin";
import { debugWarn } from "../../shared/logger";
import { showConfirmModal } from "../../shared/ui/confirm-modal";

/**
 * テーマ名入力用のモーダル
 */
class ThemeNameInputModal extends Modal {
	private onSubmit: (name: string) => void;
	private inputEl: HTMLInputElement | null = null;

	constructor(app: App, onSubmit: (name: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "テーマ名を入力" });

		new Setting(contentEl).setName("テーマ名").addText((text) => {
			this.inputEl = text.inputEl;
			text.setPlaceholder("例: マイテーマ").onChange(() => {
				// リアルタイム検証は不要
			});
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.submit();
				}
			});
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("キャンセル").onClick(() => {
					this.close();
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("保存")
					.setCta()
					.onClick(() => {
						this.submit();
					}),
			);

		// フォーカスを当てる
		setTimeout(() => {
			if (this.inputEl) {
				this.inputEl.focus();
				this.inputEl.select();
			}
		}, 50);
	}

	private submit() {
		const name = this.inputEl?.value.trim();
		if (name) {
			this.onSubmit(name);
			this.close();
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

type KnownPlatform =
	| "windows"
	| "mac"
	| "linux"
	| "android"
	| "ios"
	| "unknown";

type SettingsPanelMode = "sot" | "compat";
type SettingsPanelContext = {
	mode: SettingsPanelMode;
	isCeImeMode?: boolean;
};

const GENERIC_FONTS = [
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
];
const COMMON_FONTS = [
	"Yu Mincho",
	"Hiragino Mincho ProN",
	"MS Mincho",
	"Noto Serif JP",
	"Source Han Serif",
	"Kozuka Mincho Pro",
	"Kozuka Gothic Pro",
	"Yu Gothic",
	"Hiragino Sans",
	"MS Gothic",
	"Noto Sans JP",
	"Source Han Sans",
	"Meiryo",
	"Arial",
	"Times New Roman",
	"Georgia",
	"Courier New",
	"Helvetica",
	"Helvetica Neue",
	"Segoe UI",
];

const LANGUAGE_FONT_GROUPS: Record<string, string[]> = {
	ja: [
		"Yu Mincho",
		"Yu Gothic",
		"Hiragino Mincho ProN",
		"Hiragino Sans",
		"Noto Serif JP",
		"Noto Sans JP",
		"Source Han Serif",
		"Source Han Sans",
		"Meiryo",
		"Kozuka Mincho Pro",
		"Kozuka Gothic Pro",
	],
	"zh-hans": [
		"Noto Sans SC",
		"Noto Serif SC",
		"Source Han Sans SC",
		"Source Han Serif SC",
		"PingFang SC",
		"Microsoft YaHei",
		"SimHei",
		"SimSun",
		"DengXian",
	],
	"zh-hant": [
		"Noto Sans TC",
		"Noto Serif TC",
		"Source Han Sans TC",
		"Source Han Serif TC",
		"PingFang TC",
		"PingFang HK",
		"PMingLiU",
		"MingLiU",
		"DFKai-SB",
	],
	zh: [
		"Source Han Sans",
		"Source Han Serif",
		"Noto Sans CJK SC",
		"Noto Serif CJK TC",
		"PingFang",
	],
	ko: [
		"Noto Sans KR",
		"Noto Serif KR",
		"Source Han Sans KR",
		"Source Han Serif KR",
		"Malgun Gothic",
		"Nanum Gothic",
		"Apple SD Gothic Neo",
		"Batang",
	],
	en: [
		"Times New Roman",
		"Georgia",
		"Garamond",
		"Baskerville",
		"Palatino",
		"Cambria",
		"Calibri",
		"Arial",
		"Helvetica",
		"Trebuchet MS",
		"Segoe UI",
	],
};

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHexColor(hex: string): string {
	const trimmed = hex.trim();
	if (!HEX_COLOR_PATTERN.test(trimmed)) {
		return trimmed;
	}
	if (trimmed.length === 4) {
		const r = trimmed[1];
		const g = trimmed[2];
		const b = trimmed[3];
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	return trimmed.toLowerCase();
}

function rgbToHex(rgb: string): string | null {
	const match = rgb.match(/\d+(\.\d+)?/g);
	if (!match || match.length < 3) {
		return null;
	}
	const values = match.slice(0, 3).map((part) => {
		const value = Math.round(Number(part));
		if (!Number.isFinite(value)) {
			return 0;
		}
		return Math.max(0, Math.min(255, value));
	});
	return `#${values.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function resolveColorForSwatch(
	rawColor: string | undefined,
	fallbackColor: string,
): string {
	const fallbackHex = normalizeHexColor(fallbackColor);
	const candidate =
		typeof rawColor === "string" ? rawColor.trim() : "";
	if (!candidate) {
		return fallbackHex;
	}
	if (HEX_COLOR_PATTERN.test(candidate)) {
		return normalizeHexColor(candidate);
	}
	if (typeof document === "undefined") {
		return fallbackHex;
	}
	const probe = document.createElement("span");
	probe.style.color = candidate;
	if (!probe.style.color) {
		return fallbackHex;
	}
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	probe.style.pointerEvents = "none";
	document.body.appendChild(probe);
	const computed = getComputedStyle(probe).color;
	document.body.removeChild(probe);
	const resolvedHex = rgbToHex(computed);
	return resolvedHex ?? fallbackHex;
}

function detectPlatform(): KnownPlatform {
	if (typeof navigator === "undefined") {
		return "unknown";
	}
	const userAgent = navigator.userAgent.toLowerCase();
	if (userAgent.includes("android")) return "android";
	if (userAgent.includes("iphone") || userAgent.includes("ipad"))
		return "ios";
	if (userAgent.includes("mac")) return "mac";
	if (userAgent.includes("win")) return "windows";
	if (userAgent.includes("linux")) return "linux";
	return "unknown";
}

function detectPreferredLanguages(): string[] {
	if (typeof navigator === "undefined") {
		return [];
	}
	const rawLanguages =
		Array.isArray(navigator.languages) && navigator.languages.length > 0
			? navigator.languages
			: navigator.language
				? [navigator.language]
				: [];
	return rawLanguages
		.map((lang) => (lang ?? "").toLowerCase())
		.filter((lang) => lang.length > 0);
}

function getPlatformFonts(platform: KnownPlatform): string[] {
	const map: Record<KnownPlatform, string[]> = {
		windows: [
			"Yu Mincho",
			"Yu Gothic",
			"MS Mincho",
			"MS PMincho",
			"MS Gothic",
			"MS PGothic",
			"Meiryo",
			"Meiryo UI",
			"Segoe UI",
			"Calibri",
			"Verdana",
			"Tahoma",
		],
		mac: [
			"Hiragino Mincho ProN",
			"Hiragino Sans",
			"SF Pro Display",
			"SF Pro Text",
			"Helvetica Neue",
			"Helvetica",
			"Arial",
			"Times",
			"PingFang SC",
			"PingFang TC",
		],
		linux: [
			"Noto Sans JP",
			"Noto Serif JP",
			"Source Han Sans",
			"Source Han Serif",
			"DejaVu Sans",
			"DejaVu Serif",
			"Liberation Sans",
			"Liberation Serif",
			"Ubuntu",
			"Roboto",
		],
		android: [
			"Roboto",
			"Droid Sans",
			"Droid Sans Fallback",
			"Noto Sans CJK JP",
			"Noto Serif CJK JP",
			"Noto Sans",
		],
		ios: [
			"SF Pro Display",
			"SF Pro Text",
			"Helvetica Neue",
			"PingFang SC",
			"PingFang TC",
			"Hiragino Sans",
			"Arial",
		],
		unknown: [],
	};
	return map[platform] ?? [];
}

function normalizeLanguageCodes(rawLanguages: string[]): string[] {
	const normalized: string[] = [];
	for (const lang of rawLanguages) {
		const parts = lang.split("-");
		const base = parts[0];
		if (base === "zh") {
			const lower = lang.toLowerCase();
			if (
				lower.includes("hant") ||
				lower.endsWith("-tw") ||
				lower.endsWith("-hk") ||
				lower.endsWith("-mo")
			) {
				normalized.push("zh-hant");
			} else {
				normalized.push("zh-hans");
			}
			normalized.push("zh");
		} else {
			normalized.push(base);
		}
	}
	return Array.from(new Set(normalized));
}

function getLanguagePreferredFonts(languages: string[]): string[] {
	const codes = normalizeLanguageCodes(languages);
	const collected: string[] = [];
	for (const code of codes) {
		const fonts = LANGUAGE_FONT_GROUPS[code];
		if (fonts) {
			collected.push(...fonts);
		}
	}
	// 英語をデフォルトフォールバックとして結合
	if (!codes.includes("en") && LANGUAGE_FONT_GROUPS.en) {
		collected.push(...LANGUAGE_FONT_GROUPS.en);
	}
	return collected;
}

function dedupeFonts(fonts: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const font of fonts) {
		const trimmed = font.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

function expandFontFamilies(entries: string[]): string[] {
	const expanded: string[] = [];
	for (const entry of entries) {
		const trimmed = entry.trim();
		if (!trimmed) continue;
		expanded.push(trimmed);
		if (trimmed.includes(",")) {
			const parts = trimmed.split(",");
			for (const part of parts) {
				const sub = part.trim().replace(/^["']|["']$/g, "");
				if (sub) {
					expanded.push(sub);
				}
			}
		}
	}
	return expanded;
}

function shouldAttemptDetection(font: string): boolean {
	if (!font) return false;
	if (font.includes(",")) return false; // 複合指定はそのまま表示
	const lower = font.toLowerCase();
	return !GENERIC_FONTS.includes(lower);
}

function canUseCanvasDetection(): boolean {
	return (
		typeof document !== "undefined" &&
		typeof document.createElement === "function"
	);
}

async function detectAvailableFonts(
	candidates: string[],
): Promise<Set<string>> {
	const detected = new Set<string>();

	if (!canUseCanvasDetection()) {
		return detected;
	}

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return detected;
	}

	const testText = "縦書きABC123漢字かなカナ";
	const baseFontSize = "20px";
	ctx.font = `${baseFontSize} serif`;
	const baseWidth = ctx.measureText(testText).width;

	await Promise.all(
		candidates.map((font) => {
			try {
				ctx.font = `${baseFontSize} "${font}", serif`;
				const width = ctx.measureText(testText).width;
				if (Math.abs(width - baseWidth) > 0.5) {
					detected.add(font.toLowerCase());
				}
			} catch (error) {
				// ignore invalid font errors
			}
		}),
	);

	return detected;
}

interface SystemFontOptions {
	customFonts?: string[];
	includeFamilies?: string[];
}

// 注: この関数は現在使用されていませんが、将来的なカスタマイズのために残しています
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getSystemFonts(
	options: SystemFontOptions = {},
): Promise<string[]> {
	const platform = detectPlatform();
	const languagePrefs = detectPreferredLanguages();

	const customFonts = dedupeFonts(options.customFonts ?? []);
	const includeFamilies = expandFontFamilies(
		options.includeFamilies ?? [DEFAULT_V2_SETTINGS.common.fontFamily],
	);

	const candidates = dedupeFonts([
		...customFonts,
		...getLanguagePreferredFonts(languagePrefs),
		...getPlatformFonts(platform),
		...COMMON_FONTS,
		...includeFamilies,
		...GENERIC_FONTS,
	]);

	const detectionTargets = candidates.filter(shouldAttemptDetection);
	let detectedFonts = new Set<string>();

	try {
		detectedFonts = await detectAvailableFonts(detectionTargets);
	} catch (error) {
		debugWarn("Tategaki SettingsPanel: font detection failed", error);
	}

	const customFontSet = new Set(
		customFonts.map((font) => font.toLowerCase()),
	);
	const includeSet = new Set(
		includeFamilies.map((font) => font.toLowerCase()),
	);

	const ordered: string[] = [];
	for (const font of candidates) {
		const key = font.toLowerCase();
		const isGeneric = GENERIC_FONTS.includes(key);
		const isDetected = detectedFonts.has(key);

		if (
			customFontSet.has(key) ||
			includeSet.has(key) ||
			isDetected ||
			isGeneric ||
			!shouldAttemptDetection(font)
		) {
			ordered.push(font);
		}
	}

	const nonGeneric = ordered.filter(
		(font) => !GENERIC_FONTS.includes(font.toLowerCase()),
	);
	const genericOnly = ordered.filter((font) =>
		GENERIC_FONTS.includes(font.toLowerCase()),
	);

	return [...dedupeFonts(nonGeneric), ...dedupeFonts(genericOnly)];
}

/**
 * カラーピッカーを開く
 */
function openColorPicker(
	title: string,
	initialColor: string,
	onColorSelect: (color: string) => void,
): void {
	const modal = document.createElement("div");
	modal.className = "tategaki-color-picker-modal";

	const content = document.createElement("div");
	content.className = "tategaki-color-picker-content";

	const titleEl = document.createElement("h3");
	titleEl.textContent = title;
	titleEl.className = "tategaki-color-picker-title";

	const inputContainer = document.createElement("div");
	inputContainer.className = "tategaki-color-picker-inputs";

	const colorInput = document.createElement("input");
	colorInput.type = "color";
	colorInput.value = initialColor;
	colorInput.className = "tategaki-color-picker-color-input";

	const textInput = document.createElement("input");
	textInput.type = "text";
	textInput.value = initialColor;
	textInput.className = "tategaki-color-picker-text-input";

	colorInput.addEventListener("input", () => {
		textInput.value = colorInput.value;
	});

	textInput.addEventListener("input", () => {
		if (/^#[0-9a-fA-F]{6}$/.test(textInput.value)) {
			colorInput.value = textInput.value;
		}
	});

	const buttonContainer = document.createElement("div");
	buttonContainer.className = "tategaki-color-picker-buttons";

	const cancelButton = document.createElement("button");
	cancelButton.textContent = "キャンセル";
	cancelButton.className = "mod-cta";

	const okButton = document.createElement("button");
	okButton.textContent = "OK";
	okButton.className = "mod-cta";

	const closeModal = () => {
		document.body.removeChild(modal);
	};

	cancelButton.addEventListener("click", closeModal);
	okButton.addEventListener("click", () => {
		onColorSelect(colorInput.value);
		closeModal();
	});

	textInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			onColorSelect(colorInput.value);
			closeModal();
		} else if (e.key === "Escape") {
			closeModal();
		}
	});

	modal.addEventListener("click", (e) => {
		if (e.target === modal) {
			closeModal();
		}
	});

	inputContainer.appendChild(colorInput);
	inputContainer.appendChild(textInput);
	buttonContainer.appendChild(cancelButton);
	buttonContainer.appendChild(okButton);
	content.appendChild(titleEl);
	content.appendChild(inputContainer);
	content.appendChild(buttonContainer);
	modal.appendChild(content);
	document.body.appendChild(modal);

	setTimeout(() => textInput.focus(), 100);
}

/**
 * 設定パネルモーダル
 */
export class SettingsPanelModal extends Modal {
	private plugin: TategakiV2Plugin;
	private onSettingsChange: (
		settings: Partial<TategakiV2Settings>,
	) => void | Promise<void>;
	private tempSettings: TategakiV2Settings;
	private panelContext: SettingsPanelContext;
	private applySettingsTimer: number | null = null;
	private lastAppliedSettingsSnapshot = "";
	private static readonly APPLY_DEBOUNCE_MS = 120;

	constructor(
		app: App,
		plugin: TategakiV2Plugin,
		onSettingsChange: (
			settings: Partial<TategakiV2Settings>,
		) => void | Promise<void>,
		context?: Partial<SettingsPanelContext>,
	) {
		super(app);
		this.plugin = plugin;
		this.onSettingsChange = onSettingsChange;
		this.tempSettings = JSON.parse(JSON.stringify(plugin.settings));
		if (!Array.isArray(this.tempSettings.customFonts)) {
			this.tempSettings.customFonts = [];
		}
		this.panelContext = {
			mode: context?.mode ?? "sot",
			isCeImeMode: context?.isCeImeMode ?? false,
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tategaki-settings-modal");

		// 背景マスクを薄くして、背後のテキストを確認しながら設定できるようにする
		this.containerEl.addClass("tategaki-settings-modal-container");

		// タイトル
		contentEl.createEl("h2", { text: "表示設定" });

		// スクロール可能なコンテナ
		const scrollContainer = contentEl.createDiv(
			"settings-scroll-container tategaki-settings-scroll-container",
		);

		this.createSettingsUI(scrollContainer);
	}

	/** 折りたたみ可能なセクションを作成 */
	private createCollapsibleSection(
		container: HTMLElement,
		icon: string,
		title: string,
		initiallyOpen: boolean,
		builder: (content: HTMLElement) => void,
	): HTMLElement {
		const initialOpen = initiallyOpen;
		const section = container.createDiv("tategaki-settings-section");

		// ヘッダー（クリックで開閉）
		const header = section.createDiv("tategaki-settings-section-header");
		header.setAttribute("aria-expanded", initialOpen ? "true" : "false");

		// 開閉矢印
		const chevron = header.createSpan();
		chevron.className = "tategaki-settings-section-chevron";
		setIcon(chevron, initialOpen ? "chevron-down" : "chevron-right");

		// アイコン（Lucide）
		const iconEl = header.createSpan();
		iconEl.className = "tategaki-settings-section-icon";
		setIcon(iconEl, icon);

		// タイトル
		const titleEl = header.createSpan();
		titleEl.textContent = title;
		titleEl.className = "tategaki-settings-section-title";

		// コンテンツ領域
		const content = section.createDiv("tategaki-settings-section-content");
		if (initialOpen) {
			content.addClass("is-open");
		}

		let isOpen = initialOpen;
		header.addEventListener("click", () => {
			isOpen = !isOpen;
			setIcon(chevron, isOpen ? "chevron-down" : "chevron-right");
			header.setAttribute("aria-expanded", isOpen ? "true" : "false");
			content.toggleClass("is-open", isOpen);
		});

		builder(content);

		return section;
	}

	private createSettingsUI(container: HTMLElement): void {
		const isCompatMode = this.panelContext.mode === "compat";
		const isCeImeMode = !!this.panelContext.isCeImeMode;
		const imeDisabled = isCompatMode || isCeImeMode;
		const imeDisabledReason = isCompatMode
			? "互換モードでは反映されません"
			: "CE補助(IME)中は反映されません";
		const caretWidthDisabled = isCompatMode || isCeImeMode;
		const caretWidthReason = isCompatMode
			? "互換モードでは反映されません"
			: "CE補助(IME)中は反映されません";
		const ceNativeCaretDisabled = isCompatMode;
		const ceNativeCaretReason = "互換モードでは利用できません";

		// スライダーへの参照を保持
		let lineHeightSlider: HTMLInputElement;
		let lineHeightValueSpan: HTMLSpanElement;
		let rubySizeSlider: HTMLInputElement;
		let rubySizeValueSpan: HTMLSpanElement;
		let rubyGapSlider: HTMLInputElement | null = null;
		let rubyGapValueSpan: HTMLSpanElement | null = null;

		// ─── 基本設定 ───
		this.createCollapsibleSection(
			container,
			"sliders-horizontal",
			"基本設定",
			false,
				(content) => {
				// 書字方向
					this.createSettingItem(
						content,
						"書字方向",
						"縦書きまたは横書きを選択",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select";

						select.createEl("option", {
							text: "縦書き",
							value: "vertical-rl",
						});
						select.createEl("option", {
							text: "横書き",
							value: "horizontal-tb",
						});

						select.value = this.tempSettings.common.writingMode;

						select.addEventListener("change", () => {
							this.tempSettings.common.writingMode =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// 選択: ネイティブ（巨大文書向け）
				this.createSettingItem(
					content,
					"選択をネイティブにする",
					"大きな範囲選択・端超えオートスクロール時のみネイティブ選択を補助的に使います（通常時はSoT選択を優先）",
					(itemEl) => {
						const button = itemEl.createEl("button", {
							cls: "tategaki-toggle-button",
						});

						const getCurrent = () =>
							this.tempSettings.wysiwyg.useNativeSelection ===
							true;

							const refresh = (enabled: boolean) => {
								this.updateToggleButton(
									button,
									enabled,
									"使用する",
									"使用しない",
								);
							};

						refresh(getCurrent());

						button.addEventListener("click", () => {
							const next = !getCurrent();
							this.tempSettings.wysiwyg.useNativeSelection =
								next;
							refresh(next);
							this.applySettings();
						});
					},
					{
						disabled: isCompatMode,
						disabledReason: isCompatMode
							? "互換モードでは反映されません"
							: undefined,
					},
				);

				// SoT全文プレーン表示
				this.createSettingItem(
					content,
					"全文プレーン表示（SoT）",
					"Markdown装飾・ルビの表示を行わず、記号をそのまま表示します（ソーステキスト編集は無効）",
					(itemEl) => {
						const button = itemEl.createEl("button", {
							cls: "tategaki-toggle-button",
						});

						const getCurrent = () =>
							this.tempSettings.wysiwyg.plainTextView === true;

							const refresh = (enabled: boolean) => {
								this.updateToggleButton(
									button,
									enabled,
									"有効",
									"無効",
								);
							};

						refresh(getCurrent());

						button.addEventListener("click", () => {
							const next = !getCurrent();
							this.tempSettings.wysiwyg.plainTextView = next;
							refresh(next);
							this.applySettings();
						});
					},
					{
						disabled: isCompatMode,
						disabledReason: isCompatMode
							? "互換モードでは反映されません"
							: undefined,
					},
				);

					// ページ枠の表示
					this.createSettingItem(
						content,
						"ページ枠の表示",
						"ページ枠を表示するか、全画面表示にするかを選択",
						(itemEl) => {
						const button = itemEl.createEl("button", {
							cls: "tategaki-toggle-button",
						});

						const isFrameVisible = () => {
							const rawScale = Number(
								this.tempSettings.common.pageScale ?? 1,
							);
							return rawScale <= 1;
						};

							const refresh = (visible: boolean) => {
								this.updateToggleButton(
									button,
									visible,
									"表示中",
									"非表示",
								);
							};

						refresh(isFrameVisible());

						button.addEventListener("click", () => {
							const nextVisible = !isFrameVisible();
							this.tempSettings.common.pageScale = nextVisible
								? 1.0
								: 1.05;
							refresh(nextVisible);
							this.applySettings();
						});
					},
				);
			},
		);

	// ─── フォント ───
	this.createCollapsibleSection(
		container,
		"type",
		"フォント",
		false,
			(content) => {
				// フォント選択
				this.createSettingItem(
					content,
					"フォント",
					"ゴシック体、明朝体、またはカスタムフォントを選択できます",
					(itemEl) => {
						if (!Array.isArray(this.tempSettings.customFonts)) {
							this.tempSettings.customFonts = [];
						}

							const wrapper = itemEl.createDiv(
								"tategaki-font-setting-wrapper",
							);

							const select = wrapper.createEl("select");
							select.className = "tategaki-settings-select";

						const sansSerifStack =
							'-apple-system, BlinkMacSystemFont, "Segoe UI", "Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Source Han Sans", Roboto, "Helvetica Neue", Arial, sans-serif';
						const serifStack =
							'"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", "Source Han Serif", Georgia, "Times New Roman", serif';

						select.createEl("option", {
							text: "ゴシック体",
							value: sansSerifStack,
						});
						select.createEl("option", {
							text: "明朝体",
							value: serifStack,
						});

						const customOptionGroup = select.createEl("optgroup");
						customOptionGroup.label = "カスタム";

							const helper = wrapper.createDiv();
							helper.className = "tategaki-font-setting-helper";
							helper.textContent =
								"各システムの標準的なフォントが使用されます。";

							const customSection = wrapper.createDiv(
								"tategaki-font-custom-section",
							);

							const customLabel = customSection.createEl("div");
							customLabel.className = "tategaki-font-custom-label";
							customLabel.textContent = "カスタムフォント";

							const inputRow = customSection.createDiv(
								"tategaki-font-custom-input-row",
							);

							const customInput = inputRow.createEl("input");
							customInput.type = "text";
							customInput.placeholder = "フォント名を入力（例: 游明朝）";
							customInput.className = "tategaki-font-custom-input";

							const addButton = inputRow.createEl("button");
							addButton.textContent = "追加";
							addButton.className = "tategaki-font-custom-add-button";

							const fontListContainer = customSection.createDiv(
								"tategaki-font-list-container",
							);

						let draggedIndex: number | null = null;

						const updateCustomOptions = () => {
							while (customOptionGroup.firstChild) {
								customOptionGroup.removeChild(
									customOptionGroup.firstChild,
								);
							}

							while (fontListContainer.firstChild) {
								fontListContainer.removeChild(
									fontListContainer.firstChild,
								);
							}

							if (
								this.tempSettings.customFonts &&
								this.tempSettings.customFonts.length > 0
							) {
								this.tempSettings.customFonts.forEach(
									(font, index) => {
										customOptionGroup.createEl("option", {
											text: font,
											value: font,
										});

											const fontItem =
												fontListContainer.createDiv();
											fontItem.draggable = true;
											fontItem.setAttribute(
												"data-font-index",
												index.toString(),
											);
											fontItem.className = "tategaki-custom-font-item";

											const dragHandle =
												fontItem.createSpan();
											dragHandle.textContent = "⋮⋮";
											dragHandle.className =
												"tategaki-custom-font-drag-handle";

											const fontName = fontItem.createSpan();
											fontName.textContent = font;
											fontName.className = "tategaki-custom-font-name";
											fontName.style.fontFamily = font;

											const deleteButton =
												fontItem.createEl("button");
											deleteButton.textContent = "削除";
											deleteButton.className =
												"tategaki-custom-font-delete-button";
										deleteButton.addEventListener(
											"click",
											() => {
												const idx =
													this.tempSettings.customFonts.indexOf(
														font,
													);
												if (idx > -1) {
													this.tempSettings.customFonts.splice(
														idx,
														1,
													);
													updateCustomOptions();

													if (
														this.tempSettings.common
															.fontFamily === font
													) {
														select.value =
															sansSerifStack;
														this.tempSettings.common.fontFamily =
															sansSerifStack;
														this.applySettings();
													}
												}
											},
										);

											fontItem.addEventListener(
												"dragstart",
												(e) => {
													draggedIndex = index;
													fontItem.addClass("is-dragging");
													if (e.dataTransfer) {
														e.dataTransfer.effectAllowed =
															"move";
													}
												},
										);

											fontItem.addEventListener(
												"dragend",
												() => {
													fontItem.removeClass("is-dragging");
													fontItem.removeClass("drop-top");
													fontItem.removeClass("drop-bottom");
													draggedIndex = null;
												},
											);

										fontItem.addEventListener(
											"dragover",
											(e) => {
												e.preventDefault();
												if (
													draggedIndex === null ||
													draggedIndex === index
												) {
													return;
												}
													if (e.dataTransfer) {
														e.dataTransfer.dropEffect =
															"move";
													}
													fontItem.toggleClass(
														"drop-top",
														draggedIndex < index,
													);
													fontItem.toggleClass(
														"drop-bottom",
														draggedIndex > index,
													);
												},
											);

											fontItem.addEventListener(
												"dragleave",
												() => {
													fontItem.removeClass("drop-top");
													fontItem.removeClass("drop-bottom");
												},
											);

											fontItem.addEventListener(
												"drop",
												(e) => {
													e.preventDefault();
													fontItem.removeClass("drop-top");
													fontItem.removeClass("drop-bottom");

												if (
													draggedIndex === null ||
													draggedIndex === index
												) {
													return;
												}

												const fonts = [
													...this.tempSettings
														.customFonts,
												];
												const [removed] = fonts.splice(
													draggedIndex,
													1,
												);
												fonts.splice(index, 0, removed);
												this.tempSettings.customFonts =
													fonts;

												updateCustomOptions();
												this.applySettings();
											},
										);
									},
								);
							}
						};

						const addCustomFont = () => {
							const raw = customInput.value.trim();
							if (!raw) return;
							if (!Array.isArray(this.tempSettings.customFonts)) {
								this.tempSettings.customFonts = [];
							}
							const exists = this.tempSettings.customFonts.some(
								(font) =>
									font.toLowerCase() === raw.toLowerCase(),
							);
							if (exists) {
								customInput.value = "";
								select.value = raw;
								this.tempSettings.common.fontFamily = raw;
								this.applySettings();
								return;
							}
							this.tempSettings.customFonts.push(raw);
							customInput.value = "";
							updateCustomOptions();
							select.value = raw;
							this.tempSettings.common.fontFamily = raw;
							this.applySettings();
						};

						addButton.addEventListener("click", () => {
							addCustomFont();
						});
						customInput.addEventListener("keydown", (event) => {
							if (event.key === "Enter" && !event.isComposing) {
								event.preventDefault();
								addCustomFont();
							}
						});

						select.addEventListener("change", () => {
							if (select.value) {
								this.tempSettings.common.fontFamily =
									select.value;
								this.applySettings();
							}
						});

						updateCustomOptions();
						const currentFont =
							this.tempSettings.common.fontFamily?.trim() ?? "";
						if (
							currentFont === sansSerifStack ||
							currentFont.includes("sans-serif") ||
							!currentFont
						) {
							select.value = sansSerifStack;
						} else if (
							currentFont === serifStack ||
							currentFont.includes("serif")
						) {
							select.value = serifStack;
						} else if (
							this.tempSettings.customFonts?.includes(currentFont)
						) {
							select.value = currentFont;
						} else {
							select.value = sansSerifStack;
						}
					},
				);

				// フォントサイズ
					this.createSettingItem(
						content,
						"フォントサイズ",
						"文字の大きさを調整",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

							const slider = wrapper.createEl("input");
							slider.type = "range";
							slider.min = "12";
							slider.max = "32";
							slider.step = "1";
							slider.value =
								this.tempSettings.common.fontSize.toString();
							slider.className = "tategaki-slider-input";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = `${this.tempSettings.common.fontSize}px`;
							valueSpan.className = "tategaki-slider-value";

						slider.addEventListener("input", () => {
							const value = parseInt(slider.value);
							this.tempSettings.common.fontSize = value;
							valueSpan.textContent = `${value}px`;
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);

				// 行間
					this.createSettingItem(
						content,
						"行間",
						"行の間隔を調整",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						lineHeightSlider = wrapper.createEl("input");
						lineHeightSlider.type = "range";
						lineHeightSlider.min = "1.5";
						lineHeightSlider.max = "3.0";
						lineHeightSlider.step = "0.1";
						lineHeightSlider.value =
							this.tempSettings.common.lineHeight.toFixed(1);

							lineHeightSlider.className = "tategaki-slider-input";

						lineHeightValueSpan = wrapper.createEl("span");
						lineHeightValueSpan.textContent =
							this.tempSettings.common.lineHeight.toFixed(1);
							lineHeightValueSpan.className = "tategaki-slider-value";

						lineHeightSlider.addEventListener("input", () => {
							const value = parseFloat(lineHeightSlider.value);
							this.tempSettings.common.lineHeight = value;
							lineHeightValueSpan.textContent = value.toFixed(1);
							this.applySettings({ debounce: true });
						});

						lineHeightSlider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);

				// 文字間
					this.createSettingItem(
						content,
						"文字間",
						"文字の間隔を調整（0 = 通常）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
							slider.min = "-0.1";
							slider.max = "0.5";
							slider.step = "0.01";
							slider.value =
								this.tempSettings.common.letterSpacing.toString();
							slider.className = "tategaki-slider-input";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent =
								this.tempSettings.common.letterSpacing.toFixed(2);
							valueSpan.className = "tategaki-slider-value";

						slider.addEventListener("input", () => {
							const value = parseFloat(slider.value);
							this.tempSettings.common.letterSpacing = value;
							valueSpan.textContent = value.toFixed(2);
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);
			},
		);

		// ─── ルビ ───
		this.createCollapsibleSection(
			container,
			"gem",
			"ルビ",
			false,
			(content) => {
				// ルビ表示
				this.createSettingItem(
					content,
					"ルビ表示",
					"オフにするとルビタグを生成せず、青空記法（｜本文《よみ》）のまま表示します",
					(itemEl) => {
						const button = itemEl.createEl("button", {
							cls: "tategaki-toggle-button",
						});

							const refresh = (enabled: boolean) => {
								this.updateToggleButton(
									button,
									enabled,
									"表示中",
									"非表示",
								);
							};

						const getCurrent = () =>
							this.tempSettings.wysiwyg.enableRuby !== false;

						refresh(getCurrent());

						button.addEventListener("click", () => {
							const next = !getCurrent();
							this.tempSettings.wysiwyg.enableRuby = next;
							refresh(next);
							this.applySettings();
						});
					},
				);

				// ルビサイズ
					this.createSettingItem(
						content,
						"ルビサイズ",
						"ルビ（ふりがな）の大きさを調整",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						rubySizeSlider = wrapper.createEl("input");
						rubySizeSlider.type = "range";
						rubySizeSlider.min = "0.3";
						rubySizeSlider.max = "1.0";
						rubySizeSlider.step = "0.05";
						rubySizeSlider.value =
							this.tempSettings.common.rubySize.toFixed(2);

							rubySizeSlider.className = "tategaki-slider-input";

						rubySizeValueSpan = wrapper.createEl("span");
						rubySizeValueSpan.textContent =
							this.tempSettings.common.rubySize.toFixed(2);
							rubySizeValueSpan.className = "tategaki-slider-value";

						rubySizeSlider.addEventListener("input", () => {
							const value = parseFloat(rubySizeSlider.value);
							this.tempSettings.common.rubySize = value;
							rubySizeValueSpan.textContent = value.toFixed(2);
							this.applySettings({ debounce: true });
						});

						rubySizeSlider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);

				// ルビ位置
					this.createSettingItem(
						content,
						"ルビ位置",
						"左＝文字に近づける / 右＝文字から遠ざける（縦は加減算、横は逆符号で加減算）",
						(itemEl) => {
							const wrapper = itemEl.createDiv(
								"tategaki-slider-control is-wrap",
							);

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "-1.5";
						slider.max = "1.5";
						slider.step = "0.1";
							const initialValue = Math.min(
								1.5,
								Math.max(
									-1.5,
									this.tempSettings.common.rubyVerticalGap ?? 0,
								),
							);
							slider.value = initialValue.toString();
							slider.className = "tategaki-slider-input is-wide";
							rubyGapSlider = slider;

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = initialValue.toFixed(1);
							valueSpan.className = "tategaki-slider-value is-wide";
							rubyGapValueSpan = valueSpan;

						const applyValue = (raw: number) => {
							const clamped = Math.min(1.5, Math.max(-1.5, raw));
							const vertical = clamped;
							const horizontal = -clamped - 1;
							this.tempSettings.common.rubyVerticalGap = vertical;
							this.tempSettings.common.rubyHorizontalGap =
								horizontal;
							if (rubyGapValueSpan) {
								rubyGapValueSpan.textContent =
									clamped.toFixed(1);
							}
							if (
								rubyGapSlider &&
								rubyGapSlider.value !== clamped.toString()
							) {
								rubyGapSlider.value = clamped.toString();
							}
						};

						slider.addEventListener("input", () => {
							const value = parseFloat(slider.value);
							applyValue(value);
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);
			},
		);

		// ─── 色設定 ───
		this.createCollapsibleSection(
			container,
			"palette",
			"色設定",
			false,
			(content) => {
				// 文字色
					this.createColorSettingItem(
						content,
						"文字色",
						this.tempSettings.common.textColor,
						DEFAULT_V2_SETTINGS.common.textColor,
						(color) => {
							this.tempSettings.common.textColor = color;
							this.applySettings();
						},
				);

				// ページ色
					this.createColorSettingItem(
						content,
						"ページ色",
						this.tempSettings.common.backgroundColor,
						DEFAULT_V2_SETTINGS.common.backgroundColor,
						(color) => {
							this.tempSettings.common.backgroundColor = color;
							this.applySettings();
						},
				);

				// 背景色
					this.createColorSettingItem(
						content,
						"背景色",
						this.tempSettings.common.pageBackgroundColor,
						DEFAULT_V2_SETTINGS.common.pageBackgroundColor,
						(color) => {
							this.tempSettings.common.pageBackgroundColor = color;
							this.applySettings();
						},
				);
			},
		);

		// ─── 見出し設定 ───
		this.createCollapsibleSection(
			container,
			"heading",
			"見出し設定",
			false,
			(content) => {
				// 見出しフォント
					this.createSettingItem(
						content,
						"見出しフォント",
						"見出し専用のフォントを選択（本文のカスタムフォントも使用可能）",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-wide";

						const sansSerifStack =
							'-apple-system, BlinkMacSystemFont, "Segoe UI", "Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Source Han Sans", Roboto, "Helvetica Neue", Arial, sans-serif';
						const serifStack =
							'"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", "Source Han Serif", Georgia, "Times New Roman", serif';

						select.createEl("option", {
							text: "本文と同じ",
							value: "",
						});
						select.createEl("option", {
							text: "ゴシック体",
							value: sansSerifStack,
						});
						select.createEl("option", {
							text: "明朝体",
							value: serifStack,
						});

						const customOptionGroup = select.createEl("optgroup");
						customOptionGroup.label = "カスタム";

						const updateCustomOptions = () => {
							while (customOptionGroup.firstChild) {
								customOptionGroup.removeChild(
									customOptionGroup.firstChild,
								);
							}
							if (
								this.tempSettings.customFonts &&
								this.tempSettings.customFonts.length > 0
							) {
								this.tempSettings.customFonts.forEach(
									(font) => {
										customOptionGroup.createEl("option", {
											text: font,
											value: font,
										});
									},
								);
							}
						};

						updateCustomOptions();

						const currentHeadingFont =
							this.tempSettings.common.headingFontFamily?.trim() ??
							"";
						if (!currentHeadingFont) {
							select.value = "";
						} else if (
							currentHeadingFont === sansSerifStack ||
							currentHeadingFont.includes("sans-serif")
						) {
							select.value = sansSerifStack;
						} else if (
							currentHeadingFont === serifStack ||
							currentHeadingFont.includes("serif")
						) {
							select.value = serifStack;
						} else if (
							this.tempSettings.customFonts?.includes(
								currentHeadingFont,
							)
						) {
							select.value = currentHeadingFont;
						} else {
							if (currentHeadingFont) {
								customOptionGroup.createEl("option", {
									text: currentHeadingFont,
									value: currentHeadingFont,
								});
								select.value = currentHeadingFont;
							} else {
								select.value = "";
							}
						}

						select.addEventListener("change", () => {
							this.tempSettings.common.headingFontFamily =
								select.value;
							this.applySettings();
						});
					},
				);

				// 見出し文字色
					this.createColorSettingItem(
						content,
						"見出し文字色",
						this.tempSettings.common.headingTextColor ||
							this.tempSettings.common.textColor,
						this.tempSettings.common.textColor ||
							DEFAULT_V2_SETTINGS.common.textColor,
						(color) => {
							this.tempSettings.common.headingTextColor = color;
							this.applySettings();
						},
				);

				// 見出し文字色リセットボタン
				this.createSettingItem(
					content,
					"見出し文字色をリセット",
					"本文と同じ色に戻します",
						(itemEl) => {
							const button = itemEl.createEl("button");
							button.textContent = "リセット";
							button.className = "tategaki-settings-action-button";
							button.addEventListener("click", () => {
								this.tempSettings.common.headingTextColor = "";
								this.applySettings();
								this.onOpen();
						});
					},
				);
			},
		);

		// ─── 余白設定 ───
		this.createCollapsibleSection(
			container,
			"move-horizontal",
			"余白設定",
			false,
			(content) => {
				// 上余白
				this.createSettingItem(
						content,
						"上余白",
						"ページ上部の余白を調整（0〜200px）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "0";
						slider.max = "200";
							slider.step = "2";
							slider.value = (
								this.tempSettings.wysiwyg.sotPaddingTop ?? 32
							).toString();
							slider.className = "tategaki-slider-input";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = `${this.tempSettings.wysiwyg.sotPaddingTop ?? 32}px`;
							valueSpan.className = "tategaki-slider-value is-wide";

						slider.addEventListener("input", () => {
							const value = parseInt(slider.value);
							this.tempSettings.wysiwyg.sotPaddingTop = value;
							valueSpan.textContent = `${value}px`;
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);

				// 下余白
				this.createSettingItem(
						content,
						"下余白",
						"ページ下部の余白を調整（0〜200px）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "0";
						slider.max = "200";
							slider.step = "2";
							slider.value = (
								this.tempSettings.wysiwyg.sotPaddingBottom ?? 16
							).toString();
							slider.className = "tategaki-slider-input";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = `${this.tempSettings.wysiwyg.sotPaddingBottom ?? 16}px`;
							valueSpan.className = "tategaki-slider-value is-wide";

						slider.addEventListener("input", () => {
							const value = parseInt(slider.value);
							this.tempSettings.wysiwyg.sotPaddingBottom = value;
							valueSpan.textContent = `${value}px`;
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);
			},
		);

		// ─── キャレット設定 ───
		this.createCollapsibleSection(
			container,
			"text-cursor",
			"キャレット設定",
			false,
			(content) => {
				// キャレット色
				this.createSettingItem(
						content,
						"キャレットの色",
						"文字色 / ハイライト色 / カスタム色 から選択できます",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-medium";

						select.createEl("option", {
							text: "文字色",
							value: "text",
						});
						select.createEl("option", {
							text: "ハイライト色",
							value: "accent",
						});
						select.createEl("option", {
							text: "カスタム色",
							value: "custom",
						});

						select.value =
							this.tempSettings.wysiwyg.caretColorMode ??
							DEFAULT_V2_SETTINGS.wysiwyg.caretColorMode ??
							"accent";

						select.addEventListener("change", () => {
							this.tempSettings.wysiwyg.caretColorMode =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// キャレットのカスタム色
					this.createColorSettingItem(
						content,
						"キャレットのカスタム色",
						this.tempSettings.wysiwyg.caretCustomColor ||
							DEFAULT_V2_SETTINGS.wysiwyg.caretCustomColor ||
							"#1e90ff",
						DEFAULT_V2_SETTINGS.wysiwyg.caretCustomColor || "#1e90ff",
						(color) => {
							this.tempSettings.wysiwyg.caretCustomColor = color;
							this.applySettings();
						},
				);

				// キャレット幅
				this.createSettingItem(
						content,
						"キャレットの幅",
						"キャレットの太さを調整します（px）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "1";
						slider.max = "8";
						slider.step = "0.5";
							const initialValue =
								this.tempSettings.wysiwyg.caretWidthPx ??
								DEFAULT_V2_SETTINGS.wysiwyg.caretWidthPx ??
								3;
							slider.value = initialValue.toString();
							slider.className = "tategaki-slider-input is-medium";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = `${initialValue}px`;
							valueSpan.className = "tategaki-slider-value is-wide";

						slider.addEventListener("input", () => {
							const value = parseFloat(slider.value);
							this.tempSettings.wysiwyg.caretWidthPx = value;
							valueSpan.textContent = `${value}px`;
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
					{
						disabled: caretWidthDisabled,
						disabledReason: caretWidthDisabled
							? caretWidthReason
							: undefined,
					},
				);

				// CE補助モード: ネイティブキャレット
					this.createSettingItem(
						content,
						"CE補助モードでネイティブキャレットを使用",
						"CE補助(IME)をオンにしたとき、OS標準のキャレットを使うか選べます",
						(itemEl) => {
						const button = itemEl.createEl("button", {
							cls: "tategaki-toggle-button",
						});

						const getCurrent = () =>
							this.tempSettings.wysiwyg.ceUseNativeCaret !==
							false;

							const refresh = (enabled: boolean) => {
								this.updateToggleButton(
									button,
									enabled,
									"使用する",
									"使用しない",
								);
							};

						refresh(getCurrent());

						button.addEventListener("click", () => {
							const next = !getCurrent();
							this.tempSettings.wysiwyg.ceUseNativeCaret = next;
							refresh(next);
							this.applySettings();
						});
					},
					{
						disabled: ceNativeCaretDisabled,
						disabledReason: ceNativeCaretDisabled
							? ceNativeCaretReason
							: undefined,
					},
				);
			},
		);

		// ─── IME表示の補正 ───
		this.createCollapsibleSection(
			container,
			"keyboard",
			"IME表示の補正",
			false,
			(content) => {
				// 横書きIME: 上方向補正
				this.createSettingItem(
						content,
						"横書き: 上方向補正",
						"横書きIMEの表示位置を、上方向(+) / 下方向(-)に調整します（em単位）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "-1";
						slider.max = "1";
						slider.step = "0.01";
							const initialValue =
								this.tempSettings.wysiwyg.imeOffsetHorizontalEm ??
								DEFAULT_V2_SETTINGS.wysiwyg.imeOffsetHorizontalEm ??
								0;
							slider.value = initialValue.toFixed(2);
							slider.className = "tategaki-slider-input is-medium";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = initialValue.toFixed(2);
							valueSpan.className = "tategaki-slider-value is-wide";

						slider.addEventListener("input", () => {
							const value = parseFloat(slider.value);
							this.tempSettings.wysiwyg.imeOffsetHorizontalEm =
								value;
							valueSpan.textContent = value.toFixed(2);
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
					{
						disabled: imeDisabled,
						disabledReason: imeDisabled ? imeDisabledReason : undefined,
					},
				);

				// 縦書きIME: 右方向補正
				this.createSettingItem(
						content,
						"縦書き: 右方向補正",
						"縦書きIMEの表示位置を、右方向(+) / 左方向(-)に調整します（em単位）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "-1";
						slider.max = "1";
						slider.step = "0.01";
							const initialValue =
								this.tempSettings.wysiwyg.imeOffsetVerticalEm ??
								DEFAULT_V2_SETTINGS.wysiwyg.imeOffsetVerticalEm ??
								0;
							slider.value = initialValue.toFixed(2);
							slider.className = "tategaki-slider-input is-medium";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = initialValue.toFixed(2);
							valueSpan.className = "tategaki-slider-value is-wide";

						slider.addEventListener("input", () => {
							const value = parseFloat(slider.value);
							this.tempSettings.wysiwyg.imeOffsetVerticalEm =
								value;
							valueSpan.textContent = value.toFixed(2);
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
					{
						disabled: imeDisabled,
						disabledReason: imeDisabled ? imeDisabledReason : undefined,
					},
				);
			},
		);

		// ─── 参照設定 ───
		this.createCollapsibleSection(
			container,
			"file-text",
			"参照設定",
			false,
			(content) => {
				// フロントマター表示設定
				this.createSettingItem(
					content,
					"フロントマター情報を表示",
					"YAML自体ではなく、title/authorなどの内容を本文先頭に表示します",
					(itemEl) => {
						const button = itemEl.createEl("button", {
							cls: "tategaki-toggle-button",
						});

						const setVisibility = (visible: boolean) => {
							const nextHide = !visible;
							this.tempSettings.preview.hideFrontmatter =
								nextHide;
							this.tempSettings.preview.showFrontmatterTitle =
								visible;
							this.tempSettings.preview.showFrontmatterSubtitle =
								visible;
							this.tempSettings.preview.showFrontmatterOriginalTitle =
								visible;
							this.tempSettings.preview.showFrontmatterAuthor =
								visible;
							this.tempSettings.preview.showFrontmatterCoAuthors =
								visible;
							this.tempSettings.preview.showFrontmatterTranslator =
								visible;
							this.tempSettings.preview.showFrontmatterCoTranslators =
								visible;
							this.applySettings();
						};

							const refreshButton = () => {
								const visible = !(
									this.tempSettings.preview.hideFrontmatter ??
									true
								);
								this.updateToggleButton(
									button,
									visible,
									"表示中",
									"非表示",
								);
							};

						setVisibility(
							!(
								this.tempSettings.preview.hideFrontmatter ??
								true
							),
						);
						refreshButton();

						button.addEventListener("click", () => {
							const visible = !(
								this.tempSettings.preview.hideFrontmatter ??
								true
							);
							setVisibility(!visible);
							refreshButton();
						});
					},
				);
			},
		);

		// ─── 書籍モード ───
		this.createCollapsibleSection(
			container,
			"book-open",
			"書籍モード",
			false,
			(content) => {
				// ヘッダーの内容
				this.createSettingItem(
						content,
						"ヘッダーの内容",
						"書籍モードのヘッダーに表示する内容を選びます",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-medium";

						select.createEl("option", {
							text: "表示しない",
							value: "none",
						});
						select.createEl("option", {
							text: "タイトル",
							value: "title",
						});
						select.createEl("option", {
							text: "ページ番号",
							value: "pageNumber",
						});

						select.value =
							this.tempSettings.preview.headerContent ?? "none";

						select.addEventListener("change", () => {
							this.tempSettings.preview.headerContent =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// ヘッダーの配置
				this.createSettingItem(
						content,
						"ヘッダーの配置",
						"ヘッダーの表示位置（左/中央/右）を選びます",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-medium";

						select.createEl("option", {
							text: "左",
							value: "left",
						});
						select.createEl("option", {
							text: "中央",
							value: "center",
						});
						select.createEl("option", {
							text: "右",
							value: "right",
						});

						select.value =
							this.tempSettings.preview.headerAlign ?? "center";

						select.addEventListener("change", () => {
							this.tempSettings.preview.headerAlign =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// フッターの内容
				this.createSettingItem(
						content,
						"フッターの内容",
						"書籍モードのフッターに表示する内容を選びます",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-medium";

						select.createEl("option", {
							text: "表示しない",
							value: "none",
						});
						select.createEl("option", {
							text: "タイトル",
							value: "title",
						});
						select.createEl("option", {
							text: "ページ番号",
							value: "pageNumber",
						});

						select.value =
							this.tempSettings.preview.footerContent ??
							"pageNumber";

						select.addEventListener("change", () => {
							this.tempSettings.preview.footerContent =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// フッターの配置
				this.createSettingItem(
						content,
						"フッターの配置",
						"フッターの表示位置（左/中央/右）を選びます",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-medium";

						select.createEl("option", {
							text: "左",
							value: "left",
						});
						select.createEl("option", {
							text: "中央",
							value: "center",
						});
						select.createEl("option", {
							text: "右",
							value: "right",
						});

						select.value =
							this.tempSettings.preview.footerAlign ?? "center";

						select.addEventListener("change", () => {
							this.tempSettings.preview.footerAlign =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// ページ番号の形式
				this.createSettingItem(
						content,
						"ページ番号の形式",
						"現在ページのみ / 現在ページと総ページ数 を選べます",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-wide";

						select.createEl("option", {
							text: "現在ページ",
							value: "current",
						});
						select.createEl("option", {
							text: "現在ページ/総ページ数",
							value: "currentTotal",
						});

						select.value =
							this.tempSettings.preview.pageNumberFormat ??
							"currentTotal";

						select.addEventListener("change", () => {
							this.tempSettings.preview.pageNumberFormat =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// ページ遷移効果
				this.createSettingItem(
						content,
						"ページ遷移効果",
						"ページ移動時の視覚効果を選びます",
						(itemEl) => {
							const select = itemEl.createEl("select");
							select.className = "tategaki-settings-select is-medium";

						select.createEl("option", {
							text: "なし",
							value: "none",
						});
						select.createEl("option", {
							text: "フェード",
							value: "fade",
						});
						select.createEl("option", {
							text: "スライド",
							value: "slide",
						});
						select.createEl("option", {
							text: "ぼかし",
							value: "blur",
						});

						select.value =
							this.tempSettings.preview.pageTransitionEffect ??
							"fade";

						select.addEventListener("change", () => {
							this.tempSettings.preview.pageTransitionEffect =
								select.value as any;
							this.applySettings();
						});
					},
				);

				// 上余白
				this.createSettingItem(
						content,
						"上余白",
						"書籍モード本文エリアの上余白を調整（0〜200px）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "0";
						slider.max = "200";
						slider.step = "2";
							slider.value = (
								this.tempSettings.preview.bookPaddingTop ??
								DEFAULT_V2_SETTINGS.preview.bookPaddingTop ??
								44
							).toString();
							slider.className = "tategaki-slider-input";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = `${this.tempSettings.preview.bookPaddingTop ?? DEFAULT_V2_SETTINGS.preview.bookPaddingTop ?? 44}px`;
							valueSpan.className = "tategaki-slider-value is-wide";

						slider.addEventListener("input", () => {
							const value = parseInt(slider.value, 10);
							this.tempSettings.preview.bookPaddingTop = value;
							valueSpan.textContent = `${value}px`;
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);

				// 下余白
				this.createSettingItem(
						content,
						"下余白",
						"書籍モード本文エリアの下余白を調整（0〜200px）",
						(itemEl) => {
							const wrapper = itemEl.createDiv("tategaki-slider-control");

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "0";
						slider.max = "200";
						slider.step = "2";
							slider.value = (
								this.tempSettings.preview.bookPaddingBottom ??
								DEFAULT_V2_SETTINGS.preview.bookPaddingBottom ??
								32
							).toString();
							slider.className = "tategaki-slider-input";

							const valueSpan = wrapper.createEl("span");
							valueSpan.textContent = `${this.tempSettings.preview.bookPaddingBottom ?? DEFAULT_V2_SETTINGS.preview.bookPaddingBottom ?? 32}px`;
							valueSpan.className = "tategaki-slider-value is-wide";

						slider.addEventListener("input", () => {
							const value = parseInt(slider.value, 10);
							this.tempSettings.preview.bookPaddingBottom = value;
							valueSpan.textContent = `${value}px`;
							this.applySettings({ debounce: true });
						});

						slider.addEventListener("change", () => {
							this.applySettings();
						});
					},
				);
			},
		);

		// ─── テーマ ───
		this.createCollapsibleSection(
			container,
			"paintbrush",
			"テーマ",
			false,
			(content) => {
				this.createThemeSelector(content);
			},
		);

		if (isCompatMode) {
			// ─── 同期バックアップ（互換モード） ───
			this.createCollapsibleSection(
				container,
				"archive",
				"同期バックアップ（互換モード）",
				false,
				(content) => {
					this.createSettingItem(
						content,
						"同期バックアップを作成",
						"互換モードの同期時にバックアップを作成します。OFFにするとバックアップは作成されません（事故時はObsidianの「Open version history」を利用してください）。",
						(itemEl) => {
							const button = itemEl.createEl("button", {
								cls: "tategaki-toggle-button",
							});
								const refresh = (enabled: boolean) => {
									this.updateToggleButton(
										button,
										enabled,
										"有効",
										"無効",
									);
								};
							const current = () =>
								!!this.tempSettings.wysiwyg.enableSyncBackup;
							refresh(current());
							button.addEventListener("click", () => {
								this.tempSettings.wysiwyg.enableSyncBackup =
									!current();
								this.applySettings();
								refresh(current());
							});
						},
					);

					this.createSettingItem(
						content,
						"同期バックアップフォルダを開く",
						"バックアップ保存先（.obsidian/tategaki-sync-backups）を開きます。",
							(itemEl) => {
								const button = itemEl.createEl("button");
								button.textContent = "開く";
								button.className = "tategaki-settings-action-button";
								button.addEventListener("click", () => {
									void this.plugin.openSyncBackupFolder();
								});
							},
					);

					this.createSettingItem(
						content,
						"同期バックアップをゴミ箱へ移動",
						"同期の安全策として作成されたバックアップをゴミ箱へ移動します（復元できなくなるので注意）。",
							(itemEl) => {
								const button = itemEl.createEl("button");
								button.textContent = "移動";
								button.className =
									"tategaki-settings-action-button tategaki-settings-action-button-danger";
								button.addEventListener("click", () => {
									void this.plugin.moveSyncBackupsToTrash();
								});
							},
					);

				},
			);
		}
	}

	private updateToggleButton(
		button: HTMLButtonElement,
		enabled: boolean,
		onText: string,
		offText: string,
	): void {
		button.textContent = enabled ? onText : offText;
		button.setAttr("aria-pressed", enabled ? "true" : "false");
		button.toggleClass("is-active", enabled);
	}

	private createSettingItem(
		container: HTMLElement,
		name: string,
		desc: string,
		controlBuilder: (itemEl: HTMLElement) => void | Promise<void>,
		options?: { disabled?: boolean; disabledReason?: string },
	): void {
		const settingItem = container.createDiv("setting-item tategaki-settings-item");

		const disabled = options?.disabled === true;
		if (disabled) {
			settingItem.addClass("is-disabled");
		}

		const infoContainer = settingItem.createDiv(
			"setting-item-info tategaki-settings-item-info",
		);

		infoContainer.createDiv({
			text: name,
			cls: "tategaki-settings-item-name",
		});

		infoContainer.createDiv({
			text: desc,
			cls: "tategaki-settings-item-desc",
		});
		if (options?.disabledReason) {
			infoContainer.createDiv({
				text: options.disabledReason,
				cls: "tategaki-settings-item-disabled-reason",
			});
		}

		const controlContainer = settingItem.createDiv(
			"setting-item-control tategaki-settings-item-control",
		);
		const result = controlBuilder(controlContainer);

		if (result instanceof Promise) {
			result
				.then(() => {
					if (disabled) {
						this.disableControls(controlContainer);
					}
				})
				.catch((err) =>
					console.error("Error building control:", err),
				);
		} else if (disabled) {
			this.disableControls(controlContainer);
		}
	}

	private disableControls(container: HTMLElement): void {
		container.addClass("tategaki-settings-control-disabled");
		const controls = container.querySelectorAll<
			HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
		>("input, select, textarea, button");
		controls.forEach((el) => {
			el.disabled = true;
		});
	}

	private createColorSettingItem(
		container: HTMLElement,
		name: string,
		initialColor: string,
		fallbackColor: string,
		onChange: (color: string) => void,
	): void {
		this.createSettingItem(
			container,
			name,
			"クリックして色を変更",
			(itemEl) => {
				let currentColor = resolveColorForSwatch(
					initialColor,
					fallbackColor,
				);
				const colorButton = itemEl.createEl("button");
				colorButton.className = "tategaki-settings-color-button";
				const swatch = colorButton.createSpan({
					cls: "tategaki-settings-color-swatch",
				});
				swatch.style.setProperty(
					"--tategaki-color-swatch",
					currentColor,
				);

				colorButton.addEventListener("click", () => {
					openColorPicker(
						`${name}を選択`,
						currentColor,
							(newColor) => {
								currentColor = resolveColorForSwatch(
									newColor,
									fallbackColor,
								);
								swatch.style.setProperty(
									"--tategaki-color-swatch",
									currentColor,
								);
							onChange(newColor);
						},
					);
				});
			},
		);
	}

	private createThemeSelector(container: HTMLElement): void {
		const themeContainer = container.createDiv("tategaki-theme-selector");

		// テーマ選択とボタンを横並びにするコンテナ
		const selectContainer = themeContainer.createDiv(
			"tategaki-theme-selector-row",
		);

		const select = selectContainer.createEl("select");
		select.className = "tategaki-theme-selector-select";

		// Obsidianベースオプションを追加
		select.createEl("option", {
			text: "Obsidian ベーステーマ",
			value: "obsidian-base",
		});

		// ユーザー作成テーマを追加
		const themes = this.tempSettings.themes || [];
		themes.forEach((theme) => {
			select.createEl("option", {
				text: theme.name,
				value: theme.id,
			});
		});

		select.value = this.tempSettings.activeTheme || "obsidian-base";

		// テーマ適用ボタン（同じテーマでも再適用可能）
		const applyButton = selectContainer.createEl("button");
		applyButton.textContent = "再適用";
		applyButton.className = "tategaki-theme-selector-button";

		// テーマ削除ボタン
		const deleteButton = selectContainer.createEl("button");
		deleteButton.textContent = "削除";
		deleteButton.className =
			"tategaki-theme-selector-button tategaki-theme-selector-button-warning mod-warning";
		// Obsidianベースとプリセットテーマは削除不可
		const isPresetTheme = (themeId: string) =>
			themeId === "obsidian-base" ||
			(PRESET_THEME_IDS as readonly string[]).includes(themeId);
		deleteButton.disabled = isPresetTheme(select.value);

		// テーマ適用処理（共通関数）
		const applyTheme = async (themeId: string) => {
			await this.plugin.loadTheme(themeId);
			// tempSettingsを更新
			this.tempSettings = JSON.parse(
				JSON.stringify(this.plugin.settings),
			);
			this.onOpen();
		};

		// 適用ボタンクリック時
			applyButton.addEventListener("click", () => {
				void applyTheme(select.value);
			});

			select.addEventListener("change", () => {
				const selectedThemeId = select.value;

			// 削除ボタンの有効/無効を切り替え
			deleteButton.disabled = isPresetTheme(selectedThemeId);

				// テーマを適用
				void applyTheme(selectedThemeId);
			});

			// テーマ削除処理
			deleteButton.addEventListener("click", () => {
				void (async () => {
					const selectedThemeId = select.value;
					if (isPresetTheme(selectedThemeId)) {
						return;
					}

					const theme = themes.find((t) => t.id === selectedThemeId);
					if (!theme) return;

					const confirmDelete = await showConfirmModal(this.app, {
						title: "テーマの削除",
						message: `テーマ「${theme.name}」を削除しますか？`,
						confirmText: "削除",
						cancelText: "キャンセル",
						confirmIsWarning: true,
					});
					if (confirmDelete) {
						await this.plugin.deleteTheme(selectedThemeId);
						// tempSettingsを更新
						this.tempSettings = JSON.parse(
							JSON.stringify(this.plugin.settings),
						);
						this.onOpen();
					}
				})();
			});

		// テーマ保存ボタン
		const saveButton = themeContainer.createEl("button");
		saveButton.textContent = "現在の設定をテーマとして保存";
		saveButton.className = "mod-cta tategaki-theme-selector-save-button";

			saveButton.addEventListener("click", () => {
				try {
					// Obsidianの組み込みモーダルを使用
					const modal = new ThemeNameInputModal(
						this.app,
						(themeName) => {
							void (async () => {
								try {
									// 現在の一時設定をプラグインに反映
									await this.plugin.updateSettings(this.tempSettings);

									// テーマとして保存
									await this.plugin.createThemeFromCurrentSettings(themeName);

									// tempSettingsを更新
									this.tempSettings = JSON.parse(
										JSON.stringify(this.plugin.settings),
									);
									this.onOpen();
								} catch (error) {
									console.error(
										"Tategaki: Failed to save theme:",
										error,
									);
								}
							})();
						},
					);
				modal.open();
			} catch (error) {
				console.error(
					"Tategaki: Failed to open theme name modal:",
					error,
				);
			}
		});
	}

	private applySettings(options?: { debounce?: boolean }): void {
		if (options?.debounce) {
			if (this.applySettingsTimer !== null) {
				window.clearTimeout(this.applySettingsTimer);
			}
			this.applySettingsTimer = window.setTimeout(() => {
				this.applySettingsTimer = null;
				this.applySettings();
			}, SettingsPanelModal.APPLY_DEBOUNCE_MS);
			return;
		}

		if (this.applySettingsTimer !== null) {
			window.clearTimeout(this.applySettingsTimer);
			this.applySettingsTimer = null;
		}

		const snapshot = JSON.stringify(this.tempSettings);
		if (snapshot === this.lastAppliedSettingsSnapshot) {
			return;
		}

		const previousSnapshot = this.lastAppliedSettingsSnapshot;
		this.lastAppliedSettingsSnapshot = snapshot;

		const nextSettings = JSON.parse(snapshot) as TategakiV2Settings;
		try {
			const result = this.onSettingsChange(nextSettings);
			if (result instanceof Promise) {
				result.catch((error) => {
					this.lastAppliedSettingsSnapshot = previousSnapshot;
					console.error(
						"Tategaki SettingsPanel: failed to apply settings",
						error,
					);
				});
			}
		} catch (error) {
			this.lastAppliedSettingsSnapshot = previousSnapshot;
			console.error(
				"Tategaki SettingsPanel: failed to apply settings",
				error,
			);
		}
	}

	private async saveAsTheme(themeName: string): Promise<void> {
		// 現在の設定をプラグインに同期
		await this.plugin.updateSettings(this.tempSettings);

		// プラグインのメソッドを使用してテーマを作成
		await this.plugin.createThemeFromCurrentSettings(
			themeName,
			"ユーザー作成テーマ",
		);

		// tempSettingsを更新
		this.tempSettings = JSON.parse(JSON.stringify(this.plugin.settings));
		this.onOpen(); // UIを再構築
	}

	onClose(): void {
		if (this.applySettingsTimer !== null) {
			window.clearTimeout(this.applySettingsTimer);
			this.applySettingsTimer = null;
		}
		const { contentEl } = this;
		contentEl.empty();
	}
}
