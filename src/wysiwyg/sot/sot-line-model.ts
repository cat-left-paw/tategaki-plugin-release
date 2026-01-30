import type { LineRange } from "./line-ranges";

export type SoTLineModelState = {
	lineBlockKinds: string[];
	lineCodeFenceInfo: (string | null)[];
	lineCodeLang: (string | null)[];
	lineCodeBlockPart: (
		| null
		| "single"
		| "start"
		| "middle"
		| "end"
	)[];
	lineMathBlockStart: (number | null)[];
	lineMathBlockEnd: (number | null)[];
	lineCalloutType: (string | null)[];
	lineCalloutIsTitle: boolean[];
	lineCalloutBlockStart: (number | null)[];
	lineCalloutBlockEnd: (number | null)[];
	lineTableIsHeader: boolean[];
	lineTableBlockStart: (number | null)[];
	lineTableBlockEnd: (number | null)[];
	lineDeflistBlockStart: (number | null)[];
	lineDeflistBlockEnd: (number | null)[];
	lineHeadingSectionEnd: (number | null)[];
	lineHeadingHiddenBy: (number | null)[];
	footnoteDefinitionOrder: Map<string, number>;
	footnoteDefinitionText: Map<string, string>;
	linkReferenceMap: Map<string, string>;
	collapsedHeadingLines: Set<number>;
};

export type RecomputeLineBlockKindsOptions = {
	lines: string[];
	collapsedHeadingLines: Set<number>;
	normalizeLinkLabel: (label: string) => string;
};

export function computeLineRangesFromLines(lines: string[]): LineRange[] {
	const ranges: LineRange[] = [];
	let offset = 0;
	for (const line of lines) {
		const from = offset;
		const to = offset + line.length;
		ranges.push({ from, to });
		offset = to + 1;
	}
	return ranges;
}

export function recomputeLineBlockKinds(
	options: RecomputeLineBlockKindsOptions
): SoTLineModelState {
	const { lines, normalizeLinkLabel } = options;
	let collapsedHeadingLines = new Set(options.collapsedHeadingLines);
	const lineBlockKinds = new Array(lines.length).fill("normal");
	const lineCodeFenceInfo = new Array(lines.length).fill(null);
	const lineCodeLang = new Array(lines.length).fill(null);
	const lineCodeBlockPart = new Array(lines.length).fill(null);
	const lineMathBlockStart = new Array(lines.length).fill(null);
	const lineMathBlockEnd = new Array(lines.length).fill(null);
	const lineCalloutType = new Array(lines.length).fill(null);
	const lineCalloutIsTitle = new Array(lines.length).fill(false);
	const lineCalloutBlockStart = new Array(lines.length).fill(null);
	const lineCalloutBlockEnd = new Array(lines.length).fill(null);
	const lineTableIsHeader = new Array(lines.length).fill(false);
	const lineTableBlockStart = new Array(lines.length).fill(null);
	const lineTableBlockEnd = new Array(lines.length).fill(null);
	const lineDeflistBlockStart = new Array(lines.length).fill(null);
	const lineDeflistBlockEnd = new Array(lines.length).fill(null);
	const lineHeadingSectionEnd = new Array(lines.length).fill(null);
	const lineHeadingHiddenBy = new Array(lines.length).fill(null);
	const footnoteDefinitionOrder = new Map<string, number>();
	const footnoteDefinitionText = new Map<string, string>();
	const linkReferenceMap = new Map<string, string>();

	let inFrontmatter = false;
	let frontmatterStarted = false;
	let inCodeFence = false;
	let fenceMarker = "";
	let activeCodeLang: string | null = null;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? "";

		if (!frontmatterStarted && i === 0 && line.trim() === "---") {
			frontmatterStarted = true;
			inFrontmatter = true;
			lineBlockKinds[i] = "frontmatter-fence";
			continue;
		}
		if (inFrontmatter) {
			if (line.trim() === "---") {
				lineBlockKinds[i] = "frontmatter-fence";
				inFrontmatter = false;
			} else {
				lineBlockKinds[i] = "frontmatter";
			}
			continue;
		}

		if (inCodeFence) {
			if (fenceMarker.length > 0 && line.startsWith(fenceMarker)) {
				lineBlockKinds[i] = "code-fence";
				lineCodeLang[i] = activeCodeLang;
				inCodeFence = false;
				fenceMarker = "";
				activeCodeLang = null;
			} else {
				lineBlockKinds[i] = "code";
				lineCodeLang[i] = activeCodeLang;
			}
			continue;
		}

		const fenceMatch = line.match(/^(```+|~~~+)/);
		if (fenceMatch && fenceMatch[1]) {
			fenceMarker = fenceMatch[1];
			inCodeFence = true;
			lineBlockKinds[i] = "code-fence";
			const info = line.slice(fenceMarker.length).trim();
			lineCodeFenceInfo[i] = info.length > 0 ? info : null;
			activeCodeLang =
				info.length > 0 ? info.split(/\s+/)[0] ?? null : null;
			lineCodeLang[i] = activeCodeLang;
			continue;
		}
	}

	let footnoteCounter = 0;
	for (let i = 0; i < lines.length; i += 1) {
		if (lineBlockKinds[i] !== "normal") continue;
		const line = lines[i] ?? "";
		const m = line.match(/^[ \t]*\[\^([^\]]+)\]:[ \t]*/);
		if (!m || !m[1]) continue;
		const id = m[1];
		if (!footnoteDefinitionOrder.has(id)) {
			footnoteCounter += 1;
			footnoteDefinitionOrder.set(id, footnoteCounter);
			const text = line.slice(m[0].length).trim();
			if (text.length > 0) {
				footnoteDefinitionText.set(id, text);
			}
		}
	}

	for (let i = 0; i < lines.length; i += 1) {
		if (lineBlockKinds[i] !== "normal") continue;
		const line = lines[i] ?? "";
		const m = line.match(
			/^[ \t]*\[((?:\\.|[^\]])+)\]:[ \t]*([^\s]+)(?:[ \t]+(?:"([^"]+)"|'([^']+)'|\(([^)]+)\)))?[ \t]*$/
		);
		if (!m || !m[1] || !m[2]) continue;
		const rawLabel = m[1];
		const rawDest = m[2];
		const label = normalizeLinkLabel(rawLabel);
		let href = rawDest.trim();
		if (href.startsWith("<") && href.endsWith(">")) {
			href = href.slice(1, -1);
		}
		if (label && href) {
			linkReferenceMap.set(label, href);
		}
	}

	for (let i = 0; i < lines.length; i += 1) {
		const kind = lineBlockKinds[i] ?? "normal";
		if (kind !== "code" && kind !== "code-fence") continue;
		const prevKind = lineBlockKinds[i - 1] ?? "";
		if (prevKind === "code" || prevKind === "code-fence") {
			continue;
		}
		let j = i;
		while (j < lines.length) {
			const k = lineBlockKinds[j] ?? "normal";
			if (k !== "code" && k !== "code-fence") break;
			j += 1;
		}
		const end = j - 1;
		if (end < i) continue;
		if (end === i) {
			lineCodeBlockPart[i] = "single";
		} else {
			lineCodeBlockPart[i] = "start";
			for (let m = i + 1; m < end; m += 1) {
				lineCodeBlockPart[m] = "middle";
			}
			lineCodeBlockPart[end] = "end";
		}
		i = end;
	}

	const mathBlocks: Array<{ start: number; end: number }> = [];
	let inMath = false;
	let mathStart = -1;
	const isMathFence = (line: string): boolean => /^\s*\$\$\s*$/.test(line);
	for (let i = 0; i < lines.length; i += 1) {
		if (lineBlockKinds[i] !== "normal") {
			if (inMath) {
				mathBlocks.push({ start: mathStart, end: i - 1 });
				inMath = false;
				mathStart = -1;
			}
			continue;
		}
		const line = lines[i] ?? "";
		if (!inMath) {
			if (isMathFence(line)) {
				inMath = true;
				mathStart = i;
				lineBlockKinds[i] = "math-fence";
				continue;
			}
			const single = line.match(/^\s*\$\$(.+)\$\$\s*$/);
			if (single) {
				lineBlockKinds[i] = "math";
				mathBlocks.push({ start: i, end: i });
			}
			continue;
		}
		if (isMathFence(line)) {
			lineBlockKinds[i] = "math-fence";
			mathBlocks.push({ start: mathStart, end: i });
			inMath = false;
			mathStart = -1;
			continue;
		}
		lineBlockKinds[i] = "math";
	}
	if (inMath && mathStart >= 0) {
		mathBlocks.push({ start: mathStart, end: lines.length - 1 });
	}
	for (const block of mathBlocks) {
		for (let i = block.start; i <= block.end; i += 1) {
			lineMathBlockStart[i] = block.start;
			lineMathBlockEnd[i] = block.end;
		}
	}

	const calloutBlocks: Array<{ start: number; end: number }> = [];
	let activeCalloutType: string | null = null;
	let activeCalloutStart: number | null = null;
	for (let i = 0; i < lines.length; i += 1) {
		if (lineBlockKinds[i] !== "normal") {
			if (activeCalloutType && activeCalloutStart !== null) {
				calloutBlocks.push({
					start: activeCalloutStart,
					end: i - 1,
				});
			}
			activeCalloutType = null;
			activeCalloutStart = null;
			continue;
		}
		const line = lines[i] ?? "";
		const start = line.match(
			/^[ \t]{0,3}>[ \t]*\[!([A-Za-z0-9_-]+)\](?:[+-])?[ \t]*(.*)$/
		);
		if (start && start[1]) {
			if (activeCalloutType && activeCalloutStart !== null) {
				calloutBlocks.push({
					start: activeCalloutStart,
					end: i - 1,
				});
			}
			activeCalloutType = start[1].toLowerCase();
			activeCalloutStart = i;
			lineBlockKinds[i] = "callout-title";
			lineCalloutType[i] = activeCalloutType;
			lineCalloutIsTitle[i] = true;
			continue;
		}
		if (activeCalloutType) {
			if (/^[ \t]{0,3}>/.test(line)) {
				lineBlockKinds[i] = "callout";
				lineCalloutType[i] = activeCalloutType;
				continue;
			}
			if (activeCalloutStart !== null) {
				calloutBlocks.push({
					start: activeCalloutStart,
					end: i - 1,
				});
			}
			activeCalloutType = null;
			activeCalloutStart = null;
		}
	}
	if (activeCalloutType && activeCalloutStart !== null) {
		calloutBlocks.push({
			start: activeCalloutStart,
			end: lines.length - 1,
		});
	}
	for (const block of calloutBlocks) {
		for (let i = block.start; i <= block.end; i += 1) {
			lineCalloutBlockStart[i] = block.start;
			lineCalloutBlockEnd[i] = block.end;
		}
	}

	const isTableSeparatorLine = (line: string): boolean => {
		const trimmed = line.trim();
		if (!trimmed.includes("|")) return false;
		return /^(\|?\s*:?-{3,}:?\s*)(\|\s*:?-{3,}:?\s*)+\|?$/.test(
			trimmed
		);
	};
	const hasUnescapedPipe = (line: string): boolean => {
		for (let i = 0; i < line.length; i += 1) {
			if (line[i] !== "|") continue;
			let backslashes = 0;
			for (let j = i - 1; j >= 0; j -= 1) {
				if (line[j] !== "\\") break;
				backslashes += 1;
			}
			if (backslashes % 2 === 0) return true;
		}
		return false;
	};

	for (let i = 0; i < lines.length - 1; i += 1) {
		if (lineBlockKinds[i] !== "normal") continue;
		if (lineBlockKinds[i + 1] !== "normal") continue;
		const header = lines[i] ?? "";
		const sep = lines[i + 1] ?? "";
		if (!hasUnescapedPipe(header)) continue;
		if (!isTableSeparatorLine(sep)) continue;

		lineBlockKinds[i] = "table-row";
		lineTableIsHeader[i] = true;
		lineBlockKinds[i + 1] = "table-sep";

		let j = i + 2;
		for (; j < lines.length; j += 1) {
			if (lineBlockKinds[j] !== "normal") break;
			const row = lines[j] ?? "";
			if (row.trim().length === 0) break;
			if (!hasUnescapedPipe(row)) break;
			lineBlockKinds[j] = "table-row";
		}
		i = j - 1;
	}

	for (let i = 0; i < lines.length; i += 1) {
		const kind = lineBlockKinds[i] ?? "normal";
		if (kind !== "table-row" && kind !== "table-sep") continue;
		const prev = lineBlockKinds[i - 1] ?? "normal";
		if (prev === "table-row" || prev === "table-sep") {
			continue;
		}
		let j = i;
		while (j < lines.length) {
			const k = lineBlockKinds[j] ?? "normal";
			if (k !== "table-row" && k !== "table-sep") break;
			j += 1;
		}
		const end = j - 1;
		if (end < i) continue;
		for (let m = i; m <= end; m += 1) {
			lineTableBlockStart[m] = i;
			lineTableBlockEnd[m] = end;
		}
		i = end;
	}

	const deflistBlocks: Array<{ start: number; end: number }> = [];
	const isDefLine = (line: string): boolean => /^[ \t]*:[ \t]+/.test(line);
	for (let i = 0; i < lines.length - 1; i += 1) {
		if (lineBlockKinds[i] !== "normal") continue;
		if (lineBlockKinds[i + 1] !== "normal") continue;
		const term = lines[i] ?? "";
		const def = lines[i + 1] ?? "";
		if (term.trim().length === 0) continue;
		if (!isDefLine(def)) continue;

		let start = i;
		let end = i + 1;

		let j = i + 2;
		for (; j < lines.length; j += 1) {
			if (lineBlockKinds[j] !== "normal") break;
			const line = lines[j] ?? "";
			if (line.trim().length === 0) break;
			if (isDefLine(line)) {
				end = j;
				continue;
			}
			const next = lines[j + 1] ?? "";
			if (
				j + 1 < lines.length &&
				isDefLine(next) &&
				line.trim().length > 0
			) {
				end = j + 1;
				j += 1;
				continue;
			}
			break;
		}

		deflistBlocks.push({ start, end });
		for (let k = start; k <= end; k += 1) {
			lineBlockKinds[k] = "deflist";
		}
		i = end;
	}
	for (const block of deflistBlocks) {
		for (let i = block.start; i <= block.end; i += 1) {
			lineDeflistBlockStart[i] = block.start;
			lineDeflistBlockEnd[i] = block.end;
		}
	}

	const headingLines: Array<{ index: number; level: number }> = [];
	for (let i = 0; i < lines.length; i += 1) {
		if (lineBlockKinds[i] !== "normal") continue;
		const line = lines[i] ?? "";
		const match = line.match(/^(#{1,6})([ \t]+)(.*)$/);
		if (!match) continue;
		const level = match[1]?.length ?? 1;
		headingLines.push({ index: i, level });
	}
	for (let i = 0; i < headingLines.length; i += 1) {
		const current = headingLines[i]!;
		let end = lines.length - 1;
		for (let j = i + 1; j < headingLines.length; j += 1) {
			const next = headingLines[j]!;
			if (next.level <= current.level) {
				end = next.index - 1;
				break;
			}
		}
		lineHeadingSectionEnd[current.index] = end;
	}
	if (collapsedHeadingLines.size > 0) {
		const nextCollapsed = new Set<number>();
		for (const heading of headingLines) {
			if (collapsedHeadingLines.has(heading.index)) {
				nextCollapsed.add(heading.index);
			}
		}
		collapsedHeadingLines = nextCollapsed;
	}
	for (const heading of headingLines) {
		if (!collapsedHeadingLines.has(heading.index)) continue;
		const end = lineHeadingSectionEnd[heading.index];
		if (end === null || end <= heading.index) continue;
		for (let i = heading.index + 1; i <= end; i += 1) {
			if (lineHeadingHiddenBy[i] !== null) continue;
			lineHeadingHiddenBy[i] = heading.index;
		}
	}

	return {
		lineBlockKinds,
		lineCodeFenceInfo,
		lineCodeLang,
		lineCodeBlockPart,
		lineMathBlockStart,
		lineMathBlockEnd,
		lineCalloutType,
		lineCalloutIsTitle,
		lineCalloutBlockStart,
		lineCalloutBlockEnd,
		lineTableIsHeader,
		lineTableBlockStart,
		lineTableBlockEnd,
		lineDeflistBlockStart,
		lineDeflistBlockEnd,
		lineHeadingSectionEnd,
		lineHeadingHiddenBy,
		footnoteDefinitionOrder,
		footnoteDefinitionText,
		linkReferenceMap,
		collapsedHeadingLines,
	};
}
