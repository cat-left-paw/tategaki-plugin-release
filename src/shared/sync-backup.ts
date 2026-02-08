import { App, TFile, TFolder } from "obsidian";

/**
 * バックアップの理由（トリガー）
 */
export type BackupReason =
	| "session-start"    // セッション開始時
	| "manual-sync"      // 手動同期
	| "big-paste"        // 大量ペースト（+200文字 または 2行以上追加）
	| "risky-change"     // 危険な変更（ruby/span追加）
	| "auto-interval";   // 自動間隔（20分、dirty時のみ）

export interface SyncBackupOptions {
	keepLatest?: number;
	reason?: BackupReason;
}

export interface SyncBackupWriteResult {
	backupFolderPath: string;
	beforePath: string;
	afterPath: string;
	timestamp: string;
	reason: BackupReason;
}

export interface SyncBackupPair {
	backupFolderPath: string;
	timestamp: string;
	reason: BackupReason | null;
	beforePath: string;
	afterPath: string;
}

/**
 * バックアップ保持設定
 */
interface RetentionConfig {
	/** 24時間以内の最大バックアップ数 */
	maxWithin24h: number;
	/** 使用日ベースの保持日数 */
	usageDaysToKeep: number;
}

const DEFAULT_RETENTION: RetentionConfig = {
	maxWithin24h: 20,
	usageDaysToKeep: 7,
};

const BACKUP_ROOT = ".obsidian/tategaki-sync-backups";

export const SYNC_BACKUP_ROOT = BACKUP_ROOT;

export async function writeSyncBackupPair(
	app: App,
	targetFile: TFile,
	beforeMarkdown: string,
	afterMarkdown: string,
	options: SyncBackupOptions = {}
): Promise<SyncBackupWriteResult> {
	const reason = options.reason ?? "manual-sync";

	await ensureFolderExists(app, BACKUP_ROOT);

	const fileKey = buildFileKey(targetFile);
	const backupFolderPath = `${BACKUP_ROOT}/${fileKey}`;
	await ensureFolderExists(app, backupFolderPath);

	const timestamp = formatTimestampCompact(new Date());
	// 新フォーマット: YYYYMMDD-HHMM_reason__before.md
	const beforePath = await allocateUniquePath(
		app,
		`${backupFolderPath}/${timestamp}_${reason}__before.md`
	);
	const afterPath = await allocateUniquePath(
		app,
		`${backupFolderPath}/${timestamp}_${reason}__after.md`
	);

	await Promise.all([
		app.vault.create(beforePath, beforeMarkdown),
		app.vault.create(afterPath, afterMarkdown),
	]);

	await pruneOldBackupsUsageDayBased(app, backupFolderPath, DEFAULT_RETENTION);

	return {
		backupFolderPath,
		beforePath,
		afterPath,
		timestamp,
		reason,
	};
}

export function getSyncBackupFolderPathForFile(targetFile: TFile): string {
	const fileKey = buildFileKey(targetFile);
	return `${BACKUP_ROOT}/${fileKey}`;
}

export async function getLatestSyncBackupPair(
	app: App,
	targetFile: TFile
): Promise<SyncBackupPair | null> {
	const backupFolderPath = getSyncBackupFolderPathForFile(targetFile);

	let listing: { files: string[]; folders: string[] } | null = null;
	try {
		listing = await app.vault.adapter.list(backupFolderPath);
	} catch {
		return null;
	}

	// ファイル名から timestamp + reason を抽出してグループ化
	// 旧フォーマット: YYYYMMDD-HHMMSS-mmm__before.md
	// 新フォーマット: YYYYMMDD-HHMM_reason__before.md
	const groups = new Map<string, { files: string[]; reason: BackupReason | null }>();
	for (const filePath of listing.files) {
		const fileName = filePath.split("/").pop() ?? "";
		const beforeAfterSepIndex = fileName.indexOf("__");
		if (beforeAfterSepIndex <= 0) continue;

		const prefix = fileName.slice(0, beforeAfterSepIndex);
		// 新フォーマット: YYYYMMDD-HHMM_reason の場合
		const reasonSepIndex = prefix.indexOf("_");
		let groupKey: string;
		let reason: BackupReason | null = null;

		if (reasonSepIndex > 0) {
			// 新フォーマット
			groupKey = prefix; // timestamp_reason 全体をキーにする
			reason = prefix.slice(reasonSepIndex + 1) as BackupReason;
		} else {
			// 旧フォーマット（timestamp のみ）
			groupKey = prefix;
		}

		if (!groups.has(groupKey)) {
			groups.set(groupKey, { files: [], reason });
		}
		groups.get(groupKey)?.files.push(filePath);
	}

	// タイムスタンプ部分でソート（降順）
	const sortedKeys = [...groups.keys()].sort((a, b) => {
		const tsA = a.split("_")[0] ?? a;
		const tsB = b.split("_")[0] ?? b;
		return tsB.localeCompare(tsA);
	});

	for (const groupKey of sortedKeys) {
		const group = groups.get(groupKey);
		if (!group) continue;

		const filePaths = group.files;
		const picked = await pickLatestBackupPair(app, filePaths);
		if (!picked) {
			continue;
		}

		// タイムスタンプ部分のみを返す
		const timestamp = groupKey.split("_")[0] ?? groupKey;

		return {
			backupFolderPath,
			timestamp,
			reason: group.reason,
			beforePath: picked.beforePath,
			afterPath: picked.afterPath,
		};
	}

	return null;
}

async function pickLatestBackupPair(
	app: App,
	filePaths: string[]
): Promise<{ beforePath: string; afterPath: string } | null> {
	const beforeCandidates = filePaths.filter((p) =>
		/__(before)(-[0-9]+)?\.md$/.test(p)
	);
	const afterCandidates = filePaths.filter((p) =>
		/__(after)(-[0-9]+)?\.md$/.test(p)
	);
	if (beforeCandidates.length === 0 || afterCandidates.length === 0) {
		return null;
	}

	const parseSuffix = (path: string, key: "before" | "after"): number => {
		const match = path.match(
			new RegExp(`__${key}(?:-([0-9]+))?\\.md$`)
		);
		const raw = match?.[1];
		if (!raw) return 0;
		const parsed = parseInt(raw, 10);
		return Number.isFinite(parsed) ? parsed : 0;
	};

	const safeStat = async (path: string): Promise<number> => {
		try {
			const stat = await app.vault.adapter.stat(path);
			return stat?.mtime ?? 0;
		} catch {
			return 0;
		}
	};

	type PairEntry = {
		beforePath?: string;
		afterPath?: string;
		beforeMtime: number;
		afterMtime: number;
	};
	const entries = new Map<number, PairEntry>();

	for (const path of beforeCandidates) {
		const suffix = parseSuffix(path, "before");
		const entry = entries.get(suffix) ?? {
			beforeMtime: 0,
			afterMtime: 0,
		};
		entry.beforePath = path;
		entry.beforeMtime = await safeStat(path);
		entries.set(suffix, entry);
	}

	for (const path of afterCandidates) {
		const suffix = parseSuffix(path, "after");
		const entry = entries.get(suffix) ?? {
			beforeMtime: 0,
			afterMtime: 0,
		};
		entry.afterPath = path;
		entry.afterMtime = await safeStat(path);
		entries.set(suffix, entry);
	}

	let best: { suffix: number; beforePath: string; afterPath: string; mtime: number } | null = null;
	for (const [suffix, entry] of entries.entries()) {
		if (!entry.beforePath || !entry.afterPath) continue;
		const mtime = Math.max(entry.beforeMtime, entry.afterMtime);
		if (!best) {
			best = {
				suffix,
				beforePath: entry.beforePath,
				afterPath: entry.afterPath,
				mtime,
			};
			continue;
		}
		if (mtime > best.mtime) {
			best = {
				suffix,
				beforePath: entry.beforePath,
				afterPath: entry.afterPath,
				mtime,
			};
			continue;
		}
		if (mtime === best.mtime && suffix > best.suffix) {
			best = {
				suffix,
				beforePath: entry.beforePath,
				afterPath: entry.afterPath,
				mtime,
			};
		}
	}

	return best
		? { beforePath: best.beforePath, afterPath: best.afterPath }
		: null;
}

export function areMarkdownContentsEquivalent(
	expectedMarkdown: string,
	actualMarkdown: string
): boolean {
	const expected = normalizeLineEndings(expectedMarkdown);
	const actual = normalizeLineEndings(actualMarkdown);
	if (expected === actual) {
		return true;
	}
	if (expected.endsWith("\n") && expected.slice(0, -1) === actual) {
		return true;
	}
	if (actual.endsWith("\n") && actual.slice(0, -1) === expected) {
		return true;
	}
	return false;
}

export function normalizeLineEndings(markdown: string): string {
	return markdown.replace(/\r\n/g, "\n");
}

export async function moveSyncBackupsToTrash(
	app: App,
	options: { system?: boolean } = {}
): Promise<"none" | "system" | "local"> {
	const adapter = app.vault.adapter;
	const exists = await adapter.exists(BACKUP_ROOT);
	if (!exists) {
		return "none";
	}

	const preferSystem = options.system !== false;
	if (preferSystem) {
		try {
			const moved = await adapter.trashSystem(BACKUP_ROOT);
			if (moved) {
				return "system";
			}
		} catch {
			// fall through
		}
	}

	await adapter.trashLocal(BACKUP_ROOT);
	return "local";
}

function buildFileKey(file: TFile): string {
	const safeBase = sanitizeFileName(file.basename || "untitled");
	const hash = fnv1a32Hex(file.path);
	return `${safeBase}__${hash}`;
}

function sanitizeFileName(name: string): string {
	const sanitized = name.replace(/[^A-Za-z0-9._-]+/g, "_");
	return sanitized.length > 0 ? sanitized : "file";
}

function fnv1a32Hex(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

	/**
	 * 旧フォーマット用タイムスタンプ（後方互換性のため保持）
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function formatTimestamp(date: Date): string {
		const yyyy = date.getFullYear();
		const mm = String(date.getMonth() + 1).padStart(2, "0");
		const dd = String(date.getDate()).padStart(2, "0");
		const hh = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	const ms = String(date.getMilliseconds()).padStart(3, "0");
	return `${yyyy}${mm}${dd}-${hh}${min}${ss}-${ms}`;
}

/**
 * 新フォーマット用タイムスタンプ（秒・ミリ秒なし、可読性向上）
 * 形式: YYYYMMDD-HHMM
 */
function formatTimestampCompact(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	const hh = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	return `${yyyy}${mm}${dd}-${hh}${min}`;
}

/**
 * タイムスタンプ文字列から日付部分（YYYYMMDD）を抽出
 */
function extractDatePart(timestamp: string): string {
	// YYYYMMDD-HHMM または YYYYMMDD-HHMMSS-mmm から YYYYMMDD を取得
	return timestamp.slice(0, 8);
}

/**
 * タイムスタンプ文字列をDateオブジェクトに変換
 */
function parseTimestampToDate(timestamp: string): Date | null {
	// YYYYMMDD-HHMM または YYYYMMDD-HHMMSS-mmm
	const match = timestamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
	if (!match) return null;

	const [, year, month, day, hour, minute] = match;
	return new Date(
		parseInt(year!, 10),
		parseInt(month!, 10) - 1,
		parseInt(day!, 10),
		parseInt(hour!, 10),
		parseInt(minute!, 10)
	);
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(folderPath);
	if (existing) {
		if (!(existing instanceof TFolder)) {
			throw new Error(
				`Backup path exists but is not a folder: ${folderPath}`
			);
		}
		return;
	}

	const parts = folderPath.split("/").filter(Boolean);
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const currentExisting = app.vault.getAbstractFileByPath(current);
		if (!currentExisting) {
			try {
				await app.vault.createFolder(current);
			} catch (error: any) {
				const message = (error?.message as string) || "";
				// 既に存在する場合は無視（並列保存対策）
				if (!message.includes("Folder already exists")) {
					throw error;
				}
			}
			continue;
		}
		if (!(currentExisting instanceof TFolder)) {
			throw new Error(
				`Backup path segment exists but is not a folder: ${current}`
			);
		}
	}
}

async function allocateUniquePath(app: App, desiredPath: string): Promise<string> {
	if (!app.vault.getAbstractFileByPath(desiredPath)) {
		return desiredPath;
	}

	let counter = 1;
	while (counter < 1000) {
		const candidate = desiredPath.replace(/\.md$/, `-${counter}.md`);
		if (!app.vault.getAbstractFileByPath(candidate)) {
			return candidate;
		}
		counter += 1;
	}
	throw new Error(`Failed to allocate unique backup path: ${desiredPath}`);
}

	/**
	 * 旧: シンプルなバックアップ削除（keepLatest件を保持）
	 * @deprecated 使用日ベースの pruneOldBackupsUsageDayBased を使用してください
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async function pruneOldBackups(
		app: App,
		backupFolderPath: string,
		keepLatest: number
	): Promise<void> {
	if (keepLatest <= 0) {
		return;
	}

	let listing: { files: string[]; folders: string[] } | null = null;
	try {
		listing = await app.vault.adapter.list(backupFolderPath);
	} catch {
		return;
	}

	const groups = new Map<string, string[]>();
	for (const filePath of listing.files) {
		const fileName = filePath.split("/").pop() ?? "";
		const sepIndex = fileName.indexOf("__");
		if (sepIndex <= 0) continue;
		const timestamp = fileName.slice(0, sepIndex);
		if (!groups.has(timestamp)) {
			groups.set(timestamp, []);
		}
		groups.get(timestamp)?.push(filePath);
	}

	const timestamps = [...groups.keys()].sort().reverse();
	const toDelete = timestamps.slice(keepLatest);
	for (const timestamp of toDelete) {
		const filePaths = groups.get(timestamp) ?? [];
		for (const filePath of filePaths) {
			const abstract = app.vault.getAbstractFileByPath(filePath);
			if (abstract) {
				await app.vault.delete(abstract, true);
				continue;
			}
			try {
				await app.vault.adapter.remove(filePath);
			} catch {
				// ignore
			}
		}
	}
}

/**
 * バックアップペア情報
 */
interface BackupPairInfo {
	groupKey: string;    // timestamp_reason または timestamp
	timestamp: string;   // YYYYMMDD-HHMM または YYYYMMDD-HHMMSS-mmm
	datePart: string;    // YYYYMMDD
	files: string[];     // before/after のファイルパス
	createdAt: Date | null;
}

/**
 * 使用日ベースのバックアップ削除
 *
 * ルール:
 * - 24時間以内: 最大 maxWithin24h 件を保持
 * - 7使用日以内: 各使用日ごとに1件を保持
 * - 7使用日超過: 削除
 *
 * 「使用日」は暦日ではなく、バックアップが作成された日の数（実際に使用した日のカウント）
 */
async function pruneOldBackupsUsageDayBased(
	app: App,
	backupFolderPath: string,
	config: RetentionConfig
): Promise<void> {
	let listing: { files: string[]; folders: string[] } | null = null;
	try {
		listing = await app.vault.adapter.list(backupFolderPath);
	} catch {
		return;
	}

	// バックアップペアを収集
	const pairsMap = new Map<string, BackupPairInfo>();
	for (const filePath of listing.files) {
		const fileName = filePath.split("/").pop() ?? "";
		const beforeAfterSepIndex = fileName.indexOf("__");
		if (beforeAfterSepIndex <= 0) continue;

		const prefix = fileName.slice(0, beforeAfterSepIndex);
		// 新フォーマット: YYYYMMDD-HHMM_reason
		// 旧フォーマット: YYYYMMDD-HHMMSS-mmm
		const reasonSepIndex = prefix.indexOf("_");
		const timestamp = reasonSepIndex > 0 ? prefix.slice(0, reasonSepIndex) : prefix;

		if (!pairsMap.has(prefix)) {
			pairsMap.set(prefix, {
				groupKey: prefix,
				timestamp,
				datePart: extractDatePart(timestamp),
				files: [],
				createdAt: parseTimestampToDate(timestamp),
			});
		}
		pairsMap.get(prefix)?.files.push(filePath);
	}

	if (pairsMap.size === 0) {
		return;
	}

	// 日時で降順ソート（新しい順）
	const allPairs = [...pairsMap.values()].sort((a, b) => {
		if (!a.createdAt || !b.createdAt) return 0;
		return b.createdAt.getTime() - a.createdAt.getTime();
	});

	const now = Date.now();
	const ms24h = 24 * 60 * 60 * 1000;

	// 保持するペアを決定
	const toKeep = new Set<string>();

	// 1. 24時間以内のバックアップを最大 maxWithin24h 件保持
	let countWithin24h = 0;
	for (const pair of allPairs) {
		if (!pair.createdAt) continue;
		if (now - pair.createdAt.getTime() <= ms24h) {
			if (countWithin24h < config.maxWithin24h) {
				toKeep.add(pair.groupKey);
				countWithin24h++;
			}
		}
	}

	// 2. 使用日ベースで7日分を保持（各使用日1件）
	// 「使用日」= バックアップが作成された日（YYYYMMDD）のユニーク数
	const usageDaysKept = new Set<string>();
	for (const pair of allPairs) {
		// 既に24h以内で保持されているものはスキップ
		if (toKeep.has(pair.groupKey)) {
			// ただし使用日としてはカウントする
			usageDaysKept.add(pair.datePart);
			continue;
		}

		// 使用日が7日分に達していない場合、この日の最新バックアップを1件保持
		if (usageDaysKept.size < config.usageDaysToKeep) {
			if (!usageDaysKept.has(pair.datePart)) {
				// この使用日の最初のバックアップ（最新のもの）を保持
				toKeep.add(pair.groupKey);
				usageDaysKept.add(pair.datePart);
			}
		}
	}

	// 3. 保持リストにないものを削除
	for (const pair of allPairs) {
		if (toKeep.has(pair.groupKey)) {
			continue;
		}

		// ペア全体を削除
		for (const filePath of pair.files) {
			const abstract = app.vault.getAbstractFileByPath(filePath);
			if (abstract) {
				await app.vault.delete(abstract, true);
				continue;
			}
			try {
				await app.vault.adapter.remove(filePath);
			} catch {
				// ignore
			}
		}
	}
}
