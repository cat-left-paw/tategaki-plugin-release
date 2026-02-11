import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

export interface ConfirmModalOptions {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	confirmIsCta?: boolean;
	confirmIsWarning?: boolean;
}

export function showConfirmModal(
	app: App,
	options: ConfirmModalOptions,
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmModal(app, options, resolve);
		modal.open();
	});
}

class ConfirmModal extends Modal {
	private result = false;

	constructor(
		app: App,
		private readonly options: ConfirmModalOptions,
		private readonly onResolve: (result: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { title, message, confirmText, cancelText } = this.options;
		this.titleEl.setText(title ?? t("common.confirmation"));

		for (const line of message.split("\n")) {
			this.contentEl.createEl("p", { text: line });
		}

		const actions = new Setting(this.contentEl);
		actions.addButton((button) =>
			button
				.setButtonText(cancelText ?? t("common.cancel"))
				.onClick(() => {
					this.result = false;
					this.close();
				}),
		);
		actions.addButton((button) => {
			button.setButtonText(confirmText ?? t("common.ok")).onClick(() => {
				this.result = true;
				this.close();
			});
			if (this.options.confirmIsWarning) {
				button.setWarning();
			} else if (this.options.confirmIsCta !== false) {
				button.setCta();
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
		this.onResolve(this.result);
	}
}
