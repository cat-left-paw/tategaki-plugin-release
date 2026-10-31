import type { MarkdownView, WorkspaceLeaf } from "obsidian";

/** Only call while opening/rebuilding a pair, never from passive layout checks.
 * Obsidian 1.14.5 toggleMode uses leaf.setViewState; `source` independently
 * preserves live preview vs source editing. Keep all other leaf state as well.
 */
export async function ensureMarkdownEditingMode(
	leaf: WorkspaceLeaf,
	view: MarkdownView,
): Promise<boolean> {
	const path = view.file?.path;
	if (view.getMode() !== "source") {
		const state = leaf.getViewState();
		await leaf.setViewState({
			...state,
			state: { ...state.state, mode: "source" },
		});
	}
	return leaf.view === view && view.file?.path === path && view.getMode() === "source";
}

export class MarkdownEditingModeError extends Error {}

export async function requireMarkdownEditingMode(leaf: WorkspaceLeaf, view: MarkdownView): Promise<void> {
	try {
		if (await ensureMarkdownEditingMode(leaf, view)) return;
	} catch {
		throw new MarkdownEditingModeError();
	}
	throw new MarkdownEditingModeError();
}
