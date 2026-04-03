type SoTVisualBoundaryNavigationInput = {
	writingMode: string;
	key: string;
	currentLocalOffset: number;
	visualLineStartOffsets: number[];
};

type SoTPreviousLogicalLineVisualNavigationInput = {
	writingMode: string;
	key: string;
	currentLocalOffset: number;
	currentFirstVisibleStartOffset: number;
	targetVisualLineStartOffsets: number[];
};

type SoTVisualLineDirection = "previous" | "next" | null;
type SoTVisualRectLike = {
	left: number;
	top: number;
};

export function sortSoTVisualLineRects<T extends SoTVisualRectLike>(
	rects: readonly T[],
	writingMode: string,
): T[] {
	return rects.slice().sort((a, b) =>
		writingMode.startsWith("vertical")
			? a.left - b.left || a.top - b.top
			: a.top - b.top || a.left - b.left,
	);
}

export function resolveSoTVisualBoundarySnapOffset({
	writingMode,
	key,
	currentLocalOffset,
	visualLineStartOffsets,
}: SoTVisualBoundaryNavigationInput): number | null {
	const direction = resolveSoTVisualLineDirection(writingMode, key);
	if (direction !== "previous") return null;
	const currentIndex = visualLineStartOffsets.indexOf(currentLocalOffset);
	if (currentIndex <= 0) return null;
	return visualLineStartOffsets[currentIndex - 1] ?? null;
}

export function resolveSoTPreviousLogicalLineVisualStartOffset({
	writingMode,
	key,
	currentLocalOffset,
	currentFirstVisibleStartOffset,
	targetVisualLineStartOffsets,
}: SoTPreviousLogicalLineVisualNavigationInput): number | null {
	const direction = resolveSoTVisualLineDirection(writingMode, key);
	if (direction !== "previous") return null;
	if (currentLocalOffset !== currentFirstVisibleStartOffset) return null;
	if (targetVisualLineStartOffsets.length === 0) return null;
	return (
		targetVisualLineStartOffsets[targetVisualLineStartOffsets.length - 1] ??
		null
	);
}

function resolveSoTVisualLineDirection(
	writingMode: string,
	key: string,
): SoTVisualLineDirection {
	if (!writingMode.startsWith("vertical")) return null;
	if (writingMode === "vertical-lr") {
		if (key === "ArrowLeft") return "previous";
		if (key === "ArrowRight") return "next";
		return null;
	}
	if (key === "ArrowRight") return "previous";
	if (key === "ArrowLeft") return "next";
	return null;
}
