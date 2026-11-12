// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:3579-3951) @ d65c4c7 (2026-10-17).
// Local changes: Replace this/absolute end arguments with SourceLine and SoTLineModelState.
// Local changes: Remove the always-false source-mode branch.
// Local changes (M1-7): The footnote-definition branch (V:3881-3882) no longer hides the label or marks a box: a definition line (`[^1]: note`, `[注]: text`) shows every
// character and carries only `dataset.definitionLabel` (the range of its `[label]:`, which the display dims). `definitionLine` is the pure judgement of it (V's own two regexes).
import type { SoTLineModelState } from "../../sot/sot-line-model";
import type { BlockLineDecoration, HiddenRange, SourceLine } from "./types";

/**
 * M1-7 (本設計 §10.4.3): a line that defines a footnote (`[^id]: text`, V's footnote table regex) or a link reference (`[label]: url "title"`, V's `linkReferenceMap` regex; a
 * label that starts with `^` is a footnote's). `labelFrom`..`labelTo` is its `[label]:` (the leading blanks before it excluded), relative to the line's start. Judged on the
 * line's text alone (the kind of line is the caller's: only a plain line is shown as a definition).
 */
export interface DefinitionLine { readonly kind: "footnote" | "link"; readonly labelFrom: number; readonly labelTo: number }
const FOOTNOTE_DEFINITION = /^([ \t]*)\[\^([^\]]+)\]:/;
const LINK_DEFINITION = /^([ \t]*)\[((?:\\.|[^\]])+)\]:[ \t]*([^\s]+)(?:[ \t]+(?:"([^"]+)"|'([^']+)'|\(([^)]+)\)))?[ \t]*$/;
export function definitionLine(lineText: string): DefinitionLine | null {
	const footnote = FOOTNOTE_DEFINITION.exec(lineText);
	if (footnote) return { kind: "footnote", labelFrom: footnote[1].length, labelTo: footnote[0].length };
	const link = LINK_DEFINITION.exec(lineText);
	if (link && !link[2].startsWith("^")) return { kind: "link", labelFrom: link[1].length, labelTo: link[1].length + link[2].length + 3 };
	return null;
}
/** The `[label]:` range recorded on a definition line's decoration (`dataset.definitionLabel`, "from-to"), relative to the line's start; null for any other line. */
export function definitionLabelRange(dataset: Readonly<Record<string, string | undefined>>): { from: number; to: number } | null {
	const match = /^(\d+)-(\d+)$/.exec(dataset.definitionLabel ?? "");
	return match ? { from: Number(match[1]), to: Number(match[2]) } : null;
}

export function computeLineDecoration(
	{ lineIndex, lineFrom: absFrom, lineText }: SourceLine,
	model: SoTLineModelState,
): BlockLineDecoration {
	const absTo = absFrom + lineText.length;
	const classes: string[] = [];
	const hidden: HiddenRange[] = [];
	const dataset: Record<string, string> = {};
	const styleVars: Record<string, string> = {};

	if (lineIndex !== null) {
		if (
			model.lineHeadingHiddenBy[lineIndex] !== null
		) {
			classes.push("tategaki-md-heading-hidden");
			dataset.mdKind = "heading-hidden";
			hidden.push({ from: absFrom, to: absTo });
			return { classes, hidden, dataset, styleVars };
		}
		const kind = model.lineBlockKinds[lineIndex] ?? "normal";
		if (kind === "math" || kind === "math-fence") {
			const start = model.lineMathBlockStart[lineIndex];
			const end = model.lineMathBlockEnd[lineIndex];
			classes.push("tategaki-md-math");
			if (start !== null && end !== null && lineIndex === start) {
				classes.push("tategaki-md-math-widget");
				dataset.mdKind = "math-widget";
				dataset.mathRange = `${start}-${end}`;
			} else {
				classes.push("tategaki-md-math-hidden");
				dataset.mdKind = "math-hidden";
				if (start !== null && end !== null) {
					dataset.mathRange = `${start}-${end}`;
				}
			}
			hidden.push({ from: absFrom, to: absTo });
			return { classes, hidden, dataset, styleVars };
		}
		if (kind === "callout-title" || kind === "callout") {
			const start = model.lineCalloutBlockStart[lineIndex];
			const end = model.lineCalloutBlockEnd[lineIndex];
			if (
				start !== null &&
				end !== null
			) {
				const calloutType =
					model.lineCalloutType[lineIndex] ?? "note";
				classes.push("tategaki-md-callout");
				dataset.calloutType = calloutType;
				dataset.calloutRange = `${start}-${end}`;
				hidden.push({ from: absFrom, to: absTo });
				if (lineIndex === start) {
					classes.push("tategaki-md-callout-widget");
					dataset.mdKind = "callout-widget";
				} else {
					classes.push("tategaki-md-callout-hidden");
					dataset.mdKind = "callout-hidden";
				}
				return { classes, hidden, dataset, styleVars };
			}
		}

		if (kind === "table-row" || kind === "table-sep") {
			const start = model.lineTableBlockStart[lineIndex];
			const end = model.lineTableBlockEnd[lineIndex];
			if (
				start !== null &&
				end !== null
			) {
				classes.push("tategaki-md-table");
				dataset.tableRange = `${start}-${end}`;
				hidden.push({ from: absFrom, to: absTo });
				if (lineIndex === start) {
					classes.push("tategaki-md-table-widget");
					dataset.mdKind = "table-widget";
				} else {
					classes.push("tategaki-md-table-hidden");
					dataset.mdKind = "table-hidden";
				}
				return { classes, hidden, dataset, styleVars };
			}
		}
		if (kind === "deflist") {
			const start = model.lineDeflistBlockStart[lineIndex];
			const end = model.lineDeflistBlockEnd[lineIndex];
			if (
				start !== null &&
				end !== null
			) {
				classes.push("tategaki-md-deflist");
				dataset.deflistRange = `${start}-${end}`;
				hidden.push({ from: absFrom, to: absTo });
				if (lineIndex === start) {
					classes.push("tategaki-md-deflist-widget");
					dataset.mdKind = "deflist-widget";
				} else {
					classes.push("tategaki-md-deflist-hidden");
					dataset.mdKind = "deflist-hidden";
				}
				return { classes, hidden, dataset, styleVars };
			}
		}

		if (kind === "code-fence") {
			classes.push("tategaki-md-codeblock");
			classes.push("tategaki-md-codeblock-fence");
			dataset.mdKind = "code-fence";
			const info = model.lineCodeFenceInfo[lineIndex];
			if (info) dataset.codeInfo = info;
			const part = model.lineCodeBlockPart[lineIndex];
			if (part) classes.push(`tategaki-md-codeblock-part-${part}`);
			hidden.push({ from: absFrom, to: absTo });
			return { classes, hidden, dataset, styleVars };
		}
		if (kind === "code") {
			classes.push("tategaki-md-codeblock");
			classes.push("hljs");
			dataset.mdKind = "code";
			const part = model.lineCodeBlockPart[lineIndex];
			if (part) classes.push(`tategaki-md-codeblock-part-${part}`);
			return { classes, hidden, dataset, styleVars };
		}
		if (kind === "frontmatter-fence") {
			classes.push("tategaki-md-frontmatter");
			classes.push("tategaki-md-frontmatter-fence");
			dataset.mdKind = "frontmatter-fence";
			hidden.push({ from: absFrom, to: absTo });
			return { classes, hidden, dataset, styleVars };
		}
		if (kind === "frontmatter") {
			classes.push("tategaki-md-frontmatter");
			dataset.mdKind = "frontmatter";
			return { classes, hidden, dataset, styleVars };
		}
	}

	if (lineText.length === 0) {
		return { classes, hidden, dataset, styleVars };
	}

	// 画像（単独行）: `![alt](url)` / `![[file.png]]`
	{
		// Markdown image (Obsidian拡張: `![alt|100](url)` を許容)
		const m = lineText.match(/^[ \t]*!\[([^\]]*)\]\(([^)]+)\)[ \t]*$/);
		if (m && m[0] && m[2]) {
			const rawAlt = m[1] ?? "";
			const rawDest = (m[2] ?? "").trim();
			const dest =
				rawDest.startsWith("<") && rawDest.endsWith(">")
					? rawDest.slice(1, -1)
					: rawDest;
			let alt = rawAlt;
			let width: string | null = null;
			if (rawAlt.includes("|")) {
				const [a, w] = rawAlt.split("|", 2);
				alt = a ?? "";
				const parsed = w?.trim() ?? "";
				if (/^\d+$/.test(parsed)) width = parsed;
			}
			classes.push("tategaki-md-image-widget");
			dataset.mdKind = "image-widget";
			dataset.imageSrc = dest;
			dataset.imageAlt = alt;
			if (width) dataset.imageWidth = width;
			hidden.push({ from: absFrom, to: absTo });
			return { classes, hidden, dataset, styleVars };
		}

		// Wiki embed: `![[...]]`（画像拡張子のみウィジェット化）
		const w = lineText.match(/^[ \t]*!\[\[([^\]]+)\]\][ \t]*$/);
		if (w && w[0] && w[1]) {
			const raw = w[1].trim();
			// `path|100` のようなサイズ指定に対応
			const pipe = raw.indexOf("|");
			const core = pipe >= 0 ? raw.slice(0, pipe).trim() : raw;
			const size = pipe >= 0 ? raw.slice(pipe + 1).trim() : "";
			const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(core);
			if (isImage) {
				classes.push("tategaki-md-image-widget");
				dataset.mdKind = "image-widget";
				dataset.imageSrc = core;
				dataset.imageAlt = "";
				if (/^\d+$/.test(size)) {
					dataset.imageWidth = size;
				}
				hidden.push({ from: absFrom, to: absTo });
				return { classes, hidden, dataset, styleVars };
			}
		}
	}

	// 埋め込み（単独行）: `![[note]]` / `![[note#heading]]` / `![[note^block]]`
	{
		const w = lineText.match(/^[ \t]*!\[\[([^\]]+)\]\][ \t]*$/);
		if (w && w[0] && w[1]) {
			const raw = w[1].trim();
			const pipe = raw.indexOf("|");
			const core = pipe >= 0 ? raw.slice(0, pipe).trim() : raw;
			const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(core);
			if (!isImage) {
				classes.push("tategaki-md-embed-widget");
				dataset.mdKind = "embed-widget";
				dataset.embedTarget = raw;
				hidden.push({ from: absFrom, to: absTo });
				return { classes, hidden, dataset, styleVars };
			}
		}
	}

	const computeIndentDepth = (leading: string): number => {
		let columns = 0;
		for (const ch of leading) {
			if (ch === "\t") {
				columns += 4;
			} else {
				columns += 1;
			}
		}
		// ネストは 4スペース=1階層を基本としつつ、2スペースでも1階層として扱う
		if (columns >= 2 && columns < 4) return 1;
		return Math.max(0, Math.floor(columns / 4));
	};

	const applyListDepth = (depth: number) => {
		dataset.listDepth = String(depth);
		styleVars["--tategaki-sot-list-depth"] = String(depth);
	};

	// 見出し: #..######（ATX）
	{
		const match = lineText.match(/^(#{1,6})([ \t]+)(.*)$/);
		if (match) {
			const level = match[1]?.length ?? 1;
			const markerLen =
				(match[1]?.length ?? 0) + (match[2]?.length ?? 0);
			if (markerLen > 0) {
				hidden.push({ from: absFrom, to: absFrom + markerLen });
			}
			// 末尾の閉じハッシュ: `## Title ##`
			const closing = lineText.match(/[ \t]+#+[ \t]*$/);
			if (closing && closing.index !== undefined) {
				const start = absFrom + closing.index;
				const end = absFrom + lineText.length;
				if (end > start) hidden.push({ from: start, to: end });
			}
			classes.push("tategaki-md-heading");
			classes.push(
				`tategaki-md-heading-${Math.max(1, Math.min(level, 6))}`,
			);
			dataset.mdKind = "heading";
			dataset.mdLevel = String(level);
			if (lineIndex !== null) {
				const end = model.lineHeadingSectionEnd[lineIndex];
				if (end !== null && end > lineIndex) {
					dataset.headingFoldable = "1";
				}
				if (model.collapsedHeadingLines.has(lineIndex)) {
					dataset.headingCollapsed = "1";
				}
			}
		}
	}

	// 引用: >（多重可）
	if (classes.length === 0) {
		const m = lineText.match(/^[ \t]{0,3}((?:> ?)+)(.*)$/);
		if (m && m[1]) {
			const markerText = m[1];
			const depth = (markerText.match(/>/g) ?? []).length;
			const markerStart = lineText.indexOf(markerText);
			const markerEnd = markerStart + markerText.length;
			if (markerEnd > markerStart) {
				hidden.push({
					from: absFrom + markerStart,
					to: absFrom + markerEnd,
				});
			}
			classes.push("tategaki-md-blockquote");
			classes.push(
				`tategaki-md-blockquote-depth-${Math.max(1, depth)}`,
			);
			dataset.mdKind = "blockquote";
			dataset.mdDepth = String(depth);
			styleVars["--tategaki-sot-blockquote-depth"] = String(
				Math.max(0, depth - 1),
			);
		}
	}

	// 定義の行（M1-7）: `[^id]: ...` と `[label]: url`。字は隠さず、`[label]:` の範囲だけを dataset に記す（表示が薄くする）。
	if (classes.length === 0) {
		const definition = definitionLine(lineText);
		if (definition) dataset.definitionLabel = `${definition.labelFrom}-${definition.labelTo}`;
	}

	// 箇条書き / 番号付きリスト（最低限の見た目だけ）
	if (classes.length === 0) {
		const task = lineText.match(
			/^([ \t]*)([-+*])[ \t]+\[([ xX])\][ \t]+/,
		);
		if (task && task[0]) {
			const markerLen = task[0].length;
			hidden.push({ from: absFrom, to: absFrom + markerLen });
			classes.push("tategaki-md-list");
			classes.push("tategaki-md-task");
			dataset.mdKind = "task";
			const checked = (task[3] ?? " ").toLowerCase() === "x";
			dataset.taskChecked = checked ? "1" : "0";
			dataset.listMarker = "";
			applyListDepth(computeIndentDepth(task[1] ?? ""));
		} else {
			const bullet = lineText.match(/^([ \t]*)([-+*])[ \t]+/);
			if (bullet && bullet[0] && bullet[2]) {
				const markerLen = bullet[0].length;
				hidden.push({ from: absFrom, to: absFrom + markerLen });
				classes.push("tategaki-md-list");
				dataset.mdKind = "list";
				dataset.listMarker = "";
				const depth = computeIndentDepth(bullet[1] ?? "");
				applyListDepth(depth);
				dataset.listBullet = String(depth % 2);
			} else {
				const ordered = lineText.match(
					/^([ \t]*)(\d{1,9})([.)])[ \t]+/,
				);
				// ordered[1] はインデント (トップレベルでは "") なので必須にしない。
				// 必須は数字 (ordered[2]) と区切り (ordered[3])。bullet 分岐と対称。
				// (これを必須にすると top-level "1. " が装飾されず生テキストとして
				//  残り、marker が hidden 化されないため前後ナビが壊れていた。)
				if (ordered && ordered[0] && ordered[2] && ordered[3]) {
					const markerLen = ordered[0].length;
					hidden.push({ from: absFrom, to: absFrom + markerLen });
					classes.push("tategaki-md-list");
					dataset.mdKind = "olist";
					dataset.listMarker = `${ordered[2]}${ordered[3]}`;
					applyListDepth(computeIndentDepth(ordered[1] ?? ""));
				}
			}
		}
	}

	// 罫線: --- / *** / ___（3回以上）
	if (classes.length === 0) {
		const hr = lineText.match(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/);
		if (hr) {
			hidden.push({ from: absFrom, to: absTo });
			classes.push("tategaki-md-hr");
			dataset.mdKind = "hr";
		}
	}

	return { classes, hidden, dataset, styleVars };
}
