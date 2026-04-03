export function resolveSelectionModeSettingUiState(mode: "sot" | "compat"): {
	disabled: boolean;
	disabledReason?: string;
} {
	if (mode === "compat") {
		return {
			disabled: true,
			disabledReason: "互換モードでは反映されません",
		};
	}

	return {
		disabled: false,
	};
}
