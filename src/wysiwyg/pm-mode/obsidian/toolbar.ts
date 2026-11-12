// New for the clipboard stage's C-d (D-T-1 to D-T-4; 2026-11-08). Not in Nyoze. The icons, labels and tooltips are those of the buttons of the current writing mode's toolbar
// (`src/wysiwyg/shared/command-toolbar.ts`: `createWritingModeButton`, `createSettingsButton`, `createOutlineButton`), which is not used (it lays out every command, and the ones the new mode does
// not have would stand there disabled) and is not changed. The look is the same classes' (`contenteditable-toolbar`, `contenteditable-toolbar-button`: `styles.css`); the layout of the frame
// that holds it and the display is `tategaki-pm-frame` / `tategaki-pm-toolbar` / `tategaki-pm-body` there. No style is written from here: every look is a class.
import { setIcon } from "obsidian";
import { t } from "../../../shared/i18n";
import type { SurfaceRecord } from "./input-surface";

/** What the three buttons do. The view gives them (it owns the settings, the modal and the app). */
export interface PmModeToolbarActions {
	/** `common.writingMode` now (`vertical-rl` for the vertical writing). */
	writingMode(): string;
	toggleWritingMode(): void;
	openSettings(): void;
	openOutline(): void;
}

export interface PmModeToolbar {
	/** The writing mode (the button's icon and label) may have changed. */
	update(): void;
	destroy(): void;
}

/**
 * The toolbar of the new mode's view: three buttons, a writing mode switch, the display settings and the outline (D-T-1), with the separators of the current mode's toolbar between them.
 * `container` is an element the view made for it, outside the display's shadow root and above the display. A press does not take the focus from the input surface (`mousedown` is
 * cancelled), so a composition goes on under the button and the caret stays; the button's action runs on `click`.
 */
export function createPmModeToolbar(container: HTMLElement, actions: PmModeToolbarActions, record: SurfaceRecord = () => {}): PmModeToolbar {
	const doc = container.ownerDocument;
	container.classList.add("contenteditable-toolbar", "tategaki-toolbar-desktop", "tategaki-pm-toolbar");
	const vertical = (): boolean => actions.writingMode() === "vertical-rl";
	/** The writing mode button's icon names the current direction; hovering it shows the direction a press switches to (as the current mode's does). */
	const icons = { writingMode: (hover: boolean): string => vertical() === hover ? "arrow-left-right" : "arrow-down-up" };
	let hovering = false;
	const make = (command: string, icon: string, label: string, run: () => void): HTMLButtonElement => {
		const button = doc.createElement("button");
		button.type = "button";
		button.className = "clickable-icon contenteditable-toolbar-button";
		button.dataset.command = command;
		button.setAttribute("aria-label", label);
		setIcon(button, icon);
		button.addEventListener("click", event => {
			event.preventDefault();
			record("toolbar-button", { command });
			run();
		});
		return button;
	};
	const separator = (): HTMLElement => { const element = doc.createElement("div"); element.className = "contenteditable-toolbar-separator"; return element; };
	const writing = make("writingMode", icons.writingMode(false), t(vertical() ? "toolbar.writingMode.toHorizontal" : "toolbar.writingMode.toVertical"), () => actions.toggleWritingMode());
	const settings = make("settings", "settings", t("common.displaySettings"), () => actions.openSettings());
	const outline = make("outline", "list-tree", t("toolbar.outline"), () => actions.openOutline());
	const onMouseDown = (event: MouseEvent): void => { event.preventDefault(); };
	const onEnter = (): void => { hovering = true; paintWriting(); };
	const onLeave = (): void => { hovering = false; paintWriting(); };
	let painted = icons.writingMode(false);
	function paintWriting(): void {
		writing.setAttribute("aria-label", t(vertical() ? "toolbar.writingMode.toHorizontal" : "toolbar.writingMode.toVertical"));
		const icon = icons.writingMode(hovering);
		if (icon !== painted) { setIcon(writing, icon); painted = icon; }
	}
	container.addEventListener("mousedown", onMouseDown);
	writing.addEventListener("mouseenter", onEnter);
	writing.addEventListener("mouseleave", onLeave);
	container.append(writing, separator(), settings, separator(), outline);
	return {
		update(): void { paintWriting(); },
		destroy(): void {
			container.removeEventListener("mousedown", onMouseDown);
			writing.removeEventListener("mouseenter", onEnter);
			writing.removeEventListener("mouseleave", onLeave);
			container.replaceChildren();
			container.classList.remove("contenteditable-toolbar", "tategaki-toolbar-desktop", "tategaki-pm-toolbar");
		},
	};
}
