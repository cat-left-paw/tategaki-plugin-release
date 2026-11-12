import { resolveEditTarget, shownAt, type EditContext } from "../input/edit-target";
import type { PmModeDisplay } from "../pm/view";
import type { PMNode } from "../pm/prosemirror";
import { HIDDEN_LINE_KINDS } from "../input/model-position";
import { shownSpan } from "../input/edit-plan";
import { lineNotations } from "../input/notation-inventory";

/**
 * M2 has no block/all-selection presenter. TextSelection.between moves a block boundary to text,
 * which can silently omit an atom at a range's edge. Until that presentation is designed, such
 * ranges cannot authorize replacement.
 *
 * J19 (M2-2b review 1, R2): the range display paints text of the display's own tree. What it cannot paint — a block or
 * inline atom, a part (callout, table, math, embed) projected from the host's light DOM, a horizontal rule or fence
 * line, the folded lines of a section, the frontmatter — is not shown as selected, yet a replacement removes it
 * (a folded section's text too, which is not shown at all). So a range that contains one is not written, for the
 * new mode's own selection and for one put from outside. D28 ("a range may contain an atom") stops until M3 draws them.
 * J26 (M2-2b review 2, S2): the same for a notation inside a line that shows nothing — an image without alt text
 * `![](u)`, a link without text `[](u)`, a wikilink or embed with an empty alias `[[t|]]`, a reference link without
 * text `[][r]` — lying wholly in the range: no character of it is in the display (the source map has no visible run
 * in it), so nothing is painted for it, and an edit removes its destination. A notation with a shown character
 * (an image with alt text, a link with text, `[[t]]`) is painted and stays allowed.
 * J27 (M2-3a): for a text range, inspect the source span of its shown units, not raw source endpoints.
 * An embed's literal ! alone is not a painted alias. An all-selection still spans the editable source (after preserved frontmatter).
 * J22: a block chosen whole (B15) is written after it; that is shown only when the line after it is a shown text
 * line (the display caret is put at its start). At the end of the document, or before another atom, it is not.
 */
export function canDisplayEditTarget(ctx: EditContext, operation: "commit" | "delete" | "enter" = "commit"): boolean {
	const target = resolveEditTarget(ctx), doc = ctx.state.doc;
	const shownLine = (node: PMNode | null | undefined): boolean => node?.type.name === "line" && !HIDDEN_LINE_KINDS.has(String(node.attrs.kind));
	const textEndpoint = (pos: number): boolean => {
		const $pos = doc.resolve(pos);
		if (!$pos.parent.inlineContent) return false;
		for (let depth = $pos.depth; depth > 0; depth--) {
			const node = $pos.node(depth);
			if (node.type.name === "line") return !HIDDEN_LINE_KINDS.has(String(node.attrs.kind));
		}
		return false;
	};
	/** Nothing between the two positions that the range display cannot paint. */
	const paintable = (from: number, to: number): boolean => {
		let ok = true;
		doc.nodesBetween(from, to, node => {
			const name = node.type.name;
			if (name === "widget" || name === "frontmatter" || name === "collapsedGap" || name === "inlineMath" || (name === "line" && !shownLine(node))) ok = false;
			return ok;
		});
		return ok;
	};
	/** A notation with no shown character, wholly inside the source range [from, to]. */
	const silentNotation = (from: number, to: number): boolean => {
		const map = ctx.state.sourceMap, source = ctx.state.source;
		for (let index = map.blockIndexAtSource(from); index <= map.blockIndexAtSource(Math.min(to, source.length)); index++) {
			const block = map.blockAtSource(map.srcFrom[index]);
			if (block.type !== "line") continue;
			// A reference link's label is taken as defined: with no text it shows nothing either way.
			for (const element of lineNotations(source.slice(block.from, block.to), block.from, () => true)) {
				if (element.from < from || element.to > to) continue;
				// An embed can leave only its literal ! marker in M1; that does not paint its empty alias (J26).
				const textStart = element.kind === "embed" ? element.from + 1 : element.from;
				if (!block.runs.some(run => run.to > run.from && run.from < element.to && run.to > textStart)) return true;
			}
		}
		return false;
	};
	// Empty hr/fence lines are valid text selections; their B15 after-line insertion is specified.
	if (target.kind === "caret") return doc.resolve(target.pos).parent.inlineContent;
	if (target.kind === "range") {
		// J27: source endpoints may include a neighboring silent notation. Only the shown span is edited.
		const span = shownSpan(ctx.state, target.from, target.to);
		return [target.from, target.to].every(textEndpoint) && paintable(target.from, target.to) && !silentNotation(span.from, span.to);
	}
	if (target.kind === "all") {
		const first = target.from ? 1 : 0;
		return [doc.maybeChild(first), doc.lastChild].every(node => node?.type.name === "line" && !HIDDEN_LINE_KINDS.has(String(node.attrs.kind))) && paintable(target.from, doc.content.size) && !silentNotation(target.srcFrom, ctx.state.source.length);
	}
	// B15 inserts after a block for commit/Enter. A deletion would remove the unpainted block itself (J19).
	if (target.kind === "block") return operation !== "delete" && shownLine(ctx.state.blocks[target.index + 1]?.node);
	return true;
}

/** J12: blocked selections show their mapped endpoints; they never authorize an edit. */
export function syncDisplaySelection(display: PmModeDisplay, ctx: EditContext): void {
	const target = resolveEditTarget(ctx), forward = ctx.selection.anchor <= ctx.selection.head;
	if (target.kind === "block") {
		// B15 (M2-2b, 申し送り6): an atom chosen whole is not drawn until M3, and a commit goes after it. Do not leave
		// the previous range showing: collapse to the position after the atom (no range is painted; the nearest
		// text position takes it) — where the committed line goes. CM's selection is untouched.
		const after = ctx.state.sourceMap.pmFrom[target.index] + ctx.state.blocks[target.index].node.nodeSize;
		display.setModelSelection(after, after);
		return;
	}
	let anchor: number, head: number;
	if (target.kind === "caret") anchor = head = target.pos;
	else if (target.kind === "range" || target.kind === "all") {
		const from = target.from, to = target.kind === "all" ? ctx.state.doc.content.size : target.to;
		anchor = forward ? from : to; head = forward ? to : from;
	} else {
		anchor = shownAt(ctx.state, ctx.selection.anchor, forward ? 1 : -1, ctx.anchorHint ?? undefined);
		head = shownAt(ctx.state, ctx.selection.head, forward ? -1 : 1, ctx.headHint ?? undefined);
	}
	display.setModelSelection(anchor, head);
}
