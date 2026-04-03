/**
 * TipTap 互換モード 見出し折りたたみ
 *
 * 責務:
 *   - 折りたたみ状態の in-memory 管理（ProseMirror Plugin state）
 *   - 折りたたみ範囲の計算（resolveFoldRange）
 *   - Decoration.widget によるトグルボタンの注入
 *   - Decoration.node による折りたたみ済みコンテンツの非表示
 *
 * tiptap-compat-view.ts にはロジックを持ち込まず、
 * HeadingFoldExtension（extensions/heading-fold-extension.ts）経由で Editor に組み込む。
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
	createCompatHeadingFoldEllipsisElement,
	createCompatHeadingFoldToggleElement,
	getCompatHeadingFoldHostAttributes,
	resolveCompatHeadingFoldWritingMode,
} from "./heading-fold-ui";
import {
	buildCompatHeadingFoldPreviewText,
	CompatHeadingFoldPreviewController,
} from "./heading-fold-preview";

// ─── Plugin state ────────────────────────────────────────────────────────────

export interface HeadingFoldPluginState {
	/** 折りたたまれている見出しの doc 内 offset（= doc.forEach の offset） */
	foldedPositions: ReadonlySet<number>;
}

export const headingFoldPluginKey = new PluginKey<HeadingFoldPluginState>("headingFold");

type HeadingFoldAction =
	| { type: "toggle"; pos: number }
	| { type: "clear" };

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * `headingPos` にある見出しを折りたたんだときに非表示にすべき範囲を返す。
 *
 * 範囲は「見出しノードの直後」から「同レベル以上の次の見出しの直前」まで。
 * トップレベルノードのみを対象にする（ネストした構造は無視）。
 *
 * @param doc       ProseMirror ドキュメントノード
 * @param headingPos 見出しの開始 offset（doc.forEach の offset と同一）
 * @returns { from, to } または null（折りたたむ内容が無い場合）
 */
export function resolveFoldRange(
	doc: PMNode,
	headingPos: number,
): { from: number; to: number } | null {
	const headingNode = doc.nodeAt(headingPos);
	if (!headingNode || headingNode.type.name !== "heading") return null;
	const headingLevel = headingNode.attrs["level"] as number;

	const from = headingPos + headingNode.nodeSize;
	let to = from;

	let pos = 0;
	for (let i = 0; i < doc.childCount; i++) {
		const child = doc.child(i);
		if (pos >= from) {
			// 同レベル以上の見出しに到達したら終了
			if (
				child.type.name === "heading" &&
				(child.attrs["level"] as number) <= headingLevel
			) {
				break;
			}
			to = pos + child.nodeSize;
		}
		pos += child.nodeSize;
	}

	if (to <= from) return null;
	return { from, to };
}

// ─── Decoration builder ───────────────────────────────────────────────────────

function buildDecorations(
	doc: PMNode,
	state: HeadingFoldPluginState,
	previewController: CompatHeadingFoldPreviewController,
): DecorationSet {
	const decos: Decoration[] = [];

	let pos = 0;
	for (let i = 0; i < doc.childCount; i++) {
		const node = doc.child(i);
		if (node.type.name === "heading") {
			const isFolded = state.foldedPositions.has(pos);
			const capturedPos = pos;
			const range = resolveFoldRange(doc, capturedPos);
			const previewText = buildCompatHeadingFoldPreviewText(doc, range);

			decos.push(
				Decoration.node(
					capturedPos,
					capturedPos + node.nodeSize,
					getCompatHeadingFoldHostAttributes(isFolded),
				),
			);

			// トグルボタン（見出し内部の先頭に挿入）
			decos.push(
				Decoration.widget(
					capturedPos + 1,
					(view: EditorView, getPos: () => number | undefined) => {
						return createCompatHeadingFoldToggleElement({
							doc: view.dom.ownerDocument,
							collapsed: isFolded,
							writingMode: resolveCompatHeadingFoldWritingMode(view),
							onToggle: () => {
								previewController.hide();
								const widgetPos =
									typeof getPos === "function" ? getPos() : undefined;
								const headingNodePos =
									widgetPos != null ? widgetPos - 1 : capturedPos;
								view.dispatch(
									view.state.tr.setMeta(headingFoldPluginKey, {
										type: "toggle",
										pos: headingNodePos,
									} as HeadingFoldAction),
								);
							},
							});
					},
					{
						side: -1,
						key: `fold-toggle-${capturedPos}-${isFolded ? "collapsed" : "expanded"}`,
					},
				),
			);

			if (isFolded) {
				decos.push(
					Decoration.widget(
						capturedPos + node.nodeSize - 1,
						(view: EditorView) => {
							const ellipsis = createCompatHeadingFoldEllipsisElement(
								view.dom.ownerDocument,
							);
							if (!previewText) return ellipsis;
							const showPreview = (): void => {
								previewController.show(ellipsis, previewText);
							};
							const hidePreview = (): void => {
								previewController.hide();
							};
							ellipsis.addEventListener("mouseenter", showPreview);
							ellipsis.addEventListener("mouseleave", hidePreview);
							ellipsis.addEventListener("focus", showPreview);
							ellipsis.addEventListener("blur", hidePreview);
							return ellipsis;
						},
						{
							side: 1,
							key: `fold-ellipsis-${capturedPos}-${isFolded ? "collapsed" : "expanded"}`,
						},
					),
				);
			}

			// 折りたたまれている場合: 対象範囲を display:none で隠す
			if (isFolded) {
				if (range) {
					let walkPos = range.from;
					while (walkPos < range.to) {
						const rangeNode = doc.nodeAt(walkPos);
						if (!rangeNode) break;
						decos.push(
							Decoration.node(
								walkPos,
								walkPos + rangeNode.nodeSize,
								{
									style: "display:none",
									class: "tategaki-heading-folded-content",
								},
							),
						);
						walkPos += rangeNode.nodeSize;
					}
				}
			}
		}
		pos += node.nodeSize;
	}

	return DecorationSet.create(doc, decos);
}

// ─── Plugin factory ───────────────────────────────────────────────────────────

export function createHeadingFoldPlugin(): Plugin<HeadingFoldPluginState> {
	const previewController = new CompatHeadingFoldPreviewController();
	return new Plugin<HeadingFoldPluginState>({
		key: headingFoldPluginKey,

		state: {
			init(): HeadingFoldPluginState {
				return { foldedPositions: new Set() };
			},

			apply(tr, prev): HeadingFoldPluginState {
				const action = tr.getMeta(
					headingFoldPluginKey,
				) as HeadingFoldAction | undefined;

				if (action?.type === "toggle") {
					const newSet = new Set(prev.foldedPositions);
					if (newSet.has(action.pos)) {
						newSet.delete(action.pos);
					} else {
						newSet.add(action.pos);
					}
					return { foldedPositions: newSet };
				}

				if (action?.type === "clear") {
					return { foldedPositions: new Set() };
				}

				// ドキュメント変更時: position をマッピングして有効な見出しのみ残す
				if (tr.docChanged && prev.foldedPositions.size > 0) {
					const newSet = new Set<number>();
					for (const oldPos of prev.foldedPositions) {
						try {
							const mapped = tr.mapping.map(oldPos, 1);
							const node = tr.doc.nodeAt(mapped);
							if (node && node.type.name === "heading") {
								newSet.add(mapped);
							}
						} catch {
							// 無効な position は破棄
						}
					}
					return { foldedPositions: newSet };
				}

				return prev;
			},
		},

		props: {
			decorations(state): DecorationSet {
				const foldState = headingFoldPluginKey.getState(state);
				if (!foldState) return DecorationSet.empty;
				return buildDecorations(state.doc, foldState, previewController);
			},
		},

		view() {
			return {
				update: () => {
					previewController.hide();
				},
				destroy: () => {
					previewController.destroy();
				},
			};
		},
	});
}
