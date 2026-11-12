// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/retainedDisplay.ts @ 38750b33 (2026-11-05, PIS-RETAINED-TEXT-COLOR1; later than the fixed commit 020b5501)
// Local changes: M3c (H17). The ladders, the 4.5 contrast target, the contrast formula and the one function that toggles the surface's attribute are Nyoze's.
//   The attribute and the variable are named for the new mode (`data-tategaki-pm-retained`, `--tategaki-pm-retained-color`); there is no mirror
//   content kind here (the new mode's surface holds no copy of the text), so the display rule has no `kind`. Comments in English; the repo's style.

/**
 * PIS-RETAINED-TEXT-COLOR1: the display of text that could not be committed and stays on the input surface (retained text).
 *
 * Retained text used to be drawn in the body text color, so a user could not tell whether it had entered the document or only stayed on the
 * surface. It is drawn in a red tone chosen from the backdrop. This module holds the decision (pure), the choice of the color (pure) and one
 * function that toggles the attribute. What counts as retained (`failure`, the notices, the commit and the discarding) is not changed here.
 */
import { parseComputedColor, resolveOpaqueBackdrop, type Rgba } from "./surface-backdrop";

/** The surface's own attribute. One fixed CSS rule (`stylesheet.ts`) gives the retained color only while it is there. */
export const RETAINED_TEXT_ATTRIBUTE = "data-tategaki-pm-retained";
/** The surface's own variable, written where the backdrop is read (`surface-typography.ts`); never on an ancestor of the text. */
export const RETAINED_TEXT_COLOR_VARIABLE = "--tategaki-pm-retained-color";
/**
 * Dark reds for a light backdrop and light reds for a dark one (Nyoze's addendum 1). Each starts at its base color; only when the contrast
 * with the backdrop is short does the walk go to the next color (the dark reds get darker, the light reds lighter).
 */
export const RETAINED_TEXT_DARK_REDS = ["#b3261e", "#a6201a", "#9c1c14", "#8c1610"] as const;
export const RETAINED_TEXT_LIGHT_REDS = ["#ff8a80", "#ff9e94", "#ffaba2", "#ffb4ab", "#ffc0b8"] as const;
export const RETAINED_TEXT_DARK_RED = RETAINED_TEXT_DARK_REDS[0];
export const RETAINED_TEXT_LIGHT_RED = RETAINED_TEXT_LIGHT_REDS[0];
/** The contrast the retained color must have with its backdrop (WCAG AA). */
export const RETAINED_TEXT_MIN_CONTRAST = 4.5;

export interface RetainedDisplayInput {
	readonly text: string;
	readonly composing: boolean;
	/** The recorded failure of the last commit (or the reason a keyless composition was not written), or null. */
	readonly failure: unknown;
}

/**
 * Whether the surface's text is shown as retained.
 * - No text: no.
 * - While composing: an ordinary composition (no `failure`) is not retained text and keeps its color. A composition begun over retained text
 *   (a `failure` is recorded) stays retained even when it is confirmed, so it keeps the color.
 * - Not composing, with text: retained, also when no `failure` is recorded.
 *
 * It is for the settled state only: the caller asks once when an entry point (an event handler or an exported function) is left. In the middle of
 * an event (the typed character is on the surface and the owner has not taken it yet) there is text that is not yet classified, and asking then
 * would put the attribute on and take it off at every successful keystroke.
 */
export function isSurfaceTextRetainedForDisplay(input: RetainedDisplayInput): boolean {
	return input.text.length > 0 && (!input.composing || input.failure !== null);
}

const channel = (value: number): number => {
	const v = value / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (color: Rgba): number => 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
/** The WCAG contrast ratio of two opaque colors. */
export function contrastRatioOf(first: Rgba, second: Rgba): number {
	const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

/** `#rrggbb` as 0-255 channels (`parseComputedColor` reads the computed `rgb()` form only, not hex). */
export function hexToRgba(hex: string): Rgba {
	return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 1];
}
interface Candidate { readonly hex: string; readonly rgba: Rgba }
const DARK_LADDER: readonly Candidate[] = RETAINED_TEXT_DARK_REDS.map(hex => ({ hex, rgba: hexToRgba(hex) }));
const LIGHT_LADDER: readonly Candidate[] = RETAINED_TEXT_LIGHT_REDS.map(hex => ({ hex, rgba: hexToRgba(hex) }));
const DARK_RED = DARK_LADDER[0].rgba, LIGHT_RED = LIGHT_LADDER[0].rgba;

/**
 * The retained color for the backdrop the text is drawn on.
 * - A backdrop that can be read (opaque):
 *   1. The side: of the two ladders' first colors, the ladder whose first color has the larger contrast with the backdrop (the dark reds on a tie).
 *   2. Walk that ladder from its start: the first color whose contrast is 4.5 or more.
 *   3. If none reaches 4.5: the color of both ladders with the largest contrast (a mid-gray page).
 * - A backdrop that cannot be read (not parsed, not opaque): the first color of the ladder whose contrast with the body text color is smaller (the
 *   side of the body text's brightness); the dark red when the body color cannot be read either.
 * Not asked at every keystroke: only when the backdrop is read again.
 */
export function resolveRetainedTextColor(background: string, bodyTextColor?: string): string {
	const base = parseComputedColor(background);
	if (base && base[3] >= 1) {
		const ladder = contrastRatioOf(LIGHT_RED, base) > contrastRatioOf(DARK_RED, base) ? LIGHT_LADDER : DARK_LADDER;
		const reached = ladder.find(candidate => contrastRatioOf(candidate.rgba, base) >= RETAINED_TEXT_MIN_CONTRAST);
		if (reached) return reached.hex;
		let best: Candidate = DARK_LADDER[0], bestContrast = -1;
		for (const candidate of [...DARK_LADDER, ...LIGHT_LADDER]) {
			const contrast = contrastRatioOf(candidate.rgba, base);
			if (contrast > bestContrast) { best = candidate; bestContrast = contrast; }
		}
		return best.hex;
	}
	const body = bodyTextColor === undefined ? null : parseComputedColor(bodyTextColor);
	if (!body || body[3] < 1) return RETAINED_TEXT_DARK_RED;
	return contrastRatioOf(LIGHT_RED, body) < contrastRatioOf(DARK_RED, body) ? RETAINED_TEXT_LIGHT_RED : RETAINED_TEXT_DARK_RED;
}

/** The retained color for the backdrop (translucent ones composed over the opaque base, as the surface paints them), from the body text. */
export function resolveRetainedTextColorForSurface(background: string, markBackground: string | undefined, bodyTextColor?: string): string {
	return resolveRetainedTextColor(resolveOpaqueBackdrop(markBackground ? [markBackground] : [], background), bodyTextColor);
}

type AttributeHost = Pick<Element, "hasAttribute" | "toggleAttribute">;

/**
 * The only place that decides the attribute. Called once when an entry point that can change the text, the composition or the failure is
 * left (not at each assignment of `failure`); `toggleAttribute` runs only when the value changes.
 */
export function createRetainedDisplay(element: AttributeHost, read: () => RetainedDisplayInput) {
	return {
		refresh(): boolean {
			const retained = isSurfaceTextRetainedForDisplay(read());
			if (element.hasAttribute(RETAINED_TEXT_ATTRIBUTE) !== retained) element.toggleAttribute(RETAINED_TEXT_ATTRIBUTE, retained);
			return retained;
		},
	};
}
