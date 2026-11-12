import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { EditorView, type ViewUpdate } from "@codemirror/view";

/** K3: CM owns history. Count every transaction, including empty/filter-produced ones, during its synchronous command. */
export class PmModeHistory {
	private active: { transactions: number; direction: "undo" | "redo"; directionMatches: boolean; changesEmpty: boolean; builtChanges: string | null; changesMatch: boolean } | null = null;
	private readonly observe = (update: ViewUpdate): void => {
		const active = this.active;
		if (active) {
			active.transactions += update.transactions.length;
			active.directionMatches &&= update.transactions.every(tr => tr.isUserEvent(active.direction));
			active.changesEmpty &&= update.transactions.every(tr => !tr.docChanged);
			active.changesMatch &&= update.transactions.every(tr => JSON.stringify(tr.changes.toJSON()) === active.builtChanges);
		}
	};
	readonly extension = EditorView.updateListener.of(this.observe);
	get running(): boolean { return this.active !== null; }
	isInstalled(view: EditorView): boolean { return view.state.facet(EditorView.updateListener).includes(this.observe); }
	run(view: EditorView, direction: "undo" | "redo"): "applied" | "empty" | "mismatch" {
		if (this.active) return "mismatch";
		const before = view.state, done = undoDepth(before), undone = redoDepth(before);
		if (!(direction === "undo" ? done : undone)) return "empty";
		const operation = { transactions: 0, direction, directionMatches: true, changesEmpty: true, builtChanges: null as string | null, changesMatch: true };
		this.active = operation;
		let handled: boolean, builtEmpty = true;
		try { handled = (direction === "undo" ? undo : redo)({ state: view.state, dispatch: tr => { builtEmpty &&= tr.changes.empty; operation.builtChanges = JSON.stringify(tr.changes.toJSON()); view.dispatch(tr); } }); }
		catch { return "mismatch"; }
		finally { this.active = null; }
		const after = view.state;
		if (!handled) return operation.transactions === 0 && after === before ? "empty" : "mismatch";
		const received = direction === "undo" ? redoDepth(after) - undone : undoDepth(after) - done;
		const sent = direction === "undo" ? done - undoDepth(after) : undone - redoDepth(after);
		// K9: CM may discard additional mapped, empty groups on the outgoing branch.
		// S1: that one transaction must still be the history command in the requested direction.
		// K13/K14: only a group built empty by CM may be consumed without creating a receiving group.
		// K15: the observed changes must match the ones CM supplied before dispatch.
		return operation.transactions === 1 && operation.directionMatches && (received === 1 || operation.changesEmpty && builtEmpty && received === 0) && sent >= 1 && operation.changesMatch ? "applied" : "mismatch";
	}
}
