/**
 * TipTap 互換モード 見出し折りたたみ Extension
 *
 * createHeadingFoldPlugin を TipTap Extension として公開し、
 * toggleHeadingFold / clearHeadingFolds コマンドを提供する。
 * ロジック本体は heading-fold.ts に集約している。
 */

import { Extension } from "@tiptap/core";
import {
	createHeadingFoldPlugin,
	headingFoldPluginKey,
} from "../heading-fold";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		headingFold: {
			/**
			 * 指定 position の見出しの折りたたみをトグルする。
			 * pos は doc.forEach の offset（= ProseMirror doc 内の absolute offset）。
			 */
			toggleHeadingFold: (headingPos: number) => ReturnType;
			/** すべての折りたたみを解除する */
			clearHeadingFolds: () => ReturnType;
		};
	}
}

export const HeadingFoldExtension = Extension.create({
	name: "headingFold",

	addProseMirrorPlugins() {
		return [createHeadingFoldPlugin()];
	},

	addCommands() {
		return {
			toggleHeadingFold:
				(headingPos: number) =>
				({ tr, dispatch }) => {
					if (dispatch) {
						tr.setMeta(headingFoldPluginKey, {
							type: "toggle",
							pos: headingPos,
						});
						dispatch(tr);
					}
					return true;
				},

			clearHeadingFolds:
				() =>
				({ tr, dispatch }) => {
					if (dispatch) {
						tr.setMeta(headingFoldPluginKey, { type: "clear" });
						dispatch(tr);
					}
					return true;
				},
		};
	},
});
