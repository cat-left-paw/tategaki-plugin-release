import type { LineRange } from "./line-ranges";
import type { SoTEditor } from "./sot-editor";

export type SoTCeSelectionContext = {
	isCeImeMode: () => boolean;
	isCeImeComposing: () => boolean;
	isCeImeSelectionSyncing: () => boolean;
	setCeImeSelectionSyncing: (value: boolean) => void;
	isLeafActive: () => boolean;
	getDerivedContentEl: () => HTMLElement | null;
	getSotEditor: () => SoTEditor | null;
	getLineRanges: () => LineRange[];
	findLineIndex: (offset: number) => number | null;
	getLineElement: (lineIndex: number) => HTMLElement | null;
	ensureLineRendered: (lineEl: HTMLElement) => void;
	resolveOffsetFromCaretPosition: (
		lineEl: HTMLElement,
		target: { node: Node; offset: number },
		lineLength: number
	) => number | null;
	ensureCeInputPlaceholderNode: (lineEl: HTMLElement) => Text | null;
	findTextNodeAtOffset: (
		lineEl: HTMLElement,
		localOffset: number
	) => { node: Text; offset: number } | null;
	setSelectionNormalized: (anchor: number, head: number) => void;
	recordCeMappingFailure: (reason: string, immediate?: boolean) => void;
	isSelectionInsideDerivedContent: (selection: Selection | null) => boolean;
	getLineElementForNode: (node: Node | null) => HTMLElement | null;
	isUnsafeCeSelectionNode: (node: Node | null) => boolean;
	scheduleCeSafetyCheck: () => void;
};

export class SoTCeSelectionSync {
	private context: SoTCeSelectionContext;

	constructor(context: SoTCeSelectionContext) {
		this.context = context;
	}

	syncSelectionFromCe(): { anchor: number; head: number } | null {
		if (!this.context.isCeImeMode()) return null;
		const sotEditor = this.context.getSotEditor();
		if (!sotEditor) return null;
		const selection =
			this.context.getDerivedContentEl()?.ownerDocument.getSelection();
		if (!selection) return null;
		if (!this.context.isSelectionInsideDerivedContent(selection)) {
			return null;
		}
		const anchorLine = this.context.getLineElementForNode(
			selection.anchorNode
		);
		const headLine = this.context.getLineElementForNode(
			selection.focusNode
		);
		if (!anchorLine || !headLine) return null;
		const offsets = this.getSelectionOffsetsFromCe(selection);
		if (!offsets) {
			this.context.recordCeMappingFailure("selection");
			return null;
		}
		const current = sotEditor.getSelection();
		if (
			current.anchor !== offsets.anchor ||
			current.head !== offsets.head
		) {
			this.context.setCeImeSelectionSyncing(true);
			this.context.setSelectionNormalized(offsets.anchor, offsets.head);
			this.context.setCeImeSelectionSyncing(false);
		}
		return offsets;
	}

	syncSelectionToCe(): void {
		if (!this.context.isCeImeMode()) return;
		const sotEditor = this.context.getSotEditor();
		const contentEl = this.context.getDerivedContentEl();
		if (!sotEditor || !contentEl) return;
		if (!this.context.isLeafActive()) return;
		if (this.context.isCeImeComposing()) return;
		const selection = contentEl.ownerDocument.getSelection();
		if (!selection) return;
		const { anchor, head } = sotEditor.getSelection();
		const anchorPos = this.getDomPositionForOffset(anchor);
		const headPos = this.getDomPositionForOffset(head);
		if (!anchorPos || !headPos) {
			this.context.recordCeMappingFailure("selection");
			return;
		}
		this.context.setCeImeSelectionSyncing(true);
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
		this.context.setCeImeSelectionSyncing(false);
	}

	handleCeSelectionChange(): void {
		if (
			!this.context.isCeImeMode() ||
			this.context.isCeImeSelectionSyncing() ||
			this.context.isCeImeComposing()
		) {
			return;
		}
		this.syncSelectionFromCe();
		const selection =
			this.context.getDerivedContentEl()?.ownerDocument.getSelection();
		if (
			selection &&
			this.context.isSelectionInsideDerivedContent(selection) &&
			(this.context.isUnsafeCeSelectionNode(selection.anchorNode) ||
				this.context.isUnsafeCeSelectionNode(selection.focusNode))
		) {
			this.syncSelectionToCe();
		}
		this.context.scheduleCeSafetyCheck();
	}

	private getSelectionOffsetsFromCe(
		selection: Selection
	): { anchor: number; head: number } | null {
		const anchor = this.getOffsetFromSelectionNode(
			selection.anchorNode,
			selection.anchorOffset
		);
		const head = this.getOffsetFromSelectionNode(
			selection.focusNode,
			selection.focusOffset
		);
		if (anchor === null || head === null) return null;
		return { anchor, head };
	}

	private getOffsetFromSelectionNode(
		node: Node | null,
		offset: number
	): number | null {
		const sotEditor = this.context.getSotEditor();
		if (!node || !sotEditor) return null;
		const element =
			node instanceof Element ? node : node.parentElement ?? null;
		if (!element) return null;
		const lineEl = element.closest(".tategaki-sot-line") as
			| HTMLElement
			| null;
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
		const docLength = sotEditor.getDoc().length;
		return Math.max(0, Math.min(from + local, docLength));
	}

	private getDomPositionForOffset(
		offset: number
	): { node: Node; offset: number } | null {
		const sotEditor = this.context.getSotEditor();
		if (!sotEditor) return null;
		const docLength = sotEditor.getDoc().length;
		const safeOffset = Math.max(0, Math.min(offset, docLength));
		const lineIndex = this.context.findLineIndex(safeOffset);
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
		if (this.context.isCeImeMode() && lineLength === 0) {
			const placeholderTextNode =
				this.context.ensureCeInputPlaceholderNode(lineEl);
			if (placeholderTextNode) {
				return { node: placeholderTextNode, offset: 0 };
			}
			const eol = lineEl.querySelector(
				".tategaki-sot-eol"
			) as HTMLElement | null;
			const eolTextNode =
				eol?.firstChild && eol.firstChild.nodeType === Node.TEXT_NODE
					? (eol.firstChild as Text)
					: null;
			if (eolTextNode) {
				return { node: eolTextNode, offset: 0 };
			}
			const childCount = lineEl.childNodes.length;
			const caretChildIndex = Math.max(0, childCount - 1);
			return { node: lineEl, offset: caretChildIndex };
		}
		const target = this.context.findTextNodeAtOffset(
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
}
