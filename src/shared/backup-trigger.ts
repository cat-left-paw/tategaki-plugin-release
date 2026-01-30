/**
 * スマートバックアップトリガー検出モジュール
 *
 * バックアップを作成すべきタイミング（トリガー）を検出する
 */

import type { BackupReason } from "./sync-backup";

/**
 * バックアップトリガー検出の設定
 */
export interface BackupTriggerConfig {
	/** big-paste の文字数閾値（デフォルト: 200） */
	bigPasteCharThreshold: number;
	/** big-paste の改行数閾値（デフォルト: 2） */
	bigPasteNewlineThreshold: number;
	/** auto-interval の間隔（ミリ秒、デフォルト: 20分） */
	autoIntervalMs: number;
}

export const DEFAULT_BACKUP_TRIGGER_CONFIG: BackupTriggerConfig = {
	bigPasteCharThreshold: 200,
	bigPasteNewlineThreshold: 2,
	autoIntervalMs: 20 * 60 * 1000, // 20分
};

/**
 * バックアップトリガー検出器
 */
export class BackupTriggerDetector {
	private config: BackupTriggerConfig;
	private lastBackupAt: number | null = null;
	private sessionStartBackupDone = false;

	constructor(config: Partial<BackupTriggerConfig> = {}) {
		this.config = { ...DEFAULT_BACKUP_TRIGGER_CONFIG, ...config };
	}

	/**
	 * セッション開始時のバックアップが必要かどうか
	 */
	needsSessionStartBackup(): boolean {
		return !this.sessionStartBackupDone;
	}

	/**
	 * セッション開始バックアップ完了をマーク
	 */
	markSessionStartBackupDone(): void {
		this.sessionStartBackupDone = true;
		this.lastBackupAt = Date.now();
	}

	/**
	 * バックアップ完了を記録
	 */
	recordBackup(): void {
		this.lastBackupAt = Date.now();
	}

	/**
	 * 自動間隔バックアップが必要かどうか（dirty状態の場合のみ呼び出すこと）
	 */
	needsAutoIntervalBackup(): boolean {
		if (this.lastBackupAt === null) {
			return true;
		}
		const elapsed = Date.now() - this.lastBackupAt;
		return elapsed >= this.config.autoIntervalMs;
	}

	/**
	 * big-paste かどうかを判定
	 *
	 * @param beforeMarkdown 変更前のMarkdown
	 * @param afterMarkdown 変更後のMarkdown
	 * @returns big-paste であれば true
	 */
	isBigPaste(beforeMarkdown: string, afterMarkdown: string): boolean {
		const charDiff = afterMarkdown.length - beforeMarkdown.length;

		// 文字数が閾値以上増加
		if (charDiff >= this.config.bigPasteCharThreshold) {
			return true;
		}

		// 改行数が閾値以上増加
		const beforeNewlines = (beforeMarkdown.match(/\n/g) || []).length;
		const afterNewlines = (afterMarkdown.match(/\n/g) || []).length;
		const newlineDiff = afterNewlines - beforeNewlines;

		if (newlineDiff >= this.config.bigPasteNewlineThreshold) {
			return true;
		}

		return false;
	}

	/**
	 * risky-change かどうかを判定
	 *
	 * ruby/span タグが新たに追加された場合を検出
	 *
	 * @param beforeMarkdown 変更前のMarkdown
	 * @param afterMarkdown 変更後のMarkdown
	 * @returns risky-change であれば true
	 */
	isRiskyChange(beforeMarkdown: string, afterMarkdown: string): boolean {
		// ruby タグの追加を検出
		const beforeRubyCount = (beforeMarkdown.match(/<ruby[\s>]/gi) || []).length;
		const afterRubyCount = (afterMarkdown.match(/<ruby[\s>]/gi) || []).length;
		if (afterRubyCount > beforeRubyCount) {
			return true;
		}

		// span タグの追加を検出（class属性付きのもののみ）
		const beforeSpanCount = (beforeMarkdown.match(/<span\s+class=/gi) || []).length;
		const afterSpanCount = (afterMarkdown.match(/<span\s+class=/gi) || []).length;
		if (afterSpanCount > beforeSpanCount) {
			return true;
		}

		return false;
	}

	/**
	 * 変更内容からバックアップ理由を判定
	 *
	 * @param beforeMarkdown 変更前のMarkdown
	 * @param afterMarkdown 変更後のMarkdown
	 * @param isManualSync 手動同期かどうか
	 * @param isDirty dirty状態かどうか
	 * @returns バックアップ理由（バックアップ不要なら null）
	 */
	detectBackupReason(
		beforeMarkdown: string,
		afterMarkdown: string,
		isManualSync: boolean,
		isDirty: boolean
	): BackupReason | null {
		// 手動同期は常にバックアップ
		if (isManualSync) {
			return "manual-sync";
		}

		// セッション開始バックアップ
		if (this.needsSessionStartBackup()) {
			return "session-start";
		}

		// risky-change（ruby/span追加）
		if (this.isRiskyChange(beforeMarkdown, afterMarkdown)) {
			return "risky-change";
		}

		// big-paste（+200文字 または +2行）
		if (this.isBigPaste(beforeMarkdown, afterMarkdown)) {
			return "big-paste";
		}

		// auto-interval（20分経過 AND dirty）
		if (isDirty && this.needsAutoIntervalBackup()) {
			return "auto-interval";
		}

		// バックアップ不要
		return null;
	}

	/**
	 * リセット（新しいファイルを開いた時など）
	 */
	reset(): void {
		this.sessionStartBackupDone = false;
		this.lastBackupAt = null;
	}
}
