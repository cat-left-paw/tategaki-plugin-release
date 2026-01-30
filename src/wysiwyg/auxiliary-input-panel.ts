import { setIcon } from "obsidian";

interface AuxiliaryInputPanelOptions {
	parent: HTMLElement;
	isVertical: boolean;
	onInsert: (text: string) => void;
	onFocus?: () => void;
	onBlur?: () => void;
	onResize?: () => void;
	onBackspace?: () => void;
	onBackspaceEmpty?: () => void;
	onNavigate?: (event: KeyboardEvent) => void;
}

export class AuxiliaryInputPanel {
	containerEl: HTMLElement;
	textareaEl: HTMLTextAreaElement;
	buttonsEl: HTMLElement;
	resizeHandleHorizontal: HTMLElement;
	resizeHandleVertical: HTMLElement;
	options: AuxiliaryInputPanelOptions;

	constructor(options: AuxiliaryInputPanelOptions) {
		this.options = options;
		this.containerEl = options.parent.createDiv("tategaki-auxiliary-input");

		// テキストエリア作成
		this.textareaEl = this.containerEl.createEl("textarea", {
			cls: "tategaki-auxiliary-textarea",
			attr: {
				placeholder: "入力して Enter で挿入、Shift+Enter で改行...",
				rows: "3",
			},
		});

		// フォーカス・ブラー
		this.textareaEl.addEventListener("focus", () => {
			this.options.onFocus?.();
			// モバイルキーボード表示時に補助パネルが見えるようにスクロール
			window.setTimeout(() => {
				this.textareaEl.scrollIntoView({
					block: "nearest",
					inline: "nearest",
					behavior: "smooth"
				});
			}, 200);
		});
		this.textareaEl.addEventListener("blur", () => {
			this.options.onBlur?.();
		});

		// ボタンコンテナ作成
		this.buttonsEl = this.containerEl.createDiv(
			"tategaki-auxiliary-buttons"
		);

		// 挿入ボタン
		const insertBtn = this.buttonsEl.createEl("button", {
			text: "挿入",
			cls: "mod-cta",
		});
		insertBtn.addEventListener("click", () => this.handleInsert());

		// Backspaceキーのハンドラー
		// 挿入のキーボードショートカットはObsidianのコマンドシステムで管理
		this.textareaEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				if (e.isComposing) {
					return;
				}
				e.preventDefault();
				this.handleInsert();
				return;
			}
			if (
				this.textareaEl.value.length === 0 &&
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
					e.key
				)
			) {
				e.preventDefault();
				e.stopPropagation();
				this.options.onNavigate?.(e);
				return;
			}
			// Cmd/Ctrl+Backspace: 空の時にパネルを閉じる
			if (
				e.key === "Backspace" &&
				(e.metaKey || e.ctrlKey) &&
				this.textareaEl.value.length === 0
			) {
				e.preventDefault();
				this.options.onBackspaceEmpty?.();
				return;
			}
			// Backspace（空の時）: 擬似キャレット前の一文字を削除
			if (e.key === "Backspace" && this.textareaEl.value.length === 0) {
				e.preventDefault();
				this.options.onBackspace?.();
				return;
			}
		});

		// リサイズハンドル
		this.resizeHandleVertical = this.containerEl.createDiv(
			"tategaki-auxiliary-resize-bar vertical"
		);
		this.resizeHandleHorizontal = this.containerEl.createDiv(
			"tategaki-auxiliary-resize-bar horizontal"
		);
		this.attachResizeHandlers();

		// 初期レイアウト適用
		this.updateLayout(options.isVertical);
	}

	private attachResizeHandlers() {
		const startDrag = (
			event: PointerEvent,
			mode: "horizontal" | "vertical"
		) => {
			event.preventDefault();
			event.stopPropagation();
			const startX = event.clientX;
			const startY = event.clientY;
			const startWidth = this.containerEl.offsetWidth;
			const startHeight = this.containerEl.offsetHeight;

			const onMove = (e: PointerEvent) => {
				if (mode === "vertical") {
					const deltaX = e.clientX - startX;
					const nextWidth = Math.max(80, startWidth + deltaX);
					this.containerEl.style.width = `${nextWidth}px`;
				} else {
					// horizontal mode => drag from top edge, moving up increases height
					const deltaY = startY - e.clientY;
					const nextHeight = Math.max(60, startHeight + deltaY);
					this.containerEl.style.height = `${nextHeight}px`;
				}
				this.options.onResize?.();
			};

			const onUp = () => {
				document.removeEventListener("pointermove", onMove);
				document.removeEventListener("pointerup", onUp);
			};

			document.addEventListener("pointermove", onMove);
			document.addEventListener("pointerup", onUp);
		};

		this.resizeHandleVertical.addEventListener("pointerdown", (e) =>
			startDrag(e, "vertical")
		);
		this.resizeHandleHorizontal.addEventListener("pointerdown", (e) =>
			startDrag(e, "horizontal")
		);
	}

	private handleInsert() {
		const text = this.textareaEl.value;
		const payload = text.length > 0 ? text : "\n";
		this.options.onInsert(payload);
		this.textareaEl.value = "";
		// フォーカスはonInsertコールバック内で適切なタイミングで戻される
	}

	updateLayout(isVertical: boolean) {
		this.containerEl.removeClass("is-vertical", "is-horizontal");
		this.containerEl.addClass(isVertical ? "is-vertical" : "is-horizontal");

		// リセット
		this.containerEl.style.width = "";
		this.containerEl.style.height = "";

		// ハンドルの表示切替
		this.resizeHandleVertical.toggleClass("visible", isVertical);
		this.resizeHandleHorizontal.toggleClass("visible", !isVertical);
	}

	show() {
		this.containerEl.style.display = "flex";
	}

	hide() {
		this.containerEl.style.display = "none";
	}

	destroy() {
		this.containerEl.remove();
	}
}
