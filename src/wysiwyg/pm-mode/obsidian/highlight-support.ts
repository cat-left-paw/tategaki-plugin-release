// Reference: src/pm-mode-spike/diagnostics.ts (the highlight registry types) and rangeDisplay.ts. No import from the spike.
// CSS Custom Highlight, shared by the composing-text paint and the range presenter.

export type HighlightWindow = Window & {
	CSS?: { highlights?: Map<string, unknown> };
	Highlight?: new (...ranges: Range[]) => unknown;
};

let sequence = 0;
/** A highlight name unique in the document: two views of one window never share a registry entry. */
export function nextHighlightName(kind: "preedit" | "range"): string {
	return `tategaki-pm-${kind}-${++sequence}`;
}

export function highlightWindow(element: Element): HighlightWindow {
	const win = element.ownerDocument.defaultView;
	if (!win) throw new Error("PM mode: no window for the highlight");
	return win as HighlightWindow;
}

export function highlightsSupported(win: HighlightWindow): boolean {
	return !!(win.CSS?.highlights && win.Highlight);
}

/**
 * A `<style>` for `::highlight(name)` rules, in the same tree as the painted text (a rule in the document's
 * head does not reach text inside a shadow tree). It is removed with the owner.
 */
export function appendHighlightStyle(treeRoot: Node, css: string, marker: string): HTMLStyleElement {
	const doc = treeRoot.nodeType === 9 ? (treeRoot as Document) : treeRoot.ownerDocument;
	if (!doc) throw new Error("PM mode: no document for the highlight style");
	const style = doc.createElement("style");
	style.dataset[marker] = "true";
	style.textContent = css;
	if (treeRoot.nodeType === 9) doc.head.appendChild(style); else treeRoot.appendChild(style);
	return style;
}
