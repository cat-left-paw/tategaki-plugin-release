import { Platform } from "obsidian";

export const PHONE_MEDIA_QUERY =
	"(hover: none) and (pointer: coarse) and (max-width: 700px)";

export function isPhoneLikeMobile(win?: Window | null): boolean {
	const targetWindow = win ?? (typeof window !== "undefined" ? window : null);
	if (!targetWindow) return false;
	try {
		if (targetWindow.matchMedia(PHONE_MEDIA_QUERY).matches) {
			return true;
		}
	} catch {
		// ignore and use fallback below
	}
	if (!(Platform.isMobile || Platform.isMobileApp)) return false;
	const shortEdge = Math.min(
		Math.abs(targetWindow.innerWidth || 0),
		Math.abs(targetWindow.innerHeight || 0),
	);
	return shortEdge > 0 && shortEdge <= 700;
}
