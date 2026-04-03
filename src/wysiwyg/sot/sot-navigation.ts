export const SOT_LOGICAL_NAVIGATION_KEYS = [
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
] as const;

export type SoTLogicalNavigationKey =
	(typeof SOT_LOGICAL_NAVIGATION_KEYS)[number];

type SoTLineInfo = {
	lineStart: number;
	lineEnd: number;
	column: number;
};

export function isSoTLogicalNavigationKey(
	key: string,
): key is SoTLogicalNavigationKey {
	return (SOT_LOGICAL_NAVIGATION_KEYS as readonly string[]).includes(key);
}

export function resolveSoTNavigationOffset(
	doc: string,
	head: number,
	key: string,
	writingMode: string,
): number {
	const safeHead = Math.max(0, Math.min(head, doc.length));
	const lineInfo = getLineInfo(doc, safeHead);
	const isVertical = writingMode.startsWith("vertical");
	const isVerticalRL = writingMode !== "vertical-lr";

	if (key === "Home") {
		return lineInfo.lineStart;
	}
	if (key === "End") {
		return lineInfo.lineEnd;
	}

	if (isVertical) {
		if (key === "ArrowUp") {
			if (lineInfo.column <= 0) {
				return lineInfo.lineStart > 0 ? lineInfo.lineStart - 1 : safeHead;
			}
			return Math.max(lineInfo.lineStart, safeHead - 1);
		}
		if (key === "ArrowDown") {
			if (safeHead >= lineInfo.lineEnd) {
				return lineInfo.lineEnd < doc.length
					? lineInfo.lineEnd + 1
					: safeHead;
			}
			return Math.min(lineInfo.lineEnd, safeHead + 1);
		}
		if (key === "ArrowLeft") {
			if (isVerticalRL) {
				if (safeHead >= lineInfo.lineEnd) {
					return getNextLineStart(doc, lineInfo);
				}
				return moveToNextLine(doc, lineInfo);
			}
			if (safeHead <= lineInfo.lineStart) {
				return getPrevLineStart(doc, lineInfo);
			}
			return moveToPrevLine(doc, lineInfo);
		}
		if (key === "ArrowRight") {
			if (isVerticalRL) {
				if (safeHead <= lineInfo.lineStart) {
					return getPrevLineStart(doc, lineInfo);
				}
				return moveToPrevLine(doc, lineInfo);
			}
			if (safeHead >= lineInfo.lineEnd) {
				return getNextLineStart(doc, lineInfo);
			}
			return moveToNextLine(doc, lineInfo);
		}
		return safeHead;
	}

	if (key === "ArrowLeft") {
		return Math.max(0, safeHead - 1);
	}
	if (key === "ArrowRight") {
		return Math.min(doc.length, safeHead + 1);
	}
	if (key === "ArrowUp") {
		return moveToPrevLine(doc, lineInfo);
	}
	if (key === "ArrowDown") {
		return moveToNextLine(doc, lineInfo);
	}
	return safeHead;
}

function getLineInfo(doc: string, head: number): SoTLineInfo {
	const lineStart = doc.lastIndexOf("\n", Math.max(0, head - 1)) + 1;
	const lineEndIndex = doc.indexOf("\n", head);
	const lineEnd = lineEndIndex === -1 ? doc.length : lineEndIndex;
	const column = Math.max(
		0,
		Math.min(head - lineStart, lineEnd - lineStart),
	);
	return { lineStart, lineEnd, column };
}

function moveToPrevLine(doc: string, info: SoTLineInfo): number {
	if (info.lineStart === 0) return info.lineStart + info.column;
	const prevLineEnd = info.lineStart - 1;
	const prevLineStart =
		doc.lastIndexOf("\n", Math.max(0, prevLineEnd - 1)) + 1;
	const prevLineLength = prevLineEnd - prevLineStart;
	return prevLineStart + Math.min(info.column, prevLineLength);
}

function moveToNextLine(doc: string, info: SoTLineInfo): number {
	if (info.lineEnd >= doc.length) return info.lineEnd;
	const nextLineStart = info.lineEnd + 1;
	const nextLineEndIndex = doc.indexOf("\n", nextLineStart);
	const nextLineEnd = nextLineEndIndex === -1 ? doc.length : nextLineEndIndex;
	const nextLineLength = nextLineEnd - nextLineStart;
	return nextLineStart + Math.min(info.column, nextLineLength);
}

function getNextLineStart(doc: string, info: Pick<SoTLineInfo, "lineEnd">): number {
	if (info.lineEnd >= doc.length) return info.lineEnd;
	return info.lineEnd + 1;
}

function getPrevLineStart(doc: string, info: Pick<SoTLineInfo, "lineStart">): number {
	if (info.lineStart <= 0) return 0;
	const prevLineEnd = info.lineStart - 1;
	return doc.lastIndexOf("\n", Math.max(0, prevLineEnd - 1)) + 1;
}
