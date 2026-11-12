// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/documentAction.ts (`classifyInputSurfaceDocumentAction`) @ 58a98a90 (2026-11-06; the file is the same as at 020b5501)
// Local changes: only the classification is taken, with the same four answers in the same order. The type of the answer is the new mode's own: Nyoze's
//   `LocalImeDocumentActionPreparation['status']` belongs to its app-wide barrier (`localImeDocumentActionBarrier`), which the new mode does not have. Nyoze's controller (the notice
//   snapshot for React, the copy and the discard of the retained text, the continuation of a pending save) is not taken: the new mode has no save of its own (CodeMirror's note is
//   saved by Obsidian), and M4a (D-M4-11 to D-M4-15) tells with a Notice instead. `excerptForNotice` is new (D10: the first characters of the text a notice tells).

/** What a document action (a save, leaving the view) finds on the input surface. */
export type DocumentActionStatus = "ready" | "busy-flushing" | "wait-for-composition" | "recovery-required";

/** The judgement reads the payload only: it neither commits nor moves the focus (Nyoze `classifyInputSurfaceDocumentAction`). */
export function classifyInputSurfaceDocumentAction(input: { committing: boolean; composing: boolean; text: string }): DocumentActionStatus {
	if (input.committing) return "busy-flushing";
	if (input.composing) return "wait-for-composition";
	if (input.text) return "recovery-required";
	return "ready";
}

/** The number of characters (graphemes) a notice shows of the text that is lost (D10, M4-3). */
export const NOTICE_TEXT_LIMIT = 30;

type GraphemeSegmenter = { segment(text: string): Iterable<{ segment: string }> };
const SegmenterConstructor = (Intl as unknown as { Segmenter?: new (locale: string | undefined, options: { granularity: "grapheme" }) => GraphemeSegmenter }).Segmenter;
const graphemes: GraphemeSegmenter | null = SegmenterConstructor ? new SegmenterConstructor(undefined, { granularity: "grapheme" }) : null;

/**
 * M4-3 (D10): the text a notice shows of text that is lost with its view: the first `limit` characters, cut at a grapheme boundary (a surrogate pair, a combining mark or an emoji
 * sequence is never split), and "…" when there is more. A line break is shown as "⏎" so that the notice stays one line. The text is never written to the clipboard.
 */
export function excerptForNotice(text: string, limit: number = NOTICE_TEXT_LIMIT): string {
	const flat = text.replace(/\r\n|\r|\n/g, "⏎");
	const parts = graphemes ? Array.from(graphemes.segment(flat), part => part.segment) : Array.from(flat);
	return parts.length <= limit ? flat : parts.slice(0, limit).join("") + "…";
}
