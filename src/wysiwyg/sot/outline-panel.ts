import { t } from "../../shared/i18n";

type OutlineItem = {
	line: number;
	level: number;
	text: string;
	offset: number;
};

type OutlineCallbacks = {
	getItems: () => OutlineItem[];
	onSelect: (item: OutlineItem) => void;
	onClose?: () => void;
};

export class SoTOutlinePanel {
	private readonly callbacks: OutlineCallbacks;
	private readonly rootEl: HTMLDivElement;
	private readonly listEl: HTMLDivElement;
	private readonly closeButton: HTMLButtonElement;
	private isOpen = false;

	constructor(parent: HTMLElement, callbacks: OutlineCallbacks) {
		this.callbacks = callbacks;
		this.rootEl = parent.createDiv("tategaki-sot-outline-panel");
		this.rootEl.style.display = "none";
		this.rootEl.setAttribute("role", "dialog");
		this.rootEl.setAttribute("aria-label", t("outline.title"));
		this.rootEl.addEventListener("pointerdown", (event) => {
			event.stopPropagation();
		});

		const header = this.rootEl.createDiv("tategaki-sot-outline-header");
		const title = header.createDiv("tategaki-sot-outline-title");
		title.textContent = t("outline.title");
		this.closeButton = header.createEl("button", {
			cls: "tategaki-sot-outline-close",
			text: "×",
			attr: { type: "button", "aria-label": t("common.close") },
		});
		this.closeButton.addEventListener("click", () => this.close());

		this.listEl = this.rootEl.createDiv("tategaki-sot-outline-list");
	}

	toggle(): void {
		if (this.isOpen) {
			this.close();
			return;
		}
		this.open();
	}

	open(): void {
		this.isOpen = true;
		this.rootEl.style.display = "";
		this.refresh();
	}

	close(): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.rootEl.style.display = "none";
		this.listEl.replaceChildren();
		this.callbacks.onClose?.();
	}

	refresh(): void {
		if (!this.isOpen) return;
		const items = this.callbacks.getItems();
		this.listEl.replaceChildren();
		if (items.length === 0) {
			const empty = this.listEl.createDiv("tategaki-sot-outline-empty");
			empty.textContent = t("outline.empty");
			return;
		}
		for (const item of items) {
			const row = this.listEl.createDiv("tategaki-sot-outline-item");
			row.style.paddingLeft = `${(item.level - 1) * 12}px`;
			row.textContent = item.text;
			row.addEventListener("click", () => {
				this.callbacks.onSelect(item);
			});
		}
	}
}
