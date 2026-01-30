import type { TategakiV2Settings } from "../../types/settings";
import type { FrontmatterData } from "./sot-wysiwyg-view-frontmatter";

export const parseFrontmatter = (content: string): {
	frontmatter: FrontmatterData | null;
	contentWithoutFrontmatter: string;
} => {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return {
			frontmatter: null,
			contentWithoutFrontmatter: content,
		};
	}

	const yamlContent = match[1];
	const contentWithoutFrontmatter = content.slice(match[0].length);
	const frontmatter: FrontmatterData = {};
	const lines = yamlContent.split("\n");

	let currentKey = "";
	let currentArray: string[] = [];
	let isInArray = false;

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine || trimmedLine.startsWith("#")) continue;

		if (trimmedLine.startsWith("- ")) {
			if (isInArray) {
				currentArray.push(trimmedLine.slice(2).trim());
			}
			continue;
		}

		if (isInArray && !trimmedLine.startsWith("- ")) {
			if (currentKey === "co_authors") {
				frontmatter.co_authors = currentArray;
			} else if (currentKey === "co_translators") {
				frontmatter.co_translators = currentArray;
			}
			isInArray = false;
			currentArray = [];
		}

		const colonIndex = trimmedLine.indexOf(":");
		if (colonIndex !== -1) {
			const key = trimmedLine.slice(0, colonIndex).trim();
			const value = trimmedLine.slice(colonIndex + 1).trim();

			switch (key) {
				case "title":
					frontmatter.title = value;
					break;
				case "subtitle":
					frontmatter.subtitle = value;
					break;
				case "original_title":
					frontmatter.original_title = value;
					break;
				case "author":
					frontmatter.author = value;
					break;
				case "translator":
					frontmatter.translator = value;
					break;
				case "co_authors":
				case "co_translators":
					if (value) {
						const items = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						if (key === "co_authors") {
							frontmatter.co_authors = items;
						} else {
							frontmatter.co_translators = items;
						}
					} else {
						currentKey = key;
						isInArray = true;
						currentArray = [];
					}
					break;
				default:
					break;
			}
		}
	}

	if (isInArray) {
		if (currentKey === "co_authors") {
			frontmatter.co_authors = currentArray;
		} else if (currentKey === "co_translators") {
			frontmatter.co_translators = currentArray;
		}
	}

	return {
		frontmatter:
			Object.keys(frontmatter).length > 0 ? frontmatter : null,
		contentWithoutFrontmatter,
	};
};

export const applyFrontmatterInlineEndAlignment = (
	element: HTMLElement
): void => {
	element.style.display = "block";
	element.style.setProperty("text-align", "end", "important");
	element.style.setProperty("text-align-last", "end", "important");
	element.style.marginInlineStart = "auto";
	element.style.marginInlineEnd = "0";
	element.style.marginLeft = "auto";
	element.style.marginRight = "0";
	element.style.justifySelf = "end";
};

export const applyFrontmatterWritingMode = (
	element: HTMLElement,
	writingMode: string
): void => {
	element.style.writingMode = writingMode;
	element.style.textOrientation = "mixed";
};

export const renderFrontmatter = (
	data: FrontmatterData,
	settings: TategakiV2Settings
): HTMLElement | null => {
	const container = document.createElement("div");
	container.className = "tategaki-frontmatter";

	let hasContent = false;

	const topAlignedContainer = container.createDiv(
		"tategaki-frontmatter-top"
	);

	if (data.title && settings.preview.showFrontmatterTitle) {
		const titleEl = topAlignedContainer.createEl("h1", {
			cls: "tategaki-frontmatter-title",
		});
		titleEl.textContent = data.title;
		hasContent = true;
	}

	if (data.subtitle && settings.preview.showFrontmatterSubtitle) {
		const subtitleEl = topAlignedContainer.createEl("h2", {
			cls: "tategaki-frontmatter-subtitle",
		});
		subtitleEl.textContent = data.subtitle;
		hasContent = true;
	}

	if (
		data.original_title &&
		settings.preview.showFrontmatterOriginalTitle
	) {
		const originalTitleEl = topAlignedContainer.createEl("h2", {
			cls: "tategaki-frontmatter-original-title",
		});
		originalTitleEl.textContent = data.original_title;
		hasContent = true;
	}

	const bottomAlignedContainer = container.createDiv(
		"tategaki-frontmatter-bottom"
	);

	if (data.author && settings.preview.showFrontmatterAuthor) {
		const authorEl = bottomAlignedContainer.createEl("h4", {
			cls: "tategaki-frontmatter-author",
		});
		authorEl.textContent = data.author;
		applyFrontmatterInlineEndAlignment(authorEl);
		hasContent = true;
	}

	if (data.co_authors && settings.preview.showFrontmatterCoAuthors) {
		for (const coAuthor of data.co_authors) {
			const coAuthorEl = bottomAlignedContainer.createEl("h4", {
				cls: "tategaki-frontmatter-co-author",
			});
			coAuthorEl.textContent = coAuthor;
			applyFrontmatterInlineEndAlignment(coAuthorEl);
			hasContent = true;
		}
	}

	if (data.translator && settings.preview.showFrontmatterTranslator) {
		const translatorEl = bottomAlignedContainer.createEl("h5", {
			cls: "tategaki-frontmatter-translator",
		});
		translatorEl.textContent = data.translator;
		applyFrontmatterInlineEndAlignment(translatorEl);
		hasContent = true;
	}

	if (
		data.co_translators &&
		settings.preview.showFrontmatterCoTranslators
	) {
		for (const coTranslator of data.co_translators) {
			const coTranslatorEl = bottomAlignedContainer.createEl("h5", {
				cls: "tategaki-frontmatter-co-translator",
			});
			coTranslatorEl.textContent = coTranslator;
			applyFrontmatterInlineEndAlignment(coTranslatorEl);
			hasContent = true;
		}
	}

	return hasContent ? container : null;
};
