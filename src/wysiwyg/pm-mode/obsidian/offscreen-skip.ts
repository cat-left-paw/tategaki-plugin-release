/**
 * **Off in the product since 2026-10-21** (the session's `offscreenSkip` option; M1-5 report §12, M1 design D25
 * as revised): turning `content-visibility` on for every paragraph took time that grows with the square of
 * the number of paragraphs (about 5.4 s for a document of 11,000 short paragraphs). Kept for the tests and
 * benches, and as the base of a grouped version (several paragraphs per skipped box) under design.
 *
 * The new mode skips the layout and paint of the text lines outside the view (`content-visibility: auto`,
 * M1-5 report §10-§11, M1 design D25). A line break near the head moves every following column; skipping
 * the columns outside the view makes that cheap, with Chromium's accessibility on or off. Skipping clips
 * what a line draws outside its box, so headings (their fold toggle is outside) and Obsidian parts are not
 * skipped (the stylesheet's rules).
 *
 * Exact sizes: a skipped block takes the size the browser remembered for it (`contain-intrinsic-block-size:
 * auto`), and the browser only remembers the size of a block it has laid out. So the skipping starts after
 * one full layout: the root is `measuring` (nothing skipped, every block laid out and its size remembered),
 * and the first ResizeObserver notification after that layout turns it `on`. The scroll width and every
 * block's position then match the layout without skipping. A block added later outside the view (an edit
 * in the Markdown view elsewhere, a paste) has no remembered size until it is shown; it takes the average
 * block size, and its real size replaces that when it is shown.
 *
 * Measured again (one full layout) when the sizes of all blocks change: the view's height, the settings
 * (font, line height, ruby, writing mode) and fonts that finish loading. The session calls `remeasure()`
 * for the first two; this module listens to the document's fonts.
 *
 * No timer and no frame callback: the ResizeObserver's first notification after `observe()` comes after the
 * next layout.
 */
export const OFFSCREEN_SKIP_ATTRIBUTE = "data-tategaki-pm-skip";
export const OFFSCREEN_SKIP_FALLBACK = "--tategaki-pm-skip-fallback";
export type OffscreenSkipPhase = "off" | "measuring" | "on";

type SkipWindow = Window & { ResizeObserver: typeof ResizeObserver };

export class PmModeOffscreenSkip {
	private readonly observer: ResizeObserver | null = null;
	private readonly fonts: FontFaceSet | null = null;
	private waiting = false;
	private destroyed = false;
	private measured = 0;
	private readonly onFonts = () => this.remeasure();
	constructor(private readonly root: HTMLElement, enabled = true) {
		const win = root.ownerDocument.defaultView as SkipWindow | null;
		if (!enabled || !win) { root.setAttribute(OFFSCREEN_SKIP_ATTRIBUTE, "off"); return; }
		this.observer = new win.ResizeObserver(entries => this.onLaidOut(entries));
		this.fonts = root.ownerDocument.fonts ?? null;
		this.fonts?.addEventListener("loadingdone", this.onFonts);
		this.remeasure();
	}
	get phase(): OffscreenSkipPhase {
		const value = this.root.getAttribute(OFFSCREEN_SKIP_ATTRIBUTE);
		return value === "on" || value === "measuring" ? value : "off";
	}
	/** How many full layouts have been measured (for tests and diagnostics). */
	get measurements(): number { return this.measured; }
	/** Stop skipping until the next layout has laid out every block (and the browser has remembered its size). */
	remeasure(): void {
		if (this.destroyed || !this.observer) return;
		this.root.setAttribute(OFFSCREEN_SKIP_ATTRIBUTE, "measuring");
		this.waiting = true;
		// A new observe() always notifies once, after the next layout.
		this.observer.unobserve(this.root);
		this.observer.observe(this.root);
	}
	private onLaidOut(entries: readonly ResizeObserverEntry[]): void {
		if (this.destroyed || !this.waiting) return;
		const entry = entries.find(item => item.target === this.root);
		if (!entry) return;
		this.waiting = false;
		this.measured++;
		// The average block size, for blocks added later outside the view. The root's own box is the view's
		// size and the columns overflow it, so the extent is its scroll size (the layout is clean here).
		const vertical = this.root.ownerDocument.defaultView?.getComputedStyle(this.root).writingMode.startsWith("vertical") ?? true;
		const blockSize = vertical ? this.root.scrollWidth : this.root.scrollHeight;
		const blocks = this.root.childElementCount;
		if (blockSize > 0 && blocks > 0) this.root.style.setProperty(OFFSCREEN_SKIP_FALLBACK, `${Math.round((blockSize / blocks) * 100) / 100}px`);
		this.root.setAttribute(OFFSCREEN_SKIP_ATTRIBUTE, "on");
	}
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.observer?.disconnect();
		this.fonts?.removeEventListener("loadingdone", this.onFonts);
	}
}
