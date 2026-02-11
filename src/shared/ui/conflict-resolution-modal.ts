import { Modal, App, ButtonComponent } from "obsidian";

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
		onResolve: (result: ConflictResolutionResult | null) => void
	) {
		super(app);
		this.conflictData = conflictData;
		this.onResolve = onResolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// モーダルに固有のクラスを追加
		this.modalEl.addClass('tategaki-conflict-resolution-modal');

		// タイトル
		contentEl.createEl("h2", { text: "ファイル競合の解決" });

		// 説明
		const description = contentEl.createDiv("tategaki-conflict-description");
		description.createEl("p", { text: `ファイル: ${this.conflictData.filePath}` });
		description.createEl("p", {
			text: "このファイルが外部で変更されましたが、未保存の編集内容があります。保存方法を選択してください。",
		});

		// アクションボタン
		const buttonContainer = contentEl.createDiv("tategaki-conflict-buttons");

		// 上書き保存ボタン
		new ButtonComponent(buttonContainer)
			.setButtonText("現在の内容で上書き保存")
			.setClass("mod-cta")
			.onClick(() => {
				this.result = { action: 'overwrite' };
				this.close();
			});

		// 外部変更を取り込みボタン
		new ButtonComponent(buttonContainer)
			.setButtonText("外部変更を取り込む")
			.onClick(() => {
				this.result = { action: "accept-external" };
				this.close();
			});

		// 両方保存ボタン
		new ButtonComponent(buttonContainer)
			.setButtonText("両方のバージョンを保存")
			.onClick(() => {
				this.result = { action: "keep-both" };
				this.close();
			});

		// キャンセルボタン
		new ButtonComponent(buttonContainer)
			.setButtonText("キャンセル")
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
