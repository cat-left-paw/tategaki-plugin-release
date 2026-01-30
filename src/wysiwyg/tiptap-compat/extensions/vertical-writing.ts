import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

export type WritingModeValue = "vertical-rl" | "horizontal-tb";

interface VerticalWritingOptions {
	defaultMode: WritingModeValue;
	targetNodeTypes: string[];
}

function normalizeWritingMode(
	value: unknown,
	fallback: WritingModeValue
): WritingModeValue {
	if (value === "vertical-rl" || value === "horizontal-tb") {
		return value;
	}
	return fallback;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		verticalWriting: {
			setWritingMode: (mode: WritingModeValue) => ReturnType;
		};
	}

	interface Storage {
		verticalWriting: {
			currentMode: WritingModeValue;
		};
	}
}

export const VerticalWritingExtension = Extension.create<VerticalWritingOptions>({
	name: "verticalWriting",

	addOptions() {
		return {
			defaultMode: "vertical-rl" as WritingModeValue,
			targetNodeTypes: ["paragraph", "heading"],
		};
	},

	addStorage() {
		return {
			currentMode: this.options.defaultMode,
		};
	},

	onCreate() {
		this.storage.currentMode = this.options.defaultMode;
	},

	addGlobalAttributes() {
		return [
			{
				types: this.options.targetNodeTypes,
				attributes: {
					writingMode: {
						default: this.options.defaultMode,
						parseHTML: (element) =>
							element.style.writingMode || this.storage.currentMode,
						renderHTML: (attributes) => {
							if (!attributes.writingMode) return {};
							const isVertical =
								attributes.writingMode === "vertical-rl";
							return {
								style: `writing-mode: ${attributes.writingMode}; text-orientation: ${
									isVertical ? "mixed" : "initial"
								};`,
							};
						},
					},
				},
			},
		];
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				appendTransaction: (transactions, _oldState, newState) => {
					if (!transactions.some((tr) => tr.docChanged)) {
						return;
					}
					const currentMode = this.storage.currentMode as WritingModeValue;
					const targetTypes = new Set(this.options.targetNodeTypes);

					let tr = newState.tr;
					let updated = false;

					newState.doc.descendants((node, pos) => {
						if (!targetTypes.has(node.type.name)) {
							return true;
						}
						if (node.attrs?.writingMode === currentMode) {
							return true;
						}

						const nextAttrs = {
							...node.attrs,
							writingMode: currentMode,
						};
						tr = tr.setNodeMarkup(pos, node.type, nextAttrs, node.marks);
						updated = true;
						return true;
					});

					if (!updated) {
						return;
					}

					tr.setMeta("addToHistory", false);
					return tr;
				},
			}),
		];
	},

	addCommands() {
		return {
			setWritingMode:
				(mode: WritingModeValue) =>
				({ state, dispatch }) => {
					const nextMode = normalizeWritingMode(
						mode,
						this.options.defaultMode
					);

					const { tr } = state;
					tr.setMeta("addToHistory", false);
					const targetTypes = new Set(this.options.targetNodeTypes);
					let updated = false;

					state.doc.descendants((node, pos) => {
						if (!targetTypes.has(node.type.name)) {
							return true;
						}

						if (node.attrs?.writingMode === nextMode) {
							return true;
						}

						const nextAttrs = {
							...node.attrs,
							writingMode: nextMode,
						};
						tr.setNodeMarkup(pos, node.type, nextAttrs, node.marks);
						updated = true;
						return true;
					});

					if (dispatch && updated) {
						dispatch(tr);
					}

					this.storage.currentMode = nextMode;
					const viewDom = this.editor?.view.dom as HTMLElement | undefined;
					if (viewDom) {
						viewDom.setAttribute("data-writing-mode", nextMode);
						const host = viewDom.closest(
							".tategaki-wysiwyg-editor"
						) as HTMLElement | null;
						if (host) {
							host.setAttribute("data-writing-mode", nextMode);
							host.style.setProperty("--tategaki-writing-mode", nextMode);
						}
					}

					return true;
				},
		};
	},
});
