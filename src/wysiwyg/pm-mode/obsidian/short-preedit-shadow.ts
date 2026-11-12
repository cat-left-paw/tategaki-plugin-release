// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/shortPreeditShadow.ts @ 58a98a90 (2026-11-06; the file is the same as at 020b5501)
// Local changes: M4b (D-M4-6, SIDEWAYS-CLIP1). The decision is Nyoze's, as it is: the string is measured with the typography the surface already copied (`surface-typography.ts` writes
//   it as the element's own style, which is what is read here). The canvas text properties newer than the repo's DOM typings (`fontStretch`, `letterSpacing`, `wordSpacing`) are typed here.
//   Comments in English; the repo's style (tabs, semicolons, double quotes).

type TextContext = CanvasRenderingContext2D & { fontStretch: string; letterSpacing: string; wordSpacing: string };

/**
 * Short sideways ASCII runs need a paint workaround for Chromium's opaque Highlights: the highlight's background cuts off a glyph that is shorter than the em box. A same-colored,
 * zero-width `text-shadow` is drawn (`preedit-highlight.ts`) for such a run. Measure the string with the already copied typography, never the receiver's DOM layout.
 */
export function createShortPreeditShadow(element: HTMLElement) {
	let context: TextContext | null | undefined;
	let previousKey = "", previousValue = false;
	return (): boolean => {
		const s = element.style, text = element.textContent ?? "";
		const key = JSON.stringify([text, s.writingMode, s.textOrientation, s.fontFamily, s.fontSize,
			s.fontStyle, s.fontWeight, s.fontStretch, s.letterSpacing, s.wordSpacing, s.textTransform]);
		if (key === previousKey) return previousValue;
		previousKey = key;
		previousValue = false;
		// Upright kana/kanji and horizontal writing must retain their original paint.
		if (!s.writingMode?.startsWith("vertical") || s.textOrientation === "upright" ||
			!/[!-~]/.test(text) || !/^[\x20-\x7e\r\n]+$/.test(text)) return false;
		const size = parseFloat(s.fontSize);
		if (!(size > 0)) return false;
		if (context === undefined) context = element.ownerDocument.createElement("canvas").getContext("2d") as TextContext | null;
		if (!context) return false;
		context.font = `${s.fontStyle || "normal"} ${s.fontWeight || "normal"} ${size}px ${s.fontFamily}`;
		context.fontStretch = s.fontStretch || "normal";
		context.letterSpacing = s.letterSpacing === "normal" ? "0px" : s.letterSpacing || "0px";
		context.wordSpacing = s.wordSpacing === "normal" ? "0px" : s.wordSpacing || "0px";
		const displayed = s.textTransform === "uppercase" ? text.toUpperCase() :
			s.textTransform === "lowercase" ? text.toLowerCase() : text;
		// Explicit lines also occur in retained (rejected newline) payloads. A long line
		// makes this a normal paint case; do not darken it or a soft-wrapped long run.
		const measuring = context;
		previousValue = displayed.split(/\r\n?|\n/).every(line => measuring.measureText(line).width < size);
		return previousValue;
	};
}
