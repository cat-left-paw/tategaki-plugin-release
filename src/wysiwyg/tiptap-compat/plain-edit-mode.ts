/**
 * PlainEditMode - TipTapエディタのプレーン編集モード
 *
 * 現在フォーカスされている段落のみをMarkdownソーステキストで編集できるモードを提供します。
 * ContentEditable版のBlockHybridManagerと同様の挙動を実現します。
 */

import { Editor } from "@tiptap/core";
import { EditorState, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import {
	DOMParser as PMDOMParser,
	DOMSerializer,
	Node as PMNode,
} from "@tiptap/pm/model";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import {
	renderInlineMarkdownToTipTapHtml,
	serializeInlineToMarkdown,
} from "./markdown-adapter";
import { createAozoraRubyRegExp } from "../../shared/aozora-ruby";
import {
	buildAozoraTcyText,
	isValidAozoraTcyBody,
	stripAozoraTcySyntax,
} from "../../shared/aozora-tcy";
import { debugWarn } from "../../shared/logger";

export interface PlainEditModeOptions {
	editor: Editor;
	getRubyEnabled?: () => boolean;
	getViewRoot?: () => HTMLElement | null;
	canFocusOverlay?: () => boolean;
	onModeChange?: (isPlainMode: boolean) => void;
	onUpdate?: () => void;
	onCommit?: () => void;
}

export type PlainEditCommand =
	| { type: "bold" | "italic" | "strike" | "underline" | "highlight" }
	| { type: "clear" }
	| { type: "clearTcy" }
	| { type: "link"; url: string; text?: string }
	| { type: "ruby"; ruby: string; text?: string; isDot?: boolean }
	| { type: "tcy"; text?: string };

interface PlainEditPluginState {
	pos: number | null;
}

interface ParagraphState {
	pos: number;
	originalHtml: string;
	originalMarkdown: string;
}

const isImeCompositionKey = (event: KeyboardEvent): boolean =>
	event.isComposing ||
	event.key === "Process" ||
	event.key === "Unidentified";

/**
 * PlainEditMode
 *
 * フォーカスされている段落のみをMarkdownソーステキスト編集モードに切り替える機能を提供
 * CE版のBlockHybridManagerと同様の挙動
 */
export class PlainEditMode {
	private options: PlainEditModeOptions;
	private isActive = false;
	private currentPlainParagraph: ParagraphState | null = null;
	private pluginKey = new PluginKey<PlainEditPluginState>(
		"tategakiPlainEdit"
	);
	private plugin: Plugin | null = null;
	private overlayEl: HTMLTextAreaElement | null = null;
	private overlayHost: HTMLElement | null = null;
	private overlayActivePos: number | null = null;
	private overlayBaseRect: {
		top: number;
		left: number;
		width: number;
		height: number;
	} | null = null;
	private isApplying = false;
	private lastView: EditorView | null = null;
	private isComposing = false;
	private pendingSelection: { start: number; end: number } | null = null;
	private suppressFocusOnNextStart = false;
	private outsidePointerHandler: ((event: PointerEvent) => void) | null = null;

	constructor(options: PlainEditModeOptions) {
		this.options = options;
	}

	/**
	 * プレーン編集モードが有効かどうか
	 */
	isPlainMode(): boolean {
		return this.isActive;
	}

	/**
	 * オーバーレイを一時的に無効化（非表示＋操作無効）
	 * モーダル表示前などでクリック干渉を防ぐために使用
	 */
	suspendOverlay(): void {
		if (this.overlayEl) {
			if (document.activeElement === this.overlayEl) {
				this.overlayEl.blur();
			}
			this.overlayEl.style.display = "none";
			this.overlayEl.style.pointerEvents = "none";
		}
	}

	/**
	 * 一時無効化したオーバーレイを復元
	 */
	resumeOverlay(): void {
		if (this.overlayEl && this.isActive && this.overlayActivePos != null) {
			this.overlayEl.style.display = "";
			this.overlayEl.style.pointerEvents = "";
		}
	}

	/**
	 * オーバーレイからフォーカスを外す（後方互換のため残す）
	 */
	blurOverlay(): void {
		this.suspendOverlay();
	}

	getSelectionText(): string {
		if (!this.overlayEl) {
			return "";
		}
		const start = this.overlayEl.selectionStart ?? 0;
		const end = this.overlayEl.selectionEnd ?? start;
		const from = Math.min(start, end);
		const to = Math.max(start, end);
		return this.overlayEl.value.slice(from, to);
	}

	applyInlineCommand(command: PlainEditCommand): boolean {
		if (!this.isActive || !this.overlayEl) {
			return false;
		}
		switch (command.type) {
			case "bold":
				this.wrapSelection("**", "**");
				return true;
			case "italic":
				this.wrapSelection("*", "*");
				return true;
			case "strike":
				this.wrapSelection("~~", "~~");
				return true;
			case "underline":
				this.wrapSelection("<u>", "</u>");
				return true;
			case "highlight":
				this.wrapSelection("==", "==");
				return true;
			case "clear":
				this.clearSelectionFormatting();
				return true;
			case "clearTcy":
				this.clearSelectionTcy();
				return true;
			case "link":
				this.insertLink(command.text ?? "", command.url);
				return true;
			case "ruby":
				this.insertRuby(command.text ?? "", command.ruby, command.isDot);
				return true;
			case "tcy":
				this.insertTcy(command.text ?? "");
				return true;
		}
		return false;
	}

	isOverlayTarget(target: EventTarget | null): boolean {
		if (!this.overlayEl || !target) {
			return false;
		}
		if (!(target instanceof Node)) {
			return false;
		}
		return target === this.overlayEl || this.overlayEl.contains(target);
	}

	/**
	 * プレーン編集モードを有効化（段落フォーカス追従を開始）
	 */
	activate(): void {
		if (this.isActive) return;

		this.isActive = true;
		this.registerPlugin();
		this.registerOutsidePointerHandler();
		this.options.onModeChange?.(true);
	}

	/**
	 * プレーン編集モードを無効化（全ての段落を装飾表示に戻す）
	 */
	deactivate(): void {
		if (!this.isActive) return;

		this.commitCurrentPlainParagraph(true);
		this.unregisterOutsidePointerHandler();
		this.unregisterPlugin();
		this.isActive = false;
		this.options.onModeChange?.(false);
	}

	/**
	 * プレーン編集モードをトグル
	 */
	toggle(): void {
		if (this.isActive) {
			this.deactivate();
		} else {
			this.activate();
		}
	}

	private registerPlugin(): void {
		if (this.plugin) return;
		this.plugin = this.createPlainEditPlugin();
		this.options.editor.registerPlugin(this.plugin);
	}

	private unregisterPlugin(): void {
		if (!this.plugin) return;
		this.options.editor.unregisterPlugin(this.pluginKey);
		this.plugin = null;
		this.destroyOverlay();
	}

	private createPlainEditPlugin(): Plugin {
		return new Plugin<PlainEditPluginState>({
			key: this.pluginKey,
			state: {
				init: (_config, state) => ({
					pos: this.findParagraphPos(state),
				}),
				apply: (_tr, _prev, _oldState, state) => ({
					pos: this.findParagraphPos(state),
				}),
			},
			props: {
				decorations: (state) => this.buildDecorations(state),
			},
			view: (view) => this.createOverlayView(view),
		});
	}

	private registerOutsidePointerHandler(): void {
		if (this.outsidePointerHandler) {
			return;
		}
		this.outsidePointerHandler = (event: PointerEvent) => {
			if (
				!this.isActive ||
				this.isApplying ||
				!this.currentPlainParagraph
			) {
				return;
			}
			if (!(event.target instanceof Element)) {
				return;
			}
			if (this.isFocusInsideView(event.target)) {
				return;
			}
			this.suppressFocusOnNextStart = true;
			this.commitCurrentPlainParagraph(true);
		};
		document.addEventListener(
			"pointerdown",
			this.outsidePointerHandler,
			true
		);
	}

	private unregisterOutsidePointerHandler(): void {
		if (!this.outsidePointerHandler) {
			return;
		}
		document.removeEventListener(
			"pointerdown",
			this.outsidePointerHandler,
			true
		);
		this.outsidePointerHandler = null;
	}

	private buildDecorations(state: EditorState): DecorationSet | null {
		if (!this.isActive) return null;

		const pluginState = this.pluginKey.getState(state);
		const pos = pluginState?.pos ?? null;
		if (pos == null) {
			return null;
		}

		const node = state.doc.nodeAt(pos);
		if (!node || !this.isPlainTargetNode(node)) {
			return null;
		}

		const deco = Decoration.node(pos, pos + node.nodeSize, {
			class: "tategaki-plain-overlay-target",
			"data-plain-mode": "true",
		});

		return DecorationSet.create(state.doc, [deco]);
	}

	private createOverlayView(view: EditorView): { update: (view: EditorView) => void; destroy: () => void } {
		this.ensureOverlayElement(view);
		this.updateOverlayFromView(view);
		return {
			update: (nextView) => {
				this.updateOverlayFromView(nextView);
			},
			destroy: () => {
				this.destroyOverlay();
			},
		};
	}

	private ensureOverlayElement(view: EditorView): void {
		const host = (view.dom.parentElement ?? view.dom) as HTMLElement;
		this.overlayHost = host;
		if (!this.overlayEl) {
			this.overlayEl = document.createElement("textarea");
			this.overlayEl.className = "tategaki-plain-overlay";
			this.overlayEl.spellcheck = false;
			this.overlayEl.wrap = "soft";
			this.overlayEl.addEventListener("mousedown", (event) => {
				if (event.button === 2) {
					event.preventDefault();
				}
				event.stopPropagation();
			});
			this.overlayEl.addEventListener("compositionstart", () => {
				this.isComposing = true;
			});
			this.overlayEl.addEventListener("compositionend", () => {
				this.isComposing = false;
			});
			this.overlayEl.addEventListener("keydown", (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					this.deactivate();
					return;
				}
				if (
					event.key.startsWith("Arrow") &&
					!event.shiftKey &&
					!event.altKey &&
					!event.metaKey &&
					!event.ctrlKey &&
					!this.isComposing &&
					!isImeCompositionKey(event)
				) {
					if (this.handleArrowKey(event.key)) {
						event.preventDefault();
						return;
					}
				}
				if (
					event.key === "Backspace" &&
					!event.shiftKey &&
					!this.isComposing &&
					!isImeCompositionKey(event) &&
					this.overlayEl?.selectionStart === 0 &&
					this.overlayEl?.selectionEnd === 0
				) {
					event.preventDefault();
					this.handleBackspaceAtStart();
					return;
				}
				if (
					event.key === "Enter" &&
					!event.shiftKey &&
					!this.isComposing &&
					!isImeCompositionKey(event)
				) {
					event.preventDefault();
					this.handleEnterKey();
					return;
				}
				event.stopPropagation();
			});
			this.overlayEl.addEventListener("input", () => {
				this.adjustOverlaySizeToContent();
				this.options.onUpdate?.();
			});
		}

		const computed = getComputedStyle(host);
		if (computed.position === "static") {
			host.style.position = "relative";
		}

		if (!this.overlayEl.parentElement) {
			host.appendChild(this.overlayEl);
		}
	}

	private updateOverlayFromView(view: EditorView): void {
		if (!this.isActive || this.isApplying) {
			this.hideOverlay();
			return;
		}

		this.lastView = view;
		const pluginState = this.pluginKey.getState(view.state);
		const pos = pluginState?.pos ?? null;
		if (pos == null) {
			this.commitCurrentPlainParagraph(true);
			this.hideOverlay();
			return;
		}

		if (this.overlayActivePos !== pos) {
			this.commitCurrentPlainParagraph(true);
			this.startPlainParagraph(view, pos);
		} else if (this.currentPlainParagraph) {
			this.currentPlainParagraph.pos = pos;
		}

		this.positionOverlay(view, pos);
	}

	private startPlainParagraph(view: EditorView, pos: number): void {
		const node = view.state.doc.nodeAt(pos);
		if (!node || !this.isPlainTargetNode(node)) {
			this.overlayActivePos = null;
			this.hideOverlay();
			return;
		}

		const originalHtml = this.serializeInlineHtml(node);
		const markdown = this.serializePlainMarkdown(node);

		this.currentPlainParagraph = {
			pos,
			originalHtml,
			originalMarkdown: markdown,
		};

		if (this.overlayEl) {
			this.overlayEl.value = markdown;
			this.overlayEl.style.display = "";
			const canFocusOverlay = this.options.canFocusOverlay?.() ?? true;
			if (!this.suppressFocusOnNextStart && canFocusOverlay) {
				this.overlayEl.focus({ preventScroll: true });
			}
			this.suppressFocusOnNextStart = false;
			if (this.pendingSelection) {
				const length = this.overlayEl.value.length;
				const start = Math.min(this.pendingSelection.start, length);
				const end = Math.min(this.pendingSelection.end, length);
				try {
					this.overlayEl.setSelectionRange(start, end);
				} catch (_) {
					// ignore selection failures
				}
				this.pendingSelection = null;
			}
		}

		this.overlayActivePos = pos;
	}

	private commitCurrentPlainParagraph(save: boolean): void {
		if (!this.currentPlainParagraph) {
			this.overlayActivePos = null;
			return;
		}

		const overlayValue = this.overlayEl?.value ?? "";
		const shouldApply =
			save && overlayValue !== this.currentPlainParagraph.originalMarkdown;
		if (shouldApply) {
			const { content, attrs } = this.normalizePlainMarkdown(overlayValue);
			const newHtml = this.renderInlineMarkdownToHtml(content);
			this.applyInlineHtmlToParagraph(
				this.currentPlainParagraph.pos,
				newHtml,
				true,
				attrs
			);
			this.options.onCommit?.();
		}

		this.currentPlainParagraph = null;
		this.overlayActivePos = null;
	}

	private isFocusInsideView(target: Element | null): boolean {
		const root = this.options.getViewRoot?.() ?? this.overlayHost;
		if (!root || !target) {
			return false;
		}
		return root.contains(target);
	}

	private positionOverlay(view: EditorView, pos: number): void {
		if (!this.overlayEl || !this.overlayHost) return;
		const paragraphElement = this.getParagraphElementAtPos(view, pos);
		if (!paragraphElement) {
			this.hideOverlay();
			return;
		}

		this.syncOverlayStyleFromParagraph(paragraphElement);

		const rect = paragraphElement.getBoundingClientRect();
		const hostRect = this.overlayHost.getBoundingClientRect();

		// 縦書き+リスト項目内の場合、サイズを補正
		const adjustedRect = this.adjustRectForVerticalListItem(
			paragraphElement,
			rect
		);

		const top =
			adjustedRect.top - hostRect.top + this.overlayHost.scrollTop;
		const left =
			adjustedRect.left - hostRect.left + this.overlayHost.scrollLeft;

		this.overlayEl.style.top = `${top}px`;
		this.overlayEl.style.left = `${left}px`;
		this.overlayEl.style.width = `${adjustedRect.width}px`;
		this.overlayEl.style.height = `${adjustedRect.height}px`;
		this.overlayBaseRect = {
			top,
			left,
			width: adjustedRect.width,
			height: adjustedRect.height,
		};
		this.adjustOverlaySizeToContent();
	}

	/**
	 * 縦書きモードでリスト項目内の段落の場合、rectを補正
	 * リストマーカー部分を除いた1列分の幅にし、高さはコンテナ全体を使用
	 */
	private adjustRectForVerticalListItem(
		element: HTMLElement,
		originalRect: DOMRect
	): DOMRect {
		const writingMode = this.getCurrentWritingMode();
		if (writingMode !== "vertical-rl") {
			return originalRect;
		}

		const listItem = element.closest("li");
		if (!listItem) {
			return originalRect;
		}

		// リスト項目内の段落の場合、テキストコンテンツの実際の範囲を計算
		const computedStyle = getComputedStyle(element);
		const fontSize = parseFloat(computedStyle.fontSize) || 16;
		const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.5;

		// 縦書きでは width が行数（列数）に相当
		// originalRect.width が 1行分（lineHeight）より大きければ複数行
		const singleLineWidth = lineHeight * 1.3; // 1行分の幅（余裕を含む）
		const isMultiLine = originalRect.width > singleLineWidth * 1.5;

		if (!isMultiLine) {
			// 1行の場合、幅を1行分に制限し、高さをリスト項目の高さに設定
			const listItemRect = listItem.getBoundingClientRect();

			return new DOMRect(
				originalRect.right - singleLineWidth, // 右端から1行分の位置
				listItemRect.top, // リスト項目の上端
				singleLineWidth,
				listItemRect.height // リスト項目の高さ
			);
		}

		return originalRect;
	}

	private wrapSelection(prefix: string, suffix: string): void {
		if (!this.overlayEl) return;
		const selection = this.getSelectionRange();
		const selectedText = selection.text;
		const wrapped = `${prefix}${selectedText}${suffix}`;
		const nextStart = selection.start + prefix.length;
		const nextEnd = nextStart + selectedText.length;
		if (selection.start === selection.end) {
			this.replaceSelection(wrapped, nextStart, nextStart);
			return;
		}
		this.replaceSelection(wrapped, nextStart, nextEnd);
	}

	private clearSelectionFormatting(): void {
		if (!this.overlayEl) return;
		const selection = this.getSelectionRange();
		if (selection.start === selection.end) {
			return;
		}
		const stripped = this.stripInlineFormatting(selection.text);
		const nextStart = selection.start;
		const nextEnd = nextStart + stripped.length;
		this.replaceSelection(stripped, nextStart, nextEnd);
	}

	private insertLink(text: string, url: string): void {
		if (!this.overlayEl) return;
		const selection = this.getSelectionRange();
		const displayText = text || selection.text || url;
		if (!displayText || !url) {
			return;
		}
		const linkText = `[${displayText}](${url})`;
		const textStart = selection.start + 1;
		const textEnd = textStart + displayText.length;
		this.replaceSelection(linkText, textStart, textEnd);
	}

	private insertRuby(text: string, ruby: string, isDot?: boolean): void {
		if (!this.overlayEl) return;
		const selection = this.getSelectionRange();
		const base = text || selection.text;
		if (!base) {
			return;
		}
		if (!ruby || ruby.trim() === "") {
			this.replaceSelection(base);
			return;
		}
		let rubyText = "";
		if (isDot) {
			const emphasisChar = ruby.trim() || "・";
			rubyText = Array.from(base)
				.map((char) => `｜${char}《${emphasisChar}》`)
				.join("");
		} else {
			rubyText = `｜${base}《${ruby}》`;
		}
		const nextStart = selection.start + rubyText.length;
		this.replaceSelection(rubyText, nextStart, nextStart);
	}

	private insertTcy(text: string): void {
		if (!this.overlayEl) return;
		const selection = this.getSelectionRange();
		const base = text || selection.text;
		if (!isValidAozoraTcyBody(base)) {
			return;
		}
		const tcyText = buildAozoraTcyText(base);
		const nextStart = selection.start + tcyText.length;
		this.replaceSelection(tcyText, nextStart, nextStart);
	}

	private clearSelectionTcy(): void {
		if (!this.overlayEl) return;
		const selection = this.getSelectionRange();
		if (selection.start === selection.end) return;
		const stripped = stripAozoraTcySyntax(selection.text);
		const nextStart = selection.start;
		const nextEnd = nextStart + stripped.length;
		this.replaceSelection(stripped, nextStart, nextEnd);
	}

	private replaceSelection(
		nextText: string,
		nextSelectionStart?: number,
		nextSelectionEnd?: number
	): void {
		if (!this.overlayEl) return;
		const selection = this.getSelectionRange();
		const value = this.overlayEl.value;
		const before = value.slice(0, selection.start);
		const after = value.slice(selection.end);
		this.overlayEl.value = `${before}${nextText}${after}`;
		const base = before.length;
		const start =
			nextSelectionStart ?? base + nextText.length;
		const end = nextSelectionEnd ?? start;
		try {
			this.overlayEl.setSelectionRange(start, end);
		} catch (_) {
			// ignore selection failures
		}
		this.options.onUpdate?.();
		this.adjustOverlaySizeToContent();
	}

	private getSelectionRange(): {
		start: number;
		end: number;
		text: string;
	} {
		if (!this.overlayEl) {
			return { start: 0, end: 0, text: "" };
		}
		const start = this.overlayEl.selectionStart ?? 0;
		const end = this.overlayEl.selectionEnd ?? start;
		const from = Math.min(start, end);
		const to = Math.max(start, end);
		return {
			start: from,
			end: to,
			text: this.overlayEl.value.slice(from, to),
		};
	}

	private stripInlineFormatting(text: string): string {
		let result = text;
		result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
		result = result.replace(/==([^=\n]+)==/g, "$1");
		result = result.replace(/\*\*([^*\n]+)\*\*/g, "$1");
		result = result.replace(/\*([^*\n]+)\*/g, "$1");
		result = result.replace(/~~([^~\n]+)~~/g, "$1");
		result = result.replace(/<u>([\s\S]*?)<\/u>/gi, "$1");
		result = stripAozoraTcySyntax(result);
		const rubyRegex = createAozoraRubyRegExp();
		result = result.replace(rubyRegex, (_match, ...args) => {
			const groups = args[args.length - 1] as
				| Record<string, string | undefined>
				| undefined;
			return groups?.body2 ?? groups?.body1 ?? _match;
		});
		return result;
	}

	private adjustOverlaySizeToContent(): void {
		if (!this.overlayEl || !this.overlayBaseRect) {
			return;
		}
		const base = this.overlayBaseRect;
		const padding = 2;
		const baseWidth = Math.max(0, Math.ceil(base.width));
		const baseHeight = Math.max(0, Math.ceil(base.height));
		this.overlayEl.style.width = `${baseWidth}px`;
		this.overlayEl.style.height = `${baseHeight}px`;

		const scrollWidth = Math.ceil(this.overlayEl.scrollWidth);
		const scrollHeight = Math.ceil(this.overlayEl.scrollHeight);
		const nextWidth = Math.max(baseWidth, scrollWidth + padding);
		const nextHeight = Math.max(baseHeight, scrollHeight + padding);
		this.overlayEl.style.width = `${nextWidth}px`;
		this.overlayEl.style.height = `${nextHeight}px`;

		const writingMode =
			this.overlayEl.style.writingMode ||
			getComputedStyle(this.overlayEl).writingMode;
		if (writingMode === "vertical-rl") {
			const alignedLeft = base.left + base.width - nextWidth;
			this.overlayEl.style.left = `${alignedLeft}px`;
		} else {
			this.overlayEl.style.left = `${base.left}px`;
		}
		this.overlayEl.style.top = `${base.top}px`;
	}

	private getParagraphElementAtPos(view: EditorView, pos: number): HTMLElement | null {
		const domPos = view.domAtPos(pos + 1).node;
		const baseElement =
			domPos.nodeType === Node.ELEMENT_NODE
				? (domPos as HTMLElement)
				: domPos.parentElement;
		if (!baseElement) {
			return null;
		}
		return (
			baseElement.closest(
				"p, h1, h2, h3, h4, h5, h6"
			) ?? baseElement
		);
	}

	private findParagraphPos(state: EditorState): number | null {
		const { $from } = state.selection;
		for (let depth = $from.depth; depth > 0; depth--) {
			const node = $from.node(depth);
			if (this.isPlainTargetNode(node)) {
				return $from.before(depth);
			}
		}
		return null;
	}

	private isPlainTargetNode(node: PMNode): boolean {
		return node.type.name === "paragraph" || node.type.name === "heading";
	}

	private serializeInlineHtml(node: PMNode): string {
		const serializer = DOMSerializer.fromSchema(this.options.editor.schema);
		const wrapper = document.createElement("div");
		wrapper.appendChild(serializer.serializeFragment(node.content));
		return wrapper.innerHTML;
	}

	private renderInlineMarkdownToHtml(markdown: string): string {
		const enableRuby = this.options.getRubyEnabled?.() ?? true;
		return renderInlineMarkdownToTipTapHtml(markdown, { enableRuby });
	}

	private serializePlainMarkdown(node: PMNode): string {
		if (node.type.name === "heading") {
			const level =
				typeof node.attrs?.level === "number"
					? node.attrs.level
					: 1;
			const prefix = "#".repeat(Math.min(Math.max(level, 1), 6));
			const content = serializeInlineToMarkdown(node);
			return `${prefix} ${content}`.trimEnd();
		}
		return serializeInlineToMarkdown(node);
	}

	private normalizePlainMarkdown(
		value: string
	): { content: string; attrs?: Record<string, unknown> } {
		const node = this.currentPlainParagraph
			? this.options.editor.state.doc.nodeAt(
					this.currentPlainParagraph.pos
				)
			: null;
		if (!node || node.type.name !== "heading") {
			return { content: value };
		}
		const currentLevel =
			typeof node.attrs?.level === "number" ? node.attrs.level : 1;
		const parsed = this.parseHeadingMarkdown(value, currentLevel);
		const attrs = { ...node.attrs, level: parsed.level };
		return { content: parsed.content, attrs };
	}

	private parseHeadingMarkdown(
		value: string,
		fallbackLevel: number
	): { level: number; content: string } {
		const match = value.match(/^(#{1,6})\s+(.*)$/);
		if (match) {
			const level = Math.min(Math.max(match[1].length, 1), 6);
			return { level, content: match[2] ?? "" };
		}
		return { level: fallbackLevel, content: value };
	}

	private handleEnterKey(): void {
		const view = this.lastView;
		if (!view || !this.overlayEl || !this.currentPlainParagraph) {
			return;
		}

		const text = this.overlayEl.value ?? "";
		const selectionStart = this.overlayEl.selectionStart ?? text.length;
		const selectionEnd = this.overlayEl.selectionEnd ?? selectionStart;
		const beforeText = text.slice(0, selectionStart);
		const afterText = text.slice(selectionEnd);

		const state = this.options.editor.state;
		const node = state.doc.nodeAt(this.currentPlainParagraph.pos);
		if (!node) {
			return;
		}

		const paragraphType = state.schema.nodes.paragraph;
		if (!paragraphType) {
			return;
		}

		const isHeading = node.type.name === "heading";
		const currentLevel =
			typeof node.attrs?.level === "number" ? node.attrs.level : 1;

		const parser = PMDOMParser.fromSchema(state.schema);

		const beforeWrapper = document.createElement("div");
		const beforeParsed = isHeading
			? this.parseHeadingMarkdown(beforeText, currentLevel)
			: { level: currentLevel, content: beforeText };
		beforeWrapper.innerHTML = this.renderInlineMarkdownToHtml(
			beforeParsed.content
		);
		const beforeSlice = parser.parseSlice(beforeWrapper, {
			preserveWhitespace: true,
		});
		const beforeNode = isHeading
			? node.type.createChecked(
					{ ...node.attrs, level: beforeParsed.level },
					beforeSlice.content
				)
			: paragraphType.createChecked(null, beforeSlice.content);

		const afterWrapper = document.createElement("div");
		const afterContent = isHeading
			? this.stripHeadingPrefix(afterText)
			: afterText;
		afterWrapper.innerHTML = this.renderInlineMarkdownToHtml(afterContent);
		const afterSlice = parser.parseSlice(afterWrapper, {
			preserveWhitespace: true,
		});
		const afterNode = paragraphType.createChecked(null, afterSlice.content);

		const from = this.currentPlainParagraph.pos;
		const to = from + node.nodeSize;
		this.currentPlainParagraph = null;
		this.overlayActivePos = null;

		// オーバーレイを一時的に非表示にして、次の更新で再表示されるようにする
		this.hideOverlay();

		const tr = state.tr.replaceWith(from, to, [beforeNode, afterNode]);
		const selectionPos = from + beforeNode.nodeSize + 1;
		tr.setSelection(TextSelection.create(tr.doc, selectionPos));
		view.dispatch(tr);

		// トランザクション後にオーバーレイを更新
		requestAnimationFrame(() => {
			if (this.isActive && this.lastView) {
				this.updateOverlayFromView(this.lastView);
			}
		});
	}

	private stripHeadingPrefix(value: string): string {
		const match = value.match(/^(#{1,6})\s+(.*)$/);
		if (!match) {
			return value;
		}
		return match[2] ?? "";
	}

	private handleBackspaceAtStart(): void {
		const view = this.lastView;
		if (!view || !this.overlayEl || !this.currentPlainParagraph) {
			return;
		}

		const state = this.options.editor.state;
		const pos = this.currentPlainParagraph.pos;
		const node = state.doc.nodeAt(pos);
		if (!node) {
			return;
		}

		const resolved = state.doc.resolve(pos);
		const index = resolved.index(resolved.depth);
		if (index === 0) {
			return;
		}

		const parent = resolved.parent;
		const prevNode = parent.child(index - 1);
		if (!prevNode || !prevNode.isTextblock) {
			return;
		}

		const prevPos = pos - prevNode.nodeSize;
		const prevMarkdown = serializeInlineToMarkdown(prevNode);
		const currentMarkdown = this.overlayEl.value ?? "";
		const mergedMarkdown = `${prevMarkdown}${currentMarkdown}`;

		const parser = PMDOMParser.fromSchema(state.schema);
		const wrapper = document.createElement("div");
		wrapper.innerHTML = this.renderInlineMarkdownToHtml(mergedMarkdown);
		const slice = parser.parseSlice(wrapper, { preserveWhitespace: true });
		const mergedNode = prevNode.type.createChecked(prevNode.attrs, slice.content);

		this.currentPlainParagraph = null;
		this.overlayActivePos = prevPos;
		this.overlayEl.value = mergedMarkdown;
		try {
			this.overlayEl.setSelectionRange(prevMarkdown.length, prevMarkdown.length);
		} catch (_) {
			// ignore selection failures
		}

		const from = prevPos;
		const to = pos + node.nodeSize;
		const tr = state.tr.replaceWith(from, to, mergedNode);
		const selectionPos = prevPos + 1 + prevNode.content.size;
		tr.setSelection(TextSelection.create(tr.doc, selectionPos));
		view.dispatch(tr);
	}

	private handleArrowKey(key: string): boolean {
		if (!this.overlayEl || !this.currentPlainParagraph) {
			return false;
		}

		const text = this.overlayEl.value ?? "";
		const selectionStart = this.overlayEl.selectionStart ?? 0;
		const selectionEnd = this.overlayEl.selectionEnd ?? selectionStart;
		if (selectionStart !== selectionEnd) {
			return false;
		}

		const atStart = selectionStart === 0;
		const atEnd = selectionStart === text.length;
		if (!atStart && !atEnd) {
			return false;
		}

		const direction = this.getArrowMoveDirection(
			key,
			atStart,
			atEnd,
			this.getCurrentWritingMode()
		);
		if (!direction) {
			return false;
		}

		const currentPos = this.currentPlainParagraph.pos;
		this.commitCurrentPlainParagraph(true);

		const state = this.options.editor.state;
		const target = this.findAdjacentPlainParagraph(state, currentPos, direction);
		if (!target) {
			return false;
		}

		const targetMarkdown = serializeInlineToMarkdown(target.node);
		const offset = direction === "prev" ? targetMarkdown.length : 0;
		this.pendingSelection = { start: offset, end: offset };

		const selectionPos =
			direction === "prev"
				? target.pos + target.node.content.size
				: target.pos + 1;
		const tr = state.tr.setSelection(TextSelection.create(state.doc, selectionPos));
		this.options.editor.view.dispatch(tr);
		return true;
	}

	private getArrowMoveDirection(
		key: string,
		atStart: boolean,
		atEnd: boolean,
		writingMode: "vertical-rl" | "horizontal-tb"
	): "prev" | "next" | null {
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

	private getCurrentWritingMode(): "vertical-rl" | "horizontal-tb" {
		if (this.overlayEl) {
			const mode = getComputedStyle(this.overlayEl).writingMode;
			if (mode === "horizontal-tb") {
				return "horizontal-tb";
			}
		}
		return "vertical-rl";
	}

	private findAdjacentPlainParagraph(
		state: EditorState,
		pos: number,
		direction: "prev" | "next"
	): { pos: number; node: PMNode } | null {
		const currentNode = state.doc.nodeAt(pos);
		if (!currentNode) {
			return null;
		}

		const resolved = state.doc.resolve(pos);
		const depth = resolved.depth;
		const parent = resolved.parent;
		const index = resolved.index(depth);

		if (direction === "prev") {
			let cursorPos = pos;
			for (let idx = index - 1; idx >= 0; idx--) {
				const node = parent.child(idx);
				cursorPos -= node.nodeSize;
				if (this.isPlainTargetNode(node)) {
					return { pos: cursorPos, node };
				}
			}
			return null;
		}

		let cursorPos = pos + currentNode.nodeSize;
		for (let idx = index + 1; idx < parent.childCount; idx++) {
			const node = parent.child(idx);
			if (this.isPlainTargetNode(node)) {
				return { pos: cursorPos, node };
			}
			cursorPos += node.nodeSize;
		}
		return null;
	}

	private syncOverlayStyleFromParagraph(paragraphElement: HTMLElement): void {
		if (!this.overlayEl) return;
		const computed = getComputedStyle(paragraphElement);
		const hostComputed = this.overlayHost
			? getComputedStyle(this.overlayHost)
			: null;
		const style = this.overlayEl.style;
		style.fontFamily = computed.fontFamily;
		style.fontSize = computed.fontSize;
		style.fontWeight = computed.fontWeight;
		style.fontStyle = computed.fontStyle;
		style.lineHeight = computed.lineHeight;
		style.letterSpacing = computed.letterSpacing;
		style.textAlign = computed.textAlign;
		style.textIndent = computed.textIndent;
		const resolvedColor =
			computed.color === "transparent" ||
			computed.color === "rgba(0, 0, 0, 0)"
				? hostComputed?.color ?? computed.color
				: computed.color;
		style.color = resolvedColor;
		style.caretColor = resolvedColor;
		style.direction = computed.direction;
		style.setProperty(
			"writing-mode",
			computed.getPropertyValue("writing-mode")
		);
		style.setProperty(
			"text-orientation",
			computed.getPropertyValue("text-orientation")
		);
	}

	private applyInlineHtmlToParagraph(
		pos: number,
		html: string,
		addToHistory: boolean,
		attrs?: Record<string, unknown>
	): void {
		try {
			const { state, view } = this.options.editor;
			const node = state.doc.nodeAt(pos);
			if (!node) return;

			const wrapper = document.createElement("div");
			wrapper.innerHTML = html;
			const parser = PMDOMParser.fromSchema(state.schema);
			const slice = parser.parseSlice(wrapper, { preserveWhitespace: true });
			const from = pos + 1;
			const to = pos + node.nodeSize - 1;
			const tr = state.tr.replaceRange(from, to, slice);
			if (attrs) {
				tr.setNodeMarkup(pos, undefined, attrs);
			}
			if (!addToHistory) {
				tr.setMeta("addToHistory", false);
			}
			this.isApplying = true;
			view.dispatch(tr);
		} catch (error) {
			debugWarn(
				"[Tategaki TipTap Plain Edit] Failed to apply html:",
				error
			);
		} finally {
			this.isApplying = false;
		}
	}

	private hideOverlay(): void {
		if (this.overlayEl) {
			this.overlayEl.style.display = "none";
		}
		this.overlayBaseRect = null;
	}

	private destroyOverlay(): void {
		if (this.overlayEl) {
			this.overlayEl.remove();
			this.overlayEl = null;
		}
		this.overlayHost = null;
		this.overlayActivePos = null;
		this.overlayBaseRect = null;
		this.currentPlainParagraph = null;
	}

	/**
	 * 破棄
	 */
	destroy(): void {
		if (this.isActive) {
			this.deactivate();
		}
	}
}
