export type SoTScrollAnchor = {
	lineIndex: number;
	topOffsetPx: number;
	leftOffsetPx: number;
};

export type SoTScrollAnchorCandidate = {
	lineIndex: number;
	top: number;
	bottom: number;
	left: number;
};

export type SoTScrollAnchorViewportProbeOptions = {
	rowOffsetsPx?: readonly number[];
	minColumnStepPx?: number;
	maxColumnSamples?: number;
	elementsFromPoint?: (x: number, y: number) => Element[];
};

export function captureScrollAnchor(params: {
	containerTop: number;
	containerBottom: number;
	containerLeft: number;
	candidates: Iterable<SoTScrollAnchorCandidate>;
}): SoTScrollAnchor | null {
	let best: SoTScrollAnchorCandidate | null = null;

	for (const candidate of params.candidates) {
		if (!Number.isFinite(candidate.lineIndex)) continue;
		if (candidate.bottom <= params.containerTop) continue;
		if (candidate.top >= params.containerBottom) continue;
		if (
			!best ||
			candidate.top < best.top ||
			(candidate.top === best.top && candidate.lineIndex < best.lineIndex)
		) {
			best = candidate;
		}
	}

	if (!best) return null;
	return {
		lineIndex: best.lineIndex,
		topOffsetPx: best.top - params.containerTop,
		leftOffsetPx: best.left - params.containerLeft,
	};
}

export function captureScrollAnchorFromLineElements(params: {
	containerEl: HTMLElement;
	lineElements: Iterable<HTMLElement> | ArrayLike<HTMLElement>;
}): SoTScrollAnchor | null {
	// bulk fallback / test helper。hot path では viewport probe を優先する。
	const containerRect = params.containerEl.getBoundingClientRect();
	const candidates: SoTScrollAnchorCandidate[] = [];

	for (const lineEl of Array.from(params.lineElements)) {
		if (!lineEl.isConnected) continue;
		const lineIndex = Number.parseInt(lineEl.dataset.line ?? "", 10);
		if (!Number.isFinite(lineIndex)) continue;
		const rect = lineEl.getBoundingClientRect();
		if (rect.width + rect.height <= 0) continue;
		candidates.push({
			lineIndex,
			top: rect.top,
			bottom: rect.bottom,
			left: rect.left,
		});
	}

	return captureScrollAnchor({
		containerTop: containerRect.top,
		containerBottom: containerRect.bottom,
		containerLeft: containerRect.left,
		candidates,
	});
}

export function captureScrollAnchorFromViewport(params: {
	containerEl: HTMLElement;
	lineRootEl: HTMLElement;
	probeOptions?: SoTScrollAnchorViewportProbeOptions;
}): SoTScrollAnchor | null {
	const containerRect = params.containerEl.getBoundingClientRect();
	if (containerRect.width <= 0 || containerRect.height <= 0) return null;

	const probeOptions = params.probeOptions ?? {};
	const rowOffsets = buildViewportProbeRowOffsets(
		containerRect.height,
		probeOptions.rowOffsetsPx ?? [1, 8, 24, 48],
	);
	const columnPositions = buildViewportProbeColumnPositions({
		left: containerRect.left,
		width: containerRect.width,
		minColumnStepPx: probeOptions.minColumnStepPx ?? 24,
		maxColumnSamples: probeOptions.maxColumnSamples ?? 32,
	});
	const elementsFromPoint =
		probeOptions.elementsFromPoint ??
		((x: number, y: number) =>
			typeof document.elementsFromPoint === "function"
				? document.elementsFromPoint(x, y)
				: resolveElementStackFromPoint(x, y));

	for (const rowOffset of rowOffsets) {
		const probeY = clampProbeCoordinate(
			containerRect.top + rowOffset,
			containerRect.top,
			containerRect.bottom,
		);
		const seenLineElements = new Set<HTMLElement>();
		const candidates: SoTScrollAnchorCandidate[] = [];

		for (const probeX of columnPositions) {
			for (const element of elementsFromPoint(probeX, probeY)) {
				const lineEl = resolveLineElementCandidate(
					element,
					params.lineRootEl,
				);
				if (!lineEl || seenLineElements.has(lineEl)) continue;
				seenLineElements.add(lineEl);
				const lineIndex = Number.parseInt(lineEl.dataset.line ?? "", 10);
				if (!Number.isFinite(lineIndex)) continue;
				const rect = lineEl.getBoundingClientRect();
				if (rect.width + rect.height <= 0) continue;
				candidates.push({
					lineIndex,
					top: rect.top,
					bottom: rect.bottom,
					left: rect.left,
				});
				break;
			}
		}

		const anchor = captureScrollAnchor({
			containerTop: containerRect.top,
			containerBottom: containerRect.bottom,
			containerLeft: containerRect.left,
			candidates,
		});
		if (anchor) return anchor;
	}

	return null;
}

function buildViewportProbeRowOffsets(
	containerHeight: number,
	rowOffsetsPx: readonly number[],
): number[] {
	const maxOffset = Math.max(1, containerHeight - 1);
	const offsets = new Set<number>();
	for (const rowOffset of rowOffsetsPx) {
		if (!Number.isFinite(rowOffset)) continue;
		const clamped = Math.max(1, Math.min(maxOffset, Math.round(rowOffset)));
		offsets.add(clamped);
	}
	if (offsets.size === 0) {
		offsets.add(1);
	}
	return Array.from(offsets).sort((left, right) => left - right);
}

function buildViewportProbeColumnPositions(params: {
	left: number;
	width: number;
	minColumnStepPx: number;
	maxColumnSamples: number;
}): number[] {
	const safeWidth = Math.max(1, params.width);
	const step = Math.max(1, params.minColumnStepPx);
	const sampleCount = Math.max(
		1,
		Math.min(params.maxColumnSamples, Math.ceil(safeWidth / step) + 1),
	);
	const positions: number[] = [];
	if (sampleCount === 1) {
		positions.push(params.left + safeWidth / 2);
		return positions;
	}

	const maxX = params.left + safeWidth - 1;
	for (let index = 0; index < sampleCount; index += 1) {
		const ratio = index / (sampleCount - 1);
		positions.push(params.left + Math.min(safeWidth * ratio, safeWidth - 1));
	}
	positions[positions.length - 1] = Math.min(
		positions[positions.length - 1] ?? maxX,
		maxX,
	);
	return positions;
}

function resolveElementStackFromPoint(x: number, y: number): Element[] {
	const element = document.elementFromPoint(x, y);
	return element ? [element] : [];
}

function clampProbeCoordinate(
	value: number,
	min: number,
	max: number,
): number {
	return Math.max(min, Math.min(max - 1, value));
}

function resolveLineElementCandidate(
	element: Element,
	lineRootEl: HTMLElement,
): HTMLElement | null {
	if (!(element instanceof HTMLElement)) return null;
	const lineEl = element.closest(".tategaki-sot-line") as HTMLElement | null;
	if (!lineEl || !lineEl.isConnected) return null;
	if (!lineRootEl.contains(lineEl)) return null;
	return lineEl;
}

export function computeScrollAnchorAdjustment(params: {
	anchor: SoTScrollAnchor;
	containerTop: number;
	containerLeft: number;
	resolveLineRect: (lineIndex: number) => { top: number; left: number } | null;
	minAbsDeltaPx?: number;
}): { topPx: number | null; leftPx: number | null } {
	const nextRect = params.resolveLineRect(params.anchor.lineIndex);
	if (!nextRect) {
		return { topPx: null, leftPx: null };
	}
	const nextTopOffset = nextRect.top - params.containerTop;
	const nextLeftOffset = nextRect.left - params.containerLeft;
	const topDelta = nextTopOffset - params.anchor.topOffsetPx;
	const leftDelta = nextLeftOffset - params.anchor.leftOffsetPx;
	const threshold = params.minAbsDeltaPx ?? 0.5;
	return {
		topPx: Math.abs(topDelta) < threshold ? null : topDelta,
		leftPx: Math.abs(leftDelta) < threshold ? null : leftDelta,
	};
}

export function computeScrollAnchorAdjustmentFromLineElement(params: {
	anchor: SoTScrollAnchor;
	containerEl: HTMLElement;
	resolveLineElement: (lineIndex: number) => HTMLElement | null;
	minAbsDeltaPx?: number;
}): { topPx: number | null; leftPx: number | null } {
	const containerRect = params.containerEl.getBoundingClientRect();
	return computeScrollAnchorAdjustment({
		anchor: params.anchor,
		containerTop: containerRect.top,
		containerLeft: containerRect.left,
		minAbsDeltaPx: params.minAbsDeltaPx,
		resolveLineRect: (lineIndex) => {
			const lineEl = params.resolveLineElement(lineIndex);
			if (!lineEl || !lineEl.isConnected) return null;
			const rect = lineEl.getBoundingClientRect();
			if (rect.width + rect.height <= 0) return null;
			return { top: rect.top, left: rect.left };
		},
	});
}

export function shouldApplyScrollAnchorAdjustment(params: {
	anchor: SoTScrollAnchor | null;
	adjustmentPx: number | null;
	suppressScrollRestore: boolean;
}): boolean {
	if (params.suppressScrollRestore) return false;
	if (!params.anchor) return false;
	if (params.adjustmentPx === null) return false;
	return Number.isFinite(params.adjustmentPx);
}
