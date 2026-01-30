import { Editor } from "@tiptap/core";
import {
	convertRubyElementsToAozora,
	createAozoraRubyRegExp,
} from "../../../shared/aozora-ruby";
import type { TategakiV2Settings } from "../../../types/settings";

const BLANK_LINE_MARKER = "\u2060";
type MarkdownItConstructor = typeof import("markdown-it");
const MarkdownItCtor: MarkdownItConstructor = require("markdown-it");
const markdownRenderer = new MarkdownItCtor({
	html: true,
	breaks: false,
	linkify: false,
	typographer: false,
});

export interface MarkdownAdapter {
	setMarkdown(markdown: string): void;
	getMarkdown(): string;
	isApplyingExternalUpdate(): boolean;
}

export interface TipTapMarkdownAdapterOptions {
	getSettings?: () => TategakiV2Settings;
	getContextFilePath?: () => string | null;
	resolveImageSrc?: (src: string, contextFilePath: string | null) => string | null;
}

export function createTipTapMarkdownAdapter(
	editor: Editor,
	options: TipTapMarkdownAdapterOptions = {}
): MarkdownAdapter {
	return new TipTapMarkdownAdapter(editor, options);
}

class TipTapMarkdownAdapter implements MarkdownAdapter {
	private readonly editor: Editor;
	private readonly getSettings?: () => TategakiV2Settings;
	private readonly getContextFilePath?: () => string | null;
	private readonly resolveImageSrc?: (src: string, contextFilePath: string | null) => string | null;
	private isApplying = false;
	private frontmatterBlock: string | null = null;

	constructor(editor: Editor, options: TipTapMarkdownAdapterOptions) {
		this.editor = editor;
		this.getSettings = options.getSettings;
		this.getContextFilePath = options.getContextFilePath;
		this.resolveImageSrc = options.resolveImageSrc;
	}

	setMarkdown(markdown: string): void {
		const extracted = extractFrontmatterBlock(markdown);
		this.frontmatterBlock = extracted.frontmatter || null;

		const enableRuby = this.getSettings?.().wysiwyg?.enableRuby !== false;
		const contextFilePath = this.getContextFilePath?.() ?? null;
		const protectedMarkdown = protectIndentation(extracted.body);
		const normalizedMarkdown = normalizeMarkdownForTipTap(protectedMarkdown, {
			enableRuby,
			contextFilePath,
			resolveImageSrc: this.resolveImageSrc,
		});
		this.isApplying = true;
		try {
			this.editor
				.chain()
				.command(({ tr }) => {
					tr.setMeta("addToHistory", false);
					return true;
				})
				.setContent(normalizedMarkdown, { emitUpdate: false })
				.run();
			this.reapplyWritingMode();
		} finally {
			this.isApplying = false;
		}
	}

	getMarkdown(): string {
		const serialized = serializeDocToMarkdown(this.editor);
		const stripped = stripBlankLineMarkersFromMarkdown(serialized);
		const body = restoreIndentation(stripped);
		return `${this.frontmatterBlock ?? ""}${body}`;
	}

	isApplyingExternalUpdate(): boolean {
		return this.isApplying;
	}

	/**
	 * setContent 実行後に現在の書字方向を再適用する。
	 * setContent はノード属性を初期値に戻すため、書字方向を切り替えた後に
	 * カーソル同期で setContent が走るとレイアウトが崩れるのを防ぐ。
	 */
	private reapplyWritingMode(): void {
		const host = (this.editor.view?.dom as HTMLElement | undefined)?.closest(
			".tategaki-wysiwyg-editor"
		) as HTMLElement | null;
		const hostMode = host?.getAttribute("data-writing-mode");
		const storedMode = (this.editor.storage as any)?.verticalWriting
			?.currentMode as string | undefined;
		const mode =
			hostMode === "vertical-rl" || hostMode === "horizontal-tb"
				? hostMode
				: storedMode === "vertical-rl" || storedMode === "horizontal-tb"
					? storedMode
					: "vertical-rl";
		this.editor.commands.setWritingMode(mode);
	}
}

export function protectIndentation(markdown: string): string {
	const listItemPattern = /^([ \t　]*)([-*+]|[0-9]+[.)])\s+/;
	const headingIndentPattern = /^([ \t]{0,3}#{1,6}[ \t])([ \t　]+)(.*)$/;
	const segments = splitByFencedCodeBlocks(markdown);
	const protectedSegments = segments.map((segment) => {
		if (!segment.convert) {
			return segment.text;
		}

		const lines = segment.text.split("\n");
		let inList = false;

		const protectedLines = lines.map((line) => {
			const trimmed = line.trim();
			const isListItem = listItemPattern.test(line);
			const isIndentedLine = /^[ \t　]+\S/.test(line);

			if (isListItem) {
				inList = true;
				return line;
			}

			if (inList) {
				if (trimmed === "") {
					return line;
				}
				if (isIndentedLine) {
					return line;
				}
				inList = false;
			}

			const headingMatch = headingIndentPattern.exec(line);
			if (headingMatch) {
				const protectedSpaces = headingMatch[2]
					.split("")
					.map((char) => (char === "　" ? "&#12288;" : "&nbsp;"))
					.join("");
				return `${headingMatch[1]}${protectedSpaces}${headingMatch[3]}`;
			}

			return line.replace(/^([ 　]+)/, (match) => {
				const protectedSpaces = match
					.split("")
					.map((char) => {
						if (char === "　") {
							return "&#12288;";
						}
						return "&nbsp;";
					})
					.join("");
				return protectedSpaces;
			});
		});

		return protectedLines.join("\n");
	});

	return protectedSegments.join("");
}

export function restoreIndentation(markdown: string): string {
	let result = markdown;
	result = result.replace(/&#12288;/g, "　");
	result = result.replace(/&nbsp;/g, " ");
	result = result.replace(/\u00A0/g, " ");
	result = result.replace(/\u3000/g, "　");
	return result;
}

export function extractFrontmatterBlock(markdown: string): { frontmatter: string; body: string } {
	const match = markdown.match(/^(?:\uFEFF)?---\s*\n[\s\S]*?\n---\s*\n/);
	if (!match) {
		return { frontmatter: "", body: markdown };
	}
	const frontmatter = match[0];
	return {
		frontmatter,
		body: markdown.slice(frontmatter.length),
	};
}

export function normalizeMarkdownForTipTap(
	markdown: string,
	options?: {
		enableRuby?: boolean;
		contextFilePath?: string | null;
		resolveImageSrc?: (src: string, contextFilePath: string | null) => string | null;
	}
): string {
	const enableRuby = options?.enableRuby !== false;
	const processed = preprocessMarkdown(markdown, enableRuby, {
		contextFilePath: options?.contextFilePath ?? null,
		resolveImageSrc: options?.resolveImageSrc,
	});
	return renderStrictMarkdownToTipTapHtml(processed, enableRuby, {
		contextFilePath: options?.contextFilePath ?? null,
		resolveImageSrc: options?.resolveImageSrc,
	});
}

function preprocessMarkdown(
	markdown: string,
	enableRuby: boolean,
	options: {
		contextFilePath: string | null;
		resolveImageSrc?: (src: string, contextFilePath: string | null) => string | null;
	}
): string {
	const segments = splitByFencedCodeBlocks(markdown);
	return segments
		.map((segment) => {
			if (!segment.convert) {
				return segment.text;
			}
			return convertOutsideInlineCode(
				segment.text,
				(plainText) => {
					const withEmbeds = convertObsidianImageEmbedsToHtml(plainText, options);
					return convertInlineSyntaxToTipTapHtml(withEmbeds, enableRuby);
				}
			);
		})
		.join("");
}

function renderStrictMarkdownToTipTapHtml(
	content: string,
	enableRuby: boolean,
	options: {
		contextFilePath: string | null;
		resolveImageSrc?: (src: string, contextFilePath: string | null) => string | null;
	}
): string {
	const blocks: string[] = [];
	const lines = content.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		if (!trimmed) {
			blocks.push(`<p>${BLANK_LINE_MARKER}</p>`);
			continue;
		}

		// コードブロック（```/~~~）はブロック全体をmarkdown-itに任せる
		const fenceStart = trimmed.match(/^(`{3,}|~{3,})/);
		if (fenceStart) {
			const fenceChar = fenceStart[1][0];
			const fenceLen = fenceStart[1].length;
			const info = trimmed.slice(fenceLen).trim();
			const lang = info.length > 0 ? info.split(/\s+/)[0] : "";
			const codeBlockLines: string[] = [line];

			let j = i + 1;
			let ended = false;
			while (j < lines.length) {
				const nextLine = lines[j];
				codeBlockLines.push(nextLine);
				const nextTrimmed = nextLine.trim();
				const fenceEnd = nextTrimmed.match(/^(`{3,}|~{3,})\s*$/);
				if (fenceEnd && fenceEnd[1][0] === fenceChar && fenceEnd[1].length >= fenceLen) {
					ended = true;
					break;
				}
				j++;
			}

			if (!ended) {
				blocks.push(markdownRenderer.render(line));
				continue;
			}

			const bodyLines = codeBlockLines.slice(1, -1);
			const bodyText = bodyLines.join("\n");
			const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
			blocks.push(
				`<pre><code${langClass}>${escapeHtml(bodyText)}</code></pre>`
			);
			i = j;
			continue;
		}

		// リストブロック（参照と同じ収集方針でまとめてレンダリング）
		const isListItem =
			/^(\s*)[-*+]\s+/.test(line) || /^(\s*)\d+[.)]\s+/.test(line);
		if (isListItem) {
			const listLines: string[] = [line];
			let j = i + 1;
			while (j < lines.length) {
				const nextLine = lines[j];
				const nextTrimmed = nextLine.trim();

				// 空行の場合、次の行をチェックしてリストの終了を判定
				if (!nextTrimmed) {
					// 次の行がリスト項目かどうかをチェック
					if (j + 1 < lines.length) {
						const afterEmptyLine = lines[j + 1];
						const isNextListItem =
							/^(\s*)[-*+]\s+/.test(afterEmptyLine) ||
							/^(\s*)\d+[.)]\s+/.test(afterEmptyLine);
						if (!isNextListItem) {
							// 次がリスト項目でない場合、空行を含めずにリスト終了
							break;
						}
					}
					// 次がリスト項目、またはファイル末尾なら空行を含めて継続
					listLines.push(nextLine);
					j++;
					continue;
				}

				// リスト項目またはインデント行なら継続
				if (
					/^(\s*)[-*+]\s+/.test(nextLine) ||
					/^(\s*)\d+[.)]\s+/.test(nextLine) ||
					/^\s+\S/.test(nextLine)
				) {
					listLines.push(nextLine);
					j++;
					continue;
				}

				// それ以外はリスト終了
				break;
			}

			blocks.push(markdownRenderer.render(listLines.join("\n")));
			i = j - 1;
			continue;
		}

		// 引用ブロック（連続する ">" 行をまとめてレンダリング）
		if (trimmed.startsWith(">")) {
			const quoteLines: string[] = [line];
			let j = i + 1;
			while (j < lines.length) {
				const nextLine = lines[j];
				if (nextLine.trim().startsWith(">")) {
					quoteLines.push(nextLine);
					j++;
					continue;
				}
				break;
			}

			blocks.push(markdownRenderer.render(quoteLines.join("\n")));
			i = j - 1;
			continue;
		}

		// それ以外は行ごとにレンダリング（＝Enterで分割した段落を維持）
		blocks.push(markdownRenderer.render(line));
	}

	const html = blocks.join("\n");
	const withImages = rewriteHtmlImagesForTipTap(html, options);
	if (enableRuby) {
		return withImages;
	}
	// ルビOFF: HTMLの<ruby>を青空形式テキストへ潰して表示する
	return convertRubyElementsToAozora(withImages, { addDelimiter: false });
}

function rewriteHtmlImagesForTipTap(
	html: string,
	options: {
		contextFilePath: string | null;
		resolveImageSrc?: (src: string, contextFilePath: string | null) => string | null;
	}
): string {
	if (typeof document === "undefined") {
		return html;
	}
	if (!options.resolveImageSrc) {
		return html;
	}

	const doc = document.implementation.createHTMLDocument("");
	doc.body.innerHTML = html;
	const images = Array.from(doc.body.querySelectorAll("img"));

	for (const img of images) {
		const existingSource = img.getAttribute("data-tategaki-source");
		if (existingSource) {
			// Obsidian埋め込みはpreprocessで付与済み
			continue;
		}

		const rawSrc = img.getAttribute("src") ?? "";
		if (!rawSrc) continue;
		img.setAttribute("data-tategaki-source", "markdown");
		img.setAttribute("data-tategaki-original-src", rawSrc);

		const resolved = options.resolveImageSrc(rawSrc, options.contextFilePath);
		if (resolved && resolved !== rawSrc) {
			img.setAttribute("src", resolved);
		}
	}

	return doc.body.innerHTML;
}

function convertObsidianImageEmbedsToHtml(
	text: string,
	options: {
		contextFilePath: string | null;
		resolveImageSrc?: (src: string, contextFilePath: string | null) => string | null;
	}
): string {
	const embedPattern = /!\[\[([^\]]+)\]\]/g;
	return text.replace(embedPattern, (match: string, inner: string) => {
		const parts = String(inner).split("|").map((p) => p.trim()).filter(Boolean);
		if (parts.length === 0) return match;
		const target = parts[0] ?? "";
		if (!isLikelyImagePath(target)) {
			return match;
		}

		let width: number | null = null;
		let height: number | null = null;
		let alt = "";
		for (const part of parts.slice(1)) {
			const sizeMatch = part.match(/^(\d+)(?:\s*x\s*(\d+))?$/i);
			if (sizeMatch) {
				width = Number(sizeMatch[1]);
				height = sizeMatch[2] ? Number(sizeMatch[2]) : null;
				continue;
			}
			if (!alt) {
				alt = part;
			}
		}

		const resolved = options.resolveImageSrc
			? options.resolveImageSrc(target, options.contextFilePath)
			: null;
		const src = resolved || target;

		const attrs: string[] = [
			`src="${escapeHtml(src)}"`,
			`data-tategaki-source="obsidian"`,
			`data-tategaki-obsidian-src="${escapeHtml(target)}"`,
		];
		if (alt) attrs.push(`alt="${escapeHtml(alt)}"`);
		if (width != null && Number.isFinite(width)) {
			attrs.push(`data-tategaki-width="${escapeHtml(String(width))}"`);
		}
		if (height != null && Number.isFinite(height)) {
			attrs.push(`data-tategaki-height="${escapeHtml(String(height))}"`);
		}

		return `<img ${attrs.join(" ")} />`;
	});
}

function isLikelyImagePath(target: string): boolean {
	const normalized = target.split("#")[0]?.split("?")[0] ?? target;
	const dot = normalized.lastIndexOf(".");
	if (dot < 0) return false;
	const ext = normalized.slice(dot + 1).toLowerCase();
	return (
		ext === "png" ||
		ext === "jpg" ||
		ext === "jpeg" ||
		ext === "gif" ||
		ext === "webp" ||
		ext === "svg" ||
		ext === "bmp" ||
		ext === "avif"
	);
}

function convertInlineSyntaxToTipTapHtml(
	text: string,
	enableRuby: boolean
): string {
	let converted = text;
	if (enableRuby) {
		converted = convertAozoraRubyTextToTipTapHtml(converted);
		return converted;
	}
	converted = convertObsidianHighlightSyntaxToTipTapHtml(converted);
	return converted;
}

export function renderInlineMarkdownToTipTapHtml(
	text: string,
	options: { enableRuby?: boolean } = {}
): string {
	const enableRuby = options.enableRuby !== false;
	const converted = convertInlineSyntaxToTipTapHtml(text, enableRuby);
	return markdownRenderer.renderInline(converted);
}

function convertAozoraRubyTextToTipTapHtml(text: string): string {
	const regex = createAozoraRubyRegExp();
	regex.lastIndex = 0;
	let converted = text.replace(regex, (match: string, ...args: any[]) => {
		const groups = args[args.length - 1] as
			| Record<string, string | undefined>
			| undefined;
		const base = groups?.body2 ?? groups?.body1 ?? "";
		const ruby = groups?.ruby ?? "";
		if (!base || !ruby) {
			return match;
		}

		const hasDelimiter = /^[|\uFF5C]/.test(match);
		const delimiterAttr = hasDelimiter ? "1" : "0";

		return `<ruby data-aozora-ruby="1" data-aozora-delimiter="${delimiterAttr}"><span data-aozora-base="1">${escapeHtml(base)}</span><rt>${escapeHtml(ruby)}</rt></ruby>`;
	});
	converted = convertObsidianHighlightSyntaxToTipTapHtml(converted);
	return converted;
}

function convertObsidianHighlightSyntaxToTipTapHtml(text: string): string {
	const highlightRegex = /==([^=\n]+)==/g;
	return text.replace(highlightRegex, (_match, body: string) => {
		if (!body) {
			return _match;
		}
		return `<mark>${escapeHtml(body)}</mark>`;
	});
}

function serializeDocToMarkdown(editor: Editor): string {
	const { doc } = editor.state;
	const parts: string[] = [];

	for (let i = 0; i < doc.childCount; i++) {
		const node = doc.child(i);
		const serialized = serializeBlock(node, 0, i, doc.childCount);
		if (serialized == null) continue;
		parts.push(serialized);

			// Obsidian/Markdown-it の lazy continuation により、blockquote直後の段落が
			// 空行無しだと引用の続きとして解釈されることがあるため、必要な場合のみ空行を補う。
		if (node.type.name === "blockquote" && i < doc.childCount - 1) {
			const nextNode = doc.child(i + 1);
			if (nextNode.type.name === "paragraph") {
				const nextText = serializeInline(nextNode);
				const isNextBlank =
					nextText.trim() === "" || nextText === BLANK_LINE_MARKER;
				if (!isNextBlank) {
					parts.push(BLANK_LINE_MARKER);
				}
			}
		}
	}

	return parts.join("\n");
}

function serializeBlock(node: any, indentLevel: number, index: number, siblingCount: number): string | null {
	switch (node.type.name) {
		case "heading": {
			const inlineContent = serializeInline(node);
			return `${"#".repeat(node.attrs.level ?? 1)} ${inlineContent}`;
		}
	case "paragraph": {
		const text = serializeInline(node);
		// 空段落は削除せずプレースホルダーで保持（往復時の空行欠落を防ぐ）
		if (text.trim() === "" || text === BLANK_LINE_MARKER) {
			return BLANK_LINE_MARKER;
		}
		return text;
	}
		case "blockquote": {
			const body = flattenChildren(node, indentLevel);
			return body
				.split("\n")
				.map((line: string) => `> ${line}`)
				.join("\n");
		}
		case "bulletList":
			return serializeList(node, indentLevel, "-");
		case "orderedList":
			return serializeList(node, indentLevel, "1.");
		case "listItem": {
			const body = flattenChildren(node, indentLevel);
			return body;
		}
		case "codeBlock": {
			const lang = node.attrs.language ? node.attrs.language : "";
			const rawText = node.textContent ?? "";
			const body = rawText.endsWith("\n")
				? rawText.slice(0, -1)
				: rawText;
			return ["```" + lang, body, "```"].join("\n");
		}
		case "horizontalRule":
			return "---";
		default:
			return serializeInline(node);
	}
}

function serializeList(node: any, indentLevel: number, marker: string): string {
	const lines: string[] = [];
	const baseIndent = " ".repeat(indentLevel);
	const continuationIndent = " ".repeat(indentLevel + marker.length + 1);
	for (let i = 0; i < node.childCount; i++) {
		const child = node.child(i);
		const body =
			serializeBlock(
				child,
				indentLevel + marker.length + 1,
				i,
				node.childCount
			) ?? "";
		const prefix = `${baseIndent}${marker} `;
		lines.push(
			body
				.split("\n")
				.map((line: string, idx: number) => {
					if (idx === 0) {
						return prefix + line;
					}
					if (/^\s/.test(line)) {
						return line;
					}
					return `${continuationIndent}${line}`;
				})
				.join("\n")
		);
	}
	return lines.join("\n");
}

function flattenChildren(node: any, indentLevel: number): string {
	const parts: string[] = [];
	for (let i = 0; i < node.childCount; i++) {
		const child = node.child(i);
		const serialized = serializeBlock(child, indentLevel, i, node.childCount);
		if (serialized == null) continue;
		parts.push(serialized);
	}
	return parts.join("\n");
}

function serializeInline(node: any): string {
	if (node.isText) {
		return applyMarks(node);
	}

	if (node.type.name === "tategakiImage") {
		const attrs = node.attrs ?? {};
		const source = attrs.source === "obsidian" ? "obsidian" : "markdown";
		const alt = String(attrs.alt ?? "");
		const title = String(attrs.title ?? "");
		const width = typeof attrs.width === "number" ? attrs.width : null;
		const height = typeof attrs.height === "number" ? attrs.height : null;

		if (source === "obsidian") {
			const base = String(attrs.obsidianSrc || attrs.originalSrc || "");
			if (!base) {
				return "";
			}
			const options: string[] = [];
			if (width != null && Number.isFinite(width)) {
				const size =
					height != null && Number.isFinite(height)
						? `${width}x${height}`
						: String(width);
				options.push(size);
			}
			if (alt) {
				options.push(alt);
			}
			const suffix = options.length > 0 ? `|${options.join("|")}` : "";
			return `![[${base}${suffix}]]`;
		}

		const rawSrc = String(attrs.originalSrc || attrs.src || "");
		if (!rawSrc) {
			return "";
		}
		const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : "";
		return `![${alt}](${rawSrc}${titlePart})`;
	}

	if (node.type.name === "hardBreak") {
		return "<br>";
	}

	if (node.type.name === "wbr") {
		return "<wbr>";
	}

	if (node.type.name === "aozoraRuby") {
		const base = node.textContent ?? "";
		const ruby = node.attrs?.ruby ?? "";
		if (!base || !ruby) return base;
		const delimiter = node.attrs?.hasDelimiter ? "｜" : "";
		return `${delimiter}${base}《${ruby}》`;
	}

	let text = "";
	for (let i = 0; i < node.childCount; i++) {
		text += serializeInline(node.child(i));
	}
	return text;
}

export function serializeInlineToMarkdown(node: any): string {
	return serializeInline(node);
}

function applyMarks(textNode: any): string {
	let text = textNode.text ?? "";
	if (!text) return "";

	const marks = textNode.marks ?? [];
	const spanMark = marks.find((mark: any) => mark.type.name === "spanStyle");
	const orderedMarks = marks.filter(
		(mark: any) => mark.type.name !== "spanStyle"
	);

	for (const mark of orderedMarks) {
		switch (mark.type.name) {
			case "bold":
				text = `**${text}**`;
				break;
			case "italic":
				text = `*${text}*`;
				break;
			case "strike":
				text = `~~${text}~~`;
				break;
			case "underline":
				text = `<u>${text}</u>`;
				break;
			case "code":
				text = `\`${text}\``;
				break;
			case "obsidianHighlight":
				text = `==${text}==`;
				break;
			case "link": {
				const href = mark.attrs?.href || "";
				text = `[${text}](${href})`;
				break;
			}
			case "superscript":
				text = `<sup>${text}</sup>`;
				break;
			case "subscript":
				text = `<sub>${text}</sub>`;
				break;
			case "smallText":
				text = `<small>${text}</small>`;
				break;
		}
	}

	if (spanMark) {
		const className = spanMark.attrs?.class ?? "";
		const styleValue = spanMark.attrs?.style ?? "";
		const dataAttrs =
			(spanMark.attrs?.dataAttrs as Record<string, string> | undefined) ??
			{};
		const attrs: string[] = [];
		if (className) {
			attrs.push(`class="${escapeHtml(className)}"`);
		}
		if (styleValue) {
			attrs.push(`style="${escapeHtml(styleValue)}"`);
		}
		for (const [key, value] of Object.entries(dataAttrs)) {
			if (!key.startsWith("data-")) continue;
			attrs.push(`${key}="${escapeHtml(value)}"`);
		}
		const attrText = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
		text = `<span${attrText}>${text}</span>`;
	}

	return text;
}
export function stripBlankLineMarkersFromMarkdown(markdown: string): string {
	// 改行そのものを消さないように、マーカーのみを除去して空行数を保持する
	const markerPattern = new RegExp(`[\\t ]*${escapeRegExp(BLANK_LINE_MARKER)}[\\t ]*`, "g");
	return markdown.replace(markerPattern, "");
}

function convertOutsideInlineCode(
	text: string,
	converter: (plainText: string) => string
): string {
	let result = "";
	let buffer = "";
	let delimiter: string | null = null;

	for (let i = 0; i < text.length; ) {
		const char = text[i];
		if (char !== "`") {
			buffer += char;
			i += 1;
			continue;
		}

		let j = i;
		while (j < text.length && text[j] === "`") {
			j += 1;
		}
		const run = text.slice(i, j);

		if (delimiter === null) {
			result += converter(buffer);
			buffer = "";
			result += run;
			delimiter = run;
			i = j;
			continue;
		}

		if (run.length === delimiter.length) {
			result += buffer;
			buffer = "";
			result += run;
			delimiter = null;
			i = j;
			continue;
		}

		buffer += run;
		i = j;
	}

	if (delimiter === null) {
		result += converter(buffer);
	} else {
		result += buffer;
	}

	return result;
}

function splitByFencedCodeBlocks(markdown: string): { text: string; convert: boolean }[] {
	const lines = markdown.split("\n");
	const segments: { text: string; convert: boolean }[] = [];

	let convertBuffer = "";
	let codeBuffer = "";
	let inFence = false;
	let fenceChar = "";
	let fenceLen = 0;

	const flushConvert = () => {
		if (!convertBuffer) return;
		segments.push({ text: convertBuffer, convert: true });
		convertBuffer = "";
	};
	const flushCode = () => {
		if (!codeBuffer) return;
		segments.push({ text: codeBuffer, convert: false });
		codeBuffer = "";
	};

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const suffix = index === lines.length - 1 ? "" : "\n";

		if (!inFence) {
			const match = line.match(/^\s*(`{3,}|~{3,})/);
			if (match) {
				flushConvert();
				inFence = true;
				fenceChar = match[1][0];
				fenceLen = match[1].length;
				codeBuffer += line + suffix;
				continue;
			}
			convertBuffer += line + suffix;
			continue;
		}

		codeBuffer += line + suffix;
		const closing = line.match(/^\s*(`{3,}|~{3,})\s*$/);
		if (!closing) {
			continue;
		}
		const marker = closing[1];
		if (marker[0] !== fenceChar) {
			continue;
		}
		if (marker.length < fenceLen) {
			continue;
		}

		inFence = false;
		fenceChar = "";
		fenceLen = 0;
		flushCode();
	}

	if (codeBuffer) {
		flushCode();
	}
	if (convertBuffer) {
		flushConvert();
	}

	return segments;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
