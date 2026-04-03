export type SoTPlainEditSelectionDirection =
	| "forward"
	| "backward"
	| "none";

export type SoTPlainEditSelectionRange = {
	start: number;
	end: number;
	direction: SoTPlainEditSelectionDirection;
};

type SoTPlainEditLogicalBoundaryInput = {
	text: string;
	key: string;
	selectionStart: number;
	selectionEnd: number;
	selectionDirection?: string | null;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
};

type SoTPlainEditLogicalLineRange = {
	start: number;
	end: number;
};

export function resolveSoTPlainEditHomeEndSelection({
	text,
	key,
	selectionStart,
	selectionEnd,
	selectionDirection,
	shiftKey,
	altKey,
	metaKey,
	ctrlKey,
}: SoTPlainEditLogicalBoundaryInput): SoTPlainEditSelectionRange | null {
	if (key !== "Home" && key !== "End") return null;
	if (altKey || metaKey || ctrlKey) return null;

	const safeStart = clampOffset(selectionStart, text.length);
	const safeEnd = clampOffset(selectionEnd, text.length);
	const direction = normalizeSelectionDirection(selectionDirection);
	const { anchor, head } = resolveAnchorAndHead(safeStart, safeEnd, direction);
	const lineRange = getSoTPlainEditLogicalLineRange(text, head);
	const target = key === "Home" ? lineRange.start : lineRange.end;

	if (!shiftKey) {
		return {
			start: target,
			end: target,
			direction: "none",
		};
	}

	if (target === anchor) {
		return {
			start: target,
			end: target,
			direction: "none",
		};
	}
	if (target < anchor) {
		return {
			start: target,
			end: anchor,
			direction: "backward",
		};
	}
	return {
		start: anchor,
		end: target,
		direction: "forward",
	};
}

export function getSoTPlainEditLogicalLineRange(
	text: string,
	offset: number,
): SoTPlainEditLogicalLineRange {
	const safeOffset = clampOffset(offset, text.length);
	const start = text.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
	const endIndex = text.indexOf("\n", safeOffset);
	const end = endIndex === -1 ? text.length : endIndex;
	return { start, end };
}

function clampOffset(offset: number, textLength: number): number {
	return Math.max(0, Math.min(offset, textLength));
}

function normalizeSelectionDirection(
	direction: string | null | undefined,
): SoTPlainEditSelectionDirection {
	if (direction === "forward" || direction === "backward") {
		return direction;
	}
	return "none";
}

function resolveAnchorAndHead(
	selectionStart: number,
	selectionEnd: number,
	direction: SoTPlainEditSelectionDirection,
): { anchor: number; head: number } {
	if (selectionStart === selectionEnd) {
		return {
			anchor: selectionStart,
			head: selectionStart,
		};
	}
	if (direction === "backward") {
		return {
			anchor: selectionEnd,
			head: selectionStart,
		};
	}
	return {
		anchor: selectionStart,
		head: selectionEnd,
	};
}
