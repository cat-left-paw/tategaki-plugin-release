import { Mark, markInputRule, markPasteRule, mergeAttributes } from "@tiptap/core";

export const highlightInputRegex =
	/(?:^|\s)(==(?!\s+==)((?:[^=\n]+))==)$/;

export const highlightPasteRegex =
	/(?:^|\s)(==(?!\s+==)((?:[^=\n]+))==)/g;

export const ObsidianHighlightMark = Mark.create({
	name: "obsidianHighlight",

	addOptions() {
		return {
			HTMLAttributes: {},
		};
	},

	parseHTML() {
		return [
			{
				tag: "mark",
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ["mark", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
	},

	addCommands() {
		return {
			setObsidianHighlight:
				() =>
				({ commands }) =>
					commands.setMark(this.name),
			toggleObsidianHighlight:
				() =>
				({ commands }) =>
					commands.toggleMark(this.name),
			unsetObsidianHighlight:
				() =>
				({ commands }) =>
					commands.unsetMark(this.name),
		};
	},

	addInputRules() {
		return [
			markInputRule({
				find: highlightInputRegex,
				type: this.type,
			}),
		];
	},

	addPasteRules() {
		return [
			markPasteRule({
				find: highlightPasteRegex,
				type: this.type,
			}),
		];
	},

	addStorage() {
		return {
			markdown: {
				serialize: { open: "==", close: "==", expelEnclosingWhitespace: true },
				parse: {
					// handled by preprocessor / input rules
				},
			},
		};
	},
});

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		obsidianHighlight: {
			setObsidianHighlight: () => ReturnType;
			toggleObsidianHighlight: () => ReturnType;
			unsetObsidianHighlight: () => ReturnType;
		};
	}
}

