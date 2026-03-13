/**
 * SoT Pointer Strategy – pointerdownターゲットの分類
 *
 * ポインタが当たった要素を分析し、ネイティブ選択を優先すべきか、
 * 既存SoT選択を維持すべきかを判定する。
 * すべての関数は **純関数** であり副作用を持たない。
 *
 * PR4: 通常テキスト領域はネイティブ選択優先、widget領域は既存SoT選択維持。
 * PR4a: 特殊UIクリック時にnative補助系の副作用を発生させない。
 */

/** ポインタターゲットに対する選択戦略 */
export type PointerStrategy =
	| "native-first"
	| "preserve-existing"
	| "fallback-sot";

/**
 * widget行と判定される data-md-kind 値の集合。
 * sot-pointer.ts getOffsetFromPointerEvent (行650-662) と同一の列挙。
 */
const WIDGET_MD_KINDS = new Set([
	"image-widget",
	"embed-widget",
	"math-widget",
	"math-hidden",
	"callout-widget",
	"callout-hidden",
	"table-widget",
	"table-hidden",
	"deflist-widget",
	"deflist-hidden",
	"heading-hidden",
]);

/**
 * 特殊UIセレクタ: クリック時に専用ハンドラが処理するため
 * native選択を発動させず preserve-existing を返す。
 */
const SPECIAL_UI_SELECTOR = [
	".tategaki-md-task-box",
	".tategaki-md-heading-toggle",
	".tategaki-md-callout-widget-content .callout-title",
	".tategaki-md-callout-widget-content .callout-fold",
	'.tategaki-sot-run[data-href]',
	".tategaki-md-embed-widget-content a",
	"a[href]",
].join(",");

/**
 * pointerdownのターゲット要素から選択戦略を判定する。
 *
 * 判定優先順:
 * 1. target が null → "fallback-sot"
 * 2. target が .tategaki-md-inline-widget 内 → "preserve-existing"
 * 3. target が特殊UI要素またはその子孫 → "preserve-existing"
 * 4. target が .tategaki-sot-line 内で data-md-kind が widget 系 → "preserve-existing"
 * 5. target が .tategaki-sot-line 内で通常テキスト行 → "native-first"
 * 6. 上記いずれにも該当しない → "fallback-sot"
 */
export function classifyPointerTarget(
	target: HTMLElement | null,
): PointerStrategy {
	if (!target) return "fallback-sot";

	// inline widget
	const inlineWidget = target.closest(
		".tategaki-md-inline-widget",
	) as HTMLElement | null;
	if (inlineWidget) return "preserve-existing";

	// 特殊UI（タスク、見出し折りたたみ、callout、リンク等）
	if (target.closest(SPECIAL_UI_SELECTOR)) return "preserve-existing";

	const lineEl = target.closest(
		".tategaki-sot-line",
	) as HTMLElement | null;
	if (!lineEl) return "fallback-sot";

	const mdKind = lineEl.dataset.mdKind ?? "";
	if (WIDGET_MD_KINDS.has(mdKind)) return "preserve-existing";

	return "native-first";
}
