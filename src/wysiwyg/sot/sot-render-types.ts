export type InlineStyleClass =
	| "tategaki-md-strong"
	| "tategaki-md-em"
	| "tategaki-md-code"
	| "tategaki-md-underline"
	| "tategaki-md-strike"
	| "tategaki-md-highlight"
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
};

export type ClearableSpan = {
	from: number;
	to: number;
	markers: HiddenRange[];
};

export type RubyRange = {
	from: number;
	to: number;
	ruby: string;
};

export type InlineWidget = {
	kind: "math-inline";
	from: number;
	to: number;
	source: string;
};
