export type SoTCaretScrollPolicyInput = {
	settingsPanelOpen: boolean;
	pendingCaretScroll: boolean;
	pairedMarkdownLeafActive: boolean;
	pendingTypewriterFollow: boolean;
};

export type SoTCaretScrollPolicy = {
	allowScrollWrites: boolean;
	shouldScrollCaretIntoView: boolean;
	shouldApplyPendingTypewriterFollow: boolean;
};

export type SoTRenderScrollRestoreMode =
	| "none"
	| "captured-only"
	| "anchor-adjusted";

export type SoTRenderScrollRestorePolicyInput = {
	settingsPanelOpen: boolean;
	suppressScrollRestore: boolean;
	pointerSelecting: boolean;
	autoScrollSelecting: boolean;
	hasScrollAnchor: boolean;
};

export type SoTRenderScrollRestorePolicy = {
	mode: SoTRenderScrollRestoreMode;
	allowScrollAnchorAdjustment: boolean;
};

export function resolveSoTCaretScrollPolicy(
	input: SoTCaretScrollPolicyInput,
): SoTCaretScrollPolicy {
	if (input.settingsPanelOpen) {
		return {
			allowScrollWrites: false,
			shouldScrollCaretIntoView: false,
			shouldApplyPendingTypewriterFollow: false,
		};
	}
	return {
		allowScrollWrites: true,
		shouldScrollCaretIntoView:
			input.pendingCaretScroll || input.pairedMarkdownLeafActive,
		shouldApplyPendingTypewriterFollow: input.pendingTypewriterFollow,
	};
}

export function resolveSoTRenderScrollRestorePolicy(
	input: SoTRenderScrollRestorePolicyInput,
): SoTRenderScrollRestorePolicy {
	if (input.suppressScrollRestore) {
		return {
			mode: "none",
			allowScrollAnchorAdjustment: false,
		};
	}
	if (input.settingsPanelOpen) {
		return {
			mode: "captured-only",
			allowScrollAnchorAdjustment: false,
		};
	}
	return {
		mode: "anchor-adjusted",
		allowScrollAnchorAdjustment:
			input.hasScrollAnchor &&
			!input.pointerSelecting &&
			!input.autoScrollSelecting,
	};
}
