// Reference: src/pm-mode-spike/composedTree.ts (S1b, 2026-10-16). No import from the spike.
// Local changes: only what the input surface needs (the origin of an event, the selection of a root,
//   the composed ancestors).

/** A document or a shadow root (they have `activeElement`; a shadow root has `getSelection` in Chromium). */
export type ViewRoot = Document | ShadowRoot;
type SelectionRoot = ViewRoot & { getSelection?: () => Selection | null };

/**
 * The element an event came from. In a shadow tree `event.target` is the shadow host for listeners outside
 * it; the first entry of the composed path is the element itself (an open shadow root).
 */
export function eventOrigin(event: Event): EventTarget | null {
	const path = typeof event.composedPath === "function" ? event.composedPath() : [];
	return path.length > 0 ? (path[0] ?? null) : event.target;
}

/** A popout window is another realm: `instanceof Element` would fail, so look at `nodeType`. */
export function asElement(target: EventTarget | null): Element | null {
	return target && (target as Node).nodeType === 1 ? (target as Element) : null;
}

/** The selection of the root. A shadow root's `getSelection()` (Chromium) returns the nodes inside it as they are. */
export function selectionOf(root: ViewRoot): Selection | null {
	const holder = root as SelectionRoot;
	if (typeof holder.getSelection === "function") return holder.getSelection();
	return root.nodeType === 9 ? (root as Document).getSelection() : (root as ShadowRoot).host.ownerDocument.getSelection();
}

/** The parent of a node, going from a shadow root to its host. */
export function composedParent(node: Node): Node | null {
	const parent = node.parentNode;
	if (!parent) return null;
	const host = (parent as ShadowRoot).host;
	return parent.nodeType === 11 && host ? host : parent;
}

/** `ancestor.contains(node)` across shadow boundaries. */
export function containsComposed(ancestor: Node, node: Node | null): boolean {
	for (let current: Node | null = node; current; current = composedParent(current)) if (current === ancestor) return true;
	return false;
}

/** The element ancestors of `element`, across shadow boundaries, nearest first. */
export function composedElementAncestors(element: Element): Element[] {
	const out: Element[] = [];
	for (let node = composedParent(element); node; node = composedParent(node)) if (node.nodeType === 1) out.push(node as Element);
	return out;
}
