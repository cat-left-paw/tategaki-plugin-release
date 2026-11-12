import type { App } from "obsidian";

/**
 * 互換モード（1.4.0 で廃止）が作っていた同期バックアップの後片付け。
 * 1.4.0 の plugin は同期バックアップを作らない。古い backup は自動では消さず、設定画面の
 * 「互換モードの古いバックアップをゴミ箱へ移す」が、利用者が押したときだけ、この folder をゴミ箱へ移す。
 * （backup は Vault の設定 folder の下にあり、Vault の index に TFile として入っていないので、
 *  FileManager.trashFile ではなく DataAdapter の trashSystem / trashLocal で移す。）
 */
const SYNC_BACKUP_FOLDER_NAME = "tategaki-sync-backups";

export function getSyncBackupRootPath(app: App): string {
	return `${app.vault.configDir}/${SYNC_BACKUP_FOLDER_NAME}`;
}

/** 古い同期バックアップの folder があるか。 */
export async function hasSyncBackups(app: App): Promise<boolean> {
	try {
		return await app.vault.adapter.exists(getSyncBackupRootPath(app));
	} catch {
		return false;
	}
}

export async function moveSyncBackupsToTrash(
	app: App,
	options: { system?: boolean } = {}
): Promise<"none" | "system" | "local"> {
	const adapter = app.vault.adapter;
	const backupRoot = getSyncBackupRootPath(app);
	const exists = await adapter.exists(backupRoot);
	if (!exists) {
		return "none";
	}

	const preferSystem = options.system !== false;
	if (preferSystem) {
		try {
			const moved = await adapter.trashSystem(backupRoot);
			if (moved) {
				return "system";
			}
		} catch {
			// fall through
		}
	}

	await adapter.trashLocal(backupRoot);
	return "local";
}
