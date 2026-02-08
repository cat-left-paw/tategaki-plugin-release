/**
 * ブロックコマンド
 *
 * 複数ブロックにまたがる書式適用や、
 * ブロック単位の操作を提供します。
 */

import { DocumentModel, BlockNode } from "./block-model";
import { BlockRenderer } from "./block-renderer";
	import {
		getSelectedBlockIds,
		saveSelection,
		restoreSelection,
	} from "./utils/selection-utils";

export type FormatCommand =
	| "bold"
	| "italic"
	| "underline"
	| "strikethrough"
	| "highlight"
	| "heading1"
	| "heading2"
	| "heading3"
	| "heading4"
	| "heading5"
	| "heading6"
	| "bulletList"
	| "orderedList"
	| "blockquote"
	| "clearFormatting";

/**
 * 複数ブロックへの書式適用を管理するクラス
 */
export class BlockCommandManager {
	private model: DocumentModel;
	private renderer: BlockRenderer;
	private onUpdate: (model: DocumentModel) => void;

	constructor(
		model: DocumentModel,
		renderer: BlockRenderer,
		onUpdate: (model: DocumentModel) => void
	) {
		this.model = model;
		this.renderer = renderer;
		this.onUpdate = onUpdate;
	}

	/**
	 * モデルを更新
	 */
	updateModel(model: DocumentModel): void {
		this.model = model;
	}

	/**
	 * 書式コマンドを実行
	 */
	executeCommand(command: FormatCommand): boolean {
		// clearFormattingは親クラスのFormattingManagerに任せる
		if (command === "clearFormatting") {
			return false;
		}

		const rootElement = this.renderer.getRootElement();
		const selectionRange = getSelectedBlockIds(rootElement);

		if (!selectionRange) {
			return false;
		}

		const headingLevel = this.getHeadingLevelFromCommand(command);
		const isBlockquoteCommand = command === "blockquote";

		// 選択範囲を保存
		const savedSelection = saveSelection(rootElement);

		if (headingLevel !== null) {
			this.applyHeadingCommand(selectionRange.blockIds, headingLevel);
			if (savedSelection) {
				requestAnimationFrame(() => {
					restoreSelection(savedSelection, rootElement);
				});
			}
			return true;
		}

		if (isBlockquoteCommand) {
			this.applyBlockquoteCommand(selectionRange.blockIds);
			if (savedSelection) {
				requestAnimationFrame(() => {
					restoreSelection(savedSelection, rootElement);
				});
			}
			return true;
		}

		// 単一ブロックの場合は、execCommandを使用
		if (selectionRange.isSingleBlock) {
			this.applySingleBlockFormat(command, selectionRange.startBlockId);
		} else {
			// 複数ブロックの場合は、各ブロックに適用
			this.applyMultiBlockFormat(command, selectionRange.blockIds);
		}

		// 選択範囲を復元
		if (savedSelection) {
			requestAnimationFrame(() => {
				restoreSelection(savedSelection, rootElement);
			});
		}

		return true;
	}

	/**
	 * 単一ブロックに書式を適用
	 */
	private applySingleBlockFormat(command: FormatCommand, blockId: string): void {
		const blockElement = this.renderer.getBlockElement(blockId);
		if (!blockElement) {
			return;
		}

		// フォーカスを設定
		blockElement.focus();

		// execCommandを実行
		this.executeFormatCommand(command);

		// ブロックのHTMLを更新
		this.updateBlockHtml(blockId, blockElement.innerHTML);
	}

	/**
	 * 複数ブロックに書式を適用
	 */
	private applyMultiBlockFormat(command: FormatCommand, blockIds: string[]): void {
		const updates: { blockId: string; html: string }[] = [];

		for (const blockId of blockIds) {
			const blockElement = this.renderer.getBlockElement(blockId);
			if (!blockElement) {
				continue;
			}

			// ブロック全体を選択
			const range = document.createRange();
			range.selectNodeContents(blockElement);
			const selection = window.getSelection();
			if (selection) {
				selection.removeAllRanges();
				selection.addRange(range);
			}

			// フォーカスを設定
			blockElement.focus();

			// execCommandを実行
			this.executeFormatCommand(command);

			// 更新を記録
			updates.push({
				blockId,
				html: blockElement.innerHTML,
			});
		}

		// 一括更新
		let newModel = this.model;
		for (const { blockId, html } of updates) {
			newModel = newModel.updateBlockHtml(blockId, html);
		}

		this.model = newModel;
		this.onUpdate(newModel);
	}

	/**
	 * execCommandを実行
	 */
	private executeFormatCommand(command: FormatCommand): void {
		switch (command) {
			case "bold":
				document.execCommand("bold", false);
				break;
			case "italic":
				document.execCommand("italic", false);
				break;
			case "underline":
				document.execCommand("underline", false);
				break;
			case "strikethrough":
				document.execCommand("strikethrough", false);
				break;
			case "highlight":
				// ハイライトは<mark>タグで実装
				this.applyHighlight();
				break;
			case "bulletList":
				document.execCommand("insertUnorderedList", false);
				break;
			case "orderedList":
				document.execCommand("insertOrderedList", false);
				break;
			case "blockquote":
				document.execCommand("formatBlock", false, "<blockquote>");
				break;
			case "clearFormatting":
				// clearFormattingは特殊で、FormattingManagerの実装を使う
				// ここでは何もせず、呼び出し元で処理させる
				break;
		}
	}

	/**
	 * ハイライト（<mark>タグ）を適用
	 */
	private applyHighlight(): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return;
		}

		const range = selection.getRangeAt(0);
		if (range.collapsed) {
			return;
		}

		// 選択範囲のテキストを取得
		const selectedText = range.toString();

		// <mark>要素を作成
		const mark = document.createElement('mark');
		mark.textContent = selectedText;

		// 既存の選択範囲を削除して、<mark>を挿入
		range.deleteContents();
		range.insertNode(mark);

		// カーソルを<mark>の直後に移動
		range.setStartAfter(mark);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
	}


	private getHeadingLevelFromCommand(command: FormatCommand): number | null {
		switch (command) {
			case "heading1":
				return 1;
			case "heading2":
				return 2;
			case "heading3":
				return 3;
			case "heading4":
				return 4;
			case "heading5":
				return 5;
			case "heading6":
				return 6;
			default:
				return null;
		}
	}

	applyHeadingToSelection(level: number, fallbackBlockId?: string): boolean {
		const rootElement = this.renderer.getRootElement();
		let selectionRange = getSelectedBlockIds(rootElement);

		// メニュー操作などで選択が失われた場合は、フォールバックのブロックに選択を張りなおす
		if (!selectionRange && fallbackBlockId) {
			const fallbackBlock = this.renderer.getBlockElement(fallbackBlockId);
			if (fallbackBlock) {
				const selection = window.getSelection();
				if (selection) {
					const range = document.createRange();
					range.selectNodeContents(fallbackBlock);
					range.collapse(true);
					selection.removeAllRanges();
					selection.addRange(range);
					fallbackBlock.focus({ preventScroll: true });
				}
				selectionRange = getSelectedBlockIds(rootElement);
			}
		}

		if (!selectionRange) {
			return false;
		}

		const savedSelection = saveSelection(rootElement);
		this.applyHeadingCommand(selectionRange.blockIds, level);
		if (savedSelection) {
			requestAnimationFrame(() => {
				restoreSelection(savedSelection, rootElement);
			});
		}
		return true;
	}

	private applyHeadingCommand(blockIds: string[], level: number): void {
		let newModel = this.model;

		for (const blockId of blockIds) {
			const blockElement = this.renderer.getBlockElement(blockId);
			if (!blockElement) continue;

			const block = newModel.getBlockById(blockId);
			if (!block) continue;

			const currentHtml = blockElement.innerHTML;
			const transformResult = this.transformHeadingHtml(currentHtml, block, level);

			if (transformResult.changed) {
				blockElement.innerHTML = transformResult.html;
				blockElement.dataset.blockType = transformResult.isHeading ? "heading" : "paragraph";
				if (transformResult.isHeading) {
					blockElement.dataset.headingLevel = level.toString();
				} else {
					delete blockElement.dataset.headingLevel;
				}
				const updatedBlock: BlockNode = {
					...block,
					type: transformResult.isHeading ? "heading" : "paragraph",
					html: transformResult.html,
					metadata: this.updateBlockMetadataForHeading(block.metadata, transformResult.isHeading ? level : null),
				};
				newModel = newModel.updateBlock(updatedBlock);
			}
		}

		if (newModel !== this.model) {
			this.model = newModel;
			this.onUpdate(newModel);
		}
	}

		private transformHeadingHtml(html: string, block: BlockNode, level: number): { html: string; isHeading: boolean; changed: boolean } {
			const trimmed = html.trim();
			// 属性を含む見出しタグにもマッチするように正規表現を修正
			const match = trimmed.match(/^<h([1-6])(?:\s[^>]*)?>[\s\S]*<\/h\1>$/i);
			let content: string;

			if (match) {
				// 見出しタグの内容を抽出（属性を除外）
				// <h[1-6] ...>と</h[1-6]>を除去して内容を取得
				content = trimmed.replace(/^<h[1-6](?:\s[^>]*)?>|<\/h[1-6]>$/gi, '');
			} else {
				content = trimmed;
			}

		// レベル0は見出し解除
		if (level <= 0) {
			const plain = content || "\u200B";
			return {
				html: plain,
				isHeading: false,
				changed: trimmed !== plain,
			};
		}

		// 新しい見出しHTMLを生成
		const inner = content || "\u200B";
		const newHtml = `<h${level}>${inner}</h${level}>`;
		return {
			html: newHtml,
			isHeading: true,
			changed: trimmed !== newHtml,
		};
	}

	private getCurrentHeadingLevel(block: BlockNode, match: RegExpMatchArray | null): number | null {
		if (block.type === "heading" && typeof block.metadata.headingLevel === "number") {
			return block.metadata.headingLevel;
		}
		if (match) {
			return parseInt(match[1], 10);
		}
		return null;
	}

		private updateBlockMetadataForHeading(metadata: BlockNode["metadata"], level: number | null): BlockNode["metadata"] {
			if (level === null) {
				const next = { ...metadata };
				delete next.headingLevel;
				return next;
			}
			return { ...metadata, headingLevel: level };
		}

	private applyBlockquoteCommand(blockIds: string[]): void {
		let newModel = this.model;

		for (const blockId of blockIds) {
			const blockElement = this.renderer.getBlockElement(blockId);
			if (!blockElement) continue;

			const block = newModel.getBlockById(blockId);
			if (!block) continue;

			const currentHtml = blockElement.innerHTML;
			const transformResult = this.transformBlockquoteHtml(currentHtml, block);

			if (transformResult.changed) {
				blockElement.innerHTML = transformResult.html;
				blockElement.dataset.blockType = transformResult.isBlockquote ? "blockquote" : "paragraph";
				if (transformResult.isBlockquote) {
					blockElement.dataset.blockquoteDepth = "1";
				} else {
					delete blockElement.dataset.blockquoteDepth;
				}

				const updatedBlock: BlockNode = {
					...block,
					type: transformResult.isBlockquote ? "blockquote" : "paragraph",
					html: transformResult.html,
					metadata: this.updateBlockMetadataForBlockquote(block.metadata, transformResult.isBlockquote),
				};
				newModel = newModel.updateBlock(updatedBlock);
			}
		}

		if (newModel !== this.model) {
			this.model = newModel;
			this.onUpdate(newModel);
		}
	}

	private transformBlockquoteHtml(html: string, block: BlockNode): { html: string; isBlockquote: boolean; changed: boolean } {
		const original = html;
		const trimmed = html.trim();
		const match = trimmed.match(/^<blockquote>([\s\S]*)<\/blockquote>$/i);
		const currentIsBlockquote = block.type === "blockquote" || !!match;

		if (currentIsBlockquote) {
			const inner = match ? match[1] : trimmed.replace(/^<blockquote>/i, "").replace(/<\/blockquote>$/i, "");
			const plain = inner || "\u200B";
			return {
				html: plain,
				isBlockquote: false,
				changed: original !== plain,
			};
		}

		const content = original || "\u200B";
		const wrapped = `<blockquote>${content}</blockquote>`;
		return {
			html: wrapped,
			isBlockquote: true,
			changed: original !== wrapped,
		};
	}

		private updateBlockMetadataForBlockquote(metadata: BlockNode["metadata"], isBlockquote: boolean): BlockNode["metadata"] {
			const rest = { ...metadata };
			delete rest.blockquoteDepth;
			delete rest.headingLevel;
			if (!isBlockquote) {
				return rest;
			}
			return { ...rest, blockquoteDepth: 1 };
		}

	/**
	 * ブロックのHTMLを更新
	 */
	private updateBlockHtml(blockId: string, html: string): void {
		const newModel = this.model.updateBlockHtml(blockId, html);
		this.model = newModel;
		this.onUpdate(newModel);
	}

	/**
	 * インデント
	 */
	indent(): boolean {
		const rootElement = this.renderer.getRootElement();
		const selectionRange = getSelectedBlockIds(rootElement);

		if (!selectionRange) {
			return false;
		}

		for (const blockId of selectionRange.blockIds) {
			const blockElement = this.renderer.getBlockElement(blockId);
			if (!blockElement) {
				continue;
			}

			// インデントを適用
			blockElement.style.paddingLeft = `${parseFloat(blockElement.style.paddingLeft || '0') + 20}px`;

			// 更新
			this.updateBlockHtml(blockId, blockElement.innerHTML);
		}

		return true;
	}

	/**
	 * アウトデント
	 */
	outdent(): boolean {
		const rootElement = this.renderer.getRootElement();
		const selectionRange = getSelectedBlockIds(rootElement);

		if (!selectionRange) {
			return false;
		}

		for (const blockId of selectionRange.blockIds) {
			const blockElement = this.renderer.getBlockElement(blockId);
			if (!blockElement) {
				continue;
			}

			// アウトデントを適用
			const currentPadding = parseFloat(blockElement.style.paddingLeft || '0');
			blockElement.style.paddingLeft = `${Math.max(0, currentPadding - 20)}px`;

			// 更新
			this.updateBlockHtml(blockId, blockElement.innerHTML);
		}

		return true;
	}

	/**
	 * 選択範囲のブロックを削除
	 */
	deleteSelectedBlocks(): boolean {
		const rootElement = this.renderer.getRootElement();
		const selectionRange = getSelectedBlockIds(rootElement);

		if (!selectionRange || selectionRange.blockIds.length === 0) {
			return false;
		}

		// 最初のブロック以外を削除
		let newModel = this.model;
		for (let i = 1; i < selectionRange.blockIds.length; i++) {
			newModel = newModel.removeBlock(selectionRange.blockIds[i]);
		}

		// 最初のブロックを空にする
		newModel = newModel.updateBlockHtml(selectionRange.blockIds[0], '');

		this.model = newModel;
		this.onUpdate(newModel);

		return true;
	}

	/**
	 * 選択範囲のブロックを結合
	 */
	mergeSelectedBlocks(): boolean {
		const rootElement = this.renderer.getRootElement();
		const selectionRange = getSelectedBlockIds(rootElement);

		if (!selectionRange || selectionRange.blockIds.length < 2) {
			return false;
		}

		// 全ブロックのHTMLを結合
		const blocks = selectionRange.blockIds
			.map(id => this.model.getBlockById(id))
			.filter((block): block is BlockNode => block !== undefined);

		const mergedHtml = blocks.map(block => block.html).join(' ');

		// 最初のブロックに結合したHTMLを設定
		let newModel = this.model.updateBlockHtml(selectionRange.blockIds[0], mergedHtml);

		// 残りのブロックを削除
		for (let i = 1; i < selectionRange.blockIds.length; i++) {
			newModel = newModel.removeBlock(selectionRange.blockIds[i]);
		}

		this.model = newModel;
		this.onUpdate(newModel);

		return true;
	}

	/**
	 * 書式がアクティブかどうかを確認
	 */
	isFormatActive(command: FormatCommand): boolean {
		switch (command) {
			case "bold":
				return document.queryCommandState("bold");
			case "italic":
				return document.queryCommandState("italic");
			case "underline":
				return document.queryCommandState("underline");
			case "strikethrough":
				return document.queryCommandState("strikethrough");
			default:
				return false;
		}
	}
}
