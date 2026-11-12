// Copied from src/pm-mode-spike/benchStats.ts (lines 1-280) @ 68c03a2 (2026-10-16). No import from the spike.
// Local changes: none (M1-5 diagnostics; the spike's comments are kept).
/**
 * PM試作 S2b — 自動計測の統計。純関数だけ（DOM・Obsidian・CodeMirrorを使わない。Nodeでそのまま試験できる）。
 *
 * - 分位点の定義は perf.ts の `Series` と同じ（昇順に並べて index = floor(q × n)）。HUDの既存の数字と並べて読める。
 * - long-animation-frame（LoAF）は、frameを3つの区間に分ける:
 *     toRenderStart       = renderStart − startTime               … renderStart までに走ったscript・event・timer などのtask
 *     renderStartToStyle  = styleAndLayoutStart − renderStart     … rAF の callback・ResizeObserver など「描画の準備」
 *     styleLayoutToEnd    = startTime + duration − styleAndLayoutStart … style 再計算・layout・paint（描画を含む）
 *   renderStart / styleAndLayoutStart が 0 のframe（描画のないframe）は、全部を toRenderStart に入れる。
 */

export interface Summary {
	count: number;
	min: number;
	median: number;
	mean: number;
	p95: number;
	max: number;
}

export function round3(value: number): number {
	return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

export function summarize(values: readonly number[]): Summary {
	const sorted: number[] = [];
	for (const v of values) if (Number.isFinite(v)) sorted.push(v);
	sorted.sort((a, b) => a - b);
	const n = sorted.length;
	if (n === 0) return { count: 0, min: 0, median: 0, mean: 0, p95: 0, max: 0 };
	let total = 0;
	for (const v of sorted) total += v;
	const at = (q: number): number => sorted[Math.min(n - 1, Math.floor(q * n))] ?? 0;
	return {
		count: n,
		min: round3(sorted[0] ?? 0),
		median: round3(at(0.5)),
		mean: round3(total / n),
		p95: round3(at(0.95)),
		max: round3(sorted[n - 1] ?? 0),
	};
}

// ---- frame の間隔 -----------------------------------------------------------------------------

export interface FrameStats {
	/** 数えたframeの間隔の数（rAFの時刻の数 − 1） */
	frames: number;
	/** 間隔が 20 ms を超えた回数と割合（%） */
	over20: number;
	over20Pct: number;
	/** 間隔が 33 ms を超えた回数と割合（%）。60Hzで2 frame以上落ちた */
	over33: number;
	over33Pct: number;
	maxGapMs: number;
	medianGapMs: number;
	p95GapMs: number;
	meanGapMs: number;
	/** 最初のrAFの時刻から最後のrAFの時刻まで */
	spanMs: number;
}

export const JANK_20_MS = 20;
export const JANK_33_MS = 33;

export function summarizeFrameTimestamps(stamps: readonly number[]): FrameStats {
	const gaps: number[] = [];
	for (let i = 1; i < stamps.length; i++) gaps.push((stamps[i] ?? 0) - (stamps[i - 1] ?? 0));
	let over20 = 0;
	let over33 = 0;
	for (const g of gaps) {
		if (g > JANK_20_MS) over20++;
		if (g > JANK_33_MS) over33++;
	}
	const s = summarize(gaps);
	const n = gaps.length;
	const pct = (a: number): number => (n > 0 ? Math.round((a / n) * 1000) / 10 : 0);
	return {
		frames: n,
		over20,
		over20Pct: pct(over20),
		over33,
		over33Pct: pct(over33),
		maxGapMs: s.max,
		medianGapMs: s.median,
		p95GapMs: s.p95,
		meanGapMs: s.mean,
		spanMs: stamps.length > 1 ? round3((stamps[stamps.length - 1] ?? 0) - (stamps[0] ?? 0)) : 0,
	};
}

// ---- longtask ---------------------------------------------------------------------------------

export interface LongTaskRaw {
	startTime: number;
	duration: number;
}

export interface LongTaskStats {
	supported: boolean;
	count: number;
	maxMs: number;
	sumMs: number;
	medianMs: number;
}

export function summarizeLongTasks(entries: readonly LongTaskRaw[], supported: boolean): LongTaskStats {
	const s = summarize(entries.map((e) => e.duration));
	let sum = 0;
	for (const e of entries) sum += e.duration;
	return { supported, count: entries.length, maxMs: s.max, sumMs: round3(sum), medianMs: s.median };
}

// ---- long-animation-frame ---------------------------------------------------------------------

export interface LoafScriptRaw {
	invoker: string;
	invokerType: string;
	sourceURL: string;
	sourceFunctionName: string;
	sourceCharPosition: number;
	duration: number;
	forcedStyleAndLayoutDuration: number;
	pauseDuration: number;
}

export interface LoafRaw {
	startTime: number;
	duration: number;
	blockingDuration: number;
	renderStart: number;
	styleAndLayoutStart: number;
	firstUIEventTimestamp: number;
	scriptCount: number;
	/** scripts[].duration の合計 */
	scriptsTotalMs: number;
	/** scripts[].forcedStyleAndLayoutDuration の合計（script の中で強制された style / layout） */
	forcedStyleLayoutMs: number;
	/** duration の長い順に最大3件 */
	topScripts: LoafScriptRaw[];
}

export interface LoafDerived {
	/** window の開始（計測の開始）からの位置 */
	offsetMs: number;
	durationMs: number;
	blockingMs: number;
	toRenderStartMs: number;
	/** null = styleAndLayoutStart が無く、分けられない */
	renderStartToStyleMs: number | null;
	styleLayoutToEndMs: number;
	/** renderStart が 0（描画のないframe。全部を toRenderStart に入れた） */
	noRender: boolean;
	scriptCount: number;
	scriptsTotalMs: number;
	forcedStyleLayoutMs: number;
	topScripts: LoafScriptRaw[];
}

export function deriveLoaf(raw: LoafRaw, windowStart: number): LoafDerived {
	const end = raw.startTime + raw.duration;
	const hasRender = raw.renderStart > 0;
	const hasStyle = raw.styleAndLayoutStart > 0;
	let toRender: number;
	let rafPrep: number | null;
	let styleLayout: number;
	if (!hasRender) {
		toRender = raw.duration;
		rafPrep = 0;
		styleLayout = 0;
	} else {
		toRender = Math.max(0, raw.renderStart - raw.startTime);
		if (hasStyle) {
			rafPrep = Math.max(0, raw.styleAndLayoutStart - raw.renderStart);
			styleLayout = Math.max(0, end - raw.styleAndLayoutStart);
		} else {
			rafPrep = null;
			styleLayout = Math.max(0, end - raw.renderStart);
		}
	}
	return {
		offsetMs: round3(raw.startTime - windowStart),
		durationMs: round3(raw.duration),
		blockingMs: round3(raw.blockingDuration),
		toRenderStartMs: round3(toRender),
		renderStartToStyleMs: rafPrep === null ? null : round3(rafPrep),
		styleLayoutToEndMs: round3(styleLayout),
		noRender: !hasRender,
		scriptCount: raw.scriptCount,
		scriptsTotalMs: round3(raw.scriptsTotalMs),
		forcedStyleLayoutMs: round3(raw.forcedStyleLayoutMs),
		topScripts: raw.topScripts.map((s) => ({
			...s,
			duration: round3(s.duration),
			forcedStyleAndLayoutDuration: round3(s.forcedStyleAndLayoutDuration),
			pauseDuration: round3(s.pauseDuration),
		})),
	};
}

export interface LoafSummary {
	supported: boolean;
	/** 50 ms以上のframeの数（LoAF は 50 ms を超えたframeだけを報告する） */
	count: number;
	totalDurationMs: number;
	duration: Summary;
	blocking: Summary;
	toRenderStart: Summary;
	renderStartToStyle: Summary;
	styleLayoutToEnd: Summary;
	scriptsTotal: Summary;
	forcedStyleLayout: Summary;
	/** 全frameの duration の合計に対する、各区間の合計の割合（%）。遅いframeが script か style/layout/paint かの目安 */
	share: { toRenderStartPct: number; renderStartToStylePct: number; styleLayoutToEndPct: number; scriptsTotalPct: number };
	/** duration の長い順に5件 */
	representative: LoafDerived[];
}

export const LOAF_REPRESENTATIVE = 5;

export function summarizeLoaf(entries: readonly LoafRaw[], supported: boolean, windowStart: number): LoafSummary {
	const derived = entries.map((e) => deriveLoaf(e, windowStart));
	const pick = (f: (d: LoafDerived) => number | null): Summary => {
		const values: number[] = [];
		for (const d of derived) {
			const v = f(d);
			if (v !== null) values.push(v);
		}
		return summarize(values);
	};
	let total = 0;
	let sumRender = 0;
	let sumPrep = 0;
	let sumStyle = 0;
	let sumScripts = 0;
	for (const d of derived) {
		total += d.durationMs;
		sumRender += d.toRenderStartMs;
		sumPrep += d.renderStartToStyleMs ?? 0;
		sumStyle += d.styleLayoutToEndMs;
		sumScripts += d.scriptsTotalMs;
	}
	const pct = (a: number): number => (total > 0 ? Math.round((a / total) * 1000) / 10 : 0);
	const representative = derived
		.slice()
		.sort((a, b) => b.durationMs - a.durationMs)
		.slice(0, LOAF_REPRESENTATIVE);
	return {
		supported,
		count: derived.length,
		totalDurationMs: round3(total),
		duration: pick((d) => d.durationMs),
		blocking: pick((d) => d.blockingMs),
		toRenderStart: pick((d) => d.toRenderStartMs),
		renderStartToStyle: pick((d) => d.renderStartToStyleMs),
		styleLayoutToEnd: pick((d) => d.styleLayoutToEndMs),
		scriptsTotal: pick((d) => d.scriptsTotalMs),
		forcedStyleLayout: pick((d) => d.forcedStyleLayoutMs),
		share: {
			toRenderStartPct: pct(sumRender),
			renderStartToStylePct: pct(sumPrep),
			styleLayoutToEndPct: pct(sumStyle),
			scriptsTotalPct: pct(sumScripts),
		},
		representative,
	};
}

// ---- scroll の開始位置 ------------------------------------------------------------------------

/**
 * scrollする距離 `needed` を動ける範囲で、文書の中ほど（maxDistance / 2）から始める。
 * 文書が短くて中ほどからでは足りないときは、終わりまでに `needed` 動ける位置まで手前へずらす（無ければ 0）。
 */
export function chooseScrollStart(maxDistance: number, needed: number): number {
	if (!(maxDistance > 0)) return 0;
	const mid = maxDistance / 2;
	const latest = Math.max(0, maxDistance - needed);
	return Math.round(Math.min(mid, latest));
}
