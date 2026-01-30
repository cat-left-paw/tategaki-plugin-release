import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { NodeSelection, Plugin } from "@tiptap/pm/state";

export const TategakiHorizontalRule = HorizontalRule.extend({
	selectable: true,

	addProseMirrorPlugins() {
		const typeName = this.name;
		return [
			...(this.parent?.() ?? []),
			new Plugin({
				props: {
					handleClickOn: (view, _pos, node, nodePos, _event, direct) => {
						if (!direct || node.type.name !== typeName) {
							return false;
						}
						const tr = view.state.tr.setSelection(
							NodeSelection.create(view.state.doc, nodePos)
						);
						view.dispatch(tr);
						return true;
					},
				},
			}),
		];
	},
});
