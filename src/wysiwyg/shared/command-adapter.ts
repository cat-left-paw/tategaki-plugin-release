import type { App } from "obsidian";
import type { WritingMode } from "../../types/settings";

export interface CommandUiAdapter {
	app: App;
	isReadOnly?: () => boolean;
	hasSelection?: () => boolean;
	isInlineSelectionAllowed?: () => boolean;

	getWritingMode?: () => WritingMode;
	toggleWritingMode?: () => void;

	undo?: () => void;
	redo?: () => void;
	canUndo?: () => boolean;
	canRedo?: () => boolean;

	toggleBold?: () => void;
	isBoldActive?: () => boolean;
	toggleItalic?: () => void;
	isItalicActive?: () => boolean;
	toggleStrikethrough?: () => void;
	isStrikethroughActive?: () => boolean;
	toggleUnderline?: () => void;
	isUnderlineActive?: () => boolean;
	toggleHighlight?: () => void;
	isHighlightActive?: () => boolean;
	toggleInlineCode?: () => void;
	isInlineCodeActive?: () => boolean;

	setHeading?: (level: number) => void;
	clearHeading?: () => void;
	getHeadingLevel?: () => number;

	toggleBulletList?: () => void;
	isBulletListActive?: () => boolean;
	toggleOrderedList?: () => void;
	isOrderedListActive?: () => boolean;
	toggleBlockquote?: () => void;
	isBlockquoteActive?: () => boolean;
	toggleCodeBlock?: () => void;
	isCodeBlockActive?: () => boolean;

	insertLink?: () => void;
	insertRuby?: () => void;
	insertHorizontalRule?: () => void;
	clearFormatting?: () => void;

	toggleSourceMode?: () => void;
	isSourceMode?: () => boolean;
	isPlainTextView?: () => boolean;
	togglePlainTextView?: () => void;

	toggleRuby?: () => void;
	isRubyEnabled?: () => boolean;
	openSettings?: () => void;
	openOutline?: () => void;
	toggleReadingMode?: () => void;
	isReadingMode?: () => boolean;
	toggleAuxiliary?: () => void;
	isAuxiliaryEnabled?: () => boolean;
	toggleCeImeMode?: () => void;
	isCeImeMode?: () => boolean;
	openFileSwitcher?: () => void | Promise<void>;

	cut?: () => void | Promise<void>;
	copy?: () => void | Promise<void>;
	paste?: () => void | Promise<void>;
	selectAll?: () => void;
}
