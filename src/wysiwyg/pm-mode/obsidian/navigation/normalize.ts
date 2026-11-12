import type { PmModeDocumentState } from "../../pm/document-state";
import { normalizePointerSelection } from "../pointer-selection";

/** D-M3-3 / B14: the Ruby's inner first/last ends are aliases of its outside ends (no intervening glyph). */
export function normalizeNavigationSelection(model: PmModeDocumentState, anchor: number, head: number) {
	const ends = normalizePointerSelection(model, anchor, head);
	if (!ends) return null;
	const canonical = (pos: number): number => {
		const block = model.sourceMap.blockAtPm(pos);
		if (block.type === "line") for (const ruby of block.inlines) if (ruby.kind === "ruby") {
			if (pos === ruby.pmFrom + 1) return ruby.pmFrom;
			if (pos === ruby.pmTo - 1) return ruby.pmTo;
		}
		return pos;
	};
	return { anchor: canonical(ends.anchor), head: canonical(ends.head) };
}
