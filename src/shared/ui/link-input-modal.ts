import { Modal, App, ButtonComponent, TextComponent } from "obsidian";

export interface LinkInputResult {
	url: string | null;
	text: string | null;
	cancelled: boolean;
}

export class LinkInputModal extends Modal {
	private result: LinkInputResult = { url: null, text: null, cancelled: true };
	private onResolve: (result: LinkInputResult) => void;
	private urlInput: TextComponent | null = null;
	private textInput: TextComponent | null = null;
	private selectedText: string;
	private needsTextInput: boolean;

	constructor(
		app: App,
		selectedText: string,
		onResolve: (result: LinkInputResult) => void
	) {
		super(app);
		this.selectedText = selectedText;
		this.needsTextInput = !selectedText || selectedText.trim() === '';
		this.onResolve = onResolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass('tategaki-link-input-modal');

		// タイトル
		contentEl.createEl("h2", { text: "リンクの挿入" });

		// URL入力
		const urlContainer = contentEl.createDiv("link-url-container");
		urlContainer.style.cssText = `
			margin-bottom: 1em;
		`;

		const urlLabel = urlContainer.createEl("label", { text: "URL" });
		urlLabel.style.cssText = `
			display: block;
			margin-bottom: 0.5em;
			font-weight: 500;
		`;

		this.urlInput = new TextComponent(urlContainer);
		this.urlInput.inputEl.style.cssText = `
			width: 100%;
			box-sizing: border-box;
		`;
		this.urlInput.setPlaceholder("https://example.com");
		this.urlInput.setValue("https://");

		// リンクテキスト入力（選択テキストがない場合のみ）
		if (this.needsTextInput) {
			const textContainer = contentEl.createDiv("link-text-container");
			textContainer.style.cssText = `
				margin-bottom: 1em;
			`;

			const textLabel = textContainer.createEl("label", { text: "リンクテキスト" });
			textLabel.style.cssText = `
				display: block;
				margin-bottom: 0.5em;
				font-weight: 500;
			`;

			this.textInput = new TextComponent(textContainer);
			this.textInput.inputEl.style.cssText = `
				width: 100%;
				box-sizing: border-box;
			`;
			this.textInput.setPlaceholder("リンクのテキスト");
		} else {
			// 選択テキストがある場合は表示のみ
			const textContainer = contentEl.createDiv("link-text-container");
			textContainer.style.cssText = `
				margin-bottom: 1em;
			`;

			const textLabel = textContainer.createEl("label", { text: "リンクテキスト" });
			textLabel.style.cssText = `
				display: block;
				margin-bottom: 0.5em;
				font-weight: 500;
			`;

			const textDisplay = textContainer.createDiv();
			textDisplay.style.cssText = `
				padding: 0.5em;
				background: var(--background-secondary);
				border-radius: 4px;
				color: var(--text-muted);
			`;
			textDisplay.textContent = this.selectedText;
		}

		// ボタンコンテナ
		const buttonContainer = contentEl.createDiv("link-buttons");
		buttonContainer.style.cssText = `
			display: flex;
			gap: 0.75em;
			justify-content: flex-end;
			padding-top: 1em;
			border-top: 1px solid var(--background-modifier-border);
		`;

		// キャンセルボタン
		new ButtonComponent(buttonContainer)
			.setButtonText("キャンセル")
			.onClick(() => {
				this.result = { url: null, text: null, cancelled: true };
				this.close();
			});

			// 挿入ボタン
			new ButtonComponent(buttonContainer)
				.setButtonText("挿入")
				.setClass("mod-cta")
				.onClick(() => {
					this.submitLink();
				});

		// Enterキーで挿入
		this.urlInput?.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				if (this.needsTextInput && this.textInput) {
					this.textInput.inputEl.focus();
				} else {
					this.submitLink();
				}
			}
		});

		if (this.textInput) {
			this.textInput.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					this.submitLink();
				}
			});
		}

		// 初期フォーカス
		setTimeout(() => {
			this.urlInput?.inputEl.focus();
			// "https://" の後ろにカーソルを移動
			this.urlInput?.inputEl.setSelectionRange(8, 8);
		}, 10);
	}

	private submitLink() {
		const url = this.urlInput?.getValue() || '';

		if (!url || url === 'https://') {
			// URLが空の場合はURL入力にフォーカス
			this.urlInput?.inputEl.focus();
			return;
		}

		let text = this.selectedText;
		if (this.needsTextInput) {
			text = this.textInput?.getValue() || url;
		}

		this.result = {
			url: url,
			text: text,
			cancelled: false
		};
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		this.onResolve(this.result);
	}
}
