import { Modal, App, ButtonComponent, TextComponent, ToggleComponent } from "obsidian";

export interface RubyInputResult {
	text: string | null;
	ruby: string | null;
	isDot: boolean;
	cancelled: boolean;
}

export class RubyInputModal extends Modal {
	private result: RubyInputResult = { text: null, ruby: null, isDot: false, cancelled: true };
	private onResolve: (result: RubyInputResult) => void;
	private rubyInput: TextComponent | null = null;
	private dotToggle: ToggleComponent | null = null;
	private selectedText: string;
	private isComposing = false;

	constructor(
		app: App,
		selectedText: string,
		onResolve: (result: RubyInputResult) => void
	) {
		super(app);
		this.selectedText = selectedText;
		this.onResolve = onResolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass('tategaki-ruby-input-modal');
		contentEl.addClass("tategaki-ruby-input-content");

		contentEl.createEl("h2", { text: "ルビの挿入" });

		// 選択テキストを表示
		const textDisplay = contentEl.createDiv("tategaki-ruby-input-text-display");
		textDisplay.createEl("label", {
			text: "対象テキスト:",
			cls: "tategaki-ruby-input-label-strong",
		});
		textDisplay.createEl("div", {
			text: this.selectedText,
			cls: "tategaki-ruby-input-selected-text",
		});

		// ルビ入力
		const rubyContainer = contentEl.createDiv("tategaki-ruby-input-field");
		rubyContainer.createEl("label", { text: "ルビ:" });
		this.rubyInput = new TextComponent(rubyContainer);
		this.rubyInput.inputEl.addClass("tategaki-ruby-input-control");
		this.rubyInput.inputEl.placeholder = "ふりがな";

		// IMEの変換状態を追跡
		this.rubyInput.inputEl.addEventListener('compositionstart', () => {
			this.isComposing = true;
		});
		this.rubyInput.inputEl.addEventListener('compositionend', () => {
			this.isComposing = false;
		});

		// エンターキーでの送信（IME変換中は無視）
		this.rubyInput.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !this.isComposing) {
				e.preventDefault();
				this.submitRuby();
			}
		});

		// 傍点オプション
		const dotContainer = contentEl.createDiv("tategaki-ruby-input-dot");
		dotContainer.createEl("label", { text: "傍点:" });
		this.dotToggle = new ToggleComponent(dotContainer);
		this.dotToggle.onChange((value) => {
			if (value && this.rubyInput) {
				this.rubyInput.setValue("・");
				this.rubyInput.inputEl.disabled = true;
			} else if (this.rubyInput) {
				this.rubyInput.setValue("");
				this.rubyInput.inputEl.disabled = false;
				this.rubyInput.inputEl.focus();
			}
		});

		// ボタン
		const buttonContainer = contentEl.createDiv("tategaki-ruby-input-buttons");

		new ButtonComponent(buttonContainer)
			.setButtonText("挿入")
			.setCta()
			.onClick(() => {
				this.submitRuby();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText("キャンセル")
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

		const ruby = this.rubyInput?.getValue() || '';
		const isDot = this.dotToggle?.getValue() || false;

		// 空のルビでも送信可能にする（ルビ除去として扱う）
		this.result = { text, ruby: isDot ? '・' : ruby, isDot, cancelled: false };
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.onResolve(this.result);
	}
}
