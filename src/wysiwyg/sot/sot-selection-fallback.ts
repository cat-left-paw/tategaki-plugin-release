import type { SoTEditor } from "./sot-editor";
import type { SoTSelectionOverlay } from "./sot-selection-overlay";

export type NativeSelectionFallbackParams = {
	isNativeSelectionEnabled: boolean;
	overlayFocused: boolean;
	ceImeMode: boolean;
	sourceModeEnabled: boolean;
	derivedRootEl: HTMLElement | null;
	derivedContentEl: HTMLElement | null;
	selectionLayerEl: HTMLElement | null;
	sotEditor: SoTEditor | null;
	totalLines: number;
	selectionOverlay: SoTSelectionOverlay | null;
	isSelectionInsideDerivedContent: (selection: Selection) => boolean;
};

export function tryRenderNativeSelectionFallback(
	params: NativeSelectionFallbackParams,
): boolean {
	if (!params.isNativeSelectionEnabled) return false;
	if (!params.overlayFocused) return false;
	if (params.ceImeMode) return false;
	if (params.sourceModeEnabled) return false;
	if (!params.derivedRootEl) return false;
	if (!params.derivedContentEl) return false;
	if (!params.selectionLayerEl) return false;
	if (!params.sotEditor) return false;

	const domSelection =
		params.derivedContentEl.ownerDocument.getSelection() ?? null;
	const domSelectionActive =
		!!domSelection &&
		params.isSelectionInsideDerivedContent(domSelection) &&
		!domSelection.isCollapsed;
	if (domSelectionActive) return false;

	const selection = params.sotEditor.getSelection();
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	if (from === to) {
		params.selectionLayerEl.replaceChildren();
		return true;
	}

	const docLength = params.sotEditor.getDoc().length;
	const isLargeSelection = docLength >= 200000 || params.totalLines >= 2000;
	if (from === 0 && to === docLength && isLargeSelection) {
		params.selectionLayerEl.replaceChildren();
		const rootRect = params.derivedRootEl.getBoundingClientRect();
		const contentRect = params.derivedContentEl.getBoundingClientRect();
		const left = Math.max(rootRect.left, contentRect.left);
		const right = Math.min(rootRect.right, contentRect.right);
		const top = Math.max(rootRect.top, contentRect.top);
		const bottom = Math.min(rootRect.bottom, contentRect.bottom);
		const width = Math.max(0, right - left);
		const height = Math.max(0, bottom - top);
		if (width > 0 && height > 0) {
			const overlay = document.createElement("div");
			overlay.className = "tategaki-sot-selection-rect";
			const offsetLeft =
				left - rootRect.left + params.derivedRootEl.scrollLeft;
			const offsetTop =
				top - rootRect.top + params.derivedRootEl.scrollTop;
			overlay.style.left = `${offsetLeft}px`;
			overlay.style.top = `${offsetTop}px`;
			overlay.style.width = `${width}px`;
			overlay.style.height = `${height}px`;
			params.selectionLayerEl.appendChild(overlay);
		}
		return true;
	}

	params.selectionOverlay?.updateSelectionOverlayForRange(from, to, {
		allowNativeSelection: true,
	});
	return true;
}
