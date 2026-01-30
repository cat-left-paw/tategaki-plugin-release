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
	private styleElement: HTMLStyleElement | null = null;

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
		const warningContainer = contentEl.createDiv("file-switch-warning");
		warningContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 16px;
			margin-bottom: 16px;
			background: var(--background-modifier-error);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
		`;

		const warningIcon = warningContainer.createDiv("warning-icon");
		warningIcon.innerHTML = `
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
				<line x1="12" y1="9" x2="12" y2="13"/>
				<line x1="12" y1="17" x2="12.01" y2="17"/>
			</svg>
		`;
		warningIcon.style.cssText = `
			color: var(--text-error);
			flex-shrink: 0;
		`;

		const warningText = warningContainer.createDiv("warning-text");
		warningText.innerHTML = `
			<strong>ファイルを切り替えようとしています</strong>
			<div style="margin-top: 4px; color: var(--text-muted); font-size: 0.9em;">
				現在のファイルに未保存の変更があります。変更を保存しますか？
			</div>
		`;

		// ファイル情報
		const fileInfo = contentEl.createDiv("file-switch-info");
		fileInfo.style.cssText = `
			margin-bottom: 24px;
			padding: 12px;
			background: var(--background-secondary);
			border-radius: 4px;
		`;

		const currentFileInfo = fileInfo.createDiv();
		currentFileInfo.innerHTML = `
			<div style="margin-bottom: 8px;">
				<strong>現在のファイル:</strong> ${this.data.currentFilePath}
				<span style="color: var(--text-error); margin-left: 8px;">●未保存</span>
			</div>
		`;

		const newFileInfo = fileInfo.createDiv();
		newFileInfo.innerHTML = `
			<strong>切り替え先:</strong> ${this.data.newFilePath}
		`;

		// 選択肢の説明
		const optionsDescription = contentEl.createDiv("options-description");
		optionsDescription.style.cssText = `
			margin-bottom: 20px;
			color: var(--text-muted);
			font-size: 0.95em;
		`;
		optionsDescription.innerHTML = `
			<p>次のいずれかを選択してください：</p>
			<ul style="margin: 8px 0; padding-left: 20px;">
				<li><strong>保存して切り替え:</strong> 現在の変更を保存してから新しいファイルを開きます</li>
				<li><strong>破棄して切り替え:</strong> 変更を破棄して新しいファイルを開きます</li>
				<li><strong>キャンセル:</strong> ファイル切り替えをキャンセルします</li>
			</ul>
		`;

		// ボタンコンテナ
		const buttonContainer = contentEl.createDiv("file-switch-buttons");
		buttonContainer.style.cssText = `
			display: flex;
			gap: 8px;
			justify-content: flex-end;
			padding-top: 16px;
			border-top: 1px solid var(--background-modifier-border);
		`;

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

		// スタイル追加
		this.addModalStyles();

		// 初期フォーカス（安全なキャンセルボタンにフォーカス）
		setTimeout(() => {
			cancelButton.focus();
		}, 100);
	}

	private addModalStyles() {
		this.styleElement = document.createElement('style');
		this.styleElement.textContent = `
			.tategaki-file-switch-modal .file-switch-buttons button {
				padding: 8px 16px;
				margin: 0 4px;
				min-width: 100px;
				border-radius: 4px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal);
				cursor: pointer;
			}

			.tategaki-file-switch-modal .file-switch-buttons button:hover {
				background: var(--background-modifier-hover);
			}

			.tategaki-file-switch-modal .file-switch-buttons button.mod-cta {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border-color: var(--interactive-accent);
			}

			.tategaki-file-switch-modal .file-switch-buttons button.mod-warning {
				background: var(--color-orange);
				color: var(--text-on-accent);
				border-color: var(--color-orange);
			}

			.tategaki-file-switch-modal .modal-content {
				max-width: 550px;
			}

			.tategaki-file-switch-modal .file-switch-info strong {
				color: var(--text-normal);
			}

			.tategaki-file-switch-modal .options-description ul {
				list-style-type: disc;
			}

			.tategaki-file-switch-modal .options-description li {
				margin: 4px 0;
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

		// 結果が設定されていない場合はキャンセル扱い
		if (this.result === null) {
			this.result = { action: 'cancel' };
		}

		this.onResolve(this.result);
	}
}