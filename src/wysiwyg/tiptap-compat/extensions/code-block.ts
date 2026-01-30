import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "lowlight";

export const CodeBlockExtension = CodeBlockLowlight.configure({
	lowlight,
	HTMLAttributes: {
		class: "tategaki-code-block",
	},
	languageClassPrefix: "language-",
});

