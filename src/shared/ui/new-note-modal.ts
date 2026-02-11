import { App, ButtonComponent, Modal, Notice, TextComponent } from "obsidian";

type NewNoteModalOptions = {
	defaultFolder?: string | null;
	initialValue?: string;
};

export class NewNoteModal extends Modal {
	private readonly onSubmit: (name: string) => void;
	private readonly defaultFolder: string | null;
	private readonly initialValue: string;
	private input: TextComponent | null = null;

	constructor(
		app: App,
		options: NewNoteModalOptions,
		onSubmit: (name: string) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.defaultFolder = options.defaultFolder ?? null;
		this.initialValue = options.initialValue ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText("新規ノートを作成");

		const desc = contentEl.createDiv("tategaki-new-note-desc");
		desc.setText("ファイル名を入力してください（.md は省略可）");

		if (this.defaultFolder !== null) {
			const folderInfo = contentEl.createDiv("tategaki-new-note-folder-info");
			folderInfo.setText(
				`作成先: ${this.defaultFolder || "/"}`
			);
		}

		const inputContainer = contentEl.createDiv(
			"tategaki-new-note-input-container",
		);
		this.input = new TextComponent(inputContainer);
		this.input.inputEl.addClass("tategaki-new-note-input");
		this.input.setPlaceholder("新規ノート名");
		if (this.initialValue) {
			this.input.setValue(this.initialValue);
		}

		const buttonContainer = contentEl.createDiv("tategaki-new-note-buttons");

		new ButtonComponent(buttonContainer)
			.setButtonText("キャンセル")
			.onClick(() => this.close());

		new ButtonComponent(buttonContainer)
			.setButtonText("作成")
			.setClass("mod-cta")
			.onClick(() => this.submit());

		this.input.inputEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			this.submit();
		});

		window.setTimeout(() => {
			this.input?.inputEl.focus();
			this.input?.inputEl.select();
		}, 0);
	}

	private submit(): void {
		const value = this.input?.getValue().trim() ?? "";
		if (!value) {
			new Notice("ファイル名を入力してください。", 2000);
			return;
		}
		this.close();
		this.onSubmit(value);
	}
}
