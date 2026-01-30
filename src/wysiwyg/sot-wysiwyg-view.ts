import {
	ItemView,
	Scope,
	MarkdownView,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	ViewStateResult,
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
import { debugWarn } from "../shared/logger";
import type { SoTEditor } from "./sot/sot-editor";
import { OverlayImeTextarea } from "./sot/overlay-ime-textarea";
import { SoTOutlinePanel } from "./sot/outline-panel";
import type { LineRange } from "./sot/line-ranges";
import {
	isBlockquoteLine,
	parseHeadingLine,
	parseListLine,
	type ListLineInfo,
} from "./sot/sot-line-parse";
import {
	applyInlineRangesToSegments,
	collectUnderlineHtmlRanges,
} from "./sot/sot-inline-html";
import {
	handleListOutlinerKeydown as handleListOutlinerKeydownForSoT,
} from "./sot/sot-list-outliner";
import {
	applyFrontmatterWritingMode,
	parseFrontmatter,
	renderFrontmatter,
} from "./sot/sot-frontmatter";
import {
	clearPlainEditSelectionFormatting,
	getPlainEditSelectionRange,
	insertPlainEditLink,
	insertPlainEditRuby,
	replacePlainEditSelection,
	wrapPlainEditSelection,
} from "./sot/sot-plain-edit-utils";
import {
	SoTPlainEditController,
	type PlainEditRange,
} from "./sot/sot-plain-edit-controller";
import { SoTWorkspaceController } from "./sot/sot-workspace-controller";
import { SoTLineCache } from "./sot/sot-line-cache";
import { SoTLineRenderer } from "./sot/sot-line-renderer";
import {
	computeLineRangesFromLines as computeLineRangesFromLinesModel,
	recomputeLineBlockKinds as recomputeLineBlockKindsModel,
} from "./sot/sot-line-model";
import type {
	BlockLineDecoration,
	ClearableSpan,
	HiddenRange,
	InlineStyleClass,
	InlineRange,
	InlineWidget,
	LinkRange,
	RenderSegment,
	RubyRange,
} from "./sot/sot-render-types";
import type { SoTChange } from "./sot/sot-editor";
import type { CommandUiAdapter } from "./shared/command-adapter";
import { CommandToolbar } from "./shared/command-toolbar";
import { CommandContextMenu } from "./shared/command-context-menu";
import { LinkInputModal, LinkInputResult } from "../shared/ui/link-input-modal";
import { RubyInputModal, RubyInputResult } from "../shared/ui/ruby-input-modal";
import { SettingsPanelModal } from "./contenteditable/settings-panel";
import {
	getCaretPositionFromPoint,
	getClampedPointInRect,
	getRectUnion,
} from "./sot/sot-selection-geometry";
import { SoTPointerHandler } from "./sot/sot-pointer";
import { SoTSelectionOverlay } from "./sot/sot-selection-overlay";
import { SoTCeSelectionSync } from "./sot/sot-ce-selection-sync";
import { SoTRenderPipeline } from "./sot/sot-render-pipeline";
import { buildSoTViewDom } from "./sot/sot-wysiwyg-view-dom";
import {
	registerSoTViewHeaderEvents,
	registerSoTViewInputEvents,
	registerSoTViewRootEvents,
} from "./sot/sot-wysiwyg-view-events";
import {
	finalizeRender,
	purgeLineCaches,
	renderNow,
	resetPendingRenderState,
	scheduleRender,
} from "./sot/sot-view-render";
import {
	scheduleCaretUpdate,
	scrollCaretIntoView,
	scrollRectIntoView,
	updateCaretPosition,
	updateSelectionOverlay,
} from "./sot/sot-view-selection";
import {
	activateMarkdownLeafForCommand as activateMarkdownLeafForCommandForSoT,
	buildFileSwitchItems as buildFileSwitchItemsForSoT,
	createNewNote as createNewNoteForSoT,
	ensureMarkdownViewForFile as ensureMarkdownViewForFileForSoT,
	ensureRecentFilePathsInitialized as ensureRecentFilePathsInitializedForSoT,
	findMarkdownLeafForFile as findMarkdownLeafForFileForSoT,
	openFile as openFileForSoT,
	openFileSwitcher as openFileSwitcherForSoT,
	openNewNoteModal as openNewNoteModalForSoT,
	pushRecentFilePath as pushRecentFilePathForSoT,
	recordRecentFile as recordRecentFileForSoT,
	switchToFile as switchToFileForSoT,
	toggleReadingMode as toggleReadingModeForSoT,
} from "./sot/sot-view-file";
import {
	applyPairedMarkdownBadge as applyPairedMarkdownBadgeForSoT,
	applySoTTabBadge as applySoTTabBadgeForSoT,
	clearPairedMarkdownBadge as clearPairedMarkdownBadgeForSoT,
	clearSoTTabBadge as clearSoTTabBadgeForSoT,
	ensurePairedMarkdownView as ensurePairedMarkdownViewForSoT,
	getLeafTabHeaderEl as getLeafTabHeaderElForSoT,
	getTabHeaderTitleHost as getTabHeaderTitleHostForSoT,
	getValidPairedMarkdownLeaf as getValidPairedMarkdownLeafForSoT,
	getViewHeaderTitleHost as getViewHeaderTitleHostForSoT,
	registerEscapeGuard as registerEscapeGuardForSoT,
	registerEscapeKeymap as registerEscapeKeymapForSoT,
	registerWorkspacePairGuards as registerWorkspacePairGuardsForSoT,
	verifyPairedMarkdownViewFile as verifyPairedMarkdownViewFileForSoT,
} from "./sot/sot-view-workspace";
import {
	INITIAL_FILE_PROP,
	TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
} from "./sot/sot-wysiwyg-view-constants";
import type { SoTViewState } from "./sot/sot-wysiwyg-view-types";

export { TATEGAKI_SOT_WYSIWYG_VIEW_TYPE };

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
	private listOutlinerCaptureHandler: ((event: KeyboardEvent) => void) | null =
		null;

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
	private scrollDragActive = false;
	private suspendedForInactive = false;
	private suspendedScrollTop = 0;
	private suspendedScrollLeft = 0;
	private pendingScrollRestoreTop: number | null = null;
	private pendingScrollRestoreLeft: number | null = null;
	private pendingFoldScrollLineIndex: number | null = null;
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
	private boundWheelHandler: ((event: WheelEvent) => void) | null = null;
	private overlayFocused = false;
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
	private pointerHandler: SoTPointerHandler | null = null;
	private selectionOverlay: SoTSelectionOverlay | null = null;
	private ceSelectionSync: SoTCeSelectionSync | null = null;
	private autoScrollSelecting = false;
	private pendingCaretScroll = false;
	private keepSoTActiveOnOutline = false;
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
	private lineCache = new SoTLineCache();
	private lineRenderer: SoTLineRenderer;
	private embedRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private mathRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private calloutRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private tableRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private deflistRenderChildren: Map<number, MarkdownRenderChild> = new Map();
	private hideFrontmatter = false;
	private frontmatterDetected = false;
	private collapsePreviewTooltip: HTMLElement | null = null;

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
		// writing mode切り替え時、旧モードの scrollTop/scrollLeft は新モードでは
		// 無意味な値になるためリセットする。リセットしないと renderNow() が
		// 古い値をキャプチャし finalizeRender で復元してしまい、paddingTop 等が
		// 一瞬画面外に出た後にキャレットスクロールで補正される現象が起こる。
		this.derivedRootEl.scrollTop = 0;
		this.derivedRootEl.scrollLeft = 0;
		// 既に描画済みのフロントマター要素にもwriting-modeを再適用
		const frontmatterEl = this.derivedContentEl?.querySelector(
			".tategaki-frontmatter",
		) as HTMLElement | null;
		if (frontmatterEl) {
			applyFrontmatterWritingMode(frontmatterEl, mode);
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

	private showLoadingOverlay(): void {
		this.loadingOverlayPending = true;
		this.setLoadingOverlayVisible(true);
	}

	private hideLoadingOverlay(): void {
		this.loadingOverlayPending = false;
		this.setLoadingOverlayVisible(false);
	}

	private async toggleWritingMode(): Promise<void> {
		const current = this.getEffectiveCommonSettings(
			this.plugin.settings,
		).writingMode;
		const next: WritingMode =
			current === "vertical-rl" ? "horizontal-tb" : "vertical-rl";
		await this.plugin.updateSettings({
			common: {
				...this.plugin.settings.common,
				writingMode: next,
			},
		});
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

		// ページ内余白の設定（物理プロパティで実際の上下余白を設定）
		const sotPaddingTop = settings.wysiwyg.sotPaddingTop ?? 32;
		const sotPaddingBottom = settings.wysiwyg.sotPaddingBottom ?? 16;
		this.derivedRootEl.style.paddingTop = `${sotPaddingTop}px`;
		this.derivedRootEl.style.paddingBottom = `${sotPaddingBottom}px`;

		this.commandToolbar?.update();
		this.scheduleCaretUpdate(true);
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

	private computeLineRangesFromLines(lines: string[]): LineRange[] {
		return computeLineRangesFromLinesModel(lines);
	}

	private shouldUseLineCache(): boolean {
		return this.lineCache.shouldUseLineCache();
	}

	private invalidateLineCaches(): void {
		this.lineCache.clear();
	}

	private getCachedBlockLineDecoration(
		lineIndex: number | null,
		lineFrom: number,
		lineTo: number,
		lineText: string,
	): BlockLineDecoration {
		return this.lineCache.getCachedBlockLineDecoration(
			lineIndex,
			lineFrom,
			lineTo,
			lineText,
			() =>
				this.computeBlockLineDecoration(
					lineFrom,
					lineTo,
					lineText,
					lineIndex,
				),
		);
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
				collapsed ? "見出しを展開" : "見出しを折りたたむ",
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
		box.setAttribute("aria-label", checked ? "完了" : "未完了");
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
		// 折りたたみ/展開した見出し行の先頭にキャレットを移動し、
		// その位置にスクロールする
		const headingRange = this.lineRanges[lineIndex];
		if (headingRange) {
			this.setSelectionNormalized(headingRange.from, headingRange.from);
		} else {
			const selection = this.sotEditor.getSelection();
			this.setSelectionNormalized(selection.anchor, selection.head);
		}
		this.pendingFoldScrollLineIndex = lineIndex;
		this.pendingCaretScroll = true;
		this.scheduleRender(true);
	}

	private collectHiddenRangesForLine(
		lineFrom: number,
		lineTo: number,
		lineText: string,
		lineIndex: number | null,
	): HiddenRange[] {
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
			} catch (_) { /* ignore */ }
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
		const segments = this.buildSegmentsForLine(range.from, range.to);
		if (segments.length === 0) {
			return range.from;
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

	private setSelectionNormalized(anchor: number, head: number): void {
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
		this.sotEditor.setSelection({
			anchor: normalizedAnchor,
			head: normalizedHead,
		});
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

		const countIndentColumns = (leading: string): number => {
			let columns = 0;
			for (const ch of leading) {
				if (ch === "\t") {
					columns += 4;
				} else {
					columns += 1;
				}
			}
			return columns;
		};

		const computeIndentDepth = (leading: string): number => {
			const columns = countIndentColumns(leading);
			if (columns <= 0) return 0;
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
			const cached = this.lineCache.getCachedSegments(
				lineIndex,
				safeFrom,
				safeTo,
				lineText,
				lineKind,
				codeLang,
				isSource,
				rubyEnabled,
			);
			if (cached) return cached;
		}

		const storeSegments = (segments: RenderSegment[]): RenderSegment[] => {
			if (canCache && lineIndex !== null) {
				this.lineCache.storeSegments(
					lineIndex,
					safeFrom,
					safeTo,
					lineText,
					lineKind,
					codeLang,
					isSource,
					rubyEnabled,
					segments,
				);
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
			const hidden: HiddenRange[] = [];
			const styles: InlineRange[] = [];
			for (const r of blockDecoration.hidden) {
				hidden.push(r);
			}
			collectUnderlineHtmlRanges(
				safeFrom,
				safeTo,
				lineText,
				hidden,
				styles,
				this.rangeOverlapsAny.bind(this),
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
			const hiddenApplied = this.applyHiddenRangesToSegments(base, hidden);
			return storeSegments(
				applyInlineRangesToSegments(hiddenApplied, styles),
			);
		}

		const hidden: HiddenRange[] = [];
		const styles: InlineRange[] = [];
		const links: LinkRange[] = [];
		const rubyRanges: RubyRange[] = [];

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
			collectUnderlineHtmlRanges(
				safeFrom,
				safeTo,
				lineText,
				hidden,
				styles,
				this.rangeOverlapsAny.bind(this),
			);
			this.collectRubyRangesForLine(
				safeFrom,
				safeTo,
				lineText,
				hidden,
				styles,
				rubyRanges,
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
			const styled = applyInlineRangesToSegments(hiddenApplied, styles);
			const linked = this.applyLinkRangesToSegments(styled, links);
			return storeSegments(
				this.applyRubyRangesToSegments(linked, rubyRanges),
			);
		}

		collectUnderlineHtmlRanges(
			safeFrom,
			safeTo,
			lineText,
			hidden,
			styles,
			this.rangeOverlapsAny.bind(this),
		);
		this.collectRubyRangesForLine(
			safeFrom,
			safeTo,
			lineText,
			hidden,
			styles,
			rubyRanges,
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
				this.applyRubyRangesToSegments(linked, rubyRanges),
			);
		}
		if (
			hidden.length === 0 &&
			styles.length === 0 &&
			rubyRanges.length === 0
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
		this.lineRenderer = new SoTLineRenderer(this as unknown as any);
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
		return this.currentFile?.basename ?? "Tategaki";
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
				} catch (_) { /* ignore */ }
			}, 0);
			return;
		}
		delete (this.leaf as any)[INITIAL_FILE_PROP];

		const container = this.containerEl.children[1] as HTMLElement;
		this.viewRootEl = container;
		const dom = buildSoTViewDom(
			container,
			this.plugin.settings.common.backgroundColor,
		);
		const toolbarLeft = dom.toolbarLeft;
		const content = dom.content;
		this.pageContainerEl = dom.pageContainerEl;
		this.borderWrapperEl = dom.borderWrapperEl;
		this.contentWrapperEl = dom.contentWrapperEl;
		this.loadingOverlayEl = dom.loadingOverlayEl;
		this.derivedRootEl = dom.derivedRootEl;
		this.derivedContentEl = dom.derivedContentEl;
		this.selectionLayerEl = dom.selectionLayerEl;
		this.caretEl = dom.caretEl;
		this.pendingEl = dom.pendingEl;
		this.updateMobileTouchAction();
		registerSoTViewHeaderEvents(this as any, container);

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
				listOutliner: (event) =>
					this.handleListOutlinerKeydown(event),
				onPendingText: (text) => this.updatePendingText(text),
			},
			{
				onFocus: () => {
					this.overlayFocused = true;
				},
				onBlur: () => {
					this.overlayFocused = false;
				},
			},
		);
		registerSoTViewInputEvents(this as any);
		this.setupListOutlinerCaptureHandler();

		this.applySettingsToView(this.plugin.settings);
		this.registerWorkspacePairGuards();
		this.applySoTTabBadge();
		this.outlinePanel = new SoTOutlinePanel(content, {
			getItems: () => this.getOutlineItems(),
			onSelect: (item) => {
				this.setSelectionNormalized(item.offset, item.offset);
				// 見出しジャンプ: 行要素を直接取得してスクロール
				const lineEl = this.getLineElement(item.line);
				if (lineEl) {
					this.ensureLineRendered(lineEl);
					// 1回目: おおよその位置にスクロール
					lineEl.scrollIntoView({
						block: "center",
						inline: "center",
					});
					// 2回目: IntersectionObserverが周辺行をレンダリングした後に再スクロール
					setTimeout(() => {
						lineEl.scrollIntoView({
							block: "center",
							inline: "center",
						});
					}, 100);
				}
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

		this.renderPipeline = new SoTRenderPipeline({
			getDerivedRootEl: () => this.derivedRootEl,
			getDerivedContentEl: () => this.derivedContentEl,
			getSotEditor: () => this.sotEditor,
			getPluginSettings: () => this.plugin.settings,
			getHideFrontmatter: () => this.hideFrontmatter,
			getWritingMode: () => this.writingMode,
			parseFrontmatter: (doc) => parseFrontmatter(doc),
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
				renderFrontmatter(data, settings),
			applyFrontmatterWritingMode: (element, mode) =>
				applyFrontmatterWritingMode(element, mode),
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
			ensureLineRendered: (lineEl) => this.ensureLineRendered(lineEl),
			getLineVisualRects: (lineEl) => this.getLineVisualRects(lineEl),
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
			updateSelectionOverlay: () => {
				this.selectionOverlay?.updateSelectionOverlay();
			},
			setAutoScrollSelecting: (active) => {
				if (this.autoScrollSelecting === active) return;
				this.autoScrollSelecting = active;
				this.selectionOverlay?.updateSelectionOverlay();
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
				}
				if (state.pointerSelectAnchor !== undefined) {
					this.pointerSelectAnchor = state.pointerSelectAnchor;
				}
				if (state.pointerSelectPointerId !== undefined) {
					this.pointerSelectPointerId = state.pointerSelectPointerId;
				}
			},
		});

		if (this.commandAdapter) {
			this.commandContextMenu = new CommandContextMenu(
				this.commandAdapter,
			);
		}
		registerSoTViewRootEvents(this as any);

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

	async updateSettings(settings: TategakiV2Settings): Promise<void> {
		const prevHideFrontmatter = this.hideFrontmatter;
		this.applySettingsToView(settings);
		this.commandToolbar?.update();
		if (prevHideFrontmatter !== this.hideFrontmatter) {
			this.scheduleRender(true);
		} else {
			this.scheduleRender();
		}
	}

	async onClose(): Promise<void> {
		this.clearPairedMarkdownBadge();
		this.clearSoTTabBadge();
		this.renderPipeline?.dispose();
		this.renderPipeline = null;
		this.resetTouchScrollState();
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
		this.commitPlainEdit(true, false);
		this.unregisterPlainEditOutsidePointerHandler();
		this.destroyPlainEditOverlay();
		if (this.plainEditRange) {
			this.clearPlainEditTargets();
			this.plainEditRange = null;
		}

		this.unloadRenderChildren();

		this.detachSoTListener?.();
		this.detachSoTListener = null;
		this.overlayTextarea?.destroy();
		this.overlayTextarea = null;
		this.lineRenderer.dispose();
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
		this.writingMode = "vertical-rl";
		this.isReady = false;
	}

	private async openFile(file: TFile): Promise<void> {
		await openFileForSoT(this as any, file);
	}

	private registerWorkspacePairGuards(): void {
		registerWorkspacePairGuardsForSoT(this as any);
	}

	private updateToolbar(): void {
		this.updateWritingModeToggleUi();
	}

	private registerEscapeGuard(): void {
		registerEscapeGuardForSoT(this as any);
	}

	private unloadRenderChildren(): void {
		for (const child of this.embedRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) { /* ignore */ }
		}
		this.embedRenderChildren.clear();
		for (const child of this.mathRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) { /* ignore */ }
		}
		this.mathRenderChildren.clear();
		for (const child of this.calloutRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) { /* ignore */ }
		}
		this.calloutRenderChildren.clear();
		for (const child of this.tableRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) { /* ignore */ }
		}
		this.tableRenderChildren.clear();
		for (const child of this.deflistRenderChildren.values()) {
			try {
				child.unload();
			} catch (_) { /* ignore */ }
		}
		this.deflistRenderChildren.clear();
	}

	private suspendForInactiveLeaf(): void {
		if (this.suspendedForInactive) return;
		if (!this.derivedRootEl || !this.derivedContentEl) return;
		this.suspendedForInactive = true;
		this.suspendedScrollTop = this.derivedRootEl.scrollTop;
		this.suspendedScrollLeft = this.derivedRootEl.scrollLeft;
		this.renderPipeline?.suspend();
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
		// 非アクティブ時も表示を維持する（参照モード想定）。
		this.resetPendingRenderState();
	}

	private resumeFromInactiveLeaf(): void {
		if (!this.suspendedForInactive) return;
		this.suspendedForInactive = false;
		this.pendingScrollRestoreTop = this.suspendedScrollTop;
		this.pendingScrollRestoreLeft = this.suspendedScrollLeft;
		this.scheduleRender(true);
	}

	private isLeafActive(): boolean {
		return (this.app.workspace as any).activeLeaf === this.leaf;
	}

	private registerEscapeKeymap(): void {
		registerEscapeKeymapForSoT(this as any);
	}

	private getValidPairedMarkdownLeaf(): WorkspaceLeaf | null {
		return getValidPairedMarkdownLeafForSoT(this as any);
	}

	private runCommand(
		action: () => void | Promise<void>,
	): void | Promise<void> {
		const finalize = () => {
			this.commandToolbar?.update();
			this.scheduleCaretUpdate(true);
			this.focusInputSurface(true);
		};
		let result: void | Promise<void> | undefined = undefined;
		if (this.ceImeMode) {
			this.runCeMutation(() => {
				result = action();
			});
		} else {
			result = action();
		}
		if (result && typeof (result as Promise<void>).then === "function") {
			return (result as Promise<void>).finally(() => finalize());
		}
		finalize();
	}

	private wrapCommand(
		action: () => void | Promise<void>,
	): () => void | Promise<void> {
		return () => this.runCommand(action);
	}

	private createCommandAdapter(): CommandUiAdapter {
		const wrap = (action: () => void | Promise<void>) =>
			this.wrapCommand(action);
		return {
			app: this.app,
			isReadOnly: () => !this.sotEditor,
			hasSelection: () => this.hasSelection(),
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
			setHeading: (level: number) =>
				this.runCommand(() => this.setHeading(level)),
			clearHeading: wrap(() => this.clearHeading()),
			getHeadingLevel: () => this.getHeadingLevel(),
			toggleBulletList: wrap(() => this.toggleList("bullet")),
			isBulletListActive: () => this.isBulletListActive(),
			toggleOrderedList: wrap(() => this.toggleList("ordered")),
			isOrderedListActive: () => this.isOrderedListActive(),
			toggleBlockquote: wrap(() => this.toggleBlockquote()),
			isBlockquoteActive: () => this.isBlockquoteActive(),
			toggleCodeBlock: wrap(() => this.toggleCodeBlock()),
			isCodeBlockActive: () => this.isCodeBlockActive(),
			insertLink: wrap(() => this.insertLink()),
			insertRuby: wrap(() => this.insertRuby()),
			insertHorizontalRule: wrap(() => this.insertHorizontalRule()),
			openSettings: wrap(() => this.openSettingsPanel()),
			openOutline: () => this.openOutline(),
			clearFormatting: wrap(() => this.clearFormatting()),
			toggleRuby: wrap(() => this.toggleRubyVisibility()),
			isRubyEnabled: () =>
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
			selectAll: wrap(() => this.selectAllText()),
		};
	}

	private hasSelection(): boolean {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const start = this.plainEditOverlayEl.selectionStart ?? 0;
			const end = this.plainEditOverlayEl.selectionEnd ?? start;
			return start !== end;
		}
		if (!this.sotEditor) return false;
		const selection = this.sotEditor.getSelection();
		return selection.anchor !== selection.head;
	}

	private getSelectionText(): string {
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

	private selectAllText(): void {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			this.plainEditOverlayEl.focus({ preventScroll: true });
			this.plainEditOverlayEl.select();
			return;
		}
		if (!this.sotEditor) return;
		const docLength = this.sotEditor.getDoc().length;
		this.setSelectionNormalized(0, docLength);
		this.scheduleCaretUpdate();
	}

	private async copySelection(): Promise<void> {
		const text = this.getSelectionText();
		if (!text) return;
		const copied = await this.writeTextToClipboard(text);
		if (!copied) {
			document.execCommand("copy");
		}
	}

	private async cutSelection(): Promise<void> {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const text = this.getSelectionText();
			if (!text) return;
			const copied = await this.writeTextToClipboard(text);
			if (!copied) {
				document.execCommand("copy");
			}
			replacePlainEditSelection(this.plainEditOverlayEl, "", {
				onResize: () => this.adjustPlainEditOverlaySize(),
			});
			return;
		}
		const text = this.getSelectionText();
		if (!text) return;
		const copied = await this.writeTextToClipboard(text);
		if (!copied) {
			document.execCommand("copy");
		}
		this.replaceSelection("");
	}

	private async pasteFromClipboard(): Promise<void> {
		if (this.sourceModeEnabled && this.plainEditOverlayEl) {
			const text = await this.readTextFromClipboard();
			if (!text) {
				this.plainEditOverlayEl.focus({ preventScroll: true });
				document.execCommand("paste");
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
			if (this.ceImeMode) {
				return;
			}
			document.execCommand("paste");
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
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch (error) {
				debugWarn("Tategaki SoT: clipboard write failed", error);
			}
		}
		return this.fallbackCopyText(text);
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

	private fallbackCopyText(text: string): boolean {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.style.position = "fixed";
		textarea.style.top = "-9999px";
		textarea.style.left = "-9999px";
		textarea.style.opacity = "0";
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();
		let success = false;
		try {
			success = document.execCommand("copy");
		} catch (_) {
			success = false;
		}
		textarea.remove();
		return success;
	}

	private toggleInlineStyle(
		kind: "bold" | "italic" | "strike" | "highlight" | "code",
	): void {
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
				} catch (_) { /* ignore */ }
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

		const selectionHasStyle = className
			? this.isInlineStyleActive(className)
			: false;
		let mergeLeft =
			!selectionHasStyle && className
				? this.hasInlineClassBefore(from, className)
				: false;
		let mergeRight =
			!selectionHasStyle && className
				? this.hasInlineClassAfter(to, className)
				: false;

		let adjustedFrom = from;
		let adjustedTo = to;
		if (selectionHasStyle && className) {
			const adjusted = this.stripInlineStyleInSelection(
				adjustedFrom,
				adjustedTo,
				className,
				pairs,
			);
			adjustedFrom = adjusted.from;
			adjustedTo = adjusted.to;
			if (adjusted.removedOnly) {
				this.setSelectionNormalized(adjustedFrom, adjustedTo);
				this.focusInputSurface(true);
				return;
			}
		}

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
			const text = info.content.length > 0 ? info.content : "（無題）";
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
		const kind = this.getListKindAtSelection();
		return kind === "bullet" || kind === "task";
	}

	private isOrderedListActive(): boolean {
		return this.getListKindAtSelection() === "ordered";
	}

	private setHeading(level: number): void {
		if (!this.sotEditor) return;
		const normalizedLevel = Math.max(0, Math.min(level, 6));
		const selection = this.sotEditor.getSelection();
		let from = Math.min(selection.anchor, selection.head);
		let to = Math.max(selection.anchor, selection.head);
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

	private toggleList(kind: "bullet" | "ordered"): void {
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		let from = Math.min(selection.anchor, selection.head);
		let to = Math.max(selection.anchor, selection.head);
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
				return info.kind === "bullet" || info.kind === "task";
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
				const marker = kind === "bullet" ? "- " : "1. ";
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
		let from = Math.min(selection.anchor, selection.head);
		let to = Math.max(selection.anchor, selection.head);
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
		let from = Math.min(selection.anchor, selection.head);
		let to = Math.max(selection.anchor, selection.head);
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
			return Array.from(baseText)
				.map((char) => `｜${char}《・》`)
				.join("");
		}
		return `｜${baseText}《${ruby}》`;
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
				new Notice("ルビは1行内の選択のみ対応しています。", 2000);
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
			new Notice("ルビは1行内の選択のみ対応しています。", 2000);
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

		new RubyInputModal(this.app, displayText, (result: RubyInputResult) => {
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
		}).open();
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
					? "ルビ表示をオンにしました。"
					: "ルビ表示をオフにしました。",
				1800,
			);
		} catch (error) {
			console.error("[Tategaki SoT] Failed to toggle ruby", error);
			new Notice("ルビ表示の切り替えに失敗しました。", 2500);
		}
	}

	private ensureRecentFilePathsInitialized(): void {
		ensureRecentFilePathsInitializedForSoT(this as any);
	}

	private pushRecentFilePath(path: string, preferFront = true): void {
		pushRecentFilePathForSoT(this as any, path, preferFront);
	}

	private recordRecentFile(file: TFile | null): void {
		recordRecentFileForSoT(this as any, file);
	}

	private buildFileSwitchItems(): TFile[] {
		return buildFileSwitchItemsForSoT(this as any);
	}

	private openFileSwitcher(): void {
		openFileSwitcherForSoT(this as any);
	}

	private openNewNoteModal(initialValue = ""): void {
		openNewNoteModalForSoT(this as any, initialValue);
	}

	private async createNewNote(
		name: string,
		baseFolder: string,
	): Promise<void> {
		await createNewNoteForSoT(this as any, name, baseFolder);
	}

	private async toggleReadingMode(): Promise<void> {
		await toggleReadingModeForSoT(this as any);
	}

	private async switchToFile(file: TFile): Promise<void> {
		await switchToFileForSoT(this as any, file);
	}

	private openSettingsPanel(): void {
		const modal = new SettingsPanelModal(
			this.app,
			this.plugin,
			async (newSettings) => {
				await this.plugin.updateSettings(newSettings);
			},
			{ mode: "sot", isCeImeMode: this.ceImeMode },
		);
		modal.open();
	}

	private async activateMarkdownLeafForCommand(): Promise<MarkdownView | null> {
		return await activateMarkdownLeafForCommandForSoT(this as any);
	}

	private async openOutline(): Promise<void> {
		if (!this.outlinePanel) {
			new Notice("アウトラインを開けませんでした。", 2000);
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
	): { from: number; to: number; removedOnly: boolean } {
		if (!this.sotEditor) return { from, to, removedOnly: false };
		const doc = this.sotEditor.getDoc();
		const startLine = this.findLineIndex(from);
		const endLine = this.findLineIndex(to);
		if (startLine === null || endLine === null) {
			return { from, to, removedOnly: false };
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
			return { from, to, removedOnly: false };
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
		return { from: nextFrom, to: nextTo, removedOnly: fullyStyled };
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
				label = "選択の復元に失敗";
			} else if (reason === "external") {
				label = "外部更新を検知";
			} else if (reason === "verification") {
				label = "キャレット整合性チェック";
			}
			new Notice(`CE補助モードを一時停止しました (${label})`, 2500);
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
		if (startLine === endLine) {
			const paragraph = this.getParagraphLineRangeForOffsets(from, to);
			if (paragraph) {
				this.setCeEditableRange(paragraph.start, paragraph.end);
				return;
			}
		}
		this.setCeEditableRange(startLine, endLine);
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
		window.requestAnimationFrame(() => {
			if (!this.ceImeMode) return;
			this.rerenderLineRange(range.start, range.end);
			if (caretOffset !== null) {
				this.setSelectionNormalized(caretOffset, caretOffset);
			}
			this.syncSelectionToCe();
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

	private setupListOutlinerCaptureHandler(): void {
		if (this.listOutlinerCaptureHandler) return;
		const doc = this.containerEl.ownerDocument ?? document;
		const win = doc.defaultView ?? window;
		this.listOutlinerCaptureHandler = (event: KeyboardEvent) => {
			if (!this.workspaceController.isLeafActive()) return;
			if (this.sourceModeEnabled) return;
			const target = event.target as HTMLElement | null;
			const activeEl = doc.activeElement as HTMLElement | null;
			if (
				this.workspaceController.isInModalLayer(activeEl) ||
				this.workspaceController.isInModalLayer(target)
			) {
				return;
			}
			if (target && !this.containerEl.contains(target)) return;

			const isMod = event.metaKey || event.ctrlKey;
			const isTab = event.key === "Tab" && !event.altKey && !isMod;
			const isMove =
				isMod &&
				!event.shiftKey &&
				!event.altKey &&
				[
					"ArrowUp",
					"ArrowDown",
					"ArrowLeft",
					"ArrowRight",
				].includes(event.key);
			if (!isTab && !isMove) return;
			if (event.isComposing || this.ceImeComposing) return;
			if (this.overlayTextarea?.isImeVisible()) return;

			const handled = this.handleListOutlinerKeydown(event);
			if (handled || isTab) {
				event.preventDefault();
				if (typeof event.stopImmediatePropagation === "function") {
					event.stopImmediatePropagation();
				}
				event.stopPropagation();
				if (this.ceImeMode) {
					this.syncSelectionToCe();
				}
			}
		};
		win.addEventListener("keydown", this.listOutlinerCaptureHandler, {
			capture: true,
		});
		this.register(() => {
			this.teardownListOutlinerCaptureHandler();
		});
	}

	private teardownListOutlinerCaptureHandler(): void {
		if (!this.listOutlinerCaptureHandler) return;
		const doc = this.containerEl.ownerDocument ?? document;
		const win = doc.defaultView ?? window;
		win.removeEventListener(
			"keydown",
			this.listOutlinerCaptureHandler,
			{ capture: true },
		);
		this.listOutlinerCaptureHandler = null;
	}

	private handleCeKeydown(event: KeyboardEvent): void {
		if (!this.ceImeMode) return;
		if (!event.isComposing && !this.ceImeComposing) {
			if (this.handleListOutlinerKeydown(event)) {
				event.preventDefault();
				event.stopPropagation();
				if (this.ceImeMode) {
					this.syncSelectionToCe();
				}
				return;
			}
		}
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

	private handleCeSelectionChange(): void {
		this.ceSelectionSync?.handleCeSelectionChange();
		this.updateCeEditableRangeFromSelection();
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
				if (update.selectionChanged) {
					this.updateSourceModeLineRange();
					const pairedLeaf = this.getValidPairedMarkdownLeaf();
					const activeLeaf = (this.app.workspace as any).activeLeaf;
					if (pairedLeaf && activeLeaf === pairedLeaf) {
						this.pendingCaretScroll = true;
					} else {
						this.pendingCaretScroll =
							this.pendingCaretScroll ||
							(!this.ceImeMode && !this.overlayFocused);
					}
					if (this.ceImeMode && !this.ceImeSelectionSyncing) {
						this.syncSelectionToCe();
					}
					if (this.ceImeMode) {
						this.updateCeEditableRangeFromSelection();
					}
					this.scheduleCaretUpdate();
				}
			} else if (update.selectionChanged) {
				this.updateSourceModeLineRange();
				const pairedLeaf = this.getValidPairedMarkdownLeaf();
				const activeLeaf = (this.app.workspace as any).activeLeaf;
				if (pairedLeaf && activeLeaf === pairedLeaf) {
					this.pendingCaretScroll = true;
				} else {
					this.pendingCaretScroll =
						this.pendingCaretScroll ||
						(!this.ceImeMode && !this.overlayFocused);
				}
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
		return await ensureMarkdownViewForFileForSoT(this as any, file);
	}

	private findMarkdownLeafForFile(filePath: string): WorkspaceLeaf | null {
		return findMarkdownLeafForFileForSoT(this as any, filePath);
	}

	private ensurePairedMarkdownView(): void {
		ensurePairedMarkdownViewForSoT(this as any);
	}

	private verifyPairedMarkdownViewFile(
		view: MarkdownView,
		file: TFile,
	): boolean {
		return verifyPairedMarkdownViewFileForSoT(this as any, view, file);
	}

	private applyPairedMarkdownBadge(
		leaf: WorkspaceLeaf,
		view: MarkdownView,
	): void {
		applyPairedMarkdownBadgeForSoT(this as any, leaf, view);
	}

	private clearPairedMarkdownBadge(): void {
		clearPairedMarkdownBadgeForSoT(this as any);
	}

	private applySoTTabBadge(): void {
		applySoTTabBadgeForSoT(this as any);
	}

	private clearSoTTabBadge(): void {
		clearSoTTabBadgeForSoT(this as any);
	}

	private getLeafTabHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
		return getLeafTabHeaderElForSoT(this as any, leaf);
	}

	private getTabHeaderTitleHost(
		tabHeaderEl: HTMLElement,
	): HTMLElement | null {
		return getTabHeaderTitleHostForSoT(this as any, tabHeaderEl);
	}

	private getViewHeaderTitleHost(
		containerEl: HTMLElement,
	): HTMLElement | null {
		return getViewHeaderTitleHostForSoT(this as any, containerEl);
	}

	private closeSelf(): void {
		window.setTimeout(() => {
			try {
				this.leaf.detach();
			} catch (_) { /* ignore */ }
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
		if (this.suspendedForInactive) return;
		const rootEl = this.derivedRootEl;
		const posTop = rootEl.scrollTop;
		const posLeft = rootEl.scrollLeft;
		this.scrollDebouncePendingTop = posTop;
		this.scrollDebouncePendingLeft = posLeft;

		const computed = window.getComputedStyle(rootEl);
		const isVertical = computed.writingMode !== "horizontal-tb";
		const viewport = isVertical ? rootEl.clientWidth : rootEl.clientHeight;
		const delta = isVertical
			? Math.abs(posLeft - this.scrollDebounceLastLeft)
			: Math.abs(posTop - this.scrollDebounceLastTop);
		this.scrollDebounceLastTop = posTop;
		this.scrollDebounceLastLeft = posLeft;

		const now = performance.now();
		const idleDelay = 120;
		const smallThreshold = Math.max(120, viewport * 0.5);
		const isLargeScroll = this.scrollDragActive || delta > smallThreshold;
		this.scrollDebounceLastEventAt = now;

		this.renderPipeline?.notifyScrollActivity(this.scrollDragActive);

		if (!isLargeScroll) {
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
		}, idleDelay);
	}

	private scheduleScrollDebouncedUpdate(): void {
		if (this.scrollDebounceRaf !== null) return;
		this.scrollDebounceRaf = window.requestAnimationFrame(() => {
			this.scrollDebounceRaf = null;
			this.scheduleCaretUpdate();
			this.purgeLineCachesAroundScroll();
			this.renderPipeline?.onScrollSettled();
		});
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
		purgeLineCaches(this as any, start, end);
	}

	private resetPendingRenderState(): void {
		resetPendingRenderState(this as any);
	}

	private finalizeRender(scrollTop: number, scrollLeft: number): void {
		finalizeRender(this as any, scrollTop, scrollLeft);
	}

	private scheduleRender(force = false): void {
		scheduleRender(this as any, force);
	}

	private renderNow(): void {
		renderNow(this as any);
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
		if (this.ceImeMode) {
			return;
		}
		if (this.lineModelRecomputeTimer !== null) return;
		if (this.lineModelRecomputeIdle !== null) return;

		const run = () => {
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
		};

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
		scheduleCaretUpdate(this as any, force);
	}
	private updateCaretPosition(): void {
		updateCaretPosition(this as any);
	}
	private scrollCaretIntoView(): void {
		scrollCaretIntoView(this as any);
	}
	private scrollRectIntoView(rect: DOMRect, rootRect?: DOMRect): void {
		scrollRectIntoView(this as any, rect, rootRect);
	}
	private openHref(href: string): void {
		const trimmed = href.trim();
		if (!trimmed) return;
		const isExternal =
			/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
			/^mailto:/i.test(trimmed) ||
			/^tel:/i.test(trimmed);
		if (isExternal) {
			// Obsidian型定義に openExternal が無い環境でも動くように window.open を使う
			window.open(trimmed);
			return;
		}
		const sourcePath = this.currentFile?.path ?? "";
		this.app.workspace.openLinkText(trimmed, sourcePath, false);
	}

	private replaceSelection(text: string): void {
		if (!this.sotEditor) return;
		const selection = this.sotEditor.getSelection();
		let from = Math.min(selection.anchor, selection.head);
		let to = Math.max(selection.anchor, selection.head);
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

	private handleListOutlinerKeydown(event: KeyboardEvent): boolean {
		if (!this.sotEditor) return false;
		return handleListOutlinerKeydownForSoT(
			{
				getDoc: () => this.sotEditor?.getDoc() ?? null,
				getSelection: () => this.sotEditor?.getSelection() ?? null,
				getLineRanges: () => this.lineRanges,
				getLineBlockKinds: () => this.lineBlockKinds,
				replaceRange: (from, to, insert) => {
					this.sotEditor?.replaceRange(from, to, insert);
				},
				updatePendingText: (text, force) =>
					this.updatePendingText(text, force),
				setSelectionNormalized: (anchor, head) =>
					this.setSelectionNormalized(anchor, head),
				setSelectionRaw: (anchor, head) => {
					this.sotEditor?.setSelection({ anchor, head });
				},
				focusInputSurface: (preventScroll = true) =>
					this.focusInputSurface(preventScroll),
				getWritingMode: () => this.writingMode,
				markImmediateRender: () => {
					this.immediateRender = true;
				},
			},
			event,
		);
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
		this.setSelectionNormalized(anchor, next);
		this.pendingCaretScroll = true;
		this.scheduleCaretUpdate(true);
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
			this.updatePendingText("", true);
			this.immediateRender = true;
			this.sotEditor.replaceRange(from, to, "");
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
		updateSelectionOverlay(this as any);
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
		this.lineRenderer.renderLine(lineEl, lineRange, lineIndex);
	}

	private ensureLineRendered(lineEl: HTMLElement): void {
		this.lineRenderer.ensureLineRendered(lineEl);
	}

	private renderLineLight(
		lineEl: HTMLElement,
		_lineRange: LineRange,
		_lineIndex: number,
	): void {
		this.lineRenderer.renderLineLight(lineEl, _lineRange, _lineIndex);
	}

	private removeRangeFromSegments(
		segments: RenderSegment[],
		removeFrom: number,
		removeTo: number,
	): RenderSegment[] {
		return this.lineRenderer.removeRangeFromSegments(
			segments,
			removeFrom,
			removeTo,
		);
	}

	private removeRangeFromInlineWidgets(
		widgets: InlineWidget[],
		removeFrom: number,
		removeTo: number,
	): InlineWidget[] {
		return this.lineRenderer.removeRangeFromInlineWidgets(
			widgets,
			removeFrom,
			removeTo,
		);
	}

	private splitSegmentsAtOffset(
		segments: RenderSegment[],
		globalOffset: number,
	): { before: RenderSegment[]; after: RenderSegment[] } {
		return this.lineRenderer.splitSegmentsAtOffset(segments, globalOffset);
	}

	private renderInlineSegmentsWithWidgets(
		parent: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		inlineWidgets: InlineWidget[],
		pending?:
			| {
					insertOffset: number;
					pendingText: string;
			  }
			| undefined,
	): void {
		this.lineRenderer.renderInlineSegmentsWithWidgets(
			parent,
			lineRange,
			segments,
			inlineWidgets,
			pending,
		);
	}

	private renderLineFromSegments(
		lineEl: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		pending?:
			| {
					insertOffset: number;
					pendingText: string;
			  }
			| undefined,
		inlineWidgets?: InlineWidget[],
	): void {
		this.lineRenderer.renderLineFromSegments(
			lineEl,
			lineRange,
			segments,
			pending,
			inlineWidgets,
		);
	}

	private renderTableRowLine(
		lineEl: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		inlineWidgets: InlineWidget[],
		pending?:
			| {
					insertOffset: number;
					pendingText: string;
			  }
			| undefined,
	): void {
		this.lineRenderer.renderTableRowLine(
			lineEl,
			lineRange,
			segments,
			inlineWidgets,
			pending,
		);
	}

	private splitSegmentsAtOffsets(
		segments: RenderSegment[],
		offsets: number[],
	): RenderSegment[] {
		return this.lineRenderer.splitSegmentsAtOffsets(segments, offsets);
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
					return { node, offset: remaining };
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
			return { node: last.textNode!, offset: Math.max(0, len) };
		}

		for (let i = 0; i < runInfos.length; i += 1) {
			const run = runInfos[i]!;
			if (safeLocal >= run.from && safeLocal <= run.to) {
				const offsetInRun = Math.max(0, safeLocal - run.from);
				return { node: run.textNode!, offset: offsetInRun };
			}
			const next = runInfos[i + 1];
			if (next && safeLocal > run.to && safeLocal < next.from) {
				// マーカー等の「不可視領域」→次の可視文字の先頭へ寄せる
				return { node: next.textNode!, offset: 0 };
			}
		}
		return {
			node: last.textNode!,
			offset: Math.max(0, last.to - last.from),
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
			return this.calculateOffsetWithinLine(lineEl, node as Text, offset);
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
				);
			}
		}
		return null;
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
