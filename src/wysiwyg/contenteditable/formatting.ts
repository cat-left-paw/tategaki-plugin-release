/**
 * Formatting Manager for ContentEditable Editor
 * Provides formatting operations using Range/DOM APIs
 */

import { t } from "../../shared/i18n";

export interface FormattingState {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    highlight: boolean;
    heading: number; // 0 for none, 1-6 for h1-h6
    bulletList: boolean;
    orderedList: boolean;
    blockquote: boolean;
}

export class FormattingManager {
    private editorElement: HTMLElement;

    constructor(editorElement: HTMLElement) {
        this.editorElement = editorElement;
    }

    /**
     * Toggle bold formatting
     */
    toggleBold(): void {
        this.toggleInlineTag("strong", ["strong", "b"]);
        this.editorElement.focus();
    }

    /**
     * Toggle italic formatting
     */
    toggleItalic(): void {
        this.toggleInlineTag("em", ["em", "i"]);
        this.editorElement.focus();
    }

    /**
     * Toggle strikethrough formatting
     */
    toggleStrikethrough(): void {
        this.toggleInlineTag("del", ["del", "s", "strike"]);
        this.editorElement.focus();
    }

    /**
     * Toggle underline formatting
     */
    toggleUnderline(): void {
        this.toggleInlineTag("u", ["u"]);
        this.editorElement.focus();
    }

    /**
     * Toggle highlight (using mark tag)
     */
    toggleHighlight(): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const selectedText = range.toString();

        if (!selectedText) return;

        // Check if already highlighted
        let parentElement = range.commonAncestorContainer;
        if (parentElement.nodeType === Node.TEXT_NODE) {
            parentElement = parentElement.parentElement!;
        }

        const markElement = (parentElement as HTMLElement).closest('mark');
        if (markElement) {
            // Remove highlight - replace mark with its text content
            const text = markElement.textContent || '';
            const textNode = document.createTextNode(text);
            markElement.parentNode?.replaceChild(textNode, markElement);
        } else {
            // Add highlight as Markdown syntax
            const markdownHighlight = `==${selectedText}==`;
            range.deleteContents();
            const textNode = document.createTextNode(markdownHighlight);
            range.insertNode(textNode);

            // Trigger input event to convert Markdown to HTML
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            this.editorElement.dispatchEvent(inputEvent);
        }

        this.editorElement.focus();
    }

    /**
     * Set heading level (1-6) or remove heading (0)
     */
    setHeading(level: number): void {
        const parentElement = this.getClosestBlockElement();
        if (!parentElement) {
            this.editorElement.focus();
            return;
        }
        const currentLevel = this.getHeadingLevel(parentElement);

        // 現在のレベルと同じ場合は何もしない
        if (currentLevel === level) {
            this.editorElement.focus();
            return;
        }

        if (level === 0) {
            if (parentElement.tagName.match(/^H[1-6]$/)) {
                this.replaceTagName(parentElement, "p");
            }
        } else if (level >= 1 && level <= 6) {
            this.replaceTagName(parentElement, `h${level}`);
        }

        this.editorElement.focus();
    }

    /**
     * Toggle bullet list
     */
    toggleBulletList(): void {
        this.toggleList("ul");
        this.editorElement.focus();
    }

    /**
     * Toggle ordered list
     */
    toggleOrderedList(): void {
        this.toggleList("ol");
        this.editorElement.focus();
    }

    /**
     * Toggle blockquote
     */
    toggleBlockquote(): void {
        this.toggleBlockTag("blockquote");
        this.editorElement.focus();
    }

    /**
     * Insert horizontal rule
     */
    insertHorizontalRule(): void {
        const selection = window.getSelection();
        const range = this.getSelectionRange(selection);
        if (!selection || !range) {
            this.editorElement.focus();
            return;
        }

        const hr = document.createElement("hr");
        range.deleteContents();
        range.insertNode(hr);

        const after = document.createRange();
        after.setStartAfter(hr);
        after.collapse(true);
        selection.removeAllRanges();
        selection.addRange(after);
        this.editorElement.focus();
    }

    /**
     * Insert link
     */
    insertLink(url: string): void {
        if (!url) return;

        const selection = window.getSelection();
        if (!selection) {
            this.editorElement.focus();
            return;
        }

        if (selection.rangeCount === 0) {
            this.editorElement.focus();
            return;
        }

        const range = selection.getRangeAt(0);

        if (range.collapsed) {
            const link = document.createElement('a');
            link.href = url;
            link.textContent = t("link.defaultText");

            range.insertNode(link);

            const newRange = document.createRange();
            newRange.selectNodeContents(link);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            const existingLink = this.findClosestWithinEditor(
                this.getNodeElement(range.commonAncestorContainer),
                "a"
            );
            if (existingLink) {
                existingLink.setAttribute("href", url);
            } else {
                const link = document.createElement("a");
                link.setAttribute("href", url);
                this.wrapRange(range, link);
            }
        }

        this.editorElement.focus();
    }

    /**
     * Remove link
     */
    removeLink(): void {
        const selection = window.getSelection();
        const range = this.getSelectionRange(selection);
        if (!selection || !range) {
            this.editorElement.focus();
            return;
        }

        if (range.collapsed) {
            const anchor = this.findClosestWithinEditor(
                this.getNodeElement(range.startContainer),
                "a"
            );
            if (anchor) {
                this.unwrapElement(anchor);
            }
            this.editorElement.focus();
            return;
        }

        const anchors = this.collectIntersectingElements(range, "a");
        for (const anchor of anchors) {
            this.unwrapElement(anchor);
        }
        this.editorElement.focus();
    }

    /**
     * Undo last action
     */
    undo(): void {
        this.editorElement.focus();
    }

    /**
     * Redo last undone action
     */
    redo(): void {
        this.editorElement.focus();
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        // Note: There is no reliable browser-wide API to query editable undo availability
        // We'll implement a custom undo stack in Phase 6
        return true;
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        // Note: There is no reliable browser-wide API to query editable redo availability
        // We'll implement a custom undo stack in Phase 6
        return true;
    }

    /**
     * Check if a format is currently active
     */
    isFormatActive(format: string): boolean {
        const state = this.getFormattingState();
        switch (format) {
            case "bold":
                return state.bold;
            case "italic":
                return state.italic;
            case "underline":
                return state.underline;
            case "strikethrough":
            case "strikeThrough":
                return state.strikethrough;
            default:
                return false;
        }
    }

    /**
     * Get current formatting state
     */
    getFormattingState(): FormattingState {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) {
            return {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                highlight: false,
                heading: 0,
                bulletList: false,
                orderedList: false,
                blockquote: false,
            };
        }

        // Get the parent element of the selection
        const parentElement = this.getSelectionParentElement();

        return {
            bold: this.isBold(parentElement),
            italic: this.isItalic(parentElement),
            strikethrough: this.isStrikethrough(parentElement),
            underline: this.isUnderline(parentElement),
            highlight: this.isHighlighted(parentElement),
            heading: this.getHeadingLevel(parentElement),
            bulletList: this.isBulletList(parentElement),
            orderedList: this.isOrderedList(parentElement),
            blockquote: this.isBlockquote(parentElement),
        };
    }

    /**
     * Get the heading level of an element (0-6)
     */
    private getHeadingLevel(element: HTMLElement | null): number {
        if (!element) return 0;

        const tagName = element.tagName.toLowerCase();
        if (tagName.match(/^h[1-6]$/)) {
            return parseInt(tagName.charAt(1));
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.getHeadingLevel(element.parentElement);
        }

        return 0;
    }

    /**
     * Check if element or its parents is a blockquote
     */
    private isBlockquote(element: HTMLElement | null): boolean {
        if (!element) return false;

        if (element.tagName.toLowerCase() === 'blockquote') {
            return true;
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isBlockquote(element.parentElement);
        }

        return false;
    }

    /**
     * Check if element or its parents is highlighted (mark tag)
     */
    private isHighlighted(element: HTMLElement | null): boolean {
        if (!element) return false;

        if (element.tagName.toLowerCase() === 'mark') {
            return true;
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isHighlighted(element.parentElement);
        }

        return false;
    }

    /**
     * Check if element or its parents is bold
     */
    private isBold(element: HTMLElement | null): boolean {
        if (!element) return false;

        const tagName = element.tagName.toLowerCase();
        if (tagName === 'b' || tagName === 'strong') {
            return true;
        }

        // Check CSS font-weight
        if (element instanceof HTMLElement) {
            const style = window.getComputedStyle(element);
            const fontWeight = style.fontWeight;
            if (fontWeight === 'bold' || fontWeight === '700' || parseInt(fontWeight) >= 700) {
                return true;
            }
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isBold(element.parentElement);
        }

        return false;
    }

    /**
     * Check if element or its parents is italic
     */
    private isItalic(element: HTMLElement | null): boolean {
        if (!element) return false;

        const tagName = element.tagName.toLowerCase();
        if (tagName === 'i' || tagName === 'em') {
            return true;
        }

        // Check CSS font-style
        if (element instanceof HTMLElement) {
            const style = window.getComputedStyle(element);
            if (style.fontStyle === 'italic') {
                return true;
            }
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isItalic(element.parentElement);
        }

        return false;
    }

    /**
     * Check if element or its parents has strikethrough
     */
    private isStrikethrough(element: HTMLElement | null): boolean {
        if (!element) return false;

        const tagName = element.tagName.toLowerCase();
        if (tagName === 's' || tagName === 'strike' || tagName === 'del') {
            return true;
        }

        // Check CSS text-decoration
        if (element instanceof HTMLElement) {
            const style = window.getComputedStyle(element);
            if (style.textDecoration.includes('line-through')) {
                return true;
            }
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isStrikethrough(element.parentElement);
        }

        return false;
    }

    /**
     * Check if element or its parents is underlined
     */
    private isUnderline(element: HTMLElement | null): boolean {
        if (!element) return false;

        const tagName = element.tagName.toLowerCase();
        if (tagName === 'u') {
            return true;
        }

        // Check CSS text-decoration
        if (element instanceof HTMLElement) {
            const style = window.getComputedStyle(element);
            if (style.textDecoration.includes('underline')) {
                return true;
            }
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isUnderline(element.parentElement);
        }

        return false;
    }

    /**
     * Check if element or its parents is a bullet list
     */
    private isBulletList(element: HTMLElement | null): boolean {
        if (!element) return false;

        if (element.tagName.toLowerCase() === 'ul') {
            return true;
        }

        // Check if inside a list item that's in a ul
        if (element.tagName.toLowerCase() === 'li') {
            const parent = element.parentElement;
            if (parent && parent.tagName.toLowerCase() === 'ul') {
                return true;
            }
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isBulletList(element.parentElement);
        }

        return false;
    }

    /**
     * Check if element or its parents is an ordered list
     */
    private isOrderedList(element: HTMLElement | null): boolean {
        if (!element) return false;

        if (element.tagName.toLowerCase() === 'ol') {
            return true;
        }

        // Check if inside a list item that's in an ol
        if (element.tagName.toLowerCase() === 'li') {
            const parent = element.parentElement;
            if (parent && parent.tagName.toLowerCase() === 'ol') {
                return true;
            }
        }

        // Check parent elements
        if (element.parentElement && element.parentElement !== this.editorElement) {
            return this.isOrderedList(element.parentElement);
        }

        return false;
    }

    /**
     * Get the parent element of the current selection
     */
    private getSelectionParentElement(): HTMLElement | null {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return null;

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        if (container.nodeType === Node.TEXT_NODE) {
            return container.parentElement;
        }

        return container as HTMLElement;
    }

    private toggleInlineTag(
        targetTag: string,
        aliases: string[],
    ): void {
        const selection = window.getSelection();
        const range = this.getSelectionRange(selection);
        if (!selection || !range || range.collapsed) {
            return;
        }

        const startElement = this.getBoundaryElement(range, true);
        const endElement = this.getBoundaryElement(range, false);
        const tagSet = new Set(aliases.map((tag) => tag.toLowerCase()));
        tagSet.add(targetTag.toLowerCase());

        const commonAncestor = this.findCommonTagAncestor(
            startElement,
            endElement,
            tagSet,
        );
        if (commonAncestor) {
            this.unwrapElement(commonAncestor);
            return;
        }

        const wrapper = document.createElement(targetTag);
        this.wrapRange(range, wrapper);
    }

    private toggleList(listTag: "ul" | "ol"): void {
        const block = this.getClosestBlockElement();
        if (!block) return;

        const currentList = this.findClosestWithinEditor(block, "ul, ol");
        if (currentList) {
            const currentTag = currentList.tagName.toLowerCase();
            if (currentTag === listTag) {
                this.unwrapList(currentList);
            } else {
                this.replaceTagName(currentList, listTag);
            }
            return;
        }

        const list = document.createElement(listTag);
        const listItem = document.createElement("li");
        while (block.firstChild) {
            listItem.appendChild(block.firstChild);
        }
        list.appendChild(listItem);
        block.replaceWith(list);
    }

    private toggleBlockTag(tagName: "blockquote"): void {
        const block = this.getClosestBlockElement();
        if (!block) return;

        const current = this.findClosestWithinEditor(block, tagName);
        if (current) {
            this.unwrapElement(current);
            return;
        }

        const wrapper = document.createElement(tagName);
        block.replaceWith(wrapper);
        wrapper.appendChild(block);
    }

    private unwrapList(list: HTMLElement): void {
        const parent = list.parentNode;
        if (!parent) return;

        const fragment = document.createDocumentFragment();
        const items = Array.from(list.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement,
        );
        for (const item of items) {
            if (item.tagName.toLowerCase() !== "li") continue;
            const paragraph = document.createElement("p");
            while (item.firstChild) {
                paragraph.appendChild(item.firstChild);
            }
            fragment.appendChild(paragraph);
        }

        if (!fragment.firstChild) {
            const paragraph = document.createElement("p");
            paragraph.appendChild(document.createElement("br"));
            fragment.appendChild(paragraph);
        }

        parent.insertBefore(fragment, list);
        parent.removeChild(list);
    }

    private getClosestBlockElement(): HTMLElement | null {
        const base = this.getSelectionParentElement();
        if (!base) return null;

        return (
            this.findClosestWithinEditor(
                base,
                "h1, h2, h3, h4, h5, h6, p, div, li, blockquote",
            ) ?? base
        );
    }

    private getSelectionRange(selection: Selection | null): Range | null {
        if (!selection || selection.rangeCount === 0) return null;
        const range = selection.getRangeAt(0);
        const start = this.getNodeElement(range.startContainer);
        const end = this.getNodeElement(range.endContainer);
        if (!start || !end) return null;
        if (!this.editorElement.contains(start) || !this.editorElement.contains(end)) {
            return null;
        }
        return range;
    }

    private getNodeElement(node: Node | null): HTMLElement | null {
        if (!node) return null;
        if (node instanceof HTMLElement) return node;
        return node.parentElement;
    }

    private getBoundaryElement(range: Range, isStart: boolean): HTMLElement | null {
        const container = isStart ? range.startContainer : range.endContainer;
        const offset = isStart ? range.startOffset : range.endOffset;

        if (container.nodeType === Node.ELEMENT_NODE) {
            const element = container as Element;
            const index = isStart ? offset : Math.max(0, offset - 1);
            const child = element.childNodes.item(index);
            if (child) {
                const childElement = this.getNodeElement(child);
                if (childElement) {
                    return childElement;
                }
            }
        }

        return this.getNodeElement(container);
    }

    private findClosestWithinEditor(
        element: HTMLElement | null,
        selector: string,
    ): HTMLElement | null {
        if (!element) return null;
        const hit = element.closest(selector);
        if (!(hit instanceof HTMLElement)) return null;
        if (!this.editorElement.contains(hit)) return null;
        return hit;
    }

    private findCommonTagAncestor(
        start: HTMLElement | null,
        end: HTMLElement | null,
        tagSet: Set<string>,
    ): HTMLElement | null {
        let cursor = start;
        while (cursor && cursor !== this.editorElement) {
            const tagName = cursor.tagName.toLowerCase();
            if (tagSet.has(tagName) && end && cursor.contains(end)) {
                return cursor;
            }
            cursor = cursor.parentElement;
        }
        return null;
    }

    private wrapRange(range: Range, wrapper: HTMLElement): void {
        try {
            range.surroundContents(wrapper);
            return;
        } catch {
            const fragment = range.extractContents();
            if (!fragment.hasChildNodes()) {
                return;
            }
            wrapper.appendChild(fragment);
            range.insertNode(wrapper);
        }
    }

    private collectIntersectingElements(
        range: Range,
        selector: string,
    ): HTMLElement[] {
        const base = this.getNodeElement(range.commonAncestorContainer);
        if (!base) return [];

        const root = this.findClosestWithinEditor(base, "*") ?? this.editorElement;
        const candidates = Array.from(root.querySelectorAll(selector)).filter(
            (node): node is HTMLElement => node instanceof HTMLElement,
        );
        return candidates.filter((node) => range.intersectsNode(node));
    }

    private replaceTagName(element: HTMLElement, tagName: string): HTMLElement {
        const replacement = document.createElement(tagName);
        for (const attr of Array.from(element.attributes)) {
            if (attr.name === "data-block-id") continue;
            replacement.setAttribute(attr.name, attr.value);
        }
        while (element.firstChild) {
            replacement.appendChild(element.firstChild);
        }
        element.replaceWith(replacement);
        return replacement;
    }

	/**
	 * Clear all formatting
	 */
	clearFormatting(): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			this.editorElement.focus();
			return;
		}

		// 選択範囲を正規化してからフォーマット解除を実行
		const ranges: Range[] = [];
		for (let i = 0; i < selection.rangeCount; i++) {
			const range = selection.getRangeAt(i);
			this.normalizeRangeTextBoundaries(range);
			ranges.push(range.cloneRange());
		}

		// mark / strike / underline / bold / italic / link / 背景色などを明示的に解除
		for (const range of ranges) {
			this.stripCustomInlineFormatting(range);
		}

		this.editorElement.focus();
	}

	getEditorElement(): HTMLElement {
		return this.editorElement;
	}

	/**
	 * removeFormat が処理しないカスタム装飾を除去する
	 */
	protected stripCustomInlineFormatting(range: Range): void {
		const root = this.editorElement;
		const walker = document.createTreeWalker(
			range.commonAncestorContainer,
			NodeFilter.SHOW_TEXT,
			{
				acceptNode: (node) => {
					if (!(node instanceof Text)) {
						return NodeFilter.FILTER_SKIP;
					}
					if (!root.contains(node)) {
						return NodeFilter.FILTER_SKIP;
					}
					if (!this.isNodeWithinRange(node, range)) {
						return NodeFilter.FILTER_SKIP;
					}
					if (node.nodeValue === null || node.nodeValue.length === 0) {
						return NodeFilter.FILTER_SKIP;
					}
					return NodeFilter.FILTER_ACCEPT;
				},
			}
		);

		const textNodes: Text[] = [];
		while (walker.nextNode()) {
			textNodes.push(walker.currentNode as Text);
		}

		for (const textNode of textNodes) {
			this.unwrapFormattingForTextNode(textNode);
		}

		this.removeRedundantSpans(range);
	}

	private normalizeRangeTextBoundaries(range: Range): void {
		// end側から先に分割することでoffsetへの影響を最小化
		const endContainer = range.endContainer;
		if (
			endContainer.nodeType === Node.TEXT_NODE &&
			range.endOffset > 0 &&
			range.endOffset < (endContainer.textContent?.length ?? 0)
		) {
			const text = endContainer as Text;
			const newNode = text.splitText(range.endOffset);
			range.setEnd(newNode, 0);
		}

		const startContainer = range.startContainer;
		if (
			startContainer.nodeType === Node.TEXT_NODE &&
			range.startOffset > 0 &&
			range.startOffset < (startContainer.textContent?.length ?? 0)
		) {
			const text = startContainer as Text;
			const newNode = text.splitText(range.startOffset);
			range.setStart(newNode, 0);
		}
	}

	private unwrapFormattingForTextNode(textNode: Text): void {
		let current: HTMLElement | null = textNode.parentElement;
		while (current && current !== this.editorElement) {
			if (this.isFormattingElement(current)) {
				this.extractNodeFromAncestor(textNode, current);
				current = textNode.parentElement;
				continue;
			}
			current = current.parentElement;
		}
	}

		private isFormattingElement(element: HTMLElement): boolean {
			const tag = element.tagName.toLowerCase();
			if (
				tag === "mark" ||
				tag === "a" ||
				tag === "b" ||
				tag === "strong" ||
				tag === "i" ||
				tag === "em" ||
				tag === "del" ||
				tag === "s" ||
				tag === "strike" ||
				tag === "u"
			) {
			return true;
		}

		// インラインスタイルによる装飾を判定（外部CSS由来を避けるためstyle属性有無も確認）
		const styleAttr = element.getAttribute("style") ?? "";
		if (!styleAttr) {
			return false;
		}

		const style = element.style;
		const hasUnderline =
			style.textDecorationLine.includes("underline") ||
			style.textDecoration.includes("underline");
			const hasStrikethrough =
				style.textDecorationLine.includes("line-through") ||
				style.textDecoration.includes("line-through");
			const hasBold =
				style.fontWeight === "bold" ||
				style.fontWeight === "700" ||
				Number.parseInt(style.fontWeight, 10) >= 700;
			const hasItalic = style.fontStyle === "italic";
			const backgroundColor = style.backgroundColor ?? "";
			const hasBackground =
				backgroundColor !== "" && backgroundColor !== "rgba(0, 0, 0, 0)";

			return hasUnderline || hasStrikethrough || hasBold || hasItalic || hasBackground;
		}

	private removeRedundantSpans(range: Range): void {
		const root = this.editorElement;
		const walker = document.createTreeWalker(
			range.commonAncestorContainer,
			NodeFilter.SHOW_ELEMENT,
			{
				acceptNode: (node) => {
					if (!(node instanceof HTMLElement)) {
						return NodeFilter.FILTER_SKIP;
					}
					if (!root.contains(node)) {
						return NodeFilter.FILTER_SKIP;
					}
					if (!range.intersectsNode(node)) {
						return NodeFilter.FILTER_SKIP;
					}
					if (!this.isRedundantSpan(node)) {
						return NodeFilter.FILTER_SKIP;
					}
					return NodeFilter.FILTER_ACCEPT;
				},
			}
		);

		const targets: HTMLElement[] = [];
		while (walker.nextNode()) {
			targets.push(walker.currentNode as HTMLElement);
		}

		for (const el of targets) {
			this.unwrapElement(el);
		}
	}

	private isRedundantSpan(element: HTMLElement): boolean {
		if (element.tagName.toLowerCase() !== "span") {
			return false;
		}

		// style以外の属性があればそのまま残す
		if (element.attributes.length > 1) {
			return false;
		}
		if (element.attributes.length === 1) {
			const attr = element.attributes[0];
			if (attr.name.toLowerCase() !== "style") {
				return false;
			}
		}

		const style = element.style;
		const allowedProps = new Set([
			"backgroundColor",
			"letterSpacing",
			"caretColor",
		]);

		for (let i = 0; i < style.length; i++) {
			const prop = style.item(i);
			if (prop.startsWith("--")) {
				return false;
			}
			if (!allowedProps.has(this.toCamelCase(prop))) {
				return false;
			}
		}

		const bg = style.backgroundColor ?? "";
		const isTransparentBg =
			bg === "" || bg === "transparent" || bg === "rgba(0, 0, 0, 0)";
		const letterSpacing = style.letterSpacing ?? "";
		const isZeroLetterSpacing =
			letterSpacing === "" ||
			letterSpacing === "0" ||
			letterSpacing === "0px" ||
			letterSpacing === "0em";
		const caret = style.caretColor ?? "";
		const isDefaultCaret = caret === "" || caret === "auto";

		return isTransparentBg && isZeroLetterSpacing && isDefaultCaret;
	}

	private unwrapElement(element: HTMLElement): void {
		const parent = element.parentNode;
		if (!parent) {
			return;
		}
		while (element.firstChild) {
			parent.insertBefore(element.firstChild, element);
		}
		parent.removeChild(element);
	}

	private toCamelCase(prop: string): string {
		return prop.replace(/-([a-z])/g, (_m, g1) => g1.toUpperCase());
	}

	private extractNodeFromAncestor(node: Node, ancestor: HTMLElement): void {
		if (!ancestor.contains(node)) {
			return;
		}
		const parent = ancestor.parentNode;
		if (!parent) {
			return;
		}

		const beforeFragment = document.createDocumentFragment();
		const afterFragment = document.createDocumentFragment();
		let current = ancestor.firstChild;
		let passedTarget = false;
		while (current) {
			const next = current.nextSibling;
			if (current === node) {
				passedTarget = true;
			} else if (!passedTarget) {
				beforeFragment.appendChild(current);
			} else {
				afterFragment.appendChild(current);
			}
			current = next;
		}

		if (beforeFragment.childNodes.length > 0) {
			const beforeWrapper = ancestor.cloneNode(false) as HTMLElement;
			beforeWrapper.appendChild(beforeFragment);
			parent.insertBefore(beforeWrapper, ancestor);
		}

		parent.insertBefore(node, ancestor);

		if (afterFragment.childNodes.length > 0) {
			const afterWrapper = ancestor.cloneNode(false) as HTMLElement;
			afterWrapper.appendChild(afterFragment);
			parent.insertBefore(afterWrapper, ancestor.nextSibling);
		}

		parent.removeChild(ancestor);
	}

	private isNodeWithinRange(node: Node, range: Range): boolean {
		// Textノードが選択範囲と交差していれば対象とする（等しい場合も含む）
		return range.intersectsNode(node);
	}
}
