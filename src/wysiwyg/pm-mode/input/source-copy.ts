import { canonicalChanges } from "./source-change";
import { resolveEditTarget, type EditContext } from "./edit-target";
import { planDeletion } from "./source-deletion";

/**
 * What a copy takes (the clipboard stage, D-C-1; the author's decision C-Q1 of 2026-11-08): the source a cut of the same selection removes, so that a cut and a paste at the same place give
 * the note back (the format's marks and the Ruby's whole notation go with a text chosen whole). `none`: nothing is selected (C-Q2: nothing is copied).
 *   - the selection is all of the note: the body, without the frontmatter (D15, as the cut)
 *   - the cut's plan removes one run of the source (the plan may be of the shown units and the marks that go with them, which come out as one run): that run
 *   - otherwise (the plan is refused, or its changes are not one run: part of a Ruby's base, ...): CodeMirror's own selection of the source (copying writes nothing, so nothing guards it)
 * Pure: it reads the plan the cut would make, and writes nothing.
 */
export type CopyResult = { readonly kind: "text"; readonly text: string; readonly exact: boolean } | { readonly kind: "none" };

export function copySource(ctx: EditContext): CopyResult {
	const source = ctx.state.source, lo = Math.min(ctx.selection.anchor, ctx.selection.head), hi = Math.max(ctx.selection.anchor, ctx.selection.head);
	if (lo === hi) return { kind: "none" };
	const target = resolveEditTarget(ctx);
	if (target.kind === "all") return target.srcFrom >= source.length ? { kind: "none" } : { kind: "text", text: source.slice(target.srcFrom), exact: true };
	const plan = planDeletion(ctx, "Backspace");
	if (plan.kind === "edit") {
		const changes = canonicalChanges(plan.changes, source.length);
		if (changes.length === 1 && changes[0].insert === "" && changes[0].from < changes[0].to) return { kind: "text", text: source.slice(changes[0].from, changes[0].to), exact: true };
	}
	return { kind: "text", text: source.slice(lo, hi), exact: false };
}
