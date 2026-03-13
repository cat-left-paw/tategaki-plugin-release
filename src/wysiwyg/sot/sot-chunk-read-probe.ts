import type { ChunkControllerSnapshot } from "./sot-chunk-controller";
import { validateDisplayChunks } from "./sot-display-chunks";

export type ChunkReadProbeReason =
	| "disabled"
	| "empty"
	| "invalid"
	| "line-mismatch"
	| "ok";

export type ChunkReadProbeResult = {
	usable: boolean;
	reason: ChunkReadProbeReason;
	chunkCount: number;
	totalLines: number;
};

/**
 * Chunk snapshot を read-only で検査し、描画切替に使える状態かどうかを返す。
 * この関数は純関数であり副作用を持たない。
 */
export function probeChunkSnapshot(
	snapshot: ChunkControllerSnapshot,
	expectedTotalLines: number,
): ChunkReadProbeResult {
	const base = {
		chunkCount: snapshot.chunks.length,
		totalLines: snapshot.totalLines,
	};

	if (!snapshot.enabled) {
		return { usable: false, reason: "disabled", ...base };
	}

	if (snapshot.chunks.length === 0) {
		return { usable: false, reason: "empty", ...base };
	}

	if (snapshot.totalLines !== expectedTotalLines) {
		return { usable: false, reason: "line-mismatch", ...base };
	}

	if (!validateDisplayChunks(Array.from(snapshot.chunks), snapshot.totalLines)) {
		return { usable: false, reason: "invalid", ...base };
	}

	return { usable: true, reason: "ok", ...base };
}
