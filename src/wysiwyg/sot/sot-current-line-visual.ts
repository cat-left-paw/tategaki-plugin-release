import type { SoTFocusVisualState } from "./sot-focus-visual-state";

export const SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS =
	"tategaki-sot-focus-current-line";
export const SOT_FOCUS_VISUAL_CURRENT_LINE_OVERLAY_CLASS =
	"tategaki-sot-focus-current-line-overlay";

export type ResolveSoTCurrentLineVisualRectParams = {
	lineVisualRects: DOMRect[];
	caretRect: DOMRect | null;
};

export type ResolveSoTCurrentLineDisplayRectParams = {
	visualRect: DOMRect | null;
	lineRect: DOMRect | null;
	caretRect: DOMRect | null;
	writingMode: string;
	fontSize: number;
	lineHeight: number;
};

export type ResolveSoTCurrentLineVisualRectCandidatesParams = {
	lineVisualRects: DOMRect[];
	pendingLineVisualRects: DOMRect[];
	usePendingCaret: boolean;
};

export type UpdateSoTCurrentLineVisualOverlayParams = {
	rootEl: HTMLElement | null;
	overlayEl: HTMLElement | null;
	state: SoTFocusVisualState;
	rect: DOMRect | null;
};

export function resolveSoTCurrentLineVisualRectCandidates(
	params: ResolveSoTCurrentLineVisualRectCandidatesParams,
): DOMRect[] {
	if (!params.usePendingCaret || params.pendingLineVisualRects.length === 0) {
		return params.lineVisualRects;
	}
	return [...params.lineVisualRects, ...params.pendingLineVisualRects];
}

export function resolveSoTCurrentLineVisualRect(
	params: ResolveSoTCurrentLineVisualRectParams,
): DOMRect | null {
	const { lineVisualRects, caretRect } = params;
	if (lineVisualRects.length === 0 || !caretRect) return null;
	if (lineVisualRects.length === 1) return lineVisualRects[0] ?? null;

	const caretCenterX = caretRect.left + caretRect.width / 2;
	const caretCenterY = caretRect.top + caretRect.height / 2;
	let bestRect = lineVisualRects[0] ?? null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const rect of lineVisualRects) {
		const dx =
			caretCenterX < rect.left
				? rect.left - caretCenterX
				: caretCenterX > rect.right
					? caretCenterX - rect.right
					: 0;
		const dy =
			caretCenterY < rect.top
				? rect.top - caretCenterY
				: caretCenterY > rect.bottom
					? caretCenterY - rect.bottom
					: 0;
		const distance = dx * dx + dy * dy;
		if (distance < bestDistance) {
			bestDistance = distance;
			bestRect = rect;
		}
	}

	return bestRect;
}

export function resolveSoTCurrentLineDisplayRect(
	params: ResolveSoTCurrentLineDisplayRectParams,
): DOMRect | null {
	const {
		visualRect,
		lineRect,
		caretRect,
		writingMode,
		fontSize,
		lineHeight,
	} = params;
	const isVertical = writingMode.startsWith("vertical");
	const baseRect = visualRect ?? lineRect ?? caretRect;
	if (!baseRect) return null;

	const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 18;
	const safeLineHeight =
		Number.isFinite(lineHeight) && lineHeight > 0
			? lineHeight
			: Math.max(safeFontSize * 1.6, 24);
	const crossPaddingPrimary = Math.max(
		3,
		Math.round(safeFontSize * 0.18),
	);
	const crossPaddingFromLineRectAxis = Math.max(
		3,
		Math.round(safeFontSize * 0.14),
	);
	const mainPadding = Math.max(3, Math.round(safeFontSize * 0.18));
	const minCrossSize = Math.max(
		16,
		Math.round(safeFontSize * 1.04),
	);
	const minMainSize = Math.max(
		18,
		Math.round(Math.max(safeLineHeight * 0.82, safeFontSize * 1.2)),
	);

	let left = baseRect.left;
	let top = baseRect.top;
	let width = Math.max(0, baseRect.width);
	let height = Math.max(0, baseRect.height);
	let crossAxisUsesLineRect = false;

	if (visualRect && lineRect) {
		if (isVertical) {
			if (visualRect.width <= 1 && lineRect.width > 1) {
				left = lineRect.left;
				width = Math.max(0, lineRect.width);
				crossAxisUsesLineRect = true;
			} else {
				left = visualRect.left;
				width = Math.max(0, visualRect.width);
			}
			top = lineRect.top;
			height = Math.max(0, lineRect.height);
		} else {
			left = lineRect.left;
			width = Math.max(0, lineRect.width);
			if (visualRect.height <= 1 && lineRect.height > 1) {
				top = lineRect.top;
				height = Math.max(0, lineRect.height);
				crossAxisUsesLineRect = true;
			} else {
				top = visualRect.top;
				height = Math.max(0, visualRect.height);
			}
		}
	}

	if (isVertical) {
		const crossPad = crossAxisUsesLineRect
			? crossPaddingFromLineRectAxis
			: crossPaddingPrimary;
		left -= crossPad;
		width += crossPad * 2;
		if (width < minCrossSize) {
			const delta = minCrossSize - width;
			left -= delta / 2;
			width = minCrossSize;
		}
		if (!lineRect) {
			top -= mainPadding;
			height += mainPadding * 2;
		}
		if (height < minMainSize) {
			const delta = minMainSize - height;
			top -= delta / 2;
			height = minMainSize;
		}
	} else {
		const crossPad = crossAxisUsesLineRect
			? crossPaddingFromLineRectAxis
			: crossPaddingPrimary;
		top -= crossPad;
		height += crossPad * 2;
		if (!lineRect) {
			left -= mainPadding;
			width += mainPadding * 2;
		}
		if (width < minMainSize) {
			const delta = minMainSize - width;
			left -= delta / 2;
			width = minMainSize;
		}
		if (height < minCrossSize) {
			const delta = minCrossSize - height;
			top -= delta / 2;
			height = minCrossSize;
		}
	}

	return new DOMRect(left, top, width, height);
}

export function updateSoTCurrentLineVisualOverlay(
	params: UpdateSoTCurrentLineVisualOverlayParams,
): void {
	const { rootEl, overlayEl, state, rect } = params;
	if (!overlayEl) return;

	const active =
		!!rootEl &&
		state.active &&
		state.currentLineHighlightEnabled &&
		state.currentLineIndex !== null &&
		rect !== null &&
		rect.width >= 0 &&
		rect.height >= 0;

	overlayEl.classList.toggle(SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS, active);
	overlayEl.style.display = active ? "block" : "none";
	if (!active || !rootEl || !rect) {
		return;
	}

	const rootRect = rootEl.getBoundingClientRect();
	const left = rect.left - rootRect.left + rootEl.scrollLeft;
	const top = rect.top - rootRect.top + rootEl.scrollTop;
	overlayEl.style.left = `${left}px`;
	overlayEl.style.top = `${top}px`;
	overlayEl.style.width = `${Math.max(0, rect.width)}px`;
	overlayEl.style.height = `${Math.max(0, rect.height)}px`;
}
