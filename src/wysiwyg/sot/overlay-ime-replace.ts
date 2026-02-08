export type OverlayImeReplaceContext = {
	isActive: () => boolean;
	getSotSelection: () => { anchor: number; head: number };
	getDomSelectionOffsets: () => { anchor: number; head: number } | null;
};

export class OverlayImeReplaceController {
	private context: OverlayImeReplaceContext;
	private replaceRange: { from: number; to: number } | null = null;

	constructor(context: OverlayImeReplaceContext) {
		this.context = context;
	}

	prepareReplaceRange(): boolean {
		if (!this.context.isActive()) return false;
		if (this.replaceRange) return true;
		let range: { from: number; to: number } | null = null;
		const domOffsets = this.context.getDomSelectionOffsets();
		if (domOffsets && domOffsets.anchor !== domOffsets.head) {
			range = {
				from: Math.min(domOffsets.anchor, domOffsets.head),
				to: Math.max(domOffsets.anchor, domOffsets.head),
			};
		} else {
			const selection = this.context.getSotSelection();
			if (selection.anchor !== selection.head) {
				range = {
					from: Math.min(selection.anchor, selection.head),
					to: Math.max(selection.anchor, selection.head),
				};
			}
		}
		if (!range || range.from === range.to) return false;
		this.replaceRange = range;
		return true;
	}

	onCompositionStart(): void {
		this.prepareReplaceRange();
	}

	onCompositionEnd(): void {
		// 置換範囲は確定入力の replaceSelection で消費する
	}

	consumeReplaceRange(): { from: number; to: number } | null {
		if (!this.replaceRange) return null;
		const range = this.replaceRange;
		this.replaceRange = null;
		return range;
	}

	cancel(): void {
		this.replaceRange = null;
	}
}
