import {
	isSoTFocusVisualLineInBlock,
	type SoTFocusVisualState,
} from "./sot-focus-visual-state";
export {
	SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS,
} from "./sot-current-line-visual";

export const SOT_FOCUS_VISUAL_ROOT_CLASS = "tategaki-sot-focus-visual-active";
export const SOT_FOCUS_VISUAL_DIM_ROOT_CLASS =
	"tategaki-sot-focus-visual-dim-enabled";
export const SOT_FOCUS_VISUAL_BLOCK_HIGHLIGHT_ROOT_CLASS =
	"tategaki-sot-focus-block-highlight-enabled";
export const SOT_FOCUS_VISUAL_LINE_CLASS = "tategaki-sot-focus-block-line";
export const SOT_FOCUS_VISUAL_LINE_DATASET = "focusBlock";

type SoTFocusVisualLineClassParams = {
	lineEl: HTMLElement;
	lineIndex: number | null;
	state: SoTFocusVisualState;
};

type UpdateSoTFocusVisualDomParams = {
	rootEl: HTMLElement | null;
	previousState: SoTFocusVisualState;
	nextState: SoTFocusVisualState;
	getLineElement: (lineIndex: number) => HTMLElement | null;
};

function shouldSkipFocusVisualLine(lineEl: HTMLElement): boolean {
	if (lineEl.classList.contains("tategaki-sot-line-virtual")) return true;
	const mdKind = lineEl.dataset.mdKind ?? "";
	return mdKind === "heading-hidden" || mdKind.endsWith("-hidden");
}

function setFocusVisualLineActive(lineEl: HTMLElement, active: boolean): void {
	lineEl.classList.toggle(SOT_FOCUS_VISUAL_LINE_CLASS, active);
	if (active) {
		lineEl.dataset[SOT_FOCUS_VISUAL_LINE_DATASET] = "1";
		return;
	}
	delete lineEl.dataset[SOT_FOCUS_VISUAL_LINE_DATASET];
}

function setFocusVisualCurrentLineActive(
	lineEl: HTMLElement,
	active: boolean,
): void {
	if (!active && lineEl.classList.contains("tategaki-sot-focus-current-line")) {
		lineEl.classList.remove("tategaki-sot-focus-current-line");
	}
	delete lineEl.dataset.focusCurrentLine;
}

function forEachRange(
	start: number | null,
	end: number | null,
	callback: (lineIndex: number) => void,
): void {
	if (
		typeof start !== "number" ||
		typeof end !== "number" ||
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		end < start
	) {
		return;
	}
	for (let i = start; i <= end; i += 1) {
		callback(i);
	}
}

export function applySoTFocusVisualClassesToLine(
	params: SoTFocusVisualLineClassParams,
): void {
	const { lineEl, lineIndex, state } = params;
	if (lineIndex === null || shouldSkipFocusVisualLine(lineEl)) {
		setFocusVisualLineActive(lineEl, false);
		setFocusVisualCurrentLineActive(lineEl, false);
		return;
	}
	setFocusVisualLineActive(
		lineEl,
		isSoTFocusVisualLineInBlock(state, lineIndex),
	);
	setFocusVisualCurrentLineActive(lineEl, false);
}

export function updateSoTFocusVisualDom(
	params: UpdateSoTFocusVisualDomParams,
): void {
	const { rootEl, previousState, nextState, getLineElement } = params;
	if (rootEl) {
		rootEl.classList.toggle(SOT_FOCUS_VISUAL_ROOT_CLASS, nextState.active);
		rootEl.classList.toggle(
			SOT_FOCUS_VISUAL_DIM_ROOT_CLASS,
			nextState.active && nextState.nonFocusDimEnabled,
		);
		rootEl.classList.toggle(
			SOT_FOCUS_VISUAL_BLOCK_HIGHLIGHT_ROOT_CLASS,
			nextState.active && nextState.blockHighlightEnabled,
		);
	}

	forEachRange(previousState.focusLineStart, previousState.focusLineEnd, (lineIndex) => {
		if (isSoTFocusVisualLineInBlock(nextState, lineIndex)) return;
		const lineEl = getLineElement(lineIndex);
		if (!lineEl) return;
		setFocusVisualLineActive(lineEl, false);
	});
	if (previousState.currentLineIndex !== null) {
		const lineEl = getLineElement(previousState.currentLineIndex);
		if (lineEl) {
			setFocusVisualCurrentLineActive(lineEl, false);
		}
	}

	forEachRange(nextState.focusLineStart, nextState.focusLineEnd, (lineIndex) => {
		const wasBlockLine = isSoTFocusVisualLineInBlock(previousState, lineIndex);
		if (wasBlockLine) return;
		const lineEl = getLineElement(lineIndex);
		if (!lineEl) return;
		applySoTFocusVisualClassesToLine({
			lineEl,
			lineIndex,
			state: nextState,
		});
	});
	if (nextState.currentLineIndex !== null) {
		const lineEl = getLineElement(nextState.currentLineIndex);
		if (lineEl) {
			setFocusVisualCurrentLineActive(lineEl, false);
		}
	}

}
