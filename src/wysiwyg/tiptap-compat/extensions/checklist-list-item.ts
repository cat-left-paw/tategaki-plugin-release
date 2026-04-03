/**
 * ListItem を拡張し、checked 属性を追加する compat 用 extension。
 *
 * checked: true  → チェック済み checklist item
 * checked: false → 未チェック checklist item
 * checked: null  → 通常の list item
 *
 * Nyoze と同じく li[data-checked] で DOM に反映し、
 * ::before 疑似要素で checkbox を描画する方針。
 */
import ListItem from "@tiptap/extension-list-item";

export const ChecklistListItem = ListItem.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			checked: {
				default: null,
				parseHTML: (element: HTMLElement) => {
					// data-checked 属性から読み取る
					const val = element.getAttribute("data-checked");
					if (val === "true") return true;
					if (val === "false") return false;
					// 旧 data-type="taskItem" 互換
					if (element.getAttribute("data-type") === "taskItem") {
						const checked = element.getAttribute("data-checked");
						if (checked === "true") return true;
						if (checked === "false") return false;
					}
					return null;
				},
				renderHTML: (attributes: Record<string, unknown>) => {
					if (attributes.checked === true) {
						return { "data-checked": "true" };
					}
					if (attributes.checked === false) {
						return { "data-checked": "false" };
					}
					return {};
				},
			},
		};
	},
});
