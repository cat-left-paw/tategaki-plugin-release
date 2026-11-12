// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:4025-4089) @ d65c4c7 (2026-10-17).
// Local changes: Pass enableRuby explicitly; retain the existing overlap rules.
import { createAozoraRubyRegExp } from "../../../shared/aozora-ruby";
import { rangeOverlapsAny } from "./segment-ranges";
import type { HiddenRange, InlineRange, RubyRange } from "./types";
export function collectRubyRangesForLine(
	absFrom: number,
	absTo: number,
	lineText: string,
	hidden: HiddenRange[],
	styles: InlineRange[],
	rubyRanges: RubyRange[],
	rubyEnabled: boolean,
): void {
	if (!rubyEnabled) return;
	if (!lineText.includes("《")) return;

	const codeRanges = styles
		.filter((s) => s.className === "tategaki-md-code")
		.map((s) => ({ from: s.from, to: s.to }));

	const regex = createAozoraRubyRegExp();
	for (const match of lineText.matchAll(regex)) {
		const full = match[0] ?? "";
		const start = match.index ?? -1;
		if (start < 0) continue;
		const openIndex = full.indexOf("《");
		const closeIndex = full.indexOf("》", openIndex + 1);
		if (openIndex < 0 || closeIndex < 0) continue;

		const hasDelimiter = full.startsWith("|") || full.startsWith("｜");
		const baseStartRel = hasDelimiter ? 1 : 0;
		const baseEndRel = openIndex;
		const baseText = full.slice(baseStartRel, baseEndRel);
		const rubyText = full.slice(openIndex + 1, closeIndex);
		if (!baseText || !rubyText) continue;

		const absBaseFrom = absFrom + start + baseStartRel;
		const absBaseTo = absFrom + start + baseEndRel;
		if (absBaseFrom >= absBaseTo) continue;
		if (absBaseFrom < absFrom || absBaseTo > absTo) continue;
		if (rangeOverlapsAny(absBaseFrom, absBaseTo, codeRanges)) {
			continue;
		}
		if (rangeOverlapsAny(absBaseFrom, absBaseTo, hidden)) {
			continue;
		}
		if (rangeOverlapsAny(absBaseFrom, absBaseTo, rubyRanges)) {
			continue;
		}

		if (hasDelimiter) {
			hidden.push({
				from: absFrom + start,
				to: absFrom + start + 1,
			});
		}
		hidden.push({
			from: absFrom + start + openIndex,
			to: absFrom + start + closeIndex + 1,
		});
		rubyRanges.push({
			from: absBaseFrom,
			to: absBaseTo,
			ruby: rubyText,
			notationFrom: absFrom + start,
			notationTo: absFrom + start + closeIndex + 1,
		});
	}
}
