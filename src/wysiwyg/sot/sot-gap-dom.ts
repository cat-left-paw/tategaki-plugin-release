import type { CollapsedGapRange } from "./sot-collapsed-gap-ranges";

export const SOT_COLLAPSED_GAP_CLASS = "tategaki-sot-collapsed-gap";

export function createCollapsedGapElement(
	range: CollapsedGapRange,
): HTMLElement {
	const element = document.createElement("div");
	updateCollapsedGapElement(element, range);
	return element;
}

export function updateCollapsedGapElement(
	element: HTMLElement,
	range: CollapsedGapRange,
): void {
	element.className = SOT_COLLAPSED_GAP_CLASS;
	element.dataset.gapKind = "collapsed";
	element.dataset.startLine = String(range.startLine);
	element.dataset.endLine = String(range.endLine);
	element.dataset.lineCount = String(range.lineCount);
	element.setAttribute("aria-hidden", "true");
	element.setAttribute("contenteditable", "false");
	element.replaceChildren();
}

export function isCollapsedGapElement(
	element: Element | null | undefined,
): element is HTMLElement {
	return !!(
		element instanceof HTMLElement &&
		element.classList.contains(SOT_COLLAPSED_GAP_CLASS) &&
		element.dataset.gapKind === "collapsed"
	);
}

export function getCollapsedGapRangeFromElement(
	element: Element | null | undefined,
): CollapsedGapRange | null {
	if (!isCollapsedGapElement(element)) return null;
	const startLine = Number.parseInt(element.dataset.startLine ?? "", 10);
	const endLine = Number.parseInt(element.dataset.endLine ?? "", 10);
	const lineCount = Number.parseInt(element.dataset.lineCount ?? "", 10);
	if (
		!Number.isFinite(startLine) ||
		!Number.isFinite(endLine) ||
		!Number.isFinite(lineCount)
	) {
		return null;
	}
	return { startLine, endLine, lineCount };
}

