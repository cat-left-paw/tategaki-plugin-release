import { Fragment, type PMNode, type Mark } from "./prosemirror";
import { pmModeSchema as schema } from "./schema";
import { buildSourceModel, type SourceModelOptions, type SourceModel, type SourceBlock } from "../source/source-model";
import { PmModeSourceMap, type AutoTcyMapping, type BlockMapping, type InlineMapping, type VisibleRun } from "../source/source-map";
import type { RenderSegment } from "../source/types";

const classMarks: Record<string, string> = { "tategaki-md-strong": "strong", "tategaki-md-em": "em", "tategaki-md-code": "code", "tategaki-md-strike": "strike", "tategaki-md-highlight": "highlight" };
/** Schema mark order: strong, em, code, strike, highlight. */
const MATH_FORMAT_CLASSES = ["tategaki-md-strong", "tategaki-md-em", "tategaki-md-code", "tategaki-md-strike", "tategaki-md-highlight"] as const;
function marksFor(segment: RenderSegment, model: SourceModel, container?: string): Mark[] {
	const marks: Mark[] = [];
	const classes: string[] = [];
	for (const name of segment.classNames) {
		if (classMarks[name]) marks.push(schema.marks[classMarks[name]].create());
		else if (name !== "tategaki-md-link" && !(container === "tcy" && name === "tategaki-md-tcy") && !(container === "ruby" && name === "tategaki-aozora-ruby")) classes.push(name);
	}
	if (segment.href !== undefined) marks.push(schema.marks.link.create({ href: segment.href }));
	if (classes.length) {
		const footnote = classes.includes("tategaki-md-footnote-ref");
		marks.push(schema.marks.mdClass.create({ classes, footnoteId: footnote ? segment.text : null,
			footnoteNumber: footnote ? model.lineModel.footnoteDefinitionOrder.get(segment.text) ?? null : null,
			tooltip: footnote ? model.lineModel.footnoteDefinitionText.get(segment.text) ?? null : null }));
	}
	return marks;
}

/** Shares equal nodes; `buildBlockNode` passes every built block through one. */
export interface NodeInterner { intern(node: PMNode): PMNode }
/** Build-local interning; JSON includes every attr/mark and is independent of source positions. */
export class NodePool implements NodeInterner {
	private readonly nodes = new Map<string, PMNode>();
	intern(node: PMNode): PMNode {
		if (node.childCount) {
			const children: PMNode[] = [];
			node.forEach(child => children.push(this.intern(child)));
			node = node.copy(Fragment.fromArray(children));
		}
		const key = JSON.stringify(node.toJSON());
		const previous = this.nodes.get(key);
		if (previous) return previous;
		this.nodes.set(key, node);
		return node;
	}
}
export interface BuiltBlock { node: PMNode; mapping: BlockMapping }
/** pmFrom is a projection coordinate, never a node attr for a line (preserves sharing). */
export function buildBlockNode(block: SourceBlock, model: SourceModel, pmFrom = 0, pool: NodeInterner = new NodePool()): BuiltBlock {
	const runs: VisibleRun[] = [], inlines: InlineMapping[] = [], autoTcy: AutoTcyMapping[] = [];
	let node: PMNode;
	if (block.type !== "line") {
		const dataset = block.decoration.dataset;
		node = schema.nodes[block.type].create({ lineCount: block.endLine - block.startLine + 1, ...(block.type === "widget" ? { classes: block.decoration.classes } : {}),
			markdown: block.markdown, kind: block.kind, imageSrc: dataset.imageSrc ?? null, imageAlt: dataset.imageAlt ?? null,
			imageWidth: dataset.imageWidth ?? null, embedTarget: dataset.embedTarget ?? null });
	} else {
		const { segments, inlineWidgets, autoTcy: candidates } = model.presentations[block.startLine];
		const content: PMNode[] = [];
		let pos = pmFrom + 1, i = 0, w = 0;
		while (i < segments.length || w < inlineWidgets.length) {
			const widget = inlineWidgets[w];
			if (widget && (i === segments.length || widget.from <= segments[i].from)) {
				const formats = MATH_FORMAT_CLASSES.filter(name => widget.formatClasses?.includes(name)).map(name => classMarks[name]).join(" ");
				content.push(schema.nodes.inlineMath.create({ source: widget.source, formats }));
				inlines.push({ kind: "inlineMath", from: widget.from, to: widget.to, baseFrom: widget.from, baseTo: widget.to, pmFrom: pos, pmTo: pos + 1 });
				pos++; w++; continue;
			}
			const segment = segments[i];
			// Both containers require text*: on overlap Ruby owns the node; the TCY
			// class remains on the base text (see the M1-1 report, pending review).
			const kind = segment.ruby !== undefined ? "ruby" : segment.classNames.includes("tategaki-md-tcy") ? "tcy" : undefined;
			if (!kind) {
				content.push(schema.text(segment.text, marksFor(segment, model)));
				runs.push({ from: segment.from, to: segment.to, pmFrom: pos, pmTo: pos + segment.text.length });
				pos += segment.text.length; i++; continue;
			}
			const group: RenderSegment[] = [segment];
			while (i + group.length < segments.length) {
				const next = segments[i + group.length], prev = group[group.length - 1];
				if (kind === "ruby" ? next.rubyNotationFrom !== segment.rubyNotationFrom || next.ruby !== segment.ruby : next.ruby !== undefined || !next.classNames.includes("tategaki-md-tcy") || next.from !== prev.to) break;
				group.push(next);
			}
			const before = pos++;
			const children = group.map(part => {
				runs.push({ from: part.from, to: part.to, pmFrom: pos, pmTo: pos + part.text.length });
				pos += part.text.length;
				return schema.text(part.text, marksFor(part, model, kind));
			});
			content.push(schema.nodes[kind].create(kind === "ruby" ? { reading: segment.ruby } : null, children));
			pos++;
			const notationFrom = kind === "ruby" ? segment.rubyNotationFrom : segment.from - 1;
			const notationTo = kind === "ruby" ? segment.rubyNotationTo : group[group.length - 1].to + 1;
			if (notationFrom === undefined || notationTo === undefined) throw new Error("Ruby segment lacks notation identity");
			const baseFrom = kind === "ruby" ? notationFrom + (/^[|｜]/.test(model.source.slice(notationFrom)) ? 1 : 0) : segment.from;
			const baseTo = kind === "ruby" ? model.source.indexOf("《", baseFrom) : group[group.length - 1].to;
			inlines.push({ kind, from: notationFrom, to: notationTo, baseFrom, baseTo, pmFrom: before, pmTo: pos });
			i += group.length;
		}
		node = schema.nodes.line.create({ kind: block.kind, classes: block.decoration.classes, dataset: block.decoration.dataset, styleVars: block.decoration.styleVars }, content);
		// A candidate never overlaps hidden text, Ruby or TCY, so it lies in one visible run.
		for (const candidate of candidates) {
			const run = runs.find(r => r.from <= candidate.from && candidate.to <= r.to);
			if (run) autoTcy.push({ pmFrom: run.pmFrom + candidate.from - run.from, pmTo: run.pmFrom + candidate.to - run.from, text: candidate.text });
		}
	}
	node = pool.intern(node);
	return { node, mapping: { ...block, pmFrom, pmTo: pmFrom + node.nodeSize, runs, inlines, autoTcy } };
}

export function buildPmModeDoc(source: string, options: SourceModelOptions): { doc: PMNode; sourceMap: PmModeSourceMap; sourceModel: SourceModel } {
	const sourceModel = buildSourceModel(source, options), pool = new NodePool();
	let pmFrom = 0;
	const mappings: BlockMapping[] = [], nodes: PMNode[] = [];
	for (const block of sourceModel.blocks) {
		const built = buildBlockNode(block, sourceModel, pmFrom, pool);
		nodes.push(built.node); mappings.push(built.mapping); pmFrom = built.mapping.pmTo;
	}
	return { doc: schema.nodes.doc.create(null, nodes), sourceMap: PmModeSourceMap.fromBlocks(source, mappings), sourceModel };
}
