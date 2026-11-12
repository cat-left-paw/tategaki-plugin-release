import { Fragment, type PMNode } from "./prosemirror";
import { pmModeSchema as schema } from "./schema";

/**
 * The display document of the new mode groups runs of plain text lines into chunks (`tg-chunk`), so
 * that a later slice can skip the layout of the chunks outside the view (docs/tategaki-new-mode-chunked-
 * skip-design.md, CHUNK1). The model document of `PmModeDocumentState` and its source map stay flat; this
 * layout translates positions and turns a flat update into a replacement of chunks.
 *
 * The grouping is decided by the blocks' content alone (no positions), so a layout built from scratch
 * and one updated from the previous layout are the same (the M1-3 property, extended to chunks):
 * - only `line` blocks that are not headings, list, quote or code lines are grouped
 *   (headings draw their fold toggle outside the line; the others reach outside the root's padding in
 *   horizontal writing, design §5.3); parts, frontmatter and folded gaps stay at the top level.
 *   M1-7 (D-M17-7): a footnote-definition line is a plain line (no box any more) and is grouped as one;
 * - a run of groupable lines shorter than `CHUNK_MIN_RUN` stays at the top level;
 * - inside a run, a chunk ends after a line when a hash of that line and the line before it, as a
 *   fraction of 1, is below the line's length divided by `CHUNK_TARGET_CHARS` (longer lines end chunks
 *   more often, so a chunk holds about that many characters), or when the chunk has `CHUNK_MAX_BLOCKS`
 *   lines (counted from the chunk's start).
 */
export const CHUNK_TARGET_CHARS = 16000;
export const CHUNK_MAX_BLOCKS = 256;
export const CHUNK_MIN_RUN = 8;
const EXCLUDED_CLASSES = ["tategaki-md-heading", "tategaki-md-list", "tategaki-md-blockquote", "tategaki-md-codeblock"];

/** One item of the display document: a chunk of blocks `start..end-1`, or the single block `start`. */
export interface LayoutItem {
	readonly chunk: boolean;
	readonly start: number;
	readonly end: number;
	/** The item's display node: a `chunk` node, or the block's own node. */
	readonly node: PMNode;
}
/** A replacement of the display document: items `from..to` (positions) become `nodes`. */
export interface DisplayUpdate {
	readonly layout: ChunkLayout;
	readonly from: number;
	readonly to: number;
	readonly nodes: readonly PMNode[];
	/** Blocks `firstBlock..endBlock-1` (new indices) are inside the replaced items. */
	readonly firstBlock: number;
	readonly endBlock: number;
}

export function isGroupable(node: PMNode): boolean {
	return facts(node).groupable;
}

/** What the grouping reads of a block; nodes are immutable and shared, so it is cached on the object. */
interface BlockFacts { readonly groupable: boolean; readonly length: number; readonly hash: number }
const cache = new WeakMap<PMNode, BlockFacts>();
function mix(h: number): number {
	h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
	return h >>> 0;
}
function facts(node: PMNode): BlockFacts {
	let known = cache.get(node);
	if (known) return known;
	const line = node.type === schema.nodes.line;
	const classes = line ? node.attrs.classes as readonly string[] : [];
	const text = line ? node.textContent : "";
	const key = classes.join(" ") + "|" + text;
	let h = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	known = { groupable: line && !EXCLUDED_CLASSES.some(name => classes.includes(name)), length: text.length, hash: mix(h) };
	cache.set(node, known);
	return known;
}
function endsChunk(previous: BlockFacts | null, block: BlockFacts, count: number): boolean {
	if (count >= CHUNK_MAX_BLOCKS) return true;
	const pair = mix((Math.imul(previous ? previous.hash : 0, 31) + block.hash) >>> 0);
	return pair / 0x100000000 < block.length / CHUNK_TARGET_CHARS;
}

/** The items for `blocks`: `[start, end, chunk]` triples, from the content alone. */
export function planItems(blocks: readonly PMNode[]): Array<{ start: number; end: number; chunk: boolean }> {
	const plan: Array<{ start: number; end: number; chunk: boolean }> = [];
	const all = blocks.map(facts);
	for (let i = 0; i < blocks.length;) {
		if (!all[i].groupable) { plan.push({ start: i, end: i + 1, chunk: false }); i++; continue; }
		let runEnd = i;
		while (runEnd < blocks.length && all[runEnd].groupable) runEnd++;
		if (runEnd - i < CHUNK_MIN_RUN) {
			for (let k = i; k < runEnd; k++) plan.push({ start: k, end: k + 1, chunk: false });
			i = runEnd; continue;
		}
		let start = i;
		for (let k = i; k < runEnd; k++) {
			if (k === runEnd - 1 || endsChunk(k > i ? all[k - 1] : null, all[k], k - start + 1)) {
				plan.push({ start, end: k + 1, chunk: true });
				start = k + 1;
			}
		}
		i = runEnd;
	}
	return plan;
}

function sameMembers(a: readonly PMNode[], aStart: number, aEnd: number, b: readonly PMNode[], bStart: number, bEnd: number): boolean {
	if (aEnd - aStart !== bEnd - bStart) return false;
	for (let k = 0; k < aEnd - aStart; k++) if (a[aStart + k] !== b[bStart + k]) return false;
	return true;
}
function lastLessOrEqual(values: readonly number[], value: number): number {
	let lo = 0, hi = values.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (values[mid] <= value) lo = mid; else hi = mid - 1;
	}
	return lo;
}

export class ChunkLayout {
	private constructor(
		readonly blocks: readonly PMNode[],
		readonly items: readonly LayoutItem[],
		/** Each item's display position. */
		readonly itemFrom: readonly number[],
		/** Each block's display position. */
		readonly blockFrom: readonly number[],
		readonly doc: PMNode,
	) {}

	/** From the model's blocks; with `previous`, an item with the same blocks (as objects) keeps its node. */
	static build(blocks: readonly PMNode[], previous: ChunkLayout | null = null): ChunkLayout {
		// Old chunks by their first block (equal blocks share one object, so several chunks can share a key).
		const reuse = new Map<PMNode, LayoutItem[]>();
		if (previous) for (const item of previous.items) if (item.chunk) {
			const key = previous.blocks[item.start], list = reuse.get(key);
			if (list) list.push(item); else reuse.set(key, [item]);
		}
		const items: LayoutItem[] = [];
		for (const { start, end, chunk } of planItems(blocks)) {
			if (!chunk) { items.push({ chunk, start, end, node: blocks[start] }); continue; }
			const old = previous ? reuse.get(blocks[start])?.find(item => sameMembers(previous.blocks, item.start, item.end, blocks, start, end)) : undefined;
			items.push({ chunk, start, end, node: old ? old.node : schema.nodes.chunk.create(null, Fragment.fromArray(blocks.slice(start, end))) });
		}
		const itemFrom: number[] = [], blockFrom: number[] = [];
		let pos = 0;
		for (const item of items) {
			itemFrom.push(pos);
			let inner = pos + (item.chunk ? 1 : 0);
			for (let k = item.start; k < item.end; k++) { blockFrom.push(inner); inner += blocks[k].nodeSize; }
			pos += item.node.nodeSize;
		}
		return new ChunkLayout(blocks, items, itemFrom, blockFrom, schema.nodes.doc.create(null, Fragment.fromArray(items.map(item => item.node))));
	}

	/**
	 * The layout for the model's new blocks, and the replacement of the display document it takes. The
	 * replacement covers at least the items that hold blocks `rebuiltFrom..rebuiltTo-1` (new indices; the
	 * model update's rebuilt blocks). A rebuilt block can keep its node object while its decorations change
	 * (the same text with other Markdown, such as `12` and `1__2`, takes other Auto TCY ranges), so an item
	 * is kept by node identity only outside that range.
	 */
	next(blocks: readonly PMNode[], rebuiltFrom: number, rebuiltTo: number): DisplayUpdate {
		const layout = ChunkLayout.build(blocks, this);
		const a = this.items, b = layout.items;
		let prefix = 0;
		while (prefix < a.length && prefix < b.length && b[prefix].end <= rebuiltFrom && a[prefix].node === b[prefix].node) prefix++;
		let suffix = 0;
		while (suffix < a.length - prefix && suffix < b.length - prefix && b[b.length - 1 - suffix].start >= rebuiltTo && a[a.length - 1 - suffix].node === b[b.length - 1 - suffix].node) suffix++;
		const from = this.itemFrom[prefix] ?? this.doc.content.size;
		const lastOld = a.length - 1 - suffix;
		const to = lastOld >= prefix ? this.itemFrom[lastOld] + a[lastOld].node.nodeSize : from;
		const nodes = b.slice(prefix, b.length - suffix).map(item => item.node);
		const firstBlock = prefix < b.length ? b[prefix].start : blocks.length;
		const endBlock = b.length - suffix > prefix ? b[b.length - 1 - suffix].end : firstBlock;
		return { layout, from, to, nodes, firstBlock, endBlock };
	}

	/**
	 * The block holding display position `pos`. A position at a block's end, or between items, belongs to
	 * the next block (as in the flat source map, `blockIndexAtPm(toFlat(pos))`).
	 */
	blockIndexAt(pos: number): number {
		const i = lastLessOrEqual(this.blockFrom, pos);
		return pos >= this.blockFrom[i] + this.blocks[i].nodeSize && i + 1 < this.blocks.length ? i + 1 : i;
	}
	/** A flat (model) position, given the model's block positions, in display coordinates. */
	toDisplay(flatPos: number, flatFrom: readonly number[]): number {
		const i = lastLessOrEqual(flatFrom, flatPos);
		return this.blockFrom[i] + flatPos - flatFrom[i];
	}
	/**
	 * A display position in flat (model) coordinates. A position between items maps to the next block's
	 * start, and the position before the first chunk opens to the first block's start.
	 */
	toFlat(displayPos: number, flatFrom: readonly number[]): number {
		const i = lastLessOrEqual(this.blockFrom, displayPos);
		const rel = displayPos - this.blockFrom[i], size = this.blocks[i].nodeSize;
		return rel < 0 ? flatFrom[i] : rel <= size ? flatFrom[i] + rel : flatFrom[i] + size;
	}
}
