import type { SourceSelection } from "./edit-target";
import { canonicalChanges, type SourceChange } from "./source-change";

/** What the new mode is about to dispatch (M2 design §5.5). */
export interface AuditedPlan {
	/** CodeMirror's document object the plan was made from (`Text`). */
	readonly docRef: unknown;
	readonly length: number;
	readonly changes: readonly SourceChange[];
	readonly selection: SourceSelection;
}
/** A transaction as the Obsidian layer reads it, in the start document's coordinates. */
export interface TransactionShape {
	readonly startDoc: unknown;
	/** As `ChangeSet.iterChanges` reports them (touching changes merged). */
	readonly changes: readonly SourceChange[];
	/** The main selection range it sets, or null when it sets none. */
	readonly selection: SourceSelection | null;
	/** How many selection ranges it sets (the plan sets one; another filter may add more). */
	readonly selectionRanges: number;
}
export type AuditFailure = "stale-start" | "changes-differ" | "selection-differs";

/**
 * Whether a transaction is exactly the plan: made from the same document, with the same changes
 * (compared in the canonical form, so a change list and its merged form agree) and the same
 * selection. The safety net drops a transaction that is not (another filter changed it); the
 * check after applying stops the view's writing when one got through (D26).
 */
export function auditTransaction(plan: AuditedPlan, actual: TransactionShape): AuditFailure | null {
	if (actual.startDoc !== plan.docRef) return "stale-start";
	const expected = canonicalChanges(plan.changes, plan.length), changes = canonicalChanges(actual.changes, plan.length);
	if (expected.length !== changes.length || expected.some((change, i) => change.from !== changes[i].from || change.to !== changes[i].to || change.insert !== changes[i].insert)) return "changes-differ";
	if (!actual.selection || actual.selectionRanges !== 1 || actual.selection.anchor !== plan.selection.anchor || actual.selection.head !== plan.selection.head) return "selection-differs";
	return null;
}
