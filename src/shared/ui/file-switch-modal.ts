import { App, ButtonComponent, FuzzySuggestModal, TFile } from "obsidian";

export class FileSwitchModal extends FuzzySuggestModal<TFile> {
	private files: TFile[];
	private onSelect: (file: TFile) => void;
	private onCreateNew: ((input: string) => void) | null;
	private footerEl: HTMLElement | null = null;

	constructor(
		app: App,
		files: TFile[],
		onSelect: (file: TFile) => void,
		onCreateNew?: (input: string) => void
	) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
		this.onCreateNew = onCreateNew ?? null;
		this.setPlaceholder("切り替えるファイルを選択");
	}

	onOpen() {
		super.onOpen();
		if (!this.onCreateNew) return;
		if (this.footerEl) {
			this.footerEl.remove();
			this.footerEl = null;
		}
		this.footerEl = this.modalEl.createDiv(
			"tategaki-file-switch-footer"
		);
		this.footerEl.style.cssText = `
			display: flex;
			justify-content: flex-end;
			padding-top: 8px;
			border-top: 1px solid var(--background-modifier-border);
			margin-top: 8px;
		`;
		new ButtonComponent(this.footerEl)
			.setButtonText("新規ノートを作成")
			.setClass("mod-cta")
			.onClick(() => {
				const input = this.inputEl?.value ?? "";
				this.close();
				this.onCreateNew?.(input);
			});
	}

	onClose() {
		if (this.footerEl) {
			this.footerEl.remove();
			this.footerEl = null;
		}
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}
}
