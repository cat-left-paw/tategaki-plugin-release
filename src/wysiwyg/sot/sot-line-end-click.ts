import { getViewComputedStyle } from "./sot-view-local-dom";

type SoTLineEndClickOptions = {
	rects: DOMRect[];
	writingMode: string;
	clientX: number;
	clientY: number;
	margin?: number;
};

export function resolveSoTLinePointWritingMode(
	rootEl: HTMLElement | null,
	lineEl: HTMLElement,
): string {
	return getViewComputedStyle(rootEl ?? lineEl).writingMode;
}

export function shouldSnapPointToLineEnd({
	rects,
	writingMode,
	clientX,
	clientY,
	margin = 2,
}: SoTLineEndClickOptions): boolean {
	if (rects.length === 0) return false;
	const firstRect = rects[0];
	if (!firstRect) return false;

	const isVertical = writingMode.startsWith("vertical");
	let endRect = firstRect;
	if (isVertical) {
		const isVerticalRL = writingMode !== "vertical-lr";
		for (const rect of rects) {
			if (isVerticalRL) {
				if (rect.left < endRect.left - 0.5) {
					endRect = rect;
				}
			} else if (rect.left > endRect.left + 0.5) {
				endRect = rect;
			}
		}
		const withinColumn =
			clientX >= endRect.left - margin &&
			clientX <= endRect.right + margin;
		return withinColumn && clientY > endRect.bottom + margin;
	}

	for (const rect of rects) {
		if (rect.top > endRect.top + 0.5) {
			endRect = rect;
		} else if (
			Math.abs(rect.top - endRect.top) < 0.5 &&
			rect.right > endRect.right
		) {
			endRect = rect;
		}
	}
	const withinLine =
		clientY >= endRect.top - margin &&
		clientY <= endRect.bottom + margin;
	return withinLine && clientX > endRect.right + margin;
}
