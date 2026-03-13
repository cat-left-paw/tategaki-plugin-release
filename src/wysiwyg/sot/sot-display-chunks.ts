import type { LineRange } from "./line-ranges";

export type DisplayChunkType = "lines" | "collapsed-gap";

export type DisplayChunk = {
	type: DisplayChunkType;
	startLine: number;
	endLine: number;
	lineCount: number;
};

export type BuildDisplayChunksParams = {
	lineRanges: LineRange[];
	isLineHidden: (index: number) => boolean;
};

/**
 * 行配列を可視run/hidden runごとにチャンク化する純関数。
 * - 欠損/重複なく全行を1回ずつカバーする
 * - hidden run は `collapsed-gap` として表現する
 */
export function buildDisplayChunks(
	params: BuildDisplayChunksParams,
): DisplayChunk[] {
	const totalLines = params.lineRanges.length;
	if (totalLines === 0) return [];

	const chunks: DisplayChunk[] = [];
	let cursor = 0;

	while (cursor < totalLines) {
		const startLine = cursor;
		const firstLineHidden = params.isLineHidden(startLine);
		const type: DisplayChunkType = firstLineHidden
			? "collapsed-gap"
			: "lines";

		cursor += 1;
		while (cursor < totalLines) {
			const hidden = params.isLineHidden(cursor);
			if (hidden !== firstLineHidden) break;
			cursor += 1;
		}

		const endLine = cursor - 1;
		chunks.push({
			type,
			startLine,
			endLine,
			lineCount: endLine - startLine + 1,
		});
	}

	return chunks;
}

/**
 * 指定行を含むchunk indexを返す。見つからない場合は -1。
 */
export function findChunkIndexForLine(
	chunks: DisplayChunk[],
	lineIndex: number,
): number {
	if (lineIndex < 0) return -1;

	let low = 0;
	let high = chunks.length - 1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const chunk = chunks[mid];
		if (lineIndex < chunk.startLine) {
			high = mid - 1;
			continue;
		}
		if (lineIndex > chunk.endLine) {
			low = mid + 1;
			continue;
		}
		return mid;
	}

	return -1;
}

/**
 * chunk配列が totalLines を欠損/重複なく連続カバーしているか検証する。
 */
export function validateDisplayChunks(
	chunks: DisplayChunk[],
	totalLines: number,
): boolean {
	if (totalLines < 0) return false;
	if (totalLines === 0) return chunks.length === 0;
	if (chunks.length === 0) return false;

	let expectedStart = 0;

	for (const chunk of chunks) {
		if (chunk.type !== "lines" && chunk.type !== "collapsed-gap") {
			return false;
		}
		if (chunk.startLine > chunk.endLine) return false;
		if (chunk.lineCount !== chunk.endLine - chunk.startLine + 1) {
			return false;
		}
		if (chunk.startLine !== expectedStart) return false;
		if (chunk.startLine < 0 || chunk.endLine >= totalLines) {
			return false;
		}
		expectedStart = chunk.endLine + 1;
	}

	return expectedStart === totalLines;
}
