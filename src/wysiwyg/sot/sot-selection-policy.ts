/**
 * SoT Selection Policy – 選択ポリシー判定の集約モジュール
 *
 * すべての関数は **純関数** であり、副作用を持たない。
 * 呼び出し側（SoTWysiwygView）が必要な状態を引数として渡す。
 *
 * PR0: リファクタリング。PR3b: 設定非依存化（常時 configured=true）。
 */

// ---------------------------------------------------------------------------
// 入力型
// ---------------------------------------------------------------------------

/** 選択ポリシー判定に必要な状態のスナップショット */
export interface SelectionPolicyState {
	/** CE IMEモードが有効か */
	ceImeMode: boolean;
	/** ソースモードが有効か */
	sourceModeEnabled: boolean;
	/** nativeSelectionAssistActive の現在値 */
	assistActive: boolean;
}

/** ドキュメントサイズに基づく判定用の情報 */
export interface DocSizeInfo {
	/** ドキュメント全体の文字数 */
	docLength: number;
	/** 行数 (lineRanges.length) */
	lineCount: number;
}

/** shouldSuppressAutoScrollSelectionRenders に必要な状態 */
export interface AutoScrollSuppressionState {
	/** 自動スクロール選択中か */
	autoScrollSelecting: boolean;
	/** nativeSelectionAssistByAutoScroll の現在値 */
	assistByAutoScroll: boolean;
	/** ドキュメントサイズ情報 */
	docSize: DocSizeInfo;
}

/** isHugeDocSelection に必要な状態 */
export interface HugeDocState {
	/** ドキュメントサイズ情報 */
	docSize: DocSizeInfo;
	/** 仮想化レンダリングが有効か */
	virtualizedRenderEnabled: boolean;
}

/** shouldDeferNativeSelectionSync に必要な状態 */
export interface DeferSyncState {
	/** スクロール中か */
	isScrolling: boolean;
	/** 自動スクロール選択中か */
	autoScrollSelecting: boolean;
	/** ポインタ選択中か */
	isPointerSelecting: boolean;
}

// ---------------------------------------------------------------------------
// 閾値定数
// ---------------------------------------------------------------------------

/** shouldSuppressAutoScrollSelectionRenders の文字数閾値 */
export const AUTO_SCROLL_SUPPRESS_DOC_LENGTH = 200000;

/** shouldSuppressAutoScrollSelectionRenders の行数閾値 */
export const AUTO_SCROLL_SUPPRESS_LINE_COUNT = 2000;

/** isHugeDocSelection の文字数閾値 */
export const HUGE_DOC_LENGTH = 100000;

/** isHugeDocSelection の行数閾値 */
export const HUGE_DOC_LINE_COUNT = 2000;

// ---------------------------------------------------------------------------
// ポリシー関数
// ---------------------------------------------------------------------------

/**
 * ネイティブ選択が *実際に有効* かどうか。
 * ceImeMode/sourceMode でない かつ assistActive である場合に true。
 * PR5: isNativeSelectionConfigured() は常時trueだったため削除。
 */
export function isNativeSelectionEnabled(
	state: SelectionPolicyState,
): boolean {
	if (state.ceImeMode || state.sourceModeEnabled) return false;
	return state.assistActive;
}

/**
 * 自動スクロール中のセレクション描画を抑制すべきかどうか。
 *
 * - 自動スクロール選択中でなければ false
 * - assistByAutoScroll であれば抑制しない (false)
 * - ドキュメントが十分大きければ抑制する (true)
 */
export function shouldSuppressAutoScrollSelectionRenders(
	state: AutoScrollSuppressionState,
): boolean {
	if (!state.autoScrollSelecting) return false;
	if (state.assistByAutoScroll) return false;
	if (state.docSize.docLength >= AUTO_SCROLL_SUPPRESS_DOC_LENGTH) return true;
	if (state.docSize.lineCount >= AUTO_SCROLL_SUPPRESS_LINE_COUNT) return true;
	return false;
}

/**
 * 巨大ドキュメント選択として扱うべきかどうか。
 */
export function isHugeDocSelection(state: HugeDocState): boolean {
	return (
		state.docSize.docLength >= HUGE_DOC_LENGTH ||
		state.docSize.lineCount >= HUGE_DOC_LINE_COUNT ||
		state.virtualizedRenderEnabled
	);
}

/**
 * ネイティブ選択同期を遅延すべきかどうか。
 */
export function shouldDeferNativeSelectionSync(
	state: DeferSyncState,
): boolean {
	return (
		state.isScrolling ||
		state.autoScrollSelecting ||
		state.isPointerSelecting
	);
}
