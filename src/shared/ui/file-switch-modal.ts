import { App, ButtonComponent, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "../i18n";

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
		this.setPlaceholder(t("modal.fileSwitch.placeholder"));
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
		new ButtonComponent(this.footerEl)
			.setButtonText(t("modal.fileSwitch.createNew"))
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
