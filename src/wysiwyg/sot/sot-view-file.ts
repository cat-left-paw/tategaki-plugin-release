import { Notice } from "obsidian";
import type { MarkdownView, TFile } from "obsidian";
import { t } from "../../shared/i18n";

export type SoTFileHost = any;

export async function openFile(host: SoTFileHost, file: TFile): Promise<void> {
	await host.workspaceController.openFile(file);
}

export function ensureRecentFilePathsInitialized(host: SoTFileHost): void {
	host.workspaceController.ensureRecentFilePathsInitialized();
}

export function pushRecentFilePath(
	host: SoTFileHost,
	path: string,
	preferFront = true
): void {
	host.workspaceController.pushRecentFilePath(path, preferFront);
}

export function recordRecentFile(host: SoTFileHost, file: TFile | null): void {
	host.workspaceController.recordRecentFile(file);
}

export function buildFileSwitchItems(host: SoTFileHost): TFile[] {
	return host.workspaceController.buildFileSwitchItems();
}

export function openFileSwitcher(host: SoTFileHost): void {
	host.workspaceController.openFileSwitcher();
}

export function openNewNoteModal(host: SoTFileHost, initialValue = ""): void {
	host.workspaceController.openNewNoteModal(initialValue);
}

export async function createNewNote(
	host: SoTFileHost,
	name: string,
	baseFolder: string
): Promise<void> {
	await host.workspaceController.createNewNote(name, baseFolder);
}

export async function toggleReadingMode(host: SoTFileHost): Promise<void> {
	const file = host.currentFile as TFile | null;
	if (!file) {
		new Notice(t("notice.targetFileNotFound"), 2500);
		return;
	}
	const opened = await host.plugin.modeManager.toggleReadingView(file, {
		targetLeaf: host.leaf,
		returnViewMode: "sot",
	});
	new Notice(
		opened
			? t("notice.bookMode.opened")
			: t("notice.bookMode.closed"),
		2000,
	);
}

export async function switchToFile(host: SoTFileHost, file: TFile): Promise<void> {
	await host.workspaceController.switchToFile(file);
}

export async function activateMarkdownLeafForCommand(
	host: SoTFileHost
): Promise<MarkdownView | null> {
	if (!host.currentFile) {
		new Notice(t("notice.targetFileNotFoundAlt"), 2500);
		return null;
	}
	const markdownView = await host.ensureMarkdownViewForFile(host.currentFile);
	if (!markdownView || !host.pairedMarkdownLeaf) {
		new Notice(t("notice.markdownViewMissingExecute"), 2500);
		return null;
	}
	host.app.workspace.setActiveLeaf(host.pairedMarkdownLeaf, {
		focus: true,
	});
	markdownView.editor?.focus();
	return markdownView;
}

export async function ensureMarkdownViewForFile(
	host: SoTFileHost,
	file: TFile
): Promise<MarkdownView | null> {
	return await host.workspaceController.ensureMarkdownViewForFile(file);
}

export function findMarkdownLeafForFile(
	host: SoTFileHost,
	filePath: string
) {
	return host.workspaceController.findMarkdownLeafForFile(filePath);
}
