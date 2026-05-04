import type { LineRange } from "./line-ranges";

/**
 * 「このローカルオフセットは視覚行 starts[i] 以降先頭」の最大の i。
 * caret の複数矩形や hit-test は使わない（論理オフセットのみ）。
 */
export function resolveSoTVisualStripeIndexForLocalHead(
	localHead: number,
	visualLineStartsLocal: readonly number[],
): number {
	if (visualLineStartsLocal.length <= 0) return 0;
	let chosen = 0;
	for (let i = visualLineStartsLocal.length - 1; i >= 0; i--) {
		const start = visualLineStartsLocal[i];
		if (start !== undefined && localHead >= start) {
			chosen = i;
			break;
		}
	}
	return chosen;
}

export type SoTCollapsedEndFirstTapResolutionInput = {
	/** Document 絶対 head */
	headAbs: number;
	lineRange: LineRange;
	/** 論理行内ローカルの視覚行先頭。getVisualLineStartOffsetsInLine の昇順配列と一致すること */
	visualLineStartsLocal: readonly number[];
};

/**
 * SoT collapsed End 一段目が指すべき論理ヘッドが「次視覚行先頭」と同値になるオフセット。
 *
 * - 複数視覚行がある論理行で、現在ストライプに「次」の先頭がある場合 → その絶対オフセット
 * - 視覚行がひとつだけ／既に最終視覚行 → null（呼び出し側で従来の論理 End へフォールバック）
 */
export function resolveSoTCollapsedEndFirstTapAbsoluteHead(
	input: SoTCollapsedEndFirstTapResolutionInput,
): number | null {
	const { headAbs, lineRange, visualLineStartsLocal } = input;
	const lineLen = Math.max(0, lineRange.to - lineRange.from);
	if (visualLineStartsLocal.length < 2 || lineLen <= 0) {
		return null;
	}

	const localHead = Math.max(
		0,
		Math.min(headAbs - lineRange.from, lineLen),
	);
	const stripeIx = resolveSoTVisualStripeIndexForLocalHead(
		localHead,
		visualLineStartsLocal,
	);
	if (stripeIx + 1 >= visualLineStartsLocal.length) {
		return null;
	}
	const nextStartLocal = visualLineStartsLocal[stripeIx + 1];
	if (nextStartLocal === undefined || nextStartLocal > lineLen) {
		return null;
	}

	return lineRange.from + nextStartLocal;
}

/**
 * `local` がいずれかの `starts[j]`（j>=1）と一致するか。列境界オフセットかどうか。
 */
export function findSoTVisualLineStartIndexMatchingLocalOffset(
	localHeadInLine: number,
	visualLineStartsLocal: readonly number[],
	lineLengthInLine: number,
): number | null {
	const starts = visualLineStartsLocal;
	const local = Math.max(
		0,
		Math.min(localHeadInLine, Math.max(0, lineLengthInLine)),
	);
	for (let j = 1; j < starts.length; j += 1) {
		const s = starts[j];
		if (s !== undefined && local === s) return j;
	}
	return null;
}

/**
 * 折りたたみ End の「表示行末」（= 次 visual line start と同値）にいるか。
 *
 * `starts[j]` は「直前 stripe の視覚行末」と「現在 stripe の視覚行頭」が同じオフセットになるため、
 * オフセット一致だけでは誤判定する。`caretVisualStripeRectIndex`（`getCaretRectInLine` の中心が属する
 * `sortedRects` のインデックス）が `j-1` のときだけ「前行末同値」とみなす。
 *
 * `caretVisualStripeRectIndex` を省略した場合は従来のオフセットのみ判定（後方互換・単体テスト用）。
 */
export function isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
	localHeadInLine: number,
	visualLineStartsLocal: readonly number[],
	lineLengthInLine: number,
	caretVisualStripeRectIndex?: number,
): boolean {
	const starts = visualLineStartsLocal;
	if (starts.length < 2) return false;
	const jHit = findSoTVisualLineStartIndexMatchingLocalOffset(
		localHeadInLine,
		starts,
		lineLengthInLine,
	);
	if (jHit === null) return false;
	if (caretVisualStripeRectIndex === undefined) {
		return true;
	}
	return caretVisualStripeRectIndex === jHit - 1;
}

/**
 * End 1 段目後に論理 head は「次視覚行頭」だが、オーバーレイは前行末として描く pending が有効で、
 * その `forDocHead` にいるとき。2 段目 End は `getCaretRectInLine` の列ではなくこれを優先する。
 */
export function isSoTEndPendingVisualOnlyShowsPriorStripeEndAtHead(input: {
	headAbs: number;
	pendingEndVisualOnlyForDocHead: number | null | undefined;
}): boolean {
	const h = input.pendingEndVisualOnlyForDocHead;
	return h != null && input.headAbs === h;
}

/** collapsed End の現在位置のみに基づく計画 */
export type SoTCollapsedEndNavigationPlan =
	| { kind: "noop" }
	| {
			kind: "to_next_visual_line_start";
			/** 絶対 head。呼び出し側で normalizeOffsetToVisible */
			absoluteProbeHead: number;
		}
	| {
			kind: "to_logical_line_end";
			normalizedTargetHead: number;
			resolvedViaPendingVisualOnlySecondTap?: boolean;
		};

/**
 * - 論理行末済み → noop
 * - pending visual-only（前行末表示）かつ head がその forDocHead → 論理行末へ（論理 head は次行頭でも）
 * - 表示行末同値（列境界かつキャレットが前行の列にいる）、かつ論理行末ではない → 論理行末へ
 * - それ以外で当該 stripe に次視覚行がある → resolveSoTCollapsedEndFirstTapAbsoluteHead へ
 * - firstTap が無い（最終ストライプのみ等）→ 論理行末へ
 *
 * 二段目は「頭を置き換えて firstTap を再評価」せず、pending を最優先し、次に列境界＋キャレット列で視覚行末を決める。
 */
export function resolveSoTCollapsedEndNavigationPlan(input: {
	normalizedHead: number;
	normalizedLogicalLineEnd: number;
	headAbs: number;
	lineRange: LineRange;
	visualLineStartsLocal: readonly number[];
	/** `sortedRects` 上でキャレットが属する視覚列インデックス。未指定時は境界のオフセットのみ判定 */
	caretVisualStripeRectIndex?: number;
	/** `captureSoTEndKeyPendingCaretFromEndNavigation` の forDocHead。一致時は前行末オーバーレイとして二段目を論理行末へ */
	pendingEndVisualOnlyForDocHead?: number | null;
}): SoTCollapsedEndNavigationPlan {
	const lineLen = Math.max(0, input.lineRange.to - input.lineRange.from);
	const localHead = Math.max(
		0,
		Math.min(input.headAbs - input.lineRange.from, lineLen),
	);

	if (input.normalizedHead === input.normalizedLogicalLineEnd) {
		return { kind: "noop" };
	}

	if (
		isSoTEndPendingVisualOnlyShowsPriorStripeEndAtHead({
			headAbs: input.headAbs,
			pendingEndVisualOnlyForDocHead: input.pendingEndVisualOnlyForDocHead,
		})
	) {
		return {
			kind: "to_logical_line_end",
			normalizedTargetHead: input.normalizedLogicalLineEnd,
			resolvedViaPendingVisualOnlySecondTap: true,
		};
	}

	if (
		isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
			localHead,
			input.visualLineStartsLocal,
			lineLen,
			input.caretVisualStripeRectIndex,
		)
	) {
		return {
			kind: "to_logical_line_end",
			normalizedTargetHead: input.normalizedLogicalLineEnd,
		};
	}

	const probeRaw = resolveSoTCollapsedEndFirstTapAbsoluteHead({
		headAbs: input.headAbs,
		lineRange: input.lineRange,
		visualLineStartsLocal: input.visualLineStartsLocal,
	});

	if (probeRaw !== null) {
		return {
			kind: "to_next_visual_line_start",
			absoluteProbeHead: probeRaw,
		};
	}

	return {
		kind: "to_logical_line_end",
		normalizedTargetHead: input.normalizedLogicalLineEnd,
	};
}

/**
 * 「次視覚行先頭」を挿入点とみなしたときのプレーン文字列結果（単一行検証用）。
 */
export function applyPlainTextInsertAtOffset(
	doc: string,
	insertAtAbsolute: number,
	inserted: string,
): string {
	const at = Math.max(0, Math.min(insertAtAbsolute, doc.length));
	const before = doc.slice(0, at);
	const after = doc.slice(at);
	return `${before}${inserted}${after}`;
}
