export type TypewriterMenuFlags = {
	scrollEnabled: boolean;
	blockHighlightEnabled: boolean;
	currentLineHighlightEnabled: boolean;
	nonFocusDimEnabled: boolean;
};

/**
 * Typewriter メニューボタンの active 判定。
 * 4 つのうち 1 つでも ON なら active。
 */
export function isTypewriterMenuActive(
	flags: TypewriterMenuFlags,
): boolean {
	return (
		flags.scrollEnabled ||
		flags.blockHighlightEnabled ||
		flags.currentLineHighlightEnabled ||
		flags.nonFocusDimEnabled
	);
}
