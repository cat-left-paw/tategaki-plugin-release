/**
 * HTML 文字列の扱いを 1 か所に集める。
 *
 * - parseHtmlToInertContainer: 文字列を読んで組み直すだけの用途（変換・判定・ProseMirror への parse）。
 *   DOMParser の inert な文書で読むので script / event handler は動かず、画像も読み込まれない。
 * - setSanitizedHtml: 利用者の文書を画面に出す用途。Obsidian の sanitizeHTMLToDom を通す。
 */

/**
 * `div.innerHTML = html` と同じ木になるようにするための前置き。
 *
 * 前置きなしの DOMParser は、先頭の空白・コメントを落とし、先頭の style / meta / link / script などを
 * head へ移してしまう。`<!DOCTYPE html>` で標準モード（Obsidian の文書と同じ）にし、`<body>` まで書いて
 * 「in body」で読み始めることで、innerHTML（context が div）と同じ構文解析になる。
 *
 * 既知の違い（tests/playwright/html-parse-equivalence.spec.ts の KNOWN_DIFFERENCES）:
 * 全文書として読むため、`</body>` / `</html>` の直後のコメントは body に入らず消える。
 * また scripting が無効な文書として読むため、`<noscript>` の中身は文字列ではなく要素になる。
 */
const FRAGMENT_PARSE_PREFIX = "<!DOCTYPE html><html><head></head><body>";

function resolveDomParser(doc?: Document): typeof DOMParser | undefined {
	const target = doc ?? (typeof document !== "undefined" ? activeDocument : undefined);
	return (
		target?.defaultView?.DOMParser ??
		(typeof DOMParser !== "undefined" ? DOMParser : undefined)
	);
}

/**
 * inert な読み取りに使う DOMParser があるか。
 * 無い環境では、呼ぶ側は文字列だけで処理する前の素通しの道を使う。
 */
export function canParseHtmlInert(doc?: Document): boolean {
	return resolveDomParser(doc) !== undefined;
}

function createDomParser(doc: Document): DOMParser {
	const Parser = resolveDomParser(doc);
	if (!Parser) {
		throw new Error("DOMParser is not available");
	}
	return new Parser();
}

/**
 * HTML 文字列を inert に読み、`div` の子として返す。
 *
 * `const el = document.createElement("div"); el.innerHTML = html;` で得られる木と同じ子を持つ
 * （`el.innerHTML` で書き戻した文字列も同じ）。ただし上の「既知の違い」の入力を除く。
 * 返す div は DOMParser の文書に属し、画面には出ない。
 *
 * @param html 読む HTML 文字列
 * @param doc DOMParser を選ぶための文書（popout の window でもその window の DOMParser で読む）
 */
export function parseHtmlToInertContainer(
	html: string,
	doc: Document = activeDocument,
): HTMLDivElement {
	const parsed = createDomParser(doc).parseFromString(
		FRAGMENT_PARSE_PREFIX + html,
		"text/html",
	);
	const container = parsed.createElement("div");
	const source: Node = parsed.body ?? parsed.documentElement;
	while (source.firstChild) {
		container.appendChild(source.firstChild);
	}
	return container;
}

type SanitizeHtmlToDom = (html: string) => DocumentFragment;
type ObsidianModule = Record<string, unknown>;

/**
 * obsidian モジュールを動的に取得する。
 * ts-node / headless テスト環境では obsidian モジュールが存在しないため、
 * require に失敗した場合は null を返す（frontmatter.ts の parseYaml と同じ方式）。
 * require 自体が結果をキャッシュするので、ここでは持たない（試験が差し替えた module に追従する）。
 */
function getObsidianModule(): ObsidianModule | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires -- obsidian is loaded lazily because the module does not exist in the ts-node test environment
		return require("obsidian") as ObsidianModule;
	} catch {
		// obsidian is unavailable (headless tests only)
		return null;
	}
}

const URL_ATTRIBUTES = new Set([
	"href",
	"src",
	"xlink:href",
	"action",
	"formaction",
	"srcdoc",
]);

/**
 * 予備の道（obsidian はあるが sanitizeHTMLToDom が無い）で、最低限だけ落とす。
 * script 要素、`on*` 属性、`javascript:` の URL。ほかの要素・属性を残すかはここでは決めない。
 */
function dropMinimalUnsafeParts(root: Element): void {
	for (const script of Array.from(root.querySelectorAll("script"))) {
		script.remove();
	}
	for (const el of Array.from(root.querySelectorAll("*"))) {
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			if (name.startsWith("on")) {
				el.removeAttribute(attr.name);
				continue;
			}
			if (URL_ATTRIBUTES.has(name)) {
				// Browsers ignore tabs / newlines / control characters inside the scheme.
				let compact = "";
				for (const ch of attr.value) {
					if (ch.charCodeAt(0) > 0x20) compact += ch;
				}
				if (/^javascript:/i.test(compact)) {
					el.removeAttribute(attr.name);
				}
			}
		}
	}
}

/**
 * `el.innerHTML = html` の代わりに、sanitize した内容で子を置き換える。
 *
 * - Obsidian 上では Obsidian の sanitizeHTMLToDom を通す。
 * - obsidian モジュールそのものが無い環境（headless テストだけ）では、inert に読んだ木をそのまま入れる。
 * - モジュールはあるが sanitizeHTMLToDom が無い場合（想定外）は、inert に読んだ木から
 *   script 要素・`on*` 属性・`javascript:` の URL を落としてから入れる。
 */
export function setSanitizedHtml(el: Element, html: string): void {
	const obsidian = getObsidianModule();
	const sanitize = obsidian?.sanitizeHTMLToDom;
	if (typeof sanitize === "function") {
		el.replaceChildren((sanitize as SanitizeHtmlToDom)(html));
		return;
	}
	const doc = el.ownerDocument;
	const parsed = parseHtmlToInertContainer(html, doc);
	if (obsidian) {
		dropMinimalUnsafeParts(parsed);
	}
	const fragment = doc.createDocumentFragment();
	while (parsed.firstChild) {
		fragment.appendChild(parsed.firstChild);
	}
	el.replaceChildren(fragment);
}
