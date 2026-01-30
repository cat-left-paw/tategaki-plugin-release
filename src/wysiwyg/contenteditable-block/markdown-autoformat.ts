/**
 * Markdown Auto-format for ContentEditable Block Editor
 * Automatically converts Markdown syntax to formatted HTML when typing
 */

export interface MarkdownPattern {
	pattern: RegExp;
	type: 'heading' | 'bold' | 'italic' | 'strikethrough' | 'list';
	handler: (match: RegExpMatchArray, block: HTMLElement) => boolean;
}

export class MarkdownAutoFormat {
	/**
	 * Markdownパターンのチェックと変換
	 * スペースキーまたはEnterキー入力時に呼び出される
	 */
	static tryAutoFormat(block: HTMLElement): boolean {
		if (!block) return false;

		const text = block.textContent || '';

		// 見出しパターン: ### 見出し
		const headingMatch = text.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			return this.formatHeading(block, headingMatch);
		}

		// 太字パターン: **text**
		const boldMatch = text.match(/^(.*)\*\*([^*]+)\*\*(.*)$/);
		if (boldMatch) {
			return this.formatBold(block, boldMatch);
		}

		// 斜体パターン: *text*
		const italicMatch = text.match(/^(.*)\*([^*]+)\*(.*)$/);
		if (italicMatch) {
			return this.formatItalic(block, italicMatch);
		}

		// 取り消し線パターン: ~~text~~
		const strikeMatch = text.match(/^(.*)~~([^~]+)~~(.*)$/);
		if (strikeMatch) {
			return this.formatStrikethrough(block, strikeMatch);
		}

		// ハイライトパターン: ==text==
		const highlightMatch = text.match(/^(.*)==([^=]+)==(.*)$/);
		if (highlightMatch) {
			return this.formatHighlight(block, highlightMatch);
		}

		return false;
	}

	/**
	 * 見出しへの変換: ### 見出し3 → <h3>見出し3</h3>
	 */
	private static formatHeading(block: HTMLElement, match: RegExpMatchArray): boolean {
		const level = match[1].length; // # の数
		const text = match[2];

		if (level < 1 || level > 6) return false;

		// 既に見出しタグの場合は何もしない
		if (block.tagName.match(/^H[1-6]$/)) return false;

		// 見出しHTMLを作成
		const heading = document.createElement(`h${level}`);
		heading.textContent = text;

		// ブロック要素を置き換え
		if (block.parentElement) {
			block.parentElement.replaceChild(heading, block);

			// カーソルを末尾に移動
			const range = document.createRange();
			const sel = window.getSelection();
			range.selectNodeContents(heading);
			range.collapse(false);
			sel?.removeAllRanges();
			sel?.addRange(range);

			return true;
		}

		return false;
	}

	/**
	 * 太字への変換: **text** → <strong>text</strong>
	 */
	private static formatBold(block: HTMLElement, match: RegExpMatchArray): boolean {
		const before = match[1];
		const boldText = match[2];
		const after = match[3];

		// HTMLを構築
		block.innerHTML = '';

		if (before) {
			block.appendChild(document.createTextNode(before));
		}

		const strong = document.createElement('strong');
		strong.textContent = boldText;
		block.appendChild(strong);

		if (after) {
			block.appendChild(document.createTextNode(after));
		}

		// カーソルを<strong>の直後に移動
		const range = document.createRange();
		const sel = window.getSelection();
		range.setStartAfter(strong);
		range.collapse(true);
		sel?.removeAllRanges();
		sel?.addRange(range);

		return true;
	}

	/**
	 * 斜体への変換: *text* → <em>text</em>
	 */
	private static formatItalic(block: HTMLElement, match: RegExpMatchArray): boolean {
		const before = match[1];
		const italicText = match[2];
		const after = match[3];

		// 太字パターン(**) と重複しないようチェック
		if (before.endsWith('*') || after.startsWith('*')) {
			return false;
		}

		// HTMLを構築
		block.innerHTML = '';

		if (before) {
			block.appendChild(document.createTextNode(before));
		}

		const em = document.createElement('em');
		em.textContent = italicText;
		block.appendChild(em);

		if (after) {
			block.appendChild(document.createTextNode(after));
		}

		// カーソルを<em>の直後に移動
		const range = document.createRange();
		const sel = window.getSelection();
		range.setStartAfter(em);
		range.collapse(true);
		sel?.removeAllRanges();
		sel?.addRange(range);

		return true;
	}

	/**
	 * 取り消し線への変換: ~~text~~ → <del>text</del>
	 */
	private static formatStrikethrough(block: HTMLElement, match: RegExpMatchArray): boolean {
		const before = match[1];
		const strikeText = match[2];
		const after = match[3];

		// HTMLを構築
		block.innerHTML = '';

		if (before) {
			block.appendChild(document.createTextNode(before));
		}

		const del = document.createElement('del');
		del.textContent = strikeText;
		block.appendChild(del);

		if (after) {
			block.appendChild(document.createTextNode(after));
		}

		// カーソルを<del>の直後に移動
		const range = document.createRange();
		const sel = window.getSelection();
		range.setStartAfter(del);
		range.collapse(true);
		sel?.removeAllRanges();
		sel?.addRange(range);

		return true;
	}

	/**
	 * ハイライトへの変換: ==text== → <mark>text</mark>
	 */
	private static formatHighlight(block: HTMLElement, match: RegExpMatchArray): boolean {
		const before = match[1];
		const highlightText = match[2];
		const after = match[3];

		// HTMLを構築
		block.innerHTML = '';

		if (before) {
			block.appendChild(document.createTextNode(before));
		}

		const mark = document.createElement('mark');
		mark.textContent = highlightText;
		block.appendChild(mark);

		if (after) {
			block.appendChild(document.createTextNode(after));
		}

		// カーソルを<mark>の直後に移動
		const range = document.createRange();
		const sel = window.getSelection();
		range.setStartAfter(mark);
		range.collapse(true);
		sel?.removeAllRanges();
		sel?.addRange(range);

		return true;
	}

	/**
	 * 行頭でのリストマーカーチェック
	 * - item → <li>item</li> (unordered list)
	 * 1. item → <li>item</li> (ordered list)
	 */
	static tryFormatListMarker(block: HTMLElement): boolean {
		const text = (block.textContent || '').trim();

		// 箇条書きリスト: -, *, +
		const unorderedMatch = text.match(/^[-*+]\s+(.+)$/);
		if (unorderedMatch) {
			return this.formatUnorderedList(block, unorderedMatch[1]);
		}

		// 番号付きリスト: 1. item
		const orderedMatch = text.match(/^(\d+)\.\s+(.+)$/);
		if (orderedMatch) {
			return this.formatOrderedList(block, orderedMatch[2]);
		}

		return false;
	}

	private static formatUnorderedList(block: HTMLElement, text: string): boolean {
		// TODO: リスト構造の実装（将来的に）
		// 現在は簡易的にテキストのみ変更
		block.textContent = '• ' + text;
		return true;
	}

	private static formatOrderedList(block: HTMLElement, text: string): boolean {
		// TODO: リスト構造の実装（将来的に）
		return false;
	}
}
