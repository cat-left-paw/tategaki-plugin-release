import { definitionLine } from "../source/line-decoration";
import { canonicalChanges, lineStartAt, mapSourcePosition, type SourceChange } from "./source-change";

/**
 * The source side of the edit check (M2-1 review B-1, B-2, S-4): the notations of a line whose hidden
 * part says where they go — a link's URL and title, a reference link's label, a wikilink's or an
 * embed's target, a footnote reference's id, an autolink's URL, an image's URL. The display check
 * (§5.4) cannot see an image without alt text, a link's title or label, or a target that follows the
 * text; this inventory is read from the source before and after an edit, and every notation the edit
 * does not mean to remove must still be there, pointing to the same place.
 */
export type NotationKind = "embed" | "image" | "wiki" | "footnote" | "link" | "reflink" | "shortcut" | "autolink" | "inlineFootnote";
export interface NotationElement {
	readonly kind: NotationKind;
	/** The whole notation, source offsets. */
	readonly from: number;
	readonly to: number;
	/** Its shown text (empty for an image without alt text). */
	readonly textFrom: number;
	readonly textTo: number;
	/** What it points to (target, URL and title, label, id). */
	readonly key: string;
	/** Its target is its text: editing the text inside it moves the target (an autolink, a wikilink or embed without alias). */
	readonly follows: boolean;
}

/**
 * The line with what is not notation blanked (same length): escaped characters and code spans (a run
 * of backticks opens one only when a run of the same length closes it later). The notation inside
 * them is text.
 */
function blanked(line: string): string {
	const text = line.replace(/\\[\s\S]/g, "\u0000\u0000"), chars = text.split(""), code = codeSpans(text);
	for (let i = 0; i < chars.length; i++) if (code[i]) chars[i] = "\u0000";
	return chars.join("");
}
/** Which characters of a line (escapes already blanked) are in a code span, its backticks included. */
function codeSpans(text: string): boolean[] {
	const inside: boolean[] = new Array<boolean>(text.length).fill(false);
	const runs: { at: number; length: number }[] = [], ticks = /`+/g;
	for (let m = ticks.exec(text); m; m = ticks.exec(text)) runs.push({ at: m.index, length: m[0].length });
	for (let i = 0; i < runs.length; i++) {
		const close = runs.findIndex((run, j) => j > i && run.length === runs[i].length);
		if (close < 0) continue;
		for (let k = runs[i].at; k < runs[close].at + runs[close].length; k++) inside[k] = true;
		i = close;
	}
	return inside;
}

// A link's or a footnote's text may hold one level of brackets (`[a[b]c](u)`; M2-1 review 3 S-A).
const LINK_TEXT = String.raw`((?:[^\[\]\n]|\[[^\[\]\n]*\])*)`;
const NOTATION = new RegExp([
	String.raw`!\[\[([^\]\n]*)\]\]`,
	String.raw`!\[` + LINK_TEXT + String.raw`\]\(([^)\n]*)\)`,
	String.raw`\[\[([^\]\n]*)\]\]`,
	String.raw`\[\^([^\]\n]+)\]`,
	String.raw`\[` + LINK_TEXT + String.raw`\]\(([^)\n]*)\)`,
	String.raw`\[` + LINK_TEXT + String.raw`\]\[([^\]\n]*)\]`,
	String.raw`<([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s<>]+|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>`,
	String.raw`\[([^\]\n]+)\]`,
	String.raw`\^\[` + LINK_TEXT + String.raw`\]`,
].join("|"), "g");

/** How many `**` marks the line has outside code spans (an odd count leaves one unclosed). */
export function strongMarks(line: string): number {
	return blanked(line).match(/\*\*/g)?.length ?? 0;
}

/** Whether a reference link's label is defined in the document (only then is it shown as a link). */
export type LabelDefined = (label: string) => boolean;

/**
 * `text` (the lines of `line`, already blanked) with the `[label]:` of each definition line (`[^1]: note`, `[注]: text`) blanked too: M1-7 (D-M17-6) shows it as plain characters, not
 * as a footnote reference or a shortcut link, so it is no notation (and nothing that starts in it reaches out of it).
 */
function withoutDefinitionLabels(text: string, line: string): string {
	let out = text, lineFrom = 0;
	for (const one of line.split("\n")) {
		const definition = definitionLine(one);
		if (definition) out = out.slice(0, lineFrom + definition.labelFrom) + "\u0000".repeat(definition.labelTo - definition.labelFrom) + out.slice(lineFrom + definition.labelTo);
		lineFrom += one.length + 1;
	}
	return out;
}

/** The notations of one line (`line` starts at source offset `at`). Reference links count only when `defined`. */
export function lineNotations(line: string, at: number, defined: LabelDefined = () => false): NotationElement[] {
	const out: NotationElement[] = [], text = withoutDefinitionLabels(blanked(line), line);
	NOTATION.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = NOTATION.exec(text))) {
		const match = m, from = at + match.index, to = from + match[0].length;
		const raw = (group: number, offset: number) => line.slice(match.index + offset, match.index + offset + (match[group]?.length ?? 0));
		if (m[1] !== undefined) {
			const inner = raw(1, 3), bar = inner.indexOf("|");
			out.push({ kind: "embed", from, to, textFrom: from + 3, textTo: to - 2, key: inner, follows: bar < 0 });
		} else if (m[2] !== undefined) {
			out.push({ kind: "image", from, to, textFrom: from + 2, textTo: from + 2 + m[2].length, key: raw(3, 4 + m[2].length), follows: false });
		} else if (m[4] !== undefined) {
			const inner = raw(4, 2), bar = inner.indexOf("|");
			const textFrom = bar < 0 ? from + 2 : from + 3 + bar;
			out.push({ kind: "wiki", from, to, textFrom, textTo: to - 2, key: bar < 0 ? inner : inner.slice(0, bar), follows: bar < 0 });
		} else if (m[5] !== undefined) {
			out.push({ kind: "footnote", from, to, textFrom: from + 2, textTo: to - 1, key: raw(5, 2), follows: false });
		} else if (m[6] !== undefined) {
			out.push({ kind: "link", from, to, textFrom: from + 1, textTo: from + 1 + m[6].length, key: raw(7, 3 + m[6].length), follows: false });
		} else if (m[8] !== undefined) {
			const label = raw(9, 3 + m[8].length) || raw(8, 1);
			if (defined(label)) out.push({ kind: "reflink", from, to, textFrom: from + 1, textTo: from + 1 + m[8].length, key: label, follows: false });
		} else if (m[10] !== undefined) {
			out.push({ kind: "autolink", from, to, textFrom: from + 1, textTo: to - 1, key: raw(10, 1), follows: true });
		} else if (m[11] !== undefined) {
			// A shortcut reference link `[label]` (its text is its label).
			const label = raw(11, 1);
			if (defined(label)) out.push({ kind: "shortcut", from, to, textFrom: from + 1, textTo: to - 1, key: label, follows: true });
		} else {
			// An inline footnote `^[text]` (it points nowhere: it must only stay one).
			out.push({ kind: "inlineFootnote", from, to, textFrom: from + 2, textTo: to - 1, key: "", follows: false });
		}
	}
	return out;
}

/** Lines that show their source as it is (no inline notation). */
export const PLAIN_KINDS: ReadonlySet<string> = new Set(["code", "code-fence", "frontmatter", "frontmatter-fence", "math", "math-fence"]);

/**
 * What an edit means to change, in the old source: the source of the shown units it removes (a
 * grapheme, a Ruby, a footnote reference, a range from its first to its last shown character, a line
 * break with the joined line's marker), or, for an insertion (`insert`), the hidden run where the text
 * or line break goes (a point when the caret is inside text).
 */
export interface EditIntent { readonly from: number; readonly to: number; readonly insert: boolean }

/**
 * The old document's lines: their kinds and starts (code and math lines show no notation), its
 * reference labels, and whether a character of it shows (in the display's text, a Ruby, a TCY or math).
 */
export interface LineTable {
	readonly kinds: readonly string[];
	readonly ranges: readonly { readonly from: number }[];
	readonly defined: LabelDefined;
	readonly shown: (offset: number) => boolean;
	/**
	 * Whether a shown character of it has a format of the text (strong, em, code, strike, highlight), or,
	 * with `mark`, the format that mark character writes (`*` strong or em, `~` strike, `=` highlight,
	 * `` ` `` code). Inline math counts as formatted (whether a format holds it is not shown).
	 */
	readonly formatted: (offset: number, mark?: string) => boolean;
	/** The formats of a shown character of it (strong, em, code, strike, highlight), empty for inline math. */
	readonly formatsAt: (offset: number) => ReadonlySet<string>;
	/** Whether a character of it is inline math's source. */
	readonly math: (offset: number) => boolean;
}

/**
 * The shown part of a notation's text: from its first shown character to its last (the marks of a
 * format around them are not part of it, `[**a**](u)`), or null when none of it shows.
 */
export function shownPart(element: NotationElement, shown: (offset: number) => boolean): { from: number; to: number } | null {
	let from = element.textFrom, to = element.textTo;
	while (from < to && !shown(from)) from++;
	while (to > from && !shown(to - 1)) to--;
	return from < to ? { from, to } : null;
}

/** The characters of the format marks (strong, em, strike, highlight, code). */
export const MARK_CHARS = "*_~=`";

interface MarkAt { readonly char: string; readonly hidden: boolean }
/**
 * A character of a word (not a space, punctuation or symbol, as CommonMark reads them): `_` between
 * two of them is text in CommonMark (`snake_case`).
 */
export const wordChar = (c: string | undefined) => !!c && !/[\s\p{P}\p{S}]/u.test(c);
/** Whether offset `pos` of `source` is a `_` of a run inside a word (text in CommonMark, though M1 hides it). */
export function literalUnderscore(source: string, pos: number): boolean {
	if (source[pos] !== "_") return false;
	let a = pos, b = pos;
	while (source[a - 1] === "_") a--;
	while (source[b + 1] === "_") b++;
	return wordChar(source[a - 1]) && wordChar(source[b + 1]);
}
/**
 * The format mark at old offset `pos`, or null: a mark character not escaped and not inside a code
 * span (a backtick inside one counts: it changes the length of the run it meets), outside code and
 * math lines, and not a run of `_` inside a word (M1 shows `snake_case` with `case` in italics, but
 * CommonMark reads its `_` as text: they must not go; M2-1 review 4 S-C); `hidden` when the display
 * does not show it.
 */
function markReader(source: string, table: LineTable): (pos: number) => MarkAt | null {
	const lines = new Map<number, { escaped: string; text: string; plain: boolean }>();
	return pos => {
		if (pos < 0 || pos >= source.length) return null;
		const ch = source[pos];
		if (!MARK_CHARS.includes(ch)) return null;
		const from = lineStartAt(source, pos);
		let line = lines.get(from);
		if (!line) {
			const end = source.indexOf("\n", from), text = source.slice(from, end < 0 ? source.length : end);
			line = { escaped: text.replace(/\\[\s\S]/g, "\u0000\u0000"), text: blanked(text), plain: PLAIN_KINDS.has(table.kinds[lineIndexAt(table, from)] ?? "") };
			lines.set(from, line);
		}
		if (line.plain || (ch === "`" ? line.escaped : line.text)[pos - from] !== ch) return null;
		if (literalUnderscore(source, pos)) return null;
		return { char: ch, hidden: !table.shown(pos) };
	};
}

/**
 * Whether a change (canonical) removes source between two runs of the same mark character, at least
 * one of them hidden, which then meet (`**a**x**b**` without its x is `**a****b**`, `a**b**` without its
 * b `a****`, `` x``a`b``y `` without its b `` x``a```y ``): CommonMark reads the two as one run, and
 * shows it as text (M2-1 review 3 B-3, m-B). Removing part of one run is not a seam.
 */
function isSeam(old: string, change: SourceChange, marks: (pos: number) => MarkAt | null, table: LineTable): boolean {
	if (change.insert || change.from === change.to) return false;
	const left = marks(change.from - 1), right = marks(change.to);
	if (!left || !right || left.char !== right.char || (!left.hidden && !right.hidden)) return false;
	// A hidden run that delimits no format (M1 hides an unclosed `**`, `a**`) is text in CommonMark:
	// two of them meeting (`a**` and `**b` joined) are no seam to take away (M2-1 review 6 S-N).
	const run = (at: number, step: -1 | 1) => { let p = at; while (marks(p + step)?.char === left.char) p += step; return p; };
	if (!delimits(old, run(change.from - 1, -1), change.from - 1, table) || !delimits(old, change.to, run(change.to, 1), table)) return false;
	for (let i = change.from; i < change.to; i++) if (old[i] !== left.char) return true;
	return false;
}
/**
 * Whether the hidden run `[from, to]` (old offsets) delimits a format: the nearest shown character on
 * either side of it, in its line, has one.
 */
function delimits(old: string, from: number, to: number, table: LineTable): boolean {
	// The format of the run's own mark (a `**` next to struck text delimits nothing; M2-1 review 7 S-Q).
	const mark = old[from];
	for (let p = from - 1; p >= 0 && old[p] !== "\n"; p--) if (table.shown(p)) { if (table.formatted(p, mark)) return true; break; }
	for (let p = to + 1; p < old.length && old[p] !== "\n"; p++) if (table.shown(p)) return table.formatted(p, mark);
	return false;
}

/** Whether the edit makes two runs of the same mark meet (see `isSeam`). */
export function hasSeam(old: string, changes: readonly SourceChange[], table: LineTable): boolean {
	const marks = markReader(old, table);
	return canonicalChanges(changes, old.length).some(change => isSeam(old, change, marks, table));
}
/**
 * Whether every hidden mark run of the edited lines that delimits no format (M1 hides `**x**b**`'s
 * last `**`; CommonMark shows it as text) and that the edit keeps still delimits none afterwards: a
 * wide edit that takes the closing `**` of `**x**` with `b` would let that `**` close it, the
 * author's typed `**` gone without a trace (M2-1 review 7 S-P). And every kept run that wraps one
 * inline math with another run of its mark (`**$x$**`: M1 shows no format on math, so the display
 * check cannot see it) stays right next to that math: a break between `**` and `$x$` would leave the
 * `**` as text (`前**\n$x$**`). `now` and `table` are the new source and its display.
 */
export function keepsInertRuns(old: string, oldTable: LineTable, changes: readonly SourceChange[], now: string, newTable: LineTable): boolean {
	const canonical = canonicalChanges(changes, old.length);
	if (!canonical.length) return true;
	const marks = markReader(old, oldTable), start = lineStartAt(old, canonical[0].from);
	const lineEnd = old.indexOf("\n", canonical[canonical.length - 1].to), end = lineEnd < 0 ? old.length : lineEnd;
	const removed = (p: number) => canonical.some(c => c.from <= p && p < c.to);
	for (let p = start; p < end; p++) {
		const at = marks(p);
		if (!at?.hidden) continue;
		let q = p;
		while (marks(q + 1)?.char === at.char) q++;
		const inert = !delimits(old, p, q, oldTable), math = wrappedMath(old, p, q, oldTable);
		if (inert || math.before || math.after) {
			let kept = true;
			for (let i = p; i <= q; i++) if (removed(i)) kept = false;
			if (kept) {
				const from = mapSourcePosition(canonical, p, 1, old.length), to = mapSourcePosition(canonical, q, 1, old.length);
				if (inert && now[from] === at.char && delimits(now, from, to, newTable)) return false;
				const still = wrappedMath(now, from, to, newTable, false);
				if ((math.before && !still.before) || (math.after && !still.after)) return false;
			}
		}
		p = q;
	}
	return true;
}

/**
 * Whether the edited lines have no more inline math between two runs of one mark of unlike lengths
 * than before (M1 shows no format on math: a wide edge that splits a run, or a kept run that comes to
 * the math, shows the same; `**a**x***$y$***` without x is `**a*$y$***`, `***a***\n**$x$**` without
 * `a\n` is `***$x$**`, CommonMark's `*` as text; M2-1 review 9 B-10).
 */
export function keepsEvenMath(old: string, oldTable: LineTable, changes: readonly SourceChange[], now: string, newTable: LineTable): boolean {
	const canonical = canonicalChanges(changes, old.length);
	if (!canonical.length) return true;
	const start = lineStartAt(old, canonical[0].from), lineEnd = old.indexOf("\n", canonical[canonical.length - 1].to), end = lineEnd < 0 ? old.length : lineEnd;
	const nowEnd = now.indexOf("\n", mapSourcePosition(canonical, end, 1, old.length));
	return unevenMath(now, start, nowEnd < 0 ? now.length : nowEnd, newTable) <= unevenMath(old, start, end, oldTable);
}

/**
 * How many inline maths in `[from, to)` have runs of one mark right on both sides whose lengths differ,
 * neither of them the delimiter of the shown text on its other side (`***a*$x$**`: the `*` closes a's
 * em, the `**` the strong over both; `**a*$y$***`: the `*` is no delimiter of a, which is not em). A
 * run whose other side is math too is shared with that math's own format, as long as the run on that
 * math's far side (or, without one, the format of the text beyond it) takes what this math's other run
 * lacks (`*$x$***$x$**`: the `***` closes the first math's em, 1, and opens the second's strong, 2;
 * `*$x$**$x$**` is uneven: the `**` cannot do both; M2-1 review 10 R-1, review 11 R-2).
 */
function unevenMath(text: string, from: number, to: number, table: LineTable): number {
	const math = table.math;
	const marks = markReader(text, table), hidden = (p: number, char?: string) => { const at = marks(p); return !!at && at.hidden && (char === undefined || at.char === char); };
	// How many characters of `mark` the formats of the shown character at `p` write (`*`: strong 2, em 1; `~`, `=`: 2).
	const used = (p: number, mark: string) => { const f = table.formatsAt(p); return mark === "*" || mark === "_" ? (f.has("strong") ? 2 : 0) + (f.has("em") ? 1 : 0) : f.has(mark === "~" ? "strike" : "highlight") ? 2 : 0; };
	// Whether the nearest shown text from `at` out (`step`), in its line, has the formats a run of `length` writes.
	const delimiterOf = (at: number, step: -1 | 1, mark: string, length: number) => {
		const needed = mark === "*" || mark === "_" ? (length === 1 ? ["em"] : length === 2 ? ["strong"] : length === 3 ? ["strong", "em"] : null) : length === 2 ? [mark === "~" ? "strike" : "highlight"] : null;
		for (let p = at + step; p >= 0 && p < text.length && text[p] !== "\n"; p += step) if (table.shown(p)) { if (math(p)) return false; const formats = table.formatsAt(p); return !!needed && formats.size > 0 && needed.every(f => formats.has(f)); }
		return false;
	};
	// When the nearest shown character from `at` out is math: what of the run that math's own format
	// takes (the run of `mark` on its far side, else what the shown text beyond writes). Null otherwise.
	const sharedWithMath = (at: number, step: -1 | 1, mark: string): number | null => {
		let p = at + step;
		while (p >= 0 && p < text.length && text[p] !== "\n" && !table.shown(p)) p += step;
		if (p < 0 || p >= text.length || text[p] === "\n" || !math(p)) return null;
		while (p >= 0 && p < text.length && math(p)) p += step;
		let run = 0;
		for (; hidden(p, mark); p += step) run++;
		if (run) return run;
		for (; p >= 0 && p < text.length && text[p] !== "\n"; p += step) if (table.shown(p)) return math(p) ? 0 : used(p, mark);
		return 0;
	};
	let uneven = 0;
	for (let p = from; p < to; p++) {
		if (!math(p) || math(p - 1)) continue;
		let e = p;
		while (e < text.length && math(e)) e++;
		const mark = text[p - 1];
		if (hidden(p - 1) && hidden(e, mark)) {
			let a = p - 1, b = e;
			while (hidden(a - 1, mark)) a--;
			while (hidden(b + 1, mark)) b++;
			const before = p - a, after = b - e + 1;
			if (before !== after && !delimiterOf(a, -1, mark, before) && !delimiterOf(b, 1, mark, after)) {
				const left = sharedWithMath(a, -1, mark), right = sharedWithMath(b, 1, mark);
				const shared = (left !== null && before - left >= 1 && before - left === after) || (right !== null && after - right >= 1 && after - right === before);
				if (!shared) uneven++;
			}
		}
		p = e - 1;
	}
	return uneven;
}

/**
 * Whether hidden run `[from, to]` is right before (`after`) / after (`before`) one inline math that a
 * run of its mark closes / opens right on the math's other side: the two wrap it (`**$x$**`). Without
 * `wrapped`, whether the math is right there (the other run may have gone with a merge, `**$x$b**`).
 */
function wrappedMath(text: string, from: number, to: number, table: LineTable, wrapped = true): { before: boolean; after: boolean } {
	const mark = text[from], math = table.math;
	let before = false, after = false;
	if (math(to + 1)) { let p = to + 1; while (p < text.length && math(p)) p++; after = !wrapped || text[p] === mark; }
	if (math(from - 1)) { let p = from - 1; while (p >= 0 && math(p)) p--; before = !wrapped || (p >= 0 && text[p] === mark); }
	return { before, after };
}

/**
 * Whether old source `[from, to)` holds hidden marks that a wide edit must not take with it: a run
 * that delimits no format (M1 hides it, as `a**`; CommonMark shows it as text; M2-1 review 6 S-N),
 * more of a run than its format's delimiter (`*a***`'s `**` are text in CommonMark; review 8 S-T),
 * or part of a run that wraps inline math (whose format is not shown: `**$x$**x**$y$**` never keeps
 * one `*` of a `**`; review 8 B-9).
 */
export function holdsInertMarks(old: string, from: number, to: number, table: LineTable): boolean {
	const marks = markReader(old, table);
	const same = (pos: number, char: string) => { const at = marks(pos); return !!at && at.char === char && at.hidden; };
	for (let p = from; p < to; p++) {
		const at = marks(p);
		if (!at?.hidden) continue;
		// The whole run (it may start before `from` and end after `to`).
		let a = p, q = p;
		while (same(a - 1, at.char)) a--;
		while (same(q + 1, at.char)) q++;
		if (!delimits(old, a, q, table)) return true;
		const taken = Math.min(q, to - 1) - p + 1, math = wrappedMath(old, a, q, table);
		if (taken > delimiterLength(old, a, q, at.char, table) || (taken < q - a + 1 && (math.before || math.after))) return true;
		p = q;
	}
	return false;
}

/**
 * Whether each seam of the edit is where the runs of two formats the edit keeps meet (`**a**` and
 * `**c**`, not the empty `~~~~` of a removed format between them): a line break there keeps the two
 * formats apart (a range's Enter; M2-1 review 6 S-M).
 */
export function seamsNextToText(old: string, changes: readonly SourceChange[], table: LineTable): boolean {
	const marks = markReader(old, table), canonical = canonicalChanges(changes, old.length);
	const removed = (p: number) => canonical.some(c => c.from <= p && p < c.to);
	// The first shown character the edit keeps, out from the run (`step`), in its line: it has the
	// run's format (`**ab**x**cd**` without `xc` is `**ab****d**`: d is the next run's text; not the
	// emptied `~~~~` of `**a**x~~b~~y**c**`; M2-1 review 6 S-M, review 7 S-S).
	const ownText = (p: number, step: -1 | 1, mark: string) => {
		for (; p >= 0 && p < old.length && old[p] !== "\n"; p += step) if (table.shown(p) && !removed(p)) return table.formatted(p, mark);
		return false;
	};
	return canonical.filter(change => isSeam(old, change, marks, table)).every(change => {
		const mark = marks(change.from - 1)?.char ?? "";
		let a = change.from - 1, b = change.to;
		while (marks(a - 1)?.char === mark) a--;
		while (marks(b + 1)?.char === mark) b++;
		return ownText(a - 1, -1, mark) && ownText(b + 1, 1, mark);
	});
}
/** Where in the new text the runs that the edit makes meet touch. */
export function seamJunctions(old: string, changes: readonly SourceChange[], table: LineTable): number[] {
	const marks = markReader(old, table), canonical = canonicalChanges(changes, old.length);
	return canonical.filter(change => isSeam(old, change, marks, table)).map(change => mapSourcePosition(canonical, change.from, -1, old.length));
}

/**
 * The edit with the hidden runs that would meet at its seams taken away as far as they pair: the
 * format before and the one after become one, or the emptied one goes (`**a****b**` → `**ab**`,
 * `***a*****b**` → `***a*b**`, `a****` → `a`). From the last seam (`fromRight`) or the first: the
 * display check (§5.4) takes the one that shows as intended. Null when the edit has no seam, or one
 * with a shown run (its characters stay). `keepFirst`: all but the first seam (a range's Enter breaks
 * there: `**太**\n**ab**x**cd**` without `\nabxc` keeps `**太****d**`'s seam for `**太**\n**d**`).
 */
export function withoutSeams(old: string, changes: readonly SourceChange[], table: LineTable, fromRight: boolean, keepFirst = false): SourceChange[] | null {
	const marks = markReader(old, table);
	let current = canonicalChanges(changes, old.length), squeezed = false;
	for (let pass = 0; pass < 64; pass++) {
		const seams = current.map((_, index) => index).filter(index => isSeam(old, current[index], marks, table)).slice(keepFirst ? 1 : 0);
		if (!seams.length) break;
		const index = fromRight ? seams[seams.length - 1] : seams[0], change = current[index], mark = marks(change.from - 1)?.char;
		const floor = index > 0 ? current[index - 1].to : 0, ceil = index + 1 < current.length ? current[index + 1].from : old.length;
		const hiddenMark = (pos: number) => { const at = marks(pos); return !!at && at.char === mark && at.hidden; };
		let left = 0, right = 0;
		while (change.from - left - 1 >= floor && hiddenMark(change.from - left - 1)) left++;
		while (change.to + right < ceil && hiddenMark(change.to + right)) right++;
		// Each run whole, with the marks of it the change already takes (a wide cut may split one).
		let inLeft = 0, inRight = 0;
		while (change.from + inLeft < change.to && hiddenMark(change.from + inLeft)) inLeft++;
		while (change.to - inRight - 1 >= change.from + inLeft && hiddenMark(change.to - inRight - 1)) inRight++;
		const taken = Math.min(left, right);
		// Only the marks of the two formats meeting go: a run longer than its format's delimiter holds
		// marks that delimit nothing (`*a***` and `***b*`: the `**` of each are text in CommonMark), which
		// go neither with the change nor by the squeeze (M2-1 review 7 S-Q, review 8 S-T). Next to inline
		// math, whose format is not shown, a run goes whole or not at all (`**$x$**x**$y$**` never keeps
		// one `*` of a `**`; review 8 B-9).
		const fits = (inside: number, from: number, to: number, step: -1 | 1) => {
			const removed = inside + taken;
			return removed <= delimiterLength(old, from, to, mark ?? "", table) && (!mathOutside(old, step < 0 ? from : to, step, table) || removed === to - from + 1);
		};
		if (!taken || !fits(inLeft, change.from - left, change.from + inLeft - 1, -1) || !fits(inRight, change.to - inRight, change.to + right - 1, 1)) return null;
		current = canonicalChanges(current.map((c, i) => i === index ? { from: c.from - taken, to: c.to + taken, insert: "" } : c), old.length);
		squeezed = true;
	}
	return squeezed ? current : null;
}

/** Whether the nearest shown character from `at` out (`step`), in its line, is inline math (formatted, without a format of its own). */
function mathOutside(old: string, at: number, step: -1 | 1, table: LineTable): boolean {
	for (let p = at + step; p >= 0 && p < old.length && old[p] !== "\n"; p += step) if (table.shown(p)) return table.math(p);
	return false;
}

/**
 * How many characters of hidden run `[from, to]` (old offsets, of `mark`) the formats there may use:
 * those of the nearest shown characters on either side, in its line, added (the run may close one
 * and open the other: `*a***x***b*`'s `***`; `*`: strong 2 and em 1; `~`, `=`: 2; a backtick run:
 * all of it; next to inline math, whose format is not shown, all of it: `**漢字**\n**$x$**` joined is
 * `**漢字$x$**`). What is beyond it is text in CommonMark (`*a***`'s `**`).
 */
function delimiterLength(old: string, from: number, to: number, mark: string, table: LineTable): number {
	if (mark === "`") return Infinity;
	const lengthAt = (p: number) => {
		if (table.math(p)) return to - from + 1;
		const formats = table.formatsAt(p);
		if (mark === "*" || mark === "_") return (formats.has("strong") ? 2 : 0) + (formats.has("em") ? 1 : 0);
		return formats.has(mark === "~" ? "strike" : "highlight") ? 2 : 0;
	};
	let used = 0;
	for (let p = from - 1; p >= 0 && old[p] !== "\n"; p--) if (table.shown(p)) { used = lengthAt(p); break; }
	for (let p = to + 1; p < old.length && old[p] !== "\n"; p++) if (table.shown(p)) { used += lengthAt(p); break; }
	return used;
}

export function lineIndexAt(table: LineTable, offset: number): number {
	let lo = 0, hi = table.ranges.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (table.ranges[mid].from <= offset) lo = mid; else hi = mid - 1;
	}
	return lo;
}

/**
 * Notation left without its text or target (`[](u)`, `![](i.png)`, `[][r]`, `[[]]`, `[[A|]]`, `^[]`):
 * the display shows none of it, so an edit that makes one leaves a shell the author cannot see
 * (M2-1 review 3 B-4).
 */
const SHELL = /\[\]\(|\[\]\[|\[\[\]\]|\|\]\]|\^\[\]/g;

/** Whether the line of a text from `lineFrom` to `lineTo` shows its source as it is (code, math, frontmatter). */
type PlainLine = (lineFrom: number, lineTo: number) => boolean;

/**
 * The notations of the lines of `source` holding `[from, to]` (without its plain lines), whether one
 * of those lines has an unclosed `**`, and how many shells they have.
 */
function notationsAround(source: string, from: number, to: number, plainLine: PlainLine, defined: LabelDefined): { elements: NotationElement[]; unclosed: boolean; shells: number } {
	const start = lineStartAt(source, from);
	const endBreak = source.indexOf("\n", to), end = endBreak < 0 ? source.length : endBreak;
	const elements: NotationElement[] = [];
	let at = start, unclosed = false, shells = 0;
	for (const text of source.slice(start, end).split("\n")) {
		if (!plainLine(at, at + text.length)) {
			elements.push(...lineNotations(text, at, defined));
			unclosed ||= strongMarks(text) % 2 === 1;
			shells += blanked(text).match(SHELL)?.length ?? 0;
		}
		at += text.length + 1;
	}
	return { elements, unclosed, shells };
}

/**
 * Whether the edit makes a punctuation mark it keeps escaped that was not (`a\\` joined with `*b*` is
 * `a\\*b*`; `a\\\\*b*` without one backslash is `a\\*b*`): CommonMark then shows it as text, and the
 * format it delimited is gone. M1 does not read escapes, so the display check passes (M2-1 review 6
 * B-8, m-R). The new lines `[start, newEnd)` of `now` are compared with the old ones `[start, oldEnd)`.
 * Outside plain lines.
 */
function escapesNewly(old: string, changes: readonly SourceChange[], now: string, start: number, oldEnd: number, newEnd: number, plainAt: (offset: number) => boolean): boolean {
	// The old offset of each new offset outside the changes (an unchanged character).
	const oldAt = (pos: number): number | null => {
		let delta = 0;
		for (const change of changes) {
			const newFrom = change.from + delta;
			if (pos < newFrom) break;
			if (pos < newFrom + change.insert.length) return null;
			delta += change.insert.length - (change.to - change.from);
		}
		return pos - delta;
	};
	// A backslash in a code span escapes nothing (M2-1 review 7 m-X).
	const escaped = (text: string, from: number, to: number) => {
		const out = new Set<number>();
		let lineFrom = Math.max(0, lineStartAt(text, from)), code: boolean[] = [];
		// Escapes do not work in a code span: its backticks are found in the raw text (`` `a\` `` is one).
		const lineAt = (i: number) => { const end = text.indexOf("\n", i); code = codeSpans(text.slice(i, end < 0 ? text.length : end)); };
		lineAt(lineFrom);
		for (let i = lineFrom; i < to; i++) {
			if (text[i] === "\n") { lineFrom = i + 1; lineAt(lineFrom); continue; }
			if (text[i] === "\\" && !code[i - lineFrom]) { out.add(i + 1); i++; }
		}
		return out;
	};
	const was = escaped(old, start, oldEnd + 1);
	for (const pos of escaped(now, start, newEnd)) {
		const at = oldAt(pos);
		if (at === null || was.has(at) || !/[!-/:-@[-`{-~]/.test(old[at] ?? "") || plainAt(at)) continue;
		return true;
	}
	return false;
}

/**
 * The old offset of new offset `pos` (canonical changes): inside or at the edge of a change's new
 * text, the start (`end` false) or end of the source it replaced.
 */
function oldOffset(changes: readonly SourceChange[], pos: number, end: boolean): number {
	let delta = 0;
	for (const change of changes) {
		const newFrom = change.from + delta, newTo = newFrom + change.insert.length;
		if (pos < newFrom) break;
		if (pos <= newTo) return end ? change.to : change.from;
		delta += change.insert.length - (change.to - change.from);
	}
	return pos - delta;
}

/**
 * Whether the edit keeps every notation it does not mean to remove (M2-1 review B-1, B-2, S-4). A
 * notation goes only when the edit removes its whole shown text (or, without shown text, when it lies
 * inside the removed range). Otherwise one of the same kind pointing to the same place must be in the
 * edited lines afterwards: no edit of a notation's text changes where it points, even one whose
 * target is its text (a wikilink without alias is then written with an alias, `edit-check.ts`; an
 * autolink's, an embed's or a shortcut's text is not edited in part: the author's decision of
 * 2026-10-23, as Nyoze's links keep their target). An embed whose shown `!` the edit removes may
 * become the wikilink to the same target.
 * A removal leaves no `**` unclosed in lines whose `**` were all closed: the display hides an unclosed
 * `**` (`前**y後` shows 前y後), a hidden remain that would pair with the next `**` typed. Nor does it
 * leave a new shell (`[](u)`, which the display hides; M2-1 review 3 B-4). That it makes no two hidden
 * runs of the same mark meet (`hasSeam`, `keepsHiddenRuns`: also where a removed backslash lets an
 * escaped mark meet a run, `**a**\**b**` → `**a****b**`, review 4 B-6) the callers check with it.
 * `table`: the old document's lines (code and math lines show no notation; which characters show).
 */
export function keepsNotation(old: string, changes: readonly SourceChange[], now: string, intent: EditIntent, table: LineTable | null): boolean {
	if (!changes.length) return true;
	let from = Math.min(intent.from, ...changes.map(c => c.from)), to = Math.max(intent.to, ...changes.map(c => c.to));
	from = Math.max(0, Math.min(from, old.length)); to = Math.max(from, Math.min(to, old.length));
	const defined = table?.defined ?? (() => false);
	const plainOld = (index: number) => !!table && PLAIN_KINDS.has(table.kinds[index] ?? "");
	const { elements: before, unclosed: wasUnclosed, shells: hadShells } = notationsAround(old, from, to, at => !!table && plainOld(lineIndexAt(table, at)), defined);
	// The same lines afterwards: everything before the first change and after the last one is unchanged.
	// A new line is plain when every old line it comes from was (an edit inside a code line; not code
	// joined with text, `[リンク](u)\n```\n---` with the fence gone).
	const delta = now.length - old.length, canonical = canonicalChanges(changes, old.length);
	const start = lineStartAt(old, from), oldBreak = old.indexOf("\n", to), oldEnd = oldBreak < 0 ? old.length : oldBreak;
	const plainNew: PlainLine = (lineFrom, lineTo) => {
		if (!table) return false;
		for (let index = lineIndexAt(table, oldOffset(canonical, lineFrom, false)), last = lineIndexAt(table, oldOffset(canonical, lineTo, true)); index <= last; index++) if (!plainOld(index)) return false;
		return true;
	};
	const { elements: after, unclosed, shells } = notationsAround(now, start, Math.max(start, oldEnd + delta), plainNew, defined);
	// `**` and shells count only in lines that show notation (not in code: an edit of a code line is not checked for them).
	if (!intent.insert && ((unclosed && !wasUnclosed) || shells > hadShells)) return false;
	if (!intent.insert && escapesNewly(old, canonical, now, start, oldEnd, Math.max(start, oldEnd + delta), at => !!table && plainOld(lineIndexAt(table, at)))) return false;
	const used = new Set<number>();
	const mapped = (at: number) => mapSourcePosition(changes, at, -1, old.length);
	const take = (test: (element: NotationElement) => boolean): boolean => {
		const index = after.findIndex((element, i) => !used.has(i) && test(element));
		if (index < 0) return false;
		used.add(index);
		return true;
	};
	// Each element is paired first with one where it was (its position mapped through the changes),
	// so two pointing to the same place are not crossed (one edited, the other kept).
	const at = (element: NotationElement) => (n: NotationElement) => n.from < mapped(element.to) && mapped(element.from) < n.to;
	for (const element of before) {
		// Its shown text is all the edit removes of it (the marks of a format around the text do not count, `[**a**](u)`).
		const part = table ? shownPart(element, table.shown) : element.textTo > element.textFrom ? { from: element.textFrom, to: element.textTo } : null;
		const covered = !intent.insert && (part ? intent.from <= part.from && part.to <= intent.to : intent.from <= element.from && element.to <= intent.to);
		if (covered) continue;
		const there = at(element);
		if (take(n => n.kind === element.kind && n.key === element.key && there(n))) continue;
		if (take(n => n.kind === element.kind && n.key === element.key)) continue;
		// An embed whose shown `!` goes becomes the wikilink to the same target.
		if (element.kind === "embed" && !intent.insert && intent.from <= element.from && element.from < intent.to && take(n => n.kind === "wiki" && n.key === element.key)) continue;
		return false;
	}
	return true;
}
