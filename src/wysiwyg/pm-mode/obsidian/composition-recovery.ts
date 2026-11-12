import { Modal, Notice, type App } from "obsidian";
import { t } from "../../../shared/i18n";
import type { InputSurface } from "./input-surface";

/** K4 / E4: only the second request for the same cycle may ask to discard it. No elapsed-time inference. */
export class PmModeCompositionRecovery {
	private warned: { surface: InputSurface; cycle: number } | null = null;
	private retainedNotice: { surface: InputSurface; cycle: number } | null = null;
	private modal: DiscardCompositionModal | null = null;
	private destroyed = false;
	constructor(private readonly app: App, private readonly surface: () => InputSurface | null, private readonly eligible: () => boolean) {}
	request(): void {
		if (this.destroyed || !this.eligible()) return;
		const surface = this.surface(), state = surface?.compositionState();
		if (!surface || !state) { this.warned = this.retainedNotice = null; return; }
		if (!state.discardable) {
			if (this.retainedNotice?.surface !== surface || this.retainedNotice.cycle !== state.cycle) new Notice(t("pm.notice.discardCompositionRetained"));
			this.retainedNotice = { surface, cycle: state.cycle };
			this.warned = null;
			return;
		}
		this.retainedNotice = null;
		if (this.warned?.surface !== surface || this.warned.cycle !== state.cycle) {
			this.warned = { surface, cycle: state.cycle };
			new Notice(t("pm.notice.discardCompositionFirst"));
			return;
		}
		if (this.modal) return;
		const modal = new DiscardCompositionModal(this.app, confirmed => {
			if (this.modal === modal) this.modal = null;
			const current = surface.compositionState();
			if (!confirmed || this.destroyed || !this.eligible() || this.surface() !== surface || current?.cycle !== state.cycle || !current.discardable) return;
			surface.discardComposition();
			this.warned = null;
		});
		this.modal = modal;
		modal.open();
	}
	destroy(): void { this.destroyed = true; this.warned = this.retainedNotice = null; this.modal?.close(); this.modal = null; }
}

class DiscardCompositionModal extends Modal {
	private confirmed = false;
	constructor(app: App, private readonly decide: (confirmed: boolean) => void) { super(app); }
	onOpen(): void {
		this.titleEl.textContent = t("pm.recovery.title");
		const doc = this.contentEl.ownerDocument, message = doc.createElement("p"), actions = doc.createElement("div");
		message.textContent = t("pm.recovery.message");
		const cancel = doc.createElement("button"), discard = doc.createElement("button");
		cancel.textContent = t("pm.recovery.cancel");
		discard.textContent = t("pm.recovery.discard"); discard.className = "mod-warning";
		cancel.addEventListener("click", () => this.close());
		discard.addEventListener("click", () => { this.confirmed = true; this.close(); });
		actions.append(cancel, discard); this.contentEl.append(message, actions);
	}
	onClose(): void { this.contentEl.replaceChildren(); this.decide(this.confirmed); }
}
