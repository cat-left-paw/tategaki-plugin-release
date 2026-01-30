import { Node, mergeAttributes } from "@tiptap/core";

type ImageSource = "markdown" | "obsidian";

export const TategakiImage = Node.create({
	name: "tategakiImage",
	group: "inline",
	inline: true,
	atom: true,
	draggable: true,
	selectable: true,

	addAttributes() {
		return {
			src: { default: "" },
			alt: { default: "" },
			title: { default: "" },
			source: { default: "markdown" as ImageSource },
			originalSrc: { default: "" },
			obsidianSrc: { default: "" },
			width: { default: null as number | null },
			height: { default: null as number | null },
		};
	},

	parseHTML() {
		return [
			{
				tag: "img",
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					const src = dom.getAttribute("src") ?? "";
					const alt = dom.getAttribute("alt") ?? "";
					const title = dom.getAttribute("title") ?? "";
					const source =
						(dom.getAttribute("data-tategaki-source") as ImageSource) ??
						"markdown";
					const originalSrc =
						dom.getAttribute("data-tategaki-original-src") ?? "";
					const obsidianSrc =
						dom.getAttribute("data-tategaki-obsidian-src") ?? "";
					const widthRaw =
						dom.getAttribute("data-tategaki-width") ??
						dom.getAttribute("width");
					const heightRaw =
						dom.getAttribute("data-tategaki-height") ??
						dom.getAttribute("height");
					const width = widthRaw ? Number(widthRaw) : null;
					const height = heightRaw ? Number(heightRaw) : null;

					return {
						src,
						alt,
						title,
						source: source === "obsidian" ? "obsidian" : "markdown",
						originalSrc,
						obsidianSrc,
						width: Number.isFinite(width) ? width : null,
						height: Number.isFinite(height) ? height : null,
					};
				},
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		const attrs: Record<string, string> = {
			src: String(HTMLAttributes.src ?? ""),
		};

		const alt = String(HTMLAttributes.alt ?? "");
		if (alt) attrs.alt = alt;
		const title = String(HTMLAttributes.title ?? "");
		if (title) attrs.title = title;

		const source = String(HTMLAttributes.source ?? "markdown");
		attrs["data-tategaki-source"] = source === "obsidian" ? "obsidian" : "markdown";

		const originalSrc = String(HTMLAttributes.originalSrc ?? "");
		if (originalSrc) attrs["data-tategaki-original-src"] = originalSrc;

		const obsidianSrc = String(HTMLAttributes.obsidianSrc ?? "");
		if (obsidianSrc) attrs["data-tategaki-obsidian-src"] = obsidianSrc;

		const width = HTMLAttributes.width as number | null | undefined;
		if (typeof width === "number" && Number.isFinite(width)) {
			attrs["data-tategaki-width"] = String(width);
		}
		const height = HTMLAttributes.height as number | null | undefined;
		if (typeof height === "number" && Number.isFinite(height)) {
			attrs["data-tategaki-height"] = String(height);
		}

		// Obsidianの挙動に寄せるため、画像自体は編集不可とする
		attrs.contenteditable = "false";

		return ["img", mergeAttributes(attrs)];
	},
});

