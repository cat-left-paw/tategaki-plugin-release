import type {
	HiddenRange,
	InlineRange,
	RenderSegment,
} from "./sot-render-types";

type RangeLike = { from: number; to: number };
type RangeOverlapFn = (from: number, to: number, ranges: RangeLike[]) => boolean;

export const collectUnderlineHtmlRanges = (
	absFrom: number,
	absTo: number,
	lineText: string,
	hidden: HiddenRange[],
	styles: InlineRange[],
	overlaps: RangeOverlapFn
): void => {
	if (!lineText.includes("<")) return;
	const lower = lineText.toLowerCase();
	let searchIndex = 0;

	const codeRanges = styles
		.filter((s) => s.className === "tategaki-md-code")
		.map((s) => ({ from: s.from, to: s.to }));

	while (searchIndex < lower.length) {
		const openIndex = lower.indexOf("<u>", searchIndex);
		if (openIndex < 0) break;
		const closeIndex = lower.indexOf("</u>", openIndex + 3);
		if (closeIndex < 0) break;

		const contentStart = openIndex + 3;
		const contentEnd = closeIndex;
		if (contentEnd <= contentStart) {
			searchIndex = closeIndex + 4;
			continue;
		}

		const absContentFrom = absFrom + contentStart;
		const absContentTo = absFrom + contentEnd;
		if (absContentFrom < absFrom || absContentTo > absTo) {
			searchIndex = closeIndex + 4;
			continue;
		}

		if (overlaps(absContentFrom, absContentTo, codeRanges)) {
			searchIndex = closeIndex + 4;
			continue;
		}

		hidden.push({
			from: absFrom + openIndex,
			to: absFrom + openIndex + 3,
		});
		hidden.push({
			from: absFrom + closeIndex,
			to: absFrom + closeIndex + 4,
		});
		styles.push({
			from: absContentFrom,
			to: absContentTo,
			className: "tategaki-md-underline",
		});

		searchIndex = closeIndex + 4;
	}
};

const splitSegmentsAtOffsets = (
	segments: RenderSegment[],
	offsets: number[]
): RenderSegment[] => {
	if (segments.length === 0 || offsets.length === 0) return segments;
	const sorted = Array.from(new Set(offsets)).sort((a, b) => a - b);
	const result: RenderSegment[] = [];

	for (const seg of segments) {
		const cuts = sorted.filter((offset) => offset > seg.from && offset < seg.to);
		if (cuts.length === 0) {
			result.push(seg);
			continue;
		}
		let cursor = seg.from;
		for (const cut of [...cuts, seg.to]) {
			if (cut <= cursor) continue;
			const start = cursor - seg.from;
			const end = cut - seg.from;
			const text = seg.text.slice(start, end);
			if (text.length > 0) {
				result.push({
					...seg,
					from: cursor,
					to: cut,
					text,
				});
			}
			cursor = cut;
		}
	}
	return result;
};

export const applyInlineRangesToSegments = (
	segments: RenderSegment[],
	ranges: InlineRange[]
): RenderSegment[] => {
	if (segments.length === 0 || ranges.length === 0) return segments;
	const offsets: number[] = [];
	for (const range of ranges) {
		offsets.push(range.from, range.to);
	}
	const split = splitSegmentsAtOffsets(segments, offsets);
	return split.map((seg) => {
		const classNames = [...seg.classNames];
		for (const range of ranges) {
			if (seg.from >= range.from && seg.to <= range.to) {
				if (!classNames.includes(range.className)) {
					classNames.push(range.className);
				}
			}
		}
		return {
			...seg,
			classNames,
		};
	});
};
