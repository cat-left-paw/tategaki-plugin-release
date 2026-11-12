// Copied from src/pm-mode-spike/benchResultWriter.ts (lines 1-28) @ 68c03a2 (2026-10-16). No import from the spike.
// Local changes: Import from ./result-path (M1-5 diagnostics; the spike's comments are kept).
/**
 * PM試作 S2b — 自動計測の結果を vault の `pm-spike-samples/results/` へ書く。
 * 書き込み先はここ以外にしない: pathは `resolveResultPath()` が必ずその中の1ファイルにし、書く直前にも `isResultPath()` で確かめる。
 * 既存のファイルは上書きしない（同じ名前があれば `-2` `-3` を付ける）。
 */
import type { App, DataAdapter } from "obsidian";
import { BENCH_RESULT_DIR, BENCH_RESULT_PARENT, isResultPath, resolveResultPath, type BenchResultWriter } from "./result-path";

async function ensureFolder(adapter: DataAdapter, folder: string): Promise<void> {
	if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
}

export function createVaultResultWriter(app: App): BenchResultWriter {
	return async (fileName, makeText) => {
		const adapter = app.vault.adapter;
		await ensureFolder(adapter, BENCH_RESULT_PARENT);
		await ensureFolder(adapter, BENCH_RESULT_DIR);
		let path = resolveResultPath(fileName);
		for (let n = 2; (await adapter.exists(path)) && n < 100; n++) {
			path = resolveResultPath(fileName.replace(/\.json$/i, "") + `-${n}.json`);
		}
		if (!isResultPath(path)) throw new Error(`結果の書き込み先が pm-spike-samples/results/ の外になる: ${path}`);
		if (await adapter.exists(path)) throw new Error(`同じ名前のファイルが多すぎる: ${path}`);
		await adapter.write(path, makeText(path));
		return path;
	};
}
