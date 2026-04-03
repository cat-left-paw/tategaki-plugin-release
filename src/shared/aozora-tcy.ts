const TCY_START_MARK = "｟";
const TCY_END_MARK = "｠";
const TCY_BODY_PATTERN = "[A-Za-z0-9!?]{1,4}";
const AUTO_TCY_SYMBOLS = new Set(["!!", "!?", "??"]);

export const AUTO_TCY_MIN_DIGITS_MIN = 1;
export const AUTO_TCY_MAX_DIGITS_MAX = 4;
export const DEFAULT_AUTO_TCY_MIN_DIGITS = 2;
export const DEFAULT_AUTO_TCY_MAX_DIGITS = 4;

export type AutoTcyDigitRange = {
	minDigits: number;
	maxDigits: number;
};

export type AutoTcyRange = {
	from: number;
	to: number;
	text: string;
};

export function resolveAutoTcyDigitRange(
	input?: {
		minDigits?: unknown;
		maxDigits?: unknown;
		autoTcyMinDigits?: unknown;
		autoTcyMaxDigits?: unknown;
	} | null,
): AutoTcyDigitRange {
	const rawMin = normalizeAutoTcyDigitValue(
		input?.minDigits ?? input?.autoTcyMinDigits,
		DEFAULT_AUTO_TCY_MIN_DIGITS,
	);
	const rawMax = normalizeAutoTcyDigitValue(
		input?.maxDigits ?? input?.autoTcyMaxDigits,
		DEFAULT_AUTO_TCY_MAX_DIGITS,
	);

	return rawMin <= rawMax
		? { minDigits: rawMin, maxDigits: rawMax }
		: { minDigits: rawMax, maxDigits: rawMin };
}

export function createAozoraTcyRegExp(): RegExp {
	return new RegExp(
		`${escapeRegExp(TCY_START_MARK)}(?<body>${TCY_BODY_PATTERN})${escapeRegExp(TCY_END_MARK)}`,
		"gm",
	);
}

export function isValidAozoraTcyBody(text: string): boolean {
	return /^[A-Za-z0-9!?]{1,4}$/.test(text);
}

export function isValidAutoTcyBody(
	text: string,
	options?: {
		minDigits?: unknown;
		maxDigits?: unknown;
		autoTcyMinDigits?: unknown;
		autoTcyMaxDigits?: unknown;
	},
): boolean {
	const digitRange = resolveAutoTcyDigitRange(options);
	if (/^[A-Za-z0-9]+$/.test(text)) {
		const length = text.length;
		return (
			length >= digitRange.minDigits &&
			length <= digitRange.maxDigits
		);
	}
	return AUTO_TCY_SYMBOLS.has(text);
}

export function collectAutoTcyRanges(
	text: string,
	options?: {
		minDigits?: unknown;
		maxDigits?: unknown;
		autoTcyMinDigits?: unknown;
		autoTcyMaxDigits?: unknown;
	},
): AutoTcyRange[] {
	if (!text) return [];
	const ranges: AutoTcyRange[] = [];
	const tokenRegex = /[A-Za-z0-9!?]+/g;
	for (const match of text.matchAll(tokenRegex)) {
		const token = match[0] ?? "";
		const index = match.index ?? -1;
		if (!token || index < 0) continue;
		const end = index + token.length;
		const prev = index > 0 ? text[index - 1] : "";
		const next = end < text.length ? text[end] : "";
		// 明示TCY（｟...｠）内の本文は自動TCY対象から除外する。
		if (prev === TCY_START_MARK && next === TCY_END_MARK) continue;
		if (!isValidAutoTcyBody(token, options)) continue;
		ranges.push({ from: index, to: end, text: token });
	}
	return ranges;
}

export function buildAozoraTcyText(text: string): string {
	return `${TCY_START_MARK}${text}${TCY_END_MARK}`;
}

export function stripAozoraTcySyntax(text: string): string {
	if (!text) return text;
	const regex = createAozoraTcyRegExp();
	return text.replace(regex, (_match, ...args) => {
		const groups = args[args.length - 1] as
			| Record<string, string | undefined>
			| undefined;
		return groups?.body ?? _match;
	});
}

export function convertAozoraTcySyntaxToHtml(html: string): string {
	if (!html) return html;
	const regex = createAozoraTcyRegExp();
	return html.replace(regex, (_match, ...args) => {
		const groups = args[args.length - 1] as
			| Record<string, string | undefined>
			| undefined;
		const body = groups?.body ?? "";
		if (!isValidAozoraTcyBody(body)) {
			return _match;
		}
		return `<span class="tategaki-md-tcy" data-tategaki-tcy="1">${escapeHtml(body)}</span>`;
	});
}

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function normalizeAutoTcyDigitValue(value: unknown, fallback: number): number {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return fallback;
	}
	return Math.max(
		AUTO_TCY_MIN_DIGITS_MIN,
		Math.min(AUTO_TCY_MAX_DIGITS_MAX, Math.trunc(num)),
	);
}
