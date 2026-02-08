/**
 * BlockHybridManager - ハイブリッドブロック編集マネージャー
 *
 * ブロックごとの表示モード（装飾/プレーン）を管理し、
 * プレーン編集モードへの切替とDOM更新を行う。
 */

import { DocumentModel } from "./block-model";
import { debugWarn } from "../../shared/logger";

/**
 * ブロック表示モード
 */
export enum BlockDisplayMode {
	DECORATED = 'decorated',  // 装飾表示（デフォルト）
	PLAIN = 'plain'           // プレーンテキスト表示（ソース編集）
}

/**
 * ブロックモード状態
 */
export interface BlockModeState {
	blockId: string;
	mode: BlockDisplayMode;
	originalHtml?: string;     // 装飾HTML（復帰用）
	originalMarkdown?: string; // 元のMarkdownソース
	cursorOffset?: number;     // カーソル位置
}

/**
 * BlockHybridManager オプション
 */
export interface BlockHybridManagerOptions {
	getModel: () => DocumentModel;
	getBlockElement: (blockId: string) => HTMLElement | null;
	markdownToHtml: (markdown: string) => Promise<string>;
	htmlToMarkdown: (html: string) => string;
	onBlockModeChange?: (blockId: string, mode: BlockDisplayMode) => void;
	onUpdate?: () => void;
}

/**
 * BlockHybridManager
 *
 * ブロック単位でプレーン編集モード（ソーステキスト編集）に切り替える機能を提供
 */
export class BlockHybridManager {
	private options: BlockHybridManagerOptions;
	private blockModes = new Map<string, BlockModeState>();
	private isPlainEditingActive = false; // プレーン編集モードが有効かどうか

	constructor(options: BlockHybridManagerOptions) {
		this.options = options;
	}

	/**
	 * プレーン編集モードが有効かどうかを取得
	 */
	isPlainEditingModeActive(): boolean {
		return this.isPlainEditingActive;
	}

	/**
	 * プレーン編集モードを有効化（段落フォーカス追従を開始）
	 */
	activatePlainEditingMode(): void {
		this.isPlainEditingActive = true;
	}

	/**
	 * プレーン編集モードを無効化（全ての段落を装飾表示に戻す）
	 */
	deactivatePlainEditingMode(): void {
		this.isPlainEditingActive = false;
		// 全てのプレーン表示ブロックを装飾表示に戻す
		const plainBlockIds = Array.from(this.blockModes.keys());
		for (const blockId of plainBlockIds) {
			void this.endPlainEdit(blockId, true);
		}
	}

	/**
	 * 指定したブロックにフォーカス移動（プレーン編集モード時）
	 * 前のブロックは自動的に装飾表示に戻す
	 */
	focusBlock(blockId: string): void {
		if (!this.isPlainEditingActive) {
			return;
		}

		// 現在プレーン表示されている他のブロックを装飾表示に戻す
		for (const [existingBlockId, state] of this.blockModes.entries()) {
			if (existingBlockId !== blockId && state.mode === BlockDisplayMode.PLAIN) {
				void this.endPlainEdit(existingBlockId, true);
			}
		}

		// 新しいブロックをプレーン表示にする
		const currentMode = this.getBlockMode(blockId);
		if (currentMode !== BlockDisplayMode.PLAIN) {
			this.startPlainEdit(blockId);
		}
	}

	/**
	 * ブロックの表示モードを設定
	 */
	setBlockMode(blockId: string, mode: BlockDisplayMode): void {
		const currentMode = this.getBlockMode(blockId);
		if (currentMode === mode) {
			return; // 既に同じモード
		}

		if (mode === BlockDisplayMode.PLAIN) {
			this.startPlainEdit(blockId);
		} else {
			void this.endPlainEdit(blockId, true);
		}
	}

	/**
	 * ブロックの現在のモードを取得
	 */
	getBlockMode(blockId: string): BlockDisplayMode {
		const state = this.blockModes.get(blockId);
		return state ? state.mode : BlockDisplayMode.DECORATED;
	}

	/**
	 * プレーン編集モードかどうか
	 */
	isPlainMode(blockId: string): boolean {
		return this.getBlockMode(blockId) === BlockDisplayMode.PLAIN;
	}

	/**
	 * プレーン編集モードを開始
	 */
	startPlainEdit(blockId: string): void {
		const block = this.options.getBlockElement(blockId);
		if (!block) {
			debugWarn(`Block element not found: ${blockId}`);
			return;
		}

		const model = this.options.getModel();
		const blockNode = model.getBlockById(blockId);
		if (!blockNode) {
			debugWarn(`Block node not found: ${blockId}`);
			return;
		}

		// 1. 元のHTMLを保存
		const originalHtml = block.innerHTML;

		// 2. ソーステキスト（Markdown）を取得
		const sourceText = blockNode.markdown || this.options.htmlToMarkdown(blockNode.html);

		// 3. カーソル位置を保存（可能なら）
		let cursorOffset = 0;
		try {
			cursorOffset = this.getCurrentOffset(block);
		} catch (e) {
			// カーソル取得失敗は無視
		}

		// 4. 状態を保存
		this.blockModes.set(blockId, {
			blockId,
			mode: BlockDisplayMode.PLAIN,
			originalHtml,
			originalMarkdown: sourceText,
			cursorOffset
		});

		// 5. DOMをプレーンテキストに置き換え
		block.textContent = sourceText;
		block.classList.add('tategaki-block--plain');
		block.setAttribute('data-plain-mode', 'true');

		// 注: 背景色と文字色はCSSの半透明オーバーレイで視覚的に区別される

		// 6. カーソル位置を復元
		try {
			this.restoreCursor(block, cursorOffset);
		} catch (e) {
			// カーソル復元失敗は無視
		}

		// 7. コールバック通知
		this.options.onBlockModeChange?.(blockId, BlockDisplayMode.PLAIN);
		this.options.onUpdate?.();
	}

	/**
	 * プレーン編集モードを終了
	 */
	async endPlainEdit(blockId: string, save: boolean): Promise<void> {
		const state = this.blockModes.get(blockId);
		if (!state) {
			return; // プレーンモードではない
		}

		const block = this.options.getBlockElement(blockId);
		if (!block) {
			debugWarn(`Block element not found: ${blockId}`);
			return;
		}

		if (save) {
			// 編集を保存
			const editedSource = block.textContent || '';

			// Markdown → HTML に変換
			const newHtml = await this.options.markdownToHtml(editedSource);

				// モデルを更新
				const model = this.options.getModel();
				void model.updateBlockWithMarkdown(blockId, editedSource, newHtml);

				// 注意: モデルはイミュータブルなので、更新されたモデルを適用するには
				// 外部（BlockEditor）でsetModelを呼ぶ必要がある
				// ここではDOMだけ更新
			block.innerHTML = newHtml;
		} else {
			// 編集をキャンセル（元のHTMLに戻す）
			block.innerHTML = state.originalHtml || '';
		}

		// クラスと属性を削除
		block.classList.remove('tategaki-block--plain');
		block.removeAttribute('data-plain-mode');

		// 状態をクリア
		this.blockModes.delete(blockId);

		// コールバック通知
		this.options.onBlockModeChange?.(blockId, BlockDisplayMode.DECORATED);
		this.options.onUpdate?.();
	}

	/**
	 * 全てのブロックのモードを設定
	 */
	setAllBlocksMode(mode: BlockDisplayMode): void {
		const model = this.options.getModel();
		const blocks = model.getBlocks();
		for (const block of blocks) {
			this.setBlockMode(block.id, mode);
		}
	}

	/**
	 * 現在のカーソルオフセットを取得
	 */
	private getCurrentOffset(element: HTMLElement): number {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return 0;
		}

		const range = selection.getRangeAt(0);
		if (!element.contains(range.startContainer)) {
			return 0;
		}

		// テキストノードまでのオフセットを計算
		const preSelectionRange = range.cloneRange();
		preSelectionRange.selectNodeContents(element);
		preSelectionRange.setEnd(range.startContainer, range.startOffset);

		return preSelectionRange.toString().length;
	}

	/**
	 * カーソル位置を復元
	 */
	private restoreCursor(element: HTMLElement, offset: number): void {
		const selection = window.getSelection();
		if (!selection) {
			return;
		}

		// テキストノードを走査してオフセット位置を特定
		const walker = document.createTreeWalker(
			element,
			NodeFilter.SHOW_TEXT,
			null
		);

		let currentOffset = 0;
		let node = walker.nextNode();

		while (node) {
			const nodeLength = node.textContent?.length || 0;
			if (currentOffset + nodeLength >= offset) {
				// このノード内にカーソル位置がある
				const range = document.createRange();
				range.setStart(node, offset - currentOffset);
				range.collapse(true);

				selection.removeAllRanges();
				selection.addRange(range);
				return;
			}

			currentOffset += nodeLength;
			node = walker.nextNode();
		}

		// オフセットが範囲外の場合は末尾に設定
		const range = document.createRange();
		range.selectNodeContents(element);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	/**
	 * 破棄
	 */
	destroy(): void {
		// 全てのプレーンモードを終了
		const blockIds = Array.from(this.blockModes.keys());
		for (const blockId of blockIds) {
			void this.endPlainEdit(blockId, false);
		}

		this.blockModes.clear();
	}
}
