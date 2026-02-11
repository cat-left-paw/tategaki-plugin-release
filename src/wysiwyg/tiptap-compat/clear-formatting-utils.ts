import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

type NodeReplacement = {
	from: number;
	to: number;
	text: string;
};

const clearInlineNodesInSelection = (
	editor: Editor,
	nodeTypeNames: string[],
): boolean => {
	const { state, view } = editor;
	const { from, to } = state.selection;
	if (from === to) return false;

	const replacements: NodeReplacement[] = [];
	state.doc.nodesBetween(from, to, (node, pos) => {
		if (!nodeTypeNames.includes(node.type.name)) {
			return;
		}
		replacements.push({
			from: pos,
			to: pos + node.nodeSize,
			text: node.textContent ?? "",
		});
		return false;
	});

	if (replacements.length === 0) {
		return false;
	}

	let tr = state.tr;
	for (let i = replacements.length - 1; i >= 0; i -= 1) {
		const replacement = replacements[i];
		if (!replacement) continue;
		if (!replacement.text) {
			tr = tr.delete(replacement.from, replacement.to);
			continue;
		}
		tr = tr.replaceWith(
			replacement.from,
			replacement.to,
			state.schema.text(replacement.text),
		);
	}

	const mappedFrom = tr.mapping.map(from, -1);
	const mappedTo = tr.mapping.map(to, 1);
	tr = tr.setSelection(
		TextSelection.create(
			tr.doc,
			Math.min(mappedFrom, mappedTo),
			Math.max(mappedFrom, mappedTo),
		),
	);
	view.dispatch(tr.scrollIntoView());
	return true;
};

export const clearRubyNodesInSelection = (editor: Editor): boolean =>
	clearInlineNodesInSelection(editor, ["aozoraRuby"]);

export const clearTcyNodesInSelection = (editor: Editor): boolean =>
	clearInlineNodesInSelection(editor, ["aozoraTcy"]);
