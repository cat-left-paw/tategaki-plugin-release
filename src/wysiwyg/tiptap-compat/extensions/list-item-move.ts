import { Extension } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, Transaction } from "@tiptap/pm/state";

interface ListItemMoveOptions {
	isVertical: () => boolean;
}

/**
 * リスト項目の移動拡張
 *
 * アウトライナー的な挙動を提供します:
 * - 横書き時: Mod+Up / Mod+Down でリスト項目を上下に移動
 * - 縦書き時: Mod+Right / Mod+Left でリスト項目を上下に移動
 */
export const ListItemMove = Extension.create<ListItemMoveOptions>({
	name: "listItemMove",

	addOptions() {
		return {
			isVertical: () => false,
		};
	},

	addKeyboardShortcuts() {
		const moveUp = () => {
			if (!this.editor.isEditable) {
				return false;
			}
			return this.editor.commands.moveListItemUp();
		};
		const moveDown = () => {
			if (!this.editor.isEditable) {
				return false;
			}
			return this.editor.commands.moveListItemDown();
		};

		return {
			// 横書き時: Mod+Up/Down
			"Mod-ArrowUp": () => {
				if (this.options.isVertical()) {
					return false;
				}
				return moveUp();
			},
			"Mod-ArrowDown": () => {
				if (this.options.isVertical()) {
					return false;
				}
				return moveDown();
			},
			// 縦書き時: Mod+Right/Left (縦書きでは右が上、左が下)
			"Mod-ArrowRight": () => {
				if (!this.options.isVertical()) {
					return false;
				}
				return moveUp();
			},
			"Mod-ArrowLeft": () => {
				if (!this.options.isVertical()) {
					return false;
				}
				return moveDown();
			},
		};
	},

	addCommands() {
		return {
			moveListItemUp:
				() =>
				({ state, dispatch }) => {
					if (!this.editor.isEditable) {
						return false;
					}
					return moveListItem(state, dispatch, "up");
				},
			moveListItemDown:
				() =>
				({ state, dispatch }) => {
					if (!this.editor.isEditable) {
						return false;
					}
					return moveListItem(state, dispatch, "down");
				},
		};
	},
});

/**
 * リスト項目を上下に移動する
 */
function moveListItem(
	state: EditorState,
	dispatch: ((tr: Transaction) => void) | undefined,
	direction: "up" | "down"
): boolean {
	const { $from } = state.selection;

	// 現在のリストアイテムを探す
	let listItemDepth = -1;
	let listItemNode: PMNode | null = null;

	for (let depth = $from.depth; depth > 0; depth--) {
		const node = $from.node(depth);
		if (node.type.name === "listItem") {
			listItemDepth = depth;
			listItemNode = node;
			break;
		}
	}

	if (listItemDepth === -1 || !listItemNode) {
		return false;
	}

	// 親リスト（bulletList または orderedList）を取得
	const listDepth = listItemDepth - 1;
	if (listDepth < 1) {
		return false;
	}

	const listNode = $from.node(listDepth);
	if (
		listNode.type.name !== "bulletList" &&
		listNode.type.name !== "orderedList"
	) {
		return false;
	}

	// リスト内でのインデックスを取得
	const listItemIndex = $from.index(listDepth);

	// 移動先のインデックスを計算
	const targetIndex =
		direction === "up" ? listItemIndex - 1 : listItemIndex + 1;

	// 移動可能かチェック
	if (targetIndex < 0 || targetIndex >= listNode.childCount) {
		return false;
	}

	if (!dispatch) {
		return true;
	}

	// リスト項目の位置を計算
	const listStart = $from.before(listDepth);

	// 各リスト項目の開始位置を計算
	let currentItemStart = listStart + 1; // リストノードの開始タグ分
	const itemPositions: { start: number; end: number; node: PMNode }[] = [];

	for (let i = 0; i < listNode.childCount; i++) {
		const child = listNode.child(i);
		itemPositions.push({
			start: currentItemStart,
			end: currentItemStart + child.nodeSize,
			node: child,
		});
		currentItemStart += child.nodeSize;
	}

	const currentItem = itemPositions[listItemIndex];
	const targetItem = itemPositions[targetIndex];

	if (!currentItem || !targetItem) {
		return false;
	}

	// トランザクションを作成
	const tr = state.tr;

	// 選択位置のオフセットを記録（リスト項目内での相対位置）
	const selectionOffsetInItem = $from.pos - currentItem.start;

	if (direction === "up") {
		// 上に移動: currentItemをtargetItemの前に移動
		// 1. currentItemを削除
		// 2. targetItemの位置に挿入
		tr.delete(currentItem.start, currentItem.end);
		tr.insert(targetItem.start, currentItem.node);
	} else {
		// 下に移動: currentItemをtargetItemの後に移動
		// 1. targetItemを削除
		// 2. currentItemの位置に挿入
		tr.delete(targetItem.start, targetItem.end);
		tr.insert(currentItem.start, targetItem.node);
	}

	// 新しい選択位置を計算
	let newSelectionPos: number;
	if (direction === "up") {
		// 上に移動した場合、新しい位置 = targetItemの開始位置 + オフセット
		newSelectionPos = targetItem.start + selectionOffsetInItem;
	} else {
		// 下に移動した場合、新しい位置 = currentItemの開始位置 + targetItemのサイズ + オフセット
		newSelectionPos =
			currentItem.start + targetItem.node.nodeSize + selectionOffsetInItem;
	}

	// 選択位置が有効な範囲内にあることを確認
	const docSize = tr.doc.content.size;
	newSelectionPos = Math.max(1, Math.min(newSelectionPos, docSize - 1));

	try {
		tr.setSelection(TextSelection.create(tr.doc, newSelectionPos));
	} catch (_e) {
		// 選択位置が無効な場合は、リスト項目の先頭に設定
		try {
			const fallbackPos =
				direction === "up"
					? targetItem.start + 1
					: currentItem.start + targetItem.node.nodeSize + 1;
			tr.setSelection(
				TextSelection.create(
					tr.doc,
					Math.max(1, Math.min(fallbackPos, docSize - 1))
				)
			);
		} catch (_e2) {
			// それでも失敗した場合は選択を変更しない
		}
	}

	dispatch(tr);
	return true;
}

// TypeScript用の型拡張
declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		listItemMove: {
			moveListItemUp: () => ReturnType;
			moveListItemDown: () => ReturnType;
		};
	}
}
