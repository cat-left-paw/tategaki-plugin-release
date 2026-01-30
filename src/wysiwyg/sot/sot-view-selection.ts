export type SoTSelectionHost = any;

export function scheduleCaretUpdate(host: SoTSelectionHost, force = false): void {
	if (!force) {
		window.requestAnimationFrame(() => {
			updateSelectionOverlay(host);
			updateCaretPosition(host);
		});
		return;
	}
	updateSelectionOverlay(host);
	updateCaretPosition(host);
}

export function updateSelectionOverlay(host: SoTSelectionHost): void {
	if (host.sourceModeEnabled) {
		host.selectionLayerEl?.replaceChildren();
		return;
	}
	host.selectionOverlay?.updateSelectionOverlay();
}

export function updateCaretPosition(host: SoTSelectionHost): void {
	if (
		!host.derivedRootEl ||
		!host.derivedContentEl ||
		!host.caretEl ||
		!host.sotEditor
	) {
		return;
	}
	if (host.sourceModeEnabled) {
		host.caretEl.style.display = "none";
		return;
	}
	const caretWidth = host.plugin.settings.wysiwyg.caretWidthPx ?? 3;
	const effectiveCommon = host.getEffectiveCommonSettings(
		host.plugin.settings,
	);
	const caretColor = host.resolveCaretColor(
		host.plugin.settings,
		effectiveCommon,
	);
	const preferNativeInCe =
		host.plugin.settings.wysiwyg.ceUseNativeCaret ?? true;
	const useNativeInCe =
		host.ceImeMode && (preferNativeInCe || host.ceImeComposing);
	if (host.derivedRootEl && host.ceImeMode) {
		host.derivedRootEl.dataset.ceImeNativeCaret = useNativeInCe
			? "1"
			: "0";
	}
	if (host.ceImeMode) {
		host.overlayTextarea?.setCaretVisible(false);
		host.derivedContentEl.style.caretColor = useNativeInCe
			? caretColor
			: "transparent";
		if (useNativeInCe) {
			host.caretEl.style.display = "none";
			if (host.pendingCaretScroll) {
				host.pendingCaretScroll = false;
				scrollCaretIntoView(host);
			}
			return;
		}
	}
	const selection = host.sotEditor.getSelection();
	const selectionFrom = Math.min(selection.anchor, selection.head);
	const selectionTo = Math.max(selection.anchor, selection.head);
	const offset =
		host.pendingText.length > 0 && selectionFrom !== selectionTo
			? selectionFrom
			: selection.head;
	const lineIndex = host.findLineIndex(offset);
	if (lineIndex === null) {
		host.caretEl.style.display = "none";
		return;
	}
	const lineRange = host.lineRanges[lineIndex];
	if (!lineRange) {
		host.caretEl.style.display = "none";
		return;
	}
	const lineEl = host.getLineElement(lineIndex);
	if (!lineEl) {
		host.caretEl.style.display = "none";
		return;
	}
	host.ensureLineRendered(lineEl);
	const computedStyle = window.getComputedStyle(host.derivedRootEl);
	const writingMode = computedStyle.writingMode;
	const lineLength = lineRange.to - lineRange.from;
	const localOffset = Math.max(
		0,
		Math.min(offset - lineRange.from, lineLength),
	);
	const imeVisible = host.overlayTextarea?.isImeVisible?.() ?? false;
	if (imeVisible) {
		host.restorePendingSelectionLines?.();
		host.restorePendingLine?.();
	} else {
		host.updatePendingSpacer(lineIndex, localOffset);
	}
	const caretRect = host.getCaretRectInLine(
		lineEl,
		localOffset,
		lineRange,
		writingMode,
	);
	if (!caretRect) {
		host.caretEl.style.display = "none";
		return;
	}

	const rootRect = host.derivedRootEl.getBoundingClientRect();
	let baseLeft = caretRect.left - rootRect.left + host.derivedRootEl.scrollLeft;
	let baseTop = caretRect.top - rootRect.top + host.derivedRootEl.scrollTop;
	const pendingStartRect = host.getPendingSpacerStartRect(
		lineEl,
		lineIndex,
		writingMode,
	);
	if (pendingStartRect) {
		baseLeft =
			pendingStartRect.left -
			rootRect.left +
			host.derivedRootEl.scrollLeft;
		baseTop =
			pendingStartRect.top -
			rootRect.top +
			host.derivedRootEl.scrollTop;
	}
	const lineStartRect = host.getCaretRectInLine(
		lineEl,
		0,
		lineRange,
		writingMode,
	);
	let lineStartLeft = baseLeft;
	let lineStartTop = baseTop;
	if (!(lineLength === 0 && pendingStartRect)) {
		if (lineStartRect) {
			lineStartLeft =
				lineStartRect.left -
				rootRect.left +
				host.derivedRootEl.scrollLeft;
			lineStartTop =
				lineStartRect.top -
				rootRect.top +
				host.derivedRootEl.scrollTop;
		}
	}
	const usePendingLineStart =
		!!pendingStartRect &&
		host.pendingText.length > 0 &&
		host.pendingLineIndex === lineIndex &&
		host.pendingLocalOffset === 0;
	if (usePendingLineStart) {
		lineStartLeft =
			pendingStartRect.left -
			rootRect.left +
			host.derivedRootEl.scrollLeft;
		lineStartTop =
			pendingStartRect.top -
			rootRect.top +
			host.derivedRootEl.scrollTop;
	}

	const isVertical = writingMode.startsWith("vertical");
	const fontSize = parseFloat(computedStyle.fontSize) || 18;
	const lineHeightPx =
		Number.parseFloat(computedStyle.lineHeight) ||
		Math.max(1, fontSize * 1.8);
	let pendingCaretIndex: number | null = null;
	if (host.overlayTextarea?.isFocused()) {
		pendingCaretIndex = host.overlayTextarea.getSelectionStart();
	}
	const pendingCaretRect = host.getPendingCaretRect(
		writingMode,
		pendingCaretIndex,
	);
	let caretLeft = baseLeft;
	let caretTop = baseTop;
	if (pendingCaretRect) {
		caretLeft =
			pendingCaretRect.left -
			rootRect.left +
			host.derivedRootEl.scrollLeft;
		caretTop =
			pendingCaretRect.top -
			rootRect.top +
			host.derivedRootEl.scrollTop;
	}
	const caretRectForAdjust = pendingCaretRect ?? caretRect;

	const pendingOffset = isVertical ? fontSize * 0.3 : 0;
	const showNativeCaret =
		!host.ceImeMode &&
		((host.overlayTextarea?.isImeVisible() ?? false) ||
			(host.overlayFocused && host.pendingText.length > 0));
	host.overlayTextarea?.setCaretVisible(showNativeCaret);
	host.caretEl.style.display = showNativeCaret ? "none" : "";
	host.caretEl.style.left = `${caretLeft}px`;
	if (isVertical) {
		host.caretEl.style.top = `${caretTop}px`;
		host.caretEl.style.width = `${Math.max(
			8,
			caretRectForAdjust.width,
		)}px`;
		host.caretEl.style.height = `${Math.max(1, caretWidth)}px`;
	} else {
		// 横書きは縦線キャレット。長さはfont-size相当を基本にする（line-height分だと大きく見えやすい）。
		const desiredHeight = Math.max(8, fontSize);
		const rectHeight = Math.max(0, caretRectForAdjust.height);
		let adjustedTop = caretTop;
		if (rectHeight > 0 && rectHeight !== desiredHeight) {
			adjustedTop = caretTop + (rectHeight - desiredHeight) / 2;
		}
		host.caretEl.style.top = `${adjustedTop}px`;
		host.caretEl.style.width = `${Math.max(1, caretWidth)}px`;
		host.caretEl.style.height = `${desiredHeight}px`;
	}
	let horizontalTopAdjust = 0;
	if (!isVertical) {
		const rectHeight = Math.max(0, caretRectForAdjust.height);
		if (rectHeight > 0 && Number.isFinite(lineHeightPx)) {
			horizontalTopAdjust = (rectHeight - lineHeightPx) / 2;
			// OS/フォント差でわずかに下に見えやすいので、少し上へ寄せる
			horizontalTopAdjust -= fontSize * 0.2;
			const maxAdjust = fontSize * 0.35;
			horizontalTopAdjust = Math.max(
				-maxAdjust,
				Math.min(maxAdjust, horizontalTopAdjust),
			);
		}
	}
	const isPendingLineStart =
		host.pendingText.length > 0 &&
		host.pendingLineIndex === lineIndex &&
		host.pendingLocalOffset === 0;
	let inlineIndent = isVertical
		? Math.max(0, baseTop - lineStartTop)
		: Math.max(0, baseLeft - lineStartLeft);
	if (isPendingLineStart) {
		inlineIndent = 0;
	}
	const imeOffsetHorizontalEm =
		host.plugin.settings.wysiwyg.imeOffsetHorizontalEm ?? 0.1;
	const imeOffsetVerticalEm =
		host.plugin.settings.wysiwyg.imeOffsetVerticalEm ?? 0.5;
	const imeAdjustY = isVertical ? 0 : fontSize * imeOffsetHorizontalEm;
	const imeAdjustX = isVertical ? fontSize * imeOffsetVerticalEm : 0;
	const applyImeAdjustToEmptyLine =
		lineLength === 0 && host.pendingText.length > 0;
	const imeBaseLeft = applyImeAdjustToEmptyLine
		? baseLeft + imeAdjustX
		: baseLeft;
	const imeBaseTop = applyImeAdjustToEmptyLine
		? baseTop - imeAdjustY
		: baseTop;
	const imeLineStartLeft = applyImeAdjustToEmptyLine
		? lineStartLeft + imeAdjustX
		: lineStartLeft;
	const imeLineStartTop = applyImeAdjustToEmptyLine
		? lineStartTop - imeAdjustY
		: lineStartTop;
	const effectiveImeAdjustX = applyImeAdjustToEmptyLine ? 0 : imeAdjustX;
	const effectiveImeAdjustY = applyImeAdjustToEmptyLine ? 0 : imeAdjustY;
	const viewTop = host.derivedRootEl.scrollTop;
	const viewLeft = host.derivedRootEl.scrollLeft;
	const viewHeight = host.derivedRootEl.clientHeight;
	const viewWidth = host.derivedRootEl.clientWidth;
	const offsetFromViewTop = imeLineStartTop - viewTop;
	const offsetFromViewLeft = imeLineStartLeft - viewLeft;
	const clampedOffsetTop = Math.max(
		0,
		Math.min(offsetFromViewTop, viewHeight),
	);
	const clampedOffsetLeft = Math.max(
		0,
		Math.min(offsetFromViewLeft, viewWidth),
	);
	// textareaのサイズと位置を設定（本文エリアに合わせて折り返し）
	if (host.overlayTextarea) {
		const padBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
		const padRight = Number.parseFloat(computedStyle.paddingRight) || 0;
		const lineSize = Math.max(fontSize * 1.8, 32); // 1行/1列のサイズ
		const imeExtraSpace = Math.max(fontSize * 0.5, 0); // 余裕分（折り返しズレ緩和）
		host.overlayTextarea.setTextIndent(inlineIndent);
		if (isVertical) {
			// 縦書き: 行頭から下端までの高さ
			const availableHeight =
				viewHeight -
				padBottom -
				clampedOffsetTop -
				horizontalTopAdjust;
			// 制約を設定（初回は1列分、内容に応じて動的に増える）
			host.overlayTextarea.setConstraints(
				true,
				Math.max(availableHeight + imeExtraSpace, lineSize),
				lineSize,
			);
			// 縦書きは右端基準で位置設定
			// キャレットの右端（baseLeft + キャレット幅）にtextareaの右端を合わせる
			const caretWidth = Math.max(8, caretRect.width);
			host.overlayTextarea.setAnchorPositionVertical(
				imeBaseLeft + caretWidth + effectiveImeAdjustX,
				imeLineStartTop + horizontalTopAdjust,
			);
		} else {
			// 横書き: 行頭から右端までの幅
			const availableWidth = viewWidth - padRight - clampedOffsetLeft;
			// 制約を設定（初回は1行分、内容に応じて動的に増える）
			host.overlayTextarea.setConstraints(
				false,
				Math.max(availableWidth + imeExtraSpace, lineSize),
				lineSize,
			);
			host.overlayTextarea.setAnchorPosition(
				imeLineStartLeft,
				imeBaseTop + horizontalTopAdjust - effectiveImeAdjustY,
			);
		}
	}
	host.updatePendingPosition(
		baseLeft - pendingOffset,
		baseTop + horizontalTopAdjust,
	);

	if (host.pendingCaretScroll) {
		host.pendingCaretScroll = false;
		scrollCaretIntoView(host);
	}
}

export function scrollCaretIntoView(host: SoTSelectionHost): void {
	if (!host.derivedRootEl) return;
	if (host.ceImeMode) {
		if (!host.sotEditor) return;
		const selection = host.sotEditor.getSelection();
		const offset = selection.head;
		const lineIndex = host.findLineIndex(offset);
		if (lineIndex === null) return;
		const lineRange = host.lineRanges[lineIndex];
		const lineEl = host.getLineElement(lineIndex);
		if (!lineRange || !lineEl) return;
		host.ensureLineRendered(lineEl);
		const lineLength = lineRange.to - lineRange.from;
		const localOffset = Math.max(
			0,
			Math.min(offset - lineRange.from, lineLength),
		);
		const writingMode = window.getComputedStyle(
			host.derivedRootEl,
		).writingMode;
		const caretRect =
			host.getCaretRectInLine(
				lineEl,
				localOffset,
				lineRange,
				writingMode,
			) ?? lineEl.getBoundingClientRect();
		scrollRectIntoView(host, caretRect);
		return;
	}
	if (!host.caretEl) return;
	if (host.caretEl.style.display === "none") return;
	const rootRect = host.derivedRootEl.getBoundingClientRect();
	const caretRect = host.caretEl.getBoundingClientRect();
	scrollRectIntoView(host, caretRect, rootRect);
}

export function scrollRectIntoView(
	host: SoTSelectionHost,
	rect: DOMRect,
	rootRect?: DOMRect
): void {
	if (!host.derivedRootEl) return;
	const viewRect = rootRect ?? host.derivedRootEl.getBoundingClientRect();
	const padding = 24;
	let deltaX = 0;
	let deltaY = 0;
	if (rect.left < viewRect.left + padding) {
		deltaX = rect.left - (viewRect.left + padding);
	} else if (rect.right > viewRect.right - padding) {
		deltaX = rect.right - (viewRect.right - padding);
	}
	if (rect.top < viewRect.top + padding) {
		deltaY = rect.top - (viewRect.top + padding);
	} else if (rect.bottom > viewRect.bottom - padding) {
		deltaY = rect.bottom - (viewRect.bottom - padding);
	}
	if (deltaX !== 0) {
		host.derivedRootEl.scrollLeft += deltaX;
	}
	if (deltaY !== 0) {
		host.derivedRootEl.scrollTop += deltaY;
	}
	return;
}
