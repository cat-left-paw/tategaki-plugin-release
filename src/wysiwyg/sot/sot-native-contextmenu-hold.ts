import type { SoTSelection } from "./sot-editor";

type PointerDownContext = {
	button: number;
	isNativeSelectionEnabled: boolean;
	isCeImeMode: boolean;
	isSourceMode: boolean;
	isOnScrollbar: boolean;
	domSelection: Selection | null;
	isSelectionInsideDerivedContent: (selection: Selection | null) => boolean;
	sotSelection: SoTSelection | null;
};

export class SoTNativeContextMenuHold {
	private active = false;

	handlePointerDown(context: PointerDownContext): boolean {
		if (context.button === 0 || context.button === 1) {
			this.clear();
		}
		if (context.button !== 2) return false;
		if (!context.isNativeSelectionEnabled) return false;
		if (context.isCeImeMode || context.isSourceMode) return false;
		if (context.isOnScrollbar) return false;

		const hasDomSelection =
			!!context.domSelection &&
			context.isSelectionInsideDerivedContent(context.domSelection) &&
			!context.domSelection.isCollapsed;
		const hasSotSelection =
			!!context.sotSelection &&
			context.sotSelection.anchor !== context.sotSelection.head;
		if (!hasDomSelection && !hasSotSelection) return false;

		this.active = true;
		return true;
	}

	shouldSkipNativeCollapse(sotSelection: SoTSelection | null): boolean {
		if (!this.active) return false;
		if (!sotSelection || sotSelection.anchor === sotSelection.head) {
			this.clear();
			return false;
		}
		return true;
	}

	shouldFocusRootOnContextMenu(): boolean {
		return !this.active;
	}

	isActiveWithSelection(sotSelection: SoTSelection | null): boolean {
		return (
			this.active &&
			!!sotSelection &&
			sotSelection.anchor !== sotSelection.head
		);
	}

	isActive(): boolean {
		return this.active;
	}

	clear(): boolean {
		if (!this.active) return false;
		this.active = false;
		return true;
	}
}

