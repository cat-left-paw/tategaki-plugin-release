import type { LineRange } from "./line-ranges";
import type { DisplayChunk } from "./sot-display-chunks";
import {
	buildDisplayChunks,
	findChunkIndexForLine as findChunkIndexForLineInChunks,
	validateDisplayChunks,
} from "./sot-display-chunks";

export type ChunkControllerSnapshot = {
	chunks: ReadonlyArray<DisplayChunk>;
	totalLines: number;
	version: number;
	enabled: boolean;
};

export class SoTChunkController {
	private enabled = false;
	private chunks: DisplayChunk[] = [];
	private totalLines = 0;
	private version = 0;

	isEnabled(): boolean {
		return this.enabled;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	rebuild(params: {
		lineRanges: LineRange[];
		isLineHidden: (index: number) => boolean;
	}): void {
		this.totalLines = params.lineRanges.length;
		this.chunks = this.enabled ? buildDisplayChunks(params) : [];
		this.version += 1;
	}

	getSnapshot(): ChunkControllerSnapshot {
		return {
			chunks: this.chunks.slice(),
			totalLines: this.totalLines,
			version: this.version,
			enabled: this.enabled,
		};
	}

	getChunks(): ReadonlyArray<DisplayChunk> {
		return this.chunks;
	}

	findChunkIndexForLine(lineIndex: number): number {
		return findChunkIndexForLineInChunks(this.chunks, lineIndex);
	}

	validate(): boolean {
		return validateDisplayChunks(this.chunks, this.totalLines);
	}
}
