/**
 * 仮想化ユーティリティ
 *
 * 大量のブロックを効率的にレンダリングするための仮想スクロール機能を提供します。
 * 表示領域に見えているブロックのみをDOMに保持し、パフォーマンスを向上させます。
 */

export interface VirtualizerOptions {
	/** スクロールコンテナ */
	container: HTMLElement;
	/** 全アイテム数 */
	totalItems: number;
	/** アイテムの高さ（縦書きの場合は幅）を取得する関数 */
	getItemSize: (index: number) => number;
	/** アイテムをレンダリングする関数 */
	renderItem: (index: number) => HTMLElement;
	/** 表示範囲外にバッファとして追加で描画するアイテム数 */
	overscan?: number;
	/** 縦書きモードかどうか */
	isVertical?: boolean;
}

export interface VirtualRange {
	/** 開始インデックス（含む） */
	start: number;
	/** 終了インデックス（含まない） */
	end: number;
}

/**
 * 仮想スクロールを実装するクラス
 */
export class Virtualizer {
	private readonly container: HTMLElement;
	private readonly totalItems: number;
	private readonly getItemSize: (index: number) => number;
	private readonly renderItem: (index: number) => HTMLElement;
	private readonly overscan: number;
	private readonly isVertical: boolean;

	private currentRange: VirtualRange = { start: 0, end: 0 };
	private renderedElements: Map<number, HTMLElement> = new Map();
	private spacerBefore: HTMLElement;
	private spacerAfter: HTMLElement;
	private contentContainer: HTMLElement;
	private scrollListener: (() => void) | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(options: VirtualizerOptions) {
		this.container = options.container;
		this.totalItems = options.totalItems;
		this.getItemSize = options.getItemSize;
		this.renderItem = options.renderItem;
		this.isVertical = options.isVertical ?? false;
		// 縦書きではスクロールが粗くなるため overscan を広めにとる
		this.overscan = options.overscan ?? (this.isVertical ? 8 : 5);

		// スペーサーとコンテンツコンテナを初期化
		this.spacerBefore = document.createElement('div');
		this.spacerAfter = document.createElement('div');
		this.contentContainer = document.createElement('div');

		this.initializeDOM();
		this.attachListeners();
		this.updateVisibleRange();
	}

	/**
	 * DOM構造を初期化
	 */
	private initializeDOM(): void {
		// コンテナをクリア
		this.container.innerHTML = '';

		// スペーサーのスタイル設定
		if (this.isVertical) {
			this.spacerBefore.style.cssText = 'width: 0; height: 100%; display: inline-block;';
			this.spacerAfter.style.cssText = 'width: 0; height: 100%; display: inline-block;';
			this.contentContainer.style.cssText = 'display: inline-block; height: 100%;';
		} else {
			this.spacerBefore.style.cssText = 'height: 0; width: 100%;';
			this.spacerAfter.style.cssText = 'height: 0; width: 100%;';
			this.contentContainer.style.cssText = 'width: 100%;';
		}

		this.container.appendChild(this.spacerBefore);
		this.container.appendChild(this.contentContainer);
		this.container.appendChild(this.spacerAfter);
	}

	/**
	 * スクロールイベントリスナーを設定
	 */
	private attachListeners(): void {
		this.scrollListener = () => {
			this.updateVisibleRange();
		};
		this.container.addEventListener('scroll', this.scrollListener, { passive: true });

		// コンテナのサイズ変更を監視
		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver(() => {
				this.updateVisibleRange();
			});
			this.resizeObserver.observe(this.container);
		}
	}

	/**
	 * 表示範囲を計算して更新
	 */
	private updateVisibleRange(): void {
		const scrollOffset = this.isVertical ? this.container.scrollLeft : this.container.scrollTop;
		const viewportSize = this.isVertical ? this.container.clientWidth : this.container.clientHeight;

		// 表示範囲のインデックスを計算
		const range = this.calculateVisibleRange(scrollOffset, viewportSize);

		// 範囲が変わっていなければスキップ
		if (range.start === this.currentRange.start && range.end === this.currentRange.end) {
			return;
		}

		this.currentRange = range;
		this.renderVisibleItems();
	}

	/**
	 * スクロール位置から表示すべきアイテムの範囲を計算
	 */
	private calculateVisibleRange(scrollOffset: number, viewportSize: number): VirtualRange {
		let accumulatedSize = 0;
		let start = 0;
		let end = 0;

		// 開始インデックスを見つける
		for (let i = 0; i < this.totalItems; i++) {
			const itemSize = this.getItemSize(i);
			if (accumulatedSize + itemSize > scrollOffset) {
				start = Math.max(0, i - this.overscan);
				break;
			}
			accumulatedSize += itemSize;
		}

		// 終了インデックスを見つける
		for (let i = start; i < this.totalItems; i++) {
			const itemSize = this.getItemSize(i);
			accumulatedSize += itemSize;
			if (accumulatedSize >= scrollOffset + viewportSize) {
				end = Math.min(this.totalItems, i + 1 + this.overscan);
				break;
			}
		}

		// 見つからなかった場合は全て表示
		if (end === 0) {
			end = this.totalItems;
		}

		return { start, end };
	}

	/**
	 * 表示範囲のアイテムをレンダリング
	 */
	private renderVisibleItems(): void {
		const { start, end } = this.currentRange;

		// 範囲外のアイテムを削除
		const toRemove: number[] = [];
		this.renderedElements.forEach((element, index) => {
			if (index < start || index >= end) {
				element.remove();
				toRemove.push(index);
			}
		});
		toRemove.forEach(index => this.renderedElements.delete(index));

		// 新しいアイテムを追加
		for (let i = start; i < end; i++) {
			if (!this.renderedElements.has(i)) {
				const element = this.renderItem(i);
				this.renderedElements.set(i, element);
				this.contentContainer.appendChild(element);
			}
		}

		// スペーサーのサイズを更新
		this.updateSpacers();
	}

	/**
	 * スペーサーのサイズを更新して、スクロール可能な範囲を維持
	 */
	private updateSpacers(): void {
		const { start, end } = this.currentRange;

		// 前方のスペーサーサイズを計算
		let beforeSize = 0;
		for (let i = 0; i < start; i++) {
			beforeSize += this.getItemSize(i);
		}

		// 後方のスペーサーサイズを計算
		let afterSize = 0;
		for (let i = end; i < this.totalItems; i++) {
			afterSize += this.getItemSize(i);
		}

		// スペーサーのサイズを設定
		if (this.isVertical) {
			this.spacerBefore.style.width = `${beforeSize}px`;
			this.spacerAfter.style.width = `${afterSize}px`;
		} else {
			this.spacerBefore.style.height = `${beforeSize}px`;
			this.spacerAfter.style.height = `${afterSize}px`;
		}
	}

	/**
	 * 特定のインデックスにスクロール
	 */
	scrollToIndex(index: number, options: { align?: 'start' | 'center' | 'end' } = {}): void {
		const align = options.align ?? 'start';
		let offset = 0;

		// インデックスまでのオフセットを計算
		for (let i = 0; i < index; i++) {
			offset += this.getItemSize(i);
		}

		const viewportSize = this.isVertical ? this.container.clientWidth : this.container.clientHeight;
		const itemSize = this.getItemSize(index);

		// アライメントに応じてオフセットを調整
		if (align === 'center') {
			offset -= (viewportSize - itemSize) / 2;
		} else if (align === 'end') {
			offset -= viewportSize - itemSize;
		}

		// スクロール
		if (this.isVertical) {
			this.container.scrollLeft = Math.max(0, offset);
		} else {
			this.container.scrollTop = Math.max(0, offset);
		}
	}

	/**
	 * 現在の表示範囲を取得
	 */
	getVisibleRange(): VirtualRange {
		return { ...this.currentRange };
	}

	/**
	 * 強制的に再レンダリング
	 */
	forceUpdate(): void {
		this.renderedElements.clear();
		this.contentContainer.innerHTML = '';
		this.updateVisibleRange();
	}

	/**
	 * 特定のアイテムを再レンダリング
	 */
	updateItem(index: number): void {
		if (this.renderedElements.has(index)) {
			const oldElement = this.renderedElements.get(index)!;
			const newElement = this.renderItem(index);
			this.renderedElements.set(index, newElement);
			oldElement.replaceWith(newElement);
		}
	}

	/**
	 * リソースをクリーンアップ
	 */
	destroy(): void {
		if (this.scrollListener) {
			this.container.removeEventListener('scroll', this.scrollListener);
			this.scrollListener = null;
		}
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		this.renderedElements.clear();
	}
}

/**
 * アイテムサイズのキャッシュを提供するヘルパークラス
 */
export class ItemSizeCache {
	private readonly defaultSize: number;
	private readonly cache: Map<number, number> = new Map();

	constructor(defaultSize: number) {
		this.defaultSize = defaultSize;
	}

	/**
	 * アイテムのサイズを取得（キャッシュから、なければデフォルト値）
	 */
	getSize(index: number): number {
		return this.cache.get(index) ?? this.defaultSize;
	}

	/**
	 * アイテムのサイズを設定
	 */
	setSize(index: number, size: number): void {
		this.cache.set(index, size);
	}

	/**
	 * 実際のDOM要素からサイズを測定してキャッシュ
	 */
	measureAndCache(index: number, element: HTMLElement, isVertical: boolean): number {
		const size = isVertical ? element.offsetWidth : element.offsetHeight;
		this.setSize(index, size);
		return size;
	}

	/**
	 * キャッシュをクリア
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * 特定のインデックス以降のキャッシュを無効化
	 */
	invalidateFrom(index: number): void {
		const toDelete: number[] = [];
		this.cache.forEach((_, i) => {
			if (i >= index) {
				toDelete.push(i);
			}
		});
		toDelete.forEach(i => this.cache.delete(i));
	}
}
