/**
 * CHUNK2-B (docs/tategaki-new-mode-chunked-skip-design.md §9): the chunks outside the view skip their layout
 * and paint (`content-visibility: auto`). Each chunk has a size along the block axis: estimated from its text
 * (pm/chunk-estimate.ts) until it is shown, then the real size the browser laid it out with. So opening a
 * document and changing the length of the lines (the view's height in vertical writing, its width in
 * horizontal writing, the font) lay out only the chunks in and near the view.
 *
 * - The size is written as `contain-intrinsic-block-size`. The ResizeObserver reports a chunk laid out with
 *   its content when the size differs from the one recorded (a skipped chunk is exactly that size); the real
 *   size is then recorded and written.
 * - Chromium remembers the size of a `content-visibility: auto` element laid out once and uses it whenever it
 *   is skipped, over the size written (as if `contain-intrinsic-size: auto`); only an element that is not
 *   `auto` for a moment forgets it. So when the lines get longer or shorter, a skipped chunk is made
 *   `content-visibility: hidden` with its new size (known size × new estimate ÷ old estimate), and made
 *   `auto` again in the ResizeObserver's callback that sees the new size: it then keeps that size until it is
 *   shown. A chunk still `hidden` at the next scroll is made `auto` there (never left without its content).
 * - The block at the start of the view stays where it was when the chunks before it change size: the
 *   block and the distance of its start edge from the view's start edge are recorded on each scroll, after
 *   each correction and when a chunk is shown (`contentvisibilityautostatechange`: its lines can then be the
 *   block), and the ResizeObserver's callback (after layout, before paint) scrolls by the difference.
 *
 * J28/J29: after a commit reveal, keep the caret line through layout/line-length changes until the user
 * scrolls again; then return to the view-start block rule above.
 *
 * No timer and no frame callback (the new mode's rule). The positions shown are exact; the scroll size and
 * the positions of chunks never shown are estimates (§9: what this design gives up).
 */
import { chunkMetrics, estimateChunkSize, rescaleChunkSize, type ChunkMetrics } from "../pm/chunk-estimate";
import type { PMNode } from "../pm/prosemirror";
import type { PmModeChunkHooks } from "../pm/view";

type SkipWindow = Window & { ResizeObserver: typeof ResizeObserver };
type VisibilityCheck = Element & { checkVisibility?: (options: { contentVisibilityAuto: boolean }) => boolean };
interface ChunkRecord { node: PMNode; size: number; measured: boolean }
interface Metrics extends ChunkMetrics { vertical: boolean }
interface Anchor { el: Element; offset: number; revealScale?: number }

/** Below this difference (CSS px) a size or a position is the same (sub-pixel rounding). */
const SAME_PX = 0.5;
/** A skipped chunk made `content-visibility: hidden` for a moment, to forget the size the browser remembered (styles/stylesheet.ts has the rule). */
const FORGET_SIZE_CLASS = "tategaki-pm-chunk-forget-size";

export class PmModeChunkSkip {
	readonly hooks: PmModeChunkHooks;
	private readonly chunks = new Map<HTMLElement, ChunkRecord>();
	/** Chunks made `content-visibility: hidden` to forget their remembered size; `auto` again soon after. */
	private readonly forgetting = new Set<HTMLElement>();
	private observer: ResizeObserver | null;
	private win: SkipWindow | null;
	private metricsCache: Metrics | null = null;
	private anchor: Anchor | null = null;
	/** Scroll position at reveal or written by its anchor correction; a different scroll returns to the usual view-start anchor. */
	private revealScroll: { left: number; top: number } | null = null;
	private destroyed = false;
	/** What happened so far (for tests and diagnostics). */
	readonly counts = { lineLengthChanges: 0, rescales: 0, measured: 0, anchorCorrections: 0 };
	private readonly onScroll = () => {
		if (this.destroyed) return;
		this.showAgain(this.forgetting);
		// A reveal's delayed scroll event and ResizeObserver may interleave over several deliveries. Keep its line
		// while the offset is exactly what we wrote; the user's next different scroll takes the original path.
		if (this.revealScroll && this.anchor?.el.isConnected && this.scroller.scrollLeft === this.revealScroll.left && this.scroller.scrollTop === this.revealScroll.top) return;
		this.revealScroll = null;
		this.captureAnchor();
	};
	/** A chunk was shown or skipped: the block at the start may now be one of its lines. */
	private readonly onShownChange = (event: Event) => {
		if (this.destroyed || (event as Event & { skipped?: boolean }).skipped) return;
		if (!this.anchor || this.anchor.el === event.target) this.captureAnchor();
		// M3b (R2-2): a chunk that is laid out again at the size it remembers sends no ResizeObserver notice, so what lies in it (the range overlay's
		// atoms, bands and rects, which are not read while it is skipped) is told here, by this event alone.
		this.onShown?.();
	};

	constructor(private readonly root: HTMLElement, private readonly scroller: HTMLElement, private readonly onLayout?: () => void, private readonly onShown?: () => void) {
		this.win = root.ownerDocument.defaultView;
		this.observer = this.win ? new this.win.ResizeObserver(entries => this.onResize(entries)) : null;
		scroller.addEventListener("scroll", this.onScroll, { passive: true });
		this.hooks = {
			created: (dom, chunk) => this.add(dom, chunk),
			updated: (dom, chunk, previous) => this.change(dom, chunk, previous),
			destroyed: dom => this.remove(dom),
		};
	}

	/** The chunks and what is known of each (for tests and diagnostics). */
	get records(): ReadonlyMap<HTMLElement, Readonly<ChunkRecord>> { return this.chunks; }

	/** J28: keep the committed caret edge in the reveal callback, before layout/scroll events replace the old anchor. */
	keepAfterReveal(line: HTMLElement, offset: number, scale: number): void {
		if (this.destroyed || !this.root.contains(line)) return;
		// The reveal read the line before writing scroll, then moved that edge by the actual scroll delta.
		// Do not force a new layout here: changes from the following layout must be corrected to this position.
		this.anchor = { el: line, offset, revealScale: scale };
		this.revealScroll = { left: this.scroller.scrollLeft, top: this.scroller.scrollTop };
	}

	/**
	 * The lines may have got longer or shorter (the view resized, the settings changed): every size is
	 * scaled by the ratio of the estimates. A change of writing mode starts again from the estimates.
	 */
	onLineLengthChange(): void {
		if (this.destroyed) return;
		this.counts.lineLengthChanges++;
		const before = this.metricsCache;
		this.metricsCache = null;
		const after = this.metrics();
		if (!before || (before.perLine === after.perLine && before.advance === after.advance && before.vertical === after.vertical)) return;
		this.counts.rescales++;
		// Reads first (the layout is clean after reading the metrics), then writes.
		const skipped = new Set(Array.from(this.chunks.keys()).filter(dom => !this.isShown(dom)));
		for (const [dom, record] of this.chunks) {
			const next = before.vertical === after.vertical ? rescaleChunkSize(record.size, record.node, before, after) : estimateChunkSize(record.node, after);
			// A shown chunk is laid out again and measured; a skipped one forgets its remembered size.
			if (skipped.has(dom) && Math.abs(next - record.size) >= 1) {
				dom.classList.add(FORGET_SIZE_CLASS);
				this.forgetting.add(dom);
			}
			record.size = next;
			record.measured = false;
			this.write(dom, next);
		}
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.observer?.disconnect();
		this.scroller.removeEventListener("scroll", this.onScroll);
		this.showAgain(this.forgetting);
		for (const dom of this.chunks.keys()) dom.removeEventListener("contentvisibilityautostatechange", this.onShownChange);
		this.chunks.clear();
		this.anchor = null;
		this.revealScroll = null;
	}

	private metrics(): Metrics {
		if (this.metricsCache) return this.metricsCache;
		const style = this.win?.getComputedStyle(this.root);
		const px = (value: string | undefined) => parseFloat(value ?? "") || 0;
		const vertical = !style || style.writingMode.startsWith("vertical");
		// The root's inline size without its padding. Read when the first chunk is made (the layout then holds
		// only the blocks before it) or when the lines changed length (the layout is needed anyway).
		const inline = vertical
			? this.root.clientHeight - px(style?.paddingTop) - px(style?.paddingBottom)
			: this.root.clientWidth - px(style?.paddingLeft) - px(style?.paddingRight);
		const fontSize = px(style?.fontSize) || 16;
		this.metricsCache = { ...chunkMetrics(inline, fontSize, px(style?.letterSpacing), px(style?.lineHeight) || fontSize * 1.8), vertical };
		return this.metricsCache;
	}

	private write(dom: HTMLElement, size: number): void {
		dom.style.setProperty("contain-intrinsic-block-size", `${Math.round(size * 100) / 100}px`);
	}

	private add(dom: HTMLElement, chunk: PMNode): void {
		if (this.destroyed) return;
		const size = estimateChunkSize(chunk, this.metrics());
		this.chunks.set(dom, { node: chunk, size, measured: false });
		this.write(dom, size);
		this.observer?.observe(dom);
		dom.addEventListener("contentvisibilityautostatechange", this.onShownChange);
	}

	/** A chunk's text changed: a skipped chunk takes the difference of the estimates; a shown one is measured again. */
	private change(dom: HTMLElement, chunk: PMNode, previous: PMNode): void {
		const record = this.chunks.get(dom);
		if (!record) { this.add(dom, chunk); return; }
		const metrics = this.metrics();
		record.size = Math.max(0, record.size + estimateChunkSize(chunk, metrics) - estimateChunkSize(previous, metrics));
		record.node = chunk;
		this.write(dom, record.size);
	}

	private remove(dom: HTMLElement): void {
		this.observer?.unobserve(dom);
		dom.removeEventListener("contentvisibilityautostatechange", this.onShownChange);
		this.forgetting.delete(dom);
		this.chunks.delete(dom);
	}

	/** Whether a chunk's lines are laid out (not skipped by `content-visibility`). */
	private isShown(dom: HTMLElement): boolean {
		return (dom.firstElementChild as VisibilityCheck | null)?.checkVisibility?.({ contentVisibilityAuto: true }) !== false;
	}
	/** Back to the stylesheet's `content-visibility: auto`. */
	private showAgain(doms: Iterable<HTMLElement>): void {
		for (const dom of Array.from(doms)) { dom.classList.remove(FORGET_SIZE_CLASS); this.forgetting.delete(dom); }
	}

	/** After layout, before paint: record the sizes of the chunks laid out with their content, keep the view's start in place. */
	private onResize(entries: readonly ResizeObserverEntry[]): void {
		if (this.destroyed) return;
		const measured: Array<[HTMLElement, number]> = [], forgotten: HTMLElement[] = [];
		for (const entry of entries) {
			const dom = entry.target as HTMLElement, record = this.chunks.get(dom);
			if (!record) continue;
			// Laid out `hidden` with its new size: the remembered size is gone; `auto` again (below).
			if (this.forgetting.has(dom)) { forgotten.push(dom); continue; }
			const size = entry.borderBoxSize?.[0]?.blockSize ?? (this.metrics().vertical ? entry.contentRect.width : entry.contentRect.height);
			if (Math.abs(size - record.size) > SAME_PX) measured.push([dom, size]);
		}
		// Reads (the layout is clean here), then writes: the scroll, then the sizes (a shown chunk's own size
		// written as its intrinsic size changes nothing it lays out).
		this.restoreAnchor();
		for (const [dom, size] of measured) {
			const record = this.chunks.get(dom);
			if (!record) continue;
			record.size = size;
			record.measured = true;
			this.counts.measured++;
			this.write(dom, size);
		}
		this.showAgain(forgotten);
		// The block at the start now, as fine as the layout allows (a line once its chunk is shown).
		this.captureAnchor();
		// M2 §7.4: exactly one notification per delivery, after correction; the surface alone handles composition freeze.
		this.onLayout?.();
	}

	/** The block-axis offset of an element's start edge from the view's start edge (right in vertical writing, top in horizontal). */
	private startOffset(rect: DOMRect, view: DOMRect, vertical: boolean): number {
		return vertical ? view.right - rect.right : rect.top - view.top;
	}
	private endOffset(rect: DOMRect, view: DOMRect, vertical: boolean): number {
		return vertical ? view.right - rect.left : rect.bottom - view.top;
	}
	/** The first of `elements` (in order along the block axis) that ends after the view's start. */
	private firstEndingAfterStart(elements: HTMLCollection, view: DOMRect, vertical: boolean): Element | null {
		let lo = 0, hi = elements.length - 1, found: Element | null = null;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1, el = elements[mid];
			if (this.endOffset(el.getBoundingClientRect(), view, vertical) > 0) { found = el; hi = mid - 1; } else lo = mid + 1;
		}
		return found;
	}

	private captureAnchor(): void {
		if (this.revealScroll && this.anchor?.el.isConnected) return;
		this.revealScroll = null;
		const vertical = this.metrics().vertical, view = this.scroller.getBoundingClientRect();
		let el = this.firstEndingAfterStart(this.root.children, view, vertical);
		// Inside a chunk that is laid out, a line; a skipped chunk is its own anchor (its lines have no layout).
		if (el && el.tagName === "TG-CHUNK" && this.isShown(el as HTMLElement)) el = this.firstEndingAfterStart(el.children, view, vertical) ?? el;
		this.anchor = el ? { el, offset: this.startOffset(el.getBoundingClientRect(), view, vertical) } : null;
	}

	private restoreAnchor(): void {
		const anchor = this.anchor;
		if (!anchor || !anchor.el.isConnected) { this.captureAnchor(); return; }
		const vertical = this.metrics().vertical, view = this.scroller.getBoundingClientRect();
		// A reveal records viewport pixels inside a possibly scaled page; its scroll offset is in CSS pixels.
		// Ordinary user-scroll anchors keep their existing unit/behavior (no revealScale).
		const delta = (this.startOffset(anchor.el.getBoundingClientRect(), view, vertical) - anchor.offset) / (anchor.revealScale ?? 1);
		if (Math.abs(delta) < SAME_PX) return;
		// Vertical-rl: a block that moved toward the end (left) comes back when the view scrolls toward the end too.
		if (vertical) this.scroller.scrollLeft -= delta; else this.scroller.scrollTop += delta;
		if (this.revealScroll) this.revealScroll = { left: this.scroller.scrollLeft, top: this.scroller.scrollTop };
		this.counts.anchorCorrections++;
	}
}
