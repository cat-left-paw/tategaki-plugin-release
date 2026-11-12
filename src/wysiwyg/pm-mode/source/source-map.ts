import type { BlockKind, SourceBlock } from "./source-model";
import type { BlockLineDecoration } from "./types";

export interface SourceRange { from: number; to: number }
export interface SourcePoint { offset: number; affinity: number }
export interface VisibleRun extends SourceRange { pmFrom: number; pmTo: number }
export interface InlineMapping extends SourceRange {
	kind: "ruby" | "tcy" | "inlineMath";
	pmFrom: number;
	pmTo: number;
	baseFrom: number;
	baseTo: number;
}
/** An Auto TCY candidate of a line (M1-4): its PM range and text; the setting filters it. */
export interface AutoTcyMapping { pmFrom: number; pmTo: number; text: string }
export interface BlockMapping extends SourceBlock {
	pmFrom: number;
	pmTo: number;
	runs: VisibleRun[];
	inlines: InlineMapping[];
	autoTcy?: AutoTcyMapping[];
}
interface Position { offset: number; pm: number }

function shiftRun<T extends VisibleRun>(run: T, src: number, pm: number): T {
	return { ...run, from: run.from + src, to: run.to + src, pmFrom: run.pmFrom + pm, pmTo: run.pmTo + pm };
}
function shiftInline(inline: InlineMapping, src: number, pm: number): InlineMapping {
	return { ...shiftRun(inline, src, pm), baseFrom: inline.baseFrom + src, baseTo: inline.baseTo + src };
}

/** Dataset keys holding absolute "start-end" line numbers (only on atom blocks' first line). */
export const ABSOLUTE_RANGE_KEYS = ["mathRange", "calloutRange", "tableRange", "deflistRange"] as const;

/**
 * One block's position tables, relative to the block's own source offset and PM position (M1-3).
 * It has no absolute position, so an unchanged block keeps the same object across updates; the
 * tables are built on first use and cached on the object.
 */
export class LocalBlockMap {
	private offsetTable: number[] | null = null;
	private positionTable: Position[] | null = null;
	private constructor(
		readonly type: BlockKind,
		readonly kind: string,
		readonly markdown: string,
		readonly lineCount: number,
		readonly srcLen: number,
		readonly pmSize: number,
		readonly runs: readonly VisibleRun[],
		readonly inlines: readonly InlineMapping[],
		readonly decoration: BlockLineDecoration,
		/** Auto TCY candidates, relative to the block's PM position (M1-4). */
		readonly autoTcy: readonly AutoTcyMapping[] = [],
	) {}

	/**
	 * From a block mapping in absolute coordinates (the builder's output). The decoration of an
	 * atom block loses its absolute line ranges (`mathRange` etc., "start-end" line numbers): they
	 * change when lines above move, and the block's own line count already says the same.
	 */
	static fromAbsolute(block: BlockMapping): LocalBlockMap {
		const src = -block.from, pm = -block.pmFrom;
		const dataset = { ...block.decoration.dataset };
		if (block.type !== "line") for (const key of ABSOLUTE_RANGE_KEYS) delete dataset[key];
		const decoration = { ...block.decoration, dataset, hidden: block.decoration.hidden.map(range => ({ from: range.from + src, to: range.to + src })) };
		return new LocalBlockMap(block.type, block.kind, block.markdown, block.endLine - block.startLine + 1, block.to - block.from, block.pmTo - block.pmFrom,
			block.runs.map(run => shiftRun(run, src, pm)), block.inlines.map(inline => shiftInline(inline, src, pm)), decoration,
			(block.autoTcy ?? []).map(c => ({ pmFrom: c.pmFrom + pm, pmTo: c.pmTo + pm, text: c.text })));
	}

	/** The same algorithm as the whole-document table of M1-1, restricted to one block. */
	offsets(): readonly number[] {
		if (this.offsetTable) return this.offsetTable;
		const offsets = new Array<number>(this.pmSize + 1);
		if (this.type !== "line") {
			offsets[0] = 0;
			offsets[this.pmSize] = this.srcLen;
			return this.offsetTable = offsets;
		}
		// Runs are written in source order: a shared boundary belongs to the later run.
		for (const run of this.runs) for (let p = run.pmFrom; p <= run.pmTo; p++) offsets[p] = run.from + p - run.pmFrom;
		// Container boundaries retain notation identity, not a delimiter-stripped run.
		for (const inline of this.inlines) { offsets[inline.pmFrom] = inline.from; offsets[inline.pmTo] = inline.to; }
		// A following run/inline wins over the previous node's outside-after boundary.
		for (const run of this.runs) {
			if (!this.inlines.some(inline => run.pmFrom > inline.pmFrom && run.pmFrom < inline.pmTo)) offsets[run.pmFrom] = run.from;
		}
		const contentFrom = 1, contentTo = this.pmSize - 1;
		if (offsets[contentFrom] === undefined) offsets[contentFrom] = this.srcLen;
		if (offsets[contentTo] === undefined) offsets[contentTo] = this.srcLen;
		offsets[0] = offsets[contentFrom];
		offsets[this.pmSize] = offsets[contentTo];
		return this.offsetTable = offsets;
	}

	/** Projected points sorted by source offset, then PM position (for gap normalization). */
	positions(): readonly Position[] {
		if (this.positionTable) return this.positionTable;
		const positions: Position[] = [];
		if (this.type !== "line") {
			positions.push({ offset: 0, pm: 0 }, { offset: this.srcLen, pm: this.pmSize });
		} else {
			for (const run of this.runs) for (let p = run.pmFrom; p <= run.pmTo; p++) positions.push({ offset: run.from + p - run.pmFrom, pm: p });
			for (const inline of this.inlines) positions.push({ offset: inline.from, pm: inline.pmFrom }, { offset: inline.to, pm: inline.pmTo });
			if (!this.runs.length && !this.inlines.length) positions.push({ offset: this.srcLen, pm: 1 });
		}
		positions.sort((a, b) => a.offset - b.offset || a.pm - b.pm);
		return this.positionTable = positions;
	}
}

function lastLessOrEqual(values: readonly number[], value: number): number {
	let lo = 0, hi = values.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (values[mid] <= value) lo = mid; else hi = mid - 1;
	}
	return lo;
}

/**
 * Source map over position-free block tables plus per-block bases (M1-3). Lookups find the block
 * by binary search and read its local table, so an update replaces only the changed blocks and
 * recomputes the base offsets. The results are the same as the whole-document tables of M1-1
 * (checked against a reference copy in tests/pm-mode/reference).
 */
export class PmModeSourceMap {
	readonly pmSize: number;
	/** Materialized absolute mappings, per block index (built on demand). */
	private readonly materialized: (BlockMapping | undefined)[] = [];
	private constructor(
		readonly source: string,
		readonly locals: readonly LocalBlockMap[],
		readonly srcFrom: readonly number[],
		readonly pmFrom: readonly number[],
		readonly startLine: readonly number[],
	) {
		const last = locals.length - 1;
		this.pmSize = pmFrom[last] + locals[last].pmSize;
	}

	/** From block mappings in absolute coordinates (a full build). */
	static fromBlocks(source: string, blocks: readonly BlockMapping[]): PmModeSourceMap {
		return new PmModeSourceMap(source, blocks.map(block => LocalBlockMap.fromAbsolute(block)), blocks.map(b => b.from), blocks.map(b => b.pmFrom), blocks.map(b => b.startLine));
	}
	/** From local tables and their bases (an incremental update). */
	static fromParts(source: string, locals: readonly LocalBlockMap[], srcFrom: readonly number[], pmFrom: readonly number[], startLine: readonly number[]): PmModeSourceMap {
		return new PmModeSourceMap(source, locals, srcFrom, pmFrom, startLine);
	}

	/** Absolute block mappings (built on demand; for tests and diagnostics). */
	get blocks(): readonly BlockMapping[] {
		return this.locals.map((_, i) => this.materialize(i));
	}
	private materialize(i: number): BlockMapping {
		const cached = this.materialized[i];
		if (cached) return cached;
		const local = this.locals[i], src = this.srcFrom[i], pm = this.pmFrom[i];
		return this.materialized[i] = {
			type: local.type, kind: local.kind, markdown: local.markdown,
			decoration: { ...local.decoration, hidden: local.decoration.hidden.map(range => ({ from: range.from + src, to: range.to + src })) },
			startLine: this.startLine[i], endLine: this.startLine[i] + local.lineCount - 1,
			from: src, to: src + local.srcLen, pmFrom: pm, pmTo: pm + local.pmSize,
			runs: local.runs.map(run => shiftRun(run, src, pm)), inlines: local.inlines.map(inline => shiftInline(inline, src, pm)),
			autoTcy: local.autoTcy.map(c => ({ pmFrom: c.pmFrom + pm, pmTo: c.pmTo + pm, text: c.text })),
		};
	}

	blockIndexAtPm(pos: number): number { this.checkPm(pos); return lastLessOrEqual(this.pmFrom, pos); }
	blockIndexAtSource(offset: number): number { this.checkSource(offset); return lastLessOrEqual(this.srcFrom, offset); }
	blockAtPm(pos: number): BlockMapping { return this.materialize(this.blockIndexAtPm(pos)); }
	blockAtSource(offset: number): BlockMapping { return this.materialize(this.blockIndexAtSource(offset)); }
	private checkPm(pos: number): void { if (!Number.isInteger(pos) || pos < 0 || pos > this.pmSize) throw new RangeError(`PM position: ${pos}`); }
	private checkSource(offset: number): void { if (!Number.isInteger(offset) || offset < 0 || offset > this.source.length) throw new RangeError(`source offset: ${offset}`); }

	/** A position shared by two blocks belongs to the later block. */
	pmToSource(pos: number): number {
		const i = this.blockIndexAtPm(pos);
		return this.srcFrom[i] + this.locals[i].offsets()[pos - this.pmFrom[i]];
	}
	point(pos: number): SourcePoint { return { offset: this.pmToSource(pos), affinity: pos }; }

	sourceToPm(offset: number, bias: -1 | 1 = 1, point?: SourcePoint): number {
		this.checkSource(offset);
		if (point?.offset === offset && Number.isInteger(point.affinity) && point.affinity >= 0 && point.affinity <= this.pmSize && this.pmToSource(point.affinity) === offset) return point.affinity;
		const i = lastLessOrEqual(this.srcFrom, offset), local = this.locals[i], src = this.srcFrom[i], pm = this.pmFrom[i];
		const rel = offset - src;
		if (local.type !== "line" && rel >= 0 && rel <= local.srcLen) {
			return rel === 0 ? pm : rel === local.srcLen ? pm + local.pmSize : bias < 0 ? pm : pm + local.pmSize;
		}
		for (const atom of local.inlines) if (atom.kind === "inlineMath" && rel >= atom.from && rel <= atom.to) {
			return rel === atom.from ? pm + atom.pmFrom : rel === atom.to ? pm + atom.pmTo : bias < 0 ? pm + atom.pmFrom : pm + atom.pmTo;
		}
		// Gap normalization: the first projected point at or after the offset, else its neighbor.
		// For an equal offset use the earliest content position (bare Ruby's outside-before).
		const positions = local.positions();
		let lo = 0, hi = positions.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (positions[mid].offset < rel) lo = mid + 1; else hi = mid;
		}
		if (lo < positions.length && positions[lo].offset === rel) return pm + positions[lo].pm;
		if (bias < 0) {
			if (lo > 0) return pm + positions[lo - 1].pm;
			if (i === 0) return pm + positions[0].pm;
			const previous = this.locals[i - 1].positions();
			return this.pmFrom[i - 1] + previous[previous.length - 1].pm;
		}
		if (lo < positions.length) return pm + positions[lo].pm;
		if (i === this.locals.length - 1) return pm + positions[positions.length - 1].pm;
		return this.pmFrom[i + 1] + this.locals[i + 1].positions()[0].pm;
	}

	/** D14: only a partial overlap of the base expands; a caret/full-base selection stays. */
	normalizeRange(from: number, to: number): SourceRange {
		this.checkSource(from); this.checkSource(to);
		if (from > to) [from, to] = [to, from];
		if (from === to) return { from, to };
		// Expansion can reach another base, so close transitively (no timers/state). A Ruby only
		// expands within its own line, so only the blocks between the two ends can take part.
		let changed: boolean;
		do {
			changed = false;
			const first = lastLessOrEqual(this.srcFrom, from), last = lastLessOrEqual(this.srcFrom, to);
			for (let i = first; i <= last; i++) for (const ruby of this.locals[i].inlines) {
				if (ruby.kind !== "ruby") continue;
				const src = this.srcFrom[i], baseFrom = ruby.baseFrom + src, baseTo = ruby.baseTo + src;
				if (from >= baseTo || to <= baseFrom || (from <= baseFrom && to >= baseTo)) continue;
				const nextFrom = Math.min(from, ruby.from + src), nextTo = Math.max(to, ruby.to + src);
				changed = changed || nextFrom !== from || nextTo !== to;
				from = nextFrom; to = nextTo;
			}
		} while (changed);
		return { from, to };
	}
	/** B14: only Ruby's inner first/last position is normalized outside the notation. */
	insertionAtPm(pos: number): number {
		const i = this.blockIndexAtPm(pos), src = this.srcFrom[i], pm = this.pmFrom[i];
		for (const ruby of this.locals[i].inlines) if (ruby.kind === "ruby") {
			if (pos === ruby.pmFrom + pm + 1) return ruby.from + src;
			if (pos === ruby.pmTo + pm - 1) return ruby.to + src;
		}
		return this.pmToSource(pos);
	}
}
