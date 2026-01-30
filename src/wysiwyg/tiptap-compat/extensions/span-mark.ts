import { Mark } from "@tiptap/core";

export interface SpanMarkAttributes {
	class?: string | null;
	style?: string | null;
	dataAttrs?: Record<string, string>;
}

export const SpanMark = Mark.create({
	name: "spanStyle",

	addAttributes() {
		return {
			class: {
				default: null,
			},
			style: {
				default: null,
			},
			dataAttrs: {
				default: {},
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: "span",
				getAttrs: (element) => {
					if (!(element instanceof HTMLElement)) {
						return false;
					}
					if (
						element.classList.contains("tategaki-aozora-ruby") ||
						element.classList.contains("tategaki-aozora-ruby-rt") ||
						element.hasAttribute("data-aozora-base")
					) {
						return false;
					}

					const className = element.getAttribute("class");
					const style = element.getAttribute("style");
					const dataAttrs: Record<string, string> = {};
					for (const name of element.getAttributeNames()) {
						if (!name.startsWith("data-")) continue;
						const value = element.getAttribute(name);
						if (value != null) {
							dataAttrs[name] = value;
						}
					}

					return {
						class: className || null,
						style: style || null,
						dataAttrs,
					};
				},
			},
		];
	},

	renderHTML({ mark }) {
		const attrs: Record<string, string> = {};
		const className = (mark.attrs?.class as string | null) ?? null;
		const styleValue = (mark.attrs?.style as string | null) ?? null;
		if (className) {
			attrs.class = className;
		}
		if (styleValue) {
			attrs.style = styleValue;
		}
		const dataAttrs =
			(mark.attrs?.dataAttrs as Record<string, string> | undefined) ?? {};
		for (const [key, value] of Object.entries(dataAttrs)) {
			if (!key.startsWith("data-")) continue;
			attrs[key] = value;
		}
		return ["span", attrs, 0];
	},
});
