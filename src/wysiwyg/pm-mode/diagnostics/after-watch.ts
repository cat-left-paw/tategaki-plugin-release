/**
 * M1-5 diagnostics: watches the renderer for a while after a measurement (2 minutes by default). Added on
 * 2026-10-19: once on Windows, Obsidian froze for about two minutes right after a run had finished, and the
 * next run did not. It only observes; it changes nothing.
 *
 * - A timer every 5 s records the JS heap, the process memory and Chromium's accessibility support, and how
 *   late it fired. A main thread that was blocked shows as a late timer (the length of the stop).
 * - Long frames (long-animation-frame) and long tasks: whether a stop was script, or style, layout and paint
 *   (or other work outside script, such as accessibility updates).
 * - The window's focus and visibility changes, to line a stop up with switching to another app.
 * The timer is the only one, and `stop()` (a new run, or the plugin unloading) ends it at once.
 *
 * Added 2026-10-20 for the manual watch (a freeze while typing; index.ts), both off by default:
 * - `trackFrames`: a frame loop; gaps between frames of 100 ms or more. A gap with no long task in the page
 *   means the frames stopped outside this renderer (Obsidian's browser process, the GPU), not in its script.
 *   The browser stops frames while the window is hidden or covered, so each gap records the visibility.
 * - `trackKeys`: the kind of each key pressed (Enter, Backspace, a character, IME, ...; never the text) and
 *   the time from the key to the next frame.
 *
 * Added 2026-10-21 (M1-5 report §13.4), off by default:
 * - `trackResize`: the window's resize events (time and size), to line the frame gaps up with a window
 *   being resized by hand.
 */
import { BenchEntryCollector } from "./observers";
import { deriveLoaf, round3, summarize, summarizeLoaf, type LoafDerived, type LoafSummary } from "./stats";
import { heapMb } from "./bench";

export interface AfterWatchHost {
	readonly win: Window;
	rssMb?(): number | null;
	accessibilityEnabled?(): boolean | null;
}
export interface AfterWatchOptions {
	durationMs: number;
	intervalMs: number;
	trackFrames?: boolean;
	trackKeys?: boolean;
	trackResize?: boolean;
}
export const DEFAULT_AFTER_WATCH_OPTIONS: AfterWatchOptions = { durationMs: 120000, intervalMs: 5000 };

export interface AfterWatchSample {
	/** From the start of the watch. */
	atMs: number;
	/** How much later than planned this sample's timer fired. */
	lateMs: number;
	heapMb: number | null;
	rssMb: number | null;
	accessibility: boolean | null;
}
export interface AfterWatchEvent {
	atMs: number;
	type: "focus" | "blur" | "hidden" | "visible";
}
export interface AfterWatchFrameGap {
	/** From the start of the watch, at the frame after the gap. */
	atMs: number;
	gapMs: number;
	hidden: boolean;
	/** A long task in the page overlapping the gap. */
	longTaskMs: number;
}
export type KeyKind = "Enter" | "Backspace" | "Delete" | "Arrow" | "char" | "ime" | "modifier" | "shortcut" | "other";
export interface AfterWatchKey {
	atMs: number;
	kind: KeyKind;
	/** From the key (the event's time stamp) to the next frame; null if the watch ended first. */
	toFrameMs: number | null;
}
export interface AfterWatchResult {
	durationMs: number;
	intervalMs: number;
	/** Ended early by `stop()`. */
	stopped: boolean;
	samples: AfterWatchSample[];
	/** The latest a timer fired: the longest the main thread was seen blocked. */
	maxLateMs: number;
	events: AfterWatchEvent[];
	loaf: LoafSummary;
	/** Long frames of 200 ms or more, in order (at most 100). */
	longFrames: LoafDerived[];
	/** Long tasks of 200 ms or more: start from the watch's start, and duration (at most 100). */
	longTasks: Array<{ atMs: number; durationMs: number }>;
	accessibilityEverOn: boolean;
	/** With `trackFrames`: frames seen and the gaps of 100 ms or more (at most 300). */
	frames?: { count: number; over50?: number; maxGapMs: number; gaps: AfterWatchFrameGap[] };
	/** With `trackKeys`: the keys (at most 1000). */
	keys?: AfterWatchKey[];
	/** Each kind: total keys, keys that reached a frame, and latency statistics; no characters. */
	keysByKind?: Partial<Record<KeyKind, { count: number; measured: number; median: number; p95: number }>>;
	/** With `trackResize`: the window's resize events (all counted, the first 300 kept). */
	resizes?: { count: number; events: Array<{ atMs: number; width: number; height: number }> };
}

/** Only the kind of key; the text typed is never recorded. */
export function classifyKey(event: Pick<KeyboardEvent, "key" | "keyCode" | "isComposing" | "ctrlKey" | "metaKey" | "altKey">): KeyKind {
	if (event.isComposing || event.keyCode === 229 || event.key === "Process") return "ime";
	if (event.key === "Enter" || event.key === "Backspace" || event.key === "Delete") return event.key;
	if (event.key.startsWith("Arrow")) return "Arrow";
	if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta" || event.key === "CapsLock") return "modifier";
	if (event.ctrlKey || event.metaKey || event.altKey) return "shortcut";
	if ([...event.key].length === 1) return "char";
	return "other";
}

const LONG_MS = 200;
const KEEP = 100;
const GAP_MS = 100;
const KEEP_GAPS = 300;
const KEEP_KEYS = 1000;
const KEEP_RESIZES = 300;

export class AfterWatch {
	private stopRequested = false;
	private finish: (() => void) | null = null;
	constructor(private readonly host: AfterWatchHost, private readonly options: AfterWatchOptions = DEFAULT_AFTER_WATCH_OPTIONS) {}
	/** Ends the watch now; `run()` resolves with what it saw. */
	stop(): void {
		this.stopRequested = true;
		this.finish?.();
	}
	async run(): Promise<AfterWatchResult> {
		const { win } = this.host;
		const now = () => win.performance.now();
		const t0 = now();
		const entries = new BenchEntryCollector(win);
		const events: AfterWatchEvent[] = [];
		const samples: AfterWatchSample[] = [];
		const at = () => round3(now() - t0);
		const onFocus = () => events.push({ atMs: at(), type: "focus" });
		const onBlur = () => events.push({ atMs: at(), type: "blur" });
		const onVisibility = () => events.push({ atMs: at(), type: win.document.visibilityState === "hidden" ? "hidden" : "visible" });
		const sample = (lateMs: number) => samples.push({ atMs: at(), lateMs: round3(Math.max(0, lateMs)), heapMb: heapMb(win), rssMb: this.host.rssMb?.() ?? null, accessibility: this.host.accessibilityEnabled?.() ?? null });
		const gaps: Array<{ at: number; gapMs: number; hidden: boolean }> = [];
		const keyCounts = new Map<KeyKind, number>();
		const keys: Array<{ at: number; stamp: number; kind: KeyKind; toFrameMs: number | null }> = [];
		let frameCount = 0, over50 = 0, maxGap = 0, lastFrame = -1, rafId = 0, pendingKey = 0, framesOn = !!this.options.trackFrames || !!this.options.trackKeys;
		// The time the callback runs, not the frame's time stamp: after a stop, the stamp can be older than the stop's end.
		const onFrame = () => {
			if (!framesOn) return;
			const t = now();
			frameCount++;
			if (lastFrame >= 0) {
				const gap = t - lastFrame;
				if (gap > maxGap) maxGap = gap;
				if (gap >= 50) over50++;
				if (this.options.trackFrames && gap >= GAP_MS && gaps.length < KEEP_GAPS) gaps.push({ at: t, gapMs: gap, hidden: win.document.visibilityState === "hidden" });
			}
			lastFrame = t;
			for (; pendingKey < keys.length && keys[pendingKey].stamp <= t; pendingKey++) keys[pendingKey].toFrameMs = round3(t - keys[pendingKey].stamp);
			rafId = win.requestAnimationFrame(onFrame);
		};
		const onKey = (event: KeyboardEvent) => {
			const kind = classifyKey(event); keyCounts.set(kind, (keyCounts.get(kind) ?? 0) + 1);
			if (keys.length < KEEP_KEYS) keys.push({ at: event.timeStamp, stamp: event.timeStamp, kind, toFrameMs: null });
		};
		const resizes: Array<{ atMs: number; width: number; height: number }> = [];
		let resizeCount = 0;
		const onResize = () => {
			resizeCount++;
			if (resizes.length < KEEP_RESIZES) resizes.push({ atMs: at(), width: win.innerWidth, height: win.innerHeight });
		};
		entries.start();
		if (framesOn) rafId = win.requestAnimationFrame(onFrame);
		if (this.options.trackKeys) win.addEventListener("keydown", onKey, { capture: true, passive: true });
		if (this.options.trackResize) win.addEventListener("resize", onResize, { passive: true });
		win.addEventListener("focus", onFocus);
		win.addEventListener("blur", onBlur);
		win.document.addEventListener("visibilitychange", onVisibility);
		sample(0);
		let timer = 0;
		await new Promise<void>(resolve => {
			const done = () => { this.finish = null; win.clearTimeout(timer); resolve(); };
			this.finish = done;
			if (this.stopRequested) { done(); return; }
			let planned = now() + this.options.intervalMs;
			const tick = () => {
				sample(now() - planned);
				if (this.stopRequested || now() - t0 >= this.options.durationMs) { done(); return; }
				planned = now() + this.options.intervalMs;
				timer = win.setTimeout(tick, this.options.intervalMs);
			};
			timer = win.setTimeout(tick, this.options.intervalMs);
		});
		framesOn = false;
		win.cancelAnimationFrame(rafId);
		if (this.options.trackKeys) win.removeEventListener("keydown", onKey, { capture: true });
		if (this.options.trackResize) win.removeEventListener("resize", onResize);
		win.removeEventListener("focus", onFocus);
		win.removeEventListener("blur", onBlur);
		win.document.removeEventListener("visibilitychange", onVisibility);
		entries.flush();
		const t1 = now();
		const loafRaw = entries.loafBetween(t0, t1);
		const tasks = entries.longtasksBetween(t0, t1);
		entries.stop();
		const overlap = (from: number, to: number) => tasks.reduce((sum, task) => sum + Math.max(0, Math.min(to, task.startTime + task.duration) - Math.max(from, task.startTime)), 0);
		const extra: Pick<AfterWatchResult, "frames" | "keys" | "keysByKind" | "resizes"> = {};
		if (this.options.trackFrames) extra.frames = { count: frameCount, over50, maxGapMs: round3(maxGap), gaps: gaps.map(g => ({ atMs: round3(g.at - t0), gapMs: round3(g.gapMs), hidden: g.hidden, longTaskMs: round3(overlap(g.at - g.gapMs, g.at)) })) };
		if (this.options.trackKeys) {
			extra.keys = keys.map(k => ({ atMs: round3(k.at - t0), kind: k.kind, toFrameMs: k.toFrameMs }));
			extra.keysByKind = {};
			for (const [kind, count] of keyCounts) {
				const selected = keys.filter(k => k.kind === kind), stats = summarize(selected.flatMap(k => k.toFrameMs === null ? [] : [k.toFrameMs]));
				extra.keysByKind[kind] = { count, measured: stats.count, median: stats.median, p95: stats.p95 };
			}
		}
		if (this.options.trackResize) extra.resizes = { count: resizeCount, events: resizes };
		return {
			durationMs: round3(t1 - t0), intervalMs: this.options.intervalMs, stopped: this.stopRequested, samples,
			maxLateMs: Math.max(0, ...samples.map(s => s.lateMs)), events,
			loaf: summarizeLoaf(loafRaw, entries.loafSupported, t0),
			longFrames: loafRaw.filter(e => e.duration >= LONG_MS).slice(0, KEEP).map(e => deriveLoaf(e, t0)),
			longTasks: tasks.filter(e => e.duration >= LONG_MS).slice(0, KEEP).map(e => ({ atMs: round3(e.startTime - t0), durationMs: round3(e.duration) })),
			accessibilityEverOn: samples.some(s => s.accessibility === true),
			...extra,
		};
	}
}
