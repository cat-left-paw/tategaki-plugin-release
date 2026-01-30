import { Menu } from "obsidian";
import type { CommandUiAdapter } from "./command-adapter";

export class CommandContextMenu {
	private adapter: CommandUiAdapter;

	constructor(adapter: CommandUiAdapter) {
		this.adapter = adapter;
	}

	show(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const menu = new Menu();
		this.buildMenu(menu);
		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	private buildMenu(menu: Menu): void {
		this.addClipboardSection(menu);
		this.addInlineSection(menu);
		this.addHeadingSection(menu);
		this.addBlockSection(menu);
		this.addInsertSection(menu);
		this.addClearSection(menu);
	}

	private addClipboardSection(menu: Menu): void {
		let added = false;
		const hasSelection = this.adapter.hasSelection?.() ?? false;
		if (this.adapter.cut) {
			menu.addItem((item) => {
				item.setTitle("切り取り")
					.setIcon("scissors")
					.setDisabled(!hasSelection)
					.onClick(() => {
						void this.adapter.cut?.();
					});
			});
			added = true;
		}
		if (this.adapter.copy) {
			menu.addItem((item) => {
				item.setTitle("コピー")
					.setIcon("copy")
					.setDisabled(!hasSelection)
					.onClick(() => {
						void this.adapter.copy?.();
					});
			});
			added = true;
		}
		if (this.adapter.paste) {
			menu.addItem((item) => {
				item.setTitle("貼り付け")
					.setIcon("clipboard-paste")
					.onClick(() => {
						void this.adapter.paste?.();
					});
			});
			added = true;
		}
		if (this.adapter.selectAll) {
			menu.addItem((item) => {
				item.setTitle("すべて選択")
					.setIcon("select-all")
					.onClick(() => {
						this.adapter.selectAll?.();
					});
			});
			added = true;
		}
		if (added) {
			menu.addSeparator();
		}
	}

	private addInlineSection(menu: Menu): void {
		const hasSelection = this.adapter.hasSelection?.() ?? false;
		const items = [
			{
				title: "太字",
				icon: "bold",
				action: this.adapter.toggleBold,
				active: this.adapter.isBoldActive,
			},
			{
				title: "斜体",
				icon: "italic",
				action: this.adapter.toggleItalic,
				active: this.adapter.isItalicActive,
			},
			{
				title: "取り消し線",
				icon: "strikethrough",
				action: this.adapter.toggleStrikethrough,
				active: this.adapter.isStrikethroughActive,
			},
			{
				title: "下線",
				icon: "underline",
				action: this.adapter.toggleUnderline,
				active: this.adapter.isUnderlineActive,
			},
			{
				title: "ハイライト",
				icon: "highlighter",
				action: this.adapter.toggleHighlight,
				active: this.adapter.isHighlightActive,
			},
		];
		let added = false;
		for (const item of items) {
			if (!item.action) continue;
			menu.addItem((menuItem) => {
				menuItem
					.setTitle(item.title)
					.setIcon(item.icon)
					.setDisabled(!hasSelection)
					.onClick(() => {
						item.action?.();
					});
				if (item.active?.()) {
					menuItem.setChecked(true);
				}
			});
			added = true;
		}
		if (added) {
			menu.addSeparator();
		}
	}

	private addHeadingSection(menu: Menu): void {
		if (!this.adapter.setHeading) return;
		const currentLevel = this.adapter.getHeadingLevel?.() ?? 0;
		for (let level = 1; level <= 6; level += 1) {
			menu.addItem((item) => {
				item.setTitle(`見出し${level}`)
					.setIcon(`heading-${level}`)
					.onClick(() => {
						this.adapter.setHeading?.(level);
					});
				if (currentLevel === level) {
					item.setChecked(true);
				}
			});
		}
		menu.addItem((item) => {
			item.setTitle("見出し解除")
				.setIcon("text")
				.onClick(() => {
					this.adapter.clearHeading?.();
				});
			if (currentLevel === 0) {
				item.setChecked(true);
			}
		});
		menu.addSeparator();
	}

	private addBlockSection(menu: Menu): void {
		const items = [
			{
				title: "箇条書きリスト",
				icon: "list",
				action: this.adapter.toggleBulletList,
				active: this.adapter.isBulletListActive,
			},
			{
				title: "番号付きリスト",
				icon: "list-ordered",
				action: this.adapter.toggleOrderedList,
				active: this.adapter.isOrderedListActive,
			},
		];
		let added = false;
		for (const item of items) {
			if (!item.action) continue;
			menu.addItem((menuItem) => {
				menuItem
					.setTitle(item.title)
					.setIcon(item.icon)
					.onClick(() => {
						item.action?.();
					});
				if (item.active?.()) {
					menuItem.setChecked(true);
				}
			});
			added = true;
		}
		if (added) {
			menu.addSeparator();
		}
	}

	private addInsertSection(menu: Menu): void {
		let added = false;
		if (this.adapter.insertRuby) {
			menu.addItem((item) => {
				item.setTitle("ルビ挿入")
					.setIcon("gem")
					.onClick(() => {
						this.adapter.insertRuby?.();
					});
			});
			added = true;
		}
		if (added) {
			menu.addSeparator();
		}
	}

	private addClearSection(menu: Menu): void {
		if (!this.adapter.clearFormatting) return;
		menu.addItem((item) => {
			item.setTitle("書式クリア")
				.setIcon("eraser")
				.onClick(() => {
					this.adapter.clearFormatting?.();
				});
		});
	}

}
