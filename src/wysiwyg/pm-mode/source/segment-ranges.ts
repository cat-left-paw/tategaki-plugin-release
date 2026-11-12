// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:2557-2572, 3953-4023, 4091-4173, 13895-13943, 14467-14482) @ d65c4c7 (2026-10-17).
// Local changes: Replace methods/this with exported pure functions.
// Local changes: Remove redundant non-null assertions on bounds-checked indexes (lint).
import type { HiddenRange, RenderSegment, RubyRange, LinkRange } from "./types";
import type { TcyRange } from "../../sot/sot-inline-tcy";
export function mergeRanges(ranges: HiddenRange[]): HiddenRange[] {
	if (ranges.length <= 1) return ranges;
	const sorted = ranges
		.slice()
		.sort((a, b) => a.from - b.from || a.to - b.to);
	const merged: HiddenRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (!last || range.from > last.to) {
			merged.push({ from: range.from, to: range.to });
			continue;
		}
		last.to = Math.max(last.to, range.to);
	}
	return merged;
}

export function applyHiddenRangesToSegments(
	segments: RenderSegment[],
	hiddenRanges: HiddenRange[],
): RenderSegment[] {
	if (segments.length === 0) return segments;
	if (hiddenRanges.length === 0) return segments;
	const hidden = mergeRanges(hiddenRanges);
	const result: RenderSegment[] = [];
	let hiddenIndex = 0;
	for (const seg of segments) {
		let cursor = seg.from;
		while (
			hiddenIndex < hidden.length &&
			hidden[hiddenIndex].to <= cursor
		) {
			hiddenIndex += 1;
		}
		let localHiddenIndex = hiddenIndex;
		while (localHiddenIndex < hidden.length) {
			const h = hidden[localHiddenIndex];
			if (h.from >= seg.to) break;
			const visibleTo = Math.min(seg.to, h.from);
			if (visibleTo > cursor) {
				const start = cursor - seg.from;
				const end = visibleTo - seg.from;
				const text = seg.text.slice(start, end);
				if (text.length > 0) {
					result.push({
						from: cursor,
						to: visibleTo,
						text,
						classNames: seg.classNames,
						href: seg.href,
						ruby: seg.ruby,
					});
				}
			}
			cursor = Math.max(cursor, h.to);
			if (cursor >= seg.to) break;
			localHiddenIndex += 1;
		}
		if (cursor < seg.to) {
			const start = cursor - seg.from;
			const text = seg.text.slice(start);
			if (text.length > 0) {
				result.push({
					from: cursor,
					to: seg.to,
					text,
					classNames: seg.classNames,
					href: seg.href,
					ruby: seg.ruby,
				});
			}
		}
	}
	return result;
}

export function rangeOverlapsAny(
	from: number,
	to: number,
	ranges: Array<{ from: number; to: number }>,
): boolean {
	for (const range of ranges) {
		if (to <= range.from) continue;
		if (from >= range.to) continue;
		return true;
	}
	return false;
}

export function applyRubyRangesToSegments(
	segments: RenderSegment[],
	rubyRanges: RubyRange[],
): RenderSegment[] {
	if (segments.length === 0 || rubyRanges.length === 0) return segments;
	const offsets: number[] = [];
	for (const range of rubyRanges) {
		offsets.push(range.from, range.to);
	}
	const split = splitSegmentsAtOffsets(segments, offsets);
	return split.map((seg) => {
		const ruby = rubyRanges.find(
			(range) => seg.from >= range.from && seg.to <= range.to,
		);
		if (!ruby) return seg;
		const classNames = seg.classNames.includes("tategaki-aozora-ruby")
			? seg.classNames
			: [...seg.classNames, "tategaki-aozora-ruby"];
		return {
			...seg,
			classNames,
			ruby: ruby.ruby,
			rubyNotationFrom: ruby.notationFrom,
			rubyNotationTo: ruby.notationTo,
		};
	});
}

export function applyTcyRangesToSegments(
	segments: RenderSegment[],
	tcyRanges: TcyRange[],
): RenderSegment[] {
	if (segments.length === 0 || tcyRanges.length === 0) return segments;
	const offsets: number[] = [];
	for (const range of tcyRanges) {
		offsets.push(range.from, range.to);
	}
	const split = splitSegmentsAtOffsets(segments, offsets);
	return split.map((seg) => {
		const tcy = tcyRanges.find(
			(range) => seg.from >= range.from && seg.to <= range.to,
		);
		if (!tcy) return seg;
		const classNames = seg.classNames.includes("tategaki-md-tcy")
			? seg.classNames
			: [...seg.classNames, "tategaki-md-tcy"];
		return {
			...seg,
			classNames,
		};
	});
}

export function applyLinkRangesToSegments(
	segments: RenderSegment[],
	links: LinkRange[],
): RenderSegment[] {
	if (segments.length === 0 || links.length === 0) return segments;
	const offsets: number[] = [];
	for (const range of links) {
		offsets.push(range.from, range.to);
	}
	const split = splitSegmentsAtOffsets(segments, offsets);
	return split.map((seg) => {
		const link = links.find(
			(range) => seg.from >= range.from && seg.to <= range.to,
		);
		if (!link) return seg;
		const hasLinkClass = seg.classNames.includes("tategaki-md-link");
		const isEmbedLike =
			seg.classNames.includes("tategaki-md-image") ||
			seg.classNames.includes("tategaki-md-embed");
		const classNames =
			hasLinkClass || isEmbedLike
				? seg.classNames
				: [...seg.classNames, "tategaki-md-link"];
		return {
			...seg,
			classNames,
			href: link.href,
		};
	});
}

export function splitSegmentsAtOffset(
	segments: RenderSegment[],
	globalOffset: number,
): { before: RenderSegment[]; after: RenderSegment[] } {
	const before: RenderSegment[] = [];
	const after: RenderSegment[] = [];
	for (const seg of segments) {
		if (seg.to <= globalOffset) {
			before.push(seg);
			continue;
		}
		if (seg.from >= globalOffset) {
			after.push(seg);
			continue;
		}
		// seg.from < globalOffset < seg.to
		const splitIndex = Math.max(
			0,
			Math.min(globalOffset - seg.from, seg.text.length),
		);
		const leftText = seg.text.slice(0, splitIndex);
		const rightText = seg.text.slice(splitIndex);
		if (leftText.length > 0) {
			before.push({
				from: seg.from,
				to: seg.from + leftText.length,
				text: leftText,
				classNames: seg.classNames,
				href: seg.href,
				ruby: seg.ruby,
				rubyNotationFrom: seg.rubyNotationFrom,
				rubyNotationTo: seg.rubyNotationTo,
			});
		}
		if (rightText.length > 0) {
			after.push({
				from: seg.from + leftText.length,
				to: seg.to,
				text: rightText,
				classNames: seg.classNames,
				href: seg.href,
				ruby: seg.ruby,
				rubyNotationFrom: seg.rubyNotationFrom,
				rubyNotationTo: seg.rubyNotationTo,
			});
		}
	}
	return { before, after };
}

export function splitSegmentsAtOffsets(
	segments: RenderSegment[],
	offsets: number[],
): RenderSegment[] {
	if (offsets.length === 0) return segments;
	const sorted = Array.from(new Set(offsets)).sort((a, b) => a - b);
	let remaining = segments;
	const result: RenderSegment[] = [];
	for (const offset of sorted) {
		const split = splitSegmentsAtOffset(remaining, offset);
		result.push(...split.before);
		remaining = split.after;
	}
	result.push(...remaining);
	return result;
}
