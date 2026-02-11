import {
	App,
	ButtonComponent,
	Modal,
	Notice,
	TextComponent,
} from "obsidian";
import { t } from "../i18n";

export interface RubyInputResult {
	text: string | null;
	ruby: string | null;
	isDot: boolean;
	cancelled: boolean;
}

export interface RubyInputModalOptions {
	customEmphasisChars?: string[];
	onCustomEmphasisCharsChange?: (chars: string[]) => void | Promise<void>;
	contentFontFamily?: string;
}

const MAX_CUSTOM_EMPHASIS_COUNT = 20;
const DEFAULT_EMPHASIS_CHARS = [
	"・",
	"•",
	"●",
	"○",
	"⚬",
	"◦",
	"﹅",
	"﹆",
] as const;

export class RubyInputModal extends Modal {
	private result: RubyInputResult = {
		text: null,
		ruby: null,
		isDot: false,
		cancelled: true,
	};
	private onResolve: (result: RubyInputResult) => void;
	private rubyInput: TextComponent | null = null;
	private emphasisSelectEl: HTMLSelectElement | null = null;
	private customEmphasisInput: TextComponent | null = null;
	private customEmphasisChars: string[] = [];
	private selectedText: string;
	private isComposing = false;
	private manualRubyBackup = "";
	private options: RubyInputModalOptions;

	constructor(
		app: App,
		selectedText: string,
		onResolve: (result: RubyInputResult) => void,
		options: RubyInputModalOptions = {},
	) {
		super(app);
		this.selectedText = selectedText;
		this.onResolve = onResolve;
		this.options = options;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.customEmphasisChars = this.normalizeCustomEmphasisChars(
			this.options.customEmphasisChars,
		);

		this.modalEl.addClass("tategaki-ruby-input-modal");
		contentEl.addClass("tategaki-ruby-input-content");

		contentEl.createEl("h2", { text: t("modal.rubyInput.title") });

		// 選択テキストを表示
		const textDisplay = contentEl.createDiv(
			"tategaki-ruby-input-text-display",
		);
		textDisplay.createEl("label", {
			text: t("modal.rubyInput.targetLabel"),
			cls: "tategaki-ruby-input-label-strong",
		});
		textDisplay.createEl("div", {
			text: this.selectedText,
			cls: "tategaki-ruby-input-selected-text",
		});

		// ルビ入力
		const rubyContainer = contentEl.createDiv("tategaki-ruby-input-field");
		rubyContainer.createEl("label", { text: t("modal.rubyInput.rubyLabel") });
		this.rubyInput = new TextComponent(rubyContainer);
		this.rubyInput.inputEl.addClass("tategaki-ruby-input-control");
		this.rubyInput.inputEl.placeholder = t("modal.rubyInput.rubyPlaceholder");
		this.manualRubyBackup = "";
		this.rubyInput.inputEl.addEventListener("input", () => {
			if (this.rubyInput?.inputEl.disabled) return;
			this.manualRubyBackup = this.rubyInput?.getValue() ?? "";
		});

		// IMEの変換状態を追跡
		this.rubyInput.inputEl.addEventListener("compositionstart", () => {
			this.isComposing = true;
		});
		this.rubyInput.inputEl.addEventListener("compositionend", () => {
			this.isComposing = false;
		});

		// エンターキーでの送信（IME変換中は無視）
		this.rubyInput.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !this.isComposing) {
				e.preventDefault();
				this.submitRuby();
			}
		});

		// 傍点オプション
		const emphasisContainer = contentEl.createDiv("tategaki-ruby-input-dot");
		emphasisContainer.createEl("label", {
			text: t("modal.rubyInput.emphasisLabel"),
		});
		this.emphasisSelectEl = emphasisContainer.createEl("select", {
			cls: "tategaki-ruby-input-emphasis-select",
		});
		const contentFontFamily = (this.options.contentFontFamily ?? "").trim();
		if (contentFontFamily.length > 0) {
			this.emphasisSelectEl.style.fontFamily = contentFontFamily;
		}
		this.renderEmphasisOptions("");
		this.emphasisSelectEl.addEventListener("change", () => {
			this.syncRubyInputFromEmphasisSelection();
		});

		const customRow = emphasisContainer.createDiv(
			"tategaki-ruby-input-custom-row",
		);
		this.customEmphasisInput = new TextComponent(customRow);
		this.customEmphasisInput.inputEl.addClass("tategaki-ruby-input-control");
		this.customEmphasisInput.inputEl.placeholder = t(
			"modal.rubyInput.customPlaceholder",
		);
		this.customEmphasisInput.inputEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || this.isComposing) return;
			event.preventDefault();
			this.addCustomEmphasisChar();
		});
		new ButtonComponent(customRow)
			.setButtonText(t("modal.rubyInput.customAdd"))
			.onClick(() => this.addCustomEmphasisChar());
		new ButtonComponent(customRow)
			.setButtonText(t("modal.rubyInput.customRemove"))
			.onClick(() => this.removeSelectedCustomEmphasisChar());

		emphasisContainer.createEl("div", {
			cls: "tategaki-ruby-input-note",
			text: t("modal.rubyInput.emphasisNote"),
		});

		// ボタン
		const buttonContainer = contentEl.createDiv("tategaki-ruby-input-buttons");

		new ButtonComponent(buttonContainer)
			.setButtonText(t("modal.rubyInput.insert"))
			.setCta()
			.onClick(() => {
				this.submitRuby();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText(t("common.cancel"))
			.onClick(() => {
				this.close();
			});

		// ルビ入力欄にフォーカス
		setTimeout(() => {
			this.rubyInput?.inputEl.focus();
		}, 100);
	}

	private submitRuby() {
		const text = this.selectedText;

		const selectedEmphasis = this.getSelectedEmphasisChar();
		const ruby = this.rubyInput?.getValue() || "";
		const isDot = selectedEmphasis.length > 0;
		const finalRuby = isDot ? selectedEmphasis : ruby;

		// 空のルビでも送信可能にする（ルビ除去として扱う）
		this.result = {
			text,
			ruby: finalRuby,
			isDot,
			cancelled: false,
		};
		this.close();
	}

	private getSelectedEmphasisChar(): string {
		return this.emphasisSelectEl?.value ?? "";
	}

	private renderEmphasisOptions(selectedChar: string): void {
		if (!this.emphasisSelectEl) return;
		this.emphasisSelectEl.empty();
		const noneOption = this.emphasisSelectEl.createEl("option", {
			value: "",
			text: t("modal.rubyInput.emphasisNone"),
		});
		noneOption.selected = selectedChar.length === 0;
		const chars = [...DEFAULT_EMPHASIS_CHARS, ...this.customEmphasisChars];
		for (const char of chars) {
			const option = this.emphasisSelectEl.createEl("option", {
				value: char,
				text: char,
			});
			if (char === selectedChar) {
				option.selected = true;
			}
		}
	}

	private syncRubyInputFromEmphasisSelection(): void {
		const selectedEmphasis = this.getSelectedEmphasisChar();
		if (!this.rubyInput) return;
		if (selectedEmphasis.length > 0) {
			if (!this.rubyInput.inputEl.disabled) {
				this.manualRubyBackup = this.rubyInput.getValue();
			}
			this.rubyInput.setValue(selectedEmphasis);
			this.rubyInput.inputEl.disabled = true;
			return;
		}
		this.rubyInput.inputEl.disabled = false;
		this.rubyInput.setValue(this.manualRubyBackup);
		this.rubyInput.inputEl.focus();
	}

	private addCustomEmphasisChar(): void {
		const raw = this.customEmphasisInput?.getValue() ?? "";
		const normalized = this.normalizeCustomEmphasisChar(raw);
		if (!normalized) {
			new Notice(t("modal.rubyInput.customInvalid"), 1800);
			return;
		}
		const existsInDefaults = DEFAULT_EMPHASIS_CHARS.includes(
			normalized as (typeof DEFAULT_EMPHASIS_CHARS)[number],
		);
		const existsInCustom = this.customEmphasisChars.includes(normalized);
		if (!existsInDefaults && !existsInCustom) {
			this.customEmphasisChars.push(normalized);
			if (this.customEmphasisChars.length > MAX_CUSTOM_EMPHASIS_COUNT) {
				this.customEmphasisChars = this.customEmphasisChars.slice(
					-MAX_CUSTOM_EMPHASIS_COUNT,
				);
			}
			this.persistCustomEmphasisChars();
		}
		this.renderEmphasisOptions(normalized);
		this.syncRubyInputFromEmphasisSelection();
		this.customEmphasisInput?.setValue("");
	}

	private removeSelectedCustomEmphasisChar(): void {
		const selected = this.getSelectedEmphasisChar();
		if (!selected) {
			new Notice(t("modal.rubyInput.customRemoveNotFound"), 1800);
			return;
		}
		const index = this.customEmphasisChars.indexOf(selected);
		if (index < 0) {
			new Notice(t("modal.rubyInput.customRemoveDefault"), 1800);
			return;
		}
		this.customEmphasisChars.splice(index, 1);
		this.persistCustomEmphasisChars();
		this.renderEmphasisOptions("");
		this.syncRubyInputFromEmphasisSelection();
		new Notice(t("modal.rubyInput.customRemoved"), 1500);
	}

	private persistCustomEmphasisChars(): void {
		const onChange = this.options.onCustomEmphasisCharsChange;
		if (!onChange) return;
		void Promise.resolve(onChange([...this.customEmphasisChars])).catch(() => {
			// ignore persist failure in modal
		});
	}

	private normalizeCustomEmphasisChar(raw: unknown): string | null {
		if (typeof raw !== "string") return null;
		const trimmed = raw.trim();
		if (!trimmed) return null;
		const first = Array.from(trimmed)[0] ?? "";
		if (!first) return null;
		return first;
	}

	private normalizeCustomEmphasisChars(value: unknown): string[] {
		if (!Array.isArray(value)) return [];
		const normalized: string[] = [];
		const seen = new Set<string>();
		for (const entry of value) {
			const char = this.normalizeCustomEmphasisChar(entry);
			if (!char || seen.has(char)) continue;
			if (
				DEFAULT_EMPHASIS_CHARS.includes(
					char as (typeof DEFAULT_EMPHASIS_CHARS)[number],
				)
			) {
				continue;
			}
			seen.add(char);
			normalized.push(char);
			if (normalized.length >= MAX_CUSTOM_EMPHASIS_COUNT) break;
		}
		return normalized;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.onResolve(this.result);
	}
}
