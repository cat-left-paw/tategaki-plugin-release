import { Node } from "@tiptap/core";

export const WbrNode = Node.create({
	name: "wbr",

	inline: true,
	group: "inline",
	atom: true,
	selectable: false,

	parseHTML() {
		return [
			{
				tag: "wbr",
			},
		];
	},

	renderHTML() {
		return ["wbr"];
	},
});
