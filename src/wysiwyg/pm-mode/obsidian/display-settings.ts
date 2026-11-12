// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: this repo's V (src/wysiwyg/sot-wysiwyg-view.ts) for the settings it reads: `resolveCaretColor` (V:1632-1646), `caretWidthPx ?? 3` (V:11381),
//   `sotTypewriterMode` / `sotTypewriterOffsetRatio ?? 0` / `sotTypewriterFollowBandRatio ?? 0.16` (V:11913-11932) and the three flags
//   `sotTypewriterBlockHighlightEnabled !== false` and the like (V:14644-14660), with the color keys of `sot-focus-visual-style.ts`.
// Local changes: M3c (H7, D-M3-17, D-M3-18). V reads these keys from the plugin where it uses them; the new mode reads them once into one plain value when a view is
//   made and when its settings change (`session.updateSettings`), so that the display (pseudo caret, current line band, visual focus, Typewriter) never touches the
//   plugin. No new key and no new setting screen: the keys are the current writing mode's, with the same defaults. Pure: it reads no DOM.
//   One intended difference (round 2, P3-6): V takes `caretWidthPx ?? 3`, so a width of 0 or less is V's own (an invisible caret); here a width that is not above 0 is 3, because the pseudo caret
//   replaces the surface's native one, and a caret nobody can see leaves the writer without any. A width that is above 0 is V's.
import { DEFAULT_V2_SETTINGS, type CommonSettings, type TategakiV2Settings } from "../../../types/settings";
import { resolveSoTTypewriterAvailability } from "../../sot/sot-typewriter-availability";

export interface PmModeDisplaySettings {
	/** The caret's short side, in CSS px (`caretWidthPx`, V's default 3). */
	readonly caretWidth: number;
	/** The caret's color as a CSS value: the accent color, the text color or the custom color (`caretColorMode`). */
	readonly caretColor: string;
	/** Typewriter is on in the settings and is available in this mode (not the plain text view). */
	readonly typewriter: boolean;
	readonly typewriterOffsetRatio: number;
	readonly typewriterFollowBandRatio: number;
	/** The three flags work apart from Typewriter (the default is on for all three, as in V). */
	readonly blockHighlight: boolean;
	readonly currentLine: boolean;
	readonly nonFocusDim: boolean;
	readonly blockColor: string;
	readonly blockOpacity: number;
	readonly currentLineColor: string;
	readonly currentLineOpacity: number;
	readonly nonFocusOpacity: number;
	/** The plain text view turns the Typewriter family off (`sot-typewriter-availability.ts`); the pseudo caret stays. */
	readonly plainTextView: boolean;
}

function finite(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** V:1632-1646 `resolveCaretColor`. */
export function resolveCaretColor(settings: TategakiV2Settings, common: CommonSettings): string {
	const mode = settings.wysiwyg.caretColorMode ?? "accent";
	if (mode === "text") return common.textColor;
	if (mode === "custom") {
		const custom = settings.wysiwyg.caretCustomColor?.trim();
		if (custom) return custom;
	}
	return common.accentColor;
}

export function readDisplaySettings(settings: TategakiV2Settings, common: CommonSettings = settings.common): PmModeDisplaySettings {
	const w = settings.wysiwyg, d = DEFAULT_V2_SETTINGS.wysiwyg;
	const plainTextView = w.plainTextView === true;
	const availability = resolveSoTTypewriterAvailability({ sourceModeEnabled: false, plainTextViewEnabled: plainTextView, plainEditActive: false });
	const width = finite(w.caretWidthPx, 3);
	return {
		caretWidth: width > 0 ? width : 3,
		caretColor: resolveCaretColor(settings, common),
		typewriter: availability.available && w.sotTypewriterMode === true,
		typewriterOffsetRatio: finite(w.sotTypewriterOffsetRatio, 0),
		typewriterFollowBandRatio: finite(w.sotTypewriterFollowBandRatio, 0.16),
		blockHighlight: availability.available && w.sotTypewriterBlockHighlightEnabled !== false,
		currentLine: availability.available && w.sotTypewriterCurrentLineHighlightEnabled !== false,
		nonFocusDim: availability.available && w.sotTypewriterNonFocusDimEnabled !== false,
		blockColor: w.sotTypewriterBlockHighlightColor ?? d.sotTypewriterBlockHighlightColor ?? "#1e90ff",
		blockOpacity: finite(w.sotTypewriterBlockHighlightOpacity, 0.16),
		currentLineColor: w.sotTypewriterCurrentLineHighlightColor ?? d.sotTypewriterCurrentLineHighlightColor ?? "#1e90ff",
		currentLineOpacity: finite(w.sotTypewriterCurrentLineHighlightOpacity, 0.28),
		nonFocusOpacity: finite(w.sotTypewriterNonFocusOpacity, 0.42),
		plainTextView,
	};
}

export function sameDisplaySettings(a: PmModeDisplaySettings, b: PmModeDisplaySettings): boolean {
	return (Object.keys(a) as (keyof PmModeDisplaySettings)[]).every(key => a[key] === b[key]);
}
