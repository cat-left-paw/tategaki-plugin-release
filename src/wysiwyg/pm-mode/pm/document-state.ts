import { Fragment, type PMNode } from "./prosemirror";
import { pmModeSchema as schema } from "./schema";
import { buildBlockNode, type NodeInterner } from "./doc-builder";
import { NodeIndex } from "./node-index";
import { recomputeLineBlockKinds, type SoTLineModelState } from "../../sot/sot-line-model";
import type { LineRange } from "../../sot/line-ranges";
import { normalizeLinkLabel } from "../source/inline-links";
import { buildLinePresentation, type LinePresentation } from "../source/line-segments";
import { decorateLine, groupBlockAt, type GroupingInput, type SourceBlock, type SourceModel, type SourceModelOptions } from "../source/source-model";
import { LocalBlockMap, PmModeSourceMap } from "../source/source-map";
import type { BlockLineDecoration } from "../source/types";

/** One top-level block: its PM node and its position-free source table. */
export interface DocumentBlock { readonly node: PMNode; readonly local: LocalBlockMap }

export interface DocumentUpdateStats {
	readonly prefixLines: number;
	readonly suffixLines: number;
	readonly blocksRebuilt: number;
	readonly blocksReused: number;
	readonly fullReason: string | null;
}
/** The replacement of `from..to` in the old PM doc by `nodes` (nothing when unchanged). */
export interface DocumentUpdate {
	readonly state: PmModeDocumentState;
	readonly kind: "unchanged" | "partial" | "full";
	readonly from: number;
	readonly to: number;
	readonly nodes: readonly PMNode[];
	/** Index, in the new state, of the first block in `nodes`. */
	readonly firstBlock: number;
	readonly stats: DocumentUpdateStats;
}

function rangesFromLines(lines: readonly string[]): LineRange[] {
	const ranges: LineRange[] = [];
	let offset = 0;
	for (const line of lines) { ranges.push({ from: offset, to: offset + line.length }); offset += line.length + 1; }
	return ranges;
}
function sameSettings(a: SourceModelOptions, b: SourceModelOptions): boolean {
	return a.settings.enableRuby === b.settings.enableRuby && a.settings.plainTextView === b.settings.plainTextView;
}
function sameMap(a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>): boolean {
	if (a.size !== b.size) return false;
	for (const [key, value] of a) if (!b.has(key) || b.get(key) !== value) return false;
	return true;
}
/** Document-wide state that any line can read (footnote numbers and texts, link references). */
function sameGlobalContext(a: SoTLineModelState, b: SoTLineModelState): boolean {
	return sameMap(a.footnoteDefinitionOrder, b.footnoteDefinitionOrder) && sameMap(a.footnoteDefinitionText, b.footnoteDefinitionText) && sameMap(a.linkReferenceMap, b.linkReferenceMap);
}
const relative = (value: number | null, index: number) => value === null ? null : value - index;
/**
 * Whether line `i` of the old document renders exactly like line `j` of the new one: the same
 * text and the same per-line classification, with block references compared relative to the
 * line (so a line that only moved keeps its signature). Covers every field that the copied
 * decoration and segment code reads, plus the grouping into blocks.
 */
function sameLine(oldLines: readonly string[], a: SoTLineModelState, i: number, newLines: readonly string[], b: SoTLineModelState, j: number): boolean {
	if (oldLines[i] !== newLines[j]) return false;
	if (a.lineBlockKinds[i] !== b.lineBlockKinds[j] || a.lineCodeFenceInfo[i] !== b.lineCodeFenceInfo[j] || a.lineCodeLang[i] !== b.lineCodeLang[j]
		|| a.lineCodeBlockPart[i] !== b.lineCodeBlockPart[j] || a.lineCalloutType[i] !== b.lineCalloutType[j]
		|| a.lineCalloutIsTitle[i] !== b.lineCalloutIsTitle[j] || a.lineTableIsHeader[i] !== b.lineTableIsHeader[j]) return false;
	if (relative(a.lineMathBlockStart[i], i) !== relative(b.lineMathBlockStart[j], j) || relative(a.lineMathBlockEnd[i], i) !== relative(b.lineMathBlockEnd[j], j)
		|| relative(a.lineCalloutBlockStart[i], i) !== relative(b.lineCalloutBlockStart[j], j) || relative(a.lineCalloutBlockEnd[i], i) !== relative(b.lineCalloutBlockEnd[j], j)
		|| relative(a.lineTableBlockStart[i], i) !== relative(b.lineTableBlockStart[j], j) || relative(a.lineTableBlockEnd[i], i) !== relative(b.lineTableBlockEnd[j], j)
		|| relative(a.lineDeflistBlockStart[i], i) !== relative(b.lineDeflistBlockStart[j], j) || relative(a.lineDeflistBlockEnd[i], i) !== relative(b.lineDeflistBlockEnd[j], j)
		|| relative(a.lineHeadingHiddenBy[i], i) !== relative(b.lineHeadingHiddenBy[j], j)) return false;
	// Only "has a section below" is shown (data-heading-foldable); the exact end is not.
	const endA = a.lineHeadingSectionEnd[i], endB = b.lineHeadingSectionEnd[j];
	return (endA !== null && endA > i) === (endB !== null && endB > j) && a.collapsedHeadingLines.has(i) === b.collapsedHeadingLines.has(j);
}
function lastLessOrEqual(values: readonly number[], value: number): number {
	let lo = 0, hi = values.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (values[mid] <= value) lo = mid; else hi = mid - 1;
	}
	return lo;
}
function isEmptyLine(node: PMNode): boolean { return node.childCount === 0 && node.type === schema.nodes.line; }
/** The distinct empty-line nodes the document uses (only these are kept, M1-3 review R4). */
function emptyLinesOf(blocks: readonly DocumentBlock[]): Set<PMNode> {
	const set = new Set<PMNode>();
	for (const block of blocks) if (isEmptyLine(block.node)) set.add(block.node);
	return set;
}

/** Builds block nodes for a run of groups, with lazy decorations and presentations. */
class RegionBuilder {
	private readonly decorations = new Map<number, BlockLineDecoration>();
	private readonly presentations: LinePresentation[] = [];
	readonly input: GroupingInput;
	constructor(source: string, lines: readonly string[], lineRanges: readonly LineRange[], lineModel: SoTLineModelState, private readonly options: SourceModelOptions) {
		this.input = { source, lines, lineRanges, lineModel, settings: options.settings };
	}
	group(line: number): SourceBlock {
		return groupBlockAt(this.input, line, i => {
			let decoration = this.decorations.get(i);
			if (!decoration) this.decorations.set(i, decoration = decorateLine(this.input, i));
			return decoration;
		});
	}
	/** Node and position-free table of one group; `pmFrom` is only the builder's projection base. */
	build(block: SourceBlock, pool: NodeInterner): DocumentBlock {
		const { lines, lineRanges, lineModel, source } = this.input;
		if (block.type === "line" && !this.presentations[block.startLine]) {
			this.presentations[block.startLine] = buildLinePresentation({ lineIndex: block.startLine, lineFrom: lineRanges[block.startLine].from, lineText: lines[block.startLine] }, lineModel, this.options.settings);
		}
		const model = { source, lines, lineRanges, lineModel, presentations: this.presentations, decorations: [], blocks: [], settings: this.options.settings } as unknown as SourceModel;
		const built = buildBlockNode(block, model, 0, pool);
		return { node: built.node, local: LocalBlockMap.fromAbsolute(built.mapping) };
	}
}

/**
 * The PM document of the new mode and its source map, kept between CM changes (M1-3). An update
 * compares the old and new lines, rebuilds only the blocks around the change, and keeps every
 * other block's node and source table as the same object (本設計 §5, §5.3). The result is always
 * the same as building the whole document again; tests check this.
 */
export class PmModeDocumentState {
	private constructor(
		readonly source: string,
		readonly lines: readonly string[],
		readonly lineRanges: readonly LineRange[],
		readonly lineModel: SoTLineModelState,
		readonly options: SourceModelOptions,
		readonly blocks: readonly DocumentBlock[],
		readonly blockLine: readonly number[],
		readonly doc: PMNode,
		readonly sourceMap: PmModeSourceMap,
		/** The document's empty-line nodes, so a new equal empty line takes the same object. */
		private readonly emptyLines: ReadonlySet<PMNode>,
	) {}

	static build(source: string, options: SourceModelOptions): PmModeDocumentState {
		return PmModeDocumentState.buildWith(source, options, null);
	}

	/**
	 * The whole text, built again. Equal new nodes (at any depth) share one object; with
	 * `previous`, a new node equal to an old one, at any depth, takes the old object (§5.3).
	 */
	private static buildWith(source: string, options: SourceModelOptions, previous: PmModeDocumentState | null): PmModeDocumentState {
		const lines = source.split("\n"), lineRanges = rangesFromLines(lines);
		const lineModel = recomputeLineBlockKinds({ lines, collapsedHeadingLines: new Set(options.collapsedHeadingLines), normalizeLinkLabel });
		const region = new RegionBuilder(source, lines, lineRanges, lineModel, options);
		const index = new NodeIndex();
		if (previous) for (const block of previous.blocks) index.addDeep(block.node);
		const blocks: DocumentBlock[] = [], blockLine: number[] = [];
		for (let line = 0; line < lines.length;) {
			const group = region.group(line);
			blocks.push(region.build(group, index));
			blockLine.push(line);
			line = group.endLine + 1;
		}
		return PmModeDocumentState.assemble(source, lines, lineRanges, lineModel, options, blocks, blockLine);
	}

	private static assemble(source: string, lines: readonly string[], lineRanges: readonly LineRange[], lineModel: SoTLineModelState, options: SourceModelOptions,
		blocks: readonly DocumentBlock[], blockLine: readonly number[], pmFromHint?: number[]): PmModeDocumentState {
		const srcFrom = blockLine.map(line => lineRanges[line].from);
		let pmFrom = pmFromHint;
		if (!pmFrom) {
			pmFrom = [];
			let pos = 0;
			for (const block of blocks) { pmFrom.push(pos); pos += block.node.nodeSize; }
		}
		const doc = schema.nodes.doc.create(null, Fragment.fromArray(blocks.map(block => block.node)));
		const sourceMap = PmModeSourceMap.fromParts(source, blocks.map(block => block.local), srcFrom, pmFrom, blockLine);
		return new PmModeDocumentState(source, lines, lineRanges, lineModel, { collapsedHeadingLines: new Set(options.collapsedHeadingLines), settings: { ...options.settings } }, blocks, blockLine, doc, sourceMap, emptyLinesOf(blocks));
	}

	private full(source: string, options: SourceModelOptions, reason: string): DocumentUpdate {
		const state = PmModeDocumentState.buildWith(source, options, this);
		const oldSet = new Set(this.blocks.map(block => block.node));
		const reused = state.blocks.filter(block => oldSet.has(block.node)).length;
		return { state, kind: "full", from: 0, to: this.doc.content.size, nodes: state.blocks.map(block => block.node), firstBlock: 0,
			stats: { prefixLines: 0, suffixLines: 0, blocksRebuilt: state.blocks.length - reused, blocksReused: reused, fullReason: reason } };
	}

	update(source: string, options: SourceModelOptions): DocumentUpdate {
		const sameCollapsed = options.collapsedHeadingLines.size === this.options.collapsedHeadingLines.size
			&& [...options.collapsedHeadingLines].every(line => this.options.collapsedHeadingLines.has(line));
		const unchanged = (): DocumentUpdate => ({ state: this, kind: "unchanged", from: 0, to: 0, nodes: [], firstBlock: 0, stats: { prefixLines: this.lines.length, suffixLines: 0, blocksRebuilt: 0, blocksReused: this.blocks.length, fullReason: null } });
		if (source === this.source && sameCollapsed && sameSettings(options, this.options)) return unchanged();
		if (!sameSettings(options, this.options)) return this.full(source, options, "settings");
		const lines = source.split("\n"), lineRanges = rangesFromLines(lines);
		const lineModel = recomputeLineBlockKinds({ lines, collapsedHeadingLines: new Set(options.collapsedHeadingLines), normalizeLinkLabel });
		if (!sameGlobalContext(this.lineModel, lineModel)) return this.full(source, options, "global-context");
		const n0 = this.lines.length, n1 = lines.length;
		let prefix = 0;
		while (prefix < n0 && prefix < n1 && sameLine(this.lines, this.lineModel, prefix, lines, lineModel, prefix)) prefix++;
		if (prefix === n0 && prefix === n1) {
			// Same lines (possible only when a requested collapse was pruned and changed nothing).
			const state = new PmModeDocumentState(source, lines, lineRanges, lineModel, { collapsedHeadingLines: new Set(options.collapsedHeadingLines), settings: { ...options.settings } },
				this.blocks, this.blockLine, this.doc, this.sourceMap, this.emptyLines);
			return { ...unchanged(), state };
		}
		let suffix = 0;
		while (suffix < n0 - prefix && suffix < n1 - prefix && sameLine(this.lines, this.lineModel, n0 - 1 - suffix, lines, lineModel, n1 - 1 - suffix)) suffix++;
		const delta = n1 - n0;
		const region = new RegionBuilder(source, lines, lineRanges, lineModel, options);

		// The first block to rebuild: the old block holding the first changed line, moved back while
		// the block before it would now group differently (e.g. a hidden run that now continues).
		let first = lastLessOrEqual(this.blockLine, Math.min(prefix, n0 - 1));
		while (first > 0 && region.group(this.blockLine[first - 1]).endLine !== this.blockLine[first] - 1) first--;
		const startLine = this.blockLine[first];

		// Group forward until a new block in the unchanged suffix lines up with an old block.
		const groups: SourceBlock[] = [];
		let end = this.blocks.length;
		for (let line = startLine; line < n1;) {
			const group = region.group(line);
			if (line >= n1 - suffix) {
				const oldLine = line - delta, ob = lastLessOrEqual(this.blockLine, oldLine);
				const oldBlock = this.blocks[ob];
				if (this.blockLine[ob] === oldLine && oldBlock.local.type === group.type && oldBlock.local.kind === group.kind
					&& oldBlock.local.lineCount === group.endLine - group.startLine + 1) { end = ob; break; }
			}
			groups.push(group);
			line = group.endLine + 1;
		}

		// Build the region (§5.3). A new node equal to a node of the replaced old blocks, at any
		// depth (a line, a text inside a changed Ruby), takes the old object; equal new nodes share
		// one object; an empty line takes the document's object. The index keeps matching linear
		// for a region over the whole text, even with many nodes of the same text (review R1 / R2).
		const index = new NodeIndex();
		for (const node of this.emptyLines) index.add(node);
		for (let i = first; i < end; i++) index.addDeep(this.blocks[i].node);
		const rebuilt = groups.map(group => region.build(group, index));

		const blocks = [...this.blocks.slice(0, first), ...rebuilt, ...this.blocks.slice(end)];
		const blockLine = [...this.blockLine.slice(0, first), ...groups.map(group => group.startLine), ...this.blockLine.slice(end).map(line => line + delta)];
		const oldPmFrom = this.sourceMap.pmFrom, regionFrom = oldPmFrom[first];
		const regionTo = end < this.blocks.length ? oldPmFrom[end] : this.doc.content.size;
		const pmFrom: number[] = oldPmFrom.slice(0, first);
		let pos = regionFrom;
		for (const block of rebuilt) { pmFrom.push(pos); pos += block.node.nodeSize; }
		const pmDelta = pos - regionTo;
		for (let i = end; i < this.blocks.length; i++) pmFrom.push(oldPmFrom[i] + pmDelta);
		const state = PmModeDocumentState.assemble(source, lines, lineRanges, lineModel, options, blocks, blockLine, pmFrom);
		return { state, kind: "partial", from: regionFrom, to: regionTo, nodes: rebuilt.map(block => block.node), firstBlock: first,
			stats: { prefixLines: prefix, suffixLines: suffix, blocksRebuilt: rebuilt.length, blocksReused: first + (this.blocks.length - end), fullReason: null } };
	}
}
