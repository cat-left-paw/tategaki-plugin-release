import { t } from "../../shared/i18n";
import {
	hasChecklistInSelection,
	toggleChecklistInSelection,
	type ChecklistCommandEditor,
} from "./checklist-commands";

export interface CompatToolbarListButtonEditor {
	isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
	chain: () => {
		focus: () => {
			toggleBulletList: () => { run: () => boolean };
			toggleOrderedList: () => { run: () => boolean };
		};
	};
	state: ChecklistCommandEditor["state"];
	view: ChecklistCommandEditor["view"];
}

export interface CompatToolbarListButtonDefinition {
	buttonKey: string;
	icon: string;
	label: string;
	run: (editor: CompatToolbarListButtonEditor) => boolean;
	isActive: (editor: CompatToolbarListButtonEditor) => boolean;
}

export const COMPAT_TOOLBAR_LIST_BUTTONS: readonly CompatToolbarListButtonDefinition[] =
	[
		{
			buttonKey: "list",
			icon: "list",
			label: t("toolbar.bulletList"),
			run: (editor) => editor.chain().focus().toggleBulletList().run(),
			isActive: (editor) => editor.isActive("bulletList"),
		},
		{
			buttonKey: "check-square",
			icon: "check-square",
			label: t("toolbar.taskList"),
			run: (editor) => toggleChecklistInSelection(editor),
			isActive: (editor) => hasChecklistInSelection(editor),
		},
		{
			buttonKey: "list-ordered",
			icon: "list-ordered",
			label: t("toolbar.orderedList"),
			run: (editor) => editor.chain().focus().toggleOrderedList().run(),
			isActive: (editor) => editor.isActive("orderedList"),
		},
	];
