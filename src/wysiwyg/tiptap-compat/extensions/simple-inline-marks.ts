import { Mark } from "@tiptap/core";

export const SuperscriptMark = Mark.create({
	name: "superscript",

	parseHTML() {
		return [
			{
				tag: "sup",
			},
		];
	},

	renderHTML() {
		return ["sup", 0];
	},
});

export const SubscriptMark = Mark.create({
	name: "subscript",

	parseHTML() {
		return [
			{
				tag: "sub",
			},
		];
	},

	renderHTML() {
		return ["sub", 0];
	},
});

export const SmallMark = Mark.create({
	name: "smallText",

	parseHTML() {
		return [
			{
				tag: "small",
			},
		];
	},

	renderHTML() {
		return ["small", 0];
	},
});
