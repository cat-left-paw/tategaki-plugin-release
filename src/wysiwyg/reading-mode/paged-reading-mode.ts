import type {
	CommonSettings,
	WritingMode,
	PreviewSettings,
	HeaderFooterContent,
} from "../../types/settings";
import { MeasuredPagination } from "./measured-pagination";
import type { PageInfo as MeasuredPageInfo } from "./measured-pagination-types";
import { debugLog, debugWarn } from "../../shared/logger";

export interface PagedReadingModeOptions {
	container: HTMLElement;
	contentHtml: string;
	writingMode: WritingMode;
	settings: CommonSettings;
	previewSettings?: PreviewSettings;
	title?: string;
	onPageChange?: (info: PageChangeInfo) => void;
	onPageAdded?: (page: HTMLElement, pageIndex: number) => void;
	onRepaginationRequired?: () => void;
	onRendered?: (info: { pages: HTMLElement[] }) => void;
}

export interface PageChangeInfo {
	currentPage: number;
	totalPages: number;
	progress: number;
}

// 縦スクロール方式のユーティリティ関数
export function calculatePageStridePx(
	viewportHeight: number,
	pageGapPx: number
): number {
	return Math.max(1, viewportHeight + pageGapPx);
}

export function calculatePagedMaxScrollY(
	scrollHeight: number,
	viewportHeight: number
): number {
	return Math.max(0, scrollHeight - viewportHeight);
}

export function calculatePagedPageCount(
	scrollHeight: number,
	viewportHeight: number,
	pageGapPx: number
): number {
	const safeViewportHeight = Math.max(1, viewportHeight);
	const stride = calculatePageStridePx(safeViewportHeight, pageGapPx);
	return Math.max(1, Math.ceil(scrollHeight / stride));
}

export function calculatePagedScrollTop(
	pageIndex: number,
	viewportHeight: number,
	pageGapPx: number
): number {
	const safePageIndex = Math.max(0, Math.floor(pageIndex));
	const safeViewportHeight = Math.max(1, viewportHeight);
	const stride = calculatePageStridePx(safeViewportHeight, pageGapPx);
	return safePageIndex * stride;
}

/**
 * 縦スクロール方式のページ風ビュー
 * - CSS カラムを使わず、連続した縦書きテキストを縦スクロールで表示
 * - "ページ"は viewport 高さ単位の概念的な区切り
 * - ページ送りは scrollTop = pageIndex * (viewportHeight + gap) で制御
 * - 総ページ数は scrollHeight / viewportHeight から概算
 */
export class PagedReadingMode {
	private container: HTMLElement;
	private contentHtml: string;
	private writingMode: WritingMode;
	private settings: CommonSettings;
	private previewSettings: PreviewSettings;
	private title: string;
	private onPageChange?: (info: PageChangeInfo) => void;
	private onPageAdded?: (page: HTMLElement, pageIndex: number) => void;
	private onRepaginationRequired?: () => void;
	private onRendered?: (info: { pages: HTMLElement[] }) => void;

	private styleEl: HTMLStyleElement | null = null;
	private viewportEl: HTMLElement | null = null;
	private pagesContainerEl: HTMLElement | null = null;
	private pageElements: HTMLElement[] = [];
	private headerEl: HTMLDivElement | null = null;
	private footerEl: HTMLDivElement | null = null;
	private headerMaskEl: HTMLDivElement | null = null;
	private footerMaskEl: HTMLDivElement | null = null;

	private pageCount = 0;
	private pageIndex = 0;
	private pendingPageIndex: number | null = null;
	private renderToken = 0;
	private destroyed = false;
	private isRendering = false;
	private hasRenderedOnce = false;
	private paginationInProgress = false;
	private transitionTimeouts: Array<ReturnType<typeof setTimeout>> = [];
	private pendingRender = false;
	private lastViewportSize: { width: number; height: number } | null = null;
	private pendingViewportSize: { width: number; height: number } | null =
		null;
	private activePagination: MeasuredPagination | null = null;
	private debugLayout = true;
	private lastLayoutMetrics: {
		width: number;
		height: number;
		paddingTop: number;
		paddingBottom: number;
		paddingLeft: number;
		paddingRight: number;
		columnGap: number;
		columnWidth: number;
		linePitch: number;
		snappedLineHeight: number;
	} | null = null;
	private lastLineMetrics: {
		fontSizePx: number;
		lineHeightPx: number;
		usedProbe: boolean;
		snappedLineHeight: number;
	} | null = null;
	private layoutLinePitchPx: number | null = null;

	private resizeObserver: ResizeObserver | null = null;
	private resizeTimeout: number | null = null;
	private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
	private wheelHandler: ((e: WheelEvent) => void) | null = null;
	private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
	private pointerUpHandler: ((e: PointerEvent) => void) | null = null;
	private pointerCancelHandler: ((e: PointerEvent) => void) | null = null;
	private pointerStartX: number | null = null;
	private pointerStartY: number | null = null;
	private pointerStartTime = 0;

	constructor(options: PagedReadingModeOptions) {
		this.container = options.container;
		this.contentHtml = options.contentHtml;
		this.writingMode = options.writingMode;
		this.settings = options.settings;
		this.previewSettings = options.previewSettings ?? {
			syncCursor: true,
			updateInterval: 300,
			headerContent: "none",
			headerAlign: "center",
			footerContent: "pageNumber",
			footerAlign: "center",
			pageNumberFormat: "currentTotal",
		};
		this.title = options.title ?? "";
		this.onPageChange = options.onPageChange;
		this.onPageAdded = options.onPageAdded;
		this.onRepaginationRequired = options.onRepaginationRequired;
		this.onRendered = options.onRendered;

		this.initialize();
	}

	destroy(): void {
		this.destroyed = true;
		this.renderToken += 1;
		this.removeInputHandlers();
		if (this.resizeTimeout !== null) {
			const view = this.container.ownerDocument.defaultView ?? window;
			view.clearTimeout(this.resizeTimeout);
			this.resizeTimeout = null;
		}
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.activePagination?.cancel();
		this.activePagination = null;

		this.styleEl?.remove();
		this.styleEl = null;
		this.pageElements.forEach((page) => page.remove());
		this.pageElements = [];
		this.pagesContainerEl?.remove();
		this.pagesContainerEl = null;
		this.headerEl?.remove();
		this.headerEl = null;
		this.footerEl?.remove();
		this.footerEl = null;
		this.headerMaskEl?.remove();
		this.headerMaskEl = null;
		this.footerMaskEl?.remove();
		this.footerMaskEl = null;
		this.viewportEl?.remove();
		this.viewportEl = null;
		this.pageCount = 0;
		this.pageIndex = 0;
	}

	getProgress(): number {
		if (this.pageCount <= 1) {
			return 0;
		}
		return this.pageIndex / (this.pageCount - 1);
	}

	repaginate(): void {
		if (this.destroyed) {
			return;
		}
		void this.render();
	}

	jumpToProgress(progress: number): void {
		if (this.pageCount <= 1) {
			return;
		}
		const clamped = Math.max(0, Math.min(1, progress));
		const index = Math.round(clamped * (this.pageCount - 1));
		this.goToPage(index, false);
	}

	scrollToPage(index: number, smooth = true): void {
		this.goToPage(index, smooth);
	}

	private initialize(): void {
		this.container.classList.add("tategaki-reading-paged-container");
		if (!this.container.hasAttribute("tabindex")) {
			this.container.tabIndex = -1;
		}
		this.container.style.setProperty(
			"--tategaki-writing-mode",
			this.writingMode
		);
		this.container.style.setProperty(
			"--tategaki-font-family",
			this.settings.fontFamily
		);
		this.container.style.setProperty(
			"--tategaki-font-size",
			`${this.settings.fontSize}px`
		);
		this.container.style.setProperty(
			"--tategaki-line-height",
			this.settings.lineHeight.toString()
		);
		this.container.style.setProperty(
			"--tategaki-letter-spacing",
			`${this.settings.letterSpacing}em`
		);
		this.container.style.setProperty(
			"--tategaki-text-color",
			this.settings.textColor
		);
		this.container.style.setProperty(
			"--tategaki-background-color",
			this.settings.backgroundColor
		);
		this.container.style.setProperty(
			"--tategaki-page-background-color",
			this.settings.pageBackgroundColor
		);
		this.container.style.setProperty(
			"--tategaki-ruby-size",
			this.settings.rubySize.toString()
		);
		this.container.style.setProperty(
			"--ruby-size",
			this.settings.rubySize.toString()
		);
		this.container.style.setProperty(
			"--tategaki-ruby-gap-vertical",
			`${this.settings.rubyVerticalGap}em`
		);
		this.container.style.setProperty(
			"--tategaki-ruby-gap-horizontal",
			`${this.settings.rubyHorizontalGap}em`
		);
		const headingFont =
			this.settings.headingFontFamily || this.settings.fontFamily;
		const headingColor =
			this.settings.headingTextColor || this.settings.textColor;
		this.container.style.setProperty(
			"--tategaki-heading-font-family",
			headingFont
		);
		this.container.style.setProperty(
			"--tategaki-heading-text-color",
			headingColor
		);

		const doc = this.container.ownerDocument;
		this.styleEl = doc.createElement("style");
		this.styleEl.setAttribute("data-tategaki-reading-paged", "true");
		doc.head.appendChild(this.styleEl);

		this.viewportEl = doc.createElement("div");
		this.viewportEl.className = "tategaki-reading-paged-viewport";

		this.pagesContainerEl = doc.createElement("div");
		this.pagesContainerEl.className =
			"tategaki-reading-paged-pages-container";

		this.viewportEl.appendChild(this.pagesContainerEl);
		this.container.appendChild(this.viewportEl);

		this.updatePaginationLayoutClasses();
		this.ensureFixedHeaderFooterElements();
		this.setupInputHandlers();
		try {
			this.container.focus();
		} catch (_) {}
		this.setupResizeObserver();
		void this.render();
	}

	private setupResizeObserver(): void {
		const view = this.container.ownerDocument.defaultView;
		if (!this.container || !view?.ResizeObserver) {
			return;
		}
		this.resizeObserver = new view.ResizeObserver(() => {
			if (this.resizeTimeout !== null) {
				view.clearTimeout(this.resizeTimeout);
			}
			this.resizeTimeout = view.setTimeout(() => {
				if (!this.destroyed && this.viewportEl) {
					// モーダルが開いている場合はリサイズによる再計算をスキップ
					// （モーダル表示時の微小なサイズ変動を無視する）
					if (this.isOverlayOpen()) {
						return;
					}
					const currentSize = this.getViewportSize();
					if (
						this.lastViewportSize &&
						this.lastViewportSize.width === currentSize.width &&
						this.lastViewportSize.height === currentSize.height
					) {
						return;
					}
					if (this.onRepaginationRequired && this.hasRenderedOnce) {
						this.onRepaginationRequired();
						return;
					}
					if (this.isRendering) {
						this.pendingRender = true;
						this.pendingViewportSize = currentSize;
						return;
					}

					const gap = this.getPageGapPx();
					if (this.writingMode === "vertical-rl") {
						const oldScrollLeft = this.viewportEl.scrollLeft;
						const oldViewportWidth = this.viewportEl.clientWidth;
						if (oldViewportWidth > 0) {
							const maxScroll = Math.max(
								0,
								this.viewportEl.scrollWidth - oldViewportWidth
							);
							this.pageIndex = Math.round(
								(maxScroll - oldScrollLeft) /
									(oldViewportWidth + gap)
							);
						}
					} else {
						const oldScrollTop = this.viewportEl.scrollTop;
						const oldViewportHeight = this.viewportEl.clientHeight;
						if (oldViewportHeight > 0) {
							this.pageIndex = Math.round(
								oldScrollTop / (oldViewportHeight + gap)
							);
						}
					}

					void this.render();
				}
			}, 50);
		});
		this.resizeObserver.observe(this.container);
	}

	private setupInputHandlers(): void {
		this.removeInputHandlers();
		this.keydownHandler = (e: KeyboardEvent) => {
			// このコンテナにフォーカスがない場合は処理しない
			if (!this.isEventTargetWithinContainer(e.target)) {
				return;
			}
			// オーバーレイ（モーダル等）が開いている場合は処理しない
			if (this.isOverlayOpen()) {
				return;
			}
			// このコンテナがアクティブなリーフに含まれていない場合は処理しない
			if (!this.isContainerInActiveLeaf()) {
				return;
			}
			if (e.key === "PageUp") {
				e.preventDefault();
				this.previousPage();
				return;
			}
			if (e.key === "PageDown") {
				e.preventDefault();
				this.nextPage();
				return;
			}
			if (e.key === "Home") {
				e.preventDefault();
				this.goToFirstPage();
				return;
			}
			if (this.writingMode === "vertical-rl") {
				if (e.key === "ArrowLeft") {
					e.preventDefault();
					this.nextPage();
					return;
				}
				if (e.key === "ArrowRight") {
					e.preventDefault();
					this.previousPage();
					return;
				}
			} else {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					this.nextPage();
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					this.previousPage();
					return;
				}
			}
		};

		this.wheelHandler = (e: WheelEvent) => {
			if (e.defaultPrevented) {
				return;
			}
			// イベントがこのコンテナ内で発生したかチェック
			if (!this.isEventTargetWithinContainer(e.target)) {
				return;
			}
			// オーバーレイ（モーダル等）が開いている場合は処理しない
			if (this.isOverlayOpen()) {
				return;
			}
			// このコンテナがアクティブなリーフに含まれていない場合は処理しない
			if (!this.isContainerInActiveLeaf()) {
				return;
			}
			// スクロール可能な子要素（設定パネルなど）内でのホイールは無視
			if (this.isWithinScrollableElement(e.target as Element)) {
				return;
			}
			const delta =
				Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
			if (delta === 0) {
				return;
			}
			e.preventDefault();
			if (delta > 0) {
				this.nextPage();
			} else {
				this.previousPage();
			}
		};

		this.pointerDownHandler = (e: PointerEvent) => {
			try {
				this.container.focus();
			} catch (_) {}
			if (
				e.pointerType &&
				e.pointerType !== "touch" &&
				e.pointerType !== "pen"
			) {
				return;
			}
			this.pointerStartX = e.clientX;
			this.pointerStartY = e.clientY;
			this.pointerStartTime = Date.now();
		};

		this.pointerUpHandler = (e: PointerEvent) => {
			if (this.pointerStartX === null || this.pointerStartY === null) {
				return;
			}
			const deltaX = e.clientX - this.pointerStartX;
			const deltaY = e.clientY - this.pointerStartY;
			const elapsed = Date.now() - this.pointerStartTime;
			this.pointerStartX = null;
			this.pointerStartY = null;
			this.pointerStartTime = 0;

			const absX = Math.abs(deltaX);
			const absY = Math.abs(deltaY);
			const tapThreshold = 12;
			const swipeThreshold = 40;
			const isTap =
				absX <= tapThreshold && absY <= tapThreshold && elapsed <= 400;

			if (isTap) {
				const rect = this.container.getBoundingClientRect();
				const midX = rect.left + rect.width / 2;
				if (e.clientX < midX) {
					this.nextPage();
				} else {
					this.previousPage();
				}
				return;
			}

			const isVerticalWriting = this.writingMode === "vertical-rl";
			if (isVerticalWriting) {
				if (absX < swipeThreshold || absX < absY) {
					return;
				}
				if (deltaX < 0) {
					this.nextPage();
				} else {
					this.previousPage();
				}
				return;
			}

			if (absY < swipeThreshold || absY < absX) {
				return;
			}
			if (deltaY < 0) {
				this.nextPage();
			} else {
				this.previousPage();
			}
		};

		this.pointerCancelHandler = () => {
			this.pointerStartX = null;
			this.pointerStartY = null;
			this.pointerStartTime = 0;
		};

		this.container.addEventListener("keydown", this.keydownHandler);
		this.container.addEventListener(
			"pointerdown",
			this.pointerDownHandler,
			{
				capture: true,
			}
		);
		this.container.addEventListener("pointerup", this.pointerUpHandler);
		this.container.addEventListener(
			"pointercancel",
			this.pointerCancelHandler
		);
		this.container.addEventListener("wheel", this.wheelHandler, {
			passive: false,
		});
		this.viewportEl?.addEventListener("wheel", this.wheelHandler, {
			passive: false,
		});
		this.container.ownerDocument.addEventListener(
			"wheel",
			this.wheelHandler,
			{
				passive: false,
				capture: true,
			}
		);
	}

	private updatePaginationLayoutClasses(): void {
		if (!this.viewportEl || !this.pagesContainerEl) {
			return;
		}
		const isVertical = this.writingMode === "vertical-rl";
		this.viewportEl.classList.toggle(
			"pages-horizontal-reverse",
			isVertical
		);
		this.viewportEl.classList.toggle("pages-vertical", !isVertical);
		this.pagesContainerEl.classList.toggle(
			"pages-horizontal-reverse",
			isVertical
		);
		this.pagesContainerEl.classList.toggle("pages-vertical", !isVertical);
	}

	private removeInputHandlers(): void {
		if (this.keydownHandler) {
			this.container.removeEventListener("keydown", this.keydownHandler);
			this.keydownHandler = null;
		}
		if (this.wheelHandler) {
			this.container.removeEventListener("wheel", this.wheelHandler);
			this.viewportEl?.removeEventListener("wheel", this.wheelHandler);
			this.container.ownerDocument.removeEventListener(
				"wheel",
				this.wheelHandler,
				{
					capture: true,
				}
			);
			this.wheelHandler = null;
		}
		if (this.pointerDownHandler) {
			this.container.removeEventListener(
				"pointerdown",
				this.pointerDownHandler
			);
			this.pointerDownHandler = null;
		}
		if (this.pointerUpHandler) {
			this.container.removeEventListener(
				"pointerup",
				this.pointerUpHandler
			);
			this.pointerUpHandler = null;
		}
		if (this.pointerCancelHandler) {
			this.container.removeEventListener(
				"pointercancel",
				this.pointerCancelHandler
			);
			this.pointerCancelHandler = null;
		}
	}

	/**
	 * イベントターゲットがこのコンテナ内にあるかチェック
	 */
	private isEventTargetWithinContainer(target: EventTarget | null): boolean {
		if (!target || !(target instanceof Element)) {
			return false;
		}
		return this.container.contains(target);
	}

	/**
	 * モーダルやサイドバーなどのオーバーレイが開いているかチェック
	 * これらが開いている場合はページ送りを無効化
	 */
	private isOverlayOpen(): boolean {
		const doc = this.container.ownerDocument;
		// Obsidian のモーダルコンテナをチェック（コンテナが存在すれば即座に検出）
		const modalContainers = doc.querySelectorAll(".modal-container");
		if (modalContainers.length > 0) {
			return true;
		}
		// アクティブなメニューやポップオーバーをチェック
		const hasActiveMenu = doc.querySelector(".menu") !== null;
		const hasPopover = doc.querySelector(".popover") !== null;
		if (hasActiveMenu || hasPopover) {
			return true;
		}
		return false;
	}

	/**
	 * このコンテナがアクティブなリーフに含まれているかチェック
	 */
	private isContainerInActiveLeaf(): boolean {
		const doc = this.container.ownerDocument;
		const win = doc.defaultView;

		// ポップアウトウィンドウ（メインウィンドウ以外）の場合は常にtrue
		// ポップアウトウィンドウでは通常単一のビューのみ表示されるため
		if (win && win !== window) {
			return true;
		}

		const activeLeaf = doc.querySelector(".workspace-leaf.mod-active");
		if (!activeLeaf) {
			return true; // アクティブリーフが見つからない場合はデフォルトでtrue
		}
		return activeLeaf.contains(this.container);
	}

	/**
	 * 要素がスクロール可能な親要素（モーダル、設定パネルなど）内にあるかチェック
	 * これらの要素内でのホイールイベントはページ送りではなく通常のスクロールに使う
	 */
	private isWithinScrollableElement(target: Element): boolean {
		let el: Element | null = target;
		while (el && el !== this.container) {
			// モーダルや設定パネルなど特定のクラスをチェック
			if (
				el.classList.contains("modal") ||
				el.classList.contains("modal-container") ||
				el.classList.contains("setting-item") ||
				el.classList.contains("vertical-tab-content") ||
				el.classList.contains("tategaki-control-panel") ||
				el.classList.contains("control-panel-content")
			) {
				return true;
			}
			if (
				el.classList.contains("view-content") ||
				el.classList.contains("workspace-leaf-content")
			) {
				el = el.parentElement;
				continue;
			}
			// スクロール可能な要素かチェック（overflow: auto/scroll）
			const style = getComputedStyle(el);
			const overflowY = style.overflowY;
			const overflowX = style.overflowX;
			if (
				(overflowY === "auto" ||
					overflowY === "scroll" ||
					overflowX === "auto" ||
					overflowX === "scroll") &&
				el !== this.viewportEl
			) {
				// 実際にスクロール可能かチェック（コンテンツがはみ出しているか）
				if (
					el.scrollHeight > el.clientHeight ||
					el.scrollWidth > el.clientWidth
				) {
					return true;
				}
			}
			el = el.parentElement;
		}
		return false;
	}

	private nextPage(): void {
		this.goToPage(this.pageIndex + 1, true);
	}

	private previousPage(): void {
		this.goToPage(this.pageIndex - 1, true);
	}

	private goToFirstPage(): void {
		this.goToPage(0, true);
	}

	private goToPage(index: number, smooth: boolean): void {
		const normalized = Math.max(0, index);
		if (this.paginationInProgress) {
			this.pendingPageIndex = normalized;
		}
		const clamped = Math.max(0, Math.min(normalized, this.pageCount - 1));
		if (clamped === this.pageIndex) return;
		const isReverse = clamped < this.pageIndex;
		this.pageIndex = clamped;
		this.scrollToCurrentPage(smooth, isReverse);
		this.emitPageChange();
	}

	private scrollToCurrentPage(smooth: boolean, isReverse = false): void {
		if (!this.viewportEl) {
			return;
		}
		const effect = this.previewSettings.pageTransitionEffect ?? "fade";
		const simpleEffects = ["fade", "blur"];

		if (simpleEffects.includes(effect) && this.pageElements.length > 0) {
			this.applySimpleTransition(effect, () =>
				this.performScrollToCurrentPage()
			);
			return;
		}

		this.applyNonFadeTransition(effect, isReverse);
		this.performScrollToCurrentPage();
	}

	private performScrollToCurrentPage(): void {
		if (!this.viewportEl) {
			return;
		}
		const behavior = "auto";
		const gap = this.getPageGapPx();
		const pageEl = this.pageElements[this.pageIndex];

		if (this.writingMode === "vertical-rl") {
			const viewportWidth = Math.max(1, this.viewportEl.clientWidth);
			if (this.paginationInProgress && pageEl) {
				const targetLeft =
					pageEl.offsetLeft + pageEl.offsetWidth - viewportWidth;
				this.viewportEl.scrollTo({
					left: Math.max(0, targetLeft),
					behavior,
				});
				return;
			}
			const pageWidth = viewportWidth + gap;
			const maxScroll = Math.max(
				0,
				this.viewportEl.scrollWidth - viewportWidth
			);
			const left = Math.max(0, maxScroll - this.pageIndex * pageWidth);
			this.viewportEl.scrollTo({ left, behavior });
			return;
		}
		if (this.paginationInProgress && pageEl) {
			this.viewportEl.scrollTo({
				top: Math.max(0, pageEl.offsetTop),
				behavior,
			});
			return;
		}
		const viewportHeight = Math.max(1, this.viewportEl.clientHeight);
		const top = calculatePagedScrollTop(
			this.pageIndex,
			viewportHeight,
			gap
		);
		this.viewportEl.scrollTo({ top, behavior });
	}

	private applySimpleTransition(
		effect: string,
		onAfterFadeOut: () => void
	): void {
		if (!this.pagesContainerEl || !this.container) {
			onAfterFadeOut();
			return;
		}
		this.transitionTimeouts.forEach((t) => clearTimeout(t));
		this.transitionTimeouts = [];

		// 既存のマスクがあれば削除
		this.container
			.querySelectorAll(".page-transition-mask")
			.forEach((m) => m.remove());

		this.pagesContainerEl.classList.remove(
			"page-transition-fade-out",
			"page-transition-fade-in",
			"page-transition-blur-out",
			"page-transition-blur-in"
		);

		this.pagesContainerEl.classList.add(`page-transition-${effect}-out`);
		const t1 = setTimeout(() => {
			if (!this.pagesContainerEl) return;
			// スクロール時のチラつきを防ぐため、一時的に非表示にする
			this.pagesContainerEl.style.visibility = "hidden";

			this.pagesContainerEl.classList.remove(
				`page-transition-${effect}-out`
			);
			onAfterFadeOut();

			// 次のアニメーション開始直前に再表示
			requestAnimationFrame(() => {
				if (!this.pagesContainerEl) return;
				this.pagesContainerEl.style.visibility = "";
				this.pagesContainerEl.classList.add(
					`page-transition-${effect}-in`
				);
			});
		}, 200);
		const t2 = setTimeout(() => {
			if (!this.pagesContainerEl) return;
			this.pagesContainerEl.classList.remove(
				`page-transition-${effect}-in`
			);
		}, 400);
		this.transitionTimeouts.push(t1, t2);
	}

	private applyNonFadeTransition(effect: string, isReverse = false): void {
		if (!this.pagesContainerEl || !this.viewportEl || !this.container) {
			return;
		}
		if (effect !== "slide") {
			return;
		}

		// 既存のマスクを削除
		const existingMasks = this.container.querySelectorAll(
			".page-transition-mask"
		);
		existingMasks.forEach((m) => m.remove());

		// 既存のフェード・ズーム・ブラー効果を解除
		this.pagesContainerEl.classList.remove(
			"page-transition-fade-out",
			"page-transition-fade-in",
			"page-transition-blur-out",
			"page-transition-blur-in"
		);

		// タイムアウトをクリア
		this.transitionTimeouts.forEach((t) => clearTimeout(t));
		this.transitionTimeouts = [];

		// マスクを作成（スクロールとは独立して見せるため、containerに直接追加）
		const mask = this.container.ownerDocument.createElement("div");
		mask.className = "page-transition-mask";
		this.container.appendChild(mask);

		requestAnimationFrame(() => {
			let cls =
				this.writingMode === "vertical-rl"
					? "slide-horizontal"
					: "slide-vertical";

			if (isReverse) {
				cls += "-reverse";
			}

			// 再適用で毎回発火させる
			mask.classList.remove(
				"slide-horizontal",
				"slide-vertical",
				"slide-horizontal-reverse",
				"slide-vertical-reverse"
			);
			void mask.offsetWidth; // reflow
			mask.classList.add(cls);

			const removeMask = () => {
				mask.removeEventListener("animationend", removeMask);
				mask.remove();
			};
			mask.addEventListener("animationend", removeMask);
		});
	}

	private emitPageChange(): void {
		this.updateFixedHeaderFooterContent();
		if (!this.onPageChange) {
			return;
		}
		const total = this.pageCount;
		const progress = this.getProgress();
		this.onPageChange({
			currentPage: total === 0 ? 0 : this.pageIndex + 1,
			totalPages: total,
			progress,
		});
	}

	private buildStyles(): string {
		const width = Math.max(
			1,
			this.viewportEl?.clientWidth ??
				Math.round(this.container.getBoundingClientRect().width)
		);
		const height = Math.max(
			1,
			this.viewportEl?.clientHeight ??
				Math.round(this.container.getBoundingClientRect().height)
		);

		// デバッグ: ビューポートサイズを確認
		debugLog(
			`[Tategaki] buildStyles: width=${width}, height=${height}, viewportEl.clientWidth=${this.viewportEl?.clientWidth}, viewportEl.clientHeight=${this.viewportEl?.clientHeight}`
		);

		const writingMode =
			this.writingMode === "vertical-rl"
				? "vertical-rl"
				: "horizontal-tb";
		const isVertical = this.writingMode === "vertical-rl";
		const linePitch = this.layoutLinePitchPx ?? this.getLinePitchPx();
		const snappedLineHeight =
			linePitch / Math.max(1, this.settings.fontSize);

		// 余白設定
		const headerHeight = 24;
		const footerHeight = 24;
		const marginSmall = 0;
		const headerBottomMargin = 20; // ヘッダーと本文の間隔
		const basePaddingTop = headerHeight + marginSmall + headerBottomMargin;
		const basePaddingBottom = footerHeight + marginSmall + 8;
		const basePaddingHorizontal = marginSmall + 8;

		// 縦スクロール方式：パディングはシンプルに
		const paddingTop = basePaddingTop;
		const paddingBottom = basePaddingBottom;
		const paddingLeft = basePaddingHorizontal;
		const paddingRight = basePaddingHorizontal;

		this.lastLayoutMetrics = {
			width,
			height,
			paddingTop,
			paddingBottom,
			paddingLeft,
			paddingRight,
			columnGap: 0, // 縦スクロール方式では不要
			columnWidth: 0, // 縦スクロール方式では不要
			linePitch,
			snappedLineHeight,
		};

		// CSS変数の設定のみを行い、スタイルの詳細は styles.css に任せる
		return `
.tategaki-reading-paged-container {
	--tategaki-reading-padding-top: ${paddingTop}px;
	--tategaki-reading-padding-bottom: ${paddingBottom}px;
	--tategaki-reading-padding-left: ${paddingLeft}px;
	--tategaki-reading-padding-right: ${paddingRight}px;
	--tategaki-viewport-height: ${height}px;
	--tategaki-reading-page-width: ${width}px;
	--tategaki-reading-page-gap: ${this.getPageGapPx()}px;
	--tategaki-writing-mode: ${writingMode};
}

.tategaki-reading-paged-header {
	top: ${marginSmall}px;
}

.tategaki-reading-paged-footer {
	bottom: ${marginSmall}px;
}

/* ヘッダー/フッター背景マスク */
.tategaki-reading-paged-mask {
	position: absolute;
	left: 0;
	right: 0;
	background: var(--tategaki-background-color, var(--background-primary));
	pointer-events: none;
	z-index: 15;
}

.tategaki-reading-paged-mask.top {
	top: 0;
	height: var(--tategaki-reading-padding-top);
}

.tategaki-reading-paged-mask.bottom {
	bottom: 0;
	height: var(--tategaki-reading-padding-bottom);
}

/* ヘッダー/フッター（固定） */
.tategaki-reading-paged-header,
.tategaki-reading-paged-footer {
	position: absolute;
	left: 0;
	right: 0;
	height: 24px;
	display: flex;
	align-items: center;
	padding: 0 16px;
	box-sizing: border-box;
	font-size: 12px;
	color: var(--tategaki-text-color, var(--text-muted));
	background: var(--tategaki-background-color, var(--background-primary));
	opacity: 0.7;
	writing-mode: horizontal-tb !important;
	text-orientation: mixed !important;
	pointer-events: none;
	z-index: 16;
}

.tategaki-reading-paged-header.align-left,
.tategaki-reading-paged-footer.align-left {
	justify-content: flex-start;
}

.tategaki-reading-paged-header.align-center,
.tategaki-reading-paged-footer.align-center {
	justify-content: center;
}

.tategaki-reading-paged-header.align-right,
.tategaki-reading-paged-footer.align-right {
	justify-content: flex-end;
}
`;
	}

	private getHeaderFooterContent(
		content: HeaderFooterContent,
		pageNumber: number,
		totalPages: number
	): string {
		switch (content) {
			case "title":
				return this.title;
			case "pageNumber":
				return this.formatPageNumber(pageNumber, totalPages);
			case "none":
			default:
				return "";
		}
	}

	private formatPageNumber(pageNumber: number, totalPages: number): string {
		const format = this.previewSettings.pageNumberFormat ?? "currentTotal";
		if (format === "current") {
			return `${pageNumber}`;
		}
		return `${pageNumber} / ${totalPages}`;
	}

	private ensureFixedHeaderFooterElements(): void {
		const doc = this.container.ownerDocument;
		const headerContent = this.previewSettings.headerContent ?? "none";
		const footerContent =
			this.previewSettings.footerContent ?? "pageNumber";
		const headerAlign = this.previewSettings.headerAlign ?? "center";
		const footerAlign = this.previewSettings.footerAlign ?? "center";

		if (!this.headerMaskEl) {
			this.headerMaskEl = doc.createElement("div");
			this.headerMaskEl.className = "tategaki-reading-paged-mask top";
			this.container.appendChild(this.headerMaskEl);
		}

		if (!this.footerMaskEl) {
			this.footerMaskEl = doc.createElement("div");
			this.footerMaskEl.className = "tategaki-reading-paged-mask bottom";
			this.container.appendChild(this.footerMaskEl);
		}

		if (headerContent === "none") {
			this.headerEl?.remove();
			this.headerEl = null;
		} else if (!this.headerEl) {
			this.headerEl = doc.createElement("div");
			this.container.appendChild(this.headerEl);
		}

		if (this.headerEl) {
			this.headerEl.className = `tategaki-reading-paged-header align-${headerAlign}`;
		}

		if (footerContent === "none") {
			this.footerEl?.remove();
			this.footerEl = null;
		} else if (!this.footerEl) {
			this.footerEl = doc.createElement("div");
			this.container.appendChild(this.footerEl);
		}

		if (this.footerEl) {
			this.footerEl.className = `tategaki-reading-paged-footer align-${footerAlign}`;
		}
	}

	private updateFixedHeaderFooterContent(): void {
		const totalPages = this.pageCount;
		const pageNumber = totalPages === 0 ? 0 : this.pageIndex + 1;
		this.ensureFixedHeaderFooterElements();

		if (this.headerEl) {
			const headerContent = this.previewSettings.headerContent ?? "none";
			this.headerEl.textContent = this.getHeaderFooterContent(
				headerContent,
				pageNumber,
				totalPages
			);
		}

		if (this.footerEl) {
			const footerContent =
				this.previewSettings.footerContent ?? "pageNumber";
			this.footerEl.textContent = this.getHeaderFooterContent(
				footerContent,
				pageNumber,
				totalPages
			);
		}
	}

	private async render(): Promise<void> {
		if (this.isRendering) {
			this.pendingRender = true;
			return;
		}
		this.isRendering = true;
		const renderSize = this.getViewportSize();
		const token = (this.renderToken += 1);
		try {
			if (
				this.destroyed ||
				!this.pagesContainerEl ||
				!this.styleEl ||
				!this.container.isConnected
			) {
				return;
			}

			const styleText = this.buildStyles();
			this.styleEl.textContent = styleText;

			if (token !== this.renderToken || this.destroyed) {
				return;
			}

			// レイアウト反映を待つ（複数回）
			await new Promise((resolve) => requestAnimationFrame(resolve));
			if (token !== this.renderToken || this.destroyed) {
				return;
			}
			await new Promise((resolve) => requestAnimationFrame(resolve));
			if (token !== this.renderToken || this.destroyed) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
			if (token !== this.renderToken || this.destroyed) {
				return;
			}

			// コンテンツをページに分割
			await this.splitContentIntoPages(token);

			if (token !== this.renderToken || this.destroyed) {
				return;
			}

			// ページ数再計算
			this.recalculatePageCount();
			if (this.pageIndex >= this.pageCount) {
				this.pageIndex = Math.max(0, this.pageCount - 1);
			}
			this.scrollToCurrentPage(false);
			this.lastViewportSize = renderSize;
			this.hasRenderedOnce = true;
			this.emitPageChange();
			this.logLayoutMetrics();

			if (this.onRendered) {
				try {
					this.onRendered({ pages: this.pageElements });
				} catch (error) {
					debugWarn(
						"[Tategaki] reading mode onRendered failed",
						error
					);
				}
			}
		} finally {
			this.isRendering = false;
			const currentSize = this.getViewportSize();
			const sizeChanged =
				!this.lastViewportSize ||
				this.lastViewportSize.width !== currentSize.width ||
				this.lastViewportSize.height !== currentSize.height;
			if (this.pendingRender && !this.destroyed && sizeChanged) {
				this.pendingRender = false;
				this.pendingViewportSize = null;
				void this.render();
			} else {
				this.pendingRender = false;
				this.pendingViewportSize = null;
			}
		}
	}

	private getViewportSize(): { width: number; height: number } {
		const width = Math.max(1, this.viewportEl?.clientWidth ?? 0);
		const height = Math.max(1, this.viewportEl?.clientHeight ?? 0);
		return { width, height };
	}

	private async splitContentIntoPages(token: number): Promise<void> {
		const pagesContainerEl = this.pagesContainerEl;
		const viewportEl = this.viewportEl;
		if (!pagesContainerEl || !viewportEl) {
			console.error("[Tategaki] Missing container elements:", {
				pagesContainerEl: !!this.pagesContainerEl,
				viewportEl: !!this.viewportEl,
			});
			return;
		}

		if (this.activePagination) {
			this.activePagination.cancel();
			this.activePagination = null;
		}

		this.paginationInProgress = true;

		// 既存のページをクリア
		this.pageElements.forEach((page) => page.remove());
		this.pageElements = [];
		pagesContainerEl.textContent = "";

		debugLog(`[Tategaki] Starting measured pagination...`);
		debugLog(
			`[Tategaki] Content HTML length: ${this.contentHtml?.length || 0}`
		);
		debugLog(
			`[Tategaki] Content HTML preview:`,
			this.contentHtml?.substring(0, 100)
		);

		// ビューポートサイズを取得
		const viewportWidth = Math.max(1, viewportEl.clientWidth);
		const viewportHeight = Math.max(1, viewportEl.clientHeight);
		debugLog(
			`[Tategaki] Viewport size: ${viewportWidth}x${viewportHeight}`
		);

		// パディング設定
		const headerHeight = 24;
		const footerHeight = 24;
		const marginSmall = 0;
		const headerBottomMargin = 20; // ヘッダーと本文の間隔
		const paddingTop = headerHeight + marginSmall + headerBottomMargin;
		const paddingBottom = footerHeight + marginSmall + 8;
		const paddingHorizontal = marginSmall + 8;

		const pageElements: HTMLElement[] = [];
		let lastEmit = 0;
		const emitPageUpdate = (force = false) => {
			if (this.destroyed || token !== this.renderToken) {
				return;
			}
			this.pageElements = pageElements;
			this.pageCount = Math.max(1, pageElements.length);
			const maxIndex = Math.max(0, this.pageCount - 1);
			if (
				this.pendingPageIndex !== null &&
				this.pendingPageIndex <= maxIndex
			) {
				const targetIndex = this.pendingPageIndex;
				this.pendingPageIndex = null;
				if (targetIndex !== this.pageIndex) {
					const isReverse = targetIndex < this.pageIndex;
					this.pageIndex = targetIndex;
					this.scrollToCurrentPage(false, isReverse);
				}
			} else if (this.pageIndex > maxIndex) {
				this.pageIndex = maxIndex;
			}
			const now =
				this.container.ownerDocument.defaultView?.performance?.now?.() ??
				Date.now();
			if (force || now - lastEmit > 120) {
				this.emitPageChange();
				lastEmit = now;
			}
		};

		// 実測ページネーションを実行
		const pagination = new MeasuredPagination({
			container: pagesContainerEl,
			contentHtml: this.contentHtml,
			writingMode:
				this.writingMode === "vertical-rl"
					? "vertical-rl"
					: "horizontal-tb",
			pageWidth: viewportWidth,
			pageHeight: viewportHeight,
			paddingTop,
			paddingBottom,
			paddingLeft: paddingHorizontal,
			paddingRight: paddingHorizontal,
			timeSliceMs: 12,
			onPage: (pageInfo) => {
				if (this.destroyed || token !== this.renderToken) {
					pageInfo.element.remove();
					return;
				}
				const pageIndex = pageElements.length;
				pageInfo.element.setAttribute(
					"data-page",
					pageIndex.toString()
				);
				pageElements.push(pageInfo.element);
				if (this.onPageAdded) {
					try {
						this.onPageAdded(pageInfo.element, pageIndex);
					} catch (error) {
						debugWarn(
							"[Tategaki] reading mode onPageAdded failed",
							error
						);
					}
				}
				emitPageUpdate(pageElements.length === 1);
			},
			onProgress: (current, total) => {
				debugLog(
					`[Tategaki] Pagination progress: ${current}/${total}`
				);
			},
		});
		this.activePagination = pagination;

		try {
			const pages = await pagination.paginate();
			if (this.destroyed || token !== this.renderToken) {
				pages.forEach((pageInfo) => pageInfo.element.remove());
				this.pageElements.forEach((page) => page.remove());
				this.pageElements = [];
				return;
			}
			if (!this.pagesContainerEl || !this.viewportEl) {
				pages.forEach((pageInfo) => pageInfo.element.remove());
				this.pageElements.forEach((page) => page.remove());
				this.pageElements = [];
				return;
			}
			debugLog(`[Tategaki] Pagination returned ${pages.length} pages`);

			// ページ要素を配置
			this.pageElements = pageElements.length
				? pageElements
				: pages.map((pageInfo, index) => {
						pageInfo.element.setAttribute(
							"data-page",
							index.toString()
						);
						return pageInfo.element;
				  });

			debugLog(
				`[Tategaki] Created ${this.pageElements.length} pages using measured pagination`
			);
			if (pagesContainerEl) {
				debugLog(
					`[Tategaki] Pages in DOM:`,
					pagesContainerEl.querySelectorAll(".tategaki-page").length
				);
			}
		} catch (error) {
			if (this.destroyed || token !== this.renderToken) {
				return;
			}
			console.error("[Tategaki] Pagination failed:", error);
			if (!pagesContainerEl) {
				return;
			}
			// フォールバック: シンプルな1ページ表示
			const fallbackPage = this.createPageElement(0);
			const wrapper = fallbackPage.querySelector(
				".page-content"
			) as HTMLElement;
			if (wrapper) {
				wrapper.innerHTML = this.contentHtml;
			}
			pagesContainerEl.appendChild(fallbackPage);
			this.pageElements.push(fallbackPage);
		} finally {
			this.paginationInProgress = false;
			if (this.pendingPageIndex !== null) {
				const maxIndex = Math.max(0, this.pageCount - 1);
				const targetIndex = Math.max(
					0,
					Math.min(this.pendingPageIndex, maxIndex)
				);
				this.pendingPageIndex = null;
				if (targetIndex !== this.pageIndex) {
					const isReverse = targetIndex < this.pageIndex;
					this.pageIndex = targetIndex;
					this.scrollToCurrentPage(false, isReverse);
					this.emitPageChange();
				}
			} else if (this.pageIndex >= this.pageCount) {
				this.pageIndex = Math.max(0, this.pageCount - 1);
				this.emitPageChange();
			}
			if (this.activePagination === pagination) {
				this.activePagination = null;
			}
		}
	}

	private createPageElement(pageIndex: number): HTMLElement {
		const doc = this.container.ownerDocument;
		const page = doc.createElement("div");
		page.className = "tategaki-page";
		page.setAttribute("data-page", pageIndex.toString());

		// .page-content ラッパーを追加（MeasuredPagination との互換性のため）
		const wrapper = doc.createElement("div");
		wrapper.className = "page-content";
		page.appendChild(wrapper);

		return page;
	}

	private recalculatePageCount(): void {
		// ページ数は生成されたページ要素の数
		this.pageCount = Math.max(1, this.pageElements.length);
	}

	private getPageGapPx(): number {
		return 24;
	}

	private getLinePitchPx(): number {
		const fontSize = Math.max(1, this.settings.fontSize);
		const raw = fontSize * this.settings.lineHeight;
		return Math.max(1, this.snapToDevicePixel(raw));
	}

	private snapToDevicePixel(value: number): number {
		const scale =
			this.container.ownerDocument?.defaultView?.devicePixelRatio ?? 1;
		return Math.round(value * scale) / scale;
	}

	private snapToLineGrid(availableBlock: number, linePitch: number): number {
		if (!Number.isFinite(availableBlock) || !Number.isFinite(linePitch)) {
			return Math.max(1, availableBlock);
		}
		const safeBlock = Math.max(1, availableBlock);
		const safePitch = Math.max(1, linePitch);
		const lineCount = Math.max(1, Math.floor(safeBlock / safePitch));
		return Math.min(safeBlock, lineCount * safePitch);
	}

	private getRenderStridePx(): number | null {
		if (!this.lastLayoutMetrics) {
			return null;
		}
		// 縦スクロール方式では viewportHeight + gap
		const { height } = this.lastLayoutMetrics;
		const gap = this.getPageGapPx();
		const stride = height + gap;
		if (!Number.isFinite(stride) || stride <= 0) {
			return null;
		}
		return stride;
	}

	private updateSnappedLineHeightFromComputed(): boolean {
		const metrics = this.measureComputedLineMetrics();
		if (!metrics) {
			return false;
		}
		const snappedPitch = this.snapToDevicePixel(metrics.lineHeightPx);
		const snappedLineHeight =
			snappedPitch / Math.max(1, metrics.fontSizePx);
		const currentLineHeight =
			parseFloat(
				this.container.style.getPropertyValue("--tategaki-line-height")
			) || this.settings.lineHeight;
		this.lastLineMetrics = {
			fontSizePx: metrics.fontSizePx,
			lineHeightPx: metrics.lineHeightPx,
			usedProbe: metrics.usedProbe,
			snappedLineHeight,
		};
		this.layoutLinePitchPx = snappedPitch;

		if (Math.abs(currentLineHeight - snappedLineHeight) < 0.001) {
			return false;
		}
		this.container.style.setProperty(
			"--tategaki-line-height",
			snappedLineHeight.toString()
		);
		return true;
	}

	private measureComputedLineMetrics(): {
		fontSizePx: number;
		lineHeightPx: number;
		usedProbe: boolean;
	} | null {
		// 最初のページ要素から計測
		const target = this.pageElements[0];
		if (!target) {
			return null;
		}
		const style = getComputedStyle(target);
		const fontSizePx = parseFloat(style.fontSize);
		let lineHeightPx = parseFloat(style.lineHeight);
		let usedProbe = false;

		if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) {
			const measured = this.measureLineHeightWithProbe(target);
			if (measured > 0) {
				lineHeightPx = measured;
				usedProbe = true;
			}
		}

		if (!Number.isFinite(fontSizePx) || fontSizePx <= 0) {
			return null;
		}
		if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) {
			return null;
		}

		return {
			fontSizePx,
			lineHeightPx,
			usedProbe,
		};
	}

	private measureLineHeightWithProbe(target: HTMLElement): number {
		const doc = target.ownerDocument;
		const probe = doc.createElement("div");
		probe.style.cssText = [
			"position:absolute",
			"visibility:hidden",
			"pointer-events:none",
			"padding:0",
			"margin:0",
			"border:0",
			"white-space:pre",
			"font:inherit",
			"line-height:inherit",
			"writing-mode:inherit",
			"text-orientation:inherit",
		].join(";");
		probe.textContent = "あ\nあ";
		target.appendChild(probe);
		const rectDouble = probe.getBoundingClientRect();
		probe.textContent = "あ";
		const rectSingle = probe.getBoundingClientRect();
		probe.remove();

		const isVertical = this.writingMode === "vertical-rl";
		const blockDouble = isVertical ? rectDouble.width : rectDouble.height;
		const blockSingle = isVertical ? rectSingle.width : rectSingle.height;
		const measured = blockDouble - blockSingle;
		return Number.isFinite(measured) ? measured : 0;
	}

	private logLayoutMetrics(): void {
		if (!this.debugLayout || !this.viewportEl || !this.lastLayoutMetrics) {
			return;
		}
		const viewportWidth = this.viewportEl.clientWidth;
		const viewportHeight = this.viewportEl.clientHeight;
		const viewportScrollHeight = this.viewportEl.scrollHeight;
		const pageGap = this.getPageGapPx();
		const stride =
			this.getRenderStridePx() ??
			calculatePageStridePx(viewportHeight, pageGap);

		debugLog("[Tategaki] paged layout metrics (page blocks)", {
			writingMode: this.writingMode,
			pageIndex: this.pageIndex,
			pageCount: this.pageCount,
			pageElementsLength: this.pageElements.length,
			viewportWidth,
			viewportHeight,
			viewportScrollHeight,
			pageGap,
			stride,
			computedFontSizePx: this.lastLineMetrics?.fontSizePx ?? null,
			computedLineHeightPx: this.lastLineMetrics?.lineHeightPx ?? null,
			computedLineHeightProbe: this.lastLineMetrics?.usedProbe ?? null,
			...this.lastLayoutMetrics,
		});
	}
}
