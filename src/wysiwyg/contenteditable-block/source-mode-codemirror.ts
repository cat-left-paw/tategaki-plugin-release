/**
 * CodeMirror 6ベースのソースモードアダプター
 *
 * フェーズ1: 基本統合
 * - CodeMirror 6のEditorViewを管理
 * - Markdownの表示と編集
 * - 基本的なUndo/Redo
 */

import { EditorView, keymap, lineNumbers, drawSelection } from '@codemirror/view';
import { EditorState, Extension, EditorSelection, SelectionRange, ChangeSpec } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, indentWithTab, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

export interface EditorPosition {
	line: number;
	column: number;
	scrollTop: number;
}

export interface SourceCodeMirrorAdapter {
	// 初期化
	initialize(container: HTMLElement): void;

	// モード切替
	show(): void;
	hide(): void;
	isVisible(): boolean;

	// コンテンツ同期
	setMarkdown(markdown: string): void;
	getMarkdown(): string;

	// カーソル・スクロール位置
	savePosition(): EditorPosition;
	restorePosition(position: EditorPosition): void;

	// 編集操作
	undo(): void;
	redo(): void;

	// フォーマット（フェーズ3対応）
	applyInlineFormat(format: "bold" | "italic" | "underline" | "strikethrough"): boolean;
	toggleHeading(level: number): boolean;
	toggleList(type: "bullet" | "ordered"): boolean;
	toggleBlockquote(): boolean;
	insertHorizontalRule(): boolean;
	insertLink(url: string): boolean;
	clearFormatting(): boolean;
	insertText(text: string): boolean;
	hasSelection(): boolean;

	// イベント
	onUpdate(callback: (markdown: string) => void): void;

	// フォーカス
	focus(): void;

	// 破棄
	destroy(): void;
}

/**
 * SourceCodeMirrorAdapter実装
 */
export class SourceCodeMirrorAdapterImpl implements SourceCodeMirrorAdapter {
	private view: EditorView | null = null;
	private container: HTMLElement | null = null;
	private visible = false;
	private updateCallback: ((markdown: string) => void) | null = null;

	initialize(container: HTMLElement): void {
		this.container = container;

		// CodeMirrorの拡張機能を設定
		const extensions: Extension[] = [
			// 基本機能
			lineNumbers(),
			drawSelection(), // 選択機能を有効化
			syntaxHighlighting(defaultHighlightStyle),

			// 行折り返しを有効化
			EditorView.lineWrapping,

			// 仮想スクロールを無効化（全行をDOMに保持）
			// これにより、表示の不具合を防ぐ
			// EditorView.perLineDOM.of(true), // この設定は存在しないため削除

			// Markdown言語サポート
			markdown(),

			// 履歴
			history(),

			// 検索拡張は使用しない（WYSIWYGパネルから制御するため）
			// search(),

			// キーマップ
			keymap.of([
				// 検索パネルを開くキーバインドは削除（WYSIWYGパネルを使用）
				...historyKeymap,
				...defaultKeymap,
				indentWithTab
			]),

			// 更新リスナー
			EditorView.updateListener.of((update) => {
				if (update.docChanged && this.updateCallback) {
					const newMarkdown = this.getMarkdown();
					this.updateCallback(newMarkdown);
				}
			}),

			// コンテンツ領域の属性を設定
			EditorView.contentAttributes.of({
				'style': 'user-select: text !important; -webkit-user-select: text !important; -moz-user-select: text !important; cursor: text !important;'
			}),
			// Obsidianテーマの適用（基本）
			// 注意: !importantは使用しない（CodeMirrorのtheme APIでは動作しない）
			EditorView.theme({
				'&': {
					backgroundColor: 'var(--background-primary)',
					color: 'var(--text-normal)',
					height: '100%',
					direction: 'ltr',
					writingMode: 'horizontal-tb',
					textOrientation: 'mixed',
					pointerEvents: 'auto',
					userSelect: 'text',
					WebkitUserSelect: 'text',
					MozUserSelect: 'text',
					cursor: 'text'
				},
				'.cm-content': {
					fontFamily: 'var(--font-text)',
					fontSize: 'var(--font-text-size)',
					padding: '10px',
					direction: 'ltr',
					writingMode: 'horizontal-tb',
					textOrientation: 'mixed',
					lineHeight: '1.6',
					whiteSpace: 'pre-wrap',
					userSelect: 'text',
					WebkitUserSelect: 'text',
					MozUserSelect: 'text',
					cursor: 'text',
					caretColor: 'var(--text-normal)'
				},
				'.cm-line': {
					padding: '0 2px',
					lineHeight: '1.6',
					userSelect: 'text',
					WebkitUserSelect: 'text',
					MozUserSelect: 'text',
					cursor: 'text',
					whiteSpace: 'pre-wrap'
				},
				'&.cm-focused': {
					outline: 'none'
				},
				'.cm-scroller': {
					overflow: 'auto',
					overflowY: 'scroll',
					fontFamily: 'var(--font-text)',
					height: '100%'
				},
				'.cm-gutters': {
					backgroundColor: 'var(--background-secondary)',
					color: 'var(--text-muted)',
					border: 'none',
					fontSize: 'var(--font-text-size)',
					fontFamily: 'var(--font-text)'
				},
				'.cm-lineNumbers': {
					fontSize: 'var(--font-text-size)',
					fontFamily: 'var(--font-text)'
				},
				// アクティブ行のハイライトは削除（選択範囲が見えなくなるため）
				'.cm-selectionBackground, ::selection': {
					backgroundColor: 'var(--text-selection)'
				},
				'.cm-selectionMatch': {
					backgroundColor: 'var(--text-highlight-bg)'
				},
				'.cm-cursor': {
					borderLeftColor: 'var(--text-normal)'
				},
			})
		];

		// EditorViewを作成
		this.view = new EditorView({
			state: EditorState.create({
				doc: '',
				extensions
			}),
			parent: container
		});

		// コンテナのイベント伝播を制御
		// 親要素（Obsidian）からのイベントハンドラが干渉するのを防ぐ

		container.addEventListener('mousedown', (e) => {
			e.stopPropagation();
		}, true);

		container.addEventListener('mouseup', (e) => {
			e.stopPropagation();
		}, true);

		container.addEventListener('mousemove', (e) => {
			e.stopPropagation();
		}, true);

		container.addEventListener('click', (e) => {
			e.stopPropagation();
		}, true);

		// 初期状態は非表示
		this.hide();
	}

	show(): void {
		if (this.container) {
			this.container.style.display = 'block';
			this.visible = true;
		}
	}

	hide(): void {
		if (this.container) {
			this.container.style.display = 'none';
			this.visible = false;
		}
	}

	isVisible(): boolean {
		return this.visible;
	}

	setMarkdown(markdown: string): void {
		if (!this.view) return;

		// ドキュメント全体を置き換え
		this.view.dispatch({
			changes: {
				from: 0,
				to: this.view.state.doc.length,
				insert: markdown
			}
		});
	}

	getMarkdown(): string {
		if (!this.view) return '';
		return this.view.state.doc.toString();
	}

	savePosition(): EditorPosition {
		if (!this.view) {
			return { line: 0, column: 0, scrollTop: 0 };
		}

		const pos = this.view.state.selection.main.head;
		const line = this.view.state.doc.lineAt(pos);

		return {
			line: line.number - 1, // 0-indexed
			column: pos - line.from,
			scrollTop: this.view.scrollDOM.scrollTop
		};
	}

	restorePosition(position: EditorPosition): void {
		if (!this.view) return;

		try {
			// 行番号からポジションを計算（1-indexed）
			const line = this.view.state.doc.line(position.line + 1);
			const pos = Math.min(line.from + position.column, line.to);

			// カーソル位置を設定
			this.view.dispatch({
				selection: { anchor: pos, head: pos },
				scrollIntoView: true
			});

			// スクロール位置を復元
			requestAnimationFrame(() => {
				if (this.view) {
					this.view.scrollDOM.scrollTop = position.scrollTop;
				}
			});
		} catch (e) {
			console.error('Failed to restore position:', e);
			// エラー時は先頭に移動
			this.view.dispatch({
				selection: { anchor: 0, head: 0 }
			});
		}
	}

	undo(): void {
		if (!this.view) return;
		undo(this.view);
	}

	redo(): void {
		if (!this.view) return;
		redo(this.view);
	}

	hasSelection(): boolean {
		return !!this.view && !this.view.state.selection.main.empty;
	}

	applyInlineFormat(format: "bold" | "italic" | "underline" | "strikethrough"): boolean {
		switch (format) {
			case "bold":
				return this.wrapSelectionWithMarkers("**", "**", "太字にするテキスト");
			case "italic":
				return this.wrapSelectionWithMarkers("*", "*", "イタリックのテキスト");
			case "underline":
				return this.wrapSelectionWithMarkers("<u>", "</u>", "下線テキスト");
			case "strikethrough":
				return this.wrapSelectionWithMarkers("~~", "~~", "取り消し線のテキスト");
			default:
				return false;
		}
	}

	toggleHeading(level: number): boolean {
		return this.applyHeading(level);
	}

	toggleList(type: "bullet" | "ordered"): boolean {
		return this.applyList(type);
	}

	toggleBlockquote(): boolean {
		return this.applyBlockquote();
	}

	insertHorizontalRule(): boolean {
		return this.insertHorizontalRuleAtSelection();
	}

	insertLink(url: string): boolean {
		return this.insertLinkAtSelection(url);
	}

	clearFormatting(): boolean {
		return this.clearFormattingAtSelection();
	}

	insertText(text: string): boolean {
		if (!this.view) return false;
		if (!text) return true;

		const transaction = this.view.state.changeByRange((range) => ({
			changes: { from: range.from, to: range.to, insert: text },
			range: EditorSelection.range(range.from + text.length, range.from + text.length),
		}));

		this.view.dispatch({ ...transaction, scrollIntoView: true });
		this.view.focus();
		return true;
	}

	onUpdate(callback: (markdown: string) => void): void {
		this.updateCallback = callback;
	}

	focus(): void {
		if (this.view) {
			this.view.focus();
		}
	}

	destroy(): void {
		if (this.view) {
			this.view.destroy();
			this.view = null;
		}
		this.container = null;
		this.updateCallback = null;
	}

	private wrapSelectionWithMarkers(prefix: string, suffix: string, placeholder: string): boolean {
		const view = this.view;
		if (!view) {
			return false;
		}

		const { state } = view;
		const ranges = state.selection.ranges;
		const changes: ChangeSpec[] = [];
		const selections: SelectionRange[] = [];
		let changed = false;

		for (const range of ranges) {
			const from = range.from;
			const to = range.to;
			const selected = state.doc.sliceString(from, to);
			const before = state.doc.sliceString(Math.max(0, from - prefix.length), from);
			const after = state.doc.sliceString(to, Math.min(state.doc.length, to + suffix.length));

			if (before === prefix && after === suffix) {
				const changeFrom = from - prefix.length;
				const changeTo = to + suffix.length;
				changes.push({ from: changeFrom, to: changeTo, insert: selected });
				selections.push(EditorSelection.range(changeFrom, changeFrom + selected.length));
				changed = true;
				continue;
			}

			if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length) {
				const inner = selected.slice(prefix.length, selected.length - suffix.length);
				changes.push({ from, to, insert: inner });
				selections.push(EditorSelection.range(from, from + inner.length));
				changed = true;
				continue;
			}

			const content = selected || placeholder;
			const wrapped = `${prefix}${content}${suffix}`;
			changes.push({ from, to, insert: wrapped });
			const start = from + prefix.length;
			selections.push(EditorSelection.range(start, start + content.length));
			changed = true;
		}

		if (!changed) {
			return false;
		}

		view.dispatch({
			changes,
			selection: EditorSelection.create(selections),
			scrollIntoView: true,
		});
		view.focus();
		return true;
	}

	private applyHeading(level: number): boolean {
		const view = this.view;
		if (!view) {
			return false;
		}

		const state = view.state;
		const doc = state.doc;
		const prefix = `${"#".repeat(level)} `;
		const processed = new Set<number>();
		const changes: ChangeSpec[] = [];
		let changed = false;

		for (const range of state.selection.ranges) {
			const startLine = doc.lineAt(range.from);
			const endLine = doc.lineAt(range.to);

			for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber++) {
				if (processed.has(lineNumber)) continue;
				processed.add(lineNumber);

				const line = doc.line(lineNumber);
				const text = line.text;
				const leading = text.match(/^\s*/)?.[0] ?? "";
				const rest = text.slice(leading.length);
				const headingMatch = rest.match(/^(#{1,6})\s+(.*)$/);
				const currentLevel = headingMatch ? headingMatch[1].length : null;
				const content = headingMatch ? headingMatch[2] : rest;

				if (currentLevel === level) {
					const plain = leading + (content || "\u200B");
					if (plain !== text) {
						changes.push({ from: line.from, to: line.to, insert: plain });
						changed = true;
					}
				} else {
					const cleaned = rest.replace(/^(#{1,6})\s+/, '');
					const finalContent = (cleaned || rest || "見出しテキスト");
					const newLine = `${leading}${prefix}${finalContent}`;
					if (newLine !== text) {
						changes.push({ from: line.from, to: line.to, insert: newLine });
						changed = true;
					}
				}
			}
		}

		if (!changed) {
			return false;
		}

		view.dispatch({ changes, scrollIntoView: true });
		view.focus();
		return true;
	}

	private applyList(type: "bullet" | "ordered"): boolean {
		const view = this.view;
		if (!view) {
			return false;
		}

		const state = view.state;
		const doc = state.doc;
		const processed = new Set<number>();
		const changes: ChangeSpec[] = [];
		let changed = false;
		let order = 1;

		for (const range of state.selection.ranges) {
			const startLine = doc.lineAt(range.from);
			const endLine = doc.lineAt(range.to);

			for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber++) {
				if (processed.has(lineNumber)) continue;
				processed.add(lineNumber);

				const line = doc.line(lineNumber);
				const text = line.text;
				const leading = text.match(/^\s*/)?.[0] ?? "";
				const rest = text.slice(leading.length);

				if (type === "bullet") {
					const bulletMatch = rest.match(/^([-*+])\s+(.*)$/);
					if (bulletMatch) {
						const plain = leading + (bulletMatch[2] || "\u200B");
						if (plain !== text) {
							changes.push({ from: line.from, to: line.to, insert: plain });
							changed = true;
						}
					} else {
						const cleaned = rest.replace(/^([-*+])\s+/, '');
						const finalContent = cleaned || "リスト項目";
						const newLine = `${leading}- ${finalContent}`;
						if (newLine !== text) {
							changes.push({ from: line.from, to: line.to, insert: newLine });
							changed = true;
						}
					}
				} else {
					const orderedMatch = rest.match(/^(\d+)\.\s+(.*)$/);
					if (orderedMatch) {
						const plain = leading + (orderedMatch[2] || "\u200B");
						if (plain !== text) {
							changes.push({ from: line.from, to: line.to, insert: plain });
							changed = true;
						}
					} else {
						const cleaned = rest.replace(/^([-*+])\s+/, '').replace(/^(\d+)\.\s+/, '');
						const finalContent = cleaned || `項目${order}`;
						const newLine = `${leading}${order}. ${finalContent}`;
						if (newLine !== text) {
							changes.push({ from: line.from, to: line.to, insert: newLine });
							changed = true;
						}
					}
					order++;
				}
			}
		}

		if (!changed) {
			return false;
		}

		view.dispatch({ changes, scrollIntoView: true });
		view.focus();
		return true;
	}

	private applyBlockquote(): boolean {
		const view = this.view;
		if (!view) {
			return false;
		}

		const state = view.state;
		const doc = state.doc;
		const processed = new Set<number>();
		const changes: ChangeSpec[] = [];
		let changed = false;

		for (const range of state.selection.ranges) {
			const startLine = doc.lineAt(range.from);
			const endLine = doc.lineAt(range.to);

			for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber++) {
				if (processed.has(lineNumber)) continue;
				processed.add(lineNumber);

				const line = doc.line(lineNumber);
				const text = line.text;
				const leading = text.match(/^\s*/)?.[0] ?? "";
				const rest = text.slice(leading.length);
				const quoteMatch = rest.match(/^>\s?(.*)$/);

				if (quoteMatch) {
					const plain = leading + (quoteMatch[1] || "\u200B");
					if (plain !== text) {
						changes.push({ from: line.from, to: line.to, insert: plain });
						changed = true;
					}
				} else {
					const cleaned = rest.replace(/^>\s?/, '');
					const content = cleaned || rest || "引用テキスト";
					const newLine = `${leading}> ${content}`;
					if (newLine !== text) {
						changes.push({ from: line.from, to: line.to, insert: newLine });
						changed = true;
					}
				}
			}
		}

		if (!changed) {
			return false;
		}

		view.dispatch({ changes, scrollIntoView: true });
		view.focus();
		return true;
	}

	private insertHorizontalRuleAtSelection(): boolean {
		const view = this.view;
		if (!view) {
			return false;
		}

		const state = view.state;
		const range = state.selection.main;
		const insert = range.empty ? "\n---\n" : "---";

		view.dispatch({
			changes: [{ from: range.from, to: range.to, insert }],
			selection: EditorSelection.range(range.from + insert.length, range.from + insert.length),
			scrollIntoView: true,
		});
		view.focus();
		return true;
	}

	private insertLinkAtSelection(url: string): boolean {
		const view = this.view;
		if (!view) {
			return false;
		}
		const { state } = view;
		const ranges = state.selection.ranges;
		const changes: ChangeSpec[] = [];
		const selections: SelectionRange[] = [];
		let changed = false;

		for (const range of ranges) {
			const from = range.from;
			const to = range.to;
			const selected = state.doc.sliceString(from, to);
			const content = selected || "リンクテキスト";

			const existingLinkMatch = selected.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
			if (existingLinkMatch) {
				const newLink = `[${existingLinkMatch[1]}](${url})`;
				if (newLink !== selected) {
					changes.push({ from, to, insert: newLink });
					selections.push(EditorSelection.range(from + 1, from + 1 + existingLinkMatch[1].length));
					changed = true;
				}
				continue;
			}

			const wrapped = `[${content}](${url})`;
			changes.push({ from, to, insert: wrapped });
			selections.push(EditorSelection.range(from + 1, from + 1 + content.length));
			changed = true;
		}

		if (!changed) {
			return false;
		}

		view.dispatch({
			changes,
			selection: EditorSelection.create(selections),
			scrollIntoView: true,
		});
		view.focus();
		return true;
	}

	private clearFormattingAtSelection(): boolean {
		const view = this.view;
		if (!view) {
			return false;
		}

		const { state } = view;
		const doc = state.doc;
		const changes: ChangeSpec[] = [];
		const processedLines = new Set<number>();
		let changed = false;

		for (const range of state.selection.ranges) {
			if (range.empty) {
				const line = doc.lineAt(range.from);
				if (processedLines.has(line.number)) {
					continue;
				}
				processedLines.add(line.number);
				const cleanedLine = this.stripLineFormatting(line.text);
				if (cleanedLine !== line.text) {
					changes.push({ from: line.from, to: line.to, insert: cleanedLine || "\u200B" });
					changed = true;
				}
			} else {
				const from = range.from;
				const to = range.to;
				const selected = doc.sliceString(from, to);
				const cleaned = this.stripInlineFormatting(selected);
				if (cleaned !== selected) {
					changes.push({ from, to, insert: cleaned });
					changed = true;
				}
			}
		}

		if (!changed) {
			return false;
		}

		view.dispatch({ changes, scrollIntoView: true });
		view.focus();
		return true;
	}

	private stripInlineFormatting(text: string): string {
		return text
			.replace(/(\*\*|__)([\s\S]*?)\1/g, '$2')
			.replace(/(\*|_)([\s\S]*?)\1/g, '$2')
			.replace(/==([\s\S]*?)==/g, '$1')
			.replace(/(~~)([\s\S]*?)\1/g, '$2')
			.replace(/`([\s\S]*?)`/g, '$1')
			.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '$1')
			.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '$1')
			.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '$1')
			.replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '$1')
			.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1');
	}

	private stripLineFormatting(text: string): string {
		const result = text;
		const leading = result.match(/^\s*/)?.[0] ?? "";
		let rest = result.slice(leading.length);
		rest = rest.replace(/^#{1,6}\s+/, '');
		rest = rest.replace(/^>\s+/, '');
		rest = rest.replace(/^([-*+])\s+/, '');
		rest = rest.replace(/^(\d+)\.\s+/, '');
		if (!rest) {
			rest = "\u200B";
		}
		return leading + rest;
	}
}
