import { createAozoraRubyRegExp } from "../../shared/aozora-ruby";

export type SoTAozoraRubyMatch = {
	rangeFrom: number;
	rangeTo: number;
	baseText: string;
	hasDelimiter: boolean;
};

export function findSoTAozoraRubyMatchForSelection(
	lineFrom: number,
	lineTo: number,
	selectionFrom: number,
	selectionTo: number,
	lineText: string
): SoTAozoraRubyMatch | null {
	const regex = createAozoraRubyRegExp();
	for (const match of lineText.matchAll(regex)) {
		const full = match[0] ?? "";
		const start = match.index ?? -1;
		if (!full || start < 0) continue;

		const openIndex = full.indexOf("《");
		const closeIndex = full.lastIndexOf("》");
		if (openIndex < 0 || closeIndex <= openIndex) continue;

		const hasDelimiter = full.startsWith("|") || full.startsWith("｜");
		const baseStartRel = hasDelimiter ? 1 : 0;
		const baseEndRel = openIndex;
		const baseText = full.slice(baseStartRel, baseEndRel);
		if (!baseText) continue;

		const absBaseFrom = lineFrom + start + baseStartRel;
		const absBaseTo = lineFrom + start + baseEndRel;
		if (absBaseFrom >= absBaseTo) continue;
		if (absBaseFrom < lineFrom || absBaseTo > lineTo) continue;

		const intersects = selectionTo > absBaseFrom && selectionFrom < absBaseTo;
		if (!intersects) continue;

		return {
			rangeFrom: lineFrom + start,
			rangeTo: lineFrom + start + full.length,
			baseText,
			hasDelimiter,
		};
	}

	return null;
}

export function buildSoTAozoraRubyText(
	baseText: string,
	ruby: string,
	isDot: boolean,
	hasDelimiter = true
): string {
	if (isDot) {
		const emphasisChar = ruby.trim() || "・";
		return Array.from(baseText)
			.map((char) => `｜${char}《${emphasisChar}》`)
			.join("");
	}

	const delimiter = hasDelimiter ? "｜" : "";
	return `${delimiter}${baseText}《${ruby}》`;
}
