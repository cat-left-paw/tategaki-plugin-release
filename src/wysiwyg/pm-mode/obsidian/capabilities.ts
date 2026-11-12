export interface PmModeCapabilities {
	available: boolean;
	unavailableReason: string | null;
	rangeDisplay: "custom-highlight" | "rect-layer";
	scrollAnchoring: "native" | "degraded";
}
interface RuntimeWindow {
	document: { createElement(tag: string): { contentEditable: string }; caretRangeFromPoint?: unknown; caretPositionFromPoint?: unknown };
	Intl?: { Segmenter?: unknown };
	CSS?: { highlights?: unknown; supports?(property: string, value: string): boolean };
	Highlight?: unknown;
	ResizeObserver?: unknown;
	CSSStyleSheet?: { prototype: { replaceSync?: unknown } };
	ShadowRoot?: { prototype: object };
	HTMLElement?: { prototype: { attachShadow?: unknown } };
}
/** Probe only the supplied realm; no DOM insertion, global access, subscriptions or cache. */
export function resolvePmModeCapabilities(win: Window): PmModeCapabilities {
	const runtime = win as unknown as RuntimeWindow;
	let plaintextOnly = false;
	try {
		const element = runtime.document.createElement("div");
		element.contentEditable = "plaintext-only";
		plaintextOnly = element.contentEditable === "plaintext-only";
	} catch { /* Unsupported setters can throw. */ }
	const missing: string[] = [];
	if (!plaintextOnly) missing.push("contenteditable=plaintext-only");
	if (typeof runtime.Intl?.Segmenter !== "function") missing.push("Intl.Segmenter");
	if (typeof runtime.ResizeObserver !== "function") missing.push("ResizeObserver");
	if (typeof runtime.document.caretRangeFromPoint !== "function" && typeof runtime.document.caretPositionFromPoint !== "function") missing.push("caretRangeFromPoint / caretPositionFromPoint");
	if (typeof runtime.HTMLElement?.prototype.attachShadow !== "function" || !runtime.ShadowRoot || !("adoptedStyleSheets" in runtime.ShadowRoot.prototype) || typeof runtime.CSSStyleSheet?.prototype.replaceSync !== "function") missing.push("Shadow DOM / constructable stylesheet");
	let scrollAnchoring: PmModeCapabilities["scrollAnchoring"] = "degraded";
	try { if (runtime.CSS?.supports?.("overflow-anchor", "none") && runtime.CSS.supports("scroll-margin", "5px")) scrollAnchoring = "native"; } catch { /* Degraded capability is still available. */ }
	return {
		available: missing.length === 0,
		unavailableReason: missing.length ? missing.join(", ") : null,
		rangeDisplay: runtime.CSS?.highlights && typeof runtime.Highlight === "function" ? "custom-highlight" : "rect-layer",
		scrollAnchoring,
	};
}
