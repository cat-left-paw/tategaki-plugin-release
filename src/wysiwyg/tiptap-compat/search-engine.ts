import { Editor } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { SearchHighlightPluginKey } from "./extensions/search-highlight";

export interface SearchOptions {
	caseSensitive: boolean;
}

export interface SearchResult {
	from: number;
	to: number;
	text: string;
}

export class SearchEngine {
	private editor: Editor;

	constructor(editor: Editor) {
		this.editor = editor;
	}

	search(searchText: string, options: SearchOptions): SearchResult[] {
		if (!searchText) return [];

		const doc = this.editor.state.doc;
		const results: SearchResult[] = [];
		const needle = this.normalizeText(searchText, options.caseSensitive);
		this.traverseDoc(doc, (node, pos) => {
			if (!node.isText || !node.text) {
				return;
			}
			const matches = this.findMatches(node.text, needle, pos, options);
			results.push(...matches);
		});

		return results;
	}

	replace(result: SearchResult, replaceText: string): boolean {
		try {
			const tr = this.editor.state.tr;
			if (replaceText.length === 0) {
				tr.delete(result.from, result.to);
			} else {
				tr.replaceWith(
					result.from,
					result.to,
					this.editor.state.schema.text(replaceText)
				);
			}
			this.editor.view.dispatch(tr);
			return true;
		} catch (error) {
			console.error("Tategaki TipTap: replace error", error);
			return false;
		}
	}

	replaceAll(results: SearchResult[], replaceText: string): number {
		if (results.length === 0) return 0;

		try {
			const sortedResults = [...results].sort((a, b) => b.from - a.from);
			const tr = this.editor.state.tr;
			let replacedCount = 0;
			for (const result of sortedResults) {
				if (replaceText.length === 0) {
					tr.delete(result.from, result.to);
				} else {
					tr.replaceWith(
						result.from,
						result.to,
						this.editor.state.schema.text(replaceText)
					);
				}
				replacedCount += 1;
			}
			this.editor.view.dispatch(tr);
			return replacedCount;
		} catch (error) {
			console.error("Tategaki TipTap: replace all error", error);
			return 0;
		}
	}

	highlightMatches(results: SearchResult[], currentIndex: number): void {
		const tr = this.editor.state.tr;
		tr.setMeta(SearchHighlightPluginKey, {
			type: "set",
			results: results.map((r) => ({ from: r.from, to: r.to })),
			currentIndex,
		});
		this.editor.view.dispatch(tr);
	}

	clearHighlights(): void {
		const tr = this.editor.state.tr;
		tr.setMeta(SearchHighlightPluginKey, { type: "clear" });
		this.editor.view.dispatch(tr);
	}

	scrollToMatch(result: SearchResult): void {
		try {
			const coords = this.editor.view.coordsAtPos(result.from);
			const container =
				(this.editor.view.dom.closest(
					".tategaki-tiptap-compat-editor-host"
				) as HTMLElement | null) ??
				(this.editor.view.dom.closest(
					".tategaki-editor-area"
				) as HTMLElement | null);

			if (!container || !coords) {
				return;
			}

			const rect = container.getBoundingClientRect();
			const targetTop = coords.top - rect.top + container.scrollTop;
			const targetLeft = coords.left - rect.left + container.scrollLeft;

			container.scrollTo({
				top: targetTop - container.clientHeight / 2,
				left: targetLeft - container.clientWidth / 2,
				behavior: "smooth",
			});
		} catch (error) {
			console.error("Tategaki TipTap: scroll to match error", error);
		}
	}

	updateEditor(editor: Editor): void {
		this.editor = editor;
		this.clearHighlights();
	}

	destroy(): void {
		this.clearHighlights();
	}

	private findMatches(
		text: string,
		needle: string,
		basePos: number,
		options: SearchOptions
	): SearchResult[] {
		const matches: SearchResult[] = [];
		if (!needle) {
			return matches;
		}
		const haystack = this.normalizeText(text, options.caseSensitive);
		let index = 0;
		while (index <= haystack.length - needle.length) {
			const found = haystack.indexOf(needle, index);
			if (found === -1) {
				break;
			}
			matches.push({
				from: basePos + found,
				to: basePos + found + needle.length,
				text: text.slice(found, found + needle.length),
			});
			index = found + needle.length;
		}
		return matches;
	}

	private normalizeText(text: string, caseSensitive: boolean): string {
		return caseSensitive ? text : text.toLocaleLowerCase();
	}

	private traverseDoc(
		node: Node,
		callback: (node: Node, pos: number) => void
	): void {
		node.nodesBetween(0, node.content.size, (n, pos) => {
			callback(n as unknown as Node, pos);
		});
	}
}
