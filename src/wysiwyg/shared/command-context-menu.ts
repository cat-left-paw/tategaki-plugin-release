import { Menu } from "obsidian";
import type { CommandUiAdapter } from "./command-adapter";
import { t } from "../../shared/i18n";

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
				item.setTitle(t("common.cut"))
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
				item.setTitle(t("common.copy"))
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
				item.setTitle(t("common.paste"))
					.setIcon("clipboard-paste")
					.onClick(() => {
						void this.adapter.paste?.();
					});
			});
			added = true;
		}
		if (this.adapter.selectAll) {
			menu.addItem((item) => {
				item.setTitle(t("common.selectAll"))
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
		const inlineAllowed = this.adapter.isInlineSelectionAllowed?.() ?? true;
		const items = [
			{
				title: t("toolbar.bold"),
				icon: "bold",
				action: this.adapter.toggleBold,
				active: this.adapter.isBoldActive,
			},
			{
				title: t("toolbar.italic"),
				icon: "italic",
				action: this.adapter.toggleItalic,
				active: this.adapter.isItalicActive,
			},
			{
				title: t("toolbar.strikethrough"),
				icon: "strikethrough",
				action: this.adapter.toggleStrikethrough,
				active: this.adapter.isStrikethroughActive,
			},
			{
				title: t("toolbar.underline"),
				icon: "underline",
				action: this.adapter.toggleUnderline,
				active: this.adapter.isUnderlineActive,
			},
			{
				title: t("toolbar.highlight"),
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
					.setDisabled(!hasSelection || !inlineAllowed)
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
				item.setTitle(t("toolbar.heading.level", { level }))
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
			item.setTitle(t("toolbar.heading.clear"))
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
				title: t("toolbar.bulletList"),
				icon: "list",
				action: this.adapter.toggleBulletList,
				active: this.adapter.isBulletListActive,
			},
			{
				title: t("toolbar.taskList"),
				icon: "check-square",
				action: this.adapter.toggleTaskList,
				active: this.adapter.isTaskListActive,
			},
			{
				title: t("toolbar.orderedList"),
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
			const hasSelection = this.adapter.hasSelection?.() ?? false;
			const inlineAllowed =
				this.adapter.isInlineSelectionAllowed?.() ?? true;
			menu.addItem((item) => {
				item.setTitle(t("toolbar.rubyInsert"))
					.setIcon("gem")
					.setDisabled(!hasSelection || !inlineAllowed)
					.onClick(() => {
						this.adapter.insertRuby?.();
					});
			});
			added = true;
		}
		if (this.adapter.toggleTcy || this.adapter.insertTcy || this.adapter.clearTcy) {
			const active = this.isTcyActive();
			menu.addItem((item) => {
				item.setTitle(active ? t("toolbar.tcyClear") : t("toolbar.tcyInsert"))
					.setIcon("square-arrow-right")
					.setDisabled(this.isTcyDisabled())
					.onClick(() => {
						this.toggleTcy();
					});
				if (active) {
					item.setChecked(true);
				}
			});
			added = true;
		}
		if (added) {
			menu.addSeparator();
		}
	}

	private addClearSection(menu: Menu): void {
		if (!this.adapter.clearFormatting) {
			return;
		}
		menu.addItem((item) => {
			item.setTitle(t("toolbar.clearFormatting"))
				.setIcon("eraser")
				.onClick(() => {
					this.adapter.clearFormatting?.();
				});
		});
	}

	private isTcyActive(): boolean {
		return this.adapter.isTcyActive?.() ?? false;
	}

	private toggleTcy(): void {
		if (this.adapter.toggleTcy) {
			this.adapter.toggleTcy();
			return;
		}
		if (this.isTcyActive()) {
			this.adapter.clearTcy?.();
			return;
		}
		this.adapter.insertTcy?.();
	}

	private isTcyDisabled(): boolean {
		const hasSelection = this.adapter.hasSelection?.() ?? false;
		const inlineAllowed = this.adapter.isInlineSelectionAllowed?.() ?? true;
		if (!hasSelection || !inlineAllowed) return true;
		if (this.adapter.toggleTcy) return false;
		if (this.isTcyActive()) {
			return !this.adapter.clearTcy;
		}
		return !this.adapter.insertTcy;
	}

}
