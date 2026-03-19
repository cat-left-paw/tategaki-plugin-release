export type CaretPosition = { node: Node; offset: number };

type DocumentWithCaretApis = Document & {
	caretPositionFromPoint?: (
		clientX: number,
		clientY: number,
	) => {
		offsetNode: Node | null;
		offset: number;
	} | null;
	caretRangeFromPoint?: (
		clientX: number,
		clientY: number,
	) => Range | null;
};

export function getCaretPositionFromPoint(
	doc: Document,
	clientX: number,
	clientY: number
): CaretPosition | null {
	const docWithCaretApis = doc as DocumentWithCaretApis;
	if (typeof docWithCaretApis.caretPositionFromPoint === "function") {
		const pos = docWithCaretApis.caretPositionFromPoint(clientX, clientY);
		if (pos?.offsetNode) {
			return { node: pos.offsetNode, offset: pos.offset };
		}
	}
	if (typeof docWithCaretApis.caretRangeFromPoint === "function") {
		const range = docWithCaretApis.caretRangeFromPoint(clientX, clientY);
		if (range) {
			return {
				node: range.startContainer,
				offset: range.startOffset,
			};
		}
	}
	return null;
}

export function getClampedPointInRect(
	rect: DOMRect,
	clientX: number,
	clientY: number
): { x: number; y: number } {
	const margin = 1;
	const x =
		rect.width > margin * 2
			? Math.max(
					rect.left + margin,
					Math.min(clientX, rect.right - margin)
				)
			: rect.left + rect.width / 2;
	const y =
		rect.height > margin * 2
			? Math.max(
					rect.top + margin,
					Math.min(clientY, rect.bottom - margin)
				)
			: rect.top + rect.height / 2;
	return { x, y };
}

export function getRectUnion(rects: DOMRect[], fallback: DOMRect): DOMRect {
	if (rects.length === 0) return fallback;
	let left = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const rect of rects) {
		left = Math.min(left, rect.left);
		right = Math.max(right, rect.right);
		top = Math.min(top, rect.top);
		bottom = Math.max(bottom, rect.bottom);
	}
	if (!Number.isFinite(left) || !Number.isFinite(right)) return fallback;
	return DOMRect.fromRect({
		x: left,
		y: top,
		width: right - left,
		height: bottom - top,
	});
}
