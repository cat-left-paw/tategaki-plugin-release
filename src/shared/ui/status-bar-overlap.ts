/**
 * Obsidian のステータスバー（main window の右下に浮かぶ `.status-bar`）が、
 * Tategaki のビューのスクロールバー（縦書きでは下端の横スクロールバー）を隠す件の対処。
 *
 * - "translucent": ステータスバーが Tategaki のビューに重なっている間は半透明にする。
 *   pointer がステータスバーの中で、その下にある Tategaki のスクロールバーの帯に来たときだけ
 *   ステータスバーを素通し（pointer-events: none）にして、さらに薄くする。
 *   その間は下のスクロールバー（ノブの drag・帯の click）を Chromium がそのまま扱う。
 * - "hide": main window の active leaf が Tategaki のビューの間、ステータスバーを隠す。
 * - "off": 何もしない（Obsidian のまま）。
 *
 * 各ビューの DOM には手を入れない。Tategaki のビューは leaf の `data-type` が `tategaki-` で始まることで見分け、
 * スクロールする要素は pointer の位置の要素から祖先へたどって見つける。
 * ステータスバーは main window にだけあり（popout と mobile にはない）、ここも main window の document だけを見る。
 */

import type { StatusBarOverlapMode } from "../../types/settings";

export const STATUS_BAR_TRANSLUCENT_CLASS = "tategaki-status-bar-translucent";
export const STATUS_BAR_PASS_THROUGH_CLASS = "tategaki-status-bar-pass-through";
export const STATUS_BAR_HIDDEN_BODY_CLASS = "tategaki-status-bar-hidden";

const STATUS_BAR_SELECTOR = ".app-container > .status-bar";
const TATEGAKI_LEAF_SELECTOR = '.workspace-leaf-content[data-type^="tategaki-"]';
const ACTIVE_TATEGAKI_LEAF_SELECTOR = `.workspace-leaf.mod-active > ${TATEGAKI_LEAF_SELECTOR}`;

/**
 * 幅を取らないスクロールバー（macOS の overlay scrollbar など）のときに素通しにする帯の太さ（px）。
 * 幅を取るスクロールバーは、その実際の太さを使う。
 */
export const OVERLAY_SCROLLBAR_BAND_PX = 12;

export interface StatusBarOverlapEvents {
	/**
	 * active leaf・layout・CSS が変わりうるときに `refresh` を呼ぶよう登録し、登録を外す関数を返す。
	 * plugin では workspace の `active-leaf-change`・`layout-change`・`css-change` を渡す。
	 */
	subscribe(refresh: () => void): () => void;
}

type Rect = { left: number; top: number; right: number; bottom: number };

function hasArea(rect: Rect): boolean {
	return rect.right > rect.left && rect.bottom > rect.top;
}

function intersects(a: Rect, b: Rect): boolean {
	return (
		a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
	);
}

function contains(rect: Rect, x: number, y: number): boolean {
	return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function scrolls(overflow: string): boolean {
	return overflow === "auto" || overflow === "scroll";
}

export class StatusBarOverlapController {
	private mode: StatusBarOverlapMode = "off";
	private unsubscribe: (() => void) | null = null;
	private listeners: AbortController | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private readonly observed = new Set<Element>();
	private frame = 0;
	private statusBar: HTMLElement | null = null;
	private statusBarRect: Rect | null = null;
	private overlapping = false;
	private passThrough = false;

	constructor(
		private readonly doc: Document,
		private readonly events: StatusBarOverlapEvents,
	) {}

	getMode(): StatusBarOverlapMode {
		return this.mode;
	}

	setMode(mode: StatusBarOverlapMode): void {
		if (mode === this.mode) {
			this.scheduleRefresh();
			return;
		}
		this.stop();
		this.mode = mode;
		if (mode !== "off") {
			this.start();
		}
	}

	destroy(): void {
		this.stop();
		this.mode = "off";
	}

	/** layout を読み直して、ステータスバーと body の class を今の状態に合わせる（試験からも呼ぶ）。 */
	refresh(): void {
		if (this.mode === "off") return;
		const body = this.doc.body;
		if (this.mode === "hide") {
			body.classList.toggle(
				STATUS_BAR_HIDDEN_BODY_CLASS,
				this.doc.querySelector(ACTIVE_TATEGAKI_LEAF_SELECTOR) !== null,
			);
			return;
		}

		const statusBar = this.doc.querySelector<HTMLElement>(STATUS_BAR_SELECTOR);
		if (statusBar !== this.statusBar) {
			this.clearStatusBarClasses();
			this.statusBar = statusBar;
		}
		const leaves = Array.from(
			this.doc.querySelectorAll<HTMLElement>(TATEGAKI_LEAF_SELECTOR),
		);
		this.observe(statusBar ? [statusBar, ...leaves] : leaves);
		if (!statusBar) {
			this.statusBarRect = null;
			this.setOverlapping(false);
			return;
		}
		const sbRect = statusBar.getBoundingClientRect();
		this.statusBarRect = sbRect;
		const overlapping =
			hasArea(sbRect) &&
			leaves.some((leaf) => {
				const rect = leaf.getBoundingClientRect();
				return hasArea(rect) && intersects(rect, sbRect);
			});
		this.setOverlapping(overlapping);
	}

	/** pointer の位置 (x, y) で、ステータスバーの下に Tategaki のスクロールバーの帯があるか。 */
	isOverTategakiScrollbar(x: number, y: number): boolean {
		const statusBar = this.statusBar;
		const win = this.doc.defaultView;
		if (!statusBar || !win) return false;
		for (const hit of this.doc.elementsFromPoint(x, y)) {
			if (statusBar.contains(hit)) continue;
			const leaf = hit.closest(TATEGAKI_LEAF_SELECTOR);
			if (!leaf) return false;
			for (
				let el: Element | null = hit;
				el && el !== leaf.parentElement;
				el = el.parentElement
			) {
				if (this.inScrollbarBand(win, el, x, y)) return true;
			}
			return false;
		}
		return false;
	}

	private start(): void {
		const win = this.doc.defaultView;
		this.unsubscribe = this.events.subscribe(() => this.scheduleRefresh());
		this.listeners = new AbortController();
		const { signal } = this.listeners;
		win?.addEventListener("resize", () => this.scheduleRefresh(), { signal });
		if (this.mode === "translucent") {
			// capture: ビューが pointermove の伝播を止めても受け取れるように。
			this.doc.addEventListener(
				"pointermove",
				(event) => this.onPointerMove(event),
				{ capture: true, passive: true, signal },
			);
			if (win && typeof win.ResizeObserver === "function") {
				this.resizeObserver = new win.ResizeObserver(() =>
					this.scheduleRefresh(),
				);
			}
		}
		this.refresh();
	}

	private stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.listeners?.abort();
		this.listeners = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.observed.clear();
		if (this.frame) {
			this.doc.defaultView?.cancelAnimationFrame(this.frame);
			this.frame = 0;
		}
		this.clearStatusBarClasses();
		this.statusBar = null;
		this.statusBarRect = null;
		this.doc.body.classList.remove(STATUS_BAR_HIDDEN_BODY_CLASS);
	}

	private scheduleRefresh(): void {
		const win = this.doc.defaultView;
		if (this.mode === "off" || !win || this.frame) return;
		this.frame = win.requestAnimationFrame(() => {
			this.frame = 0;
			this.refresh();
		});
	}

	/** 見ている要素の組を差分で入れ替える（observe し直すと、そのたびに通知が来て refresh が回り続けるため）。 */
	private observe(elements: Element[]): void {
		const observer = this.resizeObserver;
		if (!observer) return;
		const next = new Set(elements);
		for (const el of this.observed) {
			if (!next.has(el)) {
				observer.unobserve(el);
				this.observed.delete(el);
			}
		}
		for (const el of next) {
			if (!this.observed.has(el)) {
				observer.observe(el);
				this.observed.add(el);
			}
		}
	}

	private onPointerMove(event: PointerEvent): void {
		if (!this.overlapping) return;
		// ボタンを押している間（ノブの drag 中など）は切り替えない。離した後の次の移動で決め直す。
		if (event.buttons !== 0) return;
		const rect = this.statusBarRect;
		const inside =
			rect !== null && contains(rect, event.clientX, event.clientY);
		this.setPassThrough(
			inside && this.isOverTategakiScrollbar(event.clientX, event.clientY),
		);
	}

	private inScrollbarBand(win: Window, el: Element, x: number, y: number): boolean {
		const box = el as HTMLElement;
		if (typeof box.offsetHeight !== "number") return false;
		const scrollsX = box.scrollWidth > box.clientWidth + 1;
		const scrollsY = box.scrollHeight > box.clientHeight + 1;
		if (!scrollsX && !scrollsY) return false;
		const style = win.getComputedStyle(box);
		// scrollbar-width: none の要素（書籍モードのページなど）は、見えるスクロールバーを持たない。
		if (style.getPropertyValue("scrollbar-width") === "none") return false;
		const rect = box.getBoundingClientRect();
		const borderTop = parseFloat(style.borderTopWidth) || 0;
		const borderRight = parseFloat(style.borderRightWidth) || 0;
		const borderBottom = parseFloat(style.borderBottomWidth) || 0;
		const borderLeft = parseFloat(style.borderLeftWidth) || 0;
		if (scrollsX && scrolls(style.overflowX)) {
			const thickness =
				box.offsetHeight - box.clientHeight - borderTop - borderBottom;
			const band = thickness > 0 ? thickness : OVERLAY_SCROLLBAR_BAND_PX;
			const bottom = rect.bottom - borderBottom;
			if (
				y <= bottom &&
				y >= bottom - band &&
				x >= rect.left &&
				x <= rect.right
			) {
				return true;
			}
		}
		if (scrollsY && scrolls(style.overflowY)) {
			const thickness =
				box.offsetWidth - box.clientWidth - borderLeft - borderRight;
			const band = thickness > 0 ? thickness : OVERLAY_SCROLLBAR_BAND_PX;
			const right = rect.right - borderRight;
			if (
				x <= right &&
				x >= right - band &&
				y >= rect.top &&
				y <= rect.bottom
			) {
				return true;
			}
		}
		return false;
	}

	private setOverlapping(overlapping: boolean): void {
		this.overlapping = overlapping;
		this.statusBar?.classList.toggle(STATUS_BAR_TRANSLUCENT_CLASS, overlapping);
		if (!overlapping) this.setPassThrough(false);
	}

	private setPassThrough(passThrough: boolean): void {
		if (passThrough === this.passThrough) return;
		this.passThrough = passThrough;
		this.statusBar?.classList.toggle(STATUS_BAR_PASS_THROUGH_CLASS, passThrough);
	}

	private clearStatusBarClasses(): void {
		this.statusBar?.classList.remove(
			STATUS_BAR_TRANSLUCENT_CLASS,
			STATUS_BAR_PASS_THROUGH_CLASS,
		);
		this.overlapping = false;
		this.passThrough = false;
	}
}
