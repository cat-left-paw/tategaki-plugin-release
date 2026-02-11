import { App, Modal } from "obsidian";
import { t } from "../i18n";

export class ViewAlreadyOpenModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(t("modal.viewAlreadyOpen.title"));

		this.contentEl.createEl("p", {
			text: t("modal.viewAlreadyOpen.desc"),
		});

		const footer = this.contentEl.createDiv(
			"tategaki-view-already-open-footer",
		);

		footer
			.createEl("button", { text: t("common.ok"), cls: "mod-cta" })
			.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
