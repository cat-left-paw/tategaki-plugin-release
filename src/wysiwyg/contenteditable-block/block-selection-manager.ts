/**
 * ブロック選択マネージャー
 *
 * 複数ブロックにまたがる選択の安定性を向上させます。
 */

import { BlockRenderer } from "./block-renderer";
import {
	BoundarySearchDirection,
	resolveBlockElementFromBoundary,
} from "./utils/selection-utils";
import { debugWarn } from "../../shared/logger";

export class BlockSelectionManager {
	private readonly rootElement: HTMLElement;
	private renderer: BlockRenderer;
	private enabled = true;
	private isSelecting = false;
	private selectionStartBlock: string | null = null;
	private selectionChangeDebounceTimer: number | null = null;
	private isNormalizingSelection = false;

	constructor(rootElement: HTMLElement, renderer: BlockRenderer) {
		this.rootElement = rootElement;
		this.renderer = renderer;
		this.attachListeners();
	}

	/**
	 * イベントリスナーを設定
	 */
	private attachListeners(): void {
		// マウスダウン時に選択開始を記録
		this.rootElement.addEventListener('mousedown', this.handleMouseDown, { capture: true });

		// マウスアップ時に選択終了を記録
		document.addEventListener('mouseup', this.handleMouseUp);

		// 選択変更の監視を再有効化（デバウンス付きで慎重に実行）
		document.addEventListener('selectionchange', this.handleSelectionChange);
	}

	/**
	 * マウスダウンハンドラー
	 */
	private handleMouseDown = (event: MouseEvent): void => {
		if (!this.enabled) {
			return;
		}
		const target = event.target as Node;
		const blockElement = this.findBlockElement(target);

		if (blockElement && blockElement.dataset.blockId) {
			this.isSelecting = true;
			this.selectionStartBlock = blockElement.dataset.blockId;
		}
	};

	/**
	 * マウスアップハンドラー
	 */
	private handleMouseUp = (): void => {
		if (!this.enabled) {
			return;
		}
		this.isSelecting = false;
	};

	/**
	 * 選択変更ハンドラー（デバウンス付き）
	 */
	private handleSelectionChange = (): void => {
		if (!this.enabled) {
			return;
		}
		// 正規化処理中はスキップ（無限ループ防止）
		if (this.isNormalizingSelection) {
			return;
		}

		// 選択中のみ処理（編集中は介入しない）
		if (!this.isSelecting) {
			return;
		}

		// デバウンス処理
		if (this.selectionChangeDebounceTimer !== null) {
			window.clearTimeout(this.selectionChangeDebounceTimer);
		}

		// requestAnimationFrameでデバウンス
		this.selectionChangeDebounceTimer = window.setTimeout(() => {
			requestAnimationFrame(() => {
				this.normalizeSelection();
				this.selectionChangeDebounceTimer = null;
			});
		}, 10); // 10msのデバウンス
	};

	/**
	 * 選択範囲を正規化して、ブロック境界での選択を安定化
	 */
	private normalizeSelection(): void {
		// 正規化フラグを設定
		this.isNormalizingSelection = true;

		try {
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) {
				return;
			}

			const range = selection.getRangeAt(0);

			// 選択範囲が空の場合はスキップ
			if (range.collapsed) {
				return;
			}

		// 開始・終了ノードのブロックを取得
		const startBlock = this.resolveBlockFromRangeBoundary(range.startContainer, range.startOffset, "forward");
		const endBlock = this.resolveBlockFromRangeBoundary(range.endContainer, range.endOffset, "backward");

		if (!startBlock || !endBlock) {
			return;
		}

			// 空のブロックの処理
			const needsUpdate = this.handleEmptyBlockSelection(range, startBlock, endBlock);

			// 範囲が更新された場合、選択を再設定
			if (needsUpdate) {
				selection.removeAllRanges();
				selection.addRange(range);
			}
		} finally {
			// 正規化フラグを解除
			this.isNormalizingSelection = false;
		}
	}

	/**
	 * 空ブロックの選択を処理
	 * @returns 範囲が更新された場合true
	 */
	private handleEmptyBlockSelection(range: Range, startBlock: HTMLElement, endBlock: HTMLElement): boolean {
		let updated = false;

		// 開始ブロックが空の場合
		if (this.isEmptyBlock(startBlock)) {
			try {
				// ゼロ幅スペースまたは最初の子ノードから選択開始
				if (startBlock.firstChild) {
					range.setStart(startBlock.firstChild, 0);
					updated = true;
				} else {
					range.setStart(startBlock, 0);
					updated = true;
				}
			} catch (e) {
				// エラーが発生した場合は無視
				debugWarn('Failed to set start range:', e);
			}
		}

		// 終了ブロックが空の場合
		if (this.isEmptyBlock(endBlock)) {
			try {
				// ゼロ幅スペースまたは最後の子ノードまで選択拡張
				if (endBlock.lastChild) {
					const lastChild = endBlock.lastChild;
					if (lastChild.nodeType === Node.TEXT_NODE) {
						// テキストノードの場合、テキストの長さをオフセットとする
						const offset = lastChild.textContent?.length ?? 0;
						range.setEnd(lastChild, offset);
					} else if (lastChild.nodeType === Node.ELEMENT_NODE) {
						// 要素ノードの場合、子ノード数をオフセットとする
						const offset = (lastChild as HTMLElement).childNodes.length;
						range.setEnd(lastChild, offset);
					} else {
						// その他のノードタイプの場合、親要素の最後に設定
						range.setEnd(endBlock, endBlock.childNodes.length);
					}
					updated = true;
				} else {
					range.setEnd(endBlock, endBlock.childNodes.length);
					updated = true;
				}
			} catch (e) {
				// エラーが発生した場合は無視
				debugWarn('Failed to set end range:', e);
			}
		}

		return updated;
	}

	/**
	 * ブロックが空かどうかを判定
	 */
	private isEmptyBlock(block: HTMLElement): boolean {
		// 子ノードがない
		if (block.childNodes.length === 0) {
			return true;
		}

		// <br>のみ
		if (block.childNodes.length === 1 && block.firstChild?.nodeName === 'BR') {
			return true;
		}

		// ゼロ幅スペース（U+200B）のみ
		const text = block.textContent ?? '';
		if (text === '\u200B' || text.trim() === '') {
			return true;
		}

		return false;
	}

	/**
	 * Range境界からブロック要素を解決
	 */
	private resolveBlockFromRangeBoundary(
		container: Node,
		offset: number,
		direction: BoundarySearchDirection
	): HTMLElement | null {
		const direct = this.findBlockElement(container);
		if (direct) {
			return direct;
		}
		return resolveBlockElementFromBoundary(this.rootElement, container, offset, direction);
	}

	/**
	 * ノードを含むブロック要素を検索
	 */
	private findBlockElement(node: Node | null): HTMLElement | null {
		if (!node) return null;

		let current: Node | null = node;
		while (current && current !== this.rootElement) {
			if (current instanceof HTMLElement && current.hasAttribute('data-block-id')) {
				return current;
			}
			current = current.parentNode;
		}

		return null;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.isSelecting = false;
			if (this.selectionChangeDebounceTimer !== null) {
				window.clearTimeout(this.selectionChangeDebounceTimer);
				this.selectionChangeDebounceTimer = null;
			}
		}
	}

	/**
	 * 選択範囲を複数ブロックに拡張
	 */
	expandSelectionToBlocks(startBlockId: string, endBlockId: string): boolean {
		const startBlock = this.renderer.getBlockElement(startBlockId);
		const endBlock = this.renderer.getBlockElement(endBlockId);

		if (!startBlock || !endBlock) {
			return false;
		}

		const selection = window.getSelection();
		if (!selection) {
			return false;
		}

		try {
			const range = document.createRange();

			// 開始ブロックの最初から
			range.setStart(startBlock, 0);

			// 終了ブロックの最後まで
			range.setEnd(endBlock, endBlock.childNodes.length);

			selection.removeAllRanges();
			selection.addRange(range);

			return true;
		} catch (e) {
			console.error('Failed to expand selection:', e);
			return false;
		}
	}

	/**
	 * ブロック全体を選択
	 */
	selectEntireBlock(blockId: string): boolean {
		const block = this.renderer.getBlockElement(blockId);
		if (!block) {
			return false;
		}

		const selection = window.getSelection();
		if (!selection) {
			return false;
		}

		try {
			const range = document.createRange();
			range.selectNodeContents(block);

			selection.removeAllRanges();
			selection.addRange(range);

			return true;
		} catch (e) {
			console.error('Failed to select block:', e);
			return false;
		}
	}

	/**
	 * 選択範囲をクリア
	 */
	clearSelection(): void {
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
		}
	}

	/**
	 * リソースをクリーンアップ
	 */
	destroy(): void {
		this.enabled = false;
		// タイマーをクリア
		if (this.selectionChangeDebounceTimer !== null) {
			window.clearTimeout(this.selectionChangeDebounceTimer);
			this.selectionChangeDebounceTimer = null;
		}

		this.rootElement.removeEventListener('mousedown', this.handleMouseDown, true);
		document.removeEventListener('mouseup', this.handleMouseUp);
		document.removeEventListener('selectionchange', this.handleSelectionChange);
	}

	/**
	 * レンダラーを更新
	 */
	updateRenderer(renderer: BlockRenderer): void {
		this.renderer = renderer;
	}
}
