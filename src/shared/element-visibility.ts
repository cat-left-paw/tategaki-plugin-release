/**
 * Showing and hiding an element is a class, not an inline style: styles are not written from code
 * (Obsidian's community review, obsidianmd/no-static-styles-assignment). The rule is in styles.css:
 * `.tategaki-is-hidden { display: none !important; }` (as important as the inline `display: none` was:
 * only these helpers change it).
 */
export const HIDDEN_CLASS = "tategaki-is-hidden";

export function setElementHidden(element: HTMLElement, hidden: boolean): void {
	element.classList.toggle(HIDDEN_CLASS, hidden);
}

export function isElementHidden(element: HTMLElement): boolean {
	return element.classList.contains(HIDDEN_CLASS);
}
