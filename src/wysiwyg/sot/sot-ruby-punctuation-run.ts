/**
 * SoT 疑似ルビ + 直後の対象約物を、表示 DOM 上で外側 wrapper に包む準備を行う pure helper。
 *
 * 動機:
 *   SoT の疑似ルビは `.tategaki-aozora-ruby` + `::after { content: attr(data-ruby) }`
 *   で実装されているため、ブラウザが「ルビ付き親文字 + 直後の句読点・閉じ括弧」を
 *   不可分単位として扱えず、折り返し位置や justify が不自然になりやすい。
 *   表示 DOM 上だけで wrapper を挿入し、不可分に近い単位として扱う。
 *
 * 仕様:
 *   - 保存データ、Markdown 本文、source offset には一切手を入れない。
 *   - 既存 `.tategaki-sot-run[data-from][data-to]` の構造は維持する（wrapper の内側に置く）。
 *   - wrapper 自体には `data-from` / `data-to` を持たせない（render 側で付与しない前提）。
 *
 * 入力型は `RenderSegment` 相当の最小 structural type に絞っている。
 */

export const RUBY_ADSORB_PUNCTUATION_CHARS: ReadonlySet<string> = new Set([
	"、",
	"。",
	"」",
	"』",
	"）",
]);

const MAX_RUBY_BASE_GRAPHEMES = 4;

export type RubyPunctuationSegmentLike = {
	from: number;
	to: number;
	text: string;
	classNames: ReadonlyArray<string>;
	href?: string;
	ruby?: string;
	// 疑似ルビ親文字 segment に対して、青空注釈全体 (`《...》` を含む) の
	// source offset 範囲。SoT では `《...》` を hidden range として消すため、
	// `rubyNotationTo` は「表示上、親文字の直後」と一致する source offset である。
	rubyNotationFrom?: number;
	rubyNotationTo?: number;
};

export type RubyPunctuationGroupedItem<TSegment extends RubyPunctuationSegmentLike> =
	| { kind: "segment"; segment: TSegment }
	| {
			kind: "ruby-punctuation-run";
			rubySegment: TSegment;
			punctuationSegment: TSegment;
	  };

/**
 * `segments` を走査し、ルビ + 対象約物 1 文字を `ruby-punctuation-run` にまとめる。
 *
 * 対象条件（すべて満たすときのみ吸着）:
 *   - 現在 segment が `ruby` を持つ
 *   - 現在 segment の classNames に `tategaki-aozora-ruby` を含む
 *   - `Array.from(segment.text).length <= 4`
 *   - 次 segment が存在する
 *   - `segment.to === nextSegment.from`（オフセット連続）
 *   - 次 segment の text の先頭 1 文字（code point 単位）が対象約物
 *   - 次 segment 自体が `ruby` を持たない
 *   - 次 segment が `href` を持たない
 *   - 次 segment の classNames に `tategaki-md-tcy` を含まない
 *
 * 次 segment が複数文字なら、先頭 1 文字だけ吸着し残りは通常 segment として残す。
 * `from/to` は UTF-16 code unit ベース（SoT の RenderSegment 仕様に合わせる）。
 */
export function groupRubyPunctuationRuns<TSegment extends RubyPunctuationSegmentLike>(
	segments: ReadonlyArray<TSegment>,
): RubyPunctuationGroupedItem<TSegment>[] {
	const result: RubyPunctuationGroupedItem<TSegment>[] = [];
	let i = 0;
	while (i < segments.length) {
		const current = segments[i]!;
		const next = segments[i + 1];
		const adsorbed = next ? tryAdsorbPunctuationToRuby(current, next) : null;
		if (adsorbed) {
			result.push({
				kind: "ruby-punctuation-run",
				rubySegment: adsorbed.rubySegment,
				punctuationSegment: adsorbed.punctuationSegment,
			});
			if (adsorbed.remainder) {
				result.push({ kind: "segment", segment: adsorbed.remainder });
			}
			i += 2;
			continue;
		}
		result.push({ kind: "segment", segment: current });
		i += 1;
	}
	return result;
}

function tryAdsorbPunctuationToRuby<TSegment extends RubyPunctuationSegmentLike>(
	current: TSegment,
	next: TSegment,
): {
	rubySegment: TSegment;
	punctuationSegment: TSegment;
	remainder: TSegment | null;
} | null {
	if (!current.ruby) return null;
	if (!current.classNames.includes("tategaki-aozora-ruby")) return null;
	if (Array.from(current.text).length > MAX_RUBY_BASE_GRAPHEMES) return null;
	// SoT の青空ルビは `《...》` を hidden range として消すため、ruby 親文字 segment の
	// `to` と直後の punctuation segment の `from` の間に注釈分の gap が空く。
	// その gap を許可する根拠は「その ruby 自身の青空注釈 (`《...》`) 終端のみ」に限定する。
	// 任意の gap を許すと、別の hidden range や構文をまたいで誤吸着するリスクがある。
	const isSourceAdjacent =
		current.to === next.from ||
		(current.rubyNotationTo !== undefined &&
			current.rubyNotationTo === next.from);
	if (!isSourceAdjacent) return null;
	if (next.ruby) return null;
	if (next.href !== undefined && next.href !== "") return null;
	if (next.classNames.includes("tategaki-md-tcy")) return null;

	const nextChars = Array.from(next.text);
	if (nextChars.length === 0) return null;
	const head = nextChars[0]!;
	if (!RUBY_ADSORB_PUNCTUATION_CHARS.has(head)) return null;

	if (nextChars.length === 1) {
		return {
			rubySegment: current,
			punctuationSegment: next,
			remainder: null,
		};
	}

	const headLen = head.length;
	const punctuationSegment = {
		...next,
		from: next.from,
		to: next.from + headLen,
		text: head,
	} as TSegment;
	const remainder = {
		...next,
		from: next.from + headLen,
		to: next.to,
		text: next.text.slice(headLen),
	} as TSegment;
	return {
		rubySegment: current,
		punctuationSegment,
		remainder,
	};
}
