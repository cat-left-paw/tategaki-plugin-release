import type { LineRange } from "./line-ranges";

export type SoTSelectionRectsContext = {
	getLineTextNodes: (lineEl: HTMLElement) => Text[];
	findTextNodeAtOffset: (
		lineEl: HTMLElement,
		localOffset: number
	) => { node: Text; offset: number } | null;
};

export function getSelectionRectsForLine(
	lineEl: HTMLElement,
	lineRange: LineRange,
	startOffset: number,
	endOffset: number,
	writingMode: string,
	context: SoTSelectionRectsContext
): DOMRect[] {
	const lineLength = lineRange.to - lineRange.from;
	const start = Math.max(0, Math.min(startOffset, lineLength));
	const end = Math.max(0, Math.min(endOffset, lineLength));
	if (start === end) return [];

	const nodes = context.getLineTextNodes(lineEl);
	if (nodes.length === 0) {
		const rect = lineEl.getBoundingClientRect();
		return rect ? [rect] : [];
	}
	const last = nodes[nodes.length - 1];
	const range = document.createRange();
	const startNode =
		start >= lineLength
			? { node: last, offset: last.length }
			: context.findTextNodeAtOffset(lineEl, start);
	const endNode =
		end >= lineLength
			? { node: last, offset: last.length }
			: context.findTextNodeAtOffset(lineEl, end);
	if (!startNode || !endNode) return [];

	const clampOffset = (node: Text, offset: number) =>
		Math.max(0, Math.min(offset, node.length));
	const clampedStart = clampOffset(startNode.node, startNode.offset);
	const clampedEnd = clampOffset(endNode.node, endNode.offset);
	try {
		range.setStart(startNode.node, clampedStart);
		range.setEnd(endNode.node, clampedEnd);
		const rects = Array.from(range.getClientRects());
		return filterSelectionRects(rects, writingMode);
	} catch (_) {
		const rect = lineEl.getBoundingClientRect();
		return rect ? [rect] : [];
	}
}

function filterSelectionRects(
	rects: DOMRect[],
	writingMode: string
): DOMRect[] {
	const filtered = rects.filter(
		(rect) => rect.width > 0 || rect.height > 0
	);
	if (filtered.length <= 1) {
		return filtered;
	}
	const isVertical = writingMode.startsWith("vertical");
	const unique: DOMRect[] = [];
	for (const rect of filtered) {
		if (rect.width <= 0 && rect.height <= 0) continue;
		const duplicated = unique.some(
			(existing) =>
				Math.abs(existing.left - rect.left) < 0.5 &&
				Math.abs(existing.right - rect.right) < 0.5 &&
				Math.abs(existing.top - rect.top) < 0.5 &&
				Math.abs(existing.bottom - rect.bottom) < 0.5
		);
		if (duplicated) continue;
		unique.push(rect);
	}
	if (!isVertical) {
		return unique;
	}
	return unique;
}
