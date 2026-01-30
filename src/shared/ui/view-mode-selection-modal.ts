import { App, Modal } from "obsidian";
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
		} = {}
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
		this.titleEl.setText("Tategakiエディタを開く");

		this.contentEl.createEl("p", {
			text: "表示モードを選択してください。",
		});

		const optionsEl = this.contentEl.createDiv();
		optionsEl.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 12px;
			margin: 12px 0;
		`;

		this.createModeButton(
			optionsEl,
			"edit",
			"執筆・参照モード",
			"SoTビューで編集・参照を行います。"
		);
		this.createModeButton(
			optionsEl,
			"reading",
			"書籍モード",
			"縦書き読書モードで、ページめくりスタイルで閲覧します。"
		);
		if (this.showCompat) {
			this.createModeButton(
				optionsEl,
				"compat",
				"互換モード（旧TipTap）",
				"旧TipTapベースの互換ビューで編集します。"
			);
		}

		const actions = this.contentEl.createDiv();
		actions.style.cssText = `
			display: flex;
			align-items: center;
			gap: 12px;
			margin-top: 8px;
			flex-wrap: wrap;
		`;

		const setPlacement = (p: ViewOpenPlacementType) => {
			this.result.placement = p;
			this.result.openOnRightSide = p === "right";
			this.result.openInNewWindow = p === "window";
		};
		const placement = this.result.placement;

		const rightSideLabel = actions.createEl("label");
		rightSideLabel.style.cssText =
			"display: inline-flex; gap: 6px; align-items: center;";
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
		rightSideLabel.appendText("右側に開く");

		const tabLabel = actions.createEl("label");
		tabLabel.style.cssText =
			"display: inline-flex; gap: 6px; align-items: center;";
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
		tabLabel.appendText("隣のタブに開く");

		const windowLabel = actions.createEl("label");
		windowLabel.style.cssText =
			"display: inline-flex; gap: 6px; align-items: center;";
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
		windowLabel.appendText("新規ウィンドウで開く");

		const footer = this.contentEl.createDiv();
		footer.style.cssText = `
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 16px;
		`;

		footer
			.createEl("button", { text: "キャンセル" })
			.addEventListener("click", () => {
				this.cancelled = true;
				this.close();
			});

		const openButton = footer.createEl("button", {
			text: "開く",
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
		description: string
	): void {
		const wrapper = parent.createDiv();
		wrapper.style.cssText = `
			border: 1px solid var(--background-modifier-border);
			border-radius: 8px;
			padding: 10px 12px;
			background: var(--background-primary);
		`;

		const buttonRow = wrapper.createDiv();
		buttonRow.style.cssText = `
			display: flex;
			align-items: center;
			gap: 10px;
		`;

		const radio = buttonRow.createEl("input", { type: "radio" });
		radio.name = "tategaki-view-mode";
		radio.checked = this.result.mode === mode;
		radio.addEventListener("change", () => {
			this.result.mode = mode;
		});

		const titleEl = buttonRow.createEl("div");
		titleEl.style.cssText = "font-weight: 700;";
		titleEl.setText(title);

		const desc = wrapper.createEl("div");
		desc.style.cssText = "margin-top: 6px; color: var(--text-muted);";
		desc.setText(description);

		wrapper.addEventListener("click", () => {
			this.result.mode = mode;
			radio.checked = true;
			radio.dispatchEvent(new Event("change"));
		});
	}
}
