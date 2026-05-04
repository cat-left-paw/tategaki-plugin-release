/** collapsed Home / End などで共通の「ウィジェット行は素通し」の判定 */
export function shouldSkipCollapsedSoTLine(mdKind: string): boolean {
	return (
		mdKind === "image-widget" ||
		mdKind === "embed-widget" ||
		mdKind === "math-widget" ||
		mdKind === "math-hidden" ||
		mdKind === "callout-widget" ||
		mdKind === "callout-hidden" ||
		mdKind === "table-widget" ||
		mdKind === "table-hidden" ||
		mdKind === "deflist-widget" ||
		mdKind === "deflist-hidden"
	);
}
