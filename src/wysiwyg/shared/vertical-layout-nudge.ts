/**
 * 縦書きの列境界レイアウト nudge（既定 ON）。SoT と書籍モードで共有する。
 *
 * 動機:
 *   縦書き表示で列高がギリギリのとき、会話文末の閉じカッコやルビを含む inline が
 *   列末付近に来ると、ブラウザの縦書きレイアウト境界判定により、見た目上は収まりそうな
 *   箇所でも次列へ送られることがある。SoT では `justify` により短くなった列が
 *   引き伸ばされ、文字間が不自然に広く見える場合がある。
 *
 *   閉じ約物終端の要素に一時的な透明 `::after` probe を生成し、1〜2 frame 後に外すと、
 *   ブラウザの縦書き inline layout tree が再構築され、不自然な分断が解消されるケースがある。
 *   常時有効化すると句読点・開き括弧側へ問題が移る副作用があるため、実験的 opt-in としてのみ提供する。
 *
 * 仕様（厳守事項）:
 *   - 保存データ / Markdown 本文 / source offset / DOM textContent / copy には一切手を入れない。
 *     probe は CSS `::after` 生成コンテンツのみで、DOM の textContent には現れない。
 *   - 付与するのは表示 DOM 限定の data 属性 (`data-tategaki-vnudge`) だけ。text node は分割しない。
 *   - probe は必ず 1〜2 `requestAnimationFrame` 後に除去する。常時残してはならない。
 *   - 連続 render / 設定 OFF / view destroy でも probe が積み残らないこと。
 *
 * 適用範囲は SoT（執筆・参照モード）と書籍モードの縦書きのみ。
 * TipTap compat 編集画面 / Nyoze / 横書きへは広げない。
 */

/** probe 付与対象とする閉じ約物（最小集合から開始）。 */
export const VERTICAL_LAYOUT_NUDGE_CLOSING_CHARS: ReadonlySet<string> = new Set([
	"」",
	"』",
	"）",
	"】",
	"》",
]);

/** probe を表す表示 DOM 限定の data 属性名。CSS `::after` のフックに使う。 */
export const VERTICAL_LAYOUT_NUDGE_DATA_ATTR = "data-tategaki-vnudge";

/** DOM Node.TEXT_NODE の値。global `Node` 非依存にするため数値定数を持つ。 */
const TEXT_NODE_TYPE = 3;

/**
 * テキスト末尾 1 文字（code point 単位）が対象の閉じ約物なら true。
 *
 * 保存データではなく「表示 DOM に現れている textContent」を見る前提。
 */
export function isClosingPunctuationNudgeTarget(
	text: string | null | undefined,
): boolean {
	if (!text) return false;
	const chars = Array.from(text);
	const last = chars[chars.length - 1];
	if (last === undefined) return false;
	return VERTICAL_LAYOUT_NUDGE_CLOSING_CHARS.has(last);
}

/**
 * 要素の「最後の子が text node かつ末尾が閉じ約物」なら true。
 *
 * 要素末尾の閉じ約物だけを対象にすることで、text node を分割せずに
 * `::after` を閉じ約物の直後へ付けられる。子要素を末尾に持つ要素は対象外になるため、
 * ネスト時は閉じ約物に最も近い内側の要素だけが選ばれる。
 */
function hasTrailingClosingPunctuationTextNode(el: Element): boolean {
	const last = el.lastChild;
	if (!last || last.nodeType !== TEXT_NODE_TYPE) return false;
	return isClosingPunctuationNudgeTarget(last.textContent);
}

/**
 * SoT 派生ビュー用の collect。
 * `.tategaki-sot-run` のうち、表示テキスト末尾が閉じ約物の run を集める。
 * 仮想化で DOM に存在しない（描画されていない）run は自然に対象外になる。
 */
export function collectSoTNudgeTargets(rootEl: ParentNode): HTMLElement[] {
	const runs = rootEl.querySelectorAll<HTMLElement>(".tategaki-sot-run");
	const targets: HTMLElement[] = [];
	runs.forEach((run) => {
		if (isClosingPunctuationNudgeTarget(run.textContent)) {
			targets.push(run);
		}
	});
	return targets;
}

/**
 * 書籍モード用の collect。
 * 縦書きページ (`.tategaki-page[data-writing-mode="vertical-rl"]`) の `.page-content` 配下で、
 * 「最後の子が text node かつ末尾が閉じ約物」の要素を集める。
 *
 * 横書きページ・測定用 staging 外の確定ページのみが対象になる（呼び出し側が確定後に渡す）。
 * native `<ruby>` 直後の閉じ約物は、その閉じ約物を末尾 text node に持つ親要素として拾われる。
 */
export function collectBookNudgeTargets(rootEl: ParentNode): HTMLElement[] {
	const contents = rootEl.querySelectorAll<HTMLElement>(
		'.tategaki-page[data-writing-mode="vertical-rl"] .page-content',
	);
	const targets: HTMLElement[] = [];
	contents.forEach((content) => {
		if (hasTrailingClosingPunctuationTextNode(content)) {
			targets.push(content);
		}
		const candidates = content.querySelectorAll<HTMLElement>("*");
		candidates.forEach((el) => {
			if (hasTrailingClosingPunctuationTextNode(el)) {
				targets.push(el);
			}
		});
	});
	return targets;
}

/** `requestAnimationFrame` / `cancelAnimationFrame` を抽象化（テストで差し替え可能にする）。 */
export interface VerticalLayoutNudgeScheduler {
	request(callback: () => void): number;
	cancel(handle: number): void;
}

/** root 配下から probe 対象要素を集める関数の型。 */
export type VerticalLayoutNudgeCollector = (root: ParentNode) => HTMLElement[];

const defaultScheduler: VerticalLayoutNudgeScheduler = {
	request: (callback) => window.requestAnimationFrame(callback),
	cancel: (handle) => window.cancelAnimationFrame(handle),
};

/**
 * 縦書き列境界 nudge の実行・後始末を担う controller。SoT / 書籍モードで共有する。
 *
 * `schedule(rootEl, collect)` で collect 関数が返す対象に probe 属性を付与し、
 * 2 フレーム後に必ず除去する。連続呼び出しや `cancel()` でも probe が積み残らない。
 */
export class VerticalLayoutNudge {
	private probedElements: HTMLElement[] = [];
	private rafHandle1: number | null = null;
	private rafHandle2: number | null = null;
	private readonly scheduler: VerticalLayoutNudgeScheduler;

	constructor(scheduler: VerticalLayoutNudgeScheduler = defaultScheduler) {
		this.scheduler = scheduler;
	}

	/**
	 * `collect(rootEl)` が返す対象に probe 属性を付与し、1〜2 rAF 後に必ず外す。
	 * 連続 render / 設定変更でも積み残らないよう、まず前回分の probe と pending rAF を片付ける。
	 *
	 * `onAfterCleanup` を渡すと、probe を実際に付与して 2 rAF 後の `clearProbes` を終えた直後に
	 * 同期的に 1 回だけ呼ぶ。`cancel()` 経由の即時除去や、`collect` が 0 件を返したケースでは
	 * 呼び出されない（probe を付けていない時点で caret 再測定をトリガする必要がないため）。
	 * 連続 schedule で前回分が cancel されると、その前回の `onAfterCleanup` は破棄される。
	 */
	schedule(
		rootEl: HTMLElement | null,
		collect: VerticalLayoutNudgeCollector,
		onAfterCleanup?: () => void,
	): void {
		this.cancel();
		if (!rootEl) return;
		const targets = collect(rootEl);
		if (targets.length === 0) return;
		for (const target of targets) {
			target.setAttribute(VERTICAL_LAYOUT_NUDGE_DATA_ATTR, "");
		}
		this.probedElements = targets;
		// layout tree を一度だけ刺激し、次フレームで戻す。
		this.rafHandle1 = this.scheduler.request(() => {
			this.rafHandle1 = null;
			this.rafHandle2 = this.scheduler.request(() => {
				this.rafHandle2 = null;
				this.clearProbes();
				onAfterCleanup?.();
			});
		});
	}

	/**
	 * pending な rAF を取り消し、付与済み probe を即時除去する。
	 * view destroy / 再描画前 / 設定 OFF 切替時に呼ぶ。
	 */
	cancel(): void {
		if (this.rafHandle1 !== null) {
			this.scheduler.cancel(this.rafHandle1);
			this.rafHandle1 = null;
		}
		if (this.rafHandle2 !== null) {
			this.scheduler.cancel(this.rafHandle2);
			this.rafHandle2 = null;
		}
		this.clearProbes();
	}

	/**
	 * 付与済み probe を全て除去する。付与した要素を直接保持して消すため、
	 * 属性セレクタに依存せず、再描画で要素が差し替わっても積み残らない。
	 */
	private clearProbes(): void {
		for (const el of this.probedElements) {
			el.removeAttribute(VERTICAL_LAYOUT_NUDGE_DATA_ATTR);
		}
		this.probedElements = [];
	}
}
