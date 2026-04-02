export class SoTSelectionChangeBinding {
	private boundDocument: Document | null = null;
	private boundHandler: (() => void) | null = null;

	bind(document: Document | null, onSelectionChange: () => void): boolean {
		if (document === this.boundDocument) {
			return false;
		}
		this.dispose();
		if (!document) {
			return false;
		}
		const handler = () => onSelectionChange();
		document.addEventListener("selectionchange", handler);
		this.boundDocument = document;
		this.boundHandler = handler;
		return true;
	}

	getBoundDocument(): Document | null {
		return this.boundDocument;
	}

	dispose(): void {
		if (this.boundDocument && this.boundHandler) {
			this.boundDocument.removeEventListener(
				"selectionchange",
				this.boundHandler,
			);
		}
		this.boundDocument = null;
		this.boundHandler = null;
	}
}
