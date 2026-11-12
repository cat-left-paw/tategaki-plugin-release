import type { Mark, PMNode } from "../pm/prosemirror";
import { pmModeSchema as schema } from "../pm/schema";

/**
 * What the reader sees of a block (M2 design §5.4), compared character by character with the format
 * each character has: the line's kind and levels (heading level, blockquote depth, list marker and
 * depth, task state); its visible text; Ruby (reading and base), TCY and inline math;
 * and each character's marks with what they point to (a link's target, a footnote reference's id, an
 * image's class). So an edit that keeps the visible text but moves a link's target, joins two links
 * or eats a footnote reference does not display "the same". Left out: the class every text run has
 * and the classes of code lines (code highlighting, presentation only). A link whose target is its
 * own text (an autolink, a wikilink without alias) compares as following its text (`link*`): kept
 * characters of one may keep its old target, written as an alias (`[[Note|Nxote]]`; the notation
 * check refuses one whose target follows the new text, M2-1 ⑨); where each link starts is compared
 * too (`[[A]]、[[B]]` → `[[AB]]` joins two). Text the edit inserts may take
 * any format but a footnote reference's (whose text is not shown: it would be typed out of sight).
 * Atom blocks compare by their source.
 */
interface Token {
	readonly text: string;
	readonly marks: string;
	/** Also right for this expected character (a text-following link's kept character). */
	readonly alt?: string;
	/** Drawn as its text (a footnote reference's id is transparent, M2-1 review B3). */
	readonly shown: boolean;
	/**
	 * For a link's character: whether it starts the link (two links joined into one, or one split in
	 * two, do not display the same even when each keeps its text as target). Null when not a link, or
	 * unknown (right after inserted text, which may have gone into the link or not).
	 */
	readonly linkStart: boolean | null;
}

/** Marks on text the edit inserts: any format is right for it (it takes the format of where it goes). */
const WILDCARD_CLASS = "\u0000any";
export function wildcardText(text: string): PMNode {
	return schema.text(text, [schema.marks.mdClass.create({ classes: [WILDCARD_CLASS] })]);
}
const isWildcard = (marks: readonly Mark[]) => marks.some(mark => mark.type.name === "mdClass" && (mark.attrs.classes as string[]).includes(WILDCARD_CLASS));
const FOOTNOTE_REF_CLASS = "tategaki-md-footnote-ref";
const isShown = (marks: readonly Mark[]) => !marks.some(mark => mark.type.name === "mdClass" && (mark.attrs.classes as string[]).includes(FOOTNOTE_REF_CLASS));

const DATASET_KEYS = ["mdLevel", "mdDepth", "listMarker", "listDepth", "listBullet", "taskChecked"];
/** The line's kind with the levels and markers it shows (without an ordered list's number, `numberFree`). */
export function lineShape(node: PMNode, numberFree = false): string {
	const dataset = node.attrs.dataset as Record<string, string>;
	const free = numberFree && node.attrs.kind === "olist";
	return [String(node.attrs.kind), ...DATASET_KEYS.map(key => free && key === "listMarker" ? "" : dataset[key] ?? "")].join("\u001e");
}

/** Whether a link with target `href` over text `text` goes where its text says. */
const followsText = (href: string, text: string) => href === text || href === `mailto:${text}`;

/**
 * The marks' key, and (for a link in `following`: one that followed its text before the edit) the
 * key with the link following its new text.
 */
function markKey(marks: readonly Mark[], linkText: string, code: boolean, following?: ReadonlySet<string>): { key: string; alt?: string } {
	const parts: string[] = [];
	let followed = false;
	for (const mark of marks) {
		if (mark.type.name === "link") {
			const href = String(mark.attrs.href);
			if (followsText(href, linkText)) parts.push("link*");
			else { parts.push(`link(${href})`); followed = following?.has(href) ?? false; }
		} else if (mark.type.name === "mdClass") {
			const classes = code ? [] : (mark.attrs.classes as string[]).filter(c => c !== "tategaki-sot-run" && !c.startsWith("hljs"));
			if (classes.length || mark.attrs.footnoteId !== null) parts.push(`class(${classes.sort().join(" ")}|${String(mark.attrs.footnoteId ?? "")})`);
		} else parts.push(mark.type.name);
	}
	const key = [...parts].sort().join(",");
	if (!followed) return { key };
	return { key, alt: parts.map(part => part.startsWith("link(") ? "link*" : part).sort().join(",") };
}

/** The text of the run of text nodes around `children[i]` with the same link (a link's shown text). */
function linkRunText(children: readonly PMNode[], i: number, link: Mark): string {
	let a = i, b = i;
	while (a > 0 && children[a - 1].isText && children[a - 1].marks.some(m => m.eq(link))) a--;
	while (b + 1 < children.length && children[b + 1].isText && children[b + 1].marks.some(m => m.eq(link))) b++;
	return children.slice(a, b + 1).map(c => c.text ?? "").join("");
}

/** Whether `children[i]` starts its link (see `Token.linkStart`). */
function startsLink(children: readonly PMNode[], i: number, link: Mark): boolean | null {
	const previous = i > 0 ? children[i - 1] : null;
	if (!previous?.isText) return true;
	if (previous.marks.some(m => m.eq(link))) return false;
	return isWildcard(previous.marks) ? null : true;
}

/** One token per character (UTF-16 unit) with its marks; Ruby / TCY open and close, math, as tokens. */
function lineTokens(node: PMNode, following?: ReadonlySet<string>, codeLine = node.attrs.kind === "code"): Token[] {
	const tokens: Token[] = [];
	const code = codeLine;
	const visit = (parent: PMNode) => {
		const children: PMNode[] = [];
		parent.forEach(child => children.push(child));
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child.isText) {
				const link = child.marks.find(mark => mark.type.name === "link");
				const { key, alt } = isWildcard(child.marks) ? { key: "*", alt: undefined } : markKey(child.marks, link ? linkRunText(children, i, link) : "", code, following);
				// A link that followed its text before the edit (`following`): where it starts is the notation
				// check's to keep (two of them with the same target merge into one run in the expected display,
				// not in the source; `参照: [[Note]]` twice, without `ote\n参照: N`, is `[[N]][[ote]]`).
				const followed = link && following?.has(String(link.attrs.href));
				const shown = isShown(child.marks), start = link && key !== "*" && !followed ? startsLink(children, i, link) : null;
				let first = true;
				for (const ch of child.text ?? "") for (let k = 0; k < ch.length; k++) {
					tokens.push({ text: ch[k], marks: key, alt, shown, linkStart: start === null ? null : first ? start : false });
					first = false;
				}
			} else if (child.type.name === "ruby" || child.type.name === "tcy") {
				tokens.push({ text: `\u0001${child.type.name}:${String(child.attrs.reading ?? "")}`, marks: markKey(child.marks, "", code).key, shown: true, linkStart: null });
				visit(child);
				tokens.push({ text: "\u0003", marks: "", shown: true, linkStart: null });
			} else tokens.push({ text: `\u0001${child.type.name}:${String(child.attrs.source ?? "")}` + (child.type.name === "inlineMath" ? `\u0002${String(child.attrs.formats)}` : ""), marks: markKey(child.marks, "", code).key, shown: true, linkStart: null });
		}
	};
	visit(node);
	return tokens;
}

/**
 * The targets of the links that followed their text (`link*`) in the blocks of `before` that `after`
 * (the expected display) does not share: a kept character of one may follow its new text. Two of
 * them joined into one (`[[A]]、[[A]]` → `[[AA]]`, another note) the notation check refuses (each
 * must still be there, `notation-inventory.ts`); so does an edit at a link's edge.
 */
export function textFollowingTargets(before: PMNode, after: PMNode): Set<string> {
	let from = 0, oldTo = before.childCount;
	const newTo = after.childCount;
	while (from < oldTo && from < newTo && before.child(from) === after.child(from)) from++;
	for (let newEnd = newTo; oldTo > from && newEnd > from && before.child(oldTo - 1) === after.child(newEnd - 1); newEnd--) oldTo--;
	const targets = new Set<string>();
	const visit = (parent: PMNode) => {
		const children: PMNode[] = [];
		parent.forEach(child => children.push(child));
		children.forEach((child, i) => {
			const link = child.isText ? child.marks.find(mark => mark.type.name === "link") : undefined;
			if (link && followsText(String(link.attrs.href), linkRunText(children, i, link))) targets.add(String(link.attrs.href));
			if (!child.isText && child.isInline) visit(child);
		});
	};
	for (let i = from; i < oldTo; i++) if (before.child(i).type.name === "line") visit(before.child(i));
	return targets;
}

/**
 * The tokens of a line as keys (a character with its marks, a Ruby / TCY / math as tokens of their own): for comparing what a line shows outside of an edit whose text is written as it is
 * (`source-paste.ts`, round 2 of the clipboard stage: D-C-8's and D-C-9's checks).
 */
export function lineTokenKeys(node: PMNode): string[] {
	return lineTokens(node).map(token => `${token.text}\u0005${token.marks}`);
}

/**
 * The characters a line shows, in order, one per UTF-16 unit, with their marks and the Ruby / TCY they are in (`ruby:<reading>`, `tcy:`, or ""): a math or another inline atom is one `￼`
 * (as `textBetween` of the model has it). A Ruby's reading is not a character.
 */
export function lineChars(node: PMNode): { readonly ch: string; readonly marks: string; readonly container: string }[] {
	const out: { ch: string; marks: string; container: string }[] = [];
	let container = "";
	for (const token of lineTokens(node)) {
		if (token.text === "\u0003") container = "";
		else if (token.text.startsWith("\u0001ruby:") || token.text.startsWith("\u0001tcy:")) container = token.text.slice(1);
		else if (token.text.startsWith("\u0001")) out.push({ ch: "￼", marks: token.marks, container });
		else out.push({ ch: token.text, marks: token.marks, container });
	}
	return out;
}

/** The block as a string (for finding the blocks that differ; inserted text keeps its wildcard). */
export function blockSignature(node: PMNode, numberFree = false): string {
	if (node.type.name !== "line") return `${node.type.name}\u001f${String(node.attrs.kind ?? "")}\u001f${String(node.attrs.markdown ?? "")}\u001f${String(node.attrs.lineCount ?? "")}`;
	return `line\u001f${lineShape(node, numberFree)}\u001f${lineTokens(node).map(t => `${t.text}\u0005${t.marks}`).join("\u0006")}`;
}
function sameTokens(expected: Token[], actual: Token[]): boolean {
	if (expected.length !== actual.length) return false;
	for (let i = 0; i < expected.length; i++) {
		const e = expected[i], a = actual[i];
		if (e.text !== a.text) return false;
		if (e.marks === "*" ? !a.shown : e.marks !== a.marks && e.alt !== a.marks) return false;
		if (e.linkStart !== null && e.linkStart !== a.linkStart) return false;
	}
	return true;
}

/** A block whose kind may be anything (only its content is expected), see `sameDisplay`. */
export interface DisplayExpectation {
	readonly doc: PMNode;
	/** Indices of blocks in `doc` whose line kind is not checked (a new line whose kind the context decides). */
	readonly anyKind?: ReadonlySet<number>;
}

/**
 * Whether two model documents (flat: blocks only) display the same. Unchanged blocks are the same
 * node object on both sides (the incremental update and the Transform keep them), so most
 * blocks compare by identity. `following`: see `textFollowingTargets`.
 */
export function sameDisplay(expected: DisplayExpectation, actual: PMNode, following?: ReadonlySet<string>): boolean {
	const doc = expected.doc;
	if (doc.childCount !== actual.childCount) return false;
	for (let i = 0; i < doc.childCount; i++) {
		const a = doc.child(i), b = actual.child(i);
		if (a === b) continue;
		if (a.type.name !== "line" || b.type.name !== "line") { if (blockSignature(a) !== blockSignature(b)) return false; continue; }
		if (!expected.anyKind?.has(i) && lineShape(a) !== lineShape(b)) return false;
		// In a code line the classes are its highlighting, on both sides (a line the edit splits off may be expected as any kind).
		const code = b.attrs.kind === "code";
		if (!sameTokens(lineTokens(a, following, code), lineTokens(b, undefined, code))) return false;
	}
	return true;
}

/**
 * The blocks that differ between two model documents: `[from, oldTo)` in `before` and
 * `[from, newTo)` in `after` (by display; equal prefix and suffix are cut off). `numberFree`: lines
 * that differ only in an ordered list's number count as the same (a renumbered list).
 */
export function changedBlocks(before: PMNode, after: PMNode, numberFree = false): { from: number; oldTo: number; newTo: number } {
	const same = (a: PMNode, b: PMNode) => a === b || blockSignature(a, numberFree) === blockSignature(b, numberFree);
	let from = 0;
	while (from < before.childCount && from < after.childCount && same(before.child(from), after.child(from))) from++;
	let oldTo = before.childCount, newTo = after.childCount;
	while (oldTo > from && newTo > from && same(before.child(oldTo - 1), after.child(newTo - 1))) { oldTo--; newTo--; }
	return { from, oldTo, newTo };
}

/** The visible characters with their marks, and the Ruby / TCY / math tokens, of blocks `[from, to)`. */
export function visibleTokens(doc: PMNode, from: number, to: number): { chars: Token[]; containers: string[] } {
	const chars: Token[] = [], containers: string[] = [];
	for (let i = from; i < to; i++) {
		const block = doc.child(i);
		if (block.type.name !== "line") { containers.push(blockSignature(block)); continue; }
		for (const token of lineTokens(block)) {
			if (token.text.startsWith("\u0001")) containers.push(token.text);
			else if (token.text !== "\u0003") chars.push(token);
		}
	}
	return { chars, containers };
}
