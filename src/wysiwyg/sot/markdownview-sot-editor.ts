import { EditorSelection, StateEffect, Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import type { MarkdownView } from "obsidian";
import type { SoTChange, SoTEditor, SoTSelection, SoTUpdate } from "./sot-editor";

type Listener = (update: SoTUpdate) => void;

export class MarkdownViewSoTEditor implements SoTEditor {
	private view: EditorView | null;
	private listeners = new Set<Listener>();
	private readonly updateCompartment = new Compartment();

	constructor(markdownView: MarkdownView) {
		const editorView = (markdownView.editor as any)?.cm as
			| EditorView
			| undefined;
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
		this.view.dispatch({
			selection: EditorSelection.single(anchor, head),
			scrollIntoView: false,
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
			effects: StateEffect.appendConfig.of([
				this.updateCompartment.of(extension),
			]),
		});
	}
}
