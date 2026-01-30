import { App, Modal } from "obsidian";

export type UnsupportedHtmlAction = "read-only" | "discard" | "cancel";

export class UnsupportedHtmlModal extends Modal {
	private result: UnsupportedHtmlAction | null = null;
	private resolvePromise: ((value: UnsupportedHtmlAction) => void) | null =
		null;
	private readonly tags: string[];

	constructor(app: App, tags: string[]) {
		super(app);
		this.tags = tags;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "未対応HTMLタグの検出" });
		contentEl.createEl("p", {
			text: "未対応のHTMLタグが含まれているため、そのまま編集すると失われる可能性があります。",
		});

		if (this.tags.length > 0) {
			const list = contentEl.createDiv();
			list.style.marginTop = "8px";
			list.style.marginBottom = "8px";
			list.createEl("div", {
				text: `検出されたタグ: ${this.tags.join(", ")}`,
			});
		}

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});
		buttonContainer.style.cssText = `
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 16px;
			flex-wrap: wrap;
		`;

		const readOnlyButton = buttonContainer.createEl("button", {
			text: "読み取り専用で開く",
			cls: "mod-cta",
		});
		readOnlyButton.addEventListener("click", () => {
			this.result = "read-only";
			this.close();
		});

		const discardButton = buttonContainer.createEl("button", {
			text: "破棄して開く",
			cls: "mod-warning",
		});
		discardButton.addEventListener("click", () => {
			this.result = "discard";
			this.close();
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "キャンセル",
		});
		cancelButton.addEventListener("click", () => {
			this.result = "cancel";
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
		if (this.resolvePromise) {
			this.resolvePromise(this.result || "cancel");
		}
	}

	async waitForChoice(): Promise<UnsupportedHtmlAction> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}
}
