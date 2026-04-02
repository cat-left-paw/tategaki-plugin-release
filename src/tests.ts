/**
 * 回帰テストとバリデーション機能
 */

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
import { computeLineRanges } from "./wysiwyg/sot/line-ranges";
import {
	resolveEnsureLineRenderedTargetIndex,
	resolveLineElementFromChildren,
} from "./wysiwyg/sot/sot-line-element-contract";
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
import { SoTChunkController } from "./wysiwyg/sot/sot-chunk-controller";
import { probeChunkSnapshot } from "./wysiwyg/sot/sot-chunk-read-probe";
import {
	decideOnPointerDown,
	shouldHandleNativeSelectionMouseUpFallback,
} from "./wysiwyg/sot/sot-native-selection-assist";
import { SoTSelectionChangeBinding } from "./wysiwyg/sot/sot-selectionchange-binding";
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
import { SoTPointerWindowBinding } from "./wysiwyg/sot/sot-pointer-window-binding";
import { collectAutoTcyRanges } from "./shared/aozora-tcy";
import { SoTRenderPipeline, type SoTRenderPipelineContext } from "./wysiwyg/sot/sot-render-pipeline";
import { normalizeParsed, parseFrontmatterBlock } from "./shared/frontmatter";
import { Window } from "happy-dom";

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
		await this.testDefaultSettings();
		await this.testCSSVariables();
		await this.testDOMElements();
		await this.testAozoraRubyConversion();
		await this.testBlockEditorConversion();
			await this.testPreviewHeadingSpacing();
			await this.testTipTapCompatStrictLineNormalization();
			await this.testTipTapCompatHeadingIndentationPreserved();
			await this.testTipTapCompatRubyDisabledFlattensRuby();
		await this.testTipTapCompatTcyRoundTrip();
			await this.testAutoTcyRangeDetection();
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
				await this.testSoTPointerWindowBindingRebindsWindow();
				await this.testSoTNativeSelectionAssistPointerdownPolicy();
				await this.testSoTSelectionChangeBindingRebindsDocument();
				await this.testSoTLineElementContract();
				await this.testVersionCompare();
				await this.testOnScrollSettledPreciseFirst();
				await this.testFrontmatterParsing();

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
				message: `行レンジ計算エラー: ${error.message}`,
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
			if (invalidMode.wysiwyg.sotSelectionMode !== "native-drag") {
				throw new Error("sotSelectionModeの不正値がnative-dragにフォールバックしない");
			}
			// sotSelectionMode バリデーション: 有効値は保持
			const validMode = validateV2Settings({
				wysiwyg: { sotSelectionMode: "native-drag" },
			});
			if (validMode.wysiwyg.sotSelectionMode !== "native-drag") {
				throw new Error("sotSelectionModeの有効値native-dragが保持されない");
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
			if (defaults.wysiwyg.sotSelectionMode !== "native-drag") {
				throw new Error("sotSelectionModeのデフォルトがnative-dragでない");
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
				const markdown = "時刻は｟12｠です";
				const normalized = normalizeMarkdownForTipTap(
					protectIndentation(markdown)
				);
				if (!normalized.includes('data-tategaki-tcy="1"')) {
					throw new Error("｟..｠ がTCY spanに変換されていません");
				}

				document.body.appendChild(host);
				const editor = new Editor({
					element: host,
					extensions: [Document, Paragraph, Text, AozoraTcyNode],
					content:
						'<p>時刻は<span class="tategaki-md-tcy" data-tategaki-tcy="1">12</span>です</p>',
				});

				try {
					const adapter = createTipTapMarkdownAdapter(editor);
					const roundTrip = adapter.getMarkdown();
					if (!roundTrip.includes("｟12｠")) {
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
		const testName = "自動TCY抽出（英数字2-4文字 + !!/!?/??）";
		const startTime = performance.now();

		try {
			const assert = (condition: boolean, message: string) => {
				if (!condition) throw new Error(message);
			};

			const sample = "A 12 !! !? ?? ABCD HELLO ｟34｠ B9";
			const ranges = collectAutoTcyRanges(sample);
			const bodies = ranges.map((range) => range.text);

			assert(bodies.includes("12"), "12 が抽出されていません");
			assert(bodies.includes("!!"), "!! が抽出されていません");
			assert(bodies.includes("!?"), "!? が抽出されていません");
			assert(bodies.includes("??"), "?? が抽出されていません");
			assert(bodies.includes("ABCD"), "ABCD が抽出されていません");
			assert(bodies.includes("B9"), "B9 が抽出されていません");
			assert(!bodies.includes("HELLO"), "5文字英字は抽出対象外です");
			assert(!bodies.includes("34"), "明示TCY内の本文は抽出対象外です");

			const duration = performance.now() - startTime;
			this.results.push({
				name: testName,
				success: true,
				message: "自動TCYの抽出条件が期待通りです",
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
