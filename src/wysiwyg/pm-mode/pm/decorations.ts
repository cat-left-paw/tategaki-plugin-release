// Reference: V's line prefix and suffix parts, src/wysiwyg/sot-wysiwyg-view.ts (V:1941-1987 fold toggle
// and task box, V:14339-14366 collapsed heading ellipsis) @ 42ef031 (2026-10-17). No import from V.
// Local changes: Widget decorations instead of DOM children of a line; no collapse preview tooltip
// (hover is M3); the task box does nothing on click (M5); the fold toggle calls a hook.
// Auto TCY: the candidates of each line (source/line-segments.ts) filtered by the setting with the
// shared rule (src/shared/aozora-tcy.ts isValidAutoTcyBody), as inline decorations (M1 design §4.2).
// M1-7 (D-M17-3): the `[label]:` of a definition line (`[^1]: note`, `[注]: text`) is dimmed by an inline decoration of the same layer (display only: no mark, no document change).
// Nyoze's counterpart is `features/referenceDefinitionDecorationState.ts` @ e1da1a98 (MD-ESCAPE-EXPLICIT1): the range of a paragraph's leading `[label]:` gets one class (`nyoze-ref-def-label`, `color: var(--text-muted)`).
// Here the range comes from the line's decoration (`source/line-decoration.ts`, V's own definition regexes) and the decoration is rebuilt with its block, like the Auto TCY ones.
// M3c (D-M3-18, H7): `focusLineDecorations`, the visual focus's node decorations (a class on each line of the focused block). Which block is focused is decided by
// obsidian/display-visuals.ts (V's pure functions); this layer only draws a class where it is told. Nyoze's counterpart is `visualFocusBlockDecoration.ts` (@ 020b5501), not copied.
import { Decoration, DecorationSet, type PMNode, type Transaction } from "./prosemirror";
import { isValidAutoTcyBody } from "../../../shared/aozora-tcy";
import type { DocumentBlock, DocumentUpdate, PmModeDocumentState } from "./document-state";
import type { ChunkLayout, DisplayUpdate } from "./chunk-layout";
import { definitionLabelRange } from "../source/line-decoration";

export interface PmModeDecorationSettings {
	readonly autoTcy: { readonly enabled: boolean; readonly minDigits: number; readonly maxDigits: number; readonly digitsOnly: boolean };
	readonly writingMode: string;
}
export type PmModeLabelKey = "heading.toggle.expand" | "heading.toggle.collapse" | "task.checked" | "task.unchecked";
/** What the decorations need from outside the pure PM layer (icons and labels come from Obsidian). */
export interface PmModeDecorationHooks {
	icon(element: HTMLElement, name: string): void;
	label(key: PmModeLabelKey): string;
	/** The fold toggle at `pos` (inside a heading line) was clicked. */
	toggleFold(pos: number): void;
}
export const DEFAULT_DECORATION_SETTINGS: PmModeDecorationSettings = { autoTcy: { enabled: false, minDigits: 2, maxDigits: 4, digitsOnly: false }, writingMode: "vertical-rl" };

export function sameDecorationSettings(a: PmModeDecorationSettings, b: PmModeDecorationSettings): boolean {
	return a.writingMode === b.writingMode && a.autoTcy.enabled === b.autoTcy.enabled && a.autoTcy.minDigits === b.autoTcy.minDigits
		&& a.autoTcy.maxDigits === b.autoTcy.maxDigits && a.autoTcy.digitsOnly === b.autoTcy.digitsOnly;
}

function foldIcon(collapsed: boolean, writingMode: string): string {
	// V:1962-1975: horizontal collapsed=right / open=down; vertical collapsed=down / open=left.
	if (writingMode === "horizontal-tb") return collapsed ? "circle-chevron-right" : "circle-chevron-down";
	return collapsed ? "circle-chevron-down" : "circle-chevron-left";
}

/**
 * M3c (D-M3-18, V's tail spacer `updateScrollPastEnd`): room of `extent` px after the last block, as a widget at the end of the doc node. The root's own box does not hold its content in
 * vertical writing (the root is as wide as the view and the chunks overflow it), so padding on the root adds no scrollable length; a block after the last chunk does (it overflows in turn).
 * It is outside every chunk, so no chunk's estimated size changes (obsidian/chunk-skip.ts reads chunks only). `extent` is part of its key, so a new size is a new element.
 */
export function tailSpacerDecorations(doc: PMNode, extent: number, create: PmModeTailSpacerFactory = defaultTailSpacer): DecorationSet {
	if (!(extent > 0)) return DecorationSet.empty;
	return DecorationSet.create(doc, [Decoration.widget(doc.content.size, view => create(view.dom.ownerDocument, extent), { side: 1, key: `tail-spacer:${extent}`, ignoreSelection: true, stopEvent: () => true })]);
}
/**
 * M3c round 2 (R2-6): the element of the spacer is made by the caller (`PmModeDisplayEnv.createTailSpacer`, given by `obsidian/`, which writes its size with Obsidian's element helper): this layer
 * does not use Obsidian's element helpers. Without one (the pure tests) the element has no size.
 */
export type PmModeTailSpacerFactory = (ownerDocument: Document, extent: number) => HTMLElement;
const defaultTailSpacer: PmModeTailSpacerFactory = (ownerDocument, extent) => {
	const spacer = ownerDocument.createElement("div");
	spacer.className = "tategaki-pm-tail-spacer";
	spacer.setAttribute("aria-hidden", "true");
	spacer.dataset.extent = String(extent);
	return spacer;
};

/** M1-7: the class of a definition line's `[label]:` (its colour is the theme's muted text colour; obsidian/styles/stylesheet.ts). */
export const DEFINITION_LABEL_CLASS = "tategaki-md-definition-label";

/** M3c: the class a line of the focused block carries (the CSS dims the other lines and tints these). */
export const FOCUS_LINE_CLASS = "tategaki-pm-focus-line";
/** M3c: node decorations that put `FOCUS_LINE_CLASS` on the nodes that start at `positions` of `doc` (the display document's positions). */
export function focusLineDecorations(doc: PMNode, positions: readonly number[]): DecorationSet {
	const out: Decoration[] = [];
	for (const pos of positions) {
		const node = doc.nodeAt(pos);
		if (node) out.push(Decoration.node(pos, pos + node.nodeSize, { class: FOCUS_LINE_CLASS }));
	}
	return out.length ? DecorationSet.create(doc, out) : DecorationSet.empty;
}

/** The decorations of one top-level block whose node starts at `pmFrom`. Pure apart from the widget DOM. */
export function decorationsForBlock(block: DocumentBlock, pmFrom: number, settings: PmModeDecorationSettings, hooks: PmModeDecorationHooks): Decoration[] {
	const node = block.node;
	if (node.type.name !== "line") return [];
	const out: Decoration[] = [];
	const dataset = node.attrs.dataset as Record<string, string>;
	if (dataset.headingFoldable === "1") {
		const collapsed = dataset.headingCollapsed === "1", icon = foldIcon(collapsed, settings.writingMode);
		out.push(Decoration.widget(pmFrom + 1, (view, getPos) => {
			const toggle = view.dom.ownerDocument.createElement("span");
			toggle.className = "tategaki-md-heading-toggle";
			toggle.dataset.headingToggle = "1";
			toggle.setAttribute("role", "button");
			toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
			toggle.setAttribute("aria-label", hooks.label(collapsed ? "heading.toggle.expand" : "heading.toggle.collapse"));
			hooks.icon(toggle, icon);
			toggle.addEventListener("mousedown", event => event.preventDefault());
			toggle.addEventListener("click", event => {
				event.preventDefault();
				const pos = getPos();
				if (pos !== undefined) hooks.toggleFold(pos);
			});
			return toggle;
		}, { side: -1, key: `heading-toggle:${icon}`, ignoreSelection: true, stopEvent: () => true }));
	}
	if (dataset.mdKind === "task") {
		const checked = dataset.taskChecked === "1";
		out.push(Decoration.widget(pmFrom + 1, view => {
			const box = view.dom.ownerDocument.createElement("span");
			box.className = "tategaki-md-task-box";
			box.dataset.taskToggle = "1";
			box.setAttribute("role", "checkbox");
			box.setAttribute("aria-checked", checked ? "true" : "false");
			box.setAttribute("aria-label", hooks.label(checked ? "task.checked" : "task.unchecked"));
			return box;
		}, { side: -1, key: `task-box:${checked ? 1 : 0}`, ignoreSelection: true }));
	}
	// A definition line shows its `[label]:` as one plain run from the line's start (source/line-segments.ts), so its model range is the line's offsets +1.
	const label = definitionLabelRange(dataset);
	if (label) out.push(Decoration.inline(pmFrom + 1 + label.from, pmFrom + 1 + label.to, { class: DEFINITION_LABEL_CLASS }));
	if (settings.autoTcy.enabled) {
		const options = { minDigits: settings.autoTcy.minDigits, maxDigits: settings.autoTcy.maxDigits, autoTcyDigitsOnly: settings.autoTcy.digitsOnly };
		for (const candidate of block.local.autoTcy) {
			if (!isValidAutoTcyBody(candidate.text, options)) continue;
			out.push(Decoration.inline(pmFrom + candidate.pmFrom, pmFrom + candidate.pmTo, { class: "tategaki-md-tcy", "data-tategaki-auto-tcy": "1" }));
		}
	}
	if (dataset.mdKind === "heading" && dataset.headingCollapsed === "1") {
		out.push(Decoration.widget(pmFrom + node.nodeSize - 1, view => {
			const ellipsis = view.dom.ownerDocument.createElement("span");
			ellipsis.className = "tategaki-md-heading-ellipsis";
			hooks.icon(ellipsis, "message-circle-more");
			return ellipsis;
		}, { side: 1, key: "heading-ellipsis", ignoreSelection: true }));
	}
	return out;
}

/**
 * All decorations of a document state: over its flat document, or with `layout` over the display
 * document that groups lines into chunks (positions from the layout).
 */
export function buildDecorations(state: PmModeDocumentState, settings: PmModeDecorationSettings, hooks: PmModeDecorationHooks, layout?: ChunkLayout): DecorationSet {
	const all: Decoration[] = [];
	state.blocks.forEach((block, i) => { all.push(...decorationsForBlock(block, layout ? layout.blockFrom[i] : state.sourceMap.pmFrom[i], settings, hooks)); });
	return DecorationSet.create(layout ? layout.doc : state.doc, all);
}

/**
 * The decorations after `update` was applied by `transaction` (本設計 §5.1 の4): the old set is
 * mapped, the replaced range is cleared, and only the rebuilt blocks are decorated again. Blocks
 * outside the range keep their decoration objects, so the PM view keeps their DOM.
 */
export function updateDecorations(previous: DecorationSet, update: DocumentUpdate, transaction: Transaction, settings: PmModeDecorationSettings, hooks: PmModeDecorationHooks): DecorationSet {
	if (update.kind === "unchanged") return previous;
	if (update.kind === "full") return buildDecorations(update.state, settings, hooks);
	const size = update.nodes.reduce((n: number, node: PMNode) => n + node.nodeSize, 0);
	let set = previous.map(transaction.mapping, transaction.doc);
	set = set.remove(set.find(update.from, update.from + size));
	const added: Decoration[] = [];
	for (let k = 0; k < update.nodes.length; k++) {
		const index = update.firstBlock + k;
		added.push(...decorationsForBlock(update.state.blocks[index], update.state.sourceMap.pmFrom[index], settings, hooks));
	}
	return added.length ? set.add(transaction.doc, added) : set;
}

/**
 * The display decorations after `display` (a replacement of chunks and top-level blocks) was applied by
 * `transaction`: as `updateDecorations`, with the replaced range and the blocks inside it taken from the
 * display update. A full model update (settings) decorates everything again.
 */
export function updateDisplayDecorations(previous: DecorationSet, update: DocumentUpdate, display: DisplayUpdate, transaction: Transaction, settings: PmModeDecorationSettings, hooks: PmModeDecorationHooks): DecorationSet {
	if (update.kind === "full") return buildDecorations(update.state, settings, hooks, display.layout);
	if (update.kind === "unchanged" || (display.from === display.to && !display.nodes.length)) return previous;
	const size = display.nodes.reduce((n: number, node: PMNode) => n + node.nodeSize, 0);
	let set = previous.map(transaction.mapping, transaction.doc);
	set = set.remove(set.find(display.from, display.from + size));
	const added: Decoration[] = [];
	for (let index = display.firstBlock; index < display.endBlock; index++) {
		added.push(...decorationsForBlock(update.state.blocks[index], display.layout.blockFrom[index], settings, hooks));
	}
	return added.length ? set.add(transaction.doc, added) : set;
}
