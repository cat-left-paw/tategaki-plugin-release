import type { MarkdownView, TFile, WorkspaceLeaf } from "obsidian";

export type SoTWorkspaceHost = any;

export function registerWorkspacePairGuards(host: SoTWorkspaceHost): void {
	host.workspaceController.registerWorkspacePairGuards();
}

export function registerEscapeGuard(host: SoTWorkspaceHost): void {
	host.workspaceController.registerEscapeGuard();
}

export function registerEscapeKeymap(host: SoTWorkspaceHost): void {
	host.workspaceController.registerEscapeKeymap();
}

export function getValidPairedMarkdownLeaf(
	host: SoTWorkspaceHost
): WorkspaceLeaf | null {
	return host.workspaceController.getValidPairedMarkdownLeaf();
}

export function ensurePairedMarkdownView(host: SoTWorkspaceHost): void {
	host.workspaceController.ensurePairedMarkdownView();
}

export function verifyPairedMarkdownViewFile(
	host: SoTWorkspaceHost,
	view: MarkdownView,
	file: TFile
): boolean {
	return host.workspaceController.verifyPairedMarkdownViewFile(view, file);
}

export function applyPairedMarkdownBadge(
	host: SoTWorkspaceHost,
	leaf: WorkspaceLeaf,
	view: MarkdownView
): void {
	host.workspaceController.applyPairedMarkdownBadge(leaf, view);
}

export function clearPairedMarkdownBadge(host: SoTWorkspaceHost): void {
	host.workspaceController.clearPairedMarkdownBadge();
}

export function applySoTTabBadge(host: SoTWorkspaceHost): void {
	host.workspaceController.applySoTTabBadge();
}

export function clearSoTTabBadge(host: SoTWorkspaceHost): void {
	host.workspaceController.clearSoTTabBadge();
}

export function getLeafTabHeaderEl(
	host: SoTWorkspaceHost,
	leaf: WorkspaceLeaf
): HTMLElement | null {
	return host.workspaceController.getLeafTabHeaderEl(leaf);
}

export function getTabHeaderTitleHost(
	host: SoTWorkspaceHost,
	tabHeaderEl: HTMLElement
): HTMLElement | null {
	return host.workspaceController.getTabHeaderTitleHost(tabHeaderEl);
}

export function getViewHeaderTitleHost(
	host: SoTWorkspaceHost,
	containerEl: HTMLElement
): HTMLElement | null {
	return host.workspaceController.getViewHeaderTitleHost(containerEl);
}
