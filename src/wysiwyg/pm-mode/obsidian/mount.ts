import { pmModeStylesheet } from "./styles/stylesheet";
import { computePmModeStyle } from "./styles/settings-style";
import { attachPmModeWheelScroll } from "./wheel-scroll";
import type { CommonSettings, TategakiV2Settings } from "../../../types/settings";

type ConstructableSheet = CSSStyleSheet & { replaceSync(css: string): void };
type AdoptedRoot = ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] };
type MountWindow = Window & { CSSStyleSheet: new () => ConstructableSheet; ResizeObserver: typeof ResizeObserver };
export interface PmModeMount {
	host: HTMLElement;
	shadowRoot: ShadowRoot;
	scroll: HTMLElement;
	pmHost: HTMLElement;
	updateSettings(settings: TategakiV2Settings, common?: CommonSettings): void;
	destroy(): void;
}
/**
 * One sheet, one ResizeObserver and one wheel listener (V's sideways wheel) per view; all DOM APIs come from its realm.
 * `onResize` is called after the view's size changed (not for the first notification at the same size), with
 * which dimension changed (the height is the length of the lines in vertical writing, the width in horizontal).
 */
export function createPmModeMount(container: HTMLElement, settings: TategakiV2Settings, common?: CommonSettings, onResize?: (changed: { height: boolean; width: boolean }) => void): PmModeMount {
	const doc = container.ownerDocument;
	const win = doc.defaultView as MountWindow | null;
	if (!win) throw new Error("PM mode: no view window");
	const host = doc.createElement("tategaki-pm-host");
	// Modal.close restores document.activeElement, the shadow host. Programmatic focus only.
	host.tabIndex = -1;
	const shadowRoot = host.attachShadow({ mode: "open" }) as AdoptedRoot;
	const sheet = new win.CSSStyleSheet();
	sheet.replaceSync(pmModeStylesheet);
	shadowRoot.adoptedStyleSheets = [sheet];
	const page = doc.createElement("div");
	page.className = "tategaki-pm-page";
	const border = doc.createElement("div");
	border.className = "tategaki-pm-page-border";
	const scroll = doc.createElement("div");
	scroll.className = "tategaki-pm-scroll";
	const pmHost = doc.createElement("div");
	scroll.appendChild(pmHost); border.appendChild(scroll); page.appendChild(border); shadowRoot.appendChild(page);
	container.appendChild(host);
	let frameVerticalPadding = 0, contentHeight = container.clientHeight, contentWidth = container.clientWidth, destroyed = false, vertical = true;
	// The height goes on the scroll element and the root themselves (vertical: the root's height, the length
	// of the lines; horizontal: its least height), not into an inherited variable: changing an inherited
	// variable restyles every element of the text (chunked-skip design §8.3, RESIZE-STYLE1). ProseMirror
	// ignores attribute changes on its root.
	function applyHeight(): void {
		const value = `${Math.max(0, contentHeight - frameVerticalPadding)}px`;
		scroll.style.height = value;
		// D-C-24 (F-9): in vertical writing the root is as tall as the scroll element's client box (`100%`: a classic scrollbar along the bottom takes its thickness off it), not as the px of the
		// scroll element's outer box: with that, the lines overflowed vertically by the thickness of the horizontal scrollbar and a vertical scrollbar (which the writing never scrolls along) came up.
		pmHost.style.height = vertical ? "100%" : "";
		pmHost.style.minHeight = vertical ? "" : value;
	}
	function updateSettings(next: TategakiV2Settings, effective?: CommonSettings): void {
		const style = computePmModeStyle(next, effective);
		for (const [name, value] of Object.entries(style.variables)) host.style.setProperty(name, value);
		frameVerticalPadding = style.frameVerticalPadding;
		vertical = style.writingMode.startsWith("vertical");
		applyHeight();
	}
	updateSettings(settings, common);
	const detachWheel = attachPmModeWheelScroll(scroll, () => vertical);
	const observer = new win.ResizeObserver(entries => {
		if (destroyed) return;
		const entry = entries.find(item => item.target === container);
		if (!entry) return;
		const changed = { height: entry.contentRect.height !== contentHeight, width: entry.contentRect.width !== contentWidth };
		contentHeight = entry.contentRect.height;
		contentWidth = entry.contentRect.width;
		applyHeight();
		if (changed.height || changed.width) onResize?.(changed);
	});
	observer.observe(container);
	return { host, shadowRoot, scroll, pmHost, updateSettings, destroy: () => {
		if (destroyed) return;
		destroyed = true;
		observer.disconnect();
		detachWheel();
		shadowRoot.adoptedStyleSheets = [];
		host.remove();
	} };
}
