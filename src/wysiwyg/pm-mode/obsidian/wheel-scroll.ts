// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:10088-10129, handleWheel and throttledWheelScroll) @ d65c4c7 (2026-10-17).
// Local changes: The writing mode comes from the view's settings instead of getComputedStyle. The 16 ms
// throttle compares event.timeStamp with the last applied wheel instead of clearing a timer (the new
// mode's runtime is timer-free); a timeStamp before the last applied one (another window's time origin)
// is not throttled. A pure decision plus a thin listener.

/** The wheel event fields the decision reads. */
export interface PmModeWheelInput {
	vertical: boolean;
	deltaX: number;
	deltaY: number;
	shiftKey: boolean;
	timeStamp: number;
}
/** Whether to cancel the native scroll, and how far to move `scrollLeft` (null: do not move it). */
export interface PmModeWheelDecision {
	preventDefault: boolean;
	scrollLeftBy: number | null;
}
/** V's throttle: after a wheel moves the view, the wheels of the next 16 ms are cancelled and dropped. */
export const PM_MODE_WHEEL_THROTTLE_MS = 16;
/** V's factor for a vertical wheel in vertical writing. */
export const PM_MODE_VERTICAL_WHEEL_FACTOR = 0.8;

const NATIVE: PmModeWheelDecision = { preventDefault: false, scrollLeftBy: null };

/**
 * Vertical writing: a wheel without Shift scrolls along the lines (`scrollLeft += -deltaY * 0.8 +
 * deltaX`); with Shift the browser scrolls. Horizontal writing: a wheel without Shift is the browser's;
 * with Shift it scrolls sideways (`scrollLeft -= deltaY`). `lastAppliedAt` is the timeStamp of the
 * last wheel that moved the view.
 */
export function decidePmModeWheel(input: PmModeWheelInput, lastAppliedAt: number | null): PmModeWheelDecision {
	const sideways = input.vertical ? !input.shiftKey : input.shiftKey;
	if (!sideways) return NATIVE;
	const elapsed = lastAppliedAt === null ? Infinity : input.timeStamp - lastAppliedAt;
	if (elapsed >= 0 && elapsed < PM_MODE_WHEEL_THROTTLE_MS) return { preventDefault: true, scrollLeftBy: null };
	const scrollLeftBy = input.vertical ? -input.deltaY * PM_MODE_VERTICAL_WHEEL_FACTOR + input.deltaX : -input.deltaY;
	return { preventDefault: true, scrollLeftBy };
}

/** Listens to wheels on `scroller` (non-passive, so it can cancel them). Returns the remover. */
export function attachPmModeWheelScroll(scroller: HTMLElement, isVertical: () => boolean): () => void {
	let lastAppliedAt: number | null = null;
	const listener = (event: WheelEvent) => {
		const decision = decidePmModeWheel({ vertical: isVertical(), deltaX: event.deltaX, deltaY: event.deltaY, shiftKey: event.shiftKey, timeStamp: event.timeStamp }, lastAppliedAt);
		if (decision.preventDefault) event.preventDefault();
		if (decision.scrollLeftBy === null) return;
		scroller.scrollLeft += decision.scrollLeftBy;
		lastAppliedAt = event.timeStamp;
	};
	scroller.addEventListener("wheel", listener, { passive: false });
	return () => scroller.removeEventListener("wheel", listener);
}
