/**
 * M1-5 diagnostics: development commands. On load it only registers the commands; nothing runs until one
 * is run (no listener, no observer). Not shown in the product's UI (the command palette's development entry,
 * like the spike's). It measures the sample shown in the open vertical view — the new mode, the current SoT
 * mode, or none (the active Markdown view alone) — and writes the result to `pm-spike-samples/results/`.
 * It only runs on files under `pm-spike-samples/` (the edits are restored; see cm-edits.ts).
 * After a run it watches the renderer for 2 minutes and writes a second file (after-watch.ts).
 *
 * Added 2026-10-20 for the freeze on Windows with Chromium's accessibility on (M1-5-REPORT §10): a manual
 * watch (start, then run again to end; at most 5 minutes): the same watch with the frame gaps and the kinds
 * of keys, while the author types. It only observes, and works on any file (the result names the file only
 * when it is a sample). The results record the view's state (view-state.ts: out of the accessibility tree,
 * skipping the blocks outside the view; M1 design D25).
 *
 * Added 2026-10-21 (M1-5 report §13.4): the run measures the parts of opening and resizing (it changes the
 * size of the view's container, and puts it back); the manual watch records the window's resize events.
 */
import { MarkdownView, Notice, type Plugin, type TFile, type WorkspaceLeaf } from "obsidian";
import type { EditorView as CmView } from "@codemirror/view";
import type { TategakiV2Settings } from "../../../types/settings";
import { debugLog } from "../../../shared/logger";
import { TATEGAKI_PM_VIEW_TYPE } from "../obsidian/entry";
import type { PmModeView } from "../obsidian/pm-mode-view";
import { PmModeDocumentState } from "../pm/document-state";
import { AfterWatch, type AfterWatchResult } from "./after-watch";
import { Bench, type BenchHost, type BenchViewMode } from "./bench";
import { isSamplePath } from "./cm-edits";
import { AFTER_WATCH_SCHEMA, afterWatchSummaryLines, checkTargets, M15_SCHEMA, MANUAL_WATCH_SCHEMA, manualWatchSummaryLines, summaryLines, type BenchResultFile } from "./report";
import { findPmHosts, readPmRootState, type PmRootState } from "./view-state";
import { buildResultFileName } from "./result-path";
import { createVaultResultWriter } from "./result-writer";
import { registerInputRecordingCommand } from "./input-recording-command";
import { SOT_VIEW_TYPE } from "./view-types";


interface FileView { getCurrentFilePath(): string | null }
interface DiagnosticsPlugin extends Plugin {
	settings: TategakiV2Settings;
	modeManager: {
		openPmModeView(file: TFile, options?: { openOnRightSide?: boolean }): Promise<void>;
		openSoTWysiwygView(file: TFile, options?: { openOnRightSide?: boolean }): Promise<void>;
	};
}

let running: Bench | null = null;
let watching: AfterWatch | null = null;
let manual: AfterWatch | null = null;
const MANUAL_WATCH_MS = 300000;

/** Chromium's accessibility support (Electron's `app.isAccessibilitySupportEnabled()` through @electron/remote), or null. */
function accessibilityEnabled(): boolean | null {
	try {
		const load = (window as unknown as { require?: (id: string) => unknown }).require;
		const remote = load?.("@electron/remote") as { app?: { isAccessibilitySupportEnabled?: () => unknown } } | undefined;
		const value = remote?.app?.isAccessibilitySupportEnabled?.();
		return typeof value === "boolean" ? value : null;
	} catch {
		return null;
	}
}

export function registerPmModeDiagnostics(plugin: DiagnosticsPlugin): void {
	registerInputRecordingCommand(plugin);
	plugin.addCommand({
		id: "pm-mode-m15-bench",
		name: "（開発用）新執筆モードの計測（M1-5）",
		callback: () => { void runBench(plugin); },
	});
	plugin.addCommand({
		id: "pm-mode-m15-manual-watch",
		name: "（開発用）新執筆モードの見張り（手動の操作、M1-5）の開始・終了",
		callback: () => { void toggleManualWatch(plugin); },
	});
	plugin.register(() => {
		running?.abort(); running = null;
		watching?.stop(); watching = null;
		manual?.stop(); manual = null;
	});
}

/** The new mode view's state now (null without one). */
function pmViewState(plugin: Plugin): PmRootState | null {
	const host = findPmHosts(plugin.app.workspace.containerEl)[0];
	return host ? readPmRootState(host) : null;
}

/** The sample's path, else null (the manual watch never records the path of another file). */
function activeSamplePath(plugin: Plugin): string | null {
	const path = plugin.app.workspace.getActiveFile()?.path ?? null;
	return path && isSamplePath(path) ? path : null;
}

async function toggleManualWatch(plugin: DiagnosticsPlugin): Promise<void> {
	if (manual) { manual.stop(); return; }
	if (running) { new Notice("計測の途中は見張りを始めない。"); return; }
	watching?.stop();
	const win = plugin.app.workspace.containerEl.ownerDocument.defaultView ?? window;
	const rssMb = () => {
		const usage = (window as unknown as { process?: { memoryUsage?: () => { rss: number } } }).process?.memoryUsage?.();
		return usage ? Math.round((usage.rss / 1048576) * 10) / 10 : null;
	};
	const started = new Date();
	const sample = activeSamplePath(plugin);
	const context = () => {
		const hosts = findPmHosts(plugin.app.workspace.containerEl);
		return {
			file: sample, pmViews: hosts.length, sotViews: leavesOf(plugin, SOT_VIEW_TYPE).length,
			pmElements: hosts.map(h => h.shadowRoot?.querySelectorAll("*").length ?? 0),
			viewStates: hosts.map(readPmRootState),
		};
	};
	const before = context();
	const watch = new AfterWatch({ win, rssMb, accessibilityEnabled }, { durationMs: MANUAL_WATCH_MS, intervalMs: 2000, trackFrames: true, trackKeys: true, trackResize: true });
	manual = watch;
	new Notice("新執筆モードの見張りを始めた（最長5分）。操作して、終わったらもう一度このcommandを実行してください。", 8000);
	let result: AfterWatchResult;
	try {
		result = await watch.run();
	} catch (error) {
		new Notice(`新執筆モードの見張りが失敗した: ${String(error)}`, 0);
		return;
	} finally {
		if (manual === watch) manual = null;
	}
	try {
		const doc = win.document;
		const file = {
			schema: MANUAL_WATCH_SCHEMA, startedAt: started.toISOString(),
			environment: { userAgent: win.navigator.userAgent, devicePixelRatio: win.devicePixelRatio, window: { width: win.innerWidth, height: win.innerHeight }, dark: doc.body.classList.contains("theme-dark") },
			before, after: context(), ...result,
		};
		const writer = createVaultResultWriter(plugin.app);
		const path = await writer(buildResultFileName(started, sample ?? "pm-spike-samples/outside-samples.md", "-m15-manual"), () => JSON.stringify(file, null, 2) + "\n");
		new Notice(manualWatchSummaryLines(result, before.viewStates, path).join("\n"), 0);
	} catch (error) {
		new Notice(`新執筆モードの見張りの結果を書けなかった: ${String(error)}`, 0);
	}
}

function leavesOf(plugin: Plugin, type: string): WorkspaceLeaf[] { return plugin.app.workspace.getLeavesOfType(type); }
function markdownLeafFor(plugin: Plugin, path: string): MarkdownView | null {
	for (const leaf of leavesOf(plugin, "markdown")) if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) return leaf.view;
	return null;
}
function cmOf(view: MarkdownView | null): CmView | null {
	return (view?.editor as (MarkdownView["editor"] & { cm?: CmView }) | undefined)?.cm ?? null;
}

/** Which view shows which file: the new mode, else V, else the active Markdown view. */
function resolveTarget(plugin: DiagnosticsPlugin): { mode: BenchViewMode; file: TFile; markdown: MarkdownView } | string {
	const tategaki = [...leavesOf(plugin, TATEGAKI_PM_VIEW_TYPE).map(leaf => ({ mode: "pm" as const, leaf })), ...leavesOf(plugin, SOT_VIEW_TYPE).map(leaf => ({ mode: "sot" as const, leaf }))];
	if (tategaki.length > 1) return "縦書きビューが2つ以上開いている。1つにしてから実行してください。";
	if (tategaki.length === 1) {
		const { mode, leaf } = tategaki[0];
		const path = (leaf.view as unknown as FileView).getCurrentFilePath?.() ?? null;
		const markdown = path ? markdownLeafFor(plugin, path) : null;
		if (!path || !markdown?.file) return "縦書きビューの対応するMarkdownの編集画面が見つからない。";
		return { mode, file: markdown.file, markdown };
	}
	const markdown = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!markdown?.file) return "Markdownの編集画面か縦書きビューを開いてから実行してください。";
	return { mode: "none", file: markdown.file, markdown };
}

function buildHost(plugin: DiagnosticsPlugin, mode: BenchViewMode, file: TFile, markdown: MarkdownView): BenchHost {
	const win = markdown.containerEl.ownerDocument.defaultView ?? window;
	const leaf = () => leavesOf(plugin, mode === "pm" ? TATEGAKI_PM_VIEW_TYPE : SOT_VIEW_TYPE)[0] ?? null;
	const pmScroll = () => (leaf()?.view.containerEl.querySelector("tategaki-pm-host")?.shadowRoot?.querySelector(".tategaki-pm-scroll") as HTMLElement | null) ?? null;
	const sotRoot = () => leaf()?.view.containerEl.querySelector<HTMLElement>(".tategaki-sot-derived-root") ?? null;
	const cm = cmOf(markdown);
	if (!cm) throw new Error("CodeMirrorが見つからない");
	const rssMb = () => {
		const usage = (window as unknown as { process?: { memoryUsage?: () => { rss: number } } }).process?.memoryUsage?.();
		return usage ? Math.round((usage.rss / 1048576) * 10) / 10 : null;
	};
	const base: BenchHost = {
		win, mode, filePath: file.path, cm: () => cm, rssMb, accessibilityEnabled,
		fileMatches: () => markdown.file?.path === file.path && cmOf(markdown) === cm,
		scrollElement: () => (mode === "pm" ? pmScroll() : mode === "sot" ? sotRoot() : null),
		// The view's content element (the new mode's session lives in it); for CM alone, the Markdown view's.
		resizeTarget: () => (mode === "none" ? markdown.contentEl : (leaf()?.view as { contentEl?: HTMLElement } | undefined)?.contentEl ?? null),
	};
	if (mode === "none") return base;
	const enableRuby = plugin.settings.wysiwyg.enableRuby !== false, plainTextView = plugin.settings.wysiwyg.plainTextView === true;
	return {
		...base,
		close: () => { leaf()?.detach(); },
		open: () => mode === "pm" ? plugin.modeManager.openPmModeView(file, { openOnRightSide: true }) : plugin.modeManager.openSoTWysiwygView(file, { openOnRightSide: true }),
		ready: () => {
			if (mode === "pm") {
				const view = leaf()?.view as PmModeView | undefined;
				return !!view?.activeSession && (view.activeSession.display.view.dom.childElementCount > 0);
			}
			const root = sotRoot(), overlay = leaf()?.view.containerEl.querySelector(".tategaki-sot-loading-overlay");
			return !!root?.querySelector(".tategaki-sot-line") && (!overlay || win.getComputedStyle(overlay).display === "none");
		},
		rebuildTimings: mode === "pm" ? () => (leaf()?.view as PmModeView | undefined)?.activeSession?.lastRebuildTimings ?? null : undefined,
		openTimings: mode === "pm" ? () => (leaf()?.view as PmModeView | undefined)?.activeSession?.openTimings ?? null : undefined,
		buildModel: mode === "pm" ? text => { PmModeDocumentState.build(text, { collapsedHeadingLines: new Set(), settings: { enableRuby, plainTextView } }); } : undefined,
		elementCount: () => {
			const container = leaf()?.view.containerEl;
			if (!container) return 0;
			return container.querySelectorAll("*").length + (container.querySelector("tategaki-pm-host")?.shadowRoot?.querySelectorAll("*").length ?? 0);
		},
	};
}

async function runBench(plugin: DiagnosticsPlugin): Promise<void> {
	if (running) { new Notice("計測はすでに動いている。"); return; }
	if (manual) { new Notice("見張り（手動の操作）の途中。先に終えてください。"); return; }
	watching?.stop();
	const target = resolveTarget(plugin);
	if (typeof target === "string") { new Notice(target, 6000); return; }
	if (!isSamplePath(target.file.path)) { new Notice("計測は試料（pm-spike-samples/ の下のファイル）でだけ動く。", 6000); return; }
	let host: BenchHost;
	try { host = buildHost(plugin, target.mode, target.file, target.markdown); } catch (error) { new Notice(String(error), 6000); return; }
	const started = new Date(), t0 = host.win.performance.now();
	const stage = new Notice("M1-5の計測を始めた（約30〜60秒）。終わるまで操作しないでください。", 0);
	const bench = new Bench(host, undefined, text => stage.setMessage(`M1-5の計測: ${text}`));
	running = bench;
	try {
		const run = await bench.run();
		const doc = host.win.document;
		const file: BenchResultFile = {
			schema: M15_SCHEMA, startedAt: started.toISOString(), durationMs: Math.round(host.win.performance.now() - t0),
			environment: {
				userAgent: host.win.navigator.userAgent, devicePixelRatio: host.win.devicePixelRatio,
				window: { width: host.win.innerWidth, height: host.win.innerHeight },
				theme: (plugin.app as unknown as { customCss?: { theme?: string } }).customCss?.theme ?? "",
				dark: doc.body.classList.contains("theme-dark"),
			},
			...run, targets: checkTargets(run), viewState: target.mode === "pm" ? pmViewState(plugin) : null,
		};
		const writer = createVaultResultWriter(plugin.app);
		const path = await writer(buildResultFileName(started, target.file.path, `-m15-${target.mode}`), () => JSON.stringify(file, null, 2) + "\n");
		debugLog("[M1-5]", file);
		new Notice(summaryLines(file, path).join("\n"), 0);
		if (!run.errors.includes("aborted")) void watchAfter(plugin, host, started, target.file.path, target.mode);
	} catch (error) {
		new Notice(`M1-5の計測が失敗した: ${String(error)}`, 0);
	} finally {
		running = null;
		stage.hide();
	}
}

/**
 * The 2 minutes after a run: what the renderer did (a stop, long frames, accessibility, app switches).
 * Ended early by a new run or the plugin unloading: the file is still written, without a Notice.
 */
async function watchAfter(plugin: DiagnosticsPlugin, host: BenchHost, started: Date, filePath: string, mode: BenchViewMode): Promise<void> {
	const watch = new AfterWatch(host);
	watching = watch;
	try {
		const result = await watch.run();
		if (watching === watch) watching = null;
		const writer = createVaultResultWriter(plugin.app);
		const path = await writer(buildResultFileName(started, filePath, `-m15-${mode}-after`), () => JSON.stringify({ schema: AFTER_WATCH_SCHEMA, startedAt: started.toISOString(), viewState: mode === "pm" ? pmViewState(plugin) : null, ...result }, null, 2) + "\n");
		if (!result.stopped) new Notice(afterWatchSummaryLines(result, path).join("\n"), 0);
	} catch (error) {
		if (watching === watch) watching = null;
		new Notice(`M1-5の計測の後の見張りが失敗した: ${String(error)}`, 0);
	}
}
