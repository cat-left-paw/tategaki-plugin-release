import {
	ItemView,
	Scope,
	MarkdownView,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	ViewStateResult,
	finishRenderMath,
	renderMath,
	setIcon,
} from "obsidian";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { lowlight } from "lowlight";
import type { MarkdownRenderChild } from "obsidian";
import TategakiV2Plugin from "../core/plugin";
import type {
	TategakiV2Settings,
	WritingMode,
	CommonSettings,
} from "../types/settings";
import { DEFAULT_V2_SETTINGS } from "../types/settings";
import { createAozoraRubyRegExp } from "../shared/aozora-ruby";
import type { SoTEditor } from "./sot/sot-editor";
import { OverlayImeTextarea } from "./sot/overlay-ime-textarea";
import { OverlayImeReplaceController } from "./sot/overlay-ime-replace";
import {
	handleListOutlinerKeydownForCe,
	runListOutlinerActionForCe,
	type SoTListOutlinerCeBridgeHost,
} from "./sot/sot-list-outliner-ce";
import { SoTOutlinePanel } from "./sot/outline-panel";
import type { LineRange } from "./sot/line-ranges";
import {
	isBlockquoteLine,
	parseHeadingLine,
	parseListLine,
	type ListLineInfo,
} from "./sot/sot-line-parse";
import {
	clearPlainEditSelectionFormatting,
	getPlainEditSelectionRange,
	insertPlainEditLink,
	insertPlainEditRuby,
	replacePlainEditSelection,
	wrapPlainEditSelection,
} from "./sot/sot-plain-edit-utils";
import {
	collectClearableTcySpansForLine,
	collectRenderableTcyRangesForLine,
	type TcyRange,
} from "./sot/sot-inline-tcy";
import {
	isTcySelectionActive,
	runClearTcyCommand,
	runInsertTcyCommand,
	runToggleTcyCommand,
} from "./sot/sot-inline-tcy-commands";
import {
	SoTPlainEditController,
	type PlainEditRange,
} from "./sot/sot-plain-edit-controller";
import { SoTWorkspaceController } from "./sot/sot-workspace-controller";
import {
	computeLineRangesFromLines as computeLineRangesFromLinesModel,
	recomputeLineBlockKinds as recomputeLineBlockKindsModel,
} from "./sot/sot-line-model";
import type { SoTChange } from "./sot/sot-editor";
import type { CommandUiAdapter } from "./shared/command-adapter";
import { CommandToolbar } from "./shared/command-toolbar";
import { CommandContextMenu } from "./shared/command-context-menu";
import { LinkInputModal, LinkInputResult } from "../shared/ui/link-input-modal";
import { RubyInputModal, RubyInputResult } from "../shared/ui/ruby-input-modal";
import { SettingsPanelModal } from "./contenteditable/settings-panel";
import {
	renderCalloutWidgetLine,
	renderDeflistWidgetLine,
	renderEmbedWidgetLine,
	renderImageWidgetLine,
	renderMathWidgetLine,
	renderTableWidgetLine,
	type SoTWidgetRenderContext,
} from "./sot/sot-widget-renderer";
import {
	getCaretPositionFromPoint,
	getClampedPointInRect,
	getRectUnion,
} from "./sot/sot-selection-geometry";
import { SoTPointerHandler } from "./sot/sot-pointer";
import { t } from "../shared/i18n";
import { SoTSelectionOverlay } from "./sot/sot-selection-overlay";
import { openExternalUrl } from "../shared/open-external-url";
import { tryRenderNativeSelectionFallback } from "./sot/sot-selection-fallback";
import { SoTNativeContextMenuHold } from "./sot/sot-native-contextmenu-hold";
import { SoTCeSelectionSync } from "./sot/sot-ce-selection-sync";
import { NativeSelectionSupport } from "./sot/native-selection-support";
import {
	decideDomSelectAll,
	DEFAULT_DOM_SELECTALL_TIMEOUT_MS,
} from "./sot/selection-guard";
import { SoTRenderPipeline } from "./sot/sot-render-pipeline";
import type { FrontmatterData } from "./sot/sot-wysiwyg-view-frontmatter";
import { debugLog, debugWarn } from "../shared/logger";
import {
	isPhoneLikeMobile,
	PHONE_MEDIA_QUERY,
} from "./shared/device-profile";

export const TATEGAKI_SOT_WYSIWYG_VIEW_TYPE = "tategaki-sot-wysiwyg-view";
const INITIAL_FILE_PROP = "__tategakiInitialFile";

type SoTViewState = {
	filePath?: string;
	writingMode?: WritingMode;
};

type InlineStyleClass =
	| "tategaki-md-strong"
	| "tategaki-md-em"
	| "tategaki-md-code"
	| "tategaki-md-strike"
	| "tategaki-md-highlight"
	| "tategaki-md-tcy"
	| "tategaki-md-link"
	| "tategaki-md-image"
	| "tategaki-md-embed"
	| "tategaki-md-footnote-ref"
	| "tategaki-md-footnote-inline"
	| "tategaki-md-math-inline"
	| "tategaki-md-math-sup";

type InlineRange = {
	from: number;
	to: number;
	className: InlineStyleClass;
};

type LinkRange = {
	from: number;
	to: number;
	href: string;
};

type HiddenRange = {
	from: number;
	to: number;
};

type BlockLineDecoration = {
	classes: string[];
	hidden: HiddenRange[];
	dataset: Record<string, string>;
	styleVars: Record<string, string>;
};

type RenderSegment = {
	from: number;
	to: number;
	text: string;
	classNames: string[];
	href?: string;
	ruby?: string;
};

type ClearableSpan = {
	from: number;
	to: number;
	markers: HiddenRange[];
};

type RubyRange = {
	from: number;
	to: number;
	ruby: string;
};

type InlineWidget = {
	kind: "math-inline";
	from: number;
	to: number;
	source: string;
};

export class SoTWysiwygView extends ItemView {
	private readonly plugin: TategakiV2Plugin;
	private isReady = false;
	private pendingState: SoTViewState | null = null;
	private currentFile: TFile | null = null;

	private viewRootEl: HTMLElement | null = null;
	private commandToolbar: CommandToolbar | null = null;
	private commandContextMenu: CommandContextMenu | null = null;
	private commandAdapter: CommandUiAdapter | null = null;
	private pageContainerEl: HTMLElement | null = null;
	private borderWrapperEl: HTMLElement | null = null;
	private contentWrapperEl: HTMLElement | null = null;
	private derivedRootEl: HTMLElement | null = null;
	private derivedContentEl: HTMLElement | null = null;
	private selectionLayerEl: HTMLElement | null = null;
	private caretEl: HTMLElement | null = null;
	private pendingEl: HTMLElement | null = null;
	private pendingSpacerEl: HTMLElement | null = null;
	private loadingOverlayEl: HTMLElement | null = null;
	private overlayTextarea: OverlayImeTextarea | null = null;
	private outlinePanel: SoTOutlinePanel | null = null;

	private sotEditor: SoTEditor | null = null;
	private detachSoTListener: (() => void) | null = null;

	private renderPipeline: SoTRenderPipeline | null = null;
	private wheelThrottleTimer: number | null = null;
	private scrollDebounceTimer: number | null = null;
	private scrollDebounceRaf: number | null = null;
	private scrollDebouncePendingTop = 0;
	private scrollDebouncePendingLeft = 0;
	private scrollDebounceLastTop = 0;
	private scrollDebounceLastLeft = 0;
	private scrollDebounceLastEventAt = 0;
	private selectionChangeDebounceTimer: number | null = null;
	private pendingNativeSelectionSync = false;
	private isScrolling = false;
	private lineModelRecomputeDeferred = false;
	private selectionOverlayRaf: number | null = null;
	private activeTouchPointers = new Map<
		number,
		{ x: number; y: number; startX: number; startY: number }
	>();
	private touchScrollStartX = 0;
	private touchScrollStartY = 0;
	private touchScrollLastY = 0;
	private touchScrollActive = false;
	private lineModelRecomputeTimer: number | null = null;
	private lineModelRecomputeIdle: number | null = null;
	private lineModelRecomputeStart: number | null = null;
	private lineModelRecomputeEnd: number | null = null;
	private outlineJumpToken = 0;
	private outlineJumpRaf: number | null = null;
	private boundWheelHandler: ((event: WheelEvent) => void) | null = null;
	private overlayFocused = false;
	private suppressNativeSelectionCollapse = false;
	private overlayImeReplace: OverlayImeReplaceController | null = null;
	private plainEditOverlayEl: HTMLTextAreaElement | null = null;
	private plainEditRange: PlainEditRange | null = null;
	private plainEditComposing = false;
	private plainEditCommitting = false;
	private plainEditOutsidePointerHandler:
		| ((event: PointerEvent) => void)
		| null = null;
	private plainEditOverlayBaseRect: {
		left: number;
		top: number;
		width: number;
		height: number;
	} | null = null;
	private plainEditController: SoTPlainEditController;
	private workspaceController: SoTWorkspaceController;
	private ceImeMode = false;
	private ceImeSuspended = false;
	private ceImeFallbackActive = false;
	private ceImeMappingFailureCount = 0;
	private ceImeMappingFailureAt = 0;
	private ceImeApplying = false;
	private ceImeComposeId = 0;
	private ceImeActiveComposeId: number | null = null;
	private ceImeAppliedComposeId = 0;
	private ceImeComposing = false;
	private ceImeSelectionSyncing = false;
	private ceImeSelectionChangeSuppressedUntil = 0;
	private ceImeAutoTrailingNewline = false;
	private ceImeAutoTrailingNewlineBaseLength = 0;
	private ceImeAutoTrailingNewlineTail = "";
	private ceImeLastCompositionText = "";
	private ceImeLastBeforeInputText = "";
	private ceImeCompositionSelection: {
		from: number;
		to: number;
	} | null = null;
	private ceImeIgnoreNextInput = false;
	private ceImeExternalSuppressUntil = 0;
	private ceEditableStart: number | null = null;
	private ceEditableEnd: number | null = null;
	private ceSafetyCheckRaf: number | null = null;
	private ceSafetyCheckAt = 0;
	private isPointerSelecting = false;
	private autoScrollSelecting = false;
	private autoScrollFast = false;
	private softSelectionPointerLock = false;
	private scrollbarSelectionHold = false;
	private nativeSelectionAssistActive = false;
	private nativeSelectionAssistByAutoScroll = false;
	private nativeContextMenuHold = new SoTNativeContextMenuHold();
	private readonly softSelectionLargeCharThreshold = 5000;
	private readonly softSelectionLargeLineThreshold = 200;
	private pointerHandler: SoTPointerHandler | null = null;
	private lastPaneHeaderTitle = "";
	private selectionOverlay: SoTSelectionOverlay | null = null;
	private ceSelectionSync: SoTCeSelectionSync | null = null;
	private nativeSelectionSupport: NativeSelectionSupport | null = null;
	private pendingCaretScroll = false;
	private selectAllActive = false;
	private softSelectionActive = false;
	private softSelectionFrom = 0;
	private softSelectionTo = 0;
	private keepSoTActiveOnOutline = false;
	private nativeSelectionPendingFocus = false;
	private nativeSelectionPendingClick: {
		lineEl: HTMLElement;
		clientX: number;
		clientY: number;
		pointerId: number;
	} | null = null;
	private pointerSelectAnchor: number | null = null;
	private pointerSelectPointerId: number | null = null;
	private pendingSelectionFrom: number | null = null;
	private pendingSelectionTo: number | null = null;
	private pendingSelectionLineStart: number | null = null;
	private pendingSelectionLineEnd: number | null = null;
	private pendingText = "";
	private pendingHold = false;
	private readonly showPendingOverlay = false;
	private immediateRender = false;
	private loadingOverlayPending = false;
	private lineRanges: LineRange[] = [];
	private pendingLineIndex: number | null = null;
	private pendingLocalOffset: number | null = null;
	private pairedMarkdownLeaf: WorkspaceLeaf | null = null;
	private pairedMarkdownView: MarkdownView | null = null;
	private pairedMarkdownBadgeLeaf: WorkspaceLeaf | null = null;
	private pairedMarkdownBadgeEl: HTMLElement | null = null;
	private sotTabBadgeEl: HTMLElement | null = null;
	private pairedMismatchNotified = false;
	private suppressPairCheck = false;
	private recentFilePaths: string[] = [];
	private recentFilePathsInitialized = false;

	private sourceModeEnabled = false;
	private sourceModeLineStart: number | null = null;
	private sourceModeLineEnd: number | null = null;
	private plainTextViewEnabled = false;
	private writingMode: WritingMode = "vertical-rl";
	private lineBlockKinds: string[] = [];
	private lineCodeFenceInfo: (string | null)[] = [];
	private lineCodeLang: (string | null)[] = [];
	private lineCodeBlockPart: (
		| null
		| "single"
		| "start"
		| "middle"
		| "end"
	)[] = [];
	private lineMathBlockStart: (number | null)[] = [];
	private lineMathBlockEnd: (number | null)[] = [];
	private lineCalloutType: (string | null)[] = [];
	private lineCalloutIsTitle: boolean[] = [];
	private lineCalloutBlockStart: (number | null)[] = [];
	private lineCalloutBlockEnd: (number | null)[] = [];
	private lineTableIsHeader: boolean[] = [];
	private lineTableBlockStart: (number | null)[] = [];
	private lineTableBlockEnd: (number | null)[] = [];
	private lineDeflistBlockStart: (number | null)[] = [];
	private lineDeflistBlockEnd: (number | null)[] = [];
	private lineHeadingSectionEnd: (number | null)[] = [];
	private lineHeadingHiddenBy: (number | null)[] = [];
	private collapsedHeadingLines: Set<number> = new Set();
	private footnoteDefinitionOrder: Map<string, number> = new Map();
	private footnoteDefinitionText: Map<string, string> = new Map();
	private linkReferenceMap: Map<string, string> = new Map();
	private lineDecorationCache: Map<
		number,
		{
			from: number;
			to: number;
			text: string;
			decoration: BlockLineDecoration;
		}
	> = new Map();
	private lineSegmentCache: Map<
		number,
		{
			from: number;
			to: number;
			text: string;
			kind: string;
			codeLang: string | null;
			isSource: boolean;
			rubyEnabled: boolean;
			segments: RenderSegment[];
		}
	> = new Map();
	private embedRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private mathRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private calloutRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private tableRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private deflistRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private finishRenderMathTimer: number | null = null;
	private hideFrontmatter = false;
	private frontmatterDetected = false;
	private collapsePreviewTooltip: HTMLElement | null = null;
	private readonly lineCacheMaxEntries = 4000;
	private lineCacheTrimCursor = 0;
	private nativeSelectionAnchorLine: number | null = null;
	private nativeSelectionHeadLine: number | null = null;
	private nativeSelectionAnchorLocked = false;

	private isLineInSourceMode(lineIndex: number): boolean {
		void lineIndex;
		return false;
	}

	/**
	 * 折りたたまれた見出しの配下の最初の数行のプレビューテキストを取得
	 */
	private getCollapsedContentPreview(
		headingLineIndex: number,
		maxLines: number,
	): string | null {
		if (!this.sotEditor) return null;

		const end = this.lineHeadingSectionEnd[headingLineIndex];
		if (end === null || end <= headingLineIndex) return null;

		const doc = this.sotEditor.getDoc();
		const previewLines: string[] = [];
		let lineCount = 0;

		for (
			let i = headingLineIndex + 1;
			i <= end && lineCount < maxLines;
			i++
		) {
			if (this.lineHeadingHiddenBy[i] !== headingLineIndex) continue;

			const range = this.lineRanges[i];
			if (!range) continue;

			const lineText = doc.slice(range.from, range.to).trim();
			if (lineText.length > 0) {
				previewLines.push(lineText);
				lineCount++;
			}
		}

		if (previewLines.length === 0) return null;

		// 各行を最大50文字に制限
		const truncatedLines = previewLines.map((line) =>
			line.length > 50 ? line.slice(0, 50) + "..." : line,
		);

		return truncatedLines.join("\n");
	}

	/**
	 * 折りたたみプレビューのツールチップを表示
	 */
	private showCollapsePreviewTooltip(
		target: HTMLElement,
		text: string,
	): void {
		this.hideCollapsePreviewTooltip();

		const tooltip = document.createElement("div");
		tooltip.className = "tategaki-collapse-preview-tooltip";
		tooltip.textContent = text;
		document.body.appendChild(tooltip);
		this.collapsePreviewTooltip = tooltip;

		const rect = target.getBoundingClientRect();
		const tooltipRect = tooltip.getBoundingClientRect();

		// ツールチップの位置を計算（要素の下に表示）
		let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
		let top = rect.bottom + 8;

		// 画面端からはみ出す場合の調整
		if (left < 8) left = 8;
		if (left + tooltipRect.width > window.innerWidth - 8) {
			left = window.innerWidth - tooltipRect.width - 8;
		}
		if (top + tooltipRect.height > window.innerHeight - 8) {
			top = rect.top - tooltipRect.height - 8;
		}

		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;
	}

	/**
	 * 折りたたみプレビューのツールチップを非表示
	 */
	private hideCollapsePreviewTooltip(): void {
		if (this.collapsePreviewTooltip) {
			this.collapsePreviewTooltip.remove();
			this.collapsePreviewTooltip = null;
		}
	}

	private setWritingMode(mode: WritingMode): void {
		this.writingMode = mode;
		if (!this.derivedRootEl) return;
		this.derivedRootEl.dataset.writingMode = mode;
		this.derivedRootEl.style.setProperty("--tategaki-writing-mode", mode);
		this.derivedRootEl.scrollTop = 0;
		this.derivedRootEl.scrollLeft = 0;
		// 既に描画済みのフロントマター要素にもwriting-modeを再適用
		const frontmatterEl = this.derivedContentEl?.querySelector(
			".tategaki-frontmatter",
		) as HTMLElement | null;
		if (frontmatterEl) {
			this.applyFrontmatterWritingMode(frontmatterEl, mode);
		}
		this.updateWritingModeToggleUi();
		this.updateMobileTouchAction();
		this.pendingCaretScroll = true;
		this.scheduleCaretUpdate(true);
	}

	private setLoadingOverlayVisible(visible: boolean): void {
		if (!this.loadingOverlayEl) return;
		this.loadingOverlayEl.style.display = visible ? "flex" : "none";
	}

	private cancelOutlineJump(): void {
		if (this.outlineJumpRaf !== null) {
			window.cancelAnimationFrame(this.outlineJumpRaf);
			this.outlineJumpRaf = null;
		}
	}

	private scrollToOutlineLine(lineIndex: number): void {
		if (!this.derivedRootEl) return;
		const rootEl = this.derivedRootEl;
		const token = ++this.outlineJumpToken;
		this.cancelOutlineJump();

		const computed = window.getComputedStyle(rootEl);
		const fontSize = Number.parseFloat(computed.fontSize) || 16;
		const lineHeight =
			Number.parseFloat(computed.lineHeight) || fontSize * 1.8;
		const extent = Math.max(lineHeight, fontSize);
		const approx = Math.max(0, lineIndex) * extent;
		const isVertical = computed.writingMode !== "horizontal-tb";
		if (isVertical) {
			const sign = rootEl.scrollLeft < 0 ? -1 : 1;
			rootEl.scrollLeft = approx * sign;
		} else {
			rootEl.scrollTop = approx;
		}

		this.renderPipeline?.onScrollSettled();

		const scrollToLine = (): void => {
			if (this.outlineJumpToken !== token) return;
			const targetLineEl = this.getLineElement(lineIndex);
			if (!targetLineEl) return;
			this.ensureLineRendered(targetLineEl);
			this.rerenderLineRange(lineIndex - 8, lineIndex + 8);
			targetLineEl.scrollIntoView({
				block: "center",
				inline: "center",
			});
		};

		const retry = (attempt: number): void => {
			if (this.outlineJumpToken !== token) return;
			const targetLineEl = this.getLineElement(lineIndex);
			if (!targetLineEl) {
				if (attempt < 60) {
					this.outlineJumpRaf = window.requestAnimationFrame(() =>
						retry(attempt + 1),
					);
				}
				return;
			}
			this.ensureLineRendered(targetLineEl);
			this.rerenderLineRange(lineIndex - 8, lineIndex + 8);
			this.outlineJumpRaf = window.requestAnimationFrame(() => {
				scrollToLine();
				window.setTimeout(() => {
					this.renderPipeline?.onScrollSettled();
					scrollToLine();
				}, 100);
			});
		};

		retry(0);
	}

	private showLoadingOverlay(): void {
		this.loadingOverlayPending = true;
		this.setLoadingOverlayVisible(true);
	}

	private hideLoadingOverlay(): void {
		this.loadingOverlayPending = false;
		this.setLoadingOverlayVisible(false);
	}

	private cancelLineModelRecomputeTimers(): void {
		if (this.lineModelRecomputeTimer !== null) {
			window.clearTimeout(this.lineModelRecomputeTimer);
			this.lineModelRecomputeTimer = null;
		}
		if (this.lineModelRecomputeIdle !== null) {
			const cancelIdle = (window as any).cancelIdleCallback as
				| ((handle: number) => void)
				| undefined;
			cancelIdle?.(this.lineModelRecomputeIdle);
			this.lineModelRecomputeIdle = null;
		}
	}

	private markScrollActive(): void {
		if (this.isScrolling) return;
		this.isScrolling = true;
		if (this.lineModelRecomputeStart !== null) {
			this.lineModelRecomputeDeferred = true;
		}
		this.cancelLineModelRecomputeTimers();
	}

	private finishScrollActivity(): void {
		if (!this.isScrolling) return;
		this.isScrolling = false;
		if (this.lineModelRecomputeDeferred) {
			this.lineModelRecomputeDeferred = false;
			this.runLineModelRecompute();
		}
	}

	private shouldDeferCaretUpdate(force: boolean): boolean {
		if (force) return false;
		if (!this.isScrolling) return false;
		if (this.ceImeMode) return false;
		if (this.isPointerSelecting) return false;
		if (this.autoScrollSelecting) return false;
		return true;
	}

	private shouldDeferLineModelRecompute(): boolean {
		if (!this.isScrolling) return false;
		if (this.ceImeMode) return false;
		return true;
	}

	private getFastScrollScale(totalLines: number, docLength: number): number {
		if (totalLines >= 20000 || docLength >= 800000) return 0.55;
		if (totalLines >= 8000 || docLength >= 300000) return 0.75;
		if (totalLines >= 4000 || docLength >= 200000) return 0.9;
		return 1.15;
	}

	private getFastScrollThresholds(viewport: number): {
		smallThreshold: number;
		fastThreshold: number;
		idleDelay: number;
	} {
		const totalLines = this.lineRanges.length;
		const docLength = this.sotEditor?.getDoc().length ?? 0;
		const scale = this.getFastScrollScale(totalLines, docLength);
		const baseSmall = Math.max(64, viewport * 0.45);
		const baseFast = Math.max(200, viewport * 1.05);
		return {
			smallThreshold: baseSmall * scale,
			fastThreshold: baseFast * scale,
			idleDelay: 120,
		};
	}

	private scheduleSelectionOverlayUpdate(): void {
		if (this.selectionOverlayRaf !== null) return;
		this.selectionOverlayRaf = window.requestAnimationFrame(() => {
			this.selectionOverlayRaf = null;
			this.updateSelectionOverlay();
		});
	}

	private clearSelectionChangeDebounceTimer(): void {
		if (this.selectionChangeDebounceTimer === null) return;
		window.clearTimeout(this.selectionChangeDebounceTimer);
		this.selectionChangeDebounceTimer = null;
	}

	private shouldDeferNativeSelectionSync(): boolean {
		return this.isScrolling || this.autoScrollSelecting || this.isPointerSelecting;
	}

	private flushPendingNativeSelectionSync(force = false): void {
		if (!this.pendingNativeSelectionSync) return;
		if (!force && this.shouldDeferNativeSelectionSync()) return;
		this.pendingNativeSelectionSync = false;
		this.runCeSelectionChange();
	}

	private schedulePendingNativeSelectionSync(): void {
		this.pendingNativeSelectionSync = true;
		this.clearSelectionChangeDebounceTimer();
		this.selectionChangeDebounceTimer = window.setTimeout(() => {
			this.selectionChangeDebounceTimer = null;
			if (this.shouldDeferNativeSelectionSync()) {
				this.schedulePendingNativeSelectionSync();
				return;
			}
			this.flushPendingNativeSelectionSync(true);
		}, 100);
	}

	private updateNativeSelectionLineHints(): void {
		if (!this.isNativeSelectionEnabled() || !this.derivedContentEl) {
			this.nativeSelectionAnchorLine = null;
			this.nativeSelectionHeadLine = null;
			this.nativeSelectionAnchorLocked = false;
			return;
		}
		const selection =
			this.derivedContentEl.ownerDocument.getSelection() ?? null;
		if (!this.nativeSelectionSupport?.isSelectionActive()) {
			this.nativeSelectionAnchorLine = null;
			this.nativeSelectionHeadLine = null;
			this.nativeSelectionAnchorLocked = false;
			return;
		}
		if (
			!selection ||
			selection.isCollapsed ||
			!this.isSelectionInsideDerivedContent(selection)
		) {
			return;
		}
		const anchorLine = this.getLineElementForNode(selection.anchorNode);
		const headLine = this.getLineElementForNode(selection.focusNode);
		const parseLine = (lineEl: HTMLElement | null): number | null => {
			const value = Number.parseInt(lineEl?.dataset.line ?? "", 10);
			return Number.isFinite(value) ? value : null;
		};
		if (!this.nativeSelectionAnchorLocked) {
			this.nativeSelectionAnchorLine = parseLine(anchorLine);
		}
		this.nativeSelectionHeadLine = parseLine(headLine);
	}

	private getNativeSelectionHintLines(): number[] {
		const hints: number[] = [];
		if (this.nativeSelectionAnchorLine !== null) {
			hints.push(this.nativeSelectionAnchorLine);
		}
		if (this.nativeSelectionHeadLine !== null) {
			hints.push(this.nativeSelectionHeadLine);
		}
		return Array.from(new Set(hints));
	}

	private shouldSuppressAutoScrollSelectionRenders(): boolean {
		if (!this.autoScrollSelecting) return false;
		if (this.nativeSelectionAssistByAutoScroll) return false;
		const docLength = this.sotEditor?.getDoc().length ?? 0;
		if (docLength >= 200000) return true;
		if (this.lineRanges.length >= 2000) return true;
		return false;
	}

	private isNativeSelectionConfigured(): boolean {
		return this.plugin.settings.wysiwyg.useNativeSelection === true;
	}

	private syncNativeSelectionDataset(): void {
		if (!this.derivedRootEl) return;
		if (this.isNativeSelectionEnabled()) {
			this.derivedRootEl.dataset.nativeSelection = "1";
		} else {
			delete this.derivedRootEl.dataset.nativeSelection;
		}
	}

	private debugNativeSelectionAssist(
		event: string,
		detail: Record<string, unknown> = {},
	): void {
		debugLog("Tategaki SoT native-selection:", event, {
			active: this.nativeSelectionAssistActive,
			enabled: this.isNativeSelectionEnabled(),
			configured: this.isNativeSelectionConfigured(),
			ceImeMode: this.ceImeMode,
			sourceModeEnabled: this.sourceModeEnabled,
			...detail,
		});
	}

	private setNativeSelectionAssistActive(
		active: boolean,
		reason = "unknown",
	): void {
		if (this.nativeSelectionAssistActive === active) {
			this.syncNativeSelectionDataset();
			this.debugNativeSelectionAssist("assist-state-noop", { reason, next: active });
			return;
		}
		this.nativeSelectionAssistActive = active;
		this.syncNativeSelectionDataset();
		this.debugNativeSelectionAssist("assist-state-changed", {
			reason,
			next: active,
		});
		this.scheduleSelectionOverlayUpdate();
	}

	private isNativeSelectionEnabled(): boolean {
		if (!this.isNativeSelectionConfigured()) return false;
		if (this.ceImeMode || this.sourceModeEnabled) return false;
		return this.nativeSelectionAssistActive;
	}

	private isHugeDocSelection(): boolean {
		const docLength = this.sotEditor?.getDoc().length ?? 0;
		const virtualized =
			this.renderPipeline?.isVirtualizedRenderEnabled() ?? false;
		return (
			docLength >= 100000 || this.lineRanges.length >= 2000 || virtualized
		);
	}

	private getSoftSelectionRange(): { from: number; to: number } | null {
		if (!this.softSelectionActive || !this.sotEditor) return null;
		const docLength = this.sotEditor.getDoc().length;
		const safeFrom = Math.max(
			0,
			Math.min(this.softSelectionFrom, docLength),
		);
		const safeTo = Math.max(0, Math.min(this.softSelectionTo, docLength));
		return {
			from: Math.min(safeFrom, safeTo),
			to: Math.max(safeFrom, safeTo),
		};
	}

	private setSoftSelection(from: number, to: number): void {
		this.softSelectionActive = true;
		this.softSelectionFrom = from;
		this.softSelectionTo = to;
	}

	private clearSoftSelection(): void {
		if (!this.softSelectionActive) return;
		this.softSelectionActive = false;
		this.softSelectionPointerLock = false;
		this.selectionLayerEl?.replaceChildren();
	}

	private shouldUseSoftSelectionForAutoScroll(): boolean {
		return this.autoScrollSelecting && this.isHugeDocSelection();
	}

	private shouldUseSoftSelectionForPointer(
		anchor: number,
		head: number,
	): boolean {
		if (!this.isPointerSelecting) return false;
		if (!this.isHugeDocSelection()) return false;
		if (this.softSelectionPointerLock) return true;
		const from = Math.min(anchor, head);
		const to = Math.max(anchor, head);
		const selectionLength = Math.max(0, to - from);
		if (selectionLength >= this.softSelectionLargeCharThreshold) {
			return true;
		}
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return false;
		const lineSpan = Math.abs(endLine - startLine);
		return lineSpan >= this.softSelectionLargeLineThreshold;
	}

	private isPointerOnScrollbar(
		rootEl: HTMLElement | null,
		event: PointerEvent,
	): boolean {
		if (!rootEl) return false;
		const rect = rootEl.getBoundingClientRect();
		const scrollbarWidth = rootEl.offsetWidth - rootEl.clientWidth;
		const scrollbarHeight = rootEl.offsetHeight - rootEl.clientHeight;
		const onVertical =
			scrollbarWidth > 0 && event.clientX >= rect.right - scrollbarWidth;
		const onHorizontal =
			scrollbarHeight > 0 &&
			event.clientY >= rect.bottom - scrollbarHeight;
		return onVertical || onHorizontal;
	}

	private async toggleWritingMode(): Promise<void> {
		const currentMode = this.plugin.settings.common.writingMode;
		const newMode: WritingMode =
			currentMode === "vertical-rl" ? "horizontal-tb" : "vertical-rl";

		this.plugin.settings.common.writingMode = newMode;
		await this.plugin.saveSettings();
		this.setWritingMode(newMode);
	}

	private async togglePlainTextView(): Promise<void> {
		const next = !(this.plugin.settings.wysiwyg.plainTextView === true);
		this.plugin.settings.wysiwyg.plainTextView = next;
		await this.plugin.saveSettings();
		this.applySettingsToView(this.plugin.settings);
	}

	private updateWritingModeToggleUi(): void {
		this.commandToolbar?.update();
	}

	private getEffectiveCommonSettings(settings: TategakiV2Settings) {
		return typeof (this.plugin as any).getEffectiveCommonSettings ===
			"function"
			? (this.plugin as any).getEffectiveCommonSettings()
			: settings.common;
	}

	private applySettingsToView(settings: TategakiV2Settings): void {
		if (!this.derivedRootEl) return;
		const effectiveCommon = this.getEffectiveCommonSettings(settings);
		this.hideFrontmatter = settings.preview.hideFrontmatter ?? false;
		this.invalidateLineCaches();
		this.setPlainTextViewEnabled(settings.wysiwyg.plainTextView === true);

		this.applyPageLayout(settings);

		const targetEl = this.contentWrapperEl ?? this.derivedRootEl;
		targetEl.style.setProperty(
			"--tategaki-writing-mode",
			effectiveCommon.writingMode,
		);
		targetEl.style.setProperty(
			"--tategaki-font-family",
			effectiveCommon.fontFamily,
		);
		targetEl.style.setProperty(
			"--tategaki-font-size",
			`${effectiveCommon.fontSize}px`,
		);
		targetEl.style.setProperty(
			"--tategaki-line-height",
			`${effectiveCommon.lineHeight}`,
		);
		targetEl.style.setProperty(
			"--tategaki-letter-spacing",
			`${effectiveCommon.letterSpacing}em`,
		);
		targetEl.style.setProperty(
			"--tategaki-text-color",
			effectiveCommon.textColor,
		);
		targetEl.style.setProperty(
			"--tategaki-background-color",
			effectiveCommon.backgroundColor,
		);
		targetEl.style.setProperty(
			"--tategaki-accent-color",
			effectiveCommon.accentColor,
		);
		const caretColor = this.resolveCaretColor(settings, effectiveCommon);
		targetEl.style.setProperty("--tategaki-caret-color", caretColor);
		const verticalGap =
			effectiveCommon.rubyVerticalGap ??
			DEFAULT_V2_SETTINGS.common.rubyVerticalGap;
		const horizontalGap =
			effectiveCommon.rubyHorizontalGap ??
			DEFAULT_V2_SETTINGS.common.rubyHorizontalGap;
		targetEl.style.setProperty(
			"--tategaki-ruby-gap-vertical",
			`${verticalGap}em`,
		);
		targetEl.style.setProperty(
			"--tategaki-ruby-gap-horizontal",
			`${horizontalGap}em`,
		);
		const rubySize = Math.max(
			0.2,
			Math.min(1.0, effectiveCommon.rubySize ?? 0.5),
		);
		const rubyValue = rubySize.toString();
		targetEl.style.setProperty("--tategaki-ruby-size", rubyValue);
		targetEl.style.setProperty("--ruby-size", rubyValue);

		// 行末揃え（justify）
		targetEl.classList.add("text-justify-enabled");
		targetEl.style.textAlign = "justify";
		targetEl.style.textAlignLast = "auto";
		targetEl.style.setProperty("text-justify", "inter-ideograph");

		const headingFont =
			effectiveCommon.headingFontFamily || effectiveCommon.fontFamily;
		const headingColor =
			effectiveCommon.headingTextColor || effectiveCommon.textColor;
		targetEl.style.setProperty(
			"--tategaki-heading-font-family",
			headingFont,
		);
		targetEl.style.setProperty(
			"--tategaki-heading-text-color",
			headingColor,
		);

		if (this.writingMode !== effectiveCommon.writingMode) {
			this.setWritingMode(effectiveCommon.writingMode);
		} else {
			this.derivedRootEl.dataset.writingMode =
				effectiveCommon.writingMode;
			this.derivedRootEl.style.setProperty(
				"--tategaki-writing-mode",
				effectiveCommon.writingMode,
			);
		}
		this.syncNativeSelectionDataset();

		// ページ内余白の設定（物理プロパティで実際の上下余白を設定）
		const sotPaddingTop = settings.wysiwyg.sotPaddingTop ?? 32;
		const sotPaddingBottom = settings.wysiwyg.sotPaddingBottom ?? 16;
		this.derivedRootEl.style.paddingTop = `${sotPaddingTop}px`;
		this.derivedRootEl.style.paddingBottom = `${sotPaddingBottom}px`;

		this.commandToolbar?.update();
		this.scheduleCaretUpdate(true);
	}

	private setPlainTextViewEnabled(enabled: boolean): void {
		if (this.plainTextViewEnabled === enabled) return;
		this.plainTextViewEnabled = enabled;
		if (enabled && this.sourceModeEnabled) {
			this.disablePlainEditMode();
		}
		if (this.derivedRootEl) {
			if (enabled) {
				this.derivedRootEl.dataset.plainTextView = "1";
			} else {
				delete this.derivedRootEl.dataset.plainTextView;
			}
		}
		this.invalidateLineCaches();
		this.scheduleRender(true);
		this.commandToolbar?.update();
	}

	private shouldAllowDomSelectAll(): boolean {
		const virtualized =
			this.renderPipeline?.isVirtualizedRenderEnabled() ?? false;
		const decision = decideDomSelectAll(
			this.sotEditor,
			this.lineRanges.length,
			{
				timeoutMs: DEFAULT_DOM_SELECTALL_TIMEOUT_MS,
				maxDocLength: 100_000,
				maxLineCount: 2000,
				virtualized,
			},
		);
		return decision.allowDomSelectAll;
	}

	private resolveCaretColor(
		settings: TategakiV2Settings,
		effectiveCommon: CommonSettings,
	): string {
		const mode = settings.wysiwyg.caretColorMode ?? "accent";
		if (mode === "text") {
			return effectiveCommon.textColor;
		}
		if (mode === "custom") {
			const custom = settings.wysiwyg.caretCustomColor?.trim();
			if (custom) return custom;
		}
		return effectiveCommon.accentColor;
	}

	private applyPageLayout(settings: TategakiV2Settings): void {
		const effectiveCommon = this.getEffectiveCommonSettings(settings);
		const rawScale = Number(effectiveCommon.pageScale ?? 1);
		const fillMode = rawScale > 1;
		const scaled = fillMode ? 1 : Math.max(0.7, Math.min(1, rawScale));

		if (this.borderWrapperEl) {
			this.borderWrapperEl.style.transformOrigin = "center center";
			this.borderWrapperEl.style.transform = `scale(${
				fillMode ? 1 : scaled
			})`;
			this.borderWrapperEl.style.boxShadow = fillMode
				? "none"
				: "0 6px 12px rgba(0,0,0,0.4)";
			this.borderWrapperEl.style.setProperty(
				"background",
				effectiveCommon.backgroundColor,
				"important",
			);
			this.borderWrapperEl.style.setProperty(
				"border",
				"none",
				"important",
			);
			this.borderWrapperEl.style.setProperty(
				"outline",
				"none",
				"important",
			);
		}

		if (this.pageContainerEl) {
			this.pageContainerEl.style.alignItems = fillMode
				? "stretch"
				: "center";
			this.pageContainerEl.style.justifyContent = fillMode
				? "stretch"
				: "center";
			this.pageContainerEl.style.padding = fillMode
				? "0"
				: "40px 32px 22px 32px";
			this.pageContainerEl.style.background = "transparent";
		}

		if (this.viewRootEl) {
			this.viewRootEl.style.background = fillMode
				? effectiveCommon.backgroundColor
				: effectiveCommon.pageBackgroundColor;
		}

		if (this.contentWrapperEl) {
			this.contentWrapperEl.style.background =
				effectiveCommon.backgroundColor;
			this.contentWrapperEl.style.color = effectiveCommon.textColor;
			this.contentWrapperEl.style.letterSpacing = `${effectiveCommon.letterSpacing}em`;
		}
	}

	private parseFrontmatter(content: string): {
		frontmatter: FrontmatterData | null;
		contentWithoutFrontmatter: string;
	} {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = content.match(frontmatterRegex);

		if (!match) {
			return {
				frontmatter: null,
				contentWithoutFrontmatter: content,
			};
		}

		const yamlContent = match[1];
		const contentWithoutFrontmatter = content.slice(match[0].length);
		const frontmatter: FrontmatterData = {};
		const lines = yamlContent.split("\n");

		let currentKey = "";
		let currentArray: string[] = [];
		let isInArray = false;

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine.startsWith("#")) continue;

			if (trimmedLine.startsWith("- ")) {
				if (isInArray) {
					currentArray.push(trimmedLine.slice(2).trim());
				}
				continue;
			}

			if (isInArray && !trimmedLine.startsWith("- ")) {
				if (currentKey === "co_authors") {
					frontmatter.co_authors = currentArray;
				} else if (currentKey === "co_translators") {
					frontmatter.co_translators = currentArray;
				}
				isInArray = false;
				currentArray = [];
			}

			const colonIndex = trimmedLine.indexOf(":");
			if (colonIndex !== -1) {
				const key = trimmedLine.slice(0, colonIndex).trim();
				const value = trimmedLine.slice(colonIndex + 1).trim();

				switch (key) {
					case "title":
						frontmatter.title = value;
						break;
					case "subtitle":
						frontmatter.subtitle = value;
						break;
					case "original_title":
						frontmatter.original_title = value;
						break;
					case "author":
						frontmatter.author = value;
						break;
					case "translator":
						frontmatter.translator = value;
						break;
					case "co_authors":
					case "co_translators":
						if (value) {
							const items = value
								.split(",")
								.map((s) => s.trim())
								.filter((s) => s.length > 0);
							if (key === "co_authors") {
								frontmatter.co_authors = items;
							} else {
								frontmatter.co_translators = items;
							}
						} else {
							currentKey = key;
							isInArray = true;
							currentArray = [];
						}
						break;
					default:
						break;
				}
			}
		}

		if (isInArray) {
			if (currentKey === "co_authors") {
				frontmatter.co_authors = currentArray;
			} else if (currentKey === "co_translators") {
				frontmatter.co_translators = currentArray;
			}
		}

		return {
			frontmatter:
				Object.keys(frontmatter).length > 0 ? frontmatter : null,
			contentWithoutFrontmatter,
		};
	}

	private renderFrontmatter(
		data: FrontmatterData,
		settings: TategakiV2Settings,
	): HTMLElement | null {
		const container = document.createElement("div");
		container.className = "tategaki-frontmatter";

		let hasContent = false;

		const topAlignedContainer = container.createDiv(
			"tategaki-frontmatter-top",
		);

		if (data.title && settings.preview.showFrontmatterTitle) {
			const titleEl = topAlignedContainer.createEl("h1", {
				cls: "tategaki-frontmatter-title",
			});
			titleEl.textContent = data.title;
			hasContent = true;
		}

		if (data.subtitle && settings.preview.showFrontmatterSubtitle) {
			const subtitleEl = topAlignedContainer.createEl("h2", {
				cls: "tategaki-frontmatter-subtitle",
			});
			subtitleEl.textContent = data.subtitle;
			hasContent = true;
		}

		if (
			data.original_title &&
			settings.preview.showFrontmatterOriginalTitle
		) {
			const originalTitleEl = topAlignedContainer.createEl("h2", {
				cls: "tategaki-frontmatter-original-title",
			});
			originalTitleEl.textContent = data.original_title;
			hasContent = true;
		}

		const bottomAlignedContainer = container.createDiv(
			"tategaki-frontmatter-bottom",
		);

		if (data.author && settings.preview.showFrontmatterAuthor) {
			const authorEl = bottomAlignedContainer.createEl("h4", {
				cls: "tategaki-frontmatter-author",
			});
			authorEl.textContent = data.author;
			this.applyFrontmatterInlineEndAlignment(authorEl);
			hasContent = true;
		}

		if (data.co_authors && settings.preview.showFrontmatterCoAuthors) {
			for (const coAuthor of data.co_authors) {
				const coAuthorEl = bottomAlignedContainer.createEl("h4", {
					cls: "tategaki-frontmatter-co-author",
				});
				coAuthorEl.textContent = coAuthor;
				this.applyFrontmatterInlineEndAlignment(coAuthorEl);
				hasContent = true;
			}
		}

		if (data.translator && settings.preview.showFrontmatterTranslator) {
			const translatorEl = bottomAlignedContainer.createEl("h5", {
				cls: "tategaki-frontmatter-translator",
			});
			translatorEl.textContent = data.translator;
			this.applyFrontmatterInlineEndAlignment(translatorEl);
			hasContent = true;
		}

		if (
			data.co_translators &&
			settings.preview.showFrontmatterCoTranslators
		) {
			for (const coTranslator of data.co_translators) {
				const coTranslatorEl = bottomAlignedContainer.createEl("h5", {
					cls: "tategaki-frontmatter-co-translator",
				});
				coTranslatorEl.textContent = coTranslator;
				this.applyFrontmatterInlineEndAlignment(coTranslatorEl);
				hasContent = true;
			}
		}

		return hasContent ? container : null;
	}

	private applyFrontmatterInlineEndAlignment(element: HTMLElement): void {
		element.style.display = "block";
		element.style.setProperty("text-align", "end", "important");
		element.style.setProperty("text-align-last", "end", "important");
		element.style.marginInlineStart = "auto";
		element.style.marginInlineEnd = "0";
		element.style.marginLeft = "auto";
		element.style.marginRight = "0";
		element.style.justifySelf = "end";
	}

	private applyFrontmatterWritingMode(
		element: HTMLElement,
		writingMode: string,
	): void {
		element.style.writingMode = writingMode;
		element.style.textOrientation = "mixed";
	}

	private computeLineRangesFromLines(lines: string[]): LineRange[] {
		return computeLineRangesFromLinesModel(lines);
	}

	private shouldUseLineCache(): boolean {
		if (Platform.isMobile || Platform.isMobileApp) return false;
		const docLength = this.sotEditor?.getDoc().length ?? 0;
		if (docLength >= 300000) return false;
		if (this.lineRanges.length >= 4000) return false;
		return true;
	}

	private invalidateLineCaches(): void {
		this.lineDecorationCache.clear();
		this.lineSegmentCache.clear();
	}

	private trimLineCachesIfNeeded(): void {
		const maxEntries = this.lineCacheMaxEntries;
		if (maxEntries <= 0) return;
		const overshoot =
			Math.max(
				this.lineDecorationCache.size - maxEntries,
				this.lineSegmentCache.size - maxEntries,
			) || 0;
		if (overshoot <= 0) return;
		const total = this.lineRanges.length;
		if (total <= 0) return;
		const stride = Math.max(1, Math.floor(total / (overshoot * 2)));
		let removed = 0;
		let cursor = this.lineCacheTrimCursor % total;
		for (let step = 0; step < total && removed < overshoot; step += 1) {
			const index = cursor;
			cursor = (cursor + stride) % total;
			if (this.lineDecorationCache.delete(index)) {
				removed += 1;
			}
			if (this.lineSegmentCache.delete(index)) {
				removed += 1;
			}
		}
		this.lineCacheTrimCursor = cursor;
	}

	private getCachedBlockLineDecoration(
		lineIndex: number | null,
		lineFrom: number,
		lineTo: number,
		lineText: string,
	): BlockLineDecoration {
		if (!this.shouldUseLineCache() || lineIndex === null) {
			return this.computeBlockLineDecoration(
				lineFrom,
				lineTo,
				lineText,
				lineIndex,
			);
		}
		if (lineIndex !== null) {
			const cached = this.lineDecorationCache.get(lineIndex);
			if (
				cached &&
				cached.from === lineFrom &&
				cached.to === lineTo &&
				cached.text === lineText
			) {
				return cached.decoration;
			}
		}
		const decoration = this.computeBlockLineDecoration(
			lineFrom,
			lineTo,
			lineText,
			lineIndex,
		);
		if (lineIndex !== null) {
			this.trimLineCachesIfNeeded();
			this.lineDecorationCache.set(lineIndex, {
				from: lineFrom,
				to: lineTo,
				text: lineText,
				decoration,
			});
		}
		return decoration;
	}

	private recomputeLineBlockKinds(lines: string[]): void {
		this.invalidateLineCaches();
		const result = recomputeLineBlockKindsModel({
			lines,
			collapsedHeadingLines: this.collapsedHeadingLines,
			normalizeLinkLabel: (label) => this.normalizeLinkLabel(label),
		});
		this.lineBlockKinds = result.lineBlockKinds;
		this.lineCodeFenceInfo = result.lineCodeFenceInfo;
		this.lineCodeLang = result.lineCodeLang;
		this.lineCodeBlockPart = result.lineCodeBlockPart;
		this.lineMathBlockStart = result.lineMathBlockStart;
		this.lineMathBlockEnd = result.lineMathBlockEnd;
		this.lineCalloutType = result.lineCalloutType;
		this.lineCalloutIsTitle = result.lineCalloutIsTitle;
		this.lineCalloutBlockStart = result.lineCalloutBlockStart;
		this.lineCalloutBlockEnd = result.lineCalloutBlockEnd;
		this.lineTableIsHeader = result.lineTableIsHeader;
		this.lineTableBlockStart = result.lineTableBlockStart;
		this.lineTableBlockEnd = result.lineTableBlockEnd;
		this.lineDeflistBlockStart = result.lineDeflistBlockStart;
		this.lineDeflistBlockEnd = result.lineDeflistBlockEnd;
		this.lineHeadingSectionEnd = result.lineHeadingSectionEnd;
		this.lineHeadingHiddenBy = result.lineHeadingHiddenBy;
		this.footnoteDefinitionOrder = result.footnoteDefinitionOrder;
		this.footnoteDefinitionText = result.footnoteDefinitionText;
		this.linkReferenceMap = result.linkReferenceMap;
		this.collapsedHeadingLines = result.collapsedHeadingLines;
	}

	private createLinePrefixElement(lineEl: HTMLElement): HTMLElement | null {
		const kind = lineEl.dataset.mdKind ?? "";
		if (kind === "heading") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			if (!Number.isFinite(index)) return null;
			const end = this.lineHeadingSectionEnd[index as number];
			if (end === null || end <= index) return null;
			const toggle = document.createElement("span");
			toggle.className = "tategaki-md-heading-toggle";
			toggle.dataset.headingToggle = "1";
			const collapsed = lineEl.dataset.headingCollapsed === "1";
			toggle.setAttribute("role", "button");
			toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
			toggle.setAttribute(
				"aria-label",
				collapsed
					? t("heading.toggle.expand")
					: t("heading.toggle.collapse"),
			);

			// アイコンを設定（書字方向によって異なる）
			const writingMode = this.writingMode;
			let iconName: string;
			if (writingMode === "horizontal-tb") {
				// 横書き: 折りたたみ=right, 展開=down
				iconName = collapsed
					? "circle-chevron-right"
					: "circle-chevron-down";
			} else {
				// 縦書き: 折りたたみ=down, 展開=left
				iconName = collapsed
					? "circle-chevron-down"
					: "circle-chevron-left";
			}
			setIcon(toggle, iconName);

			return toggle;
		}
		if (kind !== "task") return null;
		const box = document.createElement("span");
		box.className = "tategaki-md-task-box";
		box.dataset.taskToggle = "1";
		box.setAttribute("role", "checkbox");
		const checked = lineEl.dataset.taskChecked === "1";
		box.setAttribute("aria-checked", checked ? "true" : "false");
		box.setAttribute(
			"aria-label",
			checked ? t("task.checked") : t("task.unchecked"),
		);
		return box;
	}

	private toggleTaskForLineElement(lineEl: HTMLElement): void {
		if (!this.sotEditor) return;
		const lineFrom = Number.parseInt(lineEl.dataset.from ?? "0", 10);
		const lineTo = Number.parseInt(lineEl.dataset.to ?? "0", 10);
		const doc = this.sotEditor.getDoc();
		const safeFrom = Math.max(0, Math.min(lineFrom, doc.length));
		const safeTo = Math.max(safeFrom, Math.min(lineTo, doc.length));
		const lineText = doc.slice(safeFrom, safeTo);
		const match = lineText.match(/^[ \t]*([-+*])[ \t]+\[([ xX])\]/);
		if (!match) return;
		const bracketPos = lineText.indexOf("[", match.index ?? 0);
		if (bracketPos < 0 || bracketPos + 2 >= lineText.length) return;
		const statePos = bracketPos + 1;
		const current = lineText[statePos] ?? " ";
		const next = current.toLowerCase() === "x" ? " " : "x";
		const absPos = safeFrom + statePos;

		const prevSelection = this.sotEditor.getSelection();
		this.updatePendingText("", true);
		this.immediateRender = true;
		this.sotEditor.replaceRange(absPos, absPos + 1, next);
		this.sotEditor.setSelection(prevSelection);
	}

	private toggleHeadingFold(lineIndex: number): void {
		if (!this.sotEditor) return;
		if (lineIndex < 0 || lineIndex >= this.lineRanges.length) return;
		const end = this.lineHeadingSectionEnd[lineIndex];
		if (end === null || end <= lineIndex) return;
		if (this.collapsedHeadingLines.has(lineIndex)) {
			this.collapsedHeadingLines.delete(lineIndex);
		} else {
			this.collapsedHeadingLines.add(lineIndex);
		}
		const doc = this.sotEditor.getDoc();
		const lines = doc.split("\n");
		this.recomputeLineBlockKinds(lines);
		const headingRange = this.lineRanges[lineIndex];
		if (headingRange) {
			this.setSelectionNormalized(headingRange.from, headingRange.from);
		} else {
			const selection = this.sotEditor.getSelection();
			this.setSelectionNormalized(selection.anchor, selection.head);
		}
		this.scheduleRender(true);
		this.scrollToOutlineLine(lineIndex);
	}

	private collectHiddenRangesForLine(
		lineFrom: number,
		lineTo: number,
		lineText: string,
		lineIndex: number | null,
	): HiddenRange[] {
		if (this.plainTextViewEnabled) {
			return [];
		}
		if (lineIndex !== null && this.isLineInSourceMode(lineIndex)) {
			return [];
		}
		const hidden: HiddenRange[] = [];
		const blockDecoration = this.getCachedBlockLineDecoration(
			lineIndex,
			lineFrom,
			lineTo,
			lineText,
		);
		hidden.push(...blockDecoration.hidden);

		const styles: InlineRange[] = [];
		const links: LinkRange[] = [];
		this.collectLinkRangesForLine(
			lineFrom,
			lineTo,
			lineText,
			hidden,
			styles,
			links,
		);
		this.collectInlineMathRangesForLine(lineFrom, lineTo, lineText, hidden);

		const view = this.getEditorViewForSyntax();
		if (view) {
			try {
				syntaxTree(view.state).iterate({
					from: lineFrom,
					to: lineTo,
					enter: (node) => {
						const name = node.type.name;
						if (this.isMarkdownSyntaxMarkerNode(name)) {
							hidden.push({ from: node.from, to: node.to });
							return;
						}
						if (this.isInlineStyleNode(name)) {
							this.pushHiddenMarkersForStyleNode(
								this.sotEditor?.getDoc() ?? "",
								name,
								node.from,
								node.to,
								hidden,
							);
						}
					},
				});
			} catch (_) {
				// noop: syntaxTree解析失敗は無視
			}
		}

		return this.mergeRanges(
			hidden
				.map((range) => ({
					from: Math.max(lineFrom, Math.min(range.from, lineTo)),
					to: Math.max(lineFrom, Math.min(range.to, lineTo)),
				}))
				.filter((range) => range.to > range.from),
		);
	}

	private getEditorViewForSyntax(): EditorView | null {
		const view = this.sotEditor?.getEditorView?.() ?? null;
		return view ?? null;
	}

	private normalizeOffsetToVisible(
		offset: number,
		preferForward: boolean,
	): number {
		if (!this.sotEditor) return offset;
		const docLength = this.sotEditor.getDoc().length;
		const safeOffset = Math.max(0, Math.min(offset, docLength));
		if (this.plainTextViewEnabled) {
			return safeOffset;
		}
		const lineIndex = this.findLineIndex(safeOffset);
		if (lineIndex === null) return safeOffset;
		const mathStart = this.lineMathBlockStart[lineIndex];
		const mathEnd = this.lineMathBlockEnd[lineIndex];
		if (
			mathStart !== null &&
			mathEnd !== null &&
			!this.isLineInSourceMode(lineIndex)
		) {
			const startRange = this.lineRanges[mathStart];
			if (startRange) return startRange.from;
		}
		const calloutStart = this.lineCalloutBlockStart[lineIndex];
		const calloutEnd = this.lineCalloutBlockEnd[lineIndex];
		if (
			calloutStart !== null &&
			calloutEnd !== null &&
			!this.isLineInSourceMode(lineIndex)
		) {
			const startRange = this.lineRanges[calloutStart];
			if (startRange) return startRange.from;
		}
		const tableStart = this.lineTableBlockStart[lineIndex];
		const tableEnd = this.lineTableBlockEnd[lineIndex];
		if (
			tableStart !== null &&
			tableEnd !== null &&
			!this.isLineInSourceMode(lineIndex)
		) {
			const startRange = this.lineRanges[tableStart];
			if (startRange) return startRange.from;
		}
		const deflistStart = this.lineDeflistBlockStart[lineIndex];
		const deflistEnd = this.lineDeflistBlockEnd[lineIndex];
		if (
			deflistStart !== null &&
			deflistEnd !== null &&
			!this.isLineInSourceMode(lineIndex)
		) {
			const startRange = this.lineRanges[deflistStart];
			if (startRange) return startRange.from;
		}
		const headingHiddenBy = this.lineHeadingHiddenBy[lineIndex];
		if (headingHiddenBy !== null && !this.isLineInSourceMode(lineIndex)) {
			const startRange = this.lineRanges[headingHiddenBy];
			if (startRange) return startRange.from;
		}
		if (this.isLineInSourceMode(lineIndex)) {
			return safeOffset;
		}
		const range = this.lineRanges[lineIndex];
		if (!range) return safeOffset;
		const lineKind = this.lineBlockKinds[lineIndex] ?? "normal";
		const hiddenFrontmatterLine =
			this.hideFrontmatter &&
			this.frontmatterDetected &&
			(lineKind === "frontmatter" || lineKind === "frontmatter-fence");
		if (hiddenFrontmatterLine) {
			return this.findNearestCaretVisibleOffset(lineIndex, preferForward);
		}
		const segments = this.buildSegmentsForLine(range.from, range.to);
		if (segments.length === 0) {
			if (range.from === range.to) {
				return range.from;
			}
			return this.findNearestCaretVisibleOffset(lineIndex, preferForward);
		}
		const first = segments[0]!;
		const last = segments[segments.length - 1]!;
		if (safeOffset <= first.from) return first.from;
		if (safeOffset >= last.to) return last.to;
		for (let i = 0; i < segments.length; i += 1) {
			const seg = segments[i]!;
			if (safeOffset >= seg.from && safeOffset <= seg.to) {
				return Math.max(seg.from, Math.min(safeOffset, seg.to));
			}
			const next = segments[i + 1];
			if (next && safeOffset > seg.to && safeOffset < next.from) {
				return preferForward ? next.from : seg.to;
			}
		}
		return safeOffset;
	}

	private findNearestCaretVisibleOffset(
		lineIndex: number,
		preferForward: boolean,
	): number {
		const step = preferForward ? 1 : -1;
		for (
			let i = lineIndex;
			i >= 0 && i < this.lineRanges.length;
			i += step
		) {
			if (this.isLineInSourceMode(i)) {
				const range = this.lineRanges[i];
				if (range) return preferForward ? range.from : range.to;
				continue;
			}
			const kind = this.lineBlockKinds[i] ?? "normal";
			const hiddenFrontmatterLine =
				this.hideFrontmatter &&
				this.frontmatterDetected &&
				(kind === "frontmatter" || kind === "frontmatter-fence");
			if (hiddenFrontmatterLine) {
				continue;
			}
			const range = this.lineRanges[i];
			if (!range) continue;
			const segments = this.buildSegmentsForLine(range.from, range.to);
			if (segments.length === 0) {
				if (range.from === range.to) {
					return range.from;
				}
				continue;
			}
			const first = segments[0];
			const last = segments[segments.length - 1];
			if (!first || !last) continue;
			return preferForward ? first.from : last.to;
		}
		return preferForward
			? this.sotEditor?.getDoc().length ?? 0
			: 0;
	}

	private getVisibleDocStartOffset(): number {
		if (!this.sotEditor || this.lineRanges.length === 0) return 0;
		return this.findNearestCaretVisibleOffset(0, true);
	}

	private setSelectionNormalized(
		anchor: number,
		head: number,
		options: { syncDom?: boolean } = {},
	): void {
		if (!this.sotEditor) return;
		const preferForward = head >= anchor;
		const normalizedAnchor = this.normalizeOffsetToVisible(
			anchor,
			preferForward,
		);
		const normalizedHead = this.normalizeOffsetToVisible(
			head,
			preferForward,
		);
		if (this.shouldUseSoftSelectionForAutoScroll()) {
			if (this.isPointerSelecting) {
				this.softSelectionPointerLock = true;
			}
			this.setSoftSelection(normalizedAnchor, normalizedHead);
			this.scheduleSelectionOverlayUpdate();
			return;
		}
		if (
			this.shouldUseSoftSelectionForPointer(
				normalizedAnchor,
				normalizedHead,
			)
		) {
			this.softSelectionPointerLock = true;
			this.setSoftSelection(normalizedAnchor, normalizedHead);
			this.scheduleSelectionOverlayUpdate();
			return;
		}
		if (this.softSelectionActive) {
			const range = this.getSoftSelectionRange();
			if (
				!range ||
				range.from !== Math.min(normalizedAnchor, normalizedHead) ||
				range.to !== Math.max(normalizedAnchor, normalizedHead)
			) {
				this.clearSoftSelection();
			}
		}
		this.sotEditor.setSelection({
			anchor: normalizedAnchor,
			head: normalizedHead,
		});
		const shouldSyncDom = options.syncDom !== false;
		if (shouldSyncDom) {
			this.nativeSelectionSupport?.syncDomSelectionFromSot(
				normalizedAnchor,
				normalizedHead,
			);
		}
	}

	private isInlineStyleNode(name: string): InlineStyleClass | null {
		// CodeMirror/LezerのMarkdownノード名は環境により多少揺れるため、よく使うものを中心に拾う
		switch (name) {
			case "StrongEmphasis":
				return "tategaki-md-strong";
			case "Emphasis":
				return "tategaki-md-em";
			case "CodeText":
			case "InlineCode":
				return "tategaki-md-code";
			case "Strikethrough":
				return "tategaki-md-strike";
			case "Highlight":
				return "tategaki-md-highlight";
			case "Link":
			case "LinkText":
			case "URL":
				return "tategaki-md-link";
			default:
				return null;
		}
	}

	private isMarkdownSyntaxMarkerNode(name: string): boolean {
		// インライン装飾の記号だけを対象にする（見出し/リスト等のブロック記号は当面そのまま表示）
		// 例: ** / * / _ / ` / ~~ / ==
		return (
			name === "EmphasisMark" ||
			name === "CodeMark" ||
			name === "StrikethroughMark" ||
			name === "HighlightMark" ||
			/(Emphasis|Code|Strikethrough|Highlight)Mark$/.test(name)
		);
	}

	private pushHiddenMarkerPairIfMatched(
		doc: string,
		absFrom: number,
		absTo: number,
		open: string,
		close: string,
		hidden: HiddenRange[],
	): void {
		if (absTo - absFrom < open.length + close.length) return;
		if (doc.slice(absFrom, absFrom + open.length) !== open) return;
		if (doc.slice(absTo - close.length, absTo) !== close) return;
		hidden.push({ from: absFrom, to: absFrom + open.length });
		hidden.push({ from: absTo - close.length, to: absTo });
	}

	private pushHiddenMarkersForStyleNode(
		doc: string,
		name: string,
		absFrom: number,
		absTo: number,
		hidden: HiddenRange[],
	): void {
		// 環境差で「Mark系ノード」が取れない/片側だけ取れる場合があるため、
		// スタイルノード境界のテキストからもマーカーを消す（両端一致時のみ）。
		switch (name) {
			case "StrongEmphasis": {
				// `***text***` / `___text___` のケースもあり得る
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"***",
					"***",
					hidden,
				);
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"___",
					"___",
					hidden,
				);
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"**",
					"**",
					hidden,
				);
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"__",
					"__",
					hidden,
				);
				break;
			}
			case "Emphasis": {
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"*",
					"*",
					hidden,
				);
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"_",
					"_",
					hidden,
				);
				break;
			}
			case "Strikethrough": {
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"~~",
					"~~",
					hidden,
				);
				break;
			}
			case "Highlight": {
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					"==",
					"==",
					hidden,
				);
				break;
			}
			case "CodeText":
			case "InlineCode": {
				// `code` / ``code`` のようにバッククォートの本数が揃う
				let fenceLen = 0;
				while (
					absFrom + fenceLen < absTo &&
					doc[absFrom + fenceLen] === "`"
				) {
					fenceLen += 1;
				}
				if (fenceLen <= 0) break;
				const open = "`".repeat(fenceLen);
				this.pushHiddenMarkerPairIfMatched(
					doc,
					absFrom,
					absTo,
					open,
					open,
					hidden,
				);
				break;
			}
			default:
				break;
		}
	}

	private normalizeLinkLabel(label: string): string {
		return label
			.replace(/\\(.)/g, "$1")
			.trim()
			.replace(/\s+/g, " ")
			.toLowerCase();
	}

	private mergeRanges(ranges: HiddenRange[]): HiddenRange[] {
		if (ranges.length <= 1) return ranges;
		const sorted = ranges
			.slice()
			.sort((a, b) => a.from - b.from || a.to - b.to);
		const merged: HiddenRange[] = [];
		for (const range of sorted) {
			const last = merged[merged.length - 1];
			if (!last || range.from > last.to) {
				merged.push({ from: range.from, to: range.to });
				continue;
			}
			last.to = Math.max(last.to, range.to);
		}
		return merged;
	}

	private collectLinkRangesForLine(
		absFrom: number,
		absTo: number,
		lineText: string,
		hidden: HiddenRange[],
		styles: InlineRange[],
		links: LinkRange[],
	): void {
		// Markdownのリンク記法は環境差で構文木が取りにくいため、行内の最小パーサで隠す/装飾する。
		// 対象:
		// - `[text](url)`（画像 `![alt](url)` は除外）
		// - 参照リンク `[text][id]` / `[text][]` / `[text]`
		// - 自動リンク `<https://...>` / `<mail@...>`
		// - `[[target]]` / `[[target|alias]]` / `![[...]]`（埋め込みもとりあえずリンク扱い）
		const clampRel = (rel: number): number =>
			Math.max(0, Math.min(rel, lineText.length));
		const pushHiddenRel = (relFrom: number, relTo: number): void => {
			const from = absFrom + clampRel(relFrom);
			const to = absFrom + clampRel(relTo);
			if (to <= from) return;
			hidden.push({ from, to });
		};
		const pushStyledRel = (
			relFrom: number,
			relTo: number,
			className: InlineStyleClass,
			href?: string,
		): void => {
			const from = absFrom + clampRel(relFrom);
			const to = absFrom + clampRel(relTo);
			if (to <= from) return;
			styles.push({ from, to, className });
			if (href) {
				links.push({ from, to, href });
			}
		};
		const isEscaped = (index: number): boolean => {
			// 直前のバックスラッシュが奇数個ならエスケープ
			let backslashes = 0;
			for (let i = index - 1; i >= 0; i -= 1) {
				if (lineText[i] !== "\\") break;
				backslashes += 1;
			}
			return backslashes % 2 === 1;
		};

		const parseLinkDestination = (raw: string): string => {
			const trimmed = raw.trim();
			if (trimmed.length === 0) return "";
			if (trimmed.startsWith("<")) {
				const end = trimmed.indexOf(">");
				if (end > 1) return trimmed.slice(1, end);
			}
			// タイトル `"..."` / `'...'` は一旦無視し、先頭トークンだけ使う
			const m = /^[^\s]+/.exec(trimmed);
			return m?.[0] ?? trimmed;
		};

		let inCodeFenceLen: number | null = null;
		const len = lineText.length;
		for (let i = 0; i < len; i += 1) {
			const ch = lineText[i]!;
			if (ch === "`" && !isEscaped(i)) {
				let fenceLen = 1;
				while (i + fenceLen < len && lineText[i + fenceLen] === "`") {
					fenceLen += 1;
				}
				if (inCodeFenceLen === null) {
					inCodeFenceLen = fenceLen;
				} else if (inCodeFenceLen === fenceLen) {
					inCodeFenceLen = null;
				}
				i += fenceLen - 1;
				continue;
			}
			if (inCodeFenceLen !== null) continue;

			// 自動リンク: <https://...> / <mail@...>
			if (ch === "<") {
				const close = lineText.indexOf(">", i + 1);
				if (close > i + 1) {
					const inside = lineText.slice(i + 1, close);
					if (!/\s/.test(inside)) {
						const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(inside);
						const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
							inside,
						);
						if (isUrl || isEmail) {
							const href = isEmail ? `mailto:${inside}` : inside;
							pushHiddenRel(i, i + 1);
							pushHiddenRel(close, close + 1);
							pushStyledRel(
								i + 1,
								close,
								"tategaki-md-link",
								href,
							);
							i = close;
							continue;
						}
					}
				}
			}

			// `![alt](url)`（画像）
			if (
				ch === "!" &&
				!isEscaped(i) &&
				i + 1 < len &&
				lineText[i + 1] === "["
			) {
				// alt の `]` を探す（ネスト考慮）
				let depth = 1;
				let closeBracket = -1;
				for (let j = i + 2; j < len; j += 1) {
					const c = lineText[j]!;
					if (c === "\\" && j + 1 < len) {
						j += 1;
						continue;
					}
					if (c === "[" && !isEscaped(j)) depth += 1;
					if (c === "]" && !isEscaped(j)) {
						depth -= 1;
						if (depth === 0) {
							closeBracket = j;
							break;
						}
					}
				}
				if (closeBracket === -1) continue;
				let k = closeBracket + 1;
				while (k < len && /\s/.test(lineText[k]!)) k += 1;
				if (k >= len || lineText[k] !== "(") continue;
				const openParen = k;
				let parenDepth = 1;
				let closeParen = -1;
				for (let j = openParen + 1; j < len; j += 1) {
					const c = lineText[j]!;
					if (c === "\\" && j + 1 < len) {
						j += 1;
						continue;
					}
					if (c === "(" && !isEscaped(j)) parenDepth += 1;
					if (c === ")" && !isEscaped(j)) {
						parenDepth -= 1;
						if (parenDepth === 0) {
							closeParen = j;
							break;
						}
					}
				}
				if (closeParen === -1) continue;

				const altRelFrom = i + 2;
				const altRelTo = closeBracket;
				const destRaw = lineText.slice(openParen + 1, closeParen);
				const href = parseLinkDestination(destRaw);

				// `![` と `](url)` を隠す（alt だけ残す）
				pushHiddenRel(i, i + 2);
				pushHiddenRel(closeBracket, closeParen + 1);

				if (altRelTo > altRelFrom) {
					pushStyledRel(
						altRelFrom,
						altRelTo,
						"tategaki-md-image",
						href || undefined,
					);
				} else if (href) {
					// alt が空の場合は URL を残す（入力とマッピングを壊さないため）
					const hrefRelFrom = openParen + 1;
					const hrefRelTo = closeParen;
					pushStyledRel(
						hrefRelFrom,
						hrefRelTo,
						"tategaki-md-image",
						href,
					);
					// `](` と `)` は隠すが、中身は残す
					pushHiddenRel(closeBracket, openParen + 1);
					pushHiddenRel(closeParen, closeParen + 1);
				}
				i = closeParen;
				continue;
			}

			// `![[...]]`
			if (
				ch === "!" &&
				!isEscaped(i) &&
				i + 2 < len &&
				lineText.slice(i + 1, i + 3) === "[["
			) {
				const open = i + 1;
				const close = lineText.indexOf("]]", open + 2);
				if (close === -1) continue;
				const content = lineText.slice(open + 2, close);
				const pipe = content.indexOf("|");
				const rawTarget = pipe >= 0 ? content.slice(0, pipe) : content;
				const rawAlias = pipe >= 0 ? content.slice(pipe + 1) : null;
				const target = rawTarget.trim();
				const display =
					rawAlias !== null && rawAlias.length > 0
						? rawAlias
						: rawTarget;
				const displayStartRel =
					rawAlias !== null ? open + 2 + pipe + 1 : open + 2;
				const displayEndRel = displayStartRel + display.length;

				pushHiddenRel(i, i + 1); // `!`
				pushHiddenRel(open, open + 2); // `[[`
				pushHiddenRel(close, close + 2); // `]]`
				if (pipe >= 0) {
					// target と `|` を隠す
					pushHiddenRel(open + 2, open + 2 + pipe + 1);
				}
				if (target.length > 0) {
					const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(
						target,
					);
					pushStyledRel(
						displayStartRel,
						displayEndRel,
						isImage ? "tategaki-md-image" : "tategaki-md-embed",
						target,
					);
				}
				i = close + 1;
				continue;
			}

			// `[[...]]`
			if (
				ch === "[" &&
				!isEscaped(i) &&
				i + 1 < len &&
				lineText[i + 1] === "["
			) {
				const open = i;
				const close = lineText.indexOf("]]", open + 2);
				if (close === -1) continue;
				const content = lineText.slice(open + 2, close);
				const pipe = content.indexOf("|");
				const rawTarget = pipe >= 0 ? content.slice(0, pipe) : content;
				const rawAlias = pipe >= 0 ? content.slice(pipe + 1) : null;
				const target = rawTarget.trim();
				const display =
					rawAlias !== null && rawAlias.length > 0
						? rawAlias
						: rawTarget;
				const displayStartRel =
					rawAlias !== null ? open + 2 + pipe + 1 : open + 2;
				const displayEndRel = displayStartRel + display.length;

				pushHiddenRel(open, open + 2); // `[[`
				pushHiddenRel(close, close + 2); // `]]`
				if (pipe >= 0) {
					// target と `|` を隠す
					pushHiddenRel(open + 2, open + 2 + pipe + 1);
				}
				if (target.length > 0) {
					pushStyledRel(
						displayStartRel,
						displayEndRel,
						"tategaki-md-link",
						target,
					);
				}
				i = close + 1;
				continue;
			}

			// `[^id]`（脚注参照）
			if (
				ch === "[" &&
				!isEscaped(i) &&
				i + 2 < len &&
				lineText[i + 1] === "^"
			) {
				const close = lineText.indexOf("]", i + 2);
				if (close === -1) continue;
				const id = lineText.slice(i + 2, close);
				if (id.length === 0) continue;
				// `[` `^` `]` を隠して id だけ残す
				pushHiddenRel(i, i + 2);
				pushHiddenRel(close, close + 1);
				pushStyledRel(i + 2, close, "tategaki-md-footnote-ref");
				i = close;
				continue;
			}

			// `[text](url)`（画像 `![alt](url)` は除外）
			if (ch === "[" && !isEscaped(i)) {
				if (i > 0 && lineText[i - 1] === "!" && !isEscaped(i - 1)) {
					continue;
				}
				// link text の `]` を探す（ネスト考慮）
				let depth = 1;
				let closeBracket = -1;
				for (let j = i + 1; j < len; j += 1) {
					const c = lineText[j]!;
					if (c === "\\" && j + 1 < len) {
						j += 1;
						continue;
					}
					if (c === "[" && !isEscaped(j)) depth += 1;
					if (c === "]" && !isEscaped(j)) {
						depth -= 1;
						if (depth === 0) {
							closeBracket = j;
							break;
						}
					}
				}
				if (closeBracket === -1) continue;
				let k = closeBracket + 1;
				while (k < len && /\s/.test(lineText[k]!)) k += 1;
				const linkTextRelFrom = i + 1;
				const linkTextRelTo = closeBracket;
				let handled = false;

				if (k < len && lineText[k] === "(") {
					const openParen = k;
					// url の `)` を探す（括弧ネストを少し考慮）
					let parenDepth = 1;
					let closeParen = -1;
					for (let j = openParen + 1; j < len; j += 1) {
						const c = lineText[j]!;
						if (c === "\\" && j + 1 < len) {
							j += 1;
							continue;
						}
						if (c === "(" && !isEscaped(j)) parenDepth += 1;
						if (c === ")" && !isEscaped(j)) {
							parenDepth -= 1;
							if (parenDepth === 0) {
								closeParen = j;
								break;
							}
						}
					}
					if (closeParen !== -1) {
						const destRaw = lineText.slice(
							openParen + 1,
							closeParen,
						);
						const href = parseLinkDestination(destRaw);
						// `[` と `](url)` を隠す（間のリンクテキストだけ残す）
						pushHiddenRel(i, i + 1);
						pushHiddenRel(closeBracket, closeParen + 1);
						if (href.length > 0) {
							pushStyledRel(
								linkTextRelFrom,
								linkTextRelTo,
								"tategaki-md-link",
								href,
							);
						}
						i = closeParen;
						handled = true;
					}
				} else if (k < len && lineText[k] === "[") {
					const refOpen = k;
					const refClose = lineText.indexOf("]", refOpen + 1);
					if (refClose !== -1) {
						const rawLabel = lineText.slice(refOpen + 1, refClose);
						const refLabel =
							rawLabel.length > 0
								? rawLabel
								: lineText.slice(
										linkTextRelFrom,
										linkTextRelTo,
									);
						const href = this.linkReferenceMap.get(
							this.normalizeLinkLabel(refLabel),
						);
						if (href) {
							pushHiddenRel(i, i + 1);
							pushHiddenRel(closeBracket, closeBracket + 1);
							pushHiddenRel(refOpen, refClose + 1);
							pushStyledRel(
								linkTextRelFrom,
								linkTextRelTo,
								"tategaki-md-link",
								href,
							);
							i = refClose;
							handled = true;
						}
					}
				} else {
					const refLabel = lineText.slice(
						linkTextRelFrom,
						linkTextRelTo,
					);
					const href = this.linkReferenceMap.get(
						this.normalizeLinkLabel(refLabel),
					);
					if (href) {
						pushHiddenRel(i, i + 1);
						pushHiddenRel(closeBracket, closeBracket + 1);
						pushStyledRel(
							linkTextRelFrom,
							linkTextRelTo,
							"tategaki-md-link",
							href,
						);
						i = closeBracket;
						handled = true;
					}
				}
				if (handled) continue;
			}

			// `^[text]`（インライン脚注）
			if (
				ch === "^" &&
				!isEscaped(i) &&
				i + 1 < len &&
				lineText[i + 1] === "["
			) {
				let close = -1;
				for (let j = i + 2; j < len; j += 1) {
					if (lineText[j] !== "]") continue;
					if (isEscaped(j)) continue;
					close = j;
					break;
				}
				if (close === -1) continue;
				if (close <= i + 2) {
					i = close;
					continue;
				}
				// `^[` と `]` を隠して本文だけ残す
				pushHiddenRel(i, i + 2);
				pushHiddenRel(close, close + 1);
				pushStyledRel(i + 2, close, "tategaki-md-footnote-inline");
				i = close;
				continue;
			}
		}

		// 行の範囲外に出ていたら安全側に落とす
		const clampedHidden: HiddenRange[] = [];
		for (const r of hidden) {
			const from = Math.max(absFrom, Math.min(r.from, absTo));
			const to = Math.max(absFrom, Math.min(r.to, absTo));
			if (to > from) clampedHidden.push({ from, to });
		}
		hidden.splice(0, hidden.length, ...clampedHidden);
	}

	private collectClearableLinkSpansForLine(
		absFrom: number,
		lineText: string,
	): ClearableSpan[] {
		const spans: ClearableSpan[] = [];
		const clampRel = (rel: number): number =>
			Math.max(0, Math.min(rel, lineText.length));
		const toAbs = (rel: number): number => absFrom + clampRel(rel);
		const pushSpan = (
			relFrom: number,
			relTo: number,
			markerRelRanges: Array<{ from: number; to: number }>,
		): void => {
			const from = toAbs(relFrom);
			const to = toAbs(relTo);
			if (to <= from) return;
			const markers = markerRelRanges
				.map((range) => ({
					from: toAbs(range.from),
					to: toAbs(range.to),
				}))
				.filter((range) => range.to > range.from);
			if (markers.length === 0) return;
			spans.push({ from, to, markers });
		};

		const isEscaped = (index: number): boolean => {
			let backslashes = 0;
			for (let i = index - 1; i >= 0; i -= 1) {
				if (lineText[i] !== "\\") break;
				backslashes += 1;
			}
			return backslashes % 2 === 1;
		};

		const parseLinkDestination = (raw: string): string => {
			const trimmed = raw.trim();
			if (trimmed.length === 0) return "";
			if (trimmed.startsWith("<")) {
				const end = trimmed.indexOf(">");
				if (end > 1) return trimmed.slice(1, end);
			}
			const m = /^[^\s]+/.exec(trimmed);
			return m?.[0] ?? trimmed;
		};

		let inCodeFenceLen: number | null = null;
		const len = lineText.length;
		for (let i = 0; i < len; i += 1) {
			const ch = lineText[i]!;
			if (ch === "`" && !isEscaped(i)) {
				let fenceLen = 1;
				while (i + fenceLen < len && lineText[i + fenceLen] === "`") {
					fenceLen += 1;
				}
				if (inCodeFenceLen === null) {
					inCodeFenceLen = fenceLen;
				} else if (inCodeFenceLen === fenceLen) {
					inCodeFenceLen = null;
				}
				i += fenceLen - 1;
				continue;
			}
			if (inCodeFenceLen !== null) continue;

			// 自動リンク: <https://...> / <mail@...>
			if (ch === "<") {
				const close = lineText.indexOf(">", i + 1);
				if (close > i + 1) {
					const inside = lineText.slice(i + 1, close);
					if (!/\s/.test(inside)) {
						const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(inside);
						const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
							inside,
						);
						if (isUrl || isEmail) {
							pushSpan(i + 1, close, [
								{ from: i, to: i + 1 },
								{ from: close, to: close + 1 },
							]);
							i = close;
							continue;
						}
					}
				}
			}

			// `![[...]]`
			if (
				ch === "!" &&
				!isEscaped(i) &&
				i + 2 < len &&
				lineText[i + 1] === "[" &&
				lineText[i + 2] === "["
			) {
				const open = i;
				const close = lineText.indexOf("]]", open + 3);
				if (close === -1) continue;
				const content = lineText.slice(open + 3, close);
				const pipe = content.indexOf("|");
				const rawTarget = pipe >= 0 ? content.slice(0, pipe) : content;
				const rawAlias = pipe >= 0 ? content.slice(pipe + 1) : null;
				const display =
					rawAlias !== null && rawAlias.length > 0
						? rawAlias
						: rawTarget;
				const displayStartRel =
					pipe >= 0 ? open + 3 + pipe + 1 : open + 3;
				const displayEndRel = displayStartRel + display.length;
				const markerRanges: Array<{ from: number; to: number }> = [
					{ from: open, to: open + 3 },
					{ from: close, to: close + 2 },
				];
				if (pipe >= 0) {
					markerRanges.push({
						from: open + 3,
						to: open + 3 + pipe + 1,
					});
				}
				pushSpan(displayStartRel, displayEndRel, markerRanges);
				i = close + 1;
				continue;
			}

			// `[[...]]`
			if (
				ch === "[" &&
				!isEscaped(i) &&
				i + 1 < len &&
				lineText[i + 1] === "["
			) {
				const open = i;
				const close = lineText.indexOf("]]", open + 2);
				if (close === -1) continue;
				const content = lineText.slice(open + 2, close);
				const pipe = content.indexOf("|");
				const rawTarget = pipe >= 0 ? content.slice(0, pipe) : content;
				const rawAlias = pipe >= 0 ? content.slice(pipe + 1) : null;
				const display =
					rawAlias !== null && rawAlias.length > 0
						? rawAlias
						: rawTarget;
				const displayStartRel =
					pipe >= 0 ? open + 2 + pipe + 1 : open + 2;
				const displayEndRel = displayStartRel + display.length;
				const markerRanges: Array<{ from: number; to: number }> = [
					{ from: open, to: open + 2 },
					{ from: close, to: close + 2 },
				];
				if (pipe >= 0) {
					markerRanges.push({
						from: open + 2,
						to: open + 2 + pipe + 1,
					});
				}
				pushSpan(displayStartRel, displayEndRel, markerRanges);
				i = close + 1;
				continue;
			}

			// `[^id]`（脚注参照）
			if (
				ch === "[" &&
				!isEscaped(i) &&
				i + 2 < len &&
				lineText[i + 1] === "^"
			) {
				const close = lineText.indexOf("]", i + 2);
				if (close === -1) continue;
				const id = lineText.slice(i + 2, close);
				if (id.length === 0) continue;
				pushSpan(i + 2, close, [
					{ from: i, to: i + 2 },
					{ from: close, to: close + 1 },
				]);
				i = close;
				continue;
			}

			// `[text](url)`（画像 `![alt](url)` は除外）
			if (ch === "[" && !isEscaped(i)) {
				if (i > 0 && lineText[i - 1] === "!" && !isEscaped(i - 1)) {
					continue;
				}
				let depth = 1;
				let closeBracket = -1;
				for (let j = i + 1; j < len; j += 1) {
					const c = lineText[j]!;
					if (c === "\\" && j + 1 < len) {
						j += 1;
						continue;
					}
					if (c === "[" && !isEscaped(j)) depth += 1;
					if (c === "]" && !isEscaped(j)) {
						depth -= 1;
						if (depth === 0) {
							closeBracket = j;
							break;
						}
					}
				}
				if (closeBracket === -1) continue;
				let k = closeBracket + 1;
				while (k < len && /\s/.test(lineText[k]!)) k += 1;
				const linkTextRelFrom = i + 1;
				const linkTextRelTo = closeBracket;
				let handled = false;

				if (k < len && lineText[k] === "(") {
					const openParen = k;
					let parenDepth = 1;
					let closeParen = -1;
					for (let j = openParen + 1; j < len; j += 1) {
						const c = lineText[j]!;
						if (c === "\\" && j + 1 < len) {
							j += 1;
							continue;
						}
						if (c === "(" && !isEscaped(j)) parenDepth += 1;
						if (c === ")" && !isEscaped(j)) {
							parenDepth -= 1;
							if (parenDepth === 0) {
								closeParen = j;
								break;
							}
						}
					}
					if (closeParen !== -1) {
						const destRaw = lineText.slice(
							openParen + 1,
							closeParen,
						);
						const href = parseLinkDestination(destRaw);
						if (href.length > 0) {
							pushSpan(linkTextRelFrom, linkTextRelTo, [
								{ from: i, to: i + 1 },
								{ from: closeBracket, to: closeParen + 1 },
							]);
							i = closeParen;
							handled = true;
						}
					}
				} else if (k < len && lineText[k] === "[") {
					const refOpen = k;
					const refClose = lineText.indexOf("]", refOpen + 1);
					if (refClose !== -1) {
						const rawLabel = lineText.slice(refOpen + 1, refClose);
						const refLabel =
							rawLabel.length > 0
								? rawLabel
								: lineText.slice(
										linkTextRelFrom,
										linkTextRelTo,
									);
						const href = this.linkReferenceMap.get(
							this.normalizeLinkLabel(refLabel),
						);
						if (href) {
							pushSpan(linkTextRelFrom, linkTextRelTo, [
								{ from: i, to: i + 1 },
								{ from: closeBracket, to: closeBracket + 1 },
								{ from: refOpen, to: refClose + 1 },
							]);
							i = refClose;
							handled = true;
						}
					}
				} else {
					const refLabel = lineText.slice(
						linkTextRelFrom,
						linkTextRelTo,
					);
					const href = this.linkReferenceMap.get(
						this.normalizeLinkLabel(refLabel),
					);
					if (href) {
						pushSpan(linkTextRelFrom, linkTextRelTo, [
							{ from: i, to: i + 1 },
							{ from: closeBracket, to: closeBracket + 1 },
						]);
						i = closeBracket;
						handled = true;
					}
				}
				if (handled) continue;
			}

			// `![alt](url)`（画像）
			if (
				ch === "!" &&
				!isEscaped(i) &&
				i + 1 < len &&
				lineText[i + 1] === "["
			) {
				let depth = 1;
				let closeBracket = -1;
				for (let j = i + 2; j < len; j += 1) {
					const c = lineText[j]!;
					if (c === "\\" && j + 1 < len) {
						j += 1;
						continue;
					}
					if (c === "[" && !isEscaped(j)) depth += 1;
					if (c === "]" && !isEscaped(j)) {
						depth -= 1;
						if (depth === 0) {
							closeBracket = j;
							break;
						}
					}
				}
				if (closeBracket === -1) continue;
				let k = closeBracket + 1;
				while (k < len && /\s/.test(lineText[k]!)) k += 1;
				if (k >= len || lineText[k] !== "(") continue;
				const openParen = k;
				let parenDepth = 1;
				let closeParen = -1;
				for (let j = openParen + 1; j < len; j += 1) {
					const c = lineText[j]!;
					if (c === "\\" && j + 1 < len) {
						j += 1;
						continue;
					}
					if (c === "(" && !isEscaped(j)) parenDepth += 1;
					if (c === ")" && !isEscaped(j)) {
						parenDepth -= 1;
						if (parenDepth === 0) {
							closeParen = j;
							break;
						}
					}
				}
				if (closeParen === -1) continue;
				const altRelFrom = i + 2;
				const altRelTo = closeBracket;
				const destRaw = lineText.slice(openParen + 1, closeParen);
				const href = parseLinkDestination(destRaw);
				if (href.length === 0) continue;
				pushSpan(altRelFrom, altRelTo, [
					{ from: i, to: i + 2 },
					{ from: closeBracket, to: closeParen + 1 },
				]);
				i = closeParen;
				continue;
			}

			// `^[text]`（インライン脚注）
			if (
				ch === "^" &&
				!isEscaped(i) &&
				i + 1 < len &&
				lineText[i + 1] === "["
			) {
				let close = -1;
				for (let j = i + 2; j < len; j += 1) {
					if (lineText[j] !== "]") continue;
					if (isEscaped(j)) continue;
					close = j;
					break;
				}
				if (close === -1) continue;
				if (close <= i + 2) {
					i = close;
					continue;
				}
				pushSpan(i + 2, close, [
					{ from: i, to: i + 2 },
					{ from: close, to: close + 1 },
				]);
				i = close;
				continue;
			}
		}

		return spans;
	}

	private parseInlineMathSpansForLine(
		lineText: string,
	): Array<{ open: number; close: number; source: string }> {
		const spans: Array<{ open: number; close: number; source: string }> =
			[];
		const isEscaped = (index: number): boolean => {
			let backslashes = 0;
			for (let i = index - 1; i >= 0; i -= 1) {
				if (lineText[i] !== "\\") break;
				backslashes += 1;
			}
			return backslashes % 2 === 1;
		};
		let inCodeFenceLen: number | null = null;
		for (let i = 0; i < lineText.length; i += 1) {
			const ch = lineText[i]!;
			if (ch === "`" && !isEscaped(i)) {
				let fenceLen = 1;
				while (
					i + fenceLen < lineText.length &&
					lineText[i + fenceLen] === "`"
				) {
					fenceLen += 1;
				}
				if (inCodeFenceLen === null) {
					inCodeFenceLen = fenceLen;
				} else if (inCodeFenceLen === fenceLen) {
					inCodeFenceLen = null;
				}
				i += fenceLen - 1;
				continue;
			}
			if (inCodeFenceLen !== null) continue;
			if (ch !== "$" || isEscaped(i)) continue;
			if (lineText[i + 1] === "$") continue;

			let close = -1;
			for (let j = i + 1; j < lineText.length; j += 1) {
				if (lineText[j] !== "$") continue;
				if (isEscaped(j)) continue;
				if (lineText[j + 1] === "$") continue;
				close = j;
				break;
			}
			if (close === -1) continue;

			const content = lineText.slice(i + 1, close);
			if (content.trim().length === 0) {
				i = close;
				continue;
			}
			spans.push({ open: i, close, source: content });
			i = close;
		}
		return spans;
	}

	private collectInlineMathMarkerRangesForLine(
		absFrom: number,
		lineText: string,
	): Array<{ from: number; to: number; markers: HiddenRange[] }> {
		const spans = this.parseInlineMathSpansForLine(lineText);
		const clampRel = (rel: number): number =>
			Math.max(0, Math.min(rel, lineText.length));
		const results: Array<{
			from: number;
			to: number;
			markers: HiddenRange[];
		}> = [];
		for (const span of spans) {
			const open = clampRel(span.open);
			const close = clampRel(span.close);
			const from = absFrom + Math.min(open + 1, lineText.length);
			const to = absFrom + Math.min(close, lineText.length);
			const markers: HiddenRange[] = [
				{ from: absFrom + open, to: absFrom + open + 1 },
				{ from: absFrom + close, to: absFrom + close + 1 },
			];
			results.push({ from, to, markers });
		}
		return results;
	}

	private collectClearableRubySpansForLine(
		absFrom: number,
		lineText: string,
	): ClearableSpan[] {
		const spans: ClearableSpan[] = [];
		const regex = createAozoraRubyRegExp();
		for (const match of lineText.matchAll(regex)) {
			const full = match[0] ?? "";
			const start = match.index ?? -1;
			if (!full || start < 0) continue;
			const openIndex = full.indexOf("《");
			const closeIndex = full.lastIndexOf("》");
			if (openIndex < 0 || closeIndex <= openIndex) continue;

			const hasDelimiter = full.startsWith("|") || full.startsWith("｜");
			const baseStartRel = start + (hasDelimiter ? 1 : 0);
			const baseEndRel = start + openIndex;
			if (baseEndRel <= baseStartRel) continue;

			const markers: HiddenRange[] = [];
			if (hasDelimiter) {
				markers.push({
					from: absFrom + start,
					to: absFrom + start + 1,
				});
			}
			markers.push({
				from: absFrom + start + openIndex,
				to: absFrom + start + full.length,
			});

			spans.push({
				from: absFrom + baseStartRel,
				to: absFrom + baseEndRel,
				markers,
			});
		}
		return spans;
	}

	private collectInlineMathRangesForLine(
		absFrom: number,
		absTo: number,
		lineText: string,
		hidden: HiddenRange[],
	): InlineWidget[] {
		// インライン数式 `$...$` は MathJax のウィジェットで表示する（編集はソース側）。
		// マッピングの安定性を優先し、`$...$` 全体を不可視にしてウィジェットを挿入する。
		const clampRel = (rel: number): number =>
			Math.max(0, Math.min(rel, lineText.length));
		const spans = this.parseInlineMathSpansForLine(lineText);
		const widgets: InlineWidget[] = [];
		for (const span of spans) {
			const open = clampRel(span.open);
			const close = clampRel(span.close);
			const from = absFrom + open;
			const to = absFrom + clampRel(close + 1);
			if (to <= from) continue;
			hidden.push({ from, to });
			widgets.push({
				kind: "math-inline",
				from,
				to,
				source: span.source,
			});
		}

		// 安全のためクランプ
		const clampedHidden: HiddenRange[] = [];
		for (const r of hidden) {
			const from = Math.max(absFrom, Math.min(r.from, absTo));
			const to = Math.max(absFrom, Math.min(r.to, absTo));
			if (to > from) clampedHidden.push({ from, to });
		}
		hidden.splice(0, hidden.length, ...clampedHidden);
		return widgets;
	}

	private getInlineWidgetsForLineRange(lineRange: LineRange): InlineWidget[] {
		if (this.plainTextViewEnabled) return [];
		if (!this.sotEditor) return [];
		const doc = this.sotEditor.getDoc();
		const lineText = doc.slice(lineRange.from, lineRange.to);
		return this.collectInlineMathRangesForLine(
			lineRange.from,
			lineRange.to,
			lineText,
			[],
		);
	}

	private computeBlockLineDecoration(
		absFrom: number,
		absTo: number,
		lineText: string,
		lineIndex: number | null,
	): BlockLineDecoration {
		const classes: string[] = [];
		const hidden: HiddenRange[] = [];
		const dataset: Record<string, string> = {};
		const styleVars: Record<string, string> = {};

		if (lineIndex !== null) {
			if (
				this.lineHeadingHiddenBy[lineIndex] !== null &&
				!this.isLineInSourceMode(lineIndex)
			) {
				classes.push("tategaki-md-heading-hidden");
				dataset.mdKind = "heading-hidden";
				hidden.push({ from: absFrom, to: absTo });
				return { classes, hidden, dataset, styleVars };
			}
			const kind = this.lineBlockKinds[lineIndex] ?? "normal";
			if (kind === "math" || kind === "math-fence") {
				const start = this.lineMathBlockStart[lineIndex];
				const end = this.lineMathBlockEnd[lineIndex];
				classes.push("tategaki-md-math");
				if (start !== null && end !== null && lineIndex === start) {
					classes.push("tategaki-md-math-widget");
					dataset.mdKind = "math-widget";
					dataset.mathRange = `${start}-${end}`;
				} else {
					classes.push("tategaki-md-math-hidden");
					dataset.mdKind = "math-hidden";
					if (start !== null && end !== null) {
						dataset.mathRange = `${start}-${end}`;
					}
				}
				hidden.push({ from: absFrom, to: absTo });
				return { classes, hidden, dataset, styleVars };
			}
			if (kind === "callout-title" || kind === "callout") {
				const start = this.lineCalloutBlockStart[lineIndex];
				const end = this.lineCalloutBlockEnd[lineIndex];
				if (
					start !== null &&
					end !== null &&
					!this.isLineInSourceMode(lineIndex)
				) {
					const calloutType =
						this.lineCalloutType[lineIndex] ?? "note";
					classes.push("tategaki-md-callout");
					dataset.calloutType = calloutType;
					dataset.calloutRange = `${start}-${end}`;
					hidden.push({ from: absFrom, to: absTo });
					if (lineIndex === start) {
						classes.push("tategaki-md-callout-widget");
						dataset.mdKind = "callout-widget";
					} else {
						classes.push("tategaki-md-callout-hidden");
						dataset.mdKind = "callout-hidden";
					}
					return { classes, hidden, dataset, styleVars };
				}
			}

			if (kind === "table-row" || kind === "table-sep") {
				const start = this.lineTableBlockStart[lineIndex];
				const end = this.lineTableBlockEnd[lineIndex];
				if (
					start !== null &&
					end !== null &&
					!this.isLineInSourceMode(lineIndex)
				) {
					classes.push("tategaki-md-table");
					dataset.tableRange = `${start}-${end}`;
					hidden.push({ from: absFrom, to: absTo });
					if (lineIndex === start) {
						classes.push("tategaki-md-table-widget");
						dataset.mdKind = "table-widget";
					} else {
						classes.push("tategaki-md-table-hidden");
						dataset.mdKind = "table-hidden";
					}
					return { classes, hidden, dataset, styleVars };
				}
			}
			if (kind === "deflist") {
				const start = this.lineDeflistBlockStart[lineIndex];
				const end = this.lineDeflistBlockEnd[lineIndex];
				if (
					start !== null &&
					end !== null &&
					!this.isLineInSourceMode(lineIndex)
				) {
					classes.push("tategaki-md-deflist");
					dataset.deflistRange = `${start}-${end}`;
					hidden.push({ from: absFrom, to: absTo });
					if (lineIndex === start) {
						classes.push("tategaki-md-deflist-widget");
						dataset.mdKind = "deflist-widget";
					} else {
						classes.push("tategaki-md-deflist-hidden");
						dataset.mdKind = "deflist-hidden";
					}
					return { classes, hidden, dataset, styleVars };
				}
			}

			if (kind === "code-fence") {
				classes.push("tategaki-md-codeblock");
				classes.push("tategaki-md-codeblock-fence");
				dataset.mdKind = "code-fence";
				const info = this.lineCodeFenceInfo[lineIndex];
				if (info) dataset.codeInfo = info;
				const part = this.lineCodeBlockPart[lineIndex];
				if (part) classes.push(`tategaki-md-codeblock-part-${part}`);
				hidden.push({ from: absFrom, to: absTo });
				return { classes, hidden, dataset, styleVars };
			}
			if (kind === "code") {
				classes.push("tategaki-md-codeblock");
				classes.push("hljs");
				dataset.mdKind = "code";
				const part = this.lineCodeBlockPart[lineIndex];
				if (part) classes.push(`tategaki-md-codeblock-part-${part}`);
				return { classes, hidden, dataset, styleVars };
			}
			if (kind === "frontmatter-fence") {
				classes.push("tategaki-md-frontmatter");
				classes.push("tategaki-md-frontmatter-fence");
				dataset.mdKind = "frontmatter-fence";
				hidden.push({ from: absFrom, to: absTo });
				return { classes, hidden, dataset, styleVars };
			}
			if (kind === "frontmatter") {
				classes.push("tategaki-md-frontmatter");
				dataset.mdKind = "frontmatter";
				return { classes, hidden, dataset, styleVars };
			}
		}

		if (lineText.length === 0) {
			return { classes, hidden, dataset, styleVars };
		}

		// 画像（単独行）: `![alt](url)` / `![[file.png]]`
		{
			// Markdown image (Obsidian拡張: `![alt|100](url)` を許容)
			const m = lineText.match(/^[ \t]*!\[([^\]]*)\]\(([^)]+)\)[ \t]*$/);
			if (m && m[0] && m[2]) {
				const rawAlt = m[1] ?? "";
				const rawDest = (m[2] ?? "").trim();
				const dest =
					rawDest.startsWith("<") && rawDest.endsWith(">")
						? rawDest.slice(1, -1)
						: rawDest;
				let alt = rawAlt;
				let width: string | null = null;
				if (rawAlt.includes("|")) {
					const [a, w] = rawAlt.split("|", 2);
					alt = a ?? "";
					const parsed = w?.trim() ?? "";
					if (/^\d+$/.test(parsed)) width = parsed;
				}
				classes.push("tategaki-md-image-widget");
				dataset.mdKind = "image-widget";
				dataset.imageSrc = dest;
				dataset.imageAlt = alt;
				if (width) dataset.imageWidth = width;
				hidden.push({ from: absFrom, to: absTo });
				return { classes, hidden, dataset, styleVars };
			}

			// Wiki embed: `![[...]]`（画像拡張子のみウィジェット化）
			const w = lineText.match(/^[ \t]*!\[\[([^\]]+)\]\][ \t]*$/);
			if (w && w[0] && w[1]) {
				const raw = w[1].trim();
				// `path|100` のようなサイズ指定に対応
				const pipe = raw.indexOf("|");
				const core = pipe >= 0 ? raw.slice(0, pipe).trim() : raw;
				const size = pipe >= 0 ? raw.slice(pipe + 1).trim() : "";
				const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(core);
				if (isImage) {
					classes.push("tategaki-md-image-widget");
					dataset.mdKind = "image-widget";
					dataset.imageSrc = core;
					dataset.imageAlt = "";
					if (/^\d+$/.test(size)) {
						dataset.imageWidth = size;
					}
					hidden.push({ from: absFrom, to: absTo });
					return { classes, hidden, dataset, styleVars };
				}
			}
		}

		// 埋め込み（単独行）: `![[note]]` / `![[note#heading]]` / `![[note^block]]`
		{
			const w = lineText.match(/^[ \t]*!\[\[([^\]]+)\]\][ \t]*$/);
			if (w && w[0] && w[1]) {
				const raw = w[1].trim();
				const pipe = raw.indexOf("|");
				const core = pipe >= 0 ? raw.slice(0, pipe).trim() : raw;
				const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(core);
				if (!isImage) {
					classes.push("tategaki-md-embed-widget");
					dataset.mdKind = "embed-widget";
					dataset.embedTarget = raw;
					hidden.push({ from: absFrom, to: absTo });
					return { classes, hidden, dataset, styleVars };
				}
			}
		}

		const computeIndentDepth = (leading: string): number => {
			let columns = 0;
			for (const ch of leading) {
				if (ch === "\t") {
					columns += 4;
				} else {
					columns += 1;
				}
			}
			// ネストは 4スペース=1階層を基本としつつ、2スペースでも1階層として扱う
			if (columns >= 2 && columns < 4) return 1;
			return Math.max(0, Math.floor(columns / 4));
		};

		const applyListDepth = (depth: number) => {
			dataset.listDepth = String(depth);
			styleVars["--tategaki-sot-list-depth"] = String(depth);
		};

		// 見出し: #..######（ATX）
		{
			const match = lineText.match(/^(#{1,6})([ \t]+)(.*)$/);
			if (match) {
				const level = match[1]?.length ?? 1;
				const markerLen =
					(match[1]?.length ?? 0) + (match[2]?.length ?? 0);
				if (markerLen > 0) {
					hidden.push({ from: absFrom, to: absFrom + markerLen });
				}
				// 末尾の閉じハッシュ: `## Title ##`
				const closing = lineText.match(/[ \t]+#+[ \t]*$/);
				if (closing && closing.index !== undefined) {
					const start = absFrom + closing.index;
					const end = absFrom + lineText.length;
					if (end > start) hidden.push({ from: start, to: end });
				}
				classes.push("tategaki-md-heading");
				classes.push(
					`tategaki-md-heading-${Math.max(1, Math.min(level, 6))}`,
				);
				dataset.mdKind = "heading";
				dataset.mdLevel = String(level);
				if (lineIndex !== null) {
					const end = this.lineHeadingSectionEnd[lineIndex];
					if (end !== null && end > lineIndex) {
						dataset.headingFoldable = "1";
					}
					if (this.collapsedHeadingLines.has(lineIndex)) {
						dataset.headingCollapsed = "1";
					}
				}
			}
		}

		// 引用: >（多重可）
		if (classes.length === 0) {
			const m = lineText.match(/^[ \t]{0,3}((?:> ?)+)(.*)$/);
			if (m && m[1]) {
				const markerText = m[1];
				const depth = (markerText.match(/>/g) ?? []).length;
				const markerStart = lineText.indexOf(markerText);
				const markerEnd = markerStart + markerText.length;
				if (markerEnd > markerStart) {
					hidden.push({
						from: absFrom + markerStart,
						to: absFrom + markerEnd,
					});
				}
				classes.push("tategaki-md-blockquote");
				classes.push(
					`tategaki-md-blockquote-depth-${Math.max(1, depth)}`,
				);
				dataset.mdKind = "blockquote";
				dataset.mdDepth = String(depth);
				styleVars["--tategaki-sot-blockquote-depth"] = String(
					Math.max(0, depth - 1),
				);
			}
		}

		// 脚注定義: `[^id]: ...`
		if (classes.length === 0) {
			const m = lineText.match(/^[ \t]*\[\^([^\]]+)\]:[ \t]*/);
			if (m && m[0]) {
				const markerLen = m[0].length;
				const footnoteId = m[1] ?? "";
				if (markerLen > 0) {
					hidden.push({ from: absFrom, to: absFrom + markerLen });
				}
				classes.push("tategaki-md-footnote-def");
				dataset.mdKind = "footnote-def";
				dataset.footnoteId = footnoteId;
				const number = this.footnoteDefinitionOrder.get(footnoteId);
				if (number !== undefined) {
					dataset.footnoteNumber = String(number);
				} else {
					delete (dataset as any).footnoteNumber;
				}
			}
		}

		// 箇条書き / 番号付きリスト（最低限の見た目だけ）
		if (classes.length === 0) {
			const task = lineText.match(
				/^([ \t]*)([-+*])[ \t]+\[([ xX])\][ \t]+/,
			);
			if (task && task[0]) {
				const markerLen = task[0].length;
				hidden.push({ from: absFrom, to: absFrom + markerLen });
				classes.push("tategaki-md-list");
				classes.push("tategaki-md-task");
				dataset.mdKind = "task";
				const checked = (task[3] ?? " ").toLowerCase() === "x";
				dataset.taskChecked = checked ? "1" : "0";
				dataset.listMarker = "";
				applyListDepth(computeIndentDepth(task[1] ?? ""));
			} else {
				const bullet = lineText.match(/^([ \t]*)([-+*])[ \t]+/);
				if (bullet && bullet[0] && bullet[2]) {
					const markerLen = bullet[0].length;
					hidden.push({ from: absFrom, to: absFrom + markerLen });
					classes.push("tategaki-md-list");
					dataset.mdKind = "list";
					dataset.listMarker = "";
					const depth = computeIndentDepth(bullet[1] ?? "");
					applyListDepth(depth);
					dataset.listBullet = String(depth % 2);
				} else {
					const ordered = lineText.match(
						/^([ \t]*)(\d{1,9})([.)])[ \t]+/,
					);
					if (
						ordered &&
						ordered[0] &&
						ordered[1] &&
						ordered[2] &&
						ordered[3]
					) {
						const markerLen = ordered[0].length;
						hidden.push({ from: absFrom, to: absFrom + markerLen });
						classes.push("tategaki-md-list");
						dataset.mdKind = "olist";
						dataset.listMarker = `${ordered[2]}${ordered[3]}`;
						applyListDepth(computeIndentDepth(ordered[1] ?? ""));
					}
				}
			}
		}

		// 罫線: --- / *** / ___（3回以上）
		if (classes.length === 0) {
			const hr = lineText.match(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/);
			if (hr) {
				hidden.push({ from: absFrom, to: absTo });
				classes.push("tategaki-md-hr");
				dataset.mdKind = "hr";
			}
		}

		return { classes, hidden, dataset, styleVars };
	}

	private applyHiddenRangesToSegments(
		segments: RenderSegment[],
		hiddenRanges: HiddenRange[],
	): RenderSegment[] {
		if (segments.length === 0) return segments;
		if (hiddenRanges.length === 0) return segments;
		const hidden = this.mergeRanges(hiddenRanges);
		const result: RenderSegment[] = [];
		let hiddenIndex = 0;
		for (const seg of segments) {
			let cursor = seg.from;
			while (
				hiddenIndex < hidden.length &&
				hidden[hiddenIndex]!.to <= cursor
			) {
				hiddenIndex += 1;
			}
			let localHiddenIndex = hiddenIndex;
			while (localHiddenIndex < hidden.length) {
				const h = hidden[localHiddenIndex]!;
				if (h.from >= seg.to) break;
				const visibleTo = Math.min(seg.to, h.from);
				if (visibleTo > cursor) {
					const start = cursor - seg.from;
					const end = visibleTo - seg.from;
					const text = seg.text.slice(start, end);
					if (text.length > 0) {
						result.push({
							from: cursor,
							to: visibleTo,
							text,
							classNames: seg.classNames,
							href: seg.href,
							ruby: seg.ruby,
						});
					}
				}
				cursor = Math.max(cursor, h.to);
				if (cursor >= seg.to) break;
				localHiddenIndex += 1;
			}
			if (cursor < seg.to) {
				const start = cursor - seg.from;
				const text = seg.text.slice(start);
				if (text.length > 0) {
					result.push({
						from: cursor,
						to: seg.to,
						text,
						classNames: seg.classNames,
						href: seg.href,
						ruby: seg.ruby,
					});
				}
			}
		}
		return result;
	}

	private rangeOverlapsAny(
		from: number,
		to: number,
		ranges: Array<{ from: number; to: number }>,
	): boolean {
		for (const range of ranges) {
			if (to <= range.from) continue;
			if (from >= range.to) continue;
			return true;
		}
		return false;
	}

	private collectRubyRangesForLine(
		absFrom: number,
		absTo: number,
		lineText: string,
		hidden: HiddenRange[],
		styles: InlineRange[],
		rubyRanges: RubyRange[],
	): void {
		const rubyEnabled = this.plugin.settings.wysiwyg?.enableRuby !== false;
		if (!rubyEnabled) return;
		if (!lineText.includes("《")) return;

		const codeRanges = styles
			.filter((s) => s.className === "tategaki-md-code")
			.map((s) => ({ from: s.from, to: s.to }));

		const regex = createAozoraRubyRegExp();
		for (const match of lineText.matchAll(regex)) {
			const full = match[0] ?? "";
			const start = match.index ?? -1;
			if (start < 0) continue;
			const openIndex = full.indexOf("《");
			const closeIndex = full.indexOf("》", openIndex + 1);
			if (openIndex < 0 || closeIndex < 0) continue;

			const hasDelimiter = full.startsWith("|") || full.startsWith("｜");
			const baseStartRel = hasDelimiter ? 1 : 0;
			const baseEndRel = openIndex;
			const baseText = full.slice(baseStartRel, baseEndRel);
			const rubyText = full.slice(openIndex + 1, closeIndex);
			if (!baseText || !rubyText) continue;

			const absBaseFrom = absFrom + start + baseStartRel;
			const absBaseTo = absFrom + start + baseEndRel;
			if (absBaseFrom >= absBaseTo) continue;
			if (absBaseFrom < absFrom || absBaseTo > absTo) continue;
			if (this.rangeOverlapsAny(absBaseFrom, absBaseTo, codeRanges)) {
				continue;
			}
			if (this.rangeOverlapsAny(absBaseFrom, absBaseTo, hidden)) {
				continue;
			}
			if (this.rangeOverlapsAny(absBaseFrom, absBaseTo, rubyRanges)) {
				continue;
			}

			if (hasDelimiter) {
				hidden.push({
					from: absFrom + start,
					to: absFrom + start + 1,
				});
			}
			hidden.push({
				from: absFrom + start + openIndex,
				to: absFrom + start + closeIndex + 1,
			});
			rubyRanges.push({
				from: absBaseFrom,
				to: absBaseTo,
				ruby: rubyText,
			});
		}
	}

	private applyRubyRangesToSegments(
		segments: RenderSegment[],
		rubyRanges: RubyRange[],
	): RenderSegment[] {
		if (segments.length === 0 || rubyRanges.length === 0) return segments;
		const offsets: number[] = [];
		for (const range of rubyRanges) {
			offsets.push(range.from, range.to);
		}
		const split = this.splitSegmentsAtOffsets(segments, offsets);
		return split.map((seg) => {
			const ruby = rubyRanges.find(
				(range) => seg.from >= range.from && seg.to <= range.to,
			);
			if (!ruby) return seg;
			const classNames = seg.classNames.includes("tategaki-aozora-ruby")
				? seg.classNames
				: [...seg.classNames, "tategaki-aozora-ruby"];
			return {
				...seg,
				classNames,
				ruby: ruby.ruby,
			};
		});
	}

	private applyTcyRangesToSegments(
		segments: RenderSegment[],
		tcyRanges: TcyRange[],
	): RenderSegment[] {
		if (segments.length === 0 || tcyRanges.length === 0) return segments;
		const offsets: number[] = [];
		for (const range of tcyRanges) {
			offsets.push(range.from, range.to);
		}
		const split = this.splitSegmentsAtOffsets(segments, offsets);
		return split.map((seg) => {
			const tcy = tcyRanges.find(
				(range) => seg.from >= range.from && seg.to <= range.to,
			);
			if (!tcy) return seg;
			const classNames = seg.classNames.includes("tategaki-md-tcy")
				? seg.classNames
				: [...seg.classNames, "tategaki-md-tcy"];
			return {
				...seg,
				classNames,
			};
		});
	}

	private applyLinkRangesToSegments(
		segments: RenderSegment[],
		links: LinkRange[],
	): RenderSegment[] {
		if (segments.length === 0 || links.length === 0) return segments;
		const offsets: number[] = [];
		for (const range of links) {
			offsets.push(range.from, range.to);
		}
		const split = this.splitSegmentsAtOffsets(segments, offsets);
		return split.map((seg) => {
			const link = links.find(
				(range) => seg.from >= range.from && seg.to <= range.to,
			);
			if (!link) return seg;
			const hasLinkClass = seg.classNames.includes("tategaki-md-link");
			const isEmbedLike =
				seg.classNames.includes("tategaki-md-image") ||
				seg.classNames.includes("tategaki-md-embed");
			const classNames =
				hasLinkClass || isEmbedLike
					? seg.classNames
					: [...seg.classNames, "tategaki-md-link"];
			return {
				...seg,
				classNames,
				href: link.href,
			};
		});
	}

	private buildSegmentsForLine(
		lineFrom: number,
		lineTo: number,
	): RenderSegment[] {
		if (!this.sotEditor) return [];
		const doc = this.sotEditor.getDoc();
		const safeFrom = Math.max(0, Math.min(lineFrom, doc.length));
		const safeTo = Math.max(safeFrom, Math.min(lineTo, doc.length));
		if (safeFrom === safeTo) return [];

		const lineIndex = this.findLineIndex(safeFrom);
		const lineText = doc.slice(safeFrom, safeTo);
		if (this.plainTextViewEnabled) {
			return lineText.length === 0
				? []
				: [
						{
							from: safeFrom,
							to: safeTo,
							text: lineText,
							classNames: ["tategaki-sot-run"],
						},
					];
		}
		const isSource =
			lineIndex !== null && this.isLineInSourceMode(lineIndex);
		const lineKind =
			lineIndex !== null
				? (this.lineBlockKinds[lineIndex] ?? "normal")
				: "normal";
		const codeLang =
			lineIndex !== null ? (this.lineCodeLang[lineIndex] ?? null) : null;
		const rubyEnabled = this.plugin.settings.wysiwyg?.enableRuby !== false;
		const canCache = this.shouldUseLineCache() && lineIndex !== null;

		if (canCache && lineIndex !== null) {
			const cached = this.lineSegmentCache.get(lineIndex);
			if (
				cached &&
				cached.from === safeFrom &&
				cached.to === safeTo &&
				cached.text === lineText &&
				cached.kind === lineKind &&
				cached.codeLang === codeLang &&
				cached.isSource === isSource &&
				cached.rubyEnabled === rubyEnabled
			) {
				return cached.segments;
			}
		}

		const storeSegments = (segments: RenderSegment[]): RenderSegment[] => {
			if (canCache && lineIndex !== null) {
				this.trimLineCachesIfNeeded();
				this.lineSegmentCache.set(lineIndex, {
					from: safeFrom,
					to: safeTo,
					text: lineText,
					kind: lineKind,
					codeLang,
					isSource,
					rubyEnabled,
					segments,
				});
			}
			return segments;
		};

		if (isSource) {
			return storeSegments([
				{
					from: safeFrom,
					to: safeTo,
					text: lineText,
					classNames: ["tategaki-sot-run"],
				},
			]);
		}

		const blockDecoration = this.getCachedBlockLineDecoration(
			lineIndex,
			safeFrom,
			safeTo,
			lineText,
		);

		if (lineIndex !== null) {
			if (lineKind === "code") {
				const lang = codeLang;
				const base = this.buildCodeLineSegments(
					safeFrom,
					safeTo,
					lineText,
					lang,
				);
				return storeSegments(
					this.applyHiddenRangesToSegments(
						base,
						blockDecoration.hidden,
					),
				);
			}
			if (
				lineKind === "code-fence" ||
				lineKind === "frontmatter" ||
				lineKind === "frontmatter-fence"
			) {
				const base: RenderSegment[] = [
					{
						from: safeFrom,
						to: safeTo,
						text: lineText,
						classNames: ["tategaki-sot-run"],
					},
				];
				return storeSegments(
					this.applyHiddenRangesToSegments(
						base,
						blockDecoration.hidden,
					),
				);
			}
		}

		const view = this.getEditorViewForSyntax();
		if (!view) {
			const fallback = this.buildInlineSegmentsFallback(
				safeFrom,
				safeTo,
				lineText,
			);
			const base = fallback ?? [
				{
					from: safeFrom,
					to: safeTo,
					text: lineText,
					classNames: ["tategaki-sot-run"],
				},
			];
			const hidden = blockDecoration.hidden.map((range) => ({
				from: range.from,
				to: range.to,
			}));
			const tcyRanges: TcyRange[] = [];
			collectRenderableTcyRangesForLine(
				safeFrom,
				safeTo,
				lineText,
				hidden,
				[],
				tcyRanges,
				{
					enableAutoTcy: this.plugin.settings.wysiwyg.enableAutoTcy === true,
					rubyRanges: [],
				},
			);
			const hiddenApplied = this.applyHiddenRangesToSegments(base, hidden);
			return storeSegments(
				this.applyTcyRangesToSegments(hiddenApplied, tcyRanges),
			);
		}

		const hidden: HiddenRange[] = [];
		const styles: InlineRange[] = [];
		const links: LinkRange[] = [];
		const rubyRanges: RubyRange[] = [];
		const tcyRanges: TcyRange[] = [];

		for (const r of blockDecoration.hidden) {
			hidden.push(r);
		}

		this.collectLinkRangesForLine(
			safeFrom,
			safeTo,
			lineText,
			hidden,
			styles,
			links,
		);
		this.collectInlineMathRangesForLine(safeFrom, safeTo, lineText, hidden);

		try {
			syntaxTree(view.state).iterate({
				from: safeFrom,
				to: safeTo,
				enter: (node) => {
					const name = node.type.name;
					if (this.isMarkdownSyntaxMarkerNode(name)) {
						hidden.push({ from: node.from, to: node.to });
						return;
					}
					const className = this.isInlineStyleNode(name);
					if (className) {
						styles.push({
							from: node.from,
							to: node.to,
							className,
						});
						this.pushHiddenMarkersForStyleNode(
							doc,
							name,
							node.from,
							node.to,
							hidden,
						);
						// `***text***` / `___text___` が StrongEmphasis 単体で来る環境向け
						if (name === "StrongEmphasis") {
							const open = doc.slice(node.from, node.from + 3);
							const close = doc.slice(node.to - 3, node.to);
							const isTriple =
								(open === "***" && close === "***") ||
								(open === "___" && close === "___");
							if (isTriple) {
								styles.push({
									from: node.from,
									to: node.to,
									className: "tategaki-md-em",
								});
							}
						}
					}
				},
			});
		} catch (_) {
			this.collectRubyRangesForLine(
				safeFrom,
				safeTo,
				lineText,
				hidden,
				styles,
				rubyRanges,
			);
			collectRenderableTcyRangesForLine(
				safeFrom,
				safeTo,
				lineText,
				hidden,
				styles,
				tcyRanges,
				{
					enableAutoTcy: this.plugin.settings.wysiwyg.enableAutoTcy === true,
					rubyRanges,
				},
			);
			const fallback = this.buildInlineSegmentsFallback(
				safeFrom,
				safeTo,
				lineText,
			);
			const base = fallback ?? [
				{
					from: safeFrom,
					to: safeTo,
					text: lineText,
					classNames: ["tategaki-sot-run"],
				},
			];
			const hiddenApplied = this.applyHiddenRangesToSegments(
				base,
				hidden,
			);
			const linked = this.applyLinkRangesToSegments(hiddenApplied, links);
			return storeSegments(
				this.applyTcyRangesToSegments(
					this.applyRubyRangesToSegments(linked, rubyRanges),
					tcyRanges,
				),
			);
		}

		this.collectRubyRangesForLine(
			safeFrom,
			safeTo,
			lineText,
			hidden,
			styles,
			rubyRanges,
		);
		collectRenderableTcyRangesForLine(
			safeFrom,
			safeTo,
			lineText,
			hidden,
			styles,
			tcyRanges,
			{
				enableAutoTcy: this.plugin.settings.wysiwyg.enableAutoTcy === true,
				rubyRanges,
			},
		);

		const fallback = this.buildInlineSegmentsFallback(
			safeFrom,
			safeTo,
			lineText,
		);
		const hasNonLinkStyles = styles.some(
			(range) => range.className !== "tategaki-md-link",
		);
		if (!hasNonLinkStyles && fallback) {
			const hiddenApplied = this.applyHiddenRangesToSegments(
				fallback,
				hidden,
			);
			const linked = this.applyLinkRangesToSegments(hiddenApplied, links);
			return storeSegments(
				this.applyTcyRangesToSegments(
					this.applyRubyRangesToSegments(linked, rubyRanges),
					tcyRanges,
				),
			);
		}
		if (
			hidden.length === 0 &&
			styles.length === 0 &&
			rubyRanges.length === 0 &&
			tcyRanges.length === 0
		) {
			const base = [
				{
					from: safeFrom,
					to: safeTo,
					text: lineText,
					classNames: ["tategaki-sot-run"],
				},
			];
			return storeSegments(
				this.applyHiddenRangesToSegments(base, hidden),
			);
		}

		const mergedHidden = this.mergeRanges(
			hidden
				.map((r) => ({
					from: Math.max(safeFrom, Math.min(r.from, safeTo)),
					to: Math.max(safeFrom, Math.min(r.to, safeTo)),
				}))
				.filter((r) => r.to > r.from),
		);

		const cuts = new Set<number>([safeFrom, safeTo]);
		for (const range of mergedHidden) {
			cuts.add(range.from);
			cuts.add(range.to);
		}
		for (const range of styles) {
			const from = Math.max(safeFrom, Math.min(range.from, safeTo));
			const to = Math.max(safeFrom, Math.min(range.to, safeTo));
			if (to <= from) continue;
			cuts.add(from);
			cuts.add(to);
		}
		for (const range of rubyRanges) {
			const from = Math.max(safeFrom, Math.min(range.from, safeTo));
			const to = Math.max(safeFrom, Math.min(range.to, safeTo));
			if (to <= from) continue;
			cuts.add(from);
			cuts.add(to);
		}
		for (const range of tcyRanges) {
			const from = Math.max(safeFrom, Math.min(range.from, safeTo));
			const to = Math.max(safeFrom, Math.min(range.to, safeTo));
			if (to <= from) continue;
			cuts.add(from);
			cuts.add(to);
		}

		const boundaries = Array.from(cuts).sort((a, b) => a - b);
		const segments: RenderSegment[] = [];

		const isHiddenInterval = (from: number, to: number): boolean => {
			for (const range of mergedHidden) {
				if (from >= range.from && to <= range.to) return true;
				if (to <= range.from) break;
			}
			return false;
		};

		const collectClasses = (from: number, to: number): string[] => {
			const classNames: string[] = ["tategaki-sot-run"];
			for (const range of styles) {
				if (from >= range.from && to <= range.to) {
					if (!classNames.includes(range.className)) {
						classNames.push(range.className);
					}
				}
			}
			return classNames;
		};

		const collectHref = (from: number, to: number): string | undefined => {
			for (const link of links) {
				if (from >= link.from && to <= link.to) return link.href;
			}
			return undefined;
		};

		const collectRubyText = (
			from: number,
			to: number,
		): string | undefined => {
			for (const range of rubyRanges) {
				if (from >= range.from && to <= range.to) {
					return range.ruby;
				}
			}
			return undefined;
		};

		const hasTcyRange = (from: number, to: number): boolean => {
			for (const range of tcyRanges) {
				if (from >= range.from && to <= range.to) {
					return true;
				}
			}
			return false;
		};

		for (let i = 0; i < boundaries.length - 1; i += 1) {
			const from = boundaries[i]!;
			const to = boundaries[i + 1]!;
			if (to <= from) continue;
			if (isHiddenInterval(from, to)) continue;
			const text = doc.slice(from, to);
			if (text.length === 0) continue;
			const classNames = collectClasses(from, to);
			const rubyText = collectRubyText(from, to);
			if (rubyText && !classNames.includes("tategaki-aozora-ruby")) {
				classNames.push("tategaki-aozora-ruby");
			}
			if (hasTcyRange(from, to) && !classNames.includes("tategaki-md-tcy")) {
				classNames.push("tategaki-md-tcy");
			}
			const href = collectHref(from, to);
			const last = segments[segments.length - 1];
			if (
				last &&
				last.to === from &&
				last.classNames.join("|") === classNames.join("|") &&
				last.href === href &&
				last.ruby === rubyText
			) {
				last.to = to;
				last.text += text;
			} else {
				segments.push({
					from,
					to,
					text,
					classNames,
					href,
					ruby: rubyText,
				});
			}
		}
		return storeSegments(segments);
	}

	private buildCodeLineSegments(
		absFrom: number,
		absTo: number,
		lineText: string,
		lang: string | null,
	): RenderSegment[] {
		// コードブロックは「表示＝ハイライト」「編集＝ソース」の方針に寄せるため、
		// ここでは行単位で lowlight(hljs) を適用する。
		// 注意: 行単位のため、複数行コメント等の状態は完全一致しない場合がある。
		if (lineText.length === 0) return [];
		const fallback: RenderSegment[] = [
			{
				from: absFrom,
				to: absTo,
				text: lineText,
				classNames: ["tategaki-sot-run"],
			},
		];
		const language = lang?.trim() ? lang.trim() : null;

		let root: any;
		try {
			if (language && lowlight.registered(language)) {
				root = lowlight.highlight(language, lineText);
			} else if (language) {
				// 例えば `ts` / `js` / `c++` などの別名があるので auto も試す
				root = lowlight.highlightAuto(lineText);
			} else {
				root = lowlight.highlightAuto(lineText);
			}
		} catch (_) {
			return fallback;
		}

		const segments: RenderSegment[] = [];
		let cursor = absFrom;

		const pushText = (text: string, classes: string[]) => {
			if (text.length === 0) return;
			const from = cursor;
			const to = Math.min(absTo, from + text.length);
			if (to <= from) return;
			const slice = text.slice(0, to - from);
			const classNames = ["tategaki-sot-run", ...classes];
			segments.push({
				from,
				to,
				text: slice,
				classNames,
			});
			cursor = to;
		};

		const walk = (node: any, classStack: string[]) => {
			if (!node) return;
			const type = node.type;
			if (type === "text") {
				pushText(String(node.value ?? ""), classStack);
				return;
			}
			if (type === "element") {
				const cls = node.properties?.className;
				const classes = Array.isArray(cls)
					? cls.map((c) => String(c))
					: typeof cls === "string"
						? cls.split(/\s+/).filter((c: string) => c.length > 0)
						: [];
				const nextStack = classStack.concat(classes);
				for (const child of node.children ?? []) {
					walk(child, nextStack);
				}
				return;
			}
			for (const child of node.children ?? []) {
				walk(child, classStack);
			}
		};

		for (const child of root?.children ?? []) {
			walk(child, []);
		}

		// lowlight の出力が元テキストと一致しない場合は安全側に倒す
		if (cursor !== absFrom + lineText.length) {
			return fallback;
		}
		return segments.length > 0 ? segments : fallback;
	}

	private buildInlineSegmentsFallback(
		absFrom: number,
		absTo: number,
		lineText: string,
	): RenderSegment[] | null {
		// 構文木が参照できない環境向けの最小フォールバック。
		// 目的: 記号は表示せず、装飾だけを表示しつつ SoT マッピングを壊さない。
		const hasMarkers = /(\*\*\*|___|\*\*|__|~~|==|`|\*|_)/.test(lineText);
		if (!hasMarkers) return null;

		const segments: RenderSegment[] = [];
		let inStrong = false;
		let inEm = false;
		let inStrike = false;
		let inHighlight = false;
		let codeFenceLen: number | null = null;

		const classesForState = (): string[] => {
			const classNames: string[] = ["tategaki-sot-run"];
			if (codeFenceLen !== null) {
				classNames.push("tategaki-md-code");
				return classNames;
			}
			if (inStrong) classNames.push("tategaki-md-strong");
			if (inEm) classNames.push("tategaki-md-em");
			if (inStrike) classNames.push("tategaki-md-strike");
			if (inHighlight) classNames.push("tategaki-md-highlight");
			return classNames;
		};

		let segmentStart: number | null = null;
		let segmentClasses: string[] = [];

		const flush = (end: number) => {
			if (segmentStart === null) return;
			if (end <= segmentStart) {
				segmentStart = null;
				return;
			}
			const text = lineText.slice(segmentStart, end);
			if (text.length === 0) {
				segmentStart = null;
				return;
			}
			segments.push({
				from: absFrom + segmentStart,
				to: absFrom + end,
				text,
				classNames: segmentClasses,
			});
			segmentStart = null;
		};

		const ensureSegment = (index: number) => {
			if (segmentStart !== null) return;
			segmentStart = index;
			segmentClasses = classesForState();
		};

		const countRun = (index: number, ch: string): number => {
			let n = 0;
			while (index + n < lineText.length && lineText[index + n] === ch) {
				n += 1;
			}
			return n;
		};

		const hasLater = (marker: string, fromIndex: number): boolean =>
			lineText.indexOf(marker, fromIndex) !== -1;

		const pickBalancedEmphasisLen = (
			index: number,
			ch: "*" | "_",
			runLen: number,
		): number | null => {
			for (const len of [3, 2, 1]) {
				if (runLen < len) continue;
				const marker = ch.repeat(len);
				if (hasLater(marker, index + len)) return len;
			}
			return null;
		};

		let i = 0;
		while (i < lineText.length) {
			const ch = lineText[i] ?? "";

			if (codeFenceLen === null) {
				if (ch === "`") {
					const runLen = countRun(i, "`");
					const marker = "`".repeat(runLen);
					if (hasLater(marker, i + runLen)) {
						flush(i);
						codeFenceLen = runLen;
						i += runLen;
						continue;
					}
				} else if (ch === "~" && lineText.slice(i, i + 2) === "~~") {
					// 開始: 後続に閉じがある時だけ / 終了: 状態がONなら無条件で閉じる
					if (inStrike || hasLater("~~", i + 2)) {
						flush(i);
						inStrike = !inStrike;
						i += 2;
						continue;
					}
				} else if (ch === "=" && lineText.slice(i, i + 2) === "==") {
					if (inHighlight || hasLater("==", i + 2)) {
						flush(i);
						inHighlight = !inHighlight;
						i += 2;
						continue;
					}
				} else if (ch === "*" || ch === "_") {
					const runLen = countRun(i, ch);
					// 終了優先（閉じ記号を確実に消す）
					let markerLen: number | null = null;
					if (inStrong && inEm) {
						if (runLen >= 3) {
							markerLen = 3;
						} else if (runLen >= 2) {
							markerLen = 2;
						} else {
							markerLen = 1;
						}
					} else if (inStrong) {
						if (runLen >= 2) {
							markerLen = 2;
						} else if (hasLater(ch, i + 1)) {
							markerLen = 1;
						}
					} else if (inEm) {
						if (runLen >= 2 && hasLater(ch.repeat(2), i + 2)) {
							markerLen = 2;
						} else {
							markerLen = 1;
						}
					} else {
						markerLen = pickBalancedEmphasisLen(
							i,
							ch as "*" | "_",
							runLen,
						);
					}
					if (markerLen !== null && markerLen > 0) {
						flush(i);
						if (markerLen === 3) {
							inStrong = !inStrong;
							inEm = !inEm;
						} else if (markerLen === 2) {
							inStrong = !inStrong;
						} else {
							inEm = !inEm;
						}
						i += markerLen;
						continue;
					}
				}
			} else if (ch === "`") {
				const runLen = countRun(i, "`");
				if (runLen === codeFenceLen) {
					flush(i);
					codeFenceLen = null;
					i += runLen;
					continue;
				}
			}

			ensureSegment(i);
			i += 1;
		}
		flush(lineText.length);

		if (segments.length === 0) return null;
		return segments.filter((s) => s.to > s.from);
	}

	constructor(leaf: WorkspaceLeaf, plugin: TategakiV2Plugin) {
		super(leaf);
		this.plugin = plugin;
		this.scope = new Scope(this.app.scope);
		this.plainEditController = new SoTPlainEditController(
			this as unknown as any,
		);
		this.workspaceController = new SoTWorkspaceController(
			this as unknown as any,
		);
	}

	getViewType(): string {
		return TATEGAKI_SOT_WYSIWYG_VIEW_TYPE;
	}

	getDisplayText(): string {
		const frontmatterTitle = this.getFrontmatterTitle(this.currentFile);
		if (frontmatterTitle) return frontmatterTitle;
		return this.currentFile?.basename ?? "Tategaki";
	}

	private getFrontmatterTitle(file: TFile | null): string | null {
		if (!file) return null;
		const cache = this.app.metadataCache.getFileCache(file);
		const raw = cache?.frontmatter?.title;
		if (raw === null || raw === undefined) return null;
		const text = String(raw).trim();
		return text.length > 0 ? text : null;
	}

	private updatePaneHeaderTitle(force = false): void {
		const title = this.getDisplayText();
		if (!force && title === this.lastPaneHeaderTitle) return;
		this.lastPaneHeaderTitle = title;
		const headerTitle = this.containerEl.querySelector(
			".view-header-title",
		) as HTMLElement | null;
		if (headerTitle) {
			headerTitle.textContent = title;
		}
		if (typeof (this.leaf as any).updateHeader === "function") {
			(this.leaf as any).updateHeader();
		}
	}

	getCurrentFilePath(): string | null {
		return this.currentFile?.path ?? null;
	}

	getState(): Record<string, unknown> {
		return {
			filePath: this.currentFile?.path ?? undefined,
			writingMode: this.writingMode,
		};
	}

	async setState(
		state: SoTViewState,
		_result: ViewStateResult,
	): Promise<void> {
		if (!this.isReady) {
			this.pendingState = state;
			return;
		}
		const settingsMode = this.getEffectiveCommonSettings(
			this.plugin.settings,
		).writingMode;
		if (state?.writingMode) {
			if (state.writingMode === settingsMode) {
				this.setWritingMode(state.writingMode);
			} else {
				this.setWritingMode(settingsMode);
			}
		}
		const filePath = state?.filePath ?? null;
		if (!filePath) return;
		const abs = this.app.vault.getAbstractFileByPath(filePath);
		if (abs instanceof TFile) {
			await this.openFile(abs);
		}
	}

	async onOpen(): Promise<void> {
		const initialFile = (this.leaf as any)[INITIAL_FILE_PROP] as
			| TFile
			| undefined;
		if (!initialFile) {
			window.setTimeout(() => {
				try {
					this.leaf.detach();
				} catch (_) {
					// noop: detach失敗は無視
				}
			}, 0);
			return;
		}
		delete (this.leaf as any)[INITIAL_FILE_PROP];

		const container = this.containerEl.children[1] as HTMLElement;
		this.viewRootEl = container;
		container.empty();
		container.addClass("tategaki-sot-view-container");
		const phoneQuery = PHONE_MEDIA_QUERY;
		const updateHeaderInset = (): void => {
			const headerEl = this.containerEl.querySelector(
				".view-header",
			) as HTMLElement | null;
			const height = headerEl
				? Math.ceil(headerEl.getBoundingClientRect().height)
				: 0;
			container.style.setProperty(
				"--tategaki-view-header-height",
				`${height}px`,
			);
			const isPhone = window.matchMedia(phoneQuery).matches;
			container.style.paddingTop = isPhone
				? "calc(var(--tategaki-safe-area-top, 0px) + var(--tategaki-view-header-height, 0px))"
				: "0px";
			let isEditing = false;
			const activeEl = container.ownerDocument
				.activeElement as HTMLElement | null;
			if (activeEl && container.contains(activeEl)) {
				isEditing =
					activeEl.isContentEditable ||
					activeEl.tagName === "TEXTAREA" ||
					activeEl.tagName === "INPUT";
			}
			container.style.paddingBottom =
				isPhone && !isEditing
					? "var(--tategaki-reading-bottom-offset, 0px)"
					: "0px";
		};
		updateHeaderInset();
		window.setTimeout(updateHeaderInset, 0);
		this.registerDomEvent(window, "resize", updateHeaderInset);
		this.registerDomEvent(
			container.ownerDocument,
			"focusin",
			updateHeaderInset,
		);
		this.registerDomEvent(
			container.ownerDocument,
			"focusout",
			updateHeaderInset,
		);
		this.registerEscapeGuard();
		this.registerEscapeKeymap();
		const headerEl = this.containerEl.querySelector(
			".view-header",
		) as HTMLElement | null;
		if (headerEl && "ResizeObserver" in window) {
			const observer = new ResizeObserver(() => {
				updateHeaderInset();
			});
			observer.observe(headerEl);
			this.register(() => observer.disconnect());
		}

		const toolbarRow = container.createDiv("tategaki-sot-toolbar-row");
		const toolbarLeft = toolbarRow.createDiv("tategaki-sot-toolbar-left");

		this.commandAdapter = this.createCommandAdapter();
		this.commandToolbar = new CommandToolbar(
			toolbarLeft,
			this.commandAdapter,
		);
		this.register(() => {
			this.commandToolbar?.destroy();
			this.commandToolbar = null;
			this.commandAdapter = null;
		});

		const content = container.createDiv("tategaki-sot-content");

		this.pageContainerEl = content.createDiv("tategaki-sot-page-container");

		this.borderWrapperEl = this.pageContainerEl.createDiv(
			"tategaki-sot-border-wrapper",
		);

		this.contentWrapperEl = this.borderWrapperEl.createDiv(
			"tategaki-sot-content-wrapper",
		);

		this.loadingOverlayEl = this.contentWrapperEl.createDiv(
			"tategaki-sot-loading-overlay",
		);
		const loadingMessage = this.loadingOverlayEl.createDiv(
			"tategaki-sot-loading-message",
		);
		loadingMessage.textContent = t("common.loading");

		this.derivedRootEl = this.contentWrapperEl.createDiv(
			"tategaki-sot-derived-root",
		);
		this.derivedRootEl.tabIndex = 0;
		this.updateMobileTouchAction();
		this.derivedContentEl = this.derivedRootEl.createDiv(
			"tategaki-sot-derived-content",
		);
		this.selectionLayerEl = this.derivedRootEl.createDiv(
			"tategaki-sot-selection-layer",
		);
		this.caretEl = this.derivedRootEl.createDiv("tategaki-sot-caret");
		this.pendingEl = this.derivedRootEl.createDiv("tategaki-sot-pending");
		this.overlayImeReplace = new OverlayImeReplaceController({
			isActive: () =>
				!this.ceImeMode &&
				!this.sourceModeEnabled &&
				this.isNativeSelectionEnabled() &&
				!!this.sotEditor,
			getSotSelection: () =>
				this.sotEditor?.getSelection() ?? { anchor: 0, head: 0 },
			getDomSelectionOffsets: () =>
				this.nativeSelectionSupport?.getSelectionOffsetsFromDom() ??
				null,
		});
		this.overlayTextarea = new OverlayImeTextarea(
			this.derivedRootEl,
			{
				replaceSelection: (text) => this.replaceSelection(text),
				backspace: () => this.backspace(),
				del: () => this.del(),
				undo: () => this.sotEditor?.undo(),
				redo: () => this.sotEditor?.redo(),
				selectAll: () => this.selectAllText(),
				navigate: (event) => this.handleNavigate(event),
				onPendingText: (text) => this.updatePendingText(text),
				cancelSelection: () => {
					this.overlayImeReplace?.cancel();
					this.collapseSelectionAfterNativeCancel("overlay-escape");
				},
				listOutliner: (event) => this.handleListOutlinerKeydown(event),
				shouldHandleOutlinerKey: (event) => {
					if (this.ceImeMode || this.sourceModeEnabled) return false;
					if (event.altKey || event.metaKey || event.ctrlKey)
						return false;
					return event.key === "Tab";
				},
				compositionStart: () =>
					this.overlayImeReplace?.onCompositionStart(),
				compositionEnd: () =>
					this.overlayImeReplace?.onCompositionEnd(),
			},
			{
				onFocus: () => {
					this.overlayFocused = true;
					if (!this.suppressNativeSelectionCollapse) {
						this.collapseSelectionAfterNativeCancel(
							"overlay-focus",
						);
					}
					this.scheduleSelectionOverlayUpdate();
				},
				onBlur: () => {
					this.overlayFocused = false;
					this.scheduleSelectionOverlayUpdate();
				},
			},
		);
		if (this.derivedContentEl) {
			this.registerDomEvent(
				this.derivedContentEl,
				"beforeinput",
				(event) => this.handleCeBeforeInput(event as InputEvent),
			);
			this.registerDomEvent(
				this.derivedContentEl,
				"compositionstart",
				(event) =>
					this.handleCeCompositionStart(event as CompositionEvent),
			);
			this.registerDomEvent(
				this.derivedContentEl,
				"compositionupdate",
				(event) =>
					this.handleCeCompositionUpdate(event as CompositionEvent),
			);
			this.registerDomEvent(
				this.derivedContentEl,
				"compositionend",
				(event) =>
					this.handleCeCompositionEnd(event as CompositionEvent),
			);
			this.registerDomEvent(this.derivedContentEl, "keydown", (event) =>
				this.handleCeKeydown(event as KeyboardEvent),
			);
		}
		if (this.derivedContentEl?.ownerDocument) {
			this.registerDomEvent(
				this.derivedContentEl.ownerDocument,
				"selectionchange",
				() => this.handleCeSelectionChange(),
			);
		}

		this.applySettingsToView(this.plugin.settings);
		this.registerWorkspacePairGuards();
		this.applySoTTabBadge();
		this.outlinePanel = new SoTOutlinePanel(content, {
			getItems: () => this.getOutlineItems(),
			onSelect: (item) => {
				this.setSelectionNormalized(item.offset, item.offset);
				this.scrollToOutlineLine(item.line);
				this.scheduleCaretUpdate(true);
				this.focusInputSurface(true);
			},
			onClose: () => {
				this.focusInputSurface(true);
			},
		});

		this.selectionOverlay = new SoTSelectionOverlay({
			getDerivedRootEl: () => this.derivedRootEl,
			getDerivedContentEl: () => this.derivedContentEl,
			getSelectionLayerEl: () => this.selectionLayerEl,
			getSotEditor: () => this.sotEditor,
			isCeImeMode: () => this.ceImeMode,
			isNativeSelectionEnabled: () => this.isNativeSelectionEnabled(),
			ensureLineRendered: (lineEl) => this.ensureLineRendered(lineEl),
			getPendingSelectionState: () => ({
				pendingText: this.pendingText,
				pendingSelectionFrom: this.pendingSelectionFrom,
			}),
			getLineRanges: () => this.lineRanges,
			findLineIndex: (offset) => this.findLineIndex(offset),
			getLineElement: (lineIndex) => this.getLineElement(lineIndex),
			getLineTextNodes: (lineEl) => this.getLineTextNodes(lineEl),
			findTextNodeAtOffset: (lineEl, localOffset) =>
				this.findTextNodeAtOffset(lineEl, localOffset),
			isPointerSelecting: () => this.isPointerSelecting,
			isAutoScrollSelecting: () => this.autoScrollSelecting,
		});

		this.nativeSelectionSupport = new NativeSelectionSupport({
			isEnabled: () => this.isNativeSelectionEnabled(),
			isCeImeMode: () => this.ceImeMode,
			shouldAllowDomSelection: () => this.shouldAllowDomSelectAll(),
			getDerivedContentEl: () => this.derivedContentEl,
			getSotEditor: () => this.sotEditor,
			getLineRanges: () => this.lineRanges,
			findLineIndex: (offset) => this.findLineIndex(offset),
			getLineElement: (lineIndex) => this.getLineElement(lineIndex),
			getLineElementForNode: (node) => this.getLineElementForNode(node),
			isSelectionInsideDerivedContent: (selection) =>
				this.isSelectionInsideDerivedContent(selection),
			ensureLineRendered: (lineEl) => this.ensureLineRendered(lineEl),
			findTextNodeAtOffset: (lineEl, localOffset) =>
				this.findTextNodeAtOffset(lineEl, localOffset),
			resolveOffsetFromCaretPosition: (lineEl, target, lineLength) =>
				this.resolveOffsetFromCaretPosition(lineEl, target, lineLength),
			setSelectionNormalized: (anchor, head) =>
				this.setSelectionNormalized(anchor, head),
			applyCutRange: (from, to) => {
				this.updatePendingText("", true);
				this.immediateRender = true;
				this.sotEditor?.replaceRange(from, to, "");
			},
			onSelectionActiveChanged: (active) => {
				this.selectionLayerEl?.replaceChildren();
				if (!active) {
					this.nativeSelectionAnchorLine = null;
					this.nativeSelectionHeadLine = null;
					this.nativeSelectionAnchorLocked = false;
					this.renderPipeline?.resumeVirtualUpdates();
				} else {
					this.updateNativeSelectionLineHints();
				}
			},
		});

		this.renderPipeline = new SoTRenderPipeline({
			getDerivedRootEl: () => this.derivedRootEl,
			getDerivedContentEl: () => this.derivedContentEl,
			getSotEditor: () => this.sotEditor,
			getPluginSettings: () => this.plugin.settings,
			getHideFrontmatter: () => this.hideFrontmatter,
			getWritingMode: () => this.writingMode,
			isSelectionActive: () =>
				this.nativeSelectionSupport?.isSelectionActive() ?? false,
			getSelectionHintLines: () => this.getNativeSelectionHintLines(),
			resyncSelection: () => this.resyncNativeSelectionFromSot(),
			parseFrontmatter: (doc) => this.parseFrontmatter(doc),
			setFrontmatterDetected: (value) => {
				this.frontmatterDetected = value;
			},
			computeLineRangesFromLines: (lines) =>
				this.computeLineRangesFromLines(lines),
			setLineRanges: (ranges) => {
				this.lineRanges = ranges;
			},
			getLineRanges: () => this.lineRanges,
			recomputeLineBlockKinds: (lines) =>
				this.recomputeLineBlockKinds(lines),
			renderFrontmatter: (data, settings) =>
				this.renderFrontmatter(data, settings),
			applyFrontmatterWritingMode: (element, mode) =>
				this.applyFrontmatterWritingMode(element, mode),
			renderLine: (lineEl, range, index) =>
				this.renderLine(lineEl, range, index),
			renderLineLight: (lineEl, range, index) =>
				this.renderLineLight(lineEl, range, index),
			resetPendingRenderState: () => this.resetPendingRenderState(),
			finalizeRender: (scrollTop, scrollLeft) =>
				this.finalizeRender(scrollTop, scrollLeft),
		});

		this.ceSelectionSync = new SoTCeSelectionSync({
			isCeImeMode: () => this.ceImeMode,
			isCeImeComposing: () => this.ceImeComposing,
			isCeImeSelectionSyncing: () => this.ceImeSelectionSyncing,
			setCeImeSelectionSyncing: (value) => {
				this.ceImeSelectionSyncing = value;
			},
			isLeafActive: () => this.isLeafActive(),
			getDerivedContentEl: () => this.derivedContentEl,
			getSotEditor: () => this.sotEditor,
			getLineRanges: () => this.lineRanges,
			findLineIndex: (offset) => this.findLineIndex(offset),
			getLineElement: (lineIndex) => this.getLineElement(lineIndex),
			ensureLineRendered: (lineEl) => this.ensureLineRendered(lineEl),
			resolveOffsetFromCaretPosition: (lineEl, target, lineLength) =>
				this.resolveOffsetFromCaretPosition(lineEl, target, lineLength),
			ensureCeInputPlaceholderNode: (lineEl) =>
				this.ensureCeInputPlaceholderNode(lineEl),
			findTextNodeAtOffset: (lineEl, localOffset) =>
				this.findTextNodeAtOffset(lineEl, localOffset),
			setSelectionNormalized: (anchor, head) =>
				this.setSelectionNormalized(anchor, head),
			recordCeMappingFailure: (reason, immediate) =>
				this.recordCeMappingFailure(reason, immediate),
			isSelectionInsideDerivedContent: (selection) =>
				this.isSelectionInsideDerivedContent(selection),
			getLineElementForNode: (node) => this.getLineElementForNode(node),
			isUnsafeCeSelectionNode: (node) =>
				this.isUnsafeCeSelectionNode(node),
			scheduleCeSafetyCheck: () => this.scheduleCeSafetyCheck(),
		});

		this.pointerHandler = new SoTPointerHandler({
			getSotEditor: () => this.sotEditor,
			getDerivedRootEl: () => this.derivedRootEl,
			getDerivedContentEl: () => this.derivedContentEl,
			isCeImeMode: () => this.ceImeMode,
			isNativeSelectionEnabled: () => this.isNativeSelectionEnabled(),
			ensureLineRendered: (lineEl) => this.ensureLineRendered(lineEl),
			getLineVisualRects: (lineEl) => this.getLineVisualRects(lineEl),
			getLineRanges: () => this.lineRanges,
			getLocalOffsetFromPoint: (lineEl, clientX, clientY, lineLength) =>
				this.getLocalOffsetFromPoint(
					lineEl,
					clientX,
					clientY,
					lineLength,
				),
			normalizeOffsetToVisible: (offset, preferForward) =>
				this.normalizeOffsetToVisible(offset, preferForward),
			setSelectionNormalized: (anchor, head) =>
				this.setSelectionNormalized(anchor, head),
			scheduleCaretUpdate: (force) => this.scheduleCaretUpdate(force),
				updateSelectionOverlay: () => this.updateSelectionOverlay(),
				setAutoScrollSelecting: (active) => {
					if (active) {
						const canUseNativeAssist =
							this.isNativeSelectionConfigured() &&
							!this.ceImeMode &&
							!this.sourceModeEnabled &&
							this.isPointerSelecting &&
							!this.scrollbarSelectionHold;
						if (canUseNativeAssist) {
							this.nativeSelectionAssistByAutoScroll = true;
							// 補助開始直後のレースで fast-scroll class が残るのを防ぐ。
							this.autoScrollFast = false;
							this.derivedRootEl?.classList.remove("tategaki-fast-scroll");
							this.setNativeSelectionAssistActive(true, "autoscroll-start");
						}
					} else if (this.nativeSelectionAssistByAutoScroll) {
						this.nativeSelectionAssistByAutoScroll = false;
						this.setNativeSelectionAssistActive(false, "autoscroll-stop");
					}
					this.autoScrollSelecting = active;
					if (!this.shouldSuppressAutoScrollSelectionRenders()) {
						this.updateSelectionOverlay();
					} else {
						this.selectionLayerEl?.replaceChildren();
					}
				},
				setAutoScrollFast: (active) => {
					if (this.nativeSelectionAssistByAutoScroll) {
						this.autoScrollFast = false;
						this.derivedRootEl?.classList.remove("tategaki-fast-scroll");
						return;
					}
					this.autoScrollFast = active;
					if (this.derivedRootEl) {
						this.derivedRootEl.classList.toggle(
						"tategaki-fast-scroll",
						active,
					);
				}
				if (active) {
					this.updateFastScrollPlaceholders();
				}
			},
			focusInputSurface: (shouldFocus) =>
				this.focusInputSurface(shouldFocus),
			syncSelectionToCe: () => this.syncSelectionToCe(),
			toggleHeadingFold: (lineIndex) => this.toggleHeadingFold(lineIndex),
			toggleTaskForLineElement: (lineEl) =>
				this.toggleTaskForLineElement(lineEl),
			openHref: (href) => this.openHref(href),
			getPointerState: () => ({
				isPointerSelecting: this.isPointerSelecting,
				pointerSelectAnchor: this.pointerSelectAnchor,
				pointerSelectPointerId: this.pointerSelectPointerId,
			}),
			setPointerState: (state) => {
				if (state.isPointerSelecting !== undefined) {
					this.isPointerSelecting = state.isPointerSelecting;
					if (!state.isPointerSelecting) {
						this.softSelectionPointerLock = false;
					}
				}
				if (state.pointerSelectAnchor !== undefined) {
					this.pointerSelectAnchor = state.pointerSelectAnchor;
				}
				if (state.pointerSelectPointerId !== undefined) {
					this.pointerSelectPointerId = state.pointerSelectPointerId;
				}
			},
		});

		this.registerDomEvent(this.derivedRootEl, "pointerdown", (event) => {
			const pointerEvent = event as PointerEvent;
			const onScrollbar = this.isPointerOnScrollbar(
				this.derivedRootEl,
				pointerEvent,
			);
			if (pointerEvent.button === 0) {
				const canEvaluateNativeAssist =
					this.isNativeSelectionConfigured() &&
					!this.ceImeMode &&
					!this.sourceModeEnabled;
				if (!canEvaluateNativeAssist) {
					this.debugNativeSelectionAssist("pointerdown-skipped", {
						button: pointerEvent.button,
						onScrollbar,
						hugeDoc: this.isHugeDocSelection(),
						reason: !this.isNativeSelectionConfigured()
							? "not-configured"
							: this.ceImeMode
								? "ce-ime-mode"
								: "source-mode",
					});
				}
			}
			if (
				pointerEvent.button === 0 &&
				this.isNativeSelectionConfigured() &&
				!this.ceImeMode &&
				!this.sourceModeEnabled
			) {
				// 通常クリックはカスタムポインタ処理を優先し、
				// ネイティブ補助はスクロールバー操作時のみ有効化する。
				const useNativeAssist = onScrollbar;
				this.debugNativeSelectionAssist("pointerdown-evaluated", {
					button: pointerEvent.button,
					onScrollbar,
					hugeDoc: this.isHugeDocSelection(),
					useNativeAssist,
				});
				this.setNativeSelectionAssistActive(
					useNativeAssist,
					onScrollbar ? "pointerdown-scrollbar" : "pointerdown-content",
				);
			}
			const domSelection =
				this.derivedContentEl?.ownerDocument.getSelection() ?? null;
			const startedContextHold =
				this.nativeContextMenuHold.handlePointerDown({
					button: pointerEvent.button,
					isNativeSelectionEnabled: this.isNativeSelectionEnabled(),
					isCeImeMode: this.ceImeMode,
					isSourceMode: this.sourceModeEnabled,
					isOnScrollbar: onScrollbar,
					domSelection,
					isSelectionInsideDerivedContent: (selection) =>
						this.isSelectionInsideDerivedContent(selection),
					sotSelection: this.sotEditor?.getSelection() ?? null,
				});
			if (startedContextHold) {
				this.suppressNativeSelectionCollapse = true;
				this.scheduleSelectionOverlayUpdate();
			}
			if (onScrollbar) {
				this.scrollbarSelectionHold = true;
				this.suppressNativeSelectionCollapse = true;
				this.scheduleSelectionOverlayUpdate();
			} else {
				this.scrollbarSelectionHold = false;
			}
			if (
				this.softSelectionActive &&
				pointerEvent.button === 0 &&
				!onScrollbar
			) {
				this.clearSoftSelection();
				this.selectAllActive = false;
			}
			if (
				this.sourceModeEnabled &&
				this.plainEditOverlayEl &&
				event.target instanceof Node &&
				this.plainEditOverlayEl.contains(event.target)
			) {
				return;
			}
			if (
				this.isNativeSelectionEnabled() &&
				pointerEvent.button === 0 &&
				!onScrollbar
			) {
				const lineEl = (
					pointerEvent.target as HTMLElement | null
				)?.closest(".tategaki-sot-line") as HTMLElement | null;
				if (lineEl) {
					const lineIndex = Number.parseInt(
						lineEl.dataset.line ?? "",
						10,
					);
					if (Number.isFinite(lineIndex)) {
						this.nativeSelectionAnchorLine = lineIndex;
						this.nativeSelectionHeadLine = lineIndex;
						this.nativeSelectionAnchorLocked = true;
					}
				}
				this.nativeSelectionPendingFocus = true;
				if (lineEl) {
					this.nativeSelectionPendingClick = {
						lineEl,
						clientX: pointerEvent.clientX,
						clientY: pointerEvent.clientY,
						pointerId: pointerEvent.pointerId,
					};
				} else {
					this.nativeSelectionPendingClick = null;
				}
			} else {
				this.nativeSelectionPendingFocus = false;
				this.nativeSelectionPendingClick = null;
			}
			this.handleTouchScrollPointerDown(pointerEvent);
			this.pointerHandler?.handlePointerDown(pointerEvent);
		});
		if (this.commandAdapter) {
			this.commandContextMenu = new CommandContextMenu(
				this.commandAdapter,
			);
		}
		this.registerDomEvent(this.derivedRootEl, "contextmenu", (event) => {
			if (!this.commandContextMenu || !this.derivedRootEl) return;
			if (
				isPhoneLikeMobile(
					this.derivedRootEl.ownerDocument.defaultView ?? window,
				)
			) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			if (this.nativeContextMenuHold.shouldFocusRootOnContextMenu()) {
				this.derivedRootEl.focus({ preventScroll: true });
			}
			this.commandContextMenu.show(event as MouseEvent);
		});
		this.registerClipboardHandlers();
		this.registerDomEvent(window, "pointermove", (event) => {
			this.handleTouchScrollPointerMove(event as PointerEvent);
			if (
				this.touchScrollActive &&
				(event as PointerEvent).pointerType === "touch"
			) {
				return;
			}
			this.pointerHandler?.handlePointerMove(event as PointerEvent);
		});
		this.registerDomEvent(window, "pointerup", (event) => {
			if (this.scrollbarSelectionHold) {
				// this.scrollbarSelectionHold = false;
				this.scheduleSelectionOverlayUpdate();
			}
			if ((event as PointerEvent).button === 0) {
				if (this.nativeContextMenuHold.clear()) {
					this.scheduleSelectionOverlayUpdate();
				}
			}
			const wasTouchScroll =
				this.touchScrollActive &&
				(event as PointerEvent).pointerType === "touch";
			this.handleTouchScrollPointerUp(event as PointerEvent);
			if (wasTouchScroll) {
				return;
			}
			this.pointerHandler?.handlePointerUp(event as PointerEvent);
			this.maybeHandleNativeSelectionWhitespaceClick(
				event as PointerEvent,
			);
				this.maybeFocusOverlayAfterNativeSelectionPointerUp();
				this.flushPendingNativeSelectionSync(true);
				if ((event as PointerEvent).button === 0) {
					this.nativeSelectionAssistByAutoScroll = false;
					this.setNativeSelectionAssistActive(false, "pointerup");
				}
			});
		this.registerDomEvent(window, "pointercancel", (event) => {
			if (this.scrollbarSelectionHold) {
				// this.scrollbarSelectionHold = false;
				this.scheduleSelectionOverlayUpdate();
			}
			if ((event as PointerEvent).button === 0) {
				if (this.nativeContextMenuHold.clear()) {
					this.scheduleSelectionOverlayUpdate();
				}
			}
			const wasTouchScroll =
				this.touchScrollActive &&
				(event as PointerEvent).pointerType === "touch";
			this.handleTouchScrollPointerUp(event as PointerEvent);
			if (wasTouchScroll) {
				return;
			}
			this.pointerHandler?.handlePointerUp(event as PointerEvent);
			this.maybeHandleNativeSelectionWhitespaceClick(
				event as PointerEvent,
			);
				this.maybeFocusOverlayAfterNativeSelectionPointerUp();
				this.flushPendingNativeSelectionSync(true);
				if ((event as PointerEvent).button === 0) {
					this.nativeSelectionAssistByAutoScroll = false;
					this.setNativeSelectionAssistActive(false, "pointercancel");
				}
			});
			this.registerDomEvent(this.derivedRootEl, "keydown", (event) => {
				const key = (event as KeyboardEvent).key;
				const keyboardEvent = event as KeyboardEvent;
				if (
					key === "Meta" ||
					key === "Control" ||
					key === "Shift" ||
					key === "Alt"
			) {
				return;
			}
			if (key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				this.nativeContextMenuHold.clear();
				this.pendingNativeSelectionSync = false;
				this.clearSelectionChangeDebounceTimer();
				this.nativeSelectionAssistByAutoScroll = false;
				this.setNativeSelectionAssistActive(false, "escape");
				this.overlayImeReplace?.cancel();
				this.collapseSelectionAfterNativeCancel("escape");
				this.focusInputSurface(true);
				return;
			}
				// クリックせずにタイピングを始めた場合のフォーカス救済
				if (this.ceImeMode) {
					this.focusInputSurface(true);
					return;
				}
				if (
					!this.isNativeSelectionEnabled() &&
					!this.sourceModeEnabled &&
					!this.overlayTextarea?.isFocused() &&
					!keyboardEvent.metaKey &&
					!keyboardEvent.ctrlKey &&
					!keyboardEvent.altKey &&
					["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
						key,
					)
				) {
					event.preventDefault();
					event.stopPropagation();
					this.handleNavigate(keyboardEvent);
					window.requestAnimationFrame(() => {
						this.focusInputSurface(true);
					});
					return;
				}
				if (
					(key === "Backspace" || key === "Delete") &&
					!this.overlayTextarea?.isFocused() &&
					this.isNativeSelectionEnabled() &&
					!this.sourceModeEnabled
				) {
				const selection =
					this.derivedContentEl?.ownerDocument.getSelection() ?? null;
				const hasDomSelection =
					selection &&
					this.isSelectionInsideDerivedContent(selection) &&
					!selection.isCollapsed;
				const sotSelection = this.sotEditor?.getSelection();
				const hasSotSelection =
					!!sotSelection && sotSelection.anchor !== sotSelection.head;
				if (hasDomSelection || hasSotSelection) {
					event.preventDefault();
					event.stopPropagation();
					if (key === "Backspace") {
						this.backspace();
					} else {
						this.del();
					}
					window.requestAnimationFrame(() => {
						this.focusInputSurface(true);
					});
					return;
				}
			}
			if (
				this.isNativeSelectionEnabled() &&
				!this.overlayTextarea?.isFocused() &&
				!(event as KeyboardEvent).metaKey &&
				!(event as KeyboardEvent).ctrlKey &&
				!(event as KeyboardEvent).altKey &&
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
					key,
				)
			) {
				event.preventDefault();
				this.handleNavigate(event as KeyboardEvent);
				if ((event as KeyboardEvent).shiftKey) {
					this.focusOverlayAfterSelection("shift-arrow");
				} else {
					window.requestAnimationFrame(() => {
						this.focusInputSurface(true);
					});
				}
				return;
			}
			if (!this.overlayTextarea?.isFocused()) {
				if (
					this.isNativeSelectionEnabled() &&
					!this.sourceModeEnabled
				) {
					const selection =
						this.derivedContentEl?.ownerDocument.getSelection() ??
						null;
					const hasDomSelection =
						selection &&
						this.isSelectionInsideDerivedContent(selection) &&
						!selection.isCollapsed;
					if (
						hasDomSelection &&
						this.shouldPrepareImeReplaceRange(
							event as KeyboardEvent,
						)
					) {
						this.overlayImeReplace?.prepareReplaceRange();
					}
					if (hasDomSelection) {
						this.suppressNativeSelectionCollapse = true;
					}
				}
				this.focusInputSurface(true);
			}
		});
		this.registerDomEvent(this.derivedRootEl, "scroll", () => {
			this.handleRootScroll();
		});
		this.setupWheelScroll();
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf === this.leaf) {
					if (this.ceImeSuspended) {
						this.ceImeSuspended = false;
						this.setCeImeMode(true);
					}
					window.setTimeout(() => {
						this.focusInputSurface(true);
					}, 0);
					return;
				}
				if (this.sourceModeEnabled) {
					this.disablePlainEditMode();
				}
				if (this.ceImeMode) {
					this.setCeImeMode(false, { suspend: true });
				}
			}),
		);

		this.isReady = true;
		await this.openFile(initialFile);
		const useCeOnMobile = Platform.isMobile || Platform.isMobileApp;
		this.setCeImeMode(useCeOnMobile);
		this.focusInputSurface(true);

		if (this.pendingState) {
			const pending = this.pendingState;
			this.pendingState = null;
			const settingsMode = this.getEffectiveCommonSettings(
				this.plugin.settings,
			).writingMode;
			if (pending?.writingMode) {
				if (pending.writingMode === settingsMode) {
					this.setWritingMode(pending.writingMode);
				} else {
					this.setWritingMode(settingsMode);
				}
			}
			const filePath = pending?.filePath ?? null;
			if (filePath) {
				const abs = this.app.vault.getAbstractFileByPath(filePath);
				if (abs instanceof TFile) {
					await this.openFile(abs);
				}
			}
		}
	}

	updateSettings(settings: TategakiV2Settings): Promise<void> {
		const prevHideFrontmatter = this.hideFrontmatter;
		this.applySettingsToView(settings);
		this.commandToolbar?.update();
		if (prevHideFrontmatter !== this.hideFrontmatter) {
			this.scheduleRender(true);
		} else {
			this.scheduleRender();
		}
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.clearPairedMarkdownBadge();
		this.clearSoTTabBadge();
		this.renderPipeline?.dispose();
		this.renderPipeline = null;
		this.resetTouchScrollState();
		this.cancelOutlineJump();
		if (this.selectionOverlayRaf !== null) {
			window.cancelAnimationFrame(this.selectionOverlayRaf);
			this.selectionOverlayRaf = null;
		}
		if (this.wheelThrottleTimer !== null) {
			window.clearTimeout(this.wheelThrottleTimer);
			this.wheelThrottleTimer = null;
		}
		if (this.scrollDebounceTimer !== null) {
			window.clearTimeout(this.scrollDebounceTimer);
			this.scrollDebounceTimer = null;
		}
		if (this.scrollDebounceRaf !== null) {
			window.cancelAnimationFrame(this.scrollDebounceRaf);
			this.scrollDebounceRaf = null;
		}
		this.clearSelectionChangeDebounceTimer();
		if (this.lineModelRecomputeTimer !== null) {
			window.clearTimeout(this.lineModelRecomputeTimer);
			this.lineModelRecomputeTimer = null;
		}
		if (this.lineModelRecomputeIdle !== null) {
			const cancelIdle = (window as any).cancelIdleCallback as
				| ((handle: number) => void)
				| undefined;
			cancelIdle?.(this.lineModelRecomputeIdle);
			this.lineModelRecomputeIdle = null;
		}
		if (this.finishRenderMathTimer !== null) {
			window.clearTimeout(this.finishRenderMathTimer);
			this.finishRenderMathTimer = null;
		}
		this.commitPlainEdit(true, false);
		this.unregisterPlainEditOutsidePointerHandler();
		this.destroyPlainEditOverlay();
		if (this.plainEditRange) {
			this.clearPlainEditTargets();
			this.plainEditRange = null;
		}

		for (const child of this.embedRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) {
				// noop: unload失敗は無視
			}
		}
		this.embedRenderChildren.clear();
		for (const child of this.mathRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) {
				// noop: unload失敗は無視
			}
		}
		this.mathRenderChildren.clear();
		for (const child of this.calloutRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) {
				// noop: unload失敗は無視
			}
		}
		this.calloutRenderChildren.clear();
		for (const child of this.tableRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) {
				// noop: unload失敗は無視
			}
		}
		this.tableRenderChildren.clear();
		for (const child of this.deflistRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) {
				// noop: unload失敗は無視
			}
		}
		this.deflistRenderChildren.clear();

		this.detachSoTListener?.();
		this.detachSoTListener = null;
		this.overlayTextarea?.destroy();
		this.overlayTextarea = null;
		this.outlinePanel = null;
		this.sotEditor?.destroy();
		this.sotEditor = null;
		this.commandToolbar?.destroy();
		this.commandToolbar = null;
		this.commandContextMenu = null;
		this.commandAdapter = null;
		this.pageContainerEl = null;
		this.borderWrapperEl = null;
		this.contentWrapperEl = null;
		this.derivedContentEl = null;
		this.selectionLayerEl = null;
		this.pendingEl = null;
		this.pendingSpacerEl = null;
		this.loadingOverlayEl = null;
		this.currentFile = null;
		this.pairedMarkdownLeaf = null;
		this.pairedMarkdownView = null;
		this.pairedMarkdownBadgeLeaf = null;
		this.pairedMarkdownBadgeEl = null;
		this.sotTabBadgeEl = null;
		this.pairedMismatchNotified = false;
		this.suppressPairCheck = false;
		this.recentFilePaths = [];
		this.recentFilePathsInitialized = false;
		this.sourceModeEnabled = false;
		this.sourceModeLineStart = null;
		this.sourceModeLineEnd = null;
		this.plainTextViewEnabled = false;
		this.writingMode = "vertical-rl";
		this.isReady = false;
		return Promise.resolve();
	}

	private async openFile(file: TFile): Promise<void> {
		await this.workspaceController.openFile(file);
		this.updatePaneHeaderTitle(true);
	}

	private registerWorkspacePairGuards(): void {
		this.workspaceController.registerWorkspacePairGuards();
	}

	private updateToolbar(): void {
		this.updateWritingModeToggleUi();
	}

	private registerEscapeGuard(): void {
		this.workspaceController.registerEscapeGuard();
	}

	private isLeafActive(): boolean {
		return (
			(this.app.workspace.getMostRecentLeaf?.() ?? null) === this.leaf
		);
	}

	private isPairedMarkdownLeafActive(): boolean {
		const pairedLeaf = this.getValidPairedMarkdownLeaf();
		if (!pairedLeaf) return false;
		return (
			(this.app.workspace.getMostRecentLeaf?.() ?? null) === pairedLeaf
		);
	}

	private registerEscapeKeymap(): void {
		this.workspaceController.registerEscapeKeymap();
	}

	private getValidPairedMarkdownLeaf(): WorkspaceLeaf | null {
		return this.workspaceController.getValidPairedMarkdownLeaf();
	}

	private runCommand(
		action: () => void | Promise<void>,
		options?: { skipFinalizeFocus?: boolean },
	): void {
		const finalize = () => {
			this.commandToolbar?.update();
			this.scheduleCaretUpdate(true);
			if (!options?.skipFinalizeFocus) {
				this.focusInputSurface(true);
			}
		};
		let result: void | Promise<void> | undefined;
		if (this.ceImeMode) {
			this.runCeMutation(() => {
				result = action();
			});
		} else {
			result = action();
		}
		if (result && typeof (result as Promise<void>).then === "function") {
			void (result as Promise<void>).finally(() => finalize());
			return;
		}
		finalize();
	}

	private wrapCommand(
		action: () => void | Promise<void>,
		options?: { skipFinalizeFocus?: boolean },
	): () => void {
		return () => this.runCommand(action, options);
	}

	private createCommandAdapter(): CommandUiAdapter {
		const wrap = (action: () => void | Promise<void>) =>
			this.wrapCommand(action);
		return {
			app: this.app,
			isReadOnly: () => !this.sotEditor,
			hasSelection: () => this.hasSelection(),
			isInlineSelectionAllowed: () => this.isInlineSelectionAllowed(),
			getWritingMode: () => this.writingMode,
			toggleWritingMode: wrap(() => this.toggleWritingMode()),
			toggleBold: wrap(() => this.toggleInlineStyle("bold")),
			isBoldActive: () => this.isInlineStyleActive("tategaki-md-strong"),
			toggleItalic: wrap(() => this.toggleInlineStyle("italic")),
			isItalicActive: () => this.isInlineStyleActive("tategaki-md-em"),
			toggleStrikethrough: wrap(() => this.toggleInlineStyle("strike")),
			isStrikethroughActive: () =>
				this.isInlineStyleActive("tategaki-md-strike"),
			toggleHighlight: wrap(() => this.toggleInlineStyle("highlight")),
			isHighlightActive: () =>
				this.isInlineStyleActive("tategaki-md-highlight"),
			toggleInlineCode: wrap(() => this.toggleInlineStyle("code")),
			isInlineCodeActive: () =>
				this.isInlineStyleActive("tategaki-md-code"),
			setHeading: (level: number) => {
				this.runCommand(() => this.setHeading(level));
			},
			clearHeading: wrap(() => this.clearHeading()),
			getHeadingLevel: () => this.getHeadingLevel(),
			toggleBulletList: wrap(() => this.toggleList("bullet")),
			isBulletListActive: () => this.isBulletListActive(),
			toggleTaskList: wrap(() => this.toggleList("task")),
			isTaskListActive: () => this.isTaskListActive(),
			toggleOrderedList: wrap(() => this.toggleList("ordered")),
			isOrderedListActive: () => this.isOrderedListActive(),
			toggleBlockquote: wrap(() => this.toggleBlockquote()),
			isBlockquoteActive: () => this.isBlockquoteActive(),
			toggleCodeBlock: wrap(() => this.toggleCodeBlock()),
			isCodeBlockActive: () => this.isCodeBlockActive(),
			insertLink: wrap(() => this.insertLink()),
			insertRuby: wrap(() => this.insertRuby()),
			toggleTcy: wrap(() => this.toggleTcy()),
			isTcyActive: () => this.isTcyActive(),
			insertTcy: wrap(() => this.insertTcy()),
			insertHorizontalRule: wrap(() => this.insertHorizontalRule()),
			openSettings: wrap(() => this.openSettingsPanel()),
			openOutline: () => {
				this.openOutline();
			},
			clearTcy: wrap(() => this.clearTcy()),
			clearFormatting: wrap(() => this.clearFormatting()),
			toggleRuby: wrap(() => this.toggleRubyVisibility()),
			isRubyEnabled: () =>
				!this.plainTextViewEnabled &&
				this.plugin.settings.wysiwyg?.enableRuby !== false,
			openFileSwitcher: wrap(() => this.openFileSwitcher()),
			toggleReadingMode: wrap(() => this.toggleReadingMode()),
			isReadingMode: () => false,
			undo: wrap(() => this.sotEditor?.undo()),
			redo: wrap(() => this.sotEditor?.redo()),
			canUndo: () => !!this.sotEditor,
			canRedo: () => !!this.sotEditor,
			toggleSourceMode: wrap(() => this.toggleSourceMode()),
			isSourceMode: () => this.sourceModeEnabled,
			toggleCeImeMode: wrap(() => this.toggleCeImeMode()),
			isCeImeMode: () => this.ceImeMode,
			cut: wrap(() => this.cutSelection()),
			copy: wrap(() => this.copySelection()),
			paste: wrap(() => this.pasteFromClipboard()),
			selectAll: this.wrapCommand(() => this.selectAllText(), {
				skipFinalizeFocus: true,
			}),
			isPlainTextView: () => this.plainTextViewEnabled,
			togglePlainTextView: wrap(() => this.togglePlainTextView()),
		};
	}

	private hasSelection(): boolean {
		if (this.softSelectionActive) return true;
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const start = this.plainEditOverlayEl.selectionStart ?? 0;
			const end = this.plainEditOverlayEl.selectionEnd ?? start;
			return start !== end;
		}
		if (this.isNativeSelectionEnabled() && this.derivedContentEl) {
			const selection =
				this.derivedContentEl.ownerDocument.getSelection();
			const insideDerived =
				!!selection && this.isSelectionInsideDerivedContent(selection);
			if (insideDerived && selection && !selection.isCollapsed)
				return true;
			if (
				(this.overlayFocused ||
					this.scrollbarSelectionHold ||
					this.nativeContextMenuHold.isActiveWithSelection(
						this.sotEditor?.getSelection() ?? null,
					)) &&
				this.sotEditor
			) {
				const sotSelection = this.sotEditor.getSelection();
				return sotSelection.anchor !== sotSelection.head;
			}
			return false;
		}
		if (!this.sotEditor) return false;
		const selection = this.sotEditor.getSelection();
		return selection.anchor !== selection.head;
	}

	private isInlineSelectionAllowed(): boolean {
		if (this.softSelectionActive && this.sotEditor) {
			const range = this.getSoftSelectionRange();
			if (!range) return true;
			const startLine = this.findLineIndex(range.from);
			const endLine = this.findLineIndex(range.to);
			return (
				startLine !== null && endLine !== null && startLine === endLine
			);
		}
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const selection = getPlainEditSelectionRange(
				this.plainEditOverlayEl,
			);
			if (!selection) return true;
			if (selection.start === selection.end) return true;
			return !(selection.text ?? "").includes("\n");
		}
		if (!this.sotEditor) return true;
		const selection = this.sotEditor.getSelection();
		if (selection.anchor === selection.head) return true;
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		return startLine !== null && endLine !== null && startLine === endLine;
	}

	private getSelectionText(): string {
		if (this.softSelectionActive && this.sotEditor) {
			const range = this.getSoftSelectionRange();
			if (range) {
				return this.sotEditor.getDoc().slice(range.from, range.to);
			}
		}
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const selection = getPlainEditSelectionRange(
				this.plainEditOverlayEl,
			);
			return selection?.text ?? "";
		}
		if (!this.sotEditor) return "";
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		if (from === to) return "";
		return this.sotEditor.getDoc().slice(from, to);
	}

	private getNativeSelectionText(): string {
		if (!this.derivedContentEl) return "";
		const selection = this.derivedContentEl.ownerDocument.getSelection();
		if (!selection || selection.rangeCount === 0) return "";
		const anchorNode = selection.anchorNode;
		const focusNode = selection.focusNode;
		if (anchorNode && !this.derivedContentEl.contains(anchorNode)) {
			return "";
		}
		if (focusNode && !this.derivedContentEl.contains(focusNode)) {
			return "";
		}
		return selection.toString();
	}

	private selectAllDerivedContent(): boolean {
		if (!this.derivedContentEl) return false;
		const selection = this.derivedContentEl.ownerDocument.getSelection();
		if (!selection) return false;
		const range = this.derivedContentEl.ownerDocument.createRange();
		range.selectNodeContents(this.derivedContentEl);
		selection.removeAllRanges();
		selection.addRange(range);
		return true;
	}

	private selectAllText(): void {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			this.plainEditOverlayEl.focus({ preventScroll: true });
			this.plainEditOverlayEl.select();
			return;
		}
		if (this.ceImeMode && this.derivedContentEl) {
			this.focusInputSurface(true);
			if (!this.sotEditor) {
				this.selectAllDerivedContent();
				this.selectAllActive = false;
				this.clearSoftSelection();
				this.scheduleCaretUpdate();
				return;
			}
			const docLength = this.sotEditor.getDoc().length;
			this.selectAllActive = docLength > 0;
			this.clearSoftSelection();
			this.setSelectionNormalized(0, docLength);
			this.ceImeSelectionChangeSuppressedUntil = Date.now() + 120;
			this.syncSelectionToCe();
			this.updateCeEditableRangeFromSelection();
			this.scheduleSelectionOverlayUpdate();
			this.scheduleCaretUpdate();
			return;
		}
		if (this.isNativeSelectionEnabled() && this.derivedContentEl) {
			if (this.shouldAllowDomSelectAll()) {
				this.selectAllDerivedContent();
				this.selectAllActive = false;
				this.clearSoftSelection();
				this.scheduleCaretUpdate();
				return;
			}
		}
		if (!this.sotEditor) return;
		const docLength = this.sotEditor.getDoc().length;
		const hugeSelection = this.isHugeDocSelection();
		this.selectAllActive = docLength >= 200000 || hugeSelection;
		if (hugeSelection) {
			this.setSoftSelection(0, docLength);
			this.scheduleSelectionOverlayUpdate();
			return;
		}
		this.clearSoftSelection();
		this.setSelectionNormalized(0, docLength);
		this.scheduleCaretUpdate();
	}

	private async copySelection(): Promise<void> {
		if (this.isNativeSelectionEnabled()) {
			if (this.ceImeMode) {
				this.focusInputSurface(true);
			}
			const text = this.getNativeSelectionText() || this.getSelectionText();
			if (!text) return;
			await this.writeTextToClipboard(text);
			return;
		}
		const text = this.getSelectionText();
		if (!text) return;
		await this.writeTextToClipboard(text);
	}

	private async cutSelection(): Promise<void> {
		if (this.isNativeSelectionEnabled()) {
			if (this.ceImeMode) {
				this.focusInputSurface(true);
			}
			const text = this.getNativeSelectionText() || this.getSelectionText();
			if (!text) return;
			const copied = await this.writeTextToClipboard(text);
			if (!copied) return;
			if (this.ceImeMode) {
				const selection = this.syncSelectionFromCe();
				if (!selection) return;
				const from = Math.min(selection.anchor, selection.head);
				const to = Math.max(selection.anchor, selection.head);
				this.applyCeReplaceRange(from, to, "");
				return;
			}
			this.replaceSelection("");
			return;
		}
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const text = this.getSelectionText();
			if (!text) return;
			const copied = await this.writeTextToClipboard(text);
			if (!copied) return;
			replacePlainEditSelection(this.plainEditOverlayEl, "", {
				onResize: () => this.adjustPlainEditOverlaySize(),
			});
			return;
		}
		const text = this.getSelectionText();
		if (!text) return;
		const copied = await this.writeTextToClipboard(text);
		if (!copied) return;
		this.replaceSelection("");
	}

	private async pasteFromClipboard(): Promise<void> {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const text = await this.readTextFromClipboard();
			if (!text) {
				this.plainEditOverlayEl.focus({ preventScroll: true });
				return;
			}
			const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
			replacePlainEditSelection(this.plainEditOverlayEl, normalized, {
				onResize: () => this.adjustPlainEditOverlaySize(),
			});
			return;
		}
		if (!this.sotEditor) return;
		const text = await this.readTextFromClipboard();
		if (!text) {
			return;
		}
		const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		if (this.ceImeMode) {
			const selection = this.syncSelectionFromCe();
			if (!selection) return;
			const from = Math.min(selection.anchor, selection.head);
			const to = Math.max(selection.anchor, selection.head);
			this.applyCeReplaceRange(from, to, normalized);
			return;
		}
		this.updatePendingText("", true);
		this.replaceSelection(normalized);
	}

	private async writeTextToClipboard(text: string): Promise<boolean> {
		if (!text) return false;
		if (!navigator.clipboard?.writeText) return false;
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (error) {
			debugWarn("Tategaki SoT: clipboard write failed", error);
			return false;
		}
	}

	private async readTextFromClipboard(): Promise<string> {
		if (navigator.clipboard?.readText) {
			try {
				return await navigator.clipboard.readText();
			} catch (error) {
				debugWarn("Tategaki SoT: clipboard read failed", error);
			}
		}
		return "";
	}

	private toggleInlineStyle(
		kind: "bold" | "italic" | "strike" | "highlight" | "code",
	): void {
		if (this.ceImeMode && !this.sourceModeEnabled) {
			const selection = this.syncSelectionFromCe();
			if (!selection) return;
		}
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			switch (kind) {
				case "bold":
					wrapPlainEditSelection(
						this.plainEditOverlayEl,
						"**",
						"**",
						() => this.adjustPlainEditOverlaySize(),
					);
					return;
				case "italic":
					wrapPlainEditSelection(
						this.plainEditOverlayEl,
						"*",
						"*",
						() => this.adjustPlainEditOverlaySize(),
					);
					return;
				case "strike":
					wrapPlainEditSelection(
						this.plainEditOverlayEl,
						"~~",
						"~~",
						() => this.adjustPlainEditOverlaySize(),
					);
					return;
				case "highlight":
					wrapPlainEditSelection(
						this.plainEditOverlayEl,
						"==",
						"==",
						() => this.adjustPlainEditOverlaySize(),
					);
					return;
				case "code":
					wrapPlainEditSelection(
						this.plainEditOverlayEl,
						"`",
						"`",
						() => this.adjustPlainEditOverlaySize(),
					);
					return;
			}
		}
		if (!this.sotEditor) return;
		switch (kind) {
			case "bold":
				this.toggleInlineMarkup(
					"**",
					"**",
					[
						{ open: "**", close: "**" },
						{ open: "__", close: "__" },
					],
					"tategaki-md-strong",
				);
				return;
			case "italic":
				this.toggleInlineMarkup(
					"*",
					"*",
					[
						{ open: "*", close: "*" },
						{ open: "_", close: "_" },
					],
					"tategaki-md-em",
					false,
				);
				return;
			case "strike":
				this.toggleInlineMarkup("~~", "~~", [], "tategaki-md-strike");
				return;
			case "highlight":
				this.toggleInlineMarkup(
					"==",
					"==",
					[],
					"tategaki-md-highlight",
				);
				return;
			case "code":
				this.toggleInlineMarkup("`", "`", [], "tategaki-md-code");
				return;
		}
	}

	private clearFormatting(): void {
		if (this.ceImeMode && !this.sourceModeEnabled) {
			const selection = this.syncSelectionFromCe();
			if (!selection) return;
		}
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			clearPlainEditSelectionFormatting(this.plainEditOverlayEl, () =>
				this.adjustPlainEditOverlaySize(),
			);
			return;
		}
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		let from = Math.min(selection.anchor, selection.head);
		let to = Math.max(selection.anchor, selection.head);
		if (from === to) return;

		this.updatePendingText("", true);
		this.immediateRender = true;

		const view = this.getEditorViewForSyntax();
		const maxPasses = 6;
		let pass = 0;
		let changed = false;

		while (pass < maxPasses) {
			const doc = this.sotEditor.getDoc();
			const removals = this.collectClearFormattingRemovals(
				from,
				to,
				doc,
				view,
			);
			if (removals.length === 0) break;
			changed = true;
			const merged = this.mergeRanges(removals).sort(
				(a, b) => b.from - a.from,
			);
			let nextFrom = from;
			let nextTo = to;
			for (const removal of merged) {
				const len = removal.to - removal.from;
				if (len <= 0) continue;
				this.sotEditor.replaceRange(removal.from, removal.to, "");
				if (removal.to <= nextFrom) {
					nextFrom -= len;
					nextTo -= len;
				} else if (removal.to <= nextTo) {
					nextTo -= len;
				}
			}
			from = nextFrom;
			to = nextTo;
			pass += 1;
			if (from === to) break;
		}

		if (!changed) return;
		this.setSelectionNormalized(from, to);
		this.focusInputSurface(true);
	}

	private collectClearFormattingRemovals(
		from: number,
		to: number,
		doc: string,
		view: EditorView | null,
	): HiddenRange[] {
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return [];

		const removals: HiddenRange[] = [];

		for (let i = startLine; i <= endLine; i += 1) {
			const range = this.lineRanges[i];
			if (!range) continue;
			const lineFrom = range.from;
			const lineTo = range.to;
			if (lineTo < from || lineFrom > to) continue;
			const lineText = doc.slice(lineFrom, lineTo);

			const blockDecoration = this.getCachedBlockLineDecoration(
				i,
				lineFrom,
				lineTo,
				lineText,
			);
			for (const hidden of blockDecoration.hidden) {
				removals.push(hidden);
			}

			if (view) {
				try {
					syntaxTree(view.state).iterate({
						from: lineFrom,
						to: lineTo,
						enter: (node) => {
							const name = node.type.name;
							if (
								node.to <= from ||
								node.from >= to ||
								node.to <= node.from
							) {
								return;
							}
							if (this.isMarkdownSyntaxMarkerNode(name)) {
								removals.push({ from: node.from, to: node.to });
								return;
							}
							if (this.isInlineStyleNode(name)) {
								this.pushHiddenMarkersForStyleNode(
									doc,
									name,
									node.from,
									node.to,
									removals,
								);
							}
						},
					});
				} catch (_) {
					// noop: syntaxTree解析失敗は無視
				}
			}

			const clearableSpans = this.collectClearableLinkSpansForLine(
				lineFrom,
				lineText,
			);
			for (const span of clearableSpans) {
				if (span.to <= from || span.from >= to) continue;
				removals.push(...span.markers);
			}

			const mathSpans = this.collectInlineMathMarkerRangesForLine(
				lineFrom,
				lineText,
			);
			for (const span of mathSpans) {
				if (span.to <= from || span.from >= to) continue;
				removals.push(...span.markers);
			}

			const rubySpans = this.collectClearableRubySpansForLine(
				lineFrom,
				lineText,
			);
			for (const span of rubySpans) {
				if (span.to <= from || span.from >= to) continue;
				removals.push(...span.markers);
			}

			const tcySpans = collectClearableTcySpansForLine(
				lineFrom,
				lineText,
			);
			for (const span of tcySpans) {
				if (span.to <= from || span.from >= to) continue;
				removals.push(...span.markers);
			}
		}

		this.collectInlineStyleRemovalsForRange(
			from,
			to,
			"tategaki-md-strong",
			[
				{ open: "**", close: "**" },
				{ open: "__", close: "__" },
			],
			doc,
			removals,
		);
		this.collectInlineStyleRemovalsForRange(
			from,
			to,
			"tategaki-md-em",
			[
				{ open: "_", close: "_" },
				{ open: "*", close: "*" },
			],
			doc,
			removals,
		);
		this.collectInlineStyleRemovalsForRange(
			from,
			to,
			"tategaki-md-strike",
			[{ open: "~~", close: "~~" }],
			doc,
			removals,
		);
		this.collectInlineStyleRemovalsForRange(
			from,
			to,
			"tategaki-md-highlight",
			[{ open: "==", close: "==" }],
			doc,
			removals,
		);
		this.collectInlineStyleRemovalsForRange(
			from,
			to,
			"tategaki-md-code",
			[{ open: "`", close: "`" }],
			doc,
			removals,
		);

		return removals;
	}

	private toggleInlineMarkup(
		open: string,
		close: string,
		removePairs: { open: string; close: string }[] = [],
		className?: InlineStyleClass,
		allowResolvedPair = true,
	): void {
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const forward = selection.head >= selection.anchor;
		const pairs = removePairs.length > 0 ? removePairs : [{ open, close }];

		this.updatePendingText("", true);
		this.immediateRender = true;

		if (from === to) {
			return;
		}

		let adjustedFrom = from;
		let adjustedTo = to;
		if (className) {
			const adjusted = this.stripInlineStyleInSelection(
				adjustedFrom,
				adjustedTo,
				className,
				pairs,
			);
			adjustedFrom = adjusted.from;
			adjustedTo = adjusted.to;
			if (adjusted.removedOnly || adjusted.removedAny) {
				this.setSelectionNormalized(adjustedFrom, adjustedTo);
				this.focusInputSurface(true);
				return;
			}
			if (adjusted.hadStyled) {
				// スタイル検出はできたが除去できなかった場合、再付与に進むと
				// 記号が増殖しやすいため安全側で no-op にする。
				this.setSelectionNormalized(adjustedFrom, adjustedTo);
				this.focusInputSurface(true);
				return;
			}
		}

		const selectionHasStyle =
			!!className && (adjustedFrom !== from || adjustedTo !== to);
		let mergeLeft =
			!selectionHasStyle && className
				? this.hasInlineClassBefore(adjustedFrom, className)
				: false;
		let mergeRight =
			!selectionHasStyle && className
				? this.hasInlineClassAfter(adjustedTo, className)
				: false;

		let doc = this.sotEditor.getDoc();
		for (const pair of pairs) {
			const openLen = pair.open.length;
			const closeLen = pair.close.length;
			if (adjustedFrom < openLen || adjustedTo + closeLen > doc.length) {
				continue;
			}
			if (
				doc.slice(adjustedFrom - openLen, adjustedFrom) === pair.open &&
				doc.slice(adjustedTo, adjustedTo + closeLen) === pair.close
			) {
				const content = doc.slice(adjustedFrom, adjustedTo);
				this.sotEditor.replaceRange(
					adjustedFrom - openLen,
					adjustedTo + closeLen,
					content,
				);
				const nextFrom = adjustedFrom - openLen;
				const nextTo = adjustedTo - openLen;
				if (forward) {
					this.setSelectionNormalized(nextFrom, nextTo);
				} else {
					this.setSelectionNormalized(nextTo, nextFrom);
				}
				this.focusInputSurface(true);
				return;
			}
		}
		for (const pair of pairs) {
			const openLen = pair.open.length;
			const closeLen = pair.close.length;
			if (adjustedTo - adjustedFrom < openLen + closeLen) {
				continue;
			}
			if (
				doc.slice(adjustedFrom, adjustedFrom + openLen) === pair.open &&
				doc.slice(adjustedTo - closeLen, adjustedTo) === pair.close
			) {
				const content = doc.slice(
					adjustedFrom + openLen,
					adjustedTo - closeLen,
				);
				this.sotEditor.replaceRange(adjustedFrom, adjustedTo, content);
				const nextFrom = adjustedFrom;
				const nextTo = adjustedFrom + content.length;
				if (forward) {
					this.setSelectionNormalized(nextFrom, nextTo);
				} else {
					this.setSelectionNormalized(nextTo, nextFrom);
				}
				this.focusInputSurface(true);
				return;
			}
		}

		const resolvedPair = allowResolvedPair
			? (this.resolveInlineMarkerPair(
					doc,
					adjustedFrom,
					adjustedTo,
					pairs,
				) ?? { open, close })
			: { open, close };
		let insertOpen = resolvedPair.open;
		let insertClose = resolvedPair.close;
		const markerChar =
			insertOpen.length > 0 &&
			insertOpen.split("").every((ch) => ch === insertOpen[0])
				? insertOpen[0]!
				: "";
		let start = adjustedFrom;
		let end = adjustedTo;
		if (markerChar) {
			const maxRun = this.getMarkerRunLimit(markerChar);
			let currentDoc = doc;
			let leftRun = this.countMarkerRun(
				currentDoc,
				start - 1,
				-1,
				markerChar,
			);
			let rightRun = this.countMarkerRun(currentDoc, end, 1, markerChar);
			if (mergeLeft) {
				const openLen = insertOpen.length;
				if (leftRun >= openLen && start - openLen >= 0) {
					this.sotEditor.replaceRange(start - openLen, start, "");
					start -= openLen;
					end -= openLen;
					currentDoc = this.sotEditor.getDoc();
					rightRun = this.countMarkerRun(
						currentDoc,
						end,
						1,
						markerChar,
					);
					leftRun = Math.max(0, leftRun - openLen);
				} else {
					mergeLeft = false;
				}
				if (mergeLeft) {
					insertOpen = "";
				}
			}
			if (!mergeLeft && leftRun + insertOpen.length > maxRun) {
				return;
			}
			if (mergeRight) {
				const closeLen = insertClose.length;
				if (
					rightRun >= closeLen &&
					end + closeLen <= currentDoc.length
				) {
					this.sotEditor.replaceRange(end, end + closeLen, "");
					currentDoc = this.sotEditor.getDoc();
					rightRun = Math.max(0, rightRun - closeLen);
				} else {
					mergeRight = false;
				}
				if (mergeRight) {
					insertClose = "";
				}
			}
			if (!mergeRight && rightRun + insertClose.length > maxRun) {
				return;
			}
			doc = currentDoc;
		}

		const content = doc.slice(start, end);
		this.sotEditor.replaceRange(
			start,
			end,
			`${insertOpen}${content}${insertClose}`,
		);
		const nextFrom = start + insertOpen.length;
		const nextTo = nextFrom + content.length;
		if (forward) {
			this.setSelectionNormalized(nextFrom, nextTo);
		} else {
			this.setSelectionNormalized(nextTo, nextFrom);
		}
		this.focusInputSurface(true);
	}

	private applyTextChangesWithSelection(
		changes: { from: number; to: number; insert: string }[],
		anchor: number,
		head: number,
	): { anchor: number; head: number } {
		if (!this.sotEditor) return { anchor, head };
		const sorted = changes.slice().sort((a, b) => b.from - a.from);
		let nextAnchor = anchor;
		let nextHead = head;
		for (const change of sorted) {
			const delta = change.insert.length - (change.to - change.from);
			this.sotEditor.replaceRange(change.from, change.to, change.insert);
			const adjust = (pos: number): number => {
				if (pos > change.to) return pos + delta;
				if (pos >= change.from)
					return change.from + change.insert.length;
				return pos;
			};
			nextAnchor = adjust(nextAnchor);
			nextHead = adjust(nextHead);
		}
		return { anchor: nextAnchor, head: nextHead };
	}

	private getOutlineItems(): {
		line: number;
		level: number;
		text: string;
		offset: number;
	}[] {
		if (!this.sotEditor) return [];
		const doc = this.sotEditor.getDoc();
		const lines = doc.split("\n");
		const ranges =
			this.lineRanges.length === lines.length
				? this.lineRanges
				: this.computeLineRangesFromLines(lines);
		const items: {
			line: number;
			level: number;
			text: string;
			offset: number;
		}[] = [];
		for (let i = 0; i < lines.length; i += 1) {
			if (this.lineBlockKinds[i] !== "normal") continue;
			const info = parseHeadingLine(lines[i] ?? "");
			if (!info.hasHeading) continue;
			const text =
				info.content.length > 0 ? info.content : t("outline.untitledHeading");
			const offset = ranges[i]?.from ?? 0;
			items.push({ line: i, level: info.level, text, offset });
		}
		return items;
	}

	private getHeadingLevel(): number {
		if (!this.sotEditor) return 0;
		const selection = this.sotEditor.getSelection();
		const lineIndex = this.findLineIndex(selection.head);
		if (lineIndex === null) return 0;
		if (this.lineBlockKinds[lineIndex] !== "normal") return 0;
		const range = this.lineRanges[lineIndex];
		if (!range) return 0;
		const lineText = this.sotEditor.getDoc().slice(range.from, range.to);
		const info = parseHeadingLine(lineText);
		return info.level;
	}

	private clearHeading(): void {
		this.setHeading(0);
	}

	private getListKindAtSelection(): "none" | "bullet" | "ordered" | "task" {
		if (!this.sotEditor) return "none";
		const selection = this.sotEditor.getSelection();
		const lineIndex = this.findLineIndex(selection.head);
		if (lineIndex === null) return "none";
		if (this.isLineInSourceMode(lineIndex)) return "none";
		if (this.lineBlockKinds[lineIndex] !== "normal") return "none";
		const range = this.lineRanges[lineIndex];
		if (!range) return "none";
		const lineText = this.sotEditor.getDoc().slice(range.from, range.to);
		const info = parseListLine(lineText);
		return info.kind;
	}

	private isBlockquoteActive(): boolean {
		if (!this.sotEditor) return false;
		const selection = this.sotEditor.getSelection();
		const lineIndex = this.findLineIndex(selection.head);
		if (lineIndex === null) return false;
		if (this.isLineInSourceMode(lineIndex)) return false;
		if (this.lineBlockKinds[lineIndex] !== "normal") return false;
		const range = this.lineRanges[lineIndex];
		if (!range) return false;
		const lineText = this.sotEditor.getDoc().slice(range.from, range.to);
		return isBlockquoteLine(lineText);
	}

	private isCodeBlockActive(): boolean {
		if (!this.sotEditor) return false;
		const selection = this.sotEditor.getSelection();
		const lineIndex = this.findLineIndex(selection.head);
		if (lineIndex === null) return false;
		const kind = this.lineBlockKinds[lineIndex] ?? "normal";
		return kind === "code" || kind === "code-fence";
	}

	private isBulletListActive(): boolean {
		return this.getListKindAtSelection() === "bullet";
	}

	private isTaskListActive(): boolean {
		return this.getListKindAtSelection() === "task";
	}

	private isOrderedListActive(): boolean {
		return this.getListKindAtSelection() === "ordered";
	}

	private setHeading(level: number): void {
		if (!this.sotEditor) return;
		const normalizedLevel = Math.max(0, Math.min(level, 6));
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const startLine = this.findLineIndex(from);
		let endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return;
		const endRange = this.lineRanges[endLine];
		if (endRange && to === endRange.from && to > from) {
			endLine = Math.max(startLine, endLine - 1);
		}
		const doc = this.sotEditor.getDoc();

		const targets: Array<{
			index: number;
			range: LineRange;
			lineText: string;
			info: {
				prefix: string;
				content: string;
				level: number;
				hasHeading: boolean;
			};
		}> = [];

		for (let i = startLine; i <= endLine; i += 1) {
			if (this.lineBlockKinds[i] !== "normal") continue;
			const range = this.lineRanges[i];
			if (!range) continue;
			const lineText = doc.slice(range.from, range.to);
			const info = parseHeadingLine(lineText);
			targets.push({ index: i, range, lineText, info });
		}

		if (targets.length === 0) return;

		const shouldClear =
			normalizedLevel === 0 ||
			targets.every(
				(item) =>
					item.info.hasHeading && item.info.level === normalizedLevel,
			);

		const changes: { from: number; to: number; insert: string }[] = [];
		for (const item of targets) {
			const { range, lineText, info } = item;
			let nextText = lineText;
			if (shouldClear) {
				if (info.hasHeading) {
					nextText = `${info.prefix}${info.content}`;
				} else {
					continue;
				}
			} else {
				const content = info.content.replace(/^[ \t]+/, "");
				nextText = `${info.prefix}${"#".repeat(
					normalizedLevel,
				)} ${content}`;
			}
			if (nextText !== lineText) {
				changes.push({
					from: range.from,
					to: range.to,
					insert: nextText,
				});
			}
		}

		if (changes.length === 0) return;

		this.updatePendingText("", true);
		this.immediateRender = true;
		const nextSelection = this.applyTextChangesWithSelection(
			changes,
			selection.anchor,
			selection.head,
		);
		this.setSelectionNormalized(nextSelection.anchor, nextSelection.head);
		this.focusInputSurface(true);
	}

	private toggleList(kind: "bullet" | "ordered" | "task"): void {
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const startLine = this.findLineIndex(from);
		let endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return;
		const endRange = this.lineRanges[endLine];
		if (endRange && to === endRange.from && to > from) {
			endLine = Math.max(startLine, endLine - 1);
		}
		const doc = this.sotEditor.getDoc();

		const targets: Array<{
			range: LineRange;
			lineText: string;
			info: ListLineInfo;
		}> = [];

		for (let i = startLine; i <= endLine; i += 1) {
			if (this.lineBlockKinds[i] !== "normal") continue;
			if (this.isLineInSourceMode(i)) continue;
			const range = this.lineRanges[i];
			if (!range) continue;
			const lineText = doc.slice(range.from, range.to);
			const info = parseListLine(lineText);
			targets.push({ range, lineText, info });
		}

		if (targets.length === 0) return;

		const isTargetKind = (info: ListLineInfo) => {
			if (kind === "bullet") {
				return info.kind === "bullet";
			}
			if (kind === "task") {
				return info.kind === "task";
			}
			return info.kind === "ordered";
		};

		const shouldRemove = targets.every((item) => isTargetKind(item.info));
		const changes: { from: number; to: number; insert: string }[] = [];
		for (const item of targets) {
			const { range, lineText, info } = item;
			let nextText = lineText;
			if (shouldRemove) {
				if (!isTargetKind(info)) continue;
				nextText = `${info.prefix}${info.indent}${info.content}`;
			} else {
				const marker =
					kind === "bullet"
						? "- "
						: kind === "task"
							? "- [ ] "
							: "1. ";
				nextText = `${info.prefix}${info.indent}${marker}${info.content}`;
			}
			if (nextText !== lineText) {
				changes.push({
					from: range.from,
					to: range.to,
					insert: nextText,
				});
			}
		}

		if (changes.length === 0) return;
		this.updatePendingText("", true);
		this.immediateRender = true;
		const nextSelection = this.applyTextChangesWithSelection(
			changes,
			selection.anchor,
			selection.head,
		);
		this.setSelectionNormalized(nextSelection.anchor, nextSelection.head);
		this.focusInputSurface(true);
	}

	private toggleBlockquote(): void {
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const startLine = this.findLineIndex(from);
		let endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return;
		const endRange = this.lineRanges[endLine];
		if (endRange && to === endRange.from && to > from) {
			endLine = Math.max(startLine, endLine - 1);
		}
		const doc = this.sotEditor.getDoc();
		const targets: Array<{
			range: LineRange;
			lineText: string;
		}> = [];
		for (let i = startLine; i <= endLine; i += 1) {
			if (this.lineBlockKinds[i] !== "normal") continue;
			if (this.isLineInSourceMode(i)) continue;
			const range = this.lineRanges[i];
			if (!range) continue;
			const lineText = doc.slice(range.from, range.to);
			targets.push({ range, lineText });
		}

		if (targets.length === 0) return;
		const shouldRemove = targets.every((item) =>
			isBlockquoteLine(item.lineText),
		);
		const changes: { from: number; to: number; insert: string }[] = [];
		for (const item of targets) {
			const { range, lineText } = item;
			let nextText = lineText;
			if (shouldRemove) {
				const match = lineText.match(/^([ \t]{0,3})(> ?)(.*)$/);
				if (!match) continue;
				nextText = `${match[1] ?? ""}${match[3] ?? ""}`;
			} else {
				const match = lineText.match(/^([ \t]{0,3})(.*)$/);
				const indent = match?.[1] ?? "";
				const rest = match?.[2] ?? "";
				nextText = `${indent}> ${rest}`;
			}
			if (nextText !== lineText) {
				changes.push({
					from: range.from,
					to: range.to,
					insert: nextText,
				});
			}
		}

		if (changes.length === 0) return;
		this.updatePendingText("", true);
		this.immediateRender = true;
		const nextSelection = this.applyTextChangesWithSelection(
			changes,
			selection.anchor,
			selection.head,
		);
		this.setSelectionNormalized(nextSelection.anchor, nextSelection.head);
		this.focusInputSurface(true);
	}

	private getCodeBlockRangeForLine(
		lineIndex: number,
	): { start: number; end: number } | null {
		if (lineIndex < 0 || lineIndex >= this.lineBlockKinds.length) {
			return null;
		}
		const kind = this.lineBlockKinds[lineIndex] ?? "normal";
		if (kind !== "code" && kind !== "code-fence") return null;
		let start = lineIndex;
		while (start > 0) {
			const prevKind = this.lineBlockKinds[start - 1] ?? "normal";
			if (prevKind !== "code" && prevKind !== "code-fence") break;
			start -= 1;
		}
		let end = lineIndex;
		while (end + 1 < this.lineBlockKinds.length) {
			const nextKind = this.lineBlockKinds[end + 1] ?? "normal";
			if (nextKind !== "code" && nextKind !== "code-fence") break;
			end += 1;
		}
		return { start, end };
	}

	private getLineRemovalRange(
		lineIndex: number,
		doc: string,
	): HiddenRange | null {
		const range = this.lineRanges[lineIndex];
		if (!range) return null;
		let from = range.from;
		let to = range.to;
		if (to < doc.length && doc[to] === "\n") {
			to += 1;
		} else if (from > 0 && doc[from - 1] === "\n") {
			from -= 1;
		}
		if (to <= from) return null;
		return { from, to };
	}

	private toggleCodeBlock(): void {
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const startLine = this.findLineIndex(from);
		let endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return;
		const endRange = this.lineRanges[endLine];
		if (endRange && to === endRange.from && to > from) {
			endLine = Math.max(startLine, endLine - 1);
		}
		const doc = this.sotEditor.getDoc();

		let allInCode = true;
		for (let i = startLine; i <= endLine; i += 1) {
			const kind = this.lineBlockKinds[i] ?? "normal";
			if (kind !== "code" && kind !== "code-fence") {
				allInCode = false;
				break;
			}
		}

		const changes: { from: number; to: number; insert: string }[] = [];
		if (allInCode) {
			let i = startLine;
			while (i <= endLine) {
				const block = this.getCodeBlockRangeForLine(i);
				if (!block) {
					i += 1;
					continue;
				}
				if (block.end < startLine) {
					i = block.end + 1;
					continue;
				}
				const startKind = this.lineBlockKinds[block.start] ?? "normal";
				const endKind = this.lineBlockKinds[block.end] ?? "normal";
				if (startKind === "code-fence") {
					const removal = this.getLineRemovalRange(block.start, doc);
					if (removal) {
						changes.push({ ...removal, insert: "" });
					}
				}
				if (block.end !== block.start && endKind === "code-fence") {
					const removal = this.getLineRemovalRange(block.end, doc);
					if (removal) {
						changes.push({ ...removal, insert: "" });
					}
				}
				i = block.end + 1;
			}
		} else {
			const startRange = this.lineRanges[startLine];
			const endRangeLine = this.lineRanges[endLine];
			if (!startRange || !endRangeLine) return;
			changes.push({
				from: startRange.from,
				to: startRange.from,
				insert: "```\n",
			});
			changes.push({
				from: endRangeLine.to,
				to: endRangeLine.to,
				insert: "\n```",
			});
		}

		if (changes.length === 0) return;
		this.updatePendingText("", true);
		this.immediateRender = true;
		const nextSelection = this.applyTextChangesWithSelection(
			changes,
			selection.anchor,
			selection.head,
		);
		this.setSelectionNormalized(nextSelection.anchor, nextSelection.head);
		this.focusInputSurface(true);
	}

	private insertLink(): void {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const selection = getPlainEditSelectionRange(
				this.plainEditOverlayEl,
			);
			const selectedText = selection.text ?? "";
			new LinkInputModal(
				this.app,
				selectedText,
				(result: LinkInputResult) => {
					if (result.cancelled || !result.url) {
						return;
					}
					const displayText =
						result.text && result.text.trim().length > 0
							? result.text
							: selectedText || result.url;
					if (!displayText) return;
					insertPlainEditLink(
						this.plainEditOverlayEl!,
						displayText,
						result.url,
						() => this.adjustPlainEditOverlaySize(),
					);
				},
			).open();
			return;
		}
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const forward = selection.head >= selection.anchor;
		const selectedText = this.sotEditor.getDoc().slice(from, to);

		new LinkInputModal(
			this.app,
			selectedText,
			(result: LinkInputResult) => {
				if (result.cancelled || !result.url) {
					return;
				}
				const displayText =
					result.text && result.text.trim().length > 0
						? result.text
						: selectedText || result.url;
				if (!displayText) return;

				this.updatePendingText("", true);
				this.immediateRender = true;
				const linkText = `[${displayText}](${result.url})`;
				this.runCeMutation(() => {
					this.sotEditor?.replaceRange(from, to, linkText);
				});

				const nextFrom = from + 1;
				const nextTo = nextFrom + displayText.length;
				if (forward) {
					this.setSelectionNormalized(nextFrom, nextTo);
				} else {
					this.setSelectionNormalized(nextTo, nextFrom);
				}
				this.focusInputSurface(true);
			},
		).open();
	}

	private findRubyMatchForSelection(
		lineFrom: number,
		lineTo: number,
		selectionFrom: number,
		selectionTo: number,
		lineText: string,
	): { rangeFrom: number; rangeTo: number; baseText: string } | null {
		const regex = createAozoraRubyRegExp();
		for (const match of lineText.matchAll(regex)) {
			const full = match[0] ?? "";
			const start = match.index ?? -1;
			if (!full || start < 0) continue;
			const openIndex = full.indexOf("《");
			const closeIndex = full.lastIndexOf("》");
			if (openIndex < 0 || closeIndex <= openIndex) continue;

			const hasDelimiter = full.startsWith("|") || full.startsWith("｜");
			const baseStartRel = hasDelimiter ? 1 : 0;
			const baseEndRel = openIndex;
			const baseText = full.slice(baseStartRel, baseEndRel);
			if (!baseText) continue;

			const absBaseFrom = lineFrom + start + baseStartRel;
			const absBaseTo = lineFrom + start + baseEndRel;
			if (absBaseFrom >= absBaseTo) continue;
			if (absBaseFrom < lineFrom || absBaseTo > lineTo) continue;

			const intersects =
				selectionTo > absBaseFrom && selectionFrom < absBaseTo;
			if (!intersects) continue;

			const rangeFrom = lineFrom + start;
			const rangeTo = lineFrom + start + full.length;
			return { rangeFrom, rangeTo, baseText };
		}
		return null;
	}

	private buildAozoraRubyText(
		baseText: string,
		ruby: string,
		isDot: boolean,
	): string {
		if (isDot) {
			const emphasisChar = ruby.trim() || "・";
			return Array.from(baseText)
				.map((char) => `｜${char}《${emphasisChar}》`)
				.join("");
		}
		return `｜${baseText}《${ruby}》`;
	}

	private getCustomEmphasisChars(): string[] {
		return this.plugin.settings.wysiwyg.customEmphasisChars ?? [];
	}

	private normalizeCustomEmphasisChars(chars: string[]): string[] {
		if (!Array.isArray(chars)) return [];
		const normalized: string[] = [];
		const seen = new Set<string>();
		for (const entry of chars) {
			if (typeof entry !== "string") continue;
			const trimmed = entry.trim();
			if (!trimmed) continue;
			const first = Array.from(trimmed)[0] ?? "";
			if (!first || seen.has(first)) continue;
			seen.add(first);
			normalized.push(first);
			if (normalized.length >= 20) break;
		}
		return normalized;
	}

	private async saveCustomEmphasisChars(chars: string[]): Promise<void> {
		const normalized = this.normalizeCustomEmphasisChars(chars);
		const current = this.getCustomEmphasisChars();
		if (
			current.length === normalized.length &&
			current.every((char, index) => char === normalized[index])
		) {
			return;
		}
		try {
			await this.plugin.updateSettings({
				wysiwyg: {
					...this.plugin.settings.wysiwyg,
					customEmphasisChars: normalized,
				},
			});
		} catch (error) {
			console.error("[Tategaki SoT] Failed to save custom emphasis chars", error);
			new Notice(t("notice.customEmphasis.saveFailed"), 2500);
		}
	}

	private insertTcy(): void {
		runInsertTcyCommand(this);
	}

	private toggleTcy(): void {
		runToggleTcyCommand(this);
	}

	private isTcyActive(): boolean {
		return isTcySelectionActive(this);
	}

	private clearTcy(): void {
		runClearTcyCommand(this);
	}

	private insertRuby(): void {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const selection = getPlainEditSelectionRange(
				this.plainEditOverlayEl,
			);
			const selectedText = selection.text ?? "";
			if (!selectedText || selectedText.trim() === "") {
				return;
			}
			if (selectedText.includes("\n")) {
				new Notice(t("notice.ruby.singleLineOnly"), 2000);
				return;
			}
			new RubyInputModal(
				this.app,
				selectedText,
				(result: RubyInputResult) => {
					if (result.cancelled) {
						return;
					}
					insertPlainEditRuby(
						this.plainEditOverlayEl!,
						selectedText,
						result.ruby ?? "",
						result.isDot,
						(body, rubyText, isDot) =>
							this.buildAozoraRubyText(body, rubyText, isDot),
						() => this.adjustPlainEditOverlaySize(),
					);
				},
				{
					customEmphasisChars: this.getCustomEmphasisChars(),
					onCustomEmphasisCharsChange: (chars) => {
						void this.saveCustomEmphasisChars(chars);
					},
					contentFontFamily:
						this.plugin.settings.common.fontFamily ?? "",
				},
			).open();
			return;
		}
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		if (from === to) return;

		const doc = this.sotEditor.getDoc();
		const originalSelectedText = doc.slice(from, to);
		if (!originalSelectedText || originalSelectedText.trim() === "") {
			return;
		}
		if (originalSelectedText.includes("\n")) {
			new Notice(t("notice.ruby.singleLineOnly"), 2000);
			return;
		}

		let rangeFrom = from;
		let rangeTo = to;
		let hasRubyNode = false;
		let rubyBaseText = "";

		const lineIndex = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (lineIndex !== null && endLine === lineIndex) {
			const lineRange = this.lineRanges[lineIndex];
			if (lineRange) {
				const lineText = doc.slice(lineRange.from, lineRange.to);
				const match = this.findRubyMatchForSelection(
					lineRange.from,
					lineRange.to,
					from,
					to,
					lineText,
				);
				if (match) {
					hasRubyNode = true;
					rangeFrom = match.rangeFrom;
					rangeTo = match.rangeTo;
					rubyBaseText = match.baseText;
				}
			}
		}

		const displayText = hasRubyNode ? rubyBaseText : originalSelectedText;

		new RubyInputModal(
			this.app,
			displayText,
			(result: RubyInputResult) => {
				if (result.cancelled) {
					return;
				}

				if (!result.ruby || result.ruby.trim() === "") {
					if (!hasRubyNode) return;
					this.updatePendingText("", true);
					this.immediateRender = true;
					const restored = hasRubyNode
						? rubyBaseText
						: originalSelectedText;
					this.runCeMutation(() => {
						this.sotEditor?.replaceRange(rangeFrom, rangeTo, restored);
					});
					const nextPos = rangeFrom + restored.length;
					this.setSelectionNormalized(nextPos, nextPos);
					this.focusInputSurface(true);
					return;
				}

				const insertText = this.buildAozoraRubyText(
					displayText,
					result.ruby,
					result.isDot,
				);
				this.updatePendingText("", true);
				this.immediateRender = true;
				this.runCeMutation(() => {
					this.sotEditor?.replaceRange(rangeFrom, rangeTo, insertText);
				});

				const nextPos = rangeFrom + insertText.length;
				this.setSelectionNormalized(nextPos, nextPos);
				this.focusInputSurface(true);
			},
			{
				customEmphasisChars: this.getCustomEmphasisChars(),
				onCustomEmphasisCharsChange: (chars) => {
					void this.saveCustomEmphasisChars(chars);
				},
				contentFontFamily: this.plugin.settings.common.fontFamily ?? "",
			},
		).open();
	}

	private insertHorizontalRule(): void {
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const forward = selection.head >= selection.anchor;
		const insert = from === to ? "\n---\n" : "---";

		this.updatePendingText("", true);
		this.immediateRender = true;
		this.sotEditor.replaceRange(from, to, insert);

		const nextPos = from + insert.length;
		if (forward) {
			this.setSelectionNormalized(nextPos, nextPos);
		} else {
			this.setSelectionNormalized(nextPos, nextPos);
		}
		this.focusInputSurface(true);
	}

	private async toggleRubyVisibility(): Promise<void> {
		const current = this.plugin.settings.wysiwyg?.enableRuby !== false;
		const next = !current;
		try {
			await this.plugin.updateSettings({
				wysiwyg: {
					...this.plugin.settings.wysiwyg,
					enableRuby: next,
				},
			});
			new Notice(
				next
					? t("notice.ruby.enabled")
					: t("notice.ruby.disabled"),
				1800,
			);
		} catch (error) {
			console.error("[Tategaki SoT] Failed to toggle ruby", error);
			new Notice(t("notice.ruby.toggleFailed"), 2500);
		}
	}

	private ensureRecentFilePathsInitialized(): void {
		this.workspaceController.ensureRecentFilePathsInitialized();
	}

	private pushRecentFilePath(path: string, preferFront = true): void {
		this.workspaceController.pushRecentFilePath(path, preferFront);
	}

	private recordRecentFile(file: TFile | null): void {
		this.workspaceController.recordRecentFile(file);
	}

	private buildFileSwitchItems(): TFile[] {
		return this.workspaceController.buildFileSwitchItems();
	}

	private openFileSwitcher(): void {
		this.workspaceController.openFileSwitcher();
	}

	private openNewNoteModal(initialValue = ""): void {
		this.workspaceController.openNewNoteModal(initialValue);
	}

	private async createNewNote(
		name: string,
		baseFolder: string,
	): Promise<void> {
		await this.workspaceController.createNewNote(name, baseFolder);
	}

	private async toggleReadingMode(): Promise<void> {
		const file = this.currentFile;
		if (!file) {
			new Notice(t("notice.targetFileNotFound"), 2500);
			return;
		}
		const opened = await this.plugin.modeManager.toggleReadingView(file, {
			targetLeaf: this.leaf,
			returnViewMode: "sot",
		});
		new Notice(
			opened
				? t("notice.bookMode.opened")
				: t("notice.bookMode.closed"),
			2000,
		);
	}

	private async switchToFile(file: TFile): Promise<void> {
		await this.workspaceController.switchToFile(file);
	}

	private openSettingsPanel(): void {
		const modal = new SettingsPanelModal(
			this.app,
			this.plugin,
			async (newSettings) => {
				await this.plugin.updateSettings(newSettings);
			},
		);
		modal.open();
	}

	private async activateMarkdownLeafForCommand(): Promise<MarkdownView | null> {
		if (!this.currentFile) {
			new Notice(t("notice.targetFileNotFoundAlt"), 2500);
			return null;
		}
		const markdownView = await this.ensureMarkdownViewForFile(
			this.currentFile,
		);
		if (!markdownView || !this.pairedMarkdownLeaf) {
			new Notice(t("notice.markdownViewMissingExecute"), 2500);
			return null;
		}
		this.app.workspace.setActiveLeaf(this.pairedMarkdownLeaf, {
			focus: true,
		});
		markdownView.editor?.focus();
		return markdownView;
	}

	private openOutline(): void {
		if (!this.outlinePanel) {
			new Notice(t("notice.outline.openFailed"), 2000);
			return;
		}
		this.outlinePanel.toggle();
	}

	private isInlineStyleActive(className: InlineStyleClass): boolean {
		if (!this.sotEditor) return false;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const docLength = this.sotEditor.getDoc().length;
		const safeFrom = Math.max(0, Math.min(from, docLength));
		const safeTo = Math.max(0, Math.min(to, docLength));

		if (safeFrom === safeTo) {
			const lineIndex = this.findLineIndex(safeFrom);
			if (lineIndex === null) return false;
			const range = this.lineRanges[lineIndex];
			if (!range) return false;
			const segments = this.buildSegmentsForLine(range.from, range.to);
			for (const segment of segments) {
				if (
					safeFrom >= segment.from &&
					safeFrom <= segment.to &&
					segment.classNames.includes(className)
				) {
					return true;
				}
			}
			return false;
		}

		const startLine = this.findLineIndex(safeFrom);
		const endLine = this.findLineIndex(safeTo);
		if (startLine === null || endLine === null) return false;

		for (let i = startLine; i <= endLine; i += 1) {
			const range = this.lineRanges[i];
			if (!range) continue;
			const lineFrom = Math.max(range.from, safeFrom);
			const lineTo = Math.min(range.to, safeTo);
			const segments = this.buildSegmentsForLine(range.from, range.to);
			for (const segment of segments) {
				if (!segment.classNames.includes(className)) continue;
				if (segment.to <= lineFrom || segment.from >= lineTo) continue;
				return true;
			}
		}
		return false;
	}

	private stripInlineStyleInSelection(
		from: number,
		to: number,
		className: InlineStyleClass,
		pairs: { open: string; close: string }[],
	): {
		from: number;
		to: number;
		removedOnly: boolean;
		removedAny: boolean;
		hadStyled: boolean;
	} {
		if (!this.sotEditor)
			return {
				from,
				to,
				removedOnly: false,
				removedAny: false,
				hadStyled: false,
			};
		const doc = this.sotEditor.getDoc();
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) {
			return {
				from,
				to,
				removedOnly: false,
				removedAny: false,
				hadStyled: false,
			};
		}
		const markerExact = pairs.some((pair) => {
			const openLen = pair.open.length;
			const closeLen = pair.close.length;
			if (from < openLen || to + closeLen > doc.length) {
				return false;
			}
			return (
				doc.slice(from - openLen, from) === pair.open &&
				doc.slice(to, to + closeLen) === pair.close
			);
		});
		const removals: HiddenRange[] = [];
		let hasStyled = false;
		let hasUnstyled = false;
		let minStyled = Number.POSITIVE_INFINITY;
		let maxStyled = Number.NEGATIVE_INFINITY;
		this.collectInlineStyleRemovalsBySyntaxNode(
			from,
			to,
			className,
			pairs,
			doc,
			removals,
		);

		for (let i = startLine; i <= endLine; i += 1) {
			const range = this.lineRanges[i];
			if (!range) continue;
			const segments = this.buildSegmentsForLine(range.from, range.to);
			let current: HiddenRange | null = null;
			for (const segment of segments) {
				const segFrom = Math.max(segment.from, from);
				const segTo = Math.min(segment.to, to);
				if (segTo <= segFrom) continue;
				if (segment.classNames.includes(className)) {
					hasStyled = true;
					minStyled = Math.min(minStyled, segFrom);
					maxStyled = Math.max(maxStyled, segTo);
					if (current && segment.from <= current.to) {
						current.to = Math.max(current.to, segment.to);
					} else {
						if (current) {
							if (current.to > from && current.from < to) {
								this.collectInlineStyleRemoval(
									doc,
									current,
									pairs,
									removals,
									className,
								);
							}
						}
						current = { from: segment.from, to: segment.to };
					}
				} else {
					hasUnstyled = true;
				}
			}
			if (current && current.to > from && current.from < to) {
				this.collectInlineStyleRemoval(
					doc,
					current,
					pairs,
					removals,
					className,
				);
			}
		}

		if (removals.length === 0) {
			return {
				from,
				to,
				removedOnly: false,
				removedAny: false,
				hadStyled: hasStyled,
			};
		}

		const merged = this.mergeRanges(removals).sort(
			(a, b) => b.from - a.from,
		);
		let nextFrom = from;
		let nextTo = to;
		for (const removal of merged) {
			const len = removal.to - removal.from;
			this.sotEditor.replaceRange(removal.from, removal.to, "");
			if (removal.to <= nextFrom) {
				nextFrom -= len;
				nextTo -= len;
			} else if (removal.to <= nextTo) {
				nextTo -= len;
			}
		}
		const fullyStyled =
			markerExact ||
			(hasStyled &&
				!hasUnstyled &&
				minStyled === from &&
				maxStyled === to);
		return {
			from: nextFrom,
			to: nextTo,
			removedOnly: fullyStyled,
			removedAny: true,
			hadStyled: hasStyled,
		};
	}

	private isInlineStyleNodeTargetForRemoval(
		name: string,
		className: InlineStyleClass,
		doc: string,
		nodeFrom: number,
		nodeTo: number,
	): boolean {
		const mapped = this.isInlineStyleNode(name);
		if (mapped === className) {
			return true;
		}
		if (className !== "tategaki-md-em" || name !== "StrongEmphasis") {
			return false;
		}
		if (nodeTo - nodeFrom < 6) {
			return false;
		}
		const open3 = doc.slice(nodeFrom, nodeFrom + 3);
		const close3 = doc.slice(nodeTo - 3, nodeTo);
		return (
			(open3 === "***" && close3 === "***") ||
			(open3 === "___" && close3 === "___")
		);
	}

	private collectInlineStyleRemovalsBySyntaxNode(
		from: number,
		to: number,
		className: InlineStyleClass,
		pairs: { open: string; close: string }[],
		doc: string,
		removals: HiddenRange[],
	): void {
		if (className === "tategaki-md-code") {
			return;
		}
		const view = this.getEditorViewForSyntax();
		if (!view) {
			return;
		}
		try {
			syntaxTree(view.state).iterate({
				from,
				to,
				enter: (node) => {
					if (
						node.to <= from ||
						node.from >= to ||
						node.to <= node.from
					) {
						return;
					}
					if (
						!this.isInlineStyleNodeTargetForRemoval(
							node.type.name,
							className,
							doc,
							node.from,
							node.to,
						)
					) {
						return;
					}
					for (const pair of pairs) {
						const openLen = pair.open.length;
						const closeLen = pair.close.length;
						if (
							openLen <= 0 ||
							closeLen <= 0 ||
							node.from + openLen > node.to - closeLen
						) {
							continue;
						}
						if (
							doc.slice(node.from, node.from + openLen) !== pair.open ||
							doc.slice(node.to - closeLen, node.to) !== pair.close
						) {
							continue;
						}
						removals.push({
							from: node.from,
							to: node.from + openLen,
						});
						removals.push({
							from: node.to - closeLen,
							to: node.to,
						});
						return;
					}
				},
			});
		} catch (_) {
			// noop: syntaxTree解析失敗時は既存のセグメント境界推定にフォールバック
		}
	}

	private collectInlineStyleRemovalsForRange(
		from: number,
		to: number,
		className: InlineStyleClass,
		pairs: { open: string; close: string }[],
		doc: string,
		removals: HiddenRange[],
	): void {
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return;

		for (let i = startLine; i <= endLine; i += 1) {
			const range = this.lineRanges[i];
			if (!range) continue;
			const segments = this.buildSegmentsForLine(range.from, range.to);
			let current: HiddenRange | null = null;
			for (const segment of segments) {
				const segFrom = Math.max(segment.from, from);
				const segTo = Math.min(segment.to, to);
				if (segTo <= segFrom) continue;
				if (segment.classNames.includes(className)) {
					if (current && segment.from <= current.to) {
						current.to = Math.max(current.to, segment.to);
					} else {
						if (current && current.to > from && current.from < to) {
							this.collectInlineStyleRemoval(
								doc,
								current,
								pairs,
								removals,
								className,
							);
						}
						current = { from: segment.from, to: segment.to };
					}
				}
			}
			if (current && current.to > from && current.from < to) {
				this.collectInlineStyleRemoval(
					doc,
					current,
					pairs,
					removals,
					className,
				);
			}
		}
	}

	private collectInlineStyleRemoval(
		doc: string,
		range: HiddenRange,
		pairs: { open: string; close: string }[],
		removals: HiddenRange[],
		className?: InlineStyleClass,
	): void {
		for (const pair of pairs) {
			const openLen = pair.open.length;
			const closeLen = pair.close.length;
			if (range.from < openLen || range.to + closeLen > doc.length) {
				continue;
			}
			if (
				doc.slice(range.from - openLen, range.from) === pair.open &&
				doc.slice(range.to, range.to + closeLen) === pair.close
			) {
				removals.push({
					from: range.from - openLen,
					to: range.from,
				});
				removals.push({
					from: range.to,
					to: range.to + closeLen,
				});
				return;
			}
		}
		if (className === "tategaki-md-code") {
			const leftRun = this.countMarkerRun(doc, range.from - 1, -1, "`");
			const rightRun = this.countMarkerRun(doc, range.to, 1, "`");
			const runLen = Math.min(leftRun, rightRun);
			if (runLen > 0) {
				removals.push({
					from: range.from - runLen,
					to: range.from,
				});
				removals.push({
					from: range.to,
					to: range.to + runLen,
				});
			}
		}
	}

	private resolveInlineMarkerPair(
		doc: string,
		from: number,
		to: number,
		pairs: { open: string; close: string }[],
	): { open: string; close: string } | null {
		for (const pair of pairs) {
			const openLen = pair.open.length;
			if (
				from >= openLen &&
				doc.slice(from - openLen, from) === pair.open
			) {
				return pair;
			}
		}
		for (const pair of pairs) {
			const closeLen = pair.close.length;
			if (
				to + closeLen <= doc.length &&
				doc.slice(to, to + closeLen) === pair.close
			) {
				return pair;
			}
		}
		return null;
	}

	private hasInlineClassBefore(
		offset: number,
		className: InlineStyleClass,
	): boolean {
		const segment = this.findSegmentBefore(offset);
		return segment?.classNames.includes(className) ?? false;
	}

	private hasInlineClassAfter(
		offset: number,
		className: InlineStyleClass,
	): boolean {
		const segment = this.findSegmentAfter(offset);
		return segment?.classNames.includes(className) ?? false;
	}

	private findSegmentBefore(offset: number): RenderSegment | null {
		if (!this.sotEditor || this.lineRanges.length === 0) return null;
		const docLength = this.sotEditor.getDoc().length;
		const safeOffset = Math.max(0, Math.min(offset, docLength));
		let lineIndex = this.findLineIndex(safeOffset);
		if (lineIndex === null) {
			lineIndex = this.lineRanges.length - 1;
		}
		for (let i = lineIndex; i >= 0; i -= 1) {
			const range = this.lineRanges[i];
			if (!range) continue;
			const segments = this.buildSegmentsForLine(range.from, range.to);
			if (segments.length === 0) continue;
			if (i === lineIndex) {
				for (let s = segments.length - 1; s >= 0; s -= 1) {
					const seg = segments[s]!;
					if (seg.to <= safeOffset) {
						return seg;
					}
				}
			} else {
				return segments[segments.length - 1] ?? null;
			}
		}
		return null;
	}

	private findSegmentAfter(offset: number): RenderSegment | null {
		if (!this.sotEditor || this.lineRanges.length === 0) return null;
		const docLength = this.sotEditor.getDoc().length;
		const safeOffset = Math.max(0, Math.min(offset, docLength));
		let lineIndex = this.findLineIndex(safeOffset);
		if (lineIndex === null) {
			lineIndex = 0;
		}
		for (let i = lineIndex; i < this.lineRanges.length; i += 1) {
			const range = this.lineRanges[i];
			if (!range) continue;
			const segments = this.buildSegmentsForLine(range.from, range.to);
			if (segments.length === 0) continue;
			if (i === lineIndex) {
				for (const seg of segments) {
					if (seg.to > safeOffset) {
						return seg;
					}
				}
			} else {
				return segments[0] ?? null;
			}
		}
		return null;
	}

	private getMarkerRunLimit(markerChar: string): number {
		switch (markerChar) {
			case "*":
			case "_":
				return 3;
			case "=":
				return 2;
			case "`":
				return 1;
			case "~":
				return 2;
			default:
				return markerChar.length;
		}
	}

	private countMarkerRun(
		doc: string,
		startIndex: number,
		step: number,
		markerChar: string,
	): number {
		if (!markerChar) return 0;
		let count = 0;
		let index = startIndex;
		while (index >= 0 && index < doc.length) {
			if (doc[index] !== markerChar) break;
			count += 1;
			index += step;
		}
		return count;
	}

	private toggleSourceMode(): void {
		if (this.plainTextViewEnabled) {
			new Notice(
				t("notice.sourceEdit.unavailableInPlainText"),
				2500,
			);
			return;
		}
		if (this.sourceModeEnabled) {
			this.disablePlainEditMode();
			return;
		}
		this.enablePlainEditMode();
	}

	private updateSourceToggleUi(): void {
		this.commandToolbar?.update();
	}

	private enablePlainEditMode(): void {
		if (this.sourceModeEnabled) return;
		this.sourceModeEnabled = true;
		this.syncNativeSelectionDataset();
		this.sourceModeLineStart = null;
		this.sourceModeLineEnd = null;
		if (this.ceImeMode) {
			this.setCeImeMode(false);
		}
		this.overlayTextarea?.setActive(false);
		this.updatePendingText("", true);
		this.selectionLayerEl?.replaceChildren();
		if (this.caretEl) {
			this.caretEl.style.display = "none";
		}
		this.ensurePlainEditOverlay();
		this.registerPlainEditOutsidePointerHandler();
		this.startPlainEditFromSelection();
		this.updateSourceToggleUi();
	}

	private disablePlainEditMode(): void {
		if (!this.sourceModeEnabled) return;
		this.sourceModeEnabled = false;
		this.syncNativeSelectionDataset();
		this.commitPlainEdit(true, true);
		this.unregisterPlainEditOutsidePointerHandler();
		if (this.plainEditOverlayEl) {
			this.plainEditOverlayEl.style.display = "none";
		}
		this.overlayTextarea?.setActive(true);
		if (this.caretEl) {
			this.caretEl.style.display = "";
		}
		this.updateSourceToggleUi();
		this.scheduleCaretUpdate(true);
	}

	private ensurePlainEditOverlay(): void {
		this.plainEditController.ensureOverlay();
	}

	private destroyPlainEditOverlay(): void {
		this.plainEditController.destroyOverlay();
	}

	private adjustPlainEditOverlaySize(): void {
		this.plainEditController.adjustOverlaySize();
	}

	private handlePlainEditArrowKey(key: string): boolean {
		return this.plainEditController.handleArrowKey(key);
	}

	private handlePlainEditEnter(): boolean {
		return this.plainEditController.handleEnter();
	}

	private handlePlainEditBackspace(): boolean {
		return this.plainEditController.handleBackspace();
	}

	private handlePlainEditDelete(): boolean {
		return this.plainEditController.handleDelete();
	}

	private applyPlainEditRangeReplacement(
		from: number,
		to: number,
		text: string,
		nextPos: number,
	): void {
		this.plainEditController.applyRangeReplacement(from, to, text, nextPos);
	}

	private clearPlainEditTargets(): void {
		this.plainEditController.clearTargets();
	}

	private applyPlainEditTargetClass(
		lineEl: HTMLElement,
		lineIndex: number | null,
	): void {
		this.plainEditController.applyTargetClass(lineEl, lineIndex);
	}

	private applyPlainEditTargets(range: {
		startLine: number;
		endLine: number;
	}): void {
		this.plainEditController.applyTargets(range);
	}

	private getPlainEditRangeFromSelection(): {
		startLine: number;
		endLine: number;
		from: number;
		to: number;
		selectionStart: number;
		selectionEnd: number;
	} | null {
		return this.plainEditController.getRangeFromSelection();
	}

	private getPlainEditBlockLineRange(
		lineIndex: number,
	): { start: number; end: number } | null {
		return this.plainEditController.getBlockLineRange(lineIndex);
	}

	private updatePlainEditOverlayPosition(range: {
		startLine: number;
		endLine: number;
	}): void {
		this.plainEditController.updateOverlayPosition(range);
	}

	private startPlainEditFromSelection(): void {
		this.plainEditController.startFromSelection();
	}

	private commitPlainEdit(save: boolean, updateSelection: boolean): void {
		this.plainEditController.commit(save, updateSelection);
	}

	private registerPlainEditOutsidePointerHandler(): void {
		this.plainEditController.registerOutsidePointerHandler();
	}

	private unregisterPlainEditOutsidePointerHandler(): void {
		this.plainEditController.unregisterOutsidePointerHandler();
	}

	private toggleCeImeMode(): void {
		this.setCeImeMode(!this.ceImeMode);
	}

	private setCeImeMode(
		enabled: boolean,
		options: { suspend?: boolean } = {},
	): void {
		if (this.ceImeMode === enabled) return;
		if (enabled && this.sourceModeEnabled) {
			this.disablePlainEditMode();
		}
		if (!options.suspend) {
			this.ceImeSuspended = false;
		} else if (!enabled) {
			this.ceImeSuspended = true;
		}
		this.ceImeMode = enabled;
		if (enabled) {
			this.ensureCeTrailingNewline();
		} else if (!options.suspend) {
			this.cleanupCeTrailingNewline();
		}
		if (enabled) {
			if (this.lineModelRecomputeTimer !== null) {
				window.clearTimeout(this.lineModelRecomputeTimer);
				this.lineModelRecomputeTimer = null;
			}
			if (this.lineModelRecomputeIdle !== null) {
				const cancelIdle = (window as any).cancelIdleCallback as
					| ((handle: number) => void)
					| undefined;
				cancelIdle?.(this.lineModelRecomputeIdle);
				this.lineModelRecomputeIdle = null;
			}
		} else if (
			this.lineModelRecomputeStart !== null &&
			this.lineModelRecomputeEnd !== null
		) {
			this.scheduleLineModelRecompute(
				this.lineModelRecomputeStart,
				this.lineModelRecomputeEnd,
			);
		}
		if (this.derivedRootEl) {
			if (enabled) {
				this.derivedRootEl.setAttribute("data-ce-ime", "1");
			} else {
				this.derivedRootEl.removeAttribute("data-ce-ime");
			}
		}
		if (enabled) {
			this.ceImeFallbackActive = false;
			this.ceImeMappingFailureCount = 0;
			this.ceImeMappingFailureAt = 0;
		}
		this.ceImeComposing = false;
		this.ceImeSelectionSyncing = false;
		this.ceImeLastCompositionText = "";
		this.ceImeLastBeforeInputText = "";
		this.ceImeCompositionSelection = null;
		this.ceImeIgnoreNextInput = false;
		this.ceImeActiveComposeId = null;
		this.ceImeAppliedComposeId = 0;
		this.isPointerSelecting = false;
		this.pointerSelectAnchor = null;
		this.pointerSelectPointerId = null;
		this.autoScrollSelecting = false;
		this.autoScrollFast = false;
		this.softSelectionPointerLock = false;
		this.nativeSelectionAssistByAutoScroll = false;
		this.setNativeSelectionAssistActive(false, "setCeImeMode");
		if (this.derivedRootEl) {
			this.derivedRootEl.classList.remove("tategaki-fast-scroll");
		}
		this.updateSelectionOverlay();

		if (this.derivedContentEl) {
			this.derivedContentEl.contentEditable = enabled ? "true" : "false";
			this.derivedContentEl.spellcheck = false;
			this.derivedContentEl.setAttribute("autocapitalize", "off");
			this.derivedContentEl.setAttribute("autocomplete", "off");
			this.derivedContentEl.setAttribute("autocorrect", "off");
			if (!enabled) {
				this.derivedContentEl.style.removeProperty("caret-color");
			}
			if (enabled) {
				this.derivedContentEl.tabIndex = 0;
			}
			if (enabled) {
				this.applyCeEditableDefaults();
				this.updateCeEditableRangeFromSelection();
			} else {
				this.applyCeEditableDefaults();
			}
		}
		const shouldFocus = !options.suspend && this.isLeafActive();
		if (enabled) {
			this.overlayTextarea?.setActive(false);
			this.overlayFocused = false;
			this.updatePendingText("", true);
			this.selectionLayerEl?.replaceChildren();
			if (this.caretEl) {
				this.caretEl.style.display = "none";
			}
			this.syncSelectionToCe();
			if (this.derivedContentEl) {
				this.derivedContentEl
					.querySelectorAll(".tategaki-sot-line")
					.forEach((lineEl) =>
						this.applyCeNonEditableMarkers(lineEl as HTMLElement),
					);
			}
			if (shouldFocus) {
				this.focusInputSurface(true);
			}
		} else {
			this.overlayTextarea?.setActive(true);
			if (shouldFocus) {
				this.focusInputSurface(true);
			}
		}
		this.commandToolbar?.update();
		this.scheduleCaretUpdate(true);
	}

	private focusInputSurface(preventScroll = true): void {
		if (!this.isLeafActive()) return;
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			try {
				this.plainEditOverlayEl.focus({ preventScroll });
			} catch (_) {
				this.plainEditOverlayEl.focus();
			}
			return;
		}
		if (this.ceImeMode) {
			if (!this.derivedContentEl) return;
			if (!this.isLeafActive()) return;
			try {
				(this.derivedContentEl as any).focus({ preventScroll });
			} catch (_) {
				this.derivedContentEl.focus();
			}
			return;
		}
		this.overlayTextarea?.focus(preventScroll);
	}

	private focusOverlayAfterSelection(reason: string): void {
		void reason;
		if (!this.isNativeSelectionEnabled()) return;
		if (this.ceImeMode || this.sourceModeEnabled) return;
		if (this.overlayTextarea?.isFocused()) return;
		if (!this.sotEditor) return;
		this.suppressNativeSelectionCollapse = true;
		// 先にフォーカスして最初のキー入力を拾う
		this.focusInputSurface(true);
	}

	private maybeFocusOverlayAfterNativeSelectionPointerUp(): void {
		if (!this.nativeSelectionPendingFocus) return;
		this.nativeSelectionPendingFocus = false;
		if (!this.isNativeSelectionEnabled()) return;
		if (this.ceImeMode) return;
		if (this.sourceModeEnabled) return;
		if (!this.derivedContentEl) return;
		if (!this.isLeafActive()) return;

		const selection =
			this.derivedContentEl.ownerDocument.getSelection() ?? null;
		if (!this.isSelectionInsideDerivedContent(selection)) return;
		// ドラッグ範囲選択中は DOM 選択を維持したいので、textarea にフォーカスを移さない。
		if (selection && !selection.isCollapsed) {
			this.focusOverlayAfterSelection("pointerup-selection");
			return;
		}
		this.collapseSelectionAfterNativeCancel("pointerup");

		window.requestAnimationFrame(() => {
			// keydown 側で focus すると IME の最初のキーが composition に乗らないケースがあるため、
			// pointerup 後に focus して先回りする。
			this.focusInputSurface(true);
		});
	}

	private maybeHandleNativeSelectionWhitespaceClick(
		event: PointerEvent,
	): void {
		if (!this.isNativeSelectionEnabled()) return;
		if (this.ceImeMode) return;
		if (this.sourceModeEnabled) return;
		if (!this.nativeSelectionPendingClick) return;
		const pending = this.nativeSelectionPendingClick;
		this.nativeSelectionPendingClick = null;
		if (pending.pointerId !== event.pointerId) return;
		if (!pending.lineEl.isConnected) return;

		const contentEl = this.derivedContentEl;
		if (!contentEl) return;
		const selection = contentEl.ownerDocument.getSelection();
		if (!selection) return;
		if (!this.isSelectionInsideDerivedContent(selection)) return;
		if (!selection.isCollapsed) return;

		const lineFrom = Number.parseInt(
			pending.lineEl.dataset.from ?? "0",
			10,
		);
		const lineTo = Number.parseInt(pending.lineEl.dataset.to ?? "0", 10);
		if (!Number.isFinite(lineFrom) || !Number.isFinite(lineTo)) return;
		const lineLength = Math.max(0, lineTo - lineFrom);
		const localOffset = this.getLocalOffsetFromPoint(
			pending.lineEl,
			pending.clientX,
			pending.clientY,
			lineLength,
		);
		if (localOffset === null) return;
		if (localOffset !== lineLength) return;

		const absolute = lineFrom + localOffset;
		this.setSelectionNormalized(absolute, absolute);
		this.pendingCaretScroll = true;
		this.scheduleCaretUpdate(true);
	}

	private runCeMutation(action: () => void): void {
		if (!this.ceImeMode) {
			action();
			return;
		}
		this.ceImeApplying = true;
		this.markCeExternalSuppress();
		try {
			action();
		} finally {
			this.ceImeApplying = false;
		}
	}

	private markCeExternalSuppress(durationMs = 250): void {
		const until = Date.now() + durationMs;
		if (until > this.ceImeExternalSuppressUntil) {
			this.ceImeExternalSuppressUntil = until;
		}
	}

	private recordCeMappingFailure(reason: string, immediate = false): void {
		if (!this.ceImeMode || this.ceImeFallbackActive) return;
		const now = Date.now();
		if (now - this.ceImeMappingFailureAt > 1200) {
			this.ceImeMappingFailureCount = 0;
		}
		this.ceImeMappingFailureAt = now;
		this.ceImeMappingFailureCount += 1;
		if (immediate || this.ceImeMappingFailureCount >= 3) {
			this.ceImeFallbackActive = true;
			this.setCeImeMode(false);
			let label = reason;
			if (reason === "selection") {
				label = t("notice.ceIme.reason.selectionRestoreFailed");
			} else if (reason === "external") {
				label = t("notice.ceIme.reason.externalUpdated");
			} else if (reason === "verification") {
				label = t("notice.ceIme.reason.caretVerification");
			}
			new Notice(t("notice.ceIme.suspended", { reason: label }), 2500);
		}
	}

	private isSelectionInsideDerivedContent(
		selection: Selection | null,
	): boolean {
		if (!selection || !this.derivedContentEl) return false;
		const anchorNode = selection.anchorNode;
		const focusNode = selection.focusNode;
		if (!anchorNode || !focusNode) return false;
		const anchorEl =
			anchorNode instanceof Element
				? anchorNode
				: anchorNode.parentElement;
		const focusEl =
			focusNode instanceof Element ? focusNode : focusNode.parentElement;
		if (!anchorEl || !focusEl) return false;
		return (
			this.derivedContentEl.contains(anchorEl) &&
			this.derivedContentEl.contains(focusEl)
		);
	}

	private getLineElementForNode(node: Node | null): HTMLElement | null {
		if (!node || !this.derivedContentEl) return null;
		const element =
			node instanceof Element ? node : (node.parentElement ?? null);
		if (!element) return null;
		if (!this.derivedContentEl.contains(element)) return null;
		return element.closest(".tategaki-sot-line") as HTMLElement | null;
	}

	private syncSelectionFromCe(): { anchor: number; head: number } | null {
		if (this.ceImeMode && this.selectAllActive && this.sotEditor) {
			const docLength = this.sotEditor.getDoc().length;
			return { anchor: 0, head: docLength };
		}
		return this.ceSelectionSync?.syncSelectionFromCe() ?? null;
	}

	private syncSelectionToCe(): void {
		this.ceSelectionSync?.syncSelectionToCe();
	}

	private applyCeEditableDefaults(): void {
		if (!this.derivedContentEl) return;
		const children = Array.from(
			this.derivedContentEl.children,
		) as HTMLElement[];
		for (const child of children) {
			if (!child.classList.contains("tategaki-sot-line")) continue;
			child.setAttribute("contenteditable", "false");
		}
		this.ceEditableStart = null;
		this.ceEditableEnd = null;
	}

	private setCeEditableRange(startLine: number, endLine: number): void {
		if (!this.ceImeMode || !this.derivedContentEl) return;
		const safeStart = Math.max(0, Math.min(startLine, endLine));
		const safeEnd = Math.max(startLine, endLine);
		if (
			this.ceEditableStart === safeStart &&
			this.ceEditableEnd === safeEnd
		) {
			const startEl = this.getLineElement(safeStart);
			if (startEl) this.ensureLineRendered(startEl);
			const endEl =
				safeEnd !== safeStart ? this.getLineElement(safeEnd) : null;
			if (endEl) this.ensureLineRendered(endEl);
			return;
		}

		if (this.ceEditableStart !== null && this.ceEditableEnd !== null) {
			const oldStart = Math.max(
				0,
				Math.min(this.ceEditableStart, this.ceEditableEnd),
			);
			const oldEnd = Math.max(this.ceEditableStart, this.ceEditableEnd);
			for (let i = oldStart; i <= oldEnd; i += 1) {
				const lineEl = this.getLineElement(i);
				if (!lineEl) continue;
				lineEl.setAttribute("contenteditable", "false");
			}
		}

		for (let i = safeStart; i <= safeEnd; i += 1) {
			const lineEl = this.getLineElement(i);
			if (!lineEl) continue;
			this.ensureLineRendered(lineEl);
			lineEl.setAttribute("contenteditable", "true");
			this.applyCeNonEditableMarkers(lineEl);
		}
		this.ceEditableStart = safeStart;
		this.ceEditableEnd = safeEnd;
	}

	private updateCeEditableRangeFromSelection(): void {
		if (!this.ceImeMode || !this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return;
		const selectionLength = Math.max(0, to - from);
		const lineSpan = Math.abs(endLine - startLine);
		if (selectionLength >= 200000 || lineSpan >= 2000) {
			return;
		}
		if (startLine === endLine) {
			const paragraph = this.getParagraphLineRangeForOffsets(from, to);
			if (paragraph) {
				this.setCeEditableRange(paragraph.start, paragraph.end);
				return;
			}
		}
		this.setCeEditableRange(startLine, endLine);
	}

	private ensureCeTrailingNewline(): void {
		if (!this.sotEditor) return;
		const doc = this.sotEditor.getDoc();
		if (doc.endsWith("\n")) return;
		const baseLength = doc.length;
		const tailStart = Math.max(0, baseLength - 64);
		this.ceImeAutoTrailingNewline = true;
		this.ceImeAutoTrailingNewlineBaseLength = baseLength;
		this.ceImeAutoTrailingNewlineTail = doc.slice(tailStart);
		this.runCeMutation(() => {
			this.sotEditor?.replaceRange(baseLength, baseLength, "\n");
		});
	}

	private cleanupCeTrailingNewline(): void {
		if (!this.sotEditor) return;
		if (!this.ceImeAutoTrailingNewline) return;
		this.ceImeAutoTrailingNewline = false;
		const doc = this.sotEditor.getDoc();
		const baseLength = this.ceImeAutoTrailingNewlineBaseLength;
		const expectedLength = baseLength + 1;
		if (doc.length !== expectedLength) return;
		if (!doc.endsWith("\n")) return;
		const tailStart = Math.max(0, baseLength - 64);
		const tail = doc.slice(tailStart, baseLength);
		if (tail !== this.ceImeAutoTrailingNewlineTail) return;
		this.sotEditor.replaceRange(doc.length - 1, doc.length, "");
	}

	private getParagraphLineRangeForOffsets(
		from: number,
		to: number,
	): { start: number; end: number } | null {
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) return null;
		let start = Math.min(startLine, endLine);
		let end = Math.max(startLine, endLine);
		while (start > 0) {
			const prev = this.lineRanges[start - 1];
			if (!prev || prev.to - prev.from === 0) break;
			start -= 1;
		}
		while (end < this.lineRanges.length - 1) {
			const next = this.lineRanges[end + 1];
			if (!next || next.to - next.from === 0) break;
			end += 1;
		}
		return { start, end };
	}

	private scheduleCeParagraphRerender(
		from: number,
		to: number,
		caretOffset: number | null = null,
	): void {
		if (!this.ceImeMode) return;
		const range = this.getParagraphLineRangeForOffsets(from, to);
		if (!range) return;
		this.ceImeSelectionChangeSuppressedUntil = Date.now() + 120;
		window.requestAnimationFrame(() => {
			if (!this.ceImeMode) return;
			this.ceImeSelectionChangeSuppressedUntil = Date.now() + 120;
			this.rerenderLineRange(range.start, range.end);
			if (caretOffset !== null) {
				this.setSelectionRawClamped(caretOffset, caretOffset);
			}
			this.syncSelectionToCe();
		});
	}

	private setSelectionRawClamped(anchor: number, head: number): void {
		if (!this.sotEditor) return;
		const docLength = this.sotEditor.getDoc().length;
		const safeAnchor = Math.max(0, Math.min(anchor, docLength));
		const safeHead = Math.max(0, Math.min(head, docLength));
		this.sotEditor.setSelection({
			anchor: safeAnchor,
			head: safeHead,
		});
	}

	private applyCeReplaceRange(from: number, to: number, text: string): void {
		if (!this.sotEditor) return;
		const start = Math.min(from, to);
		const end = Math.max(from, to);
		this.updatePendingText("", true);
		this.immediateRender = true;
		this.runCeMutation(() => {
			this.sotEditor?.replaceRange(start, end, text);
		});
		this.scheduleCeParagraphRerender(start, end, start + text.length);
	}

	private applyCeNonEditableMarkers(lineEl: HTMLElement): void {
		if (!this.ceImeMode) return;
		const nonEditable = lineEl.querySelectorAll(
			".tategaki-sot-eol, .tategaki-sot-pending-spacer",
		);
		for (const el of Array.from(nonEditable)) {
			const target = el as HTMLElement;
			target.setAttribute("contenteditable", "false");
			target.setAttribute("aria-hidden", "true");
			target.tabIndex = -1;
		}
		const widgets = lineEl.querySelectorAll(".tategaki-md-inline-widget");
		for (const el of Array.from(widgets)) {
			(el as HTMLElement).setAttribute("contenteditable", "false");
		}
	}

	private applyCeEditableState(
		lineEl: HTMLElement,
		lineIndex: number | null,
	): void {
		if (!this.ceImeMode) {
			lineEl.setAttribute("contenteditable", "false");
			return;
		}
		if (
			lineIndex === null ||
			this.ceEditableStart === null ||
			this.ceEditableEnd === null
		) {
			lineEl.setAttribute("contenteditable", "false");
			return;
		}
		const start = Math.min(this.ceEditableStart, this.ceEditableEnd);
		const end = Math.max(this.ceEditableStart, this.ceEditableEnd);
		const editable = lineIndex >= start && lineIndex <= end;
		lineEl.setAttribute("contenteditable", editable ? "true" : "false");
	}

	private handleCeBeforeInput(event: InputEvent): void {
		if (!this.ceImeMode || !this.sotEditor) return;
		if (!this.derivedContentEl) return;
		if (
			event.target &&
			!this.derivedContentEl.contains(event.target as Node)
		) {
			return;
		}
		if (this.ceImeIgnoreNextInput && event.inputType === "insertText") {
			event.preventDefault();
			event.stopPropagation();
			this.ceImeIgnoreNextInput = false;
			return;
		}
		if (this.ceImeComposing || event.isComposing) {
			if (
				event.inputType === "insertCompositionText" &&
				typeof event.data === "string"
			) {
				this.ceImeLastBeforeInputText = event.data;
			}
			return;
		}
		if (
			event.inputType === "insertCompositionText" ||
			event.inputType === "deleteCompositionText"
		) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		switch (event.inputType) {
			case "insertText":
			case "insertReplacementText": {
				event.preventDefault();
				event.stopPropagation();
				const text = event.data ?? "";
				if (text.length === 0) return;
				const selection = this.syncSelectionFromCe();
				if (!selection) return;
				const from = Math.min(selection.anchor, selection.head);
				const to = Math.max(selection.anchor, selection.head);
				this.applyCeReplaceRange(from, to, text);
				return;
			}
			case "insertLineBreak":
			case "insertParagraph": {
				event.preventDefault();
				event.stopPropagation();
				const selection = this.syncSelectionFromCe();
				if (!selection) return;
				const from = Math.min(selection.anchor, selection.head);
				const to = Math.max(selection.anchor, selection.head);
				this.runCeMutation(() => this.replaceSelection("\n"));
				this.scheduleCeParagraphRerender(from, to, from + 1);
				return;
			}
			case "deleteContentBackward":
			case "deleteWordBackward":
			case "deleteSoftLineBackward":
			case "deleteHardLineBackward": {
				event.preventDefault();
				event.stopPropagation();
				const selection = this.syncSelectionFromCe();
				if (!selection) return;
				const from = Math.min(selection.anchor, selection.head);
				const to = Math.max(selection.anchor, selection.head);
				if (from !== to) {
					this.applyCeReplaceRange(from, to, "");
					return;
				}
				if (from <= 0) return;
				this.applyCeReplaceRange(from - 1, from, "");
				return;
			}
			case "deleteContentForward":
			case "deleteWordForward":
			case "deleteSoftLineForward":
			case "deleteHardLineForward": {
				event.preventDefault();
				event.stopPropagation();
				const selection = this.syncSelectionFromCe();
				if (!selection) return;
				const from = Math.min(selection.anchor, selection.head);
				const to = Math.max(selection.anchor, selection.head);
				if (from !== to) {
					this.applyCeReplaceRange(from, to, "");
					return;
				}
				const docLength = this.sotEditor.getDoc().length;
				if (from >= docLength) return;
				this.applyCeReplaceRange(from, from + 1, "");
				return;
			}
			case "deleteByCut": {
				event.preventDefault();
				event.stopPropagation();
				const selection = this.syncSelectionFromCe();
				if (!selection) return;
				const from = Math.min(selection.anchor, selection.head);
				const to = Math.max(selection.anchor, selection.head);
				this.applyCeReplaceRange(from, to, "");
				return;
			}
			case "insertFromPaste":
			case "insertFromDrop": {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			case "historyUndo": {
				event.preventDefault();
				event.stopPropagation();
				this.runCeMutation(() => this.sotEditor?.undo());
				return;
			}
			case "historyRedo": {
				event.preventDefault();
				event.stopPropagation();
				this.runCeMutation(() => this.sotEditor?.redo());
				return;
			}
			default:
				return;
		}
	}

	private handleCeCompositionStart(event: CompositionEvent): void {
		if (!this.ceImeMode) return;
		this.ceImeComposing = true;
		this.ceImeComposeId += 1;
		this.ceImeActiveComposeId = this.ceImeComposeId;
		this.ceImeLastCompositionText = event.data ?? "";
		this.ceImeLastBeforeInputText = "";
		const selection = this.syncSelectionFromCe();
		if (selection) {
			const from = Math.min(selection.anchor, selection.head);
			const to = Math.max(selection.anchor, selection.head);
			this.ceImeCompositionSelection = { from, to };
		} else {
			this.ceImeCompositionSelection = null;
		}
		this.scheduleCaretUpdate(true);
	}

	private handleCeCompositionUpdate(event: CompositionEvent): void {
		if (!this.ceImeMode) return;
		this.ceImeLastCompositionText = event.data ?? "";
	}

	private handleCeCompositionEnd(event: CompositionEvent): void {
		if (!this.ceImeMode) return;
		this.ceImeComposing = false;
		if (
			this.ceImeActiveComposeId !== null &&
			this.ceImeAppliedComposeId === this.ceImeActiveComposeId
		) {
			this.ceImeActiveComposeId = null;
			return;
		}
		const text = (() => {
			if (event.data !== null && event.data !== undefined) {
				return event.data;
			}
			if (this.ceImeLastBeforeInputText.length > 0) {
				return this.ceImeLastBeforeInputText;
			}
			if (this.ceImeLastCompositionText.length > 0) {
				return this.ceImeLastCompositionText;
			}
			return "";
		})();
		this.ceImeLastCompositionText = "";
		this.ceImeLastBeforeInputText = "";
		this.ceImeIgnoreNextInput = true;
		window.setTimeout(() => {
			this.ceImeIgnoreNextInput = false;
		}, 0);
		let range = this.ceImeCompositionSelection;
		if (!range) {
			const selection = this.syncSelectionFromCe();
			if (selection) {
				range = {
					from: Math.min(selection.anchor, selection.head),
					to: Math.max(selection.anchor, selection.head),
				};
			}
		}
		this.ceImeCompositionSelection = null;
		if (!range) return;
		if (this.ceImeActiveComposeId !== null) {
			this.ceImeAppliedComposeId = this.ceImeActiveComposeId;
			this.ceImeActiveComposeId = null;
		}
		this.applyCeReplaceRange(range.from, range.to, text);
		this.scheduleCaretUpdate(true);
	}

	private handleCeKeydown(event: KeyboardEvent): void {
		if (!this.ceImeMode) return;
		const isMod = event.metaKey || event.ctrlKey;
		if (!isMod) {
			if (event.altKey) return;
			if (event.isComposing || this.ceImeComposing) return;
			if (
				event.key === "ArrowUp" ||
				event.key === "ArrowDown" ||
				event.key === "ArrowLeft" ||
				event.key === "ArrowRight"
			) {
				event.preventDefault();
				event.stopPropagation();
				this.handleNavigate(event);
				if (this.ceImeMode) {
					this.syncSelectionToCe();
				}
				return;
			}
			return;
		}
		if ((event.key === "a" || event.key === "A") && !event.altKey) {
			event.preventDefault();
			event.stopPropagation();
			this.selectAllText();
			return;
		}
		if (event.key === "z" || event.key === "Z") {
			event.preventDefault();
			event.stopPropagation();
			if (event.shiftKey) {
				this.runCeMutation(() => this.sotEditor?.redo());
			} else {
				this.runCeMutation(() => this.sotEditor?.undo());
			}
			return;
		}
		if (event.key === "y" || event.key === "Y") {
			event.preventDefault();
			event.stopPropagation();
			this.runCeMutation(() => this.sotEditor?.redo());
		}
	}

	private handleListOutlinerKeydown(event: KeyboardEvent): boolean {
		return handleListOutlinerKeydownForCe(
			this.getListOutlinerCeBridgeHost(),
			event,
		);
	}

	runListOutlinerAction(action: "move-up" | "move-down"): boolean {
		return runListOutlinerActionForCe(
			this.getListOutlinerCeBridgeHost(),
			action,
		);
	}

	private getListOutlinerCeBridgeHost(): SoTListOutlinerCeBridgeHost {
		return {
			sourceModeEnabled: this.sourceModeEnabled,
			ceImeMode: this.ceImeMode,
			ceImeComposing: this.ceImeComposing,
			getListOutlinerHost: () => this.getListOutlinerHost(),
			syncSelectionFromCe: () => this.syncSelectionFromCe(),
			syncSelectionToCe: () => this.syncSelectionToCe(),
			runCeMutation: (action) => this.runCeMutation(action),
		};
	}

	private getListOutlinerHost() {
		const editor = this.sotEditor;
		if (!editor) return null;
		return {
			getDoc: () => editor.getDoc(),
			getSelection: () => editor.getSelection(),
			getLineRanges: () => this.lineRanges,
			getLineBlockKinds: () => this.lineBlockKinds,
			replaceRange: (from: number, to: number, insert: string) => {
				editor.replaceRange(from, to, insert);
			},
			updatePendingText: (text: string, force?: boolean) =>
				this.updatePendingText(text, force),
			setSelectionNormalized: (anchor: number, head: number) =>
				this.setSelectionNormalized(anchor, head),
			setSelectionRaw: (anchor: number, head: number) => {
				editor.setSelection({ anchor, head });
			},
			focusInputSurface: (preventScroll?: boolean) =>
				this.focusInputSurface(!!preventScroll),
			getWritingMode: () =>
				this.derivedRootEl
					? window.getComputedStyle(this.derivedRootEl).writingMode
					: this.writingMode,
			markImmediateRender: () => {
				this.immediateRender = true;
			},
		};
	}

	private handleCeSelectionChange(): void {
		if (
			this.ceImeMode &&
			Date.now() < this.ceImeSelectionChangeSuppressedUntil
		) {
			return;
		}
		const useNativeSelection = this.isNativeSelectionEnabled();
		if (!this.ceImeMode && !useNativeSelection) return;

		const domSelection =
			this.derivedContentEl?.ownerDocument.getSelection() ?? null;
		if (
			!this.ceImeMode &&
			useNativeSelection &&
			domSelection?.isCollapsed
		) {
			if (
				this.nativeContextMenuHold.shouldSkipNativeCollapse(
					this.sotEditor?.getSelection() ?? null,
				)
			) {
				return;
			}
			if (this.suppressNativeSelectionCollapse) {
				this.suppressNativeSelectionCollapse = false;
				return;
			}
			this.collapseSelectionAfterNativeCancel("selectionchange");
		}

		if (!this.ceImeMode && useNativeSelection) {
			const selection =
				this.derivedContentEl?.ownerDocument.getSelection() ?? null;
			const shouldDelaySync = !!selection && !selection.isCollapsed;
			if (shouldDelaySync) {
				this.schedulePendingNativeSelectionSync();
				return;
			}
			this.pendingNativeSelectionSync = false;
			this.clearSelectionChangeDebounceTimer();
		}

		this.runCeSelectionChange();
	}

	private runCeSelectionChange(): void {
		this.nativeSelectionSupport?.handleSelectionChange();
		this.updateNativeSelectionLineHints();
		if (
			this.ceImeMode &&
			this.selectAllActive &&
			!this.ceImeSelectionSyncing
		) {
			this.selectAllActive = false;
		}
		this.ceSelectionSync?.handleCeSelectionChange();
		this.updateCeEditableRangeFromSelection();
	}

	private resyncNativeSelectionFromSot(): void {
		if (!this.isNativeSelectionEnabled()) return;
		if (!this.nativeSelectionSupport?.isSelectionActive()) return;
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		this.nativeSelectionSupport.syncDomSelectionFromSot(
			selection.anchor,
			selection.head,
		);
	}

	private attachSoTEditor(editor: SoTEditor): void {
		this.detachSoTListener?.();
		this.detachSoTListener = null;
		this.sotEditor?.destroy();
		this.sotEditor = editor;
		this.detachSoTListener = this.sotEditor.onUpdate((update) => {
			if (update.docChanged) {
				const now = Date.now();
				const suppressExternal =
					this.ceImeMode && now <= this.ceImeExternalSuppressUntil;
				if (
					this.ceImeMode &&
					!this.ceImeComposing &&
					!this.ceImeApplying &&
					!suppressExternal
				) {
					this.recordCeMappingFailure("external", true);
				}
				if (suppressExternal) {
					this.ceImeExternalSuppressUntil = 0;
				}
				const applied = this.applyChanges(update.changes ?? []);
				if (!applied) {
					if (this.immediateRender) {
						this.immediateRender = false;
						this.renderPipeline?.cancelScheduledRender();
						this.renderNow();
					} else {
						this.scheduleRender();
					}
				} else {
					this.immediateRender = false;
				}
				this.commandToolbar?.update();
			} else if (update.selectionChanged) {
				this.updateSourceModeLineRange();
				this.pendingCaretScroll =
					this.pendingCaretScroll ||
					(!this.ceImeMode && !this.overlayFocused);
				if (this.ceImeMode && !this.ceImeSelectionSyncing) {
					this.syncSelectionToCe();
				}
				if (this.ceImeMode) {
					this.updateCeEditableRangeFromSelection();
				}
				this.scheduleCaretUpdate();
				this.commandToolbar?.update();
			}
		});
		this.updateSourceToggleUi();
		this.updateSourceModeLineRange(true);
	}

	private updateSourceModeLineRange(forceRerender = false): void {
		void forceRerender;
		if (!this.sourceModeEnabled) return;
		if (!this.sotEditor || !this.derivedContentEl) return;
		this.startPlainEditFromSelection();
	}

	private rerenderLineRange(start: number | null, end: number | null): void {
		if (!this.sotEditor || !this.derivedContentEl) return;
		if (start === null || end === null) return;
		if (this.pendingText.length > 0) return;
		const safeStart = Math.max(0, Math.min(start, end));
		const safeEnd = Math.max(0, Math.max(start, end));

		// pending 表示と競合しないよう、再描画時は pending spacer を無効化して次フレームで再構築させる
		this.pendingSpacerEl = null;
		this.pendingLineIndex = null;
		this.pendingLocalOffset = null;

		for (let i = safeStart; i <= safeEnd; i += 1) {
			const lineRange = this.lineRanges[i];
			const lineEl = this.getLineElement(i);
			if (!lineRange || !lineEl) continue;
			lineEl.replaceChildren();
			this.renderLine(lineEl, lineRange, i);
		}
		this.scheduleCaretUpdate(true);
	}

	private computeSourceModeLineRange(): {
		start: number;
		end: number;
	} | null {
		if (!this.sourceModeEnabled) return null;
		if (!this.sotEditor) return null;
		if (this.lineRanges.length === 0) return null;

		const docLength = this.sotEditor.getDoc().length;
		const selection = this.sotEditor.getSelection();
		const rawFrom = Math.max(
			0,
			Math.min(Math.min(selection.anchor, selection.head), docLength),
		);
		const rawTo = Math.max(
			0,
			Math.min(Math.max(selection.anchor, selection.head), docLength),
		);
		const startLine = this.findLineIndex(rawFrom);
		const endLine = this.findLineIndex(rawTo);
		if (startLine === null || endLine === null) return null;

		// コードブロック内はブロック単位でソース表示（フェンス含む）
		const headLine = this.findLineIndex(selection.head);
		if (headLine !== null) {
			const mathStart = this.lineMathBlockStart[headLine];
			const mathEnd = this.lineMathBlockEnd[headLine];
			if (mathStart !== null && mathEnd !== null) {
				return { start: mathStart, end: mathEnd };
			}
			const calloutStart = this.lineCalloutBlockStart[headLine];
			const calloutEnd = this.lineCalloutBlockEnd[headLine];
			if (calloutStart !== null && calloutEnd !== null) {
				return { start: calloutStart, end: calloutEnd };
			}
			const tableStart = this.lineTableBlockStart[headLine];
			const tableEnd = this.lineTableBlockEnd[headLine];
			if (tableStart !== null && tableEnd !== null) {
				return { start: tableStart, end: tableEnd };
			}
			const deflistStart = this.lineDeflistBlockStart[headLine];
			const deflistEnd = this.lineDeflistBlockEnd[headLine];
			if (deflistStart !== null && deflistEnd !== null) {
				return { start: deflistStart, end: deflistEnd };
			}
			const kind = this.lineBlockKinds[headLine] ?? "normal";
			if (kind === "code" || kind === "code-fence") {
				const range = this.getCodeBlockLineRange(headLine);
				if (range) return range;
			}
		}

		// 単一行: 行単位（大段落でも視界が壊れない）
		if (startLine === endLine) {
			return { start: startLine, end: endLine };
		}

		// 複数行選択: 最大で段落全体まで広げる（空行を境界）
		let start = startLine;
		while (start > 0) {
			const prev = this.lineRanges[start - 1];
			if (!prev) break;
			if (prev.to - prev.from === 0) break;
			start -= 1;
		}
		let end = endLine;
		while (end < this.lineRanges.length - 1) {
			const next = this.lineRanges[end + 1];
			if (!next) break;
			if (next.to - next.from === 0) break;
			end += 1;
		}
		return { start, end };
	}

	private getCodeBlockLineRange(
		lineIndex: number,
	): { start: number; end: number } | null {
		if (lineIndex < 0 || lineIndex >= this.lineRanges.length) return null;
		const kind = this.lineBlockKinds[lineIndex] ?? "normal";
		if (kind !== "code" && kind !== "code-fence") return null;

		let start = lineIndex;
		while (start > 0) {
			const k = this.lineBlockKinds[start - 1] ?? "normal";
			if (k !== "code" && k !== "code-fence") break;
			start -= 1;
		}
		let end = lineIndex;
		while (end + 1 < this.lineRanges.length) {
			const k = this.lineBlockKinds[end + 1] ?? "normal";
			if (k !== "code" && k !== "code-fence") break;
			end += 1;
		}
		return { start, end };
	}

	private async ensureMarkdownViewForFile(
		file: TFile,
	): Promise<MarkdownView | null> {
		return await this.workspaceController.ensureMarkdownViewForFile(file);
	}

	private findMarkdownLeafForFile(filePath: string): WorkspaceLeaf | null {
		return this.workspaceController.findMarkdownLeafForFile(filePath);
	}

	private ensurePairedMarkdownView(): void {
		this.workspaceController.ensurePairedMarkdownView();
	}

	private verifyPairedMarkdownViewFile(
		view: MarkdownView,
		file: TFile,
	): boolean {
		return this.workspaceController.verifyPairedMarkdownViewFile(
			view,
			file,
		);
	}

	private applyPairedMarkdownBadge(
		leaf: WorkspaceLeaf,
		view: MarkdownView,
	): void {
		this.workspaceController.applyPairedMarkdownBadge(leaf, view);
	}

	private clearPairedMarkdownBadge(): void {
		this.workspaceController.clearPairedMarkdownBadge();
	}

	private applySoTTabBadge(): void {
		this.workspaceController.applySoTTabBadge();
	}

	private clearSoTTabBadge(): void {
		this.workspaceController.clearSoTTabBadge();
	}

	private getLeafTabHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
		return this.workspaceController.getLeafTabHeaderEl(leaf);
	}

	private getTabHeaderTitleHost(
		tabHeaderEl: HTMLElement,
	): HTMLElement | null {
		return this.workspaceController.getTabHeaderTitleHost(tabHeaderEl);
	}

	private getViewHeaderTitleHost(
		containerEl: HTMLElement,
	): HTMLElement | null {
		return this.workspaceController.getViewHeaderTitleHost(containerEl);
	}

	private closeSelf(): void {
		window.setTimeout(() => {
			try {
				this.leaf.detach();
			} catch (_) {
				// noop: detach失敗は無視
			}
		}, 0);
	}

	private registerClipboardHandlers(): void {
		if (!this.derivedRootEl) return;
		const onCopy = (event: ClipboardEvent) => {
			this.handleCopyCut(event, false);
		};
		const onCut = (event: ClipboardEvent) => {
			this.handleCopyCut(event, true);
		};
		const onPaste = (event: ClipboardEvent) => {
			this.handlePaste(event);
		};
		this.derivedRootEl.addEventListener("copy", onCopy, true);
		this.derivedRootEl.addEventListener("cut", onCut, true);
		this.derivedRootEl.addEventListener("paste", onPaste, true);
		this.register(() => {
			this.derivedRootEl?.removeEventListener("copy", onCopy, true);
			this.derivedRootEl?.removeEventListener("cut", onCut, true);
			this.derivedRootEl?.removeEventListener("paste", onPaste, true);
		});
	}

	private setupWheelScroll(): void {
		if (!this.derivedRootEl) return;
		if (this.boundWheelHandler) {
			this.derivedRootEl.removeEventListener(
				"wheel",
				this.boundWheelHandler,
			);
			this.boundWheelHandler = null;
		}
		const handler = (event: WheelEvent) => this.handleWheel(event);
		this.boundWheelHandler = handler;
		this.derivedRootEl.addEventListener("wheel", handler, {
			passive: false,
		});
		this.register(() => {
			this.derivedRootEl?.removeEventListener("wheel", handler);
			if (this.boundWheelHandler === handler) {
				this.boundWheelHandler = null;
			}
		});
	}

	private updateMobileTouchAction(): void {
		if (!this.derivedRootEl) return;
		const isMobile = Platform.isMobile || Platform.isMobileApp;
		const isVertical = this.writingMode.startsWith("vertical");
		if (isMobile && isVertical) {
			this.derivedRootEl.style.touchAction = "none";
		} else {
			this.derivedRootEl.style.removeProperty("touch-action");
		}
	}

	private shouldHandleTouchScroll(event: PointerEvent): boolean {
		if (!this.derivedRootEl) return false;
		if (!(Platform.isMobile || Platform.isMobileApp)) return false;
		if (!this.writingMode.startsWith("vertical")) return false;
		if (event.pointerType !== "touch") return false;
		if (this.sourceModeEnabled) return false;
		const target = event.target as HTMLElement | null;
		if (
			target?.closest("textarea, input, .tategaki-plain-overlay") ??
			false
		) {
			return false;
		}
		return true;
	}

	private resetTouchScrollState(): void {
		this.activeTouchPointers.clear();
		this.touchScrollActive = false;
		this.touchScrollStartX = 0;
		this.touchScrollStartY = 0;
		this.touchScrollLastY = 0;
	}

	private handleTouchScrollPointerDown(event: PointerEvent): void {
		if (!this.shouldHandleTouchScroll(event)) return;
		this.activeTouchPointers.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY,
			startX: event.clientX,
			startY: event.clientY,
		});
		if (this.activeTouchPointers.size >= 2) {
			this.touchScrollStartX = event.clientX;
			this.touchScrollStartY = event.clientY;
			this.touchScrollLastY = event.clientY;
			this.touchScrollActive = false;
		}
	}

	private handleTouchScrollPointerMove(event: PointerEvent): void {
		if (!this.derivedRootEl) return;
		if (!this.shouldHandleTouchScroll(event)) return;
		const entry = this.activeTouchPointers.get(event.pointerId);
		if (!entry) return;
		const dxFromStart = event.clientX - entry.startX;
		const dyFromStart = event.clientY - entry.startY;
		const deltaY = event.clientY - entry.y;
		entry.x = event.clientX;
		entry.y = event.clientY;
		this.activeTouchPointers.set(event.pointerId, entry);
		if (this.activeTouchPointers.size < 2) {
			return;
		}
		if (!this.touchScrollActive) {
			const threshold = 6;
			if (
				Math.abs(dyFromStart) < threshold ||
				Math.abs(dyFromStart) < Math.abs(dxFromStart)
			) {
				return;
			}
			this.touchScrollActive = true;
			this.isPointerSelecting = false;
			this.pointerSelectAnchor = null;
			this.pointerSelectPointerId = null;
		}
		if (!this.touchScrollActive) return;
		if (deltaY === 0) return;
		this.touchScrollLastY = event.clientY;
		this.derivedRootEl.scrollLeft -= deltaY;
		event.preventDefault();
		event.stopPropagation();
	}

	private handleTouchScrollPointerUp(event: PointerEvent): void {
		if (!this.shouldHandleTouchScroll(event)) return;
		if (!this.activeTouchPointers.has(event.pointerId)) return;
		this.activeTouchPointers.delete(event.pointerId);
		if (this.activeTouchPointers.size < 2) {
			this.touchScrollActive = false;
		}
		if (this.activeTouchPointers.size === 0) {
			this.resetTouchScrollState();
		}
	}

	private handleWheel(event: WheelEvent): void {
		if (!this.derivedRootEl) return;
		const { deltaX, deltaY, shiftKey } = event;
		const writingMode = window.getComputedStyle(
			this.derivedRootEl,
		).writingMode;
		const isVertical = writingMode.startsWith("vertical");
		const scroller = this.derivedRootEl;

		if (!isVertical) {
			// 横書き: 通常=縦スクロール、Shift=横スクロール
			if (!shiftKey) {
				return;
			}
			event.preventDefault();
			this.throttledWheelScroll(() => {
				scroller.scrollLeft -= deltaY;
			});
			return;
		}

		// 縦書き: 通常=横スクロール、Shift=縦スクロール
		if (shiftKey) {
			return;
		}

		event.preventDefault();
		this.throttledWheelScroll(() => {
			const scrollAmount = -deltaY * 0.8 + deltaX;
			scroller.scrollLeft += scrollAmount;
		});
	}

	private throttledWheelScroll(callback: () => void): void {
		if (this.wheelThrottleTimer !== null) {
			return;
		}
		callback();
		this.wheelThrottleTimer = window.setTimeout(() => {
			this.wheelThrottleTimer = null;
		}, 16);
	}

	private handleRootScroll(): void {
		if (!this.derivedRootEl) return;
		this.markScrollActive();
		const rootEl = this.derivedRootEl;
		const posTop = rootEl.scrollTop;
		const posLeft = rootEl.scrollLeft;
		this.scrollDebouncePendingTop = posTop;
		this.scrollDebouncePendingLeft = posLeft;

		const computed = window.getComputedStyle(rootEl);
		const isVertical = computed.writingMode !== "horizontal-tb";
		const viewport = isVertical ? rootEl.clientWidth : rootEl.clientHeight;
		const thresholds = this.getFastScrollThresholds(viewport);
		const delta = isVertical
			? Math.abs(posLeft - this.scrollDebounceLastLeft)
			: Math.abs(posTop - this.scrollDebounceLastTop);
		this.scrollDebounceLastTop = posTop;
		this.scrollDebounceLastLeft = posLeft;

		const now = performance.now();
		const timeSinceLast = now - this.scrollDebounceLastEventAt;
		const isDiscreteSmallScroll =
			delta <= thresholds.smallThreshold &&
			timeSinceLast > thresholds.idleDelay;
		this.scrollDebounceLastEventAt = now;

		const isLargeDelta = delta >= thresholds.fastThreshold;
		const isFrequent = timeSinceLast <= thresholds.idleDelay;
		const fastScroll =
			this.autoScrollFast ||
			isLargeDelta ||
			(!isDiscreteSmallScroll &&
				isFrequent &&
				delta >= thresholds.smallThreshold);
		this.renderPipeline?.notifyScrollActivity(fastScroll);
		if (this.autoScrollFast) {
			this.updateFastScrollPlaceholders();
		}

		if (isDiscreteSmallScroll) {
			if (this.scrollDebounceTimer !== null) {
				window.clearTimeout(this.scrollDebounceTimer);
				this.scrollDebounceTimer = null;
			}
			this.scheduleScrollDebouncedUpdate();
			return;
		}

		if (this.scrollDebounceRaf !== null) {
			window.cancelAnimationFrame(this.scrollDebounceRaf);
			this.scrollDebounceRaf = null;
		}
		if (this.scrollDebounceTimer !== null) {
			window.clearTimeout(this.scrollDebounceTimer);
		}
		this.scrollDebounceTimer = window.setTimeout(() => {
			this.scrollDebounceTimer = null;
			this.scheduleScrollDebouncedUpdate();
		}, thresholds.idleDelay);
	}

	private scheduleScrollDebouncedUpdate(): void {
		if (this.scrollDebounceRaf !== null) return;
		this.scrollDebounceRaf = window.requestAnimationFrame(() => {
			this.scrollDebounceRaf = null;
			this.finishScrollActivity();
			this.flushPendingNativeSelectionSync();
			this.scheduleCaretUpdate();
			this.purgeLineCachesAroundScroll();
			this.renderPipeline?.onScrollSettled();
			if (this.autoScrollFast) {
				this.updateFastScrollPlaceholders();
			}
		});
	}

	private updateFastScrollPlaceholders(): void {
		if (!this.derivedRootEl || !this.derivedContentEl) return;
		const rootEl = this.derivedRootEl;
		const contentEl = this.derivedContentEl;
		const total = this.lineRanges.length;
		if (total <= 0) return;
		const range = this.getApproxVisibleLineRange(rootEl, total);
		const buffer = total >= 8000 ? 6 : 10;
		const start = Math.max(0, range.start - buffer);
		const end = Math.min(total - 1, range.end + buffer);
		const offset = this.getLineElementOffset();
		const children = contentEl.children;
		for (let i = start; i <= end; i += 1) {
			const lineEl = children[i + offset] as HTMLElement | null;
			if (!lineEl || !lineEl.isConnected) continue;
			const from = Number.parseInt(lineEl.dataset.from ?? "", 10);
			const to = Number.parseInt(lineEl.dataset.to ?? "", 10);
			if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
			const approxLength = Math.max(4, to - from);
			lineEl.style.setProperty(
				"--placeholder-chars",
				String(Math.min(80, approxLength)),
			);
		}
	}

	private getApproxVisibleLineRange(
		rootEl: HTMLElement,
		totalLines: number,
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
			Math.min(totalLines - 1, firstVisible + visibleCount),
		);
		return { start, end };
	}

	private purgeLineCachesAroundScroll(): void {
		if (!this.shouldUseLineCache()) return;
		if (!this.derivedRootEl) return;
		const total = this.lineRanges.length;
		if (total <= 0) return;

		const rootEl = this.derivedRootEl;
		const computed = window.getComputedStyle(rootEl);
		const fontSize = Number.parseFloat(computed.fontSize) || 16;
		const lineHeight =
			Number.parseFloat(computed.lineHeight) || fontSize * 1.8;
		const isVertical = computed.writingMode !== "horizontal-tb";
		const extent = Math.max(lineHeight, fontSize);
		const viewport = isVertical ? rootEl.clientWidth : rootEl.clientHeight;
		let scrollPos = isVertical
			? this.scrollDebouncePendingLeft
			: this.scrollDebouncePendingTop;
		if (isVertical && scrollPos < 0) {
			scrollPos = -scrollPos;
		}
		const firstVisible = Math.floor(Math.max(0, scrollPos) / extent);
		const visibleCount = Math.ceil(viewport / extent);
		const buffer = Math.max(120, visibleCount * 2);
		const start = Math.max(0, firstVisible - buffer);
		const end = Math.min(total - 1, firstVisible + visibleCount + buffer);
		this.purgeLineCaches(start, end);
	}

	private purgeLineCaches(start: number, end: number): void {
		if (!this.shouldUseLineCache()) return;
		const total = this.lineRanges.length;
		if (total <= 0) return;
		const buffer = 64;
		const safeStart = Math.max(0, start - buffer);
		const safeEnd = Math.min(total - 1, end + buffer);
		const shouldKeep = (index: number): boolean =>
			index >= safeStart && index <= safeEnd;

		const purgeCache = <T>(map: Map<number, T>): void => {
			for (const key of Array.from(map.keys())) {
				if (!shouldKeep(key)) {
					map.delete(key);
				}
			}
		};
		purgeCache(this.lineDecorationCache);
		purgeCache(this.lineSegmentCache);
	}

	private resetPendingRenderState(): void {
		this.pendingSpacerEl = null;
		this.pendingLineIndex = null;
		this.pendingLocalOffset = null;
		this.pendingSelectionFrom = null;
		this.pendingSelectionTo = null;
		this.pendingSelectionLineStart = null;
		this.pendingSelectionLineEnd = null;
	}

	private finalizeRender(scrollTop: number, scrollLeft: number): void {
		if (this.pendingHold) {
			this.pendingHold = false;
			this.updatePendingText("", true);
		}
		this.updateSourceModeLineRange(true);
		if (this.derivedRootEl) {
			this.derivedRootEl.scrollTop = scrollTop;
			this.derivedRootEl.scrollLeft = scrollLeft;
			this.syncNativeSelectionDataset();
		}
		this.outlinePanel?.refresh();
		this.scheduleCaretUpdate(true);
		this.updatePaneHeaderTitle();
		if (this.loadingOverlayPending) {
			this.hideLoadingOverlay();
		}
	}

	private scheduleRender(force = false): void {
		this.renderPipeline?.scheduleRender(force);
	}

	private renderNow(): void {
		this.renderPipeline?.renderNow();
	}

	private applyChanges(changes: SoTChange[]): boolean {
		if (!this.derivedContentEl || !this.sotEditor) return false;
		if (this.lineRanges.length === 0) return false;
		if (changes.length === 0) return false;

		if (this.canApplyChangesFast(changes)) {
			const fastApplied = this.applyChangesFast(changes);
			if (fastApplied) return true;
		}

		const doc = this.sotEditor.getDoc();
		const lines = doc.split("\n");
		const newRanges = this.computeLineRangesFromLines(lines);
		this.recomputeLineBlockKinds(lines);

		let oldStart = Number.POSITIVE_INFINITY;
		let oldEnd = -1;
		let newStart = Number.POSITIVE_INFINITY;
		let newEnd = -1;

		for (const change of changes) {
			const oldStartLine = this.findLineIndexInRanges(
				this.lineRanges,
				change.from,
			);
			const oldEndLine = this.findLineIndexInRanges(
				this.lineRanges,
				change.to,
			);
			const newStartLine = this.findLineIndexInRanges(
				newRanges,
				change.fromB,
			);
			const newEndLine = this.findLineIndexInRanges(
				newRanges,
				change.toB,
			);
			if (
				oldStartLine === null ||
				oldEndLine === null ||
				newStartLine === null ||
				newEndLine === null
			) {
				return false;
			}
			oldStart = Math.min(oldStart, oldStartLine);
			oldEnd = Math.max(oldEnd, oldEndLine);
			newStart = Math.min(newStart, newStartLine);
			newEnd = Math.max(newEnd, newEndLine);
		}

		if (!Number.isFinite(oldStart) || !Number.isFinite(newStart)) {
			return false;
		}

		const fragment = document.createDocumentFragment();
		for (let i = newStart; i <= newEnd; i++) {
			const range = newRanges[i];
			if (!range) continue;
			const lineEl = document.createElement("div");
			lineEl.className = "tategaki-sot-line";
			lineEl.dataset.from = String(range.from);
			lineEl.dataset.to = String(range.to);
			lineEl.dataset.line = String(i);
			this.renderLine(lineEl, range, i);
			fragment.appendChild(lineEl);
		}

		const removeCount = oldEnd >= oldStart ? oldEnd - oldStart + 1 : 0;
		const offset = this.getLineElementOffset();
		const anchor =
			this.derivedContentEl.children[oldEnd + offset + 1] ?? null;
		for (let i = 0; i < removeCount; i++) {
			const child = this.derivedContentEl.children[oldStart + offset];
			if (child) {
				child.remove();
			}
		}
		if (anchor) {
			this.derivedContentEl.insertBefore(fragment, anchor);
		} else {
			this.derivedContentEl.appendChild(fragment);
		}

		this.lineRanges = newRanges;
		this.syncLineDatasets(Math.min(oldStart, newStart));
		this.updateSourceModeLineRange(true);
		this.pendingSpacerEl = null;
		this.pendingLineIndex = null;
		this.pendingLocalOffset = null;
		if (this.pendingHold) {
			this.pendingHold = false;
			this.updatePendingText("", true);
		}
		this.outlinePanel?.refresh();
		this.scheduleCaretUpdate(true);
		if (this.loadingOverlayPending) {
			this.hideLoadingOverlay();
		}
		return true;
	}

	private canApplyChangesFast(changes: SoTChange[]): boolean {
		if (!this.sotEditor) return false;
		if (this.lineRanges.length === 0) return false;
		for (const change of changes) {
			if (change.insert.includes("\n")) return false;
			const oldStartLine = this.findLineIndexInRanges(
				this.lineRanges,
				change.from,
			);
			const oldEndLine = this.findLineIndexInRanges(
				this.lineRanges,
				change.to,
			);
			if (
				oldStartLine === null ||
				oldEndLine === null ||
				oldStartLine !== oldEndLine
			) {
				return false;
			}
		}
		return true;
	}

	private applyChangesFast(changes: SoTChange[]): boolean {
		if (!this.derivedContentEl || !this.sotEditor) return false;
		if (this.lineRanges.length === 0) return false;

		const originalRanges = this.lineRanges.slice();
		const updatedRanges = this.lineRanges.map((range) => ({
			from: range.from,
			to: range.to,
		}));
		const ordered = changes
			.slice()
			.sort((a, b) => a.from - b.from || a.to - b.to);

		let minLine = Number.POSITIVE_INFINITY;
		let maxLine = -1;

		for (const change of ordered) {
			const lineIndex = this.findLineIndexInRanges(
				originalRanges,
				change.from,
			);
			const lineEnd = this.findLineIndexInRanges(
				originalRanges,
				change.to,
			);
			if (
				lineIndex === null ||
				lineEnd === null ||
				lineIndex !== lineEnd
			) {
				return false;
			}
			minLine = Math.min(minLine, lineIndex);
			maxLine = Math.max(maxLine, lineIndex);

			const delta = change.insert.length - (change.to - change.from);
			if (delta === 0) continue;
			const target = updatedRanges[lineIndex];
			if (!target) return false;
			target.to += delta;
			for (let i = lineIndex + 1; i < updatedRanges.length; i += 1) {
				const range = updatedRanges[i];
				if (!range) continue;
				range.from += delta;
				range.to += delta;
			}
		}

		if (!Number.isFinite(minLine)) return false;
		this.lineRanges = updatedRanges;

		for (let i = minLine; i <= maxLine; i += 1) {
			const lineRange = this.lineRanges[i];
			const lineEl = this.getLineElement(i);
			if (!lineRange || !lineEl) continue;
			lineEl.replaceChildren();
			this.renderLine(lineEl, lineRange, i);
		}

		this.syncLineDatasets(minLine);
		this.updateSourceModeLineRange(true);
		this.pendingSpacerEl = null;
		this.pendingLineIndex = null;
		this.pendingLocalOffset = null;
		if (this.pendingHold) {
			this.pendingHold = false;
			this.updatePendingText("", true);
		}
		this.outlinePanel?.refresh();
		this.scheduleCaretUpdate(true);
		if (this.loadingOverlayPending) {
			this.hideLoadingOverlay();
		}
		this.scheduleLineModelRecompute(minLine, maxLine);
		return true;
	}

	private scheduleLineModelRecompute(
		startLine: number,
		endLine: number,
	): void {
		if (!this.sotEditor) return;
		const safeStart = Math.max(0, Math.min(startLine, endLine));
		const safeEnd = Math.max(startLine, endLine);
		if (this.lineModelRecomputeStart === null) {
			this.lineModelRecomputeStart = safeStart;
			this.lineModelRecomputeEnd = safeEnd;
		} else {
			this.lineModelRecomputeStart = Math.min(
				this.lineModelRecomputeStart,
				safeStart,
			);
			this.lineModelRecomputeEnd = Math.max(
				this.lineModelRecomputeEnd ?? safeEnd,
				safeEnd,
			);
		}
		if (this.ceImeMode || this.shouldDeferLineModelRecompute()) {
			this.lineModelRecomputeDeferred = true;
			return;
		}
		if (this.lineModelRecomputeTimer !== null) return;
		if (this.lineModelRecomputeIdle !== null) return;

		const run = () => this.runLineModelRecompute();

		const requestIdle = (window as any).requestIdleCallback as
			| ((cb: () => void, opts?: { timeout?: number }) => number)
			| undefined;
		if (requestIdle) {
			this.lineModelRecomputeIdle = requestIdle(run, {
				timeout: 800,
			});
			return;
		}
		this.lineModelRecomputeTimer = window.setTimeout(run, 180);
	}

	private runLineModelRecompute(): void {
		this.lineModelRecomputeTimer = null;
		this.lineModelRecomputeIdle = null;
		if (!this.sotEditor) return;
		const doc = this.sotEditor.getDoc();
		const lines = doc.split("\n");
		if (this.lineRanges.length !== lines.length) {
			this.lineRanges = this.computeLineRangesFromLines(lines);
		}
		this.recomputeLineBlockKinds(lines);
		this.outlinePanel?.refresh();

		const start = this.lineModelRecomputeStart;
		const end = this.lineModelRecomputeEnd;
		this.lineModelRecomputeStart = null;
		this.lineModelRecomputeEnd = null;
		if (start === null || end === null) return;
		if (this.pendingText.length > 0) return;
		this.rerenderLineRange(start, end);
	}

	private syncLineDatasets(startIndex: number): void {
		if (!this.derivedContentEl) return;
		const start = Math.max(0, startIndex);
		const total = Math.min(
			this.lineRanges.length,
			this.derivedContentEl.children.length,
		);
		const offset = this.getLineElementOffset();
		for (let i = start; i < total; i += 1) {
			const lineEl = this.derivedContentEl.children[i + offset] as
				| HTMLElement
				| undefined;
			const range = this.lineRanges[i];
			if (!lineEl || !range) continue;
			lineEl.dataset.from = String(range.from);
			lineEl.dataset.to = String(range.to);
			lineEl.dataset.line = String(i);
		}
	}

	private scheduleCaretUpdate(force = false): void {
		if (this.shouldDeferCaretUpdate(force)) {
			this.scheduleSelectionOverlayUpdate();
			return;
		}
		if (!force) {
			window.requestAnimationFrame(() => {
				this.updateSelectionOverlay();
				this.updateCaretPosition();
			});
			return;
		}
		this.updateSelectionOverlay();
		this.updateCaretPosition();
	}

	private updateCaretPosition(): void {
		if (
			!this.derivedRootEl ||
			!this.derivedContentEl ||
			!this.caretEl ||
			!this.sotEditor
		)
			return;
		const forceScroll = this.isPairedMarkdownLeafActive();
		if (this.sourceModeEnabled) {
			this.caretEl.style.display = "none";
			return;
		}
		const caretWidth = this.plugin.settings.wysiwyg.caretWidthPx ?? 3;
		const effectiveCommon = this.getEffectiveCommonSettings(
			this.plugin.settings,
		);
		const caretColor = this.resolveCaretColor(
			this.plugin.settings,
			effectiveCommon,
		);
		const preferNativeInCe =
			this.plugin.settings.wysiwyg.ceUseNativeCaret ?? true;
		const useNativeInCe =
			this.ceImeMode && (preferNativeInCe || this.ceImeComposing);
		if (this.derivedRootEl && this.ceImeMode) {
			this.derivedRootEl.dataset.ceImeNativeCaret = useNativeInCe
				? "1"
				: "0";
		}
		if (this.ceImeMode) {
			this.overlayTextarea?.setCaretVisible(false);
			this.derivedContentEl.style.caretColor = useNativeInCe
				? caretColor
				: "transparent";
			if (useNativeInCe) {
				this.caretEl.style.display = "none";
				const shouldScroll = this.pendingCaretScroll || forceScroll;
				if (shouldScroll) {
					this.pendingCaretScroll = false;
					this.scrollCaretIntoView();
				}
				return;
			}
		}
		const selection = this.sotEditor.getSelection();
		const selectionFrom = Math.min(selection.anchor, selection.head);
		const selectionTo = Math.max(selection.anchor, selection.head);
		const offset =
			this.pendingText.length > 0 && selectionFrom !== selectionTo
				? selectionFrom
				: selection.head;
		const lineIndex = this.findLineIndex(offset);
		if (lineIndex === null) {
			this.caretEl.style.display = "none";
			return;
		}
		const lineRange = this.lineRanges[lineIndex];
		if (!lineRange) {
			this.caretEl.style.display = "none";
			return;
		}
		const lineEl = this.getLineElement(lineIndex);
		if (!lineEl) {
			this.caretEl.style.display = "none";
			return;
		}
		this.ensureLineRendered(lineEl);
		const computedStyle = window.getComputedStyle(this.derivedRootEl);
		const lineComputedStyle = window.getComputedStyle(lineEl);
		const writingMode = computedStyle.writingMode;
		const lineLength = lineRange.to - lineRange.from;
		const localOffset = Math.max(
			0,
			Math.min(offset - lineRange.from, lineLength),
		);
		this.updatePendingSpacer(lineIndex, localOffset);
		const caretRect = this.getCaretRectInLine(
			lineEl,
			localOffset,
			lineRange,
			writingMode,
		);
		if (!caretRect) {
			this.caretEl.style.display = "none";
			return;
		}

		const rootRect = this.derivedRootEl.getBoundingClientRect();
		let baseLeft =
			caretRect.left - rootRect.left + this.derivedRootEl.scrollLeft;
		let baseTop =
			caretRect.top - rootRect.top + this.derivedRootEl.scrollTop;
		const pendingStartRect = this.getPendingSpacerStartRect(
			lineEl,
			lineIndex,
			writingMode,
		);
		if (pendingStartRect) {
			baseLeft =
				pendingStartRect.left -
				rootRect.left +
				this.derivedRootEl.scrollLeft;
			baseTop =
				pendingStartRect.top -
				rootRect.top +
				this.derivedRootEl.scrollTop;
		}
		const lineStartRect = this.getCaretRectInLine(
			lineEl,
			0,
			lineRange,
			writingMode,
		);
		let lineStartLeft = baseLeft;
		let lineStartTop = baseTop;
		if (!(lineLength === 0 && pendingStartRect)) {
			if (lineStartRect) {
				lineStartLeft =
					lineStartRect.left -
					rootRect.left +
					this.derivedRootEl.scrollLeft;
				lineStartTop =
					lineStartRect.top -
					rootRect.top +
					this.derivedRootEl.scrollTop;
			}
		}
		const usePendingLineStart =
			!!pendingStartRect &&
			this.pendingText.length > 0 &&
			this.pendingLineIndex === lineIndex &&
			this.pendingLocalOffset === 0;
		if (usePendingLineStart) {
			lineStartLeft =
				pendingStartRect.left -
				rootRect.left +
				this.derivedRootEl.scrollLeft;
			lineStartTop =
				pendingStartRect.top -
				rootRect.top +
				this.derivedRootEl.scrollTop;
		}

		const isVertical = writingMode.startsWith("vertical");
		const rootFontSize = parseFloat(computedStyle.fontSize) || 18;
		const fontSize = parseFloat(lineComputedStyle.fontSize) || rootFontSize;
		const lineHeightPx =
			Number.parseFloat(lineComputedStyle.lineHeight) ||
			Number.parseFloat(computedStyle.lineHeight) ||
			Math.max(1, fontSize * 1.8);
		let pendingCaretIndex: number | null = null;
		if (this.overlayTextarea?.isFocused()) {
			pendingCaretIndex = this.overlayTextarea.getSelectionStart();
		}
		const pendingCaretRect = this.getPendingCaretRect(
			writingMode,
			pendingCaretIndex,
		);
		let caretLeft = baseLeft;
		let caretTop = baseTop;
		if (pendingCaretRect) {
			caretLeft =
				pendingCaretRect.left -
				rootRect.left +
				this.derivedRootEl.scrollLeft;
			caretTop =
				pendingCaretRect.top -
				rootRect.top +
				this.derivedRootEl.scrollTop;
		}
		const caretRectForAdjust = pendingCaretRect ?? caretRect;

		const pendingOffset = isVertical ? fontSize * 0.3 : 0;
		const showNativeCaret =
			!this.ceImeMode &&
			((this.overlayTextarea?.isImeVisible() ?? false) ||
				(this.overlayFocused && this.pendingText.length > 0));
		this.overlayTextarea?.setCaretVisible(showNativeCaret);
		this.caretEl.style.display = showNativeCaret ? "none" : "";
		this.caretEl.style.left = `${caretLeft}px`;
		if (isVertical) {
			this.caretEl.style.top = `${caretTop}px`;
			this.caretEl.style.width = `${Math.max(
				8,
				caretRectForAdjust.width,
			)}px`;
			this.caretEl.style.height = `${Math.max(1, caretWidth)}px`;
		} else {
			// 横書きは縦線キャレット。長さはfont-size相当を基本にする（line-height分だと大きく見えやすい）。
			const desiredHeight = Math.max(8, fontSize);
			const rectHeight = Math.max(0, caretRectForAdjust.height);
			let adjustedTop = caretTop;
			if (rectHeight > 0 && rectHeight !== desiredHeight) {
				adjustedTop = caretTop + (rectHeight - desiredHeight) / 2;
			}
			this.caretEl.style.top = `${adjustedTop}px`;
			this.caretEl.style.width = `${Math.max(1, caretWidth)}px`;
			this.caretEl.style.height = `${desiredHeight}px`;
		}
		let horizontalTopAdjust = 0;
		if (!isVertical) {
			const rectHeight = Math.max(0, caretRectForAdjust.height);
			if (rectHeight > 0 && Number.isFinite(lineHeightPx)) {
				horizontalTopAdjust = (rectHeight - lineHeightPx) / 2;
				// OS/フォント差でわずかに下に見えやすいので、少し上へ寄せる
				horizontalTopAdjust -= fontSize * 0.2;
				const maxAdjust = fontSize * 0.35;
				horizontalTopAdjust = Math.max(
					-maxAdjust,
					Math.min(maxAdjust, horizontalTopAdjust),
				);
			}
		}
		const isPendingLineStart =
			this.pendingText.length > 0 &&
			this.pendingLineIndex === lineIndex &&
			this.pendingLocalOffset === 0;
		let inlineIndent = isVertical
			? Math.max(0, baseTop - lineStartTop)
			: Math.max(0, baseLeft - lineStartLeft);
		if (isPendingLineStart) {
			inlineIndent = 0;
		}
		const imeOffsetHorizontalEm =
			this.plugin.settings.wysiwyg.imeOffsetHorizontalEm ?? 0.1;
		const imeOffsetVerticalEm =
			this.plugin.settings.wysiwyg.imeOffsetVerticalEm ?? 0.5;
		const imeAdjustY = isVertical ? 0 : fontSize * imeOffsetHorizontalEm;
		const imeAdjustX = isVertical ? fontSize * imeOffsetVerticalEm : 0;
		const applyImeAdjustToEmptyLine =
			lineLength === 0 && this.pendingText.length > 0;
		const imeBaseLeft = applyImeAdjustToEmptyLine
			? baseLeft + imeAdjustX
			: baseLeft;
		const imeBaseTop = applyImeAdjustToEmptyLine
			? baseTop - imeAdjustY
			: baseTop;
		const imeLineStartLeft = applyImeAdjustToEmptyLine
			? lineStartLeft + imeAdjustX
			: lineStartLeft;
		const imeLineStartTop = applyImeAdjustToEmptyLine
			? lineStartTop - imeAdjustY
			: lineStartTop;
		const effectiveImeAdjustX = applyImeAdjustToEmptyLine ? 0 : imeAdjustX;
		const effectiveImeAdjustY = applyImeAdjustToEmptyLine ? 0 : imeAdjustY;
		const viewTop = this.derivedRootEl.scrollTop;
		const viewLeft = this.derivedRootEl.scrollLeft;
		const viewHeight = this.derivedRootEl.clientHeight;
		const viewWidth = this.derivedRootEl.clientWidth;
		const offsetFromViewTop = imeLineStartTop - viewTop;
		const offsetFromViewLeft = imeLineStartLeft - viewLeft;
		const clampedOffsetTop = Math.max(
			0,
			Math.min(offsetFromViewTop, viewHeight),
		);
		const clampedOffsetLeft = Math.max(
			0,
			Math.min(offsetFromViewLeft, viewWidth),
		);
		// textareaのサイズと位置を設定（本文エリアに合わせて折り返し）
		if (this.overlayTextarea) {
			const padBottom =
				Number.parseFloat(computedStyle.paddingBottom) || 0;
			const padRight = Number.parseFloat(computedStyle.paddingRight) || 0;
			const lineSize = Math.max(lineHeightPx, fontSize * 1.8, 32); // 1行/1列のサイズ
			const imeExtraSpace = Math.max(
				fontSize * 0.5,
				lineHeightPx * 0.25,
				0,
			); // 余裕分（折り返しズレ緩和）
			this.applyOverlayTextStyle(lineEl, lineLength, localOffset);
			this.overlayTextarea.setTextIndent(inlineIndent);
			if (isVertical) {
				// 縦書き: 行頭から下端までの高さ
				const availableHeight =
					viewHeight -
					padBottom -
					clampedOffsetTop -
					horizontalTopAdjust;
				// 制約を設定（初期は1列分、内容に応じて動的に増える）
				this.overlayTextarea.setConstraints(
					true,
					Math.max(availableHeight + imeExtraSpace, lineSize),
					lineSize,
				);
				// 縦書きは右端基準で位置設定
				// キャレットの右端（baseLeft + キャレット幅）にtextareaの右端を合わせる
				const caretWidth = Math.max(8, caretRect.width);
				this.overlayTextarea.setAnchorPositionVertical(
					imeBaseLeft + caretWidth + effectiveImeAdjustX,
					imeLineStartTop + horizontalTopAdjust,
				);
			} else {
				// 横書き: 行頭から右端までの幅
				const availableWidth = viewWidth - padRight - clampedOffsetLeft;
				// 制約を設定（初期は1行分、内容に応じて動的に増える）
				this.overlayTextarea.setConstraints(
					false,
					Math.max(availableWidth + imeExtraSpace, lineSize),
					lineSize,
				);
				this.overlayTextarea.setAnchorPosition(
					imeLineStartLeft,
					imeBaseTop + horizontalTopAdjust - effectiveImeAdjustY,
				);
			}
		}
		this.updatePendingPosition(
			baseLeft - pendingOffset,
			baseTop + horizontalTopAdjust,
		);

		const shouldScroll = this.pendingCaretScroll || forceScroll;
		if (shouldScroll) {
			this.pendingCaretScroll = false;
			this.scrollCaretIntoView();
		}
	}

	private applyOverlayTextStyle(
		lineEl: HTMLElement,
		lineLength: number,
		localOffset: number,
	): void {
		if (!this.overlayTextarea) return;
		const styleSource = this.resolveOverlayStyleSourceNode(
			lineEl,
			lineLength,
			localOffset,
		);
		const style = window.getComputedStyle(styleSource);
		this.overlayTextarea.setTextStyle({
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			lineHeight: style.lineHeight,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle,
			letterSpacing: style.letterSpacing,
			color: style.color,
			textDecorationLine: style.textDecorationLine || "none",
		});
	}

	private resolveOverlayStyleSourceNode(
		lineEl: HTMLElement,
		lineLength: number,
		localOffset: number,
	): HTMLElement {
		if (lineLength <= 0) return lineEl;
		const primary = this.findTextNodeAtOffset(lineEl, localOffset);
		if (primary?.node.parentElement) {
			return primary.node.parentElement;
		}
		const fallbackOffset = Math.max(0, localOffset - 1);
		const fallback = this.findTextNodeAtOffset(lineEl, fallbackOffset);
		if (fallback?.node.parentElement) {
			return fallback.node.parentElement;
		}
		return lineEl;
	}

	private scrollCaretIntoView(): void {
		if (!this.derivedRootEl) return;
		if (this.ceImeMode) {
			if (!this.sotEditor) return;
			const selection = this.sotEditor.getSelection();
			const offset = selection.head;
			const lineIndex = this.findLineIndex(offset);
			if (lineIndex === null) return;
			const lineRange = this.lineRanges[lineIndex];
			const lineEl = this.getLineElement(lineIndex);
			if (!lineRange || !lineEl) return;
			this.ensureLineRendered(lineEl);
			const lineLength = lineRange.to - lineRange.from;
			const localOffset = Math.max(
				0,
				Math.min(offset - lineRange.from, lineLength),
			);
			const writingMode = window.getComputedStyle(
				this.derivedRootEl,
			).writingMode;
			const caretRect =
				this.getCaretRectInLine(
					lineEl,
					localOffset,
					lineRange,
					writingMode,
				) ?? lineEl.getBoundingClientRect();
			this.scrollRectIntoView(caretRect);
			return;
		}
		if (!this.caretEl) return;
		if (this.caretEl.style.display === "none") return;
		const rootRect = this.derivedRootEl.getBoundingClientRect();
		const caretRect = this.caretEl.getBoundingClientRect();
		this.scrollRectIntoView(caretRect, rootRect);
	}

	private scrollRectIntoView(rect: DOMRect, rootRect?: DOMRect): void {
		if (!this.derivedRootEl) return;
		const viewRect = rootRect ?? this.derivedRootEl.getBoundingClientRect();
		const padding = 24;
		let deltaX = 0;
		let deltaY = 0;
		if (rect.left < viewRect.left + padding) {
			deltaX = rect.left - (viewRect.left + padding);
		} else if (rect.right > viewRect.right - padding) {
			deltaX = rect.right - (viewRect.right - padding);
		}
		if (rect.top < viewRect.top + padding) {
			deltaY = rect.top - (viewRect.top + padding);
		} else if (rect.bottom > viewRect.bottom - padding) {
			deltaY = rect.bottom - (viewRect.bottom - padding);
		}
		if (deltaX !== 0) {
			this.derivedRootEl.scrollLeft += deltaX;
		}
		if (deltaY !== 0) {
			this.derivedRootEl.scrollTop += deltaY;
		}
		return;
	}

	private openHref(href: string): void {
		const trimmed = href.trim();
		if (!trimmed) return;
		const isExternal =
			/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
			/^mailto:/i.test(trimmed) ||
			/^tel:/i.test(trimmed);
		if (isExternal) {
			void openExternalUrl(this.app, trimmed).then((opened) => {
				if (!opened) {
					new Notice(t("settings.notice.linkOpenFailed"), 2500);
				}
			});
			return;
		}
		const sourcePath = this.currentFile?.path ?? "";
		void this.app.workspace.openLinkText(trimmed, sourcePath, false);
	}

	private replaceSelection(text: string): void {
		if (!this.sotEditor) return;
		const softRange = this.getSoftSelectionRange();
		const selection = this.sotEditor.getSelection();
		let from = Math.min(selection.anchor, selection.head);
		let to = Math.max(selection.anchor, selection.head);
		if (softRange) {
			from = softRange.from;
			to = softRange.to;
			this.clearSoftSelection();
			this.selectAllActive = false;
			this.overlayImeReplace?.cancel();
		}
		const imeRange = softRange
			? null
			: this.overlayImeReplace?.consumeReplaceRange();
		if (imeRange) {
			from = imeRange.from;
			to = imeRange.to;
			this.selectAllActive = false;
		}
		const isLineBreakOnly = text === "\n";
		if (isLineBreakOnly && from === to) {
			const lineIndex = this.findLineIndex(from);
			if (lineIndex !== null) {
				const lineRange = this.lineRanges[lineIndex];
				if (lineRange) {
					const segments = this.buildSegmentsForLine(
						lineRange.from,
						lineRange.to,
					);
					const lastVisible =
						segments.length > 0
							? segments[segments.length - 1]!.to
							: lineRange.from;
					if (lastVisible < lineRange.to && from >= lastVisible) {
						from = lineRange.to;
						to = lineRange.to;
					}
				}
			}
		}
		if (this.pendingText.length > 0) {
			this.pendingHold = true;
		}
		this.immediateRender = true;
		this.sotEditor.replaceRange(from, to, text);
		if (text.includes("\n")) {
			this.pendingCaretScroll = true;
		}
	}

	private backspace(): void {
		if (!this.sotEditor) return;
		this.overlayImeReplace?.cancel();
		const softRange = this.getSoftSelectionRange();
		if (softRange) {
			this.updatePendingText("", true);
			this.immediateRender = true;
			this.sotEditor.replaceRange(softRange.from, softRange.to, "");
			this.clearSoftSelection();
			this.selectAllActive = false;
			return;
		}
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		if (from !== to) {
			this.updatePendingText("", true);
			this.immediateRender = true;
			this.sotEditor.replaceRange(from, to, "");
			return;
		}
		if (from <= 0) return;
		this.updatePendingText("", true);
		this.immediateRender = true;
		this.sotEditor.replaceRange(from - 1, from, "");
	}

	private del(): void {
		if (!this.sotEditor) return;
		this.overlayImeReplace?.cancel();
		const softRange = this.getSoftSelectionRange();
		if (softRange) {
			this.updatePendingText("", true);
			this.immediateRender = true;
			this.sotEditor.replaceRange(softRange.from, softRange.to, "");
			this.clearSoftSelection();
			this.selectAllActive = false;
			return;
		}
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		if (from !== to) {
			this.updatePendingText("", true);
			this.immediateRender = true;
			this.sotEditor.replaceRange(from, to, "");
			return;
		}
		const docLength = this.sotEditor.getDoc().length;
		if (from >= docLength) return;
		this.updatePendingText("", true);
		this.immediateRender = true;
		this.sotEditor.replaceRange(from, from + 1, "");
	}

	private handleNavigate(event: KeyboardEvent): void {
		if (!this.sotEditor || !this.derivedRootEl) return;
		const doc = this.sotEditor.getDoc();
		const selection = this.sotEditor.getSelection();
		const head = selection.head;
		this.updatePendingText("", true);
		const writingMode = window.getComputedStyle(
			this.derivedRootEl,
		).writingMode;
		const visibleDocStart = this.getVisibleDocStartOffset();
		if (
			!event.shiftKey &&
			selection.anchor === selection.head &&
			head === visibleDocStart &&
			this.isBackwardNavigationKey(event.key, writingMode)
		) {
			this.pendingCaretScroll = false;
			this.scheduleCaretUpdate();
			return;
		}
		const visualInfo = this.getVisualMoveInfo(event.key, writingMode);
		let next = visualInfo?.offset ?? null;
		if (next === null) {
			next = this.getNextOffset(doc, head, event.key, writingMode);
		}
		if (visualInfo?.atBoundary) {
			next = this.adjustCrossParagraphOffset(head, next);
		}
		const preferForward = next >= head;
		const normalized = this.normalizeOffsetToVisible(next, preferForward);
		if (normalized === head && next !== head) {
			next = this.findNextVisibleOffset(head, preferForward);
		} else {
			next = normalized;
		}
		const anchor = event.shiftKey ? selection.anchor : next;
		const selectionUnchanged =
			anchor === selection.anchor && next === selection.head;
		if (selectionUnchanged) {
			this.pendingCaretScroll = false;
			this.scheduleCaretUpdate();
			return;
		}
		const skipDomSync = this.isNativeSelectionEnabled() && !event.shiftKey;
		this.setSelectionNormalized(anchor, next, {
			syncDom: !skipDomSync,
		});
		this.pendingCaretScroll = true;
		this.scheduleCaretUpdate(true);
	}

	private isBackwardNavigationKey(key: string, writingMode: string): boolean {
		const isVertical = writingMode.startsWith("vertical");
		if (isVertical) {
			const isVerticalRL = writingMode !== "vertical-lr";
			if (key === "ArrowUp") return true;
			if (key === "ArrowRight") return isVerticalRL;
			if (key === "ArrowLeft") return !isVerticalRL;
			return false;
		}
		return key === "ArrowLeft" || key === "ArrowUp";
	}

	private shouldPrepareImeReplaceRange(event: KeyboardEvent): boolean {
		if (event.metaKey || event.ctrlKey || event.altKey) return false;
		const key = event.key;
		if (
			key === "Escape" ||
			key === "Backspace" ||
			key === "Delete" ||
			key === "Tab"
		) {
			return false;
		}
		if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
			return false;
		}
		if (key === "Enter") return true;
		if (key === "Process" || key === "Unidentified" || key === "Dead") {
			return true;
		}
		return key.length === 1;
	}

	private collapseSelectionAfterNativeCancel(reason: string): void {
		if (this.ceImeMode) return;
		if (this.sourceModeEnabled) return;
		if (!this.isNativeSelectionEnabled()) return;
		if (!this.sotEditor) return;
		if (this.softSelectionActive) {
			this.clearSoftSelection();
			this.selectAllActive = false;
		}
		const selection =
			this.derivedContentEl?.ownerDocument.getSelection() ?? null;
		const inside =
			selection && this.isSelectionInsideDerivedContent(selection);
		if (selection && inside && !selection.isCollapsed) return;
		const current = this.sotEditor.getSelection();
		if (current.anchor === current.head) return;
		this.setSelectionNormalized(current.head, current.head, {
			syncDom: false,
		});
		this.selectionLayerEl?.replaceChildren();
		void reason;
	}

	private findNextVisibleOffset(
		currentOffset: number,
		forward: boolean,
	): number {
		if (!this.sotEditor) return currentOffset;
		const docLength = this.sotEditor.getDoc().length;
		const safeCurrent = Math.max(0, Math.min(currentOffset, docLength));
		const startLine = this.findLineIndex(safeCurrent);
		if (startLine === null) return safeCurrent;

		const step = forward ? 1 : -1;
		for (
			let lineIndex = startLine;
			lineIndex >= 0 && lineIndex < this.lineRanges.length;
			lineIndex += step
		) {
			const range = this.lineRanges[lineIndex];
			if (!range) break;
			const segments = this.buildSegmentsForLine(range.from, range.to);
			if (segments.length === 0) {
				if (lineIndex !== startLine) {
					return forward ? range.from : range.to;
				}
				continue;
			}
			if (lineIndex === startLine) {
				if (forward) {
					for (const seg of segments) {
						if (safeCurrent < seg.from) {
							return seg.from;
						}
						if (safeCurrent >= seg.from && safeCurrent < seg.to) {
							return Math.min(seg.to, safeCurrent + 1);
						}
					}
				} else {
					for (let i = segments.length - 1; i >= 0; i -= 1) {
						const seg = segments[i]!;
						if (safeCurrent > seg.to) {
							return seg.to;
						}
						if (safeCurrent > seg.from && safeCurrent <= seg.to) {
							return Math.max(seg.from, safeCurrent - 1);
						}
					}
				}
			} else {
				return forward
					? segments[0]!.from
					: segments[segments.length - 1]!.to;
			}
		}
		return safeCurrent;
	}

	private updatePendingText(text: string, force = false): void {
		if (this.ceImeMode) {
			this.pendingText = "";
			this.pendingHold = false;
			this.pendingSelectionFrom = null;
			this.pendingSelectionTo = null;
			this.pendingSelectionLineStart = null;
			this.pendingSelectionLineEnd = null;
			if (this.pendingEl) {
				this.pendingEl.style.display = "none";
			}
			return;
		}
		if (!force && text.length === 0 && this.pendingHold) {
			return;
		}
		this.pendingText = text;
		if (text.length === 0 && !this.pendingHold) {
			this.restorePendingSelectionLines();
		} else if (text.length > 0) {
			this.capturePendingSelection();
		}
		if (!this.pendingEl) return;
		const content = text.length > 0 ? text : "";
		this.pendingEl.textContent = content;
		if (!this.showPendingOverlay) {
			this.pendingEl.style.display = "none";
		} else if (this.overlayTextarea?.isImeVisible()) {
			// IME変換中はpendingElを非表示（textareaで表示される）
			this.pendingEl.style.display = "none";
		} else {
			this.pendingEl.style.display = content.length > 0 ? "" : "none";
		}
		this.scheduleCaretUpdate();
	}

	private updatePendingPosition(left: number, top: number): void {
		if (!this.pendingEl) return;
		this.pendingEl.style.left = `${left}px`;
		this.pendingEl.style.top = `${top}px`;
	}

	private handleCopyCut(event: ClipboardEvent, isCut: boolean): void {
		if (!this.sotEditor) return;
		if (this.softSelectionActive) {
			const range = this.getSoftSelectionRange();
			if (!range) return;
			const text = this.sotEditor.getDoc().slice(range.from, range.to);
			if (event.clipboardData) {
				event.clipboardData.setData("text/plain", text);
				event.clipboardData.setData("text/markdown", text);
			}
			event.preventDefault();
			event.stopPropagation();
			if (isCut) {
				if (this.ceImeMode) {
					this.applyCeReplaceRange(range.from, range.to, "");
				} else {
					this.updatePendingText("", true);
					this.immediateRender = true;
					this.sotEditor.replaceRange(range.from, range.to, "");
				}
				this.clearSoftSelection();
				this.selectAllActive = false;
			}
			return;
		}
		if (this.nativeSelectionSupport?.tryHandleCopyCut(event, isCut)) {
			return;
		}
		if (this.ceImeMode) {
			this.syncSelectionFromCe();
		}
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		if (from === to) return;
		const text = this.sotEditor.getDoc().slice(from, to);
		if (event.clipboardData) {
			event.clipboardData.setData("text/plain", text);
			event.clipboardData.setData("text/markdown", text);
		}
		event.preventDefault();
		event.stopPropagation();
		if (isCut) {
			if (this.ceImeMode) {
				this.applyCeReplaceRange(from, to, "");
			} else {
				this.updatePendingText("", true);
				this.immediateRender = true;
				this.sotEditor.replaceRange(from, to, "");
			}
		}
	}

	private handlePaste(event: ClipboardEvent): void {
		if (!this.sotEditor) return;
		if (this.ceImeMode) {
			event.preventDefault();
			event.stopPropagation();
			const selection = this.syncSelectionFromCe();
			if (!selection) return;
			const from = Math.min(selection.anchor, selection.head);
			const to = Math.max(selection.anchor, selection.head);
			const text = event.clipboardData?.getData("text/plain") ?? "";
			if (text.length > 0) {
				const normalized = text
					.replace(/\r\n/g, "\n")
					.replace(/\r/g, "\n");
				this.applyCeReplaceRange(from, to, normalized);
				return;
			}
			void this.readTextFromClipboard().then((clipboardText) => {
				if (!clipboardText) return;
				const normalized = clipboardText
					.replace(/\r\n/g, "\n")
					.replace(/\r/g, "\n");
				this.applyCeReplaceRange(from, to, normalized);
			});
			return;
		}
		const text = event.clipboardData?.getData("text/plain") ?? "";
		if (text.length === 0) return;
		event.preventDefault();
		event.stopPropagation();
		const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		this.updatePendingText("", true);
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		this.immediateRender = true;
		this.sotEditor.replaceRange(from, to, normalized);
	}

	private updateSelectionOverlay(): void {
		if (this.shouldSuppressAutoScrollSelectionRenders()) {
			this.selectionLayerEl?.replaceChildren();
			return;
		}
		if (this.sourceModeEnabled) {
			this.selectionLayerEl?.replaceChildren();
			return;
		}
		const softRange = this.getSoftSelectionRange();
		if (
			softRange &&
			this.sotEditor &&
			this.selectionLayerEl &&
			this.derivedRootEl &&
			this.derivedContentEl
		) {
			const docLength = this.sotEditor.getDoc().length;
			if (
				softRange.from === 0 &&
				softRange.to === docLength &&
				this.isHugeDocSelection()
			) {
				this.selectionLayerEl.replaceChildren();
				const rootRect = this.derivedRootEl.getBoundingClientRect();
				const contentRect =
					this.derivedContentEl.getBoundingClientRect();
				const left = Math.max(rootRect.left, contentRect.left);
				const right = Math.min(rootRect.right, contentRect.right);
				const top = Math.max(rootRect.top, contentRect.top);
				const bottom = Math.min(rootRect.bottom, contentRect.bottom);
				const width = Math.max(0, right - left);
				const height = Math.max(0, bottom - top);
				if (width > 0 && height > 0) {
					const overlay = document.createElement("div");
					overlay.className = "tategaki-sot-selection-rect";
					const offsetLeft =
						left - rootRect.left + this.derivedRootEl.scrollLeft;
					const offsetTop =
						top - rootRect.top + this.derivedRootEl.scrollTop;
					overlay.style.left = `${offsetLeft}px`;
					overlay.style.top = `${offsetTop}px`;
					overlay.style.width = `${width}px`;
					overlay.style.height = `${height}px`;
					this.selectionLayerEl.appendChild(overlay);
				}
				return;
			}
			this.selectionOverlay?.updateSelectionOverlayForRange(
				softRange.from,
				softRange.to,
				{
					forceVisibleRange: true,
					allowNativeSelection: true,
					preferApproxVisibleRange: this.isScrolling,
				},
			);
			return;
		}
		if (this.ceImeMode) {
			if (!this.selectAllActive) {
				this.selectionLayerEl?.replaceChildren();
				return;
			}
			if (
				this.sotEditor &&
				this.selectionLayerEl &&
				this.derivedRootEl &&
				this.derivedContentEl
			) {
				const docLength = this.sotEditor.getDoc().length;
				const totalLines = this.lineRanges.length;
				const isLargeSelection =
					docLength >= 200000 || totalLines >= 2000;
				const selection = this.sotEditor.getSelection();
				const from = Math.min(selection.anchor, selection.head);
				const to = Math.max(selection.anchor, selection.head);
				if (from === 0 && to === docLength && isLargeSelection) {
					this.selectionLayerEl.replaceChildren();
					const rootRect = this.derivedRootEl.getBoundingClientRect();
					const contentRect =
						this.derivedContentEl.getBoundingClientRect();
					const left = Math.max(rootRect.left, contentRect.left);
					const right = Math.min(rootRect.right, contentRect.right);
					const top = Math.max(rootRect.top, contentRect.top);
					const bottom = Math.min(
						rootRect.bottom,
						contentRect.bottom,
					);
					const width = Math.max(0, right - left);
					const height = Math.max(0, bottom - top);
					if (width > 0 && height > 0) {
						const overlay = document.createElement("div");
						overlay.className = "tategaki-sot-selection-rect";
						const offsetLeft =
							left -
							rootRect.left +
							this.derivedRootEl.scrollLeft;
						const offsetTop =
							top - rootRect.top + this.derivedRootEl.scrollTop;
						overlay.style.left = `${offsetLeft}px`;
						overlay.style.top = `${offsetTop}px`;
						overlay.style.width = `${width}px`;
						overlay.style.height = `${height}px`;
						this.selectionLayerEl.appendChild(overlay);
					}
					return;
				}
			}
			this.selectAllActive = false;
			this.selectionLayerEl?.replaceChildren();
			return;
		}
		if (
			tryRenderNativeSelectionFallback({
				isNativeSelectionEnabled: this.isNativeSelectionEnabled(),
				overlayFocused:
					this.overlayFocused ||
					this.scrollbarSelectionHold ||
					this.nativeContextMenuHold.isActiveWithSelection(
						this.sotEditor?.getSelection() ?? null,
					),
				ceImeMode: this.ceImeMode,
				sourceModeEnabled: this.sourceModeEnabled,
				derivedRootEl: this.derivedRootEl,
				derivedContentEl: this.derivedContentEl,
				selectionLayerEl: this.selectionLayerEl,
				sotEditor: this.sotEditor,
				totalLines: this.lineRanges.length,
				selectionOverlay: this.selectionOverlay,
				isSelectionInsideDerivedContent: (selection) =>
					this.isSelectionInsideDerivedContent(selection),
			})
		) {
			return;
		}
		if (
			this.selectAllActive &&
			this.sotEditor &&
			this.selectionLayerEl &&
			this.derivedRootEl &&
			this.derivedContentEl
		) {
			const docLength = this.sotEditor.getDoc().length;
			const selection = this.sotEditor.getSelection();
			const from = Math.min(selection.anchor, selection.head);
			const to = Math.max(selection.anchor, selection.head);
			if (from === 0 && to === docLength && docLength >= 200000) {
				this.selectionLayerEl.replaceChildren();
				const rootRect = this.derivedRootEl.getBoundingClientRect();
				const contentRect =
					this.derivedContentEl.getBoundingClientRect();
				const left = Math.max(rootRect.left, contentRect.left);
				const right = Math.min(rootRect.right, contentRect.right);
				const top = Math.max(rootRect.top, contentRect.top);
				const bottom = Math.min(rootRect.bottom, contentRect.bottom);
				const width = Math.max(0, right - left);
				const height = Math.max(0, bottom - top);
				if (width > 0 && height > 0) {
					const overlay = document.createElement("div");
					overlay.className = "tategaki-sot-selection-rect";
					const offsetLeft =
						left - rootRect.left + this.derivedRootEl.scrollLeft;
					const offsetTop =
						top - rootRect.top + this.derivedRootEl.scrollTop;
					overlay.style.left = `${offsetLeft}px`;
					overlay.style.top = `${offsetTop}px`;
					overlay.style.width = `${width}px`;
					overlay.style.height = `${height}px`;
					this.selectionLayerEl.appendChild(overlay);
				}
				return;
			}
			this.selectAllActive = false;
		}
		const allowOverlayWithNativeSelection =
			this.nativeSelectionAssistByAutoScroll && this.isHugeDocSelection();
		this.selectionOverlay?.updateSelectionOverlay({
			allowNativeSelection: allowOverlayWithNativeSelection,
			preferApproxVisibleRange: this.isScrolling,
		});
	}

	private getPendingCaretRect(
		writingMode: string,
		caretIndex?: number | null,
	): DOMRect | null {
		if (!this.pendingSpacerEl) return null;
		if (this.pendingText.length === 0) return null;
		const node = this.pendingSpacerEl.firstChild;
		if (!node || node.nodeType !== Node.TEXT_NODE) return null;
		const textNode = node as Text;
		const length = textNode.length;
		const index =
			caretIndex === null || caretIndex === undefined
				? length
				: Math.max(0, Math.min(caretIndex, length));
		const range = document.createRange();
		range.setStart(textNode, index);
		range.setEnd(textNode, index);
		return this.pickCaretRectFromRange(range, writingMode);
	}

	private getPendingSpacerStartRect(
		lineEl: HTMLElement,
		lineIndex: number,
		writingMode: string,
	): DOMRect | null {
		if (!this.pendingSpacerEl) return null;
		if (this.pendingLineIndex === null) return null;
		if (this.pendingLineIndex !== lineIndex) return null;
		if (!lineEl.contains(this.pendingSpacerEl)) return null;
		const node = this.pendingSpacerEl.firstChild;
		if (node && node.nodeType === Node.TEXT_NODE) {
			const range = document.createRange();
			range.setStart(node, 0);
			range.setEnd(node, 0);
			return this.pickCaretRectFromRange(range, writingMode);
		}
		return this.pendingSpacerEl.getBoundingClientRect();
	}

	private updatePendingSpacer(lineIndex: number, localOffset: number): void {
		if (!this.derivedContentEl) return;
		if (this.pendingText.length === 0) {
			this.restorePendingSelectionLines();
			this.restorePendingLine();
			return;
		}
		if (this.applyPendingSelectionReplace()) {
			return;
		}
		const lineRange = this.lineRanges[lineIndex];
		const lineEl = this.getLineElement(lineIndex);
		if (!lineRange || !lineEl) {
			this.restorePendingSelectionLines();
			this.restorePendingLine();
			return;
		}
		const desiredGlobalOffset = this.normalizeOffsetToVisible(
			lineRange.from + localOffset,
			true,
		);
		const desiredLocalOffset = Math.max(
			0,
			Math.min(
				desiredGlobalOffset - lineRange.from,
				lineRange.to - lineRange.from,
			),
		);
		if (
			this.pendingLineIndex === lineIndex &&
			this.pendingLocalOffset === desiredLocalOffset &&
			this.pendingSpacerEl
		) {
			this.pendingSpacerEl.textContent = this.pendingText;
			return;
		}
		this.restorePendingLine();

		const baseSegments = this.buildSegmentsForLine(
			lineRange.from,
			lineRange.to,
		);
		const inlineWidgets = this.getInlineWidgetsForLineRange(lineRange);
		this.renderLineFromSegments(
			lineEl,
			lineRange,
			baseSegments,
			{
				insertOffset: desiredGlobalOffset,
				pendingText: this.pendingText,
			},
			inlineWidgets,
		);
		this.pendingLineIndex = lineIndex;
		this.pendingLocalOffset = desiredLocalOffset;
	}

	private restorePendingLine(): void {
		if (this.pendingLineIndex === null || !this.derivedContentEl) {
			this.pendingSpacerEl = null;
			this.pendingLocalOffset = null;
			this.pendingLineIndex = null;
			return;
		}
		const lineRange = this.lineRanges[this.pendingLineIndex];
		const lineEl = this.getLineElement(this.pendingLineIndex);
		if (!lineRange || !lineEl) {
			this.pendingSpacerEl = null;
			this.pendingLocalOffset = null;
			this.pendingLineIndex = null;
			return;
		}
		lineEl.replaceChildren();
		this.renderLine(lineEl, lineRange);
		this.pendingSpacerEl = null;
		this.pendingLocalOffset = null;
		this.pendingLineIndex = null;
	}

	private capturePendingSelection(): void {
		if (!this.sotEditor) return;
		if (this.pendingSelectionFrom !== null) return;
		const selection = this.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		if (from === to) return;
		const normalizedFrom = this.normalizeOffsetToVisible(from, true);
		const normalizedTo = this.normalizeOffsetToVisible(to, false);
		const startLine = this.findLineIndex(normalizedFrom);
		const endLine = this.findLineIndex(normalizedTo);
		if (startLine === null || endLine === null) return;
		this.pendingSelectionFrom = normalizedFrom;
		this.pendingSelectionTo = normalizedTo;
		this.pendingSelectionLineStart = startLine;
		this.pendingSelectionLineEnd = endLine;
	}

	private applyPendingSelectionReplace(): boolean {
		if (
			this.pendingSelectionFrom === null ||
			this.pendingSelectionTo === null ||
			this.pendingSelectionLineStart === null ||
			this.pendingSelectionLineEnd === null
		) {
			return false;
		}
		if (!this.derivedContentEl) return false;
		const startLine = this.pendingSelectionLineStart;
		const endLine = this.pendingSelectionLineEnd;
		const from = this.pendingSelectionFrom;
		const to = this.pendingSelectionTo;

		if (startLine > endLine) {
			return false;
		}

		const startRange = this.lineRanges[startLine];
		const startLineLength = startRange
			? startRange.to - startRange.from
			: 0;
		const startOffset = startRange
			? Math.max(0, Math.min(from - startRange.from, startLineLength))
			: 0;
		if (
			this.pendingLineIndex === startLine &&
			this.pendingLocalOffset === startOffset &&
			this.pendingSpacerEl
		) {
			this.pendingSpacerEl.textContent = this.pendingText;
			return true;
		}

		this.restorePendingLine();

		for (let i = startLine; i <= endLine; i += 1) {
			const lineRange = this.lineRanges[i];
			const lineEl = this.getLineElement(i);
			if (!lineRange || !lineEl) continue;
			const removeFrom = i === startLine ? from : lineRange.from;
			const removeTo = i === endLine ? to : lineRange.to;
			const baseSegments = this.buildSegmentsForLine(
				lineRange.from,
				lineRange.to,
			);
			const baseWidgets = this.getInlineWidgetsForLineRange(lineRange);
			const remaining = this.removeRangeFromSegments(
				baseSegments,
				removeFrom,
				removeTo,
			);
			const remainingWidgets = this.removeRangeFromInlineWidgets(
				baseWidgets,
				removeFrom,
				removeTo,
			);
			if (i === startLine) {
				this.renderLineFromSegments(
					lineEl,
					lineRange,
					remaining,
					{
						insertOffset: from,
						pendingText: this.pendingText,
					},
					remainingWidgets,
				);
				this.pendingLineIndex = startLine;
				this.pendingLocalOffset = startOffset;
			} else {
				this.renderLineFromSegments(
					lineEl,
					lineRange,
					remaining,
					undefined,
					remainingWidgets,
				);
			}
		}
		return true;
	}

	private restorePendingSelectionLines(): void {
		if (
			this.pendingSelectionLineStart === null ||
			this.pendingSelectionLineEnd === null
		) {
			this.pendingSelectionFrom = null;
			this.pendingSelectionTo = null;
			this.pendingSelectionLineStart = null;
			this.pendingSelectionLineEnd = null;
			return;
		}
		const start = this.pendingSelectionLineStart;
		const end = this.pendingSelectionLineEnd;
		for (let i = start; i <= end; i += 1) {
			const lineRange = this.lineRanges[i];
			const lineEl = this.getLineElement(i);
			if (!lineRange || !lineEl) continue;
			lineEl.replaceChildren();
			this.renderLine(lineEl, lineRange);
		}
		this.pendingSelectionFrom = null;
		this.pendingSelectionTo = null;
		this.pendingSelectionLineStart = null;
		this.pendingSelectionLineEnd = null;
		this.pendingSpacerEl = null;
		this.pendingLineIndex = null;
		this.pendingLocalOffset = null;
	}

	private renderLine(
		lineEl: HTMLElement,
		lineRange: LineRange,
		lineIndex?: number,
	): void {
		if (!this.sotEditor) return;
		const index =
			lineIndex ?? Number.parseInt(lineEl.dataset.line ?? "", 10);
		const isSource =
			Number.isFinite(index) && this.isLineInSourceMode(index);

		if (Number.isFinite(index)) {
			const prevChild = this.embedRenderChildren.get(index as number);
			if (prevChild) {
				try {
					prevChild.unload();
				} catch (_) {
					// noop: unload失敗は無視
				}
				this.embedRenderChildren.delete(index as number);
			}
			const prevMath = this.mathRenderChildren.get(index as number);
			if (prevMath) {
				try {
					prevMath.unload();
				} catch (_) {
					// noop: unload失敗は無視
				}
				this.mathRenderChildren.delete(index as number);
			}
			const prevCallout = this.calloutRenderChildren.get(index as number);
			if (prevCallout) {
				try {
					prevCallout.unload();
				} catch (_) {
					// noop: unload失敗は無視
				}
				this.calloutRenderChildren.delete(index as number);
			}
			const prevTable = this.tableRenderChildren.get(index as number);
			if (prevTable) {
				try {
					prevTable.unload();
				} catch (_) {
					// noop: unload失敗は無視
				}
				this.tableRenderChildren.delete(index as number);
			}
			const prevDeflist = this.deflistRenderChildren.get(index as number);
			if (prevDeflist) {
				try {
					prevDeflist.unload();
				} catch (_) {
					// noop: unload失敗は無視
				}
				this.deflistRenderChildren.delete(index as number);
			}
		}

		// datasetの残骸をクリア
		lineEl.removeAttribute("data-virtual");
		delete (lineEl.dataset as any).mdKind;
		delete (lineEl.dataset as any).mdLevel;
		delete (lineEl.dataset as any).mdDepth;
		delete (lineEl.dataset as any).headingCollapsed;
		delete (lineEl.dataset as any).headingFoldable;
		delete (lineEl.dataset as any).listMarker;
		delete (lineEl.dataset as any).taskChecked;
		delete (lineEl.dataset as any).listDepth;
		delete (lineEl.dataset as any).listBullet;
		delete (lineEl.dataset as any).codeInfo;
		delete (lineEl.dataset as any).calloutType;
		delete (lineEl.dataset as any).calloutRange;
		delete (lineEl.dataset as any).footnoteId;
		delete (lineEl.dataset as any).tableHeader;
		delete (lineEl.dataset as any).tableRange;
		delete (lineEl.dataset as any).deflistRange;
		delete (lineEl.dataset as any).imageSrc;
		delete (lineEl.dataset as any).imageAlt;
		delete (lineEl.dataset as any).imageWidth;
		delete (lineEl.dataset as any).embedTarget;
		delete (lineEl.dataset as any).mathRange;
		lineEl.style.removeProperty("--tategaki-sot-list-depth");
		lineEl.style.removeProperty("--tategaki-sot-blockquote-depth");

		this.applyCeEditableState(
			lineEl,
			Number.isFinite(index) ? (index as number) : null,
		);

		if (this.plainTextViewEnabled) {
			lineEl.className = "tategaki-sot-line";
			const doc = this.sotEditor.getDoc();
			const text = doc.slice(lineRange.from, lineRange.to);
			const segments: RenderSegment[] =
				text.length > 0
					? [
							{
								from: lineRange.from,
								to: lineRange.to,
								text,
								classNames: ["tategaki-sot-run"],
							},
						]
					: [];
			this.renderLineFromSegments(lineEl, lineRange, segments);
			this.applyCeNonEditableMarkers(lineEl);
			this.applyPlainEditTargetClass(
				lineEl,
				Number.isFinite(index) ? (index as number) : null,
			);
			return;
		}

		if (isSource) {
			lineEl.className = "tategaki-sot-line";
			const doc = this.sotEditor.getDoc();
			const segments: RenderSegment[] =
				lineRange.to > lineRange.from
					? [
							{
								from: lineRange.from,
								to: lineRange.to,
								text: doc.slice(lineRange.from, lineRange.to),
								classNames: ["tategaki-sot-run"],
							},
						]
					: [];
			this.renderLineFromSegments(lineEl, lineRange, segments);
			this.applyCeNonEditableMarkers(lineEl);
			this.applyPlainEditTargetClass(
				lineEl,
				Number.isFinite(index) ? (index as number) : null,
			);
			return;
		}

		{
			const doc = this.sotEditor.getDoc();
			const indexForDecoration = Number.isFinite(index)
				? (index as number)
				: null;
			const lineText = doc.slice(lineRange.from, lineRange.to);
			const decoration = this.getCachedBlockLineDecoration(
				indexForDecoration,
				lineRange.from,
				lineRange.to,
				lineText,
			);
			lineEl.className = [
				"tategaki-sot-line",
				...decoration.classes,
			].join(" ");
			for (const [key, value] of Object.entries(decoration.dataset)) {
				(lineEl.dataset as any)[key] = value;
			}
			for (const [key, value] of Object.entries(decoration.styleVars)) {
				lineEl.style.setProperty(key, value);
			}
		}
		if (
			this.frontmatterDetected &&
			(lineEl.dataset.mdKind === "frontmatter" ||
				lineEl.dataset.mdKind === "frontmatter-fence")
		) {
			lineEl.classList.add("tategaki-md-frontmatter-hidden");
			this.renderLineFromSegments(lineEl, lineRange, []);
			this.applyCeNonEditableMarkers(lineEl);
			this.applyPlainEditTargetClass(
				lineEl,
				Number.isFinite(index) ? (index as number) : null,
			);
			return;
		}
		if (lineEl.dataset.mdKind === "heading-hidden") {
			this.renderLineFromSegments(lineEl, lineRange, []);
			this.applyCeNonEditableMarkers(lineEl);
			this.applyPlainEditTargetClass(
				lineEl,
				Number.isFinite(index) ? (index as number) : null,
			);
			return;
		}

		const segments = this.buildSegmentsForLine(
			lineRange.from,
			lineRange.to,
		);
		const inlineWidgets = this.getInlineWidgetsForLineRange(lineRange);
		this.renderLineFromSegments(
			lineEl,
			lineRange,
			segments,
			undefined,
			inlineWidgets,
		);
		this.applyCeNonEditableMarkers(lineEl);
		this.applyPlainEditTargetClass(
			lineEl,
			Number.isFinite(index) ? (index as number) : null,
		);
	}

	private ensureLineRendered(lineEl: HTMLElement): void {
		if (lineEl.dataset.virtual !== "1") return;
		const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
		if (!Number.isFinite(index)) return;
		const range = this.lineRanges[index];
		if (!range) return;
		this.renderLine(lineEl, range, index);
	}

	private renderLineLight(
		lineEl: HTMLElement,
		lineRange: LineRange,
		lineIndex: number,
	): void {
		if (Number.isFinite(lineIndex)) {
			const idx = lineIndex as number;
			const unloadChild = (map: Map<number, MarkdownRenderChild>) => {
				const child = map.get(idx);
				if (!child) return;
				try {
					child.unload();
				} catch (_) {
					// noop: unload失敗は無視
				}
				map.delete(idx);
			};
			unloadChild(this.embedRenderChildren);
			unloadChild(this.mathRenderChildren);
			unloadChild(this.calloutRenderChildren);
			unloadChild(this.tableRenderChildren);
			unloadChild(this.deflistRenderChildren);
		}
		// 軽量プレースホルダー: 最小限の属性のみ設定
		// テキスト取得や装飾計算を行わず、メモリと処理負荷を大幅に削減
		// サイズはCSSで固定値（line-height相当）を設定
		lineEl.replaceChildren();
		lineEl.className = "tategaki-sot-line tategaki-sot-line-virtual";
		lineEl.dataset.virtual = "1";
		this.applyCeEditableState(lineEl, lineIndex);
		this.applyPlainEditTargetClass(lineEl, lineIndex);

		const placeholder = document.createElement("span");
		placeholder.className = "tategaki-sot-virtual-placeholder";
		const approxLength = Math.max(4, lineRange.to - lineRange.from);
		placeholder.style.setProperty(
			"--placeholder-chars",
			String(Math.min(80, approxLength)),
		);
		lineEl.appendChild(placeholder);
	}

	private removeRangeFromSegments(
		segments: RenderSegment[],
		removeFrom: number,
		removeTo: number,
	): RenderSegment[] {
		const safeFrom = Math.min(removeFrom, removeTo);
		const safeTo = Math.max(removeFrom, removeTo);
		if (safeFrom === safeTo) return segments;

		const result: RenderSegment[] = [];
		for (const seg of segments) {
			if (seg.to <= safeFrom || seg.from >= safeTo) {
				result.push(seg);
				continue;
			}
			if (seg.from < safeFrom) {
				const leftTo = Math.min(seg.to, safeFrom);
				const leftLen = leftTo - seg.from;
				if (leftLen > 0) {
					result.push({
						from: seg.from,
						to: leftTo,
						text: seg.text.slice(0, leftLen),
						classNames: seg.classNames,
						href: seg.href,
						ruby: seg.ruby,
					});
				}
			}
			if (seg.to > safeTo) {
				const rightFrom = Math.max(seg.from, safeTo);
				const rightStart = rightFrom - seg.from;
				if (rightStart < seg.text.length) {
					result.push({
						from: rightFrom,
						to: seg.to,
						text: seg.text.slice(rightStart),
						classNames: seg.classNames,
						href: seg.href,
						ruby: seg.ruby,
					});
				}
			}
		}
		return result;
	}

	private removeRangeFromInlineWidgets(
		widgets: InlineWidget[],
		removeFrom: number,
		removeTo: number,
	): InlineWidget[] {
		const safeFrom = Math.min(removeFrom, removeTo);
		const safeTo = Math.max(removeFrom, removeTo);
		if (safeFrom === safeTo) return widgets;
		return widgets.filter((w) => w.to <= safeFrom || w.from >= safeTo);
	}

	private splitSegmentsAtOffset(
		segments: RenderSegment[],
		globalOffset: number,
	): { before: RenderSegment[]; after: RenderSegment[] } {
		const before: RenderSegment[] = [];
		const after: RenderSegment[] = [];
		for (const seg of segments) {
			if (seg.to <= globalOffset) {
				before.push(seg);
				continue;
			}
			if (seg.from >= globalOffset) {
				after.push(seg);
				continue;
			}
			// seg.from < globalOffset < seg.to
			const splitIndex = Math.max(
				0,
				Math.min(globalOffset - seg.from, seg.text.length),
			);
			const leftText = seg.text.slice(0, splitIndex);
			const rightText = seg.text.slice(splitIndex);
			if (leftText.length > 0) {
				before.push({
					from: seg.from,
					to: seg.from + leftText.length,
					text: leftText,
					classNames: seg.classNames,
					href: seg.href,
					ruby: seg.ruby,
				});
			}
			if (rightText.length > 0) {
				after.push({
					from: seg.from + leftText.length,
					to: seg.to,
					text: rightText,
					classNames: seg.classNames,
					href: seg.href,
					ruby: seg.ruby,
				});
			}
		}
		return { before, after };
	}

	private renderInlineSegmentsWithWidgets(
		parent: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		inlineWidgets: InlineWidget[],
		pending?: { insertOffset: number; pendingText: string } | undefined,
	): void {
		const widgets = (inlineWidgets ?? [])
			.filter(
				(w) =>
					w.from >= lineRange.from &&
					w.from <= lineRange.to &&
					w.to >= lineRange.from &&
					w.to <= lineRange.to,
			)
			.slice()
			.sort((a, b) => a.from - b.from || a.to - b.to);

		const appendSegment = (segment: RenderSegment) => {
			const span = document.createElement("span");
			span.className = segment.classNames.join(" ");
			span.dataset.from = String(segment.from - lineRange.from);
			span.dataset.to = String(segment.to - lineRange.from);
			if (segment.classNames.includes("tategaki-md-footnote-ref")) {
				const footnoteId = segment.text;
				const number = this.footnoteDefinitionOrder.get(footnoteId);
				span.dataset.footnoteId = footnoteId;
				if (number !== undefined) {
					span.dataset.footnoteNumber = String(number);
				} else {
					delete (span.dataset as any).footnoteNumber;
				}
				const tooltip = this.footnoteDefinitionText.get(footnoteId);
				if (tooltip) {
					span.setAttribute("aria-label", tooltip);
					span.setAttribute("data-tooltip-position", "top");
				} else {
					span.removeAttribute("aria-label");
					span.removeAttribute("data-tooltip-position");
				}
			}
			if (segment.href) {
				span.dataset.href = segment.href;
			} else {
				delete (span.dataset as any).href;
			}
			if (segment.ruby) {
				span.dataset.ruby = segment.ruby;
				span.dataset.aozoraRuby = "1";
			} else {
				delete (span.dataset as any).ruby;
				delete (span.dataset as any).aozoraRuby;
			}
			span.textContent = segment.text;
			parent.appendChild(span);
		};

		const appendWidget = (widget: InlineWidget) => {
			if (widget.kind !== "math-inline") return;
			const wrap = document.createElement("span");
			wrap.className =
				"tategaki-md-inline-widget tategaki-md-math-inline-widget";
			wrap.dataset.from = String(widget.from - lineRange.from);
			wrap.dataset.to = String(widget.to - lineRange.from);
			wrap.dataset.widgetKind = widget.kind;
			try {
				const el = renderMath(widget.source, false);
				wrap.appendChild(el);
				this.scheduleFinishRenderMath();
			} catch (_) {
				wrap.textContent = `$${widget.source}$`;
				wrap.classList.add("is-fallback");
			}
			parent.appendChild(wrap);
		};

		const insertOffset = pending
			? Math.max(
					lineRange.from,
					Math.min(pending.insertOffset, lineRange.to),
				)
			: null;
		const splitOffsets = widgets.map((w) => w.from);
		if (insertOffset !== null) splitOffsets.push(insertOffset);
		const sliced = this.splitSegmentsAtOffsets(
			segments,
			Array.from(new Set(splitOffsets)),
		);

		let segIndex = 0;
		let widgetIndex = 0;
		let pendingInserted = insertOffset === null;

		const nextFrom = (): number | null => {
			const seg = sliced[segIndex];
			const widget = widgets[widgetIndex];
			const segFrom = seg ? seg.from : null;
			const widgetFrom = widget ? widget.from : null;
			const pendingFrom = pendingInserted ? null : insertOffset;
			let best: number | null = null;
			for (const v of [segFrom, widgetFrom, pendingFrom]) {
				if (v === null) continue;
				if (best === null || v < best) best = v;
			}
			return best;
		};

		for (;;) {
			const at = nextFrom();
			if (at === null) break;
			if (
				!pendingInserted &&
				insertOffset !== null &&
				at === insertOffset
			) {
				const spacer = document.createElement("span");
				spacer.className = "tategaki-sot-pending-spacer";
				spacer.textContent = pending?.pendingText ?? "";
				parent.appendChild(spacer);
				this.pendingSpacerEl = spacer;
				pendingInserted = true;
				continue;
			}
			const widget = widgets[widgetIndex];
			if (widget && widget.from === at) {
				appendWidget(widget);
				widgetIndex += 1;
				continue;
			}
			const seg = sliced[segIndex];
			if (seg && seg.from === at) {
				appendSegment(seg);
				segIndex += 1;
				continue;
			}
			break;
		}

		for (; widgetIndex < widgets.length; widgetIndex += 1) {
			appendWidget(widgets[widgetIndex]!);
		}
		for (; segIndex < sliced.length; segIndex += 1) {
			appendSegment(sliced[segIndex]!);
		}
		if (!pendingInserted && insertOffset !== null) {
			const spacer = document.createElement("span");
			spacer.className = "tategaki-sot-pending-spacer";
			spacer.textContent = pending?.pendingText ?? "";
			parent.appendChild(spacer);
			this.pendingSpacerEl = spacer;
		}
	}

	private getWidgetRenderContext(): SoTWidgetRenderContext {
		return {
			app: this.app,
			getDoc: () => this.sotEditor?.getDoc() ?? null,
			getSourcePath: () => this.currentFile?.path ?? "",
			lineRanges: this.lineRanges,
			lineMathBlockStart: this.lineMathBlockStart,
			lineMathBlockEnd: this.lineMathBlockEnd,
			lineCalloutBlockStart: this.lineCalloutBlockStart,
			lineCalloutBlockEnd: this.lineCalloutBlockEnd,
			lineTableBlockStart: this.lineTableBlockStart,
			lineTableBlockEnd: this.lineTableBlockEnd,
			lineDeflistBlockStart: this.lineDeflistBlockStart,
			lineDeflistBlockEnd: this.lineDeflistBlockEnd,
			addChild: (child) => this.addChild(child),
			mathRenderChildren: this.mathRenderChildren,
			calloutRenderChildren: this.calloutRenderChildren,
			tableRenderChildren: this.tableRenderChildren,
			deflistRenderChildren: this.deflistRenderChildren,
			embedRenderChildren: this.embedRenderChildren,
		};
	}

	private renderLineFromSegments(
		lineEl: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		pending?: { insertOffset: number; pendingText: string } | undefined,
		inlineWidgets?: InlineWidget[],
	): void {
		lineEl.replaceChildren();

		const mdKind = lineEl.dataset.mdKind ?? "";
		const widgetContext = this.getWidgetRenderContext();
		if (mdKind === "image-widget") {
			renderImageWidgetLine(widgetContext, lineEl, lineRange);
			return;
		}
		if (mdKind === "math-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderMathWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null,
			);
			return;
		}
		if (mdKind === "math-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "callout-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderCalloutWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null,
			);
			return;
		}
		if (mdKind === "callout-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "table-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderTableWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null,
			);
			return;
		}
		if (mdKind === "table-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "deflist-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderDeflistWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null,
			);
			return;
		}
		if (mdKind === "deflist-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "heading-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "embed-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderEmbedWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null,
			);
			return;
		}
		if (mdKind === "table-row") {
			this.renderTableRowLine(
				lineEl,
				lineRange,
				segments,
				inlineWidgets ?? [],
				pending,
			);
			return;
		}
		if (mdKind === "table-sep") {
			const sep = document.createElement("span");
			sep.className = "tategaki-md-table-sep-line";
			sep.textContent = "\u200b";
			lineEl.appendChild(sep);

			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}

		const prefix = this.createLinePrefixElement(lineEl);
		if (prefix) {
			lineEl.appendChild(prefix);
		}

		this.renderInlineSegmentsWithWidgets(
			lineEl,
			lineRange,
			segments,
			inlineWidgets ?? [],
			pending,
		);

		// CEモードで空行の場合、IME入力用のプレースホルダーを追加
		// IMEはテキストノード内にキャレットがある場合に正しく動作するため、
		// eol（display: inline-block）ではなく専用の入力用spanを使用する
		const isEmptyLine = lineRange.from === lineRange.to;
		if (this.ceImeMode && isEmptyLine) {
			const inputPlaceholder = document.createElement("span");
			inputPlaceholder.className = "tategaki-sot-ce-input-placeholder";
			inputPlaceholder.textContent = "\u200b";
			lineEl.appendChild(inputPlaceholder);
		}

		// 折りたたまれている見出しにellipsisインジケーターを追加
		if (mdKind === "heading" && lineEl.dataset.headingCollapsed === "1") {
			const ellipsis = document.createElement("span");
			ellipsis.className = "tategaki-md-heading-ellipsis";
			setIcon(ellipsis, "message-circle-more");

			// 折りたたまれたコンテンツのプレビューを取得
			const lineIndex = Number.parseInt(lineEl.dataset.line ?? "", 10);
			if (Number.isFinite(lineIndex)) {
				const previewText = this.getCollapsedContentPreview(
					lineIndex,
					3,
				);
				if (previewText) {
					ellipsis.setAttribute("data-preview", previewText);

					// ツールチップ表示用のイベントハンドラ
					ellipsis.addEventListener("mouseenter", (e) => {
						this.showCollapsePreviewTooltip(
							e.target as HTMLElement,
							previewText,
						);
					});
					ellipsis.addEventListener("mouseleave", () => {
						this.hideCollapsePreviewTooltip();
					});
				}
			}

			lineEl.appendChild(ellipsis);
		}

		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
	}

	private scheduleFinishRenderMath(): void {
		if (this.finishRenderMathTimer !== null) return;
		this.finishRenderMathTimer = window.setTimeout(() => {
			this.finishRenderMathTimer = null;
			finishRenderMath().catch(() => {});
		}, 0);
	}

	private renderTableRowLine(
		lineEl: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		inlineWidgets: InlineWidget[],
		pending?: { insertOffset: number; pendingText: string } | undefined,
	): void {
		const lineText = this.getLineText(lineRange);
		const pipeOffsets = this.getTablePipeOffsets(lineText);
		const internalPipeCuts = pipeOffsets
			.filter((rel) => rel > 0 && rel < Math.max(0, lineText.length - 1))
			.map((rel) => lineRange.from + rel + 1);
		const cutOffsets = [lineRange.from, ...internalPipeCuts, lineRange.to]
			.filter((v, idx, arr) => arr.indexOf(v) === idx)
			.sort((a, b) => a - b);

		const splitAt = cutOffsets
			.slice(1, -1)
			.filter((o) => o > lineRange.from && o < lineRange.to);
		const sliced = this.splitSegmentsAtOffsets(segments, splitAt);

		const prefix = this.createLinePrefixElement(lineEl);
		if (prefix) {
			lineEl.appendChild(prefix);
		}

		const container = document.createElement("span");
		container.className = "tategaki-md-table-row-container";
		lineEl.appendChild(container);

		let segIndex = 0;
		for (let i = 0; i < cutOffsets.length - 1; i += 1) {
			const from = cutOffsets[i]!;
			const to = cutOffsets[i + 1]!;
			if (to <= from) continue;

			const cell = document.createElement("span");
			cell.className = "tategaki-md-table-cell";
			container.appendChild(cell);

			const cellSegs: RenderSegment[] = [];
			while (segIndex < sliced.length) {
				const seg = sliced[segIndex]!;
				if (seg.from < from) {
					segIndex += 1;
					continue;
				}
				if (seg.from >= to) break;
				cellSegs.push(seg);
				segIndex += 1;
			}
			const cellWidgets = (inlineWidgets ?? []).filter(
				(w) => w.from >= from && w.from < to,
			);
			let cellPending:
				| { insertOffset: number; pendingText: string }
				| undefined;
			if (pending) {
				const insertOffset = Math.max(
					lineRange.from,
					Math.min(pending.insertOffset, lineRange.to),
				);
				if (insertOffset >= from && insertOffset <= to) {
					cellPending = {
						insertOffset,
						pendingText: pending.pendingText,
					};
				}
			}
			this.renderInlineSegmentsWithWidgets(
				cell,
				lineRange,
				cellSegs,
				cellWidgets,
				cellPending,
			);
		}

		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
	}

	private splitSegmentsAtOffsets(
		segments: RenderSegment[],
		offsets: number[],
	): RenderSegment[] {
		if (offsets.length === 0) return segments;
		const sorted = Array.from(new Set(offsets)).sort((a, b) => a - b);
		let remaining = segments;
		const result: RenderSegment[] = [];
		for (const offset of sorted) {
			const split = this.splitSegmentsAtOffset(remaining, offset);
			result.push(...split.before);
			remaining = split.after;
		}
		result.push(...remaining);
		return result;
	}

	private getTablePipeOffsets(lineText: string): number[] {
		const offsets: number[] = [];
		const isEscaped = (index: number): boolean => {
			let backslashes = 0;
			for (let i = index - 1; i >= 0; i -= 1) {
				if (lineText[i] !== "\\") break;
				backslashes += 1;
			}
			return backslashes % 2 === 1;
		};
		let inCodeFenceLen: number | null = null;
		for (let i = 0; i < lineText.length; i += 1) {
			const ch = lineText[i]!;
			if (ch === "`" && !isEscaped(i)) {
				let fenceLen = 1;
				while (
					i + fenceLen < lineText.length &&
					lineText[i + fenceLen] === "`"
				) {
					fenceLen += 1;
				}
				if (inCodeFenceLen === null) {
					inCodeFenceLen = fenceLen;
				} else if (inCodeFenceLen === fenceLen) {
					inCodeFenceLen = null;
				}
				i += fenceLen - 1;
				continue;
			}
			if (inCodeFenceLen !== null) continue;
			if (ch !== "|") continue;
			if (isEscaped(i)) continue;
			offsets.push(i);
		}
		return offsets;
	}

	private getLineElement(index: number): HTMLElement | null {
		const offset = this.getLineElementOffset();
		const element = this.derivedContentEl?.children[index + offset] as
			| HTMLElement
			| undefined;
		return element ?? null;
	}

	private getLineElementOffset(): number {
		if (!this.derivedContentEl) return 0;
		const first = this.derivedContentEl.firstElementChild;
		return first?.classList.contains("tategaki-frontmatter") ? 1 : 0;
	}

	private getLineText(range: LineRange): string {
		return this.sotEditor?.getDoc().slice(range.from, range.to) ?? "";
	}

	private findLineIndex(offset: number): number | null {
		return this.findLineIndexInRanges(this.lineRanges, offset);
	}

	private findLineIndexInRanges(
		ranges: LineRange[],
		offset: number,
	): number | null {
		if (ranges.length === 0) return null;
		let low = 0;
		let high = ranges.length - 1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const range = ranges[mid];
			if (!range) return null;
			if (offset < range.from) {
				high = mid - 1;
			} else if (offset > range.to) {
				low = mid + 1;
			} else {
				return mid;
			}
		}
		return null;
	}

	private getCaretRectInLine(
		lineEl: HTMLElement,
		localOffset: number,
		lineRange: LineRange,
		writingMode = "",
	): DOMRect | null {
		const mdKind = lineEl.dataset.mdKind ?? "";
		if (
			mdKind === "image-widget" ||
			mdKind === "embed-widget" ||
			mdKind === "math-widget" ||
			mdKind === "math-hidden" ||
			mdKind === "callout-widget" ||
			mdKind === "callout-hidden" ||
			mdKind === "table-widget" ||
			mdKind === "table-hidden" ||
			mdKind === "deflist-widget" ||
			mdKind === "deflist-hidden"
		) {
			const eol = lineEl.querySelector(
				".tategaki-sot-eol",
			) as HTMLElement | null;
			return (
				eol?.getBoundingClientRect() ?? lineEl.getBoundingClientRect()
			);
		}
		const lineLength = lineRange.to - lineRange.from;
		if (lineLength === 0) {
			const placeholderTextNode = this.ceImeMode
				? this.ensureCeInputPlaceholderNode(lineEl)
				: null;
			const eol = lineEl.querySelector(
				".tategaki-sot-eol",
			) as HTMLElement | null;
			const node =
				placeholderTextNode ??
				(eol?.firstChild && eol.firstChild.nodeType === Node.TEXT_NODE
					? (eol.firstChild as Text)
					: null);
			if (node) {
				const range = document.createRange();
				range.setStart(node, 0);
				range.setEnd(node, 0);
				const rect = this.pickCaretRectFromRange(range, writingMode);
				if (rect) return rect;
			}
			const lineRect = lineEl.getBoundingClientRect();
			return DOMRect.fromRect({
				x: lineRect.left,
				y: lineRect.top,
				width: 0,
				height: lineRect.height,
			});
		}
		if (localOffset >= lineLength) {
			const nodes = this.getLineTextNodes(lineEl);
			const last = nodes[nodes.length - 1];
			if (last) {
				const range = document.createRange();
				range.setStart(last, last.length);
				range.setEnd(last, last.length);
				const rect = this.pickCaretRectFromRange(range, writingMode);
				if (rect) return rect;
			}
			const eol = lineEl.querySelector(
				".tategaki-sot-eol",
			) as HTMLElement | null;
			return (
				eol?.getBoundingClientRect() ?? lineEl.getBoundingClientRect()
			);
		}
		const getCharRect = (offset: number): DOMRect | null => {
			if (offset < 0 || offset >= lineLength) return null;
			const start = this.findTextNodeAtOffset(lineEl, offset);
			const end = this.findTextNodeAtOffset(lineEl, offset + 1);
			if (!start || !end) return null;
			const range = document.createRange();
			range.setStart(start.node, start.offset);
			range.setEnd(end.node, end.offset);
			return (
				this.pickCaretRectFromRange(range, writingMode) ??
				range.getBoundingClientRect()
			);
		};
		if (localOffset > 0 && localOffset < lineLength) {
			const prevRect = getCharRect(localOffset - 1);
			const nextRect = getCharRect(localOffset);
			if (prevRect && nextRect) {
				const isVertical = writingMode.startsWith("vertical");
				const delta = isVertical
					? Math.abs(prevRect.left - nextRect.left)
					: Math.abs(prevRect.top - nextRect.top);
				const threshold = isVertical
					? Math.max(1, prevRect.width * 0.5)
					: Math.max(1, prevRect.height * 0.5);
				if (delta > threshold) {
					return nextRect;
				}
			}
		}
		const target = this.findTextNodeAtOffset(lineEl, localOffset);
		if (!target) {
			return lineEl.getBoundingClientRect();
		}
		const range = document.createRange();
		range.setStart(target.node, target.offset);
		range.setEnd(target.node, target.offset);
		return (
			this.pickCaretRectFromRange(range, writingMode) ??
			lineEl.getBoundingClientRect()
		);
	}

	private pickCaretRectFromRange(
		range: Range,
		writingMode: string,
	): DOMRect | null {
		const rects = range.getClientRects();
		if (rects.length === 0) {
			return range.getBoundingClientRect();
		}
		if (rects.length === 1) {
			return rects[0] ?? null;
		}
		const isVertical = writingMode.startsWith("vertical");
		if (isVertical) {
			const isVerticalRL = writingMode !== "vertical-lr";
			let best = rects[0];
			for (const rect of Array.from(rects)) {
				if (isVerticalRL) {
					// 折り返し地点などで複数のRectがある場合、前の行（右側）を優先して採用する
					if (rect.left > best.left) best = rect;
				} else if (rect.left < best.left) {
					// vertical-lrの場合は左から右へ進むので、前の行は左側
					best = rect;
				}
			}
			return best;
		}
		let best = rects[0];
		for (const rect of Array.from(rects)) {
			// 横書きでも同様に前の行（上側）を優先する
			if (rect.top < best.top) best = rect;
		}
		return best;
	}

	private findTextNodeAtOffset(
		lineEl: HTMLElement,
		localOffset: number,
	): { node: Text; offset: number } | null {
		const lineFrom = Number.parseInt(lineEl.dataset.from ?? "0", 10);
		const lineTo = Number.parseInt(lineEl.dataset.to ?? "0", 10);
		const lineLength = Math.max(0, lineTo - lineFrom);
		const safeLocal = Math.max(0, Math.min(localOffset, lineLength));

		const runs = Array.from(
			lineEl.querySelectorAll(".tategaki-sot-run"),
		) as HTMLElement[];
		if (runs.length === 0) {
			// 旧描画（プレーン）向けフォールバック
			const nodes = this.getLineTextNodes(lineEl);
			let remaining = safeLocal;
			for (const node of nodes) {
				if (remaining <= node.length) {
					return { node, offset: Math.max(0, remaining) };
				}
				remaining -= node.length;
			}
			const last = nodes[nodes.length - 1];
			if (last) {
				return { node: last, offset: last.length };
			}
			return null;
		}

		type RunInfo = {
			el: HTMLElement;
			from: number;
			to: number;
			textNode: Text | null;
		};
		const runInfos: RunInfo[] = runs
			.map((el) => {
				const from = Number.parseInt(el.dataset.from ?? "", 10);
				const to = Number.parseInt(el.dataset.to ?? "", 10);
				const textNode =
					el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE
						? (el.firstChild as Text)
						: null;
				return { el, from, to, textNode };
			})
			.filter(
				(info) =>
					Number.isFinite(info.from) &&
					Number.isFinite(info.to) &&
					info.to >= info.from &&
					!!info.textNode,
			)
			.sort((a, b) => a.from - b.from || a.to - b.to);

		const first = runInfos[0];
		const last = runInfos[runInfos.length - 1];
		if (!first || !last) return null;

		if (safeLocal <= first.from) {
			return { node: first.textNode!, offset: 0 };
		}
		if (safeLocal >= last.to) {
			const len = last.to - last.from;
			return {
				node: last.textNode!,
				offset: Math.max(0, Math.min(len, last.textNode!.length)),
			};
		}

		for (let i = 0; i < runInfos.length; i += 1) {
			const run = runInfos[i]!;
			if (safeLocal >= run.from && safeLocal <= run.to) {
				const offsetInRun = Math.max(0, safeLocal - run.from);
				const clamped = Math.min(offsetInRun, run.textNode!.length);
				return { node: run.textNode!, offset: clamped };
			}
			const next = runInfos[i + 1];
			if (next && safeLocal > run.to && safeLocal < next.from) {
				// マーカー等の「不可視領域」→次の可視文字の先頭へ寄せる
				return { node: next.textNode!, offset: 0 };
			}
		}
		return {
			node: last.textNode!,
			offset: Math.max(
				0,
				Math.min(last.to - last.from, last.textNode!.length),
			),
		};
	}

	private getLineTextNodes(lineEl: HTMLElement): Text[] {
		const nodes: Text[] = [];
		const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
		let current = walker.nextNode() as Text | null;
		while (current) {
			if (
				!this.isPendingTextNode(current) &&
				!this.isEolTextNode(current) &&
				!this.isCeInputPlaceholderTextNode(current) &&
				!this.isInlineWidgetTextNode(current)
			) {
				nodes.push(current);
			}
			current = walker.nextNode() as Text | null;
		}
		return nodes;
	}

	private isPendingTextNode(node: Node): boolean {
		const parent = node.parentElement;
		return !!parent?.classList.contains("tategaki-sot-pending-spacer");
	}

	private isEolTextNode(node: Node): boolean {
		const parent = node.parentElement;
		return !!parent?.classList.contains("tategaki-sot-eol");
	}

	private isCeInputPlaceholderTextNode(node: Node): boolean {
		const parent = node.parentElement;
		return !!parent?.classList.contains(
			"tategaki-sot-ce-input-placeholder",
		);
	}

	private ensureCeInputPlaceholderNode(lineEl: HTMLElement): Text | null {
		if (!this.ceImeMode) return null;
		let placeholder = lineEl.querySelector(
			".tategaki-sot-ce-input-placeholder",
		) as HTMLElement | null;
		if (!placeholder) {
			placeholder = document.createElement("span");
			placeholder.className = "tategaki-sot-ce-input-placeholder";
			placeholder.textContent = "\u200b";
			const eol = lineEl.querySelector(
				".tategaki-sot-eol",
			) as HTMLElement | null;
			if (eol) {
				lineEl.insertBefore(placeholder, eol);
			} else {
				lineEl.appendChild(placeholder);
			}
		}
		const node = placeholder.firstChild;
		if (node?.nodeType === Node.TEXT_NODE) {
			return node as Text;
		}
		return null;
	}

	private isInlineWidgetTextNode(node: Node): boolean {
		const parent = node.parentElement;
		return !!parent?.closest(".tategaki-md-inline-widget");
	}

	private isUnsafeCeSelectionNode(node: Node | null): boolean {
		if (!node) return false;
		if (this.isPendingTextNode(node) || this.isEolTextNode(node)) {
			return true;
		}
		const element =
			node instanceof Element ? node : (node.parentElement ?? null);
		if (!element) return false;
		if (element.classList.contains("tategaki-sot-line")) return true;
		if (element.closest(".tategaki-sot-eol")) return true;
		if (element.closest(".tategaki-sot-pending-spacer")) return true;
		return false;
	}

	private scheduleCeSafetyCheck(): void {
		if (Platform.isMobile || Platform.isMobileApp) {
			return;
		}
		if (
			!this.ceImeMode ||
			this.ceImeComposing ||
			this.ceImeSelectionSyncing ||
			this.ceImeFallbackActive
		) {
			return;
		}
		const now = Date.now();
		if (now - this.ceSafetyCheckAt < 80) {
			return;
		}
		if (this.ceSafetyCheckRaf !== null) {
			return;
		}
		this.ceSafetyCheckRaf = window.requestAnimationFrame(() => {
			this.ceSafetyCheckRaf = null;
			this.ceSafetyCheckAt = Date.now();
			this.verifyCeSelectionContext();
		});
	}

	private verifyCeSelectionContext(): void {
		if (
			!this.ceImeMode ||
			this.ceImeComposing ||
			this.ceImeSelectionSyncing ||
			!this.sotEditor ||
			!this.derivedContentEl
		) {
			return;
		}
		const selection = this.derivedContentEl.ownerDocument.getSelection();
		if (!selection || !selection.isCollapsed) {
			return;
		}
		if (!this.isSelectionInsideDerivedContent(selection)) {
			return;
		}
		const anchorNode = selection.anchorNode;
		if (!anchorNode) return;

		const lineEl = this.getLineElementForNode(anchorNode);
		if (!lineEl) return;
		if (this.shouldSkipCeSafetyCheckLine(lineEl)) return;

		const from = Number.parseInt(lineEl.dataset.from ?? "0", 10);
		const to = Number.parseInt(lineEl.dataset.to ?? "0", 10);
		const lineLength = Math.max(0, to - from);
		if (lineLength === 0) return;

		if (anchorNode.nodeType !== Node.TEXT_NODE) {
			if (this.isUnsafeCeSelectionNode(anchorNode)) {
				this.recordCeMappingFailure("verification", true);
			}
			return;
		}
		if (
			this.isPendingTextNode(anchorNode) ||
			this.isEolTextNode(anchorNode) ||
			this.isCeInputPlaceholderTextNode(anchorNode)
		) {
			this.recordCeMappingFailure("verification", true);
			return;
		}

		const localOffset = this.resolveOffsetFromCaretPosition(
			lineEl,
			{ node: anchorNode, offset: selection.anchorOffset },
			lineLength,
		);
		if (localOffset === null) {
			this.recordCeMappingFailure("verification", true);
			return;
		}
		const docOffset = from + localOffset;
		const segments = this.buildSegmentsForLine(from, to);
		if (segments.length === 0) return;

		const visibleLength = segments.reduce(
			(sum, seg) => sum + seg.text.length,
			0,
		);
		if (visibleLength === 0 || visibleLength > 2000) return;

		const visibleOffset = this.getVisibleOffsetFromSegments(
			segments,
			docOffset,
		);
		const domOffset = this.getVisibleOffsetFromDomPosition(
			lineEl,
			anchorNode as Text,
			selection.anchorOffset,
		);
		if (domOffset === null) {
			this.recordCeMappingFailure("verification", true);
			return;
		}
		if (Math.abs(domOffset - visibleOffset) > 1) {
			this.recordCeMappingFailure("verification", true);
			return;
		}
		const windowSize = 16;
		const start = Math.max(0, visibleOffset - windowSize);
		const end = Math.min(visibleLength, visibleOffset + windowSize);
		const expected = this.getSegmentsTextRange(segments, start, end);
		const actual = this.getDomTextRange(lineEl, start, end);
		if (expected !== actual) {
			this.recordCeMappingFailure("verification", true);
		}
	}

	private shouldSkipCeSafetyCheckLine(lineEl: HTMLElement): boolean {
		const kind = lineEl.dataset.mdKind ?? "";
		if (
			kind.endsWith("-widget") ||
			kind.endsWith("-hidden") ||
			kind === "table-row" ||
			kind === "table-sep"
		) {
			return true;
		}
		return lineEl.querySelector(".tategaki-md-inline-widget") !== null;
	}

	private getVisibleOffsetFromSegments(
		segments: RenderSegment[],
		docOffset: number,
	): number {
		let visible = 0;
		for (const seg of segments) {
			if (docOffset <= seg.from) {
				return visible;
			}
			if (docOffset < seg.to) {
				return visible + Math.max(0, docOffset - seg.from);
			}
			visible += seg.to - seg.from;
		}
		return visible;
	}

	private getVisibleOffsetFromDomPosition(
		lineEl: HTMLElement,
		node: Text,
		offset: number,
	): number | null {
		const nodes = this.getLineTextNodes(lineEl);
		let total = 0;
		for (const textNode of nodes) {
			if (textNode === node) {
				return total + Math.max(0, Math.min(offset, textNode.length));
			}
			total += textNode.length;
		}
		return null;
	}

	private getSegmentsTextRange(
		segments: RenderSegment[],
		start: number,
		end: number,
	): string {
		if (end <= start) return "";
		let visible = 0;
		const parts: string[] = [];
		for (const seg of segments) {
			const segLen = seg.text.length;
			const segStart = visible;
			const segEnd = visible + segLen;
			if (segEnd <= start) {
				visible = segEnd;
				continue;
			}
			if (segStart >= end) break;
			const sliceStart = Math.max(0, start - segStart);
			const sliceEnd = Math.min(segLen, end - segStart);
			if (sliceEnd > sliceStart) {
				parts.push(seg.text.slice(sliceStart, sliceEnd));
			}
			visible = segEnd;
		}
		return parts.join("");
	}

	private getDomTextRange(
		lineEl: HTMLElement,
		start: number,
		end: number,
	): string {
		if (end <= start) return "";
		const nodes = this.getLineTextNodes(lineEl);
		let visible = 0;
		const parts: string[] = [];
		for (const textNode of nodes) {
			const segLen = textNode.length;
			const segStart = visible;
			const segEnd = visible + segLen;
			if (segEnd <= start) {
				visible = segEnd;
				continue;
			}
			if (segStart >= end) break;
			const sliceStart = Math.max(0, start - segStart);
			const sliceEnd = Math.min(segLen, end - segStart);
			if (sliceEnd > sliceStart) {
				parts.push(textNode.data.slice(sliceStart, sliceEnd));
			}
			visible = segEnd;
		}
		return parts.join("");
	}

	private resolveOffsetFromCaretPosition(
		lineEl: HTMLElement,
		position: { node: Node; offset: number } | null,
		lineLength: number,
	): number | null {
		if (!position) return null;
		const { node, offset } = position;
		if (!lineEl.contains(node)) return null;
		const avoidMarkerGapJump = this.isCeRangeSelectionBoundary(
			lineEl,
			node,
			offset,
		);
		if (
			node instanceof Element &&
			node.classList.contains("tategaki-sot-line")
		) {
			return this.resolveOffsetFromLineElementSelection(
				lineEl,
				offset,
				lineLength,
			);
		}
		if (this.isPendingTextNode(node)) {
			return this.pendingLocalOffset ?? 0;
		}
		if (this.isEolTextNode(node)) {
			return lineLength;
		}
		// CEモードの空行用プレースホルダー内のテキストノードの場合、
		// 空行なのでオフセットは常に0
		if (this.isCeInputPlaceholderTextNode(node)) {
			return 0;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			return this.calculateOffsetWithinLine(
				lineEl,
				node as Text,
				offset,
				avoidMarkerGapJump,
			);
		}
		if (node instanceof Element) {
			if (node.classList.contains("tategaki-sot-run")) {
				const child = node.firstChild;
				if (child?.nodeType === Node.TEXT_NODE) {
					const textNode = child as Text;
					const safeOffset = offset > 0 ? textNode.length : 0;
					return this.calculateOffsetWithinLine(
						lineEl,
						textNode,
						safeOffset,
						avoidMarkerGapJump,
					);
				}
			}
			if (node.classList.contains("tategaki-sot-eol")) {
				return lineLength;
			}
			// CEモードの空行用プレースホルダー要素の場合
			if (node.classList.contains("tategaki-sot-ce-input-placeholder")) {
				return 0;
			}
			const child = node.firstChild;
			if (child?.nodeType === Node.TEXT_NODE) {
				const textNode = child as Text;
				const safeOffset = offset > 0 ? textNode.length : 0;
				return this.calculateOffsetWithinLine(
					lineEl,
					textNode,
					safeOffset,
					avoidMarkerGapJump,
				);
			}
		}
		return null;
	}

	private isCeRangeSelectionBoundary(
		lineEl: HTMLElement,
		node: Node,
		offset: number,
	): boolean {
		if (!this.ceImeMode) return false;
		const selection = lineEl.ownerDocument.getSelection();
		if (!selection || selection.isCollapsed) return false;
		return (
			(selection.anchorNode === node && selection.anchorOffset === offset) ||
			(selection.focusNode === node && selection.focusOffset === offset)
		);
	}

	private resolveOffsetFromLineElementSelection(
		lineEl: HTMLElement,
		offset: number,
		lineLength: number,
	): number {
		const childCount = lineEl.childNodes.length;
		if (childCount === 0) return 0;
		if (offset <= 0) return 0;
		if (offset >= childCount) return lineLength;

		const resolveFromNode = (
			node: ChildNode,
			preferAfter: boolean,
		): number | null => {
			if (this.isPendingTextNode(node)) {
				return this.pendingLocalOffset ?? 0;
			}
			if (this.isEolTextNode(node)) {
				return lineLength;
			}
			if (this.isCeInputPlaceholderTextNode(node)) {
				return 0;
			}
			if (node.nodeType === Node.TEXT_NODE) {
				const textNode = node as Text;
				const safeOffset = preferAfter ? textNode.length : 0;
				return this.calculateOffsetWithinLine(
					lineEl,
					textNode,
					safeOffset,
				);
			}
			if (node instanceof Element) {
				if (node.classList.contains("tategaki-sot-eol")) {
					return lineLength;
				}
				if (
					node.classList.contains("tategaki-sot-ce-input-placeholder")
				) {
					return 0;
				}
				if (
					node.classList.contains("tategaki-sot-run") ||
					node.classList.contains("tategaki-md-inline-widget")
				) {
					const element = node as HTMLElement;
					const from = Number.parseInt(
						element.dataset.from ?? "",
						10,
					);
					const to = Number.parseInt(element.dataset.to ?? "", 10);
					if (Number.isFinite(from) && Number.isFinite(to)) {
						return preferAfter ? to : from;
					}
				}
				const child = node.firstChild;
				if (child?.nodeType === Node.TEXT_NODE) {
					const textNode = child as Text;
					const safeOffset = preferAfter ? textNode.length : 0;
					return this.calculateOffsetWithinLine(
						lineEl,
						textNode,
						safeOffset,
					);
				}
			}
			return null;
		};

		const prevNode = lineEl.childNodes[offset - 1] ?? null;
		const nextNode = lineEl.childNodes[offset] ?? null;
		if (prevNode) {
			const resolved = resolveFromNode(prevNode, true);
			if (resolved !== null) return resolved;
		}
		if (nextNode) {
			const resolved = resolveFromNode(nextNode, false);
			if (resolved !== null) return resolved;
		}
		return lineLength;
	}

	private getEdgeOffsetFromPoint(
		lineEl: HTMLElement,
		clientX: number,
		clientY: number,
		rects: DOMRect[],
		lineLength: number,
	): number {
		if (lineLength <= 0) return 0;
		const baseRect = getRectUnion(rects, lineEl.getBoundingClientRect());
		const writingMode = window.getComputedStyle(
			this.derivedRootEl ?? lineEl,
		).writingMode;
		if (writingMode.startsWith("vertical")) {
			const isVerticalRL = writingMode !== "vertical-lr";
			if (isVerticalRL) {
				return clientX < baseRect.left ? lineLength : 0;
			}
			return clientX > baseRect.right ? lineLength : 0;
		}
		if (clientX <= baseRect.left || clientY <= baseRect.top) return 0;
		if (clientX >= baseRect.right || clientY >= baseRect.bottom) {
			return lineLength;
		}
		return 0;
	}

	private getLocalOffsetFromPoint(
		lineEl: HTMLElement,
		clientX: number,
		clientY: number,
		lineLength: number,
	): number | null {
		if (lineLength <= 0) return 0;
		const doc = lineEl.ownerDocument;
		if (!doc) return null;

		const directOffset = this.resolveOffsetFromCaretPosition(
			lineEl,
			getCaretPositionFromPoint(doc, clientX, clientY),
			lineLength,
		);
		if (directOffset !== null) {
			return Math.max(0, Math.min(directOffset, lineLength));
		}

		const rects = this.getLineVisualRects(lineEl);
		const targetRect =
			rects.length > 0
				? rects[this.findClosestRectIndex(rects, clientX, clientY)]
				: lineEl.getBoundingClientRect();
		const targetPoint = getClampedPointInRect(targetRect, clientX, clientY);
		const fallbackOffset = this.resolveOffsetFromCaretPosition(
			lineEl,
			getCaretPositionFromPoint(doc, targetPoint.x, targetPoint.y),
			lineLength,
		);
		if (fallbackOffset !== null) {
			return Math.max(0, Math.min(fallbackOffset, lineLength));
		}

		return this.getEdgeOffsetFromPoint(
			lineEl,
			clientX,
			clientY,
			rects,
			lineLength,
		);
	}

	private calculateOffsetWithinLine(
		lineEl: HTMLElement,
		node: Text,
		nodeOffset: number,
		avoidMarkerGapJump = false,
	): number {
		const lineFrom = Number.parseInt(lineEl.dataset.from ?? "0", 10);
		const lineTo = Number.parseInt(lineEl.dataset.to ?? "0", 10);
		const lineLength = Math.max(0, lineTo - lineFrom);
		const runEl = node.parentElement?.closest(
			".tategaki-sot-run",
		) as HTMLElement | null;
		if (runEl) {
			const runFrom = Number.parseInt(runEl.dataset.from ?? "", 10);
			const runTo = Number.parseInt(runEl.dataset.to ?? "", 10);
			if (Number.isFinite(runFrom) && Number.isFinite(runTo)) {
				const runLen = Math.max(0, runTo - runFrom);
				const safeOffset = Math.max(0, Math.min(nodeOffset, runLen));
				if (safeOffset >= runLen && !avoidMarkerGapJump) {
					let next = runEl.nextElementSibling as HTMLElement | null;
					while (next) {
						if (next.classList.contains("tategaki-sot-run")) {
							const nextFrom = Number.parseInt(
								next.dataset.from ?? "",
								10,
							);
							if (Number.isFinite(nextFrom) && nextFrom > runTo) {
								return Math.max(
									0,
									Math.min(nextFrom, lineLength),
								);
							}
							break;
						}
						next = next.nextElementSibling as HTMLElement | null;
					}
				}
				const local = runFrom + safeOffset;
				return Math.max(0, Math.min(local, lineLength));
			}
		}

		// フォールバック: プレーン描画用（textノード長ベース）
		const nodes = this.getLineTextNodes(lineEl);
		let total = 0;
		for (const textNode of nodes) {
			if (textNode === node) {
				return total + Math.min(nodeOffset, textNode.length);
			}
			total += textNode.length;
		}
		return Math.max(0, Math.min(total, lineLength));
	}

	private getVisualMoveInfo(
		key: string,
		writingMode: string,
	): { offset: number | null; atBoundary: boolean } | null {
		if (!this.derivedRootEl || !this.sotEditor) return null;
		const isVertical = writingMode.startsWith("vertical");
		const isHorizontal = !isVertical;
		const isVerticalKey = key === "ArrowLeft" || key === "ArrowRight";
		const isHorizontalKey = key === "ArrowUp" || key === "ArrowDown";
		if (
			(isVertical && !isVerticalKey) ||
			(isHorizontal && !isHorizontalKey)
		) {
			return null;
		}

		const selection = this.sotEditor.getSelection();
		const currentOffset = selection.head;
		const lineIndex = this.findLineIndex(currentOffset);
		if (lineIndex === null) return null;
		const lineRange = this.lineRanges[lineIndex];
		const lineEl = this.getLineElement(lineIndex);
		if (!lineRange || !lineEl) return null;

		const lineLength = lineRange.to - lineRange.from;
		if (lineLength <= 0) {
			return { offset: null, atBoundary: false };
		}
		const localOffset = Math.max(
			0,
			Math.min(currentOffset - lineRange.from, lineLength),
		);
		const caretRect = this.getCaretRectInLine(
			lineEl,
			localOffset,
			lineRange,
			writingMode,
		);
		if (!caretRect) return null;

		const rects = this.getLineVisualRects(lineEl);
		if (rects.length <= 1) {
			return { offset: null, atBoundary: false };
		}
		const sortedRects = rects
			.slice()
			.sort((a, b) =>
				isVertical
					? a.left - b.left || a.top - b.top
					: a.top - b.top || a.left - b.left,
			);

		const centerX = caretRect.left + (caretRect.width || 0) / 2;
		const centerY = caretRect.top + (caretRect.height || 0) / 2;
		const currentIndex = this.findClosestRectIndex(
			sortedRects,
			centerX,
			centerY,
		);
		const delta =
			isVertical && key === "ArrowLeft"
				? -1
				: isVertical && key === "ArrowRight"
					? 1
					: isHorizontal && key === "ArrowUp"
						? -1
						: 1;
		const nextIndex = currentIndex + delta;
		if (nextIndex < 0 || nextIndex >= sortedRects.length) {
			const docDirection = isVertical
				? writingMode === "vertical-lr"
					? key === "ArrowRight"
						? 1
						: -1
					: key === "ArrowLeft"
						? 1
						: -1
				: key === "ArrowDown"
					? 1
					: -1;
			const axisBase = isVertical ? caretRect.left : caretRect.top;
			const axisDir = isVertical
				? key === "ArrowRight"
					? 1
					: -1
				: key === "ArrowDown"
					? 1
					: -1;
			const nextVisual = this.findNextVisualLineOffsetInLine(
				lineEl,
				lineRange,
				currentOffset,
				writingMode,
				docDirection > 0,
				axisBase,
				axisDir,
			);
			if (nextVisual !== null) {
				return { offset: nextVisual, atBoundary: false };
			}
			const doc = this.sotEditor.getDoc();
			const logicalNext = this.getNextOffset(
				doc,
				currentOffset,
				key,
				writingMode,
			);
			const nextLineIndex = this.findLineIndex(logicalNext);
			if (nextLineIndex === null || nextLineIndex === lineIndex) {
				return { offset: currentOffset, atBoundary: false };
			}
			const nextLineEl = this.getLineElement(nextLineIndex);
			const nextRange = this.lineRanges[nextLineIndex];
			if (!nextLineEl || !nextRange) {
				return { offset: currentOffset, atBoundary: false };
			}
			const nextLength = Math.max(0, nextRange.to - nextRange.from);
			if (nextLength <= 0) {
				return { offset: nextRange.from, atBoundary: false };
			}
			const targetX = isVertical ? centerX : centerX;
			const targetY = isVertical ? centerY : centerY;
			const nextLocalOffset = this.getLocalOffsetFromPoint(
				nextLineEl,
				targetX,
				targetY,
				nextLength,
			);
			if (nextLocalOffset === null) {
				return { offset: nextRange.from, atBoundary: false };
			}
			const clamped = Math.max(0, Math.min(nextLocalOffset, nextLength));
			return { offset: nextRange.from + clamped, atBoundary: false };
		}

		const targetRect = sortedRects[nextIndex];
		let targetX = centerX;
		let targetY = centerY;
		if (isVertical) {
			targetX = targetRect.left + targetRect.width / 2;
			if (targetRect.height > 2) {
				const minY = targetRect.top + 1;
				const maxY = targetRect.bottom - 1;
				targetY = Math.max(minY, Math.min(centerY, maxY));
			}
		} else {
			targetY = targetRect.top + targetRect.height / 2;
			if (targetRect.width > 2) {
				const minX = targetRect.left + 1;
				const maxX = targetRect.right - 1;
				targetX = Math.max(minX, Math.min(centerX, maxX));
			}
		}
		const nextLocalOffset = this.getLocalOffsetFromPoint(
			lineEl,
			targetX,
			targetY,
			lineLength,
		);
		if (nextLocalOffset === null) {
			return { offset: null, atBoundary: true };
		}
		const clamped = Math.max(0, Math.min(nextLocalOffset, lineLength));
		let nextOffset = lineRange.from + clamped;

		// 画面外の座標では caretPositionFromPoint 系が失敗しやすく、フォールバックで
		// 行頭/行末(=段落先頭/末尾)に吸着してしまうことがある。
		// targetRect に入っていない/同位置のままの場合は、Rectを使わず「実際に次の視覚行へ到達するまで」
		// 文字オフセットを走査して求める（折り返し単位で1行ずつ移動するための保険）。
		const candidateCaretRect = this.getCaretRectInLine(
			lineEl,
			clamped,
			lineRange,
			writingMode,
		);
		const tol = 1;
		const candidateCenterX =
			(candidateCaretRect?.left ?? 0) +
			(candidateCaretRect?.width ?? 0) / 2;
		const candidateCenterY =
			(candidateCaretRect?.top ?? 0) +
			(candidateCaretRect?.height ?? 0) / 2;
		const inTargetRect =
			!!candidateCaretRect &&
			candidateCenterX >= targetRect.left - tol &&
			candidateCenterX <= targetRect.right + tol &&
			candidateCenterY >= targetRect.top - tol &&
			candidateCenterY <= targetRect.bottom + tol;

		if (!inTargetRect || nextOffset === currentOffset) {
			const docDirection = isVertical
				? writingMode === "vertical-lr"
					? key === "ArrowRight"
						? 1
						: -1
					: key === "ArrowLeft"
						? 1
						: -1
				: key === "ArrowDown"
					? 1
					: -1;
			const axisBase = isVertical ? caretRect.left : caretRect.top;
			const axisDir = isVertical
				? key === "ArrowRight"
					? 1
					: -1
				: key === "ArrowDown"
					? 1
					: -1;
			const fallback = this.findNextVisualLineOffsetInLine(
				lineEl,
				lineRange,
				currentOffset,
				writingMode,
				docDirection > 0,
				axisBase,
				axisDir,
			);
			if (fallback !== null && fallback !== currentOffset) {
				nextOffset = fallback;
				return { offset: nextOffset, atBoundary: false };
			}
			return { offset: null, atBoundary: true };
		}

		return { offset: nextOffset, atBoundary: false };
	}

	private findNextVisibleOffsetInLine(
		lineRange: LineRange,
		currentOffset: number,
		forward: boolean,
	): number | null {
		const safeOffset = Math.max(
			lineRange.from,
			Math.min(currentOffset, lineRange.to),
		);
		const segments = this.buildSegmentsForLine(
			lineRange.from,
			lineRange.to,
		);
		if (segments.length === 0) return null;
		if (forward) {
			for (const seg of segments) {
				if (safeOffset < seg.from) {
					return seg.from;
				}
				if (safeOffset >= seg.from && safeOffset < seg.to) {
					return Math.min(seg.to, safeOffset + 1);
				}
			}
			return null;
		}
		for (let i = segments.length - 1; i >= 0; i -= 1) {
			const seg = segments[i]!;
			if (safeOffset > seg.to) {
				return seg.to;
			}
			if (safeOffset > seg.from && safeOffset <= seg.to) {
				return Math.max(seg.from, safeOffset - 1);
			}
		}
		return null;
	}

	private findNextVisualLineOffsetInLine(
		lineEl: HTMLElement,
		lineRange: LineRange,
		currentOffset: number,
		writingMode: string,
		forward: boolean,
		axisBase: number,
		axisDir: number,
	): number | null {
		const maxSteps = 2000;
		let probe = currentOffset;
		for (let i = 0; i < maxSteps; i += 1) {
			const next = this.findNextVisibleOffsetInLine(
				lineRange,
				probe,
				forward,
			);
			if (next === null || next === probe) return null;
			const localOffset = Math.max(
				0,
				Math.min(next - lineRange.from, lineRange.to - lineRange.from),
			);
			const rect = this.getCaretRectInLine(
				lineEl,
				localOffset,
				lineRange,
				writingMode,
			);
			if (!rect) return null;
			const axisValue = writingMode.startsWith("vertical")
				? rect.left
				: rect.top;
			const crossed =
				axisDir > 0
					? axisValue > axisBase + 0.5
					: axisValue < axisBase - 0.5;
			if (crossed) return next;
			probe = next;
		}
		return null;
	}

	private adjustCrossParagraphOffset(
		currentOffset: number,
		nextOffset: number,
	): number {
		const currentLineIndex = this.findLineIndex(currentOffset);
		const nextLineIndex = this.findLineIndex(nextOffset);
		if (
			currentLineIndex === null ||
			nextLineIndex === null ||
			nextLineIndex >= currentLineIndex
		) {
			return nextOffset;
		}
		const targetRange = this.lineRanges[nextLineIndex];
		return targetRange ? targetRange.to : nextOffset;
	}

	private getLineVisualRects(lineEl: HTMLElement): DOMRect[] {
		const nodes = this.getLineTextNodes(lineEl);
		if (nodes.length === 0) {
			const eol = lineEl.querySelector(
				".tategaki-sot-eol",
			) as HTMLElement | null;
			const rect =
				eol?.getBoundingClientRect() ?? lineEl.getBoundingClientRect();
			return [rect];
		}
		const range = document.createRange();
		range.setStart(nodes[0], 0);
		const last = nodes[nodes.length - 1];
		range.setEnd(last, last.length);
		const rects = Array.from(range.getClientRects());
		if (rects.length === 0) {
			return [lineEl.getBoundingClientRect()];
		}
		// 重複除去
		const unique: DOMRect[] = [];
		for (const rect of rects) {
			if (rect.width <= 0 && rect.height <= 0) continue;
			const duplicated = unique.some(
				(existing) =>
					Math.abs(existing.left - rect.left) < 0.5 &&
					Math.abs(existing.right - rect.right) < 0.5 &&
					Math.abs(existing.top - rect.top) < 0.5 &&
					Math.abs(existing.bottom - rect.bottom) < 0.5,
			);
			if (!duplicated) {
				unique.push(rect);
			}
		}
		// 同一視覚行のrectをマージ（ルビ等のinline-block要素による分断を解消）
		return this.mergeVisualLineRects(unique);
	}

	/**
	 * 同じ視覚的行にあるrectをマージする。
	 * 縦書き: left座標が近いものを同一行とみなしマージ
	 * 横書き: top座標が近いものを同一行とみなしマージ
	 */
	private mergeVisualLineRects(rects: DOMRect[]): DOMRect[] {
		if (rects.length <= 1) return rects;
		const isVertical = this.writingMode.startsWith("vertical");
		// 行判定の閾値（フォントサイズの半分程度）
		const threshold = Math.max(
			8,
			(this.getEffectiveFontSize() ?? 18) * 0.5,
		);

		// rectをグループ化
		const groups: DOMRect[][] = [];
		for (const rect of rects) {
			let foundGroup = false;
			for (const group of groups) {
				// グループ内の任意のrectと同一行判定
				const representative = group[0];
				if (!representative) continue;
				const sameVisualLine = isVertical
					? Math.abs(rect.left - representative.left) < threshold ||
						Math.abs(rect.right - representative.right) < threshold
					: Math.abs(rect.top - representative.top) < threshold ||
						Math.abs(rect.bottom - representative.bottom) <
							threshold;
				if (sameVisualLine) {
					group.push(rect);
					foundGroup = true;
					break;
				}
			}
			if (!foundGroup) {
				groups.push([rect]);
			}
		}
		// 各グループを包括するrectに変換
		return groups.map((group) => {
			const first = group[0];
			if (group.length === 1 && first) return first;
			let minLeft = Infinity;
			let minTop = Infinity;
			let maxRight = -Infinity;
			let maxBottom = -Infinity;
			for (const r of group) {
				minLeft = Math.min(minLeft, r.left);
				minTop = Math.min(minTop, r.top);
				maxRight = Math.max(maxRight, r.right);
				maxBottom = Math.max(maxBottom, r.bottom);
			}
			return new DOMRect(
				minLeft,
				minTop,
				maxRight - minLeft,
				maxBottom - minTop,
			);
		});
	}

	private getEffectiveFontSize(): number | null {
		if (!this.derivedRootEl) return null;
		const computed = window.getComputedStyle(this.derivedRootEl);
		return parseFloat(computed.fontSize) || null;
	}

	private findClosestRectIndex(
		rects: DOMRect[],
		x: number,
		y: number,
	): number {
		let bestIndex = 0;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (let i = 0; i < rects.length; i += 1) {
			const rect = rects[i];
			if (!rect) continue;
			const dx =
				x < rect.left
					? rect.left - x
					: x > rect.right
						? x - rect.right
						: 0;
			const dy =
				y < rect.top
					? rect.top - y
					: y > rect.bottom
						? y - rect.bottom
						: 0;
			const distance = dx * dx + dy * dy;
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = i;
			}
		}
		return bestIndex;
	}

	private getNextOffset(
		doc: string,
		head: number,
		key: string,
		writingMode: string,
	): number {
		const safeHead = Math.max(0, Math.min(head, doc.length));
		const lineInfo = this.getLineInfo(doc, safeHead);
		const isVertical = writingMode.startsWith("vertical");
		const isVerticalRL = writingMode !== "vertical-lr";

		if (isVertical) {
			if (key === "ArrowUp") {
				// 段落先頭の場合は前の段落の末尾へ移動
				if (lineInfo.column <= 0) {
					return lineInfo.lineStart > 0
						? lineInfo.lineStart - 1
						: safeHead;
				}
				return Math.max(lineInfo.lineStart, safeHead - 1);
			}
			if (key === "ArrowDown") {
				if (safeHead >= lineInfo.lineEnd) {
					return lineInfo.lineEnd < doc.length
						? lineInfo.lineEnd + 1
						: safeHead;
				}
				return Math.min(lineInfo.lineEnd, safeHead + 1);
			}
			if (key === "ArrowLeft") {
				if (isVerticalRL) {
					if (safeHead >= lineInfo.lineEnd) {
						return this.getNextLineStart(doc, lineInfo);
					}
					return this.moveToNextLine(doc, lineInfo);
				}
				if (safeHead <= lineInfo.lineStart) {
					return this.getPrevLineEnd(doc, lineInfo);
				}
				return this.moveToPrevLine(doc, lineInfo);
			}
			if (key === "ArrowRight") {
				if (isVerticalRL) {
					if (safeHead <= lineInfo.lineStart) {
						return this.getPrevLineEnd(doc, lineInfo);
					}
					return this.moveToPrevLine(doc, lineInfo);
				}
				if (safeHead >= lineInfo.lineEnd) {
					return this.getNextLineStart(doc, lineInfo);
				}
				return this.moveToNextLine(doc, lineInfo);
			}
			return safeHead;
		}

		if (key === "ArrowLeft") {
			return Math.max(0, safeHead - 1);
		}
		if (key === "ArrowRight") {
			return Math.min(doc.length, safeHead + 1);
		}
		if (key === "ArrowUp") {
			return this.moveToPrevLine(doc, lineInfo);
		}
		if (key === "ArrowDown") {
			return this.moveToNextLine(doc, lineInfo);
		}
		return safeHead;
	}

	private getLineInfo(
		doc: string,
		head: number,
	): {
		lineStart: number;
		lineEnd: number;
		column: number;
	} {
		const lineStart = doc.lastIndexOf("\n", Math.max(0, head - 1)) + 1;
		const lineEndIndex = doc.indexOf("\n", head);
		const lineEnd = lineEndIndex === -1 ? doc.length : lineEndIndex;
		const column = Math.max(
			0,
			Math.min(head - lineStart, lineEnd - lineStart),
		);
		return { lineStart, lineEnd, column };
	}

	private moveToPrevLine(
		doc: string,
		info: {
			lineStart: number;
			lineEnd: number;
			column: number;
		},
	): number {
		if (info.lineStart === 0) return info.lineStart + info.column;
		const prevLineEnd = info.lineStart - 1;
		const prevLineStart =
			doc.lastIndexOf("\n", Math.max(0, prevLineEnd - 1)) + 1;
		const prevLineLength = prevLineEnd - prevLineStart;
		return prevLineStart + Math.min(info.column, prevLineLength);
	}

	private moveToNextLine(
		doc: string,
		info: {
			lineStart: number;
			lineEnd: number;
			column: number;
		},
	): number {
		if (info.lineEnd >= doc.length) return info.lineEnd;
		const nextLineStart = info.lineEnd + 1;
		const nextLineEndIndex = doc.indexOf("\n", nextLineStart);
		const nextLineEnd =
			nextLineEndIndex === -1 ? doc.length : nextLineEndIndex;
		const nextLineLength = nextLineEnd - nextLineStart;
		return nextLineStart + Math.min(info.column, nextLineLength);
	}

	private getNextLineStart(doc: string, info: { lineEnd: number }): number {
		if (info.lineEnd >= doc.length) return info.lineEnd;
		return info.lineEnd + 1;
	}

	private getPrevLineEnd(doc: string, info: { lineStart: number }): number {
		if (info.lineStart <= 0) return 0;
		return Math.min(doc.length, info.lineStart - 1);
	}
}
