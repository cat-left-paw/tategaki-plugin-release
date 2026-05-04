export const SOT_TYPEWRITER_NAVIGATION_KEYS = [
	"Home",
	"End",
	"PageUp",
	"PageDown",
] as const;

export interface SoTTypewriterSuppressionState {
	suppressAfterNavigation: boolean;
	suppressAfterJumpOrCollapse: boolean;
	isPointerSelecting: boolean;
	autoScrollSelecting: boolean;
	isScrolling: boolean;
	hasPendingScrollSettle: boolean;
	hasPendingNavigationCommit: boolean;
	isFastScrollActive: boolean;
	isOutlineJumpInProgress: boolean;
}

export interface SoTTypewriterSuppressionDecision {
	suppress: boolean;
	consumeNavigationSuppression: boolean;
	consumeJumpOrCollapseSuppression: boolean;
}

export function isSoTTypewriterSuppressedNavigationKey(
	key: string,
): key is (typeof SOT_TYPEWRITER_NAVIGATION_KEYS)[number] {
	return (SOT_TYPEWRITER_NAVIGATION_KEYS as readonly string[]).includes(key);
}

export function resolveSoTTypewriterSuppressionDecision(
	state: SoTTypewriterSuppressionState,
): SoTTypewriterSuppressionDecision {
	const suppress =
		state.suppressAfterNavigation ||
		state.suppressAfterJumpOrCollapse ||
		state.isPointerSelecting ||
		state.autoScrollSelecting ||
		state.isScrolling ||
		state.hasPendingScrollSettle ||
		state.hasPendingNavigationCommit ||
		state.isFastScrollActive ||
		state.isOutlineJumpInProgress;
	return {
		suppress,
		consumeNavigationSuppression:
			state.suppressAfterNavigation && !state.hasPendingNavigationCommit,
		consumeJumpOrCollapseSuppression: state.suppressAfterJumpOrCollapse,
	};
}
