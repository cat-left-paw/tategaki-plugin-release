import { App, Modal } from "obsidian";
import { t } from "../i18n";

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

		contentEl.createEl("h2", { text: t("modal.unsupportedHtml.title") });
		contentEl.createEl("p", {
			text: t("modal.unsupportedHtml.desc"),
		});

		if (this.tags.length > 0) {
			const list = contentEl.createDiv(
				"tategaki-unsupported-html-tag-list",
			);
			list.createEl("div", {
				text: t("modal.unsupportedHtml.detectedTags", {
					tags: this.tags.join(", "),
				}),
			});
		}

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container tategaki-unsupported-html-buttons",
		});

		const readOnlyButton = buttonContainer.createEl("button", {
			text: t("modal.unsupportedHtml.readOnly"),
			cls: "mod-cta",
		});
		readOnlyButton.addEventListener("click", () => {
			this.result = "read-only";
			this.close();
		});

		const discardButton = buttonContainer.createEl("button", {
			text: t("modal.unsupportedHtml.discard"),
			cls: "mod-warning",
		});
		discardButton.addEventListener("click", () => {
			this.result = "discard";
			this.close();
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: t("common.cancel"),
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
