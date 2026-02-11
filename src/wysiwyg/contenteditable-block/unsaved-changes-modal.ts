import { App, Modal } from "obsidian";
import { t } from "../../shared/i18n";

/**
 * 未保存の変更を確認するモーダル
 */
export class UnsavedChangesModal extends Modal {
	private result: "save" | "discard" | "cancel" | null = null;
	private resolvePromise:
		| ((value: "save" | "discard" | "cancel") => void)
		| null = null;

	constructor(
		app: App,
		private message: string = t("modal.unsavedChanges.defaultMessage"),
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: t("modal.unsavedChanges.title") });
		contentEl.createEl("p", { text: this.message });

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container tategaki-unsaved-changes-buttons",
		});

		// 保存ボタン
		const saveButton = buttonContainer.createEl("button", {
			text: t("common.save"),
			cls: "mod-cta",
		});
		saveButton.addEventListener("click", () => {
			this.result = "save";
			this.close();
		});

		// 破棄ボタン
		const discardButton = buttonContainer.createEl("button", {
			text: t("common.discard"),
			cls: "mod-warning",
		});
		discardButton.addEventListener("click", () => {
			this.result = "discard";
			this.close();
		});

		// キャンセルボタン
		const cancelButton = buttonContainer.createEl("button", {
			text: t("common.cancel"),
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
