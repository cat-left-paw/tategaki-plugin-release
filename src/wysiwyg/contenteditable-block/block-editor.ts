import { TategakiV2Settings } from "../../types/settings";
import { BlockNode, DocumentModel } from "./block-model";
import { BlockRenderer } from "./block-renderer";
import {
	BlockInputManager,
	BlockInputManagerHooks,
	SetActiveBlockOptions,
} from "./block-input-manager";
import {
	FormattingManager,
	FormattingState,
} from "../contenteditable/formatting";
import { VerticalWritingManager } from "../contenteditable/vertical-writing";
import { MarkdownConverter } from "../contenteditable/markdown-converter";
import { BlockCommandManager, FormatCommand } from "./block-commands";
import { BlockSelectionManager } from "./block-selection-manager";
import { BlockHybridManager, BlockDisplayMode } from "./block-hybrid-manager";
import { getSelectedBlockElements } from "./utils/selection-utils";
import {
	documentToHtml,
	documentToMarkdown,
	htmlToDocument,
	markdownToDocument,
} from "./converters/markdown-parser";
import {
	convertAozoraRubySyntaxToHtml,
	convertRubyElementsToAozora,
} from "../../shared/aozora-ruby";
import { debugWarn } from "../../shared/logger";
import {
	SourceCodeMirrorAdapterImpl,
	SourceCodeMirrorAdapter,
} from "./source-mode-codemirror";

export interface BlockContentEditableEditorOptions {
	onUpdate?: () => void;
	onSelectionChange?: () => void;
}

interface HistoryEntry {
	model: DocumentModel;
	activeBlockId: string | null;
}

function remapBlocksWithFirstId(
	blocks: readonly BlockNode[],
	newFirstId: string
): BlockNode[] {
	if (!blocks.length) {
		return [];
	}

	const originalFirstId = blocks[0].id;
	if (originalFirstId === newFirstId) {
		return blocks.map((block) => ({
			...block,
			metadata: { ...block.metadata },
		}));
	}

	const idMap = new Map<string, string>();
	idMap.set(originalFirstId, newFirstId);

	return blocks.map((block, index) => {
		const remappedId = index === 0 ? newFirstId : block.id;
		if (!idMap.has(block.id)) {
			idMap.set(block.id, remappedId);
		}
		const parentId = block.parentId
			? idMap.get(block.parentId) ?? block.parentId
			: null;
		return {
			...block,
			id: remappedId,
			parentId,
			metadata: { ...block.metadata },
		};
	});
}

export class BlockContentEditableEditor {
	private readonly hostElement: HTMLElement;
	private settings: TategakiV2Settings;
	private readonly options: BlockContentEditableEditorOptions;
	private renderer: BlockRenderer | null = null;
	private inputManager: BlockInputManager | null = null;
	private model: DocumentModel = DocumentModel.createEmpty();
	private activeBlockId: string | null = null;
	private isInitialized = false;
	private formattingManager: FormattingManager | null = null;
	private enableRuby = true;
	private commandManager: BlockCommandManager | null = null;
	private selectionManager: BlockSelectionManager | null = null;
	private selectionTrackingEnabled = true;
	private selectionChangeHandler: ((event: Event) => void) | null = null;
	private pendingSelectionChangeUpdate: number | null = null;
	private verticalWritingManager: VerticalWritingManager | null = null;
	private hybridManager: BlockHybridManager | null = null;
	private history: HistoryEntry[] = [];
	private redoStack: HistoryEntry[] = [];
	private readonly maxHistory = 100;
	private sourceMode = false;
	private rootContentEditableSnapshot: string | null = null;
	private hostStyleSnapshot: {
		writingMode: string;
		textOrientation: string;
		overflowX: string;
		overflowY: string;
		userSelect: string;
		pointerEvents: string;
	} | null = null;

	// 新しいCodeMirrorベースのソースモード
	private codeMirrorAdapter: SourceCodeMirrorAdapter | null = null;
	private codeMirrorContainer: HTMLElement | null = null;
	private originalMarkdown: string = ""; // 元のMarkdown文字列を保持（ソースモード用）

	// 廃止予定: 古いtextareaベースのソースモード（まだ一部のメソッドで使用中）
	private sourceTextarea: HTMLTextAreaElement | null = null;
	private sourceInputHandler: ((event: Event) => void) | null = null;
	private sourceUpdateTimer: number | null = null;

	private wysiwygScrollPosition: number | null = null;
	private wysiwygScrollPositionHorizontal: number | null = null;
	private isComposing = false;
	private externalCaretMarker: HTMLElement | null = null;

	// 仮想ソースモード用フィールド
	private sourceContainer: HTMLElement | null = null;
	private sourceBlockElements: Map<string, HTMLElement> = new Map();
	private sourceEditingBlockId: string | null = null;
	private sourceEditTextarea: HTMLTextAreaElement | null = null;
	private sourceEditingLineIndex: number | null = null;
	private sourceLineElements: Map<string, HTMLElement[]> = new Map(); // blockId -> line elements
	private readonly handleSourceWheelEvent = (event: WheelEvent): void => {
		this.processSourceWheel(event);
	};
	private caretVisibilityFrame: number | null = null;

	// ソースモード検索用フィールド

	constructor(
		hostElement: HTMLElement,
		settings: TategakiV2Settings,
		options: BlockContentEditableEditorOptions = {}
	) {
		this.hostElement = hostElement;
		this.settings = settings;
		this.enableRuby = settings.wysiwyg?.enableRuby ?? true;
		this.options = options;
	}

	async initialize(): Promise<void> {
		const isVertical = this.settings.common.writingMode === "vertical-rl";
		this.renderer = new BlockRenderer(this.hostElement, {
			// 段階的検証のため閾値を緩めて仮想化を有効化
			enableVirtualization: false,
			virtualizationThreshold: Number.MAX_SAFE_INTEGER,
			isVertical: isVertical,
		});
		this.inputManager = new BlockInputManager(
			this.renderer.getRootElement(),
			this.createInputHooks(),
			{
				enableRuby: this.enableRuby,
			}
		);
		this.formattingManager = new BlockFormattingManager(
			this.renderer.getRootElement(),
			this
		);
		this.commandManager = new BlockCommandManager(
			this.model,
			this.renderer,
			(newModel) => {
				this.setModel(newModel, {
					render: true,
					emitUpdate: true,
					recordHistory: true,
				});
			}
		);
		this.selectionManager = new BlockSelectionManager(
			this.renderer.getRootElement(),
			this.renderer
		);
		this.verticalWritingManager = new VerticalWritingManager(
			this.renderer.getRootElement(),
			this.settings
		);
			this.hybridManager = new BlockHybridManager({
				getModel: () => this.model,
				getBlockElement: (id) => this.renderer?.getBlockElement(id) || null,
				markdownToHtml: (md) => {
					const doc = markdownToDocument(md, {
						enableRuby: this.enableRuby,
					});
					return doc.getBlocks()[0]?.html || "";
				},
				htmlToMarkdown: (html) => {
					return documentToMarkdown(
					DocumentModel.fromBlocks([
						{
							id: "temp",
							type: "paragraph",
							html,
							parentId: null,
							depth: 0,
							metadata: {},
						},
					])
				);
			},
			onBlockModeChange: (id, mode) => {
				this.emitUpdate();
			},
			onUpdate: () => {
				this.emitUpdate();
			},
		});

		this.registerSelectionChangeListener();

		// CodeMirrorアダプターの初期化
		this.initializeCodeMirror();

		if (this.model.getBlocks().length === 0) {
			this.model = DocumentModel.fromPlainText("");
		}
		this.applyLayoutSettings(this.settings);
		this.ensureActiveBlock();
		this.render();
		this.isInitialized = true;
	}

	setMarkdown(markdown: string): void {
		this.history = [];
		this.redoStack = [];
		this.originalMarkdown = markdown; // 元のMarkdownを保持
		this.setModel(
			markdownToDocument(markdown, { enableRuby: this.enableRuby }),
			{
				ensureActive: true,
				forceActive: true,
				render: true,
				emitUpdate: false,
				recordHistory: false,
			}
		);
		if (this.sourceMode && this.sourceTextarea) {
			this.sourceTextarea.value = markdown;
		}
	}

	getMarkdown(): string {
		// ソースモードの場合、CodeMirrorまたは元のMarkdownを返す
		if (this.sourceMode && this.codeMirrorAdapter) {
			return this.codeMirrorAdapter.getMarkdown();
		}

		// 仮想ソースモードでは、modelから直接取得
		// （編集中のブロックは既にmodelに反映されている）
		if (this.sourceMode) {
			// 最後の未保存の編集を適用
			if (this.sourceEditingBlockId && this.sourceEditTextarea) {
				if (this.sourceUpdateTimer !== null) {
					window.clearTimeout(this.sourceUpdateTimer);
					this.sourceUpdateTimer = null;
					this.updateSourceBlock(
						this.sourceEditingBlockId,
						this.sourceEditTextarea.value
					);
				}
			}
		}

		// 旧実装のフォールバック
		if (this.sourceMode && this.sourceTextarea) {
			return this.sourceTextarea.value;
		}

		// WYSIWYGモードの場合、元のMarkdownがあればそれを優先
		if (this.originalMarkdown) {
			return this.originalMarkdown;
		}

		return documentToMarkdown(this.model);
	}

	setHTML(html: string): void {
		this.history = [];
		this.redoStack = [];
		this.setModel(htmlToDocument(html), {
			ensureActive: true,
			forceActive: true,
			render: true,
			emitUpdate: false,
			recordHistory: false,
		});
		if (this.sourceMode && this.sourceTextarea) {
			this.sourceTextarea.value = documentToMarkdown(this.model);
		}
	}

	getHTML(): string {
		if (this.sourceMode && this.sourceTextarea) {
			return MarkdownConverter.markdownToHtml(this.sourceTextarea.value, {
				enableRuby: this.enableRuby,
			});
		}
		return documentToHtml(this.model);
	}

	getText(): string {
		if (this.sourceMode && this.sourceTextarea) {
			return this.sourceTextarea.value;
		}
		if (typeof window !== "undefined" && this.renderer) {
			return this.renderer.getRootElement().innerText;
		}
		return documentToMarkdown(this.model);
	}

	focus(): void {
		if (!this.isInitialized) return;
		const active = this.queryActiveBlock();
		active?.focus({ preventScroll: false });
	}

	blur(): void {
		if (!this.isInitialized) return;
		const active = this.queryActiveBlock();
		if (active) {
			active.blur();
		}
	}

	private applyRubyDisplayMode(): void {
		const blocks = this.model.getBlocks().map((block) => {
			const nextHtml = this.enableRuby
				? convertAozoraRubySyntaxToHtml(block.html)
				: convertRubyElementsToAozora(block.html);
			return {
				...block,
				html: nextHtml,
			};
		});

		this.setModel(DocumentModel.fromBlocks(blocks), {
			render: true,
			emitUpdate: false,
			recordHistory: false,
			ensureActive: true,
			forceActive: true,
		});
	}

	updateSettings(settings: TategakiV2Settings): void {
		const previousEnableRuby = this.enableRuby;
		this.settings = settings;
		this.enableRuby = settings.wysiwyg?.enableRuby ?? true;
		this.inputManager?.setEnableRuby(this.enableRuby);
		if (previousEnableRuby !== this.enableRuby) {
			this.applyRubyDisplayMode();
		}
		this.applyLayoutSettings(settings);
		this.applyScrollSettings(settings);
		this.verticalWritingManager?.updateSettings(settings);

		const isVertical = settings.common.writingMode === "vertical-rl";

		// 仮想化設定を更新
		if (this.renderer) {
			this.renderer.updateVirtualizationSettings(
				{
					isVertical: isVertical,
				},
				this.model.getBlocks(),
				this.activeBlockId
			);
		}

		if (isVertical) {
			this.verticalWritingManager?.applyVerticalStyles();
		} else {
			this.verticalWritingManager?.applyHorizontalStyles();
		}

		// 書字方向切り替え後、見出しの色を再適用
		const root = this.renderer?.getRootElement();
		if (root) {
			this.applyMarkdownElementStyles(root, settings);
		}

		// ソースモード中の場合は、ソースモードの書字方向も更新
		if (this.sourceMode) {
			this.applySourceModeWritingDirection();
			// 編集中のtextareaがある場合は再レンダリング
			if (
				this.sourceEditingBlockId !== null &&
				this.sourceEditingLineIndex !== null
			) {
				const blockId = this.sourceEditingBlockId;
				const lineIndex = this.sourceEditingLineIndex;
				this.stopEditingSourceLine(true);
				requestAnimationFrame(() => {
					this.startEditingSourceLine(blockId, lineIndex);
				});
			}
		}
	}

	private registerSelectionChangeListener(): void {
		if (this.selectionChangeHandler) {
			return;
		}

		this.selectionChangeHandler = (_event: Event) => {
			if (this.pendingSelectionChangeUpdate !== null) {
				cancelAnimationFrame(this.pendingSelectionChangeUpdate);
			}
			this.pendingSelectionChangeUpdate = requestAnimationFrame(() => {
				this.pendingSelectionChangeUpdate = null;
				this.handleDocumentSelectionChange();
			});
		};

		document.addEventListener(
			"selectionchange",
			this.selectionChangeHandler,
			true
		);
	}

	private unregisterSelectionChangeListener(): void {
		if (this.selectionChangeHandler) {
			document.removeEventListener(
				"selectionchange",
				this.selectionChangeHandler,
				true
			);
			this.selectionChangeHandler = null;
		}

		if (this.pendingSelectionChangeUpdate !== null) {
			cancelAnimationFrame(this.pendingSelectionChangeUpdate);
			this.pendingSelectionChangeUpdate = null;
		}
	}

	private handleDocumentSelectionChange(): void {
		if (!this.selectionTrackingEnabled || this.isInComposition()) {
			return;
		}

		const rootElement = this.renderer?.getRootElement();
		if (!rootElement) {
			return;
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return;
		}

		const anchorNode = selection.anchorNode;
		const focusNode = selection.focusNode;
		const anchorInside = anchorNode
			? rootElement.contains(anchorNode)
			: false;
		const focusInside = focusNode ? rootElement.contains(focusNode) : false;

		if (!anchorInside && !focusInside) {
			return;
		}

		const { startBlock } = getSelectedBlockElements(rootElement);
		const blockId = startBlock?.dataset.blockId ?? null;

		if (blockId && blockId !== this.activeBlockId) {
			this.setActiveBlock(blockId, { focus: false, preserveCaret: true });
			return;
		}

		this.options.onSelectionChange?.();
	}

	setSelectionTrackingEnabled(enabled: boolean): void {
		this.selectionTrackingEnabled = enabled;
	}

	isInComposition(): boolean {
		if (this.sourceMode) {
			return false;
		}
		return this.inputManager?.isComposingActive() ?? false;
	}

	getFormattingManager(): FormattingManager {
		if (!this.formattingManager) {
			throw new Error("BlockContentEditableEditor not initialized");
		}
		return this.formattingManager;
	}

	getBlocks(): readonly BlockNode[] {
		return this.model.getBlocks();
	}

	getDocumentModel(): DocumentModel {
		return this.model;
	}

	setDocumentModel(model: DocumentModel): void {
		this.setModel(model, {
			ensureActive: true,
			forceActive: true,
			render: true,
			emitUpdate: false,
			recordHistory: false,
		});
	}

	getActiveBlockId(): string | null {
		return this.activeBlockId;
	}

	selectAll(): void {
		if (this.sourceMode && this.sourceTextarea) {
			this.sourceTextarea.focus();
			this.sourceTextarea.select();
			return;
		}
		const renderer = this.renderer;
		if (!renderer) return;
		renderer.suspendVirtualization();
		const root = renderer.getRootElement();
		if (!root) return;
		const selection = window.getSelection();
		if (!selection) return;
		const range = document.createRange();
		range.selectNodeContents(root);
		selection.removeAllRanges();
		selection.addRange(range);
		const firstBlock = root.querySelector<HTMLElement>("[data-block-id]");
		if (firstBlock?.dataset.blockId) {
			this.setActiveBlock(firstBlock.dataset.blockId, { focus: false });
		}
	}

	isSourceModeActive(): boolean {
		return this.sourceMode;
	}

	toggleSourceMode(): boolean {
		if (this.sourceMode) {
			this.switchToWYSIWYGMode();
		} else {
			this.switchToSourceMode();
		}
		return this.sourceMode;
	}

	private enterSourceMode(): void {
		if (this.sourceMode) {
			return;
		}

		// WYSIWYGモードのスクロール位置を保存
		const root = this.renderer?.getRootElement();
		if (root) {
			this.wysiwygScrollPosition = root.scrollTop;
			this.wysiwygScrollPositionHorizontal = root.scrollLeft;
		}

		// hostElementのpointer-eventsを無効化してスクロールイベントが干渉しないようにする
		this.hostElement.style.pointerEvents = "none";

		// 仮想ソースコンテナを作成
		const container = this.createVirtualSourceContainer();

		// 書字方向とスクロール設定を適用
		this.applySourceModeWritingDirection();

		// 各ブロックを行単位でレンダリング
		this.renderVirtualSourceBlocks();

		// 表示切替
		container.style.display = "block";
		if (root) {
			root.style.display = "none";
		}
		this.inputManager?.setEnabled(false);
		this.sourceMode = true;

		// アクティブブロックの最初の行を編集モードにする
		if (this.activeBlockId) {
			requestAnimationFrame(() => {
				if (this.activeBlockId) {
					this.startEditingSourceLine(this.activeBlockId, 0);
				}
			});
		}
	}

	private exitSourceMode(applyChanges: boolean): void {
		if (!this.sourceMode) {
			return;
		}

		// 編集中のブロックがあれば終了
		if (this.sourceEditingBlockId) {
			this.stopEditingSourceBlock(applyChanges);
		}

		// コンテナを非表示
		if (this.sourceContainer) {
			this.sourceContainer.style.display = "none";
		}

		// hostElementのpointer-eventsを復元
		this.hostElement.style.pointerEvents = "";

		// WYSIWYGビューを表示
		const root = this.renderer?.getRootElement();
		if (root) {
			root.style.display = "";
		}
		this.sourceMode = false;
		this.inputManager?.setEnabled(true);
		this.cancelSourceUpdate();

		// WYSIWYGモードを再レンダリング
		this.render();

		// アクティブブロックを復元
		if (this.activeBlockId && this.renderer) {
			this.renderer.setActiveBlock(this.activeBlockId);
			const activeElement = root?.querySelector(
				`[data-block-id="${this.activeBlockId}"]`
			) as HTMLElement;
			if (activeElement) {
				activeElement.focus({ preventScroll: true });
			}
		}

		// スクロール位置を復元
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				this.restoreWysiwygScrollPosition(false);
			});
		});

		if (applyChanges) {
			this.emitUpdate();
		}
	}

	/**
	 * CodeMirrorアダプターの初期化
	 */
	private initializeCodeMirror(): void {
		// CodeMirror用のコンテナを作成
		this.codeMirrorContainer = document.createElement("div");
		this.codeMirrorContainer.className =
			"tategaki-source-codemirror-container";
		this.codeMirrorContainer.style.position = "absolute";
		this.codeMirrorContainer.style.top = "0";
		this.codeMirrorContainer.style.left = "0";
		this.codeMirrorContainer.style.width = "100%";
		this.codeMirrorContainer.style.height = "100%";
		this.codeMirrorContainer.style.overflow = "hidden"; // スクロールはCodeMirror側に委譲
		this.codeMirrorContainer.style.display = "none"; // 初期状態は非表示
		this.codeMirrorContainer.style.direction = "ltr"; // 常に横書き
		this.codeMirrorContainer.style.writingMode = "horizontal-tb"; // 横書きを強制
		this.codeMirrorContainer.style.textOrientation = "mixed";
		this.codeMirrorContainer.style.pointerEvents = "auto"; // マウスイベントを有効化
		this.codeMirrorContainer.style.zIndex = "1"; // 他の要素より前面に

		// テキスト選択を確実に有効化（全ベンダープレフィックス）
		this.codeMirrorContainer.style.userSelect = "text";
		this.codeMirrorContainer.style.setProperty(
			"-webkit-user-select",
			"text"
		);
		this.codeMirrorContainer.style.setProperty("-moz-user-select", "text");
		this.codeMirrorContainer.style.setProperty("-ms-user-select", "text");

		this.hostElement.appendChild(this.codeMirrorContainer);

		// CodeMirrorアダプターを初期化
		this.codeMirrorAdapter = new SourceCodeMirrorAdapterImpl();
		this.codeMirrorAdapter.initialize(this.codeMirrorContainer);

		// 更新コールバックを設定
		this.codeMirrorAdapter.onUpdate((markdown) => {
			// ソースモードでの編集を検知してモデルを更新
			// ただし、頻繁な更新を避けるため、ここでは何もしない
			// モード切替時に同期する
		});
	}

	/**
	 * WYSIWYGモード → ソースモード切替
	 */
	private switchToSourceMode(): void {
		if (!this.codeMirrorAdapter || !this.codeMirrorContainer) {
			console.error("CodeMirror adapter not initialized");
			return;
		}

		// 1. モデルからMarkdownを生成（最新の修飾を保持）
		const markdown = documentToMarkdown(this.model);
		this.originalMarkdown = markdown;

		// 2. WYSIWYGのスクロール位置を保存
		const rootElement = this.renderer?.getRootElement();
		if (rootElement) {
			this.wysiwygScrollPosition = rootElement.scrollTop;
			this.wysiwygScrollPositionHorizontal = rootElement.scrollLeft;
			this.rootContentEditableSnapshot =
				rootElement.getAttribute("contenteditable");
			rootElement.setAttribute("contenteditable", "false");
		}

		const host = this.hostElement;
		this.hostStyleSnapshot = {
			writingMode: host.style.writingMode,
			textOrientation: host.style.textOrientation,
			overflowX: host.style.overflowX,
			overflowY: host.style.overflowY,
			userSelect: host.style.userSelect,
			pointerEvents: host.style.pointerEvents,
		};
		host.style.writingMode = "horizontal-tb";
		host.style.textOrientation = "mixed";
		host.style.overflowX = "hidden";
		host.style.overflowY = "auto";
		host.style.userSelect = "text";
		host.style.pointerEvents = "auto";

		this.inputManager?.setEnabled(false);
		this.selectionManager?.setEnabled(false);

		// 3. ソースモードを表示
		this.codeMirrorAdapter.setMarkdown(markdown);
		this.codeMirrorAdapter.show();
		if (this.codeMirrorContainer) {
			this.codeMirrorContainer.style.display = "block";
		}

		// 4. WYSIWYGを非表示
		if (rootElement) {
			rootElement.style.display = "none";
		}

		// 5. フォーカスをCodeMirrorに移動
		this.codeMirrorAdapter.focus();

		this.sourceMode = true;
	}

	/**
	 * ソースモード → WYSIWYGモード切替
	 */
	private switchToWYSIWYGMode(): void {
		if (!this.codeMirrorAdapter || !this.codeMirrorContainer) {
			console.error("CodeMirror adapter not initialized");
			return;
		}

		// 1. ソースモードからMarkdownを取得して保存
		const markdown = this.codeMirrorAdapter.getMarkdown();
		this.originalMarkdown = markdown; // 編集後のMarkdownを保持

		// 2. エディタの位置を保存
		const position = this.codeMirrorAdapter.savePosition();

		// 3. Markdownからモデルを再構築
		// 完全に新規モデルを作成（ブロックIDは新規生成される）
		const newModel = markdownToDocument(markdown, {
			enableRuby: this.enableRuby,
		});

		// 4. モデルを更新
		this.setModel(newModel, {
			render: true,
			emitUpdate: true,
			recordHistory: true,
		});

		// 5. WYSIWYGを表示
		const rootElement = this.renderer?.getRootElement();
		if (rootElement) {
			rootElement.style.display = "";
			rootElement.setAttribute(
				"contenteditable",
				this.rootContentEditableSnapshot ?? "true"
			);
		}
		this.rootContentEditableSnapshot = null;

		const host = this.hostElement;
		if (this.hostStyleSnapshot) {
			host.style.writingMode = this.hostStyleSnapshot.writingMode;
			host.style.textOrientation = this.hostStyleSnapshot.textOrientation;
			host.style.overflowX = this.hostStyleSnapshot.overflowX;
			host.style.overflowY = this.hostStyleSnapshot.overflowY;
			host.style.userSelect = this.hostStyleSnapshot.userSelect;
			host.style.pointerEvents = this.hostStyleSnapshot.pointerEvents;
			this.hostStyleSnapshot = null;
		}

		// 6. ソースモードを非表示
		this.codeMirrorAdapter.hide();
		if (this.codeMirrorContainer) {
			this.codeMirrorContainer.style.display = "none";
		}

		// 7. スクロール位置を復元
		if (rootElement && this.wysiwygScrollPosition !== null) {
			rootElement.scrollTop = this.wysiwygScrollPosition;
		}
		if (rootElement && this.wysiwygScrollPositionHorizontal !== null) {
			rootElement.scrollLeft = this.wysiwygScrollPositionHorizontal;
		}

		// 8. アクティブブロックを復元
		// TODO: CodeMirrorの行番号からブロックIDを特定
		this.ensureActiveBlock();

		this.sourceMode = false;
		this.inputManager?.setEnabled(true);
		this.selectionManager?.setEnabled(true);
		this.applyScrollSettings(this.settings);
	}

	private render(): void {
		if (!this.renderer) return;

		// IME入力中は再レンダリングをスキップし、終了後にまとめて処理
		if (this.inputManager?.isComposingActive()) {
			return;
		}
		this.renderer.render(this.model.getBlocks(), this.activeBlockId);

		// レンダリング後にMarkdown要素のスタイルを再適用
		const root = this.renderer.getRootElement();
		if (root) {
			this.applyMarkdownElementStyles(root, this.settings);
		}
	}

	private ensureSourceTextarea(): HTMLTextAreaElement {
		if (this.sourceTextarea) {
			return this.sourceTextarea;
		}
		const textarea = document.createElement("textarea");
		textarea.className = "tategaki-block-editor-source";
		textarea.style.cssText = `
			display: none;
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			margin: 0;
			padding: 16px;
			border: none;
			outline: none;
			resize: none;
			font-family: var(--font-monospace);
			font-size: 14px;
			line-height: 1.6;
			background: var(--background-primary);
			color: var(--text-normal);
			contain: layout style paint;
		`;
		textarea.spellcheck = false;

		// IME composition イベント
		textarea.addEventListener("compositionstart", () => {
			this.isComposing = true;
		});

		textarea.addEventListener("compositionend", () => {
			this.isComposing = false;
			// composition終了時に一度だけ更新
			this.handleSourceInput();
		});

		// イベント伝播を停止してパフォーマンスを改善
		this.sourceInputHandler = (e: Event) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
			// IME入力中は更新をスキップ
			if (!this.isComposing) {
				this.handleSourceInput();
			}
		};
		textarea.addEventListener("input", this.sourceInputHandler);

		// keydownイベントも伝播停止
		textarea.addEventListener("keydown", (e) => {
			e.stopPropagation();
		});

		this.hostElement.appendChild(textarea);
		this.sourceTextarea = textarea;
		return textarea;
	}

	private handleSourceInput(): void {
		this.scheduleSourceUpdate();
	}

	private scheduleSourceUpdate(): void {
		if (this.sourceUpdateTimer !== null) {
			window.clearTimeout(this.sourceUpdateTimer);
		}
		this.sourceUpdateTimer = window.setTimeout(() => {
			this.sourceUpdateTimer = null;
			this.options.onUpdate?.();
		}, 500);
	}

	private cancelSourceUpdate(): void {
		if (this.sourceUpdateTimer !== null) {
			window.clearTimeout(this.sourceUpdateTimer);
			this.sourceUpdateTimer = null;
		}
	}

	private scrollBlockIntoView(
		blockElement: HTMLElement,
		options: { center?: boolean } = {}
	): void {
		const root = this.renderer?.getRootElement();
		if (!root) return;

		const center = options.center ?? false;
		const isVertical = this.isVerticalWritingMode();

		if (isVertical) {
			const visibleWidth =
				root.clientWidth || root.getBoundingClientRect().width;
			const offset = blockElement.offsetLeft;
			if (center) {
				const target = this.clamp(
					offset - visibleWidth / 2,
					0,
					root.scrollWidth - visibleWidth
				);
				root.scrollLeft = target;
			} else {
				const rootRect = root.getBoundingClientRect();
				const blockRect = blockElement.getBoundingClientRect();
				if (blockRect.left < rootRect.left) {
					const delta = rootRect.left - blockRect.left;
					const max = root.scrollWidth - visibleWidth;
					root.scrollLeft = this.clamp(
						root.scrollLeft - delta,
						0,
						max
					);
				} else if (blockRect.right > rootRect.right) {
					const delta = blockRect.right - rootRect.right;
					const max = root.scrollWidth - visibleWidth;
					root.scrollLeft = this.clamp(
						root.scrollLeft + delta,
						0,
						max
					);
				}
			}
			if (typeof blockElement.scrollIntoView === "function") {
				blockElement.scrollIntoView({
					behavior: "auto",
					block: "nearest",
					inline: center ? "center" : "nearest",
				});
			}
		} else {
			const visibleHeight =
				root.clientHeight || root.getBoundingClientRect().height;
			const offset = blockElement.offsetTop;
			if (center) {
				const target = this.clamp(
					offset - visibleHeight / 2,
					0,
					root.scrollHeight - visibleHeight
				);
				root.scrollTop = target;
			} else {
				const rootRect = root.getBoundingClientRect();
				const blockRect = blockElement.getBoundingClientRect();
				if (blockRect.top < rootRect.top) {
					const delta = rootRect.top - blockRect.top;
					const max = root.scrollHeight - visibleHeight;
					root.scrollTop = this.clamp(root.scrollTop - delta, 0, max);
				} else if (blockRect.bottom > rootRect.bottom) {
					const delta = blockRect.bottom - rootRect.bottom;
					const max = root.scrollHeight - visibleHeight;
					root.scrollTop = this.clamp(root.scrollTop + delta, 0, max);
				}
			}
			if (typeof blockElement.scrollIntoView === "function") {
				blockElement.scrollIntoView({
					behavior: "auto",
					block: center ? "center" : "nearest",
					inline: "nearest",
				});
			}
		}

		this.wysiwygScrollPosition = root.scrollTop;
		this.wysiwygScrollPositionHorizontal = root.scrollLeft;
	}

	private isVerticalWritingMode(): boolean {
		const mode = this.settings?.common?.writingMode ?? "horizontal-tb";
		return mode.startsWith("vertical");
	}

	private clamp(value: number, min: number, max: number): number {
		if (!Number.isFinite(value)) return value;
		if (!Number.isFinite(min)) min = 0;
		if (!Number.isFinite(max) || max < min) {
			return Math.max(min, value);
		}
		return Math.min(Math.max(value, min), max);
	}

	private normalizeBlockHtml(html: string): string {
		if (!html || html === "<br>") {
			return "";
		}
		return html;
	}

	private createVirtualSourceContainer(): HTMLElement {
		if (this.sourceContainer) {
			return this.sourceContainer;
		}

		const container = document.createElement("div");
		container.className = "tategaki-virtual-source-container";
		// 基本スタイル（書字方向は後で設定）
		container.style.cssText = `
			display: none;
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: var(--background-primary);
			color: var(--text-normal);
			font-family: var(--font-monospace);
			font-size: 14px;
			line-height: 1.6;
			padding: 16px;
			box-sizing: border-box;
			pointer-events: auto;
			z-index: 1;
		`;

		// 縦書き時のスクロール制御
		container.addEventListener("wheel", this.handleSourceWheelEvent, {
			passive: false,
		});

		this.hostElement.appendChild(container);
		this.sourceContainer = container;
		return container;
	}

	private applySourceModeWritingDirection(): void {
		if (!this.sourceContainer) return;

		const writingMode = this.settings.common.writingMode;
		const isVertical = writingMode === "vertical-rl";

		// 書字方向を設定
		this.sourceContainer.style.writingMode = writingMode;
		this.sourceContainer.style.direction = isVertical ? "ltr" : "ltr";

		// スクロール設定を書字方向に合わせる
		if (isVertical) {
			this.sourceContainer.style.overflowX = "auto";
			this.sourceContainer.style.overflowY = "hidden";
		} else {
			this.sourceContainer.style.overflowX = "hidden";
			this.sourceContainer.style.overflowY = "auto";
		}
	}

	private processSourceWheel(event: WheelEvent): boolean {
		const container = this.sourceContainer;
		if (!container) {
			return false;
		}

		const settings = this.settings;
		const isVerticalWriting = settings.common.writingMode === "vertical-rl";
		const { deltaX, deltaY, shiftKey } = event;

		if (isVerticalWriting) {
			if (shiftKey) {
				return false;
			}

			if (deltaY === 0 && deltaX === 0) {
				return false;
			}

			event.preventDefault();
			if (deltaY !== 0) {
				container.scrollLeft -= deltaY;
			} else if (deltaX !== 0) {
				container.scrollTop += deltaX;
			}
			return true;
		}

		// 横書き時はShift押下で横スクロールを制御
		if (!shiftKey) {
			return false;
		}

		if (deltaY === 0 && deltaX === 0) {
			return false;
		}

		event.preventDefault();
		if (deltaY !== 0) {
			container.scrollLeft -= deltaY;
		} else if (deltaX !== 0) {
			container.scrollTop += deltaX;
		}
		return true;
	}

	private renderVirtualSourceBlocks(): void {
		if (!this.sourceContainer) return;

		this.sourceContainer.innerHTML = "";
		this.sourceBlockElements.clear();
		this.sourceLineElements.clear();

		const blocks = this.model.getBlocks();

		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const blockMarkdown = documentToMarkdown(
				DocumentModel.fromBlocks([block])
			);

			// ブロック全体のコンテナ
			const blockEl = document.createElement("div");
			blockEl.className = "tategaki-source-block";
			blockEl.dataset.blockId = block.id;
			blockEl.style.cssText = `
				position: relative;
				margin-bottom: 8px;
				pointer-events: auto;
			`;

			// Markdownを行ごとに分割
			const lines = blockMarkdown.split("\n");
			const lineElements: HTMLElement[] = [];

			for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
				const line = lines[lineIndex];

				const lineEl = document.createElement("div");
				lineEl.className = "tategaki-source-line";
				lineEl.dataset.blockId = block.id;
				lineEl.dataset.lineIndex = lineIndex.toString();
				lineEl.style.cssText = `
					position: relative;
					cursor: text;
					padding: 2px 8px;
					border-radius: 3px;
					transition: background-color 0.15s ease;
					min-height: 1.6em;
				`;

				const pre = document.createElement("pre");
				pre.style.cssText = `
					margin: 0;
					padding: 0;
					font-family: inherit;
					font-size: inherit;
					line-height: inherit;
					white-space: pre-wrap;
					word-break: break-word;
					overflow-wrap: break-word;
					background: transparent;
					border: none;
					display: inline;
				`;
				// 空行の場合は空白を表示
				pre.textContent = line || " ";

				lineEl.appendChild(pre);

				// クリックイベント - 行をクリックすると編集開始
				lineEl.addEventListener("click", () => {
					this.startEditingSourceLine(block.id, lineIndex);
				});

				// ホバーエフェクト
				lineEl.addEventListener("mouseenter", () => {
					if (
						this.sourceEditingBlockId !== block.id ||
						this.sourceEditingLineIndex !== lineIndex
					) {
						lineEl.style.backgroundColor =
							"var(--background-modifier-hover)";
					}
				});
				lineEl.addEventListener("mouseleave", () => {
					if (
						this.sourceEditingBlockId !== block.id ||
						this.sourceEditingLineIndex !== lineIndex
					) {
						lineEl.style.backgroundColor = "transparent";
					}
				});

				blockEl.appendChild(lineEl);
				lineElements.push(lineEl);
			}

			this.sourceContainer.appendChild(blockEl);
			this.sourceBlockElements.set(block.id, blockEl);
			this.sourceLineElements.set(block.id, lineElements);
		}
	}

	private startEditingSourceBlock(blockId: string): void {
		// この メソッドは廃止予定 - startEditingSourceLine を使用
		this.startEditingSourceLine(blockId, 0);
	}

	private stopEditingSourceLine(apply: boolean): void {
		if (
			this.sourceEditingBlockId === null ||
			this.sourceEditingLineIndex === null
		)
			return;

		const blockId = this.sourceEditingBlockId;
		const lineIndex = this.sourceEditingLineIndex;
		const lineElements = this.sourceLineElements.get(blockId);

		if (!lineElements || !lineElements[lineIndex]) return;

		const lineEl = lineElements[lineIndex];

		if (this.sourceEditTextarea && apply) {
			// 編集内容を保存
			const newLineText = this.sourceEditTextarea.value;

			// ブロック全体のMarkdownを再構築
			const block = this.model.getBlockById(blockId);
			if (block) {
				const blockMarkdown = documentToMarkdown(
					DocumentModel.fromBlocks([block])
				);
				const lines = blockMarkdown.split("\n");

				// 編集した行を置き換え
				lines[lineIndex] = newLineText;
				const newBlockMarkdown = lines.join("\n");

				// ブロックを更新
					const newDoc = markdownToDocument(newBlockMarkdown, {
						enableRuby: this.enableRuby,
					});
				const newBlocks = newDoc.getBlocks();

				if (newBlocks.length === 1) {
					const [remappedBlock] = remapBlocksWithFirstId(
						newBlocks,
						blockId
					);
					if (remappedBlock) {
						this.model = this.model.updateBlock(remappedBlock);
					}
				} else if (newBlocks.length > 1) {
					// 複数ブロックに分割された場合
					const blocks = this.model.getBlocks();
					const index = blocks.findIndex((b) => b.id === blockId);
					if (index !== -1) {
						const remappedBlocks = remapBlocksWithFirstId(
							newBlocks,
							blockId
						);
						const updatedBlocks = [
							...blocks.slice(0, index),
							remappedBlocks[0],
							...remappedBlocks.slice(1),
							...blocks.slice(index + 1),
						];
						this.model = DocumentModel.fromBlocks(updatedBlocks);
					}
				} else {
					// 空の場合
					this.model = this.model.updateBlock({
						...block,
						id: blockId,
						html: "",
					});
				}

				// 表示を更新
				this.renderVirtualSourceBlocks();

				// 更新通知
				this.options.onUpdate?.();
			}
		}

		// textareaを削除
		if (this.sourceEditTextarea) {
			this.sourceEditTextarea.remove();
			this.sourceEditTextarea = null;
		}

		// preを再表示
		const pre = lineEl.querySelector("pre");
		if (pre && !apply) {
			pre.style.display = "";
		}

		// 背景色をリセット
		lineEl.style.backgroundColor = "transparent";

		this.sourceEditingBlockId = null;
		this.sourceEditingLineIndex = null;
	}

	private startEditingSourceLine(blockId: string, lineIndex: number): void {
		// 既に同じ行を編集中の場合は何もしない
		if (
			this.sourceEditingBlockId === blockId &&
			this.sourceEditingLineIndex === lineIndex
		) {
			if (this.sourceEditTextarea) {
				this.sourceEditTextarea.focus();
			}
			return;
		}

		// 別の行を編集中の場合は終了
		if (
			this.sourceEditingBlockId !== null &&
			this.sourceEditingLineIndex !== null
		) {
			this.stopEditingSourceLine(true);
		}

		this.sourceEditingBlockId = blockId;
		this.sourceEditingLineIndex = lineIndex;

		const lineElements = this.sourceLineElements.get(blockId);
		if (!lineElements || !lineElements[lineIndex]) {
			debugWarn(
				"[VirtualSource] Line element not found:",
				blockId,
				lineIndex
			);
			return;
		}

		const lineEl = lineElements[lineIndex];
		const block = this.model.getBlockById(blockId);
		if (!block) {
			debugWarn("[VirtualSource] Block not found in model:", blockId);
			return;
		}

		const blockMarkdown = documentToMarkdown(
			DocumentModel.fromBlocks([block])
		);
		const lines = blockMarkdown.split("\n");
		const lineText = lines[lineIndex] || "";

		// pre要素を非表示
		const pre = lineEl.querySelector("pre");
		if (pre) {
			pre.style.display = "none";
		}

		// textareaを作成（単一行用）
		const textarea = document.createElement("textarea");
		textarea.className = "tategaki-source-line-editor";
		textarea.value = lineText;

		// 書字方向を設定から取得
		const writingMode = this.settings.common.writingMode;
		const isVertical = writingMode === "vertical-rl";

		textarea.style.cssText = `
			${isVertical ? "height: 100%;" : "width: 100%;"}
			${isVertical ? "min-width: 1.6em;" : "min-height: 1.6em;"}
			margin: 0;
			padding: 2px 4px;
			border: 1px solid var(--background-modifier-border-focus);
			border-radius: 3px;
			outline: none;
			resize: none;
			font-family: inherit;
			font-size: inherit;
			line-height: inherit;
			background: var(--background-primary-alt);
			color: var(--text-normal);
			box-sizing: border-box;
			writing-mode: ${writingMode};
			direction: ltr;
			overflow: hidden;
		`;
		textarea.spellcheck = false;

		// 自動リサイズ
		const autoResize = () => {
			if (isVertical) {
				textarea.style.width = "auto";
				textarea.style.width =
					Math.max(textarea.scrollWidth, 28) + "px";
			} else {
				textarea.style.height = "auto";
				textarea.style.height =
					Math.max(textarea.scrollHeight, 28) + "px";
			}
		};

		textarea.addEventListener("input", () => {
			autoResize();
		});

		// Enterキーで次の行へ移動
		textarea.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				// 現在の編集を保存して次の行へ
				this.stopEditingSourceLine(true);
				requestAnimationFrame(() => {
					this.startEditingSourceLine(blockId, lineIndex + 1);
				});
			} else if (e.key === "Escape") {
				e.preventDefault();
				this.stopEditingSourceLine(false);
			}
		});

		textarea.addEventListener("blur", () => {
			// blurしたら編集終了
			setTimeout(() => {
				if (
					this.sourceEditingBlockId === blockId &&
					this.sourceEditingLineIndex === lineIndex
				) {
					this.stopEditingSourceLine(true);
				}
			}, 100);
		});

		// ホイールイベントはコンテナ側で処理
		textarea.addEventListener("wheel", (e) => {
			if (this.processSourceWheel(e)) {
				e.stopPropagation();
			}
		});

		lineEl.appendChild(textarea);
		this.sourceEditTextarea = textarea;

		// フォーカスして自動リサイズ
		requestAnimationFrame(() => {
			textarea.focus();
			autoResize();
		});

		// 行の背景色を変更
		lineEl.style.backgroundColor =
			"var(--background-modifier-active-hover)";
	}

	private scheduleSourceBlockUpdate(blockId: string, markdown: string): void {
		if (this.sourceUpdateTimer !== null) {
			window.clearTimeout(this.sourceUpdateTimer);
		}
		this.sourceUpdateTimer = window.setTimeout(() => {
			this.sourceUpdateTimer = null;
			this.updateSourceBlock(blockId, markdown);
		}, 500);
	}

		private updateSourceBlock(blockId: string, markdown: string): void {
			const newDoc = markdownToDocument(markdown, {
				enableRuby: this.enableRuby,
			});
		const newBlocks = newDoc.getBlocks();
		const currentBlock = this.model.getBlockById(blockId);

		// 単一ブロックの場合は置き換え
		if (newBlocks.length === 1) {
			const [remappedBlock] = remapBlocksWithFirstId(newBlocks, blockId);
			if (remappedBlock) {
				this.model = this.model.updateBlock(remappedBlock);
			}
		} else if (newBlocks.length > 1) {
			// 複数ブロックに分割された場合は、最初のブロックを置き換え、残りを挿入
			const blocks = this.model.getBlocks();
			const index = blocks.findIndex((b) => b.id === blockId);
			if (index !== -1) {
				const remappedBlocks = remapBlocksWithFirstId(
					newBlocks,
					blockId
				);
				const updatedBlocks = [
					...blocks.slice(0, index),
					remappedBlocks[0],
					...remappedBlocks.slice(1),
					...blocks.slice(index + 1),
				];
				this.model = DocumentModel.fromBlocks(updatedBlocks);
			}
		} else {
			// 空の場合は空ブロックに
			if (currentBlock) {
				this.model = this.model.updateBlock({
					...currentBlock,
					html: "",
				});
			}
		}

		this.options.onUpdate?.();
	}

	private stopEditingSourceBlock(apply: boolean): void {
		// この メソッドは廃止予定 - stopEditingSourceLine を使用
		this.stopEditingSourceLine(apply);
	}

	private restoreWysiwygScrollPosition(centerActiveBlock: boolean): void {
		const root = this.renderer?.getRootElement();
		if (!root) return;

		if (centerActiveBlock) {
			// アクティブブロックを表示領域の中心付近へ移動
			if (this.activeBlockId) {
				const activeElement = root.querySelector(
					`[data-block-id="${this.activeBlockId}"]`
				) as HTMLElement;
				if (activeElement) {
					this.scrollBlockIntoView(activeElement, { center: true });
				}
			}
		} else {
			// 保存しておいたスクロール位置を復元
			const isVertical = this.isVerticalWritingMode();
			const savedVertical = this.wysiwygScrollPosition;
			const savedHorizontal = this.wysiwygScrollPositionHorizontal;

			if (!isVertical && savedVertical !== null) {
				root.scrollTop = savedVertical;
				setTimeout(() => {
					if (
						root &&
						savedVertical !== null &&
						root.scrollTop !== savedVertical
					) {
						root.scrollTop = savedVertical;
					}
				}, 50);
			} else if (isVertical && savedHorizontal !== null) {
				root.scrollLeft = savedHorizontal;
				setTimeout(() => {
					if (
						root &&
						savedHorizontal !== null &&
						root.scrollLeft !== savedHorizontal
					) {
						root.scrollLeft = savedHorizontal;
					}
				}, 50);
			}
		}

		this.wysiwygScrollPosition = root.scrollTop;
		this.wysiwygScrollPositionHorizontal = root.scrollLeft;
	}

	private ensureActiveBlock(force = false): void {
		if (!force && this.activeBlockId) {
			const exists = this.model.getBlockById(this.activeBlockId);
			if (exists) return;
		}
		const first = this.model.getBlocks()[0];
		this.activeBlockId = first ? first.id : null;
		if (this.renderer) {
			this.renderer.setActiveBlock(this.activeBlockId);
		}
	}

	private queryActiveBlock(): HTMLElement | null {
		if (!this.activeBlockId) return null;
		return this.renderer?.getBlockElement(this.activeBlockId) ?? null;
	}

	private createInputHooks(): BlockInputManagerHooks {
		return {
			getModel: () => this.model,
			setModel: (model, options) => this.setModel(model, options),
			getActiveBlockId: () => this.activeBlockId,
			setActiveBlock: (id, options) => this.setActiveBlock(id, options),
			getBlockElement: (id) =>
				this.renderer?.getBlockElement(id ?? null) ?? null,
			render: () => this.render(),
			emitUpdate: () => this.emitUpdate(),
			selectAll: () => this.selectAll(),
			isBlockInPlainMode: (blockId) => {
				return this.hybridManager?.getBlockMode(blockId) === "plain";
			},
			undo: () => {
				this.undo();
			},
			redo: () => {
				this.redo();
			},
			onCompositionStart: () => {
				this.setSelectionTrackingEnabled(false);
			},
			onCompositionEnd: () => {
				this.setSelectionTrackingEnabled(true);
			},
		};
	}

	private setModel(
		model: DocumentModel,
		options: {
			emitUpdate?: boolean;
			ensureActive?: boolean;
			forceActive?: boolean;
			render?: boolean;
			recordHistory?: boolean;
		} = {}
	): void {
		const shouldRecord =
			options.recordHistory ?? options.emitUpdate ?? false;
		if (shouldRecord) {
			this.pushHistory(
				this.createHistoryEntry(this.model, this.activeBlockId)
			);
			this.redoStack = [];
		}

		this.model = model;

		// コマンドマネージャーのモデルも更新
		if (this.commandManager) {
			this.commandManager.updateModel(model);
		}

		if (options.ensureActive ?? true) {
			this.ensureActiveBlock(options.forceActive ?? false);
		}
		if (options.render) {
			this.render();
		}
		if (options.emitUpdate) {
			// WYSIWYGモードで編集があった場合、originalMarkdownを更新
			if (!this.sourceMode) {
				this.originalMarkdown = documentToMarkdown(this.model);
			}
			this.emitUpdate();
		}
	}

	private pushHistory(entry: HistoryEntry): void {
		const clone = this.createHistoryEntry(entry.model, entry.activeBlockId);
		this.history.push(clone);
		if (this.history.length > this.maxHistory) {
			this.history.shift();
		}
	}

	private createHistoryEntry(
		model: DocumentModel,
		activeBlockId: string | null
	): HistoryEntry {
		return {
			model: DocumentModel.fromBlocks(
				model.getBlocks().map((block) => ({ ...block }))
			),
			activeBlockId,
		};
	}

	private applyHistoryEntry(entry: HistoryEntry): void {
		this.model = entry.model;
		this.activeBlockId = entry.activeBlockId;
		if (
			!this.activeBlockId ||
			!this.model.getBlockById(this.activeBlockId)
		) {
			this.ensureActiveBlock(true);
		}
		this.render();
		if (this.activeBlockId && this.renderer) {
			this.renderer.setActiveBlock(this.activeBlockId);
		}
		this.emitUpdate();
	}

	private applyLayoutSettings(settings: TategakiV2Settings): void {
		const host = this.hostElement;
		const root = this.renderer?.getRootElement();
		const { common } = settings;
		const normalizedRubySize = Math.max(
			0.2,
			Math.min(1.0, common.rubySize ?? 0.5)
		);
		const rubyValue = normalizedRubySize.toString();

		host.style.writingMode = common.writingMode;
		host.style.textOrientation =
			common.writingMode === "vertical-rl" ? "mixed" : "initial";
		host.style.fontFamily = common.fontFamily;
		host.style.fontSize = `${common.fontSize}px`;
		host.style.lineHeight = `${common.lineHeight}`;
		host.style.color = common.textColor;
		host.style.backgroundColor = common.backgroundColor;
		host.style.whiteSpace = "pre-wrap";
		host.style.wordBreak = "break-word";
		host.style.overflowWrap = "break-word";
		host.style.padding = "20px";
		host.style.boxSizing = "border-box";
		host.style.width = "100%";
		host.style.height = "100%";
		host.style.setProperty("--tategaki-text-color", common.textColor);
		host.style.setProperty("--tategaki-caret-color", common.textColor);
		host.style.setProperty("--tategaki-ruby-size", rubyValue);
		host.style.setProperty("--ruby-size", rubyValue);
		// overflow は applyScrollSettings() で設定
		host.style.contain = "layout paint style";
		host.style.willChange = "contents";

		if (root) {
			root.style.width = "100%";
			root.style.minHeight = "100%";
			root.style.padding = "0";
			root.style.backgroundColor = "transparent";
			root.style.writingMode = "inherit";
			root.style.textOrientation = "inherit";
			root.style.setProperty("--tategaki-text-color", common.textColor);
			root.style.setProperty("--tategaki-caret-color", common.textColor);
			root.style.setProperty("--tategaki-ruby-size", rubyValue);
			root.style.setProperty("--ruby-size", rubyValue);
			root.dataset.writingMode = common.writingMode;
			root.classList.add("text-justify-enabled");
			root.style.textAlign = "justify";
			root.style.textAlignLast = "auto";
			root.style.setProperty("text-justify", "inter-ideograph");
			// ContentEditableのデフォルト動作を維持しつつ、コードブロックの改行を許可
			root.style.whiteSpace = "pre-wrap";

			// コードブロック用の背景色を設定
			const codeBackgroundColor = this.getCodeBackgroundColor(
				common.backgroundColor
			);
			root.style.setProperty(
				"--tategaki-code-background",
				codeBackgroundColor
			);

			// 見出しのマージンを0に設定し、文字色をプラグイン設定に統一（!important相当）
			const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
			headings.forEach((heading: Element) => {
				const headingEl = heading as HTMLElement;
				headingEl.style.setProperty(
					"margin-block-start",
					"0",
					"important"
				);
				headingEl.style.setProperty(
					"margin-block-end",
					"0",
					"important"
				);
				headingEl.style.setProperty("margin-top", "0", "important");
				headingEl.style.setProperty("margin-bottom", "0", "important");
				headingEl.style.setProperty(
					"color",
					common.textColor,
					"important"
				);
			});

			// リストマーカー、コード要素、見出しのスタイルを適用
			this.applyMarkdownElementStyles(root, settings);
		}

		if (settings.common.writingMode === "vertical-rl") {
			this.verticalWritingManager?.applyVerticalStyles();
		} else {
			this.verticalWritingManager?.applyHorizontalStyles();
		}
	}

	/**
	 * コードブロック用の背景色を生成（透明度付きの背景色）
	 */
	private getCodeBackgroundColor(backgroundColor: string): string {
		try {
			// HEXカラーの場合
			if (backgroundColor.startsWith("#")) {
				const color = backgroundColor.replace(/#/g, "");
				const r = parseInt(color.substring(0, 2), 16);
				const g = parseInt(color.substring(2, 4), 16);
				const b = parseInt(color.substring(4, 6), 16);
				// 輝度を計算
				const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
				if (luminance > 0.5) {
					// 明るい背景の場合、暗い色に15%の透明度を適用
					return `rgba(0, 0, 0, 0.15)`;
				} else {
					// 暗い背景の場合、明るい色に15%の透明度を適用
					return `rgba(255, 255, 255, 0.15)`;
				}
			}
			// RGB/RGBAの場合
			if (backgroundColor.startsWith("rgb")) {
				const match = backgroundColor.match(/\d+/g);
				if (match && match.length >= 3) {
					const r = parseInt(match[0]);
					const g = parseInt(match[1]);
					const b = parseInt(match[2]);
					const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
					if (luminance > 0.5) {
						// 明るい背景の場合、暗い色に15%の透明度を適用
						return `rgba(0, 0, 0, 0.15)`;
					} else {
						// 暗い背景の場合、明るい色に15%の透明度を適用
						return `rgba(255, 255, 255, 0.15)`;
					}
				}
			}
		} catch (_error) {
			// エラーが発生した場合は、デフォルトの透明度付き背景色を使用
		}
		// フォールバック: 透明度付きの背景色
		return `rgba(128, 128, 128, 0.15)`;
	}

	/**
	 * Markdown要素（見出し・リストマーカー・コード要素）にプラグイン設定のスタイルを適用
	 */
	private applyMarkdownElementStyles(
		host: HTMLElement,
		settings: TategakiV2Settings
	): void {
		try {
			const textColor = settings.common.textColor;
			const codeBackgroundColor = this.getCodeBackgroundColor(
				settings.common.backgroundColor
			);
			if (!textColor) return;

			// 見出しの文字色を設定
			const headings = host.querySelectorAll("h1, h2, h3, h4, h5, h6");
			headings.forEach((heading) => {
				const headingEl = heading as HTMLElement;
				headingEl.style.setProperty("color", textColor, "important");
			});

			// リストマーカーの色を設定
			const listElements = host.querySelectorAll("ul, ol");
			listElements.forEach((listEl) => {
				const listElement = listEl as HTMLElement;
				listElement.style.setProperty("--list-marker-color", textColor);
				listElement.style.setProperty(
					"--tategaki-text-color",
					textColor
				);

				// 階層に応じたバレット種類の設定
				const depth = this.calculateListDepth(listElement);
				if (listElement.tagName === "UL") {
					if (depth === 0) {
						listElement.style.setProperty(
							"list-style-type",
							"disc",
							"important"
						);
					} else if (depth === 1) {
						listElement.style.setProperty(
							"list-style-type",
							"circle",
							"important"
						);
					} else {
						listElement.style.setProperty(
							"list-style-type",
							"square",
							"important"
						);
					}
				} else if (listElement.tagName === "OL") {
					if (depth === 0) {
						listElement.style.setProperty(
							"list-style-type",
							"decimal",
							"important"
						);
					} else if (depth === 1) {
						listElement.style.setProperty(
							"list-style-type",
							"lower-alpha",
							"important"
						);
					} else {
						listElement.style.setProperty(
							"list-style-type",
							"lower-roman",
							"important"
						);
					}
				}

				if (settings.common.writingMode === "vertical-rl") {
					const firstListItem = listElement.querySelector("li");
					const blockDiv = firstListItem?.querySelector(
						".tategaki-block[data-block-type='listItem']"
					) as HTMLElement | null;
					const depthAttr =
						firstListItem?.dataset.listDepth ??
						blockDiv?.dataset.blockDepth ??
						"0";
					const itemDepth = Number.parseInt(depthAttr, 10) || 0;
					const indentStepEm = 1.5;
					const offsetEm = itemDepth > 0 ? indentStepEm : 0;
					listElement.style.setProperty(
						"margin-top",
						offsetEm > 0 ? `${offsetEm}em` : "0",
						"important"
					);
					listElement.style.setProperty(
						"margin-right",
						"0",
						"important"
					);
					listElement.style.setProperty(
						"margin-bottom",
						"0",
						"important"
					);
					listElement.style.setProperty(
						"margin-left",
						"0",
						"important"
					);
					listElement.style.setProperty(
						"padding-bottom",
						"0",
						"important"
					);
					listElement.style.setProperty(
						"padding-right",
						"0",
						"important"
					);
					listElement.style.setProperty(
						"padding-left",
						"0",
						"important"
					);
					listElement.style.setProperty(
						"list-style-position",
						"outside",
						"important"
					);
					// 最上位リスト（depth 0）の場合、padding-topを設定してマーカーのスペースを確保
					// 縦書きモードでは padding-top が左方向（上方向）のパディングになる
					if (itemDepth === 0) {
						listElement.style.setProperty(
							"padding-top",
							"1.5em",
							"important"
						);
					} else {
						listElement.style.setProperty(
							"padding-top",
							"0",
							"important"
						);
					}
				}
			});

			const listItems = host.querySelectorAll("li");
			listItems.forEach((li) => {
				const liElement = li as HTMLElement;
				liElement.style.setProperty("--tategaki-text-color", textColor);
				if (settings.common.writingMode === "vertical-rl") {
					liElement.style.setProperty("margin", "0", "important");
					liElement.style.setProperty(
						"padding-inline-end",
						"0",
						"important"
					);
					liElement.style.setProperty(
						"padding-inline-start",
						"0",
						"important"
					);
					liElement.style.setProperty(
						"padding-block",
						"0",
						"important"
					);
					liElement.style.setProperty(
						"list-style-position",
						"outside",
						"important"
					);
					liElement.style.setProperty(
						"display",
						"list-item",
						"important"
					);
					const blockDiv = liElement.querySelector(
						".tategaki-block[data-block-type='listItem']"
					) as HTMLElement | null;
					if (blockDiv) {
						// リストアイテムの深さを取得
						const depthAttr =
							liElement.dataset.listDepth ??
							blockDiv.dataset.blockDepth ??
							"0";
						const itemDepth = Number.parseInt(depthAttr, 10) || 0;

						blockDiv.style.setProperty(
							"display",
							"block",
							"important"
						);
						blockDiv.style.setProperty(
							"width",
							"100%",
							"important"
						);
						blockDiv.style.setProperty(
							"margin-left",
							"0",
							"important"
						);
						blockDiv.style.setProperty(
							"margin-top",
							"0",
							"important"
						);
						blockDiv.style.setProperty(
							"margin-right",
							"0",
							"important"
						);
						blockDiv.style.setProperty(
							"margin-bottom",
							"0",
							"important"
						);
						blockDiv.style.setProperty("padding", "0", "important");
					}
				}
			});

			// コードブロック（pre要素）
			const preElements = host.querySelectorAll("pre");
			preElements.forEach((pre) => {
				const preElement = pre as HTMLElement;
				// CSSで背景が設定されているため、JavaScriptでは設定しない
				preElement.style.setProperty("color", textColor, "important");
				preElement.style.setProperty(
					"writing-mode",
					"horizontal-tb",
					"important"
				);
				preElement.style.setProperty(
					"text-orientation",
					"mixed",
					"important"
				);
				preElement.style.setProperty("direction", "ltr", "important");
				preElement.style.setProperty(
					"unicode-bidi",
					"normal",
					"important"
				);
				preElement.style.setProperty(
					"font-family",
					'"Courier New", Courier, monospace',
					"important"
				);
				preElement.style.setProperty("padding", "1em", "important");
				preElement.style.setProperty(
					"border-radius",
					"4px",
					"important"
				);
				preElement.style.setProperty("margin-top", "1em", "important");
				preElement.style.setProperty(
					"margin-bottom",
					"1em",
					"important"
				);
				preElement.style.setProperty("margin-left", "0", "important");
				preElement.style.setProperty("margin-right", "0", "important");
				preElement.style.setProperty("max-width", "100%", "important");
				preElement.style.setProperty("overflow-x", "auto", "important");
				preElement.style.setProperty(
					"white-space",
					"pre-wrap",
					"important"
				);
				preElement.style.setProperty(
					"word-wrap",
					"break-word",
					"important"
				);
				preElement.style.setProperty(
					"overflow-wrap",
					"break-word",
					"important"
				);
				preElement.style.setProperty("line-height", "1.6", "important");

				// pre内のcode要素の背景を透明にする
				const codeInPre = preElement.querySelectorAll("code");
				codeInPre.forEach((code) => {
					const codeInPreElement = code as HTMLElement;
					codeInPreElement.style.setProperty(
						"background",
						"transparent",
						"important"
					);
					codeInPreElement.style.setProperty(
						"color",
						textColor,
						"important"
					);
					codeInPreElement.style.setProperty(
						"white-space",
						"pre-wrap",
						"important"
					);
					codeInPreElement.style.setProperty(
						"word-wrap",
						"break-word",
						"important"
					);
					codeInPreElement.style.setProperty(
						"overflow-wrap",
						"break-word",
						"important"
					);
					codeInPreElement.style.setProperty(
						"display",
						"block",
						"important"
					);
				});
			});

			// 引用ブロック（blockquote要素）
			const blockquoteElements = host.querySelectorAll("blockquote");
			blockquoteElements.forEach((blockquote) => {
				const blockquoteElement = blockquote as HTMLElement;
				// CSSで背景が設定されているため、JavaScriptでは設定しない
				blockquoteElement.style.setProperty(
					"font-style",
					"italic",
					"important"
				);
				blockquoteElement.style.setProperty("margin", "0", "important");
				blockquoteElement.style.setProperty(
					"padding-inline-start",
					"2em",
					"important"
				);
				blockquoteElement.style.setProperty(
					"border-inline-start",
					"4px solid rgba(128, 128, 128, 0.3)",
					"important"
				);

				// 縦書きモードでは引用ラインを非表示
				if (settings.common.writingMode === "vertical-rl") {
					blockquoteElement.style.setProperty(
						"border-inline-start",
						"none",
						"important"
					);
					blockquoteElement.style.setProperty(
						"border-left",
						"none",
						"important"
					);
				}

				// blockquote内のp要素もイタリックに
				const paragraphs = blockquoteElement.querySelectorAll("p");
				paragraphs.forEach((p) => {
					const pElement = p as HTMLElement;
					pElement.style.setProperty(
						"font-style",
						"italic",
						"important"
					);
					pElement.style.setProperty("margin-top", "0", "important");
					pElement.style.setProperty(
						"margin-bottom",
						"0",
						"important"
					);
				});
			});

			// インラインコード（code要素、ただしpre内のcodeは除外）
			const codeElements = host.querySelectorAll("code");
			codeElements.forEach((code) => {
				const codeElement = code as HTMLElement;
				// pre要素内のcodeは除外（コードブロック内のcode）
				if (codeElement.closest("pre")) {
					return;
				}
				codeElement.style.setProperty(
					"background",
					codeBackgroundColor,
					"important"
				);
				codeElement.style.setProperty("color", textColor, "important");
				codeElement.style.setProperty(
					"font-family",
					'"Courier New", Courier, monospace',
					"important"
				);
				codeElement.style.setProperty(
					"padding",
					"0.1em 0.3em",
					"important"
				);
				codeElement.style.setProperty(
					"border-radius",
					"2px",
					"important"
				);
				codeElement.style.setProperty(
					"white-space",
					"nowrap",
					"important"
				);

				// 縦書きモードでも回転させず、通常の縦書きテキストとして表示
				// writing-modeは親要素から継承されるため、明示的に設定しない
				if (settings.common.writingMode === "vertical-rl") {
					codeElement.style.setProperty(
						"display",
						"inline",
						"important"
					);
					codeElement.style.setProperty(
						"vertical-align",
						"baseline",
						"important"
					);
					codeElement.style.setProperty("margin", "0", "important");
				} else {
					// 横書きモードでは通常通り
					codeElement.style.setProperty(
						"writing-mode",
						"horizontal-tb",
						"important"
					);
					codeElement.style.setProperty(
						"text-orientation",
						"mixed",
						"important"
					);
					codeElement.style.setProperty(
						"direction",
						"ltr",
						"important"
					);
					codeElement.style.setProperty(
						"unicode-bidi",
						"normal",
						"important"
					);
				}
			});
		} catch (_error) {
			debugWarn(
				"[BlockContentEditableEditor] applyMarkdownElementStyles error:",
				_error
			);
		}
	}

	/**
	 * リスト要素の階層の深さを計算
	 * @param listElement ulまたはol要素
	 * @returns 階層の深さ（0が最上位）
	 */
	private calculateListDepth(listElement: HTMLElement): number {
		let depth = 0;
		let current: HTMLElement | null = listElement.parentElement;

		while (current) {
			if (current.tagName === "UL" || current.tagName === "OL") {
				depth++;
			}
			current = current.parentElement;
		}

		return depth;
	}

	private applyScrollSettings(settings: TategakiV2Settings): void {
		const isHorizontalWriting =
			settings.common.writingMode === "horizontal-tb";

		if (isHorizontalWriting) {
			this.hostElement.style.overflowX = "hidden";
			this.hostElement.style.overflowY = "auto";
		} else {
			this.hostElement.style.overflowX = "auto";
			this.hostElement.style.overflowY = "hidden";
		}
	}

	private setActiveBlock(
		blockId: string | null,
		options: SetActiveBlockOptions = {}
	): void {
		if (this.renderer?.isVirtualizationSuspended()) {
			const selection =
				typeof window !== "undefined" ? window.getSelection() : null;
			if (!selection || selection.isCollapsed) {
				this.renderer.resumeVirtualization();
			}
		}

		if (blockId === this.activeBlockId) {
			if (options.focus) {
				if (options.preserveCaret) {
					this.focusBlockPreservingCaret(blockId, options.caret);
				} else {
					this.focusBlock(blockId, options.caret);
				}
			}
			if (this.selectionTrackingEnabled) {
				this.options.onSelectionChange?.();
			}
			return;
		}

		// プレーン編集モードが有効な場合、フォーカス追従
		if (this.hybridManager?.isPlainEditingModeActive() && blockId) {
			this.hybridManager.focusBlock(blockId);
		}

		this.activeBlockId = blockId;
		if (this.renderer) {
			this.renderer.setActiveBlock(blockId);
		}
		if (options.focus) {
			if (options.preserveCaret) {
				this.focusBlockPreservingCaret(blockId, options.caret);
			} else {
				this.focusBlock(blockId, options.caret);
			}
		}
		if (this.selectionTrackingEnabled) {
			this.options.onSelectionChange?.();
		}
	}

	private focusBlock(
		blockId: string | null,
		caret: "start" | "end" = "end"
	): void {
		if (!blockId) return;
		const blockElement = this.renderer?.getBlockElement(blockId);
		const rootElement = this.renderer?.getRootElement();
		if (!blockElement || !rootElement) return;
		const selection = window.getSelection();
		if (!selection) return;
		const range = document.createRange();
		range.selectNodeContents(blockElement);
		range.collapse(caret !== "end");
		selection.removeAllRanges();
		selection.addRange(range);
		this.ensureCaretVisible(blockElement, caret);
		if (this.hybridManager?.isPlainMode(blockId)) {
			blockElement.focus({ preventScroll: false });
			return;
		}
		rootElement.focus({ preventScroll: false });
	}

	private focusBlockPreservingCaret(
		blockId: string | null,
		caret: "start" | "end" | undefined
	): void {
		if (!blockId) return;
		const blockElement = this.renderer?.getBlockElement(blockId);
		if (!blockElement) return;
		blockElement.focus({ preventScroll: false });
		this.ensureCaretVisible(blockElement, caret ?? "end");
	}

	private emitUpdate(): void {
		this.options.onUpdate?.();
	}

	private ensureCaretVisible(
		blockElement: HTMLElement,
		caret: "start" | "end"
	): void {
		const rootElement = this.renderer?.getRootElement();
		if (!rootElement) {
			return;
		}
		if (this.caretVisibilityFrame !== null) {
			cancelAnimationFrame(this.caretVisibilityFrame);
			this.caretVisibilityFrame = null;
		}
		this.caretVisibilityFrame = requestAnimationFrame(() => {
			this.caretVisibilityFrame = null;
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) {
				blockElement.scrollIntoView({
					block: "nearest",
					inline: "nearest",
				});
				return;
			}
			if (this.scrollCaretWithMarker(selection)) {
				return;
			}
			this.scrollCaretByRect(rootElement, blockElement, caret !== "end");
		});
	}

	private scrollCaretWithMarker(selection: Selection): boolean {
		try {
			const range = selection.getRangeAt(0).cloneRange();
			range.collapse(true);
			const marker = document.createElement("span");
			marker.dataset.tategakiCaretMarker = "true";
			marker.style.cssText =
				"display:inline-block;width:1px;height:1.2em;margin:0;padding:0;opacity:0;pointer-events:none;";
			range.insertNode(marker);
			marker.scrollIntoView({ block: "nearest", inline: "nearest" });
			const restoreRange = document.createRange();
			restoreRange.setStartAfter(marker);
			restoreRange.collapse(true);
			selection.removeAllRanges();
			selection.addRange(restoreRange);
			marker.remove();
			return true;
		} catch (error) {
			return false;
		}
	}

	private scrollCaretByRect(
		rootElement: HTMLElement,
		blockElement: HTMLElement,
		collapseToStart: boolean
	): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			blockElement.scrollIntoView({
				block: "nearest",
				inline: "nearest",
			});
			return;
		}
		const activeRange = selection.getRangeAt(0);
		const caretRange = activeRange.cloneRange();
		caretRange.collapse(collapseToStart);
		let caretRect = caretRange.getBoundingClientRect();
		if (
			(caretRect.width === 0 && caretRect.height === 0) ||
			!isFinite(caretRect.top)
		) {
			caretRect = blockElement.getBoundingClientRect();
		}
		const rootRect = rootElement.getBoundingClientRect();
		const computedStyle = window.getComputedStyle(rootElement);
		const writingMode = computedStyle.writingMode || "";
		const isVertical = writingMode.includes("vertical");
		const margin = 12;

		if (isVertical) {
			if (caretRect.left < rootRect.left + margin) {
				const delta = caretRect.left - (rootRect.left + margin);
				if (typeof rootElement.scrollBy === "function") {
					rootElement.scrollBy({ left: delta, behavior: "auto" });
				} else {
					rootElement.scrollLeft += delta;
				}
			} else if (caretRect.right > rootRect.right - margin) {
				const delta = caretRect.right - (rootRect.right - margin);
				if (typeof rootElement.scrollBy === "function") {
					rootElement.scrollBy({ left: delta, behavior: "auto" });
				} else {
					rootElement.scrollLeft += delta;
				}
			}
			if (caretRect.top < rootRect.top + margin) {
				const delta = caretRect.top - (rootRect.top + margin);
				if (typeof rootElement.scrollBy === "function") {
					rootElement.scrollBy({ top: delta, behavior: "auto" });
				} else {
					rootElement.scrollTop += delta;
				}
			} else if (caretRect.bottom > rootRect.bottom - margin) {
				const delta = caretRect.bottom - (rootRect.bottom - margin);
				if (typeof rootElement.scrollBy === "function") {
					rootElement.scrollBy({ top: delta, behavior: "auto" });
				} else {
					rootElement.scrollTop += delta;
				}
			}
		} else {
			if (caretRect.top < rootRect.top + margin) {
				const delta = caretRect.top - (rootRect.top + margin);
				if (typeof rootElement.scrollBy === "function") {
					rootElement.scrollBy({ top: delta, behavior: "auto" });
				} else {
					rootElement.scrollTop += delta;
				}
			} else if (caretRect.bottom > rootRect.bottom - margin) {
				const delta = caretRect.bottom - (rootRect.bottom - margin);
				if (typeof rootElement.scrollBy === "function") {
					rootElement.scrollBy({ top: delta, behavior: "auto" });
				} else {
					rootElement.scrollTop += delta;
				}
			}
		}
	}

	getRootElement(): HTMLElement {
		if (!this.renderer) {
			throw new Error("BlockContentEditableEditor not initialized");
		}
		return this.renderer.getRootElement();
	}

	getBlockElement(blockId: string): HTMLElement | null {
		return this.renderer?.getBlockElement(blockId) ?? null;
	}

	showExternalCaretFromMarkdown(line: number, column: number): void {
		if (!this.renderer) {
			return;
		}
		const blocks = this.model.getBlocks();
		if (blocks.length === 0) {
			this.clearExternalCaret();
			return;
		}
		const clampedLine = this.clamp(line, 0, blocks.length - 1);
		const targetBlock = blocks[clampedLine];
		const blockId = targetBlock.id;
		const blockElement = this.renderer.getBlockElement(blockId);
		if (!blockElement) {
			this.clearExternalCaret();
			return;
		}

		const root = this.renderer.getRootElement();
		const marker = this.ensureExternalCaretMarker();

		// ブロック要素の位置を取得
		const blockRect = blockElement.getBoundingClientRect();
		const rootRect = root.getBoundingClientRect();

		// フォントサイズを取得（1文字分のオフセット用）
		const computedStyle = getComputedStyle(blockElement);
		const fontSize = parseFloat(computedStyle.fontSize || "16");

		// ルート要素内での相対位置を計算（スクロールオフセットを考慮）
		const offsetLeft = blockRect.left - rootRect.left + root.scrollLeft;
		const offsetTop = blockRect.top - rootRect.top + root.scrollTop;

		if (this.isVerticalWritingMode()) {
			// 縦書きモード: 行は縦に並ぶので、行頭インジケーターは横向き
			// 右に1文字分オフセット
			const blockWidth = blockRect.width;
			const indicatorHeight = 4; // インジケーターの太さ
			const indicatorWidth = Math.min(blockWidth * 0.3, 60); // ブロック幅の30%、最大60px
			marker.style.width = `${indicatorWidth}px`;
			marker.style.height = `${indicatorHeight}px`;
			marker.style.left = `${
				offsetLeft + blockWidth - indicatorWidth + fontSize
			}px`; // 右端 + 1文字分
			marker.style.top = `${offsetTop}px`;
			marker.dataset.orientation = "vertical";
		} else {
			// 横書きモード: 行は横に並ぶので、行頭インジケーターは縦向き
			// 下に1文字分オフセット
			const blockHeight = blockRect.height;
			const indicatorWidth = 4; // インジケーターの太さ
			const indicatorHeight = Math.min(blockHeight * 0.3, 60); // ブロック高さの30%、最大60px
			marker.style.width = `${indicatorWidth}px`;
			marker.style.height = `${indicatorHeight}px`;
			marker.style.left = `${offsetLeft}px`;
			marker.style.top = `${offsetTop + fontSize}px`; // 上端 + 1文字分
			marker.dataset.orientation = "horizontal";
		}

		marker.style.opacity = "1";
		this.scrollBlockIntoView(blockElement);
	}

	clearExternalCaret(): void {
		if (this.externalCaretMarker) {
			this.externalCaretMarker.remove();
			this.externalCaretMarker = null;
		}
	}

	private ensureExternalCaretMarker(): HTMLElement {
		const root = this.renderer?.getRootElement();
		if (!root) {
			throw new Error("BlockContentEditableEditor root element missing");
		}
		if (this.externalCaretMarker && this.externalCaretMarker.isConnected) {
			return this.externalCaretMarker;
		}
		const marker = document.createElement("div");
		marker.className = "tategaki-external-caret";
		marker.style.position = "absolute";
		marker.style.pointerEvents = "none";
		marker.style.background = "var(--interactive-accent, #1e90ff)";
		marker.style.opacity = "0";
		marker.style.zIndex = "20";
		marker.style.transition = "opacity 0.1s";
		root.appendChild(marker);
		this.externalCaretMarker = marker;
		return marker;
	}

	private getNodeAndOffsetFromTextOffset(
		block: HTMLElement,
		offset: number
	): { node: Node; offset: number } | null {
		const walker = document.createTreeWalker(
			block,
			NodeFilter.SHOW_TEXT,
			null
		);
		let currentOffset = 0;
		let node: Node | null;
		const textLength = this.getBlockTextLength(block);
		const clampedOffset = this.clamp(offset, 0, textLength);

		while ((node = walker.nextNode())) {
			const textNode = node as Text;
			const content = textNode.textContent ?? "";
			const length = content.length;
			if (length === 0) {
				continue;
			}
			if (currentOffset + length >= clampedOffset) {
				return {
					node: textNode,
					offset: clampedOffset - currentOffset,
				};
			}
			currentOffset += length;
		}

		return block.lastChild
			? {
					node: block.lastChild,
					offset: (block.lastChild.textContent ?? "").length,
			  }
			: { node: block, offset: block.childNodes.length };
	}

	private getBlockTextLength(block: HTMLElement): number {
		return typeof (block as any).innerText === "string"
			? (block as any).innerText.length
			: (block.textContent ?? "").length;
	}

	destroy(): void {
		this.clearExternalCaret();
		this.unregisterSelectionChangeListener();
		this.inputManager?.destroy();
		this.inputManager = null;

		// レンダラーのクリーンアップ（仮想化を含む）
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}

		// 選択マネージャーのクリーンアップ
		if (this.selectionManager) {
			this.selectionManager.destroy();
			this.selectionManager = null;
		}

		this.formattingManager = null;
		this.verticalWritingManager = null;

		// CodeMirrorアダプターのクリーンアップ
		if (this.codeMirrorAdapter) {
			this.codeMirrorAdapter.destroy();
			this.codeMirrorAdapter = null;
		}
		if (this.codeMirrorContainer) {
			this.codeMirrorContainer.remove();
			this.codeMirrorContainer = null;
		}

		// 旧ソースモードのクリーンアップ（廃止予定だが、まだ使用中）
		if (this.sourceTextarea) {
			if (this.sourceInputHandler) {
				this.sourceTextarea.removeEventListener(
					"input",
					this.sourceInputHandler
				);
			}
			this.sourceTextarea.remove();
			this.sourceTextarea = null;
			this.sourceInputHandler = null;
		}

		// 仮想ソースモードのクリーンアップ
		if (this.sourceContainer) {
			this.sourceContainer.removeEventListener(
				"wheel",
				this.handleSourceWheelEvent
			);
			this.sourceContainer.remove();
			this.sourceContainer = null;
		}
		this.sourceBlockElements.clear();
		this.sourceLineElements.clear();
		this.sourceEditingBlockId = null;
		this.sourceEditingLineIndex = null;
		this.sourceEditTextarea = null;

		this.sourceMode = false;
		this.cancelSourceUpdate();
	}

	applySourceFormattingCommand(command: FormatCommand): boolean {
		if (!this.sourceMode || !this.codeMirrorAdapter) {
			return false;
		}

		switch (command) {
			case "bold":
				return this.codeMirrorAdapter.applyInlineFormat("bold");
			case "italic":
				return this.codeMirrorAdapter.applyInlineFormat("italic");
			case "underline":
				return this.codeMirrorAdapter.applyInlineFormat("underline");
			case "strikethrough":
				return this.codeMirrorAdapter.applyInlineFormat(
					"strikethrough"
				);
			case "heading1":
				return this.codeMirrorAdapter.toggleHeading(1);
			case "heading2":
				return this.codeMirrorAdapter.toggleHeading(2);
			case "heading3":
				return this.codeMirrorAdapter.toggleHeading(3);
			case "heading4":
				return this.codeMirrorAdapter.toggleHeading(4);
			case "heading5":
				return this.codeMirrorAdapter.toggleHeading(5);
			case "heading6":
				return this.codeMirrorAdapter.toggleHeading(6);
			case "bulletList":
				return this.codeMirrorAdapter.toggleList("bullet");
			case "orderedList":
				return this.codeMirrorAdapter.toggleList("ordered");
			case "blockquote":
				return this.codeMirrorAdapter.toggleBlockquote();
			case "clearFormatting":
				return this.codeMirrorAdapter.clearFormatting();
			default:
				return false;
		}
	}

	applySourceInsertHorizontalRule(): boolean {
		if (!this.sourceMode || !this.codeMirrorAdapter) {
			return false;
		}
		return this.codeMirrorAdapter.insertHorizontalRule();
	}

	applySourceInsertLink(url: string): boolean {
		if (!this.sourceMode || !this.codeMirrorAdapter || !url) {
			return false;
		}
		return this.codeMirrorAdapter.insertLink(url);
	}

	hasSourceSelection(): boolean {
		if (!this.sourceMode || !this.codeMirrorAdapter) {
			return false;
		}
		return this.codeMirrorAdapter.hasSelection();
	}

	insertTextIntoSource(text: string): boolean {
		if (!this.sourceMode || !this.codeMirrorAdapter) {
			return false;
		}
		return this.codeMirrorAdapter.insertText(text);
	}

	// ========================================
	// Hybrid Editing Methods (Plain Block Editing)
	// ========================================

	/**
	 * プレーン編集モードを切り替え（段落フォーカス追従型）
	 */
	togglePlainEditMode(): void {
		if (!this.hybridManager) {
			return;
		}

		if (this.hybridManager.isPlainEditingModeActive()) {
			// プレーン編集モードを終了
			this.hybridManager.deactivatePlainEditingMode();
		} else {
			// プレーン編集モードを開始
			this.hybridManager.activatePlainEditingMode();
			// 現在のブロックをプレーン表示にする
			if (this.activeBlockId) {
				this.hybridManager.focusBlock(this.activeBlockId);
			}
		}
	}

	/**
	 * プレーン編集モードが有効かどうか
	 */
	isPlainEditingModeActive(): boolean {
		return this.hybridManager?.isPlainEditingModeActive() ?? false;
	}

	/**
	 * 指定されたブロックのプレーン編集を開始
	 */
	startPlainEdit(blockId: string): void {
		if (!this.hybridManager) {
			return;
		}
		this.hybridManager.startPlainEdit(blockId);
	}

	/**
	 * 指定されたブロックのプレーン編集を終了
	 * @param save true: 変更を保存, false: キャンセル
	 */
	endPlainEdit(blockId: string, save: boolean): void {
		if (!this.hybridManager) {
			return;
		}
		this.hybridManager.endPlainEdit(blockId, save);
	}

	/**
	 * 指定されたブロックの表示モードを取得
	 */
	getBlockDisplayMode(blockId: string): BlockDisplayMode {
		if (!this.hybridManager) {
			return BlockDisplayMode.DECORATED;
		}
		return this.hybridManager.getBlockMode(blockId);
	}

	/**
	 * プレーン編集モードかどうかを判定
	 */
	isPlainEditMode(blockId: string): boolean {
		return this.getBlockDisplayMode(blockId) === BlockDisplayMode.PLAIN;
	}

	focusSourceEditor(): void {
		if (this.sourceMode && this.codeMirrorAdapter) {
			this.codeMirrorAdapter.focus();
		}
	}

	undo(): boolean {
		if (this.history.length === 0) {
			return false;
		}
		const entry = this.history.pop()!;
		this.redoStack.push(
			this.createHistoryEntry(this.model, this.activeBlockId)
		);
		this.applyHistoryEntry(entry);
		return true;
	}

	redo(): boolean {
		if (this.redoStack.length === 0) {
			return false;
		}
		const entry = this.redoStack.pop()!;
		this.history.push(
			this.createHistoryEntry(this.model, this.activeBlockId)
		);
		this.applyHistoryEntry(entry);
		return true;
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}
}

class BlockFormattingManager extends FormattingManager {
	private readonly blockEditor: BlockContentEditableEditor;

	constructor(
		editorElement: HTMLElement,
		editor: BlockContentEditableEditor
	) {
		super(editorElement);
		this.blockEditor = editor;
	}

	override undo(): void {
		this.blockEditor.undo();
	}

	override redo(): void {
		this.blockEditor.redo();
	}

	override canUndo(): boolean {
		return this.blockEditor.canUndo();
	}

	override canRedo(): boolean {
		return this.blockEditor.canRedo();
	}

	override getFormattingState(): FormattingState {
		if (this.blockEditor.isSourceModeActive()) {
			return this.createDefaultFormattingState();
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return this.createDefaultFormattingState();
		}

		const anchorNode = selection.anchorNode;
		const focusNode = selection.focusNode;
		const referenceNode = this.getPriorityNode(anchorNode, focusNode);
		const element = this.normalizeToElement(referenceNode);

		if (!element) {
			return this.createDefaultFormattingState();
		}

		const state = this.createDefaultFormattingState();
		state.bold = this.hasFormatting(element, ["strong", "b"]);
		state.italic = this.hasFormatting(element, ["em", "i"]);
		state.underline =
			this.hasFormatting(element, ["u"]) ||
			this.hasTextDecoration(element, "underline");
		state.strikethrough =
			this.hasFormatting(element, ["del", "s", "strike"]) ||
			this.hasTextDecoration(element, "line-through");
		state.highlight = !!this.closestWithinEditor(element, "mark");

		const headingEl = this.closestWithinEditor(
			element,
			"h1, h2, h3, h4, h5, h6"
		);
		if (headingEl) {
			const level = parseInt(headingEl.tagName.charAt(1), 10);
			if (!Number.isNaN(level)) {
				state.heading = level;
			}
		}

		const listItemEl = this.closestWithinEditor(element, "li");
		if (listItemEl) {
			state.bulletList = !!this.closestWithinEditor(listItemEl, "ul");
			state.orderedList = !!this.closestWithinEditor(listItemEl, "ol");
		}

		state.blockquote = !!this.closestWithinEditor(element, "blockquote");

		return state;
	}

	// 複数ブロック対応の書式適用メソッドをオーバーライド
	override toggleBold(): void {
		if (!this.executeBlockCommand("bold")) {
			super.toggleBold();
		}
	}

	override toggleItalic(): void {
		if (!this.executeBlockCommand("italic")) {
			super.toggleItalic();
		}
	}

	override toggleUnderline(): void {
		if (!this.executeBlockCommand("underline")) {
			super.toggleUnderline();
		}
	}

	override toggleHighlight(): void {
		if (!this.executeBlockCommand("highlight")) {
			super.toggleHighlight();
		}
	}

	override toggleStrikethrough(): void {
		if (!this.executeBlockCommand("strikethrough")) {
			super.toggleStrikethrough();
		}
	}

	override setHeading(level: number): void {
		const commandMap: Record<number, FormatCommand> = {
			1: "heading1",
			2: "heading2",
			3: "heading3",
			4: "heading4",
			5: "heading5",
			6: "heading6",
		};
		if (!this.executeBlockHeading(level, commandMap)) {
			super.setHeading(level);
		}
	}

	override toggleBulletList(): void {
		if (!this.executeBlockCommand("bulletList")) {
			super.toggleBulletList();
		}
	}

	override toggleOrderedList(): void {
		if (!this.executeBlockCommand("orderedList")) {
			super.toggleOrderedList();
		}
	}

	override toggleBlockquote(): void {
		if (!this.executeBlockCommand("blockquote")) {
			super.toggleBlockquote();
		}
	}

	override clearFormatting(): void {
		if (this.blockEditor.isSourceModeActive()) {
			if (
				this.blockEditor.applySourceFormattingCommand("clearFormatting")
			) {
				return;
			}
		}

		// 親クラスのclearFormattingを実行
		super.clearFormatting();

		// 変更をブロックモデルに反映し、同期
		const activeBlockId = this.blockEditor.getActiveBlockId();
		if (activeBlockId) {
			const blockElement =
				this.blockEditor.getBlockElement(activeBlockId);
			if (blockElement) {
				// モデルを更新して同期
				const currentModel = this.blockEditor.getDocumentModel();
				const newModel = currentModel.updateBlockHtml(
					activeBlockId,
					blockElement.innerHTML
				);
				(this.blockEditor as any).setModel(newModel, {
					ensureActive: true,
					forceActive: false,
					render: false,
					emitUpdate: true,
					recordHistory: true,
				});
			}
		}
	}

	private executeBlockCommand(command: FormatCommand): boolean {
		if (this.blockEditor.isSourceModeActive()) {
			return this.blockEditor.applySourceFormattingCommand(command);
		}

		const commandManager = (this.blockEditor as any)
			.commandManager as BlockCommandManager | null;
		if (!commandManager) {
			return false;
		}
		return commandManager.executeCommand(command);
	}

	private executeBlockHeading(
		level: number,
		commandMap: Record<number, FormatCommand>
	): boolean {
		const activeBlockId = this.blockEditor.getActiveBlockId();

		if (this.blockEditor.isSourceModeActive()) {
			const command = commandMap[level];
			return command
				? this.blockEditor.applySourceFormattingCommand(command)
				: false;
		}

		const commandManager = (this.blockEditor as any)
			.commandManager as BlockCommandManager | null;
		if (!commandManager) {
			return false;
		}
		return commandManager.applyHeadingToSelection(
			level,
			activeBlockId ?? undefined
		);
	}

	override insertHorizontalRule(): void {
		if (!this.blockEditor.applySourceInsertHorizontalRule()) {
			super.insertHorizontalRule();
		}
	}

	override insertLink(url: string): void {
		if (!url || !this.blockEditor.applySourceInsertLink(url)) {
			super.insertLink(url);
		}
	}

	private createDefaultFormattingState(): FormattingState {
		return {
			bold: false,
			italic: false,
			strikethrough: false,
			underline: false,
			highlight: false,
			heading: 0,
			bulletList: false,
			orderedList: false,
			blockquote: false,
		};
	}

	private getPriorityNode(
		anchor: Node | null,
		focus: Node | null
	): Node | null {
		if (anchor === focus || !focus) {
			return anchor;
		}
		if (!anchor) {
			return focus;
		}
		return anchor;
	}

	private normalizeToElement(node: Node | null): HTMLElement | null {
		if (!node) return null;
		if (node.nodeType === Node.ELEMENT_NODE) {
			return node as HTMLElement;
		}
		return node.parentElement;
	}

	private hasFormatting(element: HTMLElement, tagNames: string[]): boolean {
		return tagNames.some((tag) => !!this.closestWithinEditor(element, tag));
	}

	private hasTextDecoration(
		element: HTMLElement,
		decoration: string
	): boolean {
		let current: HTMLElement | null = element;
		const root = this.getEditorElement();
		while (current && current !== root) {
			const style = window.getComputedStyle(current);
			if (style.textDecorationLine.includes(decoration)) {
				return true;
			}
			current = current.parentElement;
		}
		return false;
	}

	private closestWithinEditor(
		element: HTMLElement,
		selector: string
	): HTMLElement | null {
		let current: HTMLElement | null = element;
		const root = this.getEditorElement();
		while (current) {
			if (current.matches(selector)) {
				return current;
			}
			if (current === root) {
				break;
			}
			current = current.parentElement;
		}
		return null;
	}
}
