import { createRequire } from "module";
import type { EditorView } from "@tiptap/pm/view";
import { t } from "../../shared/i18n";

const requireFromHere = createRequire(__filename);

export type CompatHeadingFoldUiState = {
	ariaExpanded: "true" | "false";
	ariaLabel: string;
	iconName: string;
	showEllipsis: boolean;
};

export function resolveCompatHeadingFoldUiState(params: {
	collapsed: boolean;
	writingMode: string;
}): CompatHeadingFoldUiState {
	const { collapsed, writingMode } = params;
	const isHorizontal = writingMode === "horizontal-tb";
	const iconName = isHorizontal
		? collapsed
			? "circle-chevron-right"
			: "circle-chevron-down"
		: collapsed
			? "circle-chevron-down"
			: "circle-chevron-left";
	return {
		ariaExpanded: collapsed ? "false" : "true",
		ariaLabel: collapsed
			? t("heading.toggle.expand")
			: t("heading.toggle.collapse"),
		iconName,
		showEllipsis: collapsed,
	};
}

export function resolveCompatHeadingFoldWritingMode(
	view: EditorView,
): string {
	const host =
		(view.dom.closest(".tategaki-wysiwyg-editor") as HTMLElement | null) ??
		(view.dom as HTMLElement | null);
	return host?.getAttribute("data-writing-mode") ?? "horizontal-tb";
}

export function getCompatHeadingFoldHostAttributes(
	collapsed: boolean,
): Record<string, string> {
	return {
		"data-heading-foldable": "1",
		"data-heading-collapsed": collapsed ? "1" : "0",
	};
}

export function createCompatHeadingFoldToggleElement(params: {
	doc: Document;
	collapsed: boolean;
	writingMode: string;
	onToggle: () => void;
}): HTMLElement {
	const state = resolveCompatHeadingFoldUiState({
		collapsed: params.collapsed,
		writingMode: params.writingMode,
	});
	const toggle = params.doc.createElement("span");
	toggle.className = "tategaki-md-heading-toggle";
	toggle.dataset.headingToggle = "1";
	toggle.setAttribute("role", "button");
	toggle.setAttribute("contenteditable", "false");
	toggle.setAttribute("tabindex", "0");
	toggle.setAttribute("aria-expanded", state.ariaExpanded);
	toggle.setAttribute("aria-label", state.ariaLabel);
	applyCompatHeadingFoldIcon(toggle, state.iconName);

	const activate = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
		params.onToggle();
	};

	toggle.addEventListener("mousedown", activate);
	toggle.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			activate(event);
		}
	});

	return toggle;
}

export function createCompatHeadingFoldEllipsisElement(
	doc: Document,
): HTMLElement {
	const ellipsis = doc.createElement("span");
	ellipsis.className = "tategaki-md-heading-ellipsis";
	ellipsis.setAttribute("contenteditable", "false");
	ellipsis.setAttribute("tabindex", "0");
	applyCompatHeadingFoldIcon(ellipsis, "message-circle-more");
	return ellipsis;
}

function applyCompatHeadingFoldIcon(
	element: HTMLElement,
	iconName: string,
): void {
	type SetIconLike = (el: HTMLElement, icon: string) => void;
	let setIconLike: SetIconLike | null = null;
	try {
		const obsidian = requireFromHere("obsidian") as {
			setIcon?: SetIconLike;
		};
		setIconLike = obsidian.setIcon ?? null;
	} catch {
		setIconLike = null;
	}
	if (setIconLike) {
		setIconLike(element, iconName);
		return;
	}
	element.setAttribute("data-icon", iconName);
}
