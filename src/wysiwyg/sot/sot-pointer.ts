import { getRectUnion } from "./sot-selection-geometry";

import type { SoTEditor } from "./sot-editor";

export type SoTPointerState = {
	isPointerSelecting: boolean;
	pointerSelectAnchor: number | null;
	pointerSelectPointerId: number | null;
};

export type SoTPointerContext = {
	getSotEditor: () => SoTEditor | null;
	getDerivedRootEl: () => HTMLElement | null;
	getDerivedContentEl: () => HTMLElement | null;
	isCeImeMode: () => boolean;
	ensureLineRendered: (lineEl: HTMLElement) => void;
	getLineVisualRects: (lineEl: HTMLElement) => DOMRect[];
	getLocalOffsetFromPoint: (
		lineEl: HTMLElement,
		clientX: number,
		clientY: number,
		lineLength: number
	) => number | null;
	normalizeOffsetToVisible: (offset: number, preferForward: boolean) => number;
	setSelectionNormalized: (anchor: number, head: number) => void;
	scheduleCaretUpdate: (force?: boolean) => void;
	updateSelectionOverlay: () => void;
	setAutoScrollSelecting: (active: boolean) => void;
	focusInputSurface: (shouldFocus: boolean) => void;
	syncSelectionToCe: () => void;
	toggleHeadingFold: (lineIndex: number) => void;
	toggleTaskForLineElement: (lineEl: HTMLElement) => void;
	openHref: (href: string) => void;
	getPointerState: () => SoTPointerState;
	setPointerState: (state: Partial<SoTPointerState>) => void;
};

export class SoTPointerHandler {
	private context: SoTPointerContext;
	private autoScrollRaf: number | null = null;
	private autoScrollActive = false;
	private lastPointerEvent: PointerEvent | null = null;

	constructor(context: SoTPointerContext) {
		this.context = context;
	}

	handlePointerDown(event: PointerEvent): void {
		const sotEditor = this.context.getSotEditor();
		const rootEl = this.context.getDerivedRootEl();
		if (!sotEditor || !rootEl) return;
		if (event.button !== 0) return;
		const target = event.target as HTMLElement | null;

		const calloutToggleTarget = target?.closest(
			".tategaki-md-callout-widget-content .callout-title, .tategaki-md-callout-widget-content .callout-fold"
		) as HTMLElement | null;
		if (calloutToggleTarget && !event.metaKey && !event.ctrlKey) {
			const callout = calloutToggleTarget.closest(
				".tategaki-md-callout-widget-content .callout"
			) as HTMLElement | null;
			if (callout?.classList.contains("is-collapsible")) {
				event.preventDefault();
				event.stopPropagation();
				callout.classList.toggle("is-collapsed");
				return;
			}
		}

		const headingToggle = target?.closest(
			".tategaki-md-heading-toggle"
		) as HTMLElement | null;
		if (headingToggle) {
			const lineEl = headingToggle.closest(
				".tategaki-sot-line"
			) as HTMLElement | null;
			const lineIndex = Number.parseInt(lineEl?.dataset.line ?? "", 10);
			if (lineEl && Number.isFinite(lineIndex)) {
				event.preventDefault();
				event.stopPropagation();
				this.context.toggleHeadingFold(lineIndex);
				return;
			}
		}

		const embedAnchor = target?.closest(
			".tategaki-md-embed-widget-content a"
		) as HTMLAnchorElement | null;
		if (embedAnchor && (event.metaKey || event.ctrlKey)) {
			const dataHref =
				(embedAnchor.dataset as any)?.href ??
				embedAnchor.getAttribute("data-href") ??
				"";
			const href = (
				dataHref ||
				embedAnchor.getAttribute("href") ||
				""
			).trim();
			if (href) {
				event.preventDefault();
				event.stopPropagation();
				this.context.openHref(href);
				return;
			}
		}

		const linkEl = target?.closest(
			".tategaki-sot-run[data-href]"
		) as HTMLElement | null;
		if (linkEl && (event.metaKey || event.ctrlKey)) {
			const href = linkEl.dataset.href ?? "";
			if (href) {
				event.preventDefault();
				event.stopPropagation();
				this.context.openHref(href);
				return;
			}
		}

		const taskToggle = target?.closest(
			".tategaki-md-task-box"
		) as HTMLElement | null;
		if (taskToggle) {
			event.preventDefault();
			event.stopPropagation();
			const lineEl = taskToggle.closest(
				".tategaki-sot-line"
			) as HTMLElement | null;
			if (lineEl) {
				this.context.toggleTaskForLineElement(lineEl);
				this.context.focusInputSurface(true);
			}
			return;
		}

		if (this.context.isCeImeMode()) {
			if (this.handleCeClickToLineEnd(event)) {
				event.preventDefault();
				event.stopPropagation();
				this.context.focusInputSurface(true);
				return;
			}
			return;
		}

		event.preventDefault();
		rootEl.focus({ preventScroll: true });
		const hitOffset = this.getOffsetFromPointerEvent(event);
		if (hitOffset !== null) {
			const selection = sotEditor.getSelection();
			const anchor = event.shiftKey ? selection.anchor : hitOffset;
			this.context.setPointerState({
				isPointerSelecting: true,
				pointerSelectAnchor: this.context.normalizeOffsetToVisible(
					anchor,
					hitOffset >= anchor
				),
				pointerSelectPointerId: event.pointerId,
			});
			try {
				rootEl.setPointerCapture(event.pointerId);
			} catch (_) {}
			this.context.setSelectionNormalized(anchor, hitOffset);
			this.context.scheduleCaretUpdate(true);
		}
		this.context.focusInputSurface(true);
	}

	handlePointerMove(event: PointerEvent): void {
		if (this.context.isCeImeMode()) return;
		const sotEditor = this.context.getSotEditor();
		if (!sotEditor) return;
		const state = this.context.getPointerState();
		if (!state.isPointerSelecting) return;
		if (
			state.pointerSelectPointerId !== null &&
			event.pointerId !== state.pointerSelectPointerId
		) {
			return;
		}
		this.lastPointerEvent = event;
		const hitOffset = this.getOffsetFromPointerEvent(event);
		if (hitOffset === null || state.pointerSelectAnchor === null) return;
		this.context.setSelectionNormalized(state.pointerSelectAnchor, hitOffset);
		this.context.updateSelectionOverlay();
		this.updateAutoScroll();
	}

	handlePointerUp(event: PointerEvent): void {
		if (this.context.isCeImeMode()) return;
		const state = this.context.getPointerState();
		if (!state.isPointerSelecting) return;
		if (
			state.pointerSelectPointerId !== null &&
			event.pointerId !== state.pointerSelectPointerId
		) {
			return;
		}
		const hitOffset = this.getOffsetFromPointerEvent(event);
		if (hitOffset !== null && state.pointerSelectAnchor !== null) {
			this.context.setSelectionNormalized(state.pointerSelectAnchor, hitOffset);
			this.context.updateSelectionOverlay();
		}
		const rootEl = this.context.getDerivedRootEl();
		if (rootEl && state.pointerSelectPointerId !== null) {
			try {
				rootEl.releasePointerCapture(state.pointerSelectPointerId);
			} catch (_) {}
		}
		this.context.setPointerState({
			isPointerSelecting: false,
			pointerSelectAnchor: null,
			pointerSelectPointerId: null,
		});
		this.stopAutoScroll();
	}

	private updateAutoScroll(): void {
		const rootEl = this.context.getDerivedRootEl();
		const state = this.context.getPointerState();
		if (!rootEl || !this.lastPointerEvent || !state.isPointerSelecting) {
			this.stopAutoScroll();
			return;
		}
		const { delta } = this.computeAutoScrollDelta(rootEl, this.lastPointerEvent);
		if (delta === 0) {
			this.stopAutoScroll();
			return;
		}
		if (this.autoScrollActive) return;
		this.autoScrollActive = true;
		this.context.setAutoScrollSelecting(true);
		this.autoScrollRaf = window.requestAnimationFrame(() => {
			this.runAutoScroll();
		});
	}

	private runAutoScroll(): void {
		if (!this.autoScrollActive) return;
		const rootEl = this.context.getDerivedRootEl();
		const state = this.context.getPointerState();
		const event = this.lastPointerEvent;
		if (!rootEl || !event || !state.isPointerSelecting) {
			this.stopAutoScroll();
			return;
		}
		const { delta, axis } = this.computeAutoScrollDelta(rootEl, event);
		if (delta === 0) {
			this.stopAutoScroll();
			return;
		}
		if (axis === "x") {
			rootEl.scrollLeft += delta;
		} else {
			rootEl.scrollTop += delta;
		}
		const hitOffset = this.getOffsetFromPointerEvent(event);
		if (hitOffset !== null && state.pointerSelectAnchor !== null) {
			this.context.setSelectionNormalized(state.pointerSelectAnchor, hitOffset);
			this.context.updateSelectionOverlay();
		}
		this.autoScrollRaf = window.requestAnimationFrame(() => {
			this.runAutoScroll();
		});
	}

	private stopAutoScroll(): void {
		if (this.autoScrollRaf !== null) {
			window.cancelAnimationFrame(this.autoScrollRaf);
			this.autoScrollRaf = null;
		}
		this.autoScrollActive = false;
		this.context.setAutoScrollSelecting(false);
	}

	private computeAutoScrollDelta(
		rootEl: HTMLElement,
		event: PointerEvent
	): { delta: number; axis: "x" | "y" } {
		const rect = rootEl.getBoundingClientRect();
		const writingMode = window.getComputedStyle(rootEl).writingMode;
		const isVertical = writingMode.startsWith("vertical");
		const edgeThreshold = 28;
		if (isVertical) {
			const distLeft = event.clientX - rect.left;
			const distRight = rect.right - event.clientX;
			if (distLeft < edgeThreshold) {
				return {
					delta: -this.computeAutoScrollSpeed(distLeft, edgeThreshold),
					axis: "x",
				};
			}
			if (distRight < edgeThreshold) {
				return {
					delta: this.computeAutoScrollSpeed(distRight, edgeThreshold),
					axis: "x",
				};
			}
			return { delta: 0, axis: "x" };
		}
		const distTop = event.clientY - rect.top;
		const distBottom = rect.bottom - event.clientY;
		if (distTop < edgeThreshold) {
			return {
				delta: -this.computeAutoScrollSpeed(distTop, edgeThreshold),
				axis: "y",
			};
		}
		if (distBottom < edgeThreshold) {
			return {
				delta: this.computeAutoScrollSpeed(distBottom, edgeThreshold),
				axis: "y",
			};
		}
		return { delta: 0, axis: "y" };
	}

	private computeAutoScrollSpeed(
		distance: number,
		threshold: number
	): number {
		const clamped = Math.max(0, Math.min(distance, threshold));
		const factor = (threshold - clamped) / threshold;
		const minSpeed = 2;
		const maxSpeed = 24;
		return minSpeed + (maxSpeed - minSpeed) * factor;
	}

	private handleCeClickToLineEnd(event: PointerEvent): boolean {
		const sotEditor = this.context.getSotEditor();
		const rootEl = this.context.getDerivedRootEl();
		if (!this.context.isCeImeMode() || !sotEditor || !rootEl) {
			return false;
		}
		let lineEl = this.findLineElementFromPoint(
			event.clientX,
			event.clientY
		);
		if (!lineEl) {
			lineEl = this.findNearestLineElementFromPoint(
				event.clientX,
				event.clientY
			);
		}
		if (!lineEl) return false;
		this.context.ensureLineRendered(lineEl);
		const from = Number.parseInt(lineEl.dataset.from ?? "0", 10);
		const to = Number.parseInt(lineEl.dataset.to ?? "0", 10);
		const lineLength = Math.max(0, to - from);
		if (lineLength === 0) {
			this.context.setSelectionNormalized(to, to);
			this.context.syncSelectionToCe();
			return true;
		}
		const rects = this.context.getLineVisualRects(lineEl);
		if (rects.length === 0) return false;
		const writingMode = window.getComputedStyle(rootEl).writingMode;
		const isVertical = writingMode.startsWith("vertical");
		const margin = 2;
		let endRect = rects[0]!;
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
				event.clientX >= endRect.left - margin &&
				event.clientX <= endRect.right + margin;
			if (withinColumn && event.clientY > endRect.bottom + margin) {
				this.context.setSelectionNormalized(to, to);
				this.context.syncSelectionToCe();
				return true;
			}
			return false;
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
			event.clientY >= endRect.top - margin &&
			event.clientY <= endRect.bottom + margin;
		if (withinLine && event.clientX > endRect.right + margin) {
			this.context.setSelectionNormalized(to, to);
			this.context.syncSelectionToCe();
			return true;
		}
		return false;
	}

	private getOffsetFromPointerEvent(event: PointerEvent): number | null {
		const rootEl = this.context.getDerivedRootEl();
		if (!rootEl) return null;
		const target = event.target as HTMLElement | null;
		const widgetEl = target?.closest(
			".tategaki-md-inline-widget"
		) as HTMLElement | null;
		let lineEl = target?.closest(
			".tategaki-sot-line"
		) as HTMLElement | null;
		if (!lineEl) {
			lineEl = this.findLineElementFromPoint(
				event.clientX,
				event.clientY
			);
		}
		if (!lineEl) return null;
		this.context.ensureLineRendered(lineEl);
		const from = Number.parseInt(lineEl.dataset.from ?? "0", 10);
		const to = Number.parseInt(lineEl.dataset.to ?? "0", 10);
		if (widgetEl && lineEl.contains(widgetEl)) {
			const relFrom = Number.parseInt(widgetEl.dataset.from ?? "", 10);
			const relTo = Number.parseInt(widgetEl.dataset.to ?? "", 10);
			const absFrom = from + (Number.isFinite(relFrom) ? relFrom : 0);
			const absTo = from + (Number.isFinite(relTo) ? relTo : 0);
			const safeAbsFrom = Math.max(from, Math.min(absFrom, to));
			const safeAbsTo = Math.max(from, Math.min(absTo, to));
			const rect = widgetEl.getBoundingClientRect();
			const writingMode = window.getComputedStyle(rootEl).writingMode;
			if (writingMode.startsWith("vertical")) {
				const mid = rect.top + rect.height / 2;
				return this.context.normalizeOffsetToVisible(
					event.clientY > mid ? safeAbsTo : safeAbsFrom,
					true
				);
			}
			const mid = rect.left + rect.width / 2;
			return this.context.normalizeOffsetToVisible(
				event.clientX > mid ? safeAbsTo : safeAbsFrom,
				true
			);
		}
		const mdKind = lineEl.dataset.mdKind ?? "";
		if (
			mdKind === "image-widget" ||
			mdKind === "embed-widget" ||
			mdKind === "math-widget" ||
			mdKind === "math-hidden" ||
			mdKind === "callout-widget" ||
			mdKind === "callout-hidden" ||
			mdKind === "table-widget" ||
			mdKind === "table-hidden" ||
			mdKind === "deflist-widget" ||
			mdKind === "deflist-hidden" ||
			mdKind === "heading-hidden"
		) {
			return this.context.normalizeOffsetToVisible(from, true);
		}
		const lineLength = Math.max(0, to - from);
		const localOffset =
			this.context.getLocalOffsetFromPoint(
				lineEl,
				event.clientX,
				event.clientY,
				lineLength
			) ?? 0;
		const clamped = Math.max(0, Math.min(localOffset, lineLength));
		return this.context.normalizeOffsetToVisible(from + clamped, true);
	}

	private findLineElementFromPoint(
		clientX: number,
		clientY: number
	): HTMLElement | null {
		const el = document.elementFromPoint(
			clientX,
			clientY
		) as HTMLElement | null;
		return el?.closest(".tategaki-sot-line") ?? null;
	}

	private findNearestLineElementFromPoint(
		clientX: number,
		clientY: number
	): HTMLElement | null {
		const contentEl = this.context.getDerivedContentEl();
		if (!contentEl) return null;
		const rootRect = contentEl.getBoundingClientRect();
		const slack = 24;
		if (
			clientX < rootRect.left - slack ||
			clientX > rootRect.right + slack ||
			clientY < rootRect.top - slack ||
			clientY > rootRect.bottom + slack
		) {
			return null;
		}
		const rootEl = this.context.getDerivedRootEl();
		const computedStyle = window.getComputedStyle(rootEl ?? contentEl);
		const writingMode = computedStyle.writingMode;
		const isVertical = writingMode.startsWith("vertical");
		const fontSize = Number.parseFloat(computedStyle.fontSize) || 18;
		const lineHeight =
			Number.parseFloat(computedStyle.lineHeight) ||
			Math.max(1, fontSize * 1.6);
		const children = Array.from(contentEl.children) as HTMLElement[];
		let bestEl: HTMLElement | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const child of children) {
			if (!child.classList.contains("tategaki-sot-line")) continue;
			const rects = this.context.getLineVisualRects(child);
			const baseRect =
				rects.length > 0
					? getRectUnion(rects, child.getBoundingClientRect())
					: child.getBoundingClientRect();
			if (!Number.isFinite(baseRect.left)) continue;
			let left = baseRect.left;
			let top = baseRect.top;
			let width = Math.max(baseRect.width, fontSize);
			let height = Math.max(baseRect.height, lineHeight);
			if (isVertical) {
				width = Math.max(width, fontSize);
				height = Math.max(height, lineHeight);
			}
			if (width > baseRect.width) {
				left -= (width - baseRect.width) / 2;
			}
			if (height > baseRect.height) {
				top -= (height - baseRect.height) / 2;
			}
			const right = left + width;
			const bottom = top + height;
			const dx =
				clientX < left ? left - clientX : clientX > right ? clientX - right : 0;
			const dy =
				clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
			const distance = dx * dx + dy * dy;
			if (distance < bestDistance) {
				bestDistance = distance;
				bestEl = child;
			}
		}
		return bestEl;
	}
}
