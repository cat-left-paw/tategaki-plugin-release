import { EditorView, EditorState, TextSelection, Plugin, DecorationSet, type NodeView, type NodeViewConstructor, type PMNode } from "./prosemirror";
import { pmModeSchema } from "./schema";
import { PmModeDocumentState, type DocumentUpdate } from "./document-state";
import { buildDecorations, DEFAULT_DECORATION_SETTINGS, focusLineDecorations, sameDecorationSettings, tailSpacerDecorations, updateDecorations, updateDisplayDecorations, type PmModeDecorationHooks, type PmModeDecorationSettings, type PmModeLabelKey, type PmModeTailSpacerFactory } from "./decorations";
import { ChunkLayout } from "./chunk-layout";
import { createCompositionWidgetPlugin, type CompositionRect, type PmModeCompositionWidgetFactory } from "./composition-widget";
import { createSlotNodeViews, type PmModePartRegistry, type PmModePartRenderer } from "./slot-parts";
import type { SourceModelOptions } from "../source/source-model";

/** What the display gets from outside the pure PM layer (M1-4). All optional for the pure tests. */
export interface PmModeDisplayEnv {
	/** Draws Obsidian parts into `partHost`'s light DOM, projected by slots (D23). */
	readonly parts?: PmModePartRenderer;
	readonly partHost?: HTMLElement;
	readonly icon?: (element: HTMLElement, name: string) => void;
	readonly label?: (key: PmModeLabelKey) => string;
	/** A heading's fold toggle was clicked; `line` is the heading's line index. */
	readonly onToggleFold?: (line: number) => void;
	readonly decorationSettings?: PmModeDecorationSettings;
	/** Keep the view out of the accessibility tree (default true; false only for comparisons in tests). */
	readonly accessibilityHidden?: boolean;
	/** Group runs of text lines into chunks (pm/chunk-layout.ts; default true; false only for comparisons in tests). */
	readonly chunked?: boolean;
	/**
	 * The root's classes and writing mode from the start (as `setPresentation`), so the first layout is done
	 * with them (chunked-skip design §9.1).
	 */
	readonly presentation?: { readonly classes: readonly string[]; readonly writingMode: string };
	/**
	 * Skip the chunks outside the view (CHUNK2-B, obsidian/chunk-skip.ts): each chunk's element is reported
	 * when it is made, when its node changes and when it is removed. Only with chunks.
	 */
	readonly chunks?: PmModeChunkHooks;
	/** M3c round 2 (R2-6): makes the tail spacer's element (`obsidian/` writes its size with Obsidian's helper); the pure layer has a default with no size. */
	readonly createTailSpacer?: PmModeTailSpacerFactory;
	/** M4b (D-M4-1): makes the element of the reserved area of a composition (`obsidian/` gives one that carries the stylesheet's class); the pure layer has a plain default. */
	readonly createCompositionWidget?: PmModeCompositionWidgetFactory;
}
/** The chunk elements, for skipping the chunks outside the view (chunked-skip design §9.1). */
export interface PmModeChunkHooks {
	created(dom: HTMLElement, chunk: PMNode): void;
	/** The chunk's node changed; its element stays. */
	updated(dom: HTMLElement, chunk: PMNode, previous: PMNode): void;
	destroyed(dom: HTMLElement): void;
}
/** Marks the root while the chunks outside the view are skipped (the CSS of CHUNK2-B applies then). */
export const CHUNK_SKIP_ATTRIBUTE = "data-tategaki-pm-chunk-skip";

/**
 * A chunk's element (as the schema's `tg-chunk`), reported to `hooks`. Its own attribute changes (the size
 * written by obsidian/chunk-skip.ts) are not document changes: ProseMirror would otherwise read the
 * chunk's whole DOM again.
 */
function chunkNodeView(hooks: PmModeChunkHooks): NodeViewConstructor {
	return (node, view) => {
		const dom = view.dom.ownerDocument.createElement("tg-chunk");
		dom.className = "tategaki-pm-chunk";
		let current = node;
		hooks.created(dom, current);
		const nodeView: NodeView = {
			dom, contentDOM: dom,
			update: next => {
				if (next.type !== current.type) return false;
				const previous = current;
				current = next;
				hooks.updated(dom, next, previous);
				return true;
			},
			ignoreMutation: mutation => mutation.type === "attributes" && mutation.target === dom,
			destroy: () => hooks.destroyed(dom),
		};
		return nodeView;
	};
}
/** The time of each stage of the last update, in ms (M1-5 diagnostics; a few clock reads per update). */
export interface PmModeUpdateTimings {
	model: number;
	/** The chunk layout of the display document (0 when it is flat). */
	layout: number;
	transaction: number;
	decorations: number;
	view: number;
	parts: number;
}
/** The time of each stage of building the display (opening), in ms (diagnostics; a few clock reads). */
export interface PmModeOpenTimings {
	/** The model: lines, blocks, the source map. */
	model: number;
	/** The chunk layout of the display document (0 when it is flat). */
	layout: number;
	decorations: number;
	/** ProseMirror's view: the DOM of the whole text. */
	view: number;
	parts: number;
}

/**
 * The view's text stays out of the accessibility tree (M1-5 report §10-§11, M1 design D25). With
 * Chromium's accessibility on (a UI Automation client such as DeepL), a line break near the head moves
 * every following column, and sending those location changes for the whole document froze Obsidian on
 * Windows. The text is in the paired Markdown view. A focused element inside the view would make Chromium
 * ignore this (M2's input surface goes next to the PM root, not inside it).
 */
const ACCESSIBILITY_HIDDEN = { "aria-hidden": "true" } as const;

/**
 * The read-only PM view of the new mode. Each CM change is applied as one replacement of the
 * changed blocks (M1-3, 本設計 §5); the other blocks keep their node objects, so the PM view
 * keeps their DOM. Decorations (Auto TCY, fold toggles) follow the same replacement (M1-4).
 * The view refuses document changes from anything else.
 *
 * The view's document groups runs of text lines into chunks (CHUNK1, pm/chunk-layout.ts); the model
 * document and its source map stay flat. A model update becomes one replacement of the chunks and
 * top-level blocks it touches; the other chunks keep their node objects (and the view their DOM).
 */
export class PmModeDisplay {
	readonly view: EditorView;
	private presentation = "";
	private documentState: PmModeDocumentState;
	private lastUpdate: DocumentUpdate | null = null;
	private timings: PmModeUpdateTimings | null = null;
	private readonly openStages: PmModeOpenTimings;
	private decorationSettings: PmModeDecorationSettings;
	private decorations: DecorationSet;
	private readonly hooks: PmModeDecorationHooks;
	private readonly slots: ReturnType<typeof createSlotNodeViews> | null;
	private readonly rootAttributes: Record<string, string>;
	private layout: ChunkLayout | null;
	/** M3c: the visual focus's decorations (a plugin's prop, composed by ProseMirror with `decorations`), the blocks they were made for and the document state they were made on. */
	private focusDecorations: DecorationSet = DecorationSet.empty;
	private focusKey = "";
	private focusState: PmModeDocumentState | null = null;
	private focusRange: { first: number; last: number; include(node: PMNode): boolean } | null = null;
	/** M3c round 2 (R2-5): the focus decorations were changed but no ProseMirror update has drawn them yet (the selection's update, or `flushFocus`, will). */
	private focusPending = false;
	/** M3c: the tail spacer's widget (Typewriter's room after the last line) and its extent in px (0: none). */
	private tailDecorations: DecorationSet = DecorationSet.empty;
	private tailExtent = 0;
	/** M4b (D-M4-1): the reserved area of the composition on the input surface (a transparent widget; the document is never changed for it). */
	private readonly composition;
	constructor(mount: HTMLElement, source: string, options: SourceModelOptions, private readonly env: PmModeDisplayEnv = {}) {
		const t0 = performance.now();
		this.documentState = PmModeDocumentState.build(source, options);
		const t1 = performance.now();
		this.hooks = {
			icon: env.icon ?? (() => {}),
			label: env.label ?? (key => key),
			toggleFold: pos => this.toggleFoldAt(pos),
		};
		this.decorationSettings = env.decorationSettings ?? DEFAULT_DECORATION_SETTINGS;
		this.layout = env.chunked === false ? null : ChunkLayout.build(this.documentState.blocks.map(block => block.node));
		const t2 = performance.now();
		this.decorations = buildDecorations(this.documentState, this.decorationSettings, this.hooks, this.layout ?? undefined);
		const t3 = performance.now();
		this.slots = env.parts && env.partHost ? createSlotNodeViews(env.partHost, env.parts) : null;
		this.rootAttributes = env.accessibilityHidden === false ? {} : { ...ACCESSIBILITY_HIDDEN };
		const skipping = !!(env.chunks && this.layout);
		if (skipping) this.rootAttributes[CHUNK_SKIP_ATTRIBUTE] = "on";
		const presentation = env.presentation;
		if (presentation) this.presentation = presentation.classes.join(" ") + "|" + presentation.writingMode;
		this.composition = createCompositionWidgetPlugin(env.createCompositionWidget);
		this.view = new EditorView({ mount }, {
			state: EditorState.create({ schema: pmModeSchema, doc: this.layout ? this.layout.doc : this.documentState.doc, plugins: [new Plugin({ props: { decorations: () => this.focusDecorations } }), new Plugin({ props: { decorations: () => this.tailDecorations } }), this.composition.plugin] }),
			editable: () => false,
			attributes: presentation
				? { ...this.rootAttributes, class: presentation.classes.join(" "), "data-writing-mode": presentation.writingMode }
				: { ...this.rootAttributes, class: "tategaki-pm-root" },
			decorations: () => this.decorations,
			nodeViews: { ...(this.slots?.nodeViews ?? {}), ...(skipping && env.chunks ? { chunk: chunkNodeView(env.chunks) } : {}) },
			dispatchTransaction: transaction => {
				// (the update draws the focus decorations that were set before it, too: M3c round 2, R2-5)
				if (!transaction.docChanged) { this.focusPending = false; this.view.updateState(this.view.state.apply(transaction)); }
			},
		});
		this.composition.attach(this.view);
		const t4 = performance.now();
		this.slots?.flush();
		this.openStages = { model: t1 - t0, layout: t2 - t1, decorations: t3 - t2, view: t4 - t3, parts: performance.now() - t4 };
	}
	get state(): PmModeDocumentState { return this.documentState; }
	/** The chunk layout of the view's document (null when it is flat; for tests and diagnostics). */
	get displayLayout(): ChunkLayout | null { return this.layout; }
	/** The last update (for diagnostics and tests). */
	get lastChange(): DocumentUpdate | null { return this.lastUpdate; }
	/** The stages of the last update (for diagnostics). */
	get lastTimings(): PmModeUpdateTimings | null { return this.timings; }
	/** The stages of building the display (for diagnostics). */
	get openTimings(): PmModeOpenTimings { return this.openStages; }
	/** Parts projected into the host (for diagnostics and tests). */
	get parts(): PmModePartRegistry | null { return this.slots?.registry ?? null; }
	setPresentation(classes: string[], writingMode: string): void {
		const key = classes.join(" ") + "|" + writingMode;
		if (this.presentation === key) return;
		this.presentation = key;
		this.view.setProps({ attributes: { ...this.rootAttributes, class: classes.join(" "), "data-writing-mode": writingMode } });
	}
	/** Auto TCY and the fold icons depend on settings outside the document: redecorate when they change. */
	setDecorationSettings(settings: PmModeDecorationSettings): void {
		if (sameDecorationSettings(settings, this.decorationSettings)) return;
		this.decorationSettings = settings;
		this.decorations = buildDecorations(this.documentState, settings, this.hooks, this.layout ?? undefined);
		this.focusPending = false;
		this.view.updateState(this.view.state);
	}
	/**
	 * M3c (D-M3-18): the lines of blocks `first..last` (model block indices) that `include` accepts get the focus class; null (or an empty range) clears it. Nothing is redrawn when the
	 * blocks and the document state are the ones the decorations were made for. It never changes the document or the selection.
	 */
	setFocusBlocks(range: { first: number; last: number; include(node: PMNode): boolean } | null, options: { defer?: boolean } = {}): void {
		const key = range ? `${range.first}:${range.last}` : "";
		if (key === this.focusKey && (!range || this.focusState === this.documentState)) return;
		this.focusKey = key; this.focusState = range ? this.documentState : null; this.focusRange = range;
		if (!range) {
			if (this.focusDecorations === DecorationSet.empty) return;
			this.focusDecorations = DecorationSet.empty;
		} else this.focusDecorations = this.buildFocusDecorations(this.view.state.doc, this.documentState, range);
		// `defer` (R2-5): the caller is about to update the display's selection, and that update draws these decorations; `flushFocus` makes one when no update follows.
		if (options.defer) this.focusPending = true; else { this.focusPending = false; this.view.updateState(this.view.state); }
	}
	/** M3c round 2 (R2-5): draw the focus decorations that were set with `defer`, if no update has done it. */
	flushFocus(): void {
		if (!this.focusPending) return;
		this.focusPending = false;
		this.view.updateState(this.view.state);
	}
	private buildFocusDecorations(doc: PMNode, state: PmModeDocumentState, range: { first: number; last: number; include(node: PMNode): boolean }): DecorationSet {
		const positions: number[] = [];
		for (let index = Math.max(0, range.first); index <= range.last && index < state.blocks.length; index++) {
			if (range.include(state.blocks[index].node)) positions.push(this.layout ? this.layout.blockFrom[index] : state.sourceMap.pmFrom[index]);
		}
		return focusLineDecorations(doc, positions);
	}
	/** M3c (D-M3-18): `extent` px of room after the last block (Typewriter's tail spacer; 0 removes it). Nothing is redrawn when the extent is the same. */
	setTailSpacer(extent: number): void {
		const next = extent > 0 ? extent : 0;
		if (next === this.tailExtent) return;
		this.tailExtent = next;
		this.tailDecorations = tailSpacerDecorations(this.view.state.doc, next, this.env.createTailSpacer);
		this.focusPending = false;
		this.view.updateState(this.view.state);
	}
	/** The tail spacer's extent now (for tests and diagnostics). */
	get tailSpacerExtent(): number { return this.tailExtent; }
	/**
	 * M4b (D-M4-1): reserve the room of the composing text at the display selection (a collapsed one in a text line): a transparent widget, made by one transaction that carries only a meta.
	 * `valid` says whether the owner still holds the snapshot (the caller's). Whether the room was reserved; it is not at a Ruby's base or a TCY.
	 */
	presentComposition(text: string, valid: () => boolean): boolean { return this.composition.present(text, valid); }
	/** M4b: the composing text changed: the widget's text only, no transaction. A widget that is no longer the one asked for is dropped. */
	updateComposition(text: string): void { this.composition.update(text); }
	/** M4b: take the widget away (one meta transaction when there is one). A change of the document does it too, in the same application. */
	clearComposition(): void { this.composition.clear(); }
	/** M4b: the widget is drawn and is still the one asked for (the display document and selection are the ones it began with, the owner still holds the snapshot). */
	get compositionPresented(): boolean { return this.composition.isPresented(); }
	/** M4b (INLINE-2B): the box of the widget's first character, read from the layout only; null when there is none. */
	compositionFirstCharacterRect(): CompositionRect | null { return this.composition.firstCharacterRect(); }
	/** M4c round 2 (R2-3): text of the line follows the room (the surface's rows are then broken as the body's are). */
	get compositionFollowedByText(): boolean { return this.composition.followedByText(); }
	/** For tests and diagnostics. */
	get compositionState(): ReturnType<PmModeDisplay["composition"]["snapshot"]> { return this.composition.snapshot(); }
	/** The lines that carry the focus class now (for tests and diagnostics). */
	get focusedLineCount(): number { return this.focusDecorations.find().length; }
	update(source: string, options: SourceModelOptions): DocumentUpdate {
		const t0 = performance.now();
		const update = this.documentState.update(source, options);
		return this.applyUpdate(update, performance.now() - t0);
	}
	/** Reuse the checked model, including composed plans (whose last diff starts at an intermediate model). */
	applyChecked(before: PmModeDocumentState, after: PmModeDocumentState): void {
		if (before !== this.documentState) throw new Error("Stale checked PM-mode display update");
		// Only find the replacement of block objects; do not parse or rebuild the line model again.
		const old = before.blocks, next = after.blocks;
		let prefix = 0, suffix = 0;
		while (prefix < old.length && prefix < next.length && old[prefix].node === next[prefix].node) prefix++;
		while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - suffix - 1].node === next[next.length - suffix - 1].node) suffix++;
		const nodes = next.slice(prefix, next.length - suffix).map(block => block.node);
		const update: DocumentUpdate = { state: after, kind: prefix === old.length && prefix === next.length ? "unchanged" : "partial",
			from: before.sourceMap.pmFrom[prefix] ?? before.doc.content.size, to: before.sourceMap.pmFrom[old.length - suffix] ?? before.doc.content.size,
			nodes, firstBlock: prefix,
			// These describe this display replacement; the planner already paid the model cost.
			stats: { prefixLines: after.blockLine[prefix] ?? after.lines.length, suffixLines: suffix ? after.lines.length - after.blockLine[next.length - suffix] : 0,
				blocksRebuilt: nodes.length, blocksReused: prefix + suffix, fullReason: null } };
		this.applyUpdate(update, 0);
	}
	/** The only flat → chunked selection conversion. Leaves CM and the display doc unchanged. */
	setModelSelection(anchor: number, head: number): void {
		const map = (pos: number) => this.layout ? this.layout.toDisplay(pos, this.documentState.sourceMap.pmFrom) : pos;
		const doc = this.view.state.doc;
		const selection = TextSelection.between(doc.resolve(map(anchor)), doc.resolve(map(head)));
		if (!selection.eq(this.view.state.selection)) this.view.dispatch(this.view.state.tr.setSelection(selection));
	}
	private applyUpdate(update: DocumentUpdate, modelTime: number): DocumentUpdate {
		const t1 = performance.now();
		const previousState = this.documentState;
		this.lastUpdate = update;
		this.documentState = update.state;
		if (update.kind === "unchanged") {
			this.timings = { model: modelTime, layout: 0, transaction: 0, decorations: 0, view: 0, parts: 0 };
			return update;
		}
		const display = this.layout ? this.layout.next(update.state.blocks.map(block => block.node), update.firstBlock, update.firstBlock + update.nodes.length) : null;
		const tLayout = performance.now();
		const transaction = display ? this.view.state.tr.replaceWith(display.from, display.to, [...display.nodes]) : this.view.state.tr.replaceWith(update.from, update.to, [...update.nodes]);
		const t2 = performance.now();
		this.decorations = display ? updateDisplayDecorations(this.decorations, update, display, transaction, this.decorationSettings, this.hooks)
			: updateDecorations(this.decorations, update, transaction, this.decorationSettings, this.hooks);
		if (display) this.layout = display.layout;
		// The focus decorations belong to the old document: keep them mapped until the visual focus asks again (the same frame), so no stale position is applied.
		if (this.focusRange && update.kind === "partial" && previousState.blocks.length === update.state.blocks.length) {
			// An edit that keeps the number of blocks keeps their indices: the focused block's lines are decorated again in this same update (the usual keystroke in a line), so the frame's
			// visual focus finds them as it wants them and does not make a second ProseMirror update (which reads the selection, forcing a layout) for the edited line.
			this.focusState = update.state;
			this.focusDecorations = this.buildFocusDecorations(transaction.doc, update.state, this.focusRange);
		} else if (this.focusDecorations !== DecorationSet.empty) this.focusDecorations = this.focusDecorations.map(transaction.mapping, transaction.doc);
		// (the spacer is always at the end of the new document)
		if (this.tailExtent > 0) this.tailDecorations = tailSpacerDecorations(transaction.doc, this.tailExtent, this.env.createTailSpacer);
		const t3 = performance.now();
		this.focusPending = false;
		this.view.updateState(this.view.state.apply(transaction));
		const t4 = performance.now();
		this.slots?.flush();
		this.timings = { model: modelTime, layout: tLayout - t1, transaction: t2 - tLayout, decorations: t3 - t2, view: t4 - t3, parts: performance.now() - t4 };
		return update;
	}
	private toggleFoldAt(pos: number): void {
		const index = this.layout ? this.layout.blockIndexAt(pos) : this.documentState.sourceMap.blockIndexAtPm(pos);
		this.env.onToggleFold?.(this.documentState.blockLine[index]);
	}
	destroy(): void { this.view.destroy(); }
}
