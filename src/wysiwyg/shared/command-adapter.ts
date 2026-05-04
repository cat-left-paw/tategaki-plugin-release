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
	toggleTaskList?: () => void;
	isTaskListActive?: () => boolean;
	toggleOrderedList?: () => void;
	isOrderedListActive?: () => boolean;
	toggleBlockquote?: () => void;
	isBlockquoteActive?: () => boolean;
	toggleCodeBlock?: () => void;
	isCodeBlockActive?: () => boolean;

	insertLink?: () => void;
	insertRuby?: () => void;
	toggleTcy?: () => void;
	isTcyActive?: () => boolean;
	insertTcy?: () => void;
	insertHorizontalRule?: () => void;
	clearTcy?: () => void;
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

	toggleTypewriterScroll?: () => void | Promise<void>;
	isTypewriterScrollEnabled?: () => boolean;
	toggleTypewriterBlockHighlight?: () => void | Promise<void>;
	isTypewriterBlockHighlightEnabled?: () => boolean;
	toggleTypewriterCurrentLineHighlight?: () => void | Promise<void>;
	isTypewriterCurrentLineHighlightEnabled?: () => boolean;
	toggleTypewriterNonFocusDim?: () => void | Promise<void>;
	isTypewriterNonFocusDimEnabled?: () => boolean;
	/**
	 * Typewriter 系機能が現在のモードで利用可能か。
	 * 保存値ではなく、source mode / plain text view / 段落プレーン編集など
	 * 「現在は使えない」状態を示す実効フラグ。未定義のときは利用可能扱い。
	 */
	isTypewriterAvailable?: () => boolean;
}
