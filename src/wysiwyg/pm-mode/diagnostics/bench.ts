/**
 * M1-5 diagnostics: the measurement procedure (M1 design §8). It works on whatever view shows the sample —
 * the new mode, the current SoT mode (V), or none (the paired CodeMirror alone) — through `BenchHost`, so the
 * same procedure measures all three and also runs in headless Chromium.
 *
 * It only observes, except for:
 *  (1) closing and reopening the view, for the open timing;
 *  (2) the sample's CodeMirror edits, all through `CmRestorePoint` (cm-edits.ts): only `pm-spike-samples/`,
 *      outside the undo history, and restored to the start text at the end (also on errors and aborts);
 *  (3) the view's scroll position, put back at the end;
 *  (4) the size of the view's container (`max-height` / `max-width` inline, as a window resize changes it),
 *      put back at the end (also on errors and aborts).
 * Waits are frames (rAF), a new task (MessageChannel) and, for the scroll runs only, a fixed delay.
 *
 * Added 2026-10-21 (M1-5 report §13.4): the parts of opening (the session's build stages and the long
 * frames while opening), and resizing.
 */
import { CmRestorePoint, EDIT_KINDS, EditPlanner, OPS_PER_KIND, type CmLike, type EditKindId, type RestoreOutcome } from "./cm-edits";
import { AbortableWaits, BenchEntryCollector, FrameLoop } from "./observers";
import { chooseScrollStart, round3, summarize, summarizeFrameTimestamps, summarizeLoaf, type FrameStats, type LoafSummary, type Summary } from "./stats";
import type { PmModeRebuildTimings, PmModeSessionOpenTimings } from "../obsidian/session";

export type BenchViewMode = "pm" | "sot" | "none";

export interface BenchHost {
	readonly win: Window;
	readonly mode: BenchViewMode;
	readonly filePath: string;
	cm(): CmLike;
	/** The paired Markdown view still shows `filePath`. */
	fileMatches(): boolean;
	/** The element that scrolls the view (none for "none"). Read again after a reopen. */
	scrollElement(): HTMLElement | null;
	/** Closes the view (synchronous). With `open`, for the open timing. */
	close?(): void;
	/** Opens the view again for the same file; resolves when the open call returns. */
	open?(): Promise<void>;
	/** The reopened view shows its content (lines drawn, no loading overlay). */
	ready?(): boolean;
	/** The new mode's last rebuild stages. */
	rebuildTimings?(): PmModeRebuildTimings | null;
	/** The new mode's build stages of the view opened last. */
	openTimings?(): PmModeSessionOpenTimings | null;
	/** The element a window resize changes the size of: the view's container. Read again after a reopen. */
	resizeTarget?(): HTMLElement | null;
	/** The new mode's pure model build of `text` (the first stage of opening). */
	buildModel?(text: string): void;
	/** Elements the view holds (its light DOM and shadow DOM), a memory proxy. */
	elementCount?(): number;
	/** The renderer process's resident memory in MB (Electron), or null. */
	rssMb?(): number | null;
	/** Whether Chromium's accessibility support is on (an assistive or UI Automation client turned it on), or null. */
	accessibilityEnabled?(): boolean | null;
}

export interface BenchOptions {
	openRuns: number;
	opsPerKind: number;
	kinds: readonly EditKindId[];
	scrollSpeeds: readonly number[];
	scrollMs: number;
	/** Frames to wait for `ready()` after a reopen. */
	readyFrameLimit: number;
	/**
	 * Resizing, on each axis: `steps` changes of `stepPx` smaller and back (a window edge dragged slowly), then
	 * one change by `largeFraction` of the size and back (a window maximized and restored). Null: not measured.
	 */
	resize: { steps: number; stepPx: number; largeFraction: number } | null;
}
export const DEFAULT_BENCH_OPTIONS: BenchOptions = {
	openRuns: 3,
	opsPerKind: OPS_PER_KIND,
	kinds: EDIT_KINDS.map(kind => kind.id),
	scrollSpeeds: [1500, 6000],
	scrollMs: 4000,
	readyFrameLimit: 1800,
	resize: { steps: 6, stepPx: 8, largeFraction: 0.25 },
};

export interface OpenRun {
	/** `close()` (the old view's teardown). */
	closeMs: number;
	/** From the start of `open()` until its call returns; the times below are from the same start. */
	callMs: number;
	/** Until the first frame in which `ready()` holds. */
	readyMs: number;
	/** Until the frame after that one (painted). */
	paintedMs: number;
	heapDeltaMb: number | null;
	longFrames: number;
	longFrameMaxMs: number;
	/** The new mode's build stages (in the open call), or null. */
	construct: PmModeSessionOpenTimings | null;
	/** Long frames while opening: the open call's script, the scripts after it (forced layout), style and layout. */
	loaf: LoafSummary;
}
export interface EditOp {
	/** `dispatch` (CM and every listener, the new mode's rebuild included). */
	syncMs: number;
	/** `dispatch` plus a layout read of the view (style and layout forced). */
	taskMs: number;
	/** Until the start of the frame after the one that drew the change. */
	toFrameMs: number;
	rebuild: PmModeRebuildTimings | null;
}
export interface EditKindResult {
	kind: EditKindId;
	label: string;
	ops: number;
	targetLine: number;
	sync: Summary;
	task: Summary;
	toFrame: Summary;
	/** The new mode's rebuild stages (median of each), or null. */
	rebuild: Record<"total" | "text" | "model" | "layout" | "transaction" | "decorations" | "view" | "parts", Summary> | null;
	/** Long frames (over 50 ms) during this kind's edits: where the frame time went (script / style, layout, paint). */
	loaf: LoafSummary;
}
export interface ScrollRun {
	speedPxPerSec: number;
	startPx: number;
	movedPx: number;
	reachedEnd: boolean;
	/** The frame interval while idle just before the run (V may still be drawing then). */
	idleIntervalMs: number;
	frames: FrameStats;
	/** Frames whose interval was more than 1.5 × the display's refresh interval (`BenchRun.refreshMs`), in %. */
	droppedPct: number;
	loaf: LoafSummary;
	/** The smallest JS heap seen during the run (after a collection, close to the live heap), or null. */
	heapMinMb: number | null;
}
export interface ResizeStep {
	/** The container's size on the axis after the change (border box, CSS px). */
	sizePx: number;
	/** The view's scroll size along the text after the change (the columns in vertical writing): the text was laid out again. */
	scrollSizePx: number | null;
	/** From the change until the start of the frame after the one that drew it. */
	toFrameMs: number;
}
export interface ResizeRun {
	axis: "height" | "width";
	/** The axis along the lines (the height in vertical writing): a change there breaks every line again. */
	lineAxis: boolean;
	kind: "steps" | "large";
	/** The container's size before the run (border box, CSS px). */
	baseSizePx: number;
	/** Smaller step by step, then back; the last step puts the original size back. */
	steps: ResizeStep[];
	toFrame: Summary;
	loaf: LoafSummary;
}
/** Memory and accessibility at a phase boundary (2026-10-19, after a freeze that followed a Windows run). */
export interface PhaseSnapshot {
	phase: "start" | "after-open" | "after-edits" | "after-scroll" | "after-resize" | "end";
	/** From the start of the run. */
	atMs: number;
	heapMb: number | null;
	rssMb: number | null;
	accessibility: boolean | null;
}
export interface BenchRun {
	mode: BenchViewMode;
	filePath: string;
	chars: number;
	lines: number;
	vertical: boolean;
	/** The display's refresh interval, measured idle at the start (before anything else). */
	refreshMs: number;
	viewport: { width: number; height: number; scrollWidth: number; scrollHeight: number } | null;
	viewElements: number | null;
	rssMb: { start: number | null; end: number | null };
	open: { runs: OpenRun[]; ready: Summary; painted: Summary; buildModelMs: Summary | null } | null;
	edits: EditKindResult[];
	restore: RestoreOutcome | null;
	scroll: ScrollRun[];
	resize: ResizeRun[];
	heapMb: { start: number | null; end: number | null };
	phases: PhaseSnapshot[];
	loafSupported: boolean;
	errors: string[];
}

export function heapMb(win: Window): number | null {
	const memory = (win.performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
	return typeof memory?.usedJSHeapSize === "number" ? round3(memory.usedJSHeapSize / 1048576) : null;
}
function isVertical(win: Window, el: HTMLElement | null): boolean {
	return !!el && win.getComputedStyle(el).writingMode.startsWith("vertical");
}
/** A layout read of the view, so style and layout of the change run now. */
function readLayout(host: BenchHost): void {
	const el = host.scrollElement();
	if (el) void el.scrollWidth;
	else void host.win.document.documentElement.offsetHeight;
}
function borderSize(el: HTMLElement, axis: "height" | "width"): number {
	const rect = el.getBoundingClientRect();
	return axis === "height" ? rect.height : rect.width;
}
/** The size `max-height` / `max-width` limits (the content box unless `box-sizing: border-box`). */
function limitSize(win: Window, el: HTMLElement, axis: "height" | "width"): number {
	const style = win.getComputedStyle(el), size = borderSize(el, axis);
	if (style.boxSizing === "border-box") return size;
	const sides = axis === "height" ? ["Top", "Bottom"] : ["Left", "Right"];
	const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
	return size - sides.reduce((sum, side) => sum + px(`padding-${side.toLowerCase()}`) + px(`border-${side.toLowerCase()}-width`), 0);
}
function roundOpenTimings(timings: PmModeSessionOpenTimings | null): PmModeSessionOpenTimings | null {
	if (!timings) return null;
	const r = (value: number) => round3(value);
	const { stages } = timings;
	return { total: r(timings.total), mount: r(timings.mount), display: r(timings.display), rest: r(timings.rest),
		stages: { model: r(stages.model), layout: r(stages.layout), decorations: r(stages.decorations), view: r(stages.view), parts: r(stages.parts) } };
}

export class Bench {
	private readonly waits: AbortableWaits;
	private readonly entries: BenchEntryCollector;
	private aborted = false;
	private refreshMs = 0;
	private restorePoint: CmRestorePoint | null = null;
	private startedAt = 0;
	constructor(private readonly host: BenchHost, private readonly options: BenchOptions = DEFAULT_BENCH_OPTIONS, private readonly onStage: (text: string) => void = () => {}) {
		this.waits = new AbortableWaits(host.win);
		this.entries = new BenchEntryCollector(host.win);
	}
	/** Stops at the next check; the edits are restored at once. */
	abort(): void {
		this.aborted = true;
		this.waits.cancelAll();
		this.restorePoint?.restore();
	}
	private now(): number { return this.host.win.performance.now(); }
	private snapshot(phase: PhaseSnapshot["phase"]): PhaseSnapshot {
		const { host } = this;
		return { phase, atMs: round3(this.now() - this.startedAt), heapMb: heapMb(host.win), rssMb: host.rssMb?.() ?? null, accessibility: host.accessibilityEnabled?.() ?? null };
	}
	async run(): Promise<BenchRun> {
		const { host } = this;
		const doc = host.cm().state.doc;
		const errors: string[] = [];
		this.startedAt = this.now();
		const phases: PhaseSnapshot[] = [this.snapshot("start")];
		const result: BenchRun = {
			mode: host.mode, filePath: host.filePath, chars: doc.length, lines: doc.lines, vertical: false, refreshMs: 0, viewport: null,
			viewElements: null, rssMb: { start: host.rssMb?.() ?? null, end: null },
			open: null, edits: [], restore: null, scroll: [], resize: [], heapMb: { start: heapMb(host.win), end: null }, phases,
			loafSupported: this.entries.loafSupported, errors,
		};
		this.entries.start();
		try {
			await this.waits.frames(10);
			const idle = new FrameLoop(host.win);
			idle.start();
			await this.waits.frames(61);
			result.refreshMs = summarizeFrameTimestamps(idle.stop()).medianGapMs;
			this.refreshMs = result.refreshMs;
			if (host.close && host.open && host.ready && this.options.openRuns > 0) result.open = await this.measureOpen(host.close, host.open, host.ready, errors);
			phases.push(this.snapshot("after-open"));
			const el = host.scrollElement();
			result.vertical = isVertical(host.win, el);
			if (el) result.viewport = { width: el.clientWidth, height: el.clientHeight, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight };
			result.viewElements = host.elementCount?.() ?? null;
			if (!this.aborted) result.edits = await this.measureEdits(errors);
			result.restore = this.restorePoint?.restore() ?? null;
			phases.push(this.snapshot("after-edits"));
			if (!this.aborted && el) result.scroll = await this.measureScroll(errors);
			phases.push(this.snapshot("after-scroll"));
			if (!this.aborted && this.options.resize) result.resize = await this.measureResize(this.options.resize, errors);
			phases.push(this.snapshot("after-resize"));
		} catch (error) {
			errors.push(String(error));
		} finally {
			result.restore = this.restorePoint?.restore() ?? result.restore;
			this.entries.flush();
			this.entries.stop();
			result.heapMb.end = heapMb(host.win);
			result.rssMb.end = host.rssMb?.() ?? null;
			phases.push(this.snapshot("end"));
		}
		if (this.aborted) errors.push("aborted");
		return result;
	}
	private async measureOpen(close: () => void, open: () => Promise<void>, ready: () => boolean, errors: string[]): Promise<BenchRun["open"]> {
		const { host } = this;
		const runs: OpenRun[] = [];
		for (let i = 0; i < this.options.openRuns && !this.aborted; i++) {
			this.onStage(`開く ${i + 1}/${this.options.openRuns}`);
			await this.waits.frames(5);
			const c0 = this.now();
			close();
			const closeMs = this.now() - c0;
			await this.waits.frames(5);
			// From a new task, as a command opens it (not inside a frame callback): its long frame is then recorded.
			await this.waits.task();
			const heap0 = heapMb(host.win);
			const t0 = this.now();
			await open();
			const t1 = this.now();
			let frames = 0, tReady = -1;
			while (!this.aborted && frames < this.options.readyFrameLimit) {
				await this.waits.frames(1);
				frames++;
				if (ready()) { tReady = this.now(); break; }
			}
			if (tReady < 0) { errors.push(`open ${i + 1}: not ready after ${frames} frames`); break; }
			await this.waits.frames(1);
			const t3 = this.now();
			// A long frame is reported after it was presented: a few more frames before reading them.
			await this.waits.frames(3);
			this.entries.flush();
			const long = this.entries.loafBetween(t0, t3);
			runs.push({ closeMs: round3(closeMs), callMs: round3(t1 - t0), readyMs: round3(tReady - t0), paintedMs: round3(t3 - t0),
				heapDeltaMb: heap0 !== null ? round3((heapMb(host.win) ?? heap0) - heap0) : null,
				longFrames: long.length, longFrameMaxMs: round3(Math.max(0, ...long.map(e => e.duration))),
				construct: roundOpenTimings(host.openTimings?.() ?? null), loaf: summarizeLoaf(long, this.entries.loafSupported, t0) });
		}
		let buildModelMs: Summary | null = null;
		if (host.buildModel) {
			const text = host.cm().state.doc.toString(), times: number[] = [];
			for (let i = 0; i < 3 && !this.aborted; i++) { await this.waits.task(); const t0 = this.now(); host.buildModel(text); times.push(this.now() - t0); }
			buildModelMs = summarize(times);
		}
		return { runs, ready: summarize(runs.map(r => r.readyMs)), painted: summarize(runs.map(r => r.paintedMs)), buildModelMs };
	}
	private async measureEdits(errors: string[]): Promise<EditKindResult[]> {
		const { host } = this;
		const cm = host.cm();
		this.restorePoint = new CmRestorePoint(cm, host.filePath, () => host.fileMatches());
		const planner = new EditPlanner();
		const results: EditKindResult[] = [];
		for (const kind of this.options.kinds) {
			if (this.aborted) break;
			const info = EDIT_KINDS.find(k => k.id === kind);
			if (!info) continue;
			this.onStage(`編集 ${info.label}`);
			const setup = planner.setup(kind, cm.state.doc);
			if (setup) { this.restorePoint.apply(setup); await this.waits.frames(3); }
			planner.begin(kind, cm.state.doc, this.options.opsPerKind);
			const ops: EditOp[] = [];
			const w0 = this.now();
			for (let i = 0; i < planner.targetCount && !this.aborted; i++) {
				await this.waits.frames(1);
				await this.waits.task();
				const spec = planner.next(i, cm.state.doc);
				if (!spec) continue;
				const t0 = this.now();
				const tr = this.restorePoint.apply(spec);
				const t1 = this.now();
				readLayout(host);
				const t2 = this.now();
				const rebuild = host.rebuildTimings?.() ?? null;
				planner.after(tr.changes);
				await this.waits.frames(2);
				ops.push({ syncMs: t1 - t0, taskMs: t2 - t0, toFrameMs: this.now() - t0, rebuild: rebuild ? { ...rebuild, display: rebuild.display ? { ...rebuild.display } : null } : null });
			}
			if (this.restorePoint.hasDiverged) { errors.push(`${kind}: the sample changed outside the measurement`); break; }
			this.entries.flush();
			const loaf = summarizeLoaf(this.entries.loafBetween(w0, this.now()), this.entries.loafSupported, w0);
			const rebuilds = ops.flatMap(op => op.rebuild ? [op.rebuild] : []);
			const stage = (pick: (r: PmModeRebuildTimings) => number) => summarize(rebuilds.map(pick));
			results.push({
				kind, label: info.label, ops: ops.length, targetLine: planner.targetLine,
				sync: summarize(ops.map(op => op.syncMs)), task: summarize(ops.map(op => op.taskMs)), toFrame: summarize(ops.map(op => op.toFrameMs)),
				rebuild: rebuilds.length ? {
					total: stage(r => r.total), text: stage(r => r.text),
					model: stage(r => r.display?.model ?? 0), layout: stage(r => r.display?.layout ?? 0), transaction: stage(r => r.display?.transaction ?? 0),
					decorations: stage(r => r.display?.decorations ?? 0), view: stage(r => r.display?.view ?? 0), parts: stage(r => r.display?.parts ?? 0),
				} : null,
				loaf,
			});
		}
		return results;
	}
	private async measureScroll(errors: string[]): Promise<ScrollRun[]> {
		const { host } = this;
		const runs: ScrollRun[] = [];
		for (const speed of this.options.scrollSpeeds) {
			if (this.aborted) break;
			const el = host.scrollElement();
			if (!el) break;
			this.onStage(`scroll ${speed} px/s`);
			const vertical = isVertical(host.win, el);
			const original = { left: el.scrollLeft, top: el.scrollTop };
			const range = vertical ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
			const needed = (speed * this.options.scrollMs) / 1000;
			const startPx = chooseScrollStart(range, needed);
			// vertical-rl: scrollLeft goes from 0 to negative.
			if (vertical) el.scrollLeft = -startPx; else el.scrollTop = startPx;
			await this.waits.frames(10);
			const idle = new FrameLoop(host.win);
			idle.start();
			await this.waits.frames(31);
			const idleStats = summarizeFrameTimestamps(idle.stop());
			const at = vertical ? el.scrollLeft : el.scrollTop;
			let moved = 0, t0 = -1, heapMin: number | null = null;
			const maxDelta = Math.max(0, range - startPx);
			const loop = new FrameLoop(host.win, t => {
				if (t0 < 0) t0 = t;
				const heap = heapMb(host.win);
				if (heap !== null && (heapMin === null || heap < heapMin)) heapMin = heap;
				moved = Math.min(maxDelta, (speed * (t - t0)) / 1000);
				if (vertical) el.scrollLeft = at - moved; else el.scrollTop = at + moved;
			});
			const w0 = this.now();
			loop.start();
			await this.waits.delay(this.options.scrollMs);
			const stamps = loop.stop();
			const w1 = this.now();
			this.entries.flush();
			const frames = summarizeFrameTimestamps(stamps);
			const limit = (this.refreshMs || idleStats.medianGapMs) * 1.5;
			let dropped = 0;
			for (let i = 1; i < stamps.length; i++) if ((stamps[i] ?? 0) - (stamps[i - 1] ?? 0) > limit) dropped++;
			runs.push({ speedPxPerSec: speed, startPx: round3(startPx), movedPx: round3(moved), reachedEnd: maxDelta > 0 && moved >= maxDelta - 1,
				idleIntervalMs: idleStats.medianGapMs, frames, droppedPct: frames.frames ? round3((dropped / frames.frames) * 100) : 0,
				loaf: summarizeLoaf(this.entries.loafBetween(w0, w1), this.entries.loafSupported, w0), heapMinMb: heapMin });
			el.scrollLeft = original.left; el.scrollTop = original.top;
			await this.waits.frames(5);
			if (!idleStats.frames) errors.push(`scroll ${speed}: no idle frames`);
		}
		return runs;
	}
	private async measureResize(plan: NonNullable<BenchOptions["resize"]>, errors: string[]): Promise<ResizeRun[]> {
		const { host } = this;
		const el = host.resizeTarget?.() ?? null;
		if (!el) return [];
		const scroller = host.scrollElement();
		const vertical = isVertical(host.win, scroller ?? el);
		const saved = (["max-height", "max-width"] as const).map(name => ({ name, value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name) }));
		const scroll0 = scroller ? { left: scroller.scrollLeft, top: scroller.scrollTop } : null;
		const putBack = (name: "max-height" | "max-width") => {
			const original = saved.find(item => item.name === name);
			if (original?.value) el.style.setProperty(name, original.value, original.priority); else el.style.removeProperty(name);
		};
		const runs: ResizeRun[] = [];
		try {
			for (const axis of ["height", "width"] as const) {
				const name = axis === "height" ? "max-height" : "max-width";
				const lineAxis = vertical ? axis === "height" : axis === "width";
				const base = borderSize(el, axis), extra = base - limitSize(host.win, el, axis);
				const large = Math.round(base * plan.largeFraction);
				const shrink = Array.from({ length: plan.steps }, (_, i) => (i + 1) * plan.stepPx);
				const plans: Array<{ kind: ResizeRun["kind"]; deltas: number[] }> = [
					{ kind: "steps", deltas: [...shrink, ...shrink.slice(0, -1).reverse(), 0] },
					{ kind: "large", deltas: [large, 0] },
				];
				for (const { kind, deltas } of plans) {
					if (this.aborted) break;
					this.onStage(`windowの大きさ ${axis === "height" ? "高さ" : "幅"}（${kind === "steps" ? `${plan.stepPx} px刻み` : "大きく"}）`);
					const steps: ResizeStep[] = [];
					const w0 = this.now();
					for (const delta of deltas) {
						if (this.aborted) break;
						await this.waits.frames(1);
						await this.waits.task();
						const t0 = this.now();
						if (delta === 0) putBack(name); else el.style.setProperty(name, `${Math.max(0, base - delta - extra)}px`);
						await this.waits.frames(2);
						const t1 = this.now();
						const scroll = host.scrollElement();
						steps.push({ sizePx: round3(borderSize(el, axis)), scrollSizePx: scroll ? (vertical ? scroll.scrollWidth : scroll.scrollHeight) : null, toFrameMs: round3(t1 - t0) });
					}
					this.entries.flush();
					runs.push({ axis, lineAxis, kind, baseSizePx: round3(base), steps, toFrame: summarize(steps.map(step => step.toFrameMs)),
						loaf: summarizeLoaf(this.entries.loafBetween(w0, this.now()), this.entries.loafSupported, w0) });
					if (steps.length && Math.abs((steps[0]?.sizePx ?? base) - base) < 0.5) errors.push(`resize ${axis} ${kind}: the size did not change`);
				}
				putBack(name);
			}
		} finally {
			putBack("max-height");
			putBack("max-width");
			const scroll = host.scrollElement();
			if (scroll && scroll0) { scroll.scrollLeft = scroll0.left; scroll.scrollTop = scroll0.top; }
		}
		await this.waits.frames(3);
		return runs;
	}
}
