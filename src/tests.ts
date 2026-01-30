/**
 * 回帰テストとバリデーション機能
 */

import { DEFAULT_V2_SETTINGS, validateV2Settings } from "./types/settings";
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
	import {
		createTipTapMarkdownAdapter,
		normalizeMarkdownForTipTap,
		protectIndentation,
		restoreIndentation,
	} from "./wysiwyg/tiptap-compat/markdown-adapter";
	import { AozoraRubyNode } from "./wysiwyg/tiptap-compat/extensions/aozora-ruby";
import {
	calculatePagedPageCount,
	calculatePagedScrollTop,
} from "./wysiwyg/reading-mode/paged-reading-mode";
import { debugWarn } from "./shared/logger";
import { compareSemver } from "./shared/version";
import { computeLineRanges } from "./wysiwyg/sot/line-ranges";

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
			await this.testTipTapCompatBlockquoteSerializationAddsBlankLine();
			await this.testTipTapCompatRubyCaretNavigation();
			await this.testPagedReadingModePaginationMath();
			await this.testSoTLineRanges();
			await this.testVersionCompare();
			
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
			const html = MarkdownConverter.markdownToHtml(markdown);
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
			const model = markdownToDocument(markdown);
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
			const richModel = markdownToDocument(htmlHeavyMarkdown);
			const richRoundTrip = documentToMarkdown(richModel);
			if (/__PRESERVED_TAG_\d+__/.test(richRoundTrip) || richRoundTrip.includes('HTMLTAG')) {
				throw new Error('HTMLプレースホルダーがMarkdownに残存しています');
			}
			if (!richRoundTrip.includes('<span style="color:red">強調</span>') || !richRoundTrip.includes('<ruby>漢字<rt>かんじ</rt></ruby>')) {
				throw new Error('属性付きHTMLの復元に失敗しています');
			}

			const html = documentToHtml(model);
			const restored = htmlToDocument(html);
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
			const singleTokens = this.simulatePreviewTokens(
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

			const doubleTokens = this.simulatePreviewTokens(
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
				} catch (_error) {}
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

	private simulatePreviewTokens(markdown: string): string[] {
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
				const html = MarkdownConverter.markdownToHtml(line).trim();
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
			range.setStart(testEditor.firstChild!, 2);
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
