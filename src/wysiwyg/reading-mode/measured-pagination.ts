/**
 * 実測ページネーション
 * paged.js のような、DOM要素を実際に配置してサイズを測定する方式
 */

import {
	BlockSegment,
	PaginationState,
	PageInfo,
	MeasuredPaginationOptions,
	CONTINUATION_BLOCK_TAGS,
	PROHIBITED_LINE_START_CHARS,
	PROHIBITED_LINE_END_CHARS,
} from "./measured-pagination-types";

export class MeasuredPagination {
	private options: MeasuredPaginationOptions;
	private cancelled = false;

	constructor(options: MeasuredPaginationOptions) {
		this.options = options;
	}

	/**
	 * キャンセル
	 */
	cancel(): void {
		this.cancelled = true;
	}

	/**
	 * ページネーション実行
	 */
	async paginate(): Promise<PageInfo[]> {
		this.cancelled = false;
		const timeBudgetMs = this.options.timeSliceMs ?? 12;
		const slice = { start: this.getNow() };
		const doc = this.options.container?.ownerDocument;
		if (!doc) {
			return [];
		}

		// コンテンツをパース
		const tempDiv = doc.createElement("div");
		tempDiv.innerHTML = this.options.contentHtml;

		// テキストノードを収集
		const textNodes = this.collectTextNodes(tempDiv, doc);
		const prefixLengths = this.buildPrefixLengths(textNodes);
		const textNodeRanges = this.buildTextNodeRanges(
			textNodes,
			prefixLengths
		);
		const totalLength =
			prefixLengths.length > 0 ? prefixLengths[prefixLengths.length - 1] : 0;


		if (totalLength === 0) {
			return [];
		}

		// ブロックセグメントを作成
		const blockSegments = this.createBlockSegments(
			tempDiv,
			this.options.writingMode,
			doc
		);

		// ページネーション状態を初期化
		const state: PaginationState = {
			host: tempDiv,
			textNodes,
			prefixLengths,
			textNodeRanges,
			blockSegments,
			startIndex: 0,
			totalLength,
			pageCount: 0,
			cumulativeChars: 0,
			lastCharCount: 0,
			writingMode: this.options.writingMode,
		};

		const pages: PageInfo[] = [];
		let iteration = 0;
		const maxIterations = 10000; // 無限ループ防止

		// ページを順次生成
		while (state.startIndex < state.totalLength && iteration < maxIterations) {
			if (this.cancelled) {
				break;
			}

			const pageInfo = await this.computeNextPagePrecise(
				state,
				slice,
				timeBudgetMs
			);
			if (!pageInfo) {
				break;
			}

			pages.push(pageInfo);
			if (this.options.onPage) {
				this.options.onPage(pageInfo);
			}


			// 進捗通知
			if (this.options.onProgress) {
				this.options.onProgress(state.startIndex, state.totalLength);
			}

			await this.maybeYield(slice, timeBudgetMs);
			if (this.cancelled) {
				break;
			}

			iteration++;
		}

		return pages;
	}

	private getNow(): number {
		const perf =
			this.options.container.ownerDocument.defaultView?.performance;
		return perf?.now() ?? Date.now();
	}

	private async yieldToMain(): Promise<void> {
		const win = this.options.container.ownerDocument.defaultView;
		if (win && typeof win.requestAnimationFrame === "function") {
			await new Promise<void>((resolve) => {
				win.requestAnimationFrame(() => resolve());
			});
			return;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	private async maybeYield(
		slice: { start: number },
		timeBudgetMs: number
	): Promise<void> {
		if (!Number.isFinite(timeBudgetMs) || timeBudgetMs <= 0) {
			return;
		}
		if (this.getNow() - slice.start < timeBudgetMs) {
			return;
		}
		await this.yieldToMain();
		slice.start = this.getNow();
	}

	/**
	 * ブロックセグメントを作成
	 */
	private createBlockSegments(
		container: HTMLElement,
		writingMode: string,
		doc: Document
	): BlockSegment[] {
		const isVertical = writingMode === "vertical-rl" || writingMode === "vertical-lr";
		const nodeFilter = doc.defaultView?.NodeFilter ?? NodeFilter;
		const walker = doc.createTreeWalker(
			container,
			nodeFilter.SHOW_TEXT,
			null
		);

		const segmentsMap = new Map<HTMLElement, { start: number; end: number; charCount: number }>();
		let globalIndex = 0;
		let node: Node | null;

		while ((node = walker.nextNode())) {
			const text = node.textContent;
			if (!text) continue;

			const block = this.findPaginationBlockAncestor(node, container);
			if (!block) continue;

			const len = text.length;
			const startIndex = globalIndex;
			const endIndex = globalIndex + len;
			globalIndex = endIndex;

			if (segmentsMap.has(block)) {
				const existing = segmentsMap.get(block)!;
				existing.end = endIndex;
				existing.charCount += len;
			} else {
				segmentsMap.set(block, {
					start: startIndex,
					end: endIndex,
					charCount: len,
				});
			}
		}

		const segments: BlockSegment[] = [];
		segmentsMap.forEach((range, block) => {
			const axisSize = this.measureBlockAxisSize(block, isVertical);
			segments.push({
				block,
				startIndex: range.start,
				endIndex: range.end,
				charCount: Math.max(1, range.charCount),
				axisSize: axisSize > 0 ? axisSize : 0,
			});
		});

		segments.sort((a, b) => a.startIndex - b.startIndex);
		return segments;
	}

	/**
	 * ブロック要素の祖先を探す
	 */
	private findPaginationBlockAncestor(node: Node, host: HTMLElement): HTMLElement | null {
		let current: HTMLElement | null =
			node instanceof HTMLElement ? node : node.parentElement;

		while (current && current !== host) {
			if (this.isPaginationBlockElement(current)) {
				return current;
			}
			current = current.parentElement;
		}

		return host;
	}

	/**
	 * ページネーション対象のブロック要素か判定
	 */
	private isPaginationBlockElement(el: HTMLElement): boolean {
		return CONTINUATION_BLOCK_TAGS.has(el.tagName);
	}

	/**
	 * ブロック要素の軸方向サイズを測定
	 */
	private measureBlockAxisSize(block: HTMLElement, isVertical: boolean): number {
		try {
			const range = document.createRange();
			range.selectNodeContents(block);
			const rect = range.getBoundingClientRect();
			const primary = isVertical ? rect.width : rect.height;

			if (primary > 0) {
				return primary;
			}

			// フォールバック
			const fallback = block.getBoundingClientRect();
			const fallbackPrimary = isVertical ? fallback.width : fallback.height;

			if (fallbackPrimary > 0) {
				return fallbackPrimary;
			}
			} catch (error) {
				// Range/measure failures fall back to 0.
			}

		return 0;
	}

	/**
	 * 次のページを正確に計算（古い実装を使用）
	 */
	private async computeNextPagePrecise(
		state: PaginationState,
		slice: { start: number },
		timeBudgetMs: number
	): Promise<PageInfo | null> {
		// キャンセルチェック
		if (this.cancelled) {
			return null;
		}

		if (state.startIndex >= state.totalLength) {
			return null;
		}

		const tempPage = this.createEmptyPage();
		const wrapper = tempPage.querySelector(
			".page-content"
		) as HTMLElement | null;
		if (!wrapper) {
			tempPage.remove();
			return null;
		}

		wrapper.style.whiteSpace = "normal";
		wrapper.style.visibility = "hidden";

		const remaining = state.totalLength - state.startIndex;
		const previousSize = state.lastCharCount;
		const averageSize =
			state.pageCount > 0
				? Math.ceil(state.cumulativeChars / state.pageCount)
				: 0;
		let heuristicSize = Math.max(previousSize, averageSize);
		if (heuristicSize <= 0) {
			heuristicSize = Math.min(remaining, 1800);
		}
		const pageAxisLimit = this.getPageAxisLimit(wrapper, state.writingMode);
		const blockEstimate = this.estimateCharsForNextPage(
			state,
			pageAxisLimit
		);
		if (blockEstimate > 0) {
			heuristicSize = Math.max(1, Math.min(remaining, blockEstimate));
		}
		let low = 1;
		let high: number;
		if (blockEstimate > 0) {
			const margin = Math.max(64, Math.floor(heuristicSize * 0.25));
			high = Math.min(remaining, heuristicSize + margin);
			if (high < 1) {
				high = Math.max(1, heuristicSize + margin);
			}
		} else {
			const minHigh = Math.max(512, Math.floor(heuristicSize * 1.1));
			const cappedHigh = Math.min(
				remaining,
				Math.max(minHigh, heuristicSize + 512)
			);
			low = Math.max(
				1,
				Math.min(Math.floor(heuristicSize * 0.5), cappedHigh)
			);
			high = cappedHigh;
		}
		if (high < low) {
			high = Math.max(low, Math.min(remaining, low + 256));
		}
		let best = 0;

		// 二分探索
		while (low <= high) {
			// キャンセルチェック
			if (this.cancelled) {
				tempPage.remove();
				return null;
			}

			await this.maybeYield(slice, timeBudgetMs);
			if (this.cancelled) {
				tempPage.remove();
				return null;
			}

			const mid = Math.floor((low + high) / 2);
			wrapper.innerHTML = "";
			const frag = this.cloneFragmentByCharRange(
				state.textNodes,
				state.prefixLengths,
				state.startIndex,
				mid
			);
			wrapper.appendChild(frag);
			this.pruneTrailingWhitespaceNodes(wrapper);
			wrapper.offsetHeight;
			const overflow = this.isOverflow(tempPage, state.writingMode);
			if (!overflow) {
				best = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}

		// 段階的最適化
		let take = Math.max(1, best);
		let step = Math.max(
			1,
			Math.floor(Math.max(heuristicSize, take) * 0.12)
		);
		while (state.startIndex + take < state.totalLength) {
			// キャンセルチェック
			if (this.cancelled) {
				tempPage.remove();
				return null;
			}

			await this.maybeYield(slice, timeBudgetMs);
			if (this.cancelled) {
				tempPage.remove();
				return null;
			}

			const nextProbe = Math.min(
				remaining,
				Math.min(state.totalLength - state.startIndex, take + step)
			);
			if (nextProbe <= take) break;
			wrapper.innerHTML = "";
			const testFrag = this.cloneFragmentByCharRange(
				state.textNodes,
				state.prefixLengths,
				state.startIndex,
				nextProbe
			);
			wrapper.appendChild(testFrag);
			this.pruneTrailingWhitespaceNodes(wrapper);
			wrapper.offsetHeight;
			if (!this.isOverflow(tempPage, state.writingMode)) {
				take = nextProbe;
				step = Math.max(1, Math.floor(step * 1.5));
				if (take >= remaining) break;
			} else {
				if (step === 1) break;
				step = Math.max(1, Math.floor(step / 2));
			}
		}

		// 最終調整
		let finalTake = Math.max(1, Math.min(take, remaining));
		let sanityGuard = 0;
		const SANITY_LIMIT = 32;
		while (sanityGuard < SANITY_LIMIT) {
			// キャンセルチェック
			if (this.cancelled) {
				tempPage.remove();
				return null;
			}

			await this.maybeYield(slice, timeBudgetMs);
			if (this.cancelled) {
				tempPage.remove();
				return null;
			}

			wrapper.innerHTML = "";
			const finalFrag = this.cloneFragmentByCharRange(
				state.textNodes,
				state.prefixLengths,
				state.startIndex,
				finalTake
			);
			wrapper.appendChild(finalFrag);
			this.pruneTrailingWhitespaceNodes(wrapper);
			wrapper.offsetHeight;
			if (
				!this.isOverflow(tempPage, state.writingMode) ||
				finalTake <= 1
			) {
				break;
			}
			finalTake = Math.max(1, finalTake - 1);
			sanityGuard++;
		}

		const maxTake = finalTake;

		// 禁則処理
		finalTake = this.adjustBreakForKinsoku(
			state,
			tempPage,
			wrapper,
			finalTake
		);
		finalTake = this.adjustBreakForRuby(state, tempPage, wrapper, finalTake);
		finalTake = this.adjustBreakForKinsoku(
			state,
			tempPage,
			wrapper,
			finalTake
		);
		if (finalTake < maxTake) {
			wrapper.innerHTML = "";
			const probeFrag = this.cloneFragmentByCharRange(
				state.textNodes,
				state.prefixLengths,
				state.startIndex,
				finalTake
			);
			wrapper.appendChild(probeFrag);
			this.pruneTrailingWhitespaceNodes(wrapper);
			wrapper.offsetHeight;
			const lastBlock = this.findLastLeafBlock(wrapper);
			const ratio =
				lastBlock && this.isPageContinuation(state, state.startIndex + finalTake)
					? this.getLastLineInlineRatio(lastBlock, state.writingMode)
					: null;
			if (ratio !== null && ratio < 0.7) {
				finalTake = maxTake;
			}
		}

		// 最終的なコンテンツを設定
		wrapper.innerHTML = "";
		const finalFrag = this.cloneFragmentByCharRange(
			state.textNodes,
			state.prefixLengths,
			state.startIndex,
			finalTake
		);
		wrapper.appendChild(finalFrag);
		this.pruneTrailingWhitespaceNodes(wrapper);

		// visibilityを元に戻す
		wrapper.style.visibility = "";

		const pageEndIndex = state.startIndex + finalTake;
		const isContinuation = this.isPageContinuation(state, pageEndIndex);
		if (isContinuation) {
			tempPage.setAttribute("data-continued", "true");
			const block = this.markContinuationBlock(wrapper);
			if (block) {
				this.markShortLastLineIfNeeded(block, state.writingMode);
			}
		} else {
			tempPage.removeAttribute("data-continued");
		}

		const pageInfo: PageInfo = {
			element: tempPage,
			startIndex: state.startIndex,
			endIndex: state.startIndex + finalTake,
			charCount: finalTake,
		};

		state.startIndex += finalTake;
		state.pageCount += 1;
		state.cumulativeChars += finalTake;
		state.lastCharCount = finalTake;

		return pageInfo;
	}

	private markContinuationBlock(wrapper: HTMLElement): HTMLElement | null {
		const block = this.findLastLeafBlock(wrapper);
		if (block) {
			block.classList.add("tategaki-continued-block");
		}
		return block;
	}

	private findLastLeafBlock(wrapper: HTMLElement): HTMLElement | null {
		const blockSelector = "p, li, blockquote, h1, h2, h3, h4, h5, h6, div";
		const blocks = Array.from(
			wrapper.querySelectorAll<HTMLElement>(blockSelector)
		);
		for (let i = blocks.length - 1; i >= 0; i--) {
			const block = blocks[i];
			if (block.querySelector(blockSelector)) {
				continue;
			}
			return block;
		}
		return null;
	}

	private markShortLastLineIfNeeded(
		block: HTMLElement,
		writingMode: string
	): void {
		const ratio = this.getLastLineInlineRatio(block, writingMode);
		if (ratio === null) {
			block.classList.remove("tategaki-continued-block-short-last");
			return;
		}
		if (ratio < 0.7) {
			block.classList.add("tategaki-continued-block-short-last");
		} else {
			block.classList.remove("tategaki-continued-block-short-last");
		}
	}

	private getLastLineInlineRatio(
		block: HTMLElement,
		writingMode: string
	): number | null {
		const isVertical =
			writingMode === "vertical-rl" || writingMode === "vertical-lr";
		const doc = block.ownerDocument;
		const range = doc.createRange();
		const previousAlign = block.style.textAlignLast;
		block.style.textAlignLast = "start";
		block.offsetWidth; // force layout
		range.selectNodeContents(block);
		const rects = Array.from(range.getClientRects()).filter(
			(rect) => rect.width > 0 && rect.height > 0
		);
		const lastRect = rects.length > 0 ? rects[rects.length - 1] : null;
		const blockRect = block.getBoundingClientRect();
		block.style.textAlignLast = previousAlign;
		if (!lastRect) {
			return null;
		}
		const inlineSize = isVertical ? lastRect.height : lastRect.width;
		const blockInline = isVertical ? blockRect.height : blockRect.width;
		if (!Number.isFinite(blockInline) || blockInline <= 0) {
			return null;
		}
		return inlineSize / blockInline;
	}

	private isPageContinuation(
		state: PaginationState,
		pageEndIndex: number
	): boolean {
		if (pageEndIndex >= state.totalLength) {
			return false;
		}
		const lastIndex = Math.max(state.startIndex, pageEndIndex - 1);
		const segment = this.findContainingBlockSegment(
			state.blockSegments,
			lastIndex
		);
		if (!segment) {
			return false;
		}
		return pageEndIndex < segment.endIndex;
	}

	private findContainingBlockSegment(
		segments: BlockSegment[],
		index: number
	): BlockSegment | null {
		for (const segment of segments) {
			if (segment.startIndex <= index && index < segment.endIndex) {
				return segment;
			}
		}
		return null;
	}

	/**
	 * ページの軸方向制限を取得
	 */
	private getPageAxisLimit(wrapper: HTMLElement, writingMode: string): number {
		const isVertical = writingMode === "vertical-rl" || writingMode === "vertical-lr";
		wrapper.offsetWidth; // レイアウトを安定させる
		const limit = isVertical ? wrapper.clientWidth : wrapper.clientHeight;
		return Math.max(1, limit);
	}

	/**
	 * 次のページに入る文字数を推定
	 */
	private estimateCharsForNextPage(state: PaginationState, pageAxisLimit: number): number {
		if (!Number.isFinite(pageAxisLimit) || pageAxisLimit <= 0) {
			return 0;
		}

		if (state.blockSegments.length === 0) {
			return 0;
		}

		const remaining = Math.max(0, state.totalLength - state.startIndex);
		if (remaining === 0) {
			return 0;
		}

		const segments = state.blockSegments;
		let cursor = state.startIndex;
		let axisBudget = pageAxisLimit;
		let estimatedChars = 0;
		let index = this.findFirstBlockSegmentIndex(segments, cursor);

		while (
			index < segments.length &&
			axisBudget > 0 &&
			cursor < state.totalLength &&
			estimatedChars < remaining
		) {
			const segment = segments[index];

			if (segment.endIndex <= cursor) {
				index++;
				continue;
			}

			const segmentRemaining = segment.endIndex - Math.max(segment.startIndex, cursor);

			if (segmentRemaining <= 0) {
				index++;
				continue;
			}

			const safeAxis = segment.axisSize > 0 ? segment.axisSize : pageAxisLimit;
			const perChar = safeAxis / Math.max(1, segment.charCount);
			const effectivePerChar = perChar > 0 ? perChar : pageAxisLimit / Math.max(segment.charCount, 1);

			if (effectivePerChar <= 0) {
				const take = Math.min(segmentRemaining, Math.max(1, Math.floor(axisBudget)));
				estimatedChars += take;
				cursor += take;
				axisBudget -= take * (pageAxisLimit / Math.max(remaining, 1));
				index++;
				continue;
			}

			const segmentAxis = effectivePerChar * segmentRemaining;

			if (segmentAxis <= axisBudget * 1.05) {
				estimatedChars += segmentRemaining;
				cursor += segmentRemaining;
				axisBudget -= segmentAxis;
				index++;
				continue;
			}

			const capacity = Math.floor(axisBudget / effectivePerChar);

			if (capacity <= 0) {
				break;
			}

			const take = Math.max(1, Math.min(segmentRemaining, capacity));
			estimatedChars += take;
			cursor += take;
			axisBudget -= take * effectivePerChar;
			break;
		}

		return Math.min(estimatedChars, remaining);
	}

	/**
	 * 開始インデックス以降の最初のブロックセグメントを探す
	 */
	private findFirstBlockSegmentIndex(segments: BlockSegment[], startIndex: number): number {
		for (let i = 0; i < segments.length; i++) {
			if (segments[i].endIndex > startIndex) {
				return i;
			}
		}
		return segments.length;
	}

	/**
	 * 空のページ要素を作成
	 */
	private createEmptyPage(): HTMLElement {
		const container = this.options.container;
		if (!container) {
			throw new Error("MeasuredPagination container is missing");
		}
		const doc = container.ownerDocument;
		const page = doc.createElement("div");
		page.className = "tategaki-page";
		// data-writing-mode 属性を設定して、styles.css のセレクタが機能するようにする
		page.setAttribute("data-writing-mode", this.options.writingMode);

		const wrapper = doc.createElement("div");
		wrapper.className = "page-content";

		page.appendChild(wrapper);
		container.appendChild(page);

		return page;
	}

	/**
	 * テキストノードを収集
	 */
	private collectTextNodes(root: Node, doc: Document): Text[] {
		const result: Text[] = [];
		const nodeFilter = doc.defaultView?.NodeFilter ?? NodeFilter;
		const walker = doc.createTreeWalker(
			root,
			nodeFilter.SHOW_TEXT,
			null
		);
		let n: Node | null = walker.nextNode();
		while (n) {
			if (
				n.nodeType === Node.TEXT_NODE &&
				n.nodeValue &&
				n.nodeValue.length
			) {
				const textNode = n as Text;
				if (this.isRubyAnnotationText(textNode)) {
					n = walker.nextNode();
					continue;
				}
				result.push(n as Text);
			}
			n = walker.nextNode();
		}
		return result;
	}

	private isRubyAnnotationText(node: Text): boolean {
		let current = node.parentElement;
		while (current) {
			const tag = current.tagName;
			if (tag === "RT" || tag === "RP") {
				return true;
			}
			if (current.classList.contains("tategaki-aozora-ruby-rt")) {
				return true;
			}
			current = current.parentElement;
		}
		return false;
	}

	/**
	 * テキストノードの累積長さ配列を構築
	 */
	private buildPrefixLengths(textNodes: Text[]): number[] {
		const prefixes: number[] = [];
		let cumulative = 0;
		for (const node of textNodes) {
			const len = node.nodeValue ? node.nodeValue.length : 0;
			cumulative += len;
			prefixes.push(cumulative);
		}
		return prefixes;
	}

	private buildTextNodeRanges(
		textNodes: Text[],
		prefixes: number[]
	): Map<Text, { start: number; end: number }> {
		const map = new Map<Text, { start: number; end: number }>();
		let prevTotal = 0;
		for (let i = 0; i < textNodes.length; i += 1) {
			const node = textNodes[i];
			const end = prefixes[i] ?? prevTotal;
			map.set(node, { start: prevTotal, end });
			prevTotal = end;
		}
		return map;
	}

	/**
	 * 文字インデックスからテキストノードとオフセットへマッピング
	 */
	private mapCharIndex(
		textNodes: Text[],
		prefixes: number[],
		index: number
	): { node: Text; offset: number } {
		if (textNodes.length === 0) {
			throw new Error("mapCharIndex called with empty textNodes");
		}

		const target = Math.max(0, index);
		let low = 0;
		let high = prefixes.length - 1;
		while (low <= high) {
			const mid = (low + high) >>> 1;
			const prefix = prefixes[mid];
			if (target < prefix) {
				high = mid - 1;
			} else {
				low = mid + 1;
			}
		}
		const idx = Math.min(low, textNodes.length - 1);
		const prevTotal = idx > 0 ? prefixes[idx - 1] : 0;
		const node = textNodes[idx];
		const nodeLength = node.nodeValue ? node.nodeValue.length : 0;
		const rawOffset = target - prevTotal;
		const offset = Math.max(0, Math.min(nodeLength, rawOffset));
		return { node, offset };
	}

	/**
	 * 文字範囲からDocumentFragmentをクローン（HTML要素を保持）
	 */
	private cloneFragmentByCharRange(
		textNodes: Text[],
		prefixes: number[],
		startIndex: number,
		length: number
	): DocumentFragment {
		const doc =
			textNodes[0]?.ownerDocument ?? this.options.container.ownerDocument;
		const range = doc.createRange();
		const startPos = this.mapCharIndex(textNodes, prefixes, startIndex);
		const endPos = this.mapCharIndex(
			textNodes,
			prefixes,
			startIndex + Math.max(1, length)
		);
		range.setStart(startPos.node, startPos.offset);
		range.setEnd(endPos.node, endPos.offset);
		return range.cloneContents();
	}

	/**
	 * ページがオーバーフローしているか判定
	 */
	private isOverflow(pageEl: HTMLElement, writingMode: string): boolean {
		const wrapper = pageEl.querySelector(".page-content") as HTMLElement;
		if (!wrapper) return false;

		const isVertical = writingMode === "vertical-rl" || writingMode === "vertical-lr";

		if (isVertical) {
			const overflow = wrapper.scrollWidth - wrapper.clientWidth;
			if (overflow <= 0) {
				return false;
			}
			if (this.isRubyOnlyOverflow(wrapper, writingMode)) {
				return false;
			}
			if (this.allowRubyOverhang(wrapper, writingMode, overflow)) {
				return false;
			}
			return true;
		} else {
			const overflow = wrapper.scrollHeight - wrapper.clientHeight;
			if (overflow <= 0) {
				return false;
			}
			if (this.isRubyOnlyOverflow(wrapper, writingMode)) {
				return false;
			}
			if (this.allowRubyOverhang(wrapper, writingMode, overflow)) {
				return false;
			}
			return true;
		}
	}

	private isRubyOnlyOverflow(
		wrapper: HTMLElement,
		writingMode: string
	): boolean {
		if (!this.wrapperHasRuby(wrapper)) {
			return false;
		}
		const isVertical = writingMode === "vertical-rl" || writingMode === "vertical-lr";
		const overflowWithoutRuby = this.withRubySuppressed(
			wrapper,
			() => {
				wrapper.offsetWidth;
				return isVertical
					? wrapper.scrollWidth - wrapper.clientWidth
					: wrapper.scrollHeight - wrapper.clientHeight;
			}
		);
		return overflowWithoutRuby <= 0;
	}

	private wrapperHasRuby(wrapper: HTMLElement): boolean {
		return (
			!!wrapper.querySelector("ruby") ||
			!!wrapper.querySelector(".tategaki-aozora-ruby") ||
			!!wrapper.querySelector(".tategaki-aozora-ruby-rt")
		);
	}

	private withRubySuppressed<T>(
		wrapper: HTMLElement,
		fn: () => T
	): T {
		const className = "tategaki-pagination-ignore-ruby";
		const had = wrapper.classList.contains(className);
		if (!had) {
			wrapper.classList.add(className);
		}
		try {
			return fn();
		} finally {
			if (!had) {
				wrapper.classList.remove(className);
			}
		}
	}

	private allowRubyOverhang(
		wrapper: HTMLElement,
		writingMode: string,
		overflow: number
	): boolean {
		if (overflow <= 0) return false;
		if (!this.wrapperHasRuby(wrapper)) return false;
		const allowance = this.getRubyOverhangAllowancePx(wrapper, writingMode);
		return allowance > 0 && overflow <= allowance;
	}

	private getRubyOverhangAllowancePx(
		wrapper: HTMLElement,
		writingMode: string
	): number {
		const view = wrapper.ownerDocument.defaultView;
		if (!view) return 0;
		const style = view.getComputedStyle(wrapper);
		const fontSize = Number.parseFloat(style.fontSize);
		if (!Number.isFinite(fontSize) || fontSize <= 0) {
			return 0;
		}
		const rubyScaleRaw = Number.parseFloat(
			style.getPropertyValue("--tategaki-ruby-size")
		);
		const rubyScale = Number.isFinite(rubyScaleRaw) ? rubyScaleRaw : 0.5;
		const gapVar =
			writingMode === "vertical-rl" || writingMode === "vertical-lr"
				? "--tategaki-ruby-gap-vertical"
				: "--tategaki-ruby-gap-horizontal";
		const gapRaw = Number.parseFloat(style.getPropertyValue(gapVar));
		const gapEm = Number.isFinite(gapRaw) ? gapRaw : 0;
		const allowanceEm = Math.min(1.2, Math.max(0.2, rubyScale + gapEm));
		return fontSize * allowanceEm;
	}

	/**
	 * 末尾の空白ノードを削除
	 */
	private pruneTrailingWhitespaceNodes(wrapper: HTMLElement): void {
		let last = wrapper.lastChild;
		while (last) {
			if (last.nodeType === Node.TEXT_NODE) {
				const text = last as Text;
				const val = text.nodeValue ?? "";
				if (/^\s*$/.test(val)) {
					const prev = last.previousSibling;
					wrapper.removeChild(last);
					last = prev;
					continue;
				}
			}
			break;
		}
	}

	/**
	 * 禁則処理
	 */
	private adjustBreakForKinsoku(
		state: PaginationState,
		pageEl: HTMLElement,
		wrapper: HTMLElement,
		finalTake: number
	): number {
		if (finalTake <= 1) return finalTake;
		if (state.startIndex + finalTake >= state.totalLength) return finalTake;

		// 次の文字をチェック
		const nextCharPos = this.mapCharIndex(
			state.textNodes,
			state.prefixLengths,
			state.startIndex + finalTake
		);
		const nextChar = nextCharPos.node.nodeValue?.[nextCharPos.offset] ?? "";

		if (PROHIBITED_LINE_START_CHARS.has(nextChar)) {
			// 行頭禁則文字なら、このページに含める
			let adjusted = finalTake;
			const maxAdjust = Math.min(10, state.totalLength - state.startIndex - finalTake);
			let included = false;

			for (let i = 1; i <= maxAdjust; i++) {
				adjusted = finalTake + i;
				wrapper.innerHTML = "";
				const frag = this.cloneFragmentByCharRange(
					state.textNodes,
					state.prefixLengths,
					state.startIndex,
					adjusted
				);
				wrapper.appendChild(frag);
				this.pruneTrailingWhitespaceNodes(wrapper);
				wrapper.offsetHeight;

				if (this.isOverflow(pageEl, state.writingMode)) {
					break;
				}

				const nextPos = this.mapCharIndex(
					state.textNodes,
					state.prefixLengths,
					state.startIndex + adjusted
				);
				const nextC = nextPos.node.nodeValue?.[nextPos.offset] ?? "";
				if (!PROHIBITED_LINE_START_CHARS.has(nextC)) {
					included = true;
					finalTake = adjusted;
					break;
				}
			}

			// 入り切らない場合は、次ページの先頭が禁則文字にならないように後ろを切り捨てる
			if (!included) {
				const maxBackoff = Math.min(80, finalTake - 1);
				for (let i = 1; i <= maxBackoff; i++) {
					const candidate = finalTake - i;
					const candidatePos = this.mapCharIndex(
						state.textNodes,
						state.prefixLengths,
						state.startIndex + candidate
					);
					const candidateChar =
						candidatePos.node.nodeValue?.[candidatePos.offset] ?? "";
					if (!PROHIBITED_LINE_START_CHARS.has(candidateChar)) {
						finalTake = Math.max(1, candidate);
						break;
					}
				}
			}
		}

		// 現在の最後の文字をチェック
		if (finalTake > 0) {
			const lastCharPos = this.mapCharIndex(
				state.textNodes,
				state.prefixLengths,
				state.startIndex + finalTake - 1
			);
			const lastChar = lastCharPos.node.nodeValue?.[lastCharPos.offset] ?? "";

			if (PROHIBITED_LINE_END_CHARS.has(lastChar)) {
				// 行末禁則文字なら、次のページに回す
				return Math.max(1, finalTake - 1);
			}
		}

		return finalTake;
	}

	private adjustBreakForRuby(
		state: PaginationState,
		pageEl: HTMLElement,
		wrapper: HTMLElement,
		finalTake: number
	): number {
		if (finalTake <= 1) return finalTake;
		if (state.startIndex + finalTake >= state.totalLength) return finalTake;

		const boundary = this.mapCharIndex(
			state.textNodes,
			state.prefixLengths,
			state.startIndex + finalTake
		);
		const ruby = this.findRubyAncestor(boundary.node, state.host);
		if (!ruby) return finalTake;

		const range = this.getElementTextRange(
			ruby,
			state.textNodeRanges
		);
		if (!range) return finalTake;

		const rubyStart = range.start;
		const rubyEnd = range.end;
		const breakIndex = state.startIndex + finalTake;
		if (breakIndex <= rubyStart || breakIndex >= rubyEnd) {
			return finalTake;
		}

		const includeRuby = rubyEnd - state.startIndex;
		if (includeRuby > finalTake) {
			wrapper.innerHTML = "";
			const frag = this.cloneFragmentByCharRange(
				state.textNodes,
				state.prefixLengths,
				state.startIndex,
				includeRuby
			);
			wrapper.appendChild(frag);
			this.pruneTrailingWhitespaceNodes(wrapper);
			wrapper.offsetHeight;
			if (!this.isOverflow(pageEl, state.writingMode)) {
				return includeRuby;
			}
		}

		const beforeRuby = rubyStart - state.startIndex;
		if (beforeRuby >= 1) {
			return Math.min(finalTake, beforeRuby);
		}
		return finalTake;
	}

	private findRubyAncestor(node: Node, host: HTMLElement): HTMLElement | null {
		let current: HTMLElement | null =
			node instanceof HTMLElement ? node : node.parentElement;
		while (current && current !== host) {
			if (
				current.tagName === "RUBY" ||
				current.classList.contains("tategaki-aozora-ruby")
			) {
				return current;
			}
			current = current.parentElement;
		}
		return null;
	}

	private getElementTextRange(
		element: HTMLElement,
		ranges: Map<Text, { start: number; end: number }>
	): { start: number; end: number } | null {
		const doc = element.ownerDocument;
		if (!doc) return null;
		const nodeFilter = doc.defaultView?.NodeFilter ?? NodeFilter;
		const walker = doc.createTreeWalker(
			element,
			nodeFilter.SHOW_TEXT,
			null
		);
		let start = Number.POSITIVE_INFINITY;
		let end = Number.NEGATIVE_INFINITY;
		let node: Node | null = walker.nextNode();
		while (node) {
			if (node.nodeType === Node.TEXT_NODE) {
				const range = ranges.get(node as Text);
				if (range) {
					start = Math.min(start, range.start);
					end = Math.max(end, range.end);
				}
			}
			node = walker.nextNode();
		}
		if (!Number.isFinite(start) || !Number.isFinite(end)) {
			return null;
		}
		return { start, end };
	}
}
