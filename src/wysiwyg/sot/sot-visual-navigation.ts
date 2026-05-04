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

type SoTNextLogicalLineVisualNavigationInput = {
	writingMode: string;
	key: string;
	currentLocalOffset: number;
	currentLastVisibleStartOffset: number | null;
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

/**
 * resolveSoTVisualBoundarySnapOffset:
 * 折り返し行 (= 同一論理行内の複数視覚行) の境界をまたぐ前後移動を、
 * hit-test に頼らずに「隣の視覚行先頭」へ確定スナップさせる。
 *
 * 双方向対称: previous (後退) と next (前進) の両側で、現在のキャレットが
 * visualLineStartOffsets に含まれる「視覚行先頭」にいるときに発火する。
 *
 *   - direction === "previous": currentIndex > 0 なら visualLineStartOffsets[currentIndex - 1]
 *   - direction === "next":     currentIndex < length-1 なら visualLineStartOffsets[currentIndex + 1]
 *
 * 元々は previous 側だけ対応していた (Phase 2 以前)。前進側で発生する
 * 「視覚行先頭から末尾方向へ移動すると 1 文字落ちる」問題を解消するため
 * Phase 2 の追加修正で next 側にも対称化した。
 */
export function resolveSoTVisualBoundarySnapOffset({
	writingMode,
	key,
	currentLocalOffset,
	visualLineStartOffsets,
}: SoTVisualBoundaryNavigationInput): number | null {
	const direction = resolveSoTVisualLineDirection(writingMode, key);
	if (direction === null) return null;
	const currentIndex = visualLineStartOffsets.indexOf(currentLocalOffset);
	if (currentIndex < 0) return null;
	if (direction === "previous") {
		if (currentIndex === 0) return null;
		return visualLineStartOffsets[currentIndex - 1] ?? null;
	}
	// direction === "next"
	if (currentIndex >= visualLineStartOffsets.length - 1) return null;
	return visualLineStartOffsets[currentIndex + 1] ?? null;
}

/**
 * resolveSoTPreviousLogicalLineVisualStartOffset:
 * 論理行の「先頭視覚行の先頭」にキャレットがあるとき、後退移動で
 * 1 つ前の論理行の「最後の視覚行先頭」へスナップする。
 *
 * 対称版は resolveSoTNextLogicalLineVisualStartOffset を参照。
 */
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

/**
 * resolveSoTNextLogicalLineVisualStartOffset:
 * 論理行の「最後の視覚行先頭」にキャレットがあるとき、前進移動で
 * 次の論理行の「最初の視覚行先頭 (= 0)」へスナップする。
 *
 * resolveSoTPreviousLogicalLineVisualStartOffset の next 側対称版。
 * Phase 2 追加修正で導入。論理行をまたぐ前進で hit-test を経ずに
 * 着地点を確定させ、「1文字落ち」「不自然な行末吸着」を抑える。
 *
 * currentLastVisibleStartOffset が null の場合 (= 現在の visualLineStartOffsets が
 * 空配列) は発火しない。
 */
export function resolveSoTNextLogicalLineVisualStartOffset({
	writingMode,
	key,
	currentLocalOffset,
	currentLastVisibleStartOffset,
	targetVisualLineStartOffsets,
}: SoTNextLogicalLineVisualNavigationInput): number | null {
	const direction = resolveSoTVisualLineDirection(writingMode, key);
	if (direction !== "next") return null;
	if (currentLastVisibleStartOffset === null) return null;
	if (currentLocalOffset !== currentLastVisibleStartOffset) return null;
	if (targetVisualLineStartOffsets.length === 0) return null;
	return targetVisualLineStartOffsets[0] ?? null;
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
