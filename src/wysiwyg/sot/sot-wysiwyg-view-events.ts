import type { WorkspaceLeaf } from "obsidian";

export type SoTViewEventHost = {
	app: { workspace: { on: (...args: any[]) => any }; };
	containerEl: HTMLElement;
	leaf: WorkspaceLeaf;
	registerDomEvent: (...args: any[]) => void;
	registerEvent: (...args: any[]) => void;
	register: (callback: () => void) => void;
	registerEscapeGuard: () => void;
	registerEscapeKeymap: () => void;
	getValidPairedMarkdownLeaf: () => WorkspaceLeaf | null;
	resumeFromInactiveLeaf: () => void;
	suspendForInactiveLeaf: () => void;
	setCeImeMode: (enabled: boolean, options?: { suspend?: boolean }) => void;
	focusInputSurface: (preventScroll?: boolean) => void;
	registerClipboardHandlers: () => void;
	setupWheelScroll: () => void;
	updateMobileTouchAction: () => void;
	handleCeBeforeInput: (event: InputEvent) => void;
	handleCeCompositionStart: (event: CompositionEvent) => void;
	handleCeCompositionUpdate: (event: CompositionEvent) => void;
	handleCeCompositionEnd: (event: CompositionEvent) => void;
	handleCeKeydown: (event: KeyboardEvent) => void;
	handleCeSelectionChange: () => void;
	handleRootScroll: () => void;
	handleTouchScrollPointerDown: (event: PointerEvent) => void;
	handleTouchScrollPointerMove: (event: PointerEvent) => void;
	handleTouchScrollPointerUp: (event: PointerEvent) => void;
	commandContextMenu: { show: (event: MouseEvent) => void } | null;
	commandAdapter: unknown;
	pointerHandler: {
		handlePointerDown: (event: PointerEvent) => void;
		handlePointerMove: (event: PointerEvent) => void;
		handlePointerUp: (event: PointerEvent) => void;
	} | null;
	derivedRootEl: HTMLElement | null;
	derivedContentEl: HTMLElement | null;
	overlayTextarea: { isFocused: () => boolean } | null;
	plainEditOverlayEl: HTMLTextAreaElement | null;
	sourceModeEnabled: boolean;
	touchScrollActive: boolean;
	scrollDragActive: boolean;
	ceImeSuspended: boolean;
	ceImeMode: boolean;
};

export function registerSoTViewHeaderEvents(
	host: SoTViewEventHost,
	container: HTMLElement
): void {
	const phoneQuery =
		"(hover: none) and (pointer: coarse) and (max-width: 700px)";
	const updateHeaderInset = (): void => {
		const headerEl = host.containerEl.querySelector(
			".view-header",
		) as HTMLElement | null;
		const height = headerEl
			? Math.ceil(headerEl.getBoundingClientRect().height)
			: 0;
		container.style.setProperty(
			"--tategaki-view-header-height",
			`${height}px`,
		);
		const isPhone = window.matchMedia(phoneQuery).matches;
		container.style.paddingTop = isPhone
			? "calc(var(--tategaki-safe-area-top, 0px) + var(--tategaki-view-header-height, 0px))"
			: "0px";
		let isEditing = false;
		const activeEl = container.ownerDocument
			.activeElement as HTMLElement | null;
		if (activeEl && container.contains(activeEl)) {
			isEditing =
				activeEl.isContentEditable ||
				activeEl.tagName === "TEXTAREA" ||
				activeEl.tagName === "INPUT";
		}
		container.style.paddingBottom =
			isPhone && !isEditing
				? "var(--tategaki-reading-bottom-offset, 0px)"
				: "0px";
	};
	updateHeaderInset();
	window.setTimeout(updateHeaderInset, 0);
	host.registerDomEvent(window, "resize", updateHeaderInset);
	host.registerDomEvent(
		container.ownerDocument,
		"focusin",
		updateHeaderInset,
	);
	host.registerDomEvent(
		container.ownerDocument,
		"focusout",
		updateHeaderInset,
	);
	host.registerEscapeGuard();
	host.registerEscapeKeymap();
	const headerEl = host.containerEl.querySelector(
		".view-header",
	) as HTMLElement | null;
	if (headerEl && "ResizeObserver" in window) {
		const observer = new ResizeObserver(() => {
			updateHeaderInset();
		});
		observer.observe(headerEl);
		host.register(() => observer.disconnect());
	}
}

export function registerSoTViewInputEvents(host: SoTViewEventHost): void {
	if (host.derivedContentEl) {
		host.registerDomEvent(
			host.derivedContentEl,
			"beforeinput",
			(event: Event) =>
				host.handleCeBeforeInput(event as InputEvent),
		);
		host.registerDomEvent(
			host.derivedContentEl,
			"compositionstart",
			(event: Event) =>
				host.handleCeCompositionStart(event as CompositionEvent),
		);
		host.registerDomEvent(
			host.derivedContentEl,
			"compositionupdate",
			(event: Event) =>
				host.handleCeCompositionUpdate(event as CompositionEvent),
		);
		host.registerDomEvent(
			host.derivedContentEl,
			"compositionend",
			(event: Event) =>
				host.handleCeCompositionEnd(event as CompositionEvent),
		);
		host.registerDomEvent(
			host.derivedContentEl,
			"keydown",
			(event: Event) => host.handleCeKeydown(event as KeyboardEvent),
		);
	}
	if (host.derivedContentEl?.ownerDocument) {
		host.registerDomEvent(
			host.derivedContentEl.ownerDocument,
			"selectionchange",
			() => host.handleCeSelectionChange(),
		);
	}
}

export function registerSoTViewRootEvents(host: SoTViewEventHost): void {
	const derivedRootEl = host.derivedRootEl as HTMLElement;
	host.registerDomEvent(derivedRootEl, "pointerdown", (event: Event) => {
		if (
			host.sourceModeEnabled &&
			host.plainEditOverlayEl &&
			event.target instanceof Node &&
			host.plainEditOverlayEl.contains(event.target)
		) {
			return;
		}
		host.handleTouchScrollPointerDown(event as PointerEvent);
		host.pointerHandler?.handlePointerDown(event as PointerEvent);
	});
	host.registerDomEvent(derivedRootEl, "contextmenu", (event: Event) => {
		if (!host.commandContextMenu || !host.derivedRootEl) return;
		host.derivedRootEl.focus({ preventScroll: true });
		host.commandContextMenu.show(event as MouseEvent);
	});
	host.registerClipboardHandlers();
	host.registerDomEvent(window, "pointermove", (event: Event) => {
		host.handleTouchScrollPointerMove(event as PointerEvent);
		if (
			host.touchScrollActive &&
			(event as PointerEvent).pointerType === "touch"
		) {
			return;
		}
		host.pointerHandler?.handlePointerMove(event as PointerEvent);
	});
	host.registerDomEvent(window, "pointerup", (event: Event) => {
		const wasTouchScroll =
			host.touchScrollActive &&
			(event as PointerEvent).pointerType === "touch";
		host.handleTouchScrollPointerUp(event as PointerEvent);
		if (wasTouchScroll) {
			return;
		}
		host.pointerHandler?.handlePointerUp(event as PointerEvent);
	});
	host.registerDomEvent(window, "pointercancel", (event: Event) => {
		const wasTouchScroll =
			host.touchScrollActive &&
			(event as PointerEvent).pointerType === "touch";
		host.handleTouchScrollPointerUp(event as PointerEvent);
		if (wasTouchScroll) {
			return;
		}
		host.pointerHandler?.handlePointerUp(event as PointerEvent);
	});
	host.registerDomEvent(derivedRootEl, "keydown", (event: Event) => {
		if ((event as KeyboardEvent).key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			host.focusInputSurface(true);
			return;
		}
		// クリックせずにタイピングを始めた場合のフォーカス救済
		if (host.ceImeMode) {
			host.focusInputSurface(true);
			return;
		}
		if (!host.overlayTextarea?.isFocused()) {
			host.focusInputSurface(true);
		}
	});
	host.registerDomEvent(derivedRootEl, "scroll", () => {
		host.handleRootScroll();
	});
	host.registerDomEvent(derivedRootEl, "pointerdown", (event: Event) => {
		const pointerEvent = event as PointerEvent;
		if (pointerEvent.pointerType !== "mouse") return;
		if (pointerEvent.button !== 0) return;
		if (pointerEvent.target !== derivedRootEl) return;
		host.scrollDragActive = true;
	});
	host.registerDomEvent(window, "pointerup", (event: Event) => {
		const pointerEvent = event as PointerEvent;
		if (pointerEvent.pointerType !== "mouse") return;
		host.scrollDragActive = false;
	});
	host.setupWheelScroll();
	host.registerEvent(
		host.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf) => {
			if (leaf === host.leaf) {
				host.resumeFromInactiveLeaf();
				if (host.ceImeSuspended) {
					host.ceImeSuspended = false;
					host.setCeImeMode(true);
				}
				window.setTimeout(() => {
					host.focusInputSurface(true);
				}, 0);
				return;
			}
			const pairedLeaf = host.getValidPairedMarkdownLeaf();
			if (leaf && pairedLeaf && leaf === pairedLeaf) {
				host.resumeFromInactiveLeaf();
				if (host.ceImeMode) {
					host.setCeImeMode(false, { suspend: true });
				}
				return;
			}
			host.suspendForInactiveLeaf();
			if (host.ceImeMode) {
				host.setCeImeMode(false, { suspend: true });
			}
		}),
	);
}
