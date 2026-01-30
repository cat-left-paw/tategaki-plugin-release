import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { App, Menu, Platform, setIcon } from "obsidian";
import { toggleHeadingForCurrentLine } from "./commands/heading";
import {
	LinkInputModal,
	LinkInputResult,
} from "../../shared/ui/link-input-modal";
import {
	RubyInputModal,
	RubyInputResult,
} from "../../shared/ui/ruby-input-modal";
import { WritingMode } from "../../types/settings";
import type { SyncState } from "../contenteditable/sync-manager";
import type { PlainEditCommand } from "./plain-edit-mode";

export interface TipTapToolbarOptions {
	app: App;
	onToggleWritingMode?: () => void;
	getWritingMode?: () => WritingMode;
	onOpenFileSwitcher?: () => void;
	onToggleReadingMode?: () => void;
	getReadingModeEnabled?: () => boolean;
	onSettings?: () => void;
	onFindReplace?: (replaceMode?: boolean) => void;
	onManualSync?: () => void;
	onToggleSyncMode?: () => void;
	onToggleOutline?: () => void;
	onPlainEditCommand?: (command: PlainEditCommand) => boolean;
	getPlainEditSelectionText?: () => string;
	onToggleAuxiliary?: () => void;
	getAuxiliaryEnabled?: () => boolean;
	onToggleRuby?: () => void;
	getRubyEnabled?: () => boolean;
	onTogglePlainEdit?: () => void;
	getPlainEditEnabled?: () => boolean;
}

export class TipTapCompatToolbar {
	private container: HTMLElement;
	private editor: Editor;
	private app: App;
	private options: TipTapToolbarOptions;
	private buttons: Map<string, HTMLButtonElement> = new Map();
	private isReadOnly = false;
	private hideEditingButtonsWhenReadOnly = false;
	private separators: HTMLDivElement[] = [];
	private writingModeButton: HTMLButtonElement | null = null;
	private horizontalRuleButton: HTMLButtonElement | null = null;
	private readingModeButton: HTMLButtonElement | null = null;
	private statusElement: HTMLElement | null = null;
	private rubyToggleButton: HTMLButtonElement | null = null;
	private auxiliaryToggleButton: HTMLButtonElement | null = null;
	private plainEditToggleButton: HTMLButtonElement | null = null;
	private fileSwitchButton: HTMLButtonElement | null = null;

	constructor(
		container: HTMLElement,
		editor: Editor,
		app: App,
		options: TipTapToolbarOptions = { app }
	) {
		this.container = container;
		this.editor = editor;
		this.app = app;
		this.options = options;
		this.createToolbar();
		this.setupUpdateListener();
	}

	private createToolbar(): void {
		this.container.empty();
		this.container.addClass("contenteditable-toolbar");
		this.separators = [];

		// モバイルとデスクトップで異なるスタイルを適用
		const isMobile = Platform.isMobile || Platform.isMobileApp;

		if (isMobile) {
			// モバイル: 一列表示、横スクロール可能
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

			// スクロールバーを非表示にするCSSを動的に追加（一度だけ）
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
			// デスクトップ: 折り返し表示
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

		// 書字方向切り替えボタン（一番左に配置）
		if (this.options.onToggleWritingMode && this.options.getWritingMode) {
			this.writingModeButton = this.createButton(
				"arrow-down-up",
				"書字方向切り替え",
				() => {
					this.options.onToggleWritingMode?.();
					this.updateWritingModeButton();
					this.updateHorizontalRuleIcon();
				}
			);
			this.updateWritingModeButton();
			this.createSeparator();
		}

		// ファイル切替（SoTと同等の導線）
		if (this.options.onOpenFileSwitcher) {
			this.fileSwitchButton = this.createButton(
				"folder-open",
				"ファイル切替",
				() => this.options.onOpenFileSwitcher?.()
			);
			this.createSeparator();
		}

		// 元に戻す/やり直す
		this.createButton("undo", "元に戻す", () => this.safeUndo());
		this.createButton("redo", "やり直す", () => this.safeRedo());

		this.createSeparator();

		// 基本書式
		this.createButton("bold", "太字", () =>
			this.runInlineCommand({ type: "bold" }, () =>
				this.editor.chain().focus().toggleBold().run()
			)
		);
		this.createButton("italic", "イタリック", () =>
			this.runInlineCommand({ type: "italic" }, () =>
				this.editor.chain().focus().toggleItalic().run()
			)
		);
		this.createButton("strikethrough", "取り消し線", () =>
			this.runInlineCommand({ type: "strike" }, () =>
				this.editor.chain().focus().toggleStrike().run()
			)
		);
		this.createButton("underline", "下線", () =>
			this.runInlineCommand({ type: "underline" }, () =>
				this.editor.chain().focus().toggleUnderline().run()
			)
		);
		this.createButton("highlighter", "ハイライト", () =>
			this.runInlineCommand({ type: "highlight" }, () =>
				this.editor
					.chain()
					.focus()
					.toggleMark("obsidianHighlight")
					.run()
			)
		);

		this.createSeparator();

		// 見出しメニューボタン
		this.createHeadingMenuButton();

		this.createSeparator();

		// リスト・引用
		this.createButton("list", "箇条書きリスト", () =>
			this.editor.chain().focus().toggleBulletList().run()
		);
		this.createButton("list-ordered", "番号付きリスト", () =>
			this.editor.chain().focus().toggleOrderedList().run()
		);
		this.createButton("quote", "引用", () =>
			this.toggleBlockquoteWithTrailingParagraph()
		);
		// コードブロック
		this.createButton("code-2", "コードブロック", () =>
			this.editor.chain().focus().toggleCodeBlock().run()
		);

		this.createSeparator();

		// 高度な挿入機能
		this.createButton("link", "リンク挿入", () => this.insertLink());
		this.createButton("gem", "ルビ挿入", () => this.insertRuby());

		// 区切り線ボタン（書字方向に応じてアイコンを動的に変更）
		const writingMode = this.options.getWritingMode?.() || "horizontal-tb";
		const hrIcon =
			writingMode === "vertical-rl"
				? "separator-vertical"
				: "separator-horizontal";
		this.horizontalRuleButton = this.createButton(hrIcon, "区切り線", () =>
			this.editor.chain().focus().setHorizontalRule().run()
		);

		this.createSeparator();

		// 書式クリア
		this.createButton("eraser", "書式クリア", () => this.clearFormatting());

		// ルビ表示切替ボタン
		if (this.options.onToggleRuby) {
			this.createSeparator();
			this.rubyToggleButton = this.createButton(
				"eye",
				"ルビ表示のオン/オフ",
				() => {
					this.options.onToggleRuby?.();
					this.updateRubyButton();
				}
			);
			this.updateRubyButton();
		}

		// 設定ボタン
		if (this.options.onSettings) {
			this.createSeparator();
			this.createButton("settings", "表示設定", () => {
				this.options.onSettings?.();
			});
		}

		// 検索・置換ボタン
		if (this.options.onFindReplace) {
			this.createSeparator();
			this.createButton("search", "検索・置換", () => {
				this.options.onFindReplace?.(true);
			});
		}

		// アウトラインボタン
		if (this.options.onToggleOutline) {
			this.createSeparator();
			this.createButton("list-tree", "アウトライン", () => {
				this.options.onToggleOutline?.();
			});
		}

		// 書籍モード
		if (this.options.onToggleReadingMode) {
			this.createSeparator();
			this.readingModeButton = this.createButton(
				"book",
				"書籍モード（ページネーション）",
				() => {
					this.options.onToggleReadingMode?.();
					this.updateReadingModeButton();
				}
			);
			this.updateReadingModeButton();
		}

		// 補助入力パネル（トグル）
		if (this.options.onToggleAuxiliary) {
			this.createSeparator();
			this.auxiliaryToggleButton = this.createButton(
				"keyboard",
				"補助入力パネル",
				() => this.options.onToggleAuxiliary?.()
			);
			this.updateAuxiliaryButton();
		}

		// プレーン編集モード（トグル）
		if (this.options.onTogglePlainEdit) {
			this.createSeparator();
			this.plainEditToggleButton = this.createButton(
				"file-text",
				"ソーステキスト編集",
				() => this.options.onTogglePlainEdit?.()
			);
			this.updatePlainEditButton();
		}

		// ステータス表示エリア
		this.createSeparator();
		this.statusElement = this.container.createDiv(
			"contenteditable-toolbar-status"
		);
		this.statusElement.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			margin-left: 8px;
			font-size: 12px;
			color: var(--text-muted);
		`;

		this.updateButtonStates();
	}

	private createButton(
		icon: string,
		title: string,
		action: () => void
	): HTMLButtonElement {
		const button = this.container.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
			attr: {
				"aria-label": title,
			},
		}) as HTMLButtonElement;

		setIcon(button, icon);

		button.addEventListener("click", (e) => {
			e.preventDefault();
			action();
			this.updateButtonStates();
		});

		this.buttons.set(icon, button);
		return button;
	}

	private createHeadingMenuButton(): void {
		const headingButton = this.container.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
			attr: {
				"aria-label": "見出し",
			},
		}) as HTMLButtonElement;
		setIcon(headingButton, "heading");

		// 見出しアイコンの定義
		const headingIcons: Record<number, string> = {
			1: "heading-1",
			2: "heading-2",
			3: "heading-3",
			4: "heading-4",
			5: "heading-5",
			6: "heading-6",
		};

		headingButton.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			// 現在の見出しレベルを取得
			let currentHeadingLevel = 0;
			for (let level = 1; level <= 6; level++) {
				if (this.editor.isActive("heading", { level })) {
					currentHeadingLevel = level;
					break;
				}
			}

			// H1-H6のメニュー項目を追加
			for (let level = 1; level <= 6; level++) {
				const currentLevel = level as 1 | 2 | 3 | 4 | 5 | 6;
				menu.addItem((item) => {
					item.setTitle(` 見出し${currentLevel}`)
						.setIcon(headingIcons[currentLevel])
						.onClick(() => {
							toggleHeadingForCurrentLine(
								this.editor,
								currentLevel
							);
							this.updateButtonStates();
						});

					if (currentHeadingLevel === currentLevel) {
						item.setChecked(true);
					}
				});
			}

			// 見出し解除のメニュー項目を追加
			menu.addItem((item) => {
				item.setTitle("見出し解除")
					.setIcon("text")
					.onClick(() => {
						// 見出しを段落に戻す
						this.editor.chain().focus().setParagraph().run();
						this.updateButtonStates();
					});

				if (currentHeadingLevel === 0) {
					item.setChecked(true);
				}
			});

			// ボタンの位置にメニューを表示
			const rect = headingButton.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		});

		this.buttons.set("heading", headingButton);
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
		this.separators.push(separator);
	}

	private insertLink(): void {
		if (this.options.getPlainEditEnabled?.()) {
			const selectedText =
				this.options.getPlainEditSelectionText?.() ?? "";
			new LinkInputModal(
				this.app,
				selectedText,
				(result: LinkInputResult) => {
					if (result.cancelled || !result.url) {
						return;
					}
					const displayText =
						result.text && result.text.trim().length > 0
							? result.text
							: selectedText || result.url;
					this.options.onPlainEditCommand?.({
						type: "link",
						url: result.url,
						text: displayText,
					});
				}
			).open();
			return;
		}
		const { from, to } = this.editor.state.selection;
		const selectedText = this.editor.state.doc.textBetween(from, to, " ");

		new LinkInputModal(
			this.app,
			selectedText,
			(result: LinkInputResult) => {
				if (result.cancelled || !result.url) {
					return;
				}

				const displayText =
					result.text && result.text.trim().length > 0
						? result.text
						: selectedText || result.url;

				// リンクを挿入
				this.editor
					.chain()
					.focus()
					.extendMarkRange("link")
					.setLink({ href: result.url })
					.insertContent(displayText)
					.run();

				this.updateButtonStates();
			}
		).open();
	}

	private insertRuby(): void {
		if (this.options.getPlainEditEnabled?.()) {
			const selectedText =
				this.options.getPlainEditSelectionText?.() ?? "";
			if (!selectedText || selectedText.trim() === "") {
				return;
			}
			new RubyInputModal(
				this.app,
				selectedText,
				(result: RubyInputResult) => {
					if (result.cancelled) {
						return;
					}
					this.options.onPlainEditCommand?.({
						type: "ruby",
						text: selectedText,
						ruby: result.ruby ?? "",
						isDot: result.isDot,
					});
				}
			).open();
			return;
		}
		const { from, to } = this.editor.state.selection;
		const originalSelectedText = this.editor.state.doc.textBetween(
			from,
			to,
			""
		);

		// テキストが選択されていない場合は何もしない
		if (!originalSelectedText || originalSelectedText.trim() === "") {
			return;
		}

		// 選択範囲がaozoraRubyノード内にあるかチェックし、ある場合はノード全体を選択範囲に含める
		let rangeFrom = from;
		let rangeTo = to;
		let hasRubyNode = false;
		let rubyNodeText = "";
		const $from = this.editor.state.doc.resolve(from);
		const $to = this.editor.state.doc.resolve(to);

		// 開始位置の親ノードを確認
		for (let depth = $from.depth; depth > 0; depth--) {
			const node = $from.node(depth);
			if (node.type.name === "aozoraRuby") {
				const nodePos = $from.before(depth);
				rangeFrom = Math.min(rangeFrom, nodePos);
				rangeTo = Math.max(rangeTo, nodePos + node.nodeSize);
				rubyNodeText = node.textContent;
				hasRubyNode = true;
				break;
			}
		}

		// 終了位置の親ノードを確認
		for (let depth = $to.depth; depth > 0; depth--) {
			const node = $to.node(depth);
			if (node.type.name === "aozoraRuby") {
				const nodePos = $to.before(depth);
				rangeFrom = Math.min(rangeFrom, nodePos);
				rangeTo = Math.max(rangeTo, nodePos + node.nodeSize);
				rubyNodeText = node.textContent;
				hasRubyNode = true;
				break;
			}
		}

		// モーダルに表示するテキスト（ルビノードのみの場合はそのテキスト、それ以外は元の選択範囲）
		const displayText =
			hasRubyNode && rubyNodeText === originalSelectedText
				? rubyNodeText
				: originalSelectedText;

		new RubyInputModal(this.app, displayText, (result: RubyInputResult) => {
			if (result.cancelled) {
				return;
			}

			const rubyEnabled = this.options.getRubyEnabled?.() ?? true;

			// 空のルビの場合（ルビ除去）
			if (!result.ruby || result.ruby.trim() === "") {
				// aozoraRubyノードが選択されている場合のみ、ノードを削除してテキストのみ残す
				if (hasRubyNode) {
					// ルビノードを削除してテキストのみ残す（元の選択範囲のテキストで置き換え）
					this.editor
						.chain()
						.focus()
						.deleteRange({ from: rangeFrom, to: rangeTo })
						.insertContent(originalSelectedText)
						.run();
				}
				// ルビノードがない場合は何もしない
				return;
			}

			// ルビOFFの場合は、青空形式を「テキストとして」挿入する（CE/Previewと同等）
			if (!rubyEnabled) {
				this.editor
					.chain()
					.focus()
					.deleteRange({ from: rangeFrom, to: rangeTo })
					.run();

				if (result.isDot) {
					const rubyText = Array.from(displayText)
						.map((char) => `｜${char}《・》`)
						.join("");
					this.editor.chain().focus().insertContent(rubyText).run();
				} else {
					const rubyText = `｜${displayText}《${result.ruby}》`;
					this.editor.chain().focus().insertContent(rubyText).run();
				}
				this.updateButtonStates();
				return;
			}

			// 拡張された選択範囲を削除してから、擬似ルビノードを挿入
			this.editor
				.chain()
				.focus()
				.deleteRange({ from: rangeFrom, to: rangeTo })
				.run();

			if (result.isDot) {
				// 傍点の場合、各文字に対して傍点を付ける
				Array.from(displayText).forEach((char) => {
					this.editor
						.chain()
						.focus()
						.insertContent({
							type: "aozoraRuby",
							attrs: {
								ruby: "・",
								hasDelimiter: true,
							},
							content: [
								{
									type: "text",
									text: char,
								},
							],
						})
						.run();
				});
			} else {
				// 通常のルビの場合、aozoraRubyノードとして挿入
				this.editor
					.chain()
					.focus()
					.insertContent({
						type: "aozoraRuby",
						attrs: {
							ruby: result.ruby,
							hasDelimiter: true,
						},
						content: [
							{
								type: "text",
								text: displayText,
							},
						],
					})
					.run();
			}

			this.updateButtonStates();
		}).open();
	}

	private clearFormatting(): void {
		if (this.runInlineCommand({ type: "clear" }, () => {})) {
			this.updateButtonStates();
			return;
		}
		// すべてのマークを削除
		this.editor.chain().focus().unsetAllMarks().run();

		this.updateButtonStates();
	}

	private runInlineCommand(
		command: PlainEditCommand,
		fallback: () => void
	): boolean {
		if (this.options.getPlainEditEnabled?.()) {
			const handled = this.options.onPlainEditCommand?.(command) ?? false;
			if (handled) {
				return true;
			}
		}
		fallback();
		return false;
	}

	private setupUpdateListener(): void {
		this.editor.on("selectionUpdate", () => {
			this.updateButtonStates();
		});

		this.editor.on("transaction", () => {
			this.updateButtonStates();
		});
	}

	private updateButtonStates(): void {
		if (this.isReadOnly) {
			this.updateReadingModeButton();
			return;
		}

		// 各ボタンのアクティブ状態を更新
		this.updateButtonState("bold", this.editor.isActive("bold"));
		this.updateButtonState("italic", this.editor.isActive("italic"));
		this.updateButtonState("strikethrough", this.editor.isActive("strike"));
		this.updateButtonState("underline", this.editor.isActive("underline"));
		this.updateButtonState(
			"highlighter",
			this.editor.isActive("obsidianHighlight")
		);
		this.updateButtonState("list", this.editor.isActive("bulletList"));
		this.updateButtonState(
			"list-ordered",
			this.editor.isActive("orderedList")
		);
		this.updateButtonState("quote", this.editor.isActive("blockquote"));
		this.updateButtonState("code-2", this.editor.isActive("codeBlock"));

		// 見出しメニューボタンの状態を更新（いずれかの見出しがアクティブならハイライト）
		let isHeadingActive = false;
		for (let level = 1; level <= 6; level++) {
			if (this.editor.isActive("heading", { level })) {
				isHeadingActive = true;
				break;
			}
		}
		this.updateButtonState("heading", isHeadingActive);

		// Undo/Redo ボタンの無効化状態を更新
		const undoButton = this.buttons.get("undo");
		if (undoButton) {
			undoButton.disabled = !this.editor.can().undo();
			undoButton.style.opacity = undoButton.disabled ? "0.5" : "1";
		}

		const redoButton = this.buttons.get("redo");
		if (redoButton) {
			redoButton.disabled = !this.editor.can().redo();
			redoButton.style.opacity = redoButton.disabled ? "0.5" : "1";
		}
	}

	updateReadingModeButton(): void {
		if (!this.readingModeButton) return;
		const enabled = this.options.getReadingModeEnabled?.() ?? false;
		this.setButtonActive(this.readingModeButton, enabled);
		const icon = enabled ? "book-open" : "book";
		setIcon(this.readingModeButton, icon);
	}

	private safeUndo(): void {
		const applied = this.editor.chain().focus().undo().run();
		if (!applied) return;
		this.reapplyCurrentWritingMode();
	}

	private safeRedo(): void {
		const applied = this.editor.chain().focus().redo().run();
		if (!applied) return;
		this.reapplyCurrentWritingMode();
	}

	/**
	 * Undo/Redo により、過去のノード属性（writingMode）が復元されて
	 * ホストの書字方向と不整合になるケースがあるため、実行後に再同期する。
	 */
	private reapplyCurrentWritingMode(): void {
		const mode = this.options.getWritingMode?.() ?? "vertical-rl";
		try {
			this.editor.commands.setWritingMode(mode);
		} catch (_) {}
	}

	updateSyncStatus(
		state: Pick<
			SyncState,
			"dirty" | "saving" | "mode" | "lastSyncResult" | "lastSyncMessage"
		>
	): void {
		if (!this.statusElement) return;

		this.statusElement.empty();

		// 読み取り専用の場合は保存・同期ステータスを表示しない
		if (this.isReadOnly) return;
		this.statusElement.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			margin-left: auto;
		`;

		// 同期モードアイコン
		if (state.mode) {
			const isManual = state.mode === "manual";
			const hasToggle =
				Boolean(this.options.onToggleSyncMode) && !this.isReadOnly;
			const modeButton = this.statusElement.createEl("button", {
				cls: "clickable-icon contenteditable-toolbar-button",
				attr: {
					"aria-label": isManual
						? "手動同期モード（クリックで自動同期に切替）"
						: "自動同期モード（クリックで手動同期に切替）",
				},
			});

			const modeIcon = isManual ? "refresh-cw-off" : "refresh-ccw";
			setIcon(modeButton, modeIcon);

			modeButton.style.cssText = `
				opacity: ${hasToggle ? 0.85 : 0.7};
				cursor: ${hasToggle ? "pointer" : "default"};
			`;
			modeButton.disabled = !hasToggle;

			if (hasToggle) {
				modeButton.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					this.options.onToggleSyncMode?.();
				});
			}
		}

		// 保存ステータスアイコン
		const statusButton = this.statusElement.createEl("button", {
			cls: "clickable-icon contenteditable-toolbar-button",
		});

		let statusIcon = "check-circle";
		let statusTitle = "保存済み";
		let iconColor = "var(--text-success)";

		if (state.saving) {
			statusIcon = "loader";
			statusTitle = "保存中...";
			iconColor = "var(--text-accent)";
			statusButton.addClass("is-loading");
		} else if (state.lastSyncResult === "error") {
			statusIcon = "x-circle";
			statusTitle = state.lastSyncMessage || "同期エラー";
			iconColor = "var(--text-error)";
		} else if (state.dirty) {
			statusIcon = "circle-dot";
			statusTitle = "未保存";
			iconColor = "var(--text-warning)";
		}

		statusButton.setAttribute("aria-label", statusTitle);
		setIcon(statusButton, statusIcon);
		statusButton.style.cssText = `
			color: ${iconColor};
			opacity: 1;
			cursor: default;
		`;
		statusButton.disabled = true;

		// 手動保存ボタン（手動モードの場合のみ）
		if (!this.isReadOnly && state.mode === "manual" && this.options.onManualSync) {
			const modKey = Platform.isMacOS ? "⌘" : "Ctrl";
			const saveButton = this.statusElement.createEl("button", {
				cls: "clickable-icon contenteditable-toolbar-button",
				attr: {
					"aria-label": `保存 (${modKey}+Shift+S)`,
				},
			});
			setIcon(saveButton, "save");

			if (state.dirty) {
				saveButton.style.cssText = `
					color: var(--text-accent);
				`;
			} else {
				saveButton.style.cssText = `
					opacity: 0.5;
				`;
			}

			saveButton.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.options.onManualSync?.();
			});
		}
	}

	private updateButtonState(buttonKey: string, isActive: boolean): void {
		const button = this.buttons.get(buttonKey);
		if (!button) return;
		this.setButtonActive(button, isActive);
	}

	private setButtonActive(
		button: HTMLButtonElement,
		isActive: boolean
	): void {
		if (isActive) {
			button.addClass("is-active");
			button.style.backgroundColor = "var(--interactive-accent)";
			button.style.color = "var(--text-on-accent)";
		} else {
			button.removeClass("is-active");
			button.style.backgroundColor = "";
			button.style.color = "";
		}
	}

	/**
	 * 書字方向に応じて水平線アイコンを更新
	 */
	updateHorizontalRuleIcon(): void {
		if (!this.horizontalRuleButton || !this.options.getWritingMode) return;

		const writingMode = this.options.getWritingMode();
		const hrIcon =
			writingMode === "vertical-rl"
				? "separator-vertical"
				: "separator-horizontal";

		this.horizontalRuleButton.empty();
		setIcon(this.horizontalRuleButton, hrIcon);
	}

	/**
	 * 書字方向ボタンの表示を更新
	 */
	updateWritingModeButton(): void {
		if (!this.writingModeButton || !this.options.getWritingMode) return;

		const mode = this.options.getWritingMode();
		const isVertical = mode === "vertical-rl";

		this.writingModeButton.empty();
		const iconEl = this.writingModeButton.createSpan();
		setIcon(iconEl, isVertical ? "arrow-down-up" : "arrow-left-right");

		this.writingModeButton.setAttribute(
			"aria-label",
			isVertical ? "横書きに切り替え" : "縦書きに切り替え"
		);
	}

	refreshRubyToggle(): void {
		this.updateRubyButton();
	}

	updateAuxiliaryButton(): void {
		this.updateAuxiliaryButtonInternal();
	}

	private updateAuxiliaryButtonInternal(): void {
		if (!this.auxiliaryToggleButton) return;
		const enabled = this.options.getAuxiliaryEnabled?.() ?? false;
		this.setButtonActive(this.auxiliaryToggleButton, enabled);
		this.auxiliaryToggleButton.setAttribute(
			"aria-label",
			enabled
				? "補助入力パネルをオフにする"
				: "補助入力パネルをオンにする"
		);
	}

	updatePlainEditButton(): void {
		this.updatePlainEditButtonInternal();
	}

	private updatePlainEditButtonInternal(): void {
		if (!this.plainEditToggleButton) return;
		const enabled = this.options.getPlainEditEnabled?.() ?? false;
		const icon = enabled ? "file-code" : "file-text";
		this.plainEditToggleButton.empty();
		setIcon(this.plainEditToggleButton, icon);
		this.setButtonActive(this.plainEditToggleButton, enabled);
		this.plainEditToggleButton.setAttribute(
			"aria-label",
			enabled ? "装飾表示に戻す" : "ソーステキスト編集モード"
		);
	}

	private updateRubyButton(): void {
		if (!this.rubyToggleButton) return;
		const enabled = this.options.getRubyEnabled?.() ?? true;
		const icon = enabled ? "eye" : "eye-off";
		this.rubyToggleButton.empty();
		setIcon(this.rubyToggleButton, icon);
		this.rubyToggleButton.setAttribute(
			"aria-label",
			enabled ? "ルビ表示をオフにする" : "ルビ表示をオンにする"
		);
		this.setButtonActive(this.rubyToggleButton, enabled);
	}

	/**
	 * 引用を付与する際、Obsidian の Markdown 仕様に合わせて末尾に空行を補う
	 * （空行が無いと後続が引用のままになるため）
	 */
	private toggleBlockquoteWithTrailingParagraph(): void {
		const wasActive = this.editor.isActive("blockquote");
		const success = this.editor.chain().focus().toggleBlockquote().run();
		this.updateButtonStates();
		if (!success) return;

		const isActive = this.editor.isActive("blockquote");
		if (wasActive || !isActive) {
			return;
		}

		this.insertBlankParagraphAfterCurrentBlockquote();
	}

	private insertBlankParagraphAfterCurrentBlockquote(): void {
		const paragraphType = this.editor.state.schema.nodes.paragraph;
		if (!paragraphType) return;

		const { state } = this.editor;
		const { $from, $to } = state.selection;

		// 現在の選択範囲を含む blockquote を特定
		const range = $from.blockRange(
			$to,
			(node) => node.type.name === "blockquote"
		);
		if (!range) return;

		let blockquoteDepth = -1;
		for (let depth = $from.depth; depth > 0; depth--) {
			if ($from.node(depth).type.name === "blockquote") {
				blockquoteDepth = depth;
				break;
			}
		}
		if (blockquoteDepth === -1) return;

		const insertPos = $from.after(blockquoteDepth);
		const existingNextNode = state.doc.nodeAt(insertPos);
		if (
			existingNextNode &&
			existingNextNode.type.name === "paragraph" &&
			existingNextNode.content.size === 0
		) {
			const tr = state.tr.setSelection(
				TextSelection.near(state.doc.resolve(insertPos + 1))
			);
			this.editor.view.dispatch(tr);
			return;
		}

		const $insert = state.doc.resolve(insertPos);
		const parent = $insert.parent;
		const index = $insert.index();
		if (!parent.canReplaceWith(index, index, paragraphType)) {
			return;
		}

		const paragraph = paragraphType.createAndFill();
		if (!paragraph) return;

		let tr = state.tr.insert(insertPos, paragraph);
		tr = tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
		this.editor.view.dispatch(tr);
	}

	destroy(): void {
		this.container.empty();
		this.buttons.clear();
	}

	setReadOnly(
		readOnly: boolean,
		options: { hideEditingButtons?: boolean } = {}
	): void {
		this.isReadOnly = readOnly;
		this.hideEditingButtonsWhenReadOnly =
			!!options.hideEditingButtons && readOnly;
		this.applyReadOnlyButtonStates();
		this.updateButtonStates();
		if (this.statusElement) {
			this.statusElement.style.opacity = readOnly ? "0.6" : "1";
		}
	}

	private applyReadOnlyButtonStates(): void {
		const allowedKeys = new Set<string>([
			// 表示・操作系（読み取り専用でも許可）
			"arrow-down-up", // 書字方向切替
			"folder-open", // ファイル切替
			"book", // 書籍モード
			"eye", // ルビ表示切替
			"settings", // 表示設定
			"search", // 検索（置換はパネル側で抑制）
			"list-tree", // アウトライン
		]);

		for (const [key, button] of this.buttons.entries()) {
			const enabled = !this.isReadOnly || allowedKeys.has(key);
			button.disabled = !enabled;
			button.style.opacity = button.disabled ? "0.35" : "1";
			if (this.hideEditingButtonsWhenReadOnly && !enabled) {
				button.style.display = "none";
			} else {
				button.style.display = "";
			}
		}

		this.updateSeparatorVisibility();
		this.updateReadingModeButton();
		if (this.statusElement) {
			this.statusElement.style.opacity = this.isReadOnly ? "0.6" : "1";
		}
	}

	private updateSeparatorVisibility(): void {
		const children = Array.from(this.container.children) as HTMLElement[];
		const isSeparator = (el: HTMLElement) =>
			el.classList.contains("contenteditable-toolbar-separator");
		const isVisible = (el: HTMLElement) => el.style.display !== "none";

		const findPrevControl = (startIndex: number) => {
			for (let i = startIndex - 1; i >= 0; i--) {
				const el = children[i];
				if (!isVisible(el)) continue;
				if (isSeparator(el)) continue;
				return el;
			}
			return null;
		};

		const findNextControl = (startIndex: number) => {
			for (let i = startIndex + 1; i < children.length; i++) {
				const el = children[i];
				if (!isVisible(el)) continue;
				if (isSeparator(el)) continue;
				return el;
			}
			return null;
		};

		for (let i = 0; i < children.length; i++) {
			const el = children[i];
			if (!isSeparator(el)) continue;
			if (!this.hideEditingButtonsWhenReadOnly) {
				el.style.display = "";
				continue;
			}
			const hasPrev = !!findPrevControl(i);
			const hasNext = !!findNextControl(i);
			el.style.display = hasPrev && hasNext ? "" : "none";
		}

		// 連続したセパレーターや先頭・末尾のセパレーターを潰す（読み取り専用時のみ強化）
		const visibleElements = children.filter(isVisible);
		let prevWasControl = false;
		for (let idx = 0; idx < visibleElements.length; idx++) {
			const el = visibleElements[idx];
			if (!isSeparator(el)) {
				prevWasControl = true;
				continue;
			}
			// 先頭に来たセパレーター、または直前がコントロールでない場合は隠す
			if (!prevWasControl) {
				el.style.display = "none";
				continue;
			}
			// 直後にコントロールがなければ隠す
			let nextControl: HTMLElement | null = null;
			for (let j = idx + 1; j < visibleElements.length; j++) {
				const candidate = visibleElements[j];
				if (!isSeparator(candidate)) {
					nextControl = candidate;
					break;
				}
			}
			if (!nextControl) {
				el.style.display = "none";
				continue;
			}
			prevWasControl = false;
		}

		// 後ろ側に連続したセパレーターが残らないよう再走査
		const visibleAfterFirstPass = children.filter(isVisible);
		let lastWasSeparator = false;
		for (const el of visibleAfterFirstPass) {
			if (!isSeparator(el)) {
				lastWasSeparator = false;
				continue;
			}
			if (lastWasSeparator) {
				el.style.display = "none";
				continue;
			}
			lastWasSeparator = true;
		}
	}

	updateEditor(editor: Editor): void {
		this.editor = editor;
		this.setupUpdateListener();
		this.updateButtonStates();
	}
}
