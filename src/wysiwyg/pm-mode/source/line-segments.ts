// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:4175-4652) @ d65c4c7 (2026-10-17).
// Local changes: Accept SourceLine/model/settings; remove editor, cache, source mode and syntax-tree paths.
// Local changes: Always combine fallback emphasis with collected link/image/footnote styles (M1 §9.4).
// Local changes: Disable Auto TCY; return inline math widgets alongside the unchanged segment shape.
// Local changes: Return Auto TCY candidates beside the segments (M1-4): the widest setting's ranges
// from V's own collector; the decoration keeps those valid for the current setting.
// Local changes (M1-7): A definition line (`[^1]: note`, `[注]: text`) shows its `[label]:` (and the blanks before it) as one plain run: none of the readers below looks at it, so
// `[注]` is not a link, `[^1]` not a footnote reference and no Auto TCY candidate lies in it. Everything after the label is read as before, as if it were a line of its own.
import type { SoTLineModelState } from "../../sot/sot-line-model";
import { collectRenderableTcyRangesForLine, type TcyRange } from "../../sot/sot-inline-tcy";
import { computeLineDecoration, definitionLabelRange } from "./line-decoration";
import { collectLinkRangesForLine } from "./inline-links";
import { collectInlineMathRangesForLine } from "./inline-math";
import { collectRubyRangesForLine } from "./inline-ruby";
import { buildInlineSegmentsReading } from "./inline-reading";
import { buildCodeLineSegments } from "./code-line";
import { applyHiddenRangesToSegments, applyLinkRangesToSegments, applyRubyRangesToSegments, applyTcyRangesToSegments, splitSegmentsAtOffsets } from "./segment-ranges";
import type { InlineRange, LinkRange, RubyRange, InlineWidget, RenderSegment, SourceLine, RenderSettings } from "./types";

/** Every setting's Auto TCY ranges are a subset of these (1-4 characters, letters included). */
const AUTO_TCY_WIDEST = { minDigits: 1, maxDigits: 4 };
export interface AutoTcyCandidate { from: number; to: number; text: string }
export interface LinePresentation { segments: RenderSegment[]; inlineWidgets: InlineWidget[]; autoTcy: AutoTcyCandidate[] }

export function buildLinePresentation(line: SourceLine, model: SoTLineModelState, settings: RenderSettings): LinePresentation {
	const { lineFrom: from, lineText: text, lineIndex } = line;
	const to = from + text.length;
	const plain: RenderSegment[] = text ? [{ from, to, text, classNames: ["tategaki-sot-run"] }] : [];
	if (settings.plainTextView || !text) return { segments: plain, inlineWidgets: [], autoTcy: [] };
	const decoration = computeLineDecoration(line, model);
	const hidden = decoration.hidden.map(range => ({ ...range }));
	const kind = model.lineBlockKinds[lineIndex];
	// M1-7: the readers see only what follows the `[label]:` of a definition line (`bodyFrom`, `bodyText`; the line itself otherwise).
	const label = definitionLabelRange(decoration.dataset), bodyStart = label?.to ?? 0, bodyFrom = from + bodyStart, bodyText = text.slice(bodyStart);
	const prefix: RenderSegment[] = bodyStart ? [{ from, to: bodyFrom, text: text.slice(0, bodyStart), classNames: ["tategaki-sot-run"] }] : [];
	if (kind === "code") {
		return { segments: applyHiddenRangesToSegments(buildCodeLineSegments(from, to, text, model.lineCodeLang[lineIndex] ?? null), hidden), inlineWidgets: [], autoTcy: [] };
	}
	if (kind === "code-fence" || kind === "frontmatter" || kind === "frontmatter-fence") {
		return { segments: applyHiddenRangesToSegments(plain, hidden), inlineWidgets: [], autoTcy: [] };
	}
	const styles: InlineRange[] = [], links: LinkRange[] = [], rubies: RubyRange[] = [], tcys: TcyRange[] = [];
	const linkHiddenFrom = hidden.length;
	collectLinkRangesForLine(bodyFrom, to, bodyText, hidden, styles, links, model);
	const linkHidden = hidden.slice(linkHiddenFrom);
	const inlineWidgets = collectInlineMathRangesForLine(bodyFrom, to, bodyText, hidden);
	collectRubyRangesForLine(bodyFrom, to, bodyText, hidden, styles, rubies, settings.enableRuby);
	collectRenderableTcyRangesForLine(bodyFrom, to, bodyText, hidden, styles, tcys, { enableAutoTcy: false, rubyRanges: rubies });
	// V's collector again on copies, with Auto TCY on at the widest setting: the explicit ranges
	// overlap themselves and are skipped, so the added ranges are exactly the Auto TCY ones.
	const probe = [...tcys];
	collectRenderableTcyRangesForLine(bodyFrom, to, bodyText, hidden.map(range => ({ ...range })), styles, probe, { enableAutoTcy: true, autoTcyDigitRange: AUTO_TCY_WIDEST, autoTcyDigitsOnly: false, rubyRanges: rubies });
	let contentFrom = 0;
	for (const range of [...decoration.hidden].sort((a, b) => a.from - b.from)) {
		if (range.from <= from + contentFrom && range.to > from + contentFrom) contentFrom = Math.min(text.length, range.to - from);
	}
	const bodyPlain: RenderSegment[] = bodyText ? [{ from: bodyFrom, to, text: bodyText, classNames: ["tategaki-sot-run"] }] : [];
	const reading = buildInlineSegmentsReading(bodyFrom, to, bodyText, { contentFrom: Math.max(0, contentFrom - bodyStart), hidden, linkHidden, styles, math: inlineWidgets }) ?? bodyPlain;
	// L9a: read the opening dollar before hiding math. Both lists are in source order.
	let formatIndex = 0;
	for (const widget of inlineWidgets) {
		const formatAt = widget.from;
		while (formatIndex < reading.length && reading[formatIndex].to <= formatAt) formatIndex++;
		const segment = reading[formatIndex];
		widget.formatClasses = segment && segment.from <= formatAt && formatAt < segment.to ? segment.classNames : [];
	}
	const visible = applyHiddenRangesToSegments(reading, hidden);
	const styled = splitSegmentsAtOffsets(visible, styles.flatMap(style => [style.from, style.to])).map(segment => ({
		...segment,
		classNames: Array.from(new Set([...segment.classNames, ...styles.filter(style => segment.from >= style.from && segment.to <= style.to).map(style => style.className)])),
	}));
	// Inline code does not block them: V's displayed path has no code style either (the same as the
	// explicit TCY above; see the M1-1 report on the syntax-tree path).
	const autoTcy = probe.slice(tcys.length).map(range => ({ from: range.from, to: range.to, text: text.slice(range.from - from, range.to - from) }));
	return { segments: [...prefix, ...applyTcyRangesToSegments(applyRubyRangesToSegments(applyLinkRangesToSegments(styled, links), rubies), tcys)], inlineWidgets, autoTcy };
}

export function buildLineSegments(line: SourceLine, model: SoTLineModelState, settings: RenderSettings): RenderSegment[] {
	return buildLinePresentation(line, model, settings).segments;
}
