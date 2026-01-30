import type { EditorView } from "@codemirror/view";

export type SoTSelection = {
	anchor: number;
	head: number;
};

export type SoTUpdate = {
	docChanged: boolean;
	selectionChanged: boolean;
	changes?: SoTChange[];
};

export type SoTChange = {
	from: number;
	to: number;
	fromB: number;
	toB: number;
	insert: string;
};

export interface SoTEditor {
	getDoc(): string;
	setDoc(text: string): void;

	getSelection(): SoTSelection;
	setSelection(selection: SoTSelection): void;

	replaceRange(from: number, to: number, insert: string): void;

	undo(): void;
	redo(): void;

	onUpdate(callback: (update: SoTUpdate) => void): () => void;
	destroy(): void;

	/**
	 * CodeMirror の SoT を直接参照できる場合のみ提供される。
	 * SoT派生ビュー側で構文木（Lezer）を参照する用途に使う。
	 */
	getEditorView?(): EditorView | null;
}
