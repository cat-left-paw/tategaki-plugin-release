import { DocumentModel, createParagraphBlock } from "./block-model";
import {
	applyAozoraRubyToElement,
	convertAozoraRubySyntaxToHtml,
	convertRubyElementsToAozora,
} from "../../shared/aozora-ruby";
import {
	getSelectedBlockIds,
	restoreSelection,
	saveSelection,
} from "./utils/selection-utils";
import { MarkdownAutoFormat } from "./markdown-autoformat";
import { MarkdownConverter } from "../contenteditable/markdown-converter";

const TAB_SPACES = "\u00A0\u00A0\u00A0\u00A0";

interface NormalizeOptions {
	enableRuby?: boolean;
}

interface BlockInputManagerOptions {
	enableRuby?: boolean;
}

export interface SetActiveBlockOptions {
	focus?: boolean;
	caret?: "start" | "end";
	preserveCaret?: boolean;
}

export interface BlockInputManagerHooks {
	getModel(): DocumentModel;
	setModel(
		model: DocumentModel,
		options?: {
			emitUpdate?: boolean;
			ensureActive?: boolean;
			forceActive?: boolean;
			render?: boolean;
			recordHistory?: boolean;
		}
	): void;
	getActiveBlockId(): string | null;
	setActiveBlock(
		blockId: string | null,
		options?: SetActiveBlockOptions
	): void;
	getBlockElement(blockId: string | null): HTMLElement | null;
	render(): void;
	emitUpdate(): void;
	selectAll?: () => void;
	isBlockInPlainMode?: (blockId: string) => boolean;
	undo?: () => void;
	redo?: () => void;
	onCompositionStart?: () => void;
	onCompositionEnd?: () => void;
}

export class BlockInputManager {
	private readonly rootElement: HTMLElement;
	private readonly hooks: BlockInputManagerHooks;
	private isComposing = false;
	private enabled = true;
	private pendingPasteSync: { blockId: string; timer: number } | null = null;
	private shouldTryAutoFormat = false;
	private enableRuby = true;

	constructor(
		rootElement: HTMLElement,
		hooks: BlockInputManagerHooks,
		options: BlockInputManagerOptions = {}
	) {
		this.rootElement = rootElement;
		this.hooks = hooks;
		this.enableRuby = options.enableRuby ?? true;
		this.attachEventListeners();
	}

	private attachEventListeners(): void {
		this.rootElement.addEventListener(
			"pointerdown",
			this.handlePointerDown,
			{ capture: true }
		);
		this.rootElement.addEventListener("focusin", this.handleFocusIn);
		this.rootElement.addEventListener(
			"beforeinput",
			this.handleBeforeInput,
			{ capture: true }
		);
		this.rootElement.addEventListener("input", this.handleInput, {
			capture: true,
		});
		this.rootElement.addEventListener("keydown", this.handleKeydown, {
			capture: true,
		});
		this.rootElement.addEventListener(
			"compositionstart",
			this.handleCompositionStart,
			{ capture: true }
		);
		this.rootElement.addEventListener(
			"compositionend",
			this.handleCompositionEnd,
			{ capture: true }
		);
		this.rootElement.addEventListener("paste", this.handlePaste, {
			capture: true,
		});
		this.rootElement.addEventListener("copy", this.handleCopy, {
			capture: true,
		});
	}

	destroy(): void {
		this.cancelPendingPasteSync();
		this.rootElement.removeEventListener(
			"pointerdown",
			this.handlePointerDown,
			true
		);
		this.rootElement.removeEventListener("focusin", this.handleFocusIn);
		this.rootElement.removeEventListener(
			"beforeinput",
			this.handleBeforeInput,
			true
		);
		this.rootElement.removeEventListener("input", this.handleInput, true);
		this.rootElement.removeEventListener(
			"keydown",
			this.handleKeydown,
			true
		);
		this.rootElement.removeEventListener(
			"compositionstart",
			this.handleCompositionStart,
			true
		);
		this.rootElement.removeEventListener(
			"compositionend",
			this.handleCompositionEnd,
			true
		);
		this.rootElement.removeEventListener("paste", this.handlePaste, true);
		this.rootElement.removeEventListener("copy", this.handleCopy, true);
	}

	isComposingActive(): boolean {
		return this.isComposing;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	setEnableRuby(enabled: boolean): void {
		this.enableRuby = enabled;
	}

	private getNormalizeOptions(): NormalizeOptions {
		return { enableRuby: this.enableRuby };
	}

	setCaretPosition(
		blockId: string,
		textOffset: number,
		options: { focus?: boolean } = {}
	): void {
		if (!this.enabled) {
			return;
		}
		const block = this.hooks.getBlockElement(blockId);
		if (!block) {
			return;
		}
		this.setSelectionInBlock(block, textOffset, textOffset);
		if (options.focus ?? true) {
			block.focus({ preventScroll: true });
		}
	}

	private handlePointerDown = (event: PointerEvent): void => {
		if (!this.enabled) return;
		const block = this.findBlockFromEvent(event);
		if (!block) return;
		const blockId = block.dataset.blockId ?? null;
		if (!blockId) return;
		if (blockId !== this.hooks.getActiveBlockId()) {
			this.hooks.setActiveBlock(blockId);
		}
	};

	private handleFocusIn = (event: FocusEvent): void => {
		if (!this.enabled) return;
		const block = this.findBlockFromEvent(event);
		if (!block) return;
		const blockId = block.dataset.blockId ?? null;
		if (!blockId) return;
		if (blockId !== this.hooks.getActiveBlockId()) {
			this.hooks.setActiveBlock(blockId);
		}
	};

	private handleInput = (event: Event): void => {
		if (!this.enabled) return;
		if (this.isComposing) return;
		const target =
			this.findBlockFromSelection() ?? this.findBlockFromEvent(event);
		if (!target) return;
		const blockId = target.dataset.blockId;
		if (!blockId) return;
		this.cancelPendingPasteSync(blockId);

		// アクティブブロックIDを静かに更新（キャレット位置を変えずに）
		const currentActiveId = this.hooks.getActiveBlockId();
		if (blockId !== currentActiveId) {
			this.hooks.setActiveBlock(blockId, {
				focus: false,
				preserveCaret: true,
			});
		}

		// プレーン執筆モードかどうかを確認
		const isPlainMode = this.hooks.isBlockInPlainMode?.(blockId) ?? false;
		const normalizeOptions = this.getNormalizeOptions();

		// Markdown自動フォーマットを試行（スペースキー入力後）
		if (this.shouldTryAutoFormat && !isPlainMode) {
			this.shouldTryAutoFormat = false;
			const formatted = MarkdownAutoFormat.tryAutoFormat(target);
			if (formatted) {
				// フォーマットが適用された場合、モデルを更新して終了
				const normalizedHtml = normalizeHtml(
					target.innerHTML,
					normalizeOptions
				);
				this.hooks.setModel(
					this.hooks
						.getModel()
						.updateBlockHtml(blockId, normalizedHtml),
					{
						emitUpdate: true,
						recordHistory: true,
						ensureActive: true,
					}
				);
				return;
			}
		}

		// プレーン執筆モード中はルビの自動変換をスキップ
		if (!isPlainMode && this.enableRuby) {
			const savedSelection = saveSelection(this.rootElement);
			const updated = applyAozoraRubyToElement(target);
			if (updated && savedSelection) {
				restoreSelection(savedSelection, this.rootElement);
			}
		}

		const normalizedHtml = normalizeHtml(target.innerHTML, normalizeOptions);
		this.hooks.setModel(
			this.hooks.getModel().updateBlockHtml(blockId, normalizedHtml),
			{ emitUpdate: true, recordHistory: true, ensureActive: true }
		);
	};

	private handleCompositionStart = (): void => {
		if (!this.enabled) return;
		this.isComposing = true;
		this.hooks.onCompositionStart?.();
	};

	private handleCompositionEnd = (event: CompositionEvent): void => {
		if (!this.enabled) {
			this.isComposing = false;
			return;
		}
		this.isComposing = false;
		this.hooks.onCompositionEnd?.();
		const target =
			this.findBlockFromSelection() ?? this.findBlockFromEvent(event);
		if (!target) return;
		const blockId = target.dataset.blockId;
		if (!blockId) return;

		if (blockId !== this.hooks.getActiveBlockId()) {
			this.hooks.setActiveBlock(blockId, {
				focus: false,
				preserveCaret: true,
			});
		}

		// プレーン執筆モード中はルビの自動変換をスキップ
		const isPlainMode = this.hooks.isBlockInPlainMode?.(blockId) ?? false;
		if (!isPlainMode && this.enableRuby) {
			const savedSelection = saveSelection(this.rootElement);
			const updated = applyAozoraRubyToElement(target);
			if (updated && savedSelection) {
				restoreSelection(savedSelection, this.rootElement);
			}
		}

		this.hooks.setModel(
			this.hooks
				.getModel()
				.updateBlockHtml(
					blockId,
					normalizeHtml(target.innerHTML, this.getNormalizeOptions())
				),
			{ emitUpdate: true, recordHistory: true }
		);
	};

	private handleKeydown = (event: KeyboardEvent): void => {
		if (!this.enabled) return;

		// Tabキーの処理を最優先で行う
		if (event.key === "Tab") {
			event.preventDefault();
			event.stopPropagation();

			const selectionRange = getSelectedBlockIds(this.rootElement);
			if (selectionRange && selectionRange.blockIds.length > 1) {
				// 複数ブロック選択時
				this.handleMultiBlockIndent(selectionRange, event.shiftKey);
			} else if (selectionRange && selectionRange.blockIds.length === 1) {
				// 単一ブロック選択時
				this.handleSingleBlockIndent(
					selectionRange.blockIds[0],
					event.shiftKey
				);
			}
			return;
		}

		if (event.isComposing) {
			return;
		}

		// Undo / Redo ショートカットをプラグイン内に閉じ込める
		const isUndoKey = event.key === "z" || event.key === "Z";
		const isRedoKey = event.key === "y" || event.key === "Y";
		const hasCtrlOrMeta = event.ctrlKey || event.metaKey;

		// Undo: Ctrl+Z / Cmd+Z
		if (isUndoKey && hasCtrlOrMeta && !event.altKey) {
			event.preventDefault();
			event.stopPropagation();
			this.hooks.undo?.();
			return;
		}

		// Redo: Ctrl+Y / Cmd+Shift+Z / Ctrl+Shift+Z
		const isRedoCombo =
			(hasCtrlOrMeta && isRedoKey && !event.altKey) ||
			(hasCtrlOrMeta && isUndoKey && event.shiftKey && !event.altKey);
		if (isRedoCombo) {
			event.preventDefault();
			event.stopPropagation();
			this.hooks.redo?.();
			return;
		}

		const block =
			this.findBlockFromEvent(event) ?? this.findBlockFromSelection();
		if (!block) return;
		const blockId = block.dataset.blockId;
		if (!blockId) return;
		const activeId = this.hooks.getActiveBlockId();
		if (blockId !== activeId) {
			this.hooks.setActiveBlock(blockId, {
				focus: false,
				preserveCaret: true,
			});
		}

		// 矢印キーの処理（段落間移動時のキャレット位置を修正）
		if (
			["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
				event.key
			)
		) {
			this.handleArrowKey(event, block, blockId);
			return;
		}

			switch (event.key) {
				case " ":
					// スペースキー入力時にMarkdown自動フォーマットを試行するフラグを設定
					this.shouldTryAutoFormat = true;
					break;
				case "Enter": {
					if (event.shiftKey) {
						return; // allow native line break
					}
					// Enter前にMarkdown自動フォーマットを試行
					const formatted = MarkdownAutoFormat.tryAutoFormat(block);
					if (formatted) {
					// フォーマットが適用された場合、通常のEnter処理はスキップ
					event.preventDefault();
					return;
				}
					event.preventDefault();
					this.handleEnter(block, blockId);
					break;
				}
				case "a":
				case "A":
					if (event.ctrlKey || event.metaKey) {
						event.preventDefault();
						this.selectAll();
				}
				break;
			case "Backspace":
				if (this.isCaretAtBlockStart()) {
					event.preventDefault();
					this.mergeWithPreviousBlock(blockId);
				}
				break;
			case "Delete":
				if (this.isCaretAtBlockEnd()) {
					event.preventDefault();
					this.mergeWithNextBlock(blockId);
				}
				break;
		}
	};

	/**
	 * 矢印キーのハンドリング（段落間移動時のキャレット位置を修正）
	 */
	private handleArrowKey(
		event: KeyboardEvent,
		block: HTMLElement,
		blockId: string
	): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const isVertical = this.isVerticalWritingMode();
		const isAtStart = this.isCaretAtBlockStart();
		const isAtEnd = this.isCaretAtBlockEnd();

		// 段落間を移動する必要があるかチェック
		let needsPrevBlock = false;
		let needsNextBlock = false;

		if (isVertical) {
			// 縦書きモード: ArrowLeft = 次段落, ArrowRight = 前段落
			if (event.key === "ArrowLeft" && isAtEnd) {
				needsNextBlock = true;
			} else if (event.key === "ArrowRight" && isAtStart) {
				needsPrevBlock = true;
			}
		} else {
			// 横書きモード: ArrowUp = 前段落, ArrowDown = 次段落
			if (event.key === "ArrowUp" && isAtStart) {
				needsPrevBlock = true;
			} else if (event.key === "ArrowDown" && isAtEnd) {
				needsNextBlock = true;
			}
		}

		if (needsPrevBlock) {
			event.preventDefault();
			this.moveToPreviousBlock(blockId);
		} else if (needsNextBlock) {
			event.preventDefault();
			this.moveToNextBlock(blockId);
		}
		// 段落の途中にいる場合は、ブラウザのネイティブ動作に任せる
		// キャレット位置の補正は行わない
	}

		private handleEnter(blockElement: HTMLElement, blockId: string): void {
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) return;
			const range = selection.getRangeAt(0);

			const { beforeHtml, afterHtml: rawAfterHtml } = splitBlockHtml(
				blockElement,
				range
			);
			let afterHtml = rawAfterHtml;
			const normalizeOptions = this.getNormalizeOptions();

		// 見出しブロック内で改行した場合、新しいブロックには見出しタグを持ち込まない
		const isHeadingBlock = blockElement.dataset.blockType === "heading";
		if (isHeadingBlock) {
			afterHtml = unwrapHeadingWrapper(afterHtml);
		}

		const sanitizedBefore = stripEmptyInlineFormatting(
			normalizeHtml(beforeHtml, normalizeOptions)
		);
		const sanitizedAfter = stripEmptyInlineFormatting(
			normalizeHtml(afterHtml, normalizeOptions)
		);

		let model = this.hooks.getModel();
		model = model.updateBlockHtml(blockId, sanitizedBefore);
		const newBlock = createParagraphBlock(sanitizedAfter);
		model = model.insertBlockAfter(blockId, newBlock);

		this.hooks.setModel(model, { emitUpdate: true, recordHistory: true });
		this.hooks.render();
		this.hooks.setActiveBlock(newBlock.id, { focus: true, caret: "start" });
	}

	private mergeWithPreviousBlock(blockId: string): void {
		const model = this.hooks.getModel();
		const index = model.getIndexById(blockId);
		if (index <= 0) {
			return;
		}
		const blocks = model.getBlocks();
		const current = blocks[index];
		const previous = blocks[index - 1];
		const mergedHtml = normalizeHtml(
			previous.html + current.html,
			this.getNormalizeOptions()
		);

		let nextModel = model.updateBlockHtml(previous.id, mergedHtml);
		nextModel = nextModel.removeBlock(current.id);
		this.hooks.setModel(nextModel, {
			emitUpdate: true,
			recordHistory: true,
		});
		this.hooks.render();
		this.hooks.setActiveBlock(previous.id, { focus: true, caret: "end" });
	}

	private mergeWithNextBlock(blockId: string): void {
		const model = this.hooks.getModel();
		const index = model.getIndexById(blockId);
		if (index === -1) return;
		const blocks = model.getBlocks();
		const current = blocks[index];
		const next = blocks[index + 1];
		if (!next) return;

		const mergedHtml = normalizeHtml(
			current.html + next.html,
			this.getNormalizeOptions()
		);
		let nextModel = model.updateBlockHtml(current.id, mergedHtml);
		nextModel = nextModel.removeBlock(next.id);
		this.hooks.setModel(nextModel, {
			emitUpdate: true,
			recordHistory: true,
		});
		this.hooks.render();
		this.hooks.setActiveBlock(current.id, { focus: true, caret: "end" });
	}

	private isCaretAtBlockStart(): boolean {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return false;
		const range = selection.getRangeAt(0);
		if (!range.collapsed) return false;

		const block = this.findBlockElementFromNode(range.startContainer);
		if (!block) return false;

		const clone = range.cloneRange();
		clone.selectNodeContents(block);
		clone.setEnd(range.startContainer, range.startOffset);
		return getRangeTextLength(clone) === 0;
	}

	private isCaretAtBlockEnd(): boolean {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return false;
		const range = selection.getRangeAt(0);
		if (!range.collapsed) return false;

		const block = this.findBlockElementFromNode(range.startContainer);
		if (!block) return false;

		const clone = range.cloneRange();
		clone.selectNodeContents(block);
		clone.setStart(range.startContainer, range.startOffset);
		return getRangeTextLength(clone) === 0;
	}

	private findBlockElement(target: EventTarget | null): HTMLElement | null {
		if (target instanceof Node) {
			return this.findBlockElementFromNode(target);
		}
		return null;
	}

	private findBlockElementFromNode(node: Node | null): HTMLElement | null {
		let current: Node | null = node;
		while (current && current !== this.rootElement) {
			if (
				current instanceof HTMLElement &&
				current.hasAttribute("data-block-id")
			) {
				return current;
			}
			current = current.parentNode;
		}
		return null;
	}

	private findBlockFromSelection(): HTMLElement | null {
		if (typeof window === "undefined") {
			return null;
		}
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return null;
		}
		return this.findBlockElementFromNode(
			selection.anchorNode ?? selection.focusNode
		);
	}

	private findBlockFromEvent(event: Event): HTMLElement | null {
		const path =
			typeof event.composedPath === "function"
				? event.composedPath()
				: [];
		for (const entry of path) {
			if (entry instanceof Node) {
				const block = this.findBlockElementFromNode(entry);
				if (block) {
					return block;
				}
			}
		}
		const targetBlock = this.findBlockElement(event.target);
		if (targetBlock) {
			return targetBlock;
		}
		return this.findBlockFromSelection();
	}

		private handleBeforeInput = (event: InputEvent): void => {
			if (!this.enabled) return;
			const block =
				this.findBlockFromEvent(event) ?? this.findBlockFromSelection();
			if (!block) return;
			const blockId = block.dataset.blockId;
			if (!blockId) return;
			const isSelectAll = event.inputType === "selectAll";

		// 複数ブロック選択をチェック
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			const selectionRange = getSelectedBlockIds(this.rootElement);

			// 複数ブロックが選択されている場合の処理
			if (selectionRange && selectionRange.blockIds.length > 1) {
				// 削除系の操作は専用ハンドラーで処理
				if (
					event.inputType === "deleteContentBackward" ||
					event.inputType === "deleteContentForward" ||
					event.inputType === "deleteByCut"
				) {
					event.preventDefault();
					event.stopPropagation();
					this.handleMultiBlockDelete(selectionRange);
					return;
				}
				// その他の操作は抑止（将来的に拡張可能）
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}

		if (isSelectAll) {
			return;
		}

		// beforeinputでsetActiveBlockを呼ぶと、キャレット位置が変わってしまうため、
		// ここでは何もせず、inputイベントで処理する
	};

	private handlePaste = (event: ClipboardEvent): void => {
		if (!this.enabled) return;

		// ブラウザのネイティブペースト動作には依存せず、常に自前で処理する
		event.preventDefault();
		event.stopPropagation();

		const block =
			this.findBlockFromEvent(event) ?? this.findBlockFromSelection();
		if (!block) return;
		const blockId = block.dataset.blockId;
		if (!blockId) return;

		// アクティブブロックを静かに更新（キャレット位置は維持）
		if (blockId !== this.hooks.getActiveBlockId()) {
			this.hooks.setActiveBlock(blockId, {
				focus: false,
				preserveCaret: true,
			});
		}

		const clipboardData = event.clipboardData;
		let htmlData = clipboardData?.getData("text/html") ?? "";
		const textData = clipboardData?.getData("text/plain") ?? "";

		// 自分のエディタ由来（tategaki-blockを含む）のHTMLは信頼し、それ以外のリッチHTMLは捨ててテキストのみを利用
		const isInternalHtml =
			!!htmlData && htmlData.includes("tategaki-block");

		if (htmlData && !isInternalHtml) {
			const lower = htmlData.toLowerCase();
			if (
				lower.includes("<html") ||
				lower.includes("<head") ||
				lower.includes("<body") ||
				lower.includes("<meta") ||
				lower.includes("<style") ||
				lower.includes("font-family:")
			) {
				htmlData = "";
			}
		}
		if (!htmlData && !textData) {
			return;
		}

		// 複数ブロック選択時のペースト処理
		const selectionRange = getSelectedBlockIds(this.rootElement);
		if (selectionRange && selectionRange.blockIds.length > 1) {
			this.cancelPendingPasteSync();
			this.handleMultiBlockPaste(
				{ html: htmlData, text: textData },
				selectionRange
			);
			return;
		}

		// 複数段落を含む場合は専用ハンドラへ
		const hasMultiParagraphHtml =
			htmlData && this.containsMultipleParagraphs(htmlData);
		const hasMultiLineText = !htmlData && textData.includes("\n");

		if (hasMultiParagraphHtml || hasMultiLineText) {
			this.handleMultiParagraphPaste(blockId, htmlData, textData);
			return;
		}

		// 単一ブロック/単一段落のペースト
		this.handleSingleBlockPaste(blockId, htmlData, textData);
	};

	private handleCopy = (event: ClipboardEvent): void => {
		if (!this.enabled) return;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0);
		if (!this.rootElement.contains(range.commonAncestorContainer)) {
			return;
		}

		const html = rangeToHtml(range);
		const markdown = MarkdownConverter.htmlToMarkdown(html, {
			trim: false,
		});

		if (!event.clipboardData) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		event.clipboardData.setData("text/plain", markdown);
		event.clipboardData.setData("text/markdown", markdown);
		event.clipboardData.setData("text/html", html);
	};

	private selectAll(): void {
		if (this.hooks.selectAll) {
			this.hooks.selectAll();
			return;
		}
		const selection = window.getSelection();
		if (!selection) return;
		selection.removeAllRanges();
		const range = document.createRange();
		range.selectNodeContents(this.rootElement);
		selection.addRange(range);
		const firstBlock =
			this.rootElement.querySelector<HTMLElement>("[data-block-id]");
		if (firstBlock) {
			const blockId = firstBlock.dataset.blockId ?? null;
			if (blockId) {
				this.hooks.setActiveBlock(blockId);
			}
		}
	}

	/**
	 * 複数ブロックの削除処理
	 */
	private handleMultiBlockDelete(selectionRange: {
		blockIds: string[];
		startBlockId: string;
		endBlockId?: string;
	}): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0);
		const normalizeOptions = this.getNormalizeOptions();
		const { blockIds, startBlockId } = selectionRange;
		const endBlockId =
			selectionRange.endBlockId || blockIds[blockIds.length - 1];

		// 開始ブロックと終了ブロックの要素を取得
		const startBlock = this.hooks.getBlockElement(startBlockId);
		const endBlock = this.hooks.getBlockElement(endBlockId);
		if (!startBlock || !endBlock) return;

		// 開始ブロック内の選択範囲前の内容を取得
		const beforeRange = document.createRange();
		beforeRange.selectNodeContents(startBlock);
		beforeRange.setEnd(range.startContainer, range.startOffset);
		const beforeHtml = rangeToHtml(beforeRange);

		// 終了ブロック内の選択範囲後の内容を取得
		const afterRange = document.createRange();
		afterRange.selectNodeContents(endBlock);
		afterRange.setStart(range.endContainer, range.endOffset);
		const afterHtml = rangeToHtml(afterRange);

		// 統合後のHTML
		const mergedHtml = normalizeHtml(beforeHtml + afterHtml, normalizeOptions);

		// モデルを更新：中間ブロックを削除し、開始ブロックを更新
		let model = this.hooks.getModel();

		// 開始ブロックを更新
		model = model.updateBlockHtml(startBlockId, mergedHtml);

		// 開始ブロック以外のすべてのブロックを削除
		for (let i = 1; i < blockIds.length; i++) {
			model = model.removeBlock(blockIds[i]);
		}

		this.hooks.setModel(model, { emitUpdate: true, recordHistory: true });
		this.hooks.render();
		this.hooks.setActiveBlock(startBlockId, { focus: true, caret: "end" });
	}

	/**
	 * 複数ブロックへのペースト処理
	 */
	private handleMultiBlockPaste(
		data: { html: string; text: string },
		selectionRange: { blockIds: string[]; startBlockId: string }
	): void {
		const pasteContent = data.html || data.text;
		if (!pasteContent) {
			return;
		}

		// まず選択範囲を削除
		this.handleMultiBlockDelete(selectionRange);

		// その後、削除後のアクティブブロックにペースト
		const activeBlockId = this.hooks.getActiveBlockId();
		if (!activeBlockId) return;

		const activeBlock = this.hooks.getBlockElement(activeBlockId);
		if (!activeBlock) return;
		const normalizeOptions = this.getNormalizeOptions();

		// ブラウザのネイティブペーストを許可するため、一時的にcontentEditableを有効化
		// (実際には既に有効なので、DOMに直接挿入)
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		// HTMLをDOMに挿入
		const range = selection.getRangeAt(0);
		range.deleteContents();

		const tempDiv = document.createElement("div");
		tempDiv.innerHTML = pasteContent;
		const fragment = document.createDocumentFragment();
		while (tempDiv.firstChild) {
			fragment.appendChild(tempDiv.firstChild);
		}
		range.insertNode(fragment);

		// モデルを更新
			this.hooks.setModel(
				this.hooks
					.getModel()
					.updateBlockHtml(
						activeBlockId,
						getNormalizedBlockHtml(activeBlock, normalizeOptions)
					),
				{ emitUpdate: true, recordHistory: true }
			);
	}

	/**
	 * 単一ブロック・単一段落へのペースト処理
	 */
	private handleSingleBlockPaste(
		blockId: string,
		htmlData: string,
		textData: string
	): void {
		const block = this.hooks.getBlockElement(blockId);
		if (!block) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const normalizeOptions = this.getNormalizeOptions();
		const range = selection.getRangeAt(0);
		range.deleteContents();

		const fragment = document.createDocumentFragment();
		let lastNode: Node | null = null;

		if (htmlData) {
			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = htmlData;
			while (tempDiv.firstChild) {
				lastNode = tempDiv.firstChild;
				fragment.appendChild(tempDiv.firstChild);
			}
		} else if (textData) {
			lastNode = document.createTextNode(textData);
			fragment.appendChild(lastNode);
		} else {
			return;
		}

		range.insertNode(fragment);

		// DOMを即座にサニタイズしてからモデルに反映
		const sanitizedHtml = getNormalizedBlockHtml(block, normalizeOptions);
		block.innerHTML = sanitizedHtml;

		this.hooks.setModel(
			this.hooks.getModel().updateBlockHtml(blockId, sanitizedHtml),
			{ emitUpdate: true, recordHistory: true, ensureActive: true }
		);

		// キャレットをブロック末尾に移動
		const updatedBlock = this.hooks.getBlockElement(blockId);
		if (updatedBlock) {
			const textLength = this.getBlockTextLength(updatedBlock);
			this.setSelectionInBlock(updatedBlock, textLength, textLength);
		}
	}

	/**
	 * HTMLコンテンツが複数の段落を含むかチェック
	 */
	private containsMultipleParagraphs(html: string): boolean {
		// divやpタグが複数含まれているかチェック
		const tempDiv = document.createElement("div");
		tempDiv.innerHTML = html;

		// tategaki-blockクラスを持つdivが複数ある場合
		const tategakiBlocks = tempDiv.querySelectorAll(".tategaki-block");
		if (tategakiBlocks.length > 1) {
			return true;
		}

		// pタグが複数ある場合
		const paragraphs = tempDiv.querySelectorAll("p");
		if (paragraphs.length > 1) {
			return true;
		}

		// divタグが複数ある場合（ただしrubyなどの特殊タグは除外）
		const divs = tempDiv.querySelectorAll("div");
		const meaningfulDivs = Array.from(divs).filter((div) => {
			// rubyやspanの親divなどは除外
			return div.textContent && div.textContent.trim().length > 0;
		});
		if (meaningfulDivs.length > 1) {
			return true;
		}

		return false;
	}

	/**
	 * 複数段落を含むHTMLのペースト処理
	 */
	private handleMultiParagraphPaste(
		blockId: string,
		htmlData: string,
		textData: string
	): void {
		const block = this.hooks.getBlockElement(blockId);
		if (!block) return;

			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) return;

			const range = selection.getRangeAt(0);
			const normalizeOptions = this.getNormalizeOptions();

			// 現在のブロックを分割
			const { beforeHtml, afterHtml } = splitBlockHtml(block, range);

		// HTMLをパース
		const tempDiv = document.createElement("div");
		tempDiv.innerHTML = htmlData;

		// tategaki-blockクラスを持つdivを抽出、なければpタグやdivタグを抽出
		let blocks = Array.from(tempDiv.querySelectorAll(".tategaki-block"));
		if (blocks.length === 0) {
			blocks = Array.from(tempDiv.querySelectorAll("p, div")).filter(
				(el) => {
					// 空でない、かつテキストコンテンツを持つ要素のみ
					return el.textContent && el.textContent.trim().length > 0;
				}
			);
		}

		// ブロックが抽出できない場合は、テキストを改行で分割
		if (blocks.length === 0 && textData) {
			const lines = textData
				.split("\n")
				.filter((line) => line.trim().length > 0);
				if (lines.length > 1) {
					// 最初の行を現在のブロックに挿入
					const firstLine = lines[0];
					const mergedHtml = normalizeHtml(
						beforeHtml + firstLine,
						normalizeOptions
					);

				let model = this.hooks.getModel();
				model = model.updateBlockHtml(blockId, mergedHtml);

				// 残りの行を新しいブロックとして追加
				let lastBlockId = blockId;
					for (let i = 1; i < lines.length - 1; i++) {
						const newBlock = createParagraphBlock(
							normalizeHtml(lines[i], normalizeOptions)
						);
						model = model.insertBlockAfter(lastBlockId, newBlock);
						lastBlockId = newBlock.id;
					}

				// 最後の行に元のブロックの後半部分を結合
					const lastLine = lines[lines.length - 1];
					const finalBlock = createParagraphBlock(
						normalizeHtml(lastLine + afterHtml, normalizeOptions)
					);
				model = model.insertBlockAfter(lastBlockId, finalBlock);

				this.hooks.setModel(model, {
					emitUpdate: true,
					recordHistory: true,
				});
				this.hooks.render();
				this.hooks.setActiveBlock(finalBlock.id, {
					focus: true,
					caret: "end",
				});
				return;
			}
		}

		// HTMLブロックが見つかった場合
		if (blocks.length > 0) {
				// 最初のブロックの内容を現在のブロックに挿入
				const firstBlockHtml = this.extractCleanHtml(
					blocks[0] as HTMLElement
				);
				const mergedHtml = normalizeHtml(
					beforeHtml + firstBlockHtml,
					normalizeOptions
				);

			let model = this.hooks.getModel();
			model = model.updateBlockHtml(blockId, mergedHtml);

			// 中間のブロックを追加
			let lastBlockId = blockId;
				for (let i = 1; i < blocks.length - 1; i++) {
					const blockHtml = this.extractCleanHtml(
						blocks[i] as HTMLElement
					);
					const newBlock = createParagraphBlock(
						normalizeHtml(blockHtml, normalizeOptions)
					);
					model = model.insertBlockAfter(lastBlockId, newBlock);
					lastBlockId = newBlock.id;
				}

			// 最後のブロックに元のブロックの後半部分を結合
				const lastBlockHtml = this.extractCleanHtml(
					blocks[blocks.length - 1] as HTMLElement
				);
				const finalBlock = createParagraphBlock(
					normalizeHtml(lastBlockHtml + afterHtml, normalizeOptions)
				);
			model = model.insertBlockAfter(lastBlockId, finalBlock);

			this.hooks.setModel(model, {
				emitUpdate: true,
				recordHistory: true,
			});
			this.hooks.render();
			this.hooks.setActiveBlock(finalBlock.id, {
				focus: true,
				caret: "end",
			});
		}
	}

	/**
	 * HTMLエレメントから不要な属性を除去してクリーンなHTMLを抽出
	 */
	private extractCleanHtml(element: HTMLElement): string {
		const clone = element.cloneNode(true) as HTMLElement;

		// Apple-interchange-newlineのbrタグを削除
		const appleNewlines = clone.querySelectorAll(
			"br.Apple-interchange-newline"
		);
		appleNewlines.forEach((br) => br.remove());

		// data-tategaki-placeholderを持つbrタグを削除
		const placeholderBrs = clone.querySelectorAll(
			"br[data-tategaki-placeholder]"
		);
		placeholderBrs.forEach((br) => br.remove());

		// 全要素から不要な属性を削除（クローンのルート要素と子要素）
		const cleanElement = (el: HTMLElement) => {
			// rubyタグとrtタグは特別扱い（必要な属性を保持）
			const isRubyRelated =
				el.tagName === "RUBY" ||
				el.tagName === "RT" ||
				el.tagName === "RP";

			// 保持すべき属性のホワイトリスト
			const allowedAttributes = isRubyRelated
				? ["href", "src", "alt", "title"] // rubyタグは基本属性のみ
				: ["href", "src", "alt", "title"]; // 他のタグも同じ

			const attributesToRemove: string[] = [];

			Array.from(el.attributes).forEach((attr) => {
				const name = attr.name;
				// 以下の属性を削除
				if (
					name.startsWith("data-") || // すべてのdata-*属性
					name.startsWith("aria-") || // すべてのaria-*属性
					name === "class" || // classは除去
					name === "style" || // styleも除去
					name === "tabindex" ||
					name === "contenteditable"
				) {
					attributesToRemove.push(name);
				} else if (
					!allowedAttributes.includes(name) &&
					!isRubyRelated
				) {
					// ホワイトリストにない属性（rubyタグ以外）
					attributesToRemove.push(name);
				}
			});

			attributesToRemove.forEach((name) => el.removeAttribute(name));
		};

		// ルート要素をクリーン
		cleanElement(clone);

		// すべての子要素をクリーン
		const allElements = clone.querySelectorAll("*");
		allElements.forEach((el) => {
			if (el instanceof HTMLElement) {
				cleanElement(el);
			}
		});

		return clone.innerHTML;
	}

	/**
	 * 複数ブロックのインデント処理
	 */
	private handleMultiBlockIndent(
		selectionRange: { blockIds: string[] },
		outdent: boolean
	): void {
		const { blockIds } = selectionRange;
		let model = this.hooks.getModel();
		const normalizeOptions = this.getNormalizeOptions();

		// 各ブロックにインデントを適用
		for (const blockId of blockIds) {
			const blockElement = this.hooks.getBlockElement(blockId);
			if (!blockElement) continue;

			if (outdent) {
				const removed = this.removeIndentAt(blockElement, 0);
				if (removed === 0) {
					continue;
				}
			} else {
				this.insertIndentAt(blockElement, 0);
			}

			// モデルを更新
			model = model.updateBlockHtml(
				blockId,
				getNormalizedBlockHtml(blockElement, normalizeOptions)
			);
		}

		this.hooks.setModel(model, { emitUpdate: true, recordHistory: true });
		this.hooks.render();

		// 選択範囲を維持
		setTimeout(() => {
			const startBlock = this.hooks.getBlockElement(blockIds[0]);
			const endBlock = this.hooks.getBlockElement(
				blockIds[blockIds.length - 1]
			);
			if (startBlock && endBlock) {
				const selection = window.getSelection();
				if (selection) {
					const range = document.createRange();
					range.setStart(startBlock, 0);
					range.setEnd(endBlock, endBlock.childNodes.length);
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}, 0);
	}

	/**
	 * 単一ブロックのインデント処理
	 */
	private handleSingleBlockIndent(blockId: string, outdent: boolean): void {
		const blockElement = this.hooks.getBlockElement(blockId);
		if (!blockElement) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		// カーソル位置を保存
		const range = selection.getRangeAt(0);
		const startOffset = this.getOffsetInBlock(
			range.startContainer,
			range.startOffset,
			blockElement
		);
		const endOffset = this.getOffsetInBlock(
			range.endContainer,
			range.endOffset,
			blockElement
		);
		const blockText = this.getBlockTextWithLineBreaks(blockElement);
		const lineStartOffsets = this.getSelectedLineStartOffsets(
			blockText,
			startOffset,
			endOffset
		);

		let nextOffsets: { start: number; end: number } | null = null;
		const normalizeOptions = this.getNormalizeOptions();

		if (outdent) {
			nextOffsets = this.applyOutdentAtSelection(
				blockElement,
				startOffset,
				endOffset,
				lineStartOffsets
			);
			if (!nextOffsets) {
				return;
			}
		} else {
			nextOffsets = this.applyIndentAtSelection(
				blockElement,
				startOffset,
				endOffset,
				range.collapsed,
				lineStartOffsets
			);
		}

		// モデルを更新
		this.hooks.setModel(
			this.hooks
				.getModel()
				.updateBlockHtml(
					blockId,
					getNormalizedBlockHtml(blockElement, normalizeOptions)
				),
			{ emitUpdate: true, recordHistory: true }
		);

		const desiredStart = nextOffsets.start;
		const desiredEnd = nextOffsets.end;

		// カーソル・選択範囲を復元
		requestAnimationFrame(() => {
			const updatedBlock = this.hooks.getBlockElement(blockId);
			if (updatedBlock) {
				this.setSelectionInBlock(
					updatedBlock,
					desiredStart,
					desiredEnd
				);
			}
		});
	}

	/**
	 * ブロック内でのテキストオフセットを計算
	 */
	private getOffsetInBlock(
		node: Node,
		offset: number,
		block: HTMLElement
	): number {
		const range = document.createRange();
		range.setStart(block, 0);
		range.setEnd(node, offset);
		const textContent = range.toString();
		return textContent.length;
	}

	private applyIndentAtSelection(
		block: HTMLElement,
		startOffset: number,
		endOffset: number,
		collapsed: boolean,
		lineStartOffsets: number[]
	): { start: number; end: number } {
		if (lineStartOffsets.length === 0) {
			lineStartOffsets = [0];
		}

		const indentSize = TAB_SPACES.length;
		let totalInsertedBeforeStart = 0;
		let totalInsertedBeforeEnd = 0;
		let cumulativeShift = 0;

		for (const lineStart of lineStartOffsets) {
			const adjustedOffset = lineStart + cumulativeShift;
			this.insertIndentAt(block, adjustedOffset);
			cumulativeShift += indentSize;

			if (lineStart <= startOffset) {
				totalInsertedBeforeStart += indentSize;
			}
			if (
				lineStart < endOffset ||
				(!collapsed && lineStart === endOffset)
			) {
				totalInsertedBeforeEnd += indentSize;
			}
		}

		const newStart = startOffset + totalInsertedBeforeStart;
		const newEnd = collapsed
			? newStart
			: endOffset + totalInsertedBeforeEnd;

		return { start: newStart, end: newEnd };
	}

	private applyOutdentAtSelection(
		block: HTMLElement,
		startOffset: number,
		endOffset: number,
		lineStartOffsets: number[]
	): { start: number; end: number } | null {
		if (lineStartOffsets.length === 0) {
			lineStartOffsets = [0];
		}

		const collapsed = startOffset === endOffset;
		let totalRemovedBeforeStart = 0;
		let totalRemovedBeforeEnd = 0;
		let cumulativeShift = 0;
		let removedAny = false;

		for (const lineStart of lineStartOffsets) {
			const adjustedOffset = Math.max(0, lineStart - cumulativeShift);
			const removed = this.removeIndentAt(block, adjustedOffset);
			if (removed > 0) {
				removedAny = true;
				cumulativeShift += removed;
				if (lineStart <= startOffset) {
					totalRemovedBeforeStart += removed;
				}
				if (
					lineStart < endOffset ||
					(!collapsed && lineStart === endOffset)
				) {
					totalRemovedBeforeEnd += removed;
				}
			}
		}

		if (!removedAny) {
			return null;
		}

		const newStart = Math.max(0, startOffset - totalRemovedBeforeStart);
		const newEnd = collapsed
			? newStart
			: Math.max(newStart, endOffset - totalRemovedBeforeEnd);

		return { start: newStart, end: newEnd };
	}

	private insertIndentAt(block: HTMLElement, textOffset: number): number {
		const insertionPoint = this.getNodeAndOffsetFromTextOffset(
			block,
			textOffset
		);
		const range = document.createRange();
		range.setStart(insertionPoint.node, insertionPoint.offset);
		range.collapse(true);
		const indentNode = document.createTextNode(TAB_SPACES);
		range.insertNode(indentNode);
		return TAB_SPACES.length;
	}

	private removeIndentAt(block: HTMLElement, textOffset: number): number {
		let removed = 0;

		for (let i = 0; i < TAB_SPACES.length; i++) {
			const position = this.getCharacterPosition(block, textOffset);
			if (!position) {
				break;
			}
			const textContent = position.textNode.textContent ?? "";
			if (position.index >= textContent.length) {
				break;
			}
			const charCode = textContent.charCodeAt(position.index);
			if (charCode !== 0xa0) {
				break;
			}
			position.textNode.deleteData(position.index, 1);
			if ((position.textNode.textContent?.length ?? 0) === 0) {
				position.textNode.remove();
			}
			removed++;
		}

		return removed;
	}

	private getBlockTextWithLineBreaks(block: HTMLElement): string {
		return typeof (block as any).innerText === "string"
			? (block as any).innerText
			: block.textContent ?? "";
	}

	private getSelectedLineStartOffsets(
		blockText: string,
		startOffset: number,
		endOffset: number
	): number[] {
		if (!blockText) {
			return [0];
		}

		const collapsed = startOffset === endOffset;
		const textLength = blockText.length;
		const clampedStart = this.clamp(startOffset, 0, textLength);
		const clampedEnd = this.clamp(endOffset, 0, textLength);

		const offsets: number[] = [];
		const firstLineStart = this.getLineStartOffset(blockText, clampedStart);
		offsets.push(firstLineStart);

			let searchIndex = firstLineStart;
			for (;;) {
				const newlineIndex = blockText.indexOf("\n", searchIndex);
				if (newlineIndex === -1) {
					break;
				}
			const nextLineStart = newlineIndex + 1;
			if (nextLineStart >= textLength) {
				break;
			}

			const includeLine =
				nextLineStart < clampedEnd ||
				(!collapsed && nextLineStart === clampedEnd);

			if (!includeLine) {
				break;
			}

			offsets.push(nextLineStart);
			searchIndex = nextLineStart;
		}

		return Array.from(new Set(offsets));
	}

	private getLineStartOffset(blockText: string, offset: number): number {
		if (offset <= 0) {
			return 0;
		}
		const clamped = this.clamp(offset, 0, blockText.length);
		const index = blockText.lastIndexOf("\n", clamped - 1);
		return index === -1 ? 0 : index + 1;
	}

	private setSelectionInBlock(
		block: HTMLElement,
		startOffset: number,
		endOffset: number
	): void {
		const selection = window.getSelection();
		if (!selection) {
			return;
		}

		const textLength = this.getBlockTextLength(block);
		const normalizedStart = this.clamp(startOffset, 0, textLength);
		const normalizedEnd = this.clamp(
			endOffset,
			normalizedStart,
			textLength
		);

		const startPoint = this.getNodeAndOffsetFromTextOffset(
			block,
			normalizedStart
		);
		const endPoint = this.getNodeAndOffsetFromTextOffset(
			block,
			normalizedEnd
		);

		const newRange = document.createRange();
		newRange.setStart(startPoint.node, startPoint.offset);
		newRange.setEnd(endPoint.node, endPoint.offset);

		selection.removeAllRanges();
		selection.addRange(newRange);
	}

	private getCharacterPosition(
		block: HTMLElement,
		offset: number
	): { textNode: Text; index: number } | null {
		if (offset < 0) {
			return null;
		}

		const walker = document.createTreeWalker(
			block,
			NodeFilter.SHOW_TEXT,
			null
		);
		let currentOffset = 0;
		let node: Node | null;

		while ((node = walker.nextNode())) {
			const textNode = node as Text;
			const content = textNode.textContent ?? "";
			const length = content.length;

			if (length === 0) {
				continue;
			}

			if (currentOffset + length > offset) {
				return {
					textNode,
					index: offset - currentOffset,
				};
			}

			currentOffset += length;
		}

		return null;
	}

	private getNodeAndOffsetFromTextOffset(
		block: HTMLElement,
		offset: number
	): { node: Node; offset: number } {
		const walker = document.createTreeWalker(
			block,
			NodeFilter.SHOW_TEXT,
			null
		);
		const textLength = this.getBlockTextLength(block);
		const clampedOffset = this.clamp(offset, 0, textLength);
		let currentOffset = 0;
		let node: Node | null;

		while ((node = walker.nextNode())) {
			const textNode = node as Text;
			const content = textNode.textContent ?? "";
			const length = content.length;

			if (currentOffset + length >= clampedOffset) {
				return {
					node: textNode,
					offset: clampedOffset - currentOffset,
				};
			}

			currentOffset += length;
		}

		return {
			node: block,
			offset: block.childNodes.length,
		};
	}

	private getBlockTextLength(block: HTMLElement): number {
		const walker = document.createTreeWalker(
			block,
			NodeFilter.SHOW_TEXT,
			null
		);
		let length = 0;
		let node: Node | null;

		while ((node = walker.nextNode())) {
			const textNode = node as Text;
			length += textNode.textContent?.length ?? 0;
		}

		return length;
	}

	private clamp(value: number, min: number, max: number): number {
		if (value < min) return min;
		if (value > max) return max;
		return value;
	}

	/**
	 * 縦書きモードかどうかを判定
	 */
	private isVerticalWritingMode(): boolean {
		const writingMode =
			this.rootElement.dataset.writingMode ||
			getComputedStyle(this.rootElement).writingMode;
		return writingMode === "vertical-rl" || writingMode === "vertical-lr";
	}

	/**
	 * 前のブロックに移動
	 */
	private moveToPreviousBlock(currentBlockId: string): void {
		const model = this.hooks.getModel();
		const currentIndex = model.getIndexById(currentBlockId);
		if (currentIndex === null || currentIndex <= 0) return;

		const blocks = model.getBlocks();
		const prevBlock = blocks[currentIndex - 1];
		const prevBlockElement = this.hooks.getBlockElement(prevBlock.id);
		if (!prevBlockElement) return;

		// 行頭から上方向へ移動する際は、末尾ではなく先頭にキャレットを置く
		this.hooks.setActiveBlock(prevBlock.id, {
			focus: true,
			caret: "start",
		});
	}

	/**
	 * 次のブロックに移動
	 */
	private moveToNextBlock(currentBlockId: string): void {
		const model = this.hooks.getModel();
		const blocks = model.getBlocks();
		const currentIndex = model.getIndexById(currentBlockId);
		if (currentIndex === null || currentIndex >= blocks.length - 1) return;

		const nextBlock = blocks[currentIndex + 1];
		const nextBlockElement = this.hooks.getBlockElement(nextBlock.id);
		if (!nextBlockElement) return;

		// 次のブロックの先頭にキャレットを設定
		this.hooks.setActiveBlock(nextBlock.id, {
			focus: true,
			caret: "start",
		});
	}

	private schedulePasteSync(blockId: string): void {
		this.cancelPendingPasteSync();
		const timer = window.setTimeout(() => {
			if (
				!this.pendingPasteSync ||
				this.pendingPasteSync.blockId !== blockId
			) {
				return;
			}
			this.pendingPasteSync = null;
			this.syncBlockFromDom(blockId);
		}, 0);
		this.pendingPasteSync = { blockId, timer };
	}

	private cancelPendingPasteSync(blockId?: string | null): void {
		if (!this.pendingPasteSync) {
			return;
		}
		if (blockId && this.pendingPasteSync.blockId !== blockId) {
			return;
		}
		window.clearTimeout(this.pendingPasteSync.timer);
		this.pendingPasteSync = null;
	}

		private syncBlockFromDom(blockId: string): void {
			const blockElement = this.hooks.getBlockElement(blockId);
			if (!blockElement) {
				return;
			}
			const normalizeOptions = this.getNormalizeOptions();
			const newHtml = getNormalizedBlockHtml(blockElement, normalizeOptions);
		const currentBlock = this.hooks.getModel().getBlockById(blockId);
		if (currentBlock && currentBlock.html === newHtml) {
			return;
		}
		this.hooks.setModel(
			this.hooks.getModel().updateBlockHtml(blockId, newHtml),
			{ emitUpdate: true, recordHistory: true }
		);
	}
}

function splitBlockHtml(
	blockElement: HTMLElement,
	range: Range
): { beforeHtml: string; afterHtml: string } {
	const beforeRange = range.cloneRange();
	beforeRange.selectNodeContents(blockElement);
	beforeRange.setEnd(range.startContainer, range.startOffset);

	const afterRange = range.cloneRange();
	afterRange.selectNodeContents(blockElement);
	afterRange.setStart(range.endContainer, range.endOffset);

	return {
		beforeHtml: rangeToHtml(beforeRange),
		afterHtml: rangeToHtml(afterRange),
	};
}

function rangeToHtml(range: Range): string {
	const div = document.createElement("div");
	const contents = range.cloneContents();
	div.appendChild(contents);

	// プレースホルダーbrタグとApple固有のbrタグを削除
	const placeholderBrs = div.querySelectorAll(
		"br[data-tategaki-placeholder]"
	);
	placeholderBrs.forEach((br) => br.remove());
	const appleNewlines = div.querySelectorAll("br.Apple-interchange-newline");
	appleNewlines.forEach((br) => br.remove());

	return div.innerHTML;
}

function getRangeTextLength(range: Range): number {
	const text = range.cloneContents().textContent;
	return text ? text.length : 0;
}

function getNormalizedBlockHtml(
	blockElement: HTMLElement,
	options: NormalizeOptions = {}
): string {
	if (!blockElement) {
		return "";
	}
	const enableRuby = options.enableRuby ?? true;
	if (enableRuby) {
		applyAozoraRubyToElement(blockElement);
	}

	// プレースホルダーbrタグを削除してからHTMLを正規化
	const clone = blockElement.cloneNode(true) as HTMLElement;
	const placeholderBrs = clone.querySelectorAll(
		"br[data-tategaki-placeholder]"
	);
	placeholderBrs.forEach((br) => br.remove());

	// Apple-interchange-newlineのbrタグも削除
	const appleNewlines = clone.querySelectorAll(
		"br.Apple-interchange-newline"
	);
	appleNewlines.forEach((br) => br.remove());

	// 不要な要素（meta, style, script など）を除去
	const disallowedTags = [
		"META",
		"STYLE",
		"SCRIPT",
		"LINK",
		"BASE",
		"TITLE",
		"HEAD",
		"HTML",
		"BODY",
		"IFRAME",
		"OBJECT",
	];
	for (const tag of disallowedTags) {
		const nodes = clone.getElementsByTagName(tag);
		// HTMLCollection はライブなので後ろから削除
		for (let i = nodes.length - 1; i >= 0; i--) {
			const el = nodes[i];
			el.parentNode?.removeChild(el);
		}
	}

	// すべての要素から不要な属性を削除
	const cleanElement = (el: HTMLElement) => {
		const isRubyRelated =
			el.tagName === "RUBY" || el.tagName === "RT" || el.tagName === "RP";

		const allowedAttributes = isRubyRelated
			? ["href", "src", "alt", "title"]
			: ["href", "src", "alt", "title"];

		const attributesToRemove: string[] = [];

		Array.from(el.attributes).forEach((attr) => {
			const name = attr.name;
			if (
				name.startsWith("data-") ||
				name.startsWith("aria-") ||
				name === "class" ||
				name === "style" ||
				name === "tabindex" ||
				name === "contenteditable"
			) {
				attributesToRemove.push(name);
			} else if (!allowedAttributes.includes(name) && !isRubyRelated) {
				attributesToRemove.push(name);
			}
		});

		attributesToRemove.forEach((name) => el.removeAttribute(name));
	};

	cleanElement(clone);
	const allElements = clone.querySelectorAll("*");
	allElements.forEach((el) => {
		if (el instanceof HTMLElement) {
			cleanElement(el);
		}
	});

	return normalizeHtml(clone.innerHTML, options);
}

function normalizeHtml(html: string, options: NormalizeOptions = {}): string {
	if (!html) {
		return "";
	}
	const enableRuby = options.enableRuby ?? true;
	const trimmed = html.trim();
	if (!trimmed) {
		return "";
	}
	if (/^<br(?:\s[^>]*)?>$/i.test(trimmed)) {
		return "";
	}

	// プレースホルダーbrタグとApple固有のbrタグを削除
	let cleaned = html;
	// data-tategaki-placeholder属性を持つbrタグを削除
	cleaned = cleaned.replace(
		/<br\s+data-tategaki-placeholder="[^"]*"[^>]*>/gi,
		""
	);
	// class="Apple-interchange-newline"を持つbrタグを削除
	cleaned = cleaned.replace(
		/<br\s+class="Apple-interchange-newline"[^>]*>/gi,
		""
	);
	cleaned = cleaned.replace(
		/<br\s+[^>]*class="Apple-interchange-newline"[^>]*>/gi,
		""
	);

	// DOMパースして不要な要素・属性を削除
	const container = document.createElement("div");
	container.innerHTML = cleaned;

	// 不要な要素を削除（中身ごと）
	const disallowedTags = [
		"META",
		"STYLE",
		"SCRIPT",
		"LINK",
		"BASE",
		"TITLE",
		"HEAD",
		"HTML",
		"BODY",
		"IFRAME",
		"OBJECT",
	];
	for (const tag of disallowedTags) {
		const nodes = container.getElementsByTagName(tag);
		for (let i = nodes.length - 1; i >= 0; i--) {
			const el = nodes[i];
			el.parentNode?.removeChild(el);
		}
	}

	// すべての要素から不要な属性を削除
	const cleanElement = (el: HTMLElement) => {
		const isRubyRelated =
			el.tagName === "RUBY" || el.tagName === "RT" || el.tagName === "RP";

		const allowedAttributes = isRubyRelated
			? ["href", "src", "alt", "title"]
			: ["href", "src", "alt", "title"];

		const attributesToRemove: string[] = [];

		Array.from(el.attributes).forEach((attr) => {
			const name = attr.name;
			if (
				name.startsWith("data-") ||
				name.startsWith("aria-") ||
				name === "class" ||
				name === "style" ||
				name === "tabindex" ||
				name === "contenteditable"
			) {
				attributesToRemove.push(name);
			} else if (!allowedAttributes.includes(name) && !isRubyRelated) {
				attributesToRemove.push(name);
			}
		});

		attributesToRemove.forEach((name) => el.removeAttribute(name));
	};

	const allElements = container.querySelectorAll("*");
	allElements.forEach((el) => {
		if (el instanceof HTMLElement) {
			cleanElement(el);
		}
	});

	cleaned = container.innerHTML;

	return enableRuby
		? convertAozoraRubySyntaxToHtml(cleaned)
		: convertRubyElementsToAozora(cleaned, { addDelimiter: false });
}

function unwrapHeadingWrapper(html: string): string {
	const container = document.createElement("div");
	container.innerHTML = html;
	const heading = container.querySelector("h1, h2, h3, h4, h5, h6");
	if (
		heading &&
		heading.parentElement === container &&
		container.childNodes.length === 1
	) {
		while (heading.firstChild) {
			container.insertBefore(heading.firstChild, heading);
		}
		heading.remove();
	}
	return container.innerHTML;
}

function stripEmptyInlineFormatting(html: string): string {
	if (!html) return html;
	const container = document.createElement("div");
	container.innerHTML = html;

	const selector = "strong, b, em, i, u, s, mark, code";
	const nodes = Array.from(container.querySelectorAll(selector));

	for (const el of nodes) {
		if (!(el instanceof HTMLElement)) continue;
		const hasContent = el.textContent?.trim().length ?? 0;
		if (hasContent === 0) {
			el.remove();
		}
	}

	return container.innerHTML;
}
