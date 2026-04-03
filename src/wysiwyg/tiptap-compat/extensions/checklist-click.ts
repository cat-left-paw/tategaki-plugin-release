/**
 * Checklist の checkbox 領域クリックで checked/unchecked を toggle する Plugin。
 *
 * li[data-checked] の ::before 領域をクリックしたときに、
 * 対象 listItem の checked 属性を反転させる。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const checklistClickPluginKey = new PluginKey("checklistClick");

/**
 * クリック target から data-checked を持つ li 要素を探す。
 * ::before はイベント target にならないため、li 要素自体のクリックを判定し、
 * クリック位置が padding 領域（checkbox 描画領域）内かどうかで判断する。
 */
function resolveChecklistLi(target: EventTarget | null): HTMLLIElement | null {
	if (!(target instanceof HTMLElement)) return null;
	const li = target.closest("li[data-checked]") as HTMLLIElement | null;
	return li;
}

export const ChecklistClickExtension = Extension.create({
	name: "checklistClick",

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: checklistClickPluginKey,
				props: {
					handleClickOn(view, pos, node, nodePos, event) {
						if (!view.editable) return false;

						const target = event.target;
						const li = resolveChecklistLi(target);
						if (!li) return false;

						// クリック位置が checkbox 領域（::before 疑似要素の領域）か判定
						// li の padding-inline-start 領域内かを確認
						const liRect = li.getBoundingClientRect();
						const style = window.getComputedStyle(li);
						const writingMode = style.writingMode || "horizontal-tb";
						const isVertical = writingMode.includes("vertical");

						let inCheckboxArea: boolean;
						if (isVertical) {
							// 縦書き: block 方向が水平、inline 方向が垂直
							// padding-inline-start は top 側
							const paddingInlineStart = parseFloat(style.paddingTop) || 0;
							inCheckboxArea = (event.clientY - liRect.top) < paddingInlineStart + 4;
						} else {
							// 横書き: inline 方向が水平
							const paddingInlineStart = parseFloat(style.paddingLeft) || 0;
							inCheckboxArea = (event.clientX - liRect.left) < paddingInlineStart + 4;
						}

						if (!inCheckboxArea) return false;

						// posAtDOM を使って対象 listItem の doc pos を取得
						let docPos: number;
						try {
							docPos = view.posAtDOM(li, 0);
						} catch {
							return false;
						}

						// listItem ノードを特定して checked を toggle
						const resolved = view.state.doc.resolve(docPos);
						for (let depth = resolved.depth; depth > 0; depth--) {
							const n = resolved.node(depth);
							if (n.type.name !== "listItem") continue;
							const checked = n.attrs.checked;
							if (checked !== true && checked !== false) continue;

							const listItemPos = resolved.before(depth);
							const tr = view.state.tr.setNodeMarkup(
								listItemPos,
								undefined,
								{
									...(n.attrs as Record<string, unknown>),
									checked: !checked,
								},
							);
							view.dispatch(tr);
							event.preventDefault();
							return true;
						}

						return false;
					},
				},
			}),
		];
	},
});
