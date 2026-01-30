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
	private styleElement: HTMLStyleElement | null = null;

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
		const description = contentEl.createDiv("conflict-description");
		description.createEl("p", { text: `ファイル: ${this.conflictData.filePath}` });
		description.createEl("p", {
			text: "このファイルが外部で変更されましたが、未保存の編集内容があります。保存方法を選択してください。",
		});

		// アクションボタン
		const buttonContainer = contentEl.createDiv("conflict-buttons");
		buttonContainer.style.cssText = `
			display: flex;
			gap: 0.5em;
			justify-content: flex-end;
			margin-top: 1em;
			padding-top: 1em;
			border-top: 1px solid var(--background-modifier-border);
		`;

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

		// スタイル追加
		this.addModalStyles();
	}

	private addModalStyles() {
		this.styleElement = document.createElement('style');
		this.styleElement.textContent = `
			.tategaki-conflict-resolution-modal .conflict-description {
				margin-bottom: 1em;
				padding: 0.75em;
				background: var(--background-secondary);
				border-radius: 4px;
			}

			.tategaki-conflict-resolution-modal .conflict-buttons .clickable-icon {
				padding: 0.5em 1em;
				margin: 0;
			}

			.tategaki-conflict-resolution-modal .conflict-buttons {
				flex-wrap: wrap;
				justify-content: flex-end;
			}
		`;
		document.head.appendChild(this.styleElement);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		// スタイル要素をクリーンアップ
		if (this.styleElement) {
			this.styleElement.remove();
			this.styleElement = null;
		}

		this.onResolve(this.result);
	}
}
