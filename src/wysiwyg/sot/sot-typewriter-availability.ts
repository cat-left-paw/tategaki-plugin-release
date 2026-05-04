/**
 * SoT の Typewriter 系機能（scroll / 編集ブロック / 現在行 / 非フォーカス減光）が
 * 「現在のモード状態で利用可能か」を判定する pure helper。
 *
 * 保存値（`sotTypewriterMode` など）は壊さず、UI 上の実効状態のみを扱う。
 * source mode / plain text view / 段落プレーン編集中は一時的に利用不可とする。
 */

export type SoTTypewriterUnavailableReason =
	| "source-mode"
	| "plain-text-view"
	| "plain-edit";

export type SoTTypewriterAvailability = {
	available: boolean;
	reason: SoTTypewriterUnavailableReason | null;
};

export type ResolveSoTTypewriterAvailabilityParams = {
	sourceModeEnabled: boolean;
	plainTextViewEnabled: boolean;
	plainEditActive: boolean;
};

export function resolveSoTTypewriterAvailability(
	params: ResolveSoTTypewriterAvailabilityParams,
): SoTTypewriterAvailability {
	if (params.plainEditActive) {
		return { available: false, reason: "plain-edit" };
	}
	if (params.sourceModeEnabled) {
		return { available: false, reason: "source-mode" };
	}
	if (params.plainTextViewEnabled) {
		return { available: false, reason: "plain-text-view" };
	}
	return { available: true, reason: null };
}
