import type { WysiwygSettings } from "../../types/settings";

type SoTTypewriterVisualFocusSettings = Pick<
	WysiwygSettings,
	| "sotTypewriterBlockHighlightColor"
	| "sotTypewriterBlockHighlightOpacity"
	| "sotTypewriterCurrentLineHighlightColor"
	| "sotTypewriterCurrentLineHighlightOpacity"
	| "sotTypewriterNonFocusOpacity"
>;

export function applySoTFocusVisualCssVariables(
	rootEl: HTMLElement | null,
	settings: SoTTypewriterVisualFocusSettings,
): void {
	if (!rootEl) return;
	rootEl.style.setProperty(
		"--tategaki-sot-typewriter-block-highlight-color",
		settings.sotTypewriterBlockHighlightColor ?? "#1e90ff",
	);
	rootEl.style.setProperty(
		"--tategaki-sot-typewriter-block-highlight-opacity",
		`${settings.sotTypewriterBlockHighlightOpacity ?? 0.16}`,
	);
	rootEl.style.setProperty(
		"--tategaki-sot-typewriter-current-line-highlight-color",
		settings.sotTypewriterCurrentLineHighlightColor ?? "#1e90ff",
	);
	rootEl.style.setProperty(
		"--tategaki-sot-typewriter-current-line-highlight-opacity",
		`${settings.sotTypewriterCurrentLineHighlightOpacity ?? 0.28}`,
	);
	rootEl.style.setProperty(
		"--tategaki-sot-typewriter-nonfocus-opacity",
		`${settings.sotTypewriterNonFocusOpacity ?? 0.42}`,
	);
}
