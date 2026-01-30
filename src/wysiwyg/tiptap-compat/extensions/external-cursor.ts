import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { DecorationSource, EditorView } from "@tiptap/pm/view";

interface ExternalCursorState {
	pos: number | null;
}

type ExternalCursorMeta =
	| { type: "set"; pos: number }
	| { type: "clear" };

export const ExternalCursorPluginKey = new PluginKey<ExternalCursorState>(
	"tategakiExternalCursor"
);

function clampPos(state: EditorState, pos: number): number {
	const maxPos = Math.max(0, state.doc.content.size);
	return Math.max(0, Math.min(pos, maxPos));
}

function buildDecorations(
	state: EditorState,
	pos: number | null
): DecorationSource | null {
	if (typeof pos !== "number") {
		return null;
	}
	const safePos = clampPos(state, pos);
	const deco = Decoration.widget(
		safePos,
		() => {
			const caret = document.createElement("span");
			caret.className = "cursor-indicator tategaki-external-caret";
			return caret;
		},
		{ side: -1 }
	);
	return DecorationSet.create(state.doc, [deco]);
}

function applyMeta(
	state: EditorState,
	prev: ExternalCursorState,
	tr: Transaction
): ExternalCursorState {
	const meta = tr.getMeta(ExternalCursorPluginKey) as ExternalCursorMeta | undefined;
	if (!meta) {
		return prev;
	}
	if (meta.type === "clear") {
		return { pos: null };
	}
	if (meta.type === "set") {
		return { pos: meta.pos };
	}
	return prev;
}

export const ExternalCursorExtension = Extension.create({
	name: "externalCursor",

	addCommands() {
		return {
			setExternalCursor:
				(pos: number) =>
				({ tr, dispatch }) => {
					dispatch?.(tr.setMeta(ExternalCursorPluginKey, { type: "set", pos }));
					return true;
				},
			clearExternalCursor:
				() =>
				({ tr, dispatch }) => {
					dispatch?.(tr.setMeta(ExternalCursorPluginKey, { type: "clear" }));
					return true;
				},
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<ExternalCursorState>({
				key: ExternalCursorPluginKey,
				state: {
					init: () => ({ pos: null }),
					apply: (tr, prev, _oldState, state) => {
						const next = applyMeta(state, prev, tr);
						return next;
					},
				},
				props: {
					decorations: (state): DecorationSource | null => {
						const pluginState = ExternalCursorPluginKey.getState(state);
						return buildDecorations(state, pluginState?.pos ?? null);
					},
				},
				view: (_view: EditorView) => {
					return {
						destroy: () => {},
					};
				},
			}),
		];
	},
});

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		externalCursor: {
			setExternalCursor: (pos: number) => ReturnType;
			clearExternalCursor: () => ReturnType;
		};
	}
}
