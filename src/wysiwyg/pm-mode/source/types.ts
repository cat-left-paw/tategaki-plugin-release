// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:298-381) @ d65c4c7 (2026-10-17).
// Local changes: Export types; add the explicit pure-function input types.
export type InlineStyleClass =
	| "tategaki-md-strong"
	| "tategaki-md-em"
	| "tategaki-md-code"
	| "tategaki-md-strike"
	| "tategaki-md-highlight"
	| "tategaki-md-tcy"
	| "tategaki-md-link"
	| "tategaki-md-image"
	| "tategaki-md-embed"
	| "tategaki-md-footnote-ref"
	| "tategaki-md-footnote-inline"
	| "tategaki-md-math-inline"
	| "tategaki-md-math-sup";

export type InlineRange = {
	from: number;
	to: number;
	className: InlineStyleClass;
};

export type LinkRange = {
	from: number;
	to: number;
	href: string;
};

export type HiddenRange = {
	from: number;
	to: number;
};

export type BlockLineDecoration = {
	classes: string[];
	hidden: HiddenRange[];
	dataset: Record<string, string>;
	styleVars: Record<string, string>;
};

export type RenderSegment = {
	from: number;
	to: number;
	text: string;
	classNames: string[];
	href?: string;
	ruby?: string;
	// 疑似ルビ親文字 segment に対して、青空注釈全体（`《...》` を含む）の
	// source offset 範囲を保持する内部 metadata。DOM には出さない。
	// hidden 化される `《...》` を跨いで直後の対象約物と隣接判定するために使う。
	rubyNotationFrom?: number;
	rubyNotationTo?: number;
};

export type HighlightNode = {
	type: string;
	value?: unknown;
	properties?: Record<string, unknown>;
	children?: HighlightNode[];
};

export type ClearableSpan = {
	from: number;
	to: number;
	markers: HiddenRange[];
};

export type RubyRange = {
	// 親文字（ベース）の source offset 範囲
	from: number;
	to: number;
	ruby: string;
	// 青空注釈全体（`｜` または親文字開始 〜 `》` の直後）の source offset 範囲。
	// hidden range 化される `《...》` を跨いだ「表示上隣接」判定に使う。
	notationFrom: number;
	notationTo: number;
};

export type InlineWidget = {
	kind: "math-inline";
	from: number;
	to: number;
	source: string;
	/** Reader classes at the opening dollar, before math is hidden; model metadata only. */
	formatClasses?: string[];
};

export interface SourceLine { lineIndex: number; lineFrom: number; lineText: string }
export interface RenderSettings { plainTextView: boolean; enableRuby: boolean }
