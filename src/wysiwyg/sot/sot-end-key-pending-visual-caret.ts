/**
 * End 専用「論理は次視覚行頭・オーバーレイのみ直前行末」の pending を扱う。
 * viewport の固定スナップショットは持たず、都度レイアウトから再計算して scroll/reflow で stale にしない。
 */
import type { LineRange } from "./line-ranges";
import {
	resolveSoTCollapsedEndFirstTapAbsoluteHead,
	resolveSoTVisualStripeIndexForLocalHead,
} from "./sot-end-key-collapsed";
import {
	viewportCaretRectDisplayAtPriorStripeInlineEnd,
	type SoTViewportCaretBox,
} from "./sot-end-key-visual-caret";

export type SoTEndKeyPendingVisualCaret = {
	forDocHead: number;
	lineIndex: number;
	/** 「行末」と描画する視覚ストライプの文書順インデックス（visualStarts と対応） */
	displayStripeDocIndex: number;
	capturedVisualStarts: readonly number[];
	capturedLineFrom: number;
	capturedLineTo: number;
	lineRangesGeneration: number;
};

export type SoTEndKeyPendingLifecycleDeps = Readonly<{
	writingMode: string;
	lineRangesGeneration: number;
	normalizeOffsetToVisible(offset: number, preferForward: boolean): number;
	findLineIndex(offset: number): number | null;
	getLineRange(lineIndex: number): LineRange | null;
	getLineElement(lineIndex: number): HTMLElement | null;
	ensureLineRendered(lineEl: HTMLElement): void;
	skipLineForMdKind(mdKind: string): boolean;
	getLineVisualRects(lineEl: HTMLElement): DOMRect[];
	sortVisualLineRects(rects: DOMRect[], writingMode: string): DOMRect[];
	getVisualLineStartOffsetsInLine(
		lineEl: HTMLElement,
		lineRange: LineRange,
		sortedRects: DOMRect[],
		writingMode: string,
	): number[];
	getCaretRectInLine(
		lineEl: HTMLElement,
		localOffset: number,
		lineRange: LineRange,
		writingMode: string,
	): DOMRect | null;
	findClosestRectIndex(rects: DOMRect[], x: number, y: number): number;
	caretThicknessPx: number;
}>;

export function visualStartsSequencesEqual(
	a: readonly number[],
	b: readonly number[],
): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/**
 * `handleNavigate` 冒頭の `pendingEndKeyVisualOnlyCaret = null` を、
 * collapsed End の plan 解決より前に実行すると二段目判定に届かない。
 * 該当する End だけクリアを遅延し、`tryHandleCollapsedEndNavigation` 後に未処理なら消す。
 */
export function shouldSoTDeferClearingEndKeyPendingBeforeHandleNavigate(
	key: string,
	ev: Pick<KeyboardEvent, "shiftKey" | "altKey" | "ctrlKey" | "metaKey">,
	selectionAnchor: number,
	selectionHead: number,
	sourceModeEnabled: boolean,
	plainTextViewEnabled: boolean,
): boolean {
	if (key !== "End") return false;
	if (
		ev.shiftKey ||
		ev.altKey ||
		ev.ctrlKey ||
		ev.metaKey
	) {
		return false;
	}
	if (sourceModeEnabled || plainTextViewEnabled) return false;
	if (selectionAnchor !== selectionHead) return false;
	return true;
}

/** collapsed End が成立したときのセマンティック pending（矩形は update 時に毎回再計算） */
export function captureSoTEndKeyPendingCaretFromEndNavigation(
	headBeforeMove: number,
	nextNormalized: number,
	writingMode: string,
	layoutGenerationAtCapture: number,
	deps: SoTEndKeyPendingLifecycleDeps,
): SoTEndKeyPendingVisualCaret | null {
	const lineIndex = deps.findLineIndex(headBeforeMove);
	const lineIdxNext = deps.findLineIndex(nextNormalized);
	if (
		lineIndex === null ||
		lineIdxNext === null ||
		lineIndex !== lineIdxNext
	) {
		return null;
	}

	const lineRange = deps.getLineRange(lineIndex);
	const lineEl = deps.getLineElement(lineIndex);
	if (!lineRange || !lineEl) return null;
	if (deps.skipLineForMdKind(lineEl.dataset.mdKind ?? "")) return null;

	deps.ensureLineRendered(lineEl);
	const rectsRaw = deps.getLineVisualRects(lineEl);
	const sortedRects = deps.sortVisualLineRects(rectsRaw, writingMode);
	const visualStarts = deps.getVisualLineStartOffsetsInLine(
		lineEl,
		lineRange,
		sortedRects,
		writingMode,
	);

	const probeRaw = resolveSoTCollapsedEndFirstTapAbsoluteHead({
		headAbs: headBeforeMove,
		lineRange,
		visualLineStartsLocal: visualStarts,
	});
	if (probeRaw === null) return null;
	const probeNorm = deps.normalizeOffsetToVisible(probeRaw, true);
	if (probeNorm !== nextNormalized) return null;

	const lineLen = Math.max(0, lineRange.to - lineRange.from);
	const localBefore = Math.max(
		0,
		Math.min(headBeforeMove - lineRange.from, lineLen),
	);
	const stripeIxOld = resolveSoTVisualStripeIndexForLocalHead(
		localBefore,
		visualStarts,
	);
	if (visualStarts[stripeIxOld + 1] === undefined) return null;

	return {
		forDocHead: nextNormalized,
		lineIndex,
		displayStripeDocIndex: stripeIxOld,
		capturedVisualStarts: [...visualStarts],
		capturedLineFrom: lineRange.from,
		capturedLineTo: lineRange.to,
		lineRangesGeneration: layoutGenerationAtCapture,
	};
}

export function recomputeSoTEndKeyPendingCaretViewport(
	pending: SoTEndKeyPendingVisualCaret | null,
	currentOffset: number,
	deps: SoTEndKeyPendingLifecycleDeps,
): SoTViewportCaretBox | null {
	if (!pending || currentOffset !== pending.forDocHead) return null;
	if (deps.lineRangesGeneration !== pending.lineRangesGeneration) {
		return null;
	}

	const lineRange = deps.getLineRange(pending.lineIndex);
	if (
		!lineRange ||
		lineRange.from !== pending.capturedLineFrom ||
		lineRange.to !== pending.capturedLineTo
	) {
		return null;
	}

	const lineEl = deps.getLineElement(pending.lineIndex);
	if (!lineEl || deps.skipLineForMdKind(lineEl.dataset.mdKind ?? "")) return null;

	deps.ensureLineRendered(lineEl);
	const rectsRaw = deps.getLineVisualRects(lineEl);
	const sortedRects = deps.sortVisualLineRects(rectsRaw, deps.writingMode);
	const freshStarts = deps.getVisualLineStartOffsetsInLine(
		lineEl,
		lineRange,
		sortedRects,
		deps.writingMode,
	);
	if (!visualStartsSequencesEqual(freshStarts, pending.capturedVisualStarts)) {
		return null;
	}

	const ix = pending.displayStripeDocIndex;
	const nextStartLocal = freshStarts[ix + 1];
	if (nextStartLocal === undefined) return null;

	const stripeStartLocal = freshStarts[ix] ?? 0;
	const lineLen = Math.max(0, lineRange.to - lineRange.from);
	const stripeRefCaret = deps.getCaretRectInLine(
		lineEl,
		Math.min(stripeStartLocal, lineLen),
		lineRange,
		deps.writingMode,
	);
	if (!stripeRefCaret) return null;

	const priorRectIndex = deps.findClosestRectIndex(
		sortedRects,
		stripeRefCaret.left + stripeRefCaret.width / 2,
		stripeRefCaret.top + stripeRefCaret.height / 2,
	);
	const priorStripe = sortedRects[priorRectIndex];
	if (!priorStripe) return null;

	const candidateLocal = nextStartLocal - 1;
	const sampleGlyph =
		candidateLocal >= stripeStartLocal && candidateLocal <= lineLen
			? deps.getCaretRectInLine(
					lineEl,
					candidateLocal,
					lineRange,
					deps.writingMode,
				)
			: null;

	return viewportCaretRectDisplayAtPriorStripeInlineEnd(
		priorStripe,
		sampleGlyph,
		deps.writingMode,
		deps.caretThicknessPx,
	);
}
