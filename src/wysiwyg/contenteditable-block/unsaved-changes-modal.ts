import { App, Modal } from "obsidian";

/**
 * 未保存の変更を確認するモーダル
 */
export class UnsavedChangesModal extends Modal {
	private result: "save" | "discard" | "cancel" | null = null;
	private resolvePromise: ((value: "save" | "discard" | "cancel") => void) | null = null;

	constructor(app: App, private message: string = "未保存の変更があります。") {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "未保存の変更" });
		contentEl.createEl("p", { text: this.message });

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container tategaki-unsaved-changes-buttons",
		});

		// 保存ボタン
		const saveButton = buttonContainer.createEl("button", {
			text: "保存",
			cls: "mod-cta",
		});
		saveButton.addEventListener("click", () => {
			this.result = "save";
			this.close();
		});

		// 破棄ボタン
		const discardButton = buttonContainer.createEl("button", {
			text: "破棄",
			cls: "mod-warning",
		});
		discardButton.addEventListener("click", () => {
			this.result = "discard";
			this.close();
		});

		// キャンセルボタン
		const cancelButton = buttonContainer.createEl("button", {
			text: "キャンセル",
		});
		cancelButton.addEventListener("click", () => {
			this.result = "cancel";
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		if (this.resolvePromise) {
			this.resolvePromise(this.result || "cancel");
		}
	}

	/**
	 * モーダルを開いて、ユーザーの選択を待つ
	 */
	async waitForChoice(): Promise<"save" | "discard" | "cancel"> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}
}
