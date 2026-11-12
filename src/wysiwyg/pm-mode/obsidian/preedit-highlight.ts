// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/preeditHighlight.ts @ 58a98a90 (2026-11-06; the file is the same as at 020b5501)
// Local changes: the rule goes into the shadow root of the view (`treeRoot`), not the document head; the highlight
//   name is `tategaki-pm-preedit-n`, the variable `--tategaki-pm-preedit-background`. The format-mark background
//   (the surface shows no inline formats in M2) is left out. M4b (D-M4-3, D-M4-6): `update(painted)` paints nothing while the room of the composing text is reserved in the display
//   (nothing is under it to hide; Nyoze PIS-S10-CURRENT-LINE2 (b)), and the short-sideways-glyph shadow (`createShortPreeditShadow`, SIDEWAYS-CLIP1) is Nyoze's, written to the surface's own
//   variable with `setCssProps` (the 1.3.4 rule: no direct style write) and only where the background is painted.
import { appendHighlightStyle, highlightWindow, highlightsSupported, nextHighlightName, type HighlightWindow } from "./highlight-support";
import { createShortPreeditShadow } from "./short-preedit-shadow";

/**
 * Paint only the surface's text range under it, with an opaque color (the surface text is drawn over the
 * body text it replaces). The rule never changes; the color is the surface's own variable. Painting is
 * switched through the registry.
 */
export function createPreeditHighlight(element: HTMLElement, treeRoot: Node) {
	// M3b: the window is read at each use (a popout move changes it). A composition is not moved with the view (the move is not designed for one).
	// (null when the window is gone: a popout that is closing unloads the view after its document lost the window; nothing is left to clear there.)
	highlightWindow(element);
	const win = (): HighlightWindow | null => element.ownerDocument.defaultView as HighlightWindow | null;
	const name = nextHighlightName("preedit");
	const style = appendHighlightStyle(treeRoot, `::highlight(${name}) { background-color: var(--tategaki-pm-preedit-background); text-shadow: var(--tategaki-pm-preedit-shadow, none); }`, "tategakiPmPreedit");
	const clear = (): void => { win()?.CSS?.highlights?.delete(name); };
	const shortShadow = createShortPreeditShadow(element);
	let shadow: boolean | undefined;
	return {
		name,
		get supported(): boolean { const now = win(); return !!now && highlightsSupported(now); },
		configure(background: string): void { element.style.setProperty("--tategaki-pm-preedit-background", background); },
		update(painted: boolean): void {
			// SIDEWAYS-CLIP1: the workaround works only where the background is painted.
			const nextShadow = painted && shortShadow();
			if (shadow !== nextShadow) {
				element.setCssProps({ "--tategaki-pm-preedit-shadow": nextShadow ? "0 0 0 currentColor" : "none" });
				shadow = nextShadow;
			}
			const now = win();
			if (!now || !painted || !element.textContent || !now.Highlight || !now.CSS?.highlights) { clear(); return; }
			const range = element.ownerDocument.createRange();
			range.selectNodeContents(element);
			now.CSS.highlights.set(name, new now.Highlight(range));
		},
		destroy(): void { clear(); style.remove(); },
	};
}
export type PreeditHighlight = ReturnType<typeof createPreeditHighlight>;
