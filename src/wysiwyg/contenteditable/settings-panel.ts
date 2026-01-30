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
		candidates.map(async (font) => {
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
	modal.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
	`;

	const content = document.createElement("div");
	content.style.cssText = `
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		padding: 20px;
		min-width: 300px;
		box-shadow: var(--shadow-l);
	`;

	const titleEl = document.createElement("h3");
	titleEl.textContent = title;
	titleEl.style.cssText = `
		margin: 0 0 16px 0;
		color: var(--text-normal);
	`;

	const inputContainer = document.createElement("div");
	inputContainer.style.cssText = `
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 20px;
	`;

	const colorInput = document.createElement("input");
	colorInput.type = "color";
	colorInput.value = initialColor;
	colorInput.style.cssText = `
		width: 60px;
		height: 40px;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		cursor: pointer;
	`;

	const textInput = document.createElement("input");
	textInput.type = "text";
	textInput.value = initialColor;
	textInput.style.cssText = `
		flex: 1;
		padding: 8px 12px;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		background: var(--background-primary);
		color: var(--text-normal);
		font-family: var(--font-monospace);
	`;

	colorInput.addEventListener("input", () => {
		textInput.value = colorInput.value;
	});

	textInput.addEventListener("input", () => {
		if (/^#[0-9a-fA-F]{6}$/.test(textInput.value)) {
			colorInput.value = textInput.value;
		}
	});

	const buttonContainer = document.createElement("div");
	buttonContainer.style.cssText = `
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	`;

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
			"settings-scroll-container",
		);
		scrollContainer.style.cssText = `
			max-height: 60vh;
			overflow-y: auto;
			padding-right: 10px;
		`;

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
		const section = container.createDiv("tategaki-settings-section");
		section.style.cssText = `
			margin-bottom: 4px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 8px;
			overflow: hidden;
		`;

		// ヘッダー（クリックで開閉）
		const header = section.createDiv("tategaki-settings-section-header");
		header.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 10px 14px;
			cursor: pointer;
			user-select: none;
			background: var(--background-secondary);
			transition: background 0.15s ease;
		`;
		header.addEventListener("mouseenter", () => {
			header.style.background = "var(--background-modifier-hover)";
		});
		header.addEventListener("mouseleave", () => {
			header.style.background = "var(--background-secondary)";
		});

		// 開閉矢印
		const chevron = header.createSpan();
		chevron.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 16px;
			height: 16px;
			color: var(--text-muted);
			transition: transform 0.2s ease;
		`;
		setIcon(chevron, initiallyOpen ? "chevron-down" : "chevron-right");

		// アイコン（Lucide）
		const iconEl = header.createSpan();
		iconEl.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 18px;
			height: 18px;
			color: var(--text-muted);
		`;
		setIcon(iconEl, icon);

		// タイトル
		const titleEl = header.createSpan();
		titleEl.textContent = title;
		titleEl.style.cssText = `
			font-weight: 600;
			color: var(--text-normal);
			font-size: 0.95em;
		`;

		// コンテンツ領域
		const content = section.createDiv("tategaki-settings-section-content");
		content.style.cssText = `
			padding: ${initiallyOpen ? "4px 14px 10px" : "0 14px"};
			max-height: ${initiallyOpen ? "2000px" : "0"};
			overflow: hidden;
			transition: max-height 0.3s ease, padding 0.3s ease;
		`;

		let isOpen = initiallyOpen;
		header.addEventListener("click", () => {
			isOpen = !isOpen;
			setIcon(chevron, isOpen ? "chevron-down" : "chevron-right");
			content.style.maxHeight = isOpen ? "2000px" : "0";
			content.style.padding = isOpen ? "4px 14px 10px" : "0 14px";
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
			true,
			(content) => {
				// 書字方向
				this.createSettingItem(
					content,
					"書字方向",
					"縦書きまたは横書きを選択",
					(itemEl) => {
						const select = itemEl.createEl("select");
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
						`;

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
							button.textContent = visible ? "表示中" : "非表示";
							button.setAttr(
								"aria-pressed",
								visible ? "true" : "false",
							);
							button.style.cssText = `
								min-width: 96px;
								padding: 6px 12px;
								border-radius: 6px;
								border: 1px solid var(--background-modifier-border);
								background: ${
									visible
										? "var(--interactive-accent)"
										: "var(--interactive-normal)"
								};
								color: ${visible ? "var(--text-on-accent)" : "var(--text-normal)"};
								cursor: pointer;
								transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
							`;
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
			true,
			(content) => {
				// フォント選択
				this.createSettingItem(
					content,
					"フォント",
					"ゴシック体、明朝体、またはカスタムフォントを選択できます",
					async (itemEl) => {
						if (!Array.isArray(this.tempSettings.customFonts)) {
							this.tempSettings.customFonts = [];
						}

						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							flex-direction: column;
							gap: 8px;
							min-width: 220px;
						`;

						const select = wrapper.createEl("select");
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 200px;
						`;

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
						helper.style.cssText = `
							font-size: 0.8em;
							color: var(--text-muted);
						`;
						helper.textContent =
							"各システムの標準的なフォントが使用されます。";

						const customSection = wrapper.createDiv();
						customSection.style.cssText = `
							display: flex;
							flex-direction: column;
							gap: 6px;
							margin-top: 8px;
							padding-top: 8px;
							border-top: 1px solid var(--background-modifier-border);
						`;

						const customLabel = customSection.createEl("div");
						customLabel.style.cssText = `
							font-size: 0.9em;
							font-weight: 500;
							margin-bottom: 4px;
						`;
						customLabel.textContent = "カスタムフォント";

						const inputRow = customSection.createDiv();
						inputRow.style.cssText = `
							display: flex;
							gap: 6px;
						`;

						const customInput = inputRow.createEl("input");
						customInput.type = "text";
						customInput.placeholder =
							"フォント名を入力（例: Noto Serif JP）";
						customInput.style.cssText = `
							flex: 1;
							padding: 6px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
						`;

						const addButton = inputRow.createEl("button");
						addButton.textContent = "追加";
						addButton.style.cssText = `
							padding: 6px 10px;
						`;

						const fontListContainer = customSection.createDiv();
						fontListContainer.style.cssText = `
							display: flex;
							flex-direction: column;
							gap: 4px;
							margin-top: 8px;
							max-height: 100px;
							overflow-y: auto;
							padding-right: 4px;
						`;

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
										fontItem.style.cssText = `
										display: flex;
										align-items: center;
										justify-content: space-between;
										padding: 4px 8px;
										background: var(--background-modifier-hover);
										border-radius: var(--radius-s);
										font-size: 0.9em;
										cursor: grab;
										transition: opacity 0.2s, transform 0.2s;
									`;

										const dragHandle =
											fontItem.createSpan();
										dragHandle.textContent = "⋮⋮";
										dragHandle.style.cssText = `
										margin-right: 8px;
										color: var(--text-muted);
										cursor: grab;
										user-select: none;
									`;

										const fontName = fontItem.createSpan();
										fontName.textContent = font;
										fontName.style.cssText = `
										flex: 1;
										font-family: ${font};
									`;

										const deleteButton =
											fontItem.createEl("button");
										deleteButton.textContent = "削除";
										deleteButton.style.cssText = `
										padding: 2px 8px;
										font-size: 0.85em;
										background: var(--interactive-normal);
										color: var(--text-normal);
										border: 1px solid var(--background-modifier-border);
										border-radius: var(--radius-s);
										cursor: pointer;
									`;
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
												fontItem.style.opacity = "0.5";
												fontItem.style.cursor =
													"grabbing";
												if (e.dataTransfer) {
													e.dataTransfer.effectAllowed =
														"move";
												}
											},
										);

										fontItem.addEventListener(
											"dragend",
											() => {
												fontItem.style.opacity = "1";
												fontItem.style.cursor = "grab";
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
												fontItem.style.borderTop =
													draggedIndex < index
														? "2px solid var(--interactive-accent)"
														: "";
												fontItem.style.borderBottom =
													draggedIndex > index
														? "2px solid var(--interactive-accent)"
														: "";
											},
										);

										fontItem.addEventListener(
											"dragleave",
											() => {
												fontItem.style.borderTop = "";
												fontItem.style.borderBottom =
													"";
											},
										);

										fontItem.addEventListener(
											"drop",
											(e) => {
												e.preventDefault();
												fontItem.style.borderTop = "";
												fontItem.style.borderBottom =
													"";

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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "12";
						slider.max = "32";
						slider.step = "1";
						slider.value =
							this.tempSettings.common.fontSize.toString();
						slider.style.cssText = `
							flex: 1;
							min-width: 100px;
						`;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent = `${this.tempSettings.common.fontSize}px`;
						valueSpan.style.cssText = `
							min-width: 45px;
							text-align: right;
							color: var(--text-muted);
						`;

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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

						lineHeightSlider = wrapper.createEl("input");
						lineHeightSlider.type = "range";
						lineHeightSlider.min = "1.5";
						lineHeightSlider.max = "3.0";
						lineHeightSlider.step = "0.1";
						lineHeightSlider.value =
							this.tempSettings.common.lineHeight.toFixed(1);

						lineHeightSlider.style.cssText = `
							flex: 1;
							min-width: 100px;
						`;

						lineHeightValueSpan = wrapper.createEl("span");
						lineHeightValueSpan.textContent =
							this.tempSettings.common.lineHeight.toFixed(1);
						lineHeightValueSpan.style.cssText = `
							min-width: 45px;
							text-align: right;
							color: var(--text-muted);
						`;

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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "-0.1";
						slider.max = "0.5";
						slider.step = "0.01";
						slider.value =
							this.tempSettings.common.letterSpacing.toString();
						slider.style.cssText = `
							flex: 1;
							min-width: 100px;
						`;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent =
							this.tempSettings.common.letterSpacing.toFixed(2);
						valueSpan.style.cssText = `
							min-width: 45px;
							text-align: right;
							color: var(--text-muted);
						`;

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
							button.textContent = enabled ? "表示中" : "非表示";
							button.setAttr(
								"aria-pressed",
								enabled ? "true" : "false",
							);
							button.style.cssText = `
								min-width: 96px;
								padding: 6px 12px;
								border-radius: 6px;
								border: 1px solid var(--background-modifier-border);
								background: ${
									enabled
										? "var(--interactive-accent)"
										: "var(--interactive-normal)"
								};
								color: ${enabled ? "var(--text-on-accent)" : "var(--text-normal)"};
								cursor: pointer;
								transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
							`;
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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

						rubySizeSlider = wrapper.createEl("input");
						rubySizeSlider.type = "range";
						rubySizeSlider.min = "0.3";
						rubySizeSlider.max = "1.0";
						rubySizeSlider.step = "0.05";
						rubySizeSlider.value =
							this.tempSettings.common.rubySize.toFixed(2);

						rubySizeSlider.style.cssText = `
							flex: 1;
							min-width: 100px;
						`;

						rubySizeValueSpan = wrapper.createEl("span");
						rubySizeValueSpan.textContent =
							this.tempSettings.common.rubySize.toFixed(2);
						rubySizeValueSpan.style.cssText = `
							min-width: 45px;
							text-align: right;
							color: var(--text-muted);
						`;

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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
							flex-wrap: wrap;
						`;

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
						slider.style.cssText = `
							flex: 1;
							min-width: 140px;
						`;
						rubyGapSlider = slider;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent = initialValue.toFixed(1);
						valueSpan.style.cssText = `
							min-width: 50px;
							text-align: right;
							color: var(--text-muted);
						`;
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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 200px;
						`;

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
						button.style.cssText = `
							padding: 6px 12px;
						`;
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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "0";
						slider.max = "200";
						slider.step = "2";
						slider.value = (
							this.tempSettings.wysiwyg.sotPaddingTop ?? 32
						).toString();
						slider.style.cssText = `
							flex: 1;
							min-width: 100px;
						`;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent = `${this.tempSettings.wysiwyg.sotPaddingTop ?? 32}px`;
						valueSpan.style.cssText = `
							min-width: 50px;
							text-align: right;
							color: var(--text-muted);
						`;

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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

						const slider = wrapper.createEl("input");
						slider.type = "range";
						slider.min = "0";
						slider.max = "200";
						slider.step = "2";
						slider.value = (
							this.tempSettings.wysiwyg.sotPaddingBottom ?? 16
						).toString();
						slider.style.cssText = `
							flex: 1;
							min-width: 100px;
						`;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent = `${this.tempSettings.wysiwyg.sotPaddingBottom ?? 16}px`;
						valueSpan.style.cssText = `
							min-width: 50px;
							text-align: right;
							color: var(--text-muted);
						`;

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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 160px;
						`;

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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

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
						slider.style.cssText = `
							flex: 1;
							min-width: 120px;
						`;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent = `${initialValue}px`;
						valueSpan.style.cssText = `
							min-width: 50px;
							text-align: right;
							color: var(--text-muted);
						`;

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
							button.textContent = enabled
								? "使用する"
								: "使用しない";
							button.setAttr(
								"aria-pressed",
								enabled ? "true" : "false",
							);
							button.style.cssText = `
								min-width: 96px;
								padding: 6px 12px;
								border-radius: 6px;
								border: 1px solid var(--background-modifier-border);
								background: ${
									enabled
										? "var(--interactive-accent)"
										: "var(--interactive-normal)"
								};
								color: ${enabled ? "var(--text-on-accent)" : "var(--text-normal)"};
								cursor: pointer;
								transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
							`;
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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

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
						slider.style.cssText = `
							flex: 1;
							min-width: 120px;
						`;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent = initialValue.toFixed(2);
						valueSpan.style.cssText = `
							min-width: 50px;
							text-align: right;
							color: var(--text-muted);
						`;

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
						const wrapper = itemEl.createDiv();
						wrapper.style.cssText = `
							display: flex;
							align-items: center;
							gap: 10px;
						`;

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
						slider.style.cssText = `
							flex: 1;
							min-width: 120px;
						`;

						const valueSpan = wrapper.createEl("span");
						valueSpan.textContent = initialValue.toFixed(2);
						valueSpan.style.cssText = `
							min-width: 50px;
							text-align: right;
							color: var(--text-muted);
						`;

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
							button.textContent = visible ? "表示中" : "非表示";
							button.setAttr(
								"aria-pressed",
								visible ? "true" : "false",
							);
							button.style.cssText = `
								min-width: 96px;
								padding: 6px 12px;
								border-radius: 6px;
								border: 1px solid var(--background-modifier-border);
								background: ${
									visible
										? "var(--interactive-accent)"
										: "var(--interactive-normal)"
								};
								color: ${visible ? "var(--text-on-accent)" : "var(--text-normal)"};
								cursor: pointer;
								transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
							`;
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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 160px;
						`;

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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 160px;
						`;

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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 160px;
						`;

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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 160px;
						`;

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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 200px;
						`;

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
						select.style.cssText = `
							padding: 4px 8px;
							border: 1px solid var(--background-modifier-border);
							border-radius: var(--radius-s);
							background: var(--background-primary);
							color: var(--text-normal);
							min-width: 160px;
						`;

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
								button.textContent = enabled ? "有効" : "無効";
								button.setAttr(
									"aria-pressed",
									enabled ? "true" : "false",
								);
								button.style.cssText = `
									min-width: 96px;
									padding: 6px 12px;
									border-radius: 6px;
									border: 1px solid var(--background-modifier-border);
									background: ${
										enabled
											? "var(--interactive-accent)"
											: "var(--interactive-normal)"
									};
									color: ${
										enabled
											? "var(--text-on-accent)"
											: "var(--text-normal)"
									};
									cursor: pointer;
									transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
								`;
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
							button.style.cssText = `
								padding: 6px 12px;
							`;
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
							button.style.cssText = `
								padding: 6px 12px;
								color: var(--text-on-accent);
								background: var(--text-accent);
								border: 1px solid var(--text-accent);
								border-radius: 6px;
							`;
							button.addEventListener("click", () => {
								void this.plugin.moveSyncBackupsToTrash();
							});
						},
					);
				},
			);
		}
	}

	private createSettingItem(
		container: HTMLElement,
		name: string,
		desc: string,
		controlBuilder: (itemEl: HTMLElement) => void | Promise<void>,
		options?: { disabled?: boolean; disabledReason?: string },
	): void {
		const settingItem = container.createDiv("setting-item");
		settingItem.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 12px 0;
			border-bottom: 1px solid var(--background-modifier-border);
		`;

		const disabled = options?.disabled === true;
		if (disabled) {
			settingItem.style.opacity = "0.6";
		}

		const infoContainer = settingItem.createDiv("setting-item-info");
		infoContainer.style.cssText = `
			flex: 1;
			margin-right: 20px;
		`;

		infoContainer.createDiv({
			text: name,
			attr: {
				style: "font-weight: 500; color: var(--text-normal); margin-bottom: 4px;",
			},
		});

		infoContainer.createDiv({
			text: desc,
			attr: {
				style: "font-size: 0.9em; color: var(--text-muted);",
			},
		});
		if (options?.disabledReason) {
			infoContainer.createDiv({
				text: options.disabledReason,
				attr: {
					style: "font-size: 0.85em; color: var(--text-accent); margin-top: 4px; padding: 2px 6px; border-radius: 6px; background: var(--background-secondary); display: inline-block;",
				},
			});
		}

		const controlContainer = settingItem.createDiv("setting-item-control");
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
		container.style.pointerEvents = "none";
		container.style.opacity = "0.65";
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
		onChange: (color: string) => void,
	): void {
		this.createSettingItem(
			container,
			name,
			"クリックして色を変更",
			(itemEl) => {
				const colorButton = itemEl.createEl("button");
				colorButton.style.cssText = `
					width: 60px;
					height: 30px;
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					cursor: pointer;
					background: ${initialColor};
				`;

				colorButton.addEventListener("click", () => {
					openColorPicker(
						`${name}を選択`,
						initialColor,
						(newColor) => {
							colorButton.style.background = newColor;
							onChange(newColor);
						},
					);
				});
			},
		);
	}

	private createThemeSelector(container: HTMLElement): void {
		const themeContainer = container.createDiv();
		themeContainer.style.cssText = `
			padding: 12px 0;
		`;

		// テーマ選択とボタンを横並びにするコンテナ
		const selectContainer = themeContainer.createDiv();
		selectContainer.style.cssText = `
			display: flex;
			gap: 8px;
			margin-bottom: 10px;
		`;

		const select = selectContainer.createEl("select");
		select.style.cssText = `
			flex: 1;
			padding: 8px 12px;
			border: 1px solid var(--background-modifier-border);
			border-radius: var(--radius-s);
			background: var(--background-primary);
			color: var(--text-normal);
		`;

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
		applyButton.style.cssText = `
			padding: 8px 16px;
		`;

		// テーマ削除ボタン
		const deleteButton = selectContainer.createEl("button");
		deleteButton.textContent = "削除";
		deleteButton.className = "mod-warning";
		deleteButton.style.cssText = `
			padding: 8px 16px;
		`;
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
		applyButton.addEventListener("click", async () => {
			await applyTheme(select.value);
		});

		select.addEventListener("change", async () => {
			const selectedThemeId = select.value;

			// 削除ボタンの有効/無効を切り替え
			deleteButton.disabled = isPresetTheme(selectedThemeId);

			// テーマを適用
			await applyTheme(selectedThemeId);
		});

		// テーマ削除処理
		deleteButton.addEventListener("click", async () => {
			const selectedThemeId = select.value;
			if (isPresetTheme(selectedThemeId)) {
				return;
			}

			const theme = themes.find((t) => t.id === selectedThemeId);
			if (!theme) return;

			const confirmDelete = confirm(
				`テーマ「${theme.name}」を削除しますか？`,
			);
			if (confirmDelete) {
				await this.plugin.deleteTheme(selectedThemeId);
				// tempSettingsを更新
				this.tempSettings = JSON.parse(
					JSON.stringify(this.plugin.settings),
				);
				this.onOpen();
			}
		});

		// テーマ保存ボタン
		const saveButton = themeContainer.createEl("button");
		saveButton.textContent = "現在の設定をテーマとして保存";
		saveButton.className = "mod-cta";
		saveButton.style.cssText = `
			width: 100%;
			padding: 8px 12px;
		`;

		saveButton.addEventListener("click", async () => {
			try {
				// Obsidianの組み込みモーダルを使用
				const modal = new ThemeNameInputModal(
					this.app,
					async (themeName) => {
						try {
							// 現在の一時設定をプラグインに反映
							await this.plugin.updateSettings(this.tempSettings);

							// テーマとして保存
							const newTheme =
								await this.plugin.createThemeFromCurrentSettings(
									themeName,
								);

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
