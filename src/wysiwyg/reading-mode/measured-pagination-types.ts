/**
 * 実測ページネーションの型定義
 */

export interface BlockSegment {
	block: HTMLElement;
	startIndex: number;
	endIndex: number;
	charCount: number;
	axisSize: number;
}

export interface PaginationState {
	host: HTMLElement;
	textNodes: Text[];
	prefixLengths: number[];
	textNodeRanges: Map<Text, { start: number; end: number }>;
	blockSegments: BlockSegment[];
	startIndex: number;
	totalLength: number;
	pageCount: number;
	cumulativeChars: number;
	lastCharCount: number;
	writingMode: string;
}

export interface PageInfo {
	element: HTMLElement;
	startIndex: number;
	endIndex: number;
	charCount: number;
}

export interface MeasuredPaginationOptions {
	container: HTMLElement;
	contentHtml: string;
	writingMode: "horizontal-tb" | "vertical-rl";
	pageWidth: number;
	pageHeight: number;
	paddingTop: number;
	paddingBottom: number;
	paddingLeft: number;
	paddingRight: number;
	onPage?: (pageInfo: PageInfo) => void;
	onProgress?: (current: number, total: number) => void;
	timeSliceMs?: number;
}

// 禁則文字セット
export const PROHIBITED_LINE_START_CHARS = new Set([
	"、", "。", "，", "．", ",", ".",
	"）", ")", "］", "]", "｝", "}", "】", "』", "」",
	"〉", "《", "〗", "〙", "〟", "\u2019", "\u201D", "»",
	"！", "？", "!", "?", "；", "：", ";", ":"
]);

export const PROHIBITED_LINE_END_CHARS = new Set([
	"（", "〔", "［", "｛", "〈", "《", "「", "『", "【",
	"〘", "〖", "〝", "\u2018", "\u201C", "«",
	"(", "[", "{"
]);

export const CONTINUATION_BLOCK_TAGS = new Set([
	"P", "DIV", "LI", "BLOCKQUOTE",
	"H1", "H2", "H3", "H4", "H5", "H6"
]);
