// Copied from src/pm-mode-spike/benchReport.ts (lines 21-22, 32-87) @ 68c03a2 (2026-10-16). No import from the spike.
// Local changes: Only the result file path helpers and the writer type (M1-5 diagnostics; the spike's comments are kept).
export const BENCH_RESULT_DIR = "pm-spike-samples/results";
export const BENCH_RESULT_PARENT = "pm-spike-samples";

// ---- 結果ファイルのpath ---------------------------------------------------------------------------

function pad(value: number, width: number): string {
	let text = String(value);
	while (text.length < width) text = "0" + text;
	return text;
}

/** ローカル時刻の YYYYMMDD-HHMMSS */
export function formatLocalStamp(d: Date): string {
	return (
		`${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}-` +
		`${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`
	);
}

/** ファイル名に使えない文字・制御文字・path区切りを `_` にし、先頭の `.` を落とし、長さを抑える。 */
export function sanitizeFileStem(text: string): string {
	let out = "";
	for (const ch of Array.from(text)) {
		const code = ch.charCodeAt(0);
		out += code < 0x20 || code === 0x7f || '\\/:*?"<>|'.indexOf(ch) >= 0 ? "_" : ch;
	}
	out = out.replace(/^\.+/, "").trim();
	if (out.length > 80) out = out.slice(0, 80);
	return out || "file";
}

/** vault内のpath（`dir/name.md`）から、拡張子を除いた名前部分。 */
export function stemOfVaultPath(path: string): string {
	const base = path.split(/[\\/]/).pop() ?? path;
	const dot = base.lastIndexOf(".");
	return dot > 0 ? base.slice(0, dot) : base;
}

/** `<日時>-<ファイル名>.json`（ファイル名だけ。folderは含まない）。 */
export function buildResultFileName(date: Date, filePath: string, suffix = ""): string {
	return `${formatLocalStamp(date)}-${sanitizeFileStem(stemOfVaultPath(filePath))}${suffix}.json`;
}

/** どんな入力でも `pm-spike-samples/results/<name>.json` の1つのpathにする（folderの外へ出る形は作れない）。 */
export function resolveResultPath(fileName: string): string {
	const base = fileName.split(/[\\/]/).pop() ?? "";
	let stem = sanitizeFileStem(base.replace(/\.json$/i, ""));
	stem = stem.replace(/\.\./g, "_");
	return `${BENCH_RESULT_DIR}/${stem}.json`;
}

export function isResultPath(path: string): boolean {
	if (!path.startsWith(BENCH_RESULT_DIR + "/")) return false;
	const rest = path.slice(BENCH_RESULT_DIR.length + 1);
	return rest.length > ".json".length && rest.endsWith(".json") && !/[\\/]/.test(rest) && rest.indexOf("..") < 0;
}

/** 結果を書く関数（Obsidianのvaultへ書く実装は view 側。headlessの試験では一時folderへ差し替える）。最終的なpathを返す。 */
export type BenchResultWriter = (fileName: string, makeText: (finalPath: string) => string) => Promise<string>;
