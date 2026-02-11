import { Editor } from "@tiptap/core";
import { SearchEngine, type SearchOptions, type SearchResult } from "./search-engine";

export interface SearchReplaceOptions {
	caseSensitive: boolean;
}

export class SearchReplacePanel {
	private container: HTMLElement;
	private editor: Editor;
	private searchEngine: SearchEngine;
	private isVisible = false;
	private onUpdateCallback?: () => void;

	private panel: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private replaceInput: HTMLInputElement | null = null;
	private caseSensitiveCheckbox: HTMLInputElement | null = null;
	private matchCountElement: HTMLElement | null = null;

	private searchOptions: SearchReplaceOptions = {
		caseSensitive: false,
	};
	private currentResults: SearchResult[] = [];
	private currentIndex = -1;
	private searchDebounceTimer: number | null = null;
	private readonly searchDebounceDelay = 300;
	private isReadOnly = false;

	constructor(container: HTMLElement, editor: Editor, onUpdate?: () => void) {
		this.container = container;
		this.editor = editor;
		this.onUpdateCallback = onUpdate;
		this.searchEngine = new SearchEngine(editor);
	}

	show(replaceMode = false): void {
		if (replaceMode && this.isReadOnly) {
			replaceMode = false;
		}
		if (this.isVisible) {
			this.focus();
			return;
		}
		this.createPanel(replaceMode);
		this.isVisible = true;
		this.focus();
	}

	hide(): void {
		if (!this.isVisible || !this.panel) {
			return;
		}
		this.clearSearch();
		this.panel.remove();
		this.panel = null;
		this.isVisible = false;
		this.editor.commands.focus();
	}

	toggle(replaceMode = false): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show(replaceMode);
		}
	}

	private createPanel(replaceMode: boolean): void {
		this.panel = document.createElement("div");
		this.panel.className = "tategaki-search-replace-panel";

		const searchSection = this.panel.createDiv(
			"tategaki-search-replace-section tategaki-search-replace-section-search"
		);

		const searchRow = searchSection.createDiv("tategaki-search-replace-row");

		this.searchInput = searchRow.createEl("input");
		this.searchInput.type = "text";
		this.searchInput.placeholder = "検索...";
		this.searchInput.className = "tategaki-search-replace-input";

		const navContainer = searchRow.createDiv("tategaki-search-replace-nav");

		const prevButton = navContainer.createEl("button");
		prevButton.textContent = "↑";
		prevButton.title = "前を検索";
		prevButton.className = "tategaki-search-replace-icon-button";
		prevButton.addEventListener("click", () => this.findPrevious());

		const nextButton = navContainer.createEl("button");
		nextButton.textContent = "↓";
		nextButton.title = "次を検索";
		nextButton.className = "tategaki-search-replace-icon-button";
		nextButton.addEventListener("click", () => this.findNext());

		const closeButton = searchRow.createEl("button");
		closeButton.textContent = "×";
		closeButton.title = "閉じる";
		closeButton.className = "tategaki-search-replace-icon-button";
		closeButton.addEventListener("click", () => this.hide());

		this.matchCountElement = searchSection.createDiv();
		this.matchCountElement.className = "tategaki-search-replace-match-count";
		this.matchCountElement.textContent = "";

		if (replaceMode) {
			const replaceSection = this.panel.createDiv(
				"tategaki-search-replace-section tategaki-search-replace-section-replace"
			);

			const replaceRow = replaceSection.createDiv("tategaki-search-replace-row");

			this.replaceInput = replaceRow.createEl("input");
			this.replaceInput.type = "text";
			this.replaceInput.placeholder = "置換...";
			this.replaceInput.className = "tategaki-search-replace-input";

			const replaceButtonContainer = replaceRow.createDiv(
				"tategaki-search-replace-actions"
			);

			const replaceOneButton = replaceButtonContainer.createEl("button");
			replaceOneButton.textContent = "置換";
			replaceOneButton.className = "tategaki-search-replace-action-button";
			replaceOneButton.addEventListener("click", () => this.replaceOne());

			const replaceAllButton = replaceButtonContainer.createEl("button");
			replaceAllButton.textContent = "全置換";
			replaceAllButton.className = "tategaki-search-replace-action-button";
			replaceAllButton.addEventListener("click", () => this.replaceAll());
		}

		const optionsSection = this.panel.createDiv("tategaki-search-replace-options");

		const caseSensitiveLabel = optionsSection.createEl("label");
		caseSensitiveLabel.className = "tategaki-search-replace-option-label";
		this.caseSensitiveCheckbox = caseSensitiveLabel.createEl("input");
		this.caseSensitiveCheckbox.type = "checkbox";
		this.caseSensitiveCheckbox.className = "tategaki-search-replace-option-checkbox";
		caseSensitiveLabel.createSpan().textContent = "大文字小文字区別";

		this.setupEventListeners();
		this.container.appendChild(this.panel);
	}

	private setupEventListeners(): void {
		if (this.searchInput) {
			this.searchInput.addEventListener("input", () =>
				this.performSearchDebounced()
			);
			this.searchInput.addEventListener("keydown", (e) =>
				this.handleSearchKeydown(e)
			);
		}

		if (this.replaceInput) {
			this.replaceInput.addEventListener("keydown", (e) =>
				this.handleReplaceKeydown(e)
			);
		}

		if (this.caseSensitiveCheckbox) {
			this.caseSensitiveCheckbox.addEventListener("change", () => {
				this.updateSearchOptions();
				this.performSearch();
			});
		}
	}

	private handleSearchKeydown(event: KeyboardEvent): void {
		switch (event.key) {
			case "Enter":
				event.preventDefault();
				if (event.shiftKey) {
					this.findPrevious();
				} else {
					this.findNext();
				}
				break;
			case "Escape":
				event.preventDefault();
				this.hide();
				break;
		}
	}

	private handleReplaceKeydown(event: KeyboardEvent): void {
		switch (event.key) {
			case "Enter":
				event.preventDefault();
				this.replaceOne();
				break;
			case "Escape":
				event.preventDefault();
				this.hide();
				break;
		}
	}

	private updateSearchOptions(): void {
		this.searchOptions = {
			caseSensitive: this.caseSensitiveCheckbox?.checked ?? false,
		};
	}

	private performSearchDebounced(): void {
		if (this.searchDebounceTimer !== null) {
			window.clearTimeout(this.searchDebounceTimer);
		}
		this.searchDebounceTimer = window.setTimeout(() => {
			this.searchDebounceTimer = null;
			this.performSearch();
		}, this.searchDebounceDelay);
	}

	private performSearch(): void {
		const searchText = this.searchInput?.value || "";
		if (!searchText) {
			this.clearSearch();
			return;
		}

		const options: SearchOptions = { ...this.searchOptions };
		this.currentResults = this.searchEngine.search(searchText, options);
		this.currentIndex = this.currentResults.length > 0 ? 0 : -1;
		this.updateMatchCount();
		this.highlightMatches();
		if (this.currentResults.length > 0) {
			this.scrollToCurrentMatch();
		}
	}

	private clearSearch(): void {
		this.currentResults = [];
		this.currentIndex = -1;
		this.searchEngine.clearHighlights();
		this.updateMatchCount();
	}

	private findNext(): void {
		if (this.currentResults.length === 0) return;
		this.currentIndex = (this.currentIndex + 1) % this.currentResults.length;
		this.updateMatchCount();
		this.highlightMatches();
		this.scrollToCurrentMatch();
	}

	private findPrevious(): void {
		if (this.currentResults.length === 0) return;
		this.currentIndex =
			this.currentIndex <= 0
				? this.currentResults.length - 1
				: this.currentIndex - 1;
		this.updateMatchCount();
		this.highlightMatches();
		this.scrollToCurrentMatch();
	}

	private replaceOne(): void {
		if (this.isReadOnly) return;
		if (!this.replaceInput) return;
		if (this.currentIndex === -1) return;
		const replaceText = this.replaceInput.value;
		const success = this.searchEngine.replace(
			this.currentResults[this.currentIndex] as SearchResult,
			replaceText
		);
		if (success) {
			this.onUpdateCallback?.();
			this.performSearch();
		}
	}

	private replaceAll(): void {
		if (this.isReadOnly) return;
		if (!this.replaceInput) return;
		if (this.currentResults.length === 0) return;
		const replaceText = this.replaceInput.value;
		const replacedCount = this.searchEngine.replaceAll(
			this.currentResults,
			replaceText
		);
		if (replacedCount > 0) {
			this.onUpdateCallback?.();
			this.performSearch();
		}
	}

	private updateMatchCount(): void {
		if (!this.matchCountElement) return;
		if (this.currentResults.length === 0) {
			this.matchCountElement.textContent = "マッチなし";
		} else {
			this.matchCountElement.textContent = `${this.currentIndex + 1} / ${
				this.currentResults.length
			}`;
		}
	}

	private highlightMatches(): void {
		this.searchEngine.highlightMatches(this.currentResults, this.currentIndex);
	}

	private scrollToCurrentMatch(): void {
		if (this.currentIndex === -1) return;
		const currentMatch = this.currentResults[this.currentIndex];
		if (!currentMatch) return;
		this.searchEngine.scrollToMatch(currentMatch);
	}

	private focus(): void {
		if (this.searchInput) {
			this.searchInput.focus();
			this.searchInput.select();
		}
	}

	updateEditor(editor: Editor): void {
		this.editor = editor;
		this.searchEngine.updateEditor(editor);
	}

	setReadOnly(readOnly: boolean): void {
		this.isReadOnly = readOnly;
	}

	destroy(): void {
		if (this.searchDebounceTimer !== null) {
			window.clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}
		this.hide();
		this.searchEngine.destroy();
	}
}
