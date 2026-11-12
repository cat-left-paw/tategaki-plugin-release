import type { ViewModePreference } from "../../../types/settings";
import type { PmModeCapabilities } from "./capabilities";

export const TATEGAKI_PM_VIEW_TYPE = "tategaki-pm-view";
export function canOpenPmMode(enabled: boolean, capabilities: PmModeCapabilities): boolean {
	return enabled && capabilities.available;
}
/** Keep saved preferences; resolve an unavailable PM entry to the existing writing mode. */
export function resolvePmModePreference<T extends ViewModePreference>(mode: T, enabled: boolean, capabilities: PmModeCapabilities): T | "edit" {
	return mode === "pm" && !canOpenPmMode(enabled, capabilities) ? "edit" : mode;
}
