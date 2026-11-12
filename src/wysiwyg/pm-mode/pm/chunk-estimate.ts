import type { PMNode } from "./prosemirror";

/**
 * The size of a chunk along the block axis (the columns in vertical writing), estimated from its text
 * alone, before the chunk was ever laid out (chunked-skip design §9.1, CHUNK2-B). A chunk outside the view
 * takes this size until it is shown; then its real size is used.
 *
 * Each line takes max(1, ⌈characters ÷ characters per line⌉) lines of `advance` (the line height). The
 * characters are the line's text (a ruby's reading is an attribute, not text, so it does not count). Lines
 * in chunks have no margins (only headings have, and they are never in a chunk).
 */
export interface ChunkMetrics {
	/** Characters per line: the root's inline size ÷ (font size + letter spacing), at least 1. */
	readonly perLine: number;
	/** One line's advance along the block axis (the line height), in CSS px. */
	readonly advance: number;
}

export function chunkMetrics(inlineSize: number, fontSize: number, letterSpacing: number, lineHeight: number): ChunkMetrics {
	const pitch = fontSize + letterSpacing;
	return { perLine: pitch > 0 ? Math.max(1, Math.floor(inlineSize / pitch)) : 1, advance: Math.max(0, lineHeight) };
}

/** The characters of each line, remembered per node object (nodes are immutable and shared). */
const lengths = new WeakMap<PMNode, number>();
export function lineLength(line: PMNode): number {
	let known = lengths.get(line);
	if (known === undefined) { known = line.textContent.length; lengths.set(line, known); }
	return known;
}

/** The estimated size of a chunk node (its children are lines). */
export function estimateChunkSize(chunk: PMNode, metrics: ChunkMetrics): number {
	let lines = 0;
	chunk.forEach(line => { lines += Math.max(1, Math.ceil(lineLength(line) / metrics.perLine)); });
	return lines * metrics.advance;
}

/**
 * A chunk's size after the lines got longer or shorter (a resize, a settings change): its known size (real
 * or estimated) times the ratio of the two estimates, so a chunk measured once keeps what the estimate does
 * not know (ruby, punctuation, half-width text).
 */
export function rescaleChunkSize(knownSize: number, chunk: PMNode, before: ChunkMetrics, after: ChunkMetrics): number {
	const old = estimateChunkSize(chunk, before), next = estimateChunkSize(chunk, after);
	return old > 0 ? knownSize * (next / old) : next;
}
