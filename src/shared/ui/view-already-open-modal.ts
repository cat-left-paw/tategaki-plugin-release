import { App, Modal } from "obsidian";

export class ViewAlreadyOpenModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Tategakiビューが既に開かれています");

		this.contentEl.createEl("p", {
			text: "既にTategakiビュー（執筆モード、参照モード、または書籍モード）が開かれています。新しいビューを開くには、既存のビューを閉じてください。",
		});

		const footer = this.contentEl.createDiv();
		footer.style.cssText = `
			display: flex;
			justify-content: flex-end;
			margin-top: 16px;
		`;

		footer
			.createEl("button", { text: "OK", cls: "mod-cta" })
			.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
