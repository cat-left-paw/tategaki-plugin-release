import {
	DocumentModel,
	BlockNode,
	createParagraphBlock,
	createHeadingBlock,
	createListItemBlock,
	createBlockquoteBlock,
	createCodeBlock,
	createHtmlBlock,
	ListItemBlockOptions,
} from "../block-model";
import {
	MarkdownConverter,
	type MarkdownToHtmlOptions,
} from "../../contenteditable/markdown-converter";
import { convertRubyElementsToAozora } from "../../../shared/aozora-ruby";

interface MarkdownParserOptions {
	enableRuby?: boolean;
}

/**
 * Markdownテキストから行ごとのブロックモデルを生成
 * 1行 = 1ブロック（改行区切り）
 */
export async function markdownToDocument(
	markdown: string,
	options: MarkdownParserOptions = {}
): Promise<DocumentModel> {
	const segments = splitMarkdown(markdown);
	const frontmatterLineIndices = detectFrontmatterLineIndices(segments);
	const blocks: BlockNode[] = [];
	const converterOptions: MarkdownToHtmlOptions = {
		enableRuby: options.enableRuby,
	};
	const toHtml = (md: string): Promise<string> =>
		MarkdownConverter.markdownToHtml(md, converterOptions);

	let i = 0;
	while (i < segments.length) {
		const segment = segments[i] ?? "";
		const trimmed = segment.trim();
		const metadata = frontmatterLineIndices.has(i)
			? { isFrontmatter: true as const }
			: undefined;

		// 空行もブロックとして保持
		if (trimmed === '') {
			blocks.push(createParagraphBlock('', { markdown: segment, metadata }));
			i++;
			continue;
		}

		// コードブロックの検出と処理
		if (isCodeFenceSegment(segment)) {
			// コードブロック全体を収集
			const codeBlockLines: string[] = [segment];
			let j = i + 1;
			let codeBlockEnded = false;
			while (j < segments.length) {
				const nextSegment = segments[j] ?? "";
				const nextTrimmed = nextSegment.trim();
				codeBlockLines.push(nextSegment);
				j++;
				// コードブロック終了マーカーを検出
				if (nextTrimmed.match(/^```/)) {
					codeBlockEnded = true;
					break;
				}
			}

			if (codeBlockEnded) {
				const codeBlockText = codeBlockLines.join("\n");
				const block = await parseCodeFenceSegment(
					codeBlockText,
					codeBlockText,
					converterOptions
				);
				blocks.push(block);
				i = j;
				continue;
			}
		}

		// リストブロックの検出と処理
		if (isListSegment(segment)) {
			// リストブロック全体を収集
			const listLines: string[] = [segment];
			let j = i + 1;
			while (j < segments.length) {
				const nextSegment = segments[j] ?? "";
				const nextTrimmed = nextSegment.trim();
				// 空行、リスト項目、またはインデントされた行を含める
				if (
					!nextTrimmed ||
					isListLine(nextSegment)
				) {
					listLines.push(nextSegment);
					j++;
					// 空行後に非リスト行が来たらブロック終了
					if (!nextTrimmed && j < segments.length) {
						const afterEmpty = segments[j]?.trim();
						if (
							afterEmpty &&
							!isListLine(segments[j] ?? "")
						) {
							break;
						}
					}
				} else {
					break;
				}
			}

			// リストブロック全体を変換
			const listBlock = listLines.join("\n");
			const listBlocks = await parseListSegment(listBlock, converterOptions);
			blocks.push(...listBlocks);
			i = j;
			continue;
		}

		const headingLevel = extractHeadingLevel(trimmed);
		if (headingLevel) {
			const html = await toHtml(segment);
			blocks.push(createHeadingBlock(headingLevel, html, { markdown: segment, metadata }));
			i++;
			continue;
		}

		if (isBlockquoteSegment(trimmed)) {
			const html = await toHtml(segment);
			blocks.push(createBlockquoteBlock(html, { markdown: segment, metadata }));
			i++;
			continue;
		}

		if (looksLikeHtmlSegment(trimmed)) {
			const htmlSegment =
				options.enableRuby === false
					? convertRubyElementsToAozora(segment)
					: segment;
			blocks.push(
				createHtmlBlock(htmlSegment, { markdown: segment, metadata })
			);
			i++;
			continue;
		}

		const html = await toHtml(segment);
		blocks.push(createParagraphBlock(html, { markdown: segment, metadata }));
		i++;
	}

	return DocumentModel.fromBlocks(
		blocks.length ? blocks : [createParagraphBlock("")]
	);
}

/**
 * ブロックモデルをMarkdown文字列へ変換
 * 各ブロックのMarkdownを改行で結合
 */
export function documentToMarkdown(model: DocumentModel): string {
	const blocks = model.getBlocks();
	const lines = blocks.map(block => {
		// 各ブロックのMarkdownを使用（なければHTMLから変換）
		if (block.markdown !== undefined) {
			return block.markdown;
		}
		// 行単位なので各行の先頭/末尾のスペースを保持（trim: false）
		return MarkdownConverter.htmlToMarkdown(block.html, { trim: false });
	});
	return lines.join('\n');
}

/**
 * ブロックモデルをHTML文字列へ結合
 */
export function documentToHtml(model: DocumentModel, separator = "\n\n"): string {
	void separator;
	return model.toHtmlString();
}

/**
 * HTMLフラグメント群からブロックモデルを構築
 */
export async function htmlToDocument(html: string): Promise<DocumentModel> {
	const markdown = MarkdownConverter.htmlToMarkdown(html);
	return markdownToDocument(markdown);
}

function splitMarkdown(markdown: string): string[] {
	if (!markdown) {
		return [""];
	}

	const normalized = markdown.replace(/\r\n?/g, "\n");
	// 改行ごとに分割（1行 = 1ブロック）
	const segments = normalized.split(/\n/);
	return segments.length ? segments : [""];
}

function isListSegment(segment: string): boolean {
	const lines = segment.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		return /^(\s*)([-*+]|\d+\.)\s+/.test(line);
	}
	return false;
}

/**
 * 1行がリスト項目かどうかを判定
 */
function isListLine(line: string): boolean {
	return /^(\s*)([-*+]|\d+\.)\s+/.test(line);
}

async function parseListSegment(
	segment: string,
	options: MarkdownToHtmlOptions
): Promise<BlockNode[]> {
	const lines = segment
		.replace(/\t/g, "    ")
		.split("\n")
		.map((line) => line.replace(/\r$/, ""));

	const blocks: BlockNode[] = [];
	const listStates: ListLevelState[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index++;
			continue;
		}

		const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
		if (!match) {
			const html = await MarkdownConverter.markdownToHtml(line.trim(), options);
			blocks.push(createParagraphBlock(html, { markdown: line.trim() }));
			index++;
			continue;
		}

		const indentSpaces = match[1].length;
		const marker = match[2];
		const rest = match[3] ?? "";
		const depth = Math.max(0, Math.floor(indentSpaces / LIST_INDENT_SPACES));
		const listType: ListItemBlockOptions["listType"] = /^\d+\.$/.test(marker)
			? "ordered"
			: "bullet";
		const startNumber = listType === "ordered" ? parseInt(marker, 10) : undefined;

		const contentLines: string[] = [rest];
		const itemMarkdownLines: string[] = [line]; // 元のMarkdown行を保存
		let nextIndex = index + 1;
		while (nextIndex < lines.length) {
			const next = lines[nextIndex];
			if (!next.trim()) {
				contentLines.push("");
				itemMarkdownLines.push(next);
				nextIndex++;
				continue;
			}

			const nextMatch = next.match(/^(\s*)([-*+]|\d+\.)\s+/);
			if (nextMatch) {
				break;
			}

			const sliceIndex = Math.min(
				next.length,
				indentSpaces + LIST_CONTENT_INDENT
			);
			contentLines.push(next.slice(sliceIndex));
			itemMarkdownLines.push(next);
			nextIndex++;
		}

		const contentMarkdown = contentLines.join("\n");
		const itemMarkdown = itemMarkdownLines.join("\n"); // リストアイテムの元のMarkdown
		const html = await MarkdownConverter.markdownToHtml(contentMarkdown, options);
		const state = ensureListState(listStates, depth, listType, startNumber);
		const listNumber =
			listType === "ordered"
				? useListNumber(state, startNumber)
				: undefined;
		const parentId = depth > 0 ? listStates[depth - 1]?.lastItemId ?? null : null;
		const block = createListItemBlock(html, {
			depth,
			parentId,
			listType,
			listNumber,
			markdown: itemMarkdown, // 元のMarkdownを保存
			metadata: {
				listIndent: indentSpaces,
			},
		});

		state.lastItemId = block.id;
		listStates[depth] = state;
		listStates.length = depth + 1;
		blocks.push(block);
		index = nextIndex;
	}

	return blocks.length
		? blocks
		: [
			createParagraphBlock(await MarkdownConverter.markdownToHtml(segment, options), {
				markdown: segment,
			}),
		];
}

function isBlockquoteSegment(segment: string): boolean {
	const lines = segment.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		return /^>/.test(trimmed);
	}
	return false;
}

function extractHeadingLevel(segment: string): number | null {
	const firstLine = segment.split("\n").find((line) => line.trim().length > 0);
	if (!firstLine) {
		return null;
	}
	const match = firstLine.match(/^(#{1,6})\s+/);
	return match ? match[1].length : null;
}

function isCodeFenceSegment(segment: string): boolean {
	const firstLine = segment.split("\n").find((line) => line.trim().length > 0);
	return firstLine ? /^```/.test(firstLine.trim()) : false;
}

async function parseCodeFenceSegment(
	segment: string,
	markdownSource: string,
	options: MarkdownToHtmlOptions
): Promise<BlockNode> {
	const lines = segment.split("\n");
	const firstLine = lines[0] ?? "";
	const fenceMatch = firstLine.match(/^```([^\s]*)/);
	const language = fenceMatch && fenceMatch[1] ? fenceMatch[1] : undefined;
	const html = await MarkdownConverter.markdownToHtml(segment, options);
	return createCodeBlock(html, language, { markdown: markdownSource });
}

function looksLikeHtmlSegment(segment: string): boolean {
	return /^<[^>]+>/.test(segment.trim());
}

const LIST_INDENT_SPACES = 2;
function detectFrontmatterLineIndices(lines: string[]): Set<number> {
	const indices = new Set<number>();
	if (!lines.length) {
		return indices;
	}

	const isDelimiter = (line: string | undefined): boolean => {
		if (line === undefined) {
			return false;
		}
		const normalized = line.trim();
		return normalized === "---" || normalized === "...";
	};

	if (!isDelimiter(lines[0])) {
		return indices;
	}

	let closingIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (isDelimiter(lines[i])) {
			closingIndex = i;
			break;
		}
	}

	if (closingIndex === -1) {
		return indices;
	}

	for (let i = 0; i <= closingIndex; i++) {
		indices.add(i);
	}

	return indices;
}

const LIST_CONTENT_INDENT = 2;

interface ListLevelState {
	readonly depth: number;
	readonly type: "ordered" | "bullet";
	lastItemId: string | null;
	nextNumber: number;
}

function ensureListState(
	listStates: ListLevelState[],
	depth: number,
	type: "ordered" | "bullet",
	startNumber?: number
): ListLevelState {
	while (listStates.length <= depth) {
		listStates.push({
			depth: listStates.length,
			type,
			lastItemId: null,
			nextNumber: type === "ordered" ? 1 : 1,
		});
	}

	let state = listStates[depth];

	if (!state || state.type !== type) {
		state = {
			depth,
			type,
			lastItemId: null,
			nextNumber: type === "ordered" ? startNumber ?? 1 : 1,
		};
		listStates[depth] = state;
	} else if (type === "ordered" && state.lastItemId === null && startNumber) {
		state.nextNumber = startNumber;
	}

	return state;
}

function useListNumber(
	state: ListLevelState,
	startNumber?: number
): number {
	if (state.lastItemId === null && startNumber !== undefined) {
		state.nextNumber = startNumber;
	}

	const current = state.nextNumber;
	state.nextNumber = current + 1;
	return current;
}
