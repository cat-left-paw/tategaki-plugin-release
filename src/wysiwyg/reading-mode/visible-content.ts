const MEANINGFUL_NON_TEXT_SELECTOR =
	"img, hr, iframe, video, audio, canvas, svg, embed, object";
const INVISIBLE_TEXT_CHARS = new Set([
	"\u3000",
	"\u00A0",
	"\u200B",
	"\u200C",
	"\u200D",
	"\u2060",
	"\uFEFF",
]);

export function hasVisibleText(text: string | null | undefined): boolean {
	if (!text) {
		return false;
	}

	for (const char of text) {
		if (char.trim() !== "" && !INVISIBLE_TEXT_CHARS.has(char)) {
			return true;
		}
	}

	return false;
}

export function isMeaningfulNonTextElement(element: Element): boolean {
	return element.matches(MEANINGFUL_NON_TEXT_SELECTOR);
}

export function nodeHasVisibleContent(node: Node | null | undefined): boolean {
	if (!node) {
		return false;
	}

	if (node.nodeType === Node.TEXT_NODE) {
		return hasVisibleText(node.textContent);
	}

	if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
		return false;
	}

	if (
		node.nodeType === Node.ELEMENT_NODE &&
		isMeaningfulNonTextElement(node as Element)
	) {
		return true;
	}

	for (const child of Array.from(node.childNodes)) {
		if (nodeHasVisibleContent(child)) {
			return true;
		}
	}

	return false;
}

export function htmlHasVisibleContent(
	html: string,
	doc: Document
): boolean {
	const test = doc.createElement("div");
	test.innerHTML = html;
	return nodeHasVisibleContent(test);
}

export function pruneInvisibleNodes(node: Node): boolean {
	if (node.nodeType === Node.TEXT_NODE) {
		return hasVisibleText(node.textContent);
	}

	if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
		return false;
	}

	if (
		node.nodeType === Node.ELEMENT_NODE &&
		isMeaningfulNonTextElement(node as Element)
	) {
		return true;
	}

	let hasVisibleChild = false;
	for (const child of Array.from(node.childNodes)) {
		if (pruneInvisibleNodes(child)) {
			hasVisibleChild = true;
			continue;
		}
		node.removeChild(child);
	}

	return hasVisibleChild;
}

export function cloneNodeWithVisibleContent(node: Node): Node | null {
	const clone = node.cloneNode(true);
	return pruneInvisibleNodes(clone) ? clone : null;
}
