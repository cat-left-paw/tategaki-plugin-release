import {
	collectAutoTcyRanges,
	createAozoraTcyRegExp,
	isValidAozoraTcyBody,
} from "../../shared/aozora-tcy";

export type SoTRange = {
	from: number;
	to: number;
};

export type SoTInlineStyleRange = {
	from: number;
	to: number;
	className: string;
};

export type SoTClearableSpan = {
	from: number;
	to: number;
	markers: SoTRange[];
};

export type TcyRange = SoTRange;

export type SoTCollectTcyOptions = {
	enableAutoTcy?: boolean;
	rubyRanges?: SoTRange[];
};

export function collectClearableTcySpansForLine(
	absFrom: number,
	lineText: string,
): SoTClearableSpan[] {
	const spans: SoTClearableSpan[] = [];
	const regex = createAozoraTcyRegExp();
	for (const match of lineText.matchAll(regex)) {
		const full = match[0] ?? "";
		const start = match.index ?? -1;
		const body = match.groups?.body ?? "";
		if (!full || start < 0 || !isValidAozoraTcyBody(body)) continue;

		const openIndex = full.indexOf("｟");
		const closeIndex = full.lastIndexOf("｠");
		if (openIndex < 0 || closeIndex <= openIndex) continue;

		const bodyStartRel = start + openIndex + 1;
		const bodyEndRel = bodyStartRel + body.length;
		if (bodyEndRel <= bodyStartRel) continue;

		spans.push({
			from: absFrom + bodyStartRel,
			to: absFrom + bodyEndRel,
			markers: [
				{
					from: absFrom + start + openIndex,
					to: absFrom + start + openIndex + 1,
				},
				{
					from: absFrom + start + closeIndex,
					to: absFrom + start + closeIndex + 1,
				},
			],
		});
	}
	return spans;
}

export function collectTcyRangesForLine(
	absFrom: number,
	absTo: number,
	lineText: string,
	hidden: SoTRange[],
	styles: SoTInlineStyleRange[],
	tcyRanges: TcyRange[],
): void {
	if (!lineText.includes("｟")) return;

	const codeRanges = styles
		.filter((s) => s.className === "tategaki-md-code")
		.map((s) => ({ from: s.from, to: s.to }));
	const regex = createAozoraTcyRegExp();
	for (const match of lineText.matchAll(regex)) {
		const full = match[0] ?? "";
		const start = match.index ?? -1;
		const body = match.groups?.body ?? "";
		if (!full || start < 0 || !isValidAozoraTcyBody(body)) continue;

		const openIndex = full.indexOf("｟");
		const closeIndex = full.lastIndexOf("｠");
		if (openIndex < 0 || closeIndex <= openIndex) continue;
		const absBodyFrom = absFrom + start + openIndex + 1;
		const absBodyTo = absBodyFrom + body.length;
		if (absBodyFrom >= absBodyTo) continue;
		if (absBodyFrom < absFrom || absBodyTo > absTo) continue;
		if (rangeOverlapsAny(absBodyFrom, absBodyTo, codeRanges)) continue;
		if (rangeOverlapsAny(absBodyFrom, absBodyTo, hidden)) continue;
		if (rangeOverlapsAny(absBodyFrom, absBodyTo, tcyRanges)) continue;

		hidden.push({
			from: absFrom + start + openIndex,
			to: absFrom + start + openIndex + 1,
		});
		hidden.push({
			from: absFrom + start + closeIndex,
			to: absFrom + start + closeIndex + 1,
		});
		tcyRanges.push({ from: absBodyFrom, to: absBodyTo });
	}
}

export function collectRenderableTcyRangesForLine(
	absFrom: number,
	absTo: number,
	lineText: string,
	hidden: SoTRange[],
	styles: SoTInlineStyleRange[],
	tcyRanges: TcyRange[],
	options?: SoTCollectTcyOptions,
): void {
	collectTcyRangesForLine(absFrom, absTo, lineText, hidden, styles, tcyRanges);
	if (options?.enableAutoTcy !== true) return;
	const rubyRanges = options.rubyRanges ?? [];
	collectAutoTcyRangesForLine(
		absFrom,
		absTo,
		lineText,
		hidden,
		styles,
		tcyRanges,
		rubyRanges,
	);
}

export function findTcyMatchForSelection(
	lineFrom: number,
	lineTo: number,
	selectionFrom: number,
	selectionTo: number,
	lineText: string,
): { rangeFrom: number; rangeTo: number; bodyText: string } | null {
	const regex = createAozoraTcyRegExp();
	for (const match of lineText.matchAll(regex)) {
		const full = match[0] ?? "";
		const start = match.index ?? -1;
		const body = match.groups?.body ?? "";
		if (!full || start < 0 || !isValidAozoraTcyBody(body)) continue;

		const openIndex = full.indexOf("｟");
		const closeIndex = full.lastIndexOf("｠");
		if (openIndex < 0 || closeIndex <= openIndex) continue;

		const absBodyFrom = lineFrom + start + openIndex + 1;
		const absBodyTo = absBodyFrom + body.length;
		if (absBodyFrom >= absBodyTo) continue;
		if (absBodyFrom < lineFrom || absBodyTo > lineTo) continue;

		const intersects = selectionTo > absBodyFrom && selectionFrom < absBodyTo;
		if (!intersects) continue;

		const rangeFrom = lineFrom + start;
		const rangeTo = lineFrom + start + full.length;
		return { rangeFrom, rangeTo, bodyText: body };
	}
	return null;
}

function rangeOverlapsAny(
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

function collectAutoTcyRangesForLine(
	absFrom: number,
	absTo: number,
	lineText: string,
	hidden: SoTRange[],
	styles: SoTInlineStyleRange[],
	tcyRanges: TcyRange[],
	rubyRanges: SoTRange[],
): void {
	const blockedStyleRanges = styles
		.filter((style) =>
			style.className === "tategaki-md-code" ||
			style.className === "tategaki-md-link" ||
			style.className === "tategaki-md-image" ||
			style.className === "tategaki-md-embed" ||
			style.className === "tategaki-md-math",
		)
		.map((style) => ({ from: style.from, to: style.to }));
	const autoRanges = collectAutoTcyRanges(lineText);
	for (const range of autoRanges) {
		const from = absFrom + range.from;
		const to = absFrom + range.to;
		if (from >= to) continue;
		if (from < absFrom || to > absTo) continue;
		if (rangeOverlapsAny(from, to, hidden)) continue;
		if (rangeOverlapsAny(from, to, blockedStyleRanges)) continue;
		if (rangeOverlapsAny(from, to, rubyRanges)) continue;
		if (rangeOverlapsAny(from, to, tcyRanges)) continue;
		tcyRanges.push({ from, to });
	}
}
