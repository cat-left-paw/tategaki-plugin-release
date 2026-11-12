// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/surfaceTypography.ts @ 020b5501 (2026-10-22)
//   and the property list `LOCAL_IME_LOCAL_WINDOW_TYPOGRAPHY_PROPERTIES` of
//   src/editor-core/features/localImeLocalWindowTypographyParity.ts @ 020b5501
// Local changes: the owner is a textblock element (`currentBlock`); no inline-format marks are drawn (M2, M2 design
//   §3), so the style always comes from the textblock; the ancestors are walked across the shadow boundary; the
//   mark-background paint (`markBackground`) is left out. M2-2c: prepare returns the write separately, so all
//   placement reads finish before any surface style is written; it also returns the cached layout lengths.
//   J33: text-align/text-align-last are not copied; the surface always starts where placement indents it.
//   M3c (H17): where the backdrop is read, the surface's own retained-text color is written too (`retained-display.ts`, Nyoze PIS-RETAINED-TEXT-COLOR1 @ 38750b33),
//   from the backdrop and the body text color; not at each keystroke (the typography is read again only when the block or an ancestor changes).
import type { PreeditHighlight } from "./preedit-highlight";
import { composedElementAncestors } from "./composed-tree";
import { isOpaqueColor, resolveOpaqueBackdrop } from "./surface-backdrop";
import { RETAINED_TEXT_COLOR_VARIABLE, resolveRetainedTextColor } from "./retained-display";

/** The layout properties the surface copies from the textblock, so lines wrap and measure as in the body. */
const TYPOGRAPHY_PROPERTIES = [
	"writing-mode", "text-orientation", "font-family", "font-size", "font-weight", "font-style", "font-stretch",
	"font-variant", "font-variant-east-asian", "font-feature-settings", "line-height", "letter-spacing", "word-spacing",
	"white-space", "line-break", "word-break", "overflow-wrap", "hanging-punctuation", "text-wrap",
	"text-justify", "text-spacing-trim", "text-transform",
	"color", "text-decoration-line", "text-underline-position",
] as const;

// The typography and the theme variables depend on this small chain of ancestors, never on the text. A change of
// an ancestor or of the viewport invalidates the snapshot; compositionstart forces a read (Nyoze, review 1 R2).
function ancestrySignature(source: Element): string {
	const parts: string[] = [];
	for (const node of [source, ...composedElementAncestors(source)]) parts.push(node.tagName, ...Array.from(node.attributes, attribute => `${attribute.name}=${attribute.value}`));
	return JSON.stringify(parts);
}

export function createSurfaceTypography(options: {
	host: HTMLElement;
	element: HTMLElement;
	currentBlock(): HTMLElement | null;
	preedit: PreeditHighlight;
	visual(): void;
}) {
	const { host, element, preedit, visual } = options;
	const firstWindow = host.ownerDocument.defaultView;
	if (!firstWindow) throw new Error("PM mode: no window for the surface typography");
	// M3b: the window is read at each use (a popout move changes it): another window's `getComputedStyle` reads nothing of this element.
	const winOf = (): Window => host.ownerDocument.defaultView ?? firstWindow;
	let background = "#fff";
	let previousBlock: HTMLElement | null | undefined;
	let previousSignature: string | undefined;
	let snapshot: { writingMode: string; lineHeight: number; fontSize: number; apply(): void };
	return (force = false, block = options.currentBlock()) => {
		const source = block ?? host;
		const win = winOf(), signature = win.innerWidth + ":" + win.innerHeight + ":" + ancestrySignature(source);
		if (!force && block === previousBlock && signature === previousSignature) return { ...snapshot, apply(): void {} };
		const style = win.getComputedStyle(source);
		// The backdrop is the first opaque background outward, with translucent ones composed over it. A translucent
		// one lets the body text show through the composing text.
		const backgrounds: string[] = [];
		for (const node of [source, ...composedElementAncestors(source)]) {
			const color = win.getComputedStyle(node).backgroundColor;
			if (!color) continue;
			backgrounds.push(color);
			if (isOpaqueColor(color)) break;
		}
		background = resolveOpaqueBackdrop(backgrounds, background);
		const properties = TYPOGRAPHY_PROPERTIES.map(property => [property, style.getPropertyValue(property)] as const);
		const nextBackground = background, bodyColor = style.color;
		const writingMode = style.writingMode, lineHeight = parseFloat(style.lineHeight), fontSize = parseFloat(style.fontSize);
		snapshot = { writingMode, lineHeight, fontSize, apply(): void {
			for (const [property, value] of properties) element.style.setProperty(property, value);
			// J33: placement already indents to the caret; aligning this empty surface again would move its native caret.
			// (`text-align` and `text-align-last` are `start` by the surface's rule in styles/stylesheet.ts; they are not copied above.)
			for (const property of ["background-color", "border", "border-radius", "padding"] as const) {
				element.style.setProperty(property, property === "background-color" ? "transparent" : "0");
			}
			previousBlock = block;
			previousSignature = signature;
			preedit.configure(nextBackground);
			// (Obsidian's `setCssProps`, as the 1.3.4 rule asks of new code: no direct style write)
			element.setCssProps({ [RETAINED_TEXT_COLOR_VARIABLE]: resolveRetainedTextColor(nextBackground, bodyColor) });
			visual();
		} };
		return snapshot;
	};
}
