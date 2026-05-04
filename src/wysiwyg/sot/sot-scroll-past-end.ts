/**
 * SoT 文書終端側 scroll past end ヘルパ。
 *
 * - derivedContentEl に `padding-block-end` を適用して tail spacer を作る。
 * - PageDown が tail spacer を使い切って空白画面へ進まないようにデルタをクランプする。
 * - tail spacer を除いた「コンテンツ本体の残スクロール量」を計算する。
 *
 * 先頭側 (scroll past start) は対象外。
 */

/** 追加余白量 (viewport 主軸 × ratio) を計算する */
export function computeSoTScrollPastEndExtent(
	viewportExtent: number,
	ratio = 1.0,
): number {
	if (!Number.isFinite(viewportExtent) || viewportExtent <= 0) return 0;
	return Math.max(0, viewportExtent * ratio);
}

/**
 * derivedContentEl の `padding-block-end` に tail spacer を適用する。
 *
 * writing mode ごとの主軸終端への対応:
 *   vertical-rl  → block-end = 左側 (x 軸終端)
 *   vertical-lr  → block-end = 右側 (x 軸終端)
 *   horizontal-tb → block-end = 下側 (y 軸終端)
 */
export function applySoTScrollPastEndToContentEl(
	contentEl: HTMLElement,
	viewportExtent: number,
): void {
	const px = Math.round(computeSoTScrollPastEndExtent(viewportExtent));
	contentEl.style.paddingBlockEnd = `${px}px`;
}

export function clearSoTScrollPastEndFromContentEl(
	contentEl: HTMLElement,
): void {
	contentEl.style.paddingBlockEnd = "";
}

/**
 * PageDown のスクロールデルタを、tail spacer を使い切らないようにクランプする。
 *
 * - PageDown 方向 (forward) のデルタのみクランプ対象。
 * - 現在位置が既に tail spacer 領域内で逆方向になる場合は 0 を返す
 *   (→ actualDelta=0 → edge 判定 → caret が文書末尾へ)。
 */
export function clampSoTPageDownDelta(input: {
	scrollAxis: "x" | "y";
	writingMode: string;
	proposedDelta: number;
	/** scrollAxis="x" なら scrollLeft、"y" なら scrollTop */
	scrollPosition: number;
	/** scrollAxis="x" なら scrollWidth、"y" なら scrollHeight */
	scrollExtent: number;
	/** scrollAxis="x" なら clientWidth、"y" なら clientHeight */
	clientExtent: number;
	tailSpacerExtent: number;
}): number {
	const {
		scrollAxis,
		writingMode,
		proposedDelta,
		scrollPosition,
		scrollExtent,
		clientExtent,
		tailSpacerExtent,
	} = input;

	if (!Number.isFinite(proposedDelta) || proposedDelta === 0) return proposedDelta;
	if (!Number.isFinite(tailSpacerExtent) || tailSpacerExtent <= 0) return proposedDelta;

	if (scrollAxis === "y") {
		// horizontal-tb: PageDown = scrollTop 増加
		if (proposedDelta <= 0) return proposedDelta; // PageUp は対象外
		const contentMax = Math.max(0, scrollExtent - clientExtent - tailSpacerExtent);
		const proposed = scrollPosition + proposedDelta;
		const capped = Math.min(proposed, contentMax) - scrollPosition;
		// capped が逆方向になる場合は 0 (既に tail spacer 内)
		if (capped < 0) return 0;
		return capped;
	}

	if (writingMode === "vertical-lr") {
		// vertical-lr: PageDown = scrollLeft 増加
		if (proposedDelta <= 0) return proposedDelta; // PageUp は対象外
		const contentMax = Math.max(0, scrollExtent - clientExtent - tailSpacerExtent);
		const proposed = scrollPosition + proposedDelta;
		const capped = Math.min(proposed, contentMax) - scrollPosition;
		if (capped < 0) return 0;
		return capped;
	}

	// vertical-rl: scrollLeft ∈ [-overflow, 0]、PageDown = scrollLeft 減少 (負方向)
	if (proposedDelta >= 0) return proposedDelta; // PageUp は対象外
	const overflow = Math.max(0, scrollExtent - clientExtent);
	const contentEndMin = -(overflow - tailSpacerExtent); // コンテンツ末尾位置
	const proposed = scrollPosition + proposedDelta;
	const capped = Math.max(proposed, contentEndMin) - scrollPosition;
	// capped が逆方向になる場合は 0 (既に tail spacer 内)
	if (capped > 0) return 0;
	return capped;
}

/**
 * tail spacer を除いた PageDown 方向の残スクロール量を計算する。
 *
 * computeSoTPageScrollRemaining の代替として使用。
 * tailSpacerExtent <= 0 の場合は標準の計算にフォールバックする。
 *
 * 戻り値は非負 px。
 */
export function computeSoTContentScrollRemainingForPageDown(input: {
	scrollAxis: "x" | "y";
	writingMode: string;
	pageDelta: number;
	/** scrollAxis="x" なら scrollLeft、"y" なら scrollTop */
	scrollPosition: number;
	/** scrollAxis="x" なら scrollWidth、"y" なら scrollHeight */
	scrollExtent: number;
	/** scrollAxis="x" なら clientWidth、"y" なら clientHeight */
	clientExtent: number;
	tailSpacerExtent: number;
}): number {
	const {
		scrollAxis,
		writingMode,
		pageDelta,
		scrollPosition,
		scrollExtent,
		clientExtent,
		tailSpacerExtent,
	} = input;

	if (!Number.isFinite(pageDelta) || pageDelta === 0) return 0;

	if (scrollAxis === "y") {
		const max = Math.max(
			0,
			tailSpacerExtent > 0
				? scrollExtent - clientExtent - tailSpacerExtent
				: scrollExtent - clientExtent,
		);
		const pos = Number.isFinite(scrollPosition) ? scrollPosition : 0;
		if (pageDelta > 0) return Math.max(0, max - pos); // PageDown
		return Math.max(0, pos); // PageUp (tail spacer は関係なし)
	}

	if (writingMode === "vertical-lr") {
		const max = Math.max(
			0,
			tailSpacerExtent > 0
				? scrollExtent - clientExtent - tailSpacerExtent
				: scrollExtent - clientExtent,
		);
		const pos = Number.isFinite(scrollPosition) ? scrollPosition : 0;
		if (pageDelta > 0) return Math.max(0, max - pos); // PageDown
		return Math.max(0, pos); // PageUp
	}

	// vertical-rl: scrollLeft ∈ [-overflow, 0]
	const overflow = Math.max(0, scrollExtent - clientExtent);
	const contentEndMin =
		tailSpacerExtent > 0 ? -(overflow - tailSpacerExtent) : -overflow;
	const pos = Number.isFinite(scrollPosition) ? scrollPosition : 0;
	if (pageDelta < 0) return Math.max(0, pos - contentEndMin); // PageDown
	return Math.max(0, -pos); // PageUp (向かう方向は max=0)
}
