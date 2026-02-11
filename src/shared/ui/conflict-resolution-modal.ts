import { Modal, App, ButtonComponent } from "obsidian";
import { t } from "../i18n";

export interface ConflictResolutionResult {
	action: "overwrite" | "accept-external" | "keep-both" | "cancel";
}

export interface ConflictData {
	currentContent: string;
	externalContent: string;
	filePath: string;
}

export class ConflictResolutionModal extends Modal {
	private result: ConflictResolutionResult | null = null;
	private conflictData: ConflictData;
	private onResolve: (result: ConflictResolutionResult | null) => void;

	constructor(
		app: App,
		conflictData: ConflictData,
		onResolve: (result: ConflictResolutionResult | null) => void,
	) {
		super(app);
		this.conflictData = conflictData;
		this.onResolve = onResolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// モーダルに固有のクラスを追加
		this.modalEl.addClass("tategaki-conflict-resolution-modal");

		// タイトル
		contentEl.createEl("h2", { text: t("modal.conflict.title") });

		// 説明
		const description = contentEl.createDiv(
			"tategaki-conflict-description",
		);
		description.createEl("p", {
			text: t("modal.conflict.file", {
				filePath: this.conflictData.filePath,
			}),
		});
		description.createEl("p", {
			text: t("modal.conflict.desc"),
		});

		// アクションボタン
		const buttonContainer = contentEl.createDiv(
			"tategaki-conflict-buttons",
		);

		// 上書き保存ボタン
		new ButtonComponent(buttonContainer)
			.setButtonText(t("modal.conflict.overwrite"))
			.setClass("mod-cta")
			.onClick(() => {
				this.result = { action: "overwrite" };
				this.close();
			});

		// 外部変更を取り込みボタン
		new ButtonComponent(buttonContainer)
			.setButtonText(t("modal.conflict.acceptExternal"))
			.onClick(() => {
				this.result = { action: "accept-external" };
				this.close();
			});

		// 両方保存ボタン
		new ButtonComponent(buttonContainer)
			.setButtonText(t("modal.conflict.keepBoth"))
			.onClick(() => {
				this.result = { action: "keep-both" };
				this.close();
			});

		// キャンセルボタン
		new ButtonComponent(buttonContainer)
			.setButtonText(t("common.cancel"))
			.onClick(() => {
				this.result = { action: "cancel" };
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		this.onResolve(this.result);
	}
}
