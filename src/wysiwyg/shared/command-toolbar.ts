import { Menu, Platform, setIcon } from "obsidian";
import type { CommandUiAdapter } from "./command-adapter";

type ButtonState = {
	id: string;
	button: HTMLButtonElement;
	icon: string;
	title: string;
	onClick?: () => void | Promise<void>;
	isActive?: () => boolean;
	isDisabled?: () => boolean;
	getIcon?: () => string;
	getTitle?: () => string;
	currentIcon?: string;
};

export class CommandToolbar {
	private container: HTMLElement;
	private adapter: CommandUiAdapter;
	private buttons: ButtonState[] = [];
	private headingButton: HTMLButtonElement | null = null;
	private writingModeButton: HTMLButtonElement | null = null;
	private readingModeButton: HTMLButtonElement | null = null;
	private horizontalRuleButton: HTMLButtonElement | null = null;
	private sourceToggleButton: HTMLButtonElement | null = null;
	private rubyToggleButton: HTMLButtonElement | null = null;
	private ceImeToggleButton: HTMLButtonElement | null = null;

	constructor(container: HTMLElement, adapter: CommandUiAdapter) {
		this.container = container;
		this.adapter = adapter;
		this.createToolbar();
	}

	destroy(): void {
		this.container.empty();
		this.buttons = [];
		this.headingButton = null;
		this.writingModeButton = null;
		this.readingModeButton = null;
		this.horizontalRuleButton = null;
		this.sourceToggleButton = null;
		this.rubyToggleButton = null;
		this.ceImeToggleButton = null;
	}

	update(): void {
		this.updateButtonStates();
	}

	private createToolbar(): void {
		this.container.empty();
		this.container.addClass("contenteditable-toolbar");
		this.buttons = [];

		const isMobile = Platform.isMobile || Platform.isMobileApp;
		if (isMobile) {
			this.container.addClass("tiptap-toolbar-mobile");
			this.container.style.cssText = `
				display: flex;
				align-items: center;
				gap: 4px;
				padding: 8px;
				background-color: var(--background-secondary);
				border-bottom: 1px solid var(--background-modifier-border);
				flex-wrap: nowrap;
				flex: 1 1 auto;
				min-width: 0;
				width: 100%;
				max-width: 100%;
				overflow-x: auto;
				overflow-y: hidden;
				-webkit-overflow-scrolling: touch;
				scrollbar-width: none;
				touch-action: pan-x;
				overscroll-behavior-x: contain;
			`;

			if (
				!document.getElementById(
					"tiptap-toolbar-mobile-scrollbar-style"
				)
			) {
				const style = document.createElement("style");
				style.id = "tiptap-toolbar-mobile-scrollbar-style";
				style.textContent = `
					.tiptap-toolbar-mobile::-webkit-scrollbar {
						display: none;
					}
					.tiptap-toolbar-mobile .contenteditable-toolbar-button,
					.tiptap-toolbar-mobile .contenteditable-toolbar-separator {
						flex: 0 0 auto;
					}
				`;
				document.head.appendChild(style);
			}
		} else {
			this.container.style.cssText = `
				display: flex;
				align-items: center;
				gap: 4px;
				padding: 8px;
				background-color: var(--background-secondary);
				border-bottom: 1px solid var(--background-modifier-border);
				flex-wrap: wrap;
				flex: 1 1 auto;
				min-width: 0;
			`;
		}

		this.createWritingModeButton();
		this.createSeparator();
		if (this.adapter.openFileSwitcher) {
			this.createFileSwitchButton();
			this.createSeparator();
		}
		if (this.adapter.toggleReadingMode) {
			this.createReadingModeButton();
			this.createSeparator();
		}
		this.createUndoRedoButtons();
		this.createSeparator();
		this.createInlineButtons();
		this.createSeparator();
		this.createHeadingMenuButton();
		this.createSeparator();
		this.createListButtons();
		this.createSeparator();
		this.createInsertButtons();
		this.createSeparator();
		this.createClearFormattingButton();
		if (this.adapter.toggleRuby) {
			this.createSeparator();
			this.createRubyToggleButton();
		}
		if (this.adapter.togglePlainTextView) {
			this.createSeparator();
			this.createPlainTextToggleButton();
		}
		this.createSeparator();
		this.createSourceToggleButton();
		if (this.adapter.toggleCeImeMode) {
			this.createSeparator();
			this.createCeImeToggleButton();
		}
		if (this.adapter.openSettings) {
			this.createSeparator();
			this.createSettingsButton();
		}
		if (this.adapter.openOutline) {
			this.createSeparator();
			this.createOutlineButton();
		}
		this.updateButtonStates();
	}

	private createButton(
		id: string,
		icon: string,
		title: string,
		onClick?: () => void | Promise<void>,
		isActive?: () => boolean,
		isDisabled?: () => boolean,
		getIcon?: () => string,
		getTitle?: () => string
	): HTMLButtonElement {
		const button = this.container.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
			attr: {
				"aria-label": title,
			},
		}) as HTMLButtonElement;
		setIcon(button, icon);
		const state: ButtonState = {
			id,
			button,
			icon,
			title,
			onClick,
			isActive,
			isDisabled,
			getIcon,
			getTitle,
			currentIcon: icon,
		};
		this.buttons.push(state);

		button.addEventListener("click", (event) => {
			event.preventDefault();
			if (button.disabled) return;
			const result = onClick?.();
			if (result && typeof (result as Promise<void>).then === "function") {
				void (result as Promise<void>).finally(() =>
					this.updateButtonStates()
				);
			} else {
				this.updateButtonStates();
			}
		});

		return button;
	}

	private createSeparator(): void {
		const separator = this.container.createEl("div", {
			cls: "contenteditable-toolbar-separator",
		});
		separator.style.cssText = `
			width: 1px;
			height: 24px;
			background-color: var(--background-modifier-border);
			margin: 0 4px;
		`;
	}

	private createWritingModeButton(): void {
		const getIcon = (): string =>
			this.adapter.getWritingMode?.() === "vertical-rl"
				? "arrow-down-up"
				: "arrow-left-right";
		const getTitle = (): string =>
			this.adapter.getWritingMode?.() === "vertical-rl"
				? "横書きに切り替え"
				: "縦書きに切り替え";
		this.writingModeButton = this.createButton(
			"writingMode",
			getIcon(),
			"書字方向切り替え",
			this.adapter.toggleWritingMode
				? () => {
						this.adapter.toggleWritingMode?.();
					}
				: undefined,
			undefined,
			() => !this.adapter.toggleWritingMode,
			getIcon,
			getTitle
		);
	}

	private createFileSwitchButton(): void {
		this.createButton(
			"fileSwitch",
			"folder-open",
			"ファイル切替",
			this.adapter.openFileSwitcher,
			undefined,
			() => !this.adapter.openFileSwitcher
		);
	}

	private createReadingModeButton(): void {
		const getEnabled = (): boolean =>
			this.adapter.isReadingMode?.() ?? false;
		const getIcon = (): string => (getEnabled() ? "book-open" : "book");
		const getTitle = (): string =>
			getEnabled() ? "書籍モードを終了" : "書籍モードへ移動";
		this.readingModeButton = this.createButton(
			"readingMode",
			getIcon(),
			getTitle(),
			this.adapter.toggleReadingMode,
			getEnabled,
			() => !this.adapter.toggleReadingMode,
			getIcon,
			getTitle
		);
	}

	private createUndoRedoButtons(): void {
		this.createButton(
			"undo",
			"undo",
			"元に戻す",
			this.adapter.undo,
			undefined,
			() =>
				!this.adapter.undo ||
				(this.adapter.canUndo?.() === false)
		);
		this.createButton(
			"redo",
			"redo",
			"やり直す",
			this.adapter.redo,
			undefined,
			() =>
				!this.adapter.redo ||
				(this.adapter.canRedo?.() === false)
		);
	}

	private createInlineButtons(): void {
		this.createButton(
			"bold",
			"bold",
			"太字",
			this.adapter.toggleBold,
			this.adapter.isBoldActive,
			() =>
				!this.adapter.toggleBold ||
				!(this.adapter.hasSelection?.() ?? false) ||
				!(this.adapter.isInlineSelectionAllowed?.() ?? true)
		);
		this.createButton(
			"italic",
			"italic",
			"斜体",
			this.adapter.toggleItalic,
			this.adapter.isItalicActive,
			() =>
				!this.adapter.toggleItalic ||
				!(this.adapter.hasSelection?.() ?? false) ||
				!(this.adapter.isInlineSelectionAllowed?.() ?? true)
		);
		this.createButton(
			"strikethrough",
			"strikethrough",
			"取り消し線",
			this.adapter.toggleStrikethrough,
			this.adapter.isStrikethroughActive,
			() =>
				!this.adapter.toggleStrikethrough ||
				!(this.adapter.hasSelection?.() ?? false) ||
				!(this.adapter.isInlineSelectionAllowed?.() ?? true)
		);
		if (this.adapter.toggleUnderline) {
			this.createButton(
				"underline",
				"underline",
				"下線",
				this.adapter.toggleUnderline,
				this.adapter.isUnderlineActive,
				() =>
					!this.adapter.toggleUnderline ||
					!(this.adapter.hasSelection?.() ?? false) ||
					!(this.adapter.isInlineSelectionAllowed?.() ?? true)
			);
		}
		this.createButton(
			"highlight",
			"highlighter",
			"ハイライト",
			this.adapter.toggleHighlight,
			this.adapter.isHighlightActive,
			() =>
				!this.adapter.toggleHighlight ||
				!(this.adapter.hasSelection?.() ?? false) ||
				!(this.adapter.isInlineSelectionAllowed?.() ?? true)
		);
		this.createButton(
			"inlineCode",
			"code",
			"インラインコード",
			this.adapter.toggleInlineCode,
			this.adapter.isInlineCodeActive,
			() =>
				!this.adapter.toggleInlineCode ||
				!(this.adapter.hasSelection?.() ?? false) ||
				!(this.adapter.isInlineSelectionAllowed?.() ?? true)
		);
	}

	private createHeadingMenuButton(): void {
		this.headingButton = this.createButton(
			"heading",
			"heading",
			"見出し",
			() => {
				if (!this.headingButton || !this.adapter.setHeading) return;
				const menu = new Menu();
				const currentLevel = this.adapter.getHeadingLevel?.() ?? 0;
				const headingIcons: Record<number, string> = {
					1: "heading-1",
					2: "heading-2",
					3: "heading-3",
					4: "heading-4",
					5: "heading-5",
					6: "heading-6",
				};
				for (let level = 1; level <= 6; level += 1) {
					menu.addItem((item) => {
						item.setTitle(`見出し${level}`)
							.setIcon(headingIcons[level])
							.onClick(() => {
								this.adapter.setHeading?.(level);
							});
						if (currentLevel === level) {
							item.setChecked(true);
						}
					});
				}
				menu.addItem((item) => {
					item.setTitle("見出し解除")
						.setIcon("text")
						.onClick(() => {
							this.adapter.clearHeading?.();
						});
					if (currentLevel === 0) {
						item.setChecked(true);
					}
				});
				const rect = this.headingButton.getBoundingClientRect();
				menu.showAtPosition({ x: rect.left, y: rect.bottom });
			},
			() => (this.adapter.getHeadingLevel?.() ?? 0) > 0,
			() => !this.adapter.setHeading
		);
	}

	private createListButtons(): void {
		this.createButton(
			"bulletList",
			"list",
			"箇条書きリスト",
			this.adapter.toggleBulletList,
			this.adapter.isBulletListActive,
			() => !this.adapter.toggleBulletList
		);
		this.createButton(
			"orderedList",
			"list-ordered",
			"番号付きリスト",
			this.adapter.toggleOrderedList,
			this.adapter.isOrderedListActive,
			() => !this.adapter.toggleOrderedList
		);
		this.createButton(
			"blockquote",
			"quote",
			"引用",
			this.adapter.toggleBlockquote,
			this.adapter.isBlockquoteActive,
			() => !this.adapter.toggleBlockquote
		);
		this.createButton(
			"codeBlock",
			"code-2",
			"コードブロック",
			this.adapter.toggleCodeBlock,
			this.adapter.isCodeBlockActive,
			() => !this.adapter.toggleCodeBlock
		);
	}

	private createInsertButtons(): void {
		this.createButton(
			"link",
			"link",
			"リンク挿入",
			this.adapter.insertLink,
			undefined,
			() =>
				!this.adapter.insertLink ||
				!(this.adapter.isInlineSelectionAllowed?.() ?? true)
		);
		this.createButton(
			"ruby",
			"gem",
			"ルビ挿入",
			this.adapter.insertRuby,
			undefined,
			() =>
				!this.adapter.insertRuby ||
				!(this.adapter.hasSelection?.() ?? false) ||
				!(this.adapter.isInlineSelectionAllowed?.() ?? true)
		);
		const getHrIcon = (): string => {
			const mode = this.adapter.getWritingMode?.();
			return mode === "vertical-rl"
				? "separator-vertical"
				: "separator-horizontal";
		};
		this.horizontalRuleButton = this.createButton(
			"horizontalRule",
			getHrIcon(),
			"区切り線",
			this.adapter.insertHorizontalRule,
			undefined,
			() => !this.adapter.insertHorizontalRule,
			getHrIcon
		);
	}

	private createClearFormattingButton(): void {
		this.createButton(
			"clearFormatting",
			"eraser",
			"書式クリア",
			this.adapter.clearFormatting,
			undefined,
			() => !this.adapter.clearFormatting
		);
	}

	private createRubyToggleButton(): void {
		this.rubyToggleButton = this.createButton(
			"rubyToggle",
			"eye",
			"ルビ表示のオン/オフ",
			this.adapter.toggleRuby,
			() => this.adapter.isRubyEnabled?.() ?? true,
			() =>
				!this.adapter.toggleRuby ||
				(this.adapter.isPlainTextView?.() ?? false),
			() =>
				this.adapter.isRubyEnabled?.() === false ? "eye-off" : "eye",
			() =>
				this.adapter.isRubyEnabled?.() === false
					? "ルビ表示をオンにする"
					: "ルビ表示をオフにする"
		);
	}

	private createPlainTextToggleButton(): void {
		this.createButton(
			"plainTextView",
			"type",
			"全文プレーン表示",
			this.adapter.togglePlainTextView,
			() => this.adapter.isPlainTextView?.() ?? false,
			() => !this.adapter.togglePlainTextView,
			undefined,
			() =>
				this.adapter.isPlainTextView?.() ?? false
					? "全文プレーン表示をオフにする"
					: "全文プレーン表示をオンにする"
		);
	}

	private createSourceToggleButton(): void {
		this.sourceToggleButton = this.createButton(
			"sourceMode",
			"file-text",
			"ソーステキスト編集",
			this.adapter.toggleSourceMode,
			() => this.adapter.isSourceMode?.() ?? false,
			() =>
				!this.adapter.toggleSourceMode ||
				(this.adapter.isPlainTextView?.() ?? false),
			() =>
				this.adapter.isSourceMode?.() ?? false
					? "file-code"
					: "file-text",
			() =>
				this.adapter.isSourceMode?.() ?? false
					? "装飾表示に戻す"
					: "ソーステキスト編集モード"
		);
	}

	private createCeImeToggleButton(): void {
		this.ceImeToggleButton = this.createButton(
			"ceImeMode",
			"toggle-left",
			"CE補助(IME)",
			this.adapter.toggleCeImeMode,
			() => this.adapter.isCeImeMode?.() ?? false,
			() => !this.adapter.toggleCeImeMode,
			() =>
				this.adapter.isCeImeMode?.() ? "toggle-right" : "toggle-left",
			() =>
				this.adapter.isCeImeMode?.()
					? "CE補助(IME)をオフにする"
					: "CE補助(IME)をオンにする"
		);
	}

	private createSettingsButton(): void {
		this.createButton(
			"settings",
			"settings",
			"表示設定",
			this.adapter.openSettings,
			undefined,
			() => !this.adapter.openSettings
		);
	}

	private createOutlineButton(): void {
		this.createButton(
			"outline",
			"list-tree",
			"アウトライン",
			this.adapter.openOutline,
			undefined,
			() => !this.adapter.openOutline
		);
	}

	private updateButtonStates(): void {
		const writingMode = this.adapter.getWritingMode?.();
		if (this.writingModeButton) {
			const label =
				writingMode === "vertical-rl" ? "横書き" : "縦書き";
			this.writingModeButton.setAttr(
				"aria-label",
				`${label}に切り替え`
			);
		}
		if (this.horizontalRuleButton) {
			const desiredIcon =
				writingMode === "vertical-rl"
					? "separator-vertical"
					: "separator-horizontal";
			const state = this.buttons.find(
				(entry) => entry.button === this.horizontalRuleButton
			);
			if (state && state.currentIcon !== desiredIcon) {
				setIcon(this.horizontalRuleButton, desiredIcon);
				state.currentIcon = desiredIcon;
			}
		}

		for (const state of this.buttons) {
			const active = state.isActive?.() ?? false;
			const disabled = state.isDisabled?.() ?? false;
			state.button.disabled = disabled;
			state.button.classList.toggle("is-active", active);
			const nextTitle = state.getTitle?.() ?? state.title;
			if (nextTitle) {
				state.button.setAttr("aria-label", nextTitle);
			}
			const nextIcon = state.getIcon?.() ?? state.icon;
			if (nextIcon && state.currentIcon !== nextIcon) {
				setIcon(state.button, nextIcon);
				state.currentIcon = nextIcon;
			}
		}
	}
}
