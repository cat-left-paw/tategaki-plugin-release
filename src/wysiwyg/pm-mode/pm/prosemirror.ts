/** The new mode's sole ProseMirror import boundary. No dependency/version changes in M1. */
export { Schema, Fragment, Slice, DOMSerializer } from "@tiptap/pm/model";
export type { Node as PMNode, Mark, NodeSpec, MarkSpec, DOMOutputSpec } from "@tiptap/pm/model";
export { EditorState, TextSelection, Plugin, PluginKey } from "@tiptap/pm/state"; // (Plugin, M3c: the visual focus's decorations are a plugin's prop, composed by ProseMirror with the display's own; PluginKey, M4b: the composition widget's state)
// M2-1: the expected display of an edit is built with a Transform on the model document (input/).
export { Transform } from "@tiptap/pm/transform";
export { EditorView, Decoration, DecorationSet } from "@tiptap/pm/view";
export type { NodeView, NodeViewConstructor } from "@tiptap/pm/view";
export type { Transaction } from "@tiptap/pm/state";
