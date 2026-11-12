// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/focusSafety.ts (`judgeHostFocus`) and
//   focusIntegration.ts (`onHostFocus`) @ 020b5501 (2026-10-22)
// Local changes: the rule is the new mode's (M2 design §6.1). There is no Host to give the focus to: any focus that
//   reaches the inside of the view (the container, the scrolling element, the PM root, a part) other than the
//   surface goes back to the surface in the same event, unless a pointer gesture lends it or a composition is
//   going on. The focus of anything outside the view, and of the body, is not followed (J9). There is no
//   permission list (`HostFocusPermission`): nothing in the view needs the focus.
import type { InputSurface, SurfaceRecord } from "./input-surface";
import { asElement, eventOrigin } from "./composed-tree";

export type ViewFocusDecision = "allow" | "record-composition" | "restore";

/** Whether a focus inside the view (not on the surface) stays. Pure. */
export function judgeViewFocus(input: { lent: boolean; enabled: boolean; surfaceComposing: boolean }): ViewFocusDecision {
	if (!input.enabled || input.lent) return "allow";
	if (input.surfaceComposing) return "record-composition";
	return "restore";
}

/**
 * The safety net of the focus. `focusin` listeners (capture) on the view's element and on its shadow root. A focus
 * that moves between two elements of the same shadow tree (the surface to the PM root or the scrolling element) is not
 * dispatched outside that tree (the event's `relatedTarget` is in the same tree), so the shadow root's own listener sees
 * it; the view's element sees the focus of what is outside the shadow tree (a part's light DOM, the element itself).
 * `composedPath()[0]` is the element that took the focus. No timer: the restore happens in the same event, synchronously.
 */
export function createFocusSafety(options: {
	container: HTMLElement;
	/** The view's shadow root (the surface, the scrolling element and the PM root are in it). */
	treeRoot: ShadowRoot;
	surface: InputSurface;
	isLent(): boolean;
	record?: SurfaceRecord;
}) {
	const { container, treeRoot, surface } = options;
	const record: SurfaceRecord = options.record ?? (() => {});
	let restoring = false;
	// An event reaches both listeners when it comes from the shadow tree and leaves it: it is judged once.
	const judged = new WeakSet<Event>();
	const onFocusIn = (event: FocusEvent): void => {
		if (judged.has(event)) return;
		judged.add(event);
		const origin = asElement(eventOrigin(event));
		if (!origin || origin === surface.element) return;
		const decision = judgeViewFocus({ lent: options.isLent(), enabled: true, surfaceComposing: surface.isComposing() });
		if (decision === "allow") return;
		const target = origin.tagName.toLowerCase();
		if (decision === "record-composition") { record("view-focus-during-composition", { target }); return; }
		// The restore itself moves the focus to the surface; that `focusin` has the surface as its origin and returns above.
		if (restoring) { record("view-focus-loop", { target }); return; }
		restoring = true;
		try {
			record("view-focus-restored", { target });
			surface.focus();
		} finally { restoring = false; }
	};
	container.addEventListener("focusin", onFocusIn, true);
	treeRoot.addEventListener("focusin", onFocusIn, true);
	return {
		destroy(): void {
			container.removeEventListener("focusin", onFocusIn, true);
			treeRoot.removeEventListener("focusin", onFocusIn, true);
		},
	};
}
