// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: this repo's V, src/wysiwyg/sot-wysiwyg-view.ts: the follow (V:11913-11940 `maybeApplyTypewriterScroll`: the plan from the viewport's rect, the caret's rect, the writing mode,
//   `sotTypewriterOffsetRatio ?? 0` and `sotTypewriterFollowBandRatio ?? 0.16`; then `scrollLeft/scrollTop += plan.scrollDelta`), the suppression marks (V:867-910
//   `armTypewriterNavigationSuppression`, `buildTypewriterSuppressionState`, `consumeTypewriterSuppressionDecision`) and the tail spacer
//   (V:1585-1598 `updateScrollPastEnd`, one viewport at the end of the content). The decisions are V's pure functions, imported: `resolveSoTTypewriterScrollPlan`
//   (sot-typewriter-scroll.ts), `resolveSoTTypewriterSuppressionDecision` (sot-typewriter-suppression.ts), `computeSoTScrollPastEndExtent` (sot-scroll-past-end.ts) and
//   `isSoTTypewriterSuppressedNavigationKey`'s keys. Nyoze's `typewriterMode.ts` (@ 020b5501) is not copied (H7 (b)).
// Local changes: M3c (D-M3-18, H7 (b)). The suppression marks are V's one-shot marks, not times: a mark is valid for one display frame (it is set by a key or a fold and cleared when
//   that frame's display job ends), so a mark set by a key that moved nothing cannot suppress a later follow, and no timer (Nyoze's 140 / 130 / 100 ms windows) is used. V's jump-or-collapse mark (a fold, `armTypewriterJumpOrCollapseSuppression`) has no counterpart: a fold asks for no follow here (only a commit, a deletion, an Enter, a history step, a navigation or a
//   composition's update do), so there is nothing for it to suppress. V's pointer and
//   scroll marks (`isPointerSelecting`, `isScrolling`, the pending scroll settle, fast scroll) have no counterpart that is not a time: a pointer-put selection and a scroll ask for no follow
//   here, because a follow is asked only by what changes the caret in the new mode's own way (a commit, a deletion, an Enter, a history step, a navigation, a composition's update, and
//   turning the setting on); the lending's `isLent` stands for `isPointerSelecting`. The follow runs inside the reveal's one step (`caret-reveal.ts`, D-M3-8: not twice) and, for a
//   composition (which the reveal leaves alone), in the display job. The caret it follows is the display's, or the input surface's own while a composition or held text is there
//   (V's pending caret). The tail spacer is a block after the last chunk, a widget at the end of the display document (`pm/decorations.ts` `tailSpacerDecorations`): the root's own box
//   is as wide as the view and the chunks overflow it, so the root's padding (V's `padding-block-end` on its content element) adds no scrollable length here. It exists only while Typewriter is on.
import { resolveSoTTypewriterScrollPlan } from "../../sot/sot-typewriter-scroll";
import { resolveSoTTypewriterSuppressionDecision, type SoTTypewriterSuppressionState } from "../../sot/sot-typewriter-suppression";
import { computeSoTScrollPastEndExtent } from "../../sot/sot-scroll-past-end";
import type { PmModeDisplaySettings } from "./display-settings";
import { resolveSupportedEditorWritingMode } from "./navigation/writing-mode";
import type { PlacementRect } from "./surface-placement";

export type TypewriterMark = "navigation";
export interface TypewriterPlan { readonly axis: "x" | "y"; /** Viewport px (V's `scrollDelta`): add `delta / scale` to the scrolling element's offset. */ readonly delta: number }

/** The suppression's input, as V builds it (V:880-896), with the states that are times in V (scrolling, settling) false. */
export function suppressionState(marks: { navigation: boolean }, lent: boolean): SoTTypewriterSuppressionState {
	return {
		suppressAfterNavigation: marks.navigation, suppressAfterJumpOrCollapse: false, isPointerSelecting: lent,
		autoScrollSelecting: false, isScrolling: false, hasPendingScrollSettle: false, hasPendingNavigationCommit: false, isFastScrollActive: false, isOutlineJumpInProgress: false,
	};
}

/** V:11913-11940: the plan for a caret rect, or null (a mode the plan does not know, a rect that is not finite). */
export function planTypewriterFollow(input: { viewport: DOMRect; caret: PlacementRect; writingMode: string; settings: Pick<PmModeDisplaySettings, "typewriterOffsetRatio" | "typewriterFollowBandRatio"> }): TypewriterPlan | null {
	const mode = resolveSupportedEditorWritingMode(input.writingMode);
	if (!mode) return null;
	const plan = resolveSoTTypewriterScrollPlan({
		viewportRect: { left: input.viewport.left, top: input.viewport.top, width: input.viewport.width, height: input.viewport.height },
		caretRect: { left: input.caret.left, top: input.caret.top, width: input.caret.right - input.caret.left, height: input.caret.bottom - input.caret.top },
		writingMode: mode, offsetRatio: input.settings.typewriterOffsetRatio, followBandRatio: input.settings.typewriterFollowBandRatio,
	});
	if (!plan || plan.scrollDelta === 0) return null;
	return { axis: plan.scrollAxis, delta: plan.scrollDelta };
}

/** The tail spacer's extent in CSS px: one viewport's main-axis size (V: ratio 1), 0 while Typewriter is off. */
export function tailSpacerExtent(settings: Pick<PmModeDisplaySettings, "typewriter">, vertical: boolean, clientWidth: number, clientHeight: number): number {
	return settings.typewriter ? Math.round(computeSoTScrollPastEndExtent(vertical ? clientWidth : clientHeight)) : 0;
}

export function createTypewriter(options: {
	settings(): PmModeDisplaySettings;
	/** A pointer gesture is going on (V's `isPointerSelecting`). */
	isLent(): boolean;
	record?(kind: string, detail?: Record<string, unknown>): void;
}) {
	const marks = { navigation: false };
	let followRequested = false, decided = false;
	const counts = { suppressed: 0, followed: 0, requested: 0 };
	return {
		/** A key (Home, End, PageUp, PageDown, the line's or the document's edge): the next follow, if it comes in this frame, is skipped (V's one-shot mark). */
		mark(_kind: TypewriterMark): void { if (options.settings().typewriter) marks.navigation = true; },
		/** A composition's update, or the setting turned on: the display job follows the caret (not for a commit: the reveal's step does). */
		requestFollow(): void { followRequested = true; counts.requested++; },
		/**
		 * The decision for the follow of this frame: the marks are used up here (V's `consumeTypewriterSuppressionDecision`), whatever the answer.
		 * `plan` is the plan for the caret, or null when Typewriter is off, suppressed or the caret is in the band.
		 */
		follow(caretFor: () => TypewriterPlan | null): TypewriterPlan | null {
			const settings = options.settings();
			decided = true;
			if (!settings.typewriter) { marks.navigation = false; return null; }
			const decision = resolveSoTTypewriterSuppressionDecision(suppressionState(marks, options.isLent()));
			if (decision.consumeNavigationSuppression) marks.navigation = false;
			if (decision.suppress) { counts.suppressed++; options.record?.("typewriter-suppressed", {}); return null; }
			const plan = caretFor();
			if (plan) counts.followed++;
			return plan;
		},
		/** Whether the reveal's step already decided the follow in this frame (followed, suppressed or inside the band: the display job then does not decide again). */
		get decidedThisFrame(): boolean { return decided; },
		get followRequested(): boolean { return followRequested; },
		/** The display job's end: a mark is valid for one frame only. */
		endFrame(): void { marks.navigation = false; followRequested = false; decided = false; },
		counters: () => ({ ...counts, marks: { ...marks } }),
	};
}
export type Typewriter = ReturnType<typeof createTypewriter>;
