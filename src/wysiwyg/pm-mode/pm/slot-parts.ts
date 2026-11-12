/**
 * Obsidianの部品をShadow DOMの外に描き、<slot>で映すnodeView（D23、M1設計§7.1）。
 *
 * nodeViewのDOM（`tg-widget`・`tg-frontmatter`・行内の数式のspan）はShadow DOMの中にあり、
 * `<slot name>`だけを持つ。実際の部品は、hostの子（light DOM）の`tategaki-pm-part`に描き、
 * `slot`属性で映す。documentのCSS（Obsidianのapp.css・テーマ・このpluginのstyles.css）が
 * light DOMの規則として部品に当たり、継承する値は<slot>の親から受け取る（M1-4のheadless確認）。
 * 部品の寿命はnodeViewと同じ: 差分更新で作り直されたnodeだけが部品を作り直す。
 */
import type { EditorView, NodeView, NodeViewConstructor, PMNode } from "./prosemirror";

export type PmModePartType = "widget" | "inlineMath" | "frontmatter";
export interface PmModePartRequest { readonly type: PmModePartType; readonly node: PMNode }
export interface PmModePartHandle { destroy(): void }
/** Draws a part into the light DOM element `part`. `frame` is the nodeView DOM inside the shadow tree. */
export interface PmModePartRenderer {
	render(request: PmModePartRequest, part: HTMLElement, frame: HTMLElement): PmModePartHandle | null;
	/** Called once after each PM update that created parts (e.g. to finish math rendering). */
	afterUpdate?(): void;
}
/** Parts currently projected, for tests and diagnostics. */
export interface PmModePartRegistry { readonly size: number; parts(): HTMLElement[] }

let nextSlot = 0;

function frameFor(type: PmModePartType, node: PMNode, view: EditorView): HTMLElement {
	const doc = view.dom.ownerDocument;
	if (type === "inlineMath") {
		const span = doc.createElement("span");
		span.className = "tategaki-md-inline-widget tategaki-md-math-inline-widget";
		span.dataset.widgetKind = "math-inline";
		return span;
	}
	if (type === "frontmatter") return doc.createElement("tg-frontmatter");
	const frame = doc.createElement("tg-widget");
	frame.className = ["tategaki-pm-line", ...(node.attrs.classes as string[])].join(" ");
	frame.dataset.kind = String(node.attrs.kind);
	frame.dataset.lineCount = String(node.attrs.lineCount);
	return frame;
}

/** nodeViews for the three atom types, projecting parts into `host`'s light DOM. */
export function createSlotNodeViews(host: HTMLElement, renderer: PmModePartRenderer): { nodeViews: Record<string, NodeViewConstructor>; registry: PmModePartRegistry; flush(): void } {
	const live = new Set<HTMLElement>();
	let created = false;
	const make = (type: PmModePartType): NodeViewConstructor => (node, view) => {
		const frame = frameFor(type, node, view);
		const name = `tg-part-${++nextSlot}`;
		const slot = frame.ownerDocument.createElement("slot");
		slot.name = name;
		frame.appendChild(slot);
		const part = frame.ownerDocument.createElement("tategaki-pm-part");
		part.slot = name;
		part.dataset.partType = type;
		host.appendChild(part);
		live.add(part);
		let current = node, destroyed = false;
		const handle = renderer.render({ type, node }, part, frame);
		created = true;
		const nodeView: NodeView = {
			dom: frame,
			// An equal node (the same content) keeps the part; anything else makes a new nodeView.
			update: next => {
				if (next.type !== current.type || !next.eq(current)) return false;
				current = next;
				return true;
			},
			ignoreMutation: () => true,
			destroy: () => {
				if (destroyed) return;
				destroyed = true;
				handle?.destroy();
				part.remove();
				live.delete(part);
			},
		};
		return nodeView;
	};
	return {
		nodeViews: { widget: make("widget"), inlineMath: make("inlineMath"), frontmatter: make("frontmatter") },
		registry: { get size() { return live.size; }, parts: () => [...live] },
		flush: () => {
			if (!created) return;
			created = false;
			renderer.afterUpdate?.();
		},
	};
}
