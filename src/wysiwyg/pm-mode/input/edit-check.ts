import type { PmModeDocumentState } from "../pm/document-state";
import type { PMNode } from "../pm/prosemirror";
import type { SourceModelOptions } from "../source/source-model";
import { changedBlocks, sameDisplay, textFollowingTargets, visibleTokens, type DisplayExpectation } from "./display-signature";
import { normalizeLinkLabel } from "../source/inline-links";
import { hasSeam, keepsEvenMath, keepsInertRuns, keepsNotation, lineIndexAt, lineNotations, MARK_CHARS, PLAIN_KINDS, seamJunctions, seamsNextToText, withoutSeams, wordChar, type EditIntent, type LineTable } from "./notation-inventory";
import { applySourceChanges, canonicalChanges, lineStartAt, mapSourcePosition, sortChanges, type SourceChange } from "./source-change";

function lastLessOrEqual(values: ArrayLike<number>, value: number): number {
	let lo = 0, hi = values.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (values[mid] <= value) lo = mid; else hi = mid - 1;
	}
	return lo;
}
function countNewlines(text: string): number {
	let count = 0;
	for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) count++;
	return count;
}

/** The line (0-based) of a position of the new document, from the old line table and the changes. */
function newLineAt(lineStarts: readonly number[], changes: readonly SourceChange[], newPos: number): number {
	const lineOf = (oldPos: number) => lastLessOrEqual(lineStarts, oldPos);
	let lines = 0, oldAt = 0, newAt = 0;
	for (const change of changes) {
		const unchanged = change.from - oldAt;
		if (newPos <= newAt + unchanged) return lines + lineOf(oldAt + newPos - newAt) - lineOf(oldAt);
		lines += lineOf(change.from) - lineOf(oldAt);
		newAt += unchanged;
		if (newPos <= newAt + change.insert.length) return lines + countNewlines(change.insert.slice(0, newPos - newAt));
		lines += countNewlines(change.insert);
		newAt += change.insert.length;
		oldAt = change.to;
	}
	return lines + lineOf(oldAt + newPos - newAt) - lineOf(oldAt);
}

/**
 * The folded heading lines after the changes: the same rule as the follower's
 * `shiftCollapsedForUpdate` (obsidian/session.ts), from plain changes. A heading whose text is
 * gone (its mapped end not after its mapped start) is dropped.
 */
export function mapCollapsedHeadingLines(state: PmModeDocumentState, collapsed: ReadonlySet<number>, changes: readonly SourceChange[]): Set<number> {
	const length = state.source.length, canonical = canonicalChanges(changes, length);
	const lineStarts = state.lineRanges.map(range => range.from);
	const mapped = new Set<number>();
	for (const line of collapsed) {
		const range = state.lineRanges[line];
		if (!range) continue;
		const start = mapSourcePosition(changes, range.from, 1, length), end = mapSourcePosition(changes, range.to, -1, length);
		if (end <= start) continue;
		mapped.add(newLineAt(lineStarts, canonical, start));
	}
	return mapped;
}

/** A source edit to try, with what it is for (a report note). */
export interface Candidate { readonly changes: readonly SourceChange[]; readonly note: string }
/** A candidate that displays as intended, with the display state it gives (the follower can reuse it). */
export interface CheckedEdit {
	readonly changes: readonly SourceChange[];
	readonly note: string;
	readonly source: string;
	readonly options: SourceModelOptions;
	readonly after: PmModeDocumentState;
}

export function applyCandidate(state: PmModeDocumentState, options: SourceModelOptions, candidate: Candidate, applied?: string): CheckedEdit {
	const source = applied ?? applySourceChanges(state.source, candidate.changes);
	const mapped: SourceModelOptions = { collapsedHeadingLines: mapCollapsedHeadingLines(state, options.collapsedHeadingLines, candidate.changes), settings: options.settings };
	const after = state.update(source, mapped).state;
	// The folds the line model keeps (the session keeps the same set, obsidian/session.ts).
	return { changes: candidate.changes, note: candidate.note, source, options: { ...mapped, collapsedHeadingLines: new Set(after.lineModel.collapsedHeadingLines) }, after };
}

/** The marks of a format of the text itself. */
const TEXT_FORMATS: ReadonlySet<string> = new Set(["strong", "em", "code", "strike", "highlight"]);
/** The formats each mark character writes. */
const FORMATS_OF: Readonly<Record<string, ReadonlySet<string>>> = { "*": new Set(["strong", "em"]), _: new Set(["strong", "em"]), "~": new Set(["strike"]), "=": new Set(["highlight"]), "`": new Set(["code"]) };
/** The old document's line table for the notation inventory. */
export function lineTable(state: PmModeDocumentState): LineTable {
	const references = state.lineModel.linkReferenceMap, map = state.sourceMap;
	const shown = (offset: number) => {
		if (offset < 0 || offset >= state.source.length) return false;
		const block = map.blockAtSource(offset);
		return block.type === "line" && (block.runs.some(run => run.from <= offset && offset < run.to) || block.inlines.some(inline => inline.from <= offset && offset < inline.to));
	};
	/**
	 * The text node of a shown character (a Ruby's or TCY's own text: `**｜漢字《かんじ》**`), "math", or
	 * null. Found in its line (the doc's own lookup walks every block before it).
	 */
	const textAt = (offset: number): PMNode | "math" | null => {
		const index = map.blockIndexAtSource(offset), block = map.blockAtSource(offset);
		if (block.type !== "line") return null;
		const run = block.runs.find(r => r.from <= offset && offset < r.to);
		const inline = run ? undefined : block.inlines.find(i => i.from <= offset && offset < i.to);
		if (inline?.kind === "inlineMath") return "math";
		const line = state.doc.child(index), start = map.pmFrom[index] + 1;
		let node = run ? line.nodeAt(run.pmFrom + offset - run.from - start) : inline ? line.nodeAt(inline.pmFrom - start) : null;
		while (node && !node.isText && node.marks.length === 0 && node.firstChild) node = node.firstChild;
		return node;
	};
	const formatted = (offset: number, mark?: string) => {
		const node = textAt(offset);
		// Inline math carries no marks of its own: whether a format holds it is not known, so it counts as
		// formatted (`**$x$**`'s `**` delimit; M2-1 review 7 S-R).
		if (node === "math") return true;
		const names = mark === undefined ? TEXT_FORMATS : FORMATS_OF[mark] ?? TEXT_FORMATS;
		return !!node && node.marks.some(m => names.has(m.type.name));
	};
	const formatsAt = (offset: number): ReadonlySet<string> => {
		const node = textAt(offset);
		return new Set(node && node !== "math" ? node.marks.map(m => m.type.name).filter(name => TEXT_FORMATS.has(name)) : []);
	};
	const math = (offset: number) => {
		if (offset < 0 || offset >= state.source.length) return false;
		const block = map.blockAtSource(offset);
		return block.type === "line" && block.inlines.some(inline => inline.kind === "inlineMath" && inline.from <= offset && offset < inline.to);
	};
	return { kinds: state.lineModel.lineBlockKinds, ranges: state.lineRanges, defined: label => references.has(normalizeLinkLabel(label)), shown, formatted, formatsAt, math };
}
/**
 * Whether the candidate keeps the notations it does not mean to remove (the source side of §5.4; M2-1
 * review B-1) and makes no two hidden runs of the same mark meet (review 3 B-3).
 */
export function keepsNotationOf(state: PmModeDocumentState, changes: readonly SourceChange[], source: string, intent: EditIntent): boolean {
	const table = lineTable(state);
	return keepsNotation(state.source, changes, source, intent, table) && !hasSeam(state.source, changes, table);
}

/**
 * The first candidate whose display is the expected one (§5.4) and that keeps every notation the
 * edit does not mean to remove (`intent`), or null. The notation check is read from the source
 * only, so it goes first (a candidate it refuses costs no display update). A candidate that makes two
 * hidden runs of the same mark meet is tried without them (`withoutSeamsOf`), unless `keepSeams`: the
 * first step of a range's Enter, whose break may go between them (the whole is checked then).
 */
export function firstExact(state: PmModeDocumentState, options: SourceModelOptions, candidates: readonly Candidate[], expected: DisplayExpectation, intent: EditIntent, keepSeams = false): CheckedEdit | null {
	// Links of the edited blocks whose target followed their text (an autolink's text edited).
	const following = textFollowingTargets(state.doc, expected.doc);
	const table = lineTable(state);
	for (const given of candidates) for (const tried of keepSeams ? withFirstSeamOf(state, table, withAliasOf(state, table, given) ?? given) : withoutSeamsOf(state, table, withAliasOf(state, table, given) ?? given)) {
		// Kept seams: one place at most, where the break may go (M2-1 review 5 S-J).
		if (keepSeams && (seamJunctions(state.source, tried.changes, table).length > 1 || !seamsNextToText(state.source, tried.changes, table))) continue;
		const source = applySourceChanges(state.source, tried.changes);
		if (!keepsNotation(state.source, tried.changes, source, intent, table)) continue;
		const edit = applyCandidate(state, options, tried, source);
		// The first step of a range's Enter may keep a seam beside math (`**$x$****d**`): its whole is checked.
		if (sameDisplay(expected, edit.after.doc, following) && (keepSeams || keepsHiddenRuns(state, tried.changes, edit.after)) && keepsInertRuns(state.source, table, tried.changes, source, lineTable(edit.after)) && (keepSeams || keepsEvenMath(state.source, table, tried.changes, source, lineTable(edit.after)))) return edit;
	}
	return null;
}

/**
 * Whether no run of hidden marks of one character in the edited lines is longer afterwards than the
 * longest such run they had: the last check of what the display hides (two runs that met where no
 * seam showed: `1. ~~a~~x~~b~~y~~c~~\n2. d`, the range `xby`, broken as `2. ~~~~~~c~~`; M2-1 review 4
 * B-5). A run of `_` inside a word is text (CommonMark), not a mark.
 */
export function keepsHiddenRuns(before: PmModeDocumentState, changes: readonly SourceChange[], after: PmModeDocumentState): boolean {
	const canonical = canonicalChanges(changes, before.source.length);
	if (!canonical.length) return true;
	const old = before.source, from = lineStartAt(old, canonical[0].from);
	const lineEnd = old.indexOf("\n", canonical[canonical.length - 1].to), to = lineEnd < 0 ? old.length : lineEnd;
	// Before, every run counts (a `_` inside a word may come to a line's start, `_case_name`); after, not
	// the runs of `_` inside a word (`snake__name`, text).
	const longest = new Map<string, number>();
	hiddenRuns(before, from, to, true, (mark, length) => longest.set(mark, Math.max(length, longest.get(mark) ?? 0)));
	let grows = false;
	hiddenRuns(after, from, to + after.source.length - old.length, false, (mark, length) => { grows ||= length > (longest.get(mark) ?? 0); });
	return !grows;
}
/** `keepsHiddenRuns`, `keepsInertRuns` (hidden marks that delimit nothing stay so) and `keepsEvenMath`. */
export function keepsHiddenMarks(before: PmModeDocumentState, changes: readonly SourceChange[], after: PmModeDocumentState): boolean {
	const oldTable = lineTable(before), newTable = lineTable(after);
	return keepsHiddenRuns(before, changes, after) && keepsInertRuns(before.source, oldTable, changes, after.source, newTable) && keepsEvenMath(before.source, oldTable, changes, after.source, newTable);
}
/** A two-step edit as a whole: no runs that meet (`keepsHiddenRuns`) and no math between unlike runs (`keepsEvenMath`). */
export function keepsComposedMarks(before: PmModeDocumentState, changes: readonly SourceChange[], after: PmModeDocumentState): boolean {
	return keepsHiddenRuns(before, changes, after) && keepsEvenMath(before.source, lineTable(before), changes, after.source, lineTable(after));
}
/** Each run of hidden marks of one character in source `[from, to)` of `state` (a run of `_` inside a word only with `inWord`). */
function hiddenRuns(state: PmModeDocumentState, from: number, to: number, inWord: boolean, each: (mark: string, length: number) => void): void {
	const source = state.source, shown = lineTable(state).shown;
	for (let p = from; p < to;) {
		const mark = source[p];
		if (!MARK_CHARS.includes(mark) || shown(p)) { p++; continue; }
		let q = p;
		while (q < to && source[q] === mark && !shown(q)) q++;
		if (inWord || !(mark === "_" && wordChar(source[p - 1]) && wordChar(source[q]))) each(mark, q - p);
		p = q;
	}
}

/**
 * A candidate that edits the shown text of a wikilink without alias, written with the new text as
 * the alias and the target kept (`[[Note]]` with `x` typed after its N is `[[Note|Nxote]]`; the
 * author's decision of 2026-10-23: as in Nyoze, editing a link's text never moves its target). Only
 * edits strictly inside the text: one that reaches its marks is left as it is (the notation check
 * decides). Null when the candidate edits no such text. Not in code or math lines.
 */
function withAliasOf(state: PmModeDocumentState, table: LineTable, candidate: Candidate): Candidate | null {
	const source = state.source, canonical = canonicalChanges(candidate.changes, source.length);
	if (!canonical.length) return null;
	const from = lineStartAt(source, canonical[0].from), lineEnd = source.indexOf("\n", canonical[canonical.length - 1].to);
	const elements = lineNotations(source.slice(from, lineEnd < 0 ? source.length : lineEnd), from, table.defined)
		.filter(e => e.kind === "wiki" && e.follows && !PLAIN_KINDS.has(table.kinds[lineIndexAt(table, e.from)] ?? ""));
	let changes: SourceChange[] = canonical, aliased = false;
	for (const wiki of elements) {
		const inner = changes.filter(c => c.from < c.to ? c.from < wiki.textTo && wiki.textFrom < c.to : wiki.textFrom < c.from && c.from < wiki.textTo);
		if (!inner.length || inner.some(c => c.from < wiki.textFrom || c.to > wiki.textTo)) continue;
		let text = "", at = wiki.textFrom;
		for (const change of inner) { text += source.slice(at, change.from) + change.insert; at = change.to; }
		text += source.slice(at, wiki.textTo);
		if (!text) continue;
		changes = [...changes.filter(c => !inner.includes(c)), { from: wiki.from, to: wiki.to, insert: `[[${wiki.key}|${text}]]` }];
		aliased = true;
	}
	return aliased ? { changes: sortChanges(changes, source.length), note: `${candidate.note}+alias` } : null;
}

/** The candidate, and with more than one seam, without all but the first (where a range's Enter breaks). */
function withFirstSeamOf(state: PmModeDocumentState, table: LineTable, candidate: Candidate): Candidate[] {
	if (seamJunctions(state.source, candidate.changes, table).length < 2) return [candidate];
	const out = [candidate];
	for (const fromRight of [true, false]) {
		const changes = withoutSeams(state.source, candidate.changes, table, fromRight, true);
		if (changes && !out.some(c => JSON.stringify(c.changes) === JSON.stringify(changes))) out.push({ changes, note: `${candidate.note}+seams` });
	}
	return out;
}
/**
 * A candidate that makes two hidden runs of the same mark meet is tried in their place with the
 * runs taken away as far as they pair, from the last seam and from the first (M2-1 review 3 B-3).
 */
function withoutSeamsOf(state: PmModeDocumentState, table: LineTable, candidate: Candidate): Candidate[] {
	if (!hasSeam(state.source, candidate.changes, table)) return [candidate];
	const out: Candidate[] = [];
	for (const fromRight of [true, false]) {
		const changes = withoutSeams(state.source, candidate.changes, table, fromRight);
		if (changes && !hasSeam(state.source, changes, table) && !out.some(c => JSON.stringify(c.changes) === JSON.stringify(changes))) out.push({ changes, note: `${candidate.note}+seams` });
	}
	return out;
}

/**
 * The weaker check for list and blockquote continuation edits, which the current mode's functions
 * build (they may add markers and spaces that show), and for a line break written as typed inside a
 * format (D27). Only one block of `base` (the old document) may change, besides the numbers of the
 * ordered list it renumbers; none of its visible characters may be lost (they stay in order), and its
 * Ruby, TCY and math stay the same. Unless the edit only inserts source (`insertOnly`: nothing of the
 * old source can be lost, D27's break that shows a format's marks), the kept characters keep their
 * formats and link targets.
 */
export function preservesText(base: PMNode, after: PMNode, insertOnly = false): boolean {
	const region = changedBlocks(base, after, true);
	if (region.oldTo - region.from > 1) return false;
	const old = visibleTokens(base, region.from, region.oldTo), now = visibleTokens(after, region.from, region.newTo);
	if (old.containers.join("\u0004") !== now.containers.join("\u0004")) return false;
	let at = 0;
	for (const token of old.chars) {
		while (at < now.chars.length && (now.chars[at].text !== token.text || (!insertOnly && now.chars[at].marks !== token.marks))) at++;
		if (at >= now.chars.length) return false;
		at++;
	}
	return true;
}
