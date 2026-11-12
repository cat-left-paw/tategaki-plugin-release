// Copied from src/pm-mode-spike/benchObservers.ts (lines 1-245) @ 68c03a2 (2026-10-16). No import from the spike.
// Local changes: Import the stats types from ./stats (M1-5 diagnostics; the spike's comments are kept).
/**
 * PM試作 S2b — 自動計測の観測の部品（DOMを使う。本文・PM・CMには触れない）。
 * - `BenchEntryCollector`: longtask と long-animation-frame（LoAF）のentryを、計測の間だけ集める。
 * - `FrameLoop`: rAFの時刻を記録する（scrollの駆動を同じcallbackから呼べる）。
 * - `AbortableWaits`: frame待ち・task待ち・段階の長さのtimer。中止で全部をその場で解放する。
 *   timer（setTimeout）は、段階の長さ（3秒・6秒）を区切る `delay` にだけ使う。
 */
import type { LoafRaw, LoafScriptRaw, LongTaskRaw } from "./stats";

type EntryWithFields = PerformanceEntry & Record<string, unknown>;

const MAX_ENTRIES = 4000;

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function readScript(raw: unknown): LoafScriptRaw {
	const s = (raw ?? {}) as Record<string, unknown>;
	return {
		invoker: str(s.invoker),
		invokerType: str(s.invokerType),
		sourceURL: str(s.sourceURL),
		sourceFunctionName: str(s.sourceFunctionName),
		sourceCharPosition: num(s.sourceCharPosition),
		duration: num(s.duration),
		forcedStyleAndLayoutDuration: num(s.forcedStyleAndLayoutDuration),
		pauseDuration: num(s.pauseDuration),
	};
}

/** PerformanceLongAnimationFrameTiming → 保存用の素の値（scriptsは上位3件と合計だけ残す）。 */
export function readLoafEntry(entry: PerformanceEntry): LoafRaw {
	const e = entry as EntryWithFields;
	const scriptsRaw = Array.isArray(e.scripts) ? (e.scripts as unknown[]) : [];
	const scripts = scriptsRaw.map(readScript);
	let total = 0;
	let forced = 0;
	for (const s of scripts) {
		total += s.duration;
		forced += s.forcedStyleAndLayoutDuration;
	}
	const top = scripts.slice().sort((a, b) => b.duration - a.duration).slice(0, 3);
	return {
		startTime: num(e.startTime),
		duration: num(e.duration),
		blockingDuration: num(e.blockingDuration),
		renderStart: num(e.renderStart),
		styleAndLayoutStart: num(e.styleAndLayoutStart),
		firstUIEventTimestamp: num(e.firstUIEventTimestamp),
		scriptCount: scripts.length,
		scriptsTotalMs: total,
		forcedStyleLayoutMs: forced,
		topScripts: top,
	};
}

export class BenchEntryCollector {
	readonly loafSupported: boolean;
	readonly longtaskSupported: boolean;
	private loafObserver: PerformanceObserver | null = null;
	private longtaskObserver: PerformanceObserver | null = null;
	private loaf: LoafRaw[] = [];
	private longtasks: LongTaskRaw[] = [];

	constructor(private readonly win: Window) {
		const Observer = (win as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
		const types = (Observer as unknown as { supportedEntryTypes?: readonly string[] } | undefined)?.supportedEntryTypes ?? [];
		this.loafSupported = !!Observer && types.indexOf("long-animation-frame") >= 0;
		this.longtaskSupported = !!Observer && types.indexOf("longtask") >= 0;
	}

	start(): void {
		const Observer = (this.win as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
		if (!Observer) return;
		if (this.loafSupported && !this.loafObserver) {
			try {
				this.loafObserver = new Observer((list) => this.ingestLoaf(list.getEntries()));
				this.loafObserver.observe({ type: "long-animation-frame" });
			} catch {
				this.loafObserver = null;
			}
		}
		if (this.longtaskSupported && !this.longtaskObserver) {
			try {
				this.longtaskObserver = new Observer((list) => this.ingestLongTasks(list.getEntries()));
				this.longtaskObserver.observe({ type: "longtask" });
			} catch {
				this.longtaskObserver = null;
			}
		}
	}

	private ingestLoaf(entries: readonly PerformanceEntry[]): void {
		for (const entry of entries) this.loaf.push(readLoafEntry(entry));
		if (this.loaf.length > MAX_ENTRIES) this.loaf.splice(0, this.loaf.length - MAX_ENTRIES);
	}

	private ingestLongTasks(entries: readonly PerformanceEntry[]): void {
		for (const entry of entries) this.longtasks.push({ startTime: entry.startTime, duration: entry.duration });
		if (this.longtasks.length > MAX_ENTRIES) this.longtasks.splice(0, this.longtasks.length - MAX_ENTRIES);
	}

	/** まだ配送されていないentryを取り込む（区間の終わりに呼ぶ）。 */
	flush(): void {
		if (this.loafObserver) this.ingestLoaf(this.loafObserver.takeRecords());
		if (this.longtaskObserver) this.ingestLongTasks(this.longtaskObserver.takeRecords());
	}

	/** [t0, t1] と重なるframe（LoAFは startTime〜startTime+duration）。 */
	loafBetween(t0: number, t1: number): LoafRaw[] {
		return this.loaf.filter((e) => e.startTime + e.duration > t0 && e.startTime < t1);
	}

	longtasksBetween(t0: number, t1: number): LongTaskRaw[] {
		return this.longtasks.filter((e) => e.startTime + e.duration > t0 && e.startTime < t1);
	}

	stop(): void {
		this.loafObserver?.disconnect();
		this.longtaskObserver?.disconnect();
		this.loafObserver = null;
		this.longtaskObserver = null;
	}
}

// ---- frame -----------------------------------------------------------------------------------

/** rAFの時刻を記録する。`onFrame` は各frameのcallbackの中で呼ぶ（scrollの駆動用）。 */
export class FrameLoop {
	private raf = 0;
	private running = false;
	private stamps: number[] = [];

	constructor(
		private readonly win: Window,
		private readonly onFrame?: (t: number) => void,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.stamps = [];
		this.raf = this.win.requestAnimationFrame((t) => this.frame(t));
	}

	private frame(t: number): void {
		this.raf = 0;
		if (!this.running) return;
		this.stamps.push(t);
		this.onFrame?.(t);
		if (this.running) this.raf = this.win.requestAnimationFrame((next) => this.frame(next));
	}

	stop(): number[] {
		this.running = false;
		if (this.raf) this.win.cancelAnimationFrame(this.raf);
		this.raf = 0;
		return this.stamps;
	}
}

// ---- 中止できる待ち ------------------------------------------------------------------------------

/**
 * 待ちは、時間が来たときも `cancelAll()` されたときも resolve する（reject しない）。
 * 呼び出し側は、待った後に中止の有無を確かめる。
 */
export class AbortableWaits {
	private cancels = new Set<() => void>();

	constructor(private readonly win: Window) {}

	private register(setup: (done: () => void) => () => void): Promise<void> {
		return new Promise<void>((resolve) => {
			let finished = false;
			let teardown: () => void = () => undefined;
			const done = (): void => {
				if (finished) return;
				finished = true;
				this.cancels.delete(cancel);
				teardown();
				resolve();
			};
			const cancel = (): void => done();
			this.cancels.add(cancel);
			teardown = setup(done);
		});
	}

	/** rAFを n 回待つ（更新の後のframeを通すため）。 */
	frames(n: number): Promise<void> {
		return this.register((done) => {
			let left = n;
			let raf = 0;
			const step = (): void => {
				left--;
				if (left <= 0) {
					raf = 0;
					done();
				} else {
					raf = this.win.requestAnimationFrame(step);
				}
			};
			raf = this.win.requestAnimationFrame(step);
			return () => {
				if (raf) this.win.cancelAnimationFrame(raf);
			};
		});
	}

	/**
	 * いまのtask（rAFのcallbackのmicrotask）から出て、新しいtaskで続ける（MessageChannel。timerではない）。
	 * 実際の打鍵は入力eventの独立したtaskで起きるので、更新をrAFのcallbackの中に入れないために使う。
	 */
	task(): Promise<void> {
		return this.register((done) => {
			const Channel = (this.win as unknown as { MessageChannel: typeof MessageChannel }).MessageChannel;
			const channel = new Channel();
			channel.port1.onmessage = () => done();
			channel.port2.postMessage(0);
			return () => {
				channel.port1.onmessage = null;
				channel.port1.close();
				channel.port2.close();
			};
		});
	}

	/** 段階の長さを区切るtimer（このクラスで唯一のsetTimeout）。 */
	delay(ms: number): Promise<void> {
		return this.register((done) => {
			const id = this.win.setTimeout(done, ms);
			return () => this.win.clearTimeout(id);
		});
	}

	cancelAll(): void {
		for (const cancel of Array.from(this.cancels)) cancel();
	}
}
