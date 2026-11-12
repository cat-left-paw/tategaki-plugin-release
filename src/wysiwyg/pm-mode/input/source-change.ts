/**
 * Source edits as plain data (M2 design §5): what the new mode writes to CodeMirror, in the
 * coordinates of the document before the edit. Pure: no CodeMirror import (the Obsidian layer
 * turns them into a transaction and back, input/edit-audit.ts).
 */
export interface SourceChange { readonly from: number; readonly to: number; readonly insert: string }

/**
 * Sorted by position, keeping the given order of changes at the same position (an insertion
 * listed first comes first, as in a CodeMirror change set built from the same list). Throws on
 * overlapping or out-of-range changes: a plan never produces them.
 */
export function sortChanges(changes: readonly SourceChange[], length: number): SourceChange[] {
	const sorted = changes.map((change, index) => ({ change, index })).sort((a, b) => a.change.from - b.change.from || a.index - b.index).map(item => item.change);
	let end = 0;
	for (const change of sorted) {
		if (!Number.isInteger(change.from) || !Number.isInteger(change.to) || change.from < end || change.to < change.from || change.to > length) {
			throw new RangeError(`source change ${change.from}-${change.to} (length ${length})`);
		}
		end = change.to;
	}
	return sorted;
}

/**
 * The start of the line holding offset `pos` of `text` (`lastIndexOf` from `pos - 1` would look at
 * offset 0 for `pos` 0, and a text starting with a line break would put the line after it).
 */
export function lineStartAt(text: string, pos: number): number {
	return pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
}

export function applySourceChanges(source: string, changes: readonly SourceChange[]): string {
	let result = "", at = 0;
	for (const change of sortChanges(changes, source.length)) {
		result += source.slice(at, change.from) + change.insert;
		at = change.to;
	}
	return result + source.slice(at);
}

/**
 * A position of the old document in the new one, as CodeMirror's `ChangeDesc.mapPos` (simple mode):
 * at the start of a replaced range it stays at the start; inside it, `assoc` < 0 gives the start and
 * > 0 the end of the replacement; at text inserted exactly there, `assoc` < 0 stays before it.
 */
export function mapSourcePosition(changes: readonly SourceChange[], pos: number, assoc: -1 | 1, length: number): number {
	let delta = 0;
	// CodeMirror keeps a deletion and an insertion at its end as separate sections (not merged).
	for (const change of sortChanges(changes, length)) {
		if (change.from === change.to && !change.insert) continue;
		if (pos < change.from) break;
		const replaced = change.to - change.from;
		if (change.to > pos || (change.to === pos && assoc < 0 && replaced === 0)) return change.from + delta + (pos === change.from || assoc < 0 ? 0 : change.insert.length);
		delta += change.insert.length - replaced;
	}
	return pos + delta;
}

/**
 * The canonical form CodeMirror reports (`ChangeSet.iterChanges` without `individual`): empty
 * changes dropped, changes that touch merged. Two change lists with the same canonical form
 * have the same effect on the text.
 */
export function canonicalChanges(changes: readonly SourceChange[], length: number): SourceChange[] {
	const result: SourceChange[] = [];
	for (const change of sortChanges(changes, length)) {
		if (change.from === change.to && !change.insert) continue;
		const last = result[result.length - 1];
		if (last && last.to === change.from) result[result.length - 1] = { from: last.from, to: change.to, insert: last.insert + change.insert };
		else result.push(change);
	}
	return result;
}
