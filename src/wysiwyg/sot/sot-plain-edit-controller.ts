import { ChangeSet } from "@codemirror/state";
import type { MarkdownView, TFile } from "obsidian";
import type { LineRange } from "./line-ranges";
import { checkSoTWrite } from "./sot-write-guard";
import type { SoTEditor } from "./sot-editor";
import { resolveSoTFocusBlockForLineIndex } from "./sot-focus-block-resolver";
import { resolveSoTPlainEditHomeEndSelection } from "./sot-plain-edit-navigation";
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
	currentFile?: TFile | null;
	pairedMarkdownView?: MarkdownView | null;
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
	lineCodeBlockPart: (
		| null
		| "single"
		| "start"
		| "middle"
		| "end"
	)[];
	lineMathBlockStart: Array<number | null>;
	lineMathBlockEnd: Array<number | null>;
	lineCalloutBlockStart: Array<number | null>;
	lineCalloutBlockEnd: Array<number | null>;
	lineTableBlockStart: Array<number | null>;
	lineTableBlockEnd: Array<number | null>;
	lineDeflistBlockStart: Array<number | null>;
	lineDeflistBlockEnd: Array<number | null>;
	lineHeadingSectionEnd: Array<number | null>;
	lineHeadingHiddenBy: Array<number | null>;
	sotEditor: SoTEditor | null;
	immediateRender: boolean;
	updatePendingText: (text: string, force?: boolean) => void;
	setSelectionNormalized: (anchor: number, head: number) => void;
	findLineIndex: (pos: number) => number | null;
	getLineElement: (index: number) => HTMLElement | null;
	ensureLineRendered: (lineEl: HTMLElement) => void;
	getLineVisualRects: (lineEl: HTMLElement) => DOMRect[];
	toggleSourceMode: () => void;
	isLeafActive?: () => boolean;
};

const isImeCompositionKey = (event: KeyboardEvent): boolean =>
	event.isComposing ||
	event.keyCode === 229 ||
	event.key === "Process" ||
	event.key === "Unidentified";

export class SoTPlainEditController {
	private readonly host: PlainEditHost;
	private readonly overlayResizeIdleMs = 120;
	private overlayPositionDirty = false;
	private overlayInputActive = false;
	private overlayInputIdleTimer: number | null = null;
	private overlayPositionNeedsRefine = false;
	private overlayPositionRefineRaf: number | null = null;
	private readonly fixedOverlaySize = false;
	private overlayFixedExpandRaf: number | null = null;
	private shiftedElements: HTMLElement[] = [];
	private retainedEdit = false;
	private blockedComposition: { value: string; start: number; end: number; range: PlainEditRange | null } | null = null;

	private restoreBlockedComposition(): void {
		const blocked = this.blockedComposition, overlay = this.host.plainEditOverlayEl;
		if (!blocked || !overlay || blocked.range !== this.host.plainEditRange) return;
		overlay.value = blocked.value;
		overlay.setSelectionRange(blocked.start, blocked.end);
	}

	/** A rejected composition can lose compositionend after restoring the textarea. */
	private endBlockedComposition(restore = true): void {
		if (!this.blockedComposition) return;
		if (restore) this.restoreBlockedComposition();
		this.blockedComposition = null;
		this.host.plainEditComposing = false;
	}

	hasUnsavedText(): boolean {
		return !!this.host.plainEditRange && !!this.host.plainEditOverlayEl &&
			this.host.plainEditOverlayEl.value !== this.host.plainEditRange.originalText;
	}

	private checkWrite(closing = false): boolean {
		const retained = !closing && this.hasUnsavedText();
		if (checkSoTWrite(this.host.sotEditor, retained)) return true;
		this.retainedEdit = retained;
		return false;
	}

	/** Validate the opened range, including when a replacement also joins a neighbour. */
	private checkTarget(closing = false): boolean {
		const range = this.host.plainEditRange;
		const doc = this.host.sotEditor?.getDoc();
		const sameFile = !!this.host.currentFile &&
			this.host.pairedMarkdownView?.file?.path === this.host.currentFile.path;
		const sameText = !!range && doc !== undefined && range.from >= 0 &&
			range.to <= doc.length && doc.slice(range.from, range.to) === range.originalText;
		// Plain fields span whole lines; an empty range compares equal at any position.
		const sameLines = !!range && doc !== undefined &&
			(range.from === 0 || doc[range.from - 1] === "\n") &&
			(range.to === doc.length || doc[range.to] === "\n");
		if (sameFile && sameText && sameLines) return true;
		this.retainedEdit = !closing && this.hasUnsavedText();
		this.host.sotEditor?.notifyTargetChanged?.(this.retainedEdit, closing);
		return false;
	}

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
			overlay.addEventListener("beforeinput", (event) => {
				const composingInput = event.isComposing || event.inputType === "insertCompositionText" || event.inputType === "deleteCompositionText";
				if (this.blockedComposition && !composingInput) {
					// This may be the commit of the rejected IME, with no compositionend.
					event.preventDefault();
					event.stopPropagation();
					this.endBlockedComposition();
					return;
				}
				if (this.blockedComposition || (!this.host.plainEditComposing && !this.checkWrite())) {
					event.preventDefault();
					event.stopPropagation();
				}
			});
			overlay.addEventListener("compositionstart", (event) => {
				if (this.blockedComposition && this.blockedComposition.range !== this.host.plainEditRange) this.endBlockedComposition(false);
				if (!this.checkWrite()) {
					if (!this.blockedComposition) this.blockedComposition = { value: overlay.value, start: overlay.selectionStart, end: overlay.selectionEnd, range: this.host.plainEditRange };
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				this.endBlockedComposition(false);
				this.host.plainEditComposing = true;
				this.markOverlayInputActive();
			});
			overlay.addEventListener("compositionend", () => {
				this.host.plainEditComposing = false;
				if (this.blockedComposition) {
					this.endBlockedComposition();
					return;
				}
				this.markOverlayInputActive();
			});
			overlay.addEventListener("blur", () => this.endBlockedComposition());
			overlay.addEventListener("keydown", (event) => {
				if (this.blockedComposition && !isImeCompositionKey(event)) this.endBlockedComposition();
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					this.host.toggleSourceMode();
					return;
				}
				if (
					!this.host.plainEditComposing &&
					!isImeCompositionKey(event)
				) {
					const nextSelection = resolveSoTPlainEditHomeEndSelection({
						text: overlay.value ?? "",
						key: event.key,
						selectionStart: overlay.selectionStart ?? 0,
						selectionEnd: overlay.selectionEnd ?? 0,
						selectionDirection: overlay.selectionDirection,
						shiftKey: event.shiftKey,
						altKey: event.altKey,
						metaKey: event.metaKey,
						ctrlKey: event.ctrlKey,
					});
					if (nextSelection) {
						event.preventDefault();
						event.stopPropagation();
						overlay.setSelectionRange(
							nextSelection.start,
							nextSelection.end,
							nextSelection.direction
						);
						return;
					}
				}
				if (
					!event.shiftKey &&
					!event.altKey &&
					!event.metaKey &&
					!event.ctrlKey &&
					!this.host.plainEditComposing &&
					!isImeCompositionKey(event)
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
				if (this.blockedComposition) { this.restoreBlockedComposition(); return; }
				if (!this.hasUnsavedText()) this.retainedEdit = false;
				this.adjustOverlaySize();
				this.markOverlayInputActive();
			});
			this.host.plainEditOverlayEl = overlay;
			this.host.derivedRootEl.appendChild(overlay);
		}
	}

	destroyOverlay(): void {
		this.endBlockedComposition(false);
		this.blockedComposition = null;
		this.retainedEdit = false;
		this.clearShiftedElements();
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

		/* 後続行要素を拡張分だけシフト */
		const overflowX = nextWidth - baseWidth;
		const overflowY = nextHeight - baseHeight;
		this.shiftSiblingLines(writingMode, overflowX, overflowY);
	}

	private shiftSiblingLines(
		writingMode: string,
		overflowX: number,
		overflowY: number
	): void {
		/* シフト不要ならリセットして終了 */
		const isVertical = writingMode.startsWith("vertical");
		const shift = isVertical ? overflowX : overflowY;
		if (shift <= 0) {
			this.clearShiftedElements();
			return;
		}

		/* 対象範囲の末尾行の後続兄弟を取得 */
		if (!this.host.plainEditRange) {
			this.clearShiftedElements();
			return;
		}
		const endLineEl = this.host.getLineElement(
			this.host.plainEditRange.endLine
		);
		if (!endLineEl) {
			this.clearShiftedElements();
			return;
		}

		/* 既にシフト中の要素をリセット */
		this.clearShiftedElements();

		/* transform を適用 */
		const transform = isVertical
			? writingMode === "vertical-rl"
				? `translateX(-${shift}px)`
				: `translateX(${shift}px)`
			: `translateY(${shift}px)`;
		let sibling = endLineEl.nextElementSibling as HTMLElement | null;
		while (sibling) {
			sibling.style.transform = transform;
			this.shiftedElements.push(sibling);
			sibling = sibling.nextElementSibling as HTMLElement | null;
		}
	}

	clearShiftedElements(): void {
		for (const el of this.shiftedElements) {
			el.style.transform = "";
		}
		this.shiftedElements = [];
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
		if (!this.commit(true, false)) return true;
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
		if (!this.checkWrite() || !this.checkTarget()) return;
		this.host.updatePendingText("", true);
		this.host.immediateRender = true;
		this.host.plainEditCommitting = true;
		try {
			if (this.host.sotEditor.replaceRange(from, to, text) === false) {
				this.retainedEdit = this.hasUnsavedText();
				this.host.sotEditor.notifyWriteBlocked?.(this.retainedEdit);
				return;
			}
		} finally {
			this.host.plainEditCommitting = false;
		}
		this.retainedEdit = false;
		this.clearTargets();
		this.host.plainEditRange = null;
		if (this.host.plainEditOverlayEl) {
			this.host.plainEditOverlayEl.style.display = "none";
		}
		this.host.setSelectionNormalized(nextPos, nextPos);
		this.startFromSelection();
	}

	clearTargets(): void {
		this.clearShiftedElements();
		const targets = this.host.derivedRootEl?.querySelectorAll<HTMLElement>(
			".tategaki-plain-overlay-target, [data-plain-mode]"
		) ?? [];
		for (const lineEl of Array.from(targets)) {
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
		const resolved = resolveSoTFocusBlockForLineIndex(
			{
				lineRanges: this.host.lineRanges,
				lineBlockKinds: this.host.lineBlockKinds,
				lineCodeBlockPart: this.host.lineCodeBlockPart,
				lineMathBlockStart: this.host.lineMathBlockStart,
				lineMathBlockEnd: this.host.lineMathBlockEnd,
				lineCalloutBlockStart: this.host.lineCalloutBlockStart,
				lineCalloutBlockEnd: this.host.lineCalloutBlockEnd,
				lineTableBlockStart: this.host.lineTableBlockStart,
				lineTableBlockEnd: this.host.lineTableBlockEnd,
				lineDeflistBlockStart: this.host.lineDeflistBlockStart,
				lineDeflistBlockEnd: this.host.lineDeflistBlockEnd,
				lineHeadingSectionEnd: this.host.lineHeadingSectionEnd,
				lineHeadingHiddenBy: this.host.lineHeadingHiddenBy,
			},
			lineIndex,
		);
		if (!resolved) return null;
		// Phase V1 では resolver helper だけを先行導入し、
		// plain edit の通常段落編集体験は従来どおり 1 行に保つ。
		if (resolved.kind === "paragraph") {
			return {
				start: resolved.lineIndex,
				end: resolved.lineIndex,
			};
		}
		return {
			start: resolved.blockStartLine,
			end: resolved.blockEndLine,
		};
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
		this.adjustOverlaySize();
	}

	startFromSelection(): void {
		if (!this.host.sourceModeEnabled) return;
		if (this.host.plainEditCommitting) return;
		if (!this.host.derivedRootEl || !this.host.plainEditOverlayEl) return;
		let next = this.getRangeFromSelection();
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

		this.endBlockedComposition();
		if (this.host.plainEditRange) {
			const range = this.host.plainEditRange;
			const selection = this.host.sotEditor?.getSelection();
			const oldLength = this.host.sotEditor?.getDoc().length ?? 0;
			const value = this.host.plainEditOverlayEl.value;
			const changed = this.hasUnsavedText();
			if ((this.retainedEdit && changed) || !this.commit(true, false)) return;
			// replaceRange selects the inserted text's end. Keep the requested destination.
			if (changed && selection) {
				const changes = ChangeSet.of({ from: range.from, to: range.to, insert: value }, oldLength);
				this.host.plainEditCommitting = true;
				try {
					this.host.setSelectionNormalized(changes.mapPos(selection.anchor, 1), changes.mapPos(selection.head, 1));
				} finally {
					this.host.plainEditCommitting = false;
				}
			}
			next = this.getRangeFromSelection();
			if (!next) return;
		}

		const doc = this.host.sotEditor?.getDoc() ?? "";
		const text = doc.slice(next.from, next.to);
		this.host.plainEditComposing = false;
		this.host.plainEditOverlayEl.value = text;
		this.host.plainEditOverlayEl.style.display = "";
		const isLeafActive = this.host.isLeafActive?.() ?? true;
		if (isLeafActive) {
			this.host.plainEditOverlayEl.focus({ preventScroll: true });
		}
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
		this.adjustOverlaySize();
	}

	/** Rejection can arrive synchronously inside commit(), so do not re-enter it. */
	discardRejectedEdit(): void {
		this.endBlockedComposition(false);
		this.retainedEdit = false;
		this.clearTargets();
		this.host.plainEditRange = null;
		if (this.host.plainEditOverlayEl) {
			this.host.plainEditOverlayEl.value = "";
			this.host.plainEditOverlayEl.style.display = "none";
		}
		this.resetOverlayInputState();
	}

	commit(save: boolean, updateSelection: boolean, closing = false): boolean {
		if (this.host.plainEditCommitting) return false;
		if (
			!this.host.plainEditRange ||
			!this.host.plainEditOverlayEl ||
			!this.host.sotEditor
		) {
			return true;
		}
		if (closing) this.endBlockedComposition();
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
				if (!this.checkWrite(closing) || !this.checkTarget(closing)) {
					if (closing) this.discardRejectedEdit();
					return false;
				}
				if (this.host.sotEditor.replaceRange(range.from, range.to, value) === false) {
					this.retainedEdit = !closing && this.hasUnsavedText();
					this.host.sotEditor.notifyWriteBlocked?.(this.retainedEdit);
					if (closing) this.discardRejectedEdit();
					return false;
				}
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
			this.retainedEdit = false;
			return true;
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
			// Do not run a task or other pointer command after a refused field commit.
			if (!this.commit(true, false)) {
				event.preventDefault();
				event.stopPropagation();
			}
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
