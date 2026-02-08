// @ts-ignore
import TurndownService = require('turndown');

export type BlockType =
	| "paragraph"
	| "heading"
	| "listItem"
	| "blockquote"
	| "code"
	| "html";

export interface BlockMetadata {
	readonly headingLevel?: number;
	readonly listType?: "ordered" | "bullet";
	readonly listNumber?: number;
	readonly listIndent?: number;
	readonly fenceLanguage?: string;
	readonly blockquoteDepth?: number;
	readonly [key: string]: unknown;
}

export interface BlockNode {
	readonly id: string;
	readonly type: BlockType;
	readonly html: string;
	readonly markdown?: string;        // 新規: 元のMarkdownソース
	readonly textContent?: string;     // 新規: プレーンテキスト
	readonly textLength?: number;      // 新規: テキスト長
	readonly contentHash?: string;     // 新規: 内容のハッシュ
	readonly parentId: string | null;
	readonly depth: number;
	readonly metadata: BlockMetadata;
}

export interface BlockNodeOptions {
	id?: string;
	parentId?: string | null;
	depth?: number;
	metadata?: BlockMetadata;
	markdown?: string; // 元のMarkdownソーステキスト
}

export interface ListItemBlockOptions extends BlockNodeOptions {
	listType: "ordered" | "bullet";
	listNumber?: number;
}

/**
 * immutable document model storing block nodes. operations return new instance.
 */
export class DocumentModel {
	private readonly blocks: BlockNode[];

	private constructor(blocks: BlockNode[]) {
		this.blocks = blocks;
	}

	static createEmpty(): DocumentModel {
		return new DocumentModel([]);
	}

	static fromBlocks(blocks: BlockNode[]): DocumentModel {
		return new DocumentModel(blocks.map(cloneBlockNode));
	}

	static fromPlainText(text: string): DocumentModel {
		const segments = normalizePlainText(text);
		const blocks = segments.map((segment) =>
			createParagraphBlock(escapeHtml(segment))
		);
		return new DocumentModel(blocks.length ? blocks : [createParagraphBlock("")]);
	}

	getBlocks(): readonly BlockNode[] {
		return this.blocks;
	}

	getBlockById(id: string): BlockNode | undefined {
		return this.blocks.find((block) => block.id === id);
	}

	getIndexById(id: string): number {
		return this.blocks.findIndex((block) => block.id === id);
	}

	updateBlock(updated: BlockNode): DocumentModel {
		return this.replaceBlockWith(updated.id, [updated]);
	}

	updateBlockHtml(id: string, html: string): DocumentModel {
		const block = this.getBlockById(id);
		if (!block) return this;
		return this.replaceBlockWith(id, [
			{
				...block,
				html,
				// HTMLが更新されたため元のMarkdownキャッシュは無効化する
				markdown: undefined,
			},
		]);
	}

	updateBlockMetadata(id: string, metadata: BlockMetadata): DocumentModel {
		const block = this.getBlockById(id);
		if (!block) return this;
		return this.replaceBlockWith(id, [
			{
				...block,
				metadata,
			},
		]);
	}

	/**
	 * ブロックのMarkdownとHTMLを同時に更新
	 * プレーン編集モードからの保存時に使用
	 */
	updateBlockWithMarkdown(id: string, markdown: string, html: string): DocumentModel {
		const block = this.getBlockById(id);
		if (!block) return this;
		return this.replaceBlockWith(id, [
			{
				...block,
				html,
				markdown,
				textContent: undefined, // 再計算が必要
				textLength: undefined,
				contentHash: undefined,
			},
		]);
	}

	insertBlock(index: number, block: BlockNode): DocumentModel {
		const blocks = [...this.blocks];
		blocks.splice(index, 0, cloneBlockNode(block));
		return new DocumentModel(blocks);
	}

	insertBlockAfter(targetId: string, block: BlockNode): DocumentModel {
		const index = this.getIndexById(targetId);
		if (index === -1) {
			return this.insertBlock(this.blocks.length, block);
		}
		return this.insertBlock(index + 1, block);
	}

	removeBlock(targetId: string): DocumentModel {
		const blocks = this.blocks.filter((block) => block.id !== targetId);
		return new DocumentModel(blocks);
	}

	replaceBlockWith(targetId: string, replacement: BlockNode[]): DocumentModel {
		const index = this.getIndexById(targetId);
		if (index === -1) {
			return this;
		}
		const blocks = [...this.blocks];
		const mapped = replacement.map(cloneBlockNode);
		blocks.splice(index, 1, ...mapped);
		return new DocumentModel(blocks);
	}

	replaceAll(blocks: BlockNode[]): DocumentModel {
		return new DocumentModel(blocks.map(cloneBlockNode));
	}

	toPlainText(): string {
		return this.blocks.map((block) => unescapeHtml(block.html)).join("\n\n");
	}

	toHtmlString(): string {
		return serializeBlocksToHtml(this.blocks);
	}

	toBlockTree(): BlockTreeNode[] {
		return buildBlockTree(this.blocks);
	}

	/**
	 * モデル全体をMarkdownに変換
	 */
	toMarkdown(): string {
		return this.blocks
			.map(block => block.markdown || this.htmlToMarkdownFallback(block.html))
			.join('\n\n');
	}

	/**
	 * ブロックのMarkdownを取得
	 */
	getBlockMarkdown(blockId: string): string {
		const block = this.getBlockById(blockId);
		if (!block) return '';
		return block.markdown || this.htmlToMarkdownFallback(block.html);
	}

	/**
	 * HTMLからMarkdownへのフォールバック変換（Turndown使用）
	 */
	private htmlToMarkdownFallback(html: string): string {
		const turndownService = new TurndownService({
			headingStyle: 'atx',
			hr: '---',
			bulletListMarker: '-',
			codeBlockStyle: 'fenced',
			emDelimiter: '*',
			strongDelimiter: '**',
			linkStyle: 'inlined',
			linkReferenceStyle: 'full'
		});

		// プレースホルダーのbrタグを除外
			turndownService.addRule('removePlaceholderBr', {
				filter: (node) => {
					return (
						node.nodeName === "BR" &&
						node.getAttribute("data-tategaki-placeholder") === "1"
					);
				},
				replacement: () => ''
			});

		return turndownService.turndown(html);
	}
}

export interface BlockTreeNode {
	readonly id: string;
	readonly type: BlockType;
	readonly html: string;
	readonly depth: number;
	readonly metadata: BlockMetadata;
	readonly children: BlockTreeNode[];
}

function generateBlockId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `block-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePlainText(text: string): string[] {
	if (!text) {
		return [];
	}
	return text
		.replace(/\r\n?/g, "\n")
		.split(/\n{2,}/)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function unescapeHtml(text: string): string {
	return text
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&amp;/g, "&");
}

function cloneMetadata(metadata: BlockMetadata | undefined): BlockMetadata {
	if (!metadata) {
		return {};
	}
	return { ...metadata };
}

function cloneBlockNode(node: BlockNode): BlockNode {
	return {
		...node,
		metadata: cloneMetadata(node.metadata),
	};
}

function baseBlock(
	type: BlockType,
	html: string,
	options?: BlockNodeOptions
): BlockNode {
	return {
		id: options?.id ?? generateBlockId(),
		type,
		html,
		markdown: options?.markdown, // 元のMarkdownソーステキストを保持
		parentId:
			options?.parentId === undefined ? null : options.parentId ?? null,
		depth: options?.depth ?? 0,
		metadata: cloneMetadata(options?.metadata),
	};
}

export function createParagraphBlock(
	html: string,
	options?: BlockNodeOptions
): BlockNode {
	return baseBlock("paragraph", html, options);
}

export function createHeadingBlock(
	level: number,
	html: string,
	options?: BlockNodeOptions
): BlockNode {
	const metadata: BlockMetadata = {
		...options?.metadata,
		headingLevel: level,
	};
	return baseBlock("heading", html, {
		...options,
		metadata,
	});
}

export function createBlockquoteBlock(
	html: string,
	options?: BlockNodeOptions
): BlockNode {
	return baseBlock("blockquote", html, options);
}

export function createCodeBlock(
	html: string,
	language: string | undefined,
	options?: BlockNodeOptions
): BlockNode {
	const metadata: BlockMetadata = {
		...options?.metadata,
		fenceLanguage: language,
	};
	return baseBlock("code", html, {
		...options,
		metadata,
	});
}

export function createListItemBlock(
	html: string,
	options: ListItemBlockOptions
): BlockNode {
	const metadata: BlockMetadata = {
		...options.metadata,
		listType: options.listType,
		listNumber: options.listNumber,
	};
	return baseBlock("listItem", html, {
		...options,
		metadata,
	});
}

export function createHtmlBlock(
	html: string,
	options?: BlockNodeOptions
): BlockNode {
	return baseBlock("html", html, options);
}

export function serializeBlocksToHtml(blocks: readonly BlockNode[]): string {
	const result: string[] = [];
	const listStack: { type: "ordered" | "bullet"; depth: number }[] = [];

	const closeListsToDepth = (depth: number) => {
		while (listStack.length > depth) {
			const entry = listStack.pop();
			if (!entry) {
				continue;
			}
			result.push(entry.type === "ordered" ? "</ol>" : "</ul>");
		}
	};

	for (const block of blocks) {
		if (block.type === "listItem") {
			const depth = Math.max(0, block.depth);
			const listType = block.metadata.listType ?? "bullet";

			while (listStack.length < depth + 1) {
				listStack.push({
					type: listType,
					depth: listStack.length,
				});
				result.push(listType === "ordered" ? "<ol>" : "<ul>");
			}

			let current = listStack[listStack.length - 1];
			if (!current) {
				current = {
					type: listType,
					depth,
				};
				listStack[listStack.length - 1] = current;
				result.push(listType === "ordered" ? "<ol>" : "<ul>");
			}

			if (current.type !== listType) {
				result.push(current.type === "ordered" ? "</ol>" : "</ul>");
				listStack.pop();
				listStack.push({
					type: listType,
					depth,
				});
				result.push(listType === "ordered" ? "<ol>" : "<ul>");
			}

			result.push(`<li>${block.html}</li>`);
			continue;
		}

		closeListsToDepth(0);
		result.push(block.html);
	}

	closeListsToDepth(0);

	return result.join("\n");
}

export function buildBlockTree(blocks: readonly BlockNode[]): BlockTreeNode[] {
	const nodeMap = new Map<string, BlockTreeNode>();
	const roots: BlockTreeNode[] = [];

	for (const block of blocks) {
		nodeMap.set(block.id, {
			id: block.id,
			type: block.type,
			html: block.html,
			depth: block.depth,
			metadata: cloneMetadata(block.metadata),
			children: [],
		});
	}

	for (const block of blocks) {
		const treeNode = nodeMap.get(block.id);
		if (!treeNode) {
			continue;
		}

		if (!block.parentId) {
			roots.push(treeNode);
			continue;
		}

		const parent = nodeMap.get(block.parentId);
		if (parent) {
			parent.children.push(treeNode);
		} else {
			roots.push(treeNode);
		}
	}

	return roots;
}
