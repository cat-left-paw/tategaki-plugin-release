/**
 * compat checklist のコマンド helper。
 *
 * toolbar-list-buttons.ts から呼ばれ、以下を担当する:
 * - 選択範囲内に listItem があるか判定
 * - listItem が無い場合は bullet list 化してから checklist 化
 * - checklist 付与 / 解除
 * - active 判定
 */

/** toolbar-list-buttons が要求する editor の最小インターフェース */
export interface ChecklistCommandEditor {
	isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
	chain: () => {
		focus: () => {
			toggleBulletList: () => { run: () => boolean };
		};
	};
	state: {
		selection: { from: number; to: number };
		doc: {
			nodesBetween: (
				from: number,
				to: number,
				callback: (
					node: { type: { name: string }; attrs: Record<string, unknown> },
					pos: number,
				) => void | boolean,
			) => void;
		};
		tr: {
			setNodeMarkup: (
				pos: number,
				type: undefined,
				attrs: Record<string, unknown>,
			) => unknown;
		};
	};
	view: {
		dispatch: (tr: unknown) => void;
	};
}

/**
 * 選択範囲内の listItem を収集する。
 */
function collectListItemsInSelection(
	editor: ChecklistCommandEditor,
): Array<{ pos: number; attrs: Record<string, unknown> }> {
	const { from, to } = editor.state.selection;
	const targets: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
	editor.state.doc.nodesBetween(from, to, (node, pos) => {
		if (node.type.name === "listItem") {
			targets.push({ pos, attrs: { ...node.attrs } });
		}
	});
	return targets;
}

/**
 * 選択範囲内に checklist item（checked === true | false）があるか。
 */
export function hasChecklistInSelection(editor: ChecklistCommandEditor): boolean {
	const targets = collectListItemsInSelection(editor);
	return targets.some(
		(t) => t.attrs.checked === true || t.attrs.checked === false,
	);
}

/**
 * 選択範囲を checklist 化 / 解除する。
 *
 * - listItem が無い場合は先に bullet list を作ってから checklist 化する
 * - すべて checklist なら解除（checked: null）
 * - それ以外なら checklist 化（checked: false）
 */
export function toggleChecklistInSelection(editor: ChecklistCommandEditor): boolean {
	let targets = collectListItemsInSelection(editor);

	// listItem が見つからない場合: 先に bullet list を作る
	if (targets.length === 0) {
		editor.chain().focus().toggleBulletList().run();
		// bullet list 化後に再収集
		targets = collectListItemsInSelection(editor);
		if (targets.length === 0) return false;
	}

	// すべてが checklist ならば解除（null）、そうでなければ checklist 化（false）
	const allChecklist = targets.every(
		(t) => t.attrs.checked === true || t.attrs.checked === false,
	);
	const nextChecked: boolean | null = allChecklist ? null : false;

	let tr = editor.state.tr;
	let changed = false;
	for (const target of targets) {
		const currentChecked = target.attrs.checked ?? null;
		if (currentChecked === nextChecked) continue;
		tr = tr.setNodeMarkup(target.pos, undefined, {
			...target.attrs,
			checked: nextChecked,
		}) as typeof tr;
		changed = true;
	}

	if (changed) {
		editor.view.dispatch(tr);
	}

	// bullet list 化 + checked 設定の両方が起きた場合も true
	return true;
}
