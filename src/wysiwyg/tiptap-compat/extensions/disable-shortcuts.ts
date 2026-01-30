import { Extension } from "@tiptap/core";

/**
 * TipTap標準のショートカットを無効化して、Obsidianコマンド側で処理する
 * また、リスト関連のショートカットを明示的に設定する
 */
export const DisableShortcuts = Extension.create({
	name: "disableShortcuts",

	addKeyboardShortcuts() {
		return {
			// Enterキー: リスト内ではsplitListItem、それ以外ではsplitBlock
			Enter: ({ editor }) => {
				if (!editor.isEditable) {
					return true;
				}
				// リスト項目内にいるかチェック
				if (editor.isActive("listItem")) {
					return editor.commands.splitListItem("listItem");
				}
				// 通常の段落分割
				return editor.commands.splitBlock();
			},
			// Shift+Enter: HardBreak（<br>）を挿入
			"Shift-Enter": ({ editor }) => {
				if (!editor.isEditable) {
					return true;
				}
				return editor.commands.setHardBreak();
			},

			// TABキー: リスト内ではsinkListItem（ネストを深くする）
			Tab: ({ editor }) => {
				if (!editor.isEditable) {
					return true;
				}
				if (editor.isActive("listItem")) {
					return editor.commands.sinkListItem("listItem");
				}
				// リスト外ではデフォルト動作を許可しない（何もしない）
				return true;
			},
			// Shift+TABキー: リスト内ではliftListItem（ネストを浅くする）
			"Shift-Tab": ({ editor }) => {
				if (!editor.isEditable) {
					return true;
				}
				if (editor.isActive("listItem")) {
					return editor.commands.liftListItem("listItem");
				}
				// リスト外ではデフォルト動作を許可しない（何もしない）
				return true;
			},

			// マーク系
			"Mod-b": () => true,
			"Mod-B": () => true,
			"Mod-Shift-b": () => true,
			"Mod-Shift-B": () => true,
			"Mod-i": () => true,
			"Mod-I": () => true,
			"Mod-Shift-i": () => true,
			"Mod-Shift-I": () => true,
			"Mod-e": () => true,
			"Mod-E": () => true,
			"Mod-Shift-e": () => true,
			"Mod-Shift-E": () => true,
			"Mod-Shift-x": () => true,
			"Mod-Shift-X": () => true,

			// ブロック系
			"Mod-Shift-1": () => true,
			"Mod-Shift-2": () => true,
			"Mod-Shift-3": () => true,
			"Mod-Shift-7": () => true,
			"Mod-Shift-8": () => true,
			"Mod-Shift-9": () => true,
			"Mod-Alt-c": () => true,
			"Mod-Alt-C": () => true,

			// 保存（手動同期）はビュー側で処理する
			"Mod-s": () => true,
			"Mod-S": () => true,
			"Mod-Shift-s": () => true,
			"Mod-Shift-S": () => true,
		};
	},

	priority: 1000,
});
