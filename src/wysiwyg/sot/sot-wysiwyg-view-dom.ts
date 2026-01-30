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
	container.style.cssText = `
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	`;

	const toolbarRow = container.createDiv("tategaki-sot-toolbar-row");
	toolbarRow.style.cssText = `
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 0 0 auto;
		padding: 0;
		background: var(--background-secondary);
		border-bottom: 1px solid var(--background-modifier-border);
	`;

	const toolbarLeft = toolbarRow.createDiv();
	toolbarLeft.style.cssText = `
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	`;

	const content = container.createDiv("tategaki-sot-content");
	content.style.cssText = `
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	`;

	const pageContainerEl = content.createDiv("tategaki-sot-page-container");
	pageContainerEl.style.cssText = `
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		overflow: visible;
		padding: 40px 32px 22px 32px;
		background: transparent;
	`;

	const borderWrapperEl = pageContainerEl.createDiv(
		"tategaki-sot-border-wrapper",
	);
	borderWrapperEl.style.cssText = `
		position: relative;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		border: none !important;
		outline: none !important;
		border-radius: 0;
		background: ${backgroundColor} !important;
		box-shadow: 0 6px 12px rgba(0,0,0,0.4);
		box-sizing: border-box;
		overflow: hidden;
		transform-origin: center center;
		transform: scale(1);
	`;

	const contentWrapperEl = borderWrapperEl.createDiv(
		"tategaki-sot-content-wrapper",
	);
	contentWrapperEl.style.cssText = `
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: ${backgroundColor};
		color: var(--text-normal);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: none !important;
		outline: none !important;
	`;

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
