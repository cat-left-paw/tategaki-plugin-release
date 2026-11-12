// Copied from src/wysiwyg/sot/sot-widget-renderer.ts (lines 29-565) and src/wysiwyg/sot-wysiwyg-view.ts
// (V:1715-1822 frontmatter, V:14019-14035 inline math, V:14374-14380 finishRenderMath) @ 42ef031 (2026-10-17).
// Local changes: Draw into the light DOM part of a slot nodeView (D23); take the markdown and attrs from
// the PM node instead of line ranges; the render child lives as long as the nodeView (removeChild on
// destroy); no caret anchor (tategaki-sot-eol, M1 design §9 #7: CSS keeps the width); plain DOM instead
// of Obsidian's createDiv/createEl; finishRenderMath once after each PM update instead of a timer.
import { MarkdownRenderChild, MarkdownRenderer, finishRenderMath, renderMath, type App, type Component } from "obsidian";
import { t } from "../../../shared/i18n";
import { parseFrontmatterBlock, type FrontmatterData } from "../../../shared/frontmatter";
import type { TategakiV2Settings } from "../../../types/settings";
import type { PmModePartHandle, PmModePartRenderer, PmModePartRequest } from "../pm/slot-parts";

export interface PmModeObsidianEnv {
	readonly app: App;
	/** The view: render children are added to it and removed when their part goes away. */
	readonly component: Component;
	getSourcePath(): string;
}
type MarkdownWidgetKind = "math" | "callout" | "table" | "deflist";

function el<K extends keyof HTMLElementTagNameMap>(part: HTMLElement, tag: K, className?: string): HTMLElementTagNameMap[K] {
	const element = part.ownerDocument.createElement(tag);
	if (className) element.className = className;
	return element;
}

export class ObsidianPmModeParts implements PmModePartRenderer {
	private mathPending = false;
	private readonly frontmatters = new Set<{ refresh(): void }>();
	constructor(private readonly env: PmModeObsidianEnv, private readonly getSettings: () => { settings: TategakiV2Settings; writingMode: string }) {}

	render(request: PmModePartRequest, part: HTMLElement, frame: HTMLElement): PmModePartHandle | null {
		const attrs = request.node.attrs;
		if (request.type === "inlineMath") return this.renderInlineMath(String(attrs.source), part, frame);
		if (request.type === "frontmatter") return this.renderFrontmatterPart(String(attrs.markdown), part);
		const kind = String(attrs.kind);
		if (kind === "math" || kind === "callout" || kind === "table" || kind === "deflist") return this.renderMarkdownWidget(kind, String(attrs.markdown), part);
		if (kind === "image") { this.renderImage(attrs.imageSrc as string | null, attrs.imageAlt as string | null, attrs.imageWidth as string | null, part); return null; }
		if (kind === "embed") return this.renderEmbed(String(attrs.embedTarget ?? ""), part);
		return null;
	}
	afterUpdate(): void {
		if (!this.mathPending) return;
		this.mathPending = false;
		finishRenderMath().catch(() => {});
	}
	/** Frontmatter depends on settings (hide / show flags, writing mode): draw the parts again. */
	refreshFrontmatter(): void { for (const fm of this.frontmatters) fm.refresh(); }

	private addChild(content: HTMLElement): MarkdownRenderChild {
		const child = new MarkdownRenderChild(content);
		this.env.component.addChild(child);
		return child;
	}
	private release(child: MarkdownRenderChild): void { this.env.component.removeChild(child); }

	/** sot-widget-renderer.ts:29-367 (math / callout / table / deflist): the same DOM and classes. */
	private renderMarkdownWidget(kind: MarkdownWidgetKind, markdown: string, part: HTMLElement): PmModePartHandle {
		const wrapper = el(part, "div", `tategaki-md-${kind}-widget-inner`);
		const loading = el(part, "div", `tategaki-md-${kind}-widget-loading`);
		loading.textContent = t(`widget.${kind}.rendering`);
		const content = el(part, "div", `tategaki-md-${kind}-widget-content` + (kind === "math" ? "" : " markdown-rendered"));
		wrapper.append(loading, content);
		part.appendChild(wrapper);
		const child = this.addChild(content);
		let alive = true;
		void MarkdownRenderer.render(this.env.app, markdown, content, this.env.getSourcePath(), child)
			.then(() => { if (alive) loading.remove(); })
			.catch(() => { if (alive) loading.textContent = t(`widget.${kind}.renderFailed`); });
		return { destroy: () => { alive = false; this.release(child); } };
	}

	/** sot-widget-renderer.ts:369-410 */
	private renderImage(srcAttr: string | null, altAttr: string | null, widthAttr: string | null, part: HTMLElement): void {
		const src = (srcAttr ?? "").trim(), alt = (altAttr ?? "").trim(), width = (widthAttr ?? "").trim();
		const wrapper = el(part, "span", "tategaki-md-image-widget-inner");
		part.appendChild(wrapper);
		const img = el(part, "img", "tategaki-md-image-widget-img");
		img.loading = "lazy";
		img.alt = alt;
		img.src = this.resolveImageSrc(src) ?? src;
		if (/^\d+$/.test(width)) {
			img.style.maxWidth = `${width}px`;
			img.style.maxHeight = `${width}px`;
		}
		wrapper.appendChild(img);
		if (alt.length > 0) {
			const cap = el(part, "span", "tategaki-md-image-widget-caption");
			cap.textContent = alt;
			wrapper.appendChild(cap);
		}
	}

	/** sot-widget-renderer.ts:412-509 */
	private renderEmbed(target: string, part: HTMLElement): PmModePartHandle | null {
		target = target.trim();
		const wrapper = el(part, "div", "tategaki-md-embed-widget-inner markdown-embed");
		const loading = el(part, "div", "tategaki-md-embed-widget-loading");
		loading.textContent = t("widget.embed.loading");
		const content = el(part, "div", "tategaki-md-embed-widget-content");
		wrapper.append(loading, content);
		part.appendChild(wrapper);
		if (!target) { loading.textContent = t("widget.embed.empty"); return null; }
		const sourcePath = this.env.getSourcePath();
		const parsed = parseEmbedTarget(target);
		if (!parsed) { loading.textContent = t("widget.embed.invalidFormat", { target }); return null; }
		const file = this.env.app.metadataCache.getFirstLinkpathDest(parsed.linkpath, sourcePath);
		if (!file) { loading.textContent = t("widget.embed.notFound", { linkpath: parsed.linkpath }); return null; }
		const cache = this.env.app.metadataCache.getFileCache(file);
		const heading = parsed.heading;
		if (heading) {
			const exists = (cache?.headings ?? []).some(h => normalizeEmbedHeading(h.heading) === normalizeEmbedHeading(heading));
			if (!exists) { loading.textContent = t("widget.embed.headingNotFound", { heading }); return null; }
		}
		if (parsed.blockId) {
			const blocks = (cache?.blocks ?? {}) as Record<string, unknown>;
			if (!(blocks[parsed.blockId] || blocks[`^${parsed.blockId}`])) { loading.textContent = t("widget.embed.blockNotFound", { blockId: parsed.blockId }); return null; }
		}
		const child = this.addChild(content);
		let alive = true;
		void MarkdownRenderer.render(this.env.app, `![[${target}]]`, content, sourcePath, child)
			.then(() => { if (alive) loading.remove(); })
			.catch(() => { if (alive) loading.textContent = t("widget.embed.renderFailed"); });
		return { destroy: () => { alive = false; this.release(child); } };
	}

	/** V:14019-14035: renderMath into the part; the fallback keeps the notation, as in V. */
	private renderInlineMath(source: string, part: HTMLElement, frame: HTMLElement): PmModePartHandle | null {
		try {
			part.appendChild(renderMath(source, false));
			this.mathPending = true;
		} catch {
			part.textContent = `$${source}$`;
			frame.classList.add("is-fallback");
		}
		return null;
	}

	/** V:1715-1822 and the render pipeline (sot-render-pipeline.ts:290-300): only when not hidden. */
	private renderFrontmatterPart(markdown: string, part: HTMLElement): PmModePartHandle {
		const draw = () => {
			part.replaceChildren();
			const { settings, writingMode } = this.getSettings();
			if (settings.preview.hideFrontmatter ?? false) return;
			// The block ends at the closing fence; V's pattern needs the line break after it.
			const data = parseFrontmatterBlock(markdown + "\n").frontmatter;
			if (!data) return;
			const element = renderFrontmatter(part, data, settings);
			if (!element) return;
			element.style.writingMode = writingMode;
			// (`text-orientation: mixed` is the class's rule in styles.css; the part is drawn in the light DOM, so styles.css applies)
			element.classList.add("tategaki-frontmatter-writing-mode");
			part.appendChild(element);
		};
		draw();
		const entry = { refresh: draw };
		this.frontmatters.add(entry);
		return { destroy: () => { this.frontmatters.delete(entry); } };
	}

	/** sot-widget-renderer.ts:546-565 */
	private resolveImageSrc(linkText: string): string | null {
		const trimmed = linkText.trim();
		if (!trimmed) return null;
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
		const file = this.env.app.metadataCache.getFirstLinkpathDest(trimmed, this.env.getSourcePath());
		if (!file) return null;
		try { return this.env.app.vault.getResourcePath(file); } catch { return null; }
	}
}

/** V:1715-1803, with plain DOM. */
function renderFrontmatter(part: HTMLElement, data: FrontmatterData, settings: TategakiV2Settings): HTMLElement | null {
	const container = el(part, "div", "tategaki-frontmatter");
	let hasContent = false;
	const top = el(part, "div", "tategaki-frontmatter-top");
	container.appendChild(top);
	const add = (parent: HTMLElement, tag: "h1" | "h2" | "h4" | "h5", className: string, text: string, inlineEnd: boolean) => {
		const item = el(part, tag, className);
		item.textContent = text;
		if (inlineEnd) applyFrontmatterInlineEndAlignment(item);
		parent.appendChild(item);
		hasContent = true;
	};
	if (data.title && settings.preview.showFrontmatterTitle) add(top, "h1", "tategaki-frontmatter-title", data.title, false);
	if (data.subtitle && settings.preview.showFrontmatterSubtitle) add(top, "h2", "tategaki-frontmatter-subtitle", data.subtitle, false);
	if (data.original_title && settings.preview.showFrontmatterOriginalTitle) add(top, "h2", "tategaki-frontmatter-original-title", data.original_title, false);
	const bottom = el(part, "div", "tategaki-frontmatter-bottom");
	container.appendChild(bottom);
	if (data.author && settings.preview.showFrontmatterAuthor) add(bottom, "h4", "tategaki-frontmatter-author", data.author, true);
	if (data.co_authors && settings.preview.showFrontmatterCoAuthors) for (const name of data.co_authors) add(bottom, "h4", "tategaki-frontmatter-co-author", name, true);
	if (data.translator && settings.preview.showFrontmatterTranslator) add(bottom, "h5", "tategaki-frontmatter-translator", data.translator, true);
	if (data.co_translators && settings.preview.showFrontmatterCoTranslators) for (const name of data.co_translators) add(bottom, "h5", "tategaki-frontmatter-co-translator", name, true);
	return hasContent ? container : null;
}

/** V:1805-1814 */
function applyFrontmatterInlineEndAlignment(element: HTMLElement): void {
	// The same two classes as the other modes (styles.css; the part is drawn in the light DOM): the first has display, the margins and justify-self, the second the former inline
	// `text-align: end !important` / `text-align-last: end !important` (its compound selector repeats the class to keep winning like the inline declaration did).
	element.classList.add("tategaki-frontmatter-inline-end", "tategaki-frontmatter-inline-end-forced");
}

/** sot-widget-renderer.ts:511-540 */
function parseEmbedTarget(rawTarget: string): { linkpath: string; heading: string | null; blockId: string | null } | null {
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
	} else linkpath = withoutBlock.trim();
	if (!linkpath) return null;
	return { linkpath, heading, blockId };
}

/** sot-widget-renderer.ts:542-544 */
function normalizeEmbedHeading(text: string): string { return text.replace(/\s+/g, " ").trim().toLowerCase(); }
