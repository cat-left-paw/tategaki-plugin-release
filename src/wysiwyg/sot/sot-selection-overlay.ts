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
	isNativeSelectionEnabled?: () => boolean;
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
	private autoScrollOverlay: HTMLElement | null = null;

	constructor(context: SoTSelectionOverlayContext) {
		this.context = context;
	}

	updateSelectionOverlay(
		options: {
			allowNativeSelection?: boolean;
			preferApproxVisibleRange?: boolean;
		} = {}
	): void {
		const sotEditor = this.context.getSotEditor();
		if (!sotEditor) return;
		const selection = sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		this.updateSelectionOverlayForRange(from, to, {
			forceVisibleRange: false,
			allowNativeSelection: options.allowNativeSelection,
			preferApproxVisibleRange: options.preferApproxVisibleRange,
		});
	}

	updateSelectionOverlayForRange(
		from: number,
		to: number,
		options: {
			forceVisibleRange?: boolean;
			allowNativeSelection?: boolean;
			preferApproxVisibleRange?: boolean;
		} = {}
	): void {
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		const selectionLayerEl = this.context.getSelectionLayerEl();
		if (!rootEl || !contentEl || !selectionLayerEl) {
			return;
		}
		if (this.context.isCeImeMode()) {
			selectionLayerEl.replaceChildren();
			this.autoScrollOverlay = null;
			return;
		}
		if (
			this.context.isNativeSelectionEnabled?.() &&
			!options.allowNativeSelection
		) {
			selectionLayerEl.replaceChildren();
			this.autoScrollOverlay = null;
			return;
		}
		const pendingState = this.context.getPendingSelectionState();
		if (
			pendingState.pendingText.length > 0 &&
			pendingState.pendingSelectionFrom !== null
		) {
			selectionLayerEl.replaceChildren();
			this.autoScrollOverlay = null;
			return;
		}
		if (from === to) {
			selectionLayerEl.replaceChildren();
			this.autoScrollOverlay = null;
			return;
		}
		this.renderOverlayForRange(
			from,
			to,
			rootEl,
			contentEl,
			selectionLayerEl,
			options.forceVisibleRange === true,
			options.preferApproxVisibleRange === true
		);
	}

	private renderOverlayForRange(
		from: number,
		to: number,
		rootEl: HTMLElement,
		contentEl: HTMLElement,
		selectionLayerEl: HTMLElement,
		forceVisibleRange: boolean,
		preferApproxVisibleRange: boolean
	): void {
		const rootRect = rootEl.getBoundingClientRect();
		if (this.context.isAutoScrollSelecting()) {
			const contentRect = contentEl.getBoundingClientRect();
			const left = Math.max(rootRect.left, contentRect.left);
			const right = Math.min(rootRect.right, contentRect.right);
			const top = Math.max(rootRect.top, contentRect.top);
			const bottom = Math.min(rootRect.bottom, contentRect.bottom);
			const width = Math.max(0, right - left);
			const height = Math.max(0, bottom - top);
			if (width > 0 && height > 0) {
				const rect = new DOMRect(left, top, width, height);
				if (!this.autoScrollOverlay) {
					this.autoScrollOverlay = this.createSelectionRect(
						rect,
						rootRect,
						rootEl
					);
				} else {
					this.updateSelectionRect(
						this.autoScrollOverlay,
						rect,
						rootRect,
						rootEl
					);
				}
				if (this.autoScrollOverlay.parentElement !== selectionLayerEl) {
					selectionLayerEl.replaceChildren(this.autoScrollOverlay);
				}
			} else {
				selectionLayerEl.replaceChildren();
				this.autoScrollOverlay = null;
			}
			return;
		}
		this.autoScrollOverlay = null;
		const selectionStartLine = this.context.findLineIndex(from);
		const selectionEndLine = this.context.findLineIndex(to);
		if (selectionStartLine === null || selectionEndLine === null) {
			selectionLayerEl.replaceChildren();
			return;
		}
		const pointerSelecting = this.context.isPointerSelecting();
		const lineSpan = Math.abs(selectionEndLine - selectionStartLine);
		const pointerLineLimit = 200;
		const shouldClampPointer =
			pointerSelecting && lineSpan >= pointerLineLimit;
		const usePointerSelecting =
			forceVisibleRange || shouldClampPointer ? false : pointerSelecting;
		const visibleRange = usePointerSelecting
			? null
			: preferApproxVisibleRange
				? this.findApproxVisibleLineRange(rootEl)
				: this.findVisibleLineRange(rootEl) ??
					this.findApproxVisibleLineRange(rootEl);
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
			if (!lineRange || !lineEl || !lineEl.isConnected) continue;
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
		const contentEl = this.context.getDerivedContentEl();
		const rootRect = rootEl.getBoundingClientRect();
		const contentRect = contentEl?.getBoundingClientRect() ?? rootRect;
		const left = Math.max(rootRect.left, contentRect.left);
		const right = Math.min(rootRect.right, contentRect.right);
		const top = Math.max(rootRect.top, contentRect.top);
		const bottom = Math.min(rootRect.bottom, contentRect.bottom);
		if (right - left < 1 || bottom - top < 1) return null;
		const rect = new DOMRect(left, top, right - left, bottom - top);
		const points = [
			{ x: rect.left + 4, y: rect.top + 4 },
			{ x: rect.left + 4, y: rect.bottom - 4 },
			{ x: rect.right - 4, y: rect.top + 4 },
			{ x: rect.right - 4, y: rect.bottom - 4 },
			{ x: rect.left + rect.width / 2, y: rect.top + 4 },
			{ x: rect.left + rect.width / 2, y: rect.bottom - 4 },
		];

		const resolveLineIndex = (x: number, y: number): number | null => {
			const elements =
				typeof document.elementsFromPoint === "function"
					? document.elementsFromPoint(x, y)
					: [];
			for (const el of elements) {
				const lineEl = (el as HTMLElement).closest(
					".tategaki-sot-line"
				) as HTMLElement | null;
				if (lineEl) {
					const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
					return Number.isFinite(index) ? index : null;
				}
				const frontmatterEl = (el as HTMLElement).closest(
					".tategaki-frontmatter"
				) as HTMLElement | null;
				if (frontmatterEl) {
					const sibling = frontmatterEl.nextElementSibling as
						| HTMLElement
						| null;
					const nextLine =
						sibling?.classList.contains("tategaki-sot-line")
							? sibling
							: (frontmatterEl.parentElement?.querySelector(
									".tategaki-sot-line"
								) as HTMLElement | null);
					if (nextLine) {
						const index = Number.parseInt(
							nextLine.dataset.line ?? "",
							10
						);
						return Number.isFinite(index) ? index : null;
					}
				}
			}
			const el = document.elementFromPoint(x, y) as HTMLElement | null;
			const lineEl = el?.closest(".tategaki-sot-line") as HTMLElement | null;
			if (lineEl) {
				const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
				return Number.isFinite(index) ? index : null;
			}
			const frontmatterEl = el?.closest(
				".tategaki-frontmatter"
			) as HTMLElement | null;
			if (frontmatterEl) {
				const sibling = frontmatterEl.nextElementSibling as
					| HTMLElement
					| null;
				const nextLine =
					sibling?.classList.contains("tategaki-sot-line")
						? sibling
						: (frontmatterEl.parentElement?.querySelector(
								".tategaki-sot-line"
							) as HTMLElement | null);
				if (nextLine) {
					const index = Number.parseInt(
						nextLine.dataset.line ?? "",
						10
					);
					return Number.isFinite(index) ? index : null;
				}
			}
			return null;
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

	private findApproxVisibleLineRange(
		rootEl: HTMLElement
	): { start: number; end: number } | null {
		const lineRanges = this.context.getLineRanges();
		if (lineRanges.length === 0) return null;
		const computed = window.getComputedStyle(rootEl);
		const fontSize = Number.parseFloat(computed.fontSize) || 16;
		const lineHeight =
			Number.parseFloat(computed.lineHeight) || fontSize * 1.8;
		const extent = Math.max(lineHeight, fontSize);
		const isVertical = computed.writingMode !== "horizontal-tb";
		const viewport = isVertical ? rootEl.clientWidth : rootEl.clientHeight;
		let scrollPos = isVertical ? rootEl.scrollLeft : rootEl.scrollTop;
		if (isVertical && scrollPos < 0) {
			scrollPos = -scrollPos;
		}
		const firstVisible = Math.floor(Math.max(0, scrollPos) / extent);
		const visibleCount = Math.ceil(viewport / extent);
		const start = Math.max(0, Math.min(lineRanges.length - 1, firstVisible));
		const end = Math.max(
			start,
			Math.min(lineRanges.length - 1, firstVisible + visibleCount)
		);
		return { start, end };
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

	private updateSelectionRect(
		overlay: HTMLElement,
		rect: DOMRect,
		rootRect: DOMRect,
		rootEl: HTMLElement
	): void {
		const left = rect.left - rootRect.left + rootEl.scrollLeft;
		const top = rect.top - rootRect.top + rootEl.scrollTop;
		const width = Math.max(1, rect.width);
		const height = Math.max(1, rect.height);
		overlay.style.left = `${left}px`;
		overlay.style.top = `${top}px`;
		overlay.style.width = `${width}px`;
		overlay.style.height = `${height}px`;
	}
}
