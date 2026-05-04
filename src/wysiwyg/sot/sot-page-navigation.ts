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

/**
 * 端到達時に fallback を優先したい場合の offset 解決ヘルパ。
 *
 * `evaluateSoTPageScrollOutcome` が `"edge"` を返したケースでは
 * viewport 内の相対位置 (targetOffset) を使うとキャレットがその場に
 * 残ってしまうため、文書端へ寄せる fallback を優先する。
 *
 * - edge かつ fallback が有効 → fallback
 * - edge かつ fallback が無効 → targetOffset (やむを得ず維持)
 * - それ以外 (sufficient / partial) → 既存の優先順位 (target → fallback)
 */
export function resolveSoTPageNavigationOffsetCandidateForOutcome(
	targetOffset: number | null,
	fallbackOffset: number | null,
	outcome: SoTPageScrollOutcome,
): number | null {
	if (outcome === "edge") {
		if (
			typeof fallbackOffset === "number" &&
			Number.isFinite(fallbackOffset)
		) {
			return fallbackOffset;
		}
	}
	return resolveSoTPageNavigationOffsetCandidate(targetOffset, fallbackOffset);
}

/**
 * scroll 前後の実移動量から「相対位置維持優先 (sufficient)」「端到達 (edge)」
 * 「中途半端 (partial)」のいずれかを判定する純粋関数。
 *
 * しきい値は spec §4 に従う:
 *   - `actualAbs / expectedAbs >= 0.85`  → sufficient
 *   - `actualAbs < 1`                    → edge
 *   - それ以外                            → partial
 *
 * 加えて本実装では、ユーザー要望「もうスクロールできない時は文書端へ」を満たすため、
 * `remainingAfter` (scroll 後に同方向へまだ動ける余地、px) を任意で受け取り、
 * `remainingAfter < SOT_PAGE_SCROLL_EDGE_REMAINING_PX` ならば
 * partial であっても edge に格上げする。これにより
 * 「expected 400px に対して実 30px しか動かなかった末端ケース」も edge 扱いになる。
 *
 * `expectedDelta === 0` または NaN は常に sufficient へフォールバックする。
 */
export const SOT_PAGE_SCROLL_SUFFICIENT_RATIO = 0.85;
/**
 * scroll 後の同方向残量がこの値未満なら、partial でも edge へ格上げする。
 * subpixel スクロールや IME・layout 揺らぎを吸収するため 1px ではなく 2px。
 */
export const SOT_PAGE_SCROLL_EDGE_REMAINING_PX = 2;

export type SoTPageScrollOutcome = "sufficient" | "edge" | "partial";

export type SoTPageScrollEvaluationInput = {
	expectedDelta: number;
	actualDelta: number;
	/**
	 * scroll 後に同方向へまだ動ける残量 (px, 非負)。
	 * 与えられた場合、`remainingAfter < SOT_PAGE_SCROLL_EDGE_REMAINING_PX` で
	 * partial を edge へ格上げする。省略時は従来通りの判定のみ。
	 */
	remainingAfter?: number;
};

export function evaluateSoTPageScrollOutcome({
	expectedDelta,
	actualDelta,
	remainingAfter,
}: SoTPageScrollEvaluationInput): SoTPageScrollOutcome {
	if (!Number.isFinite(expectedDelta) || !Number.isFinite(actualDelta)) {
		return "sufficient";
	}
	const expectedAbs = Math.abs(expectedDelta);
	const actualAbs = Math.abs(actualDelta);
	if (expectedAbs === 0) {
		// 期待移動量が 0 (例: viewport が極小) の場合は edge 判定にしない。
		return "sufficient";
	}
	if (actualAbs < 1) {
		return "edge";
	}
	const baseOutcome: SoTPageScrollOutcome =
		actualAbs / expectedAbs >= SOT_PAGE_SCROLL_SUFFICIENT_RATIO
			? "sufficient"
			: "partial";
	if (
		baseOutcome === "partial" &&
		typeof remainingAfter === "number" &&
		Number.isFinite(remainingAfter) &&
		remainingAfter < SOT_PAGE_SCROLL_EDGE_REMAINING_PX
	) {
		return "edge";
	}
	return baseOutcome;
}

/**
 * scroll axis ごとに「同方向の残スクロール余地」を計算する pure helper。
 *
 * scrollLeft / scrollTop / scrollWidth / scrollHeight / clientWidth / clientHeight は
 * Element から取得した値を渡す。`pageDelta` の符号で「同方向」を判定する。
 *
 * 戻り値は非負の px。レイアウトが取得不能な場合は 0 を返す (= edge 扱いに寄せる)。
 */
export type SoTPageScrollRemainingInput = {
	scrollAxis: "x" | "y";
	pageDelta: number;
	scrollLeft: number;
	scrollTop: number;
	scrollWidth: number;
	scrollHeight: number;
	clientWidth: number;
	clientHeight: number;
};

export function computeSoTPageScrollRemaining({
	scrollAxis,
	pageDelta,
	scrollLeft,
	scrollTop,
	scrollWidth,
	scrollHeight,
	clientWidth,
	clientHeight,
}: SoTPageScrollRemainingInput): number {
	if (!Number.isFinite(pageDelta) || pageDelta === 0) return 0;
	if (scrollAxis === "y") {
		const min = 0;
		const max = Math.max(0, scrollHeight - clientHeight);
		const pos = Number.isFinite(scrollTop) ? scrollTop : 0;
		if (pageDelta > 0) return Math.max(0, max - pos);
		return Math.max(0, pos - min);
	}
	// x 軸 (vertical-rl は scrollLeft <= 0、vertical-lr は >= 0)
	if (!Number.isFinite(scrollWidth) || !Number.isFinite(clientWidth)) return 0;
	const overflow = Math.max(0, scrollWidth - clientWidth);
	const pos = Number.isFinite(scrollLeft) ? scrollLeft : 0;
	if (pos <= 0) {
		// vertical-rl: scrollLeft ∈ [-overflow, 0]
		const min = -overflow;
		const max = 0;
		if (pageDelta > 0) return Math.max(0, max - pos);
		return Math.max(0, pos - min);
	}
	// vertical-lr / horizontal: scrollLeft ∈ [0, overflow]
	const min = 0;
	const max = overflow;
	if (pageDelta > 0) return Math.max(0, max - pos);
	return Math.max(0, pos - min);
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
