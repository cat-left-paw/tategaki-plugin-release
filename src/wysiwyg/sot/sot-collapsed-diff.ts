import type { CollapsedGapRange } from "./sot-collapsed-gap-ranges";

export type CollapsedSection = {
	headingLine: number;
	sectionEnd: number;
};

export type RebuildRange = {
	rebuildStart: number;
	rebuildEnd: number;
	oldRemoveStart: number;
	oldRemoveEnd: number;
};

/**
 * 折りたたみ見出しありの差分更新で、再構築範囲を
 * gap / セクション境界まで拡張する。
 *
 * 直接の編集影響範囲に加え、重なる gap（新旧両方）と
 * 折りたたみ見出しのセクション範囲を完全に包含するまで
 * 拡張を繰り返す。
 *
 * これにより:
 * - gap が切断されたまま残る問題
 * - 折りたたみ見出しの展開/解消で DOM に穴が空く問題
 * を防ぐ。
 */
export function computeCollapsedDiffRebuildRange(params: {
	oldStart: number;
	oldEnd: number;
	newStart: number;
	newEnd: number;
	lineDelta: number;
	newGapRanges: readonly CollapsedGapRange[];
	oldGapRanges: readonly CollapsedGapRange[];
	oldCollapsedSections: readonly CollapsedSection[];
	newCollapsedSections: readonly CollapsedSection[];
}): RebuildRange {
	const { oldEnd, lineDelta } = params;
	let oStart = params.oldStart;
	let oEnd = params.oldEnd;
	let nStart = params.newStart;
	let nEnd = params.newEnd;

	let stable = false;
	while (!stable) {
		stable = true;

		for (const gap of params.oldGapRanges) {
			if (gap.endLine < oStart || gap.startLine > oEnd) continue;
			if (gap.startLine < oStart) { oStart = gap.startLine; stable = false; }
			if (gap.endLine > oEnd) { oEnd = gap.endLine; stable = false; }
		}
		for (const sec of params.oldCollapsedSections) {
			if (sec.headingLine < oStart || sec.headingLine > oEnd) continue;
			if (sec.sectionEnd > oEnd) { oEnd = sec.sectionEnd; stable = false; }
		}

		const mn1 = Math.min(nStart, oStart);
		const mn2 = Math.max(nEnd, oEnd > oldEnd ? oEnd + lineDelta : nEnd);
		if (mn1 < nStart) { nStart = mn1; stable = false; }
		if (mn2 > nEnd) { nEnd = mn2; stable = false; }

		for (const gap of params.newGapRanges) {
			if (gap.endLine < nStart || gap.startLine > nEnd) continue;
			if (gap.startLine < nStart) { nStart = gap.startLine; stable = false; }
			if (gap.endLine > nEnd) { nEnd = gap.endLine; stable = false; }
		}
		for (const sec of params.newCollapsedSections) {
			if (sec.headingLine < nStart || sec.headingLine > nEnd) continue;
			if (sec.sectionEnd > nEnd) { nEnd = sec.sectionEnd; stable = false; }
		}

		const mo1 = Math.min(oStart, nStart);
		const mo2 = Math.max(oEnd, nEnd > params.newEnd ? nEnd - lineDelta : oEnd);
		if (mo1 < oStart) { oStart = mo1; stable = false; }
		if (mo2 > oEnd) { oEnd = mo2; stable = false; }
	}

	return {
		rebuildStart: Math.max(0, nStart),
		rebuildEnd: nEnd,
		oldRemoveStart: Math.max(0, oStart),
		oldRemoveEnd: oEnd,
	};
}

/**
 * collapsedHeadingLines を編集に応じてシフトする。
 *
 * 編集範囲の末尾 (oldEnd) より後ろの見出し行のみ lineDelta 分シフトし、
 * 見出し行そのものが編集点に含まれるケースでは位置を動かさない。
 */
export function shiftCollapsedHeadingLines(
	headingLines: ReadonlySet<number>,
	oldEnd: number,
	lineDelta: number,
): Set<number> {
	if (lineDelta === 0) return new Set(headingLines);
	const shifted = new Set<number>();
	for (const h of headingLines) {
		shifted.add(h > oldEnd ? h + lineDelta : h);
	}
	return shifted;
}

/**
 * 単一行内の編集が見出し・ブロック構造を変えうるかを軽量判定する。
 *
 * false-positive 許容の保守的チェック。true の場合は fast path を避け
 * model-first パスへ迂回させる。
 */
export function couldLineChangeBlockStructure(
	newText: string,
	oldKind: string,
	wasHeading: boolean,
): boolean {
	if (oldKind === "normal") {
		const isHeading = /^#{1,6}([ \t]|$)/.test(newText);
		if (wasHeading !== isHeading) return true;
	}

	const isFence = /^(`{3,}|~{3,})/.test(newText);
	if ((oldKind === "code-fence") !== isFence) return true;

	const isMath = /^\s*\$\$\s*$/.test(newText);
	if ((oldKind === "math-fence") !== isMath) return true;

	return false;
}
