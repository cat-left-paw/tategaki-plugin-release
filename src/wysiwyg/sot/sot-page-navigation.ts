export const SOT_PAGE_NAVIGATION_KEYS = ["PageUp", "PageDown"] as const;

export type SoTPageNavigationKey =
	(typeof SOT_PAGE_NAVIGATION_KEYS)[number];

type SoTRectLike = {
	left: number;
	top: number;
	width: number;
	height: number;
};

type SoTPageNavigationPlanInput = {
	key: string;
	writingMode: string;
	caretRect: SoTRectLike;
	viewportRect: SoTRectLike;
};

export type SoTPageNavigationPlan = {
	scrollAxis: "x" | "y";
	pageDelta: number;
	scrollDeltaX: number;
	scrollDeltaY: number;
	targetPoint: {
		x: number;
		y: number;
	};
};

export function isSoTPageNavigationKey(
	key: string,
): key is SoTPageNavigationKey {
	return (SOT_PAGE_NAVIGATION_KEYS as readonly string[]).includes(key);
}

export function resolveSoTPageNavigationPlan({
	key,
	writingMode,
	caretRect,
	viewportRect,
}: SoTPageNavigationPlanInput): SoTPageNavigationPlan | null {
	if (!isSoTPageNavigationKey(key)) return null;
	if (!isFiniteRect(caretRect) || !isFiniteRect(viewportRect)) {
		return null;
	}
	if (viewportRect.width <= 0 || viewportRect.height <= 0) {
		return null;
	}

	const targetPoint = {
		x: clampPoint(
			caretRect.left + caretRect.width / 2,
			viewportRect.left,
			viewportRect.width,
		),
		y: clampPoint(
			caretRect.top + caretRect.height / 2,
			viewportRect.top,
			viewportRect.height,
		),
	};

	if (!writingMode.startsWith("vertical")) {
		const pageDelta =
			key === "PageDown" ? viewportRect.height : -viewportRect.height;
		return {
			scrollAxis: "y",
			pageDelta,
			scrollDeltaX: 0,
			scrollDeltaY: pageDelta,
			targetPoint,
		};
	}

	const pageDelta =
		writingMode === "vertical-lr"
			? key === "PageDown"
				? viewportRect.width
				: -viewportRect.width
			: key === "PageDown"
				? -viewportRect.width
				: viewportRect.width;
	return {
		scrollAxis: "x",
		pageDelta,
		scrollDeltaX: pageDelta,
		scrollDeltaY: 0,
		targetPoint,
	};
}

export function resolveSoTPageNavigationOffsetCandidate(
	targetOffset: number | null,
	fallbackOffset: number | null,
): number | null {
	if (typeof targetOffset === "number" && Number.isFinite(targetOffset)) {
		return targetOffset;
	}
	if (typeof fallbackOffset === "number" && Number.isFinite(fallbackOffset)) {
		return fallbackOffset;
	}
	return null;
}

function isFiniteRect(rect: SoTRectLike): boolean {
	return (
		Number.isFinite(rect.left) &&
		Number.isFinite(rect.top) &&
		Number.isFinite(rect.width) &&
		Number.isFinite(rect.height)
	);
}

function clampPoint(value: number, start: number, size: number): number {
	if (!Number.isFinite(value) || !Number.isFinite(start) || !Number.isFinite(size)) {
		return value;
	}
	if (size <= 2) {
		return start + size / 2;
	}
	return Math.max(start + 1, Math.min(value, start + size - 1));
}
