// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/homeEndNavigation.ts @ 020b5501 (2026-10-22)
// Local changes: focusless planning only, state per view; no DOM Selection, global mutation counter or PM dispatch.
export function createHomeEndState() {
	let last: { direction: "home" | "end"; start: number; phase: "visual" | "logical" } | null = null;
	return {
		reset(): void { last = null; },
		plan(input: { start: number; end: number; origin: number; forward: boolean; extend: boolean; empty: boolean; visual: number | null }) {
			const direction = input.forward ? "end" : "home", logical = input.forward ? input.end : input.start;
			const bareRange = !input.extend && !input.empty;
			const continuation = !bareRange && last?.direction === direction && last.start === input.start && last.phase === "visual";
			const clamped = input.visual === null ? null : Math.max(input.start, Math.min(input.end, input.visual));
			const useLogical = continuation || clamped === null || (!bareRange && clamped === input.origin);
			const phase = useLogical ? "logical" : "visual";
			last = { direction, start: input.start, phase };
			return { head: useLogical ? logical : clamped, phase };
		},
		peek: () => last,
	};
}
