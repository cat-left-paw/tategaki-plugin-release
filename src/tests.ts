/**
 * 回帰テストとバリデーション機能
 */

import { createRequire } from "module";
import {
	DEFAULT_V2_SETTINGS,
	resolveEffectiveBookHeadingPagination,
	resolveEffectiveBookFrontmatterDisplayMode,
	validateV2Settings,
} from "./types/settings";
import {
	documentToHtml,
	documentToMarkdown,
	htmlToDocument,
	markdownToDocument,
} from "./wysiwyg/contenteditable-block/converters/markdown-parser";
import {
	formatSoTTypewriterHighlightOpacityForUi,
	formatSoTTypewriterNonFocusOpacityForUi,
	formatSoTTypewriterFollowBandRatioForUi,
	formatSoTTypewriterOffsetRatioForUi,
	resolveSelectionModeSettingUiState,
	resolveSoTTypewriterHighlightOpacityFromUiPercent,
	resolveSoTTypewriterNonFocusOpacityFromUiPercent,
	resolveSoTTypewriterFollowBandRatioFromUiPercent,
	resolveSoTTypewriterOffsetRatioFromUiPercent,
} from "./wysiwyg/contenteditable/settings-panel-state";
	import { MarkdownConverter } from "./wysiwyg/contenteditable/markdown-converter";
	import { applyAozoraRubyToElement } from "./shared/aozora-ruby";
	import { Editor } from "@tiptap/core";
	import Document from "@tiptap/extension-document";
	import Paragraph from "@tiptap/extension-paragraph";
	import Text from "@tiptap/extension-text";
	import Blockquote from "@tiptap/extension-blockquote";
	import HardBreak from "@tiptap/extension-hard-break";
	import { TextSelection } from "@tiptap/pm/state";
import {
	createTipTapMarkdownAdapter,
	normalizeMarkdownForTipTap,
	protectIndentation,
	restoreIndentation,
} from "./wysiwyg/tiptap-compat/markdown-adapter";
import { COMPAT_TOOLBAR_LIST_BUTTONS } from "./wysiwyg/tiptap-compat/toolbar-list-buttons";
import { resolveFoldRange, headingFoldPluginKey } from "./wysiwyg/tiptap-compat/heading-fold";
import { buildCompatHeadingFoldPreviewText } from "./wysiwyg/tiptap-compat/heading-fold-preview";
import { resolveCompatHeadingFoldUiState } from "./wysiwyg/tiptap-compat/heading-fold-ui";
import { HeadingFoldExtension } from "./wysiwyg/tiptap-compat/extensions/heading-fold-extension";
import { VerticalWritingExtension } from "./wysiwyg/tiptap-compat/extensions/vertical-writing";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import { ChecklistListItem } from "./wysiwyg/tiptap-compat/extensions/checklist-list-item";
import Heading from "@tiptap/extension-heading";
import {
	canUseCompatHardBreak,
	COMPAT_HARD_BREAK_MARKDOWN,
} from "./wysiwyg/tiptap-compat/line-break-policy";
import {
	collectOrderedListRenumberChanges,
	isSoTBlockquoteOnlyLine,
	resolveSoTBlockquoteContinuationEdit,
	resolveSoTListContinuationEdit,
	SOT_MARKDOWN_HARD_BREAK,
} from "./wysiwyg/sot/sot-list-enter";
import {
	computeSoTHorizontalRuleLineDeletionRange,
	isSoTHorizontalRuleLine,
	trySoTHorizontalRuleCollapsedBackspace,
	trySoTHorizontalRuleCollapsedDeleteForward,
} from "./wysiwyg/sot/sot-hr-line-delete";
import {
	runListOutlinerAction,
	type SoTListOutlinerHost,
} from "./wysiwyg/sot/sot-list-outliner";
	import { AozoraRubyNode } from "./wysiwyg/tiptap-compat/extensions/aozora-ruby";
	import { AozoraTcyNode } from "./wysiwyg/tiptap-compat/extensions/aozora-tcy";
	import { resolveTipTapRubySelection } from "./wysiwyg/tiptap-compat/ruby-selection";
import {
	PagedReadingMode,
	calculatePagedPageCount,
	calculatePagedScrollTop,
	resolveEventTargetElement,
} from "./wysiwyg/reading-mode/paged-reading-mode";
import {
	normalizeConsecutiveTitlePageSegments,
	splitIntoBookSegments,
} from "./wysiwyg/reading-mode/book-page-segments";
import { MeasuredPagination } from "./wysiwyg/reading-mode/measured-pagination";
import { htmlHasVisibleContent } from "./wysiwyg/reading-mode/visible-content";
import { debugWarn } from "./shared/logger";
import { compareSemver } from "./shared/version";
import { computeLineRanges, type LineRange } from "./wysiwyg/sot/line-ranges";
import { computeLineRangesFromLines, recomputeLineBlockKinds } from "./wysiwyg/sot/sot-line-model";
import {
	resolveEnsureLineRenderedTargetIndex,
	resolveLineElementFromChildren,
} from "./wysiwyg/sot/sot-line-element-contract";
import {
	resolveSoTFocusBlockAtSelectionHead,
	resolveSoTFocusBlockForLineIndex,
} from "./wysiwyg/sot/sot-focus-block-resolver";
import {
	applySoTFocusVisualClassesToLine,
	SOT_FOCUS_VISUAL_BLOCK_HIGHLIGHT_ROOT_CLASS,
	SOT_FOCUS_VISUAL_DIM_ROOT_CLASS,
	SOT_FOCUS_VISUAL_LINE_CLASS,
	SOT_FOCUS_VISUAL_ROOT_CLASS,
	updateSoTFocusVisualDom,
} from "./wysiwyg/sot/sot-focus-visual-dom";
import {
	resolveSoTCurrentLineVisualRectCandidates,
	resolveSoTCurrentLineDisplayRect,
	resolveSoTCurrentLineVisualRect,
	SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS,
	SOT_FOCUS_VISUAL_CURRENT_LINE_OVERLAY_CLASS,
	updateSoTCurrentLineVisualOverlay,
} from "./wysiwyg/sot/sot-current-line-visual";
import { applySoTFocusVisualCssVariables } from "./wysiwyg/sot/sot-focus-visual-style";
import { isTypewriterMenuActive } from "./wysiwyg/shared/typewriter-menu-active";
import { resolveSoTTypewriterAvailability } from "./wysiwyg/sot/sot-typewriter-availability";
import {
	createInactiveSoTFocusVisualState,
	resolveSoTFocusVisualState,
} from "./wysiwyg/sot/sot-focus-visual-state";
import {
	buildCollapsedGapRanges,
	resolveVisibleLineIndexAfterBudget,
} from "./wysiwyg/sot/sot-collapsed-gap-ranges";
import {
	createCollapsedGapElement,
	getCollapsedGapRangeFromElement,
} from "./wysiwyg/sot/sot-gap-dom";
import {
	computeSoTCollapsePreviewTooltipPosition,
	resolveSoTCollapsePreviewTooltipHost,
} from "./wysiwyg/sot/sot-collapse-preview-tooltip";
import {
	computeCollapsedDiffRebuildRange,
	shiftCollapsedHeadingLines,
	couldLineChangeBlockStructure,
} from "./wysiwyg/sot/sot-collapsed-diff";
import {
	captureScrollAnchor,
	captureScrollAnchorFromLineElements,
	captureScrollAnchorFromViewport,
	computeScrollAnchorAdjustmentFromLineElement,
	shouldApplyScrollAnchorAdjustment,
} from "./wysiwyg/sot/sot-scroll-anchor";
import {
	buildDisplayChunks,
	findChunkIndexForLine,
	validateDisplayChunks,
} from "./wysiwyg/sot/sot-display-chunks";
import {
	buildSoTAozoraRubyText,
	findSoTAozoraRubyMatchForSelection,
} from "./wysiwyg/sot/sot-ruby";
import { t } from "./shared/i18n";
import { SoTChunkController } from "./wysiwyg/sot/sot-chunk-controller";
import { probeChunkSnapshot } from "./wysiwyg/sot/sot-chunk-read-probe";
import {
	decideOnPointerDown,
	shouldHandleNativeSelectionMouseUpFallback,
	resolveEffectiveSelectionMode,
} from "./wysiwyg/sot/sot-native-selection-assist";
import { shouldSnapSoTTailSpacerPointerToDocumentEnd } from "./wysiwyg/sot/sot-pointer";
import { SoTSelectionChangeBinding } from "./wysiwyg/sot/sot-selectionchange-binding";
import { SoTSelectionOverlay } from "./wysiwyg/sot/sot-selection-overlay";
import {
	cancelViewAnimationFrame,
	clearViewTimeout,
	createViewDocumentFragment,
	createViewElement,
	elementFromViewPoint,
	elementsFromViewPoint,
	getViewComputedStyle,
	requestViewAnimationFrame,
	setViewTimeout,
} from "./wysiwyg/sot/sot-view-local-dom";
import {
	resolveSoTLinePointWritingMode,
	shouldSnapPointToLineEnd,
} from "./wysiwyg/sot/sot-line-end-click";
import { resolveSoTNavigationOffset } from "./wysiwyg/sot/sot-navigation";
import {
	applyPlainTextInsertAtOffset,
	findSoTVisualLineStartIndexMatchingLocalOffset,
	isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart,
	isSoTEndPendingVisualOnlyShowsPriorStripeEndAtHead,
	resolveSoTCollapsedEndFirstTapAbsoluteHead,
	resolveSoTCollapsedEndNavigationPlan,
	resolveSoTVisualStripeIndexForLocalHead,
} from "./wysiwyg/sot/sot-end-key-collapsed";
import {
	classifySoTHomeCollapsedPosition,
	resolveSoTCollapsedHomeNavigationPlan,
} from "./wysiwyg/sot/sot-home-key-collapsed";
import { viewportCaretRectDisplayAtPriorStripeInlineEnd } from "./wysiwyg/sot/sot-end-key-visual-caret";
import { shouldSoTDeferClearingEndKeyPendingBeforeHandleNavigate } from "./wysiwyg/sot/sot-end-key-pending-visual-caret";
import { resolveSoTPlainEditHomeEndSelection } from "./wysiwyg/sot/sot-plain-edit-navigation";
import {
	computeSoTPageScrollRemaining,
	evaluateSoTPageScrollOutcome,
	resolveSoTPageNavigationOffsetCandidate,
	resolveSoTPageNavigationOffsetCandidateForOutcome,
	resolveSoTPageNavigationPlan,
	SOT_PAGE_SCROLL_EDGE_REMAINING_PX,
	SOT_PAGE_SCROLL_SUFFICIENT_RATIO,
} from "./wysiwyg/sot/sot-page-navigation";
import {
	clampSoTPageDownDelta,
	computeSoTContentScrollRemainingForPageDown,
	computeSoTScrollPastEndExtent,
} from "./wysiwyg/sot/sot-scroll-past-end";
import {
	resolveSoTNextLogicalLineVisualStartOffset,
	resolveSoTPreviousLogicalLineVisualStartOffset,
	resolveSoTVisualBoundarySnapOffset,
	sortSoTVisualLineRects,
} from "./wysiwyg/sot/sot-visual-navigation";
import {
	isSoTTypewriterCaretWithinBand,
	resolveSoTTypewriterCaretMainAxisPosition,
	resolveSoTTypewriterFollowBand,
	resolveSoTTypewriterScrollPlan,
	resolveSoTTypewriterScrollDeltaToBand,
	resolveSoTTypewriterTarget,
} from "./wysiwyg/sot/sot-typewriter-scroll";
import {
	isSoTTypewriterSuppressedNavigationKey,
	resolveSoTTypewriterSuppressionDecision,
} from "./wysiwyg/sot/sot-typewriter-suppression";
import {
	shouldRequestSoTTypewriterFollowForInput,
	shouldUseSoTTypewriterPendingCaretForFollow,
} from "./wysiwyg/sot/sot-typewriter-follow-request";
import {
	resolveSoTCaretScrollPolicy,
	resolveSoTRenderScrollRestorePolicy,
} from "./wysiwyg/sot/sot-caret-scroll-policy";
import { findSoTRunTextPositionAtOffset } from "./wysiwyg/sot/sot-run-offset";
import { collectRenderableTcyRangesForLine } from "./wysiwyg/sot/sot-inline-tcy";
import { SoTPlainEditController } from "./wysiwyg/sot/sot-plain-edit-controller";
import { SoTPointerWindowBinding } from "./wysiwyg/sot/sot-pointer-window-binding";
import type { SoTEditor } from "./wysiwyg/sot/sot-editor";
import {
	collectAutoTcyRanges,
	convertAozoraTcySyntaxToHtml,
	createAozoraTcyRegExp,
	DEFAULT_AUTO_TCY_MAX_DIGITS,
	DEFAULT_AUTO_TCY_MIN_DIGITS,
	isValidAozoraTcyBody,
	resolveAutoTcyDigitRange,
} from "./shared/aozora-tcy";
import { PlainEditMode } from "./wysiwyg/tiptap-compat/plain-edit-mode";
import { SoTRenderPipeline, type SoTRenderPipelineContext } from "./wysiwyg/sot/sot-render-pipeline";
import { normalizeParsed, parseFrontmatterBlock } from "./shared/frontmatter";
import { Window } from "happy-dom";

const requireFromTests = createRequire(__filename);

/**
 * テスト結果の型
 */
export interface TestResult {
	name: string;
	success: boolean;
	message: string;
	duration: number;
}

/**
 * テストスイート
 */
export class TategakiTestSuite {
	private results: TestResult[] = [];

	/**
	 * 全てのテストを実行
	 */
	async runAllTests(): Promise<TestResult[]> {
		this.results = [];
		
		await this.testSettingsValidation();
		await this.testSelectionModeSettingUiState();
		await this.testSoTTypewriterSettingsUiHelpers();
		await this.testDefaultSettings();
		await this.testCSSVariables();
		await this.testDOMElements();
		await this.testAozoraRubyConversion();
		await this.testBlockEditorConversion();
			await this.testPreviewHeadingSpacing();
		await this.testTipTapCompatStrictLineNormalization();
		await this.testTipTapCompatHeadingIndentationPreserved();
		await this.testTipTapCompatRubyDisabledFlattensRuby();
		await this.testExplicitTcyValidation();
		await this.testTipTapCompatTcyRoundTrip();
		await this.testExplicitTcyCommandAcceptsSingleChar();
			await this.testAutoTcyRangeDetection();
			await this.testAutoTcySettingsDriveSharedHelper();
			await this.testTipTapCompatBlockquoteSerializationAddsBlankLine();
			await this.testTipTapCompatHardBreakSerializationUsesMarkdownBreak();
			await this.testTipTapCompatHardBreakPolicy();
				await this.testTipTapCompatRubyCaretNavigation();
				await this.testTipTapCompatExistingRubyPreservesDelimiter();
				await this.testPagedReadingModePaginationMath();
				await this.testPagedReadingModePopoutEventTargets();
				await this.testPagedReadingModeFrontmatterCoverStaging();
				await this.testPagedReadingModeQueuedNavigationDuringPagination();
				await this.testBookModeConsecutiveTitlePages();
				await this.testBookModeMarkdownBlankLineMarkersBetweenTitlePages();
					await this.testBookModeConsecutiveTitlePageNormalization();
					await this.testBookModeNestedTitlePagesPruneEmptyBodies();
					await this.testBookModeVisibleContentClassification();
					await this.testMeasuredPaginationPrunesNestedPageBreakHeadingGhost();
					await this.testMeasuredPaginationVisibleOnlyPages();
				await this.testSoTLineRanges();
				await this.testSoTHorizontalRuleLineDeleteHelpers();
				await this.testSoTFocusBlockResolverHelper();
		await this.testSoTFocusVisualStateHelper();
		await this.testTypewriterMenuActiveHelper();
		await this.testSoTTypewriterAvailabilityHelper();
		await this.testSoTFocusVisualDomHelper();
		await this.testSoTCurrentLineVisualOverlayHelper();
		await this.testSoTFocusVisualCssVariableHelper();
		await this.testSoTListContinuationEnter();
				await this.testSoTListHardBreakContinuation();
				await this.testSoTBlockquoteContinuationEnter();
				await this.testSoTBlockquoteHardBreakContinuation();
				await this.testSoTBlockquoteOnlyLineDetection();
				await this.testSoTShiftEnterNoop();
				await this.testSoTOrderedListRenumber();
				await this.testSoTListIndentKeepsCaretAfterMarker();
					await this.testSoTRubyEditPreservesDelimiter();
				await this.testSoTDisplayChunksModel();
				await this.testSoTCollapsedGapRanges();
				await this.testSoTCollapsedGapDom();
				await this.testSoTCollapsePreviewTooltipPlacement();
				await this.testSoTCollapsedGapNewlineIntegrity();
				await this.testSoTCollapsedDiffHelpers();
				await this.testSoTScrollAnchor();
				await this.testSoTChunkController();
				await this.testSoTChunkReadProbe();
				await this.testSoTViewLocalDomUsesPopoutWindow();
				await this.testSoTLineEndClickHelper();
				await this.testSoTHomeEndNavigationHelper();
				await this.testSoTCollapsedEndMeansNextVisualLineStart();
				await this.testSoTCollapsedHomePositionBasedNavigation();
				await this.testSoTCollapsedEndPositionBasedNavigation();
				await this.testSoTCollapsedEndSecondTapPendingOverridesRectStripe();
				await this.testSoTPageNavigationHelper();
				await this.testSoTPageNavigationHelperSafety();
				await this.testSoTPageScrollOutcomeHelper();
				await this.testSoTPageScrollRemainingHelper();
				await this.testSoTPageNavigationOffsetCandidateForOutcome();
				await this.testSoTScrollPastEndHelper();
				await this.testSoTTypewriterScrollHelper();
				await this.testSoTTypewriterSuppressionHelper();
				await this.testSoTTypewriterInputFollowRequestHelper();
				await this.testSoTCaretScrollPolicySettingsPanel();
				await this.testSoTPlainEditHomeEndNavigationHelper();
				await this.testSoTPlainEditNormalLineRangeStaysSingleLine();
				await this.testSoTPlainEditShiftHomeEndSelectionHelper();
				await this.testSoTPlainEditModifiedHomeEndIsIgnored();
				await this.testSoTVerticalPreviousLineNavigationHelper();
				await this.testSoTVisualBoundaryNavigationHelper();
				await this.testSoTRunOffsetBoundaryResolution();
				await this.testSoTPointerWindowBindingRebindsWindow();
				await this.testSoTNativeSelectionAssistPointerdownPolicy();
				await this.testSoTTypewriterEffectiveSelectionMode();
				await this.testSoTSelectionOverlayTailSpacerVisibleRange();
				await this.testSoTTailSpacerPointerSnapIsFinalLineOnly();
				await this.testSoTSelectionChangeBindingRebindsDocument();
				await this.testSoTLineElementContract();
				await this.testVersionCompare();
				await this.testOnScrollSettledPreciseFirst();
				await this.testFrontmatterParsing();
			await this.testCompatTaskListHtmlGeneration();
			await this.testCompatTaskListRoundTrip();
			await this.testCompatTaskListDoesNotBreakBulletList();
			await this.testCompatToolbarTaskListButton();
			await this.testCompatHeadingFoldTooltipHelperReuse();
			await this.testCompatHeadingFoldUiHelper();
			await this.testCompatHeadingFoldPreviewTextHelper();
			await this.testCompatHeadingFoldRangeResolution();
			await this.testCompatHeadingFoldRangeNested();
			await this.testCompatHeadingFoldRangeIsolation();
			await this.testCompatFoldStateClearedOnSetMarkdown();
			await this.testCompatTaskListContinuationLineNotDropped();
			await this.testCompatTaskListMixedListNotDropped();
			await this.testCompatTaskListFullRoundTrip();
			await this.testCompatTaskListCheckedStateRoundTrip();
			await this.testCompatTaskListNormalizeHtmlStructure();
			await this.testCompatChecklistSerializeIndent();
			await this.testCompatChecklistToolbarFromParagraph();
			await this.testCompatOrderedChecklistRoundTrip();
			await this.testCompatMixedChecklistMarkersFallback();

			return this.results;
		}

	private async testSoTLineRanges(): Promise<void> {
		const testName = "SoT派生ビュー: 行レンジ計算（UTF-16 offset）";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const ranges = computeLineRanges("a\nbc\n");
			assert(ranges.length === 3, `行数が不正: ${ranges.length}`);
			assert(ranges[0]?.from === 0 && ranges[0]?.to === 1, "1行目レンジ不正");
			assert(ranges[1]?.from === 2 && ranges[1]?.to === 4, "2行目レンジ不正");
			assert(ranges[2]?.from === 5 && ranges[2]?.to === 5, "3行目レンジ不正");

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "行レンジが期待通り",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `行レンジ計算エラー: ${(error as Error).message}`,
				duration,
			});
		}
	}

	private async testSoTHorizontalRuleLineDeleteHelpers(): Promise<void> {
		const testName =
			"SoT派生ビュー: 水平線行の検出と Backspace / Delete 用削除レンジが期待通り";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			assert(isSoTHorizontalRuleLine("---"), "--- は水平線");
			assert(isSoTHorizontalRuleLine("  * * *\t"), "スペース入り * 罫線");
			assert(!isSoTHorizontalRuleLine("foo"), "通常行は水平線ではない");
			assert(!isSoTHorizontalRuleLine("--"), "2 文字は水平線ではない");

			const rangesMid = computeLineRanges("a\n---\nb");
			const delMid = computeSoTHorizontalRuleLineDeletionRange(
				"a\n---\nb",
				rangesMid,
				1,
			);
			assert(delMid?.from === 2 && delMid.to === 6, "中間行は --- と \\n を削除");

			const rangesLast = computeLineRanges("z\n---");
			const delLast = computeSoTHorizontalRuleLineDeletionRange(
				"z\n---",
				rangesLast,
				1,
			);
			assert(delLast?.from === 2 && delLast.to === 5, "末尾行は --- のみ削除");

			const bs = trySoTHorizontalRuleCollapsedBackspace(
				"a\n---\nb",
				rangesMid,
				1,
				5,
			);
			assert(
				bs?.deleteFrom === 2 && bs.deleteTo === 6 && bs.nextCaret === 2,
				"行末 Backspace で水平線＋改行を削除",
			);

			const df = trySoTHorizontalRuleCollapsedDeleteForward(
				"a\n---\nb",
				rangesMid,
				1,
				2,
			);
			assert(
				df?.deleteFrom === 2 && df.deleteTo === 6,
				"行頭 Delete で水平線＋改行を削除",
			);

			const dfEnd = trySoTHorizontalRuleCollapsedDeleteForward(
				"a\n---\nb",
				rangesMid,
				1,
				5,
			);
			assert(
				dfEnd?.deleteFrom === 2 && dfEnd.deleteTo === 6,
				"行末 Delete でも水平線＋改行をまとめて削除",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "水平線 helper が期待通り",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `水平線 helper テスト失敗: ${(error as Error).message}`,
				duration,
			});
		}
	}

	private async testSoTFocusBlockResolverHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: focus block resolver helper は現在行と編集 block を安定解決する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const normalizeLinkLabel = (label: string) =>
				label.trim().toLowerCase();
			const buildState = (text: string, collapsedHeadingLines = new Set<number>()) => {
				const lines = text.split("\n");
				const model = recomputeLineBlockKinds({
					lines,
					collapsedHeadingLines,
					normalizeLinkLabel,
				});
				return {
					lineRanges: computeLineRangesFromLines(lines),
					...model,
				};
			};
			const findLineIndex = (
				ranges: Array<{ from: number; to: number }>,
				offset: number,
			): number | null => {
				if (!Number.isFinite(offset)) return null;
				for (let i = 0; i < ranges.length; i += 1) {
					const range = ranges[i];
					if (!range) continue;
					if (offset >= range.from && offset <= range.to) return i;
				}
				return null;
			};

			const paragraphState = buildState("para1\npara2\n\npara3");
			const paragraph = resolveSoTFocusBlockForLineIndex(paragraphState, 1);
			assert(paragraph?.kind === "paragraph", "通常段落が paragraph にならない");
			assert(
				paragraph?.blockStartLine === 0 && paragraph.blockEndLine === 1,
				`通常段落境界が不正: ${paragraph?.blockStartLine}-${paragraph?.blockEndLine}`,
			);
			const emptyLine = resolveSoTFocusBlockForLineIndex(paragraphState, 2);
			assert(
				emptyLine?.kind === "paragraph" &&
					emptyLine.blockStartLine === 2 &&
					emptyLine.blockEndLine === 2,
				"空行が独立段落として解決されません",
			);

			const headingState = buildState("# Heading\nbody");
			const heading = resolveSoTFocusBlockForLineIndex(headingState, 0);
			assert(heading?.kind === "heading", "見出し行が heading にならない");
			assert(
				heading?.blockStartLine === 0 && heading.blockEndLine === 0,
				"見出しが単体 block になっていません",
			);

			const calloutState = buildState(
				"> [!note] Title\n> body\nnext",
			);
			const callout = resolveSoTFocusBlockForLineIndex(calloutState, 1);
			assert(callout?.kind === "callout", "callout block が解決されません");
			assert(
				callout?.blockStartLine === 0 && callout.blockEndLine === 1,
				"callout block 境界が不正",
			);

			const tableState = buildState(
				"| a | b |\n| --- | --- |\n| c | d |\nnext",
			);
			const table = resolveSoTFocusBlockForLineIndex(tableState, 2);
			assert(table?.kind === "table", "table block が解決されません");
			assert(
				table?.blockStartLine === 0 && table.blockEndLine === 2,
				"table block 境界が不正",
			);

			const deflistState = buildState(
				"term\n: def\nterm2\n: def2\nnext",
			);
			const deflist = resolveSoTFocusBlockForLineIndex(deflistState, 2);
			assert(deflist?.kind === "deflist", "deflist block が解決されません");
			assert(
				deflist?.blockStartLine === 0 && deflist.blockEndLine === 3,
				"deflist block 境界が不正",
			);

			const codeState = buildState(
				"```ts\nconst x = 1;\n```\nnext",
			);
			const code = resolveSoTFocusBlockForLineIndex(codeState, 1);
			assert(code?.kind === "code-block", "code block が解決されません");
			assert(
				code?.blockStartLine === 0 && code.blockEndLine === 2,
				"code block 境界が不正",
			);

			const mathState = buildState(
				"$$\na+b\n$$\nnext",
			);
			const math = resolveSoTFocusBlockForLineIndex(mathState, 1);
			assert(math?.kind === "math-block", "math block が解決されません");
			assert(
				math?.blockStartLine === 0 && math.blockEndLine === 2,
				"math block 境界が不正",
			);

			const frontmatterState = buildState(
				"---\ntitle: test\n---\nbody",
			);
			const frontmatter = resolveSoTFocusBlockForLineIndex(
				frontmatterState,
				1,
			);
			assert(
				frontmatter?.kind === "frontmatter-block",
				"frontmatter block が解決されません",
			);
			assert(
				frontmatter?.blockStartLine === 0 &&
					frontmatter.blockEndLine === 2,
				"frontmatter block 境界が不正",
			);

			const collapsedState = buildState(
				"# H1\nhidden-a\nhidden-b\nnext",
				new Set([0]),
			);
			assert(
				resolveSoTFocusBlockForLineIndex(collapsedState, 1) === null,
				"heading-hidden 行が安全に失敗しません",
			);

			const paragraphFromHead = resolveSoTFocusBlockAtSelectionHead({
				selectionHead: 7,
				findLineIndex: (offset) =>
					findLineIndex(paragraphState.lineRanges, offset),
				state: paragraphState,
			});
			assert(
				paragraphFromHead?.kind === "paragraph" &&
					paragraphFromHead.blockStartLine === 0 &&
					paragraphFromHead.blockEndLine === 1,
				"selection head 経由で paragraph block を解決できません",
			);

			assert(
				resolveSoTFocusBlockForLineIndex(paragraphState, -1) === null,
				"負の line index で安全に失敗しません",
			);
			assert(
				resolveSoTFocusBlockForLineIndex(paragraphState, null) === null,
				"null line index で安全に失敗しません",
			);
			assert(
				resolveSoTFocusBlockAtSelectionHead({
					selectionHead: null,
					findLineIndex: () => 0,
					state: paragraphState,
				}) === null,
				"null selection head で安全に失敗しません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"paragraph/heading/callout/table/deflist/code/math/frontmatter と安全失敗を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `focus block resolver helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTFocusVisualStateHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: focus visual state helper は Typewriter scroll に依存せず current block を解決する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const normalizeLinkLabel = (label: string) =>
				label.trim().toLowerCase();
			const text = "para1\npara2\n\n# Heading\nbody";
			const lines = text.split("\n");
			const model = recomputeLineBlockKinds({
				lines,
				collapsedHeadingLines: new Set<number>(),
				normalizeLinkLabel,
			});
			const lineRanges = computeLineRangesFromLines(lines);
			const blockResolverState = {
				lineRanges,
				...model,
			};
			const findLineIndex = (offset: number): number | null => {
				for (let i = 0; i < lineRanges.length; i += 1) {
					const range = lineRanges[i];
					if (!range) continue;
					if (offset >= range.from && offset <= range.to) return i;
				}
				return null;
			};

			const active = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: false,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
				selection: { anchor: 7, head: 7 },
				findLineIndex,
				blockResolverState,
			});
			assert(active.active, "collapsed caret で focus visual が有効になりません");
			assert(
				active.block?.kind === "paragraph" &&
					active.focusLineStart === 1 &&
					active.focusLineEnd === 1 &&
					active.currentLineIndex === 1,
				"paragraph は V2 では current line 単位に縮まりません",
			);

			const heading = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: false,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
				selection: { anchor: 14, head: 14 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				heading.active &&
					heading.block?.kind === "heading" &&
					heading.focusLineStart === 3 &&
					heading.focusLineEnd === 3 &&
					heading.currentLineIndex === 3,
				"見出し caret で heading 単体 block になりません",
			);

			const suppressedCurrentLine = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: false,
				suppressCurrentLineHighlight: true,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
				selection: { anchor: 14, head: 14 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				suppressedCurrentLine.active &&
					suppressedCurrentLine.currentLineIndex === null &&
					suppressedCurrentLine.focusLineStart === 3 &&
					suppressedCurrentLine.focusLineEnd === 3,
				"current line suppress 時に block まで消えています",
			);

			// Typewriter scroll とは独立して、視覚フォーカスは選択範囲やソースモードなどで inactive になる
			const rangeSelection = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: false,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
				selection: { anchor: 0, head: 7 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				!rangeSelection.active &&
					rangeSelection.reason === "selection-range",
				"range selection で suppress されません",
			);

			const sourceMode = resolveSoTFocusVisualState({
				sourceModeEnabled: true,
				plainTextViewEnabled: false,
				ceImeMode: false,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
				selection: { anchor: 7, head: 7 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				!sourceMode.active && sourceMode.reason === "source-mode",
				"source mode で suppress されません",
			);

			const plainTextView = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: true,
				ceImeMode: false,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
				selection: { anchor: 7, head: 7 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				!plainTextView.active && plainTextView.reason === "plain-text-view",
				"plain text view で suppress されません",
			);

			const ceIme = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: true,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
				selection: { anchor: 7, head: 7 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				!ceIme.active && ceIme.reason === "ce-ime",
				"CE IME 中で suppress されません",
			);

			const blockOnly = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: false,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: false,
				nonFocusDimEnabled: false,
				selection: { anchor: 14, head: 14 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				blockOnly.active &&
					blockOnly.blockHighlightEnabled &&
					!blockOnly.currentLineHighlightEnabled &&
					!blockOnly.nonFocusDimEnabled &&
					blockOnly.currentLineIndex === null,
				"block highlight 単独設定が state に反映されません",
			);

			const dimOnly = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: false,
				blockHighlightEnabled: false,
				currentLineHighlightEnabled: false,
				nonFocusDimEnabled: true,
				selection: { anchor: 14, head: 14 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				dimOnly.active &&
					!dimOnly.blockHighlightEnabled &&
					!dimOnly.currentLineHighlightEnabled &&
					dimOnly.nonFocusDimEnabled &&
					dimOnly.focusLineStart === 3 &&
					dimOnly.focusLineEnd === 3,
				"non-focus dim 単独設定で focus block を保持できません",
			);

			const allDisabled = resolveSoTFocusVisualState({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				ceImeMode: false,
				blockHighlightEnabled: false,
				currentLineHighlightEnabled: false,
				nonFocusDimEnabled: false,
				selection: { anchor: 14, head: 14 },
				findLineIndex,
				blockResolverState,
			});
			assert(
				!allDisabled.active &&
					allDisabled.reason === "visual-focus-disabled",
				"全 toggle OFF で inactive になりません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"Typewriter scroll に依存せず、paragraph/heading current line・toggle 抑制・source/plainText/ceIme/range selection の inactive を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `focus visual state helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testTypewriterMenuActiveHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: Typewriter メニューボタンの active 判定は 4 設定の OR";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			assert(
				!isTypewriterMenuActive({
					scrollEnabled: false,
					blockHighlightEnabled: false,
					currentLineHighlightEnabled: false,
					nonFocusDimEnabled: false,
				}),
				"全 OFF で active になっています",
			);

			assert(
				isTypewriterMenuActive({
					scrollEnabled: true,
					blockHighlightEnabled: false,
					currentLineHighlightEnabled: false,
					nonFocusDimEnabled: false,
				}),
				"Typewriter scroll のみ ON で active になりません",
			);

			assert(
				isTypewriterMenuActive({
					scrollEnabled: false,
					blockHighlightEnabled: true,
					currentLineHighlightEnabled: false,
					nonFocusDimEnabled: false,
				}),
				"block highlight のみ ON で active になりません (scroll とは独立)",
			);

			assert(
				isTypewriterMenuActive({
					scrollEnabled: false,
					blockHighlightEnabled: false,
					currentLineHighlightEnabled: true,
					nonFocusDimEnabled: false,
				}),
				"current line highlight のみ ON で active になりません",
			);

			assert(
				isTypewriterMenuActive({
					scrollEnabled: false,
					blockHighlightEnabled: false,
					currentLineHighlightEnabled: false,
					nonFocusDimEnabled: true,
				}),
				"non-focus dim のみ ON で active になりません",
			);

			assert(
				isTypewriterMenuActive({
					scrollEnabled: true,
					blockHighlightEnabled: true,
					currentLineHighlightEnabled: true,
					nonFocusDimEnabled: true,
				}),
				"全 ON で active になりません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"4 設定 (scroll / block / current line / dim) のいずれかが ON ならボタンが active 扱い",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Typewriter menu active helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTTypewriterAvailabilityHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: Typewriter availability は source/plain text/plain edit で利用不可";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const ok = resolveSoTTypewriterAvailability({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				plainEditActive: false,
			});
			assert(ok.available === true, "通常 SoT で available になっていない");
			assert(ok.reason === null, "通常 SoT の reason が null になっていない");

			const src = resolveSoTTypewriterAvailability({
				sourceModeEnabled: true,
				plainTextViewEnabled: false,
				plainEditActive: false,
			});
			assert(src.available === false, "source mode で利用可能のままになっている");
			assert(
				src.reason === "source-mode",
				`source mode の reason が source-mode になっていない: ${src.reason}`,
			);

			const plain = resolveSoTTypewriterAvailability({
				sourceModeEnabled: false,
				plainTextViewEnabled: true,
				plainEditActive: false,
			});
			assert(
				plain.available === false,
				"plain text view で利用可能のままになっている",
			);
			assert(
				plain.reason === "plain-text-view",
				`plain text view の reason が plain-text-view になっていない: ${plain.reason}`,
			);

			const pe = resolveSoTTypewriterAvailability({
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
				plainEditActive: true,
			});
			assert(
				pe.available === false,
				"plain edit 中で利用可能のままになっている",
			);
			assert(
				pe.reason === "plain-edit",
				`plain edit の reason が plain-edit になっていない: ${pe.reason}`,
			);

			// 複合条件: plain edit が最優先
			const both = resolveSoTTypewriterAvailability({
				sourceModeEnabled: true,
				plainTextViewEnabled: true,
				plainEditActive: true,
			});
			assert(
				both.available === false && both.reason === "plain-edit",
				"複合条件で plain edit が優先されていない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"通常 SoT は available、source / plain text / plain edit では利用不可と reason を返す",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Typewriter availability helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTFocusVisualDomHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: focus visual DOM helper は current block marker と root class を差分更新する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const window = new Window();
			const document =
				window.document as unknown as globalThis.Document;
			const rootEl = document.createElement("div") as HTMLElement;
			rootEl.className = "tategaki-sot-derived-root";
			const lines = new Map<number, HTMLElement>();
			for (let i = 0; i < 4; i += 1) {
				const lineEl = document.createElement("div") as HTMLElement;
				lineEl.className = "tategaki-sot-line";
				lineEl.dataset.line = String(i);
				rootEl.appendChild(lineEl);
				lines.set(i, lineEl);
			}
			const hiddenLine = document.createElement("div") as HTMLElement;
			hiddenLine.className =
				"tategaki-sot-line tategaki-md-heading-hidden";
			hiddenLine.dataset.line = "9";

			const previousState = createInactiveSoTFocusVisualState(
				"visual-focus-disabled",
			);
			const blockA = {
				active: true,
				reason: null,
				block: null,
				focusLineStart: 0,
				focusLineEnd: 1,
				currentLineIndex: 1,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
			};
			updateSoTFocusVisualDom({
				rootEl,
				previousState,
				nextState: blockA,
				getLineElement: (lineIndex) => lines.get(lineIndex) ?? null,
			});
			assert(
				rootEl.classList.contains(SOT_FOCUS_VISUAL_ROOT_CLASS),
				"root に focus visual active class が付きません",
			);
			assert(
				rootEl.classList.contains(SOT_FOCUS_VISUAL_DIM_ROOT_CLASS),
				"root に dim enabled class が付きません",
			);
			assert(
				rootEl.classList.contains(
					SOT_FOCUS_VISUAL_BLOCK_HIGHLIGHT_ROOT_CLASS,
				),
				"root に block highlight enabled class が付きません",
			);
			assert(
				lines.get(0)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
					true &&
					lines.get(1)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
						true,
				"current block line に highlight class が付きません",
			);
			assert(
				lines.get(2)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
					false,
				"非フォーカス line まで highlight されています",
			);
			assert(
				lines.get(1)?.classList.contains(
					SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS,
				) === false,
				"current line class が line 要素へ付与されています",
			);

			const blockB = {
				active: true,
				reason: null,
				block: null,
				focusLineStart: 2,
				focusLineEnd: 3,
				currentLineIndex: 2,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
			};
			updateSoTFocusVisualDom({
				rootEl,
				previousState: blockA,
				nextState: blockB,
				getLineElement: (lineIndex) => lines.get(lineIndex) ?? null,
			});
			assert(
				lines.get(0)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
					false &&
					lines.get(1)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
						false &&
					lines.get(2)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
						true,
				"caret 移動時に current block の class 切替が追従しません",
			);

			applySoTFocusVisualClassesToLine({
				lineEl: hiddenLine,
				lineIndex: 9,
				state: blockB,
			});
			assert(
				!hiddenLine.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS),
				"hidden 行まで focus class を付与しています",
			);

			const paragraphState = {
				active: true,
				reason: null,
				block: null,
				focusLineStart: 1,
				focusLineEnd: 1,
				currentLineIndex: 1,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
			};
			applySoTFocusVisualClassesToLine({
				lineEl: lines.get(1)!,
				lineIndex: 1,
				state: paragraphState,
			});
			assert(
				lines.get(1)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
					true,
				"paragraph で current block marker が壊れています",
			);

			const dimOnlyState = {
				active: true,
				reason: null,
				block: null,
				focusLineStart: 1,
				focusLineEnd: 2,
				currentLineIndex: null,
				blockHighlightEnabled: false,
				currentLineHighlightEnabled: false,
				nonFocusDimEnabled: true,
			};
			updateSoTFocusVisualDom({
				rootEl,
				previousState: paragraphState,
				nextState: dimOnlyState,
				getLineElement: (lineIndex) => lines.get(lineIndex) ?? null,
			});
			assert(
				rootEl.classList.contains(SOT_FOCUS_VISUAL_DIM_ROOT_CLASS),
				"dim only で root dim class が外れています",
			);
			assert(
				!rootEl.classList.contains(
					SOT_FOCUS_VISUAL_BLOCK_HIGHLIGHT_ROOT_CLASS,
				),
				"block highlight OFF でも root highlight class が残っています",
			);
			assert(
				lines.get(1)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
					true,
				"dim only で focus block marker の切替が不正です",
			);

			updateSoTFocusVisualDom({
				rootEl,
				previousState: dimOnlyState,
				nextState: createInactiveSoTFocusVisualState("selection-range"),
				getLineElement: (lineIndex) => lines.get(lineIndex) ?? null,
			});
			assert(
				!rootEl.classList.contains(SOT_FOCUS_VISUAL_ROOT_CLASS),
				"inactive 遷移で root class が残っています",
			);
			assert(
				!rootEl.classList.contains(SOT_FOCUS_VISUAL_DIM_ROOT_CLASS) &&
					!rootEl.classList.contains(
						SOT_FOCUS_VISUAL_BLOCK_HIGHLIGHT_ROOT_CLASS,
					),
				"inactive 遷移で focus visual root subclass が残っています",
			);
			assert(
				lines.get(2)?.classList.contains(SOT_FOCUS_VISUAL_LINE_CLASS) ===
					false,
				"inactive 遷移で current block class が残っています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"current block marker・root class・hidden 行安全側を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `focus visual DOM helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCurrentLineVisualOverlayHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: current line visual overlay helper は caret に最も近い visual rect へ overlay する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const window = new Window();
			const document =
				window.document as unknown as globalThis.Document;
			const rootEl = document.createElement("div") as HTMLElement;
			const overlayEl = document.createElement("div") as HTMLElement;
			rootEl.appendChild(overlayEl);
			rootEl.scrollLeft = 11;
			rootEl.scrollTop = 13;
			rootEl.getBoundingClientRect = () =>
				new DOMRect(100, 200, 400, 500);

			const state = {
				active: true,
				reason: null,
				block: null,
				focusLineStart: 2,
				focusLineEnd: 4,
				currentLineIndex: 3,
				blockHighlightEnabled: true,
				currentLineHighlightEnabled: true,
				nonFocusDimEnabled: true,
			};

			const firstRect = new DOMRect(180, 220, 24, 140);
			const secondRect = new DOMRect(140, 220, 24, 140);
			const resolvedRect = resolveSoTCurrentLineVisualRect({
				lineVisualRects: [firstRect, secondRect],
				caretRect: new DOMRect(145, 250, 8, 18),
			});
			assert(
				resolvedRect === secondRect,
				"caret に最も近い visual rect が選ばれません",
			);
			const committedRect = new DOMRect(190, 220, 24, 140);
			const pendingWrappedRect = new DOMRect(110, 220, 24, 140);
			const pendingCandidates =
				resolveSoTCurrentLineVisualRectCandidates({
					lineVisualRects: [committedRect],
					pendingLineVisualRects: [pendingWrappedRect],
					usePendingCaret: true,
				});
			const pendingResolvedRect = resolveSoTCurrentLineVisualRect({
				lineVisualRects: pendingCandidates,
				caretRect: new DOMRect(112, 250, 8, 18),
			});
			assert(
				pendingResolvedRect === pendingWrappedRect,
				"pending spacer の wrapped rect が current line 候補に入りません",
			);
			const committedOnlyCandidates =
				resolveSoTCurrentLineVisualRectCandidates({
					lineVisualRects: [committedRect],
					pendingLineVisualRects: [pendingWrappedRect],
					usePendingCaret: false,
				});
			assert(
				committedOnlyCandidates.length === 1 &&
					committedOnlyCandidates[0] === committedRect,
				"pending caret でないときに pending rect が混入しています",
			);
			if (!resolvedRect) {
				throw new Error("visual rect が null です");
			}
			const displayRect = resolveSoTCurrentLineDisplayRect({
				visualRect: resolvedRect,
				lineRect: new DOMRect(138, 214, 30, 146),
				caretRect: new DOMRect(145, 250, 8, 18),
				writingMode: "vertical-rl",
				fontSize: 18,
				lineHeight: 32,
			});
			if (!displayRect) {
				throw new Error("display rect が null です");
			}
			assert(
				displayRect.left === 137 &&
					displayRect.top === 214 &&
					displayRect.width === 30 &&
					displayRect.height === 146,
				"display rect が lineRect 優先の 1 行帯になりません",
			);

			updateSoTCurrentLineVisualOverlay({
				rootEl,
				overlayEl,
				state,
				rect: displayRect,
			});
			assert(
				overlayEl.classList.contains(
					SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS,
				),
				"current line overlay active class が付きません",
			);
			assert(
				overlayEl.style.display === "block" &&
					window.getComputedStyle(overlayEl as any).display === "block",
				"current line overlay active 時に表示状態になりません",
			);
			assert(
				overlayEl.style.left === "48px" &&
					overlayEl.style.top === "27px" &&
					overlayEl.style.width === "30px" &&
					overlayEl.style.height === "146px",
				`current line overlay の位置/サイズが不正です: left=${overlayEl.style.left} top=${overlayEl.style.top} width=${overlayEl.style.width} height=${overlayEl.style.height}`,
			);

			updateSoTCurrentLineVisualOverlay({
				rootEl,
				overlayEl,
				state: {
					...state,
					currentLineHighlightEnabled: false,
				},
				rect: displayRect,
			});
			assert(
				overlayEl.style.display === "none" &&
					!overlayEl.classList.contains(
						SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS,
					),
				"current line highlight OFF で overlay が消えません",
			);

			updateSoTCurrentLineVisualOverlay({
				rootEl,
				overlayEl,
				state: {
					...state,
					currentLineIndex: null,
				},
				rect: displayRect,
			});
			assert(
				overlayEl.style.display === "none" &&
					!overlayEl.classList.contains(
						SOT_FOCUS_VISUAL_CURRENT_LINE_CLASS,
					),
				"current line suppress 中でも overlay が残っています",
			);

			updateSoTCurrentLineVisualOverlay({
				rootEl,
				overlayEl,
				state,
				rect: null,
			});
			assert(
				overlayEl.style.display === "none",
				"rect が null でも overlay が残っています",
			);

			overlayEl.className = SOT_FOCUS_VISUAL_CURRENT_LINE_OVERLAY_CLASS;
			assert(
				overlayEl.className ===
					SOT_FOCUS_VISUAL_CURRENT_LINE_OVERLAY_CLASS,
				"overlay base class の参照が不正です",
			);
			const emptyLineRect = resolveSoTCurrentLineDisplayRect({
				visualRect: new DOMRect(220, 180, 0, 12),
				lineRect: new DOMRect(214, 160, 32, 240),
				caretRect: new DOMRect(220, 182, 1, 12),
				writingMode: "vertical-rl",
				fontSize: 18,
				lineHeight: 32,
			});
			assert(
				!!emptyLineRect &&
					emptyLineRect.left === 211 &&
					emptyLineRect.top === 160 &&
					emptyLineRect.width === 38 &&
					emptyLineRect.height === 240,
				"空行相当でも lineRect ベースの固定帯になりません",
			);
			const fallbackRect = resolveSoTCurrentLineDisplayRect({
				visualRect: new DOMRect(220, 180, 0, 12),
				lineRect: null,
				caretRect: new DOMRect(220, 182, 1, 12),
				writingMode: "vertical-rl",
				fontSize: 18,
				lineHeight: 32,
			});
			assert(
				!!fallbackRect &&
					fallbackRect.width >= 16 &&
					fallbackRect.height >= 26,
				"lineRect がなくても current line 用の最小サイズが確保されません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"current line display rect が lineRect 優先の帯になり、overlay が toggle に追従します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `current line overlay helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTFocusVisualCssVariableHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: focus visual CSS variable helper は derived root 自身へ設定値を反映する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const window = new Window();
			const document =
				window.document as unknown as globalThis.Document;
			const wrapperEl = document.createElement("div") as HTMLElement;
			const rootEl = document.createElement("div") as HTMLElement;
			wrapperEl.appendChild(rootEl);
			rootEl.style.setProperty(
				"--tategaki-sot-typewriter-block-highlight-color",
				"#1e90ff",
			);
			wrapperEl.style.setProperty(
				"--tategaki-sot-typewriter-block-highlight-color",
				"#ff0000",
			);

			applySoTFocusVisualCssVariables(rootEl, {
				sotTypewriterBlockHighlightColor: "#00aa00",
				sotTypewriterBlockHighlightOpacity: 0.33,
				sotTypewriterCurrentLineHighlightColor: "#2244ff",
				sotTypewriterCurrentLineHighlightOpacity: 0.55,
				sotTypewriterNonFocusOpacity: 0.44,
			});

			assert(
				rootEl.style.getPropertyValue(
					"--tategaki-sot-typewriter-block-highlight-color",
				) === "#00aa00",
				"block highlight color が derived root に設定されません",
			);
			assert(
				rootEl.style.getPropertyValue(
					"--tategaki-sot-typewriter-block-highlight-opacity",
				) === "0.33",
				"block highlight opacity が derived root に設定されません",
			);
			assert(
				rootEl.style.getPropertyValue(
					"--tategaki-sot-typewriter-current-line-highlight-color",
				) === "#2244ff",
				"current line color が derived root に設定されません",
			);
			assert(
				rootEl.style.getPropertyValue(
					"--tategaki-sot-typewriter-current-line-highlight-opacity",
				) === "0.55",
				"current line opacity が derived root に設定されません",
			);
			assert(
				rootEl.style.getPropertyValue(
					"--tategaki-sot-typewriter-nonfocus-opacity",
				) === "0.44",
				"non-focus opacity が derived root に設定されません",
			);
			assert(
				wrapperEl.style.getPropertyValue(
					"--tategaki-sot-typewriter-block-highlight-color",
				) === "#ff0000",
				"wrapper 側の値まで書き換えています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "focus visual CSS 変数が derived root へ直接反映されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `focus visual CSS variable helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTViewLocalDomUsesPopoutWindow(): Promise<void> {
		const testName = "SoT派生ビュー: view-local DOM helper は popout window/document を使う";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const mainWindow = new Window();
			const popoutWindow = new Window();
			const mainDoc =
				mainWindow.document as unknown as globalThis.Document;
			const popoutDoc =
				popoutWindow.document as unknown as globalThis.Document;
			const mainEl =
				mainDoc.createElement("div") as unknown as HTMLElement;
			const popoutEl =
				popoutDoc.createElement("div") as unknown as HTMLElement;
			let mainElementsFromPointCalls = 0;
			let popoutElementsFromPointCalls = 0;
			let mainElementFromPointCalls = 0;
			let popoutElementFromPointCalls = 0;
			let mainGetComputedStyleCalls = 0;
			let popoutGetComputedStyleCalls = 0;
			let mainTimeoutCalls = 0;
			let popoutTimeoutCalls = 0;
			let popoutClearTimeoutCalls = 0;
			let mainRafCalls = 0;
			let popoutRafCalls = 0;
			let popoutCancelRafCalls = 0;

			Reflect.set(mainDoc, "elementsFromPoint", () => {
				mainElementsFromPointCalls += 1;
				return [mainEl];
			});
			Reflect.set(popoutDoc, "elementsFromPoint", () => {
				popoutElementsFromPointCalls += 1;
				return [popoutEl];
			});
			Reflect.set(mainDoc, "elementFromPoint", () => {
				mainElementFromPointCalls += 1;
				return mainEl;
			});
			Reflect.set(popoutDoc, "elementFromPoint", () => {
				popoutElementFromPointCalls += 1;
				return popoutEl;
			});
			Reflect.set(mainWindow, "getComputedStyle", () => {
				mainGetComputedStyleCalls += 1;
				return {
					writingMode: "horizontal-tb",
					fontSize: "11px",
					lineHeight: "11px",
				} as CSSStyleDeclaration;
			});
			Reflect.set(popoutWindow, "getComputedStyle", () => {
				popoutGetComputedStyleCalls += 1;
				return {
					writingMode: "vertical-rl",
					fontSize: "19px",
					lineHeight: "31px",
				} as CSSStyleDeclaration;
			});
			Reflect.set(mainWindow, "setTimeout", () => {
				mainTimeoutCalls += 1;
				return 11;
			});
			Reflect.set(popoutWindow, "setTimeout", () => {
				popoutTimeoutCalls += 1;
				return 22;
			});
			Reflect.set(popoutWindow, "clearTimeout", () => {
				popoutClearTimeoutCalls += 1;
			});
			Reflect.set(mainWindow, "requestAnimationFrame", () => {
				mainRafCalls += 1;
				return 33;
			});
			Reflect.set(popoutWindow, "requestAnimationFrame", () => {
				popoutRafCalls += 1;
				return 44;
			});
			Reflect.set(popoutWindow, "cancelAnimationFrame", () => {
				popoutCancelRafCalls += 1;
			});

			assert(
				elementsFromViewPoint(popoutEl, 10, 20)[0] === popoutEl,
				"elementsFromPoint が popout document を見ていません"
			);
			assert(
				popoutElementsFromPointCalls === 1 &&
					mainElementsFromPointCalls === 0,
				"elementsFromPoint が main document を参照しています"
			);
			assert(
				elementFromViewPoint(popoutEl, 10, 20) === popoutEl,
				"elementFromPoint が popout document を見ていません"
			);
			assert(
				popoutElementFromPointCalls === 1 &&
					mainElementFromPointCalls === 0,
				"elementFromPoint が main document を参照しています"
			);
			assert(
				getViewComputedStyle(popoutEl).writingMode === "vertical-rl",
				"getComputedStyle が popout window を使っていません"
			);
			assert(
				popoutGetComputedStyleCalls === 1 &&
					mainGetComputedStyleCalls === 0,
				"getComputedStyle が main window を参照しています"
			);
			assert(
				createViewElement(popoutEl, "div").ownerDocument === popoutDoc,
				"createElement が popout document を使っていません"
			);
			assert(
				createViewDocumentFragment(popoutEl).ownerDocument === popoutDoc,
				"createDocumentFragment が popout document を使っていません"
			);
			assert(
				setViewTimeout(popoutEl, () => undefined, 10) === 22,
				"setTimeout が popout window を使っていません"
			);
			assert(
				popoutTimeoutCalls === 1 && mainTimeoutCalls === 0,
				"setTimeout が main window を参照しています"
			);
			clearViewTimeout(popoutEl, 22);
			assert(
				popoutClearTimeoutCalls === 1,
				"clearTimeout が popout window を使っていません"
			);
			assert(
				requestViewAnimationFrame(popoutEl, () => undefined) === 44,
				"requestAnimationFrame が popout window を使っていません"
			);
			assert(
				popoutRafCalls === 1 && mainRafCalls === 0,
				"requestAnimationFrame が main window を参照しています"
			);
			cancelViewAnimationFrame(popoutEl, 44);
			assert(
				popoutCancelRafCalls === 1,
				"cancelAnimationFrame が popout window を使っていません"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "overlay/render helper が ownerDocument/defaultView に従います",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `view-local DOM helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTLineEndClickHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: 行末外クリック helper は line end 判定と popout writingMode を解決する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const mainWindow = new Window();
			const popoutWindow = new Window();
			const popoutDoc =
				popoutWindow.document as unknown as globalThis.Document;
			const popoutRoot =
				popoutDoc.createElement("div") as unknown as HTMLElement;
			const popoutLine =
				popoutDoc.createElement("div") as unknown as HTMLElement;
			let mainGetComputedStyleCalls = 0;
			let popoutGetComputedStyleCalls = 0;

			Reflect.set(mainWindow, "getComputedStyle", () => {
				mainGetComputedStyleCalls += 1;
				return {
					writingMode: "horizontal-tb",
				} as CSSStyleDeclaration;
			});
			Reflect.set(popoutWindow, "getComputedStyle", () => {
				popoutGetComputedStyleCalls += 1;
				return {
					writingMode: "vertical-rl",
				} as CSSStyleDeclaration;
			});

			assert(
				resolveSoTLinePointWritingMode(popoutRoot, popoutLine) ===
					"vertical-rl",
				"writingMode が popout window から解決されません"
			);
			assert(
				popoutGetComputedStyleCalls === 1 &&
					mainGetComputedStyleCalls === 0,
				"writingMode 解決で main window を参照しています"
			);

			const horizontalRects = [
				DOMRect.fromRect({ x: 10, y: 10, width: 18, height: 12 }),
				DOMRect.fromRect({ x: 10, y: 30, width: 20, height: 12 }),
			];
			assert(
				shouldSnapPointToLineEnd({
					rects: horizontalRects,
					writingMode: "horizontal-tb",
					clientX: 36,
					clientY: 36,
				}),
				"横書きの行末外クリックが line end 扱いになりません"
			);
			assert(
				!shouldSnapPointToLineEnd({
					rects: horizontalRects,
					writingMode: "horizontal-tb",
					clientX: 24,
					clientY: 12,
				}),
				"通常の本文クリックまで line end 扱いされています"
			);

			const verticalRects = [
				DOMRect.fromRect({ x: 100, y: 10, width: 12, height: 30 }),
				DOMRect.fromRect({ x: 80, y: 10, width: 12, height: 20 }),
			];
			assert(
				shouldSnapPointToLineEnd({
					rects: verticalRects,
					writingMode: "vertical-rl",
					clientX: 86,
					clientY: 36,
				}),
				"縦書きの行末外クリックが line end 扱いになりません"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "line end 補正条件と popout writingMode 解決を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `line end helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTHomeEndNavigationHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: Home/End navigation helper は writing mode ごとに行頭/行末を返す";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const doc = "alpha\nbeta\ncharlie";
			const alphaStart = 0;
			const alphaEnd = 5;
			const betaStart = 6;
			const betaEnd = 10;
			const charlieStart = 11;
			const charlieEnd = 18;

			const verifyLineBoundaryOffsets = (
				writingMode: "horizontal-tb" | "vertical-rl" | "vertical-lr",
			) => {
				assert(
					resolveSoTNavigationOffset(doc, betaStart + 2, "Home", writingMode) ===
						betaStart,
					`${writingMode}: Home が現在行の行頭を返しません`,
				);
				assert(
					resolveSoTNavigationOffset(doc, betaStart + 2, "End", writingMode) ===
						betaEnd,
					`${writingMode}: End が現在行の行末を返しません`,
				);
			};

			verifyLineBoundaryOffsets("horizontal-tb");
			verifyLineBoundaryOffsets("vertical-rl");
			verifyLineBoundaryOffsets("vertical-lr");

			assert(
				resolveSoTNavigationOffset(doc, alphaStart, "Home", "horizontal-tb") ===
					alphaStart,
				"行頭での Home がそのままになりません",
			);
			assert(
				resolveSoTNavigationOffset(doc, charlieEnd, "End", "vertical-rl") ===
					charlieEnd,
				"行末での End がそのままになりません",
			);
			assert(
				resolveSoTNavigationOffset(doc, alphaEnd, "End", "vertical-lr") ===
					alphaEnd,
				"改行直前の End が現在行の行末を返しません",
			);
			assert(
				resolveSoTNavigationOffset(doc, charlieStart + 3, "Home", "vertical-rl") ===
					charlieStart,
				"最終行の Home が現在行の行頭を返しません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Home/End helper が writing mode ごとの論理行境界を返します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Home/End navigation helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedEndMeansNextVisualLineStart(): Promise<void> {
		const testName =
			"SoT collapsed End は表示行末を「次視覚行先頭」と同値の論理位置とする（差分 -1 と rect 依存でない stripe 決定）";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const lineRange: LineRange = { from: 0, to: 10 };
			const startsA = [0, 5] as readonly number[];

			assert(
				resolveSoTVisualStripeIndexForLocalHead(4, startsA) === 0,
				"local 4 の stripe が 0 ではない",
			);
			assert(
				resolveSoTVisualStripeIndexForLocalHead(5, startsA) === 1,
				"local 5 が次視覚行頭で stripe が 1 ではない",
			);

			const tap = resolveSoTCollapsedEndFirstTapAbsoluteHead({
				headAbs: 3,
				lineRange,
				visualLineStartsLocal: startsA,
			});
			if (tap == null || tap !== 5) {
				throw new Error(`End が次視覚行頭 5 でない got ${tap}`);
			}
			const insertAtFirstBreak: number = tap;
			assert(
				insertAtFirstBreak !== 4,
				"End が nextVisualStart-1 と同値ではあってはいけない",
			);

			const docTen = "abcdefghij";
			assert(
				applyPlainTextInsertAtOffset(
					docTen,
					insertAtFirstBreak,
					"X",
				) === "abcdeXfghij",
				"次視覚行頭への挿入で列境界がずれない",
			);

			assert(
				applyPlainTextInsertAtOffset(docTen, 4, "X") === "abcdXefghij",
				"tap-1 での挿入は別結果であること（検証データ整合）",
			);

			const startsB = [0, 3, 9] as const;
			assert(
				resolveSoTVisualStripeIndexForLocalHead(7, [...startsB]) === 1,
				"3 視覚行で starts のみによる stripe インデックス",
			);
			assert(
				resolveSoTVisualStripeIndexForLocalHead(10, [...startsB]) === 2,
				"local 10 は最終視覚 stripe 2",
			);

			assert(
				resolveSoTCollapsedEndFirstTapAbsoluteHead({
					headAbs: 2,
					lineRange,
					visualLineStartsLocal: [...startsB],
				}) === 3,
				"第一視覚行内での End が次視覚行頭 3 と同値にならない",
			);

			assert(
				resolveSoTCollapsedEndFirstTapAbsoluteHead({
					headAbs: 12,
					lineRange,
					visualLineStartsLocal: [...startsB],
				}) === null,
				"最終視覚行では null で論理 End へフォールバックする",
			);

			const stripeRect = {
				left: 100,
				top: 50,
				width: 28,
				height: 400,
			};
			const sampleGlyph = {
				left: 100,
				top: 200,
				width: 20,
				height: 24,
			};
			const vEnd = viewportCaretRectDisplayAtPriorStripeInlineEnd(
				stripeRect,
				sampleGlyph,
				"vertical-rl",
				3,
			);
			assert(
				vEnd.bottom <= stripeRect.top + stripeRect.height + 1e-6,
				"縦書き End 視覚専用矩形は視覚ストライプ下端を超えない",
			);
			assert(
				vEnd.bottom >= stripeRect.top + stripeRect.height - 10,
				"縦書き End 視覚専用矩形はストライプ下端に近い",
			);
			const hEnd = viewportCaretRectDisplayAtPriorStripeInlineEnd(
				stripeRect,
				sampleGlyph,
				"horizontal-tb",
				3,
			);
			assert(
				hEnd.right <= stripeRect.left + stripeRect.width + 1e-6,
				"横書き End 視覚専用矩形は視覚ストライプ右端を超えない",
			);
			assert(
				hEnd.right >= stripeRect.left + stripeRect.width - 10,
				"横書き End 視覚専用矩形はストライプ右端に近い",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "End と次視覚行先頭の同値性・入力意味を満たす",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `collapsed End / 視覚行同値 テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedHomePositionBasedNavigation(): Promise<void> {
		const testName =
			"SoT collapsed Home は論理／視覚行先頭のみローカルオフセットで分岐し rect に依存しない";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const starts = [0, 6] as const;
			const lineLen = 12;

			assert(
				classifySoTHomeCollapsedPosition(0, starts, lineLen) ===
					"logical_line_start",
				"local 0 は論理行頭",
			);
			assert(
				classifySoTHomeCollapsedPosition(6, starts, lineLen) ===
					"visual_line_start_only",
				"折返し視覚行頭のみは visual_line_start_only",
			);
			assert(
				classifySoTHomeCollapsedPosition(9, starts, lineLen) === "mid_stripe",
				"ストライプ途中は mid_stripe",
			);

			let plan = resolveSoTCollapsedHomeNavigationPlan({
				localHead: 0,
				visualLineStartsLocal: starts,
				lineLength: lineLen,
			});
			assert(plan.kind === "noop", "論理行頭は noop");

			plan = resolveSoTCollapsedHomeNavigationPlan({
				localHead: 6,
				visualLineStartsLocal: starts,
				lineLength: lineLen,
			});
			assert(
				plan.kind === "move" && plan.targetLocalOffset === 0,
				"視覚行頭のみは論理行頭へ",
			);

			plan = resolveSoTCollapsedHomeNavigationPlan({
				localHead: 10,
				visualLineStartsLocal: starts,
				lineLength: lineLen,
			});
			assert(
				plan.kind === "move" && plan.targetLocalOffset === 6,
				"第2ストライプ途中は当該視覚行先頭 6 へ",
			);

			plan = resolveSoTCollapsedHomeNavigationPlan({
				localHead: 3,
				visualLineStartsLocal: starts,
				lineLength: lineLen,
			});
			assert(
				plan.kind === "move" && plan.targetLocalOffset === 0,
				"第1ストライプ途中は視覚行先頭 0（=論理行頭）へ",
			);

			const triple = [0, 3, 9] as const;
			assert(
				classifySoTHomeCollapsedPosition(7, triple, 12) === "mid_stripe",
				"3 ストライプの中央付近は mid",
			);
			plan = resolveSoTCollapsedHomeNavigationPlan({
				localHead: 7,
				visualLineStartsLocal: triple,
				lineLength: 12,
			});
			assert(
				plan.kind === "move" && plan.targetLocalOffset === 3,
				"local 7 のストライプ先頭は 3",
			);

			assert(
				resolveSoTVisualStripeIndexForLocalHead(5, [...triple]) === 1,
				"classify と整合する stripe index（補助）",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Home が visualLineStartsLocal と localHead のみで安定して計画できる",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `collapsed Home テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedEndPositionBasedNavigation(): Promise<void> {
		const testName =
			"SoT collapsed End は論理末尾・pending 前行末オーバーレイを二段目で最優先し列境界と併せて誤進を防ぐ";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const lineRange: LineRange = { from: 0, to: 20 };
			const starts3 = [0, 7, 12] as const;

			assert(
				isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
					7,
					starts3,
					20,
				),
				"列境界は rect 省略時は従来どおり視覚行末同値とみなす（後方互換）",
			);
			assert(
				isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
					7,
					starts3,
					20,
					0,
				),
				"local 7 でキャレットが列 0 なら前行末同値",
			);
			assert(
				!isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
					7,
					starts3,
					20,
					1,
				),
				"local 7 でキャレットが列 1 なら現在 stripe 行頭（前行末ではない）",
			);
			assert(
				isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
					12,
					starts3,
					20,
					1,
				),
				"local 12 で列 1 なら stripe1 の行末同値",
			);
			assert(
				!isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
					12,
					starts3,
					20,
					2,
				),
				"local 12 で列 2 は最終 stripe 行頭のみ（論理行末へ直飛びしない）",
			);
			assert(
				!isSoTCollapsedLocalHeadAtVisualLineEndEquivalentToNextStart(
					3,
					starts3,
					20,
				),
				"stripe 途中は視覚行末同値でない",
			);

			assert(
				findSoTVisualLineStartIndexMatchingLocalOffset(7, starts3, 20) ===
					1,
				"境界ヘルパー j=1",
			);

			assert(
				isSoTEndPendingVisualOnlyShowsPriorStripeEndAtHead({
					headAbs: 7,
					pendingEndVisualOnlyForDocHead: 7,
				}),
				"pending forDocHead と head が一致すれば前行末オーバーレイ扱い",
			);
			assert(
				!isSoTEndPendingVisualOnlyShowsPriorStripeEndAtHead({
					headAbs: 7,
					pendingEndVisualOnlyForDocHead: 6,
				}),
				"pending が head と一致しなければ false",
			);

			let p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 19,
				normalizedLogicalLineEnd: 19,
				headAbs: 19,
				lineRange,
				visualLineStartsLocal: starts3,
			});
			assert(p.kind === "noop", "論理行末済み noop");

			p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 3,
				normalizedLogicalLineEnd: 19,
				headAbs: 3,
				lineRange,
				visualLineStartsLocal: starts3,
			});
			assert(
				p.kind === "to_next_visual_line_start" &&
					p.absoluteProbeHead === 7,
				"途中は当該 stripe の次 visual start へ",
			);

			p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 7,
				normalizedLogicalLineEnd: 19,
				headAbs: 7,
				lineRange,
				visualLineStartsLocal: starts3,
				caretVisualStripeRectIndex: 0,
			});
			assert(
				p.kind === "to_logical_line_end" &&
					p.normalizedTargetHead === 19,
				"列 0 におり starts[1] なら論理行末（二段目）",
			);

			p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 7,
				normalizedLogicalLineEnd: 19,
				headAbs: 7,
				lineRange,
				visualLineStartsLocal: starts3,
				caretVisualStripeRectIndex: 1,
			});
			assert(
				p.kind === "to_next_visual_line_start" &&
					p.absoluteProbeHead === 12,
				"列 1 の starts[1] は折り返し行頭→まず当該 stripe 末（次 visual start）",
			);

			p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 12,
				normalizedLogicalLineEnd: 19,
				headAbs: 12,
				lineRange,
				visualLineStartsLocal: starts3,
				caretVisualStripeRectIndex: 1,
			});
			assert(
				p.kind === "to_logical_line_end",
				"列 1・starts[2] は前行末同値 → 論理行末",
			);

			p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 12,
				normalizedLogicalLineEnd: 19,
				headAbs: 12,
				lineRange,
				visualLineStartsLocal: starts3,
				caretVisualStripeRectIndex: 2,
			});
			assert(
				p.kind === "to_logical_line_end",
				"最終 stripe 行頭は firstTap 無しで論理行末",
			);

			const starts4 = [0, 7, 12, 15] as const;
			p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 12,
				normalizedLogicalLineEnd: 19,
				headAbs: 12,
				lineRange,
				visualLineStartsLocal: starts4,
				caretVisualStripeRectIndex: 2,
			});
			assert(
				p.kind === "to_next_visual_line_start" &&
					p.absoluteProbeHead === 15,
				"次ストライプがある境界で行頭列なら論理末へ飛ばず次 visual start へ",
			);

			const starts2 = [0, 5] as const;
			const hitBranch = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 5,
				normalizedLogicalLineEnd: 18,
				headAbs: 5,
				lineRange,
				visualLineStartsLocal: starts2,
				caretVisualStripeRectIndex: 0,
			});
			assert(
				hitBranch.kind === "to_logical_line_end" &&
					hitBranch.normalizedTargetHead === 18,
				"2 stripe で境界 5 は列 0 なら視覚行末同値 → 論理行末（次 visual start へ誤進しない回帰）",
			);

			const startsSingle = [0] as const;
			p = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 3,
				normalizedLogicalLineEnd: 8,
				headAbs: 3,
				lineRange: { from: 0, to: 15 },
				visualLineStartsLocal: startsSingle,
			});
			assert(
				p.kind === "to_logical_line_end" &&
					p.normalizedTargetHead === 8,
				"単一視覚行では firstTap 無しでも論理行末へ",
			);

			const lineRangeAligned: LineRange = { from: 0, to: 10 };
			const startsA = [0, 5] as const;
			const tap = resolveSoTCollapsedEndFirstTapAbsoluteHead({
				headAbs: 2,
				lineRange: lineRangeAligned,
				visualLineStartsLocal: startsA,
			});
			assert(tap === 5, "firstTap との整合");
			const planMid = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 2,
				normalizedLogicalLineEnd: 9,
				headAbs: 2,
				lineRange: lineRangeAligned,
				visualLineStartsLocal: startsA,
			});
			assert(
				planMid.kind === "to_next_visual_line_start" &&
					planMid.absoluteProbeHead === 5,
				"旧テストフィクスチャでも最初の段へ",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"End の二段目は pending 前行末を最優先し、無いときは列インデックスで境界を分離する",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `collapsed End 位置ベーステスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedEndSecondTapPendingOverridesRectStripe(): Promise<void> {
		const testName =
			"SoT collapsed End 二段目は pendingEndKeyVisualOnlyCaret の forDocHead があれば表示行頭列でも論理行末へ進む";
		const startTime = performance.now();
		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const lineRange: LineRange = { from: 0, to: 20 };
			const starts3 = [0, 7, 12] as const;
			const plan = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 7,
				normalizedLogicalLineEnd: 19,
				headAbs: 7,
				lineRange,
				visualLineStartsLocal: starts3,
				caretVisualStripeRectIndex: 1,
				pendingEndVisualOnlyForDocHead: 7,
			});
			assert(
				plan.kind === "to_logical_line_end" &&
					plan.normalizedTargetHead === 19 &&
					plan.resolvedViaPendingVisualOnlySecondTap === true,
				"pending 分岐は resolvedViaPendingVisualOnlySecondTap を立てる",
			);
			const planNoPending = resolveSoTCollapsedEndNavigationPlan({
				normalizedHead: 7,
				normalizedLogicalLineEnd: 19,
				headAbs: 7,
				lineRange,
				visualLineStartsLocal: starts3,
				caretVisualStripeRectIndex: 1,
				pendingEndVisualOnlyForDocHead: null,
			});
			assert(
				planNoPending.kind === "to_next_visual_line_start" &&
					planNoPending.absoluteProbeHead === 12,
				"pending 無しでは従来どおり折り返し行頭から次 visual start",
			);
			assert(
				shouldSoTDeferClearingEndKeyPendingBeforeHandleNavigate(
					"End",
					{ shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
					3,
					3,
					false,
					false,
				),
				"collapsed End では pending クリアを遅延する",
			);
			assert(
				!shouldSoTDeferClearingEndKeyPendingBeforeHandleNavigate(
					"End",
					{ shiftKey: true, altKey: false, ctrlKey: false, metaKey: false },
					3,
					3,
					false,
					false,
				),
				"Shift+End は遅延しない",
			);
			assert(
				!shouldSoTDeferClearingEndKeyPendingBeforeHandleNavigate(
					"Home",
					{ shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
					3,
					3,
					false,
					false,
				),
				"Home では遅延しない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"helper が pending と rect-only の優先差・plan フラグ・遅延クリア条件を固定した",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `End pending 二段目 helper テスト失敗: ${(error as Error).message}`,
				duration,
			});
		}
	}

	private async testSoTPageNavigationHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: PageUp/PageDown helper は writing mode ごとに viewport 単位の移動先を計算する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const viewportRect = {
				left: 100,
				top: 50,
				width: 400,
				height: 300,
			};
			const caretRect = {
				left: 220,
				top: 140,
				width: 12,
				height: 24,
			};

			const horizontalPageDown = resolveSoTPageNavigationPlan({
				key: "PageDown",
				writingMode: "horizontal-tb",
				caretRect,
				viewportRect,
			});
			assert(
				horizontalPageDown?.scrollAxis === "y",
				"横書きで scroll axis が y になりません",
			);
			assert(
				horizontalPageDown?.scrollDeltaY === 300,
				"横書きの PageDown が 1 viewport 分進みません",
			);
			assert(
				horizontalPageDown?.scrollDeltaX === 0,
				"横書きで x 軸 scroll が混入しています",
			);
			assert(
				horizontalPageDown?.targetPoint.x === 226,
				"横書きで cross-axis の x が維持されません",
			);
			assert(
				horizontalPageDown?.targetPoint.y === 152,
				"横書きで target point の y が不正です",
			);

			const horizontalPageUp = resolveSoTPageNavigationPlan({
				key: "PageUp",
				writingMode: "horizontal-tb",
				caretRect,
				viewportRect,
			});
			assert(
				horizontalPageUp?.scrollDeltaY === -300,
				"横書きの PageUp が逆方向に 1 viewport 分戻りません",
			);

			const verticalRlPageDown = resolveSoTPageNavigationPlan({
				key: "PageDown",
				writingMode: "vertical-rl",
				caretRect,
				viewportRect,
			});
			assert(
				verticalRlPageDown?.scrollAxis === "x",
				"vertical-rl で scroll axis が x になりません",
			);
			assert(
				verticalRlPageDown?.scrollDeltaX === -400,
				"vertical-rl の PageDown が左方向へ 1 viewport 分進みません",
			);
			assert(
				verticalRlPageDown?.scrollDeltaY === 0,
				"vertical-rl で y 軸 scroll が混入しています",
			);
			assert(
				verticalRlPageDown?.targetPoint.x === 226,
				"vertical-rl で target point の x が不正です",
			);
			assert(
				verticalRlPageDown?.targetPoint.y === 152,
				"vertical-rl で cross-axis の y が維持されません",
			);

			const verticalLrPageDown = resolveSoTPageNavigationPlan({
				key: "PageDown",
				writingMode: "vertical-lr",
				caretRect,
				viewportRect,
			});
			assert(
				verticalLrPageDown?.scrollDeltaX === 400,
				"vertical-lr の PageDown が右方向へ 1 viewport 分進みません",
			);

			const verticalRlPageUp = resolveSoTPageNavigationPlan({
				key: "PageUp",
				writingMode: "vertical-rl",
				caretRect,
				viewportRect,
			});
			assert(
				verticalRlPageUp?.scrollDeltaX === 400,
				"vertical-rl の PageUp が PageDown と逆方向になりません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "PageUp/PageDown helper が writing mode ごとの page 移動計画を返します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `PageUp/PageDown helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPageNavigationHelperSafety(): Promise<void> {
		const testName =
			"SoT派生ビュー: PageUp/PageDown helper は不正入力や point-to-offset 失敗でも安全に扱える";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			assert(
				resolveSoTPageNavigationPlan({
					key: "PageDown",
					writingMode: "horizontal-tb",
					caretRect: {
						left: Number.NaN,
						top: 0,
						width: 10,
						height: 20,
					},
					viewportRect: {
						left: 0,
						top: 0,
						width: 300,
						height: 200,
					},
				}) === null,
				"caret rect が不正でも helper が null を返しません",
			);
			assert(
				resolveSoTPageNavigationPlan({
					key: "PageUp",
					writingMode: "vertical-rl",
					caretRect: {
						left: 20,
						top: 30,
						width: 10,
						height: 20,
					},
					viewportRect: {
						left: 0,
						top: 0,
						width: 0,
						height: 200,
					},
				}) === null,
				"viewport が不正でも helper が null を返しません",
			);
			assert(
				resolveSoTPageNavigationOffsetCandidate(null, 42) === 42,
				"point-to-offset 失敗時に fallback offset を返しません",
			);
			assert(
				resolveSoTPageNavigationOffsetCandidate(null, null) === null,
				"target/fallback ともに失敗したとき null を返しません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "PageUp/PageDown helper が不正入力と offset 解決失敗を安全に扱います",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `PageUp/PageDown helper safety テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPageScrollOutcomeHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: page scroll outcome helper は sufficient/edge/partial を判定する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			assert(
				SOT_PAGE_SCROLL_SUFFICIENT_RATIO === 0.85,
				"sufficient ratio が spec の 0.85 と一致していません",
			);

			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -400,
				}) === "sufficient",
				"完全に動いた case が sufficient になりません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -340,
				}) === "sufficient",
				"actual / expected = 0.85 が sufficient になりません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: 400,
					actualDelta: 360,
				}) === "sufficient",
				"正方向で十分に動いた case が sufficient になりません",
			);

			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: 0,
				}) === "edge",
				"全く動かない case が edge になりません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: 400,
					actualDelta: 0,
				}) === "edge",
				"PageUp で全く動かない case が edge になりません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -0.5,
				}) === "edge",
				"actualAbs < 1 が edge になりません",
			);

			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -30,
				}) === "partial",
				"末端付近の小スクロール (30/400) が partial になりません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -10,
				}) === "partial",
				"末端付近の小スクロール (10/400) が partial になりません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: 400,
					actualDelta: 339,
				}) === "partial",
				"0.85 をわずかに下回る case が partial になりません",
			);

			// remainingAfter による partial → edge 格上げ
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -30,
					remainingAfter: 0,
				}) === "edge",
				"partial かつ残量 0 が edge へ格上げされません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -30,
					remainingAfter: SOT_PAGE_SCROLL_EDGE_REMAINING_PX - 0.01,
				}) === "edge",
				"partial かつ残量 < しきい値 が edge へ格上げされません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -30,
					remainingAfter: SOT_PAGE_SCROLL_EDGE_REMAINING_PX,
				}) === "partial",
				"partial かつ残量 = しきい値 は partial のまま (格上げしない)",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -30,
					remainingAfter: 100,
				}) === "partial",
				"partial かつ残量が十分なら partial のまま",
			);
			// sufficient は remainingAfter で格下げしない (相対位置維持を維持)
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: -400,
					actualDelta: -400,
					remainingAfter: 0,
				}) === "sufficient",
				"sufficient は残量 0 でも sufficient を維持すべきです",
			);

			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: 0,
					actualDelta: 0,
				}) === "sufficient",
				"expected が 0 の case が sufficient になりません",
			);

			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: Number.NaN,
					actualDelta: 100,
				}) === "sufficient",
				"NaN expected が sufficient にフォールバックしません",
			);
			assert(
				evaluateSoTPageScrollOutcome({
					expectedDelta: 400,
					actualDelta: Number.NaN,
				}) === "sufficient",
				"NaN actual が sufficient にフォールバックしません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"page scroll outcome helper が sufficient/edge/partial を仕様通り判定します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `page scroll outcome helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPageScrollRemainingHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: page scroll 残量 helper は scroll axis ごとに残スクロール余地を返す";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// vertical-rl (scrollLeft <= 0): pageDelta < 0 (PageDown 方向) なら
			// 「scrollLeft - (-overflow)」が残量
			const overflow = 1000;
			const clientWidth = 400;
			const scrollWidth = clientWidth + overflow;
			// 先頭付近 (scrollLeft = -overflow) で更に PageDown → 残量 0
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: -clientWidth,
					scrollLeft: -overflow,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 0,
				"vertical-rl 先頭端で PageDown 残量が 0 になりません",
			);
			// 末尾付近 (scrollLeft = 0) で更に PageUp → 残量 0
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: clientWidth,
					scrollLeft: 0,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 0,
				"vertical-rl 末尾端で PageUp 残量が 0 になりません",
			);
			// 中央 (scrollLeft = -500) で PageDown → 残量 = overflow - 500 = 500
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: -clientWidth,
					scrollLeft: -500,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 500,
				"vertical-rl 中央で PageDown 残量が 500 になりません",
			);
			// 中央 (scrollLeft = -500) で PageUp → 残量 = 500
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: clientWidth,
					scrollLeft: -500,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 500,
				"vertical-rl 中央で PageUp 残量が 500 になりません",
			);
			// 末端から少しだけ動いた半端ケース (scrollLeft = -overflow + 30)
			// → さらに PageDown 残量 = 30
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: -clientWidth,
					scrollLeft: -overflow + 30,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 30,
				"vertical-rl 末端寄りで PageDown 残量が 30 になりません",
			);

			// horizontal-tb (scrollTop ∈ [0, overflow]) PageDown
			const heightOverflow = 800;
			const clientHeight = 300;
			const scrollHeight = clientHeight + heightOverflow;
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "y",
					pageDelta: clientHeight,
					scrollLeft: 0,
					scrollTop: heightOverflow,
					scrollWidth: 0,
					scrollHeight,
					clientWidth: 0,
					clientHeight,
				}) === 0,
				"horizontal-tb 末尾端で PageDown 残量が 0 になりません",
			);
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "y",
					pageDelta: -clientHeight,
					scrollLeft: 0,
					scrollTop: 0,
					scrollWidth: 0,
					scrollHeight,
					clientWidth: 0,
					clientHeight,
				}) === 0,
				"horizontal-tb 先頭端で PageUp 残量が 0 になりません",
			);
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "y",
					pageDelta: clientHeight,
					scrollLeft: 0,
					scrollTop: 200,
					scrollWidth: 0,
					scrollHeight,
					clientWidth: 0,
					clientHeight,
				}) === 600,
				"horizontal-tb 中央で PageDown 残量が 600 になりません",
			);

			// vertical-lr (scrollLeft >= 0)
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: clientWidth,
					scrollLeft: overflow,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 0,
				"vertical-lr 末尾端で PageDown 残量が 0 になりません",
			);
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: -clientWidth,
					scrollLeft: 200,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 200,
				"vertical-lr 中央で PageUp 残量が 200 になりません",
			);

			// pageDelta = 0 / 不正値の安全性
			assert(
				computeSoTPageScrollRemaining({
					scrollAxis: "x",
					pageDelta: 0,
					scrollLeft: -500,
					scrollTop: 0,
					scrollWidth,
					scrollHeight: 0,
					clientWidth,
					clientHeight: 0,
				}) === 0,
				"pageDelta 0 で残量が 0 になりません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"page scroll 残量 helper が axis ごとの同方向残量を仕様通り返します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `page scroll 残量 helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTScrollPastEndHelper(): Promise<void> {
		const testName =
			"SoT scroll past end: tail spacer helper は extent・clamp・remaining を正しく計算する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// computeSoTScrollPastEndExtent
			assert(
				computeSoTScrollPastEndExtent(320) === 320,
				"viewport 320 → extent 320 になりません",
			);
			assert(
				computeSoTScrollPastEndExtent(0) === 0,
				"viewport 0 → extent 0 になりません",
			);
			assert(
				computeSoTScrollPastEndExtent(-100) === 0,
				"viewport 負数 → extent 0 になりません",
			);
			assert(
				computeSoTScrollPastEndExtent(500, 0.5) === 250,
				"ratio=0.5 で extent が viewport/2 になりません",
			);

			// clampSoTPageDownDelta: vertical-rl
			// scrollWidth=800, clientWidth=320, tailSpacerExtent=320
			// contentOverflow = 800-320-320 = 160, contentEndMin = -160
			const rlBase = {
				scrollAxis: "x" as const,
				writingMode: "vertical-rl",
				scrollExtent: 800,
				clientExtent: 320,
				tailSpacerExtent: 320,
			};
			// scrollPosition=0, proposedDelta=-400 → cap to contentEndMin=-160 → delta=-160
			assert(
				clampSoTPageDownDelta({ ...rlBase, proposedDelta: -400, scrollPosition: 0 }) === -160,
				"vertical-rl: PageDown delta が contentEndMin でクランプされません",
			);
			// 既に content end (-160) → proposedDelta=-400 → proposed=-560, max(-560,-160)=-160, delta=0 (逆方向)
			assert(
				clampSoTPageDownDelta({ ...rlBase, proposedDelta: -400, scrollPosition: -160 }) === 0,
				"vertical-rl: content end から PageDown → delta 0 になりません",
			);
			// tail spacer 内 (-200) → proposed=-520, max=-160 → +40 > 0 → 0
			assert(
				clampSoTPageDownDelta({ ...rlBase, proposedDelta: -400, scrollPosition: -200 }) === 0,
				"vertical-rl: tail spacer 内から PageDown → delta 0 になりません",
			);
			// PageUp (正数) はクランプしない
			assert(
				clampSoTPageDownDelta({ ...rlBase, proposedDelta: 320, scrollPosition: -100 }) === 320,
				"vertical-rl: PageUp はクランプされるべきではありません",
			);
			// tailSpacerExtent=0 はそのまま通す
			assert(
				clampSoTPageDownDelta({ ...rlBase, tailSpacerExtent: 0, proposedDelta: -400, scrollPosition: 0 }) === -400,
				"tailSpacerExtent=0 でデルタが変わるべきではありません",
			);

			// clampSoTPageDownDelta: horizontal-tb
			const htbBase = {
				scrollAxis: "y" as const,
				writingMode: "horizontal-tb",
				scrollExtent: 1000,
				clientExtent: 400,
				tailSpacerExtent: 400,
			};
			// contentMax = 1000-400-400 = 200
			// scrollPosition=150, proposedDelta=400 → proposed=550, min(550,200)=200 → delta=50
			assert(
				clampSoTPageDownDelta({ ...htbBase, proposedDelta: 400, scrollPosition: 150 }) === 50,
				"horizontal-tb: PageDown delta が contentMax でクランプされません",
			);
			// scrollPosition=200 (content end) → proposed=600, min=200 → delta=0 → 逆方向ではないので 0 以上
			assert(
				clampSoTPageDownDelta({ ...htbBase, proposedDelta: 400, scrollPosition: 200 }) === 0,
				"horizontal-tb: content end から PageDown → delta 0 になりません",
			);

			// computeSoTContentScrollRemainingForPageDown: vertical-rl
			// scrollWidth=800, clientWidth=320, tailSpacerExtent=320
			// contentOverflow=160, contentEndMin=-160
			// pos=0 (head), pageDelta=-320 → remaining = 0 - (-160) = 160
			assert(
				computeSoTContentScrollRemainingForPageDown({
					scrollAxis: "x", writingMode: "vertical-rl", pageDelta: -320,
					scrollPosition: 0, scrollExtent: 800, clientExtent: 320, tailSpacerExtent: 320,
				}) === 160,
				"vertical-rl: head から PageDown 残量が contentOverflow になりません",
			);
			// pos=-160 (content end) → remaining = 0
			assert(
				computeSoTContentScrollRemainingForPageDown({
					scrollAxis: "x", writingMode: "vertical-rl", pageDelta: -320,
					scrollPosition: -160, scrollExtent: 800, clientExtent: 320, tailSpacerExtent: 320,
				}) === 0,
				"vertical-rl: content end で PageDown 残量が 0 になりません",
			);
			// PageUp (pageDelta > 0): pos=-100 → remaining = 100 (tail spacer 無関係)
			assert(
				computeSoTContentScrollRemainingForPageDown({
					scrollAxis: "x", writingMode: "vertical-rl", pageDelta: 320,
					scrollPosition: -100, scrollExtent: 800, clientExtent: 320, tailSpacerExtent: 320,
				}) === 100,
				"vertical-rl: PageUp 残量が影響を受けてはなりません",
			);
			// tailSpacerExtent=0 はオリジナルの計算と一致する
			// overflow=480, pos=-480 (end), pageDelta=-320 → remaining=0
			assert(
				computeSoTContentScrollRemainingForPageDown({
					scrollAxis: "x", writingMode: "vertical-rl", pageDelta: -320,
					scrollPosition: -480, scrollExtent: 800, clientExtent: 320, tailSpacerExtent: 0,
				}) === 0,
				"tailSpacerExtent=0: vertical-rl end → remaining 0 になりません",
			);

			// computeSoTContentScrollRemainingForPageDown: horizontal-tb
			// scrollHeight=1000, clientHeight=400, tailSpacerExtent=400 → contentMax=200
			assert(
				computeSoTContentScrollRemainingForPageDown({
					scrollAxis: "y", writingMode: "horizontal-tb", pageDelta: 400,
					scrollPosition: 100, scrollExtent: 1000, clientExtent: 400, tailSpacerExtent: 400,
				}) === 100,
				"horizontal-tb: pos=100 → remaining=contentMax-pos=100 になりません",
			);
			assert(
				computeSoTContentScrollRemainingForPageDown({
					scrollAxis: "y", writingMode: "horizontal-tb", pageDelta: 400,
					scrollPosition: 200, scrollExtent: 1000, clientExtent: 400, tailSpacerExtent: 400,
				}) === 0,
				"horizontal-tb: content end → remaining 0 になりません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "scroll past end helper が extent・clamp・remaining を仕様通り計算します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `scroll past end helper テスト失敗: ${(error as Error).message}`,
				duration,
			});
		}
	}

	private async testSoTPageNavigationOffsetCandidateForOutcome(): Promise<void> {
		const testName =
			"SoT派生ビュー: edge 判定時は fallback offset を優先する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			assert(
				resolveSoTPageNavigationOffsetCandidateForOutcome(120, 0, "edge") === 0,
				"edge 時に target offset が選ばれてしまいます (fallback 優先になりません)",
			);
			assert(
				resolveSoTPageNavigationOffsetCandidateForOutcome(120, 999, "edge") === 999,
				"edge 時に末尾 fallback が選ばれません",
			);

			assert(
				resolveSoTPageNavigationOffsetCandidateForOutcome(120, null, "edge") === 120,
				"edge かつ fallback なしで target を維持しません",
			);
			assert(
				resolveSoTPageNavigationOffsetCandidateForOutcome(null, null, "edge") === null,
				"全部 null なら null を返すべきです",
			);

			assert(
				resolveSoTPageNavigationOffsetCandidateForOutcome(120, 0, "sufficient") === 120,
				"sufficient 時に target offset が優先されません",
			);
			assert(
				resolveSoTPageNavigationOffsetCandidateForOutcome(120, 0, "partial") === 120,
				"partial 時に target offset が優先されません",
			);
			assert(
				resolveSoTPageNavigationOffsetCandidateForOutcome(null, 42, "sufficient") === 42,
				"sufficient 時に target が null なら fallback を返すべきです",
			);

			assert(
				resolveSoTPageNavigationOffsetCandidate(120, 0) === 120,
				"既存 helper の挙動が変わっています (target 優先のはず)",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"edge outcome は fallback を優先し、sufficient/partial は従来通り target を優先します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `outcome 別 offset 解決テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTTypewriterScrollHelper(): Promise<void> {
		const testName = "SoT派生ビュー: Typewriter pure helper";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const extent = 1000;
			const centeredTarget = resolveSoTTypewriterTarget(
				extent,
				"vertical-rl",
				0,
			);
			assert(centeredTarget === 500, "offsetRatio=0 で中央 target になりません");

			const forwardRl = resolveSoTTypewriterTarget(
				extent,
				"vertical-rl",
				0.2,
			);
			const forwardLr = resolveSoTTypewriterTarget(
				extent,
				"vertical-lr",
				0.2,
			);
			assert(
				forwardRl === 300,
				`vertical-rl の正方向 target が不正です: ${forwardRl}`,
			);
			assert(
				forwardLr === 700,
				`vertical-lr の正方向 target が不正です: ${forwardLr}`,
			);
			const forwardHorizontal = resolveSoTTypewriterTarget(
				extent,
				"horizontal-tb",
				0.2,
			);
			assert(
				forwardHorizontal === 700,
				`horizontal-tb の正方向 target が不正です: ${forwardHorizontal}`,
			);

			const band = resolveSoTTypewriterFollowBand(extent, 500, 0.16);
			assert(band.bandStart === 420, `bandStart が不正です: ${band.bandStart}`);
			assert(band.bandEnd === 580, `bandEnd が不正です: ${band.bandEnd}`);

			assert(
				isSoTTypewriterCaretWithinBand(500, band),
				"caret が帯内でも false になります",
			);
			assert(
				resolveSoTTypewriterScrollDeltaToBand(500, band, "vertical-rl") === 0,
				"帯内 caret で scroll delta が no-op になりません",
			);

			const leftOutsideDeltaRl = resolveSoTTypewriterScrollDeltaToBand(
				300,
				band,
				"vertical-rl",
			);
			assert(
				leftOutsideDeltaRl === -120,
				`vertical-rl 左帯外の最小 scroll delta が不正です: ${leftOutsideDeltaRl}`,
			);

			const rightOutsideDeltaLr = resolveSoTTypewriterScrollDeltaToBand(
				700,
				band,
				"vertical-lr",
			);
			assert(
				rightOutsideDeltaLr === 120,
				`vertical-lr 右帯外の最小 scroll delta が不正です: ${rightOutsideDeltaLr}`,
			);
			const horizontalMainAxis = resolveSoTTypewriterCaretMainAxisPosition(
				{ left: 10, top: 100, width: 200, height: 400 },
				{ left: 20, top: 240, width: 30, height: 20 },
				"y",
			);
			assert(
				horizontalMainAxis === 150,
				`horizontal-tb の caret main axis が不正です: ${horizontalMainAxis}`,
			);
			const lowerOutsideDeltaHorizontal =
				resolveSoTTypewriterScrollDeltaToBand(
					700,
					band,
					"horizontal-tb",
				);
			assert(
				lowerOutsideDeltaHorizontal === 120,
				`horizontal-tb 下帯外の最小 scroll delta が不正です: ${lowerOutsideDeltaHorizontal}`,
			);
			const horizontalPlan = resolveSoTTypewriterScrollPlan({
				viewportRect: { left: 10, top: 100, width: 320, height: 240 },
				caretRect: { left: 20, top: 260, width: 10, height: 20 },
				writingMode: "horizontal-tb",
				offsetRatio: 0,
				followBandRatio: 0.2,
			});
			if (!horizontalPlan) {
				throw new Error("horizontal-tb の scroll plan が null です");
			}
			assert(
				horizontalPlan.scrollAxis === "y",
				`horizontal-tb の scroll axis が不正です: ${horizontalPlan.scrollAxis}`,
			);
			assert(
				horizontalPlan.target === 120 &&
					horizontalPlan.bandStart === 96 &&
					horizontalPlan.bandEnd === 144,
				`horizontal-tb の target/band が不正です: ${JSON.stringify(horizontalPlan)}`,
			);
			assert(
				horizontalPlan.caretMainAxisPosition === 170,
				`horizontal-tb の scroll plan caret main axis が不正です: ${horizontalPlan.caretMainAxisPosition}`,
			);
			assert(
				horizontalPlan.scrollDelta === 26,
				`horizontal-tb の scroll plan delta が不正です: ${horizontalPlan.scrollDelta}`,
			);

			const clampedTypewriter = validateV2Settings({
				wysiwyg: {
					sotTypewriterMode: true,
					sotTypewriterOffsetRatio: 1,
					sotTypewriterFollowBandRatio: 0.01,
					sotTypewriterBlockHighlightOpacity: 2,
					sotTypewriterCurrentLineHighlightOpacity: -1,
					sotTypewriterNonFocusOpacity: 0.01,
					sotTypewriterBlockHighlightColor: "invalid",
				},
			});
			assert(
				clampedTypewriter.wysiwyg.sotTypewriterMode === true,
				"sotTypewriterMode の boolean 値が保持されません",
			);
			assert(
				clampedTypewriter.wysiwyg.sotTypewriterOffsetRatio === 0.4,
				`offsetRatio clamp が不正です: ${clampedTypewriter.wysiwyg.sotTypewriterOffsetRatio}`,
			);
			assert(
				clampedTypewriter.wysiwyg.sotTypewriterFollowBandRatio === 0.05,
				`followBandRatio clamp が不正です: ${clampedTypewriter.wysiwyg.sotTypewriterFollowBandRatio}`,
			);
			assert(
				clampedTypewriter.wysiwyg.sotTypewriterBlockHighlightOpacity === 1,
				`block highlight opacity clamp が不正です: ${clampedTypewriter.wysiwyg.sotTypewriterBlockHighlightOpacity}`,
			);
			assert(
				clampedTypewriter.wysiwyg
					.sotTypewriterCurrentLineHighlightOpacity === 0,
				`current line highlight opacity clamp が不正です: ${clampedTypewriter.wysiwyg.sotTypewriterCurrentLineHighlightOpacity}`,
			);
			assert(
				clampedTypewriter.wysiwyg.sotTypewriterNonFocusOpacity === 0.1,
				`non-focus opacity clamp が不正です: ${clampedTypewriter.wysiwyg.sotTypewriterNonFocusOpacity}`,
			);
			assert(
				clampedTypewriter.wysiwyg.sotTypewriterBlockHighlightColor ===
					"#1e90ff",
				`block highlight color fallback が不正です: ${clampedTypewriter.wysiwyg.sotTypewriterBlockHighlightColor}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Typewriter helper と settings clamp が期待通りです",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Typewriter helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTTypewriterSuppressionHelper(): Promise<void> {
		const testName = "SoT派生ビュー: Typewriter suppression helper";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const baseState = {
				suppressAfterNavigation: false,
				suppressAfterJumpOrCollapse: false,
				isPointerSelecting: false,
				autoScrollSelecting: false,
				isScrolling: false,
				hasPendingScrollSettle: false,
				hasPendingNavigationCommit: false,
				isFastScrollActive: false,
				isOutlineJumpInProgress: false,
			};

			assert(
				isSoTTypewriterSuppressedNavigationKey("Home"),
				"Home が suppression 対象キーとして扱われません",
			);
			assert(
				isSoTTypewriterSuppressedNavigationKey("End"),
				"End が suppression 対象キーとして扱われません",
			);
			assert(
				isSoTTypewriterSuppressedNavigationKey("PageUp"),
				"PageUp が suppression 対象キーとして扱われません",
			);
			assert(
				isSoTTypewriterSuppressedNavigationKey("PageDown"),
				"PageDown が suppression 対象キーとして扱われません",
			);
			assert(
				!isSoTTypewriterSuppressedNavigationKey("ArrowRight"),
				"ArrowRight まで suppression 対象になっています",
			);

			const navigationSuppressed = resolveSoTTypewriterSuppressionDecision({
				...baseState,
				suppressAfterNavigation: true,
			});
			assert(
				navigationSuppressed.suppress,
				"Home/End/PageUp/PageDown 直後が suppress されません",
			);
			assert(
				navigationSuppressed.consumeNavigationSuppression,
				"navigation one-shot suppression が消費対象になりません",
			);

			const pendingNavigationCommit =
				resolveSoTTypewriterSuppressionDecision({
					...baseState,
					suppressAfterNavigation: true,
					hasPendingNavigationCommit: true,
				});
			assert(
				pendingNavigationCommit.suppress,
				"navigation commit 待ち中が suppress されません",
			);
			assert(
				!pendingNavigationCommit.consumeNavigationSuppression,
				"navigation commit 待ち中に one-shot suppression が早期消費されています",
			);

			const pointerDragSuppressed = resolveSoTTypewriterSuppressionDecision({
				...baseState,
				isPointerSelecting: true,
			});
			assert(
				pointerDragSuppressed.suppress,
				"pointer drag 中が suppress されません",
			);

			const fastScrollSuppressed = resolveSoTTypewriterSuppressionDecision({
				...baseState,
				hasPendingScrollSettle: true,
				isFastScrollActive: true,
			});
			assert(
				fastScrollSuppressed.suppress,
				"fast scroll / debounce 中が suppress されません",
			);

			const autoScrollSelectionSuppressed =
				resolveSoTTypewriterSuppressionDecision({
					...baseState,
					autoScrollSelecting: true,
				});
			assert(
				autoScrollSelectionSuppressed.suppress,
				"auto scroll selection 中が suppress されません",
			);

			const jumpSuppressed = resolveSoTTypewriterSuppressionDecision({
				...baseState,
				suppressAfterJumpOrCollapse: true,
				isOutlineJumpInProgress: true,
			});
			assert(
				jumpSuppressed.suppress,
				"jump / collapse 直後が suppress されません",
			);
			assert(
				jumpSuppressed.consumeJumpOrCollapseSuppression,
				"jump / collapse one-shot suppression が消費対象になりません",
			);

			const normalCollapsedCaret = resolveSoTTypewriterSuppressionDecision(
				baseState,
			);
			assert(
				!normalCollapsedCaret.suppress,
				"通常 collapsed caret まで suppress されています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Typewriter suppression helper が期待通りです",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Typewriter suppression helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTTypewriterInputFollowRequestHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: Typewriter 入力時 follow request helper";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const base = {
				typewriterEnabled: true,
				sourceModeEnabled: false,
				plainTextViewEnabled: false,
			};

			assert(
				shouldRequestSoTTypewriterFollowForInput({
					...base,
					origin: "text-input",
					text: "あ",
				}),
				"Typewriter ON の通常文字入力で follow request が立ちません",
			);
			assert(
				!shouldRequestSoTTypewriterFollowForInput({
					...base,
					origin: "pointer",
				}),
				"クリックだけで follow request が立っています",
			);
			assert(
				shouldRequestSoTTypewriterFollowForInput({
					...base,
					origin: "text-input",
					text: "い",
				}),
				"クリック後の最初の文字入力相当で follow request が立ちません",
			);
			assert(
				!shouldRequestSoTTypewriterFollowForInput({
					...base,
					typewriterEnabled: false,
					origin: "text-input",
					text: "う",
				}),
				"Typewriter OFF の通常文字入力で follow request が立っています",
			);
			assert(
				!shouldRequestSoTTypewriterFollowForInput({
					...base,
					sourceModeEnabled: true,
					origin: "text-input",
					text: "え",
				}),
				"source mode 中の入力で follow request が立っています",
			);
			const pendingBase = {
				...base,
				ceImeMode: false,
				pendingTextLength: 12,
				overlayFocused: true,
				hasPendingCaretRect: true,
			};
			assert(
				shouldUseSoTTypewriterPendingCaretForFollow({
					...pendingBase,
					origin: "pending-input",
				}),
				"pending input 中の follow 対象が pending caret になりません",
			);
			assert(
				!shouldUseSoTTypewriterPendingCaretForFollow({
					...pendingBase,
					origin: "pointer",
				}),
				"クリックだけで pending caret follow が有効になっています",
			);
			assert(
				!shouldUseSoTTypewriterPendingCaretForFollow({
					...pendingBase,
					typewriterEnabled: false,
					origin: "pending-input",
				}),
				"Typewriter OFF で pending caret follow が有効になっています",
			);
			assert(
				!shouldUseSoTTypewriterPendingCaretForFollow({
					...pendingBase,
					hasPendingCaretRect: false,
					origin: "pending-input",
				}),
				"pending caret rect がない状態で pending caret follow が有効です",
			);
			assert(
				!shouldUseSoTTypewriterPendingCaretForFollow({
					...pendingBase,
					ceImeMode: true,
					origin: "pending-input",
				}),
				"ceImeMode で pending caret follow が有効になっています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"通常入力と pending input では要求し、クリックのみ / Typewriter OFF では要求しません",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Typewriter 入力 follow request helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCaretScrollPolicySettingsPanel(): Promise<void> {
		const testName =
			"SoT派生ビュー: 表示設定モーダル中は caret follow scroll を抑止する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const normal = resolveSoTCaretScrollPolicy({
				settingsPanelOpen: false,
				pendingCaretScroll: false,
				pairedMarkdownLeafActive: true,
				pendingTypewriterFollow: false,
			});
			assert(
				normal.allowScrollWrites && normal.shouldScrollCaretIntoView,
				"通常時の paired leaf caret follow が抑止されています",
			);

			const modalPaired = resolveSoTCaretScrollPolicy({
				settingsPanelOpen: true,
				pendingCaretScroll: false,
				pairedMarkdownLeafActive: true,
				pendingTypewriterFollow: false,
			});
			assert(
				!modalPaired.allowScrollWrites &&
					!modalPaired.shouldScrollCaretIntoView,
				"表示設定モーダル中に paired leaf force scroll が許可されています",
			);

			const modalPending = resolveSoTCaretScrollPolicy({
				settingsPanelOpen: true,
				pendingCaretScroll: true,
				pairedMarkdownLeafActive: false,
				pendingTypewriterFollow: true,
			});
			assert(
				!modalPending.shouldScrollCaretIntoView &&
					!modalPending.shouldApplyPendingTypewriterFollow,
				"表示設定モーダル中に pending/typewriter follow が許可されています",
			);

			const normalRender = resolveSoTRenderScrollRestorePolicy({
				settingsPanelOpen: false,
				suppressScrollRestore: false,
				pointerSelecting: false,
				autoScrollSelecting: false,
				hasScrollAnchor: true,
			});
			assert(
				normalRender.mode === "anchor-adjusted" &&
					normalRender.allowScrollAnchorAdjustment,
				"通常 render の scroll anchor 補正が無効になっています",
			);

			const modalRender = resolveSoTRenderScrollRestorePolicy({
				settingsPanelOpen: true,
				suppressScrollRestore: false,
				pointerSelecting: false,
				autoScrollSelecting: false,
				hasScrollAnchor: true,
			});
			assert(
				modalRender.mode === "captured-only" &&
					!modalRender.allowScrollAnchorAdjustment,
				"表示設定モーダル中に render scroll anchor 補正が許可されています",
			);

			const outlineJumpRender = resolveSoTRenderScrollRestorePolicy({
				settingsPanelOpen: true,
				suppressScrollRestore: true,
				pointerSelecting: false,
				autoScrollSelecting: false,
				hasScrollAnchor: true,
			});
			assert(
				outlineJumpRender.mode === "none" &&
					!outlineJumpRender.allowScrollAnchorAdjustment,
				"outline jump の scroll restore 抑止が維持されていません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"表示設定モーダル中のみ caret / Typewriter follow と render anchor scroll を抑止します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `caret scroll policy テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTVerticalPreviousLineNavigationHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: vertical logical navigation helper は短い行や空行の先頭から前の論理行先頭を返す";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const shortDoc = "alpha\nb\ncharlie";
			const alphaStart = 0;
			const alphaEnd = 5;
			const shortLineStart = 6;
			const shortLineEnd = 7;
			const thirdLineStart = 8;
			const emptyDoc = "alpha\n\ncharlie";
			const emptyLineStart = 6;

			assert(
				resolveSoTNavigationOffset(
					shortDoc,
					thirdLineStart,
					"ArrowRight",
					"vertical-rl",
				) === shortLineStart,
				"vertical-rl で短い行の先頭から前の論理行先頭へ移動しません",
			);
			assert(
				resolveSoTNavigationOffset(
					shortDoc,
					thirdLineStart,
					"ArrowRight",
					"vertical-rl",
				) !== shortLineEnd,
				"vertical-rl で短い行の先頭から前の論理行末へ移動しています",
			);
			assert(
				resolveSoTNavigationOffset(
					shortDoc,
					thirdLineStart,
					"ArrowLeft",
					"vertical-lr",
				) === shortLineStart,
				"vertical-lr で短い行の先頭から前の論理行先頭へ移動しません",
			);
			assert(
				resolveSoTNavigationOffset(
					shortDoc,
					thirdLineStart,
					"ArrowLeft",
					"vertical-lr",
				) !== shortLineEnd,
				"vertical-lr で短い行の先頭から前の論理行末へ移動しています",
			);
			assert(
				resolveSoTNavigationOffset(
					emptyDoc,
					emptyLineStart,
					"ArrowRight",
					"vertical-rl",
				) === alphaStart,
				"空行の先頭から前の論理行先頭へ移動しません",
			);
			assert(
				resolveSoTNavigationOffset(
					emptyDoc,
					emptyLineStart,
					"ArrowRight",
					"vertical-rl",
				) !== alphaEnd,
				"空行の先頭から前の論理行末へ移動しています",
			);
			assert(
				resolveSoTNavigationOffset(
					emptyDoc,
					emptyLineStart,
					"ArrowLeft",
					"vertical-lr",
				) === alphaStart,
				"vertical-lr で空行の先頭から前の論理行先頭へ移動しません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "縦書きの前行移動が短い行と空行の先頭で前の論理行先頭へ安定します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `vertical logical navigation helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPlainEditHomeEndNavigationHelper(): Promise<void> {
		const testName =
			"SoT段落単位ソース編集: Home/End は論理行境界へ移動する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const text = "alpha\nbeta\n\ndelta";

			const middleHome = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "Home",
				selectionStart: 8,
				selectionEnd: 8,
				selectionDirection: "none",
				shiftKey: false,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(middleHome?.start === 6 && middleHome.end === 6, "Home が現在行の論理行先頭へ移動しません");

			const middleEnd = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "End",
				selectionStart: 8,
				selectionEnd: 8,
				selectionDirection: "none",
				shiftKey: false,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(middleEnd?.start === 10 && middleEnd.end === 10, "End が現在行の論理行末尾へ移動しません");

			const firstLineHome = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "Home",
				selectionStart: 2,
				selectionEnd: 2,
				selectionDirection: "none",
				shiftKey: false,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(firstLineHome?.start === 0 && firstLineHome.end === 0, "先頭行での Home が壊れています");

			const lastLineEnd = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "End",
				selectionStart: 14,
				selectionEnd: 14,
				selectionDirection: "none",
				shiftKey: false,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(lastLineEnd?.start === text.length && lastLineEnd.end === text.length, "最終行での End が壊れています");

			const emptyLineHome = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "Home",
				selectionStart: 11,
				selectionEnd: 11,
				selectionDirection: "none",
				shiftKey: false,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(emptyLineHome?.start === 11 && emptyLineHome.end === 11, "空行での Home が壊れています");

			const emptyLineEnd = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "End",
				selectionStart: 11,
				selectionEnd: 11,
				selectionDirection: "none",
				shiftKey: false,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(emptyLineEnd?.start === 11 && emptyLineEnd.end === 11, "空行での End が壊れています");

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Home/End が論理行ベースで安定して移動します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `plain edit Home/End テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPlainEditNormalLineRangeStaysSingleLine(): Promise<void> {
		const testName =
			"SoT plain edit は Phase V1 では通常段落を段落全体へ広げず 1 行のまま扱う";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const normalizeLinkLabel = (label: string) =>
				label.trim().toLowerCase();
			const text = "para1\npara2\n\n```ts\nconst x = 1;\n```";
			const lines = text.split("\n");
			const model = recomputeLineBlockKinds({
				lines,
				collapsedHeadingLines: new Set<number>(),
				normalizeLinkLabel,
			});
			const lineRanges = computeLineRangesFromLines(lines);
			const selection = { anchor: 7, head: 7 };
			const controller = new SoTPlainEditController({
				derivedRootEl: null,
				plainEditOverlayEl: null,
				plainEditRange: null,
				plainEditComposing: false,
				plainEditCommitting: false,
				plainEditOutsidePointerHandler: null,
				plainEditOverlayBaseRect: null,
				sourceModeEnabled: true,
				lineRanges,
				lineBlockKinds: model.lineBlockKinds,
				lineCodeBlockPart: model.lineCodeBlockPart,
				lineMathBlockStart: model.lineMathBlockStart,
				lineMathBlockEnd: model.lineMathBlockEnd,
				lineCalloutBlockStart: model.lineCalloutBlockStart,
				lineCalloutBlockEnd: model.lineCalloutBlockEnd,
				lineTableBlockStart: model.lineTableBlockStart,
				lineTableBlockEnd: model.lineTableBlockEnd,
				lineDeflistBlockStart: model.lineDeflistBlockStart,
				lineDeflistBlockEnd: model.lineDeflistBlockEnd,
				lineHeadingSectionEnd: model.lineHeadingSectionEnd,
				lineHeadingHiddenBy: model.lineHeadingHiddenBy,
				sotEditor: {
					getSelection: () => selection,
				} as SoTEditor,
				immediateRender: false,
				updatePendingText: () => undefined,
				setSelectionNormalized: () => undefined,
				findLineIndex: (pos: number) => {
					for (let i = 0; i < lineRanges.length; i += 1) {
						const range = lineRanges[i];
						if (!range) continue;
						if (pos >= range.from && pos <= range.to) return i;
					}
					return null;
				},
				getLineElement: () => null,
				ensureLineRendered: () => undefined,
				getLineVisualRects: () => [],
				toggleSourceMode: () => undefined,
			});

			const paragraphRange = controller.getBlockLineRange(1);
			assert(
				paragraphRange?.start === 1 && paragraphRange.end === 1,
				`normal 行 plain edit が 1 行に留まりません: ${paragraphRange?.start}-${paragraphRange?.end}`,
			);

			const codeRange = controller.getBlockLineRange(4);
			assert(
				codeRange?.start === 3 && codeRange.end === 5,
				`code block plain edit が従来どおり block 単位になりません: ${codeRange?.start}-${codeRange?.end}`,
			);

			const resolvedSelectionRange = controller.getRangeFromSelection();
			assert(
				resolvedSelectionRange?.startLine === 1 &&
					resolvedSelectionRange.endLine === 1,
				"getRangeFromSelection が通常段落を複数行 overlay に広げています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "plain edit の normal 行 1 行維持と code block 維持を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `plain edit normal 行範囲テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPlainEditShiftHomeEndSelectionHelper(): Promise<void> {
		const testName =
			"SoT段落単位ソース編集: Shift+Home/End は論理行境界まで選択拡張する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const text = "alpha\nbeta\ngamma";

			const shiftHomeCollapsed = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "Home",
				selectionStart: 8,
				selectionEnd: 8,
				selectionDirection: "none",
				shiftKey: true,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(
				shiftHomeCollapsed?.start === 6 &&
					shiftHomeCollapsed.end === 8 &&
					shiftHomeCollapsed.direction === "backward",
				"collapsed selection の Shift+Home が論理行先頭まで拡張しません",
			);

			const shiftEndCollapsed = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "End",
				selectionStart: 7,
				selectionEnd: 7,
				selectionDirection: "none",
				shiftKey: true,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(
				shiftEndCollapsed?.start === 7 &&
					shiftEndCollapsed.end === 10 &&
					shiftEndCollapsed.direction === "forward",
				"collapsed selection の Shift+End が論理行末尾まで拡張しません",
			);

			const shiftHomeForward = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "Home",
				selectionStart: 6,
				selectionEnd: 9,
				selectionDirection: "forward",
				shiftKey: true,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(
				shiftHomeForward?.start === 6 &&
					shiftHomeForward.end === 6 &&
					shiftHomeForward.direction === "none",
				"forward selection の Shift+Home が anchor/head を壊しています",
			);

			const shiftEndBackward = resolveSoTPlainEditHomeEndSelection({
				text,
				key: "End",
				selectionStart: 7,
				selectionEnd: 10,
				selectionDirection: "backward",
				shiftKey: true,
				altKey: false,
				metaKey: false,
				ctrlKey: false,
			});
			assert(
				shiftEndBackward?.start === 10 &&
					shiftEndBackward.end === 10 &&
					shiftEndBackward.direction === "none",
				"backward selection の Shift+End が anchor/head を壊しています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Shift+Home/End が論理行境界まで selection を安定して拡張します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `plain edit Shift+Home/End テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPlainEditModifiedHomeEndIsIgnored(): Promise<void> {
		const testName =
			"SoT段落単位ソース編集: Ctrl/Command 付き Home/End は今回の helper 対象外";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const text = "alpha\nbeta";

			assert(
				resolveSoTPlainEditHomeEndSelection({
					text,
					key: "Home",
					selectionStart: 7,
					selectionEnd: 7,
					selectionDirection: "none",
					shiftKey: false,
					altKey: false,
					metaKey: false,
					ctrlKey: true,
				}) === null,
				"Ctrl+Home が helper 対象になっています",
			);
			assert(
				resolveSoTPlainEditHomeEndSelection({
					text,
					key: "End",
					selectionStart: 7,
					selectionEnd: 7,
					selectionDirection: "none",
					shiftKey: false,
					altKey: false,
					metaKey: false,
					ctrlKey: true,
				}) === null,
				"Ctrl+End が helper 対象になっています",
			);
			assert(
				resolveSoTPlainEditHomeEndSelection({
					text,
					key: "Home",
					selectionStart: 7,
					selectionEnd: 7,
					selectionDirection: "none",
					shiftKey: false,
					altKey: false,
					metaKey: true,
					ctrlKey: false,
				}) === null,
				"Command+Home が helper 対象になっています",
			);
			assert(
				resolveSoTPlainEditHomeEndSelection({
					text,
					key: "End",
					selectionStart: 7,
					selectionEnd: 7,
					selectionDirection: "none",
					shiftKey: false,
					altKey: false,
					metaKey: true,
					ctrlKey: false,
				}) === null,
				"Command+End が helper 対象になっています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "修飾付き Home/End は今回の helper で奪いません",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `modified Home/End テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTVisualBoundaryNavigationHelper(): Promise<void> {
		const testName =
			"SoT派生ビュー: vertical boundary navigation helper は折り返し行先頭から前後両方向の隣 visual line start を対称に返す";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const visualLineStartOffsets = [2, 7, 11];

			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowRight",
					currentLocalOffset: 7,
					visualLineStartOffsets,
				}) === 2,
				"vertical-rl で前の折り返し行先頭を返しません",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-lr",
					key: "ArrowLeft",
					currentLocalOffset: 11,
					visualLineStartOffsets,
				}) === 7,
				"vertical-lr で前の折り返し行先頭を返しません",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowRight",
					currentLocalOffset: 8,
					visualLineStartOffsets,
				}) === null,
				"行頭以外でも boundary snap helper が発火しています",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowRight",
					currentLocalOffset: 2,
					visualLineStartOffsets,
				}) === null,
				"前の visual line がないのに helper が発火しています",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "horizontal-tb",
					key: "ArrowUp",
					currentLocalOffset: 7,
					visualLineStartOffsets,
				}) === null,
				"横書きでも boundary snap helper が発火しています",
			);
			assert(
				resolveSoTPreviousLogicalLineVisualStartOffset({
					writingMode: "vertical-rl",
					key: "ArrowRight",
					currentLocalOffset: 4,
					currentFirstVisibleStartOffset: 4,
					targetVisualLineStartOffsets: [0, 6, 12],
				}) === 12,
				"raw offset 0 でなくても表示上の行頭なら最後の visual line start を返しません",
			);
			assert(
				resolveSoTPreviousLogicalLineVisualStartOffset({
					writingMode: "vertical-lr",
					key: "ArrowLeft",
					currentLocalOffset: 5,
					currentFirstVisibleStartOffset: 5,
					targetVisualLineStartOffsets: [0, 5],
				}) === 5,
				"vertical-lr の跨ぎ移動で最後の visual line start を返しません",
			);
			assert(
				resolveSoTPreviousLogicalLineVisualStartOffset({
					writingMode: "vertical-rl",
					key: "ArrowRight",
					currentLocalOffset: 3,
					currentFirstVisibleStartOffset: 4,
					targetVisualLineStartOffsets: [0, 6, 12],
				}) === null,
				"表示上の行頭と一致しないのに跨ぎ用 helper が発火しています",
			);
			const unsortedRects = [
				DOMRect.fromRect({ x: 90, y: 0, width: 10, height: 20 }),
				DOMRect.fromRect({ x: 110, y: 0, width: 10, height: 20 }),
				DOMRect.fromRect({ x: 100, y: 0, width: 10, height: 20 }),
			];
			const sortedRects = sortSoTVisualLineRects(
				unsortedRects,
				"vertical-rl",
			);
			assert(
				sortedRects.map((rect) => rect.left).join(",") === "90,100,110",
				"targetVisualLineStartOffsets を作る rect 順が visual order になっていません",
			);

			// ───────────────────────────────────────────────────────────
			// Phase 2 追加修正: next 側 (前進) への対称化検証
			// 視覚行先頭から前進したとき、hit-test を経ずに次の視覚行先頭へスナップする。
			// ───────────────────────────────────────────────────────────

			// resolveSoTVisualBoundarySnapOffset の next 側 (双方向化) 検証
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 2,
					visualLineStartOffsets,
				}) === 7,
				"vertical-rl の next 側で 1 つ次の visual line start を返しません",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 7,
					visualLineStartOffsets,
				}) === 11,
				"vertical-rl の next 側で連続スナップが機能しません",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 11,
					visualLineStartOffsets,
				}) === null,
				"next 方向に visual line がないのに boundary snap が発火しています",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-lr",
					key: "ArrowRight",
					currentLocalOffset: 2,
					visualLineStartOffsets,
				}) === 7,
				"vertical-lr の next 側で 1 つ次の visual line start を返しません",
			);
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 8,
					visualLineStartOffsets,
				}) === null,
				"next 方向で行頭以外でも boundary snap helper が発火しています",
			);

			// resolveSoTNextLogicalLineVisualStartOffset (新規) の検証
			assert(
				resolveSoTNextLogicalLineVisualStartOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 12,
					currentLastVisibleStartOffset: 12,
					targetVisualLineStartOffsets: [0, 6, 12],
				}) === 0,
				"next 方向の論理行またぎで次行の最初の visual line start を返しません",
			);
			assert(
				resolveSoTNextLogicalLineVisualStartOffset({
					writingMode: "vertical-lr",
					key: "ArrowRight",
					currentLocalOffset: 5,
					currentLastVisibleStartOffset: 5,
					targetVisualLineStartOffsets: [0, 5],
				}) === 0,
				"vertical-lr の next 跨ぎ移動で次行先頭を返しません",
			);
			assert(
				resolveSoTNextLogicalLineVisualStartOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 11,
					currentLastVisibleStartOffset: 12,
					targetVisualLineStartOffsets: [0, 6, 12],
				}) === null,
				"表示上の行末と一致しないのに next 跨ぎ helper が発火しています",
			);
			assert(
				resolveSoTNextLogicalLineVisualStartOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 12,
					currentLastVisibleStartOffset: null,
					targetVisualLineStartOffsets: [0, 6, 12],
				}) === null,
				"currentLastVisibleStartOffset が null でも next 跨ぎ helper が発火しています",
			);
			assert(
				resolveSoTNextLogicalLineVisualStartOffset({
					writingMode: "vertical-rl",
					key: "ArrowRight",
					currentLocalOffset: 12,
					currentLastVisibleStartOffset: 12,
					targetVisualLineStartOffsets: [0, 6, 12],
				}) === null,
				"previous キー (ArrowRight in vertical-rl) で next 跨ぎ helper が発火しています",
			);
			assert(
				resolveSoTNextLogicalLineVisualStartOffset({
					writingMode: "vertical-rl",
					key: "ArrowLeft",
					currentLocalOffset: 12,
					currentLastVisibleStartOffset: 12,
					targetVisualLineStartOffsets: [],
				}) === null,
				"次行 visualLineStartOffsets が空でも next 跨ぎ helper が発火しています",
			);

			// 既存の previous 側挙動が双方向化により壊れていないことを確認
			assert(
				resolveSoTVisualBoundarySnapOffset({
					writingMode: "vertical-rl",
					key: "ArrowRight",
					currentLocalOffset: 11,
					visualLineStartOffsets,
				}) === 7,
				"双方向化後に previous 側の連続スナップが壊れています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"折り返し行先頭から前後両方向で隣の visual line start に対称的にスナップします",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `vertical boundary navigation helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTRunOffsetBoundaryResolution(): Promise<void> {
		const testName =
			"SoT派生ビュー: run offset helper は隣接 run 境界で次 run start を優先する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const window = new Window();
			const document =
				window.document as unknown as globalThis.Document;
			const lineEl =
				document.createElement("div") as unknown as HTMLElement;
			lineEl.innerHTML =
				'<span class="tategaki-sot-run" data-from="0" data-to="1">前</span>' +
				'<span class="tategaki-sot-run tategaki-aozora-ruby" data-from="1" data-to="2">漢</span>' +
				'<span class="tategaki-sot-run" data-from="4" data-to="5">後</span>';
			const runs = Array.from(
				lineEl.querySelectorAll<HTMLElement>(".tategaki-sot-run"),
			);
			const runInfos = runs.map((run) => ({
				from: Number.parseInt(run.dataset.from ?? "", 10),
				to: Number.parseInt(run.dataset.to ?? "", 10),
				textNode: run.firstChild as Text,
			}));

			const adjacentBoundary = findSoTRunTextPositionAtOffset(runInfos, 1);
			assert(
				adjacentBoundary?.node === runs[1]?.firstChild &&
					adjacentBoundary.offset === 0,
				"隣接 run 境界で次 run start を返しません",
			);

			const hiddenGapBoundary = findSoTRunTextPositionAtOffset(runInfos, 2);
			assert(
				hiddenGapBoundary?.node === runs[1]?.firstChild &&
					hiddenGapBoundary.offset === 1,
				"不可視 gap の手前境界で現在 run end を維持しません",
			);

			const hiddenGapInterior = findSoTRunTextPositionAtOffset(runInfos, 3);
			assert(
				hiddenGapInterior?.node === runs[2]?.firstChild &&
					hiddenGapInterior.offset === 0,
				"不可視 gap 内で次の可視 run 先頭へ寄せません",
			);

			const lineEnd = findSoTRunTextPositionAtOffset(runInfos, 5);
			assert(
				lineEnd?.node === runs[2]?.firstChild && lineEnd.offset === 1,
				"行末で最後の run end を返しません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"隣接 run 境界では次 run start、不可視 gap では既存 end/次 start を使い分けます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `run offset helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTPointerWindowBindingRebindsWindow(): Promise<void> {
		const testName =
			"SoT派生ビュー: pointer window binder は window 差し替え時に再バインドされる";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const mainWindow = new Window();
			const popoutWindow = new Window();
			const binding = new SoTPointerWindowBinding();
			const mainViewWindow =
				mainWindow as unknown as globalThis.Window;
			const popoutViewWindow =
				popoutWindow as unknown as globalThis.Window;
			let moveCalls = 0;
			let upCalls = 0;
			let cancelCalls = 0;

			assert(
				binding.bind(
					mainViewWindow,
					{
						onPointerMove: () => {
							moveCalls += 1;
						},
						onPointerUp: () => {
							upCalls += 1;
						},
						onPointerCancel: () => {
							cancelCalls += 1;
						},
					},
				),
				"初回 bind は true を返すべきです",
			);
			assert(
				!binding.bind(
					mainViewWindow,
					{
						onPointerMove: () => undefined,
						onPointerUp: () => undefined,
						onPointerCancel: () => undefined,
					},
				),
				"同じ window への再 bind は不要です",
			);

			mainWindow.dispatchEvent(
				new mainWindow.Event("pointermove"),
			);
			mainWindow.dispatchEvent(
				new mainWindow.Event("pointerup"),
			);
			mainWindow.dispatchEvent(
				new mainWindow.Event("pointercancel"),
			);
			assert(
				moveCalls === 1 && upCalls === 1 && cancelCalls === 1,
				"main window の pointer listener を受け取れません",
			);

			assert(
				binding.bind(
					popoutViewWindow,
					{
						onPointerMove: () => {
							moveCalls += 1;
						},
						onPointerUp: () => {
							upCalls += 1;
						},
						onPointerCancel: () => {
							cancelCalls += 1;
						},
					},
				),
				"別 window への bind 差し替えが行われません",
			);

			mainWindow.dispatchEvent(
				new mainWindow.Event("pointermove"),
			);
			mainWindow.dispatchEvent(
				new mainWindow.Event("pointerup"),
			);
			mainWindow.dispatchEvent(
				new mainWindow.Event("pointercancel"),
			);
			assert(
				moveCalls === 1 && upCalls === 1 && cancelCalls === 1,
				"旧 window の listener が解除されていません",
			);

			popoutWindow.dispatchEvent(
				new popoutWindow.Event("pointermove"),
			);
			popoutWindow.dispatchEvent(
				new popoutWindow.Event("pointerup"),
			);
			popoutWindow.dispatchEvent(
				new popoutWindow.Event("pointercancel"),
			);
			assert(
				moveCalls === 2 && upCalls === 2 && cancelCalls === 2,
				"新 window の pointer listener を受け取れません",
			);

			binding.dispose();
			popoutWindow.dispatchEvent(
				new popoutWindow.Event("pointermove"),
			);
			assert(moveCalls === 2, "dispose 後に pointer listener が残っています");

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "pointermove/up/cancel listener を現在の window に張り替えられます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `pointer window binder テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTSelectionChangeBindingRebindsDocument(): Promise<void> {
		const testName = "SoT派生ビュー: selectionchange listener は document 差し替え時に再バインドされる";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const mainWindow = new Window();
			const popoutWindow = new Window();
			const binding = new SoTSelectionChangeBinding();
			let calls = 0;
			const handleSelectionChange = () => {
				calls += 1;
			};
			const mainDoc =
				mainWindow.document as unknown as globalThis.Document;
			const popoutDoc =
				popoutWindow.document as unknown as globalThis.Document;

			assert(
				binding.bind(mainDoc, handleSelectionChange),
				"初回 bind は true を返すべきです"
			);
			assert(
				!binding.bind(mainDoc, handleSelectionChange),
				"同じ document への再 bind は不要です"
			);
			mainDoc.dispatchEvent(
				new mainWindow.Event("selectionchange") as unknown as Event,
			);
			assert(calls === 1, "main document の selectionchange を受け取れません");

			assert(
				binding.bind(popoutDoc, handleSelectionChange),
				"別 document への bind 差し替えが行われません"
			);
			mainDoc.dispatchEvent(
				new mainWindow.Event("selectionchange") as unknown as Event,
			);
			assert(
				calls === 1,
				"旧 document の listener が解除されていません"
			);
			popoutDoc.dispatchEvent(
				new popoutWindow.Event("selectionchange") as unknown as Event,
			);
			assert(
				calls === 2,
				"新 document の selectionchange を受け取れません"
			);

			binding.dispose();
			popoutDoc.dispatchEvent(
				new popoutWindow.Event("selectionchange") as unknown as Event,
			);
			assert(calls === 2, "dispose 後に listener が残っています");

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "selectionchange listener を現在の document に張り替えられます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `selectionchange bind テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTListContinuationEnter(): Promise<void> {
		const testName = "SoT派生ビュー: リスト項目 Enter 継続";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const bulletDoc = "- alpha";
			const bulletEdit = resolveSoTListContinuationEdit({
				doc: bulletDoc,
				selection: { anchor: bulletDoc.length, head: bulletDoc.length },
				mode: "enter",
			});
			assert(!!bulletEdit, "bullet の Enter 継続が解決できない");
			assert(
				bulletEdit?.insert === "\n- ",
				`bullet 継続挿入が不正: ${JSON.stringify(bulletEdit?.insert)}`
			);

			const orderedDoc = "1. alpha";
			const orderedEdit = resolveSoTListContinuationEdit({
				doc: orderedDoc,
				selection: { anchor: orderedDoc.length, head: orderedDoc.length },
				mode: "enter",
			});
			assert(!!orderedEdit, "ordered の Enter 継続が解決できない");
			assert(
				orderedEdit?.insert === "\n2. ",
				`ordered 継続挿入が不正: ${JSON.stringify(orderedEdit?.insert)}`
			);

			const taskDoc = "- [x] done";
			const taskEdit = resolveSoTListContinuationEdit({
				doc: taskDoc,
				selection: { anchor: taskDoc.length, head: taskDoc.length },
				mode: "enter",
			});
			assert(!!taskEdit, "task の Enter 継続が解決できない");
			assert(
				taskEdit?.insert === "\n- [ ] ",
				`task 継続挿入が不正: ${JSON.stringify(taskEdit?.insert)}`
			);

			const emptyTaskDoc = "- [ ] ";
			const emptyTaskEdit = resolveSoTListContinuationEdit({
				doc: emptyTaskDoc,
				selection: {
					anchor: emptyTaskDoc.length,
					head: emptyTaskDoc.length,
				},
				mode: "enter",
			});
			assert(!!emptyTaskEdit, "空 task 項目の Enter 終了が解決できない");
			assert(
				emptyTaskEdit?.from === 0 &&
					emptyTaskEdit.to === emptyTaskDoc.length &&
					emptyTaskEdit.insert === "",
				`空 task 項目の終了が不正: ${JSON.stringify(emptyTaskEdit)}`
			);

			const continuedBulletDoc = "- alpha  \n  continued";
			const continuedBulletEdit = resolveSoTListContinuationEdit({
				doc: continuedBulletDoc,
				selection: {
					anchor: continuedBulletDoc.length,
					head: continuedBulletDoc.length,
				},
				mode: "enter",
			});
			assert(
				!!continuedBulletEdit,
				"hardBreak 継続行からの Enter 継続が解決できない"
			);
			assert(
				continuedBulletEdit?.insert === "\n- ",
				`hardBreak 継続行の Enter 継続が不正: ${JSON.stringify(
					continuedBulletEdit?.insert,
				)}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"bullet / ordered / task の Enter 継続、hardBreak 継続行からの次項目生成、空項目終了が動作します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT リスト Enter 継続テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTListHardBreakContinuation(): Promise<void> {
		const testName = "SoT派生ビュー: リスト項目 Shift+Enter hardBreak";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const bulletDoc = "- alpha";
			const bulletEdit = resolveSoTListContinuationEdit({
				doc: bulletDoc,
				selection: { anchor: bulletDoc.length, head: bulletDoc.length },
				mode: "hard-break",
			});
			assert(!!bulletEdit, "bullet の hardBreak が解決できない");
			assert(
				bulletEdit?.insert === `${SOT_MARKDOWN_HARD_BREAK}  `,
				`bullet hardBreak 挿入が不正: ${JSON.stringify(bulletEdit?.insert)}`
			);

			const taskDoc = "- [ ] alpha";
			const taskEdit = resolveSoTListContinuationEdit({
				doc: taskDoc,
				selection: { anchor: taskDoc.length, head: taskDoc.length },
				mode: "hard-break",
			});
			assert(!!taskEdit, "task の hardBreak が解決できない");
			assert(
				taskEdit?.insert === `${SOT_MARKDOWN_HARD_BREAK}      `,
				`task hardBreak 挿入が不正: ${JSON.stringify(taskEdit?.insert)}`
			);

			const paragraphEdit = resolveSoTListContinuationEdit({
				doc: "本文",
				selection: { anchor: 2, head: 2 },
				mode: "hard-break",
			});
			assert(
				paragraphEdit === null,
				"通常本文でも hardBreak が解決されています"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Shift+Enter は listItem 内だけ hardBreak を作り、本文では抑止されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT hardBreak テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTBlockquoteContinuationEnter(): Promise<void> {
		const testName = "SoT派生ビュー: blockquote Enter 継続";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// 1. 単純な blockquote Enter
			const simpleDoc = "> 引用";
			const simpleEdit = resolveSoTBlockquoteContinuationEdit({
				doc: simpleDoc,
				selection: { anchor: simpleDoc.length, head: simpleDoc.length },
				mode: "enter",
			});
			assert(!!simpleEdit, "> 引用 の Enter 継続が解決できない");
			assert(
				simpleEdit?.insert === "\n> ",
				`> 引用 の Enter 継続挿入が不正: ${JSON.stringify(simpleEdit?.insert)}`,
			);

			// 2. 多重引用 Enter
			const multiDoc = "> > 引用";
			const multiEdit = resolveSoTBlockquoteContinuationEdit({
				doc: multiDoc,
				selection: { anchor: multiDoc.length, head: multiDoc.length },
				mode: "enter",
			});
			assert(!!multiEdit, "> > 引用 の Enter 継続が解決できない");
			assert(
				multiEdit?.insert === "\n> > ",
				`> > 引用 の Enter 継続挿入が不正: ${JSON.stringify(multiEdit?.insert)}`,
			);

			// 3. 空の blockquote で Enter → 引用終了
			const emptyDoc = "> ";
			const emptyEdit = resolveSoTBlockquoteContinuationEdit({
				doc: emptyDoc,
				selection: { anchor: emptyDoc.length, head: emptyDoc.length },
				mode: "enter",
			});
			assert(!!emptyEdit, "空 blockquote の Enter 終了が解決できない");
			assert(
				emptyEdit?.from === 0 &&
					emptyEdit.to === emptyDoc.length &&
					emptyEdit.insert === "",
				`空 blockquote 終了が不正: ${JSON.stringify(emptyEdit)}`,
			);

			// 4. 通常本文では null を返す
			const paragraphEdit = resolveSoTBlockquoteContinuationEdit({
				doc: "本文テキスト",
				selection: { anchor: 6, head: 6 },
				mode: "enter",
			});
			assert(
				paragraphEdit === null,
				"通常本文でも blockquote Enter が解決されています",
			);

			// 5. リスト in blockquote はリストハンドラに委ねる（null を返す）
			const listInBqEdit = resolveSoTBlockquoteContinuationEdit({
				doc: "> - item",
				selection: { anchor: 8, head: 8 },
				mode: "enter",
			});
			assert(
				listInBqEdit === null,
				"> - item はリストハンドラに委ねるべきところ blockquote が解決しています",
			);

			// 6. 先頭空白付き prefix の spacing を保持する
			const indentedDoc = "  > 引用";
			const indentedEdit = resolveSoTBlockquoteContinuationEdit({
				doc: indentedDoc,
				selection: { anchor: indentedDoc.length, head: indentedDoc.length },
				mode: "enter",
			});
			assert(!!indentedEdit, "  > 引用 の Enter 継続が解決できない");
			assert(
				indentedEdit?.insert === "\n  > ",
				`  > 引用 の Enter 継続で rawPrefix が保持されていない: ${JSON.stringify(indentedEdit?.insert)}`,
			);

			// 7. 多重引用の内部 spacing を保持する
			const wideSpaceDoc = ">   > 引用";
			const wideSpaceEdit = resolveSoTBlockquoteContinuationEdit({
				doc: wideSpaceDoc,
				selection: { anchor: wideSpaceDoc.length, head: wideSpaceDoc.length },
				mode: "enter",
			});
			assert(!!wideSpaceEdit, ">   > 引用 の Enter 継続が解決できない");
			assert(
				wideSpaceEdit?.insert === "\n>   > ",
				`>   > 引用 の Enter 継続で rawPrefix が保持されていない: ${JSON.stringify(wideSpaceEdit?.insert)}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"blockquote Enter 継続・多重引用・空終了・本文スキップ・rawPrefix 保持が動作します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT blockquote Enter テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTBlockquoteHardBreakContinuation(): Promise<void> {
		const testName = "SoT派生ビュー: blockquote Shift+Enter 挙動";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// 1. 非空の引用行で Shift+Enter → null (no-op)
			const simpleEdit = resolveSoTBlockquoteContinuationEdit({
				doc: "> 引用",
				selection: { anchor: 4, head: 4 },
				mode: "hard-break",
			});
			assert(
				simpleEdit === null,
				`非空の引用行で Shift+Enter が no-op でない: ${JSON.stringify(simpleEdit)}`,
			);

			// 2. 多重引用の非空行で Shift+Enter → null (no-op)
			const multiEdit = resolveSoTBlockquoteContinuationEdit({
				doc: "> > 引用",
				selection: { anchor: 6, head: 6 },
				mode: "hard-break",
			});
			assert(
				multiEdit === null,
				`多重引用の非空行で Shift+Enter が no-op でない: ${JSON.stringify(multiEdit)}`,
			);

			// 3. 通常本文では Shift+Enter が blockquote 解決されない → null
			const paragraphEdit = resolveSoTBlockquoteContinuationEdit({
				doc: "本文",
				selection: { anchor: 2, head: 2 },
				mode: "hard-break",
			});
			assert(
				paragraphEdit === null,
				"通常本文でも blockquote Shift+Enter が解決されています",
			);

			// 4. 空の引用行で Shift+Enter → 引用内空行を維持 (\n> )
			const emptyDoc = "> ";
			const emptyEdit = resolveSoTBlockquoteContinuationEdit({
				doc: emptyDoc,
				selection: { anchor: emptyDoc.length, head: emptyDoc.length },
				mode: "hard-break",
			});
			assert(!!emptyEdit, "空の引用行で Shift+Enter が解決できない");
			assert(
				emptyEdit?.insert === "\n> ",
				`空の引用行 Shift+Enter の挿入が不正: ${JSON.stringify(emptyEdit?.insert)}`,
			);

			// 5. 多重引用の空行で Shift+Enter → rawPrefix をそのまま継続
			const emptyMultiDoc = "> > ";
			const emptyMultiEdit = resolveSoTBlockquoteContinuationEdit({
				doc: emptyMultiDoc,
				selection: { anchor: emptyMultiDoc.length, head: emptyMultiDoc.length },
				mode: "hard-break",
			});
			assert(!!emptyMultiEdit, "多重引用の空行で Shift+Enter が解決できない");
			assert(
				emptyMultiEdit?.insert === "\n> > ",
				`多重引用の空行 Shift+Enter の挿入が不正: ${JSON.stringify(emptyMultiEdit?.insert)}`,
			);

			// 6. 先頭空白付き空行で Shift+Enter → rawPrefix 保持
			const indentedEmptyDoc = "  > ";
			const indentedEmptyEdit = resolveSoTBlockquoteContinuationEdit({
				doc: indentedEmptyDoc,
				selection: { anchor: indentedEmptyDoc.length, head: indentedEmptyDoc.length },
				mode: "hard-break",
			});
			assert(!!indentedEmptyEdit, "  > 空行で Shift+Enter が解決できない");
			assert(
				indentedEmptyEdit?.insert === "\n  > ",
				`  > 空行 Shift+Enter で rawPrefix が保持されていない: ${JSON.stringify(indentedEmptyEdit?.insert)}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"非空の引用行では Shift+Enter が no-op、空の引用行では引用内空行を維持します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT blockquote Shift+Enter テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTBlockquoteOnlyLineDetection(): Promise<void> {
		const testName = "SoT派生ビュー: blockquote-only 行の検出（キャレット正規化用）";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// blockquote-only とみなすべき行
			assert(isSoTBlockquoteOnlyLine("> "), '"> " が blockquote-only でない');
			assert(isSoTBlockquoteOnlyLine(">"), '">" が blockquote-only でない');
			assert(isSoTBlockquoteOnlyLine("> > "), '"> > " が blockquote-only でない');
			assert(isSoTBlockquoteOnlyLine("> >"), '"> >" が blockquote-only でない');

			// blockquote-only とみなすべきでない行
			assert(!isSoTBlockquoteOnlyLine("> text"), '"> text" が誤って blockquote-only');
			assert(!isSoTBlockquoteOnlyLine("- item"), '"- item" が誤って blockquote-only');
			assert(!isSoTBlockquoteOnlyLine(""), '"" が誤って blockquote-only');
			assert(!isSoTBlockquoteOnlyLine("text"), '"text" が誤って blockquote-only');

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "blockquote-only 行の検出が正しく動作します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `blockquote-only 行検出テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTShiftEnterNoop(): Promise<void> {
		const testName = "SoT派生ビュー: 通常本文・見出しで Shift+Enter が no-op";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// ── 通常本文: list resolver も blockquote resolver も null を返す ──
			const paraListEdit = resolveSoTListContinuationEdit({
				doc: "本文テキスト",
				selection: { anchor: 6, head: 6 },
				mode: "hard-break",
			});
			assert(
				paraListEdit === null,
				"通常本文で list Shift+Enter が解決されています",
			);
			const paraBqEdit = resolveSoTBlockquoteContinuationEdit({
				doc: "本文テキスト",
				selection: { anchor: 6, head: 6 },
				mode: "hard-break",
			});
			assert(
				paraBqEdit === null,
				"通常本文で blockquote Shift+Enter が解決されています",
			);

			// ── 見出し: list resolver も blockquote resolver も null を返す ──
			const headingDoc = "## 見出しテキスト";
			const headingListEdit = resolveSoTListContinuationEdit({
				doc: headingDoc,
				selection: { anchor: headingDoc.length, head: headingDoc.length },
				mode: "hard-break",
			});
			assert(
				headingListEdit === null,
				"見出しで list Shift+Enter が解決されています",
			);
			const headingBqEdit = resolveSoTBlockquoteContinuationEdit({
				doc: headingDoc,
				selection: { anchor: headingDoc.length, head: headingDoc.length },
				mode: "hard-break",
			});
			assert(
				headingBqEdit === null,
				"見出しで blockquote Shift+Enter が解決されています",
			);

			// ── 空行: 両 resolver とも null ──
			const emptyListEdit = resolveSoTListContinuationEdit({
				doc: "",
				selection: { anchor: 0, head: 0 },
				mode: "hard-break",
			});
			assert(
				emptyListEdit === null,
				"空行で list Shift+Enter が解決されています",
			);
			const emptyBqEdit = resolveSoTBlockquoteContinuationEdit({
				doc: "",
				selection: { anchor: 0, head: 0 },
				mode: "hard-break",
			});
			assert(
				emptyBqEdit === null,
				"空行で blockquote Shift+Enter が解決されています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"通常本文・見出し・空行では両 resolver が null を返し、Shift+Enter は no-op になります",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Shift+Enter no-op テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTOrderedListRenumber(): Promise<void> {
		const testName = "SoT派生ビュー: ordered list の番号振り直し";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const doc = "1. alpha\n1. beta\n4. gamma";
			const changes = collectOrderedListRenumberChanges({
				doc,
				startLine: 0,
				endLine: 2,
			});
			assert(changes.length === 2, `番号振り直し件数が不正: ${changes.length}`);
			const nextDoc = changes
				.slice()
				.sort((a, b) => b.from - a.from)
				.reduce(
					(text, change) =>
						text.slice(0, change.from) +
						change.insert +
						text.slice(change.to),
					doc,
				);
			assert(
				nextDoc === "1. alpha\n2. beta\n3. gamma",
				`番号振り直し結果が不正: ${JSON.stringify(nextDoc)}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "ordered list の Enter / toggle 後に番号を正規化できます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT 番号振り直しテスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTListIndentKeepsCaretAfterMarker(): Promise<void> {
		const testName = "SoT派生ビュー: リストのインデント後もキャレットはマーカー後ろ";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const computeRanges = (text: string) =>
				text.split("\n").map((line, index, lines) => {
					let from = 0;
					for (let i = 0; i < index; i += 1) {
						from += (lines[i]?.length ?? 0) + 1;
					}
					return { from, to: from + line.length };
				});

			let doc = "- alpha\n- beta";
			const caret = doc.indexOf("beta");
			const selection = { anchor: caret, head: caret };
			const host: SoTListOutlinerHost = {
				getDoc: () => doc,
				getSelection: () => selection,
				getLineRanges: () => computeRanges(doc),
				getLineBlockKinds: () => doc.split("\n").map(() => "normal"),
				replaceRange: (from, to, insert) => {
					doc = doc.slice(0, from) + insert + doc.slice(to);
				},
				updatePendingText: () => {},
				setSelectionNormalized: (anchor, head) => {
					selection.anchor = anchor;
					selection.head = head;
				},
				setSelectionRaw: (anchor, head) => {
					selection.anchor = anchor;
					selection.head = head;
				},
				focusInputSurface: () => {},
				getWritingMode: () => "vertical-rl",
				markImmediateRender: () => {},
			};

			const applied = runListOutlinerAction(host, "indent");
			assert(applied, "インデントが適用されませんでした");
			assert(
				doc === "- alpha\n    - beta",
				`インデント結果が不正: ${JSON.stringify(doc)}`
			);
			assert(
				doc[selection.head] === "b",
				`キャレット位置が不正: offset=${selection.head}, around=${JSON.stringify(
					doc.slice(Math.max(0, selection.head - 3), selection.head + 5),
				)}`
			);

			let hardBreakDoc = "- alpha  \n  continued\n- beta";
			const hardBreakCaret = hardBreakDoc.indexOf("beta");
			const hardBreakSelection = {
				anchor: hardBreakCaret,
				head: hardBreakCaret,
			};
			const hardBreakHost: SoTListOutlinerHost = {
				getDoc: () => hardBreakDoc,
				getSelection: () => hardBreakSelection,
				getLineRanges: () => computeRanges(hardBreakDoc),
				getLineBlockKinds: () =>
					hardBreakDoc.split("\n").map(() => "normal"),
				replaceRange: (from, to, insert) => {
					hardBreakDoc =
						hardBreakDoc.slice(0, from) +
						insert +
						hardBreakDoc.slice(to);
				},
				updatePendingText: () => {},
				setSelectionNormalized: (anchor, head) => {
					hardBreakSelection.anchor = anchor;
					hardBreakSelection.head = head;
				},
				setSelectionRaw: (anchor, head) => {
					hardBreakSelection.anchor = anchor;
					hardBreakSelection.head = head;
				},
				focusInputSurface: () => {},
				getWritingMode: () => "vertical-rl",
				markImmediateRender: () => {},
			};

			const hardBreakApplied = runListOutlinerAction(
				hardBreakHost,
				"indent",
			);
			assert(
				hardBreakApplied,
				"hardBreak 継続項目の次項目がインデントできません"
			);
			assert(
				hardBreakDoc === "- alpha  \n  continued\n    - beta",
				`hardBreak 後続項目のインデント結果が不正: ${JSON.stringify(
					hardBreakDoc,
				)}`
			);
			assert(
				hardBreakDoc[hardBreakSelection.head] === "b",
				`hardBreak 後続項目のキャレット位置が不正: offset=${
					hardBreakSelection.head
				}, around=${JSON.stringify(
					hardBreakDoc.slice(
						Math.max(0, hardBreakSelection.head - 3),
						hardBreakSelection.head + 5,
					),
				)}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Tab でネストしてもキャレットは内容先頭を維持し、hardBreak 継続項目の次項目もインデントできます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT リストインデント後キャレットテスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTDisplayChunksModel(): Promise<void> {
		const testName = "SoT派生ビュー: display chunksモデル";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const makeRanges = (count: number) =>
				Array.from({ length: count }, (_, index) => ({
					from: index,
					to: index,
				}));

			// 空入力
			const emptyChunks = buildDisplayChunks({
				lineRanges: [],
				isLineHidden: () => false,
			});
			assert(
				emptyChunks.length === 0,
				"空入力で空chunk配列にならない",
			);
			assert(
				validateDisplayChunks(emptyChunks, 0),
				"空入力のchunk検証が失敗する",
			);

			// 全可視（1chunk）
			const allVisibleChunks = buildDisplayChunks({
				lineRanges: makeRanges(4),
				isLineHidden: () => false,
			});
			assert(
				allVisibleChunks.length === 1,
				"全可視で1chunkにならない",
			);
			const allVisibleChunk = allVisibleChunks[0];
			assert(
				allVisibleChunk?.type === "lines" &&
					allVisibleChunk.startLine === 0 &&
					allVisibleChunk.endLine === 3 &&
					allVisibleChunk.lineCount === 4,
				"全可視chunkの内容が不正",
			);
			assert(
				validateDisplayChunks(allVisibleChunks, 4),
				"全可視chunk検証が失敗する",
			);

			// 全hidden（1chunk）
			const allHiddenChunks = buildDisplayChunks({
				lineRanges: makeRanges(3),
				isLineHidden: () => true,
			});
			assert(
				allHiddenChunks.length === 1,
				"全hiddenで1chunkにならない",
			);
			const allHiddenChunk = allHiddenChunks[0];
			assert(
				allHiddenChunk?.type === "collapsed-gap" &&
					allHiddenChunk.startLine === 0 &&
					allHiddenChunk.endLine === 2 &&
					allHiddenChunk.lineCount === 3,
				"全hiddenchunkの内容が不正",
			);
			assert(
				validateDisplayChunks(allHiddenChunks, 3),
				"全hiddenchunk検証が失敗する",
			);

			// 可視/hiddenの交互run
			const alternatingPattern = [false, true, false, true];
			const alternatingChunks = buildDisplayChunks({
				lineRanges: makeRanges(alternatingPattern.length),
				isLineHidden: (index) => alternatingPattern[index] ?? false,
			});
			assert(
				alternatingChunks.length === 4,
				"交互runでchunk数が不正",
			);
			assert(
				alternatingChunks[0]?.type === "lines" &&
					alternatingChunks[1]?.type === "collapsed-gap" &&
					alternatingChunks[2]?.type === "lines" &&
					alternatingChunks[3]?.type === "collapsed-gap",
				"交互runのchunk typeが不正",
			);
			assert(
				validateDisplayChunks(
					alternatingChunks,
					alternatingPattern.length,
				),
				"交互run chunk検証が失敗する",
			);

			// validateDisplayChunks 異常検知
			const invalidChunks = [
				{
					type: "lines" as const,
					startLine: 0,
					endLine: 0,
					lineCount: 1,
				},
				{
					type: "collapsed-gap" as const,
					startLine: 2,
					endLine: 2,
					lineCount: 1,
				},
			];
			assert(
				!validateDisplayChunks(invalidChunks, 3),
				"欠損を含む異常chunkを検知できない",
			);

			// findChunkIndexForLine 境界値
			assert(
				findChunkIndexForLine(alternatingChunks, 0) === 0,
				"先頭lineのchunk indexが不正",
			);
			assert(
				findChunkIndexForLine(alternatingChunks, 3) === 3,
				"末尾lineのchunk indexが不正",
			);
			assert(
				findChunkIndexForLine(alternatingChunks, -1) === -1,
				"範囲外（負数）lineの判定が不正",
			);
			assert(
				findChunkIndexForLine(alternatingChunks, 4) === -1,
				"範囲外（末尾超過）lineの判定が不正",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"空/全可視/全hidden/交互run/異常検知/境界indexの契約を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `display chunksモデルエラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedGapRanges(): Promise<void> {
		const testName = "SoT派生ビュー: collapsed gap hidden-run検出";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const makeRanges = (count: number) =>
				Array.from({ length: count }, (_, index) => ({
					from: index,
					to: index,
				}));

			const empty = buildCollapsedGapRanges({
				lineRanges: [],
				isLineHidden: () => false,
			});
			assert(empty.length === 0, "空入力でcollapsed gapが生成される");

			const noHidden = buildCollapsedGapRanges({
				lineRanges: makeRanges(4),
				isLineHidden: () => false,
			});
			assert(
				noHidden.length === 0,
				"hidden runなしでcollapsed gapが生成される",
			);

			const singleRun = buildCollapsedGapRanges({
				lineRanges: makeRanges(5),
				isLineHidden: (index) => index >= 1 && index <= 3,
			});
			assert(
				singleRun.length === 1 &&
					singleRun[0]?.startLine === 1 &&
					singleRun[0]?.endLine === 3 &&
					singleRun[0]?.lineCount === 3,
				"単一hidden runを1つのcollapsed gapとして検出できない",
			);

			const multipleRuns = buildCollapsedGapRanges({
				lineRanges: makeRanges(7),
				isLineHidden: (index) => index === 1 || index === 2 || index === 5,
			});
			assert(
				multipleRuns.length === 2 &&
					multipleRuns[0]?.startLine === 1 &&
					multipleRuns[0]?.endLine === 2 &&
					multipleRuns[1]?.startLine === 5 &&
					multipleRuns[1]?.endLine === 5,
				"複数hidden runを分離して検出できない",
			);

			const sourceExcluded = buildCollapsedGapRanges({
				lineRanges: makeRanges(5),
				isLineHidden: (index) => index === 1 || index === 3,
			});
			assert(
				sourceExcluded.length === 2 &&
					sourceExcluded[0]?.lineCount === 1 &&
					sourceExcluded[1]?.lineCount === 1,
				"source mode除外相当の分断をcollapsed gapに反映できない",
			);

			const visibleBudgetNoHidden = resolveVisibleLineIndexAfterBudget({
				lineRanges: makeRanges(5),
				isLineHidden: () => false,
				visibleLineBudget: 3,
			});
			assert(
				visibleBudgetNoHidden === 2,
				"hiddenなしで可視行budgetの終端を正しく解決できない",
			);

			const visibleBudgetWithGap = resolveVisibleLineIndexAfterBudget({
				lineRanges: makeRanges(6),
				isLineHidden: (index) => index >= 1 && index <= 3,
				visibleLineBudget: 3,
			});
			assert(
				visibleBudgetWithGap === 5,
				"collapsed gapを可視budgetから除外して終端を解決できない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"空入力・hiddenなし・単一run・複数run・source mode除外相当を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `collapsed gap hidden-run検出エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedGapDom(): Promise<void> {
		const testName = "SoT派生ビュー: collapsed gap DOM helper";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const gapEl = createCollapsedGapElement({
				startLine: 4,
				endLine: 6,
				lineCount: 3,
			});
			assert(
				gapEl.classList.contains("tategaki-sot-collapsed-gap"),
				"collapsed gap classが付与されない",
			);
			assert(
				gapEl.dataset.gapKind === "collapsed" &&
					gapEl.dataset.startLine === "4" &&
					gapEl.dataset.endLine === "6" &&
					gapEl.dataset.lineCount === "3",
				"collapsed gap datasetが不正",
			);
			const parsed = getCollapsedGapRangeFromElement(gapEl);
			assert(
				parsed?.startLine === 4 &&
					parsed.endLine === 6 &&
					parsed.lineCount === 3,
				"collapsed gap DOMから範囲を復元できない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "collapsed gap DOMのdatasetとlineCountを確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `collapsed gap DOM helperエラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsePreviewTooltipPlacement(): Promise<void> {
		const testName =
			"SoT派生ビュー: 折りたたみプレビューチップは ownerDocument 基準で配置";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const popoutWindow = new Window();
			const popoutDoc = popoutWindow.document as unknown as globalThis.Document;
			const target = popoutDoc.createElement("span") as unknown as HTMLElement;
			popoutDoc.body.appendChild(target);

			const host = resolveSoTCollapsePreviewTooltipHost(target);
			assert(
				host.doc === popoutDoc,
				"tooltip host document が target.ownerDocument になっていない",
			);
			assert(
				host.containerEl === popoutDoc.body,
				"tooltip append 先が ownerDocument.body になっていない",
			);
			assert(
				host.viewportWidth === popoutWindow.innerWidth &&
					host.viewportHeight === popoutWindow.innerHeight,
				"tooltip viewport が ownerDocument.defaultView 基準で解決されない",
			);

			const lowerPlacement = computeSoTCollapsePreviewTooltipPosition({
				targetRect: {
					left: 470,
					top: 190,
					bottom: 202,
					width: 24,
				} as Pick<DOMRect, "left" | "top" | "bottom" | "width">,
				tooltipRect: {
					width: 120,
					height: 60,
				} as Pick<DOMRect, "width" | "height">,
				viewportWidth: 500,
				viewportHeight: 240,
			});
			assert(
				lowerPlacement.left === 372 && lowerPlacement.top === 122,
				`右下クランプが不正: left=${lowerPlacement.left}, top=${lowerPlacement.top}`,
			);

			const upperPlacement = computeSoTCollapsePreviewTooltipPosition({
				targetRect: {
					left: 2,
					top: 10,
					bottom: 18,
					width: 20,
				} as Pick<DOMRect, "left" | "top" | "bottom" | "width">,
				tooltipRect: {
					width: 150,
					height: 80,
				} as Pick<DOMRect, "width" | "height">,
				viewportWidth: 120,
				viewportHeight: 70,
			});
			assert(
				upperPlacement.left === 8 && upperPlacement.top === 8,
				`左上クランプが不正: left=${upperPlacement.left}, top=${upperPlacement.top}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"tooltip host document/body と viewport clamp が popout 基準で解決されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `collapse preview tooltip テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedGapNewlineIntegrity(): Promise<void> {
		const testName = "SoT派生ビュー: 折りたたみ見出し+改行挿入のgap整合性";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const makeRanges = (count: number) =>
				Array.from({ length: count }, (_, index) => ({
					from: index * 10,
					to: index * 10 + 5,
				}));

			// シナリオ: 10行の文書、行2が折りたたみ見出しで行3-4がhidden
			// 行7で改行を挿入 → 11行になり、旧行3-4は新行4-5にシフト
			const oldLineCount = 10;
			const hiddenLines = new Set([3, 4]);

			const oldGaps = buildCollapsedGapRanges({
				lineRanges: makeRanges(oldLineCount),
				isLineHidden: (i) => hiddenLines.has(i),
			});
			assert(
				oldGaps.length === 1 &&
					oldGaps[0]?.startLine === 3 &&
					oldGaps[0]?.endLine === 4 &&
					oldGaps[0]?.lineCount === 2,
				"改行前のgapが正しくない",
			);

			// 改行挿入: 行7の後に1行追加 → 全11行
			// collapsedHeadingLines のシフト: 行2は変更点(7)より前なのでそのまま
			// hidden行もシフト不要（変更点より前）
			const newLineCount = 11;
			const lineDelta = 1;
			const insertionPoint = 7;

			// シフト後のhidden判定
			const shiftedHidden = new Set<number>();
			for (const h of hiddenLines) {
				shiftedHidden.add(h >= insertionPoint ? h + lineDelta : h);
			}

			const newGaps = buildCollapsedGapRanges({
				lineRanges: makeRanges(newLineCount),
				isLineHidden: (i) => shiftedHidden.has(i),
			});
			assert(
				newGaps.length === 1 &&
					newGaps[0]?.startLine === 3 &&
					newGaps[0]?.endLine === 4 &&
					newGaps[0]?.lineCount === 2,
				"改行後のgapが変更点より前で変わらないはず",
			);

			// シナリオ2: 折りたたみ見出しの直前で改行挿入
			// 行1で改行 → 全11行、hidden行は3→4, 4→5にシフト
			const shiftedHidden2 = new Set<number>();
			const insertionPoint2 = 1;
			for (const h of hiddenLines) {
				shiftedHidden2.add(h >= insertionPoint2 ? h + lineDelta : h);
			}

			const newGaps2 = buildCollapsedGapRanges({
				lineRanges: makeRanges(newLineCount),
				isLineHidden: (i) => shiftedHidden2.has(i),
			});
			assert(
				newGaps2.length === 1 &&
					newGaps2[0]?.startLine === 4 &&
					newGaps2[0]?.endLine === 5 &&
					newGaps2[0]?.lineCount === 2,
				"折りたたみ前の改行でgapがシフトされない",
			);

			// シナリオ3: hidden run内部で改行 → hidden行が分断されないことを確認
			// 行3(hidden)内で改行 → 行3,4 → 行3,4,5 (全11行)
			// ただしhidden判定はrecomputeLineBlockKindsの結果に依存するので、
			// ここでは純関数レベルでhidden setが正しくシフトされた場合をテスト
			const shiftedHidden3 = new Set([3, 4, 5]); // 行3で改行→行3,4,5がhidden
			const newGaps3 = buildCollapsedGapRanges({
				lineRanges: makeRanges(newLineCount),
				isLineHidden: (i) => shiftedHidden3.has(i),
			});
			assert(
				newGaps3.length === 1 &&
					newGaps3[0]?.startLine === 3 &&
					newGaps3[0]?.endLine === 5 &&
					newGaps3[0]?.lineCount === 3,
				"hidden run内の改行でgapが拡大されない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"改行後gap整合: 変更前保持・シフト・hidden run拡大を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `折りたたみ+改行gap整合エラー: ${(error as Error).message}`,
				duration,
			});
		}
	}

	private async testSoTCollapsedDiffHelpers(): Promise<void> {
		const testName = "SoT派生ビュー: 折りたたみ差分ヘルパー関数群";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// --- shiftCollapsedHeadingLines ---
			// 見出し行そのもの(oldEnd以内)はシフトしない
			const s1 = shiftCollapsedHeadingLines(new Set([3, 7]), 3, 1);
			assert(s1.has(3), "heading at oldEnd should NOT shift");
			assert(s1.has(8), "heading after oldEnd should shift");
			assert(!s1.has(7), "old index 7 should be removed");

			// lineDelta=0 → コピーのみ
			const s2 = shiftCollapsedHeadingLines(new Set([2, 5]), 2, 0);
			assert(s2.has(2) && s2.has(5), "lineDelta=0 preserves all");

			// --- couldLineChangeBlockStructure ---
			assert(
				couldLineChangeBlockStructure("# Heading", "normal", false),
				"normal→heading should detect",
			);
			assert(
				couldLineChangeBlockStructure("plain text", "normal", true),
				"heading→normal should detect",
			);
			assert(
				!couldLineChangeBlockStructure("plain text", "normal", false),
				"normal→normal should not trigger",
			);
			assert(
				couldLineChangeBlockStructure("```js", "normal", false),
				"normal→code-fence should detect",
			);

			// --- computeCollapsedDiffRebuildRange ---
			// gap が編集範囲をまたぐケース: gap [1,4] が [2,3] にまたがる
			const r1 = computeCollapsedDiffRebuildRange({
				oldStart: 2, oldEnd: 2,
				newStart: 2, newEnd: 3,
				lineDelta: 1,
				newGapRanges: [{ startLine: 1, endLine: 5, lineCount: 5 }],
				oldGapRanges: [{ startLine: 1, endLine: 3, lineCount: 3 }],
				oldCollapsedSections: [],
				newCollapsedSections: [],
			});
			assert(
				r1.rebuildStart <= 1 && r1.rebuildEnd >= 5,
				`gap spanning edit should expand new: [${r1.rebuildStart},${r1.rebuildEnd}]`,
			);
			assert(
				r1.oldRemoveStart <= 1 && r1.oldRemoveEnd >= 3,
				`gap spanning edit should expand old: [${r1.oldRemoveStart},${r1.oldRemoveEnd}]`,
			);

			// collapsed heading section が編集行の直後に始まるケース
			const r2 = computeCollapsedDiffRebuildRange({
				oldStart: 5, oldEnd: 5,
				newStart: 5, newEnd: 5,
				lineDelta: 0,
				newGapRanges: [],
				oldGapRanges: [{ startLine: 6, endLine: 10, lineCount: 5 }],
				oldCollapsedSections: [{ headingLine: 5, sectionEnd: 10 }],
				newCollapsedSections: [],
			});
			assert(
				r2.oldRemoveEnd >= 10,
				`heading section at edit line should expand old: oldRemoveEnd=${r2.oldRemoveEnd}`,
			);
			assert(
				r2.rebuildEnd >= 10,
				`heading section at edit line should expand new: rebuildEnd=${r2.rebuildEnd}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "shiftCollapsedHeadingLines / couldLineChangeBlockStructure / computeCollapsedDiffRebuildRange 検証OK",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `折りたたみ差分ヘルパーエラー: ${(error as Error).message}`,
				duration,
			});
		}
	}

	private async testSoTScrollAnchor(): Promise<void> {
		const testName = "SoT派生ビュー: scroll anchor補正 helper";
		const startTime = performance.now();
		const rootEl = document.createElement("div");

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const setRect = (
				element: Element,
				rect: { left?: number; top?: number; width?: number; height?: number },
			) => {
				const left = rect.left ?? 0;
				const top = rect.top ?? 0;
				const width = rect.width ?? 10;
				const height = rect.height ?? 20;
				Object.defineProperty(element, "getBoundingClientRect", {
					value: () =>
						DOMRect.fromRect({
							x: left,
							y: top,
							width,
							height,
						}),
					configurable: true,
				});
			};

			setRect(rootEl, { left: 20, top: 100, height: 200, width: 200 });

			const contentEl = document.createElement("div");
			const gapEl = createCollapsedGapElement({
				startLine: 1,
				endLine: 3,
				lineCount: 3,
			});
			const firstLineEl = document.createElement("div");
			firstLineEl.className = "tategaki-sot-line";
			firstLineEl.dataset.line = "4";
			const secondLineEl = document.createElement("div");
			secondLineEl.className = "tategaki-sot-line";
			secondLineEl.dataset.line = "5";
			contentEl.append(gapEl, firstLineEl, secondLineEl);
			rootEl.appendChild(contentEl);
				document.body.appendChild(rootEl);
				setRect(gapEl, { left: 20, top: 98, height: 0, width: 0 });
				setRect(firstLineEl, {
					left: 80,
					top: 90,
					height: 60,
					width: 100,
				});
				setRect(secondLineEl, {
					left: 140,
					top: 102,
					height: 24,
					width: 100,
				});

				const topmostAnchor = captureScrollAnchor({
					containerTop: 100,
					containerBottom: 300,
					containerLeft: 20,
					candidates: [
						{ lineIndex: 4, top: 90, bottom: 150, left: 80 },
						{ lineIndex: 5, top: 102, bottom: 126, left: 140 },
					],
				});
				assert(
					topmostAnchor?.lineIndex === 4 &&
						topmostAnchor.topOffsetPx === -10 &&
						topmostAnchor.leftOffsetPx === 60,
					"captureScrollAnchor: 最上端の可視lineではなく近いlineを選んでいる",
				);

				let probeCalls = 0;
				const overlayEl = document.createElement("div");
				const viewportAnchor = captureScrollAnchorFromViewport({
					containerEl: rootEl,
					lineRootEl: contentEl,
					probeOptions: {
						rowOffsetsPx: [1],
						minColumnStepPx: 80,
						maxColumnSamples: 3,
						elementsFromPoint: (x, y) => {
							probeCalls += 1;
							if (y !== 101) return [];
							return x < 100
								? [overlayEl, firstLineEl]
								: [gapEl, secondLineEl];
						},
					},
				});
				assert(
					viewportAnchor?.lineIndex === 4 &&
						viewportAnchor.topOffsetPx === -10 &&
						viewportAnchor.leftOffsetPx === 60,
					"captureScrollAnchorFromViewport: viewport上端に最も近い可視lineを取れない",
				);
				assert(
					probeCalls === 3,
					"captureScrollAnchorFromViewport: viewport probeが先頭近傍だけで完結しない",
				);

				setRect(firstLineEl, { left: 78, top: 96, height: 24, width: 100 });
				setRect(secondLineEl, { left: 140, top: 138, height: 24, width: 100 });

				const anchor = captureScrollAnchorFromLineElements({
					containerEl: rootEl,
					lineElements: contentEl.querySelectorAll(".tategaki-sot-line"),
				});
			assert(
				anchor?.lineIndex === 4 &&
					anchor.topOffsetPx === -4 &&
					anchor.leftOffsetPx === 58,
				"captureScrollAnchor: 可視lineのアンカーを取得できない",
			);

			setRect(firstLineEl, { left: 90, top: 128, height: 24, width: 100 });
			const adjustment = computeScrollAnchorAdjustmentFromLineElement({
				anchor: {
					lineIndex: 4,
					topOffsetPx: -4,
					leftOffsetPx: 58,
				},
				containerEl: rootEl,
				resolveLineElement: (lineIndex) =>
					lineIndex === 4 ? firstLineEl : null,
			});
			assert(
				adjustment.topPx === 32 && adjustment.leftPx === 12,
				"computeScrollAnchorAdjustment: render後の差分を両軸で返さない",
			);

			const missingAdjustment = computeScrollAnchorAdjustmentFromLineElement({
				anchor: {
					lineIndex: 9,
					topOffsetPx: 0,
					leftOffsetPx: 0,
				},
				containerEl: rootEl,
				resolveLineElement: () => null,
			});
			assert(
				missingAdjustment.topPx === null &&
					missingAdjustment.leftPx === null,
				"computeScrollAnchorAdjustment: line解決失敗でnullにならない",
			);

			setRect(firstLineEl, {
				left: 78.2,
				top: 96.2,
				height: 24,
				width: 100,
			});
			const tinyAdjustment = computeScrollAnchorAdjustmentFromLineElement({
				anchor: {
					lineIndex: 4,
					topOffsetPx: -4,
					leftOffsetPx: 58,
				},
				containerEl: rootEl,
				resolveLineElement: (lineIndex) =>
					lineIndex === 4 ? firstLineEl : null,
				minAbsDeltaPx: 0.5,
			});
			assert(
				tinyAdjustment.topPx === null && tinyAdjustment.leftPx === null,
				"computeScrollAnchorAdjustment: 微小差分で補正不要判定にならない",
			);

			assert(
				shouldApplyScrollAnchorAdjustment({
					anchor,
					adjustmentPx: adjustment.topPx,
					suppressScrollRestore: false,
				}),
				"scroll anchor補正条件: 通常時に適用可と判定されない",
			);
			assert(
				!shouldApplyScrollAnchorAdjustment({
					anchor,
					adjustmentPx: adjustment.topPx,
					suppressScrollRestore: true,
				}),
				"scroll anchor補正条件: outline jump抑制中でも適用される",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"anchor取得・gap非対象・差分計算・微小差分無視・guard抑止を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `scroll anchor補正 helperエラー: ${error.message}`,
				duration,
			});
		} finally {
			rootEl.remove();
		}
	}

	private async testSoTChunkController(): Promise<void> {
		const testName = "SoT派生ビュー: chunk controller";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const lineRanges = Array.from({ length: 5 }, (_, index) => ({
				from: index,
				to: index,
			}));
			const isLineHidden = (index: number) => index === 2 || index === 3;

			const controller = new SoTChunkController();

			// 1. 初期 enabled=false
			assert(
				controller.isEnabled() === false,
				"chunk controller初期enabledがfalseでない",
			);
			const initialSnapshot = controller.getSnapshot();
			assert(
				initialSnapshot.enabled === false &&
					initialSnapshot.totalLines === 0 &&
					initialSnapshot.chunks.length === 0 &&
					initialSnapshot.version === 0,
				"chunk controller初期snapshotが不正",
			);

			// 5. OFF時でも snapshot 取得可能（描画経路とは非接続）
			controller.rebuild({ lineRanges, isLineHidden });
			const offSnapshot = controller.getSnapshot();
			assert(
				offSnapshot.enabled === false &&
					offSnapshot.totalLines === 5 &&
					offSnapshot.chunks.length === 0,
				"enabled=false時のsnapshot取得が不正",
			);

			// 2. rebuild 後 chunks 生成（enabled=true）
			controller.setEnabled(true);
			controller.rebuild({ lineRanges, isLineHidden });
			const onSnapshot = controller.getSnapshot();
			assert(
				onSnapshot.enabled === true && onSnapshot.chunks.length === 3,
				"enabled=true時にchunksが生成されない",
			);
			assert(
				onSnapshot.chunks[0]?.type === "lines" &&
					onSnapshot.chunks[1]?.type === "collapsed-gap" &&
					onSnapshot.chunks[2]?.type === "lines",
				"chunk controller生成chunkの型が不正",
			);

			// 3. findChunkIndexForLine 境界
			assert(
				controller.findChunkIndexForLine(0) === 0,
				"先頭lineのchunk indexが不正",
			);
			assert(
				controller.findChunkIndexForLine(4) === 2,
				"末尾lineのchunk indexが不正",
			);
			assert(
				controller.findChunkIndexForLine(-1) === -1,
				"範囲外（負数）lineの判定が不正",
			);
			assert(
				controller.findChunkIndexForLine(5) === -1,
				"範囲外（末尾超過）lineの判定が不正",
			);

			// 4. validate 正常系
			assert(controller.validate(), "chunk controller validateが失敗");

			// 5. ON/OFF切替後も snapshot 取得可能（描画経路は未接続）
			controller.setEnabled(false);
			controller.rebuild({ lineRanges, isLineHidden });
			const offAgainSnapshot = controller.getSnapshot();
			assert(
				offAgainSnapshot.enabled === false &&
					offAgainSnapshot.totalLines === 5,
				"ON/OFF切替後snapshotが不正",
			);
			assert(
				lineRanges.length === 5,
				"chunk controller rebuildで入力lineRangesが破壊された",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"初期OFF/再構築/境界検索/検証/ON-OFF snapshot取得の契約を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `chunk controllerエラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTChunkReadProbe(): Promise<void> {
		const testName = "SoT派生ビュー: chunk read probe";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// 1. disabled snapshot
			const disabledResult = probeChunkSnapshot(
				{
					enabled: false,
					version: 0,
					totalLines: 2,
					chunks: [
						{
							type: "lines",
							startLine: 0,
							endLine: 1,
							lineCount: 2,
						},
					],
				},
				2,
			);
			assert(
				!disabledResult.usable && disabledResult.reason === "disabled",
				"disabled snapshot の判定が不正",
			);

			// 2. invalid chunks
			const invalidResult = probeChunkSnapshot(
				{
					enabled: true,
					version: 1,
					totalLines: 2,
					chunks: [
						{
							type: "lines",
							startLine: 0,
							endLine: 0,
							lineCount: 1,
						},
						{
							type: "collapsed-gap",
							startLine: 2,
							endLine: 2,
							lineCount: 1,
						},
					],
				},
				2,
			);
			assert(
				!invalidResult.usable && invalidResult.reason === "invalid",
				"invalid chunks の判定が不正",
			);

			// 3. totalLines mismatch
			const mismatchResult = probeChunkSnapshot(
				{
					enabled: true,
					version: 2,
					totalLines: 3,
					chunks: [
						{
							type: "lines",
							startLine: 0,
							endLine: 2,
							lineCount: 3,
						},
					],
				},
				4,
			);
			assert(
				!mismatchResult.usable &&
					mismatchResult.reason === "line-mismatch",
				"totalLines mismatch の判定が不正",
			);

			// 4. 正常 snapshot
			const okResult = probeChunkSnapshot(
				{
					enabled: true,
					version: 3,
					totalLines: 4,
					chunks: [
						{
							type: "lines",
							startLine: 0,
							endLine: 1,
							lineCount: 2,
						},
						{
							type: "collapsed-gap",
							startLine: 2,
							endLine: 2,
							lineCount: 1,
						},
						{
							type: "lines",
							startLine: 3,
							endLine: 3,
							lineCount: 1,
						},
					],
				},
				4,
			);
			assert(
				okResult.usable && okResult.reason === "ok",
				"正常snapshot の判定が不正",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"disabled/invalid/line-mismatch/ok のread probe判定を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `chunk read probeエラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTNativeSelectionAssistPointerdownPolicy(): Promise<void> {
		const testName = "SoT派生ビュー: native assist pointerdown policy";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const contentDecision = decideOnPointerDown({
				ceImeMode: false,
				sourceModeEnabled: false,
				button: 0,
				onScrollbar: false,
				targetStrategy: "native-first",
			});
			assert(
				contentDecision.action === "deactivate" &&
					contentDecision.reason === "pointerdown-content",
				"通常テキストのpointerdownでnative assistがOFFにならない",
			);

			const scrollbarDecision = decideOnPointerDown({
				ceImeMode: false,
				sourceModeEnabled: false,
				button: 0,
				onScrollbar: true,
				targetStrategy: "native-first",
			});
			assert(
				scrollbarDecision.action === "activate" &&
					scrollbarDecision.reason === "pointerdown-scrollbar",
				"スクロールバーのpointerdownでnative assistがONにならない",
			);

			// selectionMode: "native-drag" + native-first → activate
			const nativeDragDecision = decideOnPointerDown({
				ceImeMode: false,
				sourceModeEnabled: false,
				button: 0,
				onScrollbar: false,
				targetStrategy: "native-first",
				selectionMode: "native-drag",
			});
			assert(
				nativeDragDecision.action === "activate" &&
					nativeDragDecision.reason === "pointerdown-content-native",
				"native-dragモードでnative-firstターゲットがactivateにならない",
			);

			// selectionMode: "native-drag" + preserve-existing → deactivate
			const nativeDragWidgetDecision = decideOnPointerDown({
				ceImeMode: false,
				sourceModeEnabled: false,
				button: 0,
				onScrollbar: false,
				targetStrategy: "preserve-existing",
				selectionMode: "native-drag",
			});
			assert(
				nativeDragWidgetDecision.action === "deactivate" &&
					nativeDragWidgetDecision.reason === "pointerdown-content",
				"native-dragモードでwidgetターゲットがdeactivateにならない",
			);

			// selectionMode: "fast-click" (明示) + native-first → deactivate
			const fastClickExplicit = decideOnPointerDown({
				ceImeMode: false,
				sourceModeEnabled: false,
				button: 0,
				onScrollbar: false,
				targetStrategy: "native-first",
				selectionMode: "fast-click",
			});
			assert(
				fastClickExplicit.action === "deactivate" &&
					fastClickExplicit.reason === "pointerdown-content",
				"fast-clickモード明示指定でdeactivateにならない",
			);
			assert(
				shouldHandleNativeSelectionMouseUpFallback({
					button: 0,
					hasPendingClick: true,
					pendingFocus: true,
					assistActive: true,
					alreadyHandled: false,
				}),
				"pending click 中の mouseup fallback が有効にならない",
			);
			assert(
				!shouldHandleNativeSelectionMouseUpFallback({
					button: 0,
					hasPendingClick: true,
					pendingFocus: true,
					assistActive: true,
					alreadyHandled: true,
				}),
				"既に終端処理済みでも mouseup fallback が走っている",
			);
			assert(
				!shouldHandleNativeSelectionMouseUpFallback({
					button: 0,
					hasPendingClick: false,
					pendingFocus: false,
					assistActive: false,
					alreadyHandled: false,
				}),
				"pending 状態がないのに mouseup fallback が走っている",
			);
			assert(
				!shouldHandleNativeSelectionMouseUpFallback({
					button: 2,
					hasPendingClick: true,
					pendingFocus: true,
					assistActive: true,
					alreadyHandled: false,
				}),
				"右クリックでも mouseup fallback が走っている",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"fast-click/native-drag両モードのpointerdown方針と mouseup fallback 条件を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `pointerdown方針エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTTypewriterEffectiveSelectionMode(): Promise<void> {
		const testName =
			"SoT Typewriter ON 時: native-drag 保存値でも pointerdown 判定が fast-click 相当になる";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// Typewriter OFF + native-drag → 保存値どおり native-drag
			assert(
				resolveEffectiveSelectionMode("native-drag", false) === "native-drag",
				"Typewriter OFF + native-drag 保存値が native-drag にならない",
			);
			// Typewriter OFF + fast-click → 保存値どおり fast-click
			assert(
				resolveEffectiveSelectionMode("fast-click", false) === "fast-click",
				"Typewriter OFF + fast-click 保存値が fast-click にならない",
			);
			// Typewriter ON + native-drag → 実効値は fast-click
			assert(
				resolveEffectiveSelectionMode("native-drag", true) === "fast-click",
				"Typewriter ON + native-drag 保存値の実効モードが fast-click にならない",
			);
			// Typewriter ON + fast-click → 従来どおり fast-click
			assert(
				resolveEffectiveSelectionMode("fast-click", true) === "fast-click",
				"Typewriter ON + fast-click 保存値が fast-click にならない",
			);

			// Typewriter ON + native-drag → pointerdown 判定が deactivate になること
			const twOnNativeDrag = decideOnPointerDown({
				ceImeMode: false,
				sourceModeEnabled: false,
				button: 0,
				onScrollbar: false,
				targetStrategy: "native-first",
				selectionMode: resolveEffectiveSelectionMode("native-drag", true),
			});
			assert(
				twOnNativeDrag.action === "deactivate" &&
					twOnNativeDrag.reason === "pointerdown-content",
				"Typewriter ON + native-drag 保存値で native assist が deactivate にならない",
			);

			// Typewriter OFF + native-drag → pointerdown 判定が activate になること（従来通り）
			const twOffNativeDrag = decideOnPointerDown({
				ceImeMode: false,
				sourceModeEnabled: false,
				button: 0,
				onScrollbar: false,
				targetStrategy: "native-first",
				selectionMode: resolveEffectiveSelectionMode("native-drag", false),
			});
			assert(
				twOffNativeDrag.action === "activate" &&
					twOffNativeDrag.reason === "pointerdown-content-native",
				"Typewriter OFF + native-drag 保存値で native assist が activate にならない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"Typewriter ON/OFF × native-drag/fast-click の実効 selection mode と pointerdown 判定を確認",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `実効 selection mode エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTSelectionOverlayTailSpacerVisibleRange(): Promise<void> {
		const testName =
			"SoT selection overlay: tail spacer表示時も通常visible rangeが最終可視行を落とさない";
		const startTime = performance.now();
		const originalElementsFromPoint = document.elementsFromPoint;
		const originalElementFromPoint = document.elementFromPoint;

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const setRect = (
				element: Element,
				rect: { left: number; top: number; width: number; height: number },
			) => {
				Object.defineProperty(element, "getBoundingClientRect", {
					value: () =>
						DOMRect.fromRect({
							x: rect.left,
							y: rect.top,
							width: rect.width,
							height: rect.height,
						}),
					configurable: true,
				});
			};

			Object.defineProperty(document, "elementsFromPoint", {
				value: () => [],
				configurable: true,
			});
			Object.defineProperty(document, "elementFromPoint", {
				value: () => null,
				configurable: true,
			});

			const rootEl = document.createElement("div");
			rootEl.style.writingMode = "horizontal-tb";
			setRect(rootEl, { left: 0, top: 0, width: 200, height: 100 });
			const contentEl = document.createElement("div");
			setRect(contentEl, { left: 0, top: 0, width: 200, height: 220 });
			const selectionLayerEl = document.createElement("div");
			const lineRects = [
				{ left: 0, top: -70, width: 200, height: 20 },
				{ left: 0, top: -35, width: 200, height: 20 },
				{ left: 0, top: 15, width: 200, height: 20 },
				{ left: 0, top: 55, width: 200, height: 20 },
			];
			const lineEls = lineRects.map((rect, index) => {
				const lineEl = document.createElement("div");
				lineEl.className = "tategaki-sot-line";
				lineEl.dataset.line = String(index);
				setRect(lineEl, rect);
				contentEl.appendChild(lineEl);
				return lineEl;
			});
			rootEl.append(contentEl, selectionLayerEl);
			document.body.appendChild(rootEl);

			const lineRanges: LineRange[] = [
				{ from: 0, to: 10 },
				{ from: 10, to: 20 },
				{ from: 20, to: 30 },
				{ from: 30, to: 40 },
			];
			const overlay = new SoTSelectionOverlay({
				getDerivedRootEl: () => rootEl,
				getDerivedContentEl: () => contentEl,
				getSelectionLayerEl: () => selectionLayerEl,
				getSotEditor: () =>
					({
						getSelection: () => ({ anchor: 0, head: 40 }),
					}) as SoTEditor,
				isCeImeMode: () => false,
				isNativeSelectionEnabled: () => false,
				ensureLineRendered: () => undefined,
				getPendingSelectionState: () => ({
					pendingText: "",
					pendingSelectionFrom: null,
				}),
				getLineRanges: () => lineRanges,
				findLineIndex: (offset) => {
					const index = lineRanges.findIndex(
						(range) => offset >= range.from && offset <= range.to,
					);
					return index >= 0 ? index : null;
				},
				getLineElement: (lineIndex) => lineEls[lineIndex] ?? null,
				getLineVisualRects: (lineEl) => [lineEl.getBoundingClientRect()],
				getLineTextNodes: () => [],
				findTextNodeAtOffset: () => null,
				isPointerSelecting: () => false,
				isAutoScrollSelecting: () => false,
			});

			overlay.updateSelectionOverlay();
			assert(
				selectionLayerEl.children.length === 2,
				"hit-testがtail spacerに落ちる状態で可視最終行のoverlayが描画されない",
			);

			rootEl.remove();
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "通常visible rangeがline rect交差で末尾可視行を補完します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `selection overlay tail spacer エラー: ${error.message}`,
				duration,
			});
		} finally {
			Object.defineProperty(document, "elementsFromPoint", {
				value: originalElementsFromPoint,
				configurable: true,
			});
			Object.defineProperty(document, "elementFromPoint", {
				value: originalElementFromPoint,
				configurable: true,
			});
		}
	}

	private async testSoTTailSpacerPointerSnapIsFinalLineOnly(): Promise<void> {
		const testName =
			"SoT pointer: tail spacer補正は最終lineのblock-end側だけに限定される";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const lineRect = DOMRect.fromRect({
				x: 40,
				y: 20,
				width: 30,
				height: 80,
			});
			assert(
				shouldSnapSoTTailSpacerPointerToDocumentEnd({
					writingMode: "horizontal-tb",
					lineIndex: 2,
					totalLines: 3,
					pointerClientX: 50,
					pointerClientY: 104,
					lineRect,
				}),
				"horizontal-tbの最終line下側tail spacerで末尾snapしない",
			);
			assert(
				!shouldSnapSoTTailSpacerPointerToDocumentEnd({
					writingMode: "horizontal-tb",
					lineIndex: 1,
					totalLines: 3,
					pointerClientX: 50,
					pointerClientY: 104,
					lineRect,
				}),
				"最終line以外にもtail spacer snapが広がっている",
			);
			assert(
				!shouldSnapSoTTailSpacerPointerToDocumentEnd({
					writingMode: "horizontal-tb",
					lineIndex: 2,
					totalLines: 3,
					pointerClientX: 50,
					pointerClientY: 80,
					lineRect,
				}),
				"最終line内のpointerまで末尾snapしている",
			);
			assert(
				shouldSnapSoTTailSpacerPointerToDocumentEnd({
					writingMode: "vertical-rl",
					lineIndex: 2,
					totalLines: 3,
					pointerClientX: 36,
					pointerClientY: 60,
					lineRect,
				}),
				"vertical-rlの左側tail spacerで末尾snapしない",
			);
			assert(
				!shouldSnapSoTTailSpacerPointerToDocumentEnd({
					writingMode: "vertical-rl",
					lineIndex: 2,
					totalLines: 3,
					pointerClientX: 72,
					pointerClientY: 60,
					lineRect,
				}),
				"vertical-rlのline内/逆側pointerまで末尾snapしている",
			);
			assert(
				shouldSnapSoTTailSpacerPointerToDocumentEnd({
					writingMode: "vertical-lr",
					lineIndex: 2,
					totalLines: 3,
					pointerClientX: 74,
					pointerClientY: 60,
					lineRect,
				}),
				"vertical-lrの右側tail spacerで末尾snapしない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "pointer補正が最終line / tail spacer方向に限定されています",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `tail spacer pointer snap エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTLineElementContract(): Promise<void> {
		const testName = "SoT派生ビュー: line element意味論契約";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const contentEl = document.createElement("div");
			const frontmatterEl = document.createElement("div");
			frontmatterEl.className = "tategaki-frontmatter";
			const firstLineEl = document.createElement("div");
			firstLineEl.className = "tategaki-sot-line";
			firstLineEl.dataset.line = "0";
			const gapEl = createCollapsedGapElement({
				startLine: 1,
				endLine: 3,
				lineCount: 3,
			});
			const visibleAfterGapEl = document.createElement("div");
			visibleAfterGapEl.className = "tategaki-sot-line";
			visibleAfterGapEl.dataset.line = "4";
			contentEl.append(frontmatterEl, firstLineEl, gapEl, visibleAfterGapEl);

			const missingEl = resolveLineElementFromChildren(
				contentEl.children,
				9,
				1,
			);
			assert(
				missingEl === null,
				"getLineElement意味論: 存在しない行DOMでnullを返さない",
			);

			const hiddenLineEl = resolveLineElementFromChildren(
				contentEl.children,
				2,
				1,
			);
			assert(
				hiddenLineEl === null,
				"getLineElement意味論: collapsed gap内のhidden行でnullを返さない",
			);

			const shiftedVisibleEl = resolveLineElementFromChildren(
				contentEl.children,
				4,
				1,
			);
			assert(
				shiftedVisibleEl === visibleAfterGapEl,
				"getLineElement意味論: gap後の可視行を実装詳細に依存せず解決できない",
			);

			const nonVirtualLine = document.createElement("div");
			nonVirtualLine.dataset.virtual = "0";
			nonVirtualLine.dataset.line = "0";
			const nonVirtualResult = resolveEnsureLineRenderedTargetIndex(
				nonVirtualLine,
				[{ from: 0, to: 0 }],
			);
			assert(
				nonVirtualResult === null,
				"ensureLineRendered意味論: 実体化済み行でno-opにならない",
			);

			const gapEnsureResult = resolveEnsureLineRenderedTargetIndex(
				gapEl,
				[{ from: 0, to: 0 }],
			);
			assert(
				gapEnsureResult === null,
				"ensureLineRendered意味論: collapsed gapに対して安全returnにならない",
			);

			const virtualLine = document.createElement("div");
			virtualLine.dataset.virtual = "1";
			virtualLine.dataset.line = "0";
			const lineRanges = [{ from: 0, to: 0 }];
			const firstResult = resolveEnsureLineRenderedTargetIndex(
				virtualLine,
				lineRanges,
			);
			const secondResult = resolveEnsureLineRenderedTargetIndex(
				virtualLine,
				lineRanges,
			);
			assert(
				firstResult === 0 && secondResult === 0,
				"ensureLineRendered意味論: 同一virtual行への判定が安定しない",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"hidden行null・gap後の可視行解決・実体化済みno-op・virtual判定idempotent",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `line element意味論契約エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testVersionCompare(): Promise<void> {
		const testName = "更新チェック: SemVer比較";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			assert(compareSemver("1.1.0", "1.0.0") === 1, "1.1.0 > 1.0.0 でない");
			assert(compareSemver("1.1.0", "1.1.0") === 0, "1.1.0 == 1.1.0 でない");
			assert(compareSemver("1.1.0", "1.1.1") === -1, "1.1.0 < 1.1.1 でない");
			assert(compareSemver("v1.1.0", "1.1.0") === 0, "v1.1.0 が解釈できない");
			assert(
				compareSemver("1.1.0-beta.1", "1.1.0") === -1,
				"プレリリースが本リリースより低くない"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "SemVer比較が正常",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SemVer比較エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testPagedReadingModePaginationMath(): Promise<void> {
		const testName = "書籍モード: ページ計算(数式) - 縦スクロール方式";
		const startTime = performance.now();

		try {
			const viewportHeight = 800;
			const pageGap = 24;
			const pages = 10;
			const scrollHeight = pages * (viewportHeight + pageGap);

			const count = calculatePagedPageCount(scrollHeight, viewportHeight, pageGap);
			if (count !== pages) {
				throw new Error(`ページ数が不正: expected=${pages}, actual=${count}`);
			}

			const scroll0 = calculatePagedScrollTop(0, viewportHeight, pageGap);
			const scrollLast = calculatePagedScrollTop(pages - 1, viewportHeight, pageGap);
			const expectedLast = (pages - 1) * (viewportHeight + pageGap);

			if (scroll0 !== 0) {
				throw new Error(`最初のページのスクロール位置が不正: expected=0, actual=${scroll0}`);
			}
			if (scrollLast !== expectedLast) {
				throw new Error(
					`最後のページのスクロール位置が不正: expected=${expectedLast}, actual=${scrollLast}`
				);
			}

			const countRounded = calculatePagedPageCount(
				scrollHeight + 0.4,
				viewportHeight,
				pageGap
			);
			if (countRounded !== pages) {
				throw new Error(
					`端数スクロール高さでページ数が不正: expected=${pages}, actual=${countRounded}`
				);
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "ページ数/スクロール位置の算出が正常",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `ページ計算エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testPagedReadingModePopoutEventTargets(): Promise<void> {
		const testName = "書籍モード: popout realm の event target を要素解決できる";
		const startTime = performance.now();
		const globalScope = globalThis;
		const originalElement = Reflect.get(globalScope, "Element");

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const mainWindow = this.createHappyDomWindow();
			const popoutWindow = new Window();
			const popoutDoc = popoutWindow.document as unknown as globalThis.Document;
			Reflect.set(globalScope, "Element", mainWindow.Element);
			const mainRealmElement = Reflect.get(
				globalScope,
				"Element"
			) as typeof Element;

			const container = popoutDoc.createElement("div") as unknown as HTMLElement;
			const inner = popoutDoc.createElement("div") as unknown as HTMLElement;
			const textNode = popoutDoc.createTextNode("本文");
			inner.appendChild(textNode);
			container.appendChild(inner);

			assert(
				!(inner instanceof mainRealmElement),
				"テスト前提エラー: popout 要素が main realm の Element に一致しています"
			);
			assert(
				resolveEventTargetElement(inner) === inner,
				"popout 要素をそのまま解決できません"
			);
			assert(
				resolveEventTargetElement(textNode) === inner,
				"text target から親要素を解決できません"
			);
			assert(
				resolveEventTargetElement(popoutWindow as unknown as EventTarget) === null,
				"window target は null を返すべきです"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "別 realm の要素と text target を wheel 判定向けに解決できます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `popout event target テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			Reflect.set(globalScope, "Element", originalElement);
		}
	}

	private async testPagedReadingModeFrontmatterCoverStaging(): Promise<void> {
		const testName = "書籍モード: frontmatter 表紙を live 先出しし本文は commit 後に反映";
		const startTime = performance.now();
		const globalScope = globalThis as unknown as Record<string, unknown>;
		const originalRequestAnimationFrame = globalScope.requestAnimationFrame;
		const originalCancelAnimationFrame = globalScope.cancelAnimationFrame;
		const prototype = PagedReadingMode.prototype as unknown as Record<string, unknown>;
		const originalSplitContentIntoPages = prototype["splitContentIntoPages"];
		let pagedReadingMode: PagedReadingMode | null = null;

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			globalScope.requestAnimationFrame =
				window.requestAnimationFrame.bind(window);
			globalScope.cancelAnimationFrame =
				window.cancelAnimationFrame.bind(window);

			const container = doc.createElement("div") as unknown as HTMLElement;
			container.style.width = "800px";
			container.style.height = "600px";
			container.getBoundingClientRect = () =>
				({
					x: 0,
					y: 0,
					top: 0,
					left: 0,
					right: 800,
					bottom: 600,
					width: 800,
					height: 600,
					toJSON: () => ({}),
				}) as DOMRect;
			doc.body.appendChild(container);

			let resolveSplitStarted = () => {};
			const splitStarted = new Promise<void>((resolve) => {
				resolveSplitStarted = () => resolve();
			});
			let releasePagination = () => {};
			const paginationGate = new Promise<void>((resolve) => {
				releasePagination = () => resolve();
			});
			let liveKindsDuringSplit = "";
			let liveHtmlDuringSplit = "";
			let onPageAddedCount = 0;
			let onRenderedCount = 0;

			prototype["splitContentIntoPages"] = async function (): Promise<void> {
				const self = this as unknown as {
					pagesContainerEl: HTMLElement | null;
					createFrontmatterCoverPage(index: number): HTMLElement;
					createPageElement(index: number): HTMLElement;
					commitPageElements(container: HTMLElement | null, pages: HTMLElement[]): void;
					notifyCommittedPages(pages: HTMLElement[]): void;
				};
				const liveContainer = self.pagesContainerEl;
				liveKindsDuringSplit = Array.from(
					liveContainer?.children ?? []
				)
					.map((page) =>
						(page as HTMLElement).getAttribute("data-page-kind") ??
						"body"
					)
					.join(",");
				liveHtmlDuringSplit = liveContainer?.innerHTML ?? "";
				resolveSplitStarted();
				await paginationGate;

				const coverPage = self.createFrontmatterCoverPage(0);
				const titlePage = self.createPageElement(1);
				titlePage.setAttribute("data-page-kind", "title-page");
				const titleWrapper = titlePage.querySelector(
					".page-content"
				) as HTMLElement | null;
				if (titleWrapper) {
					titleWrapper.innerHTML = "<h1>第一章</h1>";
				}

				self.commitPageElements(liveContainer, [coverPage, titlePage]);
				self.notifyCommittedPages([coverPage, titlePage]);
			};

			pagedReadingMode = new PagedReadingMode({
				container,
				contentHtml:
					'<div class="tategaki-reading-view-snapshot"><h1>第一章</h1><p>本文</p></div>',
				frontmatterCoverHtml:
					'<div class="tategaki-frontmatter-cover-snapshot"><p>表紙</p></div>',
				writingMode: "vertical-rl",
				settings: { ...DEFAULT_V2_SETTINGS.common },
				previewSettings: {
					...DEFAULT_V2_SETTINGS.preview,
					pageTransitionEffect: "none",
				},
				onPageAdded: () => {
					onPageAddedCount += 1;
				},
				onRendered: () => {
					onRenderedCount += 1;
				},
			});

			await Promise.race([
				splitStarted,
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("split 開始待ちがタイムアウトしました")), 300)
				),
			]);

			assert(
				liveKindsDuringSplit === "frontmatter-cover",
				`split 中の live page kind が不正: ${liveKindsDuringSplit}`
			);
			assert(
				liveHtmlDuringSplit.includes("表紙"),
				`frontmatter 表紙が split 前に見えていません: ${liveHtmlDuringSplit}`
			);
			assert(
				!liveHtmlDuringSplit.includes("第一章"),
				`本文/章扉が split 中に live へ出ています: ${liveHtmlDuringSplit}`
			);
			assert(
				onPageAddedCount === 0,
				`staging 中に onPageAdded が発火しています: ${onPageAddedCount}`
			);
			assert(
				onRenderedCount === 0,
				`staging 中に onRendered が発火しています: ${onRenderedCount}`
			);

			releasePagination();
			await new Promise((resolve) => setTimeout(resolve, 120));

			const liveKindsAfterCommit = Array.from(
				container.querySelectorAll<HTMLElement>(
					".tategaki-reading-paged-pages-container > .tategaki-page"
				)
			)
				.map((page) => page.getAttribute("data-page-kind") ?? "body")
				.join(",");
			assert(
				liveKindsAfterCommit === "frontmatter-cover,title-page",
				`commit 後の live page kind が不正: ${liveKindsAfterCommit}`
			);
			assert(
				onPageAddedCount === 2,
				`commit 後の onPageAdded 回数が不正: ${onPageAddedCount}`
			);
			assert(
				onRenderedCount === 1,
				`commit 後の onRendered 回数が不正: ${onRenderedCount}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"frontmatter cover は split 完了前に live 表示され、callback は commit 後のみ発火します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `frontmatter staging テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			prototype["splitContentIntoPages"] = originalSplitContentIntoPages;
			globalScope.requestAnimationFrame = originalRequestAnimationFrame;
			globalScope.cancelAnimationFrame = originalCancelAnimationFrame;
			pagedReadingMode?.destroy();
		}
	}

	private async testPagedReadingModeQueuedNavigationDuringPagination(): Promise<void> {
		const testName = "書籍モード: ページ分割中でも公開済みページへ移動予約できる";
		const startTime = performance.now();
		const globalScope = globalThis as unknown as Record<string, unknown>;
		const originalRequestAnimationFrame = globalScope.requestAnimationFrame;
		const originalCancelAnimationFrame = globalScope.cancelAnimationFrame;
		const paginationPrototype = MeasuredPagination.prototype as unknown as Record<string, unknown>;
		const originalPaginate = paginationPrototype["paginate"];
		let pagedReadingMode: PagedReadingMode | null = null;

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			globalScope.requestAnimationFrame =
				window.requestAnimationFrame.bind(window);
			globalScope.cancelAnimationFrame =
				window.cancelAnimationFrame.bind(window);

			const container = doc.createElement("div") as unknown as HTMLElement;
			container.style.width = "800px";
			container.style.height = "600px";
			container.getBoundingClientRect = () =>
				({
					x: 0,
					y: 0,
					top: 0,
					left: 0,
					right: 800,
					bottom: 600,
					width: 800,
					height: 600,
					toJSON: () => ({}),
				}) as DOMRect;
			doc.body.appendChild(container);

			const makePage = (text: string): HTMLElement => {
				const page = doc.createElement("div") as unknown as HTMLElement;
				page.className = "tategaki-page";
				const wrapper = doc.createElement("div") as unknown as HTMLElement;
				wrapper.className = "page-content";
				wrapper.innerHTML = `<p>${text}</p>`;
				page.appendChild(wrapper);
				return page;
			};

			paginationPrototype["paginate"] = async function (): Promise<unknown[]> {
				const self = this as unknown as { options?: { onPage?: (pageInfo: { element: HTMLElement; startIndex: number; endIndex: number; charCount: number }) => void } };
				const onPage = self.options?.onPage as
					| ((pageInfo: { element: HTMLElement; startIndex: number; endIndex: number; charCount: number }) => void)
					| undefined;
				const pages = [
					{
						element: makePage("本文1"),
						startIndex: 0,
						endIndex: 10,
						charCount: 10,
					},
					{
						element: makePage("本文2"),
						startIndex: 10,
						endIndex: 20,
						charCount: 10,
					},
				];
				await new Promise((resolve) => setTimeout(resolve, 40));
				onPage?.(pages[0]);
				await new Promise((resolve) => setTimeout(resolve, 40));
				onPage?.(pages[1]);
				return pages;
			};

			let latestPageChange:
				| {
						currentPage: number;
						totalPages: number;
						progress: number;
				}
				| null = null;

			pagedReadingMode = new PagedReadingMode({
				container,
				contentHtml:
					'<div class="tategaki-reading-view-snapshot"><p>本文です。</p></div>',
				frontmatterCoverHtml:
					'<div class="tategaki-frontmatter-cover-snapshot"><p>表紙</p></div>',
				writingMode: "vertical-rl",
				settings: { ...DEFAULT_V2_SETTINGS.common },
				previewSettings: {
					...DEFAULT_V2_SETTINGS.preview,
					pageTransitionEffect: "none",
				},
				onPageChange: (info) => {
					latestPageChange = info;
				},
			});

			await Promise.race([
				new Promise<void>((resolve) => {
					const poll = () => {
						if ((pagedReadingMode as unknown as Record<string, unknown>)?.paginationInProgress) {
							resolve();
							return;
						}
						setTimeout(poll, 5);
					};
					poll();
				}),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("paginationInProgress 待ちがタイムアウトしました")),
						300
					)
				),
			]);
			pagedReadingMode.scrollToPage(1, false);
			await new Promise((resolve) => setTimeout(resolve, 80));

			if (!latestPageChange) {
				throw new Error("onPageChange が発火していません");
			}
			const pageChange = latestPageChange as {
				currentPage: number;
				totalPages: number;
				progress: number;
			};
			assert(
				pageChange.currentPage === 1,
				`公開済みページへの移動予約が反映されていません: ${JSON.stringify(latestPageChange)}`
			);
			assert(
				container.querySelectorAll(
					'.tategaki-reading-paged-pages-container > .tategaki-page'
				).length >= 2,
				"ページ分割中に live へ公開済みページが追加されていません"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"cover 表示中でも、完成済みページが公開され次第そのページへ移動できます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `ページ移動予約テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			paginationPrototype["paginate"] = originalPaginate;
			globalScope.requestAnimationFrame = originalRequestAnimationFrame;
			globalScope.cancelAnimationFrame = originalCancelAnimationFrame;
			pagedReadingMode?.destroy();
		}
	}

	private createHappyDomWindow(): Window {
		const window = new Window();
		const globalScope = globalThis as unknown as Record<string, unknown>;

		globalScope.Node = window.Node;
		globalScope.NodeFilter = window.NodeFilter;
		globalScope.HTMLElement = window.HTMLElement;
		globalScope.Text = window.Text;

		return window;
	}

	private async testBookModeConsecutiveTitlePages(): Promise<void> {
		const testName = "書籍モード: 連続章扉で空 body segment を作らない";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			const html = [
				'<div class="tiptap ProseMirror">',
				'<h1 data-tategaki-title-page="true">第一章</h1>',
				"<p><br></p>",
				'<h2 data-tategaki-title-page="true">第一節</h2>',
				"<p>　</p>",
				'<h3 data-tategaki-title-page="true">第三項</h3>',
				"<p>本文</p>",
				"</div>",
			].join("");

			const segments = splitIntoBookSegments(html, doc);
			const kinds = segments.map((segment) => segment.kind);
			assert(
				kinds.join(",") === "title-page,title-page,title-page,body",
				`segment 順序が不正: ${kinds.join(",")}`
			);

			const bodySegments = segments.filter(
				(segment): segment is { kind: "body"; html: string } =>
					segment.kind === "body"
			);
			assert(bodySegments.length === 1, `body segment 数が不正: ${bodySegments.length}`);
			const bodyHtml = bodySegments[0]?.html ?? "";
			assert(
				!bodyHtml.includes("<p><br></p>"),
				"空段落が body segment に残っています"
			);
			assert(
				bodyHtml.includes("<p>本文</p>"),
				`本文が body segment に残っていません: ${bodyHtml}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "連続章扉でも空 body segment は生成されない",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `連続章扉テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testBookModeMarkdownBlankLineMarkersBetweenTitlePages(): Promise<void> {
		const testName = "書籍モード: Markdown 空行マーカーが章扉間 body を作らない";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const markdown = [
				"## 上　先生と私",
				"",
				"### 一",
				"",
				"　私《わたくし》はその人を常に先生と呼んでいた",
			].join("\n");
			const normalized = normalizeMarkdownForTipTap(
				protectIndentation(markdown)
			);

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			const proseMirror = doc.createElement("div");
			proseMirror.className = "tiptap ProseMirror";
			proseMirror.innerHTML = normalized;
			proseMirror
				.querySelectorAll<HTMLElement>("h2, h3")
				.forEach((heading) => heading.setAttribute("data-tategaki-title-page", "true"));

			const wrapper = doc.createElement("div");
			wrapper.className = "tategaki-reading-view-snapshot";
			wrapper.appendChild(proseMirror);

			const segments = splitIntoBookSegments(wrapper.innerHTML, doc);
			const kinds = segments.map((segment) => segment.kind);
			assert(
				kinds.join(",") === "title-page,title-page,body",
				`segment 順序が不正: ${kinds.join(",")}`
			);

			const bodySegment = segments.find(
				(segment): segment is { kind: "body"; html: string } =>
					segment.kind === "body"
			);
			const bodyHtml = bodySegment?.html ?? "";
			assert(!!bodyHtml, "本文 segment が生成されていません");
			assert(
				!bodyHtml.includes("\u2060"),
				`空行マーカーが body segment に残っています: ${JSON.stringify(bodyHtml)}`
			);
			assert(
				bodyHtml.includes("先生と呼んでいた"),
				`本文が body segment に残っていません: ${bodyHtml}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Markdown 空行マーカーは章扉間 body として残らない",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `Markdown 空行マーカーテスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testBookModeConsecutiveTitlePageNormalization(): Promise<void> {
		const testName = "書籍モード: title-page -> empty body -> title-page を正規化で落とす";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			const segments = normalizeConsecutiveTitlePageSegments(
				[
					{
						kind: "title-page",
						headingTag: "h1",
						headingInnerHtml: "第一章",
					},
					{
						kind: "body",
						html: "<p><br></p>",
					},
					{
						kind: "title-page",
						headingTag: "h2",
						headingInnerHtml: "第二章",
					},
				],
				doc
			);

			assert(segments.length === 2, `正規化後 segment 数が不正: ${segments.length}`);
			assert(
				segments[0]?.kind === "title-page" && segments[1]?.kind === "title-page",
				`正規化後の kind が不正: ${segments.map((segment) => segment.kind).join(",")}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "連続章扉の空 body segment を専用正規化で除去できる",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `章扉正規化テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testBookModeNestedTitlePagesPruneEmptyBodies(): Promise<void> {
		const testName = "書籍モード: nested 章扉除去後の空ラッパーを body に戻さない";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			const html = [
				'<div class="outer">',
				'<div class="callout"><h1 data-tategaki-title-page="true">第一章</h1><p><br></p></div>',
				'<div class="callout"><h2 data-tategaki-title-page="true">第二章</h2><p></p></div>',
				'<div class="callout"><p>本文</p></div>',
				"</div>",
			].join("");

			const segments = splitIntoBookSegments(html, doc);
			const kinds = segments.map((segment) => segment.kind);
			assert(
				kinds.join(",") === "title-page,title-page,body",
				`nested segment 順序が不正: ${kinds.join(",")}`
			);

			const bodySegment = segments.find(
				(segment): segment is { kind: "body"; html: string } =>
					segment.kind === "body"
			);
			const nestedBodyHtml = bodySegment?.html ?? "";
			assert(!!nestedBodyHtml, "本文 segment が生成されていません");
			assert(
				!nestedBodyHtml.includes("<p><br></p>") &&
					!nestedBodyHtml.includes("<p></p>"),
				`空段落が nested body に残っています: ${nestedBodyHtml}`
			);
			assert(
				nestedBodyHtml.includes("<p>本文</p>"),
				`本文が nested body に残っていません: ${nestedBodyHtml}`
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "nested wrapper の空 body segment を抑止できる",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `nested 章扉テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testBookModeVisibleContentClassification(): Promise<void> {
		const testName = "書籍モード: 空判定 helper がゼロ幅スペースと非テキストを識別する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			assert(
				!htmlHasVisibleContent("<p> \n\u3000&nbsp;\u200B\u200C\u200D\u2060\uFEFF</p>", doc),
				"空白だけの HTML を可視コンテンツとして扱っています"
			);
			assert(
				htmlHasVisibleContent('<p><img src="cover.png" alt=""></p>', doc),
				"画像だけの HTML を可視コンテンツとして扱えていません"
			);
			assert(
				htmlHasVisibleContent("<hr>", doc),
				"HR を可視コンテンツとして扱えていません"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "空判定 helper が期待通り",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `空判定 helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testMeasuredPaginationPrunesNestedPageBreakHeadingGhost(): Promise<void> {
		const testName =
			"書籍モード: frontmatter 後ろの入れ子改ページ見出しゴーストを除去する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;
			const container = doc.createElement("div") as unknown as HTMLElement;
			doc.body.appendChild(container);

			const pagination = new MeasuredPagination({
				container,
				contentHtml: "",
				writingMode: "vertical-rl",
				pageWidth: 800,
				pageHeight: 600,
				paddingTop: 0,
				paddingBottom: 0,
				paddingLeft: 0,
				paddingRight: 0,
			});

			const wrapper = doc.createElement("div");
			wrapper.innerHTML = [
				'<div class="tategaki-reading-view-snapshot">',
				'<div class="tategaki-frontmatter">',
				'<h1 class="tategaki-frontmatter-title">表題</h1>',
				"</div>",
				'<div class="tiptap ProseMirror">',
				'<h1 data-tategaki-page-break-before="true"></h1>',
				"</div>",
				"</div>",
			].join("");

			(
				pagination as unknown as {
					pruneTrailingEmptyPageBreakHeadings: (
						element: HTMLElement,
					) => void;
				}
			).pruneTrailingEmptyPageBreakHeadings(wrapper);

			const html = wrapper.innerHTML;
			assert(
				html.includes("tategaki-frontmatter-title"),
				`frontmatter が失われています: ${html}`,
			);
			assert(
				!html.includes("data-tategaki-page-break-before"),
				`改ページ見出しゴーストが残っています: ${html}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "入れ子になった空の改ページ見出しゴーストを除去できる",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `改ページ見出しゴースト除去テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testMeasuredPaginationVisibleOnlyPages(): Promise<void> {
		const testName = "書籍モード: paginator が空ページを落とし画像-only を保持する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) {
					throw new Error(message);
				}
			};

			const window = this.createHappyDomWindow();
			const doc = window.document as unknown as globalThis.Document;

			const emptyHost = doc.createElement("div") as unknown as HTMLElement;
			doc.body.appendChild(emptyHost);
			const emptyPagination = new MeasuredPagination({
				container: emptyHost,
				contentHtml: "<p>\u200B</p>",
				writingMode: "horizontal-tb",
				pageWidth: 800,
				pageHeight: 600,
				paddingTop: 0,
				paddingBottom: 0,
				paddingLeft: 0,
				paddingRight: 0,
			});
			const emptyPages = await emptyPagination.paginate();
			assert(
				emptyPages.length === 0,
				`ゼロ幅スペースだけのページが残っています: ${emptyPages.length}`
			);

			const imageHost = doc.createElement("div") as unknown as HTMLElement;
			doc.body.appendChild(imageHost);
			const imagePagination = new MeasuredPagination({
				container: imageHost,
				contentHtml: '<p><img src="cover.png" alt=""></p>',
				writingMode: "horizontal-tb",
				pageWidth: 800,
				pageHeight: 600,
				paddingTop: 0,
				paddingBottom: 0,
				paddingLeft: 0,
				paddingRight: 0,
			});
			const imagePages = await imagePagination.paginate();
			assert(imagePages.length === 1, `画像-only ページ数が不正: ${imagePages.length}`);
			assert(
				!!imagePages[0].element.querySelector("img"),
				"画像-only ページの内容が失われています"
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "paginator の空ページ判定が期待通り",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `paginator 空判定テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	/**
	 * 設定バリデーションのテスト
	 */
	private async testSettingsValidation(): Promise<void> {
		const testName = "設定バリデーション";
		const startTime = performance.now();
		
		try {
			const merged = validateV2Settings({
				common: {
					fontSize: 20,
					lineHeight: 1.6,
					rubySize: 0.7,
				},
				wysiwyg: {
					autoSave: false,
				},
			});
			
			if (merged.common.fontSize !== 20) {
				throw new Error("共通設定のマージに失敗");
			}
			if (merged.wysiwyg.autoSave !== false) {
				throw new Error("WYSIWYG設定のマージに失敗");
			}
			if (Math.abs(merged.common.rubySize - 0.7) > 0.001) {
				throw new Error("ルビサイズ設定の反映に失敗");
			}
			
			const customTheme = {
				id: "custom-test",
				name: "カスタムテーマ",
				description: "テスト追加テーマ",
				settings: {
					fontFamily: "Test Font",
					fontSize: 18,
					lineHeight: 1.8,
					colors: {
						text: "#111111",
						background: "#ffffff",
						pageBackground: "#f0f0f0",
						accent: "#ff0000",
					},
					spacing: {
						paragraphSpacing: 1,
						headingSpacing: 2,
					},
				},
			};
			const themed = validateV2Settings({
				themes: [customTheme],
				activeTheme: "custom-test",
			});
			
			const hasCustomTheme = themed.themes.some((theme) => theme.id === "custom-test");
			if (!hasCustomTheme) {
				throw new Error("テーマリストへのマージに失敗");
			}
			if (themed.activeTheme !== "custom-test") {
				throw new Error("アクティブテーマの更新に失敗");
			}

			// sotSelectionMode バリデーション: 不正値はデフォルトにフォールバック
			const invalidMode = validateV2Settings({
				wysiwyg: { sotSelectionMode: "invalid-value" as never },
			});
			if (invalidMode.wysiwyg.sotSelectionMode !== "fast-click") {
				throw new Error(
					"sotSelectionModeの不正値がデフォルト（fast-click）にフォールバックしない",
				);
			}
			// sotSelectionMode バリデーション: 有効値は保持
			const validMode = validateV2Settings({
				wysiwyg: { sotSelectionMode: "native-drag" },
			});
			if (validMode.wysiwyg.sotSelectionMode !== "native-drag") {
				throw new Error("sotSelectionModeの有効値native-dragが保持されない");
			}

			const correctedAutoTcyDigits = validateV2Settings({
				wysiwyg: {
					autoTcyMinDigits: 0,
					autoTcyMaxDigits: 9,
				},
			});
			if (correctedAutoTcyDigits.wysiwyg.autoTcyMinDigits !== 1) {
				throw new Error("autoTcyMinDigits の下限補正に失敗");
			}
			if (correctedAutoTcyDigits.wysiwyg.autoTcyMaxDigits !== 4) {
				throw new Error("autoTcyMaxDigits の上限補正に失敗");
			}

			const swappedAutoTcyDigits = validateV2Settings({
				wysiwyg: {
					autoTcyMinDigits: 4,
					autoTcyMaxDigits: 1,
				},
			});
			if (swappedAutoTcyDigits.wysiwyg.autoTcyMinDigits !== 1) {
				throw new Error("autoTcyMinDigits の min > max 補正に失敗");
			}
			if (swappedAutoTcyDigits.wysiwyg.autoTcyMaxDigits !== 4) {
				throw new Error("autoTcyMaxDigits の min > max 補正に失敗");
			}

			const invalidAutoTcyDigitsOnly = validateV2Settings({
				wysiwyg: {
					autoTcyDigitsOnly: "true" as never,
				},
			});
			if (invalidAutoTcyDigitsOnly.wysiwyg.autoTcyDigitsOnly !== false) {
				throw new Error("autoTcyDigitsOnly の不正値が false に補正されない");
			}

			const validAutoTcyDigitsOnly = validateV2Settings({
				wysiwyg: {
					autoTcyDigitsOnly: true,
				},
			});
			if (validAutoTcyDigitsOnly.wysiwyg.autoTcyDigitsOnly !== true) {
				throw new Error("autoTcyDigitsOnly の有効値 true が保持されない");
			}

			const forcedFrontmatterMode =
				resolveEffectiveBookFrontmatterDisplayMode({
					bookFrontmatterDisplayMode: "inline",
					bookHeadingPaginationMode: "title-page",
					bookHeadingPaginationLevel: 2,
					bookPageBreakBeforeHeadingLevel: 0,
					syncCursor: true,
					updateInterval: 300,
				});
			if (forcedFrontmatterMode !== "separate-page") {
				throw new Error("章扉モード時にフロントマター表示方式が独立ページへ強制されない");
			}

			const normalFrontmatterMode =
				resolveEffectiveBookFrontmatterDisplayMode({
					bookFrontmatterDisplayMode: "inline",
					bookHeadingPaginationMode: "page-break",
					bookHeadingPaginationLevel: 2,
					bookPageBreakBeforeHeadingLevel: 0,
					syncCursor: true,
					updateInterval: 300,
				});
			if (normalFrontmatterMode !== "inline") {
				throw new Error("章扉でない場合にフロントマター表示方式がinlineのまま保持されない");
			}

			const disabledHeadingPagination =
				resolveEffectiveBookHeadingPagination({
					bookHeadingPaginationMode: "none",
					bookHeadingPaginationLevel: 2,
					bookPageBreakBeforeHeadingLevel: 2,
					syncCursor: true,
					updateInterval: 300,
				});
			if (
				disabledHeadingPagination.mode !== "none" ||
				disabledHeadingPagination.level !== 0
			) {
				throw new Error("見出しのページ扱いでnoneを明示しても改ページが無効にならない");
			}
			
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "設定バリデーションが正常に動作",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `設定バリデーションエラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testSelectionModeSettingUiState(): Promise<void> {
		const testName = "表示設定: 選択モードは互換モードで disabled になる";
		const startTime = performance.now();

		try {
			const compatState = resolveSelectionModeSettingUiState("compat");
			if (compatState.disabled !== true) {
				throw new Error("compat の disabled 判定が false です");
			}
			if (compatState.disabledReason !== "互換モードでは反映されません") {
				throw new Error(
					`compat の disabled reason が不正です: ${compatState.disabledReason}`,
				);
			}

			const sotState = resolveSelectionModeSettingUiState("sot");
			if (sotState.disabled !== false) {
				throw new Error("SoT の disabled 判定が true です");
			}
			if (sotState.disabledReason !== undefined) {
				throw new Error(
					`SoT に disabled reason が残っています: ${sotState.disabledReason}`,
				);
			}

			// Typewriter OFF: enabled のまま
			const twOffState = resolveSelectionModeSettingUiState("sot", false);
			if (twOffState.disabled !== false) {
				throw new Error(
					"Typewriter OFF + SoT の disabled 判定が true です",
				);
			}
			if (twOffState.disabledReason !== undefined) {
				throw new Error(
					`Typewriter OFF + SoT に disabled reason が残っています: ${twOffState.disabledReason}`,
				);
			}

			// Typewriter ON: disabled になり注意書きが出る
			const twOnState = resolveSelectionModeSettingUiState("sot", true);
			if (twOnState.disabled !== true) {
				throw new Error(
					"Typewriter ON + SoT の disabled 判定が false です",
				);
			}
			if (!twOnState.disabledReason) {
				throw new Error(
					"Typewriter ON + SoT に disabled reason がありません",
				);
			}

			// 互換モードは Typewriter ON/OFF に関わらず disabled
			const compatTwOnState = resolveSelectionModeSettingUiState(
				"compat",
				true,
			);
			if (compatTwOnState.disabled !== true) {
				throw new Error(
					"互換モード + Typewriter ON の disabled 判定が false です",
				);
			}
			if (compatTwOnState.disabledReason !== "互換モードでは反映されません") {
				throw new Error(
					`互換モード + Typewriter ON の disabled reason が不正です: ${compatTwOnState.disabledReason}`,
				);
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"選択モード設定の互換モード・Typewriter ON/OFF 無効化判定が期待通り",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `選択モード設定 UI 状態テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testSoTTypewriterSettingsUiHelpers(): Promise<void> {
		const testName =
			"表示設定: SoT Typewriter UI helper は表示値と内部値を対応づける";
		const startTime = performance.now();

		try {
			if (formatSoTTypewriterOffsetRatioForUi(0) !== "0%") {
				throw new Error("offsetRatio=0 の UI 表示が 0% になりません");
			}
			if (formatSoTTypewriterOffsetRatioForUi(0.2) !== "+20%") {
				throw new Error(
					"offsetRatio=0.2 の UI 表示が +20% になりません",
				);
			}
			if (formatSoTTypewriterOffsetRatioForUi(-0.2) !== "-20%") {
				throw new Error(
					"offsetRatio=-0.2 の UI 表示が -20% になりません",
				);
			}
			if (formatSoTTypewriterFollowBandRatioForUi(0.16) !== "16%") {
				throw new Error(
					"followBandRatio=0.16 の UI 表示が 16% になりません",
				);
			}
			if (formatSoTTypewriterFollowBandRatioForUi(0.05) !== "5%") {
				throw new Error(
					"followBandRatio=0.05 の UI 表示が 5% になりません",
				);
			}
			if (resolveSoTTypewriterOffsetRatioFromUiPercent(80) !== 0.4) {
				throw new Error("offsetRatio UI clamp が 0.4 になりません");
			}
			if (resolveSoTTypewriterOffsetRatioFromUiPercent(-80) !== -0.4) {
				throw new Error("offsetRatio UI clamp が -0.4 になりません");
			}
			if (resolveSoTTypewriterFollowBandRatioFromUiPercent(30) !== 0.25) {
				throw new Error(
					"followBandRatio UI clamp が 0.25 になりません",
				);
			}
			if (resolveSoTTypewriterFollowBandRatioFromUiPercent(5) !== 0.05) {
				throw new Error("followBandRatio UI clamp が 0.05 になりません");
			}
			if (resolveSoTTypewriterFollowBandRatioFromUiPercent(3) !== 0.05) {
				throw new Error(
					"followBandRatio UI 下限未満 clamp が 0.05 になりません",
				);
			}
			if (formatSoTTypewriterHighlightOpacityForUi(0.28) !== "28%") {
				throw new Error(
					"highlightOpacity=0.28 の UI 表示が 28% になりません",
				);
			}
			if (formatSoTTypewriterNonFocusOpacityForUi(0.42) !== "42%") {
				throw new Error(
					"nonFocusOpacity=0.42 の UI 表示が 42% になりません",
				);
			}
			if (resolveSoTTypewriterHighlightOpacityFromUiPercent(120) !== 1) {
				throw new Error("highlightOpacity UI clamp が 1 になりません");
			}
			if (resolveSoTTypewriterHighlightOpacityFromUiPercent(-10) !== 0) {
				throw new Error("highlightOpacity UI clamp が 0 になりません");
			}
			if (resolveSoTTypewriterNonFocusOpacityFromUiPercent(5) !== 0.1) {
				throw new Error("nonFocusOpacity UI 下限 clamp が 0.1 になりません");
			}
			if (resolveSoTTypewriterNonFocusOpacityFromUiPercent(150) !== 1) {
				throw new Error("nonFocusOpacity UI 上限 clamp が 1 になりません");
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"SoT Typewriter UI helper の表示値と内部値対応が期待通り",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT Typewriter UI helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	/**
	 * デフォルト設定のテスト
	 */
	private async testDefaultSettings(): Promise<void> {
		const testName = "デフォルト設定";
		const startTime = performance.now();
		
		try {
			const defaults = DEFAULT_V2_SETTINGS;
			
			if (!defaults.common.fontFamily) {
				throw new Error("共通設定のフォントファミリーが未設定");
			}
			if (!['vertical-rl', 'horizontal-tb'].includes(defaults.common.writingMode)) {
				throw new Error("共通設定の書字方向が無効");
			}
			if (defaults.preview.updateInterval <= 0) {
				throw new Error("プレビュー更新間隔が無効");
			}
			if (Math.abs(defaults.common.rubySize - 0.5) > 0.001) {
				throw new Error("ルビサイズのデフォルト値が不正");
			}
			if (!defaults.themes.length) {
				throw new Error("テーマリストが空");
			}
			if (defaults.wysiwyg.sotSelectionMode !== "fast-click") {
				throw new Error("sotSelectionModeのデフォルトがfast-clickでない");
			}
			if (
				defaults.wysiwyg.autoTcyMinDigits !==
				DEFAULT_AUTO_TCY_MIN_DIGITS
			) {
				throw new Error("autoTcyMinDigits のデフォルトが 2 でない");
			}
			if (
				defaults.wysiwyg.autoTcyMaxDigits !==
				DEFAULT_AUTO_TCY_MAX_DIGITS
			) {
				throw new Error("autoTcyMaxDigits のデフォルトが 4 でない");
			}
			if (defaults.wysiwyg.autoTcyDigitsOnly !== false) {
				throw new Error("autoTcyDigitsOnly のデフォルトが false でない");
			}
			if (defaults.wysiwyg.sotTypewriterMode !== false) {
				throw new Error("sotTypewriterMode のデフォルトが false でない");
			}
			if (defaults.wysiwyg.sotTypewriterOffsetRatio !== 0) {
				throw new Error("sotTypewriterOffsetRatio のデフォルトが 0 でない");
			}
			if (defaults.wysiwyg.sotTypewriterFollowBandRatio !== 0.16) {
				throw new Error(
					"sotTypewriterFollowBandRatio のデフォルトが 0.16 でない",
				);
			}
			if (defaults.wysiwyg.sotTypewriterBlockHighlightEnabled !== true) {
				throw new Error(
					"sotTypewriterBlockHighlightEnabled のデフォルトが true でない",
				);
			}
			if (
				defaults.wysiwyg.sotTypewriterCurrentLineHighlightEnabled !== true
			) {
				throw new Error(
					"sotTypewriterCurrentLineHighlightEnabled のデフォルトが true でない",
				);
			}
			if (defaults.wysiwyg.sotTypewriterNonFocusDimEnabled !== true) {
				throw new Error(
					"sotTypewriterNonFocusDimEnabled のデフォルトが true でない",
				);
			}
			if (
				defaults.wysiwyg.sotTypewriterBlockHighlightColor !== "#1e90ff"
			) {
				throw new Error(
					"sotTypewriterBlockHighlightColor のデフォルトが #1e90ff でない",
				);
			}
			if (
				defaults.wysiwyg.sotTypewriterBlockHighlightOpacity !== 0.16
			) {
				throw new Error(
					"sotTypewriterBlockHighlightOpacity のデフォルトが 0.16 でない",
				);
			}
			if (
				defaults.wysiwyg.sotTypewriterCurrentLineHighlightColor !==
				"#1e90ff"
			) {
				throw new Error(
					"sotTypewriterCurrentLineHighlightColor のデフォルトが #1e90ff でない",
				);
			}
			if (
				defaults.wysiwyg.sotTypewriterCurrentLineHighlightOpacity !==
				0.28
			) {
				throw new Error(
					"sotTypewriterCurrentLineHighlightOpacity のデフォルトが 0.28 でない",
				);
			}
			if (defaults.wysiwyg.sotTypewriterNonFocusOpacity !== 0.42) {
				throw new Error(
					"sotTypewriterNonFocusOpacity のデフォルトが 0.42 でない",
				);
			}
			
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "デフォルト設定が正常",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `デフォルト設定エラー: ${error.message}`,
				duration,
			});
		}
	}


	/**
	 * CSS変数のテスト
	 */
	private async testCSSVariables(): Promise<void> {
		const testName = "CSS変数システム";
		const startTime = performance.now();
		
		try {
			// CSS変数の設定テスト - documentElementに設定する
			document.documentElement.style.setProperty('--tategaki-test-var', '20px');
			
			const computedStyle = getComputedStyle(document.documentElement);
			const testValue = computedStyle.getPropertyValue('--tategaki-test-var').trim();
			
			if (!testValue || testValue !== '20px') {
				throw new Error(`CSS変数の設定に失敗: expected '20px', got '${testValue}'`);
			}
			
			// クリーンアップ
			document.documentElement.style.removeProperty('--tategaki-test-var');
			
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "CSS変数システムが正常に動作",
				duration
			});
			
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `CSS変数システムエラー: ${error.message}`,
				duration
			});
		}
	}

	/**
	 * DOM要素作成のテスト
	 */
	private async testDOMElements(): Promise<void> {
		const testName = "DOM要素作成";
		const startTime = performance.now();
		
		try {
			// エディタ要素の作成テスト
			const editorEl = document.createElement("div");
			editorEl.className = "tategaki-editor";
			editorEl.contentEditable = "true";
			
			if (editorEl.contentEditable !== "true") {
				throw new Error("contentEditable属性の設定に失敗");
			}
			
			// キャレット要素の作成テスト
			const caretEl = document.createElement("div");
			caretEl.className = "tategaki-caret";
			
			if (!caretEl.classList.contains("tategaki-caret")) {
				throw new Error("キャレット要素のクラス設定に失敗");
			}
			
			// ARIA属性のテスト
			editorEl.setAttribute("role", "textbox");
			editorEl.setAttribute("aria-label", "縦書きエディタ");
			editorEl.setAttribute("aria-multiline", "true");
			
			if (editorEl.getAttribute("role") !== "textbox") {
				throw new Error("ARIA属性の設定に失敗");
			}
			
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "DOM要素が正常に作成可能",
				duration
			});
			
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `DOM要素作成エラー: ${error.message}`,
				duration
			});
		}
	}

	private async testAozoraRubyConversion(): Promise<void> {
		const testName = "青空文庫ルビ変換";
		const startTime = performance.now();

		try {
			const markdown = "｜漢字《かんじ》と狐《きつね》";
			const html = await MarkdownConverter.markdownToHtml(markdown);
			if (!html.includes("<ruby>漢字<rt>かんじ</rt></ruby>") || !html.includes("<ruby>狐<rt>きつね</rt></ruby>")) {
				throw new Error("markdownToHtml がルビを変換できません");
			}

			const roundTrip = MarkdownConverter.htmlToMarkdown(html);
			if (!roundTrip.includes("｜漢字《かんじ》") || !roundTrip.includes("狐《きつね》")) {
				throw new Error("htmlToMarkdown が青空文庫形式に戻せません");
			}

			const container = document.createElement("p");
			container.textContent = markdown;
			const updated = applyAozoraRubyToElement(container);
			if (!updated || !container.innerHTML.includes("<ruby>漢字<rt>かんじ</rt></ruby>")) {
				throw new Error("DOM変換でルビが展開されません");
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "青空文庫形式のルビが表示・往復変換可能",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `青空文庫ルビ変換エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testBlockEditorConversion(): Promise<void> {
		const testName = "ブロックエディタ変換";
		const startTime = performance.now();

		try {
			const markdown = "第一段落\n\n第二段落";
			const model = await markdownToDocument(markdown);
			const blocks = model.getBlocks();
			if (blocks.length !== 2) {
				throw new Error(`段落数が不正: expected 2, got ${blocks.length}`);
			}

			const roundTripMarkdown = documentToMarkdown(model);
			if (!roundTripMarkdown.includes("第一段落") || !roundTripMarkdown.includes("第二段落")) {
				throw new Error("Markdownラウンドトリップで内容が欠損");
			}

			// プレースホルダーが残らないことを検証（XHTML由来の属性付きHTMLを想定）
			const htmlHeavyMarkdown = '<div class="note" data-type="info">本文<span style="color:red">強調</span><ruby>漢字<rt>かんじ</rt></ruby></div>';
			const richModel = await markdownToDocument(htmlHeavyMarkdown);
			const richRoundTrip = documentToMarkdown(richModel);
			if (/__PRESERVED_TAG_\d+__/.test(richRoundTrip) || richRoundTrip.includes('HTMLTAG')) {
				throw new Error('HTMLプレースホルダーがMarkdownに残存しています');
			}
			if (!richRoundTrip.includes('<span style="color:red">強調</span>') || !richRoundTrip.includes('<ruby>漢字<rt>かんじ</rt></ruby>')) {
				throw new Error('属性付きHTMLの復元に失敗しています');
			}

			const html = documentToHtml(model);
			const restored = await htmlToDocument(html);
			if (restored.getBlocks().length !== blocks.length) {
				throw new Error("HTML変換でブロック数が変化");
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "ブロックエディタのMarkdown/HTML変換が成立",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `ブロックエディタ変換エラー: ${error.message}`,
				duration,
			});
		}
	}

	private async testPreviewHeadingSpacing(): Promise<void> {
		const testName = "プレビュー見出し空行";
		const startTime = performance.now();

		try {
			const singleTokens = await this.simulatePreviewTokens(
				"前文\n\n## 見出し\n本文"
			);
			const singleCounts = this.countEmptyLinesAroundHeading(singleTokens);
			if (singleCounts.before !== 1) {
				throw new Error(
					`単一空行の前方行数が不正: expected 1, got ${singleCounts.before}`
				);
			}
			if (singleCounts.after !== 0) {
				throw new Error(
					`単一空行の後方行数が不正: expected 0, got ${singleCounts.after}`
				);
			}

			const doubleTokens = await this.simulatePreviewTokens(
				"前文\n\n\n## 見出し\n\n\n本文"
			);
			const doubleCounts = this.countEmptyLinesAroundHeading(doubleTokens);
			if (doubleCounts.before !== 2) {
				throw new Error(
					`連続空行(前)の行数が不正: expected 2, got ${doubleCounts.before}`
				);
			}
			if (doubleCounts.after !== 2) {
				throw new Error(
					`連続空行(後)の行数が不正: expected 2, got ${doubleCounts.after}`
				);
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "見出し前後の空行が期待通り維持されています",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `プレビュー空行テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

		private async testTipTapCompatStrictLineNormalization(): Promise<void> {
		const testName = "TipTap開発版の段落分割/空行保持";
		const startTime = performance.now();

		try {
			const twoLines = "一行目\n二行目";
			const normalizedTwoLines = normalizeMarkdownForTipTap(
				protectIndentation(twoLines)
			);
			if (
				!normalizedTwoLines.includes("<p>一行目</p>") ||
				!normalizedTwoLines.includes("<p>二行目</p>")
			) {
				throw new Error("単一改行が段落として分割されていません");
			}
			if (normalizedTwoLines.includes("<br")) {
				throw new Error("単一改行が<br>としてレンダリングされています");
			}

			const withBlanks = "前文\n\n\n## 見出し\n\n本文";
			const normalizedWithBlanks = normalizeMarkdownForTipTap(
				protectIndentation(withBlanks)
			);

			const expectedBlankLines = withBlanks
				.split("\n")
				.filter((line) => line.trim() === "").length;
			const actualBlankMarkers =
				normalizedWithBlanks.split("\u2060").length - 1;
			if (actualBlankMarkers !== expectedBlankLines) {
				throw new Error(
					`空行数が不正: expected ${expectedBlankLines}, got ${actualBlankMarkers}`
				);
			}
			if (!normalizedWithBlanks.includes("<h2>見出し</h2>")) {
				throw new Error("見出しがh2としてレンダリングされていません");
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "段落分割と空行保持が期待通り動作しています",
				duration,
			});
			} catch (error) {
				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: false,
					message: `TipTap正規化テスト失敗: ${error.message}`,
					duration,
				});
			}
		}

		private async testTipTapCompatRubyDisabledFlattensRuby(): Promise<void> {
			const testName = "TipTap開発版のルビOFF展開（漢字《かんじ》表示）";
			const startTime = performance.now();

			try {
				const aozora = "｜漢字《かんじ》";
				const normalizedAozoraOff = normalizeMarkdownForTipTap(
					protectIndentation(aozora),
					{ enableRuby: false }
				);
				if (normalizedAozoraOff.includes("data-aozora-ruby") || normalizedAozoraOff.includes("<ruby")) {
					throw new Error("ルビOFFにも関わらず、ルビノードへ変換されています");
				}
				if (!normalizedAozoraOff.includes("漢字《かんじ》")) {
					throw new Error("青空形式が本文として残っていません");
				}

				const htmlRuby = "<ruby>漢字<rt>かんじ</rt></ruby>";
				const normalizedHtmlOff = normalizeMarkdownForTipTap(
					protectIndentation(htmlRuby),
					{ enableRuby: false }
				);
				if (normalizedHtmlOff.includes("<ruby") || normalizedHtmlOff.includes("<rt")) {
					throw new Error("ルビOFFにも関わらず、HTML ruby/rt が残っています");
				}
				if (!normalizedHtmlOff.includes("漢字《かんじ》")) {
					throw new Error("HTML ruby が漢字《かんじ》に展開されていません");
				}

				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: true,
					message: "ルビOFF時は本文へ漢字《かんじ》として展開されます",
					duration,
				});
			} catch (error) {
				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: false,
					message: `TipTapルビOFF展開テスト失敗: ${error.message}`,
					duration,
				});
			}
		}

		private async testExplicitTcyValidation(): Promise<void> {
			const testName = "明示TCY: 1〜4文字の妥当性判定と文言更新";
			const startTime = performance.now();

			try {
				const assert = (condition: boolean, message: string) => {
					if (!condition) throw new Error(message);
				};

				const regex = createAozoraTcyRegExp();
				const match = regex.exec("前｟1｠後");
				assert(
					match?.groups?.body === "1",
					"｟1｠ が正規表現で抽出されません",
				);
				assert(isValidAozoraTcyBody("A"), "1文字英字が妥当扱いされません");
				assert(isValidAozoraTcyBody("1"), "1文字数字が妥当扱いされません");
				assert(isValidAozoraTcyBody("12"), "2文字TCYが妥当扱いされません");
				assert(isValidAozoraTcyBody("ABCD"), "4文字TCYが妥当扱いされません");
				assert(!isValidAozoraTcyBody(""), "0文字TCYが妥当扱いされています");
				assert(
					!isValidAozoraTcyBody("ABCDE"),
					"5文字TCYが妥当扱いされています",
				);
				assert(
					t("notice.tcy.invalidSelection").includes("1〜4文字"),
					`invalid selection 文言が更新されていません: ${t("notice.tcy.invalidSelection")}`,
				);

				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: true,
					message: "明示TCYの1〜4文字判定と文言更新が期待通り",
					duration,
				});
			} catch (error) {
				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: false,
					message: `明示TCY妥当性テスト失敗: ${error.message}`,
					duration,
				});
			}
		}

		private async testTipTapCompatTcyRoundTrip(): Promise<void> {
			const testName = "TipTap開発版の縦中横（｟..｠）往復";
			const startTime = performance.now();

			const host = document.createElement("div");
			host.style.cssText = `
				position: absolute;
				left: -9999px;
				top: -9999px;
				width: 400px;
				height: 200px;
			`;

			try {
				const markdown = "時刻は｟1｠です";
				const normalized = normalizeMarkdownForTipTap(
					protectIndentation(markdown)
				);
				if (!normalized.includes('data-tategaki-tcy="1"')) {
					throw new Error("｟..｠ がTCY spanに変換されていません");
				}
				const html = convertAozoraTcySyntaxToHtml("時刻は｟1｠です");
				if (!html.includes(">1</span>")) {
					throw new Error(`｟1｠ が HTML 変換されていません: ${html}`);
				}

				document.body.appendChild(host);
				const editor = new Editor({
					element: host,
					extensions: [Document, Paragraph, Text, AozoraTcyNode],
					content:
						'<p>時刻は<span class="tategaki-md-tcy" data-tategaki-tcy="1">1</span>です</p>',
				});

				try {
					const adapter = createTipTapMarkdownAdapter(editor);
					const roundTrip = adapter.getMarkdown();
					if (!roundTrip.includes("｟1｠")) {
						throw new Error(`TCYがMarkdownへ戻っていません: ${JSON.stringify(roundTrip)}`);
					}
				} finally {
					editor.destroy();
				}

				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: true,
					message: "TCYはTipTap内で保持され、Markdownへ｟..｠で復元されます",
					duration,
				});
			} catch (error) {
				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: false,
					message: `TipTapTCY往復テスト失敗: ${error.message}`,
					duration,
				});
			} finally {
				try {
					if (host.parentElement) {
						host.parentElement.removeChild(host);
					}
				} catch (_error) {
					// noop
				}
			}
		}

	private async testTipTapCompatHeadingIndentationPreserved(): Promise<void> {
			const testName = "TipTap開発版の見出し字下げ（全角空白保持）";
			const startTime = performance.now();

			try {
				const markdown = "## 　　見出し";
				const protectedMarkdown = protectIndentation(markdown);
				if (!protectedMarkdown.includes("## &#12288;&#12288;見出し")) {
					throw new Error(
						`見出しの全角空白が保護されていません: ${JSON.stringify(protectedMarkdown)}`
					);
				}
				const restored = restoreIndentation(protectedMarkdown);
				if (restored !== markdown) {
					throw new Error(
						`見出しの全角空白が復元されていません: ${JSON.stringify(restored)}`
					);
				}

				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: true,
					message: "見出しの全角空白が保護・復元されます",
					duration,
				});
			} catch (error) {
				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: false,
					message: `見出し字下げテスト失敗: ${error.message}`,
					duration,
				});
			}
		}

		private async testExplicitTcyCommandAcceptsSingleChar(): Promise<void> {
			const testName = "明示TCYコマンド: SoTとcompat plain editで1文字選択を受け付ける";
			const startTime = performance.now();

			try {
				const assert = (condition: boolean, message: string) => {
					if (!condition) throw new Error(message);
				};

				const sotOverlay = document.createElement("textarea");
				sotOverlay.value = "A";
				sotOverlay.selectionStart = 0;
				sotOverlay.selectionEnd = 1;

				const invalidSotOverlay = document.createElement("textarea");
				invalidSotOverlay.value = "ABCDE";
				invalidSotOverlay.selectionStart = 0;
				invalidSotOverlay.selectionEnd = 5;

				const moduleLoader = requireFromTests("module") as unknown as {
					_load: (
						request: string,
						parent: unknown,
						isMain: boolean,
					) => unknown;
				};
				const originalLoad = moduleLoader._load;
				moduleLoader._load = (
					request: string,
					parent: unknown,
					isMain: boolean,
				) => {
					if (request === "obsidian") {
						return {
							Notice: class NoticeMock {
								constructor(_message?: string, _timeout?: number) {}
							},
						};
					}
					return originalLoad(request, parent, isMain);
				};

				try {
					const { runInsertTcyCommand } = await import(
						"./wysiwyg/sot/sot-inline-tcy-commands"
					);
					const sotHost = {
						sourceModeEnabled: true,
						plainEditOverlayEl: sotOverlay,
						sotEditor: null,
						lineRanges: [],
						immediateRender: false,
						adjustPlainEditOverlaySize: () => {},
						findLineIndex: () => null,
						updatePendingText: () => {},
						runCeMutation: () => {},
						setSelectionNormalized: () => {},
						focusInputSurface: () => {},
						mergeRanges: (ranges: Array<{ from: number; to: number }>) =>
							ranges,
					};
					runInsertTcyCommand(sotHost);
					assert(
						sotOverlay.value === "｟A｠",
						`SoT command が 1文字TCY を挿入しません: ${sotOverlay.value}`,
					);

					const invalidSotHost = {
						...sotHost,
						plainEditOverlayEl: invalidSotOverlay,
					};
					runInsertTcyCommand(invalidSotHost);
					assert(
						invalidSotOverlay.value === "ABCDE",
						`SoT command が 5文字選択を拒否していません: ${invalidSotOverlay.value}`,
					);
				} finally {
					moduleLoader._load = originalLoad;
				}

				const plainEdit = new PlainEditMode({
					editor: {} as Editor,
				}) as unknown as {
					isActive: boolean;
					overlayEl: HTMLTextAreaElement | null;
					applyInlineCommand: (
						command: { type: "tcy"; text?: string },
					) => boolean;
				};

				const compatOverlay = document.createElement("textarea");
				compatOverlay.value = "1";
				compatOverlay.selectionStart = 0;
				compatOverlay.selectionEnd = 1;
				plainEdit.isActive = true;
				plainEdit.overlayEl = compatOverlay;
				plainEdit.applyInlineCommand({ type: "tcy" });
				assert(
					compatOverlay.value === "｟1｠",
					`compat plain edit が 1文字TCY を挿入しません: ${compatOverlay.value}`,
				);

				const invalidCompatOverlay = document.createElement("textarea");
				invalidCompatOverlay.value = "ABCDE";
				invalidCompatOverlay.selectionStart = 0;
				invalidCompatOverlay.selectionEnd = 5;
				plainEdit.overlayEl = invalidCompatOverlay;
				plainEdit.applyInlineCommand({ type: "tcy" });
				assert(
					invalidCompatOverlay.value === "ABCDE",
					`compat plain edit が 5文字選択を拒否していません: ${invalidCompatOverlay.value}`,
				);

				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: true,
					message: "SoT / compat の明示TCYコマンドが1文字選択を受け付けます",
					duration,
				});
			} catch (error) {
				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: false,
					message: `明示TCYコマンドテスト失敗: ${error.message}`,
					duration,
				});
			}
		}

		private async testTipTapCompatBlockquoteSerializationAddsBlankLine(): Promise<void> {
			const testName = "TipTap開発版の引用後空行（lazy continuation回避）";
			const startTime = performance.now();

			const host = document.createElement("div");
			host.style.cssText = `
				position: absolute;
				left: -9999px;
				top: -9999px;
				width: 400px;
				height: 200px;
				`;

			try {
				document.body.appendChild(host);

				const editor = new Editor({
					element: host,
					extensions: [Document, Paragraph, Text, Blockquote],
					content: "<blockquote><p>引用</p></blockquote><p>本文</p>",
				});

				try {
					const adapter = createTipTapMarkdownAdapter(editor);
					const markdown = adapter.getMarkdown();
					if (!markdown.includes("> 引用\n\n本文")) {
						throw new Error(`引用後の空行が不足しています: ${JSON.stringify(markdown)}`);
					}
				} finally {
					editor.destroy();
				}

				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: true,
					message: "引用直後に空行を補い、後続段落が引用扱いになるのを防ぎます",
					duration,
				});
			} catch (error) {
				const duration = performance.now() - startTime;
				this.results.push({
					name: testName,
					success: false,
					message: `TipTap引用空行テスト失敗: ${error.message}`,
					duration,
				});
				} finally {
					try {
						if (host.parentElement) {
							host.parentElement.removeChild(host);
						}
					} catch (_error) {
						// noop: テスト用DOMの後始末失敗は無視
					}
				}
			}

	private async testTipTapCompatHardBreakSerializationUsesMarkdownBreak(): Promise<void> {
		const testName = "TipTap開発版の hardBreak 保存は <br> を使わない";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText = `
			position: absolute;
			left: -9999px;
			top: -9999px;
			width: 400px;
			height: 200px;
		`;

		try {
			document.body.appendChild(host);

			const editor = new Editor({
				element: host,
				extensions: [Document, Paragraph, Text, Blockquote, HardBreak],
				content: "<blockquote><p>引用<br>続き</p></blockquote>",
			});

			try {
				const adapter = createTipTapMarkdownAdapter(editor);
				const markdown = adapter.getMarkdown();
				const expected = `> 引用${COMPAT_HARD_BREAK_MARKDOWN}> 続き`;
				if (markdown.includes("<br>")) {
					throw new Error(
						`<br> が保存に残っています: ${JSON.stringify(markdown)}`
					);
				}
				if (markdown !== expected) {
					throw new Error(
						`hardBreak の保存形式が不正です: expected ${JSON.stringify(expected)}, got ${JSON.stringify(markdown)}`
					);
				}
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "hardBreak は半角空白2個 + 改行で保存されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `TipTap hardBreak 保存形式テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) {
					host.parentElement.removeChild(host);
				}
			} catch (_error) {
				// noop: テスト用DOMの後始末失敗は無視
			}
		}
	}

	private async testTipTapCompatHardBreakPolicy(): Promise<void> {
		const testName = "TipTap開発版の hardBreak 許可境界";
		const startTime = performance.now();

		try {
			const createEditor = (
				activeNames: string[],
				isEditable = true
			): {
				isEditable: boolean;
				isActive: (name: string) => boolean;
			} => ({
				isEditable,
				isActive: (name: string) => activeNames.includes(name),
			});

			if (canUseCompatHardBreak(createEditor(["paragraph"]))) {
				throw new Error("通常段落で hardBreak が許可されています");
			}
			if (!canUseCompatHardBreak(createEditor(["listItem"]))) {
				throw new Error("listItem で hardBreak が許可されていません");
			}
			if (!canUseCompatHardBreak(createEditor(["blockquote"]))) {
				throw new Error("blockquote で hardBreak が許可されていません");
			}
			if (canUseCompatHardBreak(createEditor(["blockquote"], false))) {
				throw new Error("readOnly でも hardBreak が許可されています");
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "hardBreak は listItem / blockquote のみ許可されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `TipTap hardBreak 許可境界テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testTipTapCompatRubyCaretNavigation(): Promise<void> {
		const testName = "TipTap開発版のルビ行キャレット移動";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText = `
			position: absolute;
			left: -9999px;
			top: -9999px;
			width: 400px;
			height: 200px;
			`;

		try {
			document.body.appendChild(host);

			const editor = new Editor({
				element: host,
				extensions: [Document, Paragraph, Text, AozoraRubyNode],
				content:
					'<p>前<ruby data-aozora-ruby="1" data-aozora-delimiter="0"><span data-aozora-base="1">漢字</span><rt>かんじ</rt></ruby>後</p>',
			});

			try {
				const pm = host.querySelector(".ProseMirror") ?? host;
				if (pm.querySelector("ruby") || pm.querySelector("rt")) {
					throw new Error("エディタDOMにネイティブruby/rtが残っています");
				}

				const rubyWrapper = pm.querySelector(".tategaki-aozora-ruby");
				if (!rubyWrapper) {
					throw new Error("疑似ルビ要素が見つかりません");
				}

				const rubyTextEl = pm.querySelector(".tategaki-aozora-ruby-rt");
				if (!rubyTextEl) {
					throw new Error("疑似ルビ（ルビ文字）要素が見つかりません");
				}
				if (rubyTextEl.getAttribute("contenteditable") !== "false") {
					throw new Error(
						"疑似ルビが編集可能になっています（キャレットが入り込み得ます）"
					);
				}
				if (rubyTextEl.getAttribute("data-pm-ignore") !== "true") {
					throw new Error("疑似ルビがdata-pm-ignoreされていません");
				}
				if ((rubyTextEl.textContent ?? "").trim() !== "かんじ") {
					throw new Error("疑似ルビのテキストが不正です");
				}
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "疑似ルビ表示によりネイティブruby要素を排除しています",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `TipTapルビキャレットテスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) {
					host.parentElement.removeChild(host);
				}
			} catch (_error) {
				// クリーンアップ失敗は無視
			}
			}
		}

	private async testTipTapCompatExistingRubyPreservesDelimiter(): Promise<void> {
		const testName = "TipTap開発版の既存ルビ編集は delimiter を維持";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText = `
			position: absolute;
			left: -9999px;
			top: -9999px;
			width: 400px;
			height: 200px;
		`;

		try {
			document.body.appendChild(host);

			const editor = new Editor({
				element: host,
				extensions: [Document, Paragraph, Text, AozoraRubyNode],
				content:
					'<p>母の<ruby data-aozora-ruby="1" data-aozora-delimiter="0"><span data-aozora-base="1">機嫌</span><rt>きげん</rt></ruby>を損じないように</p>',
			});

			try {
				let prefixFrom: number | null = null;
				let rubyTextFrom: number | null = null;

				editor.state.doc.descendants((node, pos) => {
					if (!node.isText) {
						return;
					}
					if (node.text === "母の" && prefixFrom === null) {
						prefixFrom = pos;
					}
					if (node.text === "機嫌" && rubyTextFrom === null) {
						rubyTextFrom = pos;
					}
				});

				if (prefixFrom === null || rubyTextFrom === null) {
					throw new Error("テスト用の選択位置を解決できません");
				}

				const tr = editor.state.tr.setSelection(
					TextSelection.create(editor.state.doc, prefixFrom, rubyTextFrom + 1)
				);
				editor.view.dispatch(tr);

				const selection = resolveTipTapRubySelection(editor);
				if (!selection || !selection.hasRubyNode) {
					throw new Error("既存ルビの選択解決に失敗しました");
				}
				if (selection.displayText !== "機嫌") {
					throw new Error(`既存ルビ本文の解決が不正: ${selection.displayText}`);
				}
				if (selection.replacementText !== "機嫌") {
					throw new Error("ルビ除去時の復元本文が不正です");
				}
				if (selection.hasDelimiter !== false) {
					throw new Error("既存の delimiter なし属性が保持されていません");
				}

				editor
					.chain()
					.focus()
					.deleteRange({ from: selection.rangeFrom, to: selection.rangeTo })
					.setTextSelection(selection.rangeFrom)
					.insertContent({
						type: "aozoraRuby",
						attrs: {
							ruby: "きげん",
							hasDelimiter: selection.hasDelimiter,
						},
						content: [
							{
								type: "text",
								text: selection.displayText,
							},
						],
					})
					.run();

				const markdown = createTipTapMarkdownAdapter(editor).getMarkdown();
				if (markdown !== "母の機嫌《きげん》を損じないように") {
					throw new Error(`既存ルビが巻き込まれています: ${JSON.stringify(markdown)}`);
				}
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "既存の ｜なし ルビを編集しても保存時に維持されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `TipTap既存ルビ delimiter 維持テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) {
					host.parentElement.removeChild(host);
				}
			} catch (_error) {
				// noop
			}
		}
	}

	private async testSoTRubyEditPreservesDelimiter(): Promise<void> {
		const testName = "SoT派生ビュー: 既存ルビ編集は delimiter を維持";
		const startTime = performance.now();

		try {
			const lineText = "と、母の機嫌《きげん》を損じないように";
			const lineFrom = 42;
			const lineTo = lineFrom + lineText.length;
			const selectionFrom = lineFrom + lineText.indexOf("母");
			const selectionTo = lineFrom + lineText.indexOf("嫌") + 1;

			const match = findSoTAozoraRubyMatchForSelection(
				lineFrom,
				lineTo,
				selectionFrom,
				selectionTo,
				lineText
			);

			if (!match) {
				throw new Error("既存ルビの選択解決に失敗しました");
			}
			if (match.baseText !== "機嫌") {
				throw new Error(`既存ルビ本文の解決が不正: ${match.baseText}`);
			}
			if (match.hasDelimiter !== false) {
				throw new Error("既存の delimiter なし属性が保持されていません");
			}
			if (match.rangeFrom !== lineFrom + lineText.indexOf("機")) {
				throw new Error("置換開始位置が既存ルビの先頭に揃っていません");
			}

			const preserved = buildSoTAozoraRubyText(
				match.baseText,
				"きげん",
				false,
				match.hasDelimiter
			);
			if (preserved !== "機嫌《きげん》") {
				throw new Error(`既存ルビの再構築が不正: ${preserved}`);
			}

			const created = buildSoTAozoraRubyText("新規", "しんき", false);
			if (created !== "｜新規《しんき》") {
				throw new Error(`新規ルビの delimiter 付与が不正: ${created}`);
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "既存ルビは保持し、新規ルビだけ ｜ 付きで作成されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `SoT既存ルビ delimiter 維持テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testAutoTcyRangeDetection(): Promise<void> {
		const testName = "自動TCY抽出は digits-only と記号ペアルールを反映する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const sample = "AB A1 abc 12 123 1234 HELLO ｟34｠ !! !? ??";
			const defaultBodies = collectAutoTcyRanges(sample).map(
				(range) => range.text,
			);
			const oneToFourBodies = collectAutoTcyRanges(sample, {
				minDigits: 1,
				maxDigits: 4,
			}).map((range) => range.text);
			const oneToTwoBodies = collectAutoTcyRanges(sample, {
				minDigits: 1,
				maxDigits: 2,
			}).map((range) => range.text);
			const digitsOnlyBodies = collectAutoTcyRanges(sample, {
				minDigits: 1,
				maxDigits: 4,
				digitsOnly: true,
			}).map((range) => range.text);

			assert(defaultBodies.includes("12"), "既定設定で 12 が抽出されていません");
			assert(defaultBodies.includes("123"), "既定設定で 123 が抽出されていません");
			assert(defaultBodies.includes("1234"), "既定設定で 1234 が抽出されていません");
			assert(defaultBodies.includes("AB"), "既定設定で AB が抽出されていません");
			assert(defaultBodies.includes("A1"), "既定設定で A1 が抽出されていません");
			assert(defaultBodies.includes("abc"), "既定設定で abc が抽出されていません");
			assert(!defaultBodies.includes("HELLO"), "既定設定で 5 文字英字が抽出されています");
			assert(!defaultBodies.includes("34"), "明示TCY内の本文は抽出対象外です");

			assert(oneToFourBodies.includes("AB"), "1〜4 設定で AB が抽出されていません");
			assert(oneToFourBodies.includes("A1"), "1〜4 設定で A1 が抽出されていません");
			assert(oneToFourBodies.includes("1234"), "1〜4 設定で 1234 が抽出されていません");

			assert(oneToTwoBodies.includes("AB"), "1〜2 設定で AB が抽出されていません");
			assert(oneToTwoBodies.includes("12"), "1〜2 設定で 12 が抽出されていません");
			assert(!oneToTwoBodies.includes("123"), "1〜2 設定で 3 桁英数字が抽出されています");
			assert(!oneToTwoBodies.includes("1234"), "1〜2 設定で 4 桁英数字が抽出されています");

			assert(digitsOnlyBodies.includes("12"), "digits-only 設定で 12 が抽出されていません");
			assert(digitsOnlyBodies.includes("123"), "digits-only 設定で 123 が抽出されていません");
			assert(!digitsOnlyBodies.includes("AB"), "digits-only 設定で AB が抽出されています");
			assert(!digitsOnlyBodies.includes("A1"), "digits-only 設定で A1 が抽出されています");
			assert(!digitsOnlyBodies.includes("abc"), "digits-only 設定で abc が抽出されています");

			for (const bodies of [
				defaultBodies,
				oneToFourBodies,
				oneToTwoBodies,
				digitsOnlyBodies,
			]) {
				assert(bodies.includes("!!"), "!! が抽出されていません");
				assert(bodies.includes("!?"), "!? が抽出されていません");
				assert(bodies.includes("??"), "?? が抽出されていません");
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "自動TCYの抽出条件が digits-only を含めて期待通りです",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `自動TCY抽出テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testAutoTcySettingsDriveSharedHelper(): Promise<void> {
		const testName = "自動TCY共通helperは settings に応じて digits-only と SoT 判定を変える";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const defaultSettings = validateV2Settings({});
			const oneToTwoSettings = validateV2Settings({
				wysiwyg: {
					autoTcyMinDigits: 1,
					autoTcyMaxDigits: 2,
				},
			});
			const digitsOnlySettings = validateV2Settings({
				wysiwyg: {
					autoTcyMinDigits: 1,
					autoTcyMaxDigits: 4,
					autoTcyDigitsOnly: true,
				},
			});

			const defaultDigitRange = resolveAutoTcyDigitRange(
				defaultSettings.wysiwyg,
			);
			const oneToTwoDigitRange = resolveAutoTcyDigitRange(
				oneToTwoSettings.wysiwyg,
			);

			assert(
				defaultDigitRange.minDigits === 2 &&
					defaultDigitRange.maxDigits === 4,
				`既定の桁数レンジが不正です: ${JSON.stringify(defaultDigitRange)}`,
			);
			assert(
				oneToTwoDigitRange.minDigits === 1 &&
					oneToTwoDigitRange.maxDigits === 2,
				`1〜2 の桁数レンジが不正です: ${JSON.stringify(oneToTwoDigitRange)}`,
			);
			assert(
				digitsOnlySettings.wysiwyg.autoTcyDigitsOnly === true,
				"digits-only settings が有効になっていません",
			);

			const sample = "AB A1 abc 12 123 !!";
			const defaultBodies = collectAutoTcyRanges(
				sample,
				defaultSettings.wysiwyg,
			).map((range) => range.text);
			const oneToTwoBodies = collectAutoTcyRanges(
				sample,
				oneToTwoSettings.wysiwyg,
			).map((range) => range.text);
			const digitsOnlyBodies = collectAutoTcyRanges(
				sample,
				digitsOnlySettings.wysiwyg,
			).map((range) => range.text);

			assert(
				defaultBodies.includes("AB"),
				"既定 settings で AB が抽出されていません",
			);
			assert(
				oneToTwoBodies.includes("AB"),
				"1〜2 settings で AB が抽出されていません",
			);
			assert(
				defaultBodies.includes("123"),
				"既定 settings で 3 桁英数字が抽出されていません",
			);
			assert(
				!oneToTwoBodies.includes("123"),
				"1〜2 settings で 3 桁英数字が抽出されています",
			);
			assert(
				digitsOnlyBodies.includes("12"),
				"digits-only settings で 12 が抽出されていません",
			);
			assert(
				!digitsOnlyBodies.includes("AB"),
				"digits-only settings で AB が抽出されています",
			);
			assert(
				!digitsOnlyBodies.includes("A1"),
				"digits-only settings で A1 が抽出されています",
			);
			assert(
				!digitsOnlyBodies.includes("abc"),
				"digits-only settings で abc が抽出されています",
			);
			assert(
				digitsOnlyBodies.includes("!!"),
				"digits-only settings で !! が抽出されていません",
			);

			const sotTcyRanges: Array<{ from: number; to: number }> = [];
			collectRenderableTcyRangesForLine(
				0,
				sample.length,
				sample,
				[],
				[],
				sotTcyRanges,
				{
					enableAutoTcy: true,
					autoTcyDigitRange: resolveAutoTcyDigitRange(
						digitsOnlySettings.wysiwyg,
					),
					autoTcyDigitsOnly:
						digitsOnlySettings.wysiwyg.autoTcyDigitsOnly,
					rubyRanges: [],
				},
			);
			const sotBodies = sotTcyRanges.map((range) =>
				sample.slice(range.from, range.to),
			);
			assert(
				sotBodies.includes("12"),
				"SoT 側で digits-only の 12 が抽出されていません",
			);
			assert(
				!sotBodies.includes("AB"),
				"SoT 側で digits-only の AB が抽出されています",
			);
			assert(
				sotBodies.includes("!!"),
				"SoT 側で digits-only の !! が抽出されていません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "共通helperの digits-only 判定が settings に応じて SoT と共有されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `自動TCY共通helperテスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	/**
	 * onScrollSettled() が停止直後に同期 precise pass を先行実行し、
	 * 既存分岐（selection / collapsed headings）を壊していないことを検証
	 */
	private async testOnScrollSettledPreciseFirst(): Promise<void> {
		const testName = "onScrollSettled: 停止直後に precise pass を先行実行";
		const startTime = performance.now();

		try {
			// 呼び出し順序を記録するトレーサー
			const callLog: string[] = [];

			// renderVisibleVirtualLinesPrecise の呼び出しを検出するため
			// SoTRenderPipeline のソースを静的に検証する
			// （DOMなしで実行可能な pure ロジックテスト）

			// 1. isSelectionActive 時は precise が呼ばれない（既存分岐維持）
			{
				const pipeline = this.createTracingPipeline(callLog, {
					selectionActive: true,
					collapsedHeadings: false,
					virtualEnabled: true,
				});
				callLog.length = 0;
				pipeline.onScrollSettled();
				// selection active → scheduleResumeAfterScroll(true, ...) のみ
				if (callLog.includes("renderVisibleVirtualLinesPrecise")) {
					throw new Error(
						"selection active 時に precise が呼ばれています"
					);
				}
			}

			// 2. 通常時: precise → scheduleResumeAfterScroll → schedulePreciseScan の順
			{
				const pipeline = this.createTracingPipeline(callLog, {
					selectionActive: false,
					collapsedHeadings: false,
					virtualEnabled: true,
				});
				callLog.length = 0;
				pipeline.onScrollSettled();
				const preciseIdx = callLog.indexOf("renderVisibleVirtualLinesPrecise");
				const resumeIdx = callLog.indexOf("scheduleResumeAfterScroll");
				const scanIdx = callLog.indexOf("schedulePreciseScan");
				if (preciseIdx === -1) {
					throw new Error("通常時に precise が呼ばれていません");
				}
				if (resumeIdx === -1) {
					throw new Error("通常時に scheduleResumeAfterScroll が呼ばれていません");
				}
				if (scanIdx === -1) {
					throw new Error("通常時に schedulePreciseScan が呼ばれていません");
				}
				if (preciseIdx >= resumeIdx) {
					throw new Error("precise が scheduleResumeAfterScroll より後に呼ばれています");
				}
			}

			// 3. 折りたたみ時: precise → schedulePreciseScan（resumeAfterScrollなし）
			{
				const pipeline = this.createTracingPipeline(callLog, {
					selectionActive: false,
					collapsedHeadings: true,
					virtualEnabled: true,
				});
				callLog.length = 0;
				pipeline.onScrollSettled();
				const preciseIdx = callLog.indexOf("renderVisibleVirtualLinesPrecise");
				const scanIdx = callLog.indexOf("schedulePreciseScan");
				const resumeIdx = callLog.indexOf("scheduleResumeAfterScroll");
				if (preciseIdx === -1) {
					throw new Error("折りたたみ時に precise が呼ばれていません");
				}
				if (scanIdx === -1) {
					throw new Error("折りたたみ時に schedulePreciseScan が呼ばれていません");
				}
				if (resumeIdx !== -1) {
					throw new Error("折りたたみ時に scheduleResumeAfterScroll が呼ばれています");
				}
			}

			// 4. virtualEnabled=false 時は何も呼ばれない
			{
				const pipeline = this.createTracingPipeline(callLog, {
					selectionActive: false,
					collapsedHeadings: false,
					virtualEnabled: false,
				});
				callLog.length = 0;
				pipeline.onScrollSettled();
				if (callLog.length > 0) {
					throw new Error(
						`virtualEnabled=false 時に呼び出しがあります: ${callLog.join(", ")}`
					);
				}
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message:
					"停止直後に precise が先行実行され、既存分岐も維持されています",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `onScrollSettled 順序テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	/**
	 * テスト用: メソッド呼び出しをトレースする SoTRenderPipeline を生成
	 */
	private createTracingPipeline(
		callLog: string[],
		opts: {
			selectionActive: boolean;
			collapsedHeadings: boolean;
			virtualEnabled: boolean;
		}
	): SoTRenderPipeline {
		const dummyEl = document.createElement("div");
		const ctx: SoTRenderPipelineContext = {
			getDerivedRootEl: () => dummyEl,
			getDerivedContentEl: () => dummyEl,
			getSotEditor: () => null,
			getPluginSettings: () => DEFAULT_V2_SETTINGS,
			getHideFrontmatter: () => false,
			getWritingMode: () => "vertical-rl",
			isSelectionActive: () => opts.selectionActive,
			getSelectionHintLines: () => [],
			resyncSelection: () => {},
			parseFrontmatter: () => ({ frontmatter: null }),
			setFrontmatterDetected: () => {},
			computeLineRangesFromLines: () => [],
			setLineRanges: () => {},
			getLineRanges: () => [],
			recomputeLineBlockKinds: () => {},
			renderFrontmatter: () => null,
			applyFrontmatterWritingMode: () => {},
			renderLine: () => {},
			renderLineLight: () => {},
			captureScrollAnchor: () => null,
			resetPendingRenderState: () => {},
			finalizeRender: () => {},
			isLineHidden: () => false,
			hasCollapsedHeadings: () => opts.collapsedHeadings,
		};

		const pipeline = new SoTRenderPipeline(ctx);
		const pipelineInternal = pipeline as unknown as Record<string, unknown>;

		// virtualEnabled を設定するため内部状態を書き換え
		// （renderNow を呼ばず直接設定）
		pipelineInternal["virtualEnabled"] = opts.virtualEnabled;

		// メソッドをプロキシでトレース
		const origPrecise = (pipelineInternal["renderVisibleVirtualLinesPrecise"] as (o: unknown) => void).bind(pipeline);
		pipelineInternal["renderVisibleVirtualLinesPrecise"] = (o: unknown) => {
			callLog.push("renderVisibleVirtualLinesPrecise");
			return origPrecise(o);
		};
		pipelineInternal["scheduleResumeAfterScroll"] = () => {
			callLog.push("scheduleResumeAfterScroll");
			// RAF を予約させない（テスト環境なので空にする）
		};
		pipelineInternal["schedulePreciseScan"] = () => {
			callLog.push("schedulePreciseScan");
			// タイマーを予約させない
		};

		return pipeline;
	}

	private async simulatePreviewTokens(markdown: string): Promise<string[]> {
		const processed = markdown.replace(/\n{2,}/g, (match) => {
			const newlineCount = match.length;
			const blankLines = Math.max(1, newlineCount - 1);
			return `\n⟦TATEGAKI-BREAKS:${blankLines}⟧\n`;
		});

		const lines = processed.split("\n");
		const tokens: string[] = [];
		const htmlBlockPattern =
			/^<(h[1-6]|blockquote|ul|ol|li|hr|p|div|img|ruby|rt|rp|html|body|head|meta|link|script|style|table|tr|td|th|thead|tbody|section|article|nav|aside|header|footer|main|figure|figcaption)/i;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			const strictMatch = trimmed.match(/^⟦TATEGAKI-BREAKS:(\d+)⟧$/);
			if (strictMatch) {
				const count = Math.max(0, parseInt(strictMatch[1], 10) || 0);
				for (let j = 0; j < count; j++) {
					tokens.push("empty");
				}
				continue;
			}

			if (!trimmed) {
				tokens.push("empty");
				continue;
			}

			if (htmlBlockPattern.test(trimmed)) {
				if (/^<h[1-6]\b/i.test(trimmed)) {
					tokens.push("heading");
				} else {
					tokens.push("html");
				}
			} else {
				const html = (await MarkdownConverter.markdownToHtml(line)).trim();
				if (/^<h[1-6]\b/i.test(html)) {
					tokens.push("heading");
				} else {
					tokens.push("text");
				}
			}

			if (i < lines.length - 1) {
				const nextLineRaw = lines[i + 1];
				const nextTrimmed = nextLineRaw?.trim();
				if (
					nextTrimmed &&
					!nextTrimmed.match(/^⟦TATEGAKI-BREAKS:(\d+)⟧$/)
				) {
					tokens.push("br");
				}
			}
		}

		return tokens;
	}

	private countEmptyLinesAroundHeading(tokens: string[]): {
		before: number;
		after: number;
	} {
		const headingIndex = tokens.indexOf("heading");
		if (headingIndex === -1) {
			throw new Error("heading token not found");
		}

		let before = 0;
		for (let i = headingIndex - 1; i >= 0; i--) {
			const token = tokens[i];
			if (token === "empty") {
				before++;
				continue;
			}
			if (token === "br") {
				break;
			}
			break;
		}

		let after = 0;
		for (let i = headingIndex + 1; i < tokens.length; i++) {
			const token = tokens[i];
			if (token === "empty") {
				after++;
				continue;
			}
			if (token === "br") {
				break;
			}
			break;
		}

		return { before, after };
	}

	/**
	 * 縦書きレイアウトの基本テスト
	 */
	async testVerticalLayoutBasics(): Promise<TestResult> {
		const testName = "縦書きレイアウト基本";
		const startTime = performance.now();
		
		try {
			// テスト用要素を作成
			const testContainer = document.createElement('div');
			testContainer.style.cssText = `
				position: absolute;
				left: -9999px;
				top: -9999px;
				width: 300px;
				height: 200px;
				writing-mode: vertical-rl;
				font-size: 16px;
				line-height: 1.5;
			`;
			
			const testText = document.createElement('div');
			testText.textContent = 'テスト文字列';
			testContainer.appendChild(testText);
			
			document.body.appendChild(testContainer);
			
			// レイアウト計算のテスト
			const rect = testText.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) {
				throw new Error("縦書きレイアウトの計算に失敗");
			}
			
			// クリーンアップ
			document.body.removeChild(testContainer);
			
			const duration = performance.now() - startTime;
			return {
				name: testName,
				success: true,
				message: "縦書きレイアウトが正常に動作",
				duration
			};
			
		} catch (error) {
			const duration = performance.now() - startTime;
			return {
				name: testName,
				success: false,
				message: `縦書きレイアウトエラー: ${error.message}`,
				duration
			};
		}
	}

	/**
	 * キャレット位置計算のテスト
	 */
	async testCaretPositioning(): Promise<TestResult> {
		const testName = "キャレット位置計算";
		const startTime = performance.now();
		
		try {
			// テスト用のエディタ環境を作成
			const testEditor = document.createElement('div');
			testEditor.contentEditable = 'true';
			testEditor.textContent = 'テストテキスト';
			testEditor.style.cssText = `
				position: absolute;
				left: -9999px;
				top: -9999px;
				width: 200px;
				height: 100px;
				writing-mode: vertical-rl;
				font-size: 16px;
			`;
			
			document.body.appendChild(testEditor);
			
			// フォーカスして選択範囲を作成
			testEditor.focus();
			const selection = window.getSelection();
			const range = document.createRange();
			const firstChild = testEditor.firstChild;
			if (!firstChild) throw new Error("firstChild is null");
			range.setStart(firstChild, 2);
			range.collapse(true);
			selection?.removeAllRanges();
			selection?.addRange(range);
			
			// 位置計算のテスト
			const rect = range.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) {
				throw new Error("キャレット位置の計算に失敗");
			}
			
			// クリーンアップ
			document.body.removeChild(testEditor);
			
			const duration = performance.now() - startTime;
			return {
				name: testName,
				success: true,
				message: "キャレット位置計算が正常に動作",
				duration
			};
			
		} catch (error) {
			const duration = performance.now() - startTime;
			return {
				name: testName,
				success: false,
				message: `キャレット位置計算エラー: ${error.message}`,
				duration
			};
		}
	}

	private async testFrontmatterParsing(): Promise<void> {
		const testName = "フロントマター: YAML 正規化（normalizeParsed）";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// quoted scalar: parseYaml は引用符を外した文字列を返す
			const d1 = normalizeParsed({ title: "吾輩は猫である" });
			assert(d1?.title === "吾輩は猫である", `double quoted title: ${d1?.title}`);

			// single quoted scalar
			const d2 = normalizeParsed({ author: "夏目漱石" });
			assert(d2?.author === "夏目漱石", `single quoted author: ${d2?.author}`);

			// inline array（parseYaml が string[] を返す）
			const d3 = normalizeParsed({ co_authors: ["甲", "乙"] });
			assert(Array.isArray(d3?.co_authors), "co_authors should be array");
			assert(d3?.co_authors?.length === 2, `co_authors length: ${d3?.co_authors?.length}`);
			assert(d3?.co_authors?.[0] === "甲", `co_authors[0]: ${d3?.co_authors?.[0]}`);
			assert(d3?.co_authors?.[1] === "乙", `co_authors[1]: ${d3?.co_authors?.[1]}`);

			// block array の quoted item（parseYaml 後は string[]）
			const d4 = normalizeParsed({ co_translators: ["訳者甲", "訳者乙"] });
			assert(d4?.co_translators?.length === 2, `co_translators length: ${d4?.co_translators?.length}`);
			assert(d4?.co_translators?.[0] === "訳者甲", `co_translators[0]: ${d4?.co_translators?.[0]}`);

			// folded / literal scalar（parseYaml 後は改行を含む文字列; toDisplayString で String() 変換）
			const d5 = normalizeParsed({ title: "複数行\nタイトル" });
			assert(typeof d5?.title === "string", "folded scalar should be string");
			assert(d5?.title?.includes("タイトル") === true, `folded title: ${d5?.title}`);

			// 数値スカラーも文字列に変換される
			const d6 = normalizeParsed({ title: 12345 });
			assert(d6?.title === "12345", `numeric title: ${d6?.title}`);

			// null / undefined フィールドは無視される
			const d7 = normalizeParsed({ title: null, author: undefined });
			assert(d7 === null || d7?.title === undefined, "null title should be omitted");

			// 空オブジェクト → null
			const d8 = normalizeParsed({});
			assert(d8 === null, "empty object should return null");

			// 非オブジェクト → null
			const d9 = normalizeParsed("string");
			assert(d9 === null, "string input should return null");
			const d10 = normalizeParsed(null);
			assert(d10 === null, "null input should return null");

			// フロントマターなしのコンテンツは frontmatter: null を返す
			const r1 = parseFrontmatterBlock("本文だけのテキスト");
			assert(r1.frontmatter === null, "no frontmatter should return null");
			assert(r1.contentWithoutFrontmatter === "本文だけのテキスト", "content should be unchanged");

			// フロントマターブロックの抽出確認（parseYaml が undefined でも例外なし）
			const r2 = parseFrontmatterBlock("---\ntitle: テスト\n---\n本文");
			assert(r2.contentWithoutFrontmatter === "本文", `content extraction: "${r2.contentWithoutFrontmatter}"`);
			// parseYaml が使えない環境ではフォールバックで null を返す（クラッシュしない）
			assert(r2.frontmatter === null || typeof r2.frontmatter === "object", "should not throw");

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "フロントマター正規化が期待通り",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `フロントマター正規化エラー: ${error.message}`,
				duration,
			});
		}
	}

	/**
	 * テスト結果を取得
	 */
	getResults(): TestResult[] {
		return this.results;
	}

	/**
	 * テスト結果のサマリーを取得
	 */
	getSummary(): { total: number; passed: number; failed: number; duration: number } {
		const total = this.results.length;
		const passed = this.results.filter(r => r.success).length;
		const failed = total - passed;
		const duration = this.results.reduce((sum, r) => sum + r.duration, 0);
		
		return { total, passed, failed, duration };
	}

	/**
	 * テスト結果をコンソールに出力
	 */
	logResults(): void {
		// 以前はログ出力していたが、現在はコンソール出力を行わない
	}
	// ─── compat チェックリストテスト ──────────────────────────────────────────────

	private async testCompatTaskListHtmlGeneration(): Promise<void> {
		const testName = "compat チェックリスト: Markdown → TipTap HTML 変換";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// 未チェック・チェック済みの両方が HTML に変換されること
			const md = "- [ ] 未完了\n- [x] 完了済み";
			const html = normalizeMarkdownForTipTap(md);

			assert(
				html.includes('data-checked="false"'),
				`unchecked item が生成されていません: ${html}`,
			);
			assert(
				html.includes('data-checked="true"'),
				`checked item が生成されていません: ${html}`,
			);

			// チェックリストでない行は通常リストで処理されること
			const normalMd = "- 通常リスト\n- 別項目";
			const normalHtml = normalizeMarkdownForTipTap(normalMd);
			assert(
				!normalHtml.includes('data-checked'),
				`通常リストが checklist に誤変換されています: ${normalHtml}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "チェックリストが正しく HTML 変換されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat チェックリスト HTML 生成テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testCompatTaskListRoundTrip(): Promise<void> {
		const testName = "compat チェックリスト: Markdown round-trip";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText =
			"position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			document.body.appendChild(host);

			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					BulletList,
					ChecklistListItem,
				],
				content:
					"<ul>" +
					'<li data-checked="false"><p>未完了</p></li>' +
					'<li data-checked="true"><p>完了済み</p></li>' +
					"</ul>",
			});

			try {
				const adapter = createTipTapMarkdownAdapter(editor);
				const markdown = adapter.getMarkdown();

				if (!markdown.includes("- [ ] 未完了")) {
					throw new Error(
						`unchecked item が Markdown に戻っていません: ${JSON.stringify(markdown)}`,
					);
				}
				if (!markdown.includes("- [x] 完了済み")) {
					throw new Error(
						`checked item が Markdown に戻っていません: ${JSON.stringify(markdown)}`,
					);
				}
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "チェックリストが Markdown round-trip で保持されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat チェックリスト round-trip テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatTaskListDoesNotBreakBulletList(): Promise<void> {
		const testName = "compat チェックリスト: 通常リストを破壊しない";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// 通常の bullet list が checklist に変換されないこと
			const md = "- 項目A\n- 項目B\n- 項目C";
			const html = normalizeMarkdownForTipTap(md);
			assert(
				html.includes("<ul>") || html.includes("<li>"),
				`通常リストの ul/li が生成されていません: ${html}`,
			);
			assert(
				!html.includes('data-checked'),
				`通常リストが checklist に誤変換されています: ${html}`,
			);

			// ordered list も壊れないこと
			const olMd = "1. 一番目\n2. 二番目";
			const olHtml = normalizeMarkdownForTipTap(olMd);
			assert(
				olHtml.includes("<ol>") || olHtml.includes("<li>"),
				`順序付きリストが生成されていません: ${olHtml}`,
			);
			assert(
				!olHtml.includes('data-checked'),
				`順序付きリストが checklist に誤変換されています: ${olHtml}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "通常リストはチェックリストに誤変換されません",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat 通常リスト破壊テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testCompatToolbarTaskListButton(): Promise<void> {
		const testName =
			"compat toolbar: checklist ボタン定義は bullet と ordered の間にあり active state を持つ";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const labels = COMPAT_TOOLBAR_LIST_BUTTONS.map((button) => button.label);
			const icons = COMPAT_TOOLBAR_LIST_BUTTONS.map((button) => button.icon);
			const bulletIndex = labels.indexOf(t("toolbar.bulletList"));
			const taskIndex = labels.indexOf(t("toolbar.taskList"));
			const orderedIndex = labels.indexOf(t("toolbar.orderedList"));

			assert(taskIndex >= 0, "checklist ボタン定義がありません");
			assert(
				taskIndex === bulletIndex + 1,
				`checklist ボタンが bullet list の直後にありません: ${labels.join(" / ")}`,
			);
			assert(
				orderedIndex === taskIndex + 1,
				`checklist ボタンが ordered list の直前にありません: ${labels.join(" / ")}`,
			);

			const taskButton = COMPAT_TOOLBAR_LIST_BUTTONS[taskIndex];
			assert(
				taskButton.label === t("toolbar.taskList"),
				`aria-label 相当の label が不正です: ${taskButton.label}`,
			);
			assert(
				taskButton.icon === "check-square",
				`icon 識別子が不正です: ${icons.join(" / ")}`,
			);
			assert(
				taskButton.buttonKey === "check-square",
				`button key が不正です: ${taskButton.buttonKey}`,
			);

			assert(
				labels.includes(t("toolbar.bulletList")) &&
					labels.includes(t("toolbar.orderedList")),
				"既存の bullet list / ordered list ボタン定義が失われています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "compat toolbar の checklist ボタン定義は順序を満たします",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat toolbar checklist ボタンテスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	// ─── compat 見出し折りたたみテスト ───────────────────────────────────────────

	private async testCompatHeadingFoldTooltipHelperReuse(): Promise<void> {
		const testName =
			"compat 見出し折りたたみ: tooltip helper は ownerDocument 基準で host と位置を解決する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};
			const popoutWindow = new Window();
			const target = popoutWindow.document.createElement("span");
			popoutWindow.document.body.appendChild(target);
			Object.defineProperty(target, "getBoundingClientRect", {
				value: () => ({
					left: 20,
					top: 30,
					bottom: 50,
					width: 40,
				}),
			});

			const host = resolveSoTCollapsePreviewTooltipHost(
				target as unknown as HTMLElement,
			);
			assert(
				host.doc === (popoutWindow.document as unknown as Document),
				"tooltip host が target.ownerDocument を使っていません",
			);
			assert(
				host.containerEl ===
					(popoutWindow.document.body as unknown as HTMLElement),
				"tooltip host の container が body になっていません",
			);

			const position = computeSoTCollapsePreviewTooltipPosition({
				targetRect: target.getBoundingClientRect() as DOMRect,
				tooltipRect: { width: 120, height: 60 },
				viewportWidth: 200,
				viewportHeight: 140,
			});
			assert(
				position.left >= 8 && position.top >= 8,
				"tooltip position が viewport 内に収まりません",
			);
			assert(
				position.left <= 72 && position.top <= 72,
				"tooltip position が viewport からはみ出しています",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "compat 側でも SoT tooltip helper を ownerDocument 基準で再利用できます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat tooltip helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testCompatHeadingFoldUiHelper(): Promise<void> {
		const testName =
			"compat 見出し折りたたみ: UI helper は writing mode ごとの aria と icon state を返す";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const horizontalCollapsed = resolveCompatHeadingFoldUiState({
				collapsed: true,
				writingMode: "horizontal-tb",
			});
			assert(
				horizontalCollapsed.ariaExpanded === "false",
				"collapsed の aria-expanded が false になりません",
			);
			assert(
				horizontalCollapsed.iconName === "circle-chevron-right",
				"horizontal collapsed の icon state が不正です",
			);
			assert(
				horizontalCollapsed.showEllipsis,
				"collapsed で ellipsis が有効になりません",
			);

			const horizontalExpanded = resolveCompatHeadingFoldUiState({
				collapsed: false,
				writingMode: "horizontal-tb",
			});
			assert(
				horizontalExpanded.ariaExpanded === "true",
				"expanded の aria-expanded が true になりません",
			);
			assert(
				horizontalExpanded.iconName === "circle-chevron-down",
				"horizontal expanded の icon state が不正です",
			);
			assert(
				!horizontalExpanded.showEllipsis,
				"expanded でも ellipsis が表示扱いになっています",
			);

			const verticalRlCollapsed = resolveCompatHeadingFoldUiState({
				collapsed: true,
				writingMode: "vertical-rl",
			});
			assert(
				verticalRlCollapsed.iconName === "circle-chevron-down",
				"vertical-rl collapsed の icon state が不正です",
			);

			const verticalLrExpanded = resolveCompatHeadingFoldUiState({
				collapsed: false,
				writingMode: "vertical-lr",
			});
			assert(
				verticalLrExpanded.iconName === "circle-chevron-left",
				"vertical-lr expanded の icon state が不正です",
			);
			assert(
				verticalRlCollapsed.ariaLabel !== horizontalExpanded.ariaLabel,
				"collapsed/expanded の aria-label が切り替わっていません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "compat heading fold UI helper が aria と icon state を正しく返します",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat UI helper テスト失敗: ${error.message}`,
				duration,
			});
		}
	}

	private async testCompatHeadingFoldPreviewTextHelper(): Promise<void> {
		const testName =
			"compat 見出し折りたたみ: preview text helper は fold range から安全に preview を作る";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText =
			"position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			document.body.appendChild(host);
			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
				],
				content:
					"<h1>見出し</h1><p>最初の段落は十分に長いプレビュー文字列を生成するためのテキストです。</p><p>二行目のプレビューです。</p>",
			});

			try {
				const assert = (condition: boolean, message: string) => {
					if (!condition) throw new Error(message);
				};
				const range = resolveFoldRange(editor.state.doc, 0);
				const preview = buildCompatHeadingFoldPreviewText(
					editor.state.doc,
					range,
					{ maxLines: 2, maxChars: 30 },
				);
				assert(preview !== null, "preview が null です");
				assert(
					preview!.includes("最初の段落"),
					"preview に配下テキストが含まれません",
				);
				assert(
					preview!.length <= 33,
					"preview が長すぎます",
				);
				assert(
					buildCompatHeadingFoldPreviewText(editor.state.doc, null) === null,
					"null range で null を返しません",
				);
				assert(
					buildCompatHeadingFoldPreviewText(
						editor.state.doc,
						{ from: range?.from ?? 0, to: range?.from ?? 0 },
					) === null,
					"空 range で null を返しません",
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "compat preview text helper が fold range から安全に preview を作ります",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat preview text helper テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatHeadingFoldRangeResolution(): Promise<void> {
		const testName = "compat 見出し折りたたみ: 基本的な範囲解決";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText =
			"position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			document.body.appendChild(host);

			// H1 → P → H2 → P → H1 (end) という構造
			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
				],
				content:
					"<h1>見出し1</h1><p>段落1</p><h2>見出し2</h2><p>段落2</p><h1>見出し1-2</h1>",
			});

			try {
				const assert = (condition: boolean, message: string) => {
					if (!condition) throw new Error(message);
				};

				const { doc } = editor.state;
				// H1 (見出し1) の pos = 0、size = 1(open) + textSize + 1(close)
				// "見出し1" は 4文字なので nodeSize = 6
				const h1Pos = 0;
				const h1Node = doc.nodeAt(h1Pos);
				assert(
					h1Node?.type.name === "heading",
					`pos 0 が見出しではありません: ${h1Node?.type.name}`,
				);

				const range = resolveFoldRange(doc, h1Pos);
				assert(
					range !== null,
					"H1 の折りたたみ範囲が null です",
				);

				// 範囲は H1 直後から次の H1 の直前まで（段落1 と H2 と 段落2 を含む）
				assert(
					range!.from > h1Pos,
					`range.from (${range!.from}) が headingPos (${h1Pos}) 以下です`,
				);

				// 範囲の終端は次の H1 の直前であること
				// range.to は次の H1 の開始位置のはずなので、その位置にあるノードを確認
				// range.to は「最後に含まれるノードの終端」なので、次のノードの開始位置を確認
				let pos = 0;
				let foundNextH1 = false;
				for (let i = 0; i < doc.childCount; i++) {
					const node = doc.child(i);
					if (pos >= range!.to) {
						// range.to 以降の最初のノードが H1 かどうか（= 次の H1 で範囲が区切られた）
						if (node.type.name === "heading" && node.attrs["level"] === 1) {
							foundNextH1 = true;
						}
						break;
					}
					pos += node.nodeSize;
				}
				// range の外に H1 が存在するということを確認（範囲が適切に区切られた）
				assert(
					foundNextH1,
					"range の後に次の H1 が存在しないか、範囲が適切に区切られていません",
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "見出し折りたたみ範囲が正しく解決されます",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat 見出し折りたたみ範囲テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatHeadingFoldRangeNested(): Promise<void> {
		const testName = "compat 見出し折りたたみ: H2 折りたたみは H1 で止まる";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText =
			"position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			document.body.appendChild(host);

			// H2 → P → H3 → P → H1 という構造
			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
				],
				content:
					"<h2>見出し2</h2><p>段落A</p><h3>見出し3</h3><p>段落B</p><h1>見出し1</h1>",
			});

			try {
				const assert = (condition: boolean, message: string) => {
					if (!condition) throw new Error(message);
				};

				const { doc } = editor.state;
				const h2Pos = 0;
				const range = resolveFoldRange(doc, h2Pos);
				assert(range !== null, "H2 の折りたたみ範囲が null です");

				// H1 は H2 より上位なので、H2 の範囲に H1 は含まれない
				let walkPos = range!.from;
				while (walkPos < range!.to) {
					const node = doc.nodeAt(walkPos);
					if (!node) break;
					assert(
						!(node.type.name === "heading" && (node.attrs["level"] as number) < 2),
						`H2 の折りたたみ範囲内に H1 が含まれています (pos=${walkPos})`,
					);
					walkPos += node.nodeSize;
				}
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "H2 の折りたたみは H1 で正しく止まります",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat 見出し折りたたみネストテスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatHeadingFoldRangeIsolation(): Promise<void> {
		const testName = "compat 見出し折りたたみ: 別見出しの折りたたみと干渉しない";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText =
			"position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			document.body.appendChild(host);

			// H1-A → P-A → H1-B → P-B という構造
			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
				],
				content:
					"<h1>見出し-A</h1><p>段落A</p><h1>見出し-B</h1><p>段落B</p>",
			});

			try {
				const assert = (condition: boolean, message: string) => {
					if (!condition) throw new Error(message);
				};

				const { doc } = editor.state;

				// H1-A の pos = 0
				const h1APos = 0;
				// P-A の分を加算して H1-B の pos を確認
				let pos = 0;
				let h1BActualPos = -1;
				for (let i = 0; i < doc.childCount; i++) {
					const node = doc.child(i);
					if (i === 2) {
						h1BActualPos = pos;
						break;
					}
					pos += node.nodeSize;
				}
				assert(h1BActualPos >= 0, "H1-B の pos が取得できませんでした");

				const rangeA = resolveFoldRange(doc, h1APos);
				const rangeB = resolveFoldRange(doc, h1BActualPos);

				assert(rangeA !== null, "H1-A の折りたたみ範囲が null です");
				assert(rangeB !== null, "H1-B の折りたたみ範囲が null です");

				// A の範囲と B の範囲が重複しないこと
				assert(
					rangeA!.to <= rangeB!.from,
					`H1-A (to=${rangeA!.to}) と H1-B (from=${rangeB!.from}) の範囲が重複しています`,
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "別見出しの折りたたみ範囲は互いに干渉しません",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat 見出し折りたたみ干渉テスト失敗: ${error.message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatFoldStateClearedOnSetMarkdown(): Promise<void> {
		const testName = "compat \u898b\u51fa\u3057\u6298\u308a\u305f\u305f\u307f: setMarkdown \u5b9f\u884c\u5f8c\u306b state \u304c\u30af\u30ea\u30a2\u3055\u308c\u308b";
		const startTime = performance.now();

		const host = document.createElement("div");
		host.style.cssText =
			"position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			document.body.appendChild(host);

			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
					HeadingFoldExtension,
				VerticalWritingExtension.configure({ defaultMode: "horizontal-tb", targetNodeTypes: ["paragraph", "heading"] }),
				],
				content: "<h1>\u898b\u51fa\u3057A</h1><p>\u6bb5\u843dA</p>",
			});

			try {
				const assert = (condition: boolean, message: string) => {
					if (!condition) throw new Error(message);
				};

				// H1 \u306e pos \u3092\u53d6\u5f97\u3057\u3066 toggle
				const h1Pos = 0;
				editor.commands.toggleHeadingFold(h1Pos);

				const stateBefore = headingFoldPluginKey.getState(editor.state);
				assert(
					stateBefore?.foldedPositions.size === 1,
					`toggle \u5f8c\u306e foldedPositions.size \u304c 1 \u3067\u306a\u3044: ${stateBefore?.foldedPositions.size}`,
				);

				// \u5225\u6587\u66f8\u3078\u306e\u30b9\u30a4\u30c3\u30c1\u6642\u306e\u60f3\u5b9a\u3067 setMarkdown \u3092\u547c\u3073\u51fa\u3059
				const adapter = createTipTapMarkdownAdapter(editor, {});
				adapter.setMarkdown("# \u898b\u51fa\u3057B\n\n\u6bb5\u843dB");

				const stateAfter = headingFoldPluginKey.getState(editor.state);
				assert(
					stateAfter?.foldedPositions.size === 0,
					`setMarkdown \u5f8c\u306b foldedPositions \u304c\u6b8b\u3063\u3066\u3044\u307e\u3059: size=${stateAfter?.foldedPositions.size}`,
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "setMarkdown \u5f8c\u306b fold state \u304c\u6b63\u3057\u304f\u30af\u30ea\u30a2\u3055\u308c\u307e\u3057\u305f",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat fold state \u30af\u30ea\u30a2\u30c6\u30b9\u30c8\u5931\u6557: ${(error as Error).message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatTaskListContinuationLineNotDropped(): Promise<void> {
		const testName = "compat task list: \u7d99\u7d9a\u884c\u304c\u6b20\u843d\u3057\u306a\u3044";
		const startTime = performance.now();
		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// \u7d99\u7d9a\u884c\u3042\u308a\u30bf\u30b9\u30af\u30ea\u30b9\u30c8\uff1a isSimpleTaskList \u304c false \u306a\u306e\u3067 markdown-it \u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af
			const md = "- [ ] \u30bf\u30b9\u30af\u9805\u76ee\n  \u7d99\u7d9a\u30c6\u30ad\u30b9\u30c8";
			const html = normalizeMarkdownForTipTap(md, { enableRuby: false });

			// \u7d99\u7d9a\u30c6\u30ad\u30b9\u30c8\u304c\u5fa1\u3055\u308c\u3066\u3044\u308b\u3053\u3068\u3092\u78ba\u8a8d\uff08\u30de\u30fc\u30af\u30a2\u30c3\u30d7\u306b\u542b\u307e\u308c\u3066\u3044\u308b\uff09
			assert(
				html.includes("\u7d99\u7d9a\u30c6\u30ad\u30b9\u30c8"),
				`\u7d99\u7d9a\u30c6\u30ad\u30b9\u30c8\u304c\u6b20\u843d\u3057\u307e\u3057\u305f\u3002HTML: ${html}`,
			);
			// taskList \u578b\u306b\u306f\u306a\u3063\u3066\u3044\u306a\u3044\u3053\u3068\uff08markdown-it \u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af\uff09
			assert(
				!html.includes('data-checked'),
				`\u7d99\u7d9a\u884c\u3042\u308a\u30ea\u30b9\u30c8\u304c taskList \u578b\u306b\u306a\u3063\u3066\u3044\u307e\u3059: ${html}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "\u7d99\u7d9a\u884c\u304c\u6b20\u843d\u305b\u305a\u6b63\u3057\u304f\u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af\u3057\u307e\u3057\u305f",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat task list \u7d99\u7d9a\u884c\u30c6\u30b9\u30c8\u5931\u6557: ${(error as Error).message}`,
				duration,
			});
		}
	}

	private async testCompatTaskListMixedListNotDropped(): Promise<void> {
		const testName = "compat task list: \u6df7\u5728\u30ea\u30b9\u30c8\u306e\u90e8\u5206\u304c\u6b20\u843d\u3057\u306a\u3044";
		const startTime = performance.now();
		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			// \u901a\u5e38\u7b87\u6761\u66f8\u304d\u3068\u30bf\u30b9\u30af\u9805\u76ee\u306e\u6df7\u5728\uff1a isSimpleTaskList \u304c false \u306a\u306e\u3067 markdown-it \u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af
			const md = "- [ ] \u30bf\u30b9\u30af\u9805\u76ee\n- \u901a\u5e38\u9805\u76ee";
			const html = normalizeMarkdownForTipTap(md, { enableRuby: false });

			// \u4e21\u65b9\u306e\u9805\u76ee\u304c\u542b\u307e\u308c\u3066\u3044\u308b\u3053\u3068\u3092\u78ba\u8a8d
			assert(
				html.includes("\u30bf\u30b9\u30af\u9805\u76ee"),
				`\u30bf\u30b9\u30af\u9805\u76ee\u304c\u6b20\u843d\u3057\u307e\u3057\u305f\u3002HTML: ${html}`,
			);
			assert(
				html.includes("\u901a\u5e38\u9805\u76ee"),
				`\u901a\u5e38\u9805\u76ee\u304c\u6b20\u843d\u3057\u307e\u3057\u305f\u3002HTML: ${html}`,
			);
			// taskList \u578b\u306b\u306f\u306a\u3063\u3066\u3044\u306a\u3044\u3053\u3068
			assert(
				!html.includes('data-checked'),
				`\u6df7\u5728\u30ea\u30b9\u30c8\u304c taskList \u578b\u306b\u306a\u3063\u3066\u3044\u307e\u3059: ${html}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "\u6df7\u5728\u30ea\u30b9\u30c8\u3067\u9805\u76ee\u6b20\u843d\u305b\u305a\u6b63\u3057\u304f\u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af\u3057\u307e\u3057\u305f",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat task list \u6df7\u5728\u30ea\u30b9\u30c8\u30c6\u30b9\u30c8\u5931\u6557: ${(error as Error).message}`,
				duration,
			});
		}
	}

	// ─── compat チェックリスト round-trip 追加テスト ────────────────────────────

	private async testCompatTaskListFullRoundTrip(): Promise<void> {
		const testName = "compat チェックリスト: Markdown → TipTap → Markdown 完全 round-trip";
		const startTime = performance.now();
		const host = document.createElement("div");
		host.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			document.body.appendChild(host);

			const originalMd = "- [ ] 未完了タスク\n- [x] 完了済みタスク";
			const html = normalizeMarkdownForTipTap(originalMd, { enableRuby: false });

			assert(
				html.includes('data-checked="false"') || html.includes('data-checked="true"'),
				`normalizeMarkdownForTipTap が checklist HTML を生成していません: ${html}`,
			);

			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					BulletList,
					ChecklistListItem,
				],
				content: html,
			});

			try {
				const adapter = createTipTapMarkdownAdapter(editor);
				const markdown = adapter.getMarkdown();

				assert(
					markdown.includes("- [ ]"),
					`round-trip 後に unchecked marker が失われました: ${JSON.stringify(markdown)}`,
				);
				assert(
					markdown.includes("- [x]"),
					`round-trip 後に checked marker が失われました: ${JSON.stringify(markdown)}`,
				);
				assert(
					markdown.includes("未完了タスク"),
					`round-trip 後に unchecked item テキストが失われました: ${JSON.stringify(markdown)}`,
				);
				assert(
					markdown.includes("完了済みタスク"),
					`round-trip 後に checked item テキストが失われました: ${JSON.stringify(markdown)}`,
				);

				const html2 = normalizeMarkdownForTipTap(markdown, { enableRuby: false });
				assert(
					html2.includes('data-checked="false"') || html2.includes('data-checked="true"'),
					`2 回目の normalizeMarkdownForTipTap が checklist を生成していません: ${html2}`,
				);
				assert(
					html2.includes('data-checked="false"') && html2.includes('data-checked="true"'),
					`2 回目の HTML で checked 状態が失われました: ${html2}`,
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "Markdown → TipTap → Markdown → HTML の完全 round-trip が成功",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `compat チェックリスト完全 round-trip 失敗: ${(error as Error).message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatTaskListCheckedStateRoundTrip(): Promise<void> {
		const testName = "compat チェックリスト: checked/unchecked 状態が round-trip で保持される";
		const startTime = performance.now();
		const host = document.createElement("div");
		host.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			document.body.appendChild(host);

			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					BulletList,
					ChecklistListItem,
				],
				content:
					"<ul>" +
					'<li data-checked="false"><p>A</p></li>' +
					'<li data-checked="true"><p>B</p></li>' +
					'<li data-checked="false"><p>C</p></li>' +
					'<li data-checked="true"><p>D</p></li>' +
					"</ul>",
			});

			try {
				const adapter = createTipTapMarkdownAdapter(editor);
				const md = adapter.getMarkdown();

				const lines = md.split("\n").filter((l: string) => l.trim() !== "");
				assert(lines.length === 4, `行数が不正: ${lines.length}, md=${JSON.stringify(md)}`);

				assert(
					lines[0].startsWith("- [ ] ") && lines[0].includes("A"),
					`1 行目 unchecked 不正: ${lines[0]}`,
				);
				assert(
					lines[1].startsWith("- [x] ") && lines[1].includes("B"),
					`2 行目 checked 不正: ${lines[1]}`,
				);
				assert(
					lines[2].startsWith("- [ ] ") && lines[2].includes("C"),
					`3 行目 unchecked 不正: ${lines[2]}`,
				);
				assert(
					lines[3].startsWith("- [x] ") && lines[3].includes("D"),
					`4 行目 checked 不正: ${lines[3]}`,
				);

				const html2 = normalizeMarkdownForTipTap(md, { enableRuby: false });
				const checkedFalseCount = (html2.match(/data-checked="false"/g) ?? []).length;
				const checkedTrueCount = (html2.match(/data-checked="true"/g) ?? []).length;
				assert(
					checkedFalseCount === 2 && checkedTrueCount === 2,
					`再変換後の checked 分布が不正: false=${checkedFalseCount}, true=${checkedTrueCount}`,
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "checked/unchecked 状態が round-trip で正しく保持される",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `checked 状態 round-trip テスト失敗: ${(error as Error).message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatTaskListNormalizeHtmlStructure(): Promise<void> {
		const testName = "compat チェックリスト: normalizeMarkdownForTipTap が正しい HTML 構造を生成する";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const md = "- [ ] item1\n- [x] item2\n- [ ] item3";
			const html = normalizeMarkdownForTipTap(md, { enableRuby: false });

			assert(
				html.includes('ul') && html.includes('data-checked'),
				`checklist の ul が生成されていません: ${html}`,
			);

			const itemMatches = html.match(/data-checked="/g) ?? [];
			assert(
				itemMatches.length === 3,
				`checklist item の数が不正 (期待=3, 実際=${itemMatches.length}): ${html}`,
			);

			assert(
				html.includes("item1") && html.includes("item2") && html.includes("item3"),
				`全てのアイテムテキストが含まれていません: ${html}`,
			);

			const normalBullet = "- alpha\n- beta";
			const normalHtml = normalizeMarkdownForTipTap(normalBullet, { enableRuby: false });
			assert(
				!normalHtml.includes('data-checked'),
				`通常の bullet list が checklist に変換されています: ${normalHtml}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "normalizeMarkdownForTipTap の HTML 構造が正しい",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `HTML 構造テスト失敗: ${(error as Error).message}`,
				duration,
			});
		}
	}

	// ─── compat checklist serialize インデント ─────────────────────────────────

	private async testCompatChecklistSerializeIndent(): Promise<void> {
		const testName = "compat checklist: serialize 時の継続インデントが正しい";
		const startTime = performance.now();
		const host = document.createElement("div");
		host.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			document.body.appendChild(host);

			// checklist の serialize で fullMarker 長を反映したインデントになるか確認
			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					BulletList,
					ChecklistListItem,
				],
				content:
					"<ul>" +
					'<li data-checked="false"><p>item</p></li>' +
					"<li><p>normal</p></li>" +
					"</ul>",
			});

			try {
				const adapter = createTipTapMarkdownAdapter(editor);
				const md = adapter.getMarkdown();

				assert(
					md.includes("- [ ] item"),
					`unchecked checklist のマーカーが不正: ${JSON.stringify(md)}`,
				);
				assert(
					md.includes("- normal"),
					`通常 listItem のマーカーが不正: ${JSON.stringify(md)}`,
				);

				// round-trip: serialize した Markdown を再度 parse しても崩れない
				const html2 = normalizeMarkdownForTipTap(md, { enableRuby: false });
				assert(
					html2.includes("item"),
					`round-trip 後に item テキストが消えました: ${html2}`,
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "checklist serialize の継続インデントが正しい",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `checklist serialize インデントテスト失敗: ${(error as Error).message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	// ─── compat ordered checklist round-trip ──────────────────

	private async testCompatOrderedChecklistRoundTrip(): Promise<void> {
		const testName = "compat ordered checklist: Markdown → TipTap → Markdown round-trip";
		const startTime = performance.now();
		const host = document.createElement("div");
		host.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:400px;height:200px;";

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			document.body.appendChild(host);

			const originalMd = "1. [ ] 未完了タスク\n2. [x] 完了済みタスク";
			const html = normalizeMarkdownForTipTap(originalMd, { enableRuby: false });

			assert(
				html.includes("<ol>"),
				`ordered checklist が <ol> で生成されていません: ${html}`,
			);
			assert(
				html.includes('data-checked="false"') && html.includes('data-checked="true"'),
				`ordered checklist の checked 状態が正しくありません: ${html}`,
			);

			const editor = new Editor({
				element: host,
				extensions: [
					Document,
					Paragraph,
					Text,
					OrderedList,
					ChecklistListItem,
				],
				content: html,
			});

			try {
				const adapter = createTipTapMarkdownAdapter(editor);
				const markdown = adapter.getMarkdown();

				assert(
					/\d+\.\s+\[ \]/.test(markdown),
					`round-trip 後に ordered unchecked marker が失われました: ${JSON.stringify(markdown)}`,
				);
				assert(
					/\d+\.\s+\[x\]/.test(markdown),
					`round-trip 後に ordered checked marker が失われました: ${JSON.stringify(markdown)}`,
				);
				assert(
					markdown.includes("未完了タスク"),
					`round-trip 後にテキストが失われました: ${JSON.stringify(markdown)}`,
				);

				// 2 回目の normalize
				const html2 = normalizeMarkdownForTipTap(markdown, { enableRuby: false });
				assert(
					html2.includes("<ol>"),
					`2 回目の normalize でも <ol> が生成されていません: ${html2}`,
				);
				assert(
					html2.includes('data-checked="false"') && html2.includes('data-checked="true"'),
					`2 回目の HTML で checked 状態が失われました: ${html2}`,
				);
			} finally {
				editor.destroy();
			}

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "ordered checklist の完全 round-trip が成功",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `ordered checklist round-trip 失敗: ${(error as Error).message}`,
				duration,
			});
		} finally {
			try {
				if (host.parentElement) host.parentElement.removeChild(host);
			} catch {
				// noop
			}
		}
	}

	private async testCompatMixedChecklistMarkersFallback(): Promise<void> {
		const testName = "compat checklist: mixed ordered/unordered markers はフォールバックする";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const mixedMd = "- [ ] A\n1. [x] B";
			const html = normalizeMarkdownForTipTap(mixedMd, { enableRuby: false });

			assert(
				!html.includes('data-checked="false"') && !html.includes('data-checked="true"'),
				`mixed checklist が checklist HTML に正規化されています: ${html}`,
			);
			assert(
				html.includes("[ ] A") && html.includes("[x] B"),
				`mixed checklist の内容がフォールバックで保持されていません: ${html}`,
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "mixed ordered/unordered checklist は安全にフォールバックする",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `mixed checklist フォールバックテスト失敗: ${(error as Error).message}`,
				duration,
			});
		}
	}

	// ─── compat checklist toolbar: 段落から直接 checklist 化 ──────────────────

	private async testCompatChecklistToolbarFromParagraph(): Promise<void> {
		const testName = "compat checklist: toolbar ボタンで通常段落から checklist 化できる";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const labels = COMPAT_TOOLBAR_LIST_BUTTONS.map((b) => b.label);
			const taskIndex = labels.indexOf(t("toolbar.taskList"));
			assert(taskIndex >= 0, "checklist ボタン定義がありません");

			const taskButton = COMPAT_TOOLBAR_LIST_BUTTONS[taskIndex];

			// checklist-commands の toggleChecklistInSelection が
			// listItem が無い場合に toggleBulletList を呼ぶことを確認
			let bulletListToggled = false;
			let checklistSetCount = 0;

			// listItem が見つからない場合の mock editor
			const listItems: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
			const mockEditor = {
				isActive: () => false,
				chain: () => ({
					focus: () => ({
						toggleBulletList: () => ({
							run: () => {
								bulletListToggled = true;
								// toggleBulletList 後に listItem が生まれたことをシミュレート
								listItems.push({ pos: 1, attrs: { checked: null } });
								return true;
							},
						}),
						toggleOrderedList: () => ({ run: () => true }),
					}),
				}),
				state: {
					selection: { from: 0, to: 10 },
					doc: {
						nodesBetween: (
							_from: number,
							_to: number,
							callback: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void,
						) => {
							for (const item of listItems) {
								callback(
									{ type: { name: "listItem" }, attrs: item.attrs },
									item.pos,
								);
							}
						},
					},
					tr: {
						setNodeMarkup: (pos: number, _type: undefined, attrs: Record<string, unknown>) => {
							checklistSetCount++;
							// listItems の attrs を更新
							const item = listItems.find((i) => i.pos === pos);
							if (item) item.attrs = attrs;
							return mockEditor.state.tr;
						},
					},
				},
				view: {
					dispatch: () => {},
				},
			};

			// checklist ボタンを実行（段落状態）
			taskButton.run(
				mockEditor as unknown as Parameters<typeof taskButton.run>[0],
			);

			assert(
				bulletListToggled,
				"listItem が無い場合に toggleBulletList が呼ばれていません",
			);
			assert(
				checklistSetCount > 0,
				"checklist 属性が設定されていません",
			);
			assert(
				listItems[0]?.attrs.checked === false,
				`checklist 化後の checked が false ではありません: ${listItems[0]?.attrs.checked}`,
			);

			// checklist active 判定
			assert(
				taskButton.isActive(
					mockEditor as unknown as Parameters<typeof taskButton.isActive>[0],
				),
				"checklist 化後に active 判定が true になっていません",
			);

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "通常段落から checklist ボタン 1 回で checklist 化できる",
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: false,
				message: `checklist toolbar テスト失敗: ${(error as Error).message}`,
				duration,
			});
		}
	}
}

/**
 * 簡単なヘルスチェック関数
 */
export async function runHealthCheck(): Promise<boolean> {
	const testSuite = new TategakiTestSuite();
	const results = await testSuite.runAllTests();
	
	// 縦書き固有のテストも実行
	const layoutTest = await testSuite.testVerticalLayoutBasics();
	const caretTest = await testSuite.testCaretPositioning();
	
	results.push(layoutTest, caretTest);
	
	const failed = results.filter(r => !r.success);
	
	if (failed.length > 0) {
		debugWarn("Health check failed:", failed);
		return false;
	}
	
	return true;
}
