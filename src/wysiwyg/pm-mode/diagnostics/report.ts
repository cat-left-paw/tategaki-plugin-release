/**
 * M1-5 diagnostics: the result file and its summary, and the check against the provisional targets
 * (本設計 §8.5, D1). Pure functions only (runs in Node).
 *
 * The targets are provisional: the final judgement is the author's feel together with these numbers
 * (本設計 §14.3). Memory is compared across runs (the new mode against V on the same sample), so it is
 * not judged here.
 */
import type { AfterWatchResult, KeyKind } from "./after-watch";
import type { BenchRun, OpenRun, ResizeRun } from "./bench";
import { summarize } from "./stats";
import type { PmRootState } from "./view-state";

export const M15_SCHEMA = "tategaki-pm-m15/1";
export const AFTER_WATCH_SCHEMA = "tategaki-pm-m15-after/1";
export const MANUAL_WATCH_SCHEMA = "tategaki-pm-m15-manual/1";

export interface BenchEnvironment {
	userAgent: string;
	devicePixelRatio: number;
	window: { width: number; height: number };
	theme: string;
	dark: boolean;
}
export interface BenchResultFile extends BenchRun {
	schema: typeof M15_SCHEMA;
	startedAt: string;
	durationMs: number;
	environment: BenchEnvironment;
	targets: TargetCheck[];
	/** The new mode view's state at the end of the run (view-state.ts); null for the other modes. */
	viewState?: PmRootState | null;
}

export interface TargetCheck {
	item: string;
	target: string;
	value: number | null;
	unit: string;
	/** null: not measured in this run. */
	pass: boolean | null;
}

/** 本設計 §8.5: 35万字 1.5 s、70万字 3 s. The size between the two uses the larger limit. */
export function openTargetMs(chars: number): number {
	return chars <= 400000 ? 1500 : 3000;
}
export const TYPING_P95_MS = 30;
export const ENTER_MS = 50;
export const SCROLL_DROPPED_PCT = 1;
const TYPING_KINDS = new Set(["typeHead", "typeMid", "typeTail"]);

export function checkTargets(run: BenchRun): TargetCheck[] {
	const checks: TargetCheck[] = [];
	const limit = openTargetMs(run.chars);
	checks.push({ item: "開く（描画まで、中央値）", target: `${limit} ms以内`, value: run.open ? run.open.painted.median : null, unit: "ms",
		pass: run.open && run.open.painted.count ? run.open.painted.median <= limit : null });
	for (const edit of run.edits) {
		if (TYPING_KINDS.has(edit.kind)) {
			checks.push({ item: `1打 ${edit.label}（taskのp95）`, target: `${TYPING_P95_MS} ms以内`, value: edit.task.p95, unit: "ms", pass: edit.ops ? edit.task.p95 <= TYPING_P95_MS : null });
		} else if (edit.kind === "enterMid") {
			checks.push({ item: `${edit.label}（taskのp95）`, target: `${ENTER_MS} ms以内`, value: edit.task.p95, unit: "ms", pass: edit.ops ? edit.task.p95 <= ENTER_MS : null });
		}
	}
	for (const scroll of run.scroll) {
		checks.push({ item: `scroll ${scroll.speedPxPerSec} px/s（落ちたframe）`, target: `${SCROLL_DROPPED_PCT}%未満`, value: scroll.droppedPct, unit: "%",
			pass: scroll.frames.frames ? scroll.droppedPct < SCROLL_DROPPED_PCT : null });
	}
	return checks;
}

const MODE_LABEL: Record<BenchRun["mode"], string> = { pm: "新執筆モード", sot: "現行の執筆・参照モード", none: "縦書きビューなし（CMだけ）" };

/** A few lines for the Notice; the file has everything. */
export function summaryLines(file: BenchResultFile, path: string): string[] {
	const lines = [`M1-5の計測: ${MODE_LABEL[file.mode]}、${file.chars.toLocaleString()}字`];
	if (file.restore && !file.restore.ok) lines.push(`⚠ 試料の本文を元へ戻せなかった: ${file.restore.detail}`);
	if (file.open) lines.push(`開く: 描画まで中央値 ${file.open.painted.median} ms（閉じる ${Math.max(0, ...file.open.runs.map(r => r.closeMs))} ms）`);
	if (file.open?.runs.length) lines.push(openPartsLine(file.open.runs));
	for (const edit of file.edits) lines.push(`${edit.label}: task 中央値 ${edit.task.median} / p95 ${edit.task.p95} ms、描画まで ${edit.toFrame.median} ms`);
	for (const scroll of file.scroll) lines.push(`scroll ${scroll.speedPxPerSec} px/s: 落ちたframe ${scroll.droppedPct}%（画面の更新 ${file.refreshMs} ms）`);
	for (const resize of file.resize) lines.push(resizeLine(resize));
	const phaseA11y = file.phases.map(p => p.accessibility);
	if (phaseA11y.length) lines.push(`アクセシビリティ: ${accessibilityLabel(phaseA11y)}`);
	const heapMin = file.scroll.map(r => r.heapMinMb).filter((v): v is number => v !== null);
	if (heapMin.length || file.viewElements !== null) lines.push(`memory: JS heap 最小 ${heapMin.length ? Math.min(...heapMin) : "-"} MB、viewの要素 ${file.viewElements ?? "-"}、rss ${file.rssMb.end ?? "-"} MB`);
	const failed = file.targets.filter(t => t.pass === false);
	lines.push(failed.length ? `目標に届かない: ${failed.map(t => t.item).join("、")}` : "暫定の目標: すべて範囲内（測った項目）");
	if (file.viewState) lines.push(`新モードのview: ${viewStateLabel(file.viewState)}`);
	if (file.errors.length) lines.push(`エラー: ${file.errors.join(" / ")}`);
	lines.push(`結果: ${path}`);
	return lines;
}

const median = (values: number[]) => summarize(values).median;
/** The parts of opening (medians over the runs): the open call (the new mode's build in it), the first frame, the paint. */
function openPartsLine(runs: OpenRun[]): string {
	const built = runs.flatMap(run => run.construct ? [run.construct] : []);
	const build = built.length
		? `（新モードの組み立て ${median(built.map(c => c.total))} ms: model ${median(built.map(c => c.stages.model))}、表示のDOM ${median(built.map(c => c.stages.view))}、そのほか ${median(built.map(c => c.total - c.stages.model - c.stages.view))}）`
		: "";
	return `開くの内訳（中央値）: 開くcall ${median(runs.map(r => r.callMs))} ms${build}、最初のframeまで ${median(runs.map(r => r.readyMs - r.callMs))} ms、描画まで ${median(runs.map(r => r.paintedMs - r.readyMs))} ms`;
}
function resizeLine(resize: ResizeRun): string {
	const axis = resize.axis === "height" ? "高さ" : "幅", kind = resize.kind === "steps" ? "少しずつ" : "大きく";
	return `windowの${axis}を${kind}${resize.lineAxis ? "（行の長さが変わる）" : ""}: 描画まで 中央値 ${resize.toFrame.median} / 最大 ${resize.toFrame.max} ms（${resize.steps.length}回）`;
}

function accessibilityLabel(values: Array<boolean | null>): string {
	if (values.some(v => v === true)) return values.every(v => v === true) ? "有効" : "途中で有効になった";
	return values.some(v => v === null) ? "読めなかった" : "無効";
}

/** The Notice after the 2-minute watch. */
export function afterWatchSummaryLines(result: AfterWatchResult, path: string): string[] {
	const switches = result.events.filter(e => e.type === "blur").length;
	return [
		`M1-5の計測の後の${Math.round(result.durationMs / 1000)}秒:`,
		`最も長い停止（timerの遅れ） ${Math.round(result.maxLateMs)} ms、200 ms以上のframe ${result.longFrames.length}件、task ${result.longTasks.length}件`,
		`アクセシビリティ: ${accessibilityLabel(result.samples.map(s => s.accessibility))}、windowから離れた回数 ${switches}`,
		`結果: ${path}`,
	];
}

/** The window resized by hand: how many resize events, and the longest frame gap while resizing (to 0.5 s after the last). */
function resizeWatchLine(result: AfterWatchResult): string {
	const resizes = result.resizes;
	if (!resizes || !resizes.count) return "windowの大きさの変更: なし";
	const first = resizes.events[0]?.atMs ?? 0, last = resizes.events[resizes.events.length - 1]?.atMs ?? first;
	const gaps = (result.frames?.gaps ?? []).filter(g => !g.hidden && g.atMs >= first && g.atMs - g.gapMs <= last + 500);
	const max = gaps.reduce((m, g) => Math.max(m, g.gapMs), 0);
	return `windowの大きさの変更: ${resizes.count}回、その間の描画の止まり（100 ms以上） ${gaps.length}回（最長 ${Math.round(max)} ms）`;
}

export function viewStateLabel(state: PmRootState): string {
	const chunks = state.chunkSkip === undefined ? "" : `、まとまりの省略 ${state.chunkSkip ? "on" : "off"}`;
	return `アクセシビリティから${state.ariaHidden ? "外す" : "外さない"}、画面の外の省略 ${state.skip ?? "-"}${chunks}`;
}

const KEY_LABEL: Partial<Record<KeyKind, string>> = { Enter: "改行", Backspace: "Backspace", Delete: "Delete", Arrow: "矢印", char: "文字", ime: "IME" };

/** The Notice after the manual watch: the stops, the frame gaps, the keys and how long each kind took to reach a frame. */
export function manualWatchSummaryLines(result: AfterWatchResult, views: PmRootState[], path: string): string[] {
	const lines = [`見張り（手動の操作）: ${Math.round(result.durationMs / 1000)}秒、${views.length ? `新モードのview: ${viewStateLabel(views[0])}` : "新モードのviewなし"}`];
	const longest = result.longTasks.reduce((m, t) => Math.max(m, t.durationMs), 0);
	lines.push(`最も長い停止（timerの遅れ） ${Math.round(result.maxLateMs)} ms、200 ms以上のtask ${result.longTasks.length}件（最長 ${Math.round(longest)} ms）`);
	if (result.frames) {
		const visible = result.frames.gaps.filter(g => !g.hidden);
		const outside = visible.filter(g => g.longTaskMs < g.gapMs / 2);
		const max = visible.reduce((m, g) => Math.max(m, g.gapMs), 0);
		lines.push(`描画の止まり（100 ms以上） ${visible.length}回（最長 ${Math.round(max)} ms）、そのうちページのtaskで説明できないもの ${outside.length}回`);
	}
	if (result.keys) {
		const byKind = new Map<KeyKind, number[]>();
		for (const key of result.keys) {
			if (!KEY_LABEL[key.kind]) continue;
			const list = byKind.get(key.kind) ?? [];
			if (key.toFrameMs !== null) list.push(key.toFrameMs);
			byKind.set(key.kind, list);
		}
		const parts = Array.from(byKind, ([kind, times]) => `${KEY_LABEL[kind]} ${times.length}回（描画まで最長 ${times.length ? Math.round(Math.max(...times)) : "-"} ms）`);
		lines.push(parts.length ? `キー: ${parts.join("、")}` : "キー: なし");
	}
	if (result.resizes) lines.push(resizeWatchLine(result));
	lines.push(`アクセシビリティ: ${accessibilityLabel(result.samples.map(s => s.accessibility))}、windowから離れた回数 ${result.events.filter(e => e.type === "blur").length}`);
	lines.push(`結果: ${path}`);
	return lines;
}
