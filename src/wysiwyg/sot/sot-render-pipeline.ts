import type { LineRange } from "./line-ranges";
import type { SoTEditor } from "./sot-editor";
import type { TategakiV2Settings, WritingMode } from "../../types/settings";
import type { FrontmatterData } from "./sot-wysiwyg-view-frontmatter";
import type { ChunkControllerSnapshot } from "./sot-chunk-controller";
import type { SoTScrollAnchor } from "./sot-scroll-anchor";
import {
	buildCollapsedGapRanges,
	resolveVisibleLineIndexAfterBudget,
	type CollapsedGapRange,
} from "./sot-collapsed-gap-ranges";
import { createCollapsedGapElement } from "./sot-gap-dom";
import {
	probeChunkSnapshot,
	type ChunkReadProbeResult,
} from "./sot-chunk-read-probe";

export type SoTRenderPipelineContext = {
	getDerivedRootEl: () => HTMLElement | null;
	getDerivedContentEl: () => HTMLElement | null;
	getSotEditor: () => SoTEditor | null;
	getPluginSettings: () => TategakiV2Settings;
	getHideFrontmatter: () => boolean;
	getWritingMode: () => WritingMode;
	isSelectionActive?: () => boolean;
	getSelectionHintLines?: () => number[];
	resyncSelection?: () => void;
	parseFrontmatter: (doc: string) => { frontmatter: FrontmatterData | null };
	setFrontmatterDetected: (value: boolean) => void;
	computeLineRangesFromLines: (lines: string[]) => LineRange[];
	setLineRanges: (ranges: LineRange[]) => void;
	getLineRanges: () => LineRange[];
	recomputeLineBlockKinds: (lines: string[]) => void;
	renderFrontmatter: (
		data: FrontmatterData,
		settings: TategakiV2Settings
	) => HTMLElement | null;
	applyFrontmatterWritingMode: (
		element: HTMLElement,
		mode: WritingMode
	) => void;
	renderLine: (lineEl: HTMLElement, range: LineRange, index: number) => void;
	renderLineLight: (
		lineEl: HTMLElement,
		range: LineRange,
		index: number
	) => void;
	captureScrollAnchor?: () => SoTScrollAnchor | null;
	resetPendingRenderState: () => void;
	finalizeRender: (
		scrollTop: number,
		scrollLeft: number,
		scrollAnchor: SoTScrollAnchor | null,
	) => void;
	/** PR5.5: heading-hidden行を仮想化対象から除外するための判定 */
	isLineHidden?: (index: number) => boolean;
	/** PR5.5b: 折りたたみ見出しがあるか（近似経路の抑制に使用） */
	hasCollapsedHeadings?: () => boolean;
	/** PR6c1: chunk snapshot の read-only 参照（描画切替には未使用） */
	getChunkSnapshot?: () => ChunkControllerSnapshot;
};

export class SoTRenderPipeline {
	private context: SoTRenderPipelineContext;
	private renderTimer: number | null = null;
	private renderChunkRaf: number | null = null;
	private renderGeneration = 0;
	private virtualObserver: IntersectionObserver | null = null;
	private virtualEnabled = false;
	private virtualInitialEnd = -1;
	private virtualQueue: Array<{ index: number; element: HTMLElement }> = [];
	private virtualQueued = new Set<number>();
	private virtualQueueRaf: number | null = null;
	private virtualizeRaf: number | null = null;
	private virtualizeIndex = 0;
	private lastVirtualizeAt = 0;
	private lastSelectionResyncAt = 0;
	private preciseScanTimer: number | null = null;
	private preciseScanRaf: number | null = null;
	private scrollingActive = false;
	private scrollHoldTimer: number | null = null;
	private resumeAfterScrollRaf: number | null = null;
	private selectionScrollRaf: number | null = null;
	private lastChunkProbe: ChunkReadProbeResult | null = null;
	private chunkedExtentHoldClearRaf: number | null = null;

	constructor(context: SoTRenderPipelineContext) {
		this.context = context;
	}

	isVirtualizedRenderEnabled(): boolean {
		return this.virtualEnabled;
	}

	resumeVirtualUpdates(): void {
		if (!this.virtualEnabled) return;
		if (this.isSelectionActive()) return;
		if (this.virtualQueue.length > 0) {
			this.scheduleVirtualQueue();
		}
		this.onScrollSettled();
	}

	dispose(): void {
		this.cancelScheduledRender();
		this.cancelChunkedRender();
		this.cancelVirtualQueue();
		this.cancelVirtualize();
		this.cancelPreciseScan();
		this.cancelScrollHold();
		this.cancelSelectionScrollRender();
		this.disconnectVirtualObserver();
	}

	cancelScheduledRender(): void {
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
	}

	private cancelScrollHold(): void {
		if (this.scrollHoldTimer !== null) {
			window.clearTimeout(this.scrollHoldTimer);
			this.scrollHoldTimer = null;
		}
		if (this.resumeAfterScrollRaf !== null) {
			window.cancelAnimationFrame(this.resumeAfterScrollRaf);
			this.resumeAfterScrollRaf = null;
		}
		this.scrollingActive = false;
	}

	private cancelSelectionScrollRender(): void {
		if (this.selectionScrollRaf !== null) {
			window.cancelAnimationFrame(this.selectionScrollRaf);
			this.selectionScrollRaf = null;
		}
	}

	private cancelPreciseScan(): void {
		if (this.preciseScanTimer !== null) {
			window.clearTimeout(this.preciseScanTimer);
			this.preciseScanTimer = null;
		}
		if (this.preciseScanRaf !== null) {
			window.cancelAnimationFrame(this.preciseScanRaf);
			this.preciseScanRaf = null;
		}
	}

	private isSelectionActive(): boolean {
		return this.context.isSelectionActive?.() ?? false;
	}

	/** PR5.5b: 折りたたみ見出しがあり等間隔近似が不正確になるか */
	private hasCollapsedHeadings(): boolean {
		return this.context.hasCollapsedHeadings?.() ?? false;
	}

	notifyScrollActivity(isLargeScroll: boolean): void {
		if (!this.virtualEnabled) return;
		if (this.isSelectionActive()) {
			this.scheduleSelectionScrollRender();
		}
		this.cancelPreciseScan();
		const now = performance.now();
		if (now - this.lastVirtualizeAt > 120) {
			this.lastVirtualizeAt = now;
			this.scheduleVirtualizeDistantLines(true);
		}
		if (!isLargeScroll) return;
		this.scrollingActive = true;
		if (this.scrollHoldTimer !== null) {
			window.clearTimeout(this.scrollHoldTimer);
		}
		this.scrollHoldTimer = window.setTimeout(() => {
			this.scrollHoldTimer = null;
			this.scrollingActive = false;
			this.scheduleResumeAfterScroll();
		}, 140);
	}

	private scheduleSelectionScrollRender(): void {
		if (this.selectionScrollRaf !== null) return;
		this.selectionScrollRaf = window.requestAnimationFrame(() => {
			this.selectionScrollRaf = null;
			this.renderVisibleVirtualLinesImmediate(true, {
				maxLines: 16,
				budgetMs: 4,
			});
		});
	}

	scheduleRender(force = false): void {
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		const sotEditor = this.context.getSotEditor();
		if (!rootEl || !contentEl || !sotEditor) return;
		if (this.renderTimer !== null) {
			if (!force) return;
			window.clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			this.renderNow();
		}, 0);
	}

	renderNow(): void {
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		const sotEditor = this.context.getSotEditor();
		if (!rootEl || !contentEl || !sotEditor) return;
		this.clearChunkedExtentHold(contentEl);
		const generation = this.renderGeneration + 1;
		this.renderGeneration = generation;
		this.cancelChunkedRender();
		this.cancelVirtualQueue();
		this.cancelVirtualize();

		const scrollTop = rootEl.scrollTop;
		const scrollLeft = rootEl.scrollLeft;
		const scrollAnchor = this.context.captureScrollAnchor?.() ?? null;

		const doc = sotEditor.getDoc();
		const lines = doc.split("\n");
		const frontmatterInfo = this.context.parseFrontmatter(doc);
		this.context.setFrontmatterDetected(!!frontmatterInfo.frontmatter);
		const lineRanges = this.context.computeLineRangesFromLines(lines);
		this.context.setLineRanges(lineRanges);
		const chunkSnapshot = this.context.getChunkSnapshot?.();
		this.lastChunkProbe = chunkSnapshot
			? probeChunkSnapshot(chunkSnapshot, lineRanges.length)
			: null;
		this.context.recomputeLineBlockKinds(lines);
		this.virtualEnabled = this.shouldUseVirtualizedRender(
			lineRanges.length,
			doc.length
		);
		this.resetVirtualQueue();
		this.setupVirtualObserver(rootEl);
		this.virtualInitialEnd = this.virtualEnabled
			? this.getInitialFullRenderEnd(rootEl, lineRanges)
			: -1;

		if (this.shouldUseChunkedRender(lineRanges.length, doc.length)) {
			this.renderChunked(
				generation,
				frontmatterInfo.frontmatter ?? null,
				scrollTop,
				scrollLeft,
				scrollAnchor,
			);
			return;
		}

		const fragment = document.createDocumentFragment();
		const settings = this.context.getPluginSettings();
		const hideFrontmatter = this.context.getHideFrontmatter();
		const writingMode = this.context.getWritingMode();
		if (frontmatterInfo.frontmatter && !hideFrontmatter) {
			const frontmatterEl = this.context.renderFrontmatter(
				frontmatterInfo.frontmatter,
				settings
			);
			if (frontmatterEl) {
				this.context.applyFrontmatterWritingMode(
					frontmatterEl,
					writingMode
				);
				fragment.appendChild(frontmatterEl);
			}
		}
		const collapsedGapsByStart = this.buildCollapsedGapMap(lineRanges);
		for (let i = 0; i < lineRanges.length; ) {
			i = this.appendRenderedEntry(
				fragment,
				lineRanges,
				i,
				collapsedGapsByStart,
			);
		}
		contentEl.replaceChildren(fragment);
		this.context.resetPendingRenderState();
		this.context.finalizeRender(scrollTop, scrollLeft, scrollAnchor);
	}

	private shouldUseChunkedRender(
		lineCount: number,
		docLength: number
	): boolean {
		return lineCount >= 800 || docLength >= 120_000;
	}

	getLastChunkProbe(): ChunkReadProbeResult | null {
		return this.lastChunkProbe;
	}

	private shouldUseVirtualizedRender(
		lineCount: number,
		docLength: number
	): boolean {
		return lineCount >= 1200 || docLength >= 160_000;
	}

	private setupVirtualObserver(rootEl: HTMLElement): void {
		if (!this.virtualEnabled) {
			this.disconnectVirtualObserver();
			return;
		}
		this.disconnectVirtualObserver();
		this.virtualObserver = new IntersectionObserver(
			(entries) => {
				if (this.isSelectionActive()) return;
				if (this.scrollingActive) return;
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const target = entry.target as HTMLElement;
					if (target.dataset.virtual !== "1") {
						this.virtualObserver?.unobserve(target);
						continue;
					}
					const index = Number.parseInt(
						target.dataset.line ?? "",
						10
					);
					if (!Number.isFinite(index)) {
						this.virtualObserver?.unobserve(target);
						continue;
					}
					const ranges = this.context.getLineRanges();
					const range = ranges[index];
					if (!range) {
						this.virtualObserver?.unobserve(target);
						continue;
					}
					this.enqueueVirtualLine(target);
				}
			},
			{ root: rootEl, rootMargin: "200px" }
		);
	}

	private disconnectVirtualObserver(): void {
		if (this.virtualObserver) {
			this.virtualObserver.disconnect();
			this.virtualObserver = null;
		}
	}

	private getInitialFullRenderEnd(
		rootEl: HTMLElement,
		lineRanges: LineRange[]
	): number {
		const totalLines = lineRanges.length;
		if (totalLines === 0) return -1;
		const computed = window.getComputedStyle(rootEl);
		const fontSize = Number.parseFloat(computed.fontSize) || 16;
		const lineHeight =
			Number.parseFloat(computed.lineHeight) || fontSize * 1.8;
		const isVertical = computed.writingMode !== "horizontal-tb";
		const viewportExtent = isVertical
			? rootEl.clientWidth
			: rootEl.clientHeight;
		const approxLine = Math.max(lineHeight, fontSize);
		const visibleCount = Math.ceil(viewportExtent / approxLine);
		const buffer = 80;
		const visibleLineBudget = visibleCount + buffer + 1;
		const isLineHidden = this.context.isLineHidden;
		if (!isLineHidden) {
			const end = Math.min(totalLines - 1, visibleLineBudget - 1);
			return Math.max(0, end);
		}
		const end = resolveVisibleLineIndexAfterBudget({
			lineRanges,
			isLineHidden,
			visibleLineBudget,
		});
		if (end >= 0) return end;
		return Math.max(0, Math.min(totalLines - 1, visibleLineBudget - 1));
	}

	private buildCollapsedGapMap(
		lineRanges: LineRange[],
	): Map<number, CollapsedGapRange> {
		const isLineHidden = this.context.isLineHidden;
		if (!isLineHidden) return new Map();
		return new Map(
			buildCollapsedGapRanges({
				lineRanges,
				isLineHidden,
			}).map((range) => [range.startLine, range]),
		);
	}

	private appendRenderedEntry(
		fragment: DocumentFragment,
		lineRanges: LineRange[],
		index: number,
		collapsedGapsByStart: ReadonlyMap<number, CollapsedGapRange>,
	): number {
		const gap = collapsedGapsByStart.get(index);
		if (gap) {
			fragment.appendChild(createCollapsedGapElement(gap));
			return gap.endLine + 1;
		}

		const range = lineRanges[index];
		if (!range) return index + 1;

		const lineEl = document.createElement("div");
		lineEl.className = "tategaki-sot-line";
		lineEl.dataset.from = String(range.from);
		lineEl.dataset.to = String(range.to);
		lineEl.dataset.line = String(index);
		this.renderLineWithVirtualization(lineEl, range, index);
		fragment.appendChild(lineEl);
		return index + 1;
	}

	private renderLineWithVirtualization(
		lineEl: HTMLElement,
		range: LineRange,
		index: number
	): void {
		if (!this.virtualEnabled || index <= this.virtualInitialEnd) {
			this.context.renderLine(lineEl, range, index);
			return;
		}
		this.context.renderLineLight(lineEl, range, index);
		if (this.virtualObserver) {
			this.virtualObserver.observe(lineEl);
		}
	}

	private enqueueVirtualLine(lineEl: HTMLElement): void {
		const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
		if (!Number.isFinite(index)) return;
		if (this.virtualQueued.has(index)) return;
		this.virtualQueued.add(index);
		this.virtualQueue.push({ index, element: lineEl });
		this.scheduleVirtualQueue();
	}

	private scheduleVirtualQueue(): void {
		if (this.isSelectionActive()) return;
		if (this.virtualQueueRaf !== null) return;
		this.virtualQueueRaf = window.requestAnimationFrame(() => {
			this.virtualQueueRaf = null;
			this.flushVirtualQueue();
		});
	}

	private scheduleVirtualizeDistantLines(
		allowDuringSelection = false
	): void {
		if (!this.virtualEnabled) return;
		if (!allowDuringSelection && this.isSelectionActive()) return;
		if (this.virtualizeRaf !== null) return;
		this.virtualizeRaf = window.requestAnimationFrame(() => {
			this.virtualizeRaf = null;
			this.virtualizeDistantLines(allowDuringSelection);
		});
	}

	private virtualizeDistantLines(allowDuringSelection = false): void {
		if (!this.virtualEnabled) return;
		if (!allowDuringSelection && this.isSelectionActive()) return;
		// PR5.5b: 折りたたみ時は等間隔近似が不正確なため遠方light化を停止
		if (this.hasCollapsedHeadings()) return;
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		if (!rootEl || !contentEl) return;
		const lineRanges = this.context.getLineRanges();
		const total = lineRanges.length;
		if (total === 0) return;

		const visible = this.getApproxVisibleLineRange(rootEl, total);
		const buffer = total >= 8000 ? 120 : 200;
		const safeStart = Math.max(0, visible.start - buffer);
		const safeEnd = Math.min(total - 1, visible.end + buffer);
		const hintLines = this.context.getSelectionHintLines?.() ?? [];
		const hintBuffer = total >= 8000 ? 4 : 8;
		const isHintProtected = (index: number): boolean =>
			hintLines.some(
				(line) =>
					Number.isFinite(line) &&
					Math.abs(index - line) <= hintBuffer
			);
		const offset = this.getLineElementOffset(contentEl);
		const children = contentEl.children;
		const startTime = performance.now();
		const budgetMs = 8;

		if (this.virtualizeIndex >= total) {
			this.virtualizeIndex = 0;
		}

		for (
			;
			this.virtualizeIndex < total &&
			performance.now() - startTime < budgetMs;
			this.virtualizeIndex += 1
		) {
			if (
				(this.virtualizeIndex >= safeStart &&
					this.virtualizeIndex <= safeEnd) ||
				isHintProtected(this.virtualizeIndex)
			) {
				continue;
			}
			const element = children[
				this.virtualizeIndex + offset
			] as HTMLElement | null;
			if (!element || !element.isConnected) continue;
			if (element.dataset.virtual === "1") continue;
			// PR5.5: hidden行（heading-hidden等）は仮想化対象外
			if (this.context.isLineHidden?.(this.virtualizeIndex)) continue;
			const range = lineRanges[this.virtualizeIndex];
			if (!range) continue;
			this.context.renderLineLight(
				element,
				range,
				this.virtualizeIndex
			);
			if (this.virtualObserver) {
				this.virtualObserver.observe(element);
			}
		}

		if (this.virtualizeIndex < total) {
			this.scheduleVirtualizeDistantLines(allowDuringSelection);
			return;
		}
		this.virtualizeIndex = 0;
	}

	private getLineElementOffset(contentEl: HTMLElement): number {
		const first = contentEl.firstElementChild;
		return first?.classList.contains("tategaki-frontmatter") ? 1 : 0;
	}

	private schedulePreciseScan(): void {
		if (this.isSelectionActive()) return;
		if (this.preciseScanTimer !== null || this.preciseScanRaf !== null) {
			return;
		}
		this.preciseScanTimer = window.setTimeout(() => {
			this.preciseScanTimer = null;
			this.preciseScanRaf = window.requestAnimationFrame(() => {
				this.preciseScanRaf = null;
				this.runPreciseScan();
			});
		}, 80);
	}

	private runPreciseScan(): void {
		if (this.isSelectionActive()) return;
		if (this.scrollingActive) return;
		const hasMore = this.renderVisibleVirtualLinesPrecise({
			maxLines: 40,
			budgetMs: 8,
		});
		if (hasMore) {
			this.schedulePreciseScan();
		}
	}

	private renderVisibleVirtualLinesPrecise(options: {
		maxLines?: number;
		budgetMs?: number;
	}): boolean {
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		if (!rootEl || !contentEl) return false;
		const rootRect = rootEl.getBoundingClientRect();
		const lineRanges = this.context.getLineRanges();
		const virtualLines = contentEl.querySelectorAll<HTMLElement>(
			".tategaki-sot-line-virtual[data-virtual=\"1\"]"
		);
		const visibleLines: HTMLElement[] = [];
		for (const lineEl of Array.from(virtualLines)) {
			if (!lineEl.isConnected) continue;
			const rect = lineEl.getBoundingClientRect();
			const visible =
				rect.bottom >= rootRect.top &&
				rect.top <= rootRect.bottom &&
				rect.right >= rootRect.left &&
				rect.left <= rootRect.right;
			if (visible) {
				visibleLines.push(lineEl);
			}
		}

		const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
		const maxLines = options.maxLines ?? Number.POSITIVE_INFINITY;
		const startTime = performance.now();
		let rendered = 0;

		for (const lineEl of visibleLines) {
			if (!lineEl.isConnected) continue;
			if (lineEl.dataset.virtual !== "1") continue;
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			if (!Number.isFinite(index)) continue;
			const range = lineRanges[index];
			if (!range) continue;
			this.virtualQueued.delete(index);
			const queueIdx = this.virtualQueue.findIndex(
				(q) => q.index === index
			);
			if (queueIdx !== -1) {
				this.virtualQueue.splice(queueIdx, 1);
			}
			if (this.virtualObserver) {
				this.virtualObserver.unobserve(lineEl);
			}
			lineEl.removeAttribute("data-virtual");
			lineEl.classList.remove("tategaki-sot-line-virtual");
			this.context.renderLine(lineEl, range, index);
			rendered += 1;
			if (rendered >= maxLines) break;
			if (performance.now() - startTime >= budgetMs) break;
		}

		if (rendered >= maxLines || performance.now() - startTime >= budgetMs) {
			return true;
		}
		for (const lineEl of visibleLines) {
			if (!lineEl.isConnected) continue;
			if (lineEl.dataset.virtual === "1") return true;
		}
		return false;
	}

	private getApproxVisibleLineRange(
		rootEl: HTMLElement,
		totalLines: number
	): { start: number; end: number } {
		const computed = window.getComputedStyle(rootEl);
		const fontSize = Number.parseFloat(computed.fontSize) || 16;
		const lineHeight =
			Number.parseFloat(computed.lineHeight) || fontSize * 1.8;
		const extent = Math.max(lineHeight, fontSize);
		const isVertical = computed.writingMode !== "horizontal-tb";
		const viewport = isVertical ? rootEl.clientWidth : rootEl.clientHeight;
		let scrollPos = isVertical ? rootEl.scrollLeft : rootEl.scrollTop;
		if (isVertical && scrollPos < 0) {
			scrollPos = -scrollPos;
		}
		const firstVisible = Math.floor(Math.max(0, scrollPos) / extent);
		const visibleCount = Math.ceil(viewport / extent);
		const start = Math.max(0, Math.min(totalLines - 1, firstVisible));
		const end = Math.max(
			start,
			Math.min(totalLines - 1, firstVisible + visibleCount)
		);
		return { start, end };
	}

	private flushVirtualQueue(): void {
		if (this.isSelectionActive()) return;
		if (this.scrollingActive) return;
		const start = performance.now();
		const budgetMs = 10;
		const lineRanges = this.context.getLineRanges();
		while (
			this.virtualQueue.length > 0 &&
			performance.now() - start < budgetMs
		) {
			const job = this.virtualQueue.shift()!;
			this.virtualQueued.delete(job.index);
			const element = job.element;
			// 監視を解除（重複レンダリング防止）
			if (this.virtualObserver) {
				this.virtualObserver.unobserve(element);
			}
			if (!element.isConnected) continue;
			if (element.dataset.virtual !== "1") continue;
			const range = lineRanges[job.index];
			if (!range) continue;
			element.removeAttribute("data-virtual");
			element.classList.remove("tategaki-sot-line-virtual");
			this.context.renderLine(element, range, job.index);
		}
		if (this.virtualQueue.length > 0) {
			this.scheduleVirtualQueue();
		}
	}

	private resetVirtualQueue(): void {
		this.virtualQueue = [];
		this.virtualQueued.clear();
	}

	private cancelVirtualQueue(): void {
		if (this.virtualQueueRaf !== null) {
			window.cancelAnimationFrame(this.virtualQueueRaf);
			this.virtualQueueRaf = null;
		}
		this.resetVirtualQueue();
	}

	private cancelVirtualize(): void {
		if (this.virtualizeRaf !== null) {
			window.cancelAnimationFrame(this.virtualizeRaf);
			this.virtualizeRaf = null;
		}
		this.virtualizeIndex = 0;
	}

	private scheduleResumeAfterScroll(
		allowDuringSelection = false,
		options: { maxLines?: number; budgetMs?: number } = {}
	): void {
		if (!allowDuringSelection && this.isSelectionActive()) return;
		if (this.resumeAfterScrollRaf !== null) return;
		this.resumeAfterScrollRaf = window.requestAnimationFrame(() => {
			this.resumeAfterScrollRaf = null;
			const hasMore = this.renderVisibleVirtualLinesImmediate(
				allowDuringSelection,
				options
			);
			this.scheduleVirtualQueue();
			this.scheduleVirtualizeDistantLines();
			if (hasMore) {
				this.scheduleResumeAfterScroll(allowDuringSelection, options);
			}
		});
	}

	onScrollSettled(): void {
		if (!this.virtualEnabled) return;
		if (this.scrollingActive) return;
		if (this.isSelectionActive()) {
			this.scheduleResumeAfterScroll(true, {
				maxLines: 120,
				budgetMs: 12,
			});
			return;
		}
		// 停止直後に viewport 内の仮想行を同期で先行復帰（初回1回のみ）
		this.renderVisibleVirtualLinesPrecise({
			maxLines: 80,
			budgetMs: 10,
		});
		// PR5.5b: 折りたたみ時は近似ベースの復帰をスキップし精密スキャンのみ
		if (this.hasCollapsedHeadings()) {
			this.schedulePreciseScan();
			return;
		}
		this.scheduleResumeAfterScroll();
		this.schedulePreciseScan();
	}

	private renderVisibleVirtualLinesImmediate(
		allowDuringSelection = false,
		options: { maxLines?: number; budgetMs?: number } = {}
	): boolean {
		if (!allowDuringSelection && this.isSelectionActive()) return false;
		// PR5.5b: 折りたたみ時は近似ベースではなく精密スキャンに委譲
		if (this.hasCollapsedHeadings()) {
			return this.renderVisibleVirtualLinesPrecise({
				maxLines: options.maxLines ?? 40,
				budgetMs: options.budgetMs ?? 8,
			});
		}
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		if (!rootEl || !contentEl) return false;
		const lineRanges = this.context.getLineRanges();
		const total = lineRanges.length;
		if (total === 0) return false;
		const approx = this.getApproxVisibleLineRange(rootEl, total);
		const buffer = total >= 8000 ? 8 : 12;
		const start = Math.max(0, approx.start - buffer);
		const end = Math.min(total - 1, approx.end + buffer);
		const offset = this.getLineElementOffset(contentEl);
		const children = contentEl.children;

		const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
		const maxLines = options.maxLines ?? Number.POSITIVE_INFINITY;
		const startTime = performance.now();
		let rendered = 0;

		// ビューポート内（推定）の仮想行を即座にレンダリング
		for (let i = start; i <= end; i += 1) {
			const lineEl = children[i + offset] as HTMLElement | null;
			if (!lineEl || !lineEl.isConnected) continue;
			if (lineEl.dataset.virtual !== "1") continue;
			const range = lineRanges[i];
			if (!range) continue;
			// キューから削除
			this.virtualQueued.delete(i);
			const queueIdx = this.virtualQueue.findIndex(
				(q) => q.index === i
			);
			if (queueIdx !== -1) {
				this.virtualQueue.splice(queueIdx, 1);
			}
			// 監視を解除
			if (this.virtualObserver) {
				this.virtualObserver.unobserve(lineEl);
			}
			lineEl.removeAttribute("data-virtual");
			lineEl.classList.remove("tategaki-sot-line-virtual");
			this.context.renderLine(lineEl, range, i);
			rendered += 1;
			if (rendered >= maxLines) break;
			if (performance.now() - startTime >= budgetMs) break;
		}

		if (allowDuringSelection && this.isSelectionActive() && rendered > 0) {
			const now = performance.now();
			if (now - this.lastSelectionResyncAt > 120) {
				this.lastSelectionResyncAt = now;
				this.context.resyncSelection?.();
			}
		}

		// まだ残っている可視仮想行があるかチェック
		if (rendered >= maxLines || performance.now() - startTime >= budgetMs) {
			return true;
		}
		for (let i = start; i <= end; i += 1) {
			const lineEl = children[i + offset] as HTMLElement | null;
			if (!lineEl || !lineEl.isConnected) continue;
			if (lineEl.dataset.virtual === "1") return true;
		}
		return false;
	}

	private cancelChunkedRender(): void {
		if (this.renderChunkRaf !== null) {
			window.cancelAnimationFrame(this.renderChunkRaf);
			this.renderChunkRaf = null;
		}
		if (this.chunkedExtentHoldClearRaf !== null) {
			window.cancelAnimationFrame(this.chunkedExtentHoldClearRaf);
			this.chunkedExtentHoldClearRaf = null;
		}
	}

	private clearChunkedExtentHold(contentEl: HTMLElement): void {
		contentEl.style.minWidth = "";
		contentEl.style.minHeight = "";
	}

	private applyChunkedExtentHold(
		rootEl: HTMLElement,
		contentEl: HTMLElement,
	): void {
		const minWidth = Math.max(contentEl.scrollWidth, rootEl.clientWidth);
		const minHeight = Math.max(contentEl.scrollHeight, rootEl.clientHeight);
		contentEl.style.minWidth = `${Math.ceil(minWidth)}px`;
		contentEl.style.minHeight = `${Math.ceil(minHeight)}px`;
	}

	private renderChunked(
		generation: number,
		frontmatter: FrontmatterData | null,
		scrollTop: number,
		scrollLeft: number,
		scrollAnchor: SoTScrollAnchor | null,
	): void {
		const rootEl = this.context.getDerivedRootEl();
		const contentEl = this.context.getDerivedContentEl();
		if (!rootEl || !contentEl) return;
		this.cancelChunkedRender();
		this.applyChunkedExtentHold(rootEl, contentEl);
		contentEl.replaceChildren();
		const settings = this.context.getPluginSettings();
		const hideFrontmatter = this.context.getHideFrontmatter();
		const writingMode = this.context.getWritingMode();
		if (frontmatter && !hideFrontmatter) {
			const frontmatterEl = this.context.renderFrontmatter(
				frontmatter,
				settings
			);
			if (frontmatterEl) {
				this.context.applyFrontmatterWritingMode(
					frontmatterEl,
					writingMode
				);
				contentEl.appendChild(frontmatterEl);
			}
		}
		this.context.resetPendingRenderState();

		const lineRanges = this.context.getLineRanges();
		const total = lineRanges.length;
		const collapsedGapsByStart = this.buildCollapsedGapMap(lineRanges);
		let index = 0;
		const budgetMs = 12;

		const step = () => {
			if (generation !== this.renderGeneration) {
				this.renderChunkRaf = null;
				return;
			}
			const nextRoot = this.context.getDerivedRootEl();
			const nextContent = this.context.getDerivedContentEl();
			if (!nextRoot || !nextContent) {
				this.renderChunkRaf = null;
				return;
			}
			const startTime = performance.now();
			const fragment = document.createDocumentFragment();
			while (index < total && performance.now() - startTime < budgetMs) {
				index = this.appendRenderedEntry(
					fragment,
					lineRanges,
					index,
					collapsedGapsByStart,
				);
			}
			nextContent.appendChild(fragment);
			if (index < total) {
				this.renderChunkRaf = window.requestAnimationFrame(step);
				return;
			}
			this.renderChunkRaf = null;
			this.context.finalizeRender(scrollTop, scrollLeft, scrollAnchor);
			if (this.chunkedExtentHoldClearRaf !== null) {
				window.cancelAnimationFrame(this.chunkedExtentHoldClearRaf);
			}
			this.chunkedExtentHoldClearRaf = window.requestAnimationFrame(() => {
				this.chunkedExtentHoldClearRaf = null;
				if (generation !== this.renderGeneration) return;
				this.clearChunkedExtentHold(nextContent);
			});
		};

		this.renderChunkRaf = window.requestAnimationFrame(step);
	}
}
