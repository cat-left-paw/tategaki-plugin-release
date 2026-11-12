/** M2-4a: development entry; registration alone installs no input listener. */
import { Modal, Notice, type App, type Plugin } from "obsidian";
import { t } from "../../../shared/i18n";
import { PmModeView } from "../obsidian/pm-mode-view";
import { isPmModeSamplePath } from "../obsidian/source-owner";
import { InputRecording } from "./input-recording";
import { createVaultResultWriter } from "./result-writer";

export function registerInputRecordingCommand(plugin: Pick<Plugin, "app" | "addCommand" | "register">): void {
	let running: InputRecording | null = null, modal: LabelModal | null = null, destroyed = false;
	const target = () => {
		const view = plugin.app.workspace.getActiveViewOfType(PmModeView), path = view?.getCurrentFilePath();
		return view && !view.isClosed() && view.activeSession?.input && path && isPmModeSamplePath(path) ? { view, path, session: view.activeSession } : null;
	};
	plugin.addCommand({ id: "pm-mode-m24-input-recording", name: t("pm.command.recordInput"), checkCallback: checking => {
		const current = target();
		if (!current || destroyed) return false;
		if (checking) return true;
		if (running) { running.stop(); return true; }
		if (modal) return true;
		modal = new LabelModal(plugin.app, label => {
			modal = null;
			const next = target();
			if (!label || destroyed || !next || next.session !== current.session || next.path !== current.path) return;
			try {
				const recording = new InputRecording(next.session, next.path, () => next.view.getCurrentFilePath(), label, createVaultResultWriter(plugin.app));
				running = recording;
				new Notice(t("pm.record.started"));
				void recording.finished.then(({ path, result }) => {
					if (running === recording) running = null;
					if (!destroyed) new Notice(`${t("pm.record.saved")} ${path}${result.truncated ? ` (${t("pm.record.limit")})` : ""}`);
				}, error => { if (running === recording) running = null; if (!destroyed) new Notice(`${t("pm.record.failed")} ${String(error)}`); });
			} catch (error) { new Notice(`${t("pm.record.failed")} ${String(error)}`); }
		});
		modal.open();
		return true;
	} });
	plugin.register(() => { destroyed = true; modal?.close(); modal = null; running?.stop("plugin-unload"); running = null; });
}

class LabelModal extends Modal {
	private label: string | null = null;
	constructor(app: App, private readonly decide: (label: string | null) => void) { super(app); }
	onOpen(): void {
		this.titleEl.textContent = t("pm.record.label");
		const doc = this.contentEl.ownerDocument, input = doc.createElement("input"), start = doc.createElement("button"), cancel = doc.createElement("button");
		input.placeholder = "mac-standard"; input.maxLength = 80; input.setAttribute("aria-label", t("pm.record.label"));
		start.textContent = t("pm.record.start"); cancel.textContent = t("pm.record.cancel");
		const begin = (): void => { if (!input.value.trim()) return; this.label = input.value.trim(); this.close(); };
		start.addEventListener("click", begin);
		input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); begin(); } });
		cancel.addEventListener("click", () => this.close());
		this.contentEl.append(input, start, cancel);
	}
	onClose(): void { this.contentEl.replaceChildren(); this.decide(this.label); }
}
