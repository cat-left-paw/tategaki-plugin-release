// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/commitTargetRestriction.ts @ 254120c9 (PIS-INPUT-BLOCK-WARN1, 2026-11-05)
// Local changes: the new mode's own refusals by place (the display's, `canDisplayEditTarget`, and the target's, `resolveEditTarget`'s `blocked`) in place of Nyoze's TCY / sticky-note / B15 ones; one function
//   for the commit and the pre-warning, with the commit's own text refusals (a line break, nothing) ranking above the target's as `planCommit` ranked them.
import { resolveEditTarget, type EditContext } from "../input/edit-target";
import { refusedWhereverItGoes } from "../input/source-commit";
import { canDisplayEditTarget } from "./display-selection";

/**
 * Why a commit is refused by where it would go, whatever the text is (BLOCK-WARN1, D-W-1):
 * - `structure`: the display cannot show that target (a range that holds a part, an atom, folded lines, the frontmatter, a horizontal rule or fence line, a notation that shows nothing; or an atom block chosen
 *   whole with no shown line after it): `canDisplayEditTarget(ctx, "commit")`;
 * - `partial-ruby` / `partial-atom`: a range put from outside that ends inside a Ruby's base or inside the source of an atom: `resolveEditTarget`'s `blocked`;
 * - `structure` again: a caret or range end inside one grapheme (`resolveEditTarget`'s `blocked`).
 * The refusals that depend on the text typed (`inside-inline`, a text the display would not keep, `newline-in-payload`) and the environment's (`reading-view`, `out-of-scope`, `stopped`, `stale`) are not here.
 */
export type CommitTargetRestriction = "partial-ruby" | "partial-atom" | "structure";

/**
 * The one function the commit and the pre-warning both call (`PmModeSourceOwner.commitText` and `commitTargetRestriction`): the warning that comes before a typed character and the refusal that would
 * come after it cannot differ. Pure, and local: it reads the target only.
 * `text`: given by the commit, which has it. A text that is refused wherever it goes (a line break, or nothing) is `planCommit`'s refusal and ranks above the target's own (as it did when the commit looked
 * at the display first and the target in `planCommit`): the display's refusal still ranks first.
 */
export function resolveCommitTargetRestriction(ctx: EditContext, text?: string): CommitTargetRestriction | null {
	if (!canDisplayEditTarget(ctx, "commit")) return "structure";
	if (text !== undefined && refusedWhereverItGoes(text)) return null;
	const target = resolveEditTarget(ctx);
	return target.kind === "blocked" && (target.reason === "partial-ruby" || target.reason === "partial-atom" || target.reason === "structure") ? target.reason : null;
}
