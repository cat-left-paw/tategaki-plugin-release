import { Schema, type DOMOutputSpec, type PMNode, type NodeSpec, type MarkSpec } from "./prosemirror";

function lineAttributes(node: PMNode): Record<string, string> {
	const attrs: Record<string, string> = { class: "tategaki-pm-line " + (node.attrs.classes as string[]).join(" ") };
	for (const [key, value] of Object.entries(node.attrs.dataset as Record<string, string>)) attrs["data-" + key.replace(/[A-Z]/g, ch => "-" + ch.toLowerCase())] = value;
	const style = Object.entries(node.attrs.styleVars as Record<string, string>).map(([key, value]) => `${key}:${value}`).join(";");
	if (style) attrs.style = style;
	return attrs;
}
/**
 * Atoms carry no absolute position (M1-3): positions live in the source map, so an edit above
 * a widget does not change the widget's node, and the PM view keeps its DOM.
 */
const blockAttrs = { lineCount: { default: 1 } };
function atom(tag: string, extra: NodeSpec["attrs"] = {}): NodeSpec {
	return { group: "block", atom: true, attrs: { ...blockAttrs, ...extra }, toDOM: node => {
		const attributes: Record<string, string> = { "data-kind": String(node.attrs.kind ?? node.type.name), "data-line-count": String(node.attrs.lineCount) };
		return [tag, attributes, String(node.attrs.markdown ?? "")];
	} };
}
function classMark(className: string): MarkSpec { return { toDOM: () => ["span", { class: className }, 0] }; }

/** Mark rank / DOM nesting (outer → inner): strong, em, code, strike, highlight, link, mdClass. */
export const pmModeSchema = new Schema({
	nodes: {
		// The display document groups runs of text lines into chunks (pm/chunk-layout.ts); the model
		// document of PmModeDocumentState stays flat (blocks only), which this content also allows.
		doc: { content: "(chunk | block)+" },
		chunk: { content: "line+", toDOM: () => ["tg-chunk", { class: "tategaki-pm-chunk" }, 0] },
		line: { group: "block", content: "inline*", attrs: { kind: { default: "normal" }, classes: { default: [] }, dataset: { default: {} }, styleVars: { default: {} } }, toDOM: node => ["tg-line", lineAttributes(node), 0] },
		frontmatter: atom("tg-frontmatter", { markdown: { default: "" } }),
		widget: atom("tg-widget", { kind: { default: "" }, classes: { default: [] }, markdown: { default: "" }, imageSrc: { default: null }, imageAlt: { default: null }, imageWidth: { default: null }, embedTarget: { default: null } }),
		collapsedGap: atom("tg-gap"),
		text: { group: "inline" },
		ruby: { group: "inline", inline: true, content: "text*", attrs: { reading: { default: "" } }, toDOM: node => ["ruby", { class: "tategaki-aozora-ruby", "data-aozora-ruby": "1" }, ["span", { "data-aozora-base": "1" }, 0], ["rt", { contenteditable: "false", "aria-hidden": "true" }, String(node.attrs.reading)]] },
		tcy: { group: "inline", inline: true, content: "text*", toDOM: () => ["span", { class: "tategaki-md-tcy" }, 0] },
		inlineMath: { group: "inline", inline: true, atom: true, attrs: { source: { default: "" }, formats: { default: "" } }, toDOM: node => ["span", { class: "tategaki-md-inline-widget tategaki-md-math-inline-widget", "data-widget-kind": "math-inline" }, String(node.attrs.source)] },
	},
	marks: {
		strong: classMark("tategaki-md-strong"), em: classMark("tategaki-md-em"), code: classMark("tategaki-md-code"), strike: classMark("tategaki-md-strike"), highlight: classMark("tategaki-md-highlight"),
		link: { attrs: { href: {} }, toDOM: mark => ["span", { class: "tategaki-md-link", "data-href": String(mark.attrs.href) }, 0] },
		mdClass: { attrs: { classes: { default: [] }, footnoteId: { default: null }, footnoteNumber: { default: null }, tooltip: { default: null } }, toDOM: mark => {
			const attrs: Record<string, string> = { class: (mark.attrs.classes as string[]).join(" ") };
			if (mark.attrs.footnoteId !== null) attrs["data-footnote-id"] = String(mark.attrs.footnoteId);
			if (mark.attrs.footnoteNumber !== null) attrs["data-footnote-number"] = String(mark.attrs.footnoteNumber);
			if (mark.attrs.tooltip) { attrs["aria-label"] = String(mark.attrs.tooltip); attrs["data-tooltip-position"] = "top"; }
			return ["span", attrs, 0] as DOMOutputSpec;
		} },
	},
});
