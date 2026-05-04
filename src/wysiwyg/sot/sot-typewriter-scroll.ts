export type SoTTypewriterWritingMode =
	| "vertical-rl"
	| "vertical-lr"
	| "horizontal-tb";

export type SoTTypewriterScrollAxis = "x" | "y";

export type SoTTypewriterFollowBand = {
	target: number;
	bandStart: number;
	bandEnd: number;
};

export type SoTTypewriterRectLike = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type SoTTypewriterScrollPlan = SoTTypewriterFollowBand & {
	caretMainAxisPosition: number;
	scrollDelta: number;
	scrollAxis: SoTTypewriterScrollAxis;
};

export function resolveSoTTypewriterTarget(
	viewportExtent: number,
	writingMode: SoTTypewriterWritingMode,
	offsetRatio: number,
): number {
	const extent = normalizeViewportExtent(viewportExtent);
	if (extent <= 0) {
		return 0;
	}
	const center = extent / 2;
	const direction = resolveSoTTypewriterMainAxisDirection(writingMode);
	return clampToExtent(center + extent * offsetRatio * direction, extent);
}

export function resolveSoTTypewriterFollowBand(
	viewportExtent: number,
	target: number,
	followBandRatio: number,
): SoTTypewriterFollowBand {
	const extent = normalizeViewportExtent(viewportExtent);
	if (extent <= 0) {
		return {
			target: 0,
			bandStart: 0,
			bandEnd: 0,
		};
	}
	const safeTarget = clampToExtent(target, extent);
	const bandWidth = clampBandWidth(extent * followBandRatio, extent);
	const halfBand = bandWidth / 2;
	return {
		target: safeTarget,
		bandStart: clampToExtent(safeTarget - halfBand, extent),
		bandEnd: clampToExtent(safeTarget + halfBand, extent),
	};
}

export function isSoTTypewriterCaretWithinBand(
	caretMainAxisPosition: number,
	band: Pick<SoTTypewriterFollowBand, "bandStart" | "bandEnd">,
): boolean {
	if (!Number.isFinite(caretMainAxisPosition)) {
		return false;
	}
	return (
		caretMainAxisPosition >= band.bandStart &&
		caretMainAxisPosition <= band.bandEnd
	);
}

export function resolveSoTTypewriterScrollDeltaToBand(
	caretMainAxisPosition: number,
	band: Pick<SoTTypewriterFollowBand, "bandStart" | "bandEnd">,
	_writingMode: SoTTypewriterWritingMode,
): number {
	if (!Number.isFinite(caretMainAxisPosition)) {
		return 0;
	}
	let caretViewportDelta = 0;
	if (caretMainAxisPosition < band.bandStart) {
		caretViewportDelta = band.bandStart - caretMainAxisPosition;
	} else if (caretMainAxisPosition > band.bandEnd) {
		caretViewportDelta = band.bandEnd - caretMainAxisPosition;
	}
	if (caretViewportDelta === 0) {
		return 0;
	}
	return -caretViewportDelta;
}

export function resolveSoTTypewriterScrollPlan(input: {
	viewportRect: SoTTypewriterRectLike;
	caretRect: SoTTypewriterRectLike;
	writingMode: SoTTypewriterWritingMode;
	offsetRatio: number;
	followBandRatio: number;
}): SoTTypewriterScrollPlan | null {
	if (!isFiniteRect(input.viewportRect) || !isFiniteRect(input.caretRect)) {
		return null;
	}
	const scrollAxis = resolveSoTTypewriterScrollAxis(input.writingMode);
	const viewportExtent = resolveSoTTypewriterViewportExtent(
		input.viewportRect,
		scrollAxis,
	);
	if (viewportExtent <= 0) {
		return null;
	}
	const target = resolveSoTTypewriterTarget(
		viewportExtent,
		input.writingMode,
		input.offsetRatio,
	);
	const band = resolveSoTTypewriterFollowBand(
		viewportExtent,
		target,
		input.followBandRatio,
	);
	const caretMainAxisPosition = resolveSoTTypewriterCaretMainAxisPosition(
		input.viewportRect,
		input.caretRect,
		scrollAxis,
	);
	return {
		...band,
		caretMainAxisPosition,
		scrollDelta: resolveSoTTypewriterScrollDeltaToBand(
			caretMainAxisPosition,
			band,
			input.writingMode,
		),
		scrollAxis,
	};
}

export function resolveSoTTypewriterCaretMainAxisPosition(
	viewportRect: SoTTypewriterRectLike,
	caretRect: SoTTypewriterRectLike,
	scrollAxis: SoTTypewriterScrollAxis = "x",
): number {
	if (scrollAxis === "y") {
		return caretRect.top + caretRect.height / 2 - viewportRect.top;
	}
	return caretRect.left + caretRect.width / 2 - viewportRect.left;
}

export function resolveSoTTypewriterScrollAxis(
	writingMode: SoTTypewriterWritingMode,
): SoTTypewriterScrollAxis {
	return writingMode === "horizontal-tb" ? "y" : "x";
}

export function resolveSoTTypewriterViewportExtent(
	viewportRect: SoTTypewriterRectLike,
	scrollAxis: SoTTypewriterScrollAxis,
): number {
	return scrollAxis === "y" ? viewportRect.height : viewportRect.width;
}

function resolveSoTTypewriterMainAxisDirection(
	writingMode: SoTTypewriterWritingMode,
): number {
	if (writingMode === "vertical-rl") {
		return -1;
	}
	return 1;
}

function normalizeViewportExtent(viewportExtent: number): number {
	if (!Number.isFinite(viewportExtent) || viewportExtent <= 0) {
		return 0;
	}
	return viewportExtent;
}

function clampToExtent(value: number, viewportExtent: number): number {
	if (!Number.isFinite(value) || viewportExtent <= 0) {
		return 0;
	}
	return Math.max(0, Math.min(viewportExtent, value));
}

function clampBandWidth(width: number, viewportExtent: number): number {
	if (!Number.isFinite(width) || width <= 0) {
		return 0;
	}
	return Math.min(width, viewportExtent);
}

function isFiniteRect(rect: SoTTypewriterRectLike): boolean {
	return (
		Number.isFinite(rect.left) &&
		Number.isFinite(rect.top) &&
		Number.isFinite(rect.width) &&
		Number.isFinite(rect.height)
	);
}
