import { BlockNode } from "./block-model";
import { Virtualizer, ItemSizeCache } from "./utils/virtualization";

const ROOT_CLASS = "tategaki-block-editor-root";
const BLOCK_CLASS = "tategaki-block";
const BLOCK_ACTIVE_CLASS = "tategaki-block--active";
const BLOCK_FRONTMATTER_CLASS = "tategaki-block--frontmatter";

export interface BlockRendererOptions {
	/** 仮想化を有効にするかどうか */
	enableVirtualization?: boolean;
	/** 仮想化を有効にする最小ブロック数 */
	virtualizationThreshold?: number;
	/** 縦書きモードかどうか */
	isVertical?: boolean;
}

export class BlockRenderer {
	private readonly hostElement: HTMLElement;
	private readonly rootElement: HTMLElement;
	private activeBlockId: string | null = null;
	private readonly options: BlockRendererOptions;
	private virtualizer: Virtualizer | null = null;
	private sizeCache: ItemSizeCache | null = null;
	private currentBlocks: readonly BlockNode[] = [];
	private renderedBlockIds: Set<string> = new Set();
	private virtualizationSuspended = false;

	constructor(hostElement: HTMLElement, options: BlockRendererOptions = {}) {
		this.hostElement = hostElement;
		this.options = {
			enableVirtualization: options.enableVirtualization ?? true,
			virtualizationThreshold: options.virtualizationThreshold ?? 100,
			isVertical: options.isVertical ?? false,
		};
		this.rootElement = this.initializeRoot();
		this.applyScrollDirection();
	}

	render(blocks: readonly BlockNode[], activeBlockId: string | null): void {
		this.currentBlocks = blocks;
		this.activeBlockId = activeBlockId;

		// 仮想化の判定
		const shouldVirtualize =
			!this.virtualizationSuspended &&
			this.options.enableVirtualization &&
			blocks.length >= (this.options.virtualizationThreshold ?? 100);

		if (shouldVirtualize) {
			this.renderVirtualized(blocks, activeBlockId);
		} else {
			this.renderDirect(blocks, activeBlockId);
		}
	}

	/**
	 * 仮想化を一時停止し、全ブロックを直接描画
	 */
	suspendVirtualization(): void {
		if (this.virtualizationSuspended) {
			return;
		}

		this.virtualizationSuspended = true;
		if (this.virtualizer) {
			this.virtualizer.destroy();
			this.virtualizer = null;
		}
		this.sizeCache = null;
		this.renderDirect(this.currentBlocks, this.activeBlockId);
	}

	/**
	 * 仮想化を再開
	 */
	resumeVirtualization(): void {
		if (!this.virtualizationSuspended) {
			return;
		}

		this.virtualizationSuspended = false;
		this.render(this.currentBlocks, this.activeBlockId);
	}

	/**
	 * 仮想化が停止中かどうか
	 */
	isVirtualizationSuspended(): boolean {
		return this.virtualizationSuspended;
	}

	/**
	 * 全ブロックを直接レンダリング（従来の方式）
	 */
	private renderDirect(
		blocks: readonly BlockNode[],
		activeBlockId: string | null
	): void {
		// 既存の仮想化をクリーンアップ
		if (this.virtualizer) {
			this.virtualizer.destroy();
			this.virtualizer = null;
			this.sizeCache = null;
		}

		this.rootElement.innerHTML = "";
		this.renderedBlockIds.clear();

		// リスト構造を構築しながらレンダリング
		let i = 0;
		while (i < blocks.length) {
			const block = blocks[i];

			// リストアイテムブロックの連続を検出
			if (block.type === "listItem") {
				const listBlocks: BlockNode[] = [block];
				let j = i + 1;
				while (j < blocks.length && blocks[j]?.type === "listItem") {
					listBlocks.push(blocks[j]);
					j++;
				}

				// リスト構造を構築
				const listElement = this.buildListStructure(
					listBlocks,
					activeBlockId
				);
				this.rootElement.appendChild(listElement);

				i = j;
			} else {
				const blockElement = this.createBlockElement(
					block,
					block.id === activeBlockId
				);
				this.rootElement.appendChild(blockElement);
				this.renderedBlockIds.add(block.id);
				i++;
			}
		}
	}

	/**
	 * リストブロックからリスト構造（ul/ol + li）を構築
	 */
	private buildListStructure(
		listBlocks: BlockNode[],
		activeBlockId: string | null
	): HTMLElement {
		// リスト構造を構築するためのコンテナ
		const container = document.createElement("div");
		container.className = BLOCK_CLASS;

		// ネストされたリストを処理
		const listStack: Array<{
			element: HTMLElement;
			depth: number;
			listType: "ordered" | "bullet";
		}> = [];

		for (const block of listBlocks) {
			if (block.type !== "listItem") continue;

			const depth = block.depth ?? 0;
			const listType = block.metadata.listType ?? "bullet";

			// 現在の深さに合わせてリストスタックを調整
			while (
				listStack.length > 0 &&
				listStack[listStack.length - 1].depth >= depth
			) {
				listStack.pop();
			}

			// 新しいリストレベルが必要な場合
			if (
				listStack.length === 0 ||
				listStack[listStack.length - 1].depth < depth
			) {
				const listElement = document.createElement(
					listType === "ordered" ? "ol" : "ul"
				);

				// 番号付きリストの場合、最初のアイテムのlistNumberを使用してstart属性を設定
				if (
					listType === "ordered" &&
					typeof block.metadata.listNumber === "number"
				) {
					listElement.setAttribute(
						"start",
						String(block.metadata.listNumber)
					);
				}

				listStack.push({ element: listElement, depth, listType });

				// 親リストに追加、またはコンテナに追加
				if (listStack.length > 1) {
					const parentLi = listStack[listStack.length - 2].element
						.lastElementChild as HTMLElement;
					if (parentLi) {
						parentLi.appendChild(listElement);
					}
				} else {
					container.appendChild(listElement);
				}
			}

			// リストアイテムを作成
			const liElement = document.createElement("li");
			liElement.dataset.listDepth = String(depth);
			liElement.dataset.listType = listType;
			const blockElement = document.createElement("div");
			blockElement.className = `${BLOCK_CLASS}${
				block.id === activeBlockId ? ` ${BLOCK_ACTIVE_CLASS}` : ""
			}`;
			blockElement.dataset.blockId = block.id;
			blockElement.dataset.blockType = block.type;
			blockElement.dataset.blockDepth = String(depth);
			blockElement.dataset.listType = listType;
			if (typeof block.metadata.listNumber === "number") {
				blockElement.dataset.listNumber = String(
					block.metadata.listNumber
				);
			}

			if (block.html === "") {
				blockElement.innerHTML = '<br data-tategaki-placeholder="1">';
			} else {
				blockElement.innerHTML = block.html;
			}

			blockElement.style.minHeight = "1.2em";
			blockElement.style.userSelect = "text";
			(blockElement.style as any).webkitUserSelect = "text";

			liElement.appendChild(blockElement);
			listStack[listStack.length - 1].element.appendChild(liElement);
			this.renderedBlockIds.add(block.id);
		}

		return container;
	}

	/**
	 * 仮想化を使用してレンダリング
	 */
	private renderVirtualized(
		blocks: readonly BlockNode[],
		activeBlockId: string | null
	): void {
		// サイズキャッシュを初期化
		if (!this.sizeCache) {
			const defaultSize = this.options.isVertical ? 60 : 24; // デフォルトの段落高さ/幅
			this.sizeCache = new ItemSizeCache(defaultSize);
		}

		// 仮想化インスタンスを作成または更新
		if (!this.virtualizer) {
			this.virtualizer = new Virtualizer({
				container: this.rootElement,
				totalItems: blocks.length,
				getItemSize: (index) => this.sizeCache!.getSize(index),
				renderItem: (index) => {
					const block = blocks[index];

					// リストアイテムの場合は、前後のブロックを確認してリスト構造を構築
					if (block.type === "listItem") {
						// 連続するリストアイテムを検出
						const listBlocks: BlockNode[] = [block];
						let startIndex = index;
						while (
							startIndex > 0 &&
							blocks[startIndex - 1]?.type === "listItem"
						) {
							startIndex--;
							listBlocks.unshift(blocks[startIndex]);
						}
						let endIndex = index;
						while (
							endIndex < blocks.length - 1 &&
							blocks[endIndex + 1]?.type === "listItem"
						) {
							endIndex++;
							listBlocks.push(blocks[endIndex]);
						}

						// 現在のブロックがリストの最初の要素の場合のみリスト構造を構築
						if (listBlocks[0]?.id === block.id) {
							const element = this.buildListStructure(
								listBlocks,
								activeBlockId
							);
							this.renderedBlockIds.add(block.id);

							// 要素のサイズを測定してキャッシュ
							requestAnimationFrame(() => {
								if (element.isConnected) {
									this.sizeCache!.measureAndCache(
										index,
										element,
										this.options.isVertical ?? false
									);
								}
							});

							return element;
						} else {
							// リストの一部として既にレンダリングされている場合は空要素を返す
							const emptyElement = document.createElement("div");
							emptyElement.style.display = "none";
							return emptyElement;
						}
					} else {
						const element = this.createBlockElement(
							block,
							block.id === activeBlockId
						);
						this.renderedBlockIds.add(block.id);

						// 要素のサイズを測定してキャッシュ
						requestAnimationFrame(() => {
							if (element.isConnected) {
								this.sizeCache!.measureAndCache(
									index,
									element,
									this.options.isVertical ?? false
								);
							}
						});

						return element;
					}
				},
				overscan: 5,
				isVertical: this.options.isVertical,
			});
		} else {
			// 既存の仮想化インスタンスを更新
			this.virtualizer.forceUpdate();
		}
	}

	/**
	 * ブロック要素を作成
	 */
	private createBlockElement(
		block: BlockNode,
		isActive: boolean
	): HTMLElement {
		// 全てのブロックタイプで div 要素を使用
		const blockElement = document.createElement("div");
		blockElement.className = `${BLOCK_CLASS}${
			isActive ? ` ${BLOCK_ACTIVE_CLASS}` : ""
		}`;
		blockElement.dataset.blockId = block.id;
		blockElement.tabIndex = -1;
		blockElement.dataset.blockType = block.type;
		if (block.parentId) {
			blockElement.dataset.parentBlockId = block.parentId;
		}
		blockElement.dataset.blockDepth = String(block.depth ?? 0);

		if (block.type === "heading" && block.metadata.headingLevel) {
			blockElement.dataset.headingLevel = String(
				block.metadata.headingLevel
			);
		}

		if (block.type === "listItem" && block.metadata.listType) {
			blockElement.dataset.listType = block.metadata.listType;
			if (typeof block.metadata.listNumber === "number") {
				blockElement.dataset.listNumber = String(
					block.metadata.listNumber
				);
			}
		}

		// 空ブロックはプレースホルダーの<br>を挿入
		if (block.html === "") {
			blockElement.innerHTML = '<br data-tategaki-placeholder="1">';
		} else {
			blockElement.innerHTML = block.html;
		}

		blockElement.style.minHeight = "1.2em";

		// 選択範囲の安定性のため、user-selectを設定
		blockElement.style.userSelect = "text";
		(blockElement.style as any).webkitUserSelect = "text";

		const isFrontmatter = Boolean(
			block.metadata &&
				(block.metadata as Record<string, unknown>).isFrontmatter
		);
		if (isFrontmatter) {
			blockElement.dataset.frontmatterBlock = "true";
			blockElement.classList.add(BLOCK_FRONTMATTER_CLASS);
			blockElement.style.display = "none";
			blockElement.setAttribute("aria-hidden", "true");
		}

		return blockElement;
	}

	/**
	 * 差分更新：特定のブロックのみを更新
	 */
	updateBlock(blockId: string, block: BlockNode): void {
		const blockElement = this.getBlockElement(blockId);
		if (!blockElement) {
			// ブロックが見つからない場合は全体を再レンダリング
			const blockIndex = this.currentBlocks.findIndex(
				(b) => b.id === blockId
			);
			if (blockIndex === -1) return;

			if (this.virtualizer) {
				this.virtualizer.updateItem(blockIndex);
			}
			return;
		}

		// HTMLが変わった場合のみ更新
		const newHtml =
			block.html === ""
				? '<br data-tategaki-placeholder="1">'
				: block.html;

		// リストアイテムの場合は、li要素内のdivを更新
		if (block.type === "listItem") {
			const liElement = blockElement.closest("li");
			if (liElement) {
				liElement.dataset.listDepth = String(block.depth ?? 0);
				liElement.dataset.listType =
					block.metadata.listType ?? "bullet";
				const innerDiv = liElement.querySelector(
					`[data-block-id="${blockId}"]`
				);
				if (innerDiv && innerDiv.innerHTML !== newHtml) {
					innerDiv.innerHTML = newHtml;
				}
			} else {
				// li要素が見つからない場合は、通常の更新
				if (blockElement.innerHTML !== newHtml) {
					blockElement.innerHTML = newHtml;
				}
			}
		} else {
			if (blockElement.innerHTML !== newHtml) {
				blockElement.innerHTML = newHtml;
			}
		}
	}

	setActiveBlock(blockId: string | null): void {
		if (this.activeBlockId === blockId) return;
		const prev = this.getBlockElement(this.activeBlockId);
		if (prev) {
			prev.classList.remove(BLOCK_ACTIVE_CLASS);
		}
		const next = this.getBlockElement(blockId);
		if (next) {
			next.classList.add(BLOCK_ACTIVE_CLASS);

			// 仮想化モードの場合、アクティブブロックが表示されるようにスクロール
			if (this.virtualizer) {
				const blockIndex = this.currentBlocks.findIndex(
					(b) => b.id === blockId
				);
				if (blockIndex !== -1) {
					this.virtualizer.scrollToIndex(blockIndex, {
						align: "center",
					});
				}
			}
		}
		this.activeBlockId = blockId;
	}

	getBlockElement(blockId: string | null): HTMLElement | null {
		if (!blockId) return null;
		return this.rootElement.querySelector<HTMLElement>(
			`[data-block-id="${blockId}"]`
		);
	}

	getRootElement(): HTMLElement {
		return this.rootElement;
	}

	getVirtualizationInfo(): {
		enabled: boolean;
		threshold: number;
		isVertical: boolean;
		isSuspended: boolean;
	} {
		return {
			enabled: this.options.enableVirtualization ?? true,
			threshold: this.options.virtualizationThreshold ?? 100,
			isVertical: this.options.isVertical ?? false,
			isSuspended: this.virtualizationSuspended,
		};
	}

	/**
	 * 仮想化の設定を更新
	 */
	updateVirtualizationSettings(
		options: Partial<BlockRendererOptions>,
		blocks?: readonly BlockNode[],
		activeBlockId?: string | null
	): void {
		let writingModeChanged = false;

		if (
			options.isVertical !== undefined &&
			options.isVertical !== this.options.isVertical
		) {
			writingModeChanged = true;
			this.options.isVertical = options.isVertical;
			this.applyScrollDirection();
			// 書字方向が変わった場合は Virtualizer を再構築
			if (this.virtualizer) {
				this.virtualizer.destroy();
				this.virtualizer = null;
			}
			// サイズキャッシュも無効化（高さ/幅の基準が変わるため）
			this.sizeCache = null;
		} else if (options.isVertical !== undefined) {
			this.options.isVertical = options.isVertical;
			this.applyScrollDirection();
		}
		if (options.enableVirtualization !== undefined) {
			this.options.enableVirtualization = options.enableVirtualization;
		}
		if (options.virtualizationThreshold !== undefined) {
			this.options.virtualizationThreshold =
				options.virtualizationThreshold;
		}

		// 呼び出し元から最新のブロックが渡された場合はそれを優先
		const nextBlocks = blocks ?? this.currentBlocks;
		const nextActive = activeBlockId ?? this.activeBlockId;

		// 設定変更後に再レンダリング（最新モデルを優先して使用）
		if (nextBlocks.length > 0) {
			this.render(nextBlocks, nextActive);
		} else if (writingModeChanged && this.virtualizer) {
			// ブロックがない場合でも Virtualizer の方向だけは反映
			this.virtualizer.destroy();
			this.virtualizer = null;
		}
	}

	/**
	 * 仮想化が有効かどうか
	 */
	isVirtualized(): boolean {
		return this.virtualizer !== null;
	}

	/**
	 * リソースをクリーンアップ
	 */
	destroy(): void {
		if (this.virtualizer) {
			this.virtualizer.destroy();
			this.virtualizer = null;
		}
		this.sizeCache = null;
		this.renderedBlockIds.clear();
		this.currentBlocks = [];
		this.virtualizationSuspended = false;
	}

	private initializeRoot(): HTMLElement {
		this.hostElement.innerHTML = "";

		const root = document.createElement("div");
		root.className = ROOT_CLASS;
		root.classList.add("text-justify-enabled");
		root.setAttribute("contenteditable", "true");
		root.setAttribute("spellcheck", "false");
		hostElementApplyBaseStyles(this.hostElement);
		this.hostElement.appendChild(root);
		return root;
	}

	private applyScrollDirection(): void {
		// スクロールはホスト要素で一元管理（縦横ともにホイールは上下で前後に進む）
		this.hostElement.style.overflowX = "hidden";
		this.hostElement.style.overflowY = "auto";
	}
}

function hostElementApplyBaseStyles(element: HTMLElement): void {
	element.classList.add("tategaki-block-editor", "tategaki-editor");
	element.style.position = "relative";
	element.style.width = "100%";
	element.style.height = "100%";
	element.style.overflowY = "auto";
	element.style.overflowX = "hidden";
	element.style.boxSizing = "border-box";
	element.style.contain = "layout paint style size";
}
