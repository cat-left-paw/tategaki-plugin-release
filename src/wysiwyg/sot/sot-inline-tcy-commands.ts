import { Notice } from "obsidian";
import {
	buildAozoraTcyText,
	isValidAozoraTcyBody,
	stripAozoraTcySyntax,
} from "../../shared/aozora-tcy";
import { t } from "../../shared/i18n";
import {
	getPlainEditSelectionRange,
	replacePlainEditSelection,
} from "./sot-plain-edit-utils";
import {
	collectClearableTcySpansForLine,
	findTcyMatchForSelection,
} from "./sot-inline-tcy";

type SoTRange = {
	from: number;
	to: number;
};

type SoTSelection = {
	anchor: number;
	head: number;
};

type SoTEditorLike = {
	getSelection(): SoTSelection;
	getDoc(): string;
	replaceRange(from: number, to: number, insert: string): void;
};

type SoTLineRange = {
	from: number;
	to: number;
};

export type SoTInlineTcyCommandHost = {
	sourceModeEnabled: boolean;
	plainEditOverlayEl: HTMLTextAreaElement | null;
	sotEditor: SoTEditorLike | null;
	lineRanges: SoTLineRange[];
	immediateRender: boolean;
	adjustPlainEditOverlaySize(): void;
	findLineIndex(pos: number): number | null;
	updatePendingText(text: string, immediate?: boolean): void;
	runCeMutation(fn: () => void): void;
	setSelectionNormalized(from: number, to: number): void;
	focusInputSurface(focusEditor?: boolean): void;
	mergeRanges(ranges: SoTRange[]): SoTRange[];
};

export function runInsertTcyCommand(host: unknown): void {
	const h = host as SoTInlineTcyCommandHost;
	if (h.sourceModeEnabled && h.plainEditOverlayEl) {
		const selection = getPlainEditSelectionRange(h.plainEditOverlayEl);
		const selectedText = selection.text ?? "";
		if (!isValidAozoraTcyBody(selectedText)) {
			return;
		}
		const tcyText = buildAozoraTcyText(selectedText);
		const nextPos = selection.start + tcyText.length;
		replacePlainEditSelection(h.plainEditOverlayEl, tcyText, {
			selectionStart: nextPos,
			selectionEnd: nextPos,
			onResize: () => h.adjustPlainEditOverlaySize(),
		});
		return;
	}
	if (!h.sotEditor) return;
	const selection = h.sotEditor.getSelection();
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	if (from === to) return;

	const doc = h.sotEditor.getDoc();
	const originalSelectedText = doc.slice(from, to);
	if (!originalSelectedText || originalSelectedText.includes("\n")) {
		return;
	}

	let rangeFrom = from;
	let rangeTo = to;
	let bodyText = originalSelectedText;
	const lineIndex = h.findLineIndex(from);
	const endLine = h.findLineIndex(to);
	if (lineIndex !== null && endLine === lineIndex) {
		const lineRange = h.lineRanges[lineIndex];
		if (lineRange) {
			const lineText = doc.slice(lineRange.from, lineRange.to);
			const match = findTcyMatchForSelection(
				lineRange.from,
				lineRange.to,
				from,
				to,
				lineText,
			);
			if (match) {
				rangeFrom = match.rangeFrom;
				rangeTo = match.rangeTo;
				bodyText = match.bodyText;
			}
		}
	}

	if (!isValidAozoraTcyBody(bodyText)) {
		new Notice(t("notice.tcy.invalidSelection"), 2200);
		return;
	}

	h.updatePendingText("", true);
	h.immediateRender = true;
	const insertText = buildAozoraTcyText(bodyText);
	h.runCeMutation(() => {
		h.sotEditor?.replaceRange(rangeFrom, rangeTo, insertText);
	});
	const nextFrom = rangeFrom + 1;
	const nextTo = nextFrom + bodyText.length;
	h.setSelectionNormalized(nextFrom, nextTo);
	h.focusInputSurface(true);
}

export function isTcySelectionActive(host: unknown): boolean {
	const h = host as SoTInlineTcyCommandHost;
	if (h.sourceModeEnabled && h.plainEditOverlayEl) {
		const start = h.plainEditOverlayEl.selectionStart ?? 0;
		const end = h.plainEditOverlayEl.selectionEnd ?? start;
		if (start === end) return false;
		return hasTcyOverlapInPlainText(h.plainEditOverlayEl.value, start, end);
	}
	if (!h.sotEditor) return false;
	const selection = h.sotEditor.getSelection();
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	if (from === to) return false;

	const doc = h.sotEditor.getDoc();
	const startLine = h.findLineIndex(from);
	const endLine = h.findLineIndex(to);
	if (startLine === null || endLine === null) return false;
	for (let i = startLine; i <= endLine; i += 1) {
		const range = h.lineRanges[i];
		if (!range) continue;
		if (range.to < from || range.from > to) continue;
		const lineText = doc.slice(range.from, range.to);
		const spans = collectClearableTcySpansForLine(range.from, lineText);
		for (const span of spans) {
			if (span.to <= from || span.from >= to) continue;
			return true;
		}
	}
	return false;
}

export function runToggleTcyCommand(host: unknown): void {
	if (isTcySelectionActive(host)) {
		runClearTcyCommand(host);
		return;
	}
	runInsertTcyCommand(host);
}

export function runClearTcyCommand(host: unknown): void {
	const h = host as SoTInlineTcyCommandHost;
	if (h.sourceModeEnabled && h.plainEditOverlayEl) {
		const selection = getPlainEditSelectionRange(h.plainEditOverlayEl);
		if (selection.start === selection.end) return;
		const stripped = stripAozoraTcySyntax(selection.text);
		const nextStart = selection.start;
		const nextEnd = nextStart + stripped.length;
		replacePlainEditSelection(h.plainEditOverlayEl, stripped, {
			selectionStart: nextStart,
			selectionEnd: nextEnd,
			onResize: () => h.adjustPlainEditOverlaySize(),
		});
		return;
	}
	if (!h.sotEditor) return;
	const selection = h.sotEditor.getSelection();
	let from = Math.min(selection.anchor, selection.head);
	let to = Math.max(selection.anchor, selection.head);
	if (from === to) return;

	const doc = h.sotEditor.getDoc();
	const startLine = h.findLineIndex(from);
	const endLine = h.findLineIndex(to);
	if (startLine === null || endLine === null) return;

	const removals: Array<{ from: number; to: number }> = [];
	for (let i = startLine; i <= endLine; i += 1) {
		const range = h.lineRanges[i];
		if (!range) continue;
		const lineFrom = range.from;
		const lineTo = range.to;
		if (lineTo < from || lineFrom > to) continue;
		const lineText = doc.slice(lineFrom, lineTo);
		const spans = collectClearableTcySpansForLine(lineFrom, lineText);
		for (const span of spans) {
			if (span.to <= from || span.from >= to) continue;
			removals.push(...span.markers);
		}
	}
	if (removals.length === 0) return;

	h.updatePendingText("", true);
	h.immediateRender = true;
	const merged = h
		.mergeRanges(removals)
		.sort((a, b) => b.from - a.from);
	let nextFrom = from;
	let nextTo = to;
	for (const removal of merged) {
		const len = removal.to - removal.from;
		if (len <= 0) continue;
		h.sotEditor.replaceRange(removal.from, removal.to, "");
		if (removal.to <= nextFrom) {
			nextFrom -= len;
			nextTo -= len;
		} else if (removal.to <= nextTo) {
			nextTo -= len;
		}
	}
	from = nextFrom;
	to = nextTo;
	h.setSelectionNormalized(from, to);
	h.focusInputSurface(true);
}

function hasTcyOverlapInPlainText(
	text: string,
	selectionStart: number,
	selectionEnd: number,
): boolean {
	const from = Math.min(selectionStart, selectionEnd);
	const to = Math.max(selectionStart, selectionEnd);
	if (from === to) return false;
	let lineFrom = 0;
	const lines = text.split("\n");
	for (const lineText of lines) {
		const lineTo = lineFrom + lineText.length;
		if (lineTo >= from && lineFrom <= to) {
			const spans = collectClearableTcySpansForLine(lineFrom, lineText);
			for (const span of spans) {
				if (span.to <= from || span.from >= to) continue;
				return true;
			}
		}
		lineFrom = lineTo + 1;
	}
	return false;
}
