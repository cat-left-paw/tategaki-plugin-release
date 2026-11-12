// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/caretGeometry.ts @ 020b5501 (2026-10-22)
// Local changes: geometry arithmetic only; the single caret reader is display-geometry.ts (including F6).
import type { EditorView } from "../../pm/prosemirror";
import { readCaretRect as readDisplayRect } from "../display-geometry";
import type { SupportedEditorWritingMode } from "./writing-mode";
import type { NavigationAffinity } from "./rules";

export type CaretRect = { left: number; right: number; top: number; bottom: number };
export const copyRect = (r: CaretRect): CaretRect => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
export const validRect = (r: CaretRect): boolean => Object.values(copyRect(r)).every(Number.isFinite) && (r.right > r.left || r.bottom > r.top);
export const blockCenter = (r: CaretRect, mode: SupportedEditorWritingMode): number => mode === "vertical-rl" ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
export const inlineStart = (r: CaretRect, mode: SupportedEditorWritingMode): number => mode === "vertical-rl" ? r.top : r.left;
export const readCaretRect = (view: EditorView, pos: number, mode: SupportedEditorWritingMode, affinity: NavigationAffinity): CaretRect | null => readDisplayRect(view, pos, mode === "vertical-rl", affinity);
