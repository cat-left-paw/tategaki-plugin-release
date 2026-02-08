import type { LineRange } from "./line-ranges";
import type { SoTEditor } from "./sot-editor";
import { getCaretPositionFromPoint } from "./sot-selection-geometry";

export type NativeSelectionSupportContext = {
	isEnabled: () => boolean;
	isCeImeMode?: () => boolean;
	shouldAllowDomSelection?: () => boolean;
	getDerivedContentEl: () => HTMLElement | null;
	getSotEditor: () => SoTEditor | null;
	getLineRanges: () => LineRange[];
	getLineElement: (lineIndex: number) => HTMLElement | null;
	getLineElementForNode: (node: Node | null) => HTMLElement | null;
	isSelectionInsideDerivedContent: (selection: Selection | null) => boolean;
	ensureLineRendered: (lineEl: HTMLElement) => void;
	findLineIndex?: (offset: number) => number | null;
	findTextNodeAtOffset?: (
		lineEl: HTMLElement,
		localOffset: number
	) => { node: Text; offset: number } | null;
	resolveOffsetFromCaretPosition: (
		lineEl: HTMLElement,
		target: { node: Node; offset: number } | null,
		lineLength: number
	) => number | null;
	setSelectionNormalized?: (anchor: number, head: number) => void;
	applyCutRange?: (from: number, to: number) => void;
	onSelectionActiveChanged?: (active: boolean) => void;
};

type SelectionOffsets = { anchor: number; head: number };

type EndpointSnapshot = { point: { x: number; y: number } | null };

export class NativeSelectionSupport {
	private context: NativeSelectionSupportContext;
	private selectionActive = false;
	private restoringSelection = false;
	private syncingFromDom = false;
	private syncingToDom = false;
	private lastStableOffsets: SelectionOffsets | null = null;

	constructor(context: NativeSelectionSupportContext) {
		this.context = context;
	}

	isSelectionActive(): boolean {
		return this.context.isEnabled() && this.selectionActive;
	}

	handleSelectionChange(): void {
		if (!this.context.isEnabled()) {
			if (this.selectionActive) {
				this.selectionActive = false;
				this.context.onSelectionActiveChanged?.(false);
			}
			return;
		}
		if (this.restoringSelection) return;
		if (this.syncingToDom) return;

		const contentEl = this.context.getDerivedContentEl();
		const sotEditor = this.context.getSotEditor();
		if (!contentEl || !sotEditor) {
			if (this.selectionActive) {
				this.selectionActive = false;
				this.context.onSelectionActiveChanged?.(false);
			}
			return;
		}
		const selection = contentEl.ownerDocument.getSelection();
		const inside =
			!!selection &&
			this.context.isSelectionInsideDerivedContent(selection);
		const active = !!selection && !selection.isCollapsed && inside;
		if (active !== this.selectionActive) {
			this.selectionActive = active;
			this.context.onSelectionActiveChanged?.(active);
			if (!active) {
				this.lastStableOffsets = null;
			}
		}
		if (!selection || !inside) return;
		if (active) {
			this.ensureSelectionEndpointsRendered(selection);
		}

		if (this.context.isCeImeMode?.()) return;
		const offsets = this.getSelectionOffsetsFromDom(true);
		if (!offsets) return;
		const unstable = this.isUnstableDomSelection(selection, contentEl);
		if (unstable && this.lastStableOffsets) {
			return;
		}
		if (!unstable) {
			this.lastStableOffsets = offsets;
		}
		const current = sotEditor.getSelection();
		if (
			current.anchor === offsets.anchor &&
			current.head === offsets.head
		) {
			return;
		}
		if (!this.context.setSelectionNormalized) return;
		this.syncingFromDom = true;
		try {
			this.context.setSelectionNormalized(
				offsets.anchor,
				offsets.head
			);
		} finally {
			this.syncingFromDom = false;
		}
	}

	tryHandleCopyCut(event: ClipboardEvent, isCut: boolean): boolean {
		if (!this.context.isEnabled()) return false;
		const contentEl = this.context.getDerivedContentEl();
		const sotEditor = this.context.getSotEditor();
		if (!contentEl || !sotEditor) return false;

		// 先に端点行を実描画して、DOM→SoTのオフセット解決を安定させる。
		const selection = contentEl.ownerDocument.getSelection();
		if (
			selection &&
			this.context.isSelectionInsideDerivedContent(selection) &&
			!selection.isCollapsed
		) {
			this.ensureSelectionEndpointsRendered(selection);
		}

		const offsets = this.getSelectionOffsetsFromDom();
		if (!offsets) return false;
		const from = Math.min(offsets.anchor, offsets.head);
		const to = Math.max(offsets.anchor, offsets.head);
		if (from === to) return false;

		const text = sotEditor.getDoc().slice(from, to);
		if (event.clipboardData) {
			event.clipboardData.setData("text/plain", text);
			event.clipboardData.setData("text/markdown", text);
		}
		event.preventDefault();
		event.stopPropagation();

		if (isCut) {
			// 選択操作はネイティブに寄せつつ、文書更新はSoT側で行う。
			if (this.context.applyCutRange) {
				this.context.applyCutRange(from, to);
			} else {
				sotEditor.replaceRange(from, to, "");
			}
		}
		return true;
	}

	getSelectionOffsetsFromDom(
		allowCollapsed = false
	): SelectionOffsets | null {
		const contentEl = this.context.getDerivedContentEl();
		const sotEditor = this.context.getSotEditor();
		if (!contentEl || !sotEditor) return null;
		const selection = contentEl.ownerDocument.getSelection();
		if (
			!selection ||
			(!allowCollapsed && selection.isCollapsed) ||
			!this.context.isSelectionInsideDerivedContent(selection)
		) {
			return null;
		}
		const docLength = sotEditor.getDoc().length;
		const anchor = this.getOffsetFromSelectionNode(
			selection.anchorNode,
			selection.anchorOffset,
			docLength
		);
		const head = this.getOffsetFromSelectionNode(
			selection.focusNode,
			selection.focusOffset,
			docLength
		);
		if (anchor === null || head === null) return null;
		return { anchor, head };
	}

	private isUnstableDomSelection(
		selection: Selection,
		contentEl: HTMLElement
	): boolean {
		if (
			selection.anchorNode !== contentEl &&
			selection.focusNode !== contentEl
		) {
			return false;
		}
		if (this.isFullContentSelection(selection, contentEl)) {
			return false;
		}
		return true;
	}

	private isFullContentSelection(
		selection: Selection,
		contentEl: HTMLElement
	): boolean {
		if (
			selection.anchorNode !== contentEl ||
			selection.focusNode !== contentEl
		) {
			return false;
		}
		const max = contentEl.childNodes.length;
		const a = selection.anchorOffset;
		const f = selection.focusOffset;
		return (a === 0 && f === max) || (f === 0 && a === max);
	}

	private getOffsetFromSelectionNode(
		node: Node | null,
		offset: number,
		docLength: number
	): number | null {
		const contentEl = this.context.getDerivedContentEl();
		if (!node || !contentEl) return null;

		// selectAll等で、selectionがcontentElを指すケースを特別扱い
		if (node === contentEl) {
			return offset <= 0 ? 0 : docLength;
		}

		const lineEl = this.context.getLineElementForNode(node);
		if (!lineEl) return null;
		const from = Number.parseInt(lineEl.dataset.from ?? "0", 10);
		const to = Number.parseInt(lineEl.dataset.to ?? "0", 10);
		const lineLength = Math.max(0, to - from);
		const local = this.context.resolveOffsetFromCaretPosition(
			lineEl,
			{ node, offset },
			lineLength
		);
		if (local === null) return from;
		return Math.max(0, Math.min(from + local, docLength));
	}

	syncDomSelectionFromSot(anchor: number, head: number): void {
		if (!this.context.isEnabled()) return;
		if (this.context.isCeImeMode?.()) return;
		if (this.context.shouldAllowDomSelection?.() === false) return;
		if (this.syncingFromDom) return;
		const contentEl = this.context.getDerivedContentEl();
		const selection = contentEl?.ownerDocument.getSelection() ?? null;
		if (!contentEl || !selection) return;

		const anchorPos = this.getDomPositionForOffset(anchor);
		const headPos = this.getDomPositionForOffset(head);
		if (!anchorPos || !headPos) return;

		this.syncingToDom = true;
		try {
			const selectionAny = selection as any;
			if (typeof selectionAny.setBaseAndExtent === "function") {
				selectionAny.setBaseAndExtent(
					anchorPos.node,
					anchorPos.offset,
					headPos.node,
					headPos.offset
				);
			} else {
				const range = contentEl.ownerDocument.createRange();
				range.setStart(anchorPos.node, anchorPos.offset);
				range.setEnd(headPos.node, headPos.offset);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			} catch (_) {
				// noop: DOM側のSelection同期失敗は無視（ブラウザ差異・一時状態の可能性）
			} finally {
				this.syncingToDom = false;
			}
		}

	private getDomPositionForOffset(
		offset: number
	): { node: Node; offset: number } | null {
		const sotEditor = this.context.getSotEditor();
		const contentEl = this.context.getDerivedContentEl();
		const findLineIndex = this.context.findLineIndex;
		if (!sotEditor || !contentEl || !findLineIndex) return null;
		const docLength = sotEditor.getDoc().length;
		const safeOffset = Math.max(0, Math.min(offset, docLength));
		const lineIndex = findLineIndex(safeOffset);
		if (lineIndex === null) return null;
		const lineRanges = this.context.getLineRanges();
		const lineRange = lineRanges[lineIndex];
		const lineEl = this.context.getLineElement(lineIndex);
		if (!lineRange || !lineEl) return null;
		this.context.ensureLineRendered(lineEl);
		const lineLength = Math.max(0, lineRange.to - lineRange.from);
		const localOffset = Math.max(
			0,
			Math.min(safeOffset - lineRange.from, lineLength)
		);
		const target = this.context.findTextNodeAtOffset?.(
			lineEl,
			localOffset
		);
		if (target) {
			return { node: target.node, offset: target.offset };
		}
		const eol = lineEl.querySelector(
			".tategaki-sot-eol"
		) as HTMLElement | null;
		const textNode =
			eol?.firstChild && eol.firstChild.nodeType === Node.TEXT_NODE
				? (eol.firstChild as Text)
				: null;
		if (textNode) {
			return { node: textNode, offset: textNode.length };
		}
		return { node: lineEl, offset: 0 };
	}

	private ensureSelectionEndpointsRendered(selection: Selection): void {
		const contentEl = this.context.getDerivedContentEl();
		if (!contentEl) return;

		const anchorLine = this.context.getLineElementForNode(
			selection.anchorNode
		);
		const focusLine = this.context.getLineElementForNode(
			selection.focusNode
		);

		const anchorNeeds =
			!!anchorLine && anchorLine.dataset.virtual === "1";
		const focusNeeds =
			!!focusLine && focusLine.dataset.virtual === "1";
		if (!anchorNeeds && !focusNeeds) return;

		const doc = contentEl.ownerDocument;
		const snapshot = this.snapshotSelectionEndpoints(selection);
		this.restoringSelection = true;
		try {
			if (anchorNeeds && anchorLine) {
				this.context.ensureLineRendered(anchorLine);
			}
			if (focusNeeds && focusLine && focusLine !== anchorLine) {
				this.context.ensureLineRendered(focusLine);
			}
			this.restoreSelectionFromSnapshot(doc, selection, snapshot);
		} finally {
			this.restoringSelection = false;
		}
	}

	private snapshotSelectionEndpoints(selection: Selection): {
		anchor: EndpointSnapshot;
		focus: EndpointSnapshot;
	} {
		const anchorPoint = this.getEndpointPoint(
			selection.anchorNode,
			selection.anchorOffset
		);
		const focusPoint = this.getEndpointPoint(
			selection.focusNode,
			selection.focusOffset
		);
		return {
			anchor: { point: anchorPoint },
			focus: { point: focusPoint },
		};
	}

	private getEndpointPoint(
		node: Node | null,
		offset: number
	): { x: number; y: number } | null {
		const contentEl = this.context.getDerivedContentEl();
		if (!contentEl || !node) return null;
		if (!contentEl.contains(node)) return null;
		try {
			const range = contentEl.ownerDocument.createRange();
			range.setStart(node, offset);
			range.setEnd(node, offset);
			const rect = range.getBoundingClientRect();
			if (rect && rect.width + rect.height > 0) {
				return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
			}
			} catch (_) {
				// noop: 取得失敗時はフォールバックする
			}

		// フォールバック: 行要素の中心
		const lineEl = this.context.getLineElementForNode(node);
		if (!lineEl) return null;
		const rect = lineEl.getBoundingClientRect();
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	}

	private restoreSelectionFromSnapshot(
		doc: Document,
		selection: Selection,
		snapshot: { anchor: EndpointSnapshot; focus: EndpointSnapshot }
	): void {
		const anchor =
			snapshot.anchor.point &&
			getCaretPositionFromPoint(
				doc,
				snapshot.anchor.point.x,
				snapshot.anchor.point.y
			);
		const focus =
			snapshot.focus.point &&
			getCaretPositionFromPoint(
				doc,
				snapshot.focus.point.x,
				snapshot.focus.point.y
			);
		if (!anchor || !focus) return;

		const selectionAny = selection as any;
		if (typeof selectionAny.setBaseAndExtent === "function") {
			selectionAny.setBaseAndExtent(
				anchor.node,
				anchor.offset,
				focus.node,
				focus.offset
			);
			return;
		}
		try {
			const range = doc.createRange();
			range.setStart(anchor.node, anchor.offset);
			range.setEnd(focus.node, focus.offset);
			selection.removeAllRanges();
			selection.addRange(range);
			} catch (_) {
				// noop: RangeによるSelection復元失敗は無視
			}
		}
	}
