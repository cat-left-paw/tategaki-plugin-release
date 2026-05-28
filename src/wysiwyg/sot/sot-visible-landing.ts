export type SoTVisibleLandingInput = {
	rawNext: number;
	head: number;
	visualMoveSucceeded: boolean;
	/**
	 * rawNext が「行全体 hidden でキャレットを置けない行」(code fence / frontmatter
	 * fence など) へ着地しているか。視覚移動成功時はこのフラグが true のときだけ
	 * 移動方向に沿った素通しを行う。visible セグメントを持つ行 (通常段落・リスト・
	 * インライン装飾の gap など) では false にし、従来挙動を維持する。
	 */
	rawNextIsCaretless: boolean;
	preferForward: boolean;
	normalize: (offset: number, preferForward: boolean) => number;
	findNextVisible: (offset: number, preferForward: boolean) => number;
};

/**
 * resolveSoTVisibleLandingOffset:
 * 方向キー移動の最終着地点を「実際にキャレットを置ける visible offset」へ補正する。
 *
 * - 論理ナビ (visualMoveSucceeded=false):
 *   hidden marker gap に着地しうるため従来どおり移動方向 (preferForward) で
 *   normalize し、head へ潰れた場合は findNextVisible で送り直す。
 *
 * - 視覚ナビ成功 (visualMoveSucceeded=true):
 *   原則として視覚移動の結果 (rawNext) をそのまま使い、後段補正で壊さない
 *   (Phase 2 方針)。ただし code fence のように「行全体が hidden でキャレットを
 *   置けない行」へ着地した場合 (rawNextIsCaretless=true) だけ、移動方向
 *   (preferForward) に沿って visible 行へ抜ける。
 *
 *   旧実装は視覚ナビ成功時に normalize を一切かけず、collapsed caret の
 *   setSelectionNormalized が常に preferForward=true で正規化していたため、
 *   後方移動が hidden fence で「前方 (= 元位置)」へ押し戻されて stuck していた。
 *   逆に、可視行 (リスト等) まで方向付き normalize を広げると後方移動が
 *   別位置へ吸着する回帰を招くため、対象を caretless 行に限定する。
 */
export function resolveSoTVisibleLandingOffset({
	rawNext,
	head,
	visualMoveSucceeded,
	rawNextIsCaretless,
	preferForward,
	normalize,
	findNextVisible,
}: SoTVisibleLandingInput): number {
	if (!visualMoveSucceeded) {
		const normalized = normalize(rawNext, preferForward);
		if (normalized === head && rawNext !== head) {
			return findNextVisible(head, preferForward);
		}
		return normalized;
	}
	// 視覚移動の結果は原則そのまま採用 (可視行・リスト・gap を壊さない)。
	if (!rawNextIsCaretless) {
		return rawNext;
	}
	// code fence など caretless 行へ着地したときだけ方向付きで visible へ抜ける。
	const normalized = normalize(rawNext, preferForward);
	if (normalized === rawNext) {
		return rawNext;
	}
	if (normalized === head) {
		return findNextVisible(rawNext, preferForward);
	}
	return normalized;
}
