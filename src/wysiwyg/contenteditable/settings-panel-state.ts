export function resolveSelectionModeSettingUiState(
	mode: "sot" | "compat",
	typewriterMode?: boolean,
): {
	disabled: boolean;
	disabledReason?: string;
} {
	if (mode === "compat") {
		return {
			disabled: true,
			disabledReason: "互換モードでは反映されません",
		};
	}

	if (typewriterMode === true) {
		return {
			disabled: true,
			disabledReason:
				"Typewriter モード中は選択方法が一時的にクリック優先になります。Typewriter モードをオフにすると、保存されている設定に戻ります。",
		};
	}

	return {
		disabled: false,
	};
}

export const SOT_TYPEWRITER_OFFSET_RATIO_MIN = -0.4;
export const SOT_TYPEWRITER_OFFSET_RATIO_MAX = 0.4;
export const SOT_TYPEWRITER_OFFSET_RATIO_STEP = 0.01;
export const SOT_TYPEWRITER_FOLLOW_BAND_RATIO_MIN = 0.05;
export const SOT_TYPEWRITER_FOLLOW_BAND_RATIO_MAX = 0.25;
export const SOT_TYPEWRITER_FOLLOW_BAND_RATIO_STEP = 0.01;
export const SOT_TYPEWRITER_HIGHLIGHT_OPACITY_MIN = 0;
export const SOT_TYPEWRITER_HIGHLIGHT_OPACITY_MAX = 1;
export const SOT_TYPEWRITER_HIGHLIGHT_OPACITY_STEP = 0.01;
export const SOT_TYPEWRITER_NONFOCUS_OPACITY_MIN = 0.1;
export const SOT_TYPEWRITER_NONFOCUS_OPACITY_MAX = 1;
export const SOT_TYPEWRITER_NONFOCUS_OPACITY_STEP = 0.01;

export function resolveSoTTypewriterOffsetRatioFromUiPercent(
	value: number,
): number {
	return clamp(value, -40, 40) / 100;
}

export function resolveSoTTypewriterFollowBandRatioFromUiPercent(
	value: number,
): number {
	return (
		clamp(
			value,
			SOT_TYPEWRITER_FOLLOW_BAND_RATIO_MIN * 100,
			SOT_TYPEWRITER_FOLLOW_BAND_RATIO_MAX * 100,
		) / 100
	);
}

export function formatSoTTypewriterOffsetRatioForUi(value: number): string {
	const percent = Math.round(
		clamp(
			value,
			SOT_TYPEWRITER_OFFSET_RATIO_MIN,
			SOT_TYPEWRITER_OFFSET_RATIO_MAX,
		) * 100,
	);
	if (percent > 0) {
		return `+${percent}%`;
	}
	return `${percent}%`;
}

export function formatSoTTypewriterFollowBandRatioForUi(value: number): string {
	return `${Math.round(
		clamp(
			value,
			SOT_TYPEWRITER_FOLLOW_BAND_RATIO_MIN,
			SOT_TYPEWRITER_FOLLOW_BAND_RATIO_MAX,
		) * 100,
	)}%`;
}

export function resolveSoTTypewriterHighlightOpacityFromUiPercent(
	value: number,
): number {
	return (
		clamp(
			value,
			SOT_TYPEWRITER_HIGHLIGHT_OPACITY_MIN * 100,
			SOT_TYPEWRITER_HIGHLIGHT_OPACITY_MAX * 100,
		) / 100
	);
}

export function resolveSoTTypewriterNonFocusOpacityFromUiPercent(
	value: number,
): number {
	return (
		clamp(
			value,
			SOT_TYPEWRITER_NONFOCUS_OPACITY_MIN * 100,
			SOT_TYPEWRITER_NONFOCUS_OPACITY_MAX * 100,
		) / 100
	);
}

export function formatSoTTypewriterHighlightOpacityForUi(value: number): string {
	return `${Math.round(
		clamp(
			value,
			SOT_TYPEWRITER_HIGHLIGHT_OPACITY_MIN,
			SOT_TYPEWRITER_HIGHLIGHT_OPACITY_MAX,
		) * 100,
	)}%`;
}

export function formatSoTTypewriterNonFocusOpacityForUi(value: number): string {
	return `${Math.round(
		clamp(
			value,
			SOT_TYPEWRITER_NONFOCUS_OPACITY_MIN,
			SOT_TYPEWRITER_NONFOCUS_OPACITY_MAX,
		) * 100,
	)}%`;
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}
	return Math.max(min, Math.min(max, value));
}
