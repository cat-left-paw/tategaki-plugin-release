import {
	Annotation,
	Compartment,
	EditorState,
	EditorSelection,
	StateEffect,
	Transaction,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import type { MarkdownView } from "obsidian";
import type { SoTChange, SoTEditor, SoTSelection, SoTUpdate } from "./sot-editor";

type Listener = (update: SoTUpdate) => void;

const sotSelectionDispatchAnnotation = Annotation.define<boolean>();
type PendingSelectionRollbackGuard = {
	before: SoTSelection;
	target: SoTSelection;
	expiresAt: number;
};

type MarkdownViewWithCodeMirror = MarkdownView & {
	editor?: {
		cm?: EditorView;
	};
};

export class MarkdownViewSoTEditor implements SoTEditor {
	private view: EditorView | null;
	private listeners = new Set<Listener>();
	private readonly updateCompartment = new Compartment();
	private pendingSelectionRollbackGuard: PendingSelectionRollbackGuard | null =
		null;

	constructor(markdownView: MarkdownView) {
		const editorView = (markdownView as MarkdownViewWithCodeMirror).editor?.cm;
		if (!editorView) {
			this.view = null;
			return;
		}
		this.view = editorView;
		this.attachUpdateListener();
	}

	getDoc(): string {
		if (!this.view) return "";
		return this.view.state.doc.toString();
	}

	setDoc(text: string): void {
		if (!this.view) return;
		const docLength = this.view.state.doc.length;
		const safePos = Math.max(0, text.length);
		this.view.dispatch({
			changes: { from: 0, to: docLength, insert: text },
			selection: EditorSelection.single(safePos, safePos),
			scrollIntoView: false,
		});
	}

	getSelection(): SoTSelection {
		if (!this.view) return { anchor: 0, head: 0 };
		const main = this.view.state.selection.main;
		return { anchor: main.anchor, head: main.head };
	}

	setSelection(selection: SoTSelection): void {
		if (!this.view) return;
		const docLength = this.view.state.doc.length;
		const anchor = Math.max(0, Math.min(selection.anchor, docLength));
		const head = Math.max(0, Math.min(selection.head, docLength));
		const before = this.getSelection();
		if (before.anchor !== anchor || before.head !== head) {
			this.pendingSelectionRollbackGuard = {
				before,
				target: { anchor, head },
				expiresAt: Date.now() + 250,
			};
		}
		this.view.dispatch({
			selection: EditorSelection.single(anchor, head),
			scrollIntoView: false,
			annotations: [
				sotSelectionDispatchAnnotation.of(true),
				Transaction.userEvent.of("tategaki.sot.setSelection"),
			],
		});
	}

	getEditorView(): EditorView | null {
		return this.view;
	}

	replaceRange(from: number, to: number, insert: string): void {
		if (!this.view) return;
		const docLength = this.view.state.doc.length;
		const safeFrom = Math.max(0, Math.min(from, docLength));
		const safeTo = Math.max(safeFrom, Math.min(to, docLength));
		const next = safeFrom + insert.length;
		this.view.dispatch({
			changes: { from: safeFrom, to: safeTo, insert },
			selection: EditorSelection.single(next, next),
			scrollIntoView: false,
			annotations: [
				sotSelectionDispatchAnnotation.of(true),
				Transaction.userEvent.of("tategaki.sot.replaceRange"),
			],
		});
	}

	undo(): void {
		if (!this.view) return;
		undo(this.view);
	}

	redo(): void {
		if (!this.view) return;
		redo(this.view);
	}

	onUpdate(callback: Listener): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	destroy(): void {
		this.listeners.clear();
		if (this.view) {
			this.view.dispatch({
				effects: this.updateCompartment.reconfigure([]),
			});
		}
		this.view = null;
	}

	private attachUpdateListener(): void {
		if (!this.view) return;
		const transactionFilter = EditorState.transactionFilter.of(
			(transaction) => {
				if (this.shouldDropSelectionRollback(transaction)) {
					return [];
				}
				return transaction;
			},
		);
		const extension = EditorView.updateListener.of((update) => {
			if (!update.docChanged && !update.selectionSet) return;
			let changes: SoTChange[] | undefined;
			if (update.docChanged) {
				changes = [];
				update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
					changes?.push({
						from: fromA,
						to: toA,
						fromB,
						toB,
						insert: inserted.toString(),
					});
				});
			}
			const payload: SoTUpdate = {
				docChanged: update.docChanged,
				selectionChanged: update.selectionSet,
				changes,
			};
			for (const listener of this.listeners) {
				listener(payload);
			}
		});
		this.view.dispatch({
			effects: StateEffect.appendConfig.of(
				this.updateCompartment.of([extension, transactionFilter]),
			),
		});
	}

	private shouldDropSelectionRollback(transaction: Transaction): boolean {
		// After SoT sets a CodeMirror selection, CM may observe a stale DOM
		// selection and dispatch a selection-only rollback with no userEvent.
		if (transaction.docChanged) return false;
		if (!transaction.selection) return false;
		if (transaction.annotation(sotSelectionDispatchAnnotation) !== undefined) {
			return false;
		}
		if (transaction.annotation(Transaction.userEvent) !== undefined) {
			return false;
		}
		const guard = this.pendingSelectionRollbackGuard;
		if (!guard) return false;
		if (Date.now() > guard.expiresAt) {
			this.pendingSelectionRollbackGuard = null;
			return false;
		}
		const start = transaction.startState.selection.main;
		const next = transaction.selection.main;
		const startsAtTarget =
			start.anchor === guard.target.anchor &&
			start.head === guard.target.head;
		const returnsToBefore =
			next.anchor === guard.before.anchor &&
			next.head === guard.before.head;
		if (!startsAtTarget) {
			this.pendingSelectionRollbackGuard = null;
			return false;
		}
		if (!returnsToBefore) {
			this.pendingSelectionRollbackGuard = null;
			return false;
		}
		this.pendingSelectionRollbackGuard = null;
		return true;
	}
}
