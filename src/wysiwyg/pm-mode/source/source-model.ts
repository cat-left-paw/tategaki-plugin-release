import { computeLineRanges, type LineRange } from "../../sot/line-ranges";
import { recomputeLineBlockKinds, type SoTLineModelState } from "../../sot/sot-line-model";
import { normalizeLinkLabel } from "./inline-links";
import { computeLineDecoration } from "./line-decoration";
import { buildLinePresentation, type LinePresentation } from "./line-segments";
import type { BlockLineDecoration, RenderSettings } from "./types";

export interface SourceModelOptions { collapsedHeadingLines: ReadonlySet<number>; settings: RenderSettings }
export type BlockKind = "line" | "frontmatter" | "widget" | "collapsedGap";
export interface SourceBlock {
	type: BlockKind;
	startLine: number;
	endLine: number;
	from: number;
	to: number;
	kind: string;
	markdown: string;
	decoration: BlockLineDecoration;
}
export interface SourceModel {
	source: string;
	lines: string[];
	lineRanges: LineRange[];
	lineModel: SoTLineModelState;
	presentations: LinePresentation[];
	decorations: BlockLineDecoration[];
	blocks: SourceBlock[];
	settings: RenderSettings;
}
export interface GroupingInput {
	source: string;
	lines: readonly string[];
	lineRanges: readonly LineRange[];
	lineModel: SoTLineModelState;
	settings: RenderSettings;
}
/** Decoration of one line under the settings (plain text view has none). Pure. */
export function decorateLine(input: GroupingInput, lineIndex: number): BlockLineDecoration {
	if (input.settings.plainTextView) return { classes: [], hidden: [], dataset: {}, styleVars: {} };
	return computeLineDecoration({ lineText: input.lines[lineIndex], lineIndex, lineFrom: input.lineRanges[lineIndex].from }, input.lineModel);
}
/**
 * The block that starts at line `i` (i must be a block start). Shared by the full build and
 * the incremental update (M1-3) so both group lines identically. `decorationAt` may be lazy.
 */
export function groupBlockAt(input: GroupingInput, i: number, decorationAt: (lineIndex: number) => BlockLineDecoration): SourceBlock {
	const { lines, lineRanges, lineModel, settings, source } = input;
	const decoration = decorationAt(i);
	let end = i, type: BlockKind = "line", kind = decoration.dataset.mdKind ?? "normal";
	if (lineModel.lineHeadingHiddenBy[i] !== null) {
		type = "collapsedGap"; kind = "collapsed";
		while (end + 1 < lines.length && lineModel.lineHeadingHiddenBy[end + 1] !== null) end++;
	} else if (!settings.plainTextView) {
		const classification = lineModel.lineBlockKinds[i];
		if (classification === "frontmatter-fence" || classification === "frontmatter") {
			type = "frontmatter"; kind = "frontmatter";
			// Each opening/closing fence belongs to this one frontmatter block.
			if (i === 0) {
				while (end + 1 < lines.length && lineModel.lineHeadingHiddenBy[end + 1] === null && ["frontmatter", "frontmatter-fence"].includes(lineModel.lineBlockKinds[end + 1])) {
					end++;
					if (lineModel.lineBlockKinds[end] === "frontmatter-fence") break;
				}
			}
		} else if (kind.endsWith("-widget")) {
			type = "widget"; kind = kind.slice(0, -7);
			const ends = kind === "math" ? lineModel.lineMathBlockEnd : kind === "callout" ? lineModel.lineCalloutBlockEnd : kind === "table" ? lineModel.lineTableBlockEnd : kind === "deflist" ? lineModel.lineDeflistBlockEnd : null;
			end = ends?.[i] ?? i;
		}
	}
	const from = lineRanges[i].from, to = lineRanges[end].to;
	return { type, startLine: i, endLine: end, from, to, kind, markdown: source.slice(from, to), decoration };
}

export function buildSourceModel(source: string, options: SourceModelOptions): SourceModel {
	const lines = source.split("\n");
	const lineRanges = computeLineRanges(source);
	const lineModel = recomputeLineBlockKinds({ lines, collapsedHeadingLines: new Set(options.collapsedHeadingLines), normalizeLinkLabel });
	const input: GroupingInput = { source, lines, lineRanges, lineModel, settings: options.settings };
	const decorations = lines.map((_, lineIndex) => decorateLine(input, lineIndex));
	const presentations = lines.map((lineText, lineIndex) => buildLinePresentation({ lineText, lineIndex, lineFrom: lineRanges[lineIndex].from }, lineModel, options.settings));
	const blocks: SourceBlock[] = [];
	for (let i = 0; i < lines.length;) {
		const block = groupBlockAt(input, i, lineIndex => decorations[lineIndex]);
		blocks.push(block);
		i = block.endLine + 1;
	}
	return { source, lines, lineRanges, lineModel, presentations, decorations, blocks, settings: { ...options.settings } };
}
