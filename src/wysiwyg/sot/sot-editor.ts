import type { EditorView } from "@codemirror/view";

export type SoTSelection = {
	anchor: number;
	head: number;
};

export type SoTUpdate = {
	/** A refused write must remove optimistic derived DOM, without inventing a CM change. */
	writeRejected?: boolean;
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
	/** Silent capability check; no Notice, dispatch or derived DOM update. */
	canWrite?(): boolean;
	notifyWriteBlocked?(retained?: boolean): void;
	notifyTargetChanged?(retained?: boolean, closing?: boolean): void;
	getDoc(): string;
	setDoc(text: string): void;

	getSelection(): SoTSelection;
	setSelection(selection: SoTSelection): void;

	replaceRange(from: number, to: number, insert: string): boolean | void;

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
