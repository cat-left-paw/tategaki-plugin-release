export type LineRange = {
	from: number;
	to: number;
};

export function computeLineRanges(text: string): LineRange[] {
	const ranges: LineRange[] = [];
	let offset = 0;
	for (const line of text.split("\n")) {
		const from = offset;
		const to = offset + line.length;
		ranges.push({ from, to });
		offset = to + 1;
	}
	return ranges;
}

