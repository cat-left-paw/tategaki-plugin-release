/**
 * 選択範囲ユーティリティ
 *
 * 複数ブロックにまたがる選択範囲の処理や、
 * 選択範囲に関連する操作を提供します。
 */

export interface BlockSelectionRange {
	/** 選択範囲の開始ブロックID */
	startBlockId: string;
	/** 選択範囲の終了ブロックID */
	endBlockId: string;
	/** 選択範囲に含まれる全ブロックID（開始から終了まで） */
	blockIds: string[];
	/** 単一ブロック内の選択かどうか */
	isSingleBlock: boolean;
	/** 選択範囲が空かどうか */
	isEmpty: boolean;
}

export type BoundarySearchDirection = "forward" | "backward";

/**
 * 現在の選択範囲を取得
 */
export function getSelection(): Selection | null {
	if (typeof window === 'undefined') {
		return null;
	}
	return window.getSelection();
}

/**
 * 選択範囲から開始・終了のブロック要素を取得
 */
export function getSelectedBlockElements(rootElement: HTMLElement): {
	startBlock: HTMLElement | null;
	endBlock: HTMLElement | null;
} {
	const selection = getSelection();
	if (!selection || selection.rangeCount === 0) {
		return { startBlock: null, endBlock: null };
	}

	const range = selection.getRangeAt(0);
	const startBlock =
		findBlockElement(range.startContainer, rootElement) ??
		resolveBlockElementFromBoundary(rootElement, range.startContainer, range.startOffset, "forward");
	const endBlock =
		findBlockElement(range.endContainer, rootElement) ??
		resolveBlockElementFromBoundary(rootElement, range.endContainer, range.endOffset, "backward");

	return { startBlock, endBlock };
}

/**
 * 選択範囲に含まれるブロックIDのリストを取得
 */
export function getSelectedBlockIds(rootElement: HTMLElement): BlockSelectionRange | null {
	const { startBlock, endBlock } = getSelectedBlockElements(rootElement);

	if (!startBlock || !endBlock) {
		return null;
	}

	const startBlockId = startBlock.dataset.blockId;
	const endBlockId = endBlock.dataset.blockId;

	if (!startBlockId || !endBlockId) {
		return null;
	}

	const selection = getSelection();
	const isEmpty = selection?.isCollapsed ?? true;

	// 単一ブロックの場合
	if (startBlockId === endBlockId) {
		return {
			startBlockId,
			endBlockId,
			blockIds: [startBlockId],
			isSingleBlock: true,
			isEmpty,
		};
	}

	// 複数ブロックの場合、範囲内のブロックを収集
	const blockIds: string[] = [];
	const allBlocks = Array.from(rootElement.querySelectorAll<HTMLElement>('[data-block-id]'));

	let inRange = false;
	for (const block of allBlocks) {
		const blockId = block.dataset.blockId;
		if (!blockId) continue;

		if (blockId === startBlockId) {
			inRange = true;
		}

		if (inRange) {
			blockIds.push(blockId);
		}

		if (blockId === endBlockId) {
			break;
		}
	}

	return {
		startBlockId,
		endBlockId,
		blockIds,
		isSingleBlock: false,
		isEmpty,
	};
}

/**
 * 指定したノードを含むブロック要素を見つける
 */
export function findBlockElement(node: Node | null, rootElement: HTMLElement): HTMLElement | null {
	if (!node) return null;

	let current: Node | null = node;
	while (current && current !== rootElement) {
		if (current instanceof HTMLElement && current.hasAttribute('data-block-id')) {
			return current;
		}
		current = current.parentNode;
	}

	return null;
}

/**
 * ルート境界の位置からブロック要素を特定
 */
export function resolveBlockElementFromBoundary(
	rootElement: HTMLElement,
	container: Node,
	offset: number,
	direction: BoundarySearchDirection
): HTMLElement | null {
	if (container !== rootElement) {
		return findBlockElement(container, rootElement);
	}

	const childElements = Array.from(rootElement.children) as HTMLElement[];
	if (childElements.length === 0) {
		return null;
	}

	const indices = collectBoundarySearchOrder(childElements.length, offset, direction);
	for (const index of indices) {
		const candidate = childElements[index];
		if (!candidate) {
			continue;
		}
		if (candidate.dataset.blockId) {
			return candidate;
		}
		const descendant = candidate.querySelector<HTMLElement>('[data-block-id]');
		if (descendant) {
			return descendant;
		}
	}

	return null;
}

function collectBoundarySearchOrder(
	childCount: number,
	offset: number,
	direction: BoundarySearchDirection
): number[] {
	if (childCount === 0) {
		return [];
	}

	const indices: number[] = [];
	if (direction === "forward") {
		const startIndex = clamp(offset, 0, childCount - 1);
		for (let i = startIndex; i < childCount; i++) {
			indices.push(i);
		}
		for (let i = startIndex - 1; i >= 0; i--) {
			indices.push(i);
		}
	} else {
		const startIndex = clamp(offset - 1, 0, childCount - 1);
		for (let i = startIndex; i >= 0; i--) {
			indices.push(i);
		}
		for (let i = startIndex + 1; i < childCount; i++) {
			indices.push(i);
		}
	}

	return indices;
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/**
 * 複数ブロックを選択
 */
export function selectBlocks(
	startBlockId: string,
	endBlockId: string,
	rootElement: HTMLElement
): boolean {
	const startBlock = rootElement.querySelector<HTMLElement>(`[data-block-id="${startBlockId}"]`);
	const endBlock = rootElement.querySelector<HTMLElement>(`[data-block-id="${endBlockId}"]`);

	if (!startBlock || !endBlock) {
		return false;
	}

	const selection = getSelection();
	if (!selection) {
		return false;
	}

	const range = document.createRange();
	range.setStart(startBlock, 0);
	range.setEnd(endBlock, endBlock.childNodes.length);

	selection.removeAllRanges();
	selection.addRange(range);

	return true;
}

/**
 * 選択範囲を保存（後で復元可能）
 */
export interface SavedSelection {
	startBlockId: string;
	endBlockId: string;
	startOffset: number;
	endOffset: number;
}

export function saveSelection(rootElement: HTMLElement): SavedSelection | null {
	const selection = getSelection();
	if (!selection || selection.rangeCount === 0) {
		return null;
	}

	const range = selection.getRangeAt(0);
	const startBlock =
		findBlockElement(range.startContainer, rootElement) ??
		resolveBlockElementFromBoundary(rootElement, range.startContainer, range.startOffset, "forward");
	const endBlock =
		findBlockElement(range.endContainer, rootElement) ??
		resolveBlockElementFromBoundary(rootElement, range.endContainer, range.endOffset, "backward");

	if (!startBlock || !endBlock) {
		return null;
	}

	const startBlockId = startBlock.dataset.blockId;
	const endBlockId = endBlock.dataset.blockId;

	if (!startBlockId || !endBlockId) {
		return null;
	}

	// ブロック内でのオフセットを計算
	const startOffset = getOffsetInBlock(range.startContainer, range.startOffset, startBlock);
	const endOffset = getOffsetInBlock(range.endContainer, range.endOffset, endBlock);

	return {
		startBlockId,
		endBlockId,
		startOffset,
		endOffset,
	};
}

/**
 * 保存した選択範囲を復元
 */
export function restoreSelection(saved: SavedSelection, rootElement: HTMLElement): boolean {
	const startBlock = rootElement.querySelector<HTMLElement>(`[data-block-id="${saved.startBlockId}"]`);
	const endBlock = rootElement.querySelector<HTMLElement>(`[data-block-id="${saved.endBlockId}"]`);

	if (!startBlock || !endBlock) {
		return false;
	}

	const selection = getSelection();
	if (!selection) {
		return false;
	}

	const range = document.createRange();

	// オフセットからノードと位置を復元
	const startPoint = getNodeAtOffset(startBlock, saved.startOffset);
	const endPoint = getNodeAtOffset(endBlock, saved.endOffset);

	if (!startPoint || !endPoint) {
		return false;
	}

	range.setStart(startPoint.node, startPoint.offset);
	range.setEnd(endPoint.node, endPoint.offset);

	selection.removeAllRanges();
	selection.addRange(range);

	return true;
}

/**
 * ブロック内でのテキストオフセットを計算
 */
function getOffsetInBlock(node: Node, offset: number, block: HTMLElement): number {
	const range = document.createRange();
	range.setStart(block, 0);
	range.setEnd(node, offset);

	const textContent = range.toString();
	return textContent.length;
}

/**
 * オフセットからノードと位置を取得
 */
function getNodeAtOffset(block: HTMLElement, offset: number): { node: Node; offset: number } | null {
	const walker = document.createTreeWalker(
		block,
		NodeFilter.SHOW_TEXT,
		null
	);

	let currentOffset = 0;
	let node: Node | null;

	while ((node = walker.nextNode())) {
		const textNode = node as Text;
		const length = textNode.textContent?.length || 0;

		if (currentOffset + length >= offset) {
			return {
				node: textNode,
				offset: offset - currentOffset,
			};
		}

		currentOffset += length;
	}

	// オフセットがブロック末尾を超える場合、最後のノードを返す
	if (block.lastChild) {
		return {
			node: block,
			offset: block.childNodes.length,
		};
	}

	return null;
}

/**
 * 選択範囲のテキストを取得
 */
export function getSelectedText(): string {
	const selection = getSelection();
	if (!selection || selection.rangeCount === 0) {
		return '';
	}
	return selection.toString();
}

/**
 * 選択範囲が空かどうか
 */
export function isSelectionEmpty(): boolean {
	const selection = getSelection();
	return !selection || selection.isCollapsed;
}

/**
 * 選択範囲をクリア
 */
export function clearSelection(): void {
	const selection = getSelection();
	if (selection) {
		selection.removeAllRanges();
	}
}

/**
 * ブロック全体を選択
 */
export function selectBlock(blockId: string, rootElement: HTMLElement): boolean {
	const block = rootElement.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
	if (!block) {
		return false;
	}

	const selection = getSelection();
	if (!selection) {
		return false;
	}

	const range = document.createRange();
	range.selectNodeContents(block);

	selection.removeAllRanges();
	selection.addRange(range);

	return true;
}
