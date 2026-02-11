import { Extension } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { collectAutoTcyRanges } from "../../../shared/aozora-tcy";

export interface AutoTcyDecorationOptions {
	isEnabled: () => boolean;
}

const AutoTcyDecorationPluginKey = new PluginKey("tategaki-auto-tcy-decoration");

export const AutoTcyDecoration = Extension.create<AutoTcyDecorationOptions>({
	name: "autoTcyDecoration",

	addOptions() {
		return {
			isEnabled: () => false,
		};
	},

	addProseMirrorPlugins() {
		let cachedDoc: ProseMirrorNode | null = null;
		let cachedEnabled = false;
		let cachedDecorations: DecorationSet | null = null;

		const buildDecorations = (doc: ProseMirrorNode): DecorationSet => {
			const decorations: Decoration[] = [];
			doc.descendants((node, pos) => {
				if (!node.isText) return true;
				const text = node.text ?? "";
				if (!text) return true;
				if (node.marks.some((mark) => mark.type.name === "link" || mark.type.name === "code")) {
					return true;
				}
				const $pos = doc.resolve(pos);
				for (let depth = $pos.depth; depth >= 0; depth -= 1) {
					const nodeName = $pos.node(depth).type.name;
					if (
						nodeName === "aozoraTcy" ||
						nodeName === "aozoraRuby" ||
						nodeName === "codeBlock"
					) {
						return true;
					}
				}

				const ranges = collectAutoTcyRanges(text);
				for (const range of ranges) {
					if (range.from >= range.to) continue;
					decorations.push(
						Decoration.inline(pos + range.from, pos + range.to, {
							class: "tategaki-md-tcy",
							"data-tategaki-auto-tcy": "1",
						}),
					);
				}
				return true;
			});
			return DecorationSet.create(doc, decorations);
		};

		return [
			new Plugin({
				key: AutoTcyDecorationPluginKey,
				props: {
					decorations: (state) => {
						const enabled = this.options.isEnabled();
						if (!enabled) {
							cachedDoc = state.doc;
							cachedEnabled = false;
							cachedDecorations = null;
							return null;
						}
						if (
							cachedDecorations &&
							cachedEnabled === enabled &&
							cachedDoc === state.doc
						) {
							return cachedDecorations;
						}
						cachedDecorations = buildDecorations(state.doc);
						cachedDoc = state.doc;
						cachedEnabled = enabled;
						return cachedDecorations;
					},
				},
			}),
		];
	},
});

