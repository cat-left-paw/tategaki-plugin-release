import { Fragment, type Mark, type PMNode } from "./prosemirror";
import type { NodeInterner } from "./doc-builder";

/**
 * A node's structural hash (M1-3 review R2). It covers exactly what `Node.eq` compares (type,
 * attrs, marks, and text or children), so equal nodes always share a hash. Nodes are immutable,
 * so a node's hash is computed once and cached on the object.
 */
const hashes = new WeakMap<PMNode, number>();
const markHashes = new WeakMap<Mark, number>();

function mixString(hash: number, text: string): number {
	for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
	return Math.imul(hash ^ text.length, 16777619);
}
/** JSON with sorted keys: equal for values that PM's `compareDeep` (attrs) considers equal. */
function stableKey(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "u";
	if (Array.isArray(value)) return "[" + value.map(stableKey).join(",") + "]";
	const record = value as Record<string, unknown>;
	return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + stableKey(record[key])).join(",") + "}";
}
/**
 * Attrs into the hash. PM builds an attrs object from its type's spec, so the top-level keys of
 * two nodes of one type come in the same order; only nested plain objects (a line's dataset and
 * style variables) are written with sorted keys.
 */
function mixAttrs(hash: number, attrs: Record<string, unknown>): number {
	for (const name in attrs) {
		const value = attrs[name];
		hash = mixString(hash, name);
		hash = mixString(hash, value !== null && typeof value === "object" && !Array.isArray(value) ? stableKey(value) : JSON.stringify(value) ?? "u");
	}
	return hash;
}
function markHash(mark: Mark): number {
	let hash = markHashes.get(mark);
	if (hash === undefined) markHashes.set(mark, hash = mixAttrs(mixString(2166136261, mark.type.name), mark.attrs));
	return hash;
}

export function nodeHash(node: PMNode): number {
	const cached = hashes.get(node);
	if (cached !== undefined) return cached;
	let hash = mixAttrs(mixString(2166136261, node.type.name), node.attrs);
	for (const mark of node.marks) hash = Math.imul(hash ^ markHash(mark), 16777619);
	if (node.isText) hash = mixString(hash, node.text ?? "");
	else node.forEach(child => { hash = Math.imul(hash ^ nodeHash(child), 16777619); });
	hash >>>= 0;
	hashes.set(node, hash);
	return hash;
}

/** Cheap key: equal nodes share it (type, child count and text are part of what `eq` compares). */
const cheapKey = (node: PMNode) => node.type.name + "\u0000" + node.childCount + "\u0000" + node.textContent;
/** A bucket larger than this also indexes its nodes by structural hash (review R2). */
const HASHED_BUCKET = 16;
interface Bucket { nodes: PMNode[]; byHash: Map<number, PMNode[]> | null }

/**
 * Nodes in the order they were added, found by a cheap key and, in a large bucket of nodes with
 * the same text but different attrs or marks, by structural hash, so matching stays linear.
 * `canonical` returns the first added node equal to the given one; otherwise it canonicalizes the
 * children the same way (so a changed Ruby keeps its equal old text), adds the result, and
 * returns it. The descendants of nodes added with `addDeep` are indexed only when a child is
 * first looked up, and always before any new child is added, so an old object is preferred.
 */
export class NodeIndex implements NodeInterner {
	private readonly buckets = new Map<string, Bucket>();
	private readonly added = new Set<PMNode>();
	private pendingDeep: PMNode[] = [];
	add(node: PMNode): void {
		if (this.added.has(node)) return;
		this.added.add(node);
		const key = cheapKey(node);
		let bucket = this.buckets.get(key);
		if (!bucket) this.buckets.set(key, bucket = { nodes: [], byHash: null });
		bucket.nodes.push(node);
		if (bucket.byHash) pushHashed(bucket.byHash, node);
		else if (bucket.nodes.length > HASHED_BUCKET) {
			bucket.byHash = new Map();
			for (const other of bucket.nodes) pushHashed(bucket.byHash, other);
		}
	}
	/** Adds a node; its descendants (in document order) are added when first needed. */
	addDeep(node: PMNode): void {
		this.add(node);
		if (node.childCount) this.pendingDeep.push(node);
	}
	find(node: PMNode): PMNode | undefined {
		const bucket = this.buckets.get(cheapKey(node));
		if (!bucket) return undefined;
		const candidates = bucket.byHash ? bucket.byHash.get(nodeHash(node)) : bucket.nodes;
		return candidates?.find(other => other === node || other.eq(node));
	}
	canonical(node: PMNode): PMNode {
		const found = this.find(node);
		if (found) return found;
		if (node.childCount) {
			this.flushDeep();
			const children: PMNode[] = [];
			let changed = false;
			node.forEach(child => {
				const canonicalChild = this.canonical(child);
				if (canonicalChild !== child) changed = true;
				children.push(canonicalChild);
			});
			if (changed) node = node.copy(Fragment.fromArray(children));
		}
		this.add(node);
		return node;
	}
	intern(node: PMNode): PMNode { return this.canonical(node); }
	private flushDeep(): void {
		if (!this.pendingDeep.length) return;
		const pending = this.pendingDeep;
		this.pendingDeep = [];
		for (const node of pending) node.descendants(child => { this.add(child); });
	}
}
function pushHashed(map: Map<number, PMNode[]>, node: PMNode): void {
	const hash = nodeHash(node), list = map.get(hash);
	if (list) list.push(node); else map.set(hash, [node]);
}
