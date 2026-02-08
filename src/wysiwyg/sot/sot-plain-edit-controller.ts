import type { LineRange } from "./line-ranges";
import type { SoTEditor } from "./sot-editor";
import { getRectUnion } from "./sot-selection-geometry";

export type PlainEditRange = {
	from: number;
	to: number;
	startLine: number;
	endLine: number;
	originalText: string;
};

type PlainEditOverlayRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

type PlainEditHost = {
	derivedRootEl: HTMLElement | null;
	plainEditOverlayEl: HTMLTextAreaElement | null;
	plainEditRange: PlainEditRange | null;
	plainEditComposing: boolean;
	plainEditCommitting: boolean;
	plainEditOutsidePointerHandler: ((event: PointerEvent) => void) | null;
	plainEditOverlayBaseRect: PlainEditOverlayRect | null;
	sourceModeEnabled: boolean;
	lineRanges: LineRange[];
	lineBlockKinds: string[];
	lineMathBlockStart: Array<number | null>;
	lineMathBlockEnd: Array<number | null>;
	lineCalloutBlockStart: Array<number | null>;
	lineCalloutBlockEnd: Array<number | null>;
	lineTableBlockStart: Array<number | null>;
	lineTableBlockEnd: Array<number | null>;
	lineDeflistBlockStart: Array<number | null>;
	lineDeflistBlockEnd: Array<number | null>;
	sotEditor: SoTEditor | null;
	immediateRender: boolean;
	updatePendingText: (text: string, force?: boolean) => void;
	setSelectionNormalized: (anchor: number, head: number) => void;
	findLineIndex: (pos: number) => number | null;
	getLineElement: (index: number) => HTMLElement | null;
	ensureLineRendered: (lineEl: HTMLElement) => void;
	getLineVisualRects: (lineEl: HTMLElement) => DOMRect[];
	getCodeBlockRangeForLine: (
		lineIndex: number
	) => { start: number; end: number } | null;
	toggleSourceMode: () => void;
};

export class SoTPlainEditController {
	private readonly host: PlainEditHost;
	private readonly overlayResizeIdleMs = 120;
	private overlayPositionDirty = false;
	private overlayInputActive = false;
	private overlayInputIdleTimer: number | null = null;
	private overlayPositionNeedsRefine = false;
	private overlayPositionRefineRaf: number | null = null;
	private readonly fixedOverlaySize = true;
	private overlayFixedExpandRaf: number | null = null;

	constructor(host: PlainEditHost) {
		this.host = host;
	}

	ensureOverlay(): void {
		if (!this.host.derivedRootEl) return;
		if (!this.host.plainEditOverlayEl) {
			const overlay = document.createElement("textarea");
			overlay.className = "tategaki-plain-overlay";
			overlay.spellcheck = false;
			overlay.wrap = "soft";
			overlay.setAttribute("autocapitalize", "off");
			overlay.setAttribute("autocomplete", "off");
			overlay.setAttribute("autocorrect", "off");
			overlay.addEventListener("mousedown", (event) => {
				if (event.button === 2) {
					event.preventDefault();
				}
				event.stopPropagation();
			});
			overlay.addEventListener("pointerdown", (event) => {
				if (event.button === 2) {
					event.preventDefault();
				}
				event.stopPropagation();
			});
			overlay.addEventListener("compositionstart", () => {
				this.host.plainEditComposing = true;
				this.markOverlayInputActive();
			});
			overlay.addEventListener("compositionend", () => {
				this.host.plainEditComposing = false;
				this.markOverlayInputActive();
			});
			overlay.addEventListener("keydown", (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					this.host.toggleSourceMode();
					return;
				}
				if (
					!event.shiftKey &&
					!event.altKey &&
					!event.metaKey &&
					!event.ctrlKey &&
					!event.isComposing &&
					!this.host.plainEditComposing &&
					event.keyCode !== 229
				) {
					if (event.key.startsWith("Arrow")) {
						if (this.handleArrowKey(event.key)) {
							event.preventDefault();
							return;
						}
					}
					if (event.key === "Enter") {
						if (this.handleEnter()) {
							event.preventDefault();
							return;
						}
					}
					if (event.key === "Backspace") {
						if (this.handleBackspace()) {
							event.preventDefault();
							return;
						}
					}
					if (event.key === "Delete") {
						if (this.handleDelete()) {
							event.preventDefault();
							return;
						}
					}
				}
				event.stopPropagation();
			});
			overlay.addEventListener("input", () => {
				this.markOverlayInputActive();
			});
			this.host.plainEditOverlayEl = overlay;
			this.host.derivedRootEl.appendChild(overlay);
		}
	}

	destroyOverlay(): void {
		if (this.host.plainEditOverlayEl) {
			this.host.plainEditOverlayEl.remove();
			this.host.plainEditOverlayEl = null;
		}
		this.host.plainEditOverlayBaseRect = null;
		this.resetOverlayInputState();
		if (this.overlayPositionRefineRaf !== null) {
			window.cancelAnimationFrame(this.overlayPositionRefineRaf);
			this.overlayPositionRefineRaf = null;
		}
	}

	private resetOverlayInputState(): void {
		this.overlayInputActive = false;
		this.overlayPositionDirty = false;
		this.overlayPositionNeedsRefine = false;
		if (this.overlayPositionRefineRaf !== null) {
			window.cancelAnimationFrame(this.overlayPositionRefineRaf);
			this.overlayPositionRefineRaf = null;
		}
		if (this.overlayFixedExpandRaf !== null) {
			window.cancelAnimationFrame(this.overlayFixedExpandRaf);
			this.overlayFixedExpandRaf = null;
		}
		if (this.overlayInputIdleTimer !== null) {
			window.clearTimeout(this.overlayInputIdleTimer);
			this.overlayInputIdleTimer = null;
		}
	}

	private markOverlayInputActive(): void {
		this.overlayInputActive = true;
		if (this.overlayInputIdleTimer !== null) {
			window.clearTimeout(this.overlayInputIdleTimer);
		}
		this.overlayInputIdleTimer = window.setTimeout(() => {
			this.overlayInputIdleTimer = null;
			this.overlayInputActive = false;
			if (this.overlayPositionDirty && this.host.plainEditRange) {
				this.overlayPositionDirty = false;
				this.updateOverlayPositionInternal(this.host.plainEditRange, {
					refine: false,
				});
			}
			this.scheduleFixedOverlayExpand();
			this.scheduleOverlayPositionRefine();
		}, this.overlayResizeIdleMs);
	}

	private scheduleFixedOverlayExpand(): void {
		if (!this.fixedOverlaySize) return;
		if (!this.host.plainEditOverlayEl || !this.host.plainEditOverlayBaseRect) {
			return;
		}
		if (this.overlayFixedExpandRaf !== null) return;
		this.overlayFixedExpandRaf = window.requestAnimationFrame(() => {
			this.overlayFixedExpandRaf = null;
			this.expandFixedOverlayIfOverflow();
		});
	}

	private expandFixedOverlayIfOverflow(): void {
		if (!this.fixedOverlaySize) return;
		if (!this.host.plainEditOverlayEl || !this.host.plainEditOverlayBaseRect) {
			return;
		}
		const overlay = this.host.plainEditOverlayEl;
		const base = this.host.plainEditOverlayBaseRect;
		const writingMode =
			overlay.style.writingMode || getComputedStyle(overlay).writingMode;
		const style = getComputedStyle(overlay);
		const fontSize = Number.parseFloat(style.fontSize) || 16;
		const lineHeight =
			Number.parseFloat(style.lineHeight) || Math.max(1, fontSize * 1.6);
		if (writingMode.startsWith("vertical")) {
			const overflow = overlay.scrollWidth - overlay.clientWidth;
			if (overflow <= 0) return;
			const expand = Math.max(1, Math.ceil(fontSize));
			const nextWidth = base.width + expand;
			this.host.plainEditOverlayEl.style.width = `${nextWidth}px`;
			this.host.plainEditOverlayBaseRect = {
				left: base.left,
				top: base.top,
				width: nextWidth,
				height: base.height,
			};
			return;
		}
		const overflow = overlay.scrollHeight - overlay.clientHeight;
		if (overflow <= 0) return;
		const expand = Math.max(1, Math.ceil(lineHeight));
		const nextHeight = base.height + expand;
		this.host.plainEditOverlayEl.style.height = `${nextHeight}px`;
		this.host.plainEditOverlayBaseRect = {
			left: base.left,
			top: base.top,
			width: base.width,
			height: nextHeight,
		};
	}

	private scheduleOverlayPositionRefine(): void {
		if (!this.overlayPositionNeedsRefine || !this.host.plainEditRange) {
			return;
		}
		if (this.overlayInputActive) {
			return;
		}
		if (this.overlayPositionRefineRaf !== null) return;
		this.overlayPositionRefineRaf = window.requestAnimationFrame(() => {
			this.overlayPositionRefineRaf = null;
			if (!this.overlayPositionNeedsRefine || !this.host.plainEditRange) {
				return;
			}
			if (this.overlayInputActive) {
				return;
			}
			this.overlayPositionNeedsRefine = false;
			this.updateOverlayPositionInternal(this.host.plainEditRange, {
				refine: true,
			});
		});
	}

	adjustOverlaySize(): void {
		if (this.fixedOverlaySize) return;
		if (!this.host.plainEditOverlayEl || !this.host.plainEditOverlayBaseRect)
			return;
		const base = this.host.plainEditOverlayBaseRect;
		const padding = 2;
		const baseWidth = Math.max(0, Math.ceil(base.width));
		const baseHeight = Math.max(0, Math.ceil(base.height));
		this.host.plainEditOverlayEl.style.width = `${baseWidth}px`;
		this.host.plainEditOverlayEl.style.height = `${baseHeight}px`;

		const scrollWidth = Math.ceil(this.host.plainEditOverlayEl.scrollWidth);
		const scrollHeight = Math.ceil(
			this.host.plainEditOverlayEl.scrollHeight
		);
		const nextWidth = Math.max(baseWidth, scrollWidth + padding);
		const nextHeight = Math.max(baseHeight, scrollHeight + padding);
		this.host.plainEditOverlayEl.style.width = `${nextWidth}px`;
		this.host.plainEditOverlayEl.style.height = `${nextHeight}px`;

		const writingMode =
			this.host.plainEditOverlayEl.style.writingMode ||
			getComputedStyle(this.host.plainEditOverlayEl).writingMode;
		if (writingMode === "vertical-rl") {
			const alignedLeft = base.left + base.width - nextWidth;
			this.host.plainEditOverlayEl.style.left = `${alignedLeft}px`;
		} else {
			this.host.plainEditOverlayEl.style.left = `${base.left}px`;
		}
		this.host.plainEditOverlayEl.style.top = `${base.top}px`;
	}

	private getWritingMode():
		| "vertical-rl"
		| "vertical-lr"
		| "horizontal-tb" {
		if (!this.host.plainEditOverlayEl) return "vertical-rl";
		const mode = getComputedStyle(this.host.plainEditOverlayEl).writingMode;
		if (mode === "horizontal-tb") return "horizontal-tb";
		if (mode === "vertical-lr") return "vertical-lr";
		return "vertical-rl";
	}

	private getArrowMoveDirection(
		key: string,
		atStart: boolean,
		atEnd: boolean,
		writingMode: "vertical-rl" | "vertical-lr" | "horizontal-tb"
	): "prev" | "next" | null {
		if (writingMode === "vertical-lr") {
			if (atEnd && key === "ArrowRight") {
				return "next";
			}
			if (atStart && key === "ArrowLeft") {
				return "prev";
			}
			return null;
		}
		if (writingMode === "vertical-rl") {
			if (atEnd && key === "ArrowLeft") {
				return "next";
			}
			if (atStart && key === "ArrowRight") {
				return "prev";
			}
			return null;
		}
		if (atEnd && key === "ArrowDown") {
			return "next";
		}
		if (atStart && key === "ArrowUp") {
			return "prev";
		}
		return null;
	}

	handleArrowKey(key: string): boolean {
		if (!this.host.plainEditOverlayEl || !this.host.plainEditRange) {
			return false;
		}
		if (
			this.host.plainEditRange.startLine !==
			this.host.plainEditRange.endLine
		) {
			return false;
		}
		const text = this.host.plainEditOverlayEl.value ?? "";
		const selectionStart = this.host.plainEditOverlayEl.selectionStart ?? 0;
		const selectionEnd =
			this.host.plainEditOverlayEl.selectionEnd ?? selectionStart;
		if (selectionStart !== selectionEnd) return false;
		const atStart = selectionStart === 0;
		const atEnd = selectionStart === text.length;
		if (!atStart && !atEnd) return false;
		const direction = this.getArrowMoveDirection(
			key,
			atStart,
			atEnd,
			this.getWritingMode()
		);
		if (!direction) return false;
		const currentLine = this.host.plainEditRange.startLine;
		const targetLine =
			direction === "prev" ? currentLine - 1 : currentLine + 1;
		if (targetLine < 0 || targetLine >= this.host.lineRanges.length) {
			return false;
		}
		const targetRange = this.host.lineRanges[targetLine];
		if (!targetRange) return false;
		const offset =
			direction === "prev" ? targetRange.to - targetRange.from : 0;
		this.commit(true, false);
		const targetPos = targetRange.from + Math.max(0, offset);
		this.host.setSelectionNormalized(targetPos, targetPos);
		this.startFromSelection();
		return true;
	}

	handleEnter(): boolean {
		if (
			!this.host.plainEditOverlayEl ||
			!this.host.plainEditRange ||
			!this.host.sotEditor
		) {
			return false;
		}
		if (
			this.host.plainEditRange.startLine !==
			this.host.plainEditRange.endLine
		) {
			return false;
		}
		const text = this.host.plainEditOverlayEl.value ?? "";
		const selectionStart = this.host.plainEditOverlayEl.selectionStart ?? 0;
		const selectionEnd =
			this.host.plainEditOverlayEl.selectionEnd ?? selectionStart;
		const from = Math.min(selectionStart, selectionEnd);
		const to = Math.max(selectionStart, selectionEnd);
		const before = text.slice(0, from);
		const after = text.slice(to);
		const nextText = `${before}\n${after}`;
		const nextPos = this.host.plainEditRange.from + before.length + 1;
		this.applyRangeReplacement(
			this.host.plainEditRange.from,
			this.host.plainEditRange.to,
			nextText,
			nextPos
		);
		return true;
	}

	handleBackspace(): boolean {
		if (
			!this.host.plainEditOverlayEl ||
			!this.host.plainEditRange ||
			!this.host.sotEditor
		) {
			return false;
		}
		if (
			this.host.plainEditRange.startLine !==
			this.host.plainEditRange.endLine
		) {
			return false;
		}
		const selectionStart = this.host.plainEditOverlayEl.selectionStart ?? 0;
		const selectionEnd =
			this.host.plainEditOverlayEl.selectionEnd ?? selectionStart;
		if (selectionStart !== selectionEnd) return false;
		if (selectionStart !== 0) return false;
		const currentLine = this.host.plainEditRange.startLine;
		if (currentLine <= 0) return false;
		const prevRange = this.host.lineRanges[currentLine - 1];
		if (!prevRange) return false;
		const doc = this.host.sotEditor.getDoc();
		const prevText = doc.slice(prevRange.from, prevRange.to);
		const currentText = this.host.plainEditOverlayEl.value ?? "";
		const merged = `${prevText}${currentText}`;
		const nextPos = prevRange.from + prevText.length;
		this.applyRangeReplacement(
			prevRange.from,
			this.host.plainEditRange.to,
			merged,
			nextPos
		);
		return true;
	}

	handleDelete(): boolean {
		if (
			!this.host.plainEditOverlayEl ||
			!this.host.plainEditRange ||
			!this.host.sotEditor
		) {
			return false;
		}
		if (
			this.host.plainEditRange.startLine !==
			this.host.plainEditRange.endLine
		) {
			return false;
		}
		const text = this.host.plainEditOverlayEl.value ?? "";
		const selectionStart = this.host.plainEditOverlayEl.selectionStart ?? 0;
		const selectionEnd =
			this.host.plainEditOverlayEl.selectionEnd ?? selectionStart;
		if (selectionStart !== selectionEnd) return false;
		if (selectionStart !== text.length) return false;
		const currentLine = this.host.plainEditRange.startLine;
		const nextLine = currentLine + 1;
		if (nextLine >= this.host.lineRanges.length) return false;
		const nextRange = this.host.lineRanges[nextLine];
		if (!nextRange) return false;
		const doc = this.host.sotEditor.getDoc();
		const nextText = doc.slice(nextRange.from, nextRange.to);
		const merged = `${text}${nextText}`;
		const nextPos = this.host.plainEditRange.from + text.length;
		this.applyRangeReplacement(
			this.host.plainEditRange.from,
			nextRange.to,
			merged,
			nextPos
		);
		return true;
	}

	applyRangeReplacement(
		from: number,
		to: number,
		text: string,
		nextPos: number
	): void {
		if (!this.host.sotEditor) return;
		this.host.updatePendingText("", true);
		this.host.immediateRender = true;
		this.host.plainEditCommitting = true;
		try {
			this.host.sotEditor.replaceRange(from, to, text);
		} finally {
			this.host.plainEditCommitting = false;
		}
		this.clearTargets();
		this.host.plainEditRange = null;
		if (this.host.plainEditOverlayEl) {
			this.host.plainEditOverlayEl.style.display = "none";
		}
		this.host.setSelectionNormalized(nextPos, nextPos);
		this.startFromSelection();
	}

	clearTargets(): void {
		if (!this.host.plainEditRange) return;
		for (
			let i = this.host.plainEditRange.startLine;
			i <= this.host.plainEditRange.endLine;
			i += 1
		) {
			const lineEl = this.host.getLineElement(i);
			if (!lineEl) continue;
			lineEl.classList.remove("tategaki-plain-overlay-target");
			lineEl.removeAttribute("data-plain-mode");
		}
	}

	applyTargetClass(lineEl: HTMLElement, lineIndex: number | null): void {
		if (!this.host.sourceModeEnabled || !this.host.plainEditRange) {
			lineEl.classList.remove("tategaki-plain-overlay-target");
			lineEl.removeAttribute("data-plain-mode");
			return;
		}
		if (lineIndex === null) return;
		if (
			lineIndex < this.host.plainEditRange.startLine ||
			lineIndex > this.host.plainEditRange.endLine
		) {
			lineEl.classList.remove("tategaki-plain-overlay-target");
			lineEl.removeAttribute("data-plain-mode");
			return;
		}
		lineEl.classList.add("tategaki-plain-overlay-target");
		lineEl.setAttribute("data-plain-mode", "true");
	}

	applyTargets(range: { startLine: number; endLine: number }): void {
		for (let i = range.startLine; i <= range.endLine; i += 1) {
			const lineEl = this.host.getLineElement(i);
			if (!lineEl) continue;
			this.applyTargetClass(lineEl, i);
		}
	}

	getRangeFromSelection(): {
		startLine: number;
		endLine: number;
		from: number;
		to: number;
		selectionStart: number;
		selectionEnd: number;
	} | null {
		if (!this.host.sotEditor) return null;
		const selection = this.host.sotEditor.getSelection();
		const from = Math.min(selection.anchor, selection.head);
		const to = Math.max(selection.anchor, selection.head);
		const activeOffset = selection.head;
		const activeLine = this.host.findLineIndex(activeOffset);
		if (activeLine === null) return null;
		const blockRange = this.getBlockLineRange(activeLine);
		const lineStart = blockRange?.start ?? activeLine;
		const lineEnd = blockRange?.end ?? activeLine;
		const startRange = this.host.lineRanges[lineStart];
		const endRange = this.host.lineRanges[lineEnd];
		if (!startRange || !endRange) return null;
		const rangeFrom = startRange.from;
		const rangeTo = endRange.to;
		const rangeLength = Math.max(0, rangeTo - rangeFrom);
		const selectionStart = Math.max(
			0,
			Math.min(from - rangeFrom, rangeLength)
		);
		const selectionEnd = Math.max(
			0,
			Math.min(to - rangeFrom, rangeLength)
		);
		return {
			startLine: lineStart,
			endLine: lineEnd,
			from: rangeFrom,
			to: rangeTo,
			selectionStart,
			selectionEnd,
		};
	}

	getBlockLineRange(
		lineIndex: number
	): { start: number; end: number } | null {
		if (lineIndex < 0 || lineIndex >= this.host.lineBlockKinds.length) {
			return null;
		}
		const kind = this.host.lineBlockKinds[lineIndex] ?? "normal";
		if (kind === "code" || kind === "code-fence") {
			return this.host.getCodeBlockRangeForLine(lineIndex) ?? {
				start: lineIndex,
				end: lineIndex,
			};
		}
		if (kind === "math" || kind === "math-fence") {
			const start = this.host.lineMathBlockStart[lineIndex];
			const end = this.host.lineMathBlockEnd[lineIndex];
			if (start !== null && end !== null) {
				return { start, end };
			}
		}
		if (kind === "callout" || kind === "callout-title") {
			const start = this.host.lineCalloutBlockStart[lineIndex];
			const end = this.host.lineCalloutBlockEnd[lineIndex];
			if (start !== null && end !== null) {
				return { start, end };
			}
		}
		if (kind === "table-row" || kind === "table-sep") {
			const start = this.host.lineTableBlockStart[lineIndex];
			const end = this.host.lineTableBlockEnd[lineIndex];
			if (start !== null && end !== null) {
				return { start, end };
			}
		}
		if (kind === "deflist") {
			const start = this.host.lineDeflistBlockStart[lineIndex];
			const end = this.host.lineDeflistBlockEnd[lineIndex];
			if (start !== null && end !== null) {
				return { start, end };
			}
		}
		if (kind === "frontmatter" || kind === "frontmatter-fence") {
			let start = lineIndex;
			let end = lineIndex;
			while (start > 0) {
				const prev = this.host.lineBlockKinds[start - 1] ?? "normal";
				if (prev !== "frontmatter" && prev !== "frontmatter-fence") {
					break;
				}
				start -= 1;
			}
			while (end + 1 < this.host.lineBlockKinds.length) {
				const next = this.host.lineBlockKinds[end + 1] ?? "normal";
				if (next !== "frontmatter" && next !== "frontmatter-fence") {
					break;
				}
				end += 1;
			}
			return { start, end };
		}
		return { start: lineIndex, end: lineIndex };
	}

	updateOverlayPosition(range: { startLine: number; endLine: number }): void {
		if (this.overlayInputActive) {
			this.overlayPositionDirty = true;
			return;
		}
		this.updateOverlayPositionInternal(range, { refine: false });
	}

	private scheduleInitialRefine(): void {
		this.overlayPositionNeedsRefine = true;
		this.scheduleOverlayPositionRefine();
	}

	private updateOverlayPositionInternal(
		range: { startLine: number; endLine: number },
		options: { refine: boolean }
	): void {
		if (!this.host.derivedRootEl || !this.host.plainEditOverlayEl) return;
		const rootRect = this.host.derivedRootEl.getBoundingClientRect();
		if (!options.refine) {
			const lineEl = this.host.getLineElement(range.startLine);
			if (!lineEl) return;
			this.host.ensureLineRendered(lineEl);
			const lineRect = lineEl.getBoundingClientRect();
			const quickRect = lineRect;
			const left =
				quickRect.left -
				rootRect.left +
				this.host.derivedRootEl.scrollLeft;
			const top =
				quickRect.top -
				rootRect.top +
				this.host.derivedRootEl.scrollTop;
			const width = Math.max(1, quickRect.width);
			const height = Math.max(1, quickRect.height);
			this.host.plainEditOverlayEl.style.left = `${left}px`;
			this.host.plainEditOverlayEl.style.top = `${top}px`;
			this.host.plainEditOverlayEl.style.width = `${width}px`;
			this.host.plainEditOverlayEl.style.height = `${height}px`;
			this.host.plainEditOverlayBaseRect = { left, top, width, height };
			this.scheduleInitialRefine();
			return;
		}
		let unionRect: DOMRect | null = null;
		const merge = (a: DOMRect, b: DOMRect): DOMRect => {
			const left = Math.min(a.left, b.left);
			const top = Math.min(a.top, b.top);
			const right = Math.max(a.right, b.right);
			const bottom = Math.max(a.bottom, b.bottom);
			return DOMRect.fromRect({
				x: left,
				y: top,
				width: Math.max(1, right - left),
				height: Math.max(1, bottom - top),
			});
		};
		for (let i = range.startLine; i <= range.endLine; i += 1) {
			const lineEl = this.host.getLineElement(i);
			if (!lineEl) continue;
			this.host.ensureLineRendered(lineEl);
			const rects = this.host.getLineVisualRects(lineEl);
			const lineRect = lineEl.getBoundingClientRect();
			const textRect = getRectUnion(rects, lineRect);
			const base = merge(textRect, lineRect);
			unionRect = unionRect ? merge(unionRect, base) : base;
		}
		if (!unionRect) return;
		const left =
			unionRect.left - rootRect.left + this.host.derivedRootEl.scrollLeft;
		const top =
			unionRect.top - rootRect.top + this.host.derivedRootEl.scrollTop;
		const width = Math.max(1, unionRect.width);
		const height = Math.max(1, unionRect.height);
		this.host.plainEditOverlayEl.style.left = `${left}px`;
		this.host.plainEditOverlayEl.style.top = `${top}px`;
		this.host.plainEditOverlayEl.style.width = `${width}px`;
		this.host.plainEditOverlayEl.style.height = `${height}px`;
		this.host.plainEditOverlayBaseRect = { left, top, width, height };
	}

	startFromSelection(): void {
		if (!this.host.sourceModeEnabled) return;
		if (this.host.plainEditCommitting) return;
		if (!this.host.derivedRootEl || !this.host.plainEditOverlayEl) return;
		const next = this.getRangeFromSelection();
		if (!next) return;
		if (
			this.host.plainEditRange &&
			this.host.plainEditRange.startLine === next.startLine &&
			this.host.plainEditRange.endLine === next.endLine &&
			this.host.plainEditRange.from === next.from &&
			this.host.plainEditRange.to === next.to
		) {
			if (!this.host.plainEditComposing) {
				this.host.plainEditOverlayEl.setSelectionRange(
					next.selectionStart,
					next.selectionEnd
				);
			}
			this.updateOverlayPosition(next);
			return;
		}

		if (this.host.plainEditRange) {
			this.commit(true, false);
		}

		const doc = this.host.sotEditor?.getDoc() ?? "";
		const text = doc.slice(next.from, next.to);
		this.host.plainEditOverlayEl.value = text;
		this.host.plainEditOverlayEl.style.display = "";
		this.host.plainEditOverlayEl.focus({ preventScroll: true });
		if (!this.host.plainEditComposing) {
			this.host.plainEditOverlayEl.setSelectionRange(
				next.selectionStart,
				next.selectionEnd
			);
		}
		this.clearTargets();
		this.host.plainEditRange = {
			from: next.from,
			to: next.to,
			startLine: next.startLine,
			endLine: next.endLine,
			originalText: text,
		};
		this.applyTargets(next);
		this.overlayPositionNeedsRefine = true;
		this.updateOverlayPositionInternal(next, { refine: false });
	}

	commit(save: boolean, updateSelection: boolean): void {
		if (this.host.plainEditCommitting) return;
		if (
			!this.host.plainEditRange ||
			!this.host.plainEditOverlayEl ||
			!this.host.sotEditor
		) {
			return;
		}
		this.host.plainEditCommitting = true;
		try {
			const range = this.host.plainEditRange;
			const value = this.host.plainEditOverlayEl.value ?? "";
			const selectionStart =
				this.host.plainEditOverlayEl.selectionStart ?? value.length;
			const selectionEnd =
				this.host.plainEditOverlayEl.selectionEnd ?? selectionStart;
			const currentSelection = this.host.sotEditor.getSelection();
			const currentFrom = Math.min(
				currentSelection.anchor,
				currentSelection.head
			);
			const currentTo = Math.max(
				currentSelection.anchor,
				currentSelection.head
			);
			const selectionInside =
				currentFrom >= range.from && currentTo <= range.to;
			const shouldUpdateSelection = updateSelection && selectionInside;

			if (save && value !== range.originalText) {
				this.host.sotEditor.replaceRange(range.from, range.to, value);
			}

			if (shouldUpdateSelection) {
				const docLength = this.host.sotEditor.getDoc().length;
				const anchor = Math.max(
					0,
					Math.min(range.from + selectionStart, docLength)
				);
				const head = Math.max(
					0,
					Math.min(range.from + selectionEnd, docLength)
				);
				this.host.setSelectionNormalized(anchor, head);
			}

			this.clearTargets();
			this.host.plainEditRange = null;
			this.host.plainEditOverlayEl.style.display = "none";
			this.resetOverlayInputState();
		} finally {
			this.host.plainEditCommitting = false;
		}
	}

	registerOutsidePointerHandler(): void {
		if (this.host.plainEditOutsidePointerHandler) return;
		this.host.plainEditOutsidePointerHandler = (event: PointerEvent) => {
			if (!this.host.sourceModeEnabled) return;
			if (!this.host.plainEditOverlayEl) return;
			const target = event.target as HTMLElement | null;
			if (!target) return;
			if (this.host.plainEditOverlayEl.contains(target)) return;
			if (!this.host.derivedRootEl?.contains(target)) return;
			this.commit(true, false);
		};
		document.addEventListener(
			"pointerdown",
			this.host.plainEditOutsidePointerHandler,
			true
		);
	}

	unregisterOutsidePointerHandler(): void {
		if (!this.host.plainEditOutsidePointerHandler) return;
		document.removeEventListener(
			"pointerdown",
			this.host.plainEditOutsidePointerHandler,
			true
		);
		this.host.plainEditOutsidePointerHandler = null;
	}
}
