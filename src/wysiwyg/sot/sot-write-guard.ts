import type { SoTEditor } from "./sot-editor";

/** Command/input entry check: report refusal without dispatching or repainting. */
export function checkSoTWrite(editor: SoTEditor | null, retained = false): boolean {
	if (!editor) return false;
	if (editor.canWrite?.() !== false) return true;
	editor.notifyWriteBlocked?.(retained);
	return false;
}
