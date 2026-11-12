/** M2-4a / L2: an opt-in, read-only event/decision log. No source text or replay is recorded here. */
import type { PmModeSession } from "../obsidian/session";
import type { SurfaceRecord } from "../obsidian/input-surface";
import { isPmModeSamplePath } from "../obsidian/source-owner";
import { classifyKey } from "./after-watch";
import { buildResultFileName, sanitizeFileStem, type BenchResultWriter } from "./result-path";

export const INPUT_RECORD_LIMIT = 5000;
export interface InputRecordEntry {
	sequence: number;
	type: string;
	channel: "event" | "decision";
	atMs: number;
	text?: string;
	anchor: number;
	head: number;
	[key: string]: unknown;
}
export interface InputRecordingResult {
	schema: "tategaki-pm-m24-ime/2";
	startedAt: string;
	label: string;
	environment: { userAgent: string; platform: string; devicePixelRatio: number };
	file: string;
	stopReason: string;
	limit: number;
	truncated: boolean;
	events: InputRecordEntry[];
}

export class InputRecording {
	private readonly started = new Date();
	private readonly t0: number;
	private readonly surface: NonNullable<PmModeSession["input"]>["surface"];
	private readonly win: Window;
	private readonly events: InputRecordEntry[] = [];
	private readonly detach: (() => void)[] = [];
	private stopped = false;
	readonly finished: Promise<{ path: string; result: InputRecordingResult }>;
	private resolve!: (value: { path: string; result: InputRecordingResult }) => void;
	private reject!: (reason: unknown) => void;
	constructor(private readonly session: PmModeSession, private readonly file: string, private readonly getPath: () => string | null,
		private readonly label: string, private readonly writer: BenchResultWriter, private readonly limit = INPUT_RECORD_LIMIT) {
		if (!isPmModeSamplePath(file) || getPath() !== file || !session.input || !label.trim() || limit < 1) throw new Error("Input recording requires a sample, surface and label");
		const surface = session.input.surface, tree = surface.element.getRootNode();
		const win = surface.element.ownerDocument.defaultView; if (!win) throw new Error("Recording window unavailable");
		this.surface = surface; this.win = win; this.t0 = win.performance.now();
		this.finished = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
		const decision: SurfaceRecord = (type, detail) => {
			// Hooks pass scalars. Never serialize a model/document object through a diagnostic detail.
			const scalars = Object.fromEntries(Object.entries(detail ?? {}).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v)));
			this.append("decision", type, { detail: scalars });
		};
		this.detach.push(session.subscribeInputRecords(decision, () => this.stop("session-closed")));
		const listener = (event: Event) => {
			if (!event.composedPath().includes(surface.element)) return;
			const e = event as KeyboardEvent & InputEvent;
			this.append("event", event.type, { key: e.key, code: e.code, keyCode: e.keyCode, isComposing: e.isComposing,
				ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, repeat: e.repeat,
				mods: [e.ctrlKey && "Ctrl", e.metaKey && "Meta", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean).join("+"),
				data: e.data, inputType: e.inputType, isTrusted: e.isTrusted, timeStamp: e.timeStamp });
		};
		for (const type of ["keydown", "keyup", "compositionstart", "compositionupdate", "compositionend", "beforeinput", "input"]) {
			tree.addEventListener(type, listener, { capture: true, passive: true });
			this.detach.push(() => tree.removeEventListener(type, listener, { capture: true }));
		}
		const focus = (event: Event): void => {
			if (event.composedPath()[0] === surface.element) this.append("event", event.type, { target: "surface", isTrusted: event.isTrusted, timeStamp: event.timeStamp }, false);
		};
		for (const type of ["focus", "blur"]) {
			tree.addEventListener(type, focus, { capture: true, passive: true });
			this.detach.push(() => tree.removeEventListener(type, focus, { capture: true }));
		}
		const outside = (event: KeyboardEvent): void => {
			if (!event.composedPath().includes(surface.element)) this.append("event", "outside-keydown", { keyKind: classifyKey(event), isTrusted: event.isTrusted, timeStamp: event.timeStamp }, false);
		};
		win.addEventListener("keydown", outside, { capture: true, passive: true });
		this.detach.push(() => win.removeEventListener("keydown", outside, { capture: true }));
	}
	private append(channel: InputRecordEntry["channel"], type: string, detail: Record<string, unknown>, includeText = true): void {
		if (this.stopped) return;
		if (this.getPath() !== this.file) { this.stop("path-changed"); return; }
		const surface = this.surface, selection = this.session.cm.state.selection.main;
		this.events.push({ ...detail, sequence: this.events.length + 1, type, channel,
			atMs: this.win.performance.now() - this.t0, ...(includeText ? { text: surface.text() } : {}), anchor: selection.anchor, head: selection.head });
		if (this.events.length >= this.limit) this.stop("limit");
	}
	stop(reason = "command"): void {
		if (this.stopped) return;
		this.stopped = true;
		for (const detach of this.detach.splice(0)) detach();
		const result: InputRecordingResult = { schema: "tategaki-pm-m24-ime/2", startedAt: this.started.toISOString(), label: this.label, environment: { userAgent: this.win.navigator.userAgent, platform: this.win.navigator.platform, devicePixelRatio: this.win.devicePixelRatio }, file: this.file,
			stopReason: reason, limit: this.limit, truncated: reason === "limit", events: this.events };
		const name = buildResultFileName(this.started, this.file, `-m24-ime-${sanitizeFileStem(this.label)}`);
		void Promise.resolve().then(() => this.writer(name, () => JSON.stringify(result, null, 2) + "\n")).then(path => this.resolve({ path, result }), this.reject);
	}
}
