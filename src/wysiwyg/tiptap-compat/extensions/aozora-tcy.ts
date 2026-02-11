import { Node } from "@tiptap/core";

export const AozoraTcyNode = Node.create({
	name: "aozoraTcy",

	inline: true,
	group: "inline",
	content: "text*",
	selectable: true,

	parseHTML() {
		return [
			{
				tag: "span.tategaki-md-tcy[data-tategaki-tcy]",
			},
			{
				tag: "span[data-tategaki-tcy]",
			},
		];
	},

	renderHTML() {
		return [
			"span",
			{
				class: "tategaki-md-tcy",
				"data-tategaki-tcy": "1",
			},
			0,
		];
	},
});
