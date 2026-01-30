import { Extension, type CommandProps } from "@tiptap/core";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface SearchResultRange {
	from: number;
	to: number;
}

interface SearchHighlightState {
	results: SearchResultRange[];
	currentIndex: number;
	decorations: DecorationSet;
}

type MetaPayload =
	| { type: "set"; results: SearchResultRange[]; currentIndex: number }
	| { type: "clear" }
	| { type: "index"; currentIndex: number };

export const SearchHighlightPluginKey = new PluginKey<SearchHighlightState>(
	"tategaki-search-highlight"
);

function buildDecorations(
	doc: ProseMirrorNode,
	results: SearchResultRange[],
	currentIndex: number
): DecorationSet {
	const decos: Decoration[] = [];
	results.forEach((range, index) => {
		const isActive = index === currentIndex;
		decos.push(
			Decoration.inline(range.from, range.to, {
				class: isActive
					? "tategaki-search-match-active"
					: "tategaki-search-match",
			})
		);
	});
	return DecorationSet.create(doc, decos);
}

export const SearchHighlightExtension = Extension.create({
	name: "searchHighlight",

	addProseMirrorPlugins() {
		return [
			new Plugin<SearchHighlightState>({
				key: SearchHighlightPluginKey,
				state: {
					init(_config, state) {
						return {
							results: [],
							currentIndex: -1,
							decorations: DecorationSet.create(state.doc, []),
						};
					},
					apply(
						tr: Transaction,
						value: SearchHighlightState,
						_oldState,
						newState
					) {
						const meta = tr.getMeta(SearchHighlightPluginKey) as
							| MetaPayload
							| undefined;
						let next: SearchHighlightState = value;

						if (tr.docChanged) {
							const mappedResults = value.results
								.map((range) => ({
									from: tr.mapping.map(range.from),
									to: tr.mapping.map(range.to),
								}))
								.filter((range) => range.from < range.to);
							next = {
								...next,
								results: mappedResults,
								decorations: buildDecorations(
									newState.doc,
									mappedResults,
									value.currentIndex
								),
							};
						}

						if (meta) {
							switch (meta.type) {
								case "set": {
									return {
										results: meta.results,
										currentIndex: meta.currentIndex,
										decorations: buildDecorations(
											newState.doc,
											meta.results,
											meta.currentIndex
										),
									};
								}
								case "index": {
									return {
										...next,
										currentIndex: meta.currentIndex,
										decorations: buildDecorations(
											newState.doc,
											next.results,
											meta.currentIndex
										),
									};
								}
								case "clear": {
									return {
										results: [],
										currentIndex: -1,
										decorations: DecorationSet.create(
											newState.doc,
											[]
										),
									};
								}
							}
						}

						return next;
					},
				},
				props: {
					decorations(state) {
						return (
							SearchHighlightPluginKey.getState(state)
								?.decorations || null
						);
					},
				},
			}),
		];
	},

	addCommands() {
		return {
			setSearchResults:
				(results: SearchResultRange[], currentIndex: number) =>
				({ tr, dispatch }: CommandProps) => {
					if (!dispatch) return true;
					dispatch(
						tr.setMeta(SearchHighlightPluginKey, {
							type: "set",
							results,
							currentIndex,
						} as MetaPayload)
					);
					return true;
				},
			setSearchCurrentIndex:
				(currentIndex: number) =>
				({ tr, dispatch }: CommandProps) => {
					if (!dispatch) return true;
					dispatch(
						tr.setMeta(SearchHighlightPluginKey, {
							type: "index",
							currentIndex,
						} as MetaPayload)
					);
					return true;
				},
			clearSearchResults:
				() =>
				({ tr, dispatch }: CommandProps) => {
					if (!dispatch) return true;
					dispatch(
						tr.setMeta(SearchHighlightPluginKey, {
							type: "clear",
						} as MetaPayload)
					);
					return true;
				},
		};
	},
});

export default SearchHighlightExtension;

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		searchHighlight: {
			setSearchResults: (
				results: SearchResultRange[],
				currentIndex: number
			) => ReturnType;
			setSearchCurrentIndex: (currentIndex: number) => ReturnType;
			clearSearchResults: () => ReturnType;
		};
	}
}

