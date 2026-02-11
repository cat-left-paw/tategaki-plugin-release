import { Editor } from "@tiptap/core";
import { App, Menu, Notice } from "obsidian";
import { toggleHeadingForCurrentLine } from "./commands/heading";
import {
	RubyInputModal,
	RubyInputResult,
} from "../../shared/ui/ruby-input-modal";
import {
	LinkInputModal,
	LinkInputResult,
} from "../../shared/ui/link-input-modal";
import type { PlainEditCommand } from "./plain-edit-mode";
import { debugWarn } from "../../shared/logger";

export interface ContextMenuAction {
	name: string;
	title: string;
	icon: string;
	action: (editor: Editor) => void;
	isActive?: (editor: Editor) => boolean;
	isDisabled?: (editor: Editor) => boolean;
	separator?: boolean;
}

export interface TipTapCompatContextMenuOptions {
	app: App;
	onFindReplace?: (replaceMode?: boolean) => void;
	onTogglePlainEdit?: () => void;
	getPlainEditEnabled?: () => boolean;
	getRubyEnabled?: () => boolean;
	isReadOnly?: () => boolean;
	onPlainEditCommand?: (command: PlainEditCommand) => boolean;
	getPlainEditSelectionText?: () => string;
}

export class TipTapCompatContextMenu {
	private editor: Editor;
	private actions: ContextMenuAction[];
	private options: TipTapCompatContextMenuOptions;
	private app: App;

	constructor(editor: Editor, options: TipTapCompatContextMenuOptions) {
		this.editor = editor;
		this.options = options;
		this.app = options.app;
		this.actions = this.getDefaultActions();
	}

	private isReadOnly(): boolean {
		return this.options.isReadOnly?.() ?? false;
	}

	private getActiveInputSelectionText(): string {
		const activeElement = document.activeElement;
		if (
			activeElement instanceof HTMLTextAreaElement ||
			activeElement instanceof HTMLInputElement
		) {
			const start = activeElement.selectionStart ?? 0;
			const end = activeElement.selectionEnd ?? 0;
			if (end > start) {
				return activeElement.value.slice(start, end);
			}
		}
		return "";
	}

	private replaceActiveInputSelection(text: string): boolean {
		const activeElement = document.activeElement;
		if (
			activeElement instanceof HTMLTextAreaElement ||
			activeElement instanceof HTMLInputElement
		) {
			const start = activeElement.selectionStart ?? 0;
			const end = activeElement.selectionEnd ?? start;
			activeElement.setRangeText(text, start, end, "end");
			activeElement.dispatchEvent(new Event("input", { bubbles: true }));
			return true;
		}
		return false;
	}

	private getSelectedText(editor: Editor): string {
		const activeInputSelection = this.getActiveInputSelectionText();
		if (activeInputSelection.length > 0) {
			return activeInputSelection;
		}
		const selection = editor.state.selection;
		if (selection.empty) return "";
		return editor.state.doc.textBetween(selection.from, selection.to, "\n");
	}

	private async writeTextToClipboard(text: string): Promise<boolean> {
		if (!text) return false;
		if (!navigator.clipboard?.writeText) return false;
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (error) {
			debugWarn("Tategaki TipTap: clipboard write failed", error);
			return false;
		}
	}

	private copySelection(editor: Editor): void {
		void (async () => {
			const text = this.getSelectedText(editor);
			if (!text) return;
			const copied = await this.writeTextToClipboard(text);
			if (!copied) {
				new Notice("コピーに失敗しました。", 2500);
			}
		})();
	}

	private cutSelection(editor: Editor): void {
		void (async () => {
			const text = this.getSelectedText(editor);
			if (!text) return;
			const copied = await this.writeTextToClipboard(text);
			if (!copied) {
				new Notice("切り取りに失敗しました。", 2500);
				return;
			}
			if (this.replaceActiveInputSelection("")) {
				return;
			}
			editor.chain().focus().deleteSelection().run();
		})();
	}

	private pasteFromClipboard(editor: Editor): void {
		void (async () => {
			try {
				if (!navigator.clipboard?.readText) {
					new Notice("貼り付けに失敗しました。ブラウザの権限設定を確認してください。", 3000);
					return;
				}
				const text = await navigator.clipboard.readText();
				if (!text) return;
				if (this.replaceActiveInputSelection(text)) {
					return;
				}
				editor.chain().focus().insertContent(text).run();
			} catch (error) {
				debugWarn("Tategaki TipTap: paste failed", error);
				new Notice("貼り付けに失敗しました。ブラウザの権限設定を確認してください。", 3000);
			}
		})();
	}

	private getDefaultActions(): ContextMenuAction[] {
		const reapplyWritingMode = (editor: Editor): void => {
			const host = (editor.view?.dom as HTMLElement | undefined)?.closest(
				".tategaki-wysiwyg-editor"
			) as HTMLElement | null;
			const hostMode = host?.getAttribute("data-writing-mode");
			const storedMode = (editor.storage as any)?.verticalWriting
				?.currentMode as string | undefined;
			const mode =
				hostMode === "vertical-rl" || hostMode === "horizontal-tb"
					? hostMode
					: storedMode === "vertical-rl" || storedMode === "horizontal-tb"
						? storedMode
						: "vertical-rl";
				try {
					editor.commands.setWritingMode(mode as any);
				} catch (_) {
					// noop: 書字方向の再適用失敗は無視
				}
			};

			return [
				{
					name: "cut",
					title: "切り取り",
					icon: "scissors",
					action: (editor) => this.cutSelection(editor),
					isDisabled: (editor) => this.getSelectedText(editor).length === 0,
				},
				{
					name: "copy",
					title: "コピー",
					icon: "copy",
					action: (editor) => this.copySelection(editor),
					isDisabled: (editor) => this.getSelectedText(editor).length === 0,
				},
				{
					name: "paste",
					title: "貼り付け",
					icon: "clipboard-paste",
					action: (editor) => this.pasteFromClipboard(editor),
				},
			{
				name: "selectAll",
				title: "すべて選択",
				icon: "select-all",
				action: (editor) => {
					editor.chain().focus().selectAll().run();
				},
			},
			{
				name: "separator1",
				title: "",
				icon: "",
				action: () => {},
				separator: true,
			},
			{
				name: "undo",
				title: "元に戻す",
				icon: "undo",
				action: (editor) => {
					const applied = editor.chain().focus().undo().run();
					if (applied) {
						reapplyWritingMode(editor);
					}
				},
				isDisabled: (editor) => !editor.can().undo(),
			},
			{
				name: "redo",
				title: "やり直し",
				icon: "redo",
				action: (editor) => {
					const applied = editor.chain().focus().redo().run();
					if (applied) {
						reapplyWritingMode(editor);
					}
				},
				isDisabled: (editor) => !editor.can().redo(),
			},
			{
				name: "separator2",
				title: "",
				icon: "",
				action: () => {},
				separator: true,
			},
			{
				name: "bold",
				title: "太字",
				icon: "bold",
				action: (editor) =>
					this.runInlineCommand(
						{ type: "bold" },
						() => editor.chain().focus().toggleBold().run()
					),
				isActive: (editor) => editor.isActive("bold"),
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "italic",
				title: "斜体",
				icon: "italic",
				action: (editor) =>
					this.runInlineCommand(
						{ type: "italic" },
						() => editor.chain().focus().toggleItalic().run()
					),
				isActive: (editor) => editor.isActive("italic"),
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "strike",
				title: "取り消し線",
				icon: "strikethrough",
				action: (editor) =>
					this.runInlineCommand(
						{ type: "strike" },
						() => editor.chain().focus().toggleStrike().run()
					),
				isActive: (editor) => editor.isActive("strike"),
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "underline",
				title: "下線",
				icon: "underline",
				action: (editor) =>
					this.runInlineCommand(
						{ type: "underline" },
						() => editor.chain().focus().toggleUnderline().run()
					),
				isActive: (editor) => editor.isActive("underline"),
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "highlight",
				title: "ハイライト",
				icon: "highlighter",
				action: (editor) =>
					this.runInlineCommand(
						{ type: "highlight" },
						() =>
							editor
								.chain()
								.focus()
								.toggleMark("obsidianHighlight")
								.run()
					),
				isActive: (editor) => editor.isActive("obsidianHighlight"),
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "link",
				title: "リンク挿入",
				icon: "link",
				action: (editor) => {
					this.insertLink(editor);
				},
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "ruby",
				title: "ルビ挿入",
				icon: "gem",
				action: (editor) => {
					this.insertRuby(editor);
				},
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "clear",
				title: "書式クリア",
				icon: "eraser",
				action: (editor) =>
					this.runInlineCommand(
						{ type: "clear" },
						() => editor.chain().focus().unsetAllMarks().run()
					),
				isDisabled: (editor) =>
					this.isPlainEditActive()
						? !this.hasPlainEditSelection()
						: editor.state.selection.empty,
			},
			{
				name: "separator3",
				title: "",
				icon: "",
				action: () => {},
				separator: true,
			},
			{
				name: "heading1",
				title: "見出し1",
				icon: "heading-1",
				action: (editor) => toggleHeadingForCurrentLine(editor, 1),
				isActive: (editor) => editor.isActive("heading", { level: 1 }),
			},
			{
				name: "heading2",
				title: "見出し2",
				icon: "heading-2",
				action: (editor) => toggleHeadingForCurrentLine(editor, 2),
				isActive: (editor) => editor.isActive("heading", { level: 2 }),
			},
			{
				name: "heading3",
				title: "見出し3",
				icon: "heading-3",
				action: (editor) => toggleHeadingForCurrentLine(editor, 3),
				isActive: (editor) => editor.isActive("heading", { level: 3 }),
			},
			{
				name: "heading4",
				title: "見出し4",
				icon: "heading-4",
				action: (editor) => toggleHeadingForCurrentLine(editor, 4),
				isActive: (editor) => editor.isActive("heading", { level: 4 }),
			},
			{
				name: "heading5",
				title: "見出し5",
				icon: "heading-5",
				action: (editor) => toggleHeadingForCurrentLine(editor, 5),
				isActive: (editor) => editor.isActive("heading", { level: 5 }),
			},
			{
				name: "heading6",
				title: "見出し6",
				icon: "heading-6",
				action: (editor) => toggleHeadingForCurrentLine(editor, 6),
				isActive: (editor) => editor.isActive("heading", { level: 6 }),
			},
			{
				name: "separator4",
				title: "",
				icon: "",
				action: () => {},
				separator: true,
			},
			{
				name: "blockquote",
				title: "引用",
				icon: "quote",
				action: (editor) => editor.chain().focus().toggleBlockquote().run(),
				isActive: (editor) => editor.isActive("blockquote"),
			},
			{
				name: "separator5",
				title: "",
				icon: "",
				action: () => {},
				separator: true,
			},
			{
				name: "plainEdit",
				title: "ソーステキスト編集",
				icon: "file-text",
				action: () => {
					if (this.options.onTogglePlainEdit) {
						this.options.onTogglePlainEdit();
					}
				},
				isActive: () => this.options.getPlainEditEnabled?.() ?? false,
			},
			{
				name: "findReplace",
				title: "検索・置換",
				icon: "search",
				action: () => {
					if (this.options.onFindReplace) {
						this.options.onFindReplace(true);
					} else {
						new Notice("検索・置換は未実装です。", 2500);
					}
				},
			},
		];
	}

	private runInlineCommand(
		command: PlainEditCommand,
		fallback: () => void
	): void {
		if (this.isPlainEditActive()) {
			const handled = this.options.onPlainEditCommand?.(command) ?? false;
			if (handled) {
				return;
			}
		}
		fallback();
	}

	private isPlainEditActive(): boolean {
		return this.options.getPlainEditEnabled?.() ?? false;
	}

	private hasPlainEditSelection(): boolean {
		const text = this.options.getPlainEditSelectionText?.() ?? "";
		return text.length > 0;
	}

	private insertLink(editor: Editor): void {
		if (this.isPlainEditActive()) {
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

		const { from, to } = editor.state.selection;
		const selectedText = editor.state.doc.textBetween(from, to, " ");
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

				editor
					.chain()
					.focus()
					.extendMarkRange("link")
					.setLink({ href: result.url })
					.insertContent(displayText)
					.run();
			}
		).open();
	}

	private insertRuby(editor: Editor): void {
		if (this.isPlainEditActive()) {
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
		const { from, to } = editor.state.selection;
		const originalSelectedText = editor.state.doc.textBetween(from, to, " ");

		if (!originalSelectedText || originalSelectedText.trim() === "") {
			return;
		}

		let rangeFrom = from;
		let rangeTo = to;
		let hasRubyNode = false;
		let rubyNodeText = "";
		const $from = editor.state.doc.resolve(from);
		const $to = editor.state.doc.resolve(to);

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

		const displayText =
			hasRubyNode && rubyNodeText === originalSelectedText
				? rubyNodeText
				: originalSelectedText;

		new RubyInputModal(
			this.app,
			displayText,
			(result: RubyInputResult) => {
				if (result.cancelled) {
					return;
				}

				const rubyEnabled = this.options.getRubyEnabled?.() ?? true;

				if (!result.ruby || result.ruby.trim() === "") {
					if (hasRubyNode) {
						editor
							.chain()
							.focus()
							.deleteRange({ from: rangeFrom, to: rangeTo })
							.insertContent(originalSelectedText)
							.run();
					}
					return;
				}

				if (!rubyEnabled) {
					editor
						.chain()
						.focus()
						.deleteRange({ from: rangeFrom, to: rangeTo })
						.run();

					if (result.isDot) {
						const rubyText = Array.from(displayText)
							.map((char) => `｜${char}《・》`)
							.join("");
						editor.chain().focus().insertContent(rubyText).run();
					} else {
						const rubyText = `｜${displayText}《${result.ruby}》`;
						editor.chain().focus().insertContent(rubyText).run();
					}
					return;
				}

				editor
					.chain()
					.focus()
					.deleteRange({ from: rangeFrom, to: rangeTo })
					.run();

				if (result.isDot) {
					Array.from(displayText).forEach((char) => {
						editor
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
					editor
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
			}
		).open();
	}

	show(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();

		const menu = new Menu();
		const readOnly = this.isReadOnly();
		const readOnlyDisabled = new Set<string>([
			"cut",
			"paste",
			"undo",
			"redo",
			"bold",
			"italic",
			"strike",
			"underline",
			"highlight",
			"link",
			"ruby",
			"clear",
			"heading1",
			"heading2",
			"heading3",
			"heading4",
			"heading5",
			"heading6",
			"blockquote",
			"plainEdit",
		]);

		// メニュー表示時にクラスを追加（行間調整のため）
		document.body.addClass("tategaki-context-menu-active");

		// メニューが閉じられたときにクラスを削除
		const originalHide = menu.hide.bind(menu);
		menu.hide = () => {
			document.body.removeClass("tategaki-context-menu-active");
			return originalHide();
		};

		for (const action of this.actions) {
			if (action.separator) {
				menu.addSeparator();
				continue;
			}

			const isDisabled =
				(readOnly && readOnlyDisabled.has(action.name)) ||
				(action.isDisabled ? action.isDisabled(this.editor) : false);
			const isActive = action.isActive ? action.isActive(this.editor) : false;

			menu.addItem((item) => {
				item.setTitle(action.title)
					.setIcon(action.icon)
					.setDisabled(isDisabled)
					.setChecked(isActive || false)
					.onClick(() => {
						if (!isDisabled) {
							action.action(this.editor);
						}
					});
			});
		}

		menu.showAtMouseEvent(event);
	}

	updateEditor(newEditor: Editor): void {
		this.editor = newEditor;
	}

	destroy(): void {
		// no-op
	}
}
