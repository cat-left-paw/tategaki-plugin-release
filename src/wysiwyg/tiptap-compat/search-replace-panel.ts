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
		this.panel.style.cssText = `
			position: absolute;
			top: 10px;
			right: 10px;
			width: 320px;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			box-shadow: var(--shadow-s);
			z-index: 1000;
			padding: 12px;
			font-size: 13px;
		`;

		const searchSection = this.panel.createDiv("search-section");
		searchSection.style.cssText = "margin-bottom: 8px;";

		const searchRow = searchSection.createDiv();
		searchRow.style.cssText =
			"display: flex; align-items: center; margin-bottom: 6px;";

		this.searchInput = searchRow.createEl("input");
		this.searchInput.type = "text";
		this.searchInput.placeholder = "検索...";
		this.searchInput.style.cssText = `
			flex: 1;
			padding: 4px 8px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 3px;
			margin-right: 6px;
			background: var(--background-primary);
			color: var(--text-normal);
		`;

		const navContainer = searchRow.createDiv();
		navContainer.style.cssText =
			"display: flex; gap: 2px; margin-right: 6px;";

		const prevButton = navContainer.createEl("button");
		prevButton.textContent = "↑";
		prevButton.title = "前を検索";
		prevButton.style.cssText = `
			width: 24px; height: 24px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-primary);
			border-radius: 3px;
			cursor: pointer;
		`;
		prevButton.addEventListener("click", () => this.findPrevious());

		const nextButton = navContainer.createEl("button");
		nextButton.textContent = "↓";
		nextButton.title = "次を検索";
		nextButton.style.cssText = `
			width: 24px; height: 24px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-primary);
			border-radius: 3px;
			cursor: pointer;
		`;
		nextButton.addEventListener("click", () => this.findNext());

		const closeButton = searchRow.createEl("button");
		closeButton.textContent = "×";
		closeButton.title = "閉じる";
		closeButton.style.cssText = `
			width: 24px; height: 24px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-primary);
			border-radius: 3px;
			cursor: pointer;
		`;
		closeButton.addEventListener("click", () => this.hide());

		this.matchCountElement = searchSection.createDiv();
		this.matchCountElement.style.cssText = `
			font-size: 11px;
			color: var(--text-muted);
			margin-bottom: 6px;
		`;
		this.matchCountElement.textContent = "";

		if (replaceMode) {
			const replaceSection = this.panel.createDiv("replace-section");
			replaceSection.style.cssText = "margin-bottom: 8px;";

			const replaceRow = replaceSection.createDiv();
			replaceRow.style.cssText =
				"display: flex; align-items: center; margin-bottom: 6px;";

			this.replaceInput = replaceRow.createEl("input");
			this.replaceInput.type = "text";
			this.replaceInput.placeholder = "置換...";
			this.replaceInput.style.cssText = `
				flex: 1;
				padding: 4px 8px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 3px;
				margin-right: 6px;
				background: var(--background-primary);
				color: var(--text-normal);
			`;

			const replaceButtonContainer = replaceRow.createDiv();
			replaceButtonContainer.style.cssText = "display: flex; gap: 4px;";

			const replaceOneButton = replaceButtonContainer.createEl("button");
			replaceOneButton.textContent = "置換";
			replaceOneButton.style.cssText = `
				padding: 4px 8px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				border-radius: 3px;
				cursor: pointer;
				font-size: 11px;
			`;
			replaceOneButton.addEventListener("click", () => this.replaceOne());

			const replaceAllButton = replaceButtonContainer.createEl("button");
			replaceAllButton.textContent = "全置換";
			replaceAllButton.style.cssText = `
				padding: 4px 8px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				border-radius: 3px;
				cursor: pointer;
				font-size: 11px;
			`;
			replaceAllButton.addEventListener("click", () => this.replaceAll());
		}

		const optionsSection = this.panel.createDiv("options-section");
		optionsSection.style.cssText = "display: flex; gap: 12px; font-size: 11px;";

		const caseSensitiveLabel = optionsSection.createEl("label");
		caseSensitiveLabel.style.cssText =
			"display: flex; align-items: center; cursor: pointer;";
		this.caseSensitiveCheckbox = caseSensitiveLabel.createEl("input");
		this.caseSensitiveCheckbox.type = "checkbox";
		this.caseSensitiveCheckbox.style.cssText = "margin-right: 4px;";
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
