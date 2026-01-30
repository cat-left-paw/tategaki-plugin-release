import HardBreak from "@tiptap/extension-hard-break";

/**
 * HardBreakのカスタムシリアライザー
 *
 * デフォルトの`tiptap-markdown`は、HardBreakを`\`（バックスラッシュ）でシリアライズするが、
 * これは元のファイル形式を変更してしまう。
 *
 * このカスタム拡張は、HardBreakを単純な改行（`\n`）としてシリアライズする。
 */
export const HardBreakSerializer = HardBreak.extend({
	addStorage() {
		return {
			markdown: {
				serialize(state: any) {
					state.write("\n");
				},
			},
		};
	},
});

