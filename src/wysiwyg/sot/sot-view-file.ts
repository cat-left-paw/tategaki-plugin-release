import { Notice } from "obsidian";
import type { MarkdownView, TFile } from "obsidian";

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
		new Notice("対象ファイルが見つかりません。", 2500);
		return;
	}
	const opened = await host.plugin.modeManager.toggleReadingView(file, {
		targetLeaf: host.leaf,
		returnViewMode: "sot",
	});
	new Notice(
		opened
			? "書籍モードビューを開きました。"
			: "書籍モードビューを閉じました。",
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
		new Notice("対象のファイルが見つかりません。", 2500);
		return null;
	}
	const markdownView = await host.ensureMarkdownViewForFile(host.currentFile);
	if (!markdownView || !host.pairedMarkdownLeaf) {
		new Notice("MarkdownView が見つからないため実行できません。", 2500);
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
