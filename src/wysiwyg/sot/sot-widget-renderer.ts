import { MarkdownRenderChild, MarkdownRenderer } from "obsidian";

import type { App } from "obsidian";
import { t } from "../../shared/i18n";

import type { LineRange } from "./line-ranges";

export type SoTWidgetRenderContext = {
	app: App;
	getDoc: () => string | null;
	getSourcePath: () => string;
	lineRanges: LineRange[];
	lineMathBlockStart: (number | null)[];
	lineMathBlockEnd: (number | null)[];
	lineCalloutBlockStart: (number | null)[];
	lineCalloutBlockEnd: (number | null)[];
	lineTableBlockStart: (number | null)[];
	lineTableBlockEnd: (number | null)[];
	lineDeflistBlockStart: (number | null)[];
	lineDeflistBlockEnd: (number | null)[];
	addChild: (child: MarkdownRenderChild) => void;
	mathRenderChildren: Map<number, MarkdownRenderChild>;
	calloutRenderChildren: Map<number, MarkdownRenderChild>;
	tableRenderChildren: Map<number, MarkdownRenderChild>;
	deflistRenderChildren: Map<number, MarkdownRenderChild>;
	embedRenderChildren: Map<number, MarkdownRenderChild>;
};

export function renderMathWidgetLine(
	context: SoTWidgetRenderContext,
	lineEl: HTMLElement,
	lineRange: LineRange,
	lineIndex: number | null
): void {
	const doc = context.getDoc();
	if (!doc) return;
	if (lineIndex === null) return;
	const startIndex = context.lineMathBlockStart[lineIndex];
	const endIndex = context.lineMathBlockEnd[lineIndex];
	if (
		startIndex === null ||
		endIndex === null ||
		startIndex < 0 ||
		endIndex < startIndex ||
		endIndex >= context.lineRanges.length
	) {
		const msg = document.createElement("div");
		msg.className = "tategaki-md-math-widget-loading";
		msg.textContent = t("widget.math.parseFailed");
		lineEl.appendChild(msg);
		return;
	}
	if (lineIndex !== startIndex) {
		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
		return;
	}

	const wrapper = document.createElement("div");
	wrapper.className = "tategaki-md-math-widget-inner";
	lineEl.appendChild(wrapper);

	const loading = document.createElement("div");
	loading.className = "tategaki-md-math-widget-loading";
	loading.textContent = t("widget.math.rendering");
	wrapper.appendChild(loading);

	const content = document.createElement("div");
	content.className = "tategaki-md-math-widget-content";
	wrapper.appendChild(content);

	const eol = document.createElement("span");
	eol.className = "tategaki-sot-eol";
	eol.dataset.offset = String(lineRange.to);
	eol.textContent = "\u200b";
	lineEl.appendChild(eol);

	const startRange = context.lineRanges[startIndex];
	const endRange = context.lineRanges[endIndex];
	if (!startRange || !endRange) {
		loading.textContent = t("widget.math.rangeInvalid");
		return;
	}
	const markdown = doc.slice(startRange.from, endRange.to);
	const sourcePath = context.getSourcePath();

	const renderChild = new MarkdownRenderChild(content);
	context.addChild(renderChild);
	context.mathRenderChildren.set(startIndex, renderChild);

	void MarkdownRenderer.render(
		context.app,
		markdown,
		content,
		sourcePath,
		renderChild
	)
		.then(() => {
			if (!lineEl.isConnected) return;
			loading.remove();
		})
		.catch(() => {
			if (!lineEl.isConnected) return;
			loading.textContent = t("widget.math.renderFailed");
		});
}

export function renderCalloutWidgetLine(
	context: SoTWidgetRenderContext,
	lineEl: HTMLElement,
	lineRange: LineRange,
	lineIndex: number | null
): void {
	const doc = context.getDoc();
	if (!doc) return;
	if (lineIndex === null) return;
	const startIndex = context.lineCalloutBlockStart[lineIndex];
	const endIndex = context.lineCalloutBlockEnd[lineIndex];
	if (
		startIndex === null ||
		endIndex === null ||
		startIndex < 0 ||
		endIndex < startIndex ||
		endIndex >= context.lineRanges.length
	) {
		const msg = document.createElement("div");
		msg.className = "tategaki-md-callout-widget-loading";
		msg.textContent = t("widget.callout.parseFailed");
		lineEl.appendChild(msg);
		return;
	}
	if (lineIndex !== startIndex) {
		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
		return;
	}

	const wrapper = document.createElement("div");
	wrapper.className = "tategaki-md-callout-widget-inner";
	lineEl.appendChild(wrapper);

	const loading = document.createElement("div");
	loading.className = "tategaki-md-callout-widget-loading";
	loading.textContent = t("widget.callout.rendering");
	wrapper.appendChild(loading);

	const content = document.createElement("div");
	content.className =
		"tategaki-md-callout-widget-content markdown-rendered";
	wrapper.appendChild(content);

	const eol = document.createElement("span");
	eol.className = "tategaki-sot-eol";
	eol.dataset.offset = String(lineRange.to);
	eol.textContent = "\u200b";
	lineEl.appendChild(eol);

	const lines: string[] = [];
	for (let i = startIndex; i <= endIndex; i += 1) {
		const r = context.lineRanges[i];
		if (!r) continue;
		lines.push(doc.slice(r.from, r.to));
	}
	const markdown = lines.join("\n");
	const sourcePath = context.getSourcePath();
	const expectedRange = lineEl.dataset.calloutRange ?? "";

	const renderChild = new MarkdownRenderChild(content);
	context.addChild(renderChild);
	context.calloutRenderChildren.set(lineIndex, renderChild);

	void MarkdownRenderer.render(
		context.app,
		markdown,
		content,
		sourcePath,
		renderChild
	)
		.then(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.calloutRange ?? "") !== expectedRange) return;
			loading.remove();
		})
		.catch(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.calloutRange ?? "") !== expectedRange) return;
			loading.textContent = t("widget.callout.renderFailed");
		});
}

export function renderTableWidgetLine(
	context: SoTWidgetRenderContext,
	lineEl: HTMLElement,
	lineRange: LineRange,
	lineIndex: number | null
): void {
	const doc = context.getDoc();
	if (!doc) return;
	if (lineIndex === null) return;
	const startIndex = context.lineTableBlockStart[lineIndex];
	const endIndex = context.lineTableBlockEnd[lineIndex];
	if (
		startIndex === null ||
		endIndex === null ||
		startIndex < 0 ||
		endIndex < startIndex ||
		endIndex >= context.lineRanges.length
	) {
		const msg = document.createElement("div");
		msg.className = "tategaki-md-table-widget-loading";
		msg.textContent = t("widget.table.parseFailed");
		lineEl.appendChild(msg);
		return;
	}
	if (lineIndex !== startIndex) {
		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
		return;
	}

	const wrapper = document.createElement("div");
	wrapper.className = "tategaki-md-table-widget-inner";
	lineEl.appendChild(wrapper);

	const loading = document.createElement("div");
	loading.className = "tategaki-md-table-widget-loading";
	loading.textContent = t("widget.table.rendering");
	wrapper.appendChild(loading);

	const content = document.createElement("div");
	content.className = "tategaki-md-table-widget-content markdown-rendered";
	wrapper.appendChild(content);

	const eol = document.createElement("span");
	eol.className = "tategaki-sot-eol";
	eol.dataset.offset = String(lineRange.to);
	eol.textContent = "\u200b";
	lineEl.appendChild(eol);

	const lines: string[] = [];
	for (let i = startIndex; i <= endIndex; i += 1) {
		const r = context.lineRanges[i];
		if (!r) continue;
		lines.push(doc.slice(r.from, r.to));
	}
	const markdown = lines.join("\n");
	const sourcePath = context.getSourcePath();
	const expectedRange = lineEl.dataset.tableRange ?? "";

	const renderChild = new MarkdownRenderChild(content);
	context.addChild(renderChild);
	context.tableRenderChildren.set(lineIndex, renderChild);

	void MarkdownRenderer.render(
		context.app,
		markdown,
		content,
		sourcePath,
		renderChild
	)
		.then(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.tableRange ?? "") !== expectedRange) return;
			loading.remove();
		})
		.catch(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.tableRange ?? "") !== expectedRange) return;
			loading.textContent = t("widget.table.renderFailed");
		});
}

export function renderDeflistWidgetLine(
	context: SoTWidgetRenderContext,
	lineEl: HTMLElement,
	lineRange: LineRange,
	lineIndex: number | null
): void {
	const doc = context.getDoc();
	if (!doc) return;
	if (lineIndex === null) return;
	const startIndex = context.lineDeflistBlockStart[lineIndex];
	const endIndex = context.lineDeflistBlockEnd[lineIndex];
	if (
		startIndex === null ||
		endIndex === null ||
		startIndex < 0 ||
		endIndex < startIndex ||
		endIndex >= context.lineRanges.length
	) {
		const msg = document.createElement("div");
		msg.className = "tategaki-md-deflist-widget-loading";
		msg.textContent = t("widget.deflist.parseFailed");
		lineEl.appendChild(msg);
		return;
	}
	if (lineIndex !== startIndex) {
		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
		return;
	}

	const wrapper = document.createElement("div");
	wrapper.className = "tategaki-md-deflist-widget-inner";
	lineEl.appendChild(wrapper);

	const loading = document.createElement("div");
	loading.className = "tategaki-md-deflist-widget-loading";
	loading.textContent = t("widget.deflist.rendering");
	wrapper.appendChild(loading);

	const content = document.createElement("div");
	content.className = "tategaki-md-deflist-widget-content markdown-rendered";
	wrapper.appendChild(content);

	const eol = document.createElement("span");
	eol.className = "tategaki-sot-eol";
	eol.dataset.offset = String(lineRange.to);
	eol.textContent = "\u200b";
	lineEl.appendChild(eol);

	const lines: string[] = [];
	for (let i = startIndex; i <= endIndex; i += 1) {
		const r = context.lineRanges[i];
		if (!r) continue;
		lines.push(doc.slice(r.from, r.to));
	}
	const markdown = lines.join("\n");
	const sourcePath = context.getSourcePath();
	const expectedRange = lineEl.dataset.deflistRange ?? "";

	const renderChild = new MarkdownRenderChild(content);
	context.addChild(renderChild);
	context.deflistRenderChildren.set(lineIndex, renderChild);

	void MarkdownRenderer.render(
		context.app,
		markdown,
		content,
		sourcePath,
		renderChild
	)
		.then(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.deflistRange ?? "") !== expectedRange) return;
			loading.remove();
		})
		.catch(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.deflistRange ?? "") !== expectedRange) return;
			loading.textContent = t("widget.deflist.renderFailed");
		});
}

export function renderImageWidgetLine(
	context: SoTWidgetRenderContext,
	lineEl: HTMLElement,
	lineRange: LineRange
): void {
	const src = (lineEl.dataset.imageSrc ?? "").trim();
	const alt = (lineEl.dataset.imageAlt ?? "").trim();
	const width = (lineEl.dataset.imageWidth ?? "").trim();

	const wrapper = document.createElement("span");
	wrapper.className = "tategaki-md-image-widget-inner";
	lineEl.appendChild(wrapper);

	const img = document.createElement("img");
	img.className = "tategaki-md-image-widget-img";
	img.loading = "lazy";
	img.alt = alt;

	const resolved = resolveImageSrc(context, src);
	if (resolved) {
		img.src = resolved;
	} else {
		img.src = src;
	}
	if (/^\d+$/.test(width)) {
		img.style.maxWidth = `${width}px`;
		img.style.maxHeight = `${width}px`;
	}
	wrapper.appendChild(img);

	if (alt.length > 0) {
		const cap = document.createElement("span");
		cap.className = "tategaki-md-image-widget-caption";
		cap.textContent = alt;
		wrapper.appendChild(cap);
	}

	const eol = document.createElement("span");
	eol.className = "tategaki-sot-eol";
	eol.dataset.offset = String(lineRange.to);
	eol.textContent = "\u200b";
	lineEl.appendChild(eol);
}

export function renderEmbedWidgetLine(
	context: SoTWidgetRenderContext,
	lineEl: HTMLElement,
	lineRange: LineRange,
	lineIndex: number | null
): void {
	const target = (lineEl.dataset.embedTarget ?? "").trim();
	const wrapper = document.createElement("div");
	wrapper.className = "tategaki-md-embed-widget-inner markdown-embed";
	lineEl.appendChild(wrapper);

	const loading = document.createElement("div");
	loading.className = "tategaki-md-embed-widget-loading";
	loading.textContent = t("widget.embed.loading");
	wrapper.appendChild(loading);

	const content = document.createElement("div");
	content.className = "tategaki-md-embed-widget-content";
	wrapper.appendChild(content);

	const eol = document.createElement("span");
	eol.className = "tategaki-sot-eol";
	eol.dataset.offset = String(lineRange.to);
	eol.textContent = "\u200b";
	lineEl.appendChild(eol);

	if (!target) {
		loading.textContent = t("widget.embed.empty");
		return;
	}

	const sourcePath = context.getSourcePath();
	const parsed = parseEmbedTarget(target);
	if (!parsed) {
		loading.textContent = t("widget.embed.invalidFormat", { target });
		return;
	}
	const file = context.app.metadataCache.getFirstLinkpathDest(
		parsed.linkpath,
		sourcePath
	);
	if (!file) {
		loading.textContent = t("widget.embed.notFound", {
			linkpath: parsed.linkpath,
		});
		return;
	}
	const cache = context.app.metadataCache.getFileCache(file);
	if (parsed.heading) {
		const exists = (cache?.headings ?? []).some(
			(h) =>
				normalizeEmbedHeading(h.heading) ===
				normalizeEmbedHeading(parsed.heading!)
		);
		if (!exists) {
			loading.textContent = t("widget.embed.headingNotFound", {
				heading: parsed.heading,
			});
			return;
		}
	}
	if (parsed.blockId) {
		const blocks = cache?.blocks ?? {};
		const exists =
			(blocks as any)[parsed.blockId] ||
			(blocks as any)[`^${parsed.blockId}`];
		if (!exists) {
			loading.textContent = t("widget.embed.blockNotFound", {
				blockId: parsed.blockId,
			});
			return;
		}
	}

	const markdown = `![[${target}]]`;

	const renderChild = new MarkdownRenderChild(content);
	context.addChild(renderChild);
	if (lineIndex !== null) {
		context.embedRenderChildren.set(lineIndex, renderChild);
	}

	void MarkdownRenderer.render(
		context.app,
		markdown,
		content,
		sourcePath,
		renderChild
	)
		.then(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.embedTarget ?? "").trim() !== target) return;
			loading.remove();
		})
		.catch(() => {
			if (!lineEl.isConnected) return;
			if ((lineEl.dataset.embedTarget ?? "").trim() !== target) return;
			loading.textContent = t("widget.embed.renderFailed");
		});
}

function parseEmbedTarget(rawTarget: string): {
	linkpath: string;
	heading: string | null;
	blockId: string | null;
} | null {
	const trimmed = rawTarget.trim();
	if (!trimmed) return null;
	const core = trimmed.split("|", 1)[0]?.trim() ?? "";
	if (!core) return null;

	let blockId: string | null = null;
	let withoutBlock = core;
	const blockIndex = withoutBlock.lastIndexOf("^");
	if (blockIndex >= 0 && blockIndex + 1 < withoutBlock.length) {
		blockId = withoutBlock.slice(blockIndex + 1).trim() || null;
		withoutBlock = withoutBlock.slice(0, blockIndex);
	}

	let linkpath = withoutBlock;
	let heading: string | null = null;
	const hashIndex = withoutBlock.indexOf("#");
	if (hashIndex >= 0) {
		linkpath = withoutBlock.slice(0, hashIndex).trim();
		heading = withoutBlock.slice(hashIndex + 1).trim() || null;
	} else {
		linkpath = withoutBlock.trim();
	}

	if (!linkpath) return null;
	return { linkpath, heading, blockId };
}

function normalizeEmbedHeading(text: string): string {
	return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function resolveImageSrc(
	context: SoTWidgetRenderContext,
	linkText: string
): string | null {
	const trimmed = linkText.trim();
	if (!trimmed) return null;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
	const sourcePath = context.getSourcePath();
	const file = context.app.metadataCache.getFirstLinkpathDest(
		trimmed,
		sourcePath
	);
	if (!file) return null;
	try {
		return context.app.vault.getResourcePath(file);
	} catch (_) {
		return null;
	}
}
