import {
	getCollapsedGapRangeFromElement,
} from "./sot-gap-dom";

/**
 * PR6R-0: SoT行要素APIの互換契約。
 *
 * 固定するのは API の意味論だけであり、DOM 構造や
 * lineIndex から DOM を引く内部戦略までは固定しない。
 */
export interface SoTLineElementContract {
	readonly getLineElement: {
		readonly noSideEffect: true;
		readonly returnType: "HTMLElement | null";
		readonly returnsLineDomWhenPresent: true;
		readonly nullWhenLineDomMissing: true;
		readonly lookupStrategyIsImplementationDetail: true;
	};
	readonly ensureLineRendered: {
		readonly materializedIsNoop: true;
		readonly virtualAttemptsMaterialize: true;
		readonly safeReturnWhenMaterializeSkippedOrUnavailable: true;
		readonly idempotent: true;
		readonly targetResolutionIsImplementationDetail: true;
	};
	readonly common: {
		readonly lineDomApiSemanticsOnly: true;
		readonly domStructureIsNotFixed: true;
		readonly lineToDomCardinalityMayChange: true;
		readonly stableForFutureGapOrChunkWork: true;
	};
}

/**
 * PR6R-0 で固定する意味論契約の実体。
 */
export const SOT_LINE_ELEMENT_CONTRACT: SoTLineElementContract = {
	getLineElement: {
		noSideEffect: true,
		returnType: "HTMLElement | null",
		returnsLineDomWhenPresent: true,
		nullWhenLineDomMissing: true,
		lookupStrategyIsImplementationDetail: true,
	},
	ensureLineRendered: {
		materializedIsNoop: true,
		virtualAttemptsMaterialize: true,
		safeReturnWhenMaterializeSkippedOrUnavailable: true,
		idempotent: true,
		targetResolutionIsImplementationDetail: true,
	},
	common: {
		lineDomApiSemanticsOnly: true,
		domStructureIsNotFixed: true,
		lineToDomCardinalityMayChange: true,
		stableForFutureGapOrChunkWork: true,
	},
};

/**
 * 現行 derived content DOM の children 配置に対する参照実装。
 *
 * frontmatter が先頭 child を占有する現在の DOM 形状では
 * lineIndex + frontmatterOffset で child index を引けるが、
 * これは互換契約ではなく、あくまで現時点の解決戦略。
 */
export function resolveLineElementChildIndex(
	lineIndex: number,
	frontmatterOffset: number,
): number {
	return lineIndex + frontmatterOffset;
}

/**
 * getLineElement の現行参照実装。
 *
 * 現在は children[lineIndex + frontmatterOffset] を使って line DOM を
 * 解決するが、互換契約として保証するのは「存在する line DOM を返す」
 * 「不在なら null」「副作用なし」までであり、lookup 手順自体は固定しない。
 */
export function resolveLineElementFromChildren(
	children: HTMLCollection | null | undefined,
	lineIndex: number,
	frontmatterOffset: number,
): HTMLElement | null {
	if (!children) return null;
	const childIndex = resolveLineElementChildIndex(
		lineIndex,
		frontmatterOffset,
	);
	const direct = children[childIndex] as HTMLElement | undefined;
	const directLine = Number.parseInt(direct?.dataset.line ?? "", 10);
	if (Number.isFinite(directLine) && directLine === lineIndex) {
		return direct ?? null;
	}

	let low = frontmatterOffset;
	let high = children.length - 1;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const element = children[mid] as HTMLElement | undefined;
		if (!element) return null;
		const gap = getCollapsedGapRangeFromElement(element);
		if (gap) {
			if (lineIndex < gap.startLine) {
				high = mid - 1;
				continue;
			}
			if (lineIndex > gap.endLine) {
				low = mid + 1;
				continue;
			}
			return null;
		}
		const currentLine = Number.parseInt(element.dataset.line ?? "", 10);
		if (!Number.isFinite(currentLine)) return null;
		if (lineIndex < currentLine) {
			high = mid - 1;
			continue;
		}
		if (lineIndex > currentLine) {
			low = mid + 1;
			continue;
		}
		return element;
	}
	return null;
}

/**
 * ensureLineRendered の現行参照実装。
 *
 * virtual/light 状態かどうかと対象 lineIndex を dataset から解決する。
 * 互換契約として保証するのは「実体化済みなら no-op」「virtual なら実体化を試みる」
 * 「不要/失敗時は安全 return」「idempotent」までであり、siblings や child 配置は固定しない。
 */
export function resolveEnsureLineRenderedTargetIndex(
	lineEl: Pick<HTMLElement, "dataset">,
	lineRanges: ArrayLike<unknown>,
): number | null {
	if (lineEl.dataset.virtual !== "1") return null;
	const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
	if (!Number.isFinite(index)) return null;
	if (!lineRanges[index]) return null;
	return index;
}
