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
	isNativeSelectionEnabled?: () => boolean;
	ensureLineRendered: (lineEl: HTMLElement) => void;
	getLineRanges: () => Array<{ from: number; to: number }>;
	getLineVisualRects: (lineEl: HTMLElement) => DOMRect[];
	getLocalOffsetFromPoint: (
		lineEl: HTMLElement,
		clientX: number,
		clientY: number,
		lineLength: number,
	) => number | null;
	normalizeOffsetToVisible: (
		offset: number,
		preferForward: boolean,
	) => number;
	setSelectionNormalized: (anchor: number, head: number) => void;
	scheduleCaretUpdate: (force?: boolean) => void;
	updateSelectionOverlay: () => void;
	setAutoScrollSelecting: (active: boolean) => void;
	setAutoScrollFast?: (active: boolean) => void;
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
	private lastAutoScrollOffset: number | null = null;
	private autoScrollRemainder = 0;
	private lastAutoScrollAt: number | null = null;
	private autoScrollFast = false;

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
			".tategaki-md-callout-widget-content .callout-title, .tategaki-md-callout-widget-content .callout-fold",
		) as HTMLElement | null;
		if (calloutToggleTarget && !event.metaKey && !event.ctrlKey) {
			const callout = calloutToggleTarget.closest(
				".tategaki-md-callout-widget-content .callout",
			) as HTMLElement | null;
			if (callout?.classList.contains("is-collapsible")) {
				event.preventDefault();
				event.stopPropagation();
				callout.classList.toggle("is-collapsed");
				return;
			}
		}

		const headingToggle = target?.closest(
			".tategaki-md-heading-toggle",
		) as HTMLElement | null;
		if (headingToggle) {
			const lineEl = headingToggle.closest(
				".tategaki-sot-line",
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
			".tategaki-md-embed-widget-content a",
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
			".tategaki-sot-run[data-href]",
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
			".tategaki-md-task-box",
		) as HTMLElement | null;
		if (taskToggle) {
			event.preventDefault();
			event.stopPropagation();
			const lineEl = taskToggle.closest(
				".tategaki-sot-line",
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
		if (this.context.isNativeSelectionEnabled?.()) {
			return;
		}

		event.preventDefault();
		rootEl.focus({ preventScroll: true });
		const hitOffset = this.getOffsetFromPointerEvent(event);
		if (hitOffset !== null) {
			this.lastAutoScrollOffset = hitOffset;
			this.autoScrollRemainder = 0;
			const selection = sotEditor.getSelection();
			const anchor = event.shiftKey ? selection.anchor : hitOffset;
			this.context.setPointerState({
				isPointerSelecting: true,
				pointerSelectAnchor: this.context.normalizeOffsetToVisible(
					anchor,
					hitOffset >= anchor,
				),
				pointerSelectPointerId: event.pointerId,
			});
				try {
					rootEl.setPointerCapture(event.pointerId);
				} catch (_) {
					// noop: setPointerCapture失敗は無視
				}
				this.context.setSelectionNormalized(anchor, hitOffset);
				this.context.scheduleCaretUpdate(true);
			}
		this.context.focusInputSurface(true);
	}

	handlePointerMove(event: PointerEvent): void {
		if (this.context.isCeImeMode()) return;
		if (this.context.isNativeSelectionEnabled?.() && !this.autoScrollActive) return;
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
		this.lastAutoScrollOffset = hitOffset;
		this.autoScrollRemainder = 0;
		this.context.setSelectionNormalized(
			state.pointerSelectAnchor,
			hitOffset,
		);
		this.context.updateSelectionOverlay();
		this.updateAutoScroll();
	}

	handlePointerUp(event: PointerEvent): void {
		if (this.context.isCeImeMode()) return;
		if (this.context.isNativeSelectionEnabled?.() && !this.autoScrollActive) return;
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
			this.lastAutoScrollOffset = hitOffset;
			this.autoScrollRemainder = 0;
			this.context.setSelectionNormalized(
				state.pointerSelectAnchor,
				hitOffset,
			);
			this.context.updateSelectionOverlay();
		}
		const rootEl = this.context.getDerivedRootEl();
		if (rootEl && state.pointerSelectPointerId !== null) {
				try {
					rootEl.releasePointerCapture(state.pointerSelectPointerId);
				} catch (_) {
					// noop: releasePointerCapture失敗は無視
				}
			}
			this.context.setPointerState({
				isPointerSelecting: false,
			pointerSelectAnchor: null,
			pointerSelectPointerId: null,
		});
		this.lastAutoScrollOffset = null;
		this.autoScrollRemainder = 0;
		this.stopAutoScroll();
	}

	private updateAutoScroll(): void {
		if (this.context.isCeImeMode()) {
			this.stopAutoScroll();
			return;
		}
		const rootEl = this.context.getDerivedRootEl();
		const state = this.context.getPointerState();
		if (!rootEl || !this.lastPointerEvent || !state.isPointerSelecting) {
			this.stopAutoScroll();
			return;
		}
		const { delta, axis } = this.computeAutoScrollDelta(
			rootEl,
			this.lastPointerEvent,
		);
		if (delta === 0) {
			this.setAutoScrollFast(false);
			this.stopAutoScroll();
			return;
		}
		this.updateAutoScrollFast(rootEl, axis, this.lastPointerEvent);
		if (this.autoScrollActive) return;
		this.autoScrollActive = true;
		this.lastAutoScrollAt = performance.now();
		this.context.setAutoScrollSelecting(true);
		this.autoScrollRaf = window.requestAnimationFrame(() => {
			this.runAutoScroll();
		});
	}

	private runAutoScroll(): void {
		if (!this.autoScrollActive) return;
		if (this.context.isCeImeMode()) {
			this.stopAutoScroll();
			return;
		}
		const rootEl = this.context.getDerivedRootEl();
		const state = this.context.getPointerState();
		const event = this.lastPointerEvent;
		if (!rootEl || !event || !state.isPointerSelecting) {
			this.stopAutoScroll();
			return;
		}
		const { delta, axis } = this.computeAutoScrollDelta(rootEl, event);
		if (delta === 0) {
			this.setAutoScrollFast(false);
			this.stopAutoScroll();
			return;
		}
		this.updateAutoScrollFast(rootEl, axis, event);
		const now = performance.now();
		const last = this.lastAutoScrollAt ?? now;
		this.lastAutoScrollAt = now;
		const dt = Math.max(4, Math.min(now - last, 100));
		const speedScale = Math.max(0.5, Math.min(3, dt / 16.67));
		const effectiveDelta = delta * speedScale;
		if (axis === "x") {
			rootEl.scrollLeft += effectiveDelta;
		} else {
			rootEl.scrollTop += effectiveDelta;
		}
		const hitOffset = this.getOffsetFromPointerEvent(event);
		if (state.pointerSelectAnchor !== null) {
			const nextOffset =
				hitOffset !== null
					? hitOffset
					: this.getAutoScrollFallbackOffset(
							rootEl,
							effectiveDelta,
							axis,
						);
			if (nextOffset !== null) {
				if (hitOffset !== null) {
					this.lastAutoScrollOffset = hitOffset;
					this.autoScrollRemainder = 0;
				}
				this.context.setSelectionNormalized(
					state.pointerSelectAnchor,
					nextOffset,
				);
				this.context.updateSelectionOverlay();
			}
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
		this.lastAutoScrollAt = null;
		this.setAutoScrollFast(false);
		this.context.setAutoScrollSelecting(false);
	}

	private computeAutoScrollDelta(
		rootEl: HTMLElement,
		event: PointerEvent,
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
					delta: -this.computeAutoScrollSpeed(
						distLeft,
						edgeThreshold,
					),
					axis: "x",
				};
			}
			if (distRight < edgeThreshold) {
				return {
					delta: this.computeAutoScrollSpeed(
						distRight,
						edgeThreshold,
					),
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
		threshold: number,
	): number {
		const clamped = Math.max(0, Math.min(distance, threshold));
		const factor = (threshold - clamped) / threshold;
		const minSpeed = 4;
		const maxSpeed = 40;
		return minSpeed + (maxSpeed - minSpeed) * factor;
	}

	private updateAutoScrollFast(
		rootEl: HTMLElement,
		axis: "x" | "y",
		event: PointerEvent,
	): void {
		const factor = this.getAutoScrollSpeedFactor(rootEl, axis, event);
		const totalLines = this.context.getLineRanges().length;
		const effectiveThreshold = this.getAutoScrollFastThreshold(totalLines);
		this.setAutoScrollFast(factor >= effectiveThreshold);
	}

	private setAutoScrollFast(active: boolean): void {
		if (this.autoScrollFast === active) return;
		this.autoScrollFast = active;
		this.context.setAutoScrollFast?.(active);
	}

	private getAutoScrollSpeedFactor(
		rootEl: HTMLElement,
		axis: "x" | "y",
		event: PointerEvent,
	): number {
		const rect = rootEl.getBoundingClientRect();
		const edgeThreshold = 28;
		if (axis === "x") {
			const distLeft = event.clientX - rect.left;
			const distRight = rect.right - event.clientX;
			const dist = Math.min(distLeft, distRight);
			const clamped = Math.max(0, Math.min(dist, edgeThreshold));
			return (edgeThreshold - clamped) / edgeThreshold;
		}
		const distTop = event.clientY - rect.top;
		const distBottom = rect.bottom - event.clientY;
		const dist = Math.min(distTop, distBottom);
		const clamped = Math.max(0, Math.min(dist, edgeThreshold));
		return (edgeThreshold - clamped) / edgeThreshold;
	}

	private getAutoScrollFastThreshold(totalLines: number): number {
		if (totalLines >= 20000) return 0;
		if (totalLines >= 8000) return 0.7;
		if (totalLines >= 4000) return 0.75;
		if (totalLines >= 2000) return 0.8;
		return 0.85;
	}

	private getAutoScrollFallbackOffset(
		rootEl: HTMLElement,
		delta: number,
		axis: "x" | "y",
	): number | null {
		if (delta === 0) return null;
		const baseOffset = this.lastAutoScrollOffset;
		if (baseOffset === null) return null;
		const ranges = this.context.getLineRanges();
		if (ranges.length === 0) return baseOffset;
		const currentLine = this.findLineIndexFromRanges(baseOffset, ranges);
		if (currentLine === null) return baseOffset;
		const extent = this.getLineExtent(rootEl);
		const direction = delta > 0 ? 1 : -1;
		this.autoScrollRemainder += delta;
		const steps = Math.floor(
			Math.abs(this.autoScrollRemainder) / Math.max(1, extent),
		);
		if (steps <= 0) return baseOffset;
		this.autoScrollRemainder -= direction * steps * extent;
		const forward = this.isForwardScroll(direction, axis, rootEl);
		const nextLine = Math.max(
			0,
			Math.min(
				ranges.length - 1,
				currentLine + (forward ? steps : -steps),
			),
		);
		const nextRange = ranges[nextLine];
		if (!nextRange) return baseOffset;
		const nextOffset = forward ? nextRange.to : nextRange.from;
		this.lastAutoScrollOffset = nextOffset;
		return nextOffset;
	}

	private getLineExtent(rootEl: HTMLElement): number {
		const computed = window.getComputedStyle(rootEl);
		const fontSize = Number.parseFloat(computed.fontSize) || 16;
		const lineHeight =
			Number.parseFloat(computed.lineHeight) ||
			Math.max(1, fontSize * 1.6);
		return Math.max(fontSize, lineHeight);
	}

	private isForwardScroll(
		direction: number,
		axis: "x" | "y",
		rootEl: HTMLElement,
	): boolean {
		if (axis === "y") {
			return direction > 0;
		}
		const writingMode = window.getComputedStyle(rootEl).writingMode;
		const isVerticalRL = writingMode !== "vertical-lr";
		return isVerticalRL ? direction < 0 : direction > 0;
	}

	private findLineIndexFromRanges(
		offset: number,
		ranges: Array<{ from: number; to: number }>,
	): number | null {
		let low = 0;
		let high = ranges.length - 1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const range = ranges[mid];
			if (!range) break;
			if (offset < range.from) {
				high = mid - 1;
			} else if (offset > range.to) {
				low = mid + 1;
			} else {
				return mid;
			}
		}
		return null;
	}

	private handleCeClickToLineEnd(event: PointerEvent): boolean {
		const sotEditor = this.context.getSotEditor();
		const rootEl = this.context.getDerivedRootEl();
		if (!this.context.isCeImeMode() || !sotEditor || !rootEl) {
			return false;
		}
		let lineEl = this.findLineElementFromPoint(
			event.clientX,
			event.clientY,
		);
		if (!lineEl) {
			lineEl = this.findNearestLineElementFromPoint(
				event.clientX,
				event.clientY,
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
			".tategaki-md-inline-widget",
		) as HTMLElement | null;
		let lineEl = target?.closest(
			".tategaki-sot-line",
		) as HTMLElement | null;
		if (!lineEl) {
			lineEl = this.findLineElementFromPoint(
				event.clientX,
				event.clientY,
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
					true,
				);
			}
			const mid = rect.left + rect.width / 2;
			return this.context.normalizeOffsetToVisible(
				event.clientX > mid ? safeAbsTo : safeAbsFrom,
				true,
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
				lineLength,
			) ?? 0;
		const clamped = Math.max(0, Math.min(localOffset, lineLength));
		return this.context.normalizeOffsetToVisible(from + clamped, true);
	}

	private findLineElementFromPoint(
		clientX: number,
		clientY: number,
	): HTMLElement | null {
		const el = document.elementFromPoint(
			clientX,
			clientY,
		) as HTMLElement | null;
		return el?.closest(".tategaki-sot-line") ?? null;
	}

	private findNearestLineElementFromPoint(
		clientX: number,
		clientY: number,
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
				clientX < left
					? left - clientX
					: clientX > right
						? clientX - right
						: 0;
			const dy =
				clientY < top
					? top - clientY
					: clientY > bottom
						? clientY - bottom
						: 0;
			const distance = dx * dx + dy * dy;
			if (distance < bestDistance) {
				bestDistance = distance;
				bestEl = child;
			}
		}
		return bestEl;
	}
}
