import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

export type TipTapRubySelection = {
	rangeFrom: number;
	rangeTo: number;
	displayText: string;
	originalSelectedText: string;
	replacementText: string;
	hasRubyNode: boolean;
	hasDelimiter: boolean;
};

type RubyNodeInfo = {
	pos: number;
	node: ProseMirrorNode;
	text: string;
	hasDelimiter: boolean;
};

export function resolveTipTapRubySelection(
	editor: Editor
): TipTapRubySelection | null {
	const { from, to } = editor.state.selection;
	const originalSelectedText = editor.state.doc.textBetween(from, to, "");

	if (!originalSelectedText || originalSelectedText.trim() === "") {
		return null;
	}

	const startRuby = findAozoraRubyNodeAtPos(editor.state.doc.resolve(from));
	const endProbe = Math.max(from, to - 1);
	const endRuby = findAozoraRubyNodeAtPos(editor.state.doc.resolve(endProbe));
	const targetRuby = startRuby ?? endRuby;

	if (!targetRuby) {
		return {
			rangeFrom: from,
			rangeTo: to,
			displayText: originalSelectedText,
			originalSelectedText,
			replacementText: originalSelectedText,
			hasRubyNode: false,
			hasDelimiter: true,
		};
	}

	return {
		rangeFrom: targetRuby.pos,
		rangeTo: targetRuby.pos + targetRuby.node.nodeSize,
		displayText: targetRuby.text,
		originalSelectedText,
		replacementText: targetRuby.text,
		hasRubyNode: true,
		hasDelimiter: targetRuby.hasDelimiter,
	};
}

function findAozoraRubyNodeAtPos($pos: ResolvedPos): RubyNodeInfo | null {
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth);
		if (node.type.name !== "aozoraRuby") {
			continue;
		}

		return {
			pos: $pos.before(depth),
			node,
			text: node.textContent ?? "",
			hasDelimiter: node.attrs?.hasDelimiter === true,
		};
	}

	return null;
}
