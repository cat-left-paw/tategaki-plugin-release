export type SoTRenderHost = any;

export function resetPendingRenderState(host: SoTRenderHost): void {
	host.pendingSpacerEl = null;
	host.pendingLineIndex = null;
	host.pendingLocalOffset = null;
	host.pendingSelectionFrom = null;
	host.pendingSelectionTo = null;
	host.pendingSelectionLineStart = null;
	host.pendingSelectionLineEnd = null;
}

export function finalizeRender(
	host: SoTRenderHost,
	scrollTop: number,
	scrollLeft: number
): void {
	if (host.pendingHold) {
		host.pendingHold = false;
		host.updatePendingText("", true);
	}
	host.updateSourceModeLineRange(true);
	if (host.derivedRootEl) {
		const foldLine = host.pendingFoldScrollLineIndex;
		host.pendingFoldScrollLineIndex = null;
		if (foldLine !== null) {
			// 見出し折りたたみ後: 古いスクロール位置を復元せず、
			// 見出しジャンプと同じ2段階スクロールで見出し行を表示する。
			// 1回目でおおよその位置にスクロールし、2回目で
			// IntersectionObserver による仮想化行のレンダリング完了後に
			// 正確な位置に補正する。
			host.pendingScrollRestoreTop = null;
			host.pendingScrollRestoreLeft = null;
			const lineEl = host.getLineElement(foldLine);
			if (lineEl) {
				host.ensureLineRendered(lineEl);
				lineEl.scrollIntoView({
					block: "center",
					inline: "center",
				});
				setTimeout(() => {
					lineEl.scrollIntoView({
						block: "center",
						inline: "center",
					});
				}, 100);
			}
		} else {
			const nextTop = host.pendingScrollRestoreTop ?? scrollTop;
			const nextLeft = host.pendingScrollRestoreLeft ?? scrollLeft;
			host.pendingScrollRestoreTop = null;
			host.pendingScrollRestoreLeft = null;
			host.derivedRootEl.scrollTop = nextTop;
			host.derivedRootEl.scrollLeft = nextLeft;
		}
	}
	host.outlinePanel?.refresh();
	host.scheduleCaretUpdate(true);
	if (host.loadingOverlayPending) {
		host.hideLoadingOverlay();
	}
}

export function scheduleRender(
	host: SoTRenderHost,
	force = false
): void {
	host.renderPipeline?.scheduleRender(force);
}

export function renderNow(host: SoTRenderHost): void {
	host.renderPipeline?.renderNow();
}

export function purgeLineCaches(
	host: SoTRenderHost,
	start: number,
	end: number
): void {
	const total = host.lineRanges.length;
	host.lineCache.purgeLineCaches(start, end, total);
}
