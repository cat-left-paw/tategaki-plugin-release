import type { TFile, WorkspaceLeaf } from "obsidian";
import { INITIAL_FILE_PROP } from "./sot-wysiwyg-view-constants";

type ManagedSoTLeaf = WorkspaceLeaf & {
	updateHeader?: () => void;
	[key: string]: unknown;
};

export function cancelIdleCallbackCompat(handle: number | null): void {
	if (handle === null) return;
	const cancelIdle = (
		window as Window & {
			cancelIdleCallback?: (idleHandle: number) => void;
		}
	).cancelIdleCallback;
	cancelIdle?.(handle);
}

export function requestIdleCallbackCompat(
	callback: () => void,
	timeout?: number,
): number | null {
	const requestIdle = (
		window as Window & {
			requestIdleCallback?: (
				idleCallback: () => void,
				options?: { timeout?: number },
			) => number;
		}
	).requestIdleCallback;
	if (!requestIdle) {
		return null;
	}
	return requestIdle(callback, timeout !== undefined ? { timeout } : undefined);
}

export function updateSoTLeafHeader(leaf: WorkspaceLeaf): void {
	const managedLeaf = leaf as ManagedSoTLeaf;
	if (typeof managedLeaf.updateHeader === "function") {
		managedLeaf.updateHeader();
	}
}

export function getSoTInitialFile(leaf: WorkspaceLeaf): TFile | undefined {
	return (leaf as ManagedSoTLeaf)[INITIAL_FILE_PROP] as TFile | undefined;
}

export function clearSoTInitialFile(leaf: WorkspaceLeaf): void {
	delete (leaf as ManagedSoTLeaf)[INITIAL_FILE_PROP];
}

export function focusElementPreventScroll(el: HTMLElement): void {
	el.focus({ preventScroll: true });
}

export function deleteDatasetKeys(
	el: HTMLElement,
	keys: readonly string[],
): void {
	for (const key of keys) {
		delete el.dataset[key];
	}
}

export function setDatasetEntries(
	el: HTMLElement,
	entries: Record<string, string>,
): void {
	for (const [key, value] of Object.entries(entries)) {
		el.dataset[key] = value;
	}
}
