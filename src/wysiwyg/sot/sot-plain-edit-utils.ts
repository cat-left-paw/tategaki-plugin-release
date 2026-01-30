import { createAozoraRubyRegExp } from "../../shared/aozora-ruby";

export type PlainEditSelectionRange = {
	start: number;
	end: number;
	text: string;
};

export const getPlainEditSelectionRange = (
	overlay: HTMLTextAreaElement
): PlainEditSelectionRange => {
	const start = overlay.selectionStart ?? 0;
	const end = overlay.selectionEnd ?? start;
	const from = Math.min(start, end);
	const to = Math.max(start, end);
	return {
		start: from,
		end: to,
		text: overlay.value.slice(from, to),
	};
};

export const replacePlainEditSelection = (
	overlay: HTMLTextAreaElement,
	nextText: string,
	options: {
		selectionStart?: number;
		selectionEnd?: number;
		onResize?: () => void;
	} = {}
): void => {
	const selection = getPlainEditSelectionRange(overlay);
	const value = overlay.value ?? "";
	const before = value.slice(0, selection.start);
	const after = value.slice(selection.end);
	overlay.value = `${before}${nextText}${after}`;
	const base = before.length;
	const start = options.selectionStart ?? base + nextText.length;
	const end = options.selectionEnd ?? start;
	overlay.focus({ preventScroll: true });
	try {
		overlay.setSelectionRange(start, end);
	} catch (_) {}
	options.onResize?.();
};

export const wrapPlainEditSelection = (
	overlay: HTMLTextAreaElement,
	prefix: string,
	suffix: string,
	onResize?: () => void
): void => {
	const selection = getPlainEditSelectionRange(overlay);
	const wrapped = `${prefix}${selection.text}${suffix}`;
	const nextStart = selection.start + prefix.length;
	const nextEnd = nextStart + selection.text.length;
	if (selection.start === selection.end) {
		replacePlainEditSelection(overlay, wrapped, {
			selectionStart: nextStart,
			selectionEnd: nextStart,
			onResize,
		});
		return;
	}
	replacePlainEditSelection(overlay, wrapped, {
		selectionStart: nextStart,
		selectionEnd: nextEnd,
		onResize,
	});
};

export const stripPlainEditFormatting = (text: string): string => {
	let result = text;
	result = result.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
	result = result.replace(/==([^=\n]+)==/g, "$1");
	result = result.replace(/\*\*([^*\n]+)\*\*/g, "$1");
	result = result.replace(/\*([^*\n]+)\*/g, "$1");
	result = result.replace(/~~([^~\n]+)~~/g, "$1");
	result = result.replace(/<u>([\s\S]*?)<\/u>/gi, "$1");
	const rubyRegex = createAozoraRubyRegExp();
	result = result.replace(rubyRegex, (_match, ...args) => {
		const groups = args[args.length - 1] as
			| Record<string, string | undefined>
			| undefined;
		return groups?.body2 ?? groups?.body1 ?? _match;
	});
	return result;
};

export const clearPlainEditSelectionFormatting = (
	overlay: HTMLTextAreaElement,
	onResize?: () => void
): void => {
	const selection = getPlainEditSelectionRange(overlay);
	if (selection.start === selection.end) return;
	const stripped = stripPlainEditFormatting(selection.text);
	const nextStart = selection.start;
	const nextEnd = nextStart + stripped.length;
	replacePlainEditSelection(overlay, stripped, {
		selectionStart: nextStart,
		selectionEnd: nextEnd,
		onResize,
	});
};

export const insertPlainEditLink = (
	overlay: HTMLTextAreaElement,
	text: string,
	url: string,
	onResize?: () => void
): void => {
	const selection = getPlainEditSelectionRange(overlay);
	const displayText = text || selection.text || url;
	if (!displayText || !url) return;
	const linkText = `[${displayText}](${url})`;
	const textStart = selection.start + 1;
	const textEnd = textStart + displayText.length;
	replacePlainEditSelection(overlay, linkText, {
		selectionStart: textStart,
		selectionEnd: textEnd,
		onResize,
	});
};

export const insertPlainEditRuby = (
	overlay: HTMLTextAreaElement,
	text: string,
	ruby: string,
	isDot: boolean | undefined,
	buildRubyText: (body: string, rubyText: string, isDot: boolean) => string,
	onResize?: () => void
): void => {
	const selection = getPlainEditSelectionRange(overlay);
	const base = text || selection.text;
	if (!base) return;
	if (!ruby || ruby.trim() === "") {
		replacePlainEditSelection(overlay, base, { onResize });
		return;
	}
	const rubyText = buildRubyText(base, ruby, !!isDot);
	const nextStart = selection.start + rubyText.length;
	replacePlainEditSelection(overlay, rubyText, {
		selectionStart: nextStart,
		selectionEnd: nextStart,
		onResize,
	});
};
