import {
	applyAozoraRubyToElement,
	convertAozoraRubySyntaxToHtml,
	convertRubyElementsToAozora,
} from "../../shared/aozora-ruby";
import type { App, Component } from "obsidian";

/**
 * Markdown ↔ HTML Converter for ContentEditable Editor
 * Handles bidirectional conversion while preserving HTML tags
 */
export interface MarkdownToHtmlOptions {
	enableRuby?: boolean;
	app?: App;
	sourcePath?: string;
	component?: Component;
}

export class MarkdownConverter {
	private static obsidianModule:
		| typeof import("obsidian")
		| null
		| undefined;

	private static async loadObsidianModule(): Promise<
		typeof import("obsidian") | null
	> {
		if (this.obsidianModule !== undefined) {
			return this.obsidianModule;
		}
		try {
			this.obsidianModule = await import("obsidian");
		} catch {
			this.obsidianModule = null;
		}
		return this.obsidianModule;
	}

	/**
	 * Convert Markdown to HTML
	 * ObsidianのMarkdownRendererを優先し、利用できない場合は従来ロジックにフォールバック
	 */
	static async markdownToHtml(
		markdown: string,
		options: MarkdownToHtmlOptions = {}
	): Promise<string> {
		if (!markdown) return "";

		const enableRuby = options.enableRuby ?? true;
		const app =
			options.app ??
			(typeof window !== "undefined" ? (window as any).app : null);
		const sourcePath = options.sourcePath ?? "";

		if (!app || typeof document === "undefined") {
			return this.legacyMarkdownToHtml(markdown, { enableRuby });
		}

		const obsidianModule = await this.loadObsidianModule();
		if (!obsidianModule) {
			return this.legacyMarkdownToHtml(markdown, { enableRuby });
		}

		const { MarkdownRenderer, MarkdownRenderChild } = obsidianModule;
		const container = document.createElement("div");
		const renderChild =
			options.component ?? new MarkdownRenderChild(container);
		const shouldDispose = !options.component;

		try {
			await MarkdownRenderer.render(
				app,
				markdown,
				container,
				sourcePath,
				renderChild
			);
		} catch {
			if (shouldDispose) {
				renderChild.unload();
			}
			return this.legacyMarkdownToHtml(markdown, { enableRuby });
		}

		if (enableRuby) {
			applyAozoraRubyToElement(container);
		}

		let html = this.extractRenderedHtml(container);
		if (!enableRuby) {
			// 青空文庫形式のまま表示（追加の「｜」は付与しない）
			html = convertRubyElementsToAozora(html, { addDelimiter: false });
		}

		if (shouldDispose) {
			renderChild.unload();
		}

		return html;
	}

	private static extractRenderedHtml(container: HTMLElement): string {
		const nodes = Array.from(container.childNodes);
		if (nodes.length === 0) {
			return "";
		}
		if (nodes.length === 1) {
			const only = nodes[0];
			if (only instanceof HTMLElement && only.tagName === "P") {
				return only.innerHTML;
			}
		}
		return nodes
			.map((node) => {
				if (node instanceof HTMLElement) {
					return node.outerHTML;
				}
				if (node.nodeType === Node.TEXT_NODE) {
					return node.textContent ?? "";
				}
				return "";
			})
			.join("");
	}

	private static legacyMarkdownToHtml(
		markdown: string,
		options: MarkdownToHtmlOptions = {}
	): string {
		if (!markdown) return "";

		let html = markdown;
		const enableRuby = options.enableRuby ?? true;

		// Preserve HTML tags by replacing them with placeholders
		const htmlTags: string[] = [];
		html = html.replace(/(<[^>]+>)/g, (match) => {
			const index = htmlTags.length;
			htmlTags.push(match);
			return `\u200B\u200BHTMLTAG${index}\u200B\u200B`;
		});

		// Convert markdown syntax to HTML
		// Headers (must be at the start of a line)
		html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
		html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
		html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
		html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
		html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
		html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

		// Blockquotes
		html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");

		// Horizontal rules
		html = html.replace(/^---$/gm, "<hr>");
		html = html.replace(/^\*\*\*$/gm, "<hr>");

		// Code blocks (must be processed before inline code and lists)
		html = this.processCodeBlocks(html);

		// Lists - Process line by line to handle nesting
		html = this.processLists(html);

		// Bold (strong)
		html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
		html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

		// Italic (em)
		html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
		html = html.replace(/_(.+?)_/g, "<em>$1</em>");

		// Strikethrough
		html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

		// Highlight (Obsidian syntax: ==text==)
		html = html.replace(/==(.+?)==/g, "<mark>$1</mark>");

		// Code (inline)
		html = html.replace(/`(.+?)`/g, "<code>$1</code>");

		// Links
		html = html.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			'<a href="$2">$1</a>'
		);

		// Images
		html = html.replace(
			/!\[([^\]]*)\]\(([^)]+)\)/g,
			'<img src="$2" alt="$1">'
		);

		// Restore HTML tags before line processing
		htmlTags.forEach((tag, index) => {
			const placeholder = `\u200B\u200BHTMLTAG${index}\u200B\u200B`;
			while (html.includes(placeholder)) {
				html = html.replace(placeholder, tag);
			}
		});

		// Process lines - preserve leading spaces for indentation
		const lines = html.split("\n");
		const processedLines: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// Strict preview break placeholder: convert back to <br> without doubling
			const strictBreakMatch = trimmed.match(/^⦦TATEGAKI-BREAKS:(\d+)⦧$/);
			if (strictBreakMatch) {
				const breakCount = Math.max(
					0,
					parseInt(strictBreakMatch[1], 10) || 0
				);
				if (breakCount > 0) {
					processedLines.push("<br>".repeat(breakCount));
				}
				continue;
			}

			// Empty line - add <br> to create visual space
			if (!trimmed) {
				processedLines.push("<br>");
				continue;
			}

			// Check if line is already an HTML element
			if (trimmed.match(/^<(h[1-6]|blockquote|ul|ol|li|hr|p|div|img)/)) {
				processedLines.push(trimmed);
				continue;
			}

			// Regular text line - preserve leading spaces (including full-width spaces) by converting to &nbsp;
			const leadingSpaces = line.match(/^([\s\u3000]+)/);
			let processedLine = trimmed;
			if (leadingSpaces) {
				const spaces = leadingSpaces[1]
					.replace(/ /g, "&nbsp;")
					.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
					.replace(/\u3000/g, "\u3000"); // 全角スペースはそのまま保持
				processedLine = spaces + trimmed;
			}

			processedLines.push(processedLine);

			// Add <br> if not last line and next line is not empty
			if (i < lines.length - 1) {
				const nextLine = lines[i + 1]?.trim();
				if (nextLine) {
					processedLines.push("<br>");
				}
			}
		}

		html = processedLines.join("");
		if (enableRuby) {
			html = convertAozoraRubySyntaxToHtml(html);
		} else {
			// 青空文庫形式のまま表示（追加の「｜」は付与しない）
			html = convertRubyElementsToAozora(html, { addDelimiter: false });
		}

		return html;
	}

    /**
     * Process lists with proper nesting support
     */
    private static processLists(text: string): string {
        const lines = text.split('\n');
        const result: string[] = [];
        const listStack: Array<{type: 'ul' | 'ol', indent: number}> = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
            
            if (!match) {
                // Not a list item - close all open lists
                while (listStack.length > 0) {
                    const list = listStack.pop()!;
                    result.push(`</${list.type}>`);
                }
                result.push(line);
                continue;
            }
            
            const indent = match[1].length;
            const marker = match[2];
            const content = match[3];
            const listType: 'ul' | 'ol' = /^\d+\.$/.test(marker) ? 'ol' : 'ul';
            
            // Close lists with greater indent (deeper nesting that has ended)
            while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
                const list = listStack.pop()!;
                result.push(`</${list.type}>`);
            }
            
            // Check if we need to change list type at the same level
            if (listStack.length > 0 && listStack[listStack.length - 1].indent === indent) {
                const currentList = listStack[listStack.length - 1];
                if (currentList.type !== listType) {
                    // Different list type at same level - close and open new
                    listStack.pop();
                    result.push(`</${currentList.type}>`);
                    result.push(`<${listType}>`);
                    listStack.push({type: listType, indent});
                }
                // Same list type at same level - just add item
            } else if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
                // Open new list for deeper nesting or first list
                result.push(`<${listType}>`);
                listStack.push({type: listType, indent});
            }
            
            result.push(`<li>${content}</li>`);
        }
        
        // Close remaining lists
        while (listStack.length > 0) {
            const list = listStack.pop()!;
            result.push(`</${list.type}>`);
        }
        
        return result.join('');
    }

    /**
     * Process code blocks (```...```)
     */
    private static processCodeBlocks(text: string): string {
        const lines = text.split('\n');
        const result: string[] = [];
        let inCodeBlock = false;
        let codeBlockContent: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Check for code block start/end
            if (trimmed.match(/^```/)) {
                if (inCodeBlock) {
                    // End of code block
                    const codeText = codeBlockContent.join('\n');
                    result.push(`<pre><code>${codeText}</code></pre>`);
                    codeBlockContent = [];
                    inCodeBlock = false;
                } else {
                    // Start of code block
                    inCodeBlock = true;
                }
                continue;
            }
            
            if (inCodeBlock) {
                codeBlockContent.push(line);
            } else {
                result.push(line);
            }
        }
        
        // If code block wasn't closed, add it anyway
        if (inCodeBlock && codeBlockContent.length > 0) {
            const codeText = codeBlockContent.join('\n');
            result.push(`<pre><code>${codeText}</code></pre>`);
        }
        
        return result.join('\n');
    }

    /**
     * Convert HTML to Markdown
     * Preserves HTML tags that don't have markdown equivalents
     */
    static htmlToMarkdown(html: string, options: { trim?: boolean } = {}): string {
        if (!html) return '';

        let markdown = convertRubyElementsToAozora(html);

        // Preserve non-standard HTML tags (ruby, custom spans, etc.) with placeholders
        const preservedTags: Map<string, string> = new Map();
        let placeholderCount = 0;

        // Function to preserve a tag by replacing it with a unique placeholder
        const preserveTag = (match: string): string => {
            const placeholder = `__PRESERVED_TAG_${placeholderCount}__`;
            preservedTags.set(placeholder, match);
            placeholderCount++;
            return placeholder;
        };

        // Preserve span with attributes
        markdown = markdown.replace(/<span\s+[^>]*>[\s\S]*?<\/span>/gi, preserveTag);

        // Preserve div with attributes
        markdown = markdown.replace(/<div\s+[^>]*>[\s\S]*?<\/div>/gi, preserveTag);

        // Note: <mark> tags will be converted to ==text== syntax below, not preserved
        markdown = markdown.replace(/<abbr[^>]*>[\s\S]*?<\/abbr>/gi, preserveTag);
        markdown = markdown.replace(/<cite[^>]*>[\s\S]*?<\/cite>/gi, preserveTag);
        markdown = markdown.replace(/<time[^>]*>[\s\S]*?<\/time>/gi, preserveTag);
        markdown = markdown.replace(/<kbd[^>]*>[\s\S]*?<\/kbd>/gi, preserveTag);
        markdown = markdown.replace(/<var[^>]*>[\s\S]*?<\/var>/gi, preserveTag);
        markdown = markdown.replace(/<samp[^>]*>[\s\S]*?<\/samp>/gi, preserveTag);
        markdown = markdown.replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, preserveTag);
        markdown = markdown.replace(/<sub[^>]*>[\s\S]*?<\/sub>/gi, preserveTag);
        markdown = markdown.replace(/<small[^>]*>[\s\S]*?<\/small>/gi, preserveTag);
        markdown = markdown.replace(/<ins[^>]*>[\s\S]*?<\/ins>/gi, preserveTag);
        markdown = markdown.replace(/<u[^>]*>[\s\S]*?<\/u>/gi, preserveTag);

        // Self-closing tags with attributes
        markdown = markdown.replace(/<br\s+[^>]*>/gi, preserveTag);
        markdown = markdown.replace(/<hr\s+[^>]*>/gi, preserveTag);

        // Headers
        markdown = markdown.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n');
        markdown = markdown.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n');
        markdown = markdown.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n');
        markdown = markdown.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n');
        markdown = markdown.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n');
        markdown = markdown.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n');

        // Blockquotes
        markdown = markdown.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n');

        // Horizontal rules (only standard ones without attributes)
        markdown = markdown.replace(/<hr\s*\/?>/gi, '---\n');

        // Lists
        markdown = markdown.replace(/<ul[^>]*>/gi, '');
        markdown = markdown.replace(/<\/ul>/gi, '\n');
        markdown = markdown.replace(/<ol[^>]*>/gi, '');
        markdown = markdown.replace(/<\/ol>/gi, '\n');
        markdown = markdown.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

        // Bold
        markdown = markdown.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
        markdown = markdown.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');

        // Italic
        markdown = markdown.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
        markdown = markdown.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

        // Strikethrough
        markdown = markdown.replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~');
        markdown = markdown.replace(/<strike[^>]*>([\s\S]*?)<\/strike>/gi, '~~$1~~');
        markdown = markdown.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');

        // Highlight (Obsidian syntax: ==text==)
        markdown = markdown.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '==$1==');

        // Code
        markdown = markdown.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

        // Links
        markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

        // Images
        markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');

        // Line breaks (only standard ones without attributes)
        markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

        // Remove only standard HTML structural tags (p, div without attributes, span without attributes)
        markdown = markdown.replace(/<\/?p[^>]*>/gi, '\n');
        markdown = markdown.replace(/<div\s*>/gi, '');
        markdown = markdown.replace(/<\/div>/gi, '\n');
        markdown = markdown.replace(/<span\s*>/gi, '');
        markdown = markdown.replace(/<\/span>/gi, '');

        // Restore preserved tags (最後に追加したものから戻すことで入れ子構造を正しく復元)
        const preservedEntries = Array.from(preservedTags.entries()).reverse();
        preservedEntries.forEach(([placeholder, originalTag]) => {
            markdown = markdown.split(placeholder).join(originalTag);
        });

        // Decode HTML entities
        markdown = markdown.replace(/&lt;/g, '<');
        markdown = markdown.replace(/&gt;/g, '>');
        markdown = markdown.replace(/&amp;/g, '&');
        markdown = markdown.replace(/&quot;/g, '"');
        markdown = markdown.replace(/&#39;/g, "'");
        markdown = markdown.replace(/&nbsp;/g, ' ');

        // Clean up excessive newlines (3 or more -> 2)
        markdown = markdown.replace(/\n{3,}/g, '\n\n');

        // Trim
        const shouldTrim = options.trim ?? true;
        if (shouldTrim) {
            markdown = markdown.trim();
        }

        return markdown;
    }

    /**
     * Sanitize HTML to prevent XSS
     * (Basic implementation - in production, use a library like DOMPurify)
     */
    static sanitizeHtml(html: string): string {
        // For now, we'll allow most tags since this is for Obsidian
        // In a production environment, you'd want to use DOMPurify
        return html;
    }
}
