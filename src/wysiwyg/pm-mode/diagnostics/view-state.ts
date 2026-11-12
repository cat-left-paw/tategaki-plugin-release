/**
 * M1-5 diagnostics: what the new mode's view has on now, for the result files. Since 2026-10-20 the view
 * is out of the accessibility tree and skips the blocks outside the view (M1 design D25); these were the
 * two experiments of M1-5 report §10.
 */
export const PM_HOST_TAG = "tategaki-pm-host";
export interface PmRootState {
	ariaHidden: boolean;
	/** `off` / `measuring` / `on` (offscreen-skip.ts), or null without a PM root. */
	skip: string | null;
	/** The chunks outside the view are skipped (chunk-skip.ts, CHUNK2-B; since 2026-10-21). */
	chunkSkip?: boolean;
}

/** The PM root inside a host: `.tategaki-pm-scroll > .ProseMirror`. */
export function pmRootOf(host: Element): HTMLElement | null {
	return (host.shadowRoot?.querySelector(".tategaki-pm-scroll > .ProseMirror") as HTMLElement | null) ?? null;
}
export function readPmRootState(host: Element): PmRootState {
	const root = pmRootOf(host);
	return { ariaHidden: root?.getAttribute("aria-hidden") === "true", skip: root?.getAttribute("data-tategaki-pm-skip") ?? null,
		chunkSkip: root?.getAttribute("data-tategaki-pm-chunk-skip") === "on" };
}
export function findPmHosts(root: ParentNode): Element[] {
	return Array.from(root.querySelectorAll(PM_HOST_TAG));
}
