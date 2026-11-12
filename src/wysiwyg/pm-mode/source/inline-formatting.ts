// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:4746-4920) @ d65c4c7 (2026-10-17).
// Local changes: Replace the method with an exported pure function.
import type { RenderSegment } from "./types";
export function buildInlineSegmentsFallback(
	absFrom: number,
	absTo: number,
	lineText: string,
): RenderSegment[] | null {
	// 構文木が参照できない環境向けの最小フォールバック。
	// 目的: 記号は表示せず、装飾だけを表示しつつ SoT マッピングを壊さない。
	const hasMarkers = /(\*\*\*|___|\*\*|__|~~|==|`|\*|_)/.test(lineText);
	if (!hasMarkers) return null;

	const segments: RenderSegment[] = [];
	let inStrong = false;
	let inEm = false;
	let inStrike = false;
	let inHighlight = false;
	let codeFenceLen: number | null = null;

	const classesForState = (): string[] => {
		const classNames: string[] = ["tategaki-sot-run"];
		if (codeFenceLen !== null) {
			classNames.push("tategaki-md-code");
			return classNames;
		}
		if (inStrong) classNames.push("tategaki-md-strong");
		if (inEm) classNames.push("tategaki-md-em");
		if (inStrike) classNames.push("tategaki-md-strike");
		if (inHighlight) classNames.push("tategaki-md-highlight");
		return classNames;
	};

	let segmentStart: number | null = null;
	let segmentClasses: string[] = [];

	const flush = (end: number) => {
		if (segmentStart === null) return;
		if (end <= segmentStart) {
			segmentStart = null;
			return;
		}
		const text = lineText.slice(segmentStart, end);
		if (text.length === 0) {
			segmentStart = null;
			return;
		}
		segments.push({
			from: absFrom + segmentStart,
			to: absFrom + end,
			text,
			classNames: segmentClasses,
		});
		segmentStart = null;
	};

	const ensureSegment = (index: number) => {
		if (segmentStart !== null) return;
		segmentStart = index;
		segmentClasses = classesForState();
	};

	const countRun = (index: number, ch: string): number => {
		let n = 0;
		while (index + n < lineText.length && lineText[index + n] === ch) {
			n += 1;
		}
		return n;
	};

	const hasLater = (marker: string, fromIndex: number): boolean =>
		lineText.indexOf(marker, fromIndex) !== -1;

	const pickBalancedEmphasisLen = (
		index: number,
		ch: "*" | "_",
		runLen: number,
	): number | null => {
		for (const len of [3, 2, 1]) {
			if (runLen < len) continue;
			const marker = ch.repeat(len);
			if (hasLater(marker, index + len)) return len;
		}
		return null;
	};

	let i = 0;
	while (i < lineText.length) {
		const ch = lineText[i] ?? "";

		if (codeFenceLen === null) {
			if (ch === "`") {
				const runLen = countRun(i, "`");
				const marker = "`".repeat(runLen);
				if (hasLater(marker, i + runLen)) {
					flush(i);
					codeFenceLen = runLen;
					i += runLen;
					continue;
				}
			} else if (ch === "~" && lineText.slice(i, i + 2) === "~~") {
				// 開始: 後続に閉じがある時だけ / 終了: 状態がONなら無条件で閉じる
				if (inStrike || hasLater("~~", i + 2)) {
					flush(i);
					inStrike = !inStrike;
					i += 2;
					continue;
				}
			} else if (ch === "=" && lineText.slice(i, i + 2) === "==") {
				if (inHighlight || hasLater("==", i + 2)) {
					flush(i);
					inHighlight = !inHighlight;
					i += 2;
					continue;
				}
			} else if (ch === "*" || ch === "_") {
				const runLen = countRun(i, ch);
				// 終了優先（閉じ記号を確実に消す）
				let markerLen: number | null = null;
				if (inStrong && inEm) {
					if (runLen >= 3) {
						markerLen = 3;
					} else if (runLen >= 2) {
						markerLen = 2;
					} else {
						markerLen = 1;
					}
				} else if (inStrong) {
					if (runLen >= 2) {
						markerLen = 2;
					} else if (hasLater(ch, i + 1)) {
						markerLen = 1;
					}
				} else if (inEm) {
					if (runLen >= 2 && hasLater(ch.repeat(2), i + 2)) {
						markerLen = 2;
					} else {
						markerLen = 1;
					}
				} else {
					markerLen = pickBalancedEmphasisLen(
						i,
						ch,
						runLen,
					);
				}
				if (markerLen !== null && markerLen > 0) {
					flush(i);
					if (markerLen === 3) {
						inStrong = !inStrong;
						inEm = !inEm;
					} else if (markerLen === 2) {
						inStrong = !inStrong;
					} else {
						inEm = !inEm;
					}
					i += markerLen;
					continue;
				}
			}
		} else if (ch === "`") {
			const runLen = countRun(i, "`");
			if (runLen === codeFenceLen) {
				flush(i);
				codeFenceLen = null;
				i += runLen;
				continue;
			}
		}

		ensureSegment(i);
		i += 1;
	}
	flush(lineText.length);

	if (segments.length === 0) return null;
	return segments.filter((s) => s.to > s.from);
}
