import { InputRule, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";

export interface AozoraRubyAttributes {
	ruby: string;
	hasDelimiter: boolean;
}

const AOZORA_RUBY_INPUT_REGEX =
	/(?:(?:[|\uFF5C]?(?<body1>[\u4E00-\u9FA0\u3005]+?))|(?:[|\uFF5C](?<body2>[^|\uFF5C]+?)))《(?<ruby>.+?)》$/;

// ペースト時用のグローバルマッチ用正規表現
const AOZORA_RUBY_GLOBAL_REGEX =
	/(?:(?:[|\uFF5C]?(?<body1>[\u4E00-\u9FA0\u3005]+?))|(?:[|\uFF5C](?<body2>[^|\uFF5C]+?)))《(?<ruby>.+?)》/g;

export const AozoraRubyNode = Node.create({
	name: "aozoraRuby",

	inline: true,
	group: "inline",
	content: "text*",
	selectable: true,

	// onCreate と onUpdate を削除してペースト時と入力時のみ変換

	addAttributes() {
		return {
			ruby: {
				default: "",
			},
			hasDelimiter: {
				default: false,
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: "span.tategaki-aozora-ruby[data-aozora-ruby]",
				getAttrs: (element) => {
					if (!(element instanceof HTMLElement)) {
						return false;
					}

					const rubyText = element.querySelector(
						".tategaki-aozora-ruby-rt"
					)?.textContent;
					const ruby = rubyText ?? "";
					const hasDelimiter =
						element.getAttribute("data-aozora-delimiter") === "1";

					return {
						ruby,
						hasDelimiter,
					};
				},
				contentElement: (element) =>
					(element as HTMLElement).querySelector(
						"span[data-aozora-base]"
					) as HTMLElement,
			},
			{
				tag: "ruby[data-aozora-ruby]",
				getAttrs: (element) => {
					if (!(element instanceof HTMLElement)) {
						return false;
					}

					const rt = element.querySelector("rt");
					const ruby = rt?.textContent ?? "";
					const hasDelimiter =
						element.getAttribute("data-aozora-delimiter") === "1";

					return {
						ruby,
						hasDelimiter,
					};
				},
				contentElement: (element) =>
					(element as HTMLElement).querySelector(
						"span[data-aozora-base]"
					) as HTMLElement,
			},
			{
				tag: "ruby",
				getAttrs: (element) => {
					if (!(element instanceof HTMLElement)) {
						return false;
					}
					if (element.hasAttribute("data-aozora-ruby")) {
						return false;
					}

					const rt = element.querySelector("rt");
					const ruby = rt?.textContent ?? "";

					return {
						ruby,
						hasDelimiter: false,
					};
				},
				contentElement: (element) => {
					const rubyEl = element as HTMLElement;
					const baseHolder = rubyEl.ownerDocument?.createElement("span") ?? document.createElement("span");

					for (const child of Array.from(rubyEl.childNodes)) {
						if (child instanceof HTMLElement) {
							const tag = child.tagName.toUpperCase();
							if (tag === "RT" || tag === "RP") {
								continue;
							}
						}
						baseHolder.appendChild(child.cloneNode(true));
					}

					return baseHolder;
				},
			},
		];
	},

	renderHTML({ node }) {
		const attrs: Record<string, string> = {
			"data-aozora-ruby": "1",
			"data-aozora-delimiter": node.attrs.hasDelimiter ? "1" : "0",
		};

		return [
			"span",
			{
				...attrs,
				class: "tategaki-aozora-ruby",
			},
			["span", { "data-aozora-base": "1" }, 0],
			[
				"span",
				{
					class: "tategaki-aozora-ruby-rt",
					"data-pm-ignore": "true",
					contenteditable: "false",
					draggable: "false",
					"aria-hidden": "true",
				},
				node.attrs.ruby ?? "",
			],
		];
	},

	addInputRules() {
		return [
			new InputRule({
				find: AOZORA_RUBY_INPUT_REGEX,
				handler: ({ commands, match, range }) => {
					const groups = (match as any).groups as
						| Record<string, string | undefined>
						| undefined;

					const base = groups?.body2 ?? groups?.body1 ?? "";
					const ruby = groups?.ruby ?? "";
					if (!base || !ruby) {
						return null;
					}

					const hasDelimiter = /^[|\uFF5C]/.test(match[0] ?? "");
					commands.insertContentAt(range, {
						type: this.name,
						attrs: {
							ruby,
							hasDelimiter,
						},
						content: [
							{
								type: "text",
								text: base,
							},
						],
					});
					return null;
				},
			}),
		];
	},

	addProseMirrorPlugins() {
		const nodeType = this.type;

		// 再帰的にノードを処理する関数
		const transformNode = (node: any): any => {
			if (node.isText && node.text) {
				// テキストノードを処理
				const text = node.text;
				const matches = Array.from(text.matchAll(AOZORA_RUBY_GLOBAL_REGEX));

				if (matches.length === 0) {
					return node;
				}

				const newNodes: any[] = [];
				let lastIndex = 0;

				matches.forEach((match: RegExpMatchArray) => {
					const matchIndex = match.index ?? 0;

					// マッチ前のテキスト
					if (matchIndex > lastIndex) {
						const beforeText = text.slice(lastIndex, matchIndex);
						newNodes.push(
							nodeType.schema.text(beforeText, node.marks)
						);
					}

					// ルビノードを作成
					const groups = (match as any).groups as Record<string, string | undefined> | undefined;
					const base = groups?.body2 ?? groups?.body1 ?? "";
					const ruby = groups?.ruby ?? "";

					if (base && ruby) {
						const hasDelimiter = /^[|\uFF5C]/.test(match[0] ?? "");
						const rubyNode = nodeType.create(
							{
								ruby,
								hasDelimiter,
							},
							nodeType.schema.text(base)
						);
						newNodes.push(rubyNode);
					}

					lastIndex = matchIndex + match[0].length;
				});

				// マッチ後のテキスト
				if (lastIndex < text.length) {
					const afterText = text.slice(lastIndex);
					newNodes.push(
						nodeType.schema.text(afterText, node.marks)
					);
				}

				return newNodes;
			} else if (node.content && node.content.size > 0) {
				// コンテナノード（段落など）の子を再帰的に処理
				const newContent: any[] = [];
				node.content.forEach((child: any) => {
					const transformed = transformNode(child);
					if (Array.isArray(transformed)) {
						newContent.push(...transformed);
					} else {
						newContent.push(transformed);
					}
				});

				return node.copy(Fragment.from(newContent));
			}

			return node;
		};

		return [
			new Plugin({
				key: new PluginKey("aozoraRubyPaste"),
				props: {
					transformPasted: (slice) => {
						const newNodes: any[] = [];

						slice.content.forEach((node) => {
							const transformed = transformNode(node);
							if (Array.isArray(transformed)) {
								newNodes.push(...transformed);
							} else {
								newNodes.push(transformed);
							}
						});

						return new Slice(
							Fragment.from(newNodes),
							slice.openStart,
							slice.openEnd
						);
					},
					transformPastedText: (text) => {
						// プレーンテキストのペースト時も青空文庫形式を変換
						const result = text;
						const matches = Array.from(text.matchAll(AOZORA_RUBY_GLOBAL_REGEX));

						if (matches.length > 0) {
							// マッチがある場合は、そのままテキストとして返す
							// （transformPasted で処理される）
							return text;
						}

						return result;
					},
				},
			}),
		];
	},

	addStorage() {
		return {
			markdown: {
				serialize: (state: any, node: any) => {
					const base = node.textContent ?? "";
					const ruby = String(node.attrs?.ruby ?? "");
					if (!base || !ruby) {
						state.text(base || ruby || "", false);
						return;
					}

					const delimiter = node.attrs?.hasDelimiter ? "｜" : "";
					state.write(`${delimiter}${base}《${ruby}》`);
				},
			},
		};
	},
});
