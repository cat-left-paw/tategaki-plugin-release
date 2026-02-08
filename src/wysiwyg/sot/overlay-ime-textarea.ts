type OverlayCallbacks = {
	replaceSelection: (text: string) => void;
	backspace: () => void;
	del: () => void;
	undo: () => void;
	redo: () => void;
	selectAll?: () => void;
	backspaceEmpty?: () => void;
	navigate?: (event: KeyboardEvent) => void;
	onPendingText?: (text: string) => void;
	listOutliner?: (event: KeyboardEvent) => boolean;
	shouldHandleOutlinerKey?: (event: KeyboardEvent) => boolean;
	cancelSelection?: () => void;
	compositionStart?: () => void;
	compositionEnd?: () => void;
};

type OverlayFocusCallbacks = {
	onFocus?: () => void;
	onBlur?: () => void;
};

export class OverlayImeTextarea {
	private readonly parentEl: HTMLElement;
	private readonly textarea: HTMLTextAreaElement;
	private readonly callbacks: OverlayCallbacks;
	private readonly focusCallbacks: OverlayFocusCallbacks;
	private isComposing = false;
	private isActive = true;
	private isVertical = true;
	private maxHeight = 500;
	private maxWidth = 500;
	private baseLineSize = 32; // 1行/1列分のサイズ
	private textIndentPx = 0;
	private readonly caretVisibleClass = "tategaki-show-native-caret";
	private flushTimer: number | null = null;
	private readonly flushDelayMs = 250;
	private readonly flushLengthThreshold = 8;
	private sizeRaf: number | null = null;
	private readonly immediateFlushChars = new Set([
		" ",
		"\t",
		"\n",
		"\u3000",
		"、",
		"。",
		"，",
		"．",
		"！",
		"？",
		"!",
		"?",
		",",
		".",
		":",
		";",
		"：",
		"；",
	]);

	constructor(
		parent: HTMLElement,
		callbacks: OverlayCallbacks,
		focusCallbacks: OverlayFocusCallbacks = {},
	) {
		this.parentEl = parent;
		this.callbacks = callbacks;
		this.focusCallbacks = focusCallbacks;

		this.textarea = parent.createEl("textarea", {
			cls: "tategaki-sot-overlay-textarea",
		});
		this.textarea.spellcheck = false;
		this.textarea.autocapitalize = "off";
		this.textarea.autocomplete = "off";
		this.textarea.setAttribute("autocorrect", "off");
		// 折り返しを有効化（soft wrap）
		this.textarea.setAttribute("wrap", "soft");
		this.textarea.addEventListener("focus", () => {
			this.focusCallbacks.onFocus?.();
		});
		this.textarea.addEventListener("blur", () => {
			this.focusCallbacks.onBlur?.();
			if (!this.isComposing) {
				this.flushPending();
			}
		});

		this.textarea.addEventListener("compositionstart", (event) => {
			this.isComposing = true;
			this.clearFlushTimer();
			this.textarea.classList.add("tategaki-ime-visible");
			this.callbacks.compositionStart?.();
			const pending = (event as CompositionEvent).data ?? "";
			this.updateDynamicSize(pending);
		});

		this.textarea.addEventListener("compositionupdate", (event) => {
			const pending =
				(event as CompositionEvent).data ?? this.textarea.value;
			this.callbacks.onPendingText?.(pending);
			this.updateDynamicSize(pending);
		});

		this.textarea.addEventListener("compositionend", (event) => {
			this.isComposing = false;
			this.textarea.classList.remove("tategaki-ime-visible");
			const pending =
				(event as CompositionEvent).data ?? this.textarea.value;
			this.textarea.value = pending;
			this.callbacks.onPendingText?.(pending);
			this.callbacks.compositionEnd?.();
			this.flushPending();
		});

		this.textarea.addEventListener("input", () => {
			if (this.isComposing) return;
			const value = this.textarea.value;
			this.callbacks.onPendingText?.(value);
			if (
				value.length >= this.flushLengthThreshold ||
				this.shouldFlushImmediate(value)
			) {
				this.flushPending();
				return;
			}
			this.scheduleFlush();
		});

		this.textarea.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				if (!this.isComposing && !event.isComposing) {
					event.preventDefault();
					this.callbacks.cancelSelection?.();
				}
				event.stopPropagation();
				return;
			}
			const allowPropagation =
				(event.metaKey || event.ctrlKey) &&
				event.shiftKey &&
				!event.altKey &&
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
					event.key,
				) &&
				!(this.callbacks.shouldHandleOutlinerKey?.(event) ?? false);
			if (!allowPropagation) {
				event.stopPropagation();
			}
			if (this.isComposing || event.isComposing) return;

			const isMod = event.metaKey || event.ctrlKey;
			const isOutlinerKey = (() => {
				if (!this.callbacks.listOutliner) return false;
				if (this.callbacks.shouldHandleOutlinerKey) {
					return this.callbacks.shouldHandleOutlinerKey(event);
				}
				if (!isMod && !event.altKey && event.key === "Tab") return true;
				return (
					isMod &&
					!event.shiftKey &&
					!event.altKey &&
					[
						"ArrowUp",
						"ArrowDown",
						"ArrowLeft",
						"ArrowRight",
					].includes(event.key)
				);
			})();
			if (isOutlinerKey && this.callbacks.listOutliner) {
				this.flushPending();
				const handled = this.callbacks.listOutliner(event);
				if (handled || event.key === "Tab") {
					event.preventDefault();
					return;
				}
			}
			if (isMod && (event.key === "z" || event.key === "Z")) {
				event.preventDefault();
				if (event.shiftKey) {
					this.callbacks.redo();
				} else {
					this.callbacks.undo();
				}
				return;
			}

			if (isMod && (event.key === "y" || event.key === "Y")) {
				event.preventDefault();
				this.callbacks.redo();
				return;
			}

			if (isMod && (event.key === "a" || event.key === "A")) {
				event.preventDefault();
				this.flushPending();
				this.callbacks.selectAll?.();
				return;
			}

			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				this.flushPending("\n");
				return;
			}

			if (event.key === "Backspace" && this.textarea.value.length === 0) {
				event.preventDefault();
				if (event.metaKey || event.ctrlKey) {
					this.callbacks.backspaceEmpty?.();
				} else {
					this.callbacks.backspace();
				}
				return;
			}

			if (event.key === "Delete" && this.textarea.value.length === 0) {
				event.preventDefault();
				this.callbacks.del();
				return;
			}

			if (
				this.textarea.value.length === 0 &&
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
					event.key,
				)
			) {
				event.preventDefault();
				this.callbacks.navigate?.(event);
			}
		});

		this.textarea.addEventListener("keyup", (event) => {
			if (event.key !== "Escape") return;
			if (!this.isComposing && !event.isComposing) {
				event.preventDefault();
			}
			event.stopPropagation();
		});
	}

	focus(preventScroll = true): void {
		if (!this.isActive) return;
		if (preventScroll) {
			const parentScrollTop = this.parentEl.scrollTop;
			const parentScrollLeft = this.parentEl.scrollLeft;
			try {
				(this.textarea as any).focus({ preventScroll: true });
			} catch (_) {
				this.textarea.focus();
			}
			this.parentEl.scrollTop = parentScrollTop;
			this.parentEl.scrollLeft = parentScrollLeft;
			return;
		}
		this.textarea.focus();
	}

	setActive(active: boolean): void {
		if (this.isActive === active) return;
		this.isActive = active;
		this.textarea.style.display = active ? "" : "none";
		this.textarea.disabled = !active;
		if (!active) {
			this.isComposing = false;
			this.textarea.value = "";
			this.textarea.classList.remove("tategaki-ime-visible");
			this.textarea.blur();
			this.callbacks.onPendingText?.("");
			this.clearFlushTimer();
			this.resetSize();
		}
	}

	isFocused(): boolean {
		return document.activeElement === this.textarea;
	}

	getSelectionStart(): number | null {
		const start = this.textarea.selectionStart;
		if (start === null || !Number.isFinite(start)) return null;
		return Math.max(0, start);
	}

	setCaretVisible(visible: boolean): void {
		if (visible) {
			this.textarea.classList.add(this.caretVisibleClass);
		} else {
			this.textarea.classList.remove(this.caretVisibleClass);
		}
	}

	setAnchorPosition(left: number, top: number): void {
		this.textarea.style.left = `${left}px`;
		this.textarea.style.right = "";
		this.textarea.style.top = `${top}px`;
	}

	/**
	 * 縦書き用：右端を基準に位置を設定
	 * 幅が増えても右端は固定される
	 */
	setAnchorPositionVertical(right: number, top: number): void {
		// rightは親要素の左端からの距離なので、親の幅から引く必要がある
		// ただしposition:absoluteでrightを使う場合は親の右端からの距離
		// ここではleftの代わりにrightを使い、幅が増えても右端が固定されるようにする
		this.textarea.style.left = "";
		this.textarea.style.right = `${this.parentEl.clientWidth - right}px`;
		this.textarea.style.top = `${top}px`;
	}

	/**
	 * textareaの制約を設定する
	 * @param isVertical 縦書きかどうか
	 * @param maxSize 縦書きなら最大高さ、横書きなら最大幅
	 * @param lineSize 1行/1列分のサイズ
	 */
	setConstraints(
		isVertical: boolean,
		maxSize: number,
		lineSize: number,
	): void {
		const modeChanged = this.isVertical !== isVertical;
		this.isVertical = isVertical;
		this.baseLineSize = lineSize;

		if (isVertical) {
			this.maxHeight = maxSize;
			// 高さは常に最大サイズに設定
			this.textarea.style.height = `${maxSize}px`;
			// 幅はモード変更時のみ初期化、それ以外は維持
			if (modeChanged || !this.textarea.style.width) {
				this.textarea.style.width = `${lineSize}px`;
			}
		} else {
			this.maxWidth = maxSize;
			// 幅は常に最大サイズに設定
			this.textarea.style.width = `${maxSize}px`;
			// 高さはモード変更時のみ初期化、それ以外は維持
			if (modeChanged || !this.textarea.style.height) {
				this.textarea.style.height = `${lineSize}px`;
			}
		}
	}

	setTextIndent(indentPx: number): void {
		const next = Number.isFinite(indentPx) ? Math.max(0, indentPx) : 0;
		if (this.textIndentPx === next) return;
		this.textIndentPx = next;
		this.textarea.style.textIndent = `${next}px`;
	}

	/**
	 * 入力内容に応じてサイズを動的に調整する
	 * textareaのスクロールサイズに基づいて必要な列/行数を計算する
	 */
	private updateDynamicSize(pendingText?: string): void {
		void pendingText;
		const maxSpan = this.baseLineSize * 10;
		let prevSize = 0;
		let nextSize = 0;
		if (this.isVertical) {
			// 縦書き: 高さは固定し、必要な列数に応じて幅を広げる
			const measuredWidth = Math.ceil(this.textarea.scrollWidth);
			const currentWidth =
				this.textarea.clientWidth ||
				Number.parseFloat(this.textarea.style.width) ||
				0;
			let neededWidth = Math.max(
				this.baseLineSize,
				Math.min(measuredWidth, maxSpan),
			);
			// 折り返し直前で1列分先に確保（入力直後の測定遅延対策）
			if (measuredWidth > currentWidth + 1) {
				neededWidth = Math.max(
					neededWidth,
					currentWidth + this.baseLineSize,
				);
			}
			neededWidth = Math.min(neededWidth, maxSpan);
			const nextWidth = Math.max(currentWidth, neededWidth);
			prevSize = currentWidth;
			nextSize = nextWidth;
			this.textarea.style.width = `${nextWidth}px`;
		} else {
			// 横書き: 幅は固定し、必要な行数に応じて高さを伸ばす
			const measuredHeight = Math.ceil(this.textarea.scrollHeight);
			const currentHeight =
				this.textarea.clientHeight ||
				Number.parseFloat(this.textarea.style.height) ||
				0;
			let neededHeight = Math.max(
				this.baseLineSize,
				Math.min(measuredHeight, maxSpan),
			);
			// 折り返し直前で1行分先に確保（入力直後の測定遅延対策）
			if (measuredHeight > currentHeight + 1) {
				neededHeight = Math.max(
					neededHeight,
					currentHeight + this.baseLineSize,
				);
			}
			neededHeight = Math.min(neededHeight, maxSpan);
			const nextHeight = Math.max(currentHeight, neededHeight);
			prevSize = currentHeight;
			nextSize = nextHeight;
			this.textarea.style.height = `${nextHeight}px`;
		}

		// レイアウト更新直後に再計測（サイズが実際に変わった場合のみ）
		const didResize = nextSize > prevSize + 0.5;
		if (didResize && this.sizeRaf === null) {
			this.sizeRaf = window.requestAnimationFrame(() => {
				this.sizeRaf = null;
				this.updateDynamicSize();
			});
		}
	}

	getPendingText(): string {
		return this.textarea.value;
	}

	isImeVisible(): boolean {
		return this.isComposing;
	}

	private shouldFlushImmediate(value: string): boolean {
		if (value.length === 0) return false;
		const lastChar = value[value.length - 1] ?? "";
		return this.immediateFlushChars.has(lastChar);
	}

	private scheduleFlush(): void {
		this.clearFlushTimer();
		this.flushTimer = window.setTimeout(() => {
			this.flushTimer = null;
			this.flushPending();
		}, this.flushDelayMs);
	}

	private clearFlushTimer(): void {
		if (this.flushTimer !== null) {
			window.clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	private flushPending(extraText = ""): void {
		if (this.isComposing) return;
		const value = this.textarea.value;
		if (value.length === 0 && extraText.length === 0) {
			this.clearFlushTimer();
			return;
		}
		const payload = `${value}${extraText}`;
		this.callbacks.replaceSelection(payload);
		this.textarea.value = "";
		this.callbacks.onPendingText?.("");
		this.clearFlushTimer();
		// サイズを初期状態にリセット
		this.resetSize();
	}

	/**
	 * サイズを初期状態にリセット
	 */
	private resetSize(): void {
		if (this.isVertical) {
			this.textarea.style.width = `${this.baseLineSize}px`;
		} else {
			this.textarea.style.height = `${this.baseLineSize}px`;
		}
	}

	destroy(): void {
		this.callbacks.onPendingText?.("");
		this.clearFlushTimer();
		if (this.sizeRaf !== null) {
			window.cancelAnimationFrame(this.sizeRaf);
			this.sizeRaf = null;
		}
		this.textarea.detach();
	}
}
