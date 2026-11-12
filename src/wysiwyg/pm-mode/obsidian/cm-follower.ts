// Reference: src/pm-mode-spike/cmFollower.ts:10-77 @ 3603e14 (2026-10-17). No import from the spike.
// Local changes: Subscribe to document and selection changes; avoid duplicate attachment.
// Local changes (M1-4): Pass the CM update, so the view can map its folded heading lines.
import { Compartment, StateEffect, type Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";

export class PmModeCmFollower {
	private readonly compartment = new Compartment();
	private detached = false;
	private attachedOnce = false;
	constructor(readonly cm: EditorView, private readonly onChanged: (update: ViewUpdate) => void, private readonly guard: Extension = []) {}
	attach(): boolean {
		if (this.detached) return false;
		if (this.isAttached()) return true;
		try {
			const listener = EditorView.updateListener.of(update => {
				if (!this.detached && (update.docChanged || update.selectionSet)) this.onChanged(update);
			});
			this.cm.dispatch({ effects: StateEffect.appendConfig.of(this.compartment.of([this.guard, listener])) });
			this.attachedOnce = true;
			return true;
		} catch { return false; }
	}
	isAttached(): boolean {
		try { return this.attachedOnce && !this.detached && this.compartment.get(this.cm.state) !== undefined; }
		catch { return false; }
	}
	detach(): void {
		if (this.detached) return;
		this.detached = true;
		try {
			if (this.compartment.get(this.cm.state) !== undefined) this.cm.dispatch({ effects: this.compartment.reconfigure([]) });
		} catch { /* CM was destroyed/reconfigured. */ }
	}
}
