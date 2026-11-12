// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: Nyoze io/{rescueOrphanDelimiters,fallbackEmphasis,escapedStarMask}.ts @ 0e4e68b3,
// Markdown-it portions Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin (MIT).
// via tests/pm-mode/m13c-inline.ts @ 7e0c8a9; delimiter/scanner portions markdown-it 14.2.0 (MIT).
// Local changes: existing M1 collectors own notation/link ranges; opaque source is masked only
// while resolving formats. Lexical rules adapted from backticks, escape, html_inline (MIT).
// M1-6b R5: skip preparation on unformatted lines; cache immutable token text within one rescue call.
// Source characters and their order are unchanged (D-L9-9, D-M16-4). See ORIGIN.md and NOTICE.
import type { RenderSegment, HiddenRange, InlineRange } from "./types";
import { resolveDelimiters } from "./inline-delimiters";
import type { RawToken, Delimiter } from "./inline-delimiters";
import { HTML_TAG_RE } from "./inline-html";
export type InlineFormat = "strong" | "em" | "strike" | "highlight" | "code";
type Mark = "strong" | "em" | "strike";
/** Bits of the formats (`InlineReading.formats`). */
export const FORMAT_BIT: Readonly<Record<InlineFormat, number>> = { strong: 1, em: 2, strike: 4, highlight: 8, code: 16 };
export const HIDDEN = -1;
export const enum Syntax { None = 0, LinkOpen = 1, LinkClose = 2, Atom = 3 }

/** What the reading shows of each UTF-16 offset of a line. */
export interface InlineReading {
	/** The formats of the character (`FORMAT_BIT`), or `HIDDEN` (a delimiter, a code span's backticks, an escape's `\`). */
	readonly formats: Int8Array;
	/** Link syntax (`[`, `](u "t")`, an autolink's `<` `>`) and inline atoms (HTML tags, images): shown by their own layers. */
	readonly syntax: Uint8Array;
}

const MASKED_ESCAPE = "﷐";
type Tok =
	/** Text as the source offsets of its characters (an escape's `\` left out). */
	| { kind: "text"; at: number[] }
	| { kind: "open"; mark: Mark; at: number[] }
	| { kind: "close"; mark: Mark; at: number[] }
	| { kind: "code"; from: number; to: number; marks: [number, number][] }
	| { kind: "link-open"; from: number; to: number }
	| { kind: "link-close"; from: number; to: number }
	| { kind: "atom"; from: number; to: number };


export interface InlineReadingRanges {
	/** Relative start after the existing line decoration's leading hidden marker. */
	contentFrom?: number;
	/** Absolute source ranges owned by the existing collectors. */
	hidden?: readonly HiddenRange[];
	linkHidden?: readonly HiddenRange[];
	styles?: readonly InlineRange[];
	math?: readonly HiddenRange[];
}
interface LocalRanges { from?: number; opaque?: readonly HiddenRange[]; labels?: readonly HiddenRange[] }
interface ReadingMask { escaped: ReadonlySet<number>; opaque: Uint8Array }
const LINK_CLASSES = new Set(["tategaki-md-link", "tategaki-md-image", "tategaki-md-embed", "tategaki-md-footnote-ref", "tategaki-md-footnote-inline"]);
/** Adapt collector-owned ranges; even an empty href has an owned opening/closing hidden range. */
function relativeRanges(absFrom: number, text: string, ranges: InlineReadingRanges): LocalRanges {
	const local = (r: HiddenRange) => ({ from: Math.max(0, r.from - absFrom), to: Math.min(text.length, r.to - absFrom) });
	const linkHidden = (ranges.linkHidden ?? []).map(local), labels = (ranges.styles ?? []).filter(s => LINK_CLASSES.has(s.className)).map(local);
	// These are already recognized by the collector. No destination or reference is parsed here.
	for (const h of linkHidden) {
		const opener = text.slice(h.from, h.to);
		if (!["[", "[[", "![", "^[", "[^", "<"].includes(opener)) continue;
		const closing = opener === "[[" ? "]]" : opener === "<" ? ">" : "]";
		const close = linkHidden.filter(r => r.from >= h.to && text.startsWith(closing, r.from)).sort((a, b) => a.from - b.from)[0];
		if (!close) continue;
		let from = h.to;
		for (const r of linkHidden) if (r.from <= from && r.to > from && r.to <= close.from) from = r.to;
		if (from < close.from) labels.push({ from, to: close.from });
	}
	const sorted = labels.filter(r => r.from < r.to).sort((a, b) => a.from - b.from || b.to - a.to), merged: HiddenRange[] = [];
	for (const r of sorted) {
		const last = merged[merged.length - 1];
		if (last && r.from < last.to) last.to = Math.max(last.to, r.to);
		else if (!last || last.from !== r.from || last.to !== r.to) merged.push({ ...r });
	}
	return { from: ranges.contentFrom ?? 0, opaque: [...(ranges.hidden ?? []), ...(ranges.math ?? [])].map(local), labels: merged };
}
// Flanking from markdown-it 14.2.0 StateInline.scanDelims (MIT). P/S and Zs match its Unicode tests.
const punct = (ch: string) => /[\p{P}\p{S}]/u.test(ch);
const space = (ch: string) => /[\p{Zs}\t\n\v\f\r]/u.test(ch);
function scanDelims(text: string, start: number, from: number, to: number): { length: number; open: boolean; close: boolean } {
	let end = start + 1;
	while (end < to && text[end] === text[start]) end++;
	let before = " ";
	if (start > from) {
		let at = start - 1;
		const code = text.charCodeAt(at);
		if (code >= 0xDC00 && code <= 0xDFFF && at > from) at--;
		before = String.fromCodePoint(text.codePointAt(at) ?? 0xFFFD);
	}
	const after = end === text.length ? " " : String.fromCodePoint(text.codePointAt(end) ?? 0xFFFD);
	const a = punct(before), b = punct(after), wa = space(before), wb = space(after);
	const left = !wb && (!b || wa || a), right = !wa && (!a || wb || b), splitWord = text[start] !== "_";
	return { length: end - start, open: left && (splitWord || !right || a), close: right && (splitWord || !left || b) };
}
const ESCAPABLE = new Set('\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'.split(""));
interface BacktickCache { scanned: boolean; lengths: Map<number, number> }
/** markdown-it backticks: run-length matching and failed-scan cache; opaque source is skipped. */
function codeEnd(text: string, start: number, max: number, opaque: Uint8Array, cache: BacktickCache): { end: number; openEnd: number; close: number } | null {
	let pos = start + 1;
	while (pos < max && text[pos] === "`" && !opaque[pos]) pos++;
	const length = pos - start;
	if (cache.scanned && (cache.lengths.get(length) ?? 0) <= start) return null;
	let end = pos, found: number;
	while ((found = text.indexOf("`", end)) >= 0 && found < max) {
		if (opaque[found]) { end = found + 1; continue; }
		end = found + 1;
		while (end < max && text[end] === "`" && !opaque[end]) end++;
		if (end - found === length) return { end, openEnd: pos, close: found };
		cache.lengths.set(end - found, found);
	}
	cache.scanned = true;
	return null;
}
function tokenize(text: string, from: number, ranges: LocalRanges, escaped: Set<number>, opaque: Uint8Array): Tok[] {
	const raw: RawToken[] = [], scopes: Delimiter[][] = [[]], stack = [scopes[0]];
	const starts = new Map<number, number>(), ends = new Set<number>();
	for (const r of ranges.labels ?? []) { starts.set(r.from, r.to); ends.add(r.to); }
	const points = [...new Set([...starts.keys(), ...ends])].sort((a, b) => a - b), caches = new Map<number, BacktickCache>();
	let eventIndex = 0;
	const textToken = (at: number[]) => { if (at.length) raw.push({ type: "text", content: at.map(p => text[p]).join(""), at }); };
	let pending: number[] = [];
	const flush = () => { textToken(pending); pending = []; };
	for (let p = from; p < text.length;) {
		if (ends.has(p)) { flush(); raw.push({ type: "link-close", content: "", at: [], from: p, to: p }); stack.pop(); }
		if (starts.has(p)) { flush(); raw.push({ type: "link-open", content: "", at: [], from: p, to: p }); const list: Delimiter[] = []; scopes.push(list); stack.push(list); }
		while (eventIndex < points.length && points[eventIndex] <= p) eventIndex++;
		const limit = points[eventIndex] ?? text.length;
		if (opaque[p]) { pending.push(p++); continue; }
		const ch = text[p];
		if (ch === "\\" && p + 1 < limit && !opaque[p + 1]) {
			flush();
			if (ESCAPABLE.has(text[p + 1])) { escaped.add(p); textToken([p + 1]); p += 2; }
			else { const width = (text.codePointAt(p + 1) ?? 0) > 0xFFFF ? 2 : 1; textToken(Array.from({ length: width + 1 }, (_, k) => p + k)); p += width + 1; }
			continue;
		}
		if (ch === "`") {
			let cache = caches.get(eventIndex);
			if (!cache) { cache = { scanned: false, lengths: new Map() }; caches.set(eventIndex, cache); }
			const code = codeEnd(text, p, limit, opaque, cache);
			if (code) {
				flush(); const marks: [number, number][] = [[p, code.openEnd], [code.close, code.end]];
				const body = text.slice(code.openEnd, code.close);
				if (body.startsWith(" ") && body.endsWith(" ") && /[^ ]/.test(body)) marks.push([code.openEnd, code.openEnd + 1], [code.close - 1, code.close]);
				raw.push({ type: "code", content: "", at: [], from: p, to: code.end, marks }); p = code.end; continue;
			}
			let end = p + 1; while (end < limit && text[end] === "`" && !opaque[end]) end++;
			for (; p < end; p++) pending.push(p);
			continue;
		}
		if (ch === "%" && text[p + 1] === "%") {
			const end = text.indexOf("%%", p + 2);
			if (end >= 0 && end + 2 <= limit) { for (; p < end + 2; p++) { opaque[p] = 1; pending.push(p); } continue; }
		}
		if (ch === "<" && p + 2 < limit && /[!?/a-z]/i.test(text[p + 1])) {
			const match = HTML_TAG_RE.exec(text.slice(p, limit));
			if (match) { flush(); raw.push({ type: "atom", content: "", at: [], from: p, to: p + match[0].length }); p += match[0].length; continue; }
		}
		if (ch === "*" || ch === "_" || ch === "~") {
			let runEnd = p + 1; while (runEnd < limit && text[runEnd] === ch && !opaque[runEnd]) runEnd++;
			const scanned = scanDelims(text, p, from, runEnd);
			if (ch !== "~" || scanned.length >= 2) {
				flush(); let at = p;
				if (ch === "~" && scanned.length % 2) textToken([at++]);
				for (; at < runEnd; at += ch === "~" ? 2 : 1) {
					textToken(ch === "~" ? [at, at + 1] : [at]);
					stack[stack.length - 1].push({ marker: ch.charCodeAt(0), length: ch === "~" ? 0 : scanned.length, token: raw.length - 1, end: -1, open: scanned.open, close: scanned.close });
				}
				p = runEnd; continue;
			}
		}
		pending.push(p++);
	}
	flush(); resolveDelimiters(raw, scopes);
	const out: Tok[] = [], marks: Record<string, Mark> = { strong: "strong", em: "em", s: "strike" };
	for (const t of raw) {
		if (t.type === "text") { if (!t.at.length) continue; const last = out[out.length - 1]; if (last?.kind === "text") last.at.push(...t.at); else out.push({ kind: "text", at: t.at }); }
		else if (/_open$|_close$/.test(t.type)) out.push({ kind: t.type.endsWith("_open") ? "open" : "close", mark: marks[t.tag ?? ""], at: t.at });
		else if (t.type === "code") out.push({ kind: "code", from: t.from ?? 0, to: t.to ?? 0, marks: t.marks ?? [] });
		else out.push({ kind: t.type as "link-open" | "link-close" | "atom", from: t.from ?? 0, to: t.to ?? 0 });
	}
	return out;
}

// ---- Nyoze's rescueOrphanDelimiters.ts, on these tokens ----
interface Spec { delimiter: string; marks: Mark[] }
const SPECS: Spec[] = [
	{ delimiter: "***", marks: ["strong", "em"] },
	{ delimiter: "**", marks: ["strong"] },
	{ delimiter: "~~", marks: ["strike"] },
	{ delimiter: "*", marks: ["em"] },
];
const contentOf = (text: string, at: readonly number[], masked: ReadingMask) => at.map(p => masked.escaped.has(p) ? MASKED_ESCAPE : masked.opaque[p] ? "\uFFFC" : text[p]).join("");

function rescueOrphanDelimiters(text: string, tokens: Tok[], masked: ReadingMask): Tok[] {
	const textCache = new WeakMap<Tok, string>();
	const content = (tok: Tok): string => {
		if (tok.kind !== "text") return "";
		const cached = textCache.get(tok);
		if (cached !== undefined) return cached;
		const value = contentOf(text, tok.at, masked);
		textCache.set(tok, value);
		return value;
	};
	const specOf = (mark: Mark) => SPECS.find(spec => spec.marks.length === 1 && spec.marks[0] === mark);
	const sideSafe = (body: string, d: string) => body.length > 0 && !body.includes("\n") && !body.includes(d[0]) && !body.startsWith(" ") && !body.endsWith(" ");
	const middleSafe = (body: string, d: string) => body.length > 0 && !body.includes("\n") && !body.includes(d[0]);
	const isText = (tok: Tok | undefined): tok is Extract<Tok, { kind: "text" }> => tok?.kind === "text";
	const isOpen = (tok: Tok | undefined, mark?: Mark): tok is Extract<Tok, { kind: "open" }> => tok?.kind === "open" && (mark === undefined || tok.mark === mark);
	const isClose = (tok: Tok | undefined, mark: Mark): boolean => tok?.kind === "close" && tok.mark === mark;
	const atOf = (tok: Tok): number[] => tok.kind === "text" || tok.kind === "open" || tok.kind === "close" ? tok.at : [];
	/** NESTED `X A X B X C X` and TWO-SIDED ORPHAN `…DA X B X CD…` back to one text (the regex reads it). */
	const collapse = (list: Tok[]): Tok[] => {
		let current = list, changed = true;
		while (changed) {
			changed = false;
			const next: Tok[] = [];
			for (let i = 0; i < current.length;) {
				const t = current;
				const outer = t[i];
				if (isOpen(outer)) {
					const spec = specOf(outer.mark);
					const [a, inner, b, innerClose, c, outerClose] = [t[i + 1], t[i + 2], t[i + 3], t[i + 4], t[i + 5], t[i + 6]];
					if (spec && isText(a) && isOpen(inner, outer.mark) && isText(b) && isClose(innerClose, outer.mark) && isText(c) && isClose(outerClose, outer.mark)
						&& sideSafe(content(a), spec.delimiter) && middleSafe(content(b), spec.delimiter) && sideSafe(content(c), spec.delimiter)) {
						next.push({ kind: "text", at: [outer, a, inner, b, innerClose, c, outerClose].flatMap(atOf) });
						i += 7; changed = true; continue;
					}
				}
				const [lead, open, mid, close, trail] = [t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4]];
				if (isText(lead) && isOpen(open) && isText(mid) && isClose(close, open.mark) && isText(trail)) {
					const spec = specOf(open.mark);
					if (spec) {
						const d = spec.delimiter, leadText = content(lead), trailText = content(trail);
						const left = leadText.indexOf(d), right = trailText.indexOf(d);
						if (left >= 0 && left === leadText.lastIndexOf(d) && right >= 0 && right === trailText.lastIndexOf(d)) {
							const body = leadText.slice(left + d.length), tail = trailText.slice(0, right);
							if (sideSafe(body, d) && middleSafe(content(mid), d) && sideSafe(tail, d)) {
								next.push({ kind: "text", at: [lead, open, mid, close, trail].flatMap(atOf) });
								i += 5; changed = true; continue;
							}
						}
					}
				}
				next.push(t[i]);
				i++;
			}
			current = next;
		}
		return current;
	};
	let current = collapse(tokens), changed = true;
	while (changed) {
		changed = false;
		const next: Tok[] = [];
		for (let i = 0; i < current.length;) {
			const openText = current[i], innerOpen = current[i + 1];
			const spec = isText(openText) ? SPECS.find(s => content(openText).endsWith(s.delimiter)) : undefined;
			// Only when markdown-it parsed a different inner mark and left the outer delimiter as text.
			if (spec && isText(openText) && isOpen(innerOpen) && !spec.marks.includes(innerOpen.mark)) {
				let depth = 1, closeIndex = -1;
				for (let k = i + 2; k < current.length; k++) {
					const tok = current[k];
					if (isOpen(tok, innerOpen.mark)) depth++;
					else if (isClose(tok, innerOpen.mark) && --depth === 0) { closeIndex = k; break; }
				}
				const closeText = closeIndex >= 0 ? current[closeIndex + 1] : undefined;
				if (closeIndex >= 0 && isText(closeText) && content(closeText).startsWith(spec.delimiter)) {
					const n = spec.delimiter.length;
					if (openText.at.length > n) next.push({ kind: "text", at: openText.at.slice(0, -n) });
					// The synthesized marks (`***` as strong then em, Nyoze's order): the first open and the last
					// close hold the delimiter run's offsets.
					spec.marks.forEach((mark, k) => next.push({ kind: "open", mark, at: k === 0 ? openText.at.slice(-n) : [] }));
					for (let k = i + 1; k <= closeIndex; k++) next.push(current[k]);
					[...spec.marks].reverse().forEach((mark, k) => next.push({ kind: "close", mark, at: k === spec.marks.length - 1 ? closeText.at.slice(0, n) : [] }));
					if (closeText.at.length > n) next.push({ kind: "text", at: closeText.at.slice(n) });
					i = closeIndex + 2; changed = true; continue;
				}
			}
			next.push(current[i]);
			i++;
		}
		if (changed) current = collapse(next);
	}
	return current;
}

// ---- Nyoze's fallback regex (fallbackEmphasis.ts) without the underline branch ----
const FALLBACK = /(?:[｜|]([^｜|《》]+?)|([一-鿿々㐀-䶿]+?))《([^》]+?)》|｟([A-Za-z0-9!?]{1,4})｠|==([^=\n]+)==|\*\*\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*\*\*|\*\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*\*|(?<!\*)\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*(?!\*)|~~([^ ~\n][^~\n]*[^ ~\n]|[^ ~\n])~~/g;
const FALLBACK_FORMATS: readonly [number, number, InlineFormat[]][] = [[5, 2, ["highlight"]], [6, 3, ["strong", "em"]], [7, 2, ["strong"]], [8, 1, ["em"]], [9, 2, ["strike"]]];

/** Nyoze's `addTextWithAozora` on a text token: the regex's formats, recursively inside each match. */
function readText(text: string, at: readonly number[], masked: ReadingMask, formats: number, out: Int8Array): void {
	const content = contentOf(text, at, masked);
	const plain = (a: number, b: number) => { for (let k = a; k < b; k++) out[at[k]] = formats; };
	if (!/[*~=]/.test(content)) { plain(0, content.length); return; }
	const regex = new RegExp(FALLBACK.source, "g");
	let last = 0, match: RegExpExecArray | null;
	while ((match = regex.exec(content))) {
		plain(last, match.index);
		const found = FALLBACK_FORMATS.find(([group]) => match?.[group] !== undefined);
		if (found) {
			const [, width, added] = found, start = match.index, end = start + match[0].length;
			for (let k = start; k < start + width; k++) out[at[k]] = HIDDEN;
			for (let k = end - width; k < end; k++) out[at[k]] = HIDDEN;
			readText(text, at.slice(start + width, end - width), masked, added.reduce((bits, f) => bits | FORMAT_BIT[f], formats), out);
		} else plain(match.index, match.index + match[0].length);
		last = regex.lastIndex;
	}
	plain(last, content.length);
}


/** Pure line reading. Collector-owned syntax is opaque; all output positions remain source positions. */
export function readInline(line: string, ranges: LocalRanges = {}): InlineReading {
	const formats = new Int8Array(line.length), syntax = new Uint8Array(line.length), from = Math.max(0, ranges.from ?? 0);
	if (from >= line.length || !/[*_~=`\\<%]/.test(line.slice(from))) return { formats, syntax };
	const opaque = new Uint8Array(line.length);
	for (const r of ranges.opaque ?? []) for (let p = Math.max(from, r.from); p < Math.min(line.length, r.to); p++) opaque[p] = 1;
	const escapes = new Set<number>(), tokens = tokenize(line, from, ranges, escapes, opaque), escapedGlyphs = new Set<number>();
	for (const p of escapes) { formats[p] = HIDDEN; escapedGlyphs.add(p + 1); }
	// D-M16-4: every escaped ASCII punctuation stays literal, including ~ and = in Nyoze fallback.
	const masked: ReadingMask = { escaped: escapedGlyphs, opaque }, marks: Mark[] = [];
	const current = () => marks.reduce((bits, mark) => bits | FORMAT_BIT[mark], 0);
	const SYNTAX = { "link-open": Syntax.LinkOpen, "link-close": Syntax.LinkClose, atom: Syntax.Atom } as const;
	for (const tok of rescueOrphanDelimiters(line, tokens, masked)) {
		if (tok.kind === "text") readText(line, tok.at, masked, current(), formats);
		else if (tok.kind === "open") { for (const p of tok.at) formats[p] = HIDDEN; marks.push(tok.mark); }
		else if (tok.kind === "close") { for (const p of tok.at) formats[p] = HIDDEN; for (let k = marks.length - 1; k >= 0; k--) if (marks[k] === tok.mark) marks.splice(k, 1); }
		else if (tok.kind === "code") { const bits = current() | FORMAT_BIT.code; for (let p = tok.from; p < tok.to; p++) formats[p] = bits; for (const [a, b] of tok.marks) for (let p = a; p < b; p++) formats[p] = HIDDEN; }
		else { const bits = current(); for (let p = tok.from; p < tok.to; p++) { syntax[p] = SYNTAX[tok.kind]; formats[p] = bits; } }
	}
	return { formats, syntax };
}

const CLASS_OF: readonly [number, string][] = [[1, "tategaki-md-strong"], [2, "tategaki-md-em"], [4, "tategaki-md-strike"], [8, "tategaki-md-highlight"], [16, "tategaki-md-code"]];
/**
 * `buildInlineSegmentsFallback`'s shape (`source/inline-formatting.ts`): the shown runs with their
 * format classes, the hidden delimiters left out; null when nothing is formatted or hidden.
 * `contentFrom`: where the line's own text starts (after a heading's, list item's or quote's marker).
 */
export function buildInlineSegmentsReading(absFrom: number, absTo: number, lineText: string, ranges: InlineReadingRanges = {}): RenderSegment[] | null {
	void absTo;
	const from = Math.max(0, ranges.contentFrom ?? 0);
	if (from >= lineText.length || !/[*_~=`\\<%]/.test(lineText.slice(from))) return null;
	const { formats } = readInline(lineText, relativeRanges(absFrom, lineText, ranges));
	if (formats.every(f => f === 0)) return null;
	const segments: RenderSegment[] = [];
	let start = -1, key = 0;
	const flush = (end: number) => {
		if (start < 0) return;
		segments.push({ from: absFrom + start, to: absFrom + end, text: lineText.slice(start, end), classNames: ["tategaki-sot-run", ...CLASS_OF.filter(([bit]) => key & bit).map(([, name]) => name)] });
		start = -1;
	};
	for (let p = 0; p <= lineText.length; p++) {
		const f = p < lineText.length ? formats[p] : HIDDEN;
		if (f === HIDDEN) { flush(p); continue; }
		if (start >= 0 && f !== key) flush(p);
		if (start < 0) { start = p; key = f; }
	}
	return segments;
}
