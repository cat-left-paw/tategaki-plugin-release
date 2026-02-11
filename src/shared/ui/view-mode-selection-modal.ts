import { App, Modal } from "obsidian";
import { t } from "../i18n";
// 起動モーダル用の拡張型（書籍モードを含む）
export type ViewModeSelectionType = "edit" | "reading" | "compat";

export type ViewOpenPlacementType = "right" | "tab" | "window";

export interface ViewModeSelectionResult {
	mode: ViewModeSelectionType | null;
	openInNewWindow: boolean;
	openOnRightSide: boolean;
	placement: ViewOpenPlacementType;
}

export class ViewModeSelectionModal extends Modal {
	private resolveResult: ((result: ViewModeSelectionResult) => void) | null =
		null;
	private result: ViewModeSelectionResult;
	private cancelled = false;
	private showCompat = false;

	constructor(
		app: App,
		options: {
			defaultMode?: ViewModeSelectionType | "preview";
			openInNewWindow?: boolean;
			openOnRightSide?: boolean;
			placement?: ViewOpenPlacementType;
			showCompat?: boolean;
		} = {},
	) {
		super(app);
		// placementが指定されていればそれを使用、なければbooleanから計算
		const initialPlacement: ViewOpenPlacementType =
			options.placement ??
			(options.openInNewWindow
				? "window"
				: options.openOnRightSide === false
					? "tab"
					: "right");
		this.result = {
			mode: null,
			openInNewWindow: initialPlacement === "window",
			openOnRightSide: initialPlacement === "right",
			placement: initialPlacement,
		};
		this.showCompat = options.showCompat ?? false;
		const mode =
			options.defaultMode === "preview" ? "edit" : options.defaultMode;
		if (mode === "compat" && !this.showCompat) {
			this.result.mode = "edit";
			return;
		}
		if (mode === "edit" || mode === "compat") {
			this.result.mode = mode;
		}
	}

	openAndWait(): Promise<ViewModeSelectionResult> {
		return new Promise((resolve) => {
			this.resolveResult = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.modalEl.addClass("tategaki-view-mode-selection-modal");
		this.titleEl.setText(t("modal.viewMode.title"));

		this.contentEl.createEl("p", {
			text: t("modal.viewMode.prompt"),
		});

		const optionsEl = this.contentEl.createDiv(
			"tategaki-view-mode-options",
		);

		this.createModeButton(
			optionsEl,
			"edit",
			t("modal.viewMode.edit.title"),
			t("modal.viewMode.edit.desc"),
		);
		this.createModeButton(
			optionsEl,
			"reading",
			t("modal.viewMode.reading.title"),
			t("modal.viewMode.reading.desc"),
		);
		if (this.showCompat) {
			this.createModeButton(
				optionsEl,
				"compat",
				t("modal.viewMode.compat.title"),
				t("modal.viewMode.compat.desc"),
			);
		}

		const actions = this.contentEl.createDiv("tategaki-view-mode-actions");

		const setPlacement = (p: ViewOpenPlacementType) => {
			this.result.placement = p;
			this.result.openOnRightSide = p === "right";
			this.result.openInNewWindow = p === "window";
		};
		const placement = this.result.placement;

		const rightSideLabel = actions.createEl("label", {
			cls: "tategaki-view-mode-placement-label",
		});
		const rightSideRadio = rightSideLabel.createEl("input", {
			type: "radio",
		});
		rightSideRadio.name = "tategaki-open-placement";
		rightSideRadio.checked = placement === "right";
		rightSideRadio.addEventListener("change", () => {
			if (rightSideRadio.checked) {
				setPlacement("right");
			}
		});
		rightSideLabel.appendText(t("modal.viewMode.placement.right"));

		const tabLabel = actions.createEl("label", {
			cls: "tategaki-view-mode-placement-label",
		});
		const tabRadio = tabLabel.createEl("input", {
			type: "radio",
		});
		tabRadio.name = "tategaki-open-placement";
		tabRadio.checked = placement === "tab";
		tabRadio.addEventListener("change", () => {
			if (tabRadio.checked) {
				setPlacement("tab");
			}
		});
		tabLabel.appendText(t("modal.viewMode.placement.tab"));

		const windowLabel = actions.createEl("label", {
			cls: "tategaki-view-mode-placement-label",
		});
		const windowRadio = windowLabel.createEl("input", {
			type: "radio",
		});
		windowRadio.name = "tategaki-open-placement";
		windowRadio.checked = placement === "window";
		windowRadio.addEventListener("change", () => {
			if (windowRadio.checked) {
				setPlacement("window");
			}
		});
		windowLabel.appendText(t("modal.viewMode.placement.window"));

		const footer = this.contentEl.createDiv("tategaki-view-mode-footer");

		footer
			.createEl("button", { text: t("common.cancel") })
			.addEventListener("click", () => {
				this.cancelled = true;
				this.close();
			});

		const openButton = footer.createEl("button", {
			text: t("common.open"),
			cls: "mod-cta",
		});
		openButton.disabled = this.result.mode == null;
		openButton.addEventListener("click", () => {
			if (this.result.mode == null) {
				return;
			}
			this.close();
		});

		this.contentEl.addEventListener("change", () => {
			openButton.disabled = this.result.mode == null;
		});
	}

	onClose(): void {
		this.contentEl.empty();
		const resolver = this.resolveResult;
		this.resolveResult = null;
		if (this.cancelled) {
			resolver?.({
				mode: null,
				openInNewWindow: false,
				openOnRightSide: false,
				placement: "right",
			});
		} else {
			resolver?.({ ...this.result });
		}
	}

	private createModeButton(
		parent: HTMLElement,
		mode: ViewModeSelectionType,
		title: string,
		description: string,
	): void {
		const wrapper = parent.createDiv("tategaki-view-mode-card");

		const buttonRow = wrapper.createDiv("tategaki-view-mode-card-row");

		const radio = buttonRow.createEl("input", { type: "radio" });
		radio.name = "tategaki-view-mode";
		radio.checked = this.result.mode === mode;
		radio.addEventListener("change", () => {
			this.result.mode = mode;
		});

		const titleEl = buttonRow.createEl("div", {
			cls: "tategaki-view-mode-card-title",
		});
		titleEl.setText(title);

		const desc = wrapper.createEl("div", {
			cls: "tategaki-view-mode-card-desc",
		});
		desc.setText(description);

		wrapper.addEventListener("click", () => {
			this.result.mode = mode;
			radio.checked = true;
			radio.dispatchEvent(new Event("change"));
		});
	}
}
