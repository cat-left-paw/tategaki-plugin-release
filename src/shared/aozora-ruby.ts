/**
 * 青空文庫形式（｜本文《ルビ》）のルビ変換ユーティリティ
 * japanese-novel-ruby と同等の正規表現を用いて互換性を確保する
 */

const AOZORA_START_MARK = "《";
const AOZORA_END_MARK = "》";
const RUBY_TAG_REGEX = /<ruby\b[^>]*>[\s\S]*?<\/ruby>/gi;
const HTML_ENTITY_MAP: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&nbsp;": " ",
};

const hasDocument = typeof document !== "undefined";

/**
 * japanese-novel-ruby と同等のルビ検出用正規表現を生成
 */
export function createAozoraRubyRegExp(
	start = AOZORA_START_MARK,
	end = AOZORA_END_MARK
): RegExp {
	const escapedStart = escapeRegExp(start);
	const escapedEnd = escapeRegExp(end);
	return new RegExp(
		`(?:(?:[|\\uFF5C]?(?<body1>[\\u4E00-\\u9FA0\\u3005]+?))|(?:[|\\uFF5C](?<body2>[^|\\uFF5C]+?)))${escapedStart}(?<ruby>.+?)${escapedEnd}`,
		"gm"
	);
}

/**
 * ルート要素以下のテキストノードから青空文庫形式のルビを `<ruby>` 要素へ変換
 * @returns DOMが更新された場合に true
 */
export function applyAozoraRubyToElement(root: HTMLElement): boolean {
	if (!root || !hasDocument) {
		return false;
	}

	const textNodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let currentNode = walker.nextNode();
	while (currentNode) {
		if (currentNode instanceof Text) {
			textNodes.push(currentNode);
		}
		currentNode = walker.nextNode();
	}

	if (textNodes.length === 0) {
		return false;
	}

	let updated = false;
	const regex = createAozoraRubyRegExp();

	for (const textNode of textNodes) {
		if (!textNode.parentElement) continue;
		if (isInsideIgnoredElement(textNode, root)) continue;

		const textContent = textNode.textContent;
		if (!textContent) continue;

		const matches = Array.from(textContent.matchAll(regex));
		if (matches.length === 0) continue;

		let workingNode: Text = textNode;

		for (const match of matches) {
			const groups = match.groups ?? {};
			const base = groups.body2 ?? groups.body1 ?? "";
			const ruby = groups.ruby ?? "";
			const fullMatch = match[0];

			if (!base || !ruby || !workingNode.textContent) {
				continue;
			}

			const index = workingNode.textContent.indexOf(fullMatch);
			if (index === -1) {
				continue;
			}

			const beforeNode = workingNode.splitText(index);
			const afterNode = beforeNode.splitText(fullMatch.length);

			const rubyEl = workingNode.ownerDocument?.createElement("ruby") ?? document.createElement("ruby");
			rubyEl.textContent = "";
			const baseNode = workingNode.ownerDocument?.createTextNode(base) ?? document.createTextNode(base);
			rubyEl.appendChild(baseNode);

			const rtEl = workingNode.ownerDocument?.createElement("rt") ?? document.createElement("rt");
			rtEl.textContent = ruby;
			rubyEl.appendChild(rtEl);

			beforeNode.replaceWith(rubyEl);
			workingNode = afterNode;
			updated = true;
		}
	}

	return updated;
}

/**
 * HTML文字列内の青空文庫形式ルビを `<ruby>` へ変換
 */
export function convertAozoraRubySyntaxToHtml(html: string): string {
	if (!html) return html;

	if (hasDocument) {
		const container = document.createElement("div");
		container.innerHTML = html;
		applyAozoraRubyToElement(container);
		return container.innerHTML;
	}

	return html.replace(createAozoraRubyRegExp(), (_match, ...args) => {
		const groups = (args[args.length - 1] as RegExpMatchArray["groups"]) ?? {};
		const body = groups.body2 ?? groups.body1 ?? "";
		const ruby = groups.ruby ?? "";
		if (!body || !ruby) {
			return _match;
		}
		return `<ruby>${body}<rt>${ruby}</rt></ruby>`;
	});
}

export interface ConvertRubyOptions {
	addDelimiter?: boolean; // trueなら先頭に「｜」を付与する（デフォルトtrue）
}

/**
 * HTML文字列内の `<ruby>` 要素を青空文庫形式へ変換
 */
export function convertRubyElementsToAozora(
	html: string,
	options: ConvertRubyOptions = {}
): string {
	if (!html) return html;

	const addDelimiter = options.addDelimiter ?? true;

	if (hasDocument) {
		const container = document.createElement("div");
		container.innerHTML = html;
		const rubies = Array.from(container.querySelectorAll("ruby"));
		for (const rubyEl of rubies) {
			const replacement = rubyElementToAozora(rubyEl, addDelimiter);
			const textNode =
				container.ownerDocument?.createTextNode(replacement) ??
				document.createTextNode(replacement);
			rubyEl.replaceWith(textNode);
		}
		return container.innerHTML;
	}

	return html.replace(RUBY_TAG_REGEX, (match) =>
		rubyElementHtmlToAozora(match, addDelimiter)
	);
}

function rubyElementToAozora(
	rubyEl: Element,
	addDelimiter: boolean
): string {
	const rtEl = rubyEl.querySelector("rt");
	if (!rtEl) {
		return rubyEl.outerHTML;
	}

	const rubyText = decodeHtmlEntities(rtEl.textContent ?? "").trim();
	const baseFragments: string[] = [];

	rubyEl.childNodes.forEach((node) => {
		if (node === rtEl) return;
		if (node.nodeType === Node.ELEMENT_NODE) {
			const tagName = (node as HTMLElement).tagName;
			if (tagName === "RT" || tagName === "RP") {
				return;
			}
		}
		baseFragments.push(node.textContent ?? "");
	});

	const baseRaw = decodeHtmlEntities(baseFragments.join(""));
	const baseNormalized = baseRaw.replace(/\u00A0/g, " ").trim();
	if (!baseNormalized) {
		return rubyEl.outerHTML;
	}

	// addDelimiter=false の場合は元テキストに追加の「｜」を付けない
	const delimiter = addDelimiter ? "｜" : "";
	return `${delimiter}${baseNormalized}《${rubyText}》`;
}

function rubyElementHtmlToAozora(
	html: string,
	addDelimiter: boolean
): string {
	const match = html.match(/^<ruby\b[^>]*>([\s\S]*?)<\/ruby>$/i);
	if (!match) {
		return html;
	}
	const inner = match[1] ?? "";
	const rtMatch = inner.match(/<rt[^>]*>([\s\S]*?)<\/rt>/i);
	if (!rtMatch) {
		return html;
	}

	const rubyText = decodeHtmlEntities(rtMatch[1] ?? "").trim();
	const baseHtml = inner.replace(rtMatch[0], "");
	const baseWithoutTags = decodeHtmlEntities(stripTags(baseHtml)).replace(/\u00A0/g, " ").trim();
	if (!baseWithoutTags) {
		return html;
	}

	const delimiter = addDelimiter ? "｜" : "";
	return `${delimiter}${baseWithoutTags}《${rubyText}》`;
}

function stripTags(text: string): string {
	return text.replace(/<[^>]*?>/g, "");
}

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(input: string): string {
	return input.replace(/&[a-zA-Z#0-9]+;/g, (entity) => HTML_ENTITY_MAP[entity] ?? entity);
}

function isInsideIgnoredElement(node: Node, root: Node): boolean {
	let current: Node | null = node.parentNode;
	while (current && current !== root) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const tagName = (current as HTMLElement).tagName;
			if (
				tagName === "CODE" ||
				tagName === "PRE" ||
				tagName === "RUBY" ||
				tagName === "SCRIPT" ||
				tagName === "STYLE" ||
				tagName === "TEXTAREA"
			) {
				return true;
			}
		}
		current = current.parentNode;
	}
	return false;
}
