import { Editor } from "@tiptap/core";
import { Level } from "@tiptap/extension-heading";

/**
 * 単一行だけを見出し化するカスタムコマンド。
 *
 * - 見出しを適用したい行の前後に存在するHardBreakを境界として段落を分割し、
 *   前後は段落、対象行のみを見出しノードに差し替える。
 * - 既に同じレベルの見出しがアクティブな場合は従来のトグル挙動にフォールバック。
 */
export function toggleHeadingForCurrentLine(editor: Editor, level: Level): boolean {
	if (editor.isActive("heading", { level })) {
		return editor.chain().focus().toggleHeading({ level }).run();
	}

	return editor
		.chain()
		.focus()
		.command(({ state, tr, dispatch }) => {
			const { selection } = state;
			const { $from } = selection;
			const parent = $from.parent;
			const headingType = state.schema.nodes.heading;
			const paragraphType = state.schema.nodes.paragraph;
			if (!parent.isTextblock || !headingType || !paragraphType) {
				return false;
			}

			const selectionOffset = $from.parentOffset;
			const contentSize = parent.content.size;

			let beforeEnd = 0;
			let lineStart = 0;
			let lineEnd = contentSize;
			let afterStart = contentSize;

			// 選択行の前後にある HardBreak を境界として判定
			parent.forEach((child, offset) => {
				if (child.type.name !== "hardBreak") {
					return;
				}
				if (offset < selectionOffset) {
					beforeEnd = offset;
					lineStart = offset + child.nodeSize;
					return;
				}
				if (offset >= selectionOffset && lineEnd === contentSize) {
					lineEnd = offset;
					afterStart = offset + child.nodeSize;
				}
			});

			const beforeFragment =
				beforeEnd > 0 ? parent.content.cut(0, beforeEnd) : null;
			const targetFragment = parent.content.cut(lineStart, lineEnd);
			const afterFragment =
				afterStart < contentSize
					? parent.content.cut(afterStart, contentSize)
					: null;

			if (!targetFragment || targetFragment.size === 0) {
				return false;
			}

			const replacements = [];
			const writingModeAttr =
				typeof parent.attrs?.writingMode === "string"
					? { writingMode: parent.attrs.writingMode }
					: undefined;
			const headingAttrs = writingModeAttr
				? { ...writingModeAttr, level }
				: { level };
			const paragraphAttrs = writingModeAttr ?? undefined;
			if (beforeFragment && beforeFragment.size > 0) {
				replacements.push(
					paragraphType.create(paragraphAttrs || null, beforeFragment)
				);
			}
			replacements.push(headingType.create(headingAttrs, targetFragment));
			if (afterFragment && afterFragment.size > 0) {
				replacements.push(
					paragraphType.create(paragraphAttrs || null, afterFragment)
				);
			}

			const blockStart = $from.before($from.depth);
			const blockEnd = $from.after($from.depth);
			tr.replaceWith(blockStart, blockEnd, replacements);
			dispatch?.(tr.scrollIntoView());
			return true;
		})
		.run();
}
