export interface SoTCollapsePreviewTooltipPositionOptions {
	targetRect: Pick<DOMRect, "left" | "top" | "bottom" | "width">;
	tooltipRect: Pick<DOMRect, "width" | "height">;
	viewportWidth: number;
	viewportHeight: number;
	marginPx?: number;
	offsetPx?: number;
}

export interface SoTCollapsePreviewTooltipHost {
	doc: Document;
	containerEl: HTMLElement;
	viewportWidth: number;
	viewportHeight: number;
}

export function resolveSoTCollapsePreviewTooltipHost(
	target: HTMLElement,
): SoTCollapsePreviewTooltipHost {
	const doc = target.ownerDocument;
	const view = doc.defaultView ?? window;
	const rootEl = doc.documentElement;

	return {
		doc,
		containerEl: doc.body ?? rootEl,
		viewportWidth: Math.max(rootEl?.clientWidth ?? 0, view.innerWidth ?? 0),
		viewportHeight: Math.max(
			rootEl?.clientHeight ?? 0,
			view.innerHeight ?? 0,
		),
	};
}

export function computeSoTCollapsePreviewTooltipPosition(
	options: SoTCollapsePreviewTooltipPositionOptions,
): { left: number; top: number } {
	const marginPx = options.marginPx ?? 8;
	const offsetPx = options.offsetPx ?? 8;
	let left =
		options.targetRect.left +
		options.targetRect.width / 2 -
		options.tooltipRect.width / 2;
	let top = options.targetRect.bottom + offsetPx;

	if (left < marginPx) {
		left = marginPx;
	}
	if (left + options.tooltipRect.width > options.viewportWidth - marginPx) {
		left = Math.max(
			marginPx,
			options.viewportWidth - options.tooltipRect.width - marginPx,
		);
	}
	if (top + options.tooltipRect.height > options.viewportHeight - marginPx) {
		top = options.targetRect.top - options.tooltipRect.height - offsetPx;
	}
	if (top < marginPx) {
		top = marginPx;
	}

	return { left, top };
}
