const TCY_START_MARK = "｟";
const TCY_END_MARK = "｠";
const TCY_BODY_PATTERN = "[A-Za-z0-9!?]{2,4}";
const AUTO_TCY_SYMBOLS = new Set(["!!", "!?", "??"]);

export type AutoTcyRange = {
	from: number;
	to: number;
	text: string;
};

export function createAozoraTcyRegExp(): RegExp {
	return new RegExp(
		`${escapeRegExp(TCY_START_MARK)}(?<body>${TCY_BODY_PATTERN})${escapeRegExp(TCY_END_MARK)}`,
		"gm",
	);
}

export function isValidAozoraTcyBody(text: string): boolean {
	return /^[A-Za-z0-9!?]{2,4}$/.test(text);
}

export function isValidAutoTcyBody(text: string): boolean {
	if (/^[A-Za-z0-9]{2,4}$/.test(text)) return true;
	return AUTO_TCY_SYMBOLS.has(text);
}

export function collectAutoTcyRanges(text: string): AutoTcyRange[] {
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
		if (!isValidAutoTcyBody(token)) continue;
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
