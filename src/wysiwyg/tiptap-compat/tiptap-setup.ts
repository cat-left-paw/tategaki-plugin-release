import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import { Slice } from "@tiptap/pm/model";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import Blockquote from "@tiptap/extension-blockquote";
import Code from "@tiptap/extension-code";
import Strike from "@tiptap/extension-strike";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { TategakiV2Settings, WritingMode } from "../../types/settings";
import { DisableShortcuts } from "./extensions/disable-shortcuts";
import { VerticalArrowKeys } from "./extensions/vertical-arrow-keys";
import { ListItemMove } from "./extensions/list-item-move";
import { CodeBlockExtension } from "./extensions/code-block";
import { TategakiHorizontalRule } from "./extensions/tategaki-horizontal-rule";
import { VerticalWritingExtension } from "./extensions/vertical-writing";
import { HardBreakSerializer } from "./extensions/hard-break-serializer";
import SearchHighlightExtension from "./extensions/search-highlight";
import { AozoraRubyNode } from "./extensions/aozora-ruby";
import { ObsidianHighlightMark } from "./extensions/obsidian-highlight";
import { ExternalCursorExtension } from "./extensions/external-cursor";
import { SpanMark } from "./extensions/span-mark";
import {
	SmallMark,
	SubscriptMark,
	SuperscriptMark,
} from "./extensions/simple-inline-marks";
import { WbrNode } from "./extensions/wbr";
import { TategakiImage } from "./extensions/tategaki-image";
import {
	convertAozoraRubySyntaxToHtml,
	convertRubyElementsToAozora,
} from "../../shared/aozora-ruby";

export interface TategakiCompatEditorOptions {
	element: HTMLElement;
	settings: TategakiV2Settings;
	content?: string;
	onUpdate?: (editor: Editor) => void;
}

export function createTategakiCompatEditor(options: TategakiCompatEditorOptions): Editor {
	const { element, content = "", onUpdate, settings } = options;
	const initialMode: WritingMode = settings.common.writingMode;

	element.classList.add("tategaki-wysiwyg-editor");
	element.setAttribute("data-writing-mode", initialMode);
	element.setAttribute("lang", "ja");

	const editor = new Editor({
		element,
		extensions: [
			DisableShortcuts,
			VerticalArrowKeys.configure({
				isVertical: () => {
					const mode = element.getAttribute("data-writing-mode");
					return mode === "vertical-rl";
				},
			}),
			ListItemMove.configure({
				isVertical: () => {
					const mode = element.getAttribute("data-writing-mode");
					return mode === "vertical-rl";
				},
			}),
			SearchHighlightExtension,
			ExternalCursorExtension,
			SpanMark,
			SuperscriptMark,
			SubscriptMark,
			SmallMark,
			WbrNode,
			TategakiImage,

			Document,
			Paragraph,
			Text,
			ObsidianHighlightMark,
			AozoraRubyNode,
			Heading.configure({
				levels: [1, 2, 3, 4, 5, 6],
			}),
			Bold,
			Italic,
			Strike,
			Underline,
			BulletList,
			OrderedList,
			ListItem,
			Blockquote,
			Code,
			CodeBlockExtension,
			HardBreakSerializer,
			TategakiHorizontalRule,
			Link.configure({
				autolink: true,
				openOnClick: true,
				linkOnPaste: true,
				HTMLAttributes: {
					rel: "noopener noreferrer",
					target: "_blank",
				},
			}),
			VerticalWritingExtension.configure({
				defaultMode: initialMode,
				targetNodeTypes: ["paragraph", "heading"],
			}),
			StarterKit.configure({
				document: false,
				paragraph: false,
				text: false,
				heading: false,
				bold: false,
				italic: false,
				bulletList: false,
				orderedList: false,
				listItem: false,
				blockquote: false,
				code: false,
				hardBreak: false,
				strike: false,
				underline: false,
				horizontalRule: false,
				link: false,
				codeBlock: false,
			}),
		],
		content,
		editorProps: {
			handleDOMEvents: {
				copy: (_view, event) => {
					if (!(event instanceof ClipboardEvent)) return false;
					const selection = window.getSelection();
					if (!selection || selection.rangeCount === 0) return false;
					const range = selection.getRangeAt(0);
					const container = document.createElement("div");
					container.appendChild(range.cloneContents());

					// プレースホルダーbrタグとApple固有のbrタグを削除
					container
						.querySelectorAll("br[data-tategaki-placeholder]")
						.forEach((br) => br.remove());
					container
						.querySelectorAll("br.Apple-interchange-newline")
						.forEach((br) => br.remove());

					// 疑似ルビ（tategaki-aozora-ruby）をネイティブrubyに変換
					const pseudoRubies = Array.from(
						container.querySelectorAll<HTMLElement>(
							".tategaki-aozora-ruby"
						)
					);
					for (const wrapper of pseudoRubies) {
						const base = wrapper.querySelector<HTMLElement>(
							"span[data-aozora-base]"
						)?.textContent;
						const rtText = wrapper.querySelector<HTMLElement>(
							".tategaki-aozora-ruby-rt"
						)?.textContent;
						const hasDelimiter =
							wrapper.getAttribute("data-aozora-delimiter") ===
							"1";
						if (!base || !rtText) continue;

						const rubyEl =
							wrapper.ownerDocument?.createElement("ruby") ??
							document.createElement("ruby");
						rubyEl.setAttribute("data-aozora-ruby", "1");
						rubyEl.setAttribute(
							"data-aozora-delimiter",
							hasDelimiter ? "1" : "0"
						);
						const baseHolder =
							wrapper.ownerDocument?.createElement("span") ??
							document.createElement("span");
						baseHolder.setAttribute("data-aozora-base", "1");
						baseHolder.textContent = base;
						const rtEl =
							wrapper.ownerDocument?.createElement("rt") ??
							document.createElement("rt");
						rtEl.textContent = rtText;
						rubyEl.appendChild(baseHolder);
						rubyEl.appendChild(rtEl);
						wrapper.replaceWith(rubyEl);
					}

					const html = container.innerHTML;
					const aozora = convertRubyElementsToAozora(html, {
						addDelimiter: true,
					});

					if (!event.clipboardData) return false;
					event.preventDefault();
					event.clipboardData.setData("text/plain", aozora);
					event.clipboardData.setData("text/markdown", aozora);
					event.clipboardData.setData("text/html", html);
					return true;
				},
			},
			transformPastedHTML: (html: string) => {
				return convertAozoraRubySyntaxToHtml(html);
			},
			transformPastedText: (text: string) => {
				return convertAozoraRubySyntaxToHtml(text);
			},
			// ブロック間の改行が \n\n になるのを防ぎ、コピー元どおりの行構造を保つ
			clipboardTextSerializer: (slice: Slice): string => {
				return slice.content.textBetween(0, slice.content.size, "\n", "\n");
			},
		},
		onUpdate: ({ editor }) => {
			onUpdate?.(editor);
		},
	});

	editor.commands.setWritingMode(initialMode);

	return editor;
}
