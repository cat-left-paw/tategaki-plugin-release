export type SoTViewDomRefs = {
	toolbarLeft: HTMLElement;
	content: HTMLElement;
	pageContainerEl: HTMLElement;
	borderWrapperEl: HTMLElement;
	contentWrapperEl: HTMLElement;
	loadingOverlayEl: HTMLElement;
	derivedRootEl: HTMLElement;
	derivedContentEl: HTMLElement;
	selectionLayerEl: HTMLElement;
	caretEl: HTMLElement;
	pendingEl: HTMLElement;
};

export function buildSoTViewDom(
	container: HTMLElement,
	backgroundColor: string
): SoTViewDomRefs {
	container.empty();
	container.addClass("tategaki-sot-view-container");

	const toolbarRow = container.createDiv("tategaki-sot-toolbar-row");

	const toolbarLeft = toolbarRow.createDiv("tategaki-sot-toolbar-left");

	const content = container.createDiv("tategaki-sot-content");

	const pageContainerEl = content.createDiv("tategaki-sot-page-container");

	const borderWrapperEl = pageContainerEl.createDiv(
		"tategaki-sot-border-wrapper",
	);
	borderWrapperEl.style.setProperty("--tategaki-sot-runtime-bg", backgroundColor);

	const contentWrapperEl = borderWrapperEl.createDiv(
		"tategaki-sot-content-wrapper",
	);
	contentWrapperEl.style.setProperty("--tategaki-sot-runtime-bg", backgroundColor);

	const loadingOverlayEl = contentWrapperEl.createDiv(
		"tategaki-sot-loading-overlay",
	);
	const loadingMessage = loadingOverlayEl.createDiv(
		"tategaki-sot-loading-message",
	);
	loadingMessage.textContent = "読み込み中…";

	const derivedRootEl = contentWrapperEl.createDiv("tategaki-sot-derived-root");
	derivedRootEl.tabIndex = 0;
	const derivedContentEl = derivedRootEl.createDiv(
		"tategaki-sot-derived-content",
	);
	const selectionLayerEl = derivedRootEl.createDiv(
		"tategaki-sot-selection-layer",
	);
	const caretEl = derivedRootEl.createDiv("tategaki-sot-caret");
	const pendingEl = derivedRootEl.createDiv("tategaki-sot-pending");

	return {
		toolbarLeft,
		content,
		pageContainerEl,
		borderWrapperEl,
		contentWrapperEl,
		loadingOverlayEl,
		derivedRootEl,
		derivedContentEl,
		selectionLayerEl,
		caretEl,
		pendingEl,
	};
}
