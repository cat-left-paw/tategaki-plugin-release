import { Annotation, EditorState, Prec, StateField, type Extension, type Text, type Transaction } from "@codemirror/state";
import { auditTransaction, type AuditedPlan, type TransactionShape } from "../input/edit-audit";
import type { SourcePoint } from "../source/source-map";

/** Provenance, separate from CM's history grouping (`userEvent`). */
export const pmModeInput = Annotation.define<"commit" | "delete" | "enter" | "paste" | "selection">();
export interface SelectionHints { readonly anchor: SourcePoint; readonly head: SourcePoint }
export const pmModeSelectionHint = Annotation.define<SelectionHints>();
export interface StoredSelectionHints extends SelectionHints { readonly docRef: Text }
export const pmModeSelectionField = StateField.define<StoredSelectionHints | null>({
	create: () => null,
	update: (previous, tr) => {
		const hints = tr.annotation(pmModeInput) ? tr.annotation(pmModeSelectionHint) : undefined;
		if (hints && tr.newSelection.ranges.length === 1 && hints.anchor.offset === tr.newSelection.main.anchor && hints.head.offset === tr.newSelection.main.head) {
			return { ...hints, docRef: tr.newDoc };
		}
		return tr.docChanged || tr.selection ? null : previous;
	},
});

export function readSelectionHints(state: EditorState): StoredSelectionHints | null {
	const hints = state.field(pmModeSelectionField, false);
	return hints?.docRef === state.doc ? hints : null;
}
export function transactionShape(tr: Transaction): TransactionShape {
	const changes: { from: number; to: number; insert: string }[] = [];
	tr.changes.iterChanges((from, to, _fromB, _toB, insert) => changes.push({ from, to, insert: insert.toString() }));
	return { startDoc: tr.startState.doc, changes, selection: tr.newSelection.main, selectionRanges: tr.newSelection.ranges.length };
}

/** Only armed during one synchronous dispatch. No rollback and no retries. */
export class PmModeEditGuard {
	private active: { plan: AuditedPlan; selectionOnly: boolean } | null = null;
	rejected = false;
	private readonly filter = (tr: Transaction) => {
		if (!this.active || !tr.annotation(pmModeInput)) return tr;
		// Only our provenance is audited. Removed annotations are detected after dispatch (D26).
		const { plan, selectionOnly } = this.active;
		const bad = selectionOnly ? tr.startState.doc !== plan.docRef || tr.docChanged : auditTransaction(plan, transactionShape(tr));
		if (!bad) return tr;
		this.rejected = true;
		return [];
	};
	readonly extension: Extension = [pmModeSelectionField, Prec.highest(EditorState.transactionFilter.of(this.filter))];
	isInstalled(state: EditorState): boolean {
		return state.field(pmModeSelectionField, false) !== undefined && state.facet(EditorState.transactionFilter).includes(this.filter);
	}
	run(plan: AuditedPlan, selectionOnly: boolean, dispatch: () => void): void {
		if (this.active) throw new Error("Nested PM-mode dispatch");
		this.rejected = false;
		this.active = { plan, selectionOnly };
		try { dispatch(); } finally { this.active = null; }
	}
}
