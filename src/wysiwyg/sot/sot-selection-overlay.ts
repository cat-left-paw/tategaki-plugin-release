import type { LineRange } from "./line-ranges";
import type { SoTEditor } from "./sot-editor";
import {
	getSelectionRectsForLine,
	type SoTSelectionRectsContext,
} from "./sot-selection-rects";

export type SoTSelectionOverlayContext = {
	getDerivedRootEl: () => HTMLElement | null;
	getDerivedContentEl: () => HTMLElement | null;
	getSelectionLayerEl: () => HTMLElement | null;
	getSotEditor: () => SoTEditor | null;
	isCeImeMode: () => boolean;
	ensureLineRendered: (lineEl: HTMLElement) => void;
	getPendingSelectionState: () => {
		pendingText: string;
		pendingSelectionFrom: number | null;
	};
	getLineRanges: () => LineRange[];
	findLineIndex: (offset: number) => number | null;
	getLineElement: (lineIndex: number) => HTMLElement | null;
	getLineTextNodes: (lineEl: HTMLElement) => Text[];
	findTextNodeAtOffset: (
		lineEl: HTMLElement,
		localOffset: number
	) => { node: Text; offset: number } | null;
	isPointerSelecting: () => boolean;
	isAutoScrollSelecting: () => boolean;
};

export class SoTSelectionOverlay {
	private context: SoTSelectionOverlayContext;

	constructor(context: SoTSelectionOverlayContext) {
		this.context = context;
	}

	updateSelectionOverlay(): void {
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		const selectionLayerEl = this.context.getSelectionLayerEl();
		const sotEditor = this.context.getSotEditor();
		if (!rootEl || !contentEl || !selectionLayerEl || !sotEditor) {
			return;
		}
		const pendingState = this.context.getPendingSelectionState();
		if (
			pendingState.pendingText.length > 0 &&
			pendingState.pendingSelectionFrom !== null
		) {
			selectionLayerEl.replaceChildren();
			return;
		}

		const selection = sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		if (from === to) {
			selectionLayerEl.replaceChildren();
			return;
		}
		const rootRect = rootEl.getBoundingClientRect();
		if (this.context.isAutoScrollSelecting()) {
			selectionLayerEl.replaceChildren();
			const contentRect = contentEl.getBoundingClientRect();
			const left = Math.max(rootRect.left, contentRect.left);
			const right = Math.min(rootRect.right, contentRect.right);
			const top = Math.max(rootRect.top, contentRect.top);
			const bottom = Math.min(rootRect.bottom, contentRect.bottom);
			const width = Math.max(0, right - left);
			const height = Math.max(0, bottom - top);
			if (width > 0 && height > 0) {
				const overlay = this.createSelectionRect(
					new DOMRect(left, top, width, height),
					rootRect,
					rootEl
				);
				selectionLayerEl.appendChild(overlay);
			}
			return;
		}
		const selectionStartLine = this.context.findLineIndex(from);
		const selectionEndLine = this.context.findLineIndex(to);
		if (selectionStartLine === null || selectionEndLine === null) {
			selectionLayerEl.replaceChildren();
			return;
		}
		// During pointer-drag selection (including auto-scroll), all scrolled
		// text is within the selection range. Skip visible-range clipping so
		// highlight rects are rendered for every selected line, preventing the
		// highlight from lagging behind fast auto-scroll.
		const pointerSelecting = this.context.isPointerSelecting();
		const visibleRange = pointerSelecting
			? null
			: this.findVisibleLineRange(rootEl);
		const startLine =
			visibleRange !== null
				? Math.max(selectionStartLine, visibleRange.start)
				: selectionStartLine;
		const endLine =
			visibleRange !== null
				? Math.min(selectionEndLine, visibleRange.end)
				: selectionEndLine;
		if (startLine > endLine) {
			selectionLayerEl.replaceChildren();
			return;
		}
		const writingMode = window.getComputedStyle(rootEl).writingMode;
		const fragment = document.createDocumentFragment();
		const lineRanges = this.context.getLineRanges();
		const rectContext: SoTSelectionRectsContext = {
			getLineTextNodes: (lineEl) => this.context.getLineTextNodes(lineEl),
			findTextNodeAtOffset: (lineEl, localOffset) =>
				this.context.findTextNodeAtOffset(lineEl, localOffset),
		};

		for (let i = startLine; i <= endLine; i += 1) {
			const lineRange = lineRanges[i];
			const lineEl = this.context.getLineElement(i);
			if (!lineRange || !lineEl) continue;
			this.context.ensureLineRendered(lineEl);
			const lineLength = lineRange.to - lineRange.from;
			let startOffset = 0;
			let endOffset = lineLength;
			if (i === startLine) {
				startOffset = Math.max(
					0,
					Math.min(from - lineRange.from, lineLength)
				);
			}
			if (i === endLine) {
				endOffset = Math.max(
					0,
					Math.min(to - lineRange.from, lineLength)
				);
			}

			if (lineLength === 0) {
				if (from <= lineRange.from && to >= lineRange.to) {
					const eol = lineEl.querySelector(
						".tategaki-sot-eol"
					) as HTMLElement | null;
					const rect =
						eol?.getBoundingClientRect() ??
						lineEl.getBoundingClientRect();
					const overlay = this.createSelectionRect(
						rect,
						rootRect,
						rootEl
					);
					fragment.appendChild(overlay);
				}
				continue;
			}

			if (startOffset === endOffset) continue;
			const rects = getSelectionRectsForLine(
				lineEl,
				lineRange,
				startOffset,
				endOffset,
				writingMode,
				rectContext
			);
			for (const rect of rects) {
				const overlay = this.createSelectionRect(rect, rootRect, rootEl);
				fragment.appendChild(overlay);
			}
		}

		selectionLayerEl.replaceChildren(fragment);
	}

	private findVisibleLineRange(
		rootEl: HTMLElement
	): { start: number; end: number } | null {
		const rect = rootEl.getBoundingClientRect();
		const points = [
			{ x: rect.left + 4, y: rect.top + 4 },
			{ x: rect.left + 4, y: rect.bottom - 4 },
			{ x: rect.right - 4, y: rect.top + 4 },
			{ x: rect.right - 4, y: rect.bottom - 4 },
			{ x: rect.left + rect.width / 2, y: rect.top + 4 },
			{ x: rect.left + rect.width / 2, y: rect.bottom - 4 },
		];

		const resolveLineIndex = (x: number, y: number): number | null => {
			const el = document.elementFromPoint(x, y) as HTMLElement | null;
			const lineEl = el?.closest(".tategaki-sot-line") as HTMLElement | null;
			if (!lineEl) return null;
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			return Number.isFinite(index) ? index : null;
		};

		let topIndex: number | null = null;
		let bottomIndex: number | null = null;
		for (const point of points) {
			const index = resolveLineIndex(point.x, point.y);
			if (index === null) continue;
			if (topIndex === null || index < topIndex) {
				topIndex = index;
			}
			if (bottomIndex === null || index > bottomIndex) {
				bottomIndex = index;
			}
		}

		if (topIndex === null || bottomIndex === null) return null;
		return { start: topIndex, end: bottomIndex };
	}

	private createSelectionRect(
		rect: DOMRect,
		rootRect: DOMRect,
		rootEl: HTMLElement
	): HTMLElement {
		const overlay = document.createElement("div");
		overlay.className = "tategaki-sot-selection-rect";
		const left = rect.left - rootRect.left + rootEl.scrollLeft;
		const top = rect.top - rootRect.top + rootEl.scrollTop;
		const width = Math.max(1, rect.width);
		const height = Math.max(1, rect.height);
		overlay.style.left = `${left}px`;
		overlay.style.top = `${top}px`;
		overlay.style.width = `${width}px`;
		overlay.style.height = `${height}px`;
		return overlay;
	}
}
