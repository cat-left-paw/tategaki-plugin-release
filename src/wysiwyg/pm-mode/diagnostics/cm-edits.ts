// Copied from src/pm-mode-spike/benchCmEdit.ts (lines 1-349) @ 68c03a2 (2026-10-16). No import from the spike.
// Local changes: The kinds typeTail (a line near the end) and typeFootnote (inside a footnote definition
// appended at the end; the append is a setup step, not measured) are added; the order puts the edits that
// keep the text length near the start first. The head and middle lines skip the frontmatter and headings
// (the spike's head line could be the frontmatter's title).
/**
 * M1-5 diagnostics: the edits the measurement makes in a sample's CodeMirror, and the restore point that
 * puts the sample back. No DOM and no Obsidian (only CodeMirror's `EditorState`), so it runs in Node.
 *
 * Safety rules:
 *  - Only a file whose vault path starts with `pm-spike-samples/` is written (`CmRestorePoint` checks it in
 *    the constructor and on every `apply`).
 *  - Every edit goes through `CmRestorePoint#apply`. The edits are composed, and `restore()` puts the text
 *    back in one transaction (no userEvent), then checks that the text equals the start exactly.
 *  - Every edit carries `addToHistory: false`: the measurement leaves nothing in the sample's undo history.
 */
import { Transaction } from "@codemirror/state";
import type { ChangeDesc, ChangeSet, ChangeSpec, EditorSelection, EditorState, Text, TransactionSpec } from "@codemirror/state";

export const SAMPLE_PREFIX = "pm-spike-samples/";

/** vault内のpath。`pm-spike-samples/` の下のファイルだけ true（`..` や `\\` を含むものは false）。 */
export function isSamplePath(path: unknown): boolean {
	if (typeof path !== "string") return false;
	if (!path.startsWith(SAMPLE_PREFIX) || path.length <= SAMPLE_PREFIX.length) return false;
	if (path.indexOf("\\") >= 0) return false;
	return path.split("/").every((segment) => segment !== ".." && segment !== ".");
}

/** `dispatch` を持つ最小のview（本物の `EditorView` と、Nodeの試験用の偽物の両方が満たす）。 */
export interface CmLike {
	readonly state: EditorState;
	dispatch(tr: Transaction): void;
}

// ---- 元へ戻す -----------------------------------------------------------------------------------

export interface RestoreOutcome {
	/** 計測が本文を変えていた（戻す必要があった） */
	hadChanges: boolean;
	/** inverse-changes = 合成した変更の逆を1回で適用 / minimal-replace = 先頭と末尾の同じ部分を除いた全文の置き換え / none = 戻す必要なし */
	method: "inverse-changes" | "minimal-replace" | "none";
	/** 戻した後の全文が開始時と完全に一致した */
	ok: boolean;
	/** 一致しなかった（これが true のときは、結果に大きく書く。それ以上何もしない） */
	mismatch: boolean;
	/** 計測中に、計測以外のCMの変更（外部の変更）を検出した */
	diverged: boolean;
	error: string;
	ms: number;
	originalLength: number;
	lengthBefore: number;
	lengthAfter: number;
	detail: string;
}

/** `current` を `original` にする、先頭と末尾の同じ部分を除いた1つの置き換え。 */
export function minimalReplace(current: string, original: string): { from: number; to: number; insert: string } {
	const max = Math.min(current.length, original.length);
	let prefix = 0;
	while (prefix < max && current.charCodeAt(prefix) === original.charCodeAt(prefix)) prefix++;
	let suffix = 0;
	while (
		suffix < max - prefix &&
		current.charCodeAt(current.length - 1 - suffix) === original.charCodeAt(original.length - 1 - suffix)
	) {
		suffix++;
	}
	return { from: prefix, to: current.length - suffix, insert: original.slice(prefix, original.length - suffix) };
}

export class CmRestorePoint {
	readonly originalDoc: Text;
	readonly originalText: string;
	private readonly originalSelection: EditorSelection;
	private composed: ChangeSet | null = null;
	/** 計測の最後の変更の後に、CMの文書がこのobjectであるはず（違えば外部の変更） */
	private expected: Text;
	private touched = false;
	private diverged = false;
	private outcome: RestoreOutcome | null = null;

	constructor(
		private readonly view: CmLike,
		readonly filePath: string,
		private readonly fileMatches: () => boolean,
	) {
		if (!isSamplePath(filePath)) throw new Error(`試料以外のファイルには書かない: ${String(filePath)}`);
		const state = view.state;
		this.originalDoc = state.doc;
		this.originalText = state.doc.toString();
		this.originalSelection = state.selection;
		this.expected = state.doc;
	}

	get currentDoc(): Text {
		return this.view.state.doc;
	}

	/** 本文を変えたまま、まだ戻していない */
	get needsRestore(): boolean {
		return this.touched && this.outcome === null;
	}

	get hasDiverged(): boolean {
		return this.diverged;
	}

	get restored(): RestoreOutcome | null {
		return this.outcome;
	}

	/** 変更を1つ適用する。試料のpathでなくなった / ファイルが変わった / 外部の変更を検出したときは、何もせず例外にする。 */
	apply(spec: TransactionSpec): Transaction {
		if (this.outcome) throw new Error("すでに戻した（もう変更しない）");
		if (!isSamplePath(this.filePath)) throw new Error("試料以外のファイルには書かない");
		if (!this.fileMatches()) throw new Error("MarkdownView が別のファイルになった");
		const before = this.view.state;
		if (before.doc !== this.expected) {
			this.diverged = true;
			throw new Error("計測以外の変更を検出した（外部の変更）");
		}
		const tr = before.update({ ...spec, annotations: Transaction.addToHistory.of(false) });
		if (!tr.docChanged) throw new Error("transaction が本文を変えなかった（拒否された?）");
		this.touched = true;
		try {
			this.view.dispatch(tr);
		} catch (error) {
			// 途中まで反映された可能性があるので、以後は全文の置き換えで戻す
			this.diverged = this.view.state.doc !== tr.state.doc;
			this.expected = this.view.state.doc;
			this.composed = null;
			throw error;
		}
		if (this.view.state.doc !== tr.state.doc) {
			// 別の拡張が続けて本文を変えた。合成した逆変換は使えない
			this.diverged = true;
			this.composed = null;
		} else if (this.composed) {
			this.composed = this.composed.compose(tr.changes);
		} else {
			this.composed = tr.changes;
		}
		this.expected = this.view.state.doc;
		return tr;
	}

	/** 開始時の本文へ戻す。同期・冪等（2回目以降は最初の結果を返す）。 */
	restore(): RestoreOutcome {
		if (this.outcome) return this.outcome;
		const t0 = performance.now();
		const before = this.view.state;
		let method: RestoreOutcome["method"] = "none";
		let error = "";
		let detail = "";
		if (before.doc.eq(this.originalDoc)) {
			detail = this.touched ? "本文はすでに開始時と同じ" : "本文を変えていない";
		} else {
			const make = (changes: ChangeSpec): Transaction =>
				before.update({
					changes,
					// 戻した後の本文は開始時と同じなので、開始時の選択をそのまま戻せる
					selection: this.originalSelection,
					annotations: Transaction.addToHistory.of(false),
				});
			let tr: Transaction | null = null;
			if (!this.diverged && this.composed && before.doc === this.expected) {
				try {
					tr = make(this.composed.invert(this.originalDoc));
					method = "inverse-changes";
				} catch (e) {
					// dispatch の前に失敗した（本文は変わっていない）ので、全文の置き換えに切り替えてよい
					error = `逆変換を作れなかった: ${String(e)}`;
					tr = null;
				}
			}
			try {
				if (!tr) {
					tr = make(minimalReplace(before.doc.toString(), this.originalText));
					method = "minimal-replace";
				}
				this.view.dispatch(tr);
			} catch (e) {
				error = (error ? error + " / " : "") + String(e);
			}
		}
		const after = this.view.state.doc;
		const equal = after.eq(this.originalDoc) && after.length === this.originalText.length && after.toString() === this.originalText;
		this.outcome = {
			hadChanges: this.touched,
			method,
			ok: equal,
			mismatch: !equal,
			diverged: this.diverged,
			error,
			ms: Math.round((performance.now() - t0) * 1000) / 1000,
			originalLength: this.originalText.length,
			lengthBefore: before.doc.length,
			lengthAfter: after.length,
			detail:
				detail ||
				(equal
					? `${method === "inverse-changes" ? "合成した変更の逆を1回で適用" : "全文の置き換え（先頭と末尾の同じ部分を除く）"}。戻した後の全文は開始時と一致`
					: "戻した後の全文が開始時と一致しない"),
		};
		return this.outcome;
	}
}

// ---- 変更の種類 ---------------------------------------------------------------------------------

export type EditKindId = "typeHead" | "typeMid" | "typeTail" | "enterMid" | "joinMid" | "pasteMid" | "typeFootnote";

export interface EditKindInfo {
	id: EditKindId;
	label: string;
	userEvent: string;
}

/** 実行の順序のまま。joinMid は直前の enterMid が作った改行を消す。 */
export const EDIT_KINDS: readonly EditKindInfo[] = [
	{ id: "typeHead", label: "先頭付近の行の途中に1文字", userEvent: "input.type" },
	{ id: "typeMid", label: "中ほどの行の途中に1文字", userEvent: "input.type" },
	{ id: "typeTail", label: "末尾付近の行の途中に1文字", userEvent: "input.type" },
	{ id: "enterMid", label: "中ほどの段落の先頭で改行", userEvent: "input.type" },
	{ id: "joinMid", label: "その改行の削除（行の結合）", userEvent: "delete" },
	{ id: "pasteMid", label: "中ほどに5行を貼り付け", userEvent: "input.paste" },
	{ id: "typeFootnote", label: "末尾に足した脚注の定義の中に1文字", userEvent: "input.type" },
];
/** The footnote definition typeFootnote appends before it types (a setup edit, not measured). */
export const FOOTNOTE_SETUP = "\n\n本文[^m15]。\n\n[^m15]: 脚注の定義。";

export const OPS_PER_KIND = 20;
const TYPED_CHARS = "あいうえおかきくけこ";

/** `from`〜`to` の割合の範囲から、重ならない `count` 個の行番号（1始まり）を選ぶ。各行は10文字より長い行を優先する。 */
export function spreadLines(doc: Text, fromFraction: number, toFraction: number, count: number): number[] {
	const n = doc.lines;
	const lo = Math.min(n, Math.max(2, Math.floor(n * fromFraction)));
	const hi = Math.min(n, Math.max(lo, Math.floor(n * toFraction)));
	const step = Math.max(1, Math.floor((hi - lo) / Math.max(1, count)));
	const lines: number[] = [];
	let last = 0;
	for (let i = 0; i < count; i++) {
		let ln = Math.min(n, lo + i * step);
		for (let k = 0; k < 200 && ln < n && doc.line(ln).length <= 10; k++) ln++;
		if (ln <= last) ln = last + 1;
		if (ln > n) break;
		lines.push(ln);
		last = ln;
	}
	return lines;
}

/** The last line of a frontmatter block at the start (`---` … `---`), or 0 (M1-5 local change). */
export function frontmatterEnd(doc: Text): number {
	if (doc.lines < 2 || doc.line(1).text !== "---") return 0;
	for (let ln = 2; ln <= Math.min(doc.lines, 400); ln++) if (doc.line(ln).text === "---") return ln;
	return 0;
}
/** A body line: not in the frontmatter, not a heading (M1-5 local change: typing there is not typical). */
function isBodyLine(doc: Text, ln: number, fm: number): boolean {
	return ln > fm && !/^#{1,6}\s/.test(doc.line(ln).text);
}

/** 割合の位置から後ろへ向かって、最初の長い行（20文字より長い本文の行）。無ければその位置の行。 */
export function pickMidLine(doc: Text, fraction: number): number {
	const n = doc.lines, fm = frontmatterEnd(doc);
	const start = Math.min(n, Math.max(1, Math.floor(n * fraction)));
	for (let k = 0; k < 400 && start + k <= n; k++) {
		if (doc.line(start + k).length > 20 && isBodyLine(doc, start + k, fm)) return start + k;
	}
	return start;
}

/** 2行目以降で最初の、4文字以上の本文の行（frontmatterと見出しを飛ばす）。無ければ2行目（1行しかなければ1行目）。 */
export function pickHeadLine(doc: Text): number {
	const n = doc.lines, fm = frontmatterEnd(doc);
	for (let ln = Math.min(2, n); ln <= Math.min(n, 400); ln++) {
		if (doc.line(ln).length >= 4 && isBodyLine(doc, ln, fm)) return ln;
	}
	return Math.min(2, n);
}

/** 変更の種類ごとの位置の計画。位置は変更のたびに `after()` で写す。 */
export class EditPlanner {
	private kind: EditKindId = "typeMid";
	private targets: number[] = [];
	private caret = 0;
	private enterPositions: number[] = [];
	private pendingEnter: number | null = null;
	/** 計画に使った行番号（結果に書く） */
	targetLine = 0;
	targetCount = 0;

	/** An edit to apply (unmeasured) before the kind's edits, or null. Call before `begin`. */
	setup(kind: EditKindId, doc: Text): TransactionSpec | null {
		return kind === "typeFootnote" ? { changes: { from: doc.length, insert: FOOTNOTE_SETUP } } : null;
	}

	begin(kind: EditKindId, doc: Text, count: number): void {
		this.kind = kind;
		this.pendingEnter = null;
		this.targets = [];
		this.targetLine = 0;
		if (kind === "typeFootnote") {
			// The end of the definition appended by setup (the document's end).
			this.caret = doc.length;
			this.targetLine = doc.lines;
			this.targetCount = count;
		} else if (kind === "typeMid" || kind === "typeHead" || kind === "typeTail") {
			const ln = kind === "typeMid" ? pickMidLine(doc, 0.5) : kind === "typeTail" ? pickMidLine(doc, 0.97) : pickHeadLine(doc);
			const line = doc.line(ln);
			this.targetLine = ln;
			this.caret = line.from + Math.floor(line.length / 2);
			this.targetCount = count;
		} else if (kind === "enterMid") {
			this.enterPositions = [];
			this.targets = spreadLines(doc, 0.4, 0.6, count).map((ln) => doc.line(ln).from);
			this.targetLine = this.targets.length > 0 ? doc.lineAt(this.targets[0] ?? 0).number : 0;
			this.targetCount = this.targets.length;
		} else if (kind === "joinMid") {
			this.targets = this.enterPositions.slice();
			this.targetLine = this.targets.length > 0 ? doc.lineAt(this.targets[0] ?? 0).number : 0;
			this.targetCount = this.targets.length;
		} else {
			this.targets = spreadLines(doc, 0.35, 0.65, count).map((ln) => doc.line(ln).from);
			this.targetLine = this.targets.length > 0 ? doc.lineAt(this.targets[0] ?? 0).number : 0;
			this.targetCount = this.targets.length;
		}
	}

	/** i 番目の変更。位置を決められなければ null（飛ばす）。 */
	next(i: number, doc: Text): TransactionSpec | null {
		this.pendingEnter = null;
		switch (this.kind) {
			case "typeMid":
			case "typeHead":
			case "typeTail":
			case "typeFootnote": {
				if (this.caret > doc.length) return null;
				const ch = TYPED_CHARS.charAt(i % TYPED_CHARS.length);
				return { changes: { from: this.caret, insert: ch }, userEvent: "input.type" };
			}
			case "enterMid": {
				const pos = this.targets[i];
				if (pos === undefined || pos > doc.length) return null;
				const from = doc.lineAt(pos).from;
				this.pendingEnter = from;
				return { changes: { from, insert: "\n" }, userEvent: "input.type" };
			}
			case "joinMid": {
				const pos = this.targets[i];
				if (pos === undefined || pos + 1 > doc.length) return null;
				if (doc.sliceString(pos, pos + 1) !== "\n") return null;
				return { changes: { from: pos, to: pos + 1 }, userEvent: "delete" };
			}
			case "pasteMid": {
				const pos = this.targets[i];
				if (pos === undefined || pos > doc.length) return null;
				const line = doc.lineAt(pos);
				const parts: string[] = [];
				for (let k = 0; k < 5 && line.number + k <= doc.lines; k++) parts.push(doc.line(line.number + k).text + "ア");
				return { changes: { from: line.from, insert: parts.join("\n") + "\n" }, userEvent: "input.paste" };
			}
			default:
				return null;
		}
	}

	/** 変更を適用した後に呼ぶ。後ろの位置を写す。 */
	after(changes: ChangeDesc): void {
		this.caret = changes.mapPos(this.caret, 1);
		this.targets = this.targets.map((p) => changes.mapPos(p, -1));
		this.enterPositions = this.enterPositions.map((p) => changes.mapPos(p, -1));
		if (this.pendingEnter !== null) {
			// 新しく挿入した改行は、挿入位置の1文字（[pos, pos+1)）。ここまでの変更では挿入位置は動かない
			this.enterPositions.push(changes.mapPos(this.pendingEnter, -1));
			this.pendingEnter = null;
		}
	}
}
