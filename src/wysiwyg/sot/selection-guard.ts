import type { SoTEditor } from "./sot-editor";

export type DomSelectAllDecision = {
	allowDomSelectAll: boolean;
	elapsedMs: number | null;
	docLength: number | null;
	lineCount: number | null;
	reason:
		| "ok"
		| "timeout"
		| "no-editor"
		| "doc-length"
		| "line-count"
		| "virtualized";
};

export type DomSelectAllGuardOptions = {
	timeoutMs?: number;
	maxDocLength?: number;
	maxLineCount?: number;
	virtualized?: boolean;
};

export const DEFAULT_DOM_SELECTALL_TIMEOUT_MS = 50;

export function decideDomSelectAll(
	editor: SoTEditor | null,
	lineCount: number | null,
	options: DomSelectAllGuardOptions = {}
): DomSelectAllDecision {
	if (!editor) {
		return {
			allowDomSelectAll: false,
			elapsedMs: null,
			docLength: null,
			lineCount,
			reason: "no-editor",
		};
	}
	const start = performance.now();
	const docLength = editor.getDoc().length;
	const elapsedMs = performance.now() - start;
	if (options.virtualized) {
		return {
			allowDomSelectAll: false,
			elapsedMs,
			docLength,
			lineCount,
			reason: "virtualized",
		};
	}
	if (
		typeof options.maxDocLength === "number" &&
		docLength >= options.maxDocLength
	) {
		return {
			allowDomSelectAll: false,
			elapsedMs,
			docLength,
			lineCount,
			reason: "doc-length",
		};
	}
	if (
		typeof options.maxLineCount === "number" &&
		typeof lineCount === "number" &&
		lineCount >= options.maxLineCount
	) {
		return {
			allowDomSelectAll: false,
			elapsedMs,
			docLength,
			lineCount,
			reason: "line-count",
		};
	}
	const timeoutMs = options.timeoutMs ?? DEFAULT_DOM_SELECTALL_TIMEOUT_MS;
	if (elapsedMs > timeoutMs) {
		return {
			allowDomSelectAll: false,
			elapsedMs,
			docLength,
			lineCount,
			reason: "timeout",
		};
	}
	return {
		allowDomSelectAll: true,
		elapsedMs,
		docLength,
		lineCount,
		reason: "ok",
	};
}
