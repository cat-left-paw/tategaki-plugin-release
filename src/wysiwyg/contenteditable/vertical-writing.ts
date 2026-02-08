/**
 * Vertical Writing Style Manager
 * Handles vertical text layout and styling for ContentEditable editor
 */

import { TategakiV2Settings } from "../../types/settings";

export class VerticalWritingManager {
    private element: HTMLElement;
    private settings: TategakiV2Settings;
    private isVertical = true;

    constructor(element: HTMLElement, settings: TategakiV2Settings) {
        this.element = element;
        this.settings = settings;
    }

    /**
     * Apply vertical writing styles
     */
	applyVerticalStyles(): void {
		this.isVertical = true;

		this.element.style.writingMode = "vertical-rl";
		this.element.style.textOrientation = "mixed";
		this.element.style.lineBreak = "auto";
		this.element.style.wordBreak = "normal";
		this.element.style.overflowWrap = "normal";

		this.applyRubyStyles();
		this.applyTcyStyles();
	}

	applyHorizontalStyles(): void {
		this.isVertical = false;

		this.element.style.writingMode = "horizontal-tb";
		this.element.style.textOrientation = "mixed";
		this.element.style.lineBreak = "auto";
		this.element.style.wordBreak = "break-word";
		this.element.style.overflowWrap = "break-word";

		this.applyRubyStyles();
		this.applyTcyStyles();
	}

    /**
     * Toggle between vertical and horizontal writing
     */
    toggleWritingMode(): void {
        if (this.isVertical) {
            this.applyHorizontalStyles();
        } else {
            this.applyVerticalStyles();
        }
    }

    /**
     * Apply ruby (furigana) styles
     */
    private applyRubyStyles(): void {
        const styleId = 'contenteditable-ruby-styles';
        let styleEl = document.getElementById(styleId) as HTMLStyleElement;

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        styleEl.textContent = `
            .tategaki-contenteditable-editor ruby {
                ruby-position: over;
            }

            .tategaki-contenteditable-editor ruby rt {
                font-size: 0.5em;
                line-height: 1;
            }
        `;
    }

    /**
     * Apply tatechuyoko (縦中横) styles
     */
    private applyTcyStyles(): void {
        const styleId = 'contenteditable-tcy-styles';
        let styleEl = document.getElementById(styleId) as HTMLStyleElement;

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        styleEl.textContent = `
            .tategaki-contenteditable-editor .tcy,
            .tategaki-contenteditable-editor [style*="text-combine-upright"] {
                text-combine-upright: all;
                -webkit-text-combine: horizontal;
                -ms-text-combine-horizontal: all;
            }
        `;
    }

    /**
     * Get current writing mode
     */
    isVerticalMode(): boolean {
        return this.isVertical;
    }

    /**
     * Update settings
     */
	updateSettings(settings: TategakiV2Settings): void {
		this.settings = settings;
		if (settings.common.writingMode === "vertical-rl") {
			this.applyVerticalStyles();
		} else {
			this.applyHorizontalStyles();
		}
	}

    /**
     * Clean up styles
     */
    destroy(): void {
        // Remove style elements
        const rubyStyleEl = document.getElementById('contenteditable-ruby-styles');
        if (rubyStyleEl) {
            rubyStyleEl.remove();
        }

        const tcyStyleEl = document.getElementById('contenteditable-tcy-styles');
        if (tcyStyleEl) {
            tcyStyleEl.remove();
        }
    }
}
