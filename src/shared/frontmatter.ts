/**
 * フロントマター表示用データ型
 * （sot-wysiwyg-view-frontmatter.ts の FrontmatterData と同一構造）
 */
export interface FrontmatterData {
	title?: string;
	subtitle?: string;
	original_title?: string;
	author?: string;
	translator?: string;
	co_authors?: string[];
	co_translators?: string[];
}

/** フロントマター正規表現 */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n/;

/**
 * Obsidian の parseYaml を動的に取得する。
 * ts-node テスト環境では obsidian モジュールが存在しないため、
 * require に失敗した場合は null を返す。
 */
function getObsidianParseYaml(): ((yaml: string) => unknown) | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const obs = require("obsidian") as Record<string, unknown>;
		const fn = obs.parseYaml;
		return typeof fn === "function"
			? (fn as (yaml: string) => unknown)
			: null;
	} catch {
		return null;
	}
}

/**
 * unknown 値を表示用文字列に変換する。
 * null / undefined はそのまま undefined を返す。
 */
function toDisplayString(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "string") return value;
	return String(value);
}

/**
 * unknown 値を表示用 string[] に変換する。
 * YAML inline array, block array, カンマ区切り文字列の各形式に対応する。
 */
function toDisplayStringArray(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		const items = value
			.map((item) => toDisplayString(item))
			.filter((s): s is string => s !== undefined && s.length > 0);
		return items.length > 0 ? items : undefined;
	}
	if (typeof value === "string" && value.length > 0) {
		const items = value
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		return items.length > 0 ? items : undefined;
	}
	return undefined;
}

/**
 * parseYaml の結果オブジェクトから FrontmatterData を組み立てる。
 * テストから直接呼び出せるよう export する。
 */
export function normalizeParsed(parsed: unknown): FrontmatterData | null {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const obj = parsed as Record<string, unknown>;
	const data: FrontmatterData = {};

	const title = toDisplayString(obj.title);
	if (title !== undefined) data.title = title;

	const subtitle = toDisplayString(obj.subtitle);
	if (subtitle !== undefined) data.subtitle = subtitle;

	const original_title = toDisplayString(obj.original_title);
	if (original_title !== undefined) data.original_title = original_title;

	const author = toDisplayString(obj.author);
	if (author !== undefined) data.author = author;

	const translator = toDisplayString(obj.translator);
	if (translator !== undefined) data.translator = translator;

	const co_authors = toDisplayStringArray(obj.co_authors);
	if (co_authors !== undefined) data.co_authors = co_authors;

	const co_translators = toDisplayStringArray(obj.co_translators);
	if (co_translators !== undefined) data.co_translators = co_translators;

	return Object.keys(data).length > 0 ? data : null;
}

/**
 * Markdown コンテンツからフロントマターブロックを抽出し、
 * parseYaml を使って FrontmatterData へ正規化して返す。
 *
 * - quoted scalar (title: "..." / title: '...')
 * - inline array (co_authors: ["甲", "乙"])
 * - block array (co_authors:\n  - 甲\n  - 乙)
 * - block scalar (|, >, |-, >-)
 * - YAML 解釈失敗時はフォールバックとして null を返す（クラッシュしない）
 */
export function parseFrontmatterBlock(content: string): {
	frontmatter: FrontmatterData | null;
	contentWithoutFrontmatter: string;
} {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		return { frontmatter: null, contentWithoutFrontmatter: content };
	}

	const yamlContent = match[1];
	const contentWithoutFrontmatter = content.slice(match[0].length);

	const parseYaml = getObsidianParseYaml();
	if (!parseYaml) {
		return { frontmatter: null, contentWithoutFrontmatter };
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(yamlContent);
	} catch {
		return { frontmatter: null, contentWithoutFrontmatter };
	}

	return {
		frontmatter: normalizeParsed(parsed),
		contentWithoutFrontmatter,
	};
}
