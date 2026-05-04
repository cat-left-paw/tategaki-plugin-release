import { resolveSoTVisualStripeIndexForLocalHead } from "./sot-end-key-collapsed";

/** 論理行内における現在位置クラス（rect ベースではなくローカルオフセット＋視覚行先頭列挙のみ） */
export type SoTHomeCollapsedPositionKind =
	| "logical_line_start"
	| "visual_line_start_only"
	| "mid_stripe";

/**
 * `localHead` がどの視覚ストライプにあるかだけで class を決める。
 * （折りたたみ Range の rect 選択に依存しない）
 */
export function classifySoTHomeCollapsedPosition(
	localHead: number,
	visualLineStartsLocal: readonly number[],
	lineLength: number,
): SoTHomeCollapsedPositionKind {
	const lineLen = Math.max(0, lineLength);
	const local = Math.max(0, Math.min(localHead, lineLen));
	if (local === 0) {
		return "logical_line_start";
	}
	const starts = visualLineStartsLocal;
	if (starts.length === 0) {
		return "mid_stripe";
	}
	const stripeIx = resolveSoTVisualStripeIndexForLocalHead(local, starts);
	const stripeStart = starts[stripeIx] ?? 0;
	if (local === stripeStart) {
		return "visual_line_start_only";
	}
	return "mid_stripe";
}

export type SoTCollapsedHomeNavigationPlan =
	| { kind: "noop" }
	| { kind: "move"; targetLocalOffset: number };

/**
 * collapsed Home の現在位置のみに基づく遷移先（論理行内ローカルオフセット）。
 *
 * - 論理行頭 → noop
 * - 視覚行頭のみ（論理非行頭）→ 論理行頭 (0)
 * - それ以外 → 現在ストライプの視覚行先頭
 */
export function resolveSoTCollapsedHomeNavigationPlan(input: {
	localHead: number;
	visualLineStartsLocal: readonly number[];
	lineLength: number;
}): SoTCollapsedHomeNavigationPlan {
	const lineLen = Math.max(0, input.lineLength);
	const local = Math.max(0, Math.min(input.localHead, lineLen));
	const kind = classifySoTHomeCollapsedPosition(
		local,
		input.visualLineStartsLocal,
		lineLen,
	);
	if (kind === "logical_line_start") {
		return { kind: "noop" };
	}
	if (kind === "visual_line_start_only") {
		return { kind: "move", targetLocalOffset: 0 };
	}
	const starts = input.visualLineStartsLocal;
	if (starts.length === 0) {
		return { kind: "move", targetLocalOffset: 0 };
	}
	const stripeIx = resolveSoTVisualStripeIndexForLocalHead(local, starts);
	const stripeStart = starts[stripeIx] ?? 0;
	return { kind: "move", targetLocalOffset: stripeStart };
}
