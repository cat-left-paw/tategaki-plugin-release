/**
 * collapsed End 「論理は次視覚行頭 / 見た目は直前視覚行の行末」用の矩形だけを返す。
 * getCaretRectInLine は変えず、overlay 定位の補助に限定する。
 */

export type SoTStripeRectLtwh =
	| Readonly<{ left: number; top: number; width: number; height: number }>
	| Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

/** viewport (client) と互換な矩形。new DOMRect 不要。 */
export type SoTViewportCaretBox = Readonly<{
	left: number;
	top: number;
	width: number;
	height: number;
	bottom: number;
	right: number;
}>;

export function viewportCaretRectDisplayAtPriorStripeInlineEnd(
	stripeRect: SoTStripeRectLtwh,
	sampleGlyphRect: SoTStripeRectLtwh | null,
	writingMode: string,
	caretThicknessPx: number,
): SoTViewportCaretBox {
	const stripeBottom = stripeRect.top + stripeRect.height;
	const stripeRight = stripeRect.left + stripeRect.width;
	const thickness = Math.max(1, caretThicknessPx);
	const isVertical = writingMode.startsWith("vertical");

	if (isVertical) {
		const barWidth = Math.max(
			8,
			sampleGlyphRect?.width ?? stripeRect.width,
		);
		const barHeight = thickness;
		const idealTop = stripeBottom - barHeight - 2;
		const left =
			stripeRect.left + Math.max(0, stripeRect.width - barWidth) / 2;
		const yTop = Math.max(idealTop, stripeRect.top);
		return {
			left,
			top: yTop,
			width: barWidth,
			height: barHeight,
			bottom: yTop + barHeight,
			right: left + barWidth,
		};
	}

	const barHeight = Math.max(
		8,
		sampleGlyphRect?.height ?? stripeRect.height,
	);
	const barWidth = thickness;
	const left = stripeRight - barWidth - 2;
	const top =
		stripeRect.top +
		Math.max(0, stripeRect.height - barHeight) / 2;
	return {
		left,
		top,
		width: barWidth,
		height: barHeight,
		bottom: top + barHeight,
		right: left + barWidth,
	};
}
