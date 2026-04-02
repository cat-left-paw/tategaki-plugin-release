type SoTPointerWindowHandlers = {
	onPointerMove: (event: PointerEvent) => void;
	onPointerUp: (event: PointerEvent) => void;
	onPointerCancel: (event: PointerEvent) => void;
};

export class SoTPointerWindowBinding {
	private boundWindow: Window | null = null;
	private boundPointerMoveHandler: ((event: Event) => void) | null = null;
	private boundPointerUpHandler: ((event: Event) => void) | null = null;
	private boundPointerCancelHandler: ((event: Event) => void) | null = null;

	bind(
		viewWindow: Window | null,
		handlers: SoTPointerWindowHandlers,
	): boolean {
		if (viewWindow === this.boundWindow) {
			return false;
		}
		this.dispose();
		if (!viewWindow) {
			return false;
		}

		const pointerMoveHandler = (event: Event) =>
			handlers.onPointerMove(event as PointerEvent);
		const pointerUpHandler = (event: Event) =>
			handlers.onPointerUp(event as PointerEvent);
		const pointerCancelHandler = (event: Event) =>
			handlers.onPointerCancel(event as PointerEvent);

		viewWindow.addEventListener("pointermove", pointerMoveHandler);
		viewWindow.addEventListener("pointerup", pointerUpHandler);
		viewWindow.addEventListener("pointercancel", pointerCancelHandler);

		this.boundWindow = viewWindow;
		this.boundPointerMoveHandler = pointerMoveHandler;
		this.boundPointerUpHandler = pointerUpHandler;
		this.boundPointerCancelHandler = pointerCancelHandler;
		return true;
	}

	getBoundWindow(): Window | null {
		return this.boundWindow;
	}

	dispose(): void {
		if (this.boundWindow && this.boundPointerMoveHandler) {
			this.boundWindow.removeEventListener(
				"pointermove",
				this.boundPointerMoveHandler,
			);
		}
		if (this.boundWindow && this.boundPointerUpHandler) {
			this.boundWindow.removeEventListener(
				"pointerup",
				this.boundPointerUpHandler,
			);
		}
		if (this.boundWindow && this.boundPointerCancelHandler) {
			this.boundWindow.removeEventListener(
				"pointercancel",
				this.boundPointerCancelHandler,
			);
		}
		this.boundWindow = null;
		this.boundPointerMoveHandler = null;
		this.boundPointerUpHandler = null;
		this.boundPointerCancelHandler = null;
	}
}
