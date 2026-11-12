// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:1469-1588, 1650-1706) @ 3603e14 (2026-10-17).
// Local changes: Return style values/classes; accept effective common settings explicitly; omit caret/focus/toolbar work.
// Local changes: Native ruby uses unitless size/gap; add page-frame/physical-padding variables and resolve theme color aliases.
import { DEFAULT_V2_SETTINGS, type CommonSettings, type TategakiV2Settings } from "../../../../types/settings";

export interface PmModeStyle {
	variables: Record<string, string>;
	classes: string[];
	writingMode: string;
	frameVerticalPadding: number;
}
export function computePmModeStyle(settings: TategakiV2Settings, effectiveCommon: CommonSettings = settings.common): PmModeStyle {
	const common = effectiveCommon;
	const verticalGap = common.rubyVerticalGap ?? DEFAULT_V2_SETTINGS.common.rubyVerticalGap;
	const horizontalGap = common.rubyHorizontalGap ?? DEFAULT_V2_SETTINGS.common.rubyHorizontalGap;
	const rawScale = Number(common.pageScale ?? 1);
	const fill = rawScale > 1;
	const scale = fill ? 1 : Math.max(0.7, Math.min(1, rawScale));
	const rubySize = Math.max(0.2, Math.min(1, common.rubySize ?? 0.5));
	const variables: Record<string, string> = {
		"--tategaki-writing-mode": common.writingMode,
		"--tategaki-font-family": common.fontFamily,
		"--tategaki-font-size": `${common.fontSize}px`,
		"--tategaki-line-height": String(common.lineHeight),
		"--tategaki-letter-spacing": `${common.letterSpacing}em`,
		"--tategaki-text-color": common.textColor,
		"--tategaki-background-color": common.backgroundColor,
		"--tategaki-accent-color": common.accentColor,
		"--tategaki-ruby-gap-vertical": `${verticalGap}em`,
		"--tategaki-ruby-gap-horizontal": `${horizontalGap}em`,
		"--tategaki-ruby-size": String(rubySize),
		"--ruby-size": String(rubySize),
		"--tategaki-pm-ruby-gap": String(common.writingMode === "horizontal-tb" ? horizontalGap : verticalGap),
		"--tategaki-heading-font-family": common.headingFontFamily || common.fontFamily,
		"--tategaki-heading-text-color": common.headingTextColor || common.textColor,
		"--tategaki-heading-margin-after": `${common.headingMarginAfter ?? 0.45}em`,
		"--tategaki-heading-align": common.headingAlign ?? "start",
		"--tategaki-pm-padding-top": `${settings.wysiwyg.sotPaddingTop ?? 32}px`,
		"--tategaki-pm-padding-bottom": `${settings.wysiwyg.sotPaddingBottom ?? 16}px`,
		"--tategaki-pm-page-inset": fill ? "0" : "40px 32px 22px 32px",
		"--tategaki-pm-page-scale": String(scale),
		"--tategaki-pm-page-shadow": fill ? "none" : "0 6px 12px rgba(0,0,0,0.4)",
		"--tategaki-pm-page-background": fill ? common.backgroundColor : common.pageBackgroundColor,
		// Break the inherited theme alias cycle at the shadow host, using the effective colors.
		"--text-normal": common.textColor,
		"--background-primary": common.backgroundColor,
	};
	const dividers = common.headingDividerLevels ?? DEFAULT_V2_SETTINGS.common.headingDividerLevels;
	const classes = ["tategaki-pm-root", "text-justify-enabled"];
	for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) if (dividers[level]) classes.push(`tategaki-heading-divider-${level}`);
	return { variables, classes, writingMode: common.writingMode, frameVerticalPadding: fill ? 0 : 62 };
}
