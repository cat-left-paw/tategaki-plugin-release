import { App, TFile } from "obsidian";
import { areMarkdownContentsEquivalent } from "./sync-backup";

export class VaultProcessConflictError extends Error {
	constructor(message = "File contents changed before process write") {
		super(message);
		this.name = "VaultProcessConflictError";
	}
}

export async function replaceFileContentsWithProcess(
	app: App,
	file: TFile,
	expectedCurrent: string,
	nextContent: string
): Promise<string> {
	return app.vault.process(file, (current) => {
		if (!areMarkdownContentsEquivalent(expectedCurrent, current)) {
			throw new VaultProcessConflictError();
		}
		return nextContent;
	});
}

export async function overwriteFileContentsWithProcess(
	app: App,
	file: TFile,
	nextContent: string
): Promise<string> {
	return app.vault.process(file, () => nextContent);
}
