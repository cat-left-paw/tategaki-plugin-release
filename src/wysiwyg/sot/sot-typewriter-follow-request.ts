export type SoTTypewriterFollowRequestOrigin =
	| "text-input"
	| "pending-input"
	| "pointer"
	| "selection-change";

export interface SoTTypewriterFollowRequestInput {
	typewriterEnabled: boolean;
	sourceModeEnabled: boolean;
	plainTextViewEnabled: boolean;
	origin: SoTTypewriterFollowRequestOrigin;
	text?: string;
}

export function shouldRequestSoTTypewriterFollowForInput(
	input: SoTTypewriterFollowRequestInput,
): boolean {
	if (!input.typewriterEnabled) return false;
	if (input.sourceModeEnabled || input.plainTextViewEnabled) return false;
	if (input.origin !== "text-input") return false;
	return (input.text ?? "").length > 0;
}

export interface SoTTypewriterPendingCaretFollowInput {
	typewriterEnabled: boolean;
	sourceModeEnabled: boolean;
	plainTextViewEnabled: boolean;
	ceImeMode: boolean;
	origin: SoTTypewriterFollowRequestOrigin;
	pendingTextLength: number;
	overlayFocused: boolean;
	hasPendingCaretRect: boolean;
}

export function shouldUseSoTTypewriterPendingCaretForFollow(
	input: SoTTypewriterPendingCaretFollowInput,
): boolean {
	if (!input.typewriterEnabled) return false;
	if (input.sourceModeEnabled || input.plainTextViewEnabled) return false;
	if (input.ceImeMode) return false;
	if (input.origin !== "pending-input") return false;
	if (!input.overlayFocused) return false;
	if (!input.hasPendingCaretRect) return false;
	return input.pendingTextLength > 0;
}
