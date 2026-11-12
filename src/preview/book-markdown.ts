import * as MarkdownItModule from "markdown-it";
import {
	convertRubyElementsToAozora,
	createAozoraRubyRegExp,
} from "../shared/aozora-ruby";
import {
	canParseHtmlInert,
	parseHtmlToInertContainer,
} from "../shared/html-fragment";
import { convertAozoraTcySyntaxToHtml } from "../shared/aozora-tcy";

/**
 * 書籍モードの Markdown -> HTML（reading-view.ts の buildSnapshotHtmlParts が使う）。
 * 1.4.0 で互換モード（TipTap）を削除したときに、互換モードの markdown-adapter から移した
 * （markdown-it の renderer と、normalizeMarkdownForBook が使う下請けだけ。出力は移す前と1字も変えない）。
 * 検証: tests/playwright/book-markdown-equivalence.spec.ts（移す前の出力の記録 book-markdown-golden-pre-1.4.0.json と比べる）。
 */

const BLANK_LINE_MARKER = "\u2060";
type MarkdownItConstructor = typeof import("markdown-it");
const MarkdownItCtor = (
	(MarkdownItModule as unknown as { default?: MarkdownItConstructor })
		.default ??
	(MarkdownItModule as unknown as MarkdownItConstructor)
);
const markdownRenderer = new MarkdownItCtor({
	html: true,
	breaks: false,
	linkify: false,
	typographer: false,
});

type ReplaceCallbackArg =
	| string
	| number
	| Record<string, string | undefined>
	| undefined;

function getReplaceGroups(
	args: ReplaceCallbackArg[],
): Record<string, string | undefined> | undefined {
	const groups = args[args.length - 1];
	return typeof groups === "object" && groups !== null
		? groups
		: undefined;
}

export function protectIndentation(markdown: string): string {
	const listItemPattern = /^([ \t\u3000]*)([-*+]|[0-9]+[.)])\s+/;
	const headingIndentPattern = /^([ \t]{0,3}#{1,6}[ \t])([ \t\u3000]+)(.*)$/;
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
				const isIndentedLine = /^[ \t\u3000]+\S/.test(line);

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
						.map((char) => (char === "\u3000" ? "&#12288;" : "&nbsp;"))
						.join("");
					return `${headingMatch[1]}${protectedSpaces}${headingMatch[3]}`;
				}

				return line.replace(/^([ \u3000]+)/, (match) => {
					const protectedSpaces = match
						.split("")
						.map((char) => {
							if (char === "\u3000") {
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

export function normalizeMarkdownForBook(
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
	const html = renderStrictMarkdownToTipTapHtml(processed, enableRuby, {
		contextFilePath: options?.contextFilePath ?? null,
		resolveImageSrc: options?.resolveImageSrc,
	});
	return sanitizeTipTapHtml(html);
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

			const hasTaskItems = listLines.some((l) =>
				/^(\s*)(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(l),
			);
			if (hasTaskItems && isSimpleTaskList(listLines)) {
				blocks.push(convertTaskListLinesToHtml(listLines, enableRuby));
			} else {
				blocks.push(markdownRenderer.render(listLines.join("\n")));
			}
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
	// sanitize before touching DOM to avoid firing onerror/onload in temp documents
	const preSanitized = stripDangerousHtml(html);
	const withImages = rewriteHtmlImagesForTipTap(preSanitized, options);
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
	if (typeof document === "undefined" || !canParseHtmlInert()) {
		return html;
	}
	if (!options.resolveImageSrc) {
		return html;
	}

	const container = parseHtmlToInertContainer(html);
	const images = Array.from(container.querySelectorAll("img"));

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

	return container.innerHTML;
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
	}
	converted = convertAozoraTcySyntaxToHtml(converted);
	converted = convertObsidianHighlightSyntaxToTipTapHtml(converted);
	return converted;
}

function convertAozoraRubyTextToTipTapHtml(text: string): string {
	const regex = createAozoraRubyRegExp();
	regex.lastIndex = 0;
	return text.replace(regex, (match: string, ...args: ReplaceCallbackArg[]) => {
		const groups = getReplaceGroups(args);
		const base = groups?.body2 ?? groups?.body1 ?? "";
		const ruby = groups?.ruby ?? "";
		if (!base || !ruby) {
			return match;
		}

		const hasDelimiter = /^[|\uFF5C]/.test(match);
		const delimiterAttr = hasDelimiter ? "1" : "0";

		return `<ruby data-aozora-ruby="1" data-aozora-delimiter="${delimiterAttr}"><span data-aozora-base="1">${escapeHtml(base)}</span><rt>${escapeHtml(ruby)}</rt></ruby>`;
	});
}

function sanitizeTipTapHtml(html: string): string {
	const stripped = stripDangerousHtml(html);
	const hasDomParser =
		typeof DOMParser !== "undefined" &&
		typeof document !== "undefined";
	if (!hasDomParser) {
		return sanitizeTipTapHtmlFallback(stripped);
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(stripped, "text/html");

	const disallowedTags = new Set([
		"script",
		"iframe",
		"object",
		"embed",
		"svg",
		"math",
		"link",
		"meta",
		"style",
	]);

	const isSafeUrl = (value: string, attrName: string, tagName: string): boolean => {
		const trimmed = value.trim();
		if (!trimmed) return true;
		if (trimmed.startsWith("#")) return true;
		if (/^[./]/.test(trimmed)) return true;

		const lowered = trimmed.toLowerCase();
		if (lowered.startsWith("javascript:")) return false;
		if (lowered.startsWith("vbscript:")) return false;
		if (lowered.startsWith("data:")) {
			return (
				attrName === "src" &&
				tagName === "img" &&
				lowered.startsWith("data:image/")
			);
		}
		if (
			lowered.startsWith("http:") ||
			lowered.startsWith("https:") ||
			lowered.startsWith("app:") ||
			lowered.startsWith("obsidian:") ||
			lowered.startsWith("file:")
		) {
			return true;
		}
		return true;
	};

	const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
	const toRemove: Element[] = [];
	let node = walker.nextNode();
	while (node) {
		const el = node as Element;
		const tagName = el.tagName.toLowerCase();
		if (disallowedTags.has(tagName)) {
			toRemove.push(el);
			node = walker.nextNode();
			continue;
		}
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			if (name.startsWith("on")) {
				el.removeAttribute(attr.name);
				continue;
			}
			if (name === "href" || name === "src" || name === "xlink:href") {
				if (!isSafeUrl(attr.value, name, tagName)) {
					el.removeAttribute(attr.name);
				}
			}
		}
		node = walker.nextNode();
	}

	for (const el of toRemove) {
		el.remove();
	}

	return doc.body.innerHTML;
}

function sanitizeTipTapHtmlFallback(html: string): string {
	return stripDangerousHtml(html);
}

function stripDangerousHtml(html: string): string {
	let sanitized = html;
	sanitized = sanitized.replace(
		/<\s*(script|svg|math|iframe|object|embed|link|meta|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
		""
	);
	sanitized = sanitized.replace(
		/<\s*(script|svg|math|iframe|object|embed|link|meta|style)[^>]*\/\s*>/gi,
		""
	);
	sanitized = sanitized.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
	sanitized = sanitized.replace(/\son\w+\s*=\s*[^>\s]+/gi, "");
	sanitized = sanitized.replace(
		/\s(href|src|xlink:href)\s*=\s*(['"])\s*(?:javascript|vbscript):[\s\S]*?\2/gi,
		""
	);
	return sanitized;
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

/**
 * タスクリスト行を TipTap が解釈できる HTML に変換する。
 * `- [ ] item` / `- [x] item` パターンの行を対象にし、
 * 通常リスト行（チェックボックスなし）は無視する。
 */
/**
 * 与えられたリスト行群が「単純なタスクリスト」かどうかを判定する。
 *
 * 単純なタスクリスト = 空行以外の全行がトップレベルの task 項目で、
 * marker 種別（unordered / ordered）がブロック内で統一されているもの
 * 以下の場合は false を返してフォールバック（markdown-it）を使う:
 * - 継続行（インデントされた非リスト行）が含まれる
 * - ネストしたタスク項目（先頭スペースあり）が含まれる
 * - 通常の箇条書きや番号リストが混在する
 * - unordered checklist と ordered checklist が混在する
 */
function isSimpleTaskList(lines: string[]): boolean {
	let markerKind: "unordered" | "ordered" | null = null;
	for (const line of lines) {
		if (/^\s*$/.test(line)) continue;
		const currentKind = /^[-*+]\s+\[[ xX]\]/.test(line)
			? "unordered"
			: /^\d+[.)]\s+\[[ xX]\]/.test(line)
				? "ordered"
				: null;
		if (!currentKind) return false;
		if (markerKind === null) {
			markerKind = currentKind;
			continue;
		}
		if (markerKind !== currentKind) return false;
	}
	return true;
}

function convertTaskListLinesToHtml(lines: string[], enableRuby: boolean): string {
	const taskItemRegex = /^(\s*)(?:([-*+])|\d+[.)])\s+\[([ xX])\]\s*(.*)$/;
	const items: string[] = [];
	let markerKind: "unordered" | "ordered" | null = null;
	for (const line of lines) {
		const match = taskItemRegex.exec(line);
		if (!match) continue;
		const currentKind = match[2] ? "unordered" : "ordered";
		if (markerKind === null) {
			markerKind = currentKind;
		} else if (markerKind !== currentKind) {
			return "";
		}
		const checked = match[3].toLowerCase() === "x";
		const rawContent = match[4] ?? "";
		// インライン記法（ボールド・イタリック等）を変換
		const renderedContent = enableRuby
			? markdownRenderer.renderInline(convertInlineSyntaxToTipTapHtml(rawContent, true))
			: markdownRenderer.renderInline(rawContent);
		items.push(
			`<li data-checked="${checked}"><p>${renderedContent}</p></li>`,
		);
	}
	if (items.length === 0 || markerKind === null) return "";
	const tag = markerKind === "ordered" ? "ol" : "ul";
	return `<${tag}>${items.join("")}</${tag}>`;
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

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
