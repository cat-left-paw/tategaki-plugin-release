import type { Editor } from "@tiptap/core";

export const COMPAT_HARD_BREAK_MARKDOWN = "  \n";

type CompatEditorLike = Pick<Editor, "isEditable" | "isActive">;

export function canUseCompatHardBreak(
	editor: CompatEditorLike | null | undefined
): boolean {
	if (!editor?.isEditable) {
		return false;
	}
	return editor.isActive("listItem") || editor.isActive("blockquote");
}
