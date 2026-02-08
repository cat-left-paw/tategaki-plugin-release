import { TFile, Vault } from "obsidian";
import { DocumentModel } from "./block-model";
import { documentToMarkdown, markdownToDocument } from "./converters/markdown-parser";

export interface BlockFileManagerOptions {
	onFileChange?: (file: TFile | null) => void;
}

export class BlockFileManager {
	private readonly vault: Vault;
	private readonly options: BlockFileManagerOptions;
	private currentFile: TFile | null = null;
	private lastSavedMarkdown = "";

	constructor(vault: Vault, options: BlockFileManagerOptions = {}) {
		this.vault = vault;
		this.options = options;
	}

	async loadFile(file: TFile): Promise<DocumentModel> {
		this.currentFile = file;
		const markdown = await this.vault.read(file);
		this.lastSavedMarkdown = markdown;
		this.options.onFileChange?.(file);
		return await markdownToDocument(markdown);
	}

	async saveFile(model: DocumentModel): Promise<void> {
		if (!this.currentFile) {
			throw new Error("No file loaded");
		}
		const markdown = documentToMarkdown(model);
		await this.vault.modify(this.currentFile, markdown);
		this.lastSavedMarkdown = markdown;
	}

	hasUnsavedChanges(model: DocumentModel): boolean {
		const markdown = documentToMarkdown(model);
		return markdown !== this.lastSavedMarkdown;
	}

	getCurrentFile(): TFile | null {
		return this.currentFile;
	}

	getCurrentFileName(): string {
		return this.currentFile ? this.currentFile.basename : "";
	}

	getCurrentFilePath(): string {
		return this.currentFile ? this.currentFile.path : "";
	}

	clearFile(): void {
		this.currentFile = null;
		this.lastSavedMarkdown = "";
		this.options.onFileChange?.(null);
	}

	async createFile(path: string, model: DocumentModel): Promise<TFile> {
		const markdown = documentToMarkdown(model);
		const file = await this.vault.create(path, markdown);
		this.currentFile = file;
		this.lastSavedMarkdown = markdown;
		this.options.onFileChange?.(file);
		return file;
	}
}
