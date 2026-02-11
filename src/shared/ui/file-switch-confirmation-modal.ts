import { Modal, App } from "obsidian";

export interface FileSwitchConfirmationResult {
	action: 'save-and-switch' | 'discard-and-switch' | 'cancel';
}

export interface FileSwitchData {
	currentFilePath: string;
	newFilePath: string;
	hasUnsavedChanges: boolean;
}

export class FileSwitchConfirmationModal extends Modal {
	private result: FileSwitchConfirmationResult | null = null;
	private data: FileSwitchData;
	private onResolve: (result: FileSwitchConfirmationResult | null) => void;

	constructor(
		app: App,
		data: FileSwitchData,
		onResolve: (result: FileSwitchConfirmationResult | null) => void
	) {
		super(app);
		this.data = data;
		this.onResolve = onResolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// モーダルに固有のクラスを追加
		this.modalEl.addClass('tategaki-file-switch-modal');

		// タイトル
		contentEl.createEl("h2", { text: "未保存の変更があります" });

		// 警告アイコンとメッセージ
		const warningContainer = contentEl.createDiv("tategaki-file-switch-warning");
		warningContainer.createDiv({
			cls: "tategaki-file-switch-warning-icon",
			text: "⚠",
		});
		const warningText = warningContainer.createDiv("tategaki-file-switch-warning-text");
		warningText.createEl("strong", { text: "ファイルを切り替えようとしています" });
		warningText.createDiv({
			cls: "tategaki-file-switch-warning-detail",
			text: "現在のファイルに未保存の変更があります。変更を保存しますか？",
		});

		// ファイル情報
		const fileInfo = contentEl.createDiv("tategaki-file-switch-info");
		const currentFileInfo = fileInfo.createDiv("tategaki-file-switch-current");
		currentFileInfo.createEl("strong", { text: "現在のファイル:" });
		currentFileInfo.appendText(` ${this.data.currentFilePath}`);
		currentFileInfo.createSpan({
			cls: "tategaki-file-switch-unsaved",
			text: "●未保存",
		});
		const newFileInfo = fileInfo.createDiv("tategaki-file-switch-next");
		newFileInfo.createEl("strong", { text: "切り替え先:" });
		newFileInfo.appendText(` ${this.data.newFilePath}`);

		// 選択肢の説明
		const optionsDescription = contentEl.createDiv("tategaki-file-switch-options");
		optionsDescription.createEl("p", {
			text: "次のいずれかを選択してください：",
		});
		const optionList = optionsDescription.createEl("ul", {
			cls: "tategaki-file-switch-options-list",
		});
		const saveItem = optionList.createEl("li");
		saveItem.createEl("strong", { text: "保存して切り替え:" });
		saveItem.appendText(" 現在の変更を保存してから新しいファイルを開きます");
		const discardItem = optionList.createEl("li");
		discardItem.createEl("strong", { text: "破棄して切り替え:" });
		discardItem.appendText(" 変更を破棄して新しいファイルを開きます");
		const cancelItem = optionList.createEl("li");
		cancelItem.createEl("strong", { text: "キャンセル:" });
		cancelItem.appendText(" ファイル切り替えをキャンセルします");

		// ボタンコンテナ
		const buttonContainer = contentEl.createDiv("tategaki-file-switch-buttons");

		// キャンセルボタン
		const cancelButton = buttonContainer.createEl("button", {
			text: "キャンセル",
			cls: "mod-cta"
		});
		cancelButton.addEventListener("click", () => {
			this.result = { action: 'cancel' };
			this.close();
		});

		// 破棄して切り替えボタン
		const discardButton = buttonContainer.createEl("button", {
			text: "破棄して切り替え",
			cls: "mod-warning"
		});
		discardButton.addEventListener("click", () => {
			this.result = { action: 'discard-and-switch' };
			this.close();
		});

		// 保存して切り替えボタン
		const saveButton = buttonContainer.createEl("button", {
			text: "保存して切り替え",
			cls: "mod-cta"
		});
		saveButton.addEventListener("click", () => {
			this.result = { action: 'save-and-switch' };
			this.close();
		});

		// 初期フォーカス（安全なキャンセルボタンにフォーカス）
		setTimeout(() => {
			cancelButton.focus();
		}, 100);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		// 結果が設定されていない場合はキャンセル扱い
		if (this.result === null) {
			this.result = { action: 'cancel' };
		}

		this.onResolve(this.result);
	}
}
