import { Extension } from "@tiptap/core";

interface VerticalArrowKeysOptions {
	isVertical: () => boolean;
}

/**
 * 縦書き表示時の方向キー動作を修正
 * - 空行にキャレットがある場合: 左キー→下キー、右キー→上キーに置き換え
 * - それ以外: デフォルト動作
 */
export const VerticalArrowKeys = Extension.create<VerticalArrowKeysOptions>({
	name: "verticalArrowKeys",

	addOptions() {
		return {
			isVertical: () => false,
		};
	},

	addKeyboardShortcuts() {
		return {
			// 縦書き時の左キー: 空行ならば下キーの動作に置き換え
			ArrowLeft: ({ editor }) => {
				if (!this.options.isVertical()) {
					return false;
				}

				// 空行（<br>のみの段落）にいるかチェック
				const { state } = editor;
				const { $anchor } = state.selection;
				const node = $anchor.parent;

				// <br>だけの段落、または空の段落の場合
				const isEmptyLine =
					(node.type.name === "paragraph" && node.childCount === 0) ||
					(node.type.name === "paragraph" &&
						node.childCount === 1 &&
						node.firstChild?.type.name === "hardBreak");

				if (isEmptyLine) {
					// 空行の場合、下キーの動作をエミュレート
					const event = new KeyboardEvent("keydown", {
						key: "ArrowDown",
						code: "ArrowDown",
						bubbles: true,
						cancelable: true,
					});
					editor.view.dom.dispatchEvent(event);
					return true;
				}
				return false;
			},

			// 縦書き時の右キー: 空行ならば上キーの動作に置き換え
			ArrowRight: ({ editor }) => {
				if (!this.options.isVertical()) {
					return false;
				}

				// 空行（<br>のみの段落）にいるかチェック
				const { state } = editor;
				const { $anchor } = state.selection;
				const node = $anchor.parent;

				// <br>だけの段落、または空の段落の場合
				const isEmptyLine =
					(node.type.name === "paragraph" && node.childCount === 0) ||
					(node.type.name === "paragraph" &&
						node.childCount === 1 &&
						node.firstChild?.type.name === "hardBreak");

				if (isEmptyLine) {
					// 空行の場合、上キーの動作をエミュレート
					const event = new KeyboardEvent("keydown", {
						key: "ArrowUp",
						code: "ArrowUp",
						bubbles: true,
						cancelable: true,
					});
					editor.view.dom.dispatchEvent(event);
					return true;
				}
				return false;
			},
		};
	},

	priority: 900,
});
