/**
 * 書籍モード：本文と章扉のセグメント分割
 *
 * `data-tategaki-title-page="true"` 属性が付いた見出しを基準に、
 * コンテンツ HTML を「本文セグメント」と「章扉セグメント」に分割する。
 *
 * これにより、ページネーション前に章扉を分離し、
 * MeasuredPagination には本文セグメントだけを流すことで
 * 後処理なしで最終ページ列を組み立てられる。
 */

import { htmlHasVisibleContent } from "./visible-content";

export interface BodySegment {
	kind: "body";
	html: string;
}

export interface TitlePageSegment {
	kind: "title-page";
	headingTag: string; // "h1", "h2", etc.
	headingInnerHtml: string;
}

export type BookPageSegment = BodySegment | TitlePageSegment;

interface BodyNodePart {
	kind: "body-node";
	node: Node;
}

type NodeSplitPart = BodyNodePart | TitlePageSegment;

/**
 * HTML 文字列を章扉見出しの位置で分割する。
 *
 * @param contentHtml - 見出しに `data-tategaki-title-page="true"` が付いた HTML
 * @param doc - Document（DOM パースに使用）
 * @returns セグメント配列。章扉見出しがない場合は本文1セグメントのみ。
 */
export function splitIntoBookSegments(
	contentHtml: string,
	doc: Document
): BookPageSegment[] {
	const temp = doc.createElement("div");
	temp.innerHTML = contentHtml;

	// 章扉対象の見出しを検出
	const titleHeadings = temp.querySelectorAll<HTMLElement>(
		"[data-tategaki-title-page='true']"
	);

	if (titleHeadings.length === 0) {
		// 章扉見出しがない → 全体を1つの本文セグメントとして返す
		return [{ kind: "body", html: contentHtml }];
	}

	const segments: BookPageSegment[] = [];

	// 見出しの直接の親コンテナ（通常は temp 自体、
	// もしくは .tiptap.ProseMirror のようなラッパー）を特定
	// すべての見出しの直近の共通祖先の子ノードレベルで分割する
	const container = findCommonContainer(titleHeadings, temp);

	// container の子ノードを順に走査し、
	// 章扉見出し（またはそれを含む子ノード）に当たったら分割
	let currentBodyNodes: Node[] = [];

	const childNodes = Array.from(container.childNodes);
	for (const child of childNodes) {
		const parts = splitNodeIntoParts(child);
		for (const part of parts) {
			if (part.kind === "title-page") {
				// 溜まった本文ノードをフラッシュ
				flushBody(segments, currentBodyNodes, doc, container, temp);
				currentBodyNodes = [];
				segments.push(part);
				continue;
			}
			currentBodyNodes.push(part.node);
		}
	}

	// 残りをフラッシュ
	flushBody(segments, currentBodyNodes, doc, container, temp);

	return normalizeConsecutiveTitlePageSegments(segments, doc);
}

/**
 * 連続する章扉の間に挟まった見た目上空の body segment を落とす。
 * 編集時の空行は保持しつつ、書籍モードの title-page 専用ルールとして
 * `title-page -> empty body -> title-page` を畳む。
 */
export function normalizeConsecutiveTitlePageSegments(
	segments: BookPageSegment[],
	doc: Document
): BookPageSegment[] {
	if (segments.length < 3) {
		return segments;
	}

	return segments.filter((segment, index) => {
		return !isCollapsibleTitlePageSpacer(segments, index, doc);
	});
}

/**
 * 溜まった本文ノードをセグメントとしてフラッシュする
 */
function flushBody(
	segments: BookPageSegment[],
	nodes: Node[],
	doc: Document,
	container: HTMLElement,
	outerTemp: HTMLElement
): void {
	if (nodes.length === 0) return;

	// ノードをフィルタリングせずそのままシリアライズする。
	// 空行（空の <p> 等）は本文中の行間として意味があるため保持する。
	// 章扉間の空セグメントは normalizeConsecutiveTitlePageSegments で除去される。
	const wrapper = rebuildWrapper(doc, container, outerTemp);
	for (const n of nodes) {
		wrapper.appendChild(n);
	}
	const html = getOuterHtml(wrapper, doc, container, outerTemp);
	if (html.trim() === "") return;

	segments.push({ kind: "body", html });
}

function isCollapsibleTitlePageSpacer(
	segments: BookPageSegment[],
	index: number,
	doc: Document
): boolean {
	const segment = segments[index];
	if (segment?.kind !== "body") {
		return false;
	}

	if (htmlHasVisibleContent(segment.html, doc)) {
		return false;
	}

	return (
		hasAdjacentTitlePage(segments, index, -1, doc) &&
		hasAdjacentTitlePage(segments, index, 1, doc)
	);
}

function hasAdjacentTitlePage(
	segments: BookPageSegment[],
	startIndex: number,
	direction: -1 | 1,
	doc: Document
): boolean {
	for (
		let index = startIndex + direction;
		index >= 0 && index < segments.length;
		index += direction
	) {
		const segment = segments[index];
		if (segment.kind === "title-page") {
			return true;
		}
		if (htmlHasVisibleContent(segment.html, doc)) {
			return false;
		}
	}

	return false;
}

function splitNodeIntoParts(node: Node): NodeSplitPart[] {
	if (node.nodeType === Node.TEXT_NODE) {
		// テキストノードはそのままクローンして返す（空白も行間として保持）
		return [{ kind: "body-node", node: node.cloneNode(true) }];
	}

	if (node.nodeType !== Node.ELEMENT_NODE) {
		return [];
	}

	const element = node as HTMLElement;
	if (element.getAttribute("data-tategaki-title-page") === "true") {
		return [
			{
				kind: "title-page",
				headingTag: element.tagName.toLowerCase(),
				headingInnerHtml: element.innerHTML,
			},
		];
	}

	if (
		!element.querySelector("[data-tategaki-title-page='true']")
	) {
		// 章扉見出しを含まないノードはそのままクローンして返す。
		// 空の <p><br></p> も行間として意味があるため保持する。
		return [{ kind: "body-node", node: element.cloneNode(true) }];
	}

	// 章扉見出しを含むノードは、子ノードを再帰的に分割する
	const parts: NodeSplitPart[] = [];
	let wrapper = cloneElementShallow(element);

	for (const child of Array.from(element.childNodes)) {
		const childParts = splitNodeIntoParts(child);
		for (const part of childParts) {
			if (part.kind === "body-node") {
				wrapper.appendChild(part.node);
				continue;
			}

			pushBodyWrapperPart(parts, wrapper);
			parts.push(part);
			wrapper = cloneElementShallow(element);
		}
	}

	pushBodyWrapperPart(parts, wrapper);
	return parts;
}

function pushBodyWrapperPart(parts: NodeSplitPart[], wrapper: HTMLElement): void {
	// 空ラッパーでもそのまま追加する。
	// 章扉間の空セグメントは normalizeConsecutiveTitlePageSegments で除去される。
	if (wrapper.childNodes.length === 0) {
		return;
	}

	parts.push({
		kind: "body-node",
		node: wrapper,
	});
}

function cloneElementShallow(element: HTMLElement): HTMLElement {
	return element.cloneNode(false) as HTMLElement;
}

/**
 * container から outerTemp までのラッパー構造を再構築する
 * （例: <div class="tategaki-reading-view-snapshot"><div class="tiptap ProseMirror">...</div></div>）
 */
function rebuildWrapper(
	doc: Document,
	container: HTMLElement,
	outerTemp: HTMLElement
): HTMLElement {
	if (container === outerTemp) {
		return doc.createElement("div");
	}

	// container → outerTemp までの祖先チェーンを構築
	const chain: HTMLElement[] = [];
	let current: HTMLElement | null = container;
	while (current && current !== outerTemp) {
		chain.unshift(current);
		current = current.parentElement;
	}

	// チェーンに沿ってクローン構造を作る
	let outerWrapper: HTMLElement | null = null;
	let innerWrapper: HTMLElement | null = null;
	for (const ancestor of chain) {
		const clone = doc.createElement(ancestor.tagName.toLowerCase());
		// クラスと属性をコピー
		for (const attr of Array.from(ancestor.attributes)) {
			clone.setAttribute(attr.name, attr.value);
		}
		if (!outerWrapper) {
			outerWrapper = clone;
		}
		if (innerWrapper) {
			innerWrapper.appendChild(clone);
		}
		innerWrapper = clone;
	}

	return innerWrapper ?? doc.createElement("div");
}

/**
 * ラッパーの HTML をシリアライズ
 */
function getOuterHtml(
	wrapper: HTMLElement,
	doc: Document,
	container: HTMLElement,
	outerTemp: HTMLElement
): string {
	if (container === outerTemp) {
		return wrapper.innerHTML;
	}

	// outerTemp レベルまでのラッパーを含めてシリアライズ
	let root: HTMLElement = wrapper;
	while (root.parentElement) {
		root = root.parentElement;
	}
	// outerTemp 相当のラッパーでさらに包む
	const outerClone = doc.createElement("div");
	for (const attr of Array.from(outerTemp.attributes)) {
		outerClone.setAttribute(attr.name, attr.value);
	}
	outerClone.appendChild(root);
	return outerClone.innerHTML;
}

/**
 * 章扉見出しの共通コンテナを探す
 * 見出しが直接の子であるコンテナ（通常は .tiptap.ProseMirror）
 */
function findCommonContainer(
	headings: NodeListOf<HTMLElement>,
	root: HTMLElement
): HTMLElement {
	if (headings.length === 0) return root;
	// 最初の見出しの親を取得
	const firstParent = headings[0].parentElement;
	if (!firstParent || firstParent === root) return root;

	// すべての見出しが同じ親を持つか確認
	let allSameParent = true;
	for (let i = 1; i < headings.length; i++) {
		if (headings[i].parentElement !== firstParent) {
			allSameParent = false;
			break;
		}
	}

	return allSameParent ? firstParent : root;
}
