/**
 * SoT Outline Jump Guard – 見出しジャンプ中の状態管理
 *
 * 見出しジャンプ実行中に finalizeRender() のスクロール復元が
 * ジャンプ結果を上書きするのを防ぐガードモジュール。
 *
 * - `begin()` でジャンプ開始を宣言し、トークンを返す
 * - `end()` / `cancel()` でジャンプ完了/中断
 * - `shouldSuppressScrollRestore()` で復元抑制を判定
 *
 * すべてのメソッドは副作用を最小限に抑えた軽量設計。
 */

export class OutlineJumpGuard {
	/** 現在のジャンプトークン（0 = ジャンプ中でない） */
	private token = 0;
	/** ジャンプが進行中かどうか */
	private active = false;
	/** ジャンプ開始時刻（タイムアウト安全弁用） */
	private startedAt = 0;
	/** 安全タイムアウト（ms）。この時間を超えたら自動解除 */
	private readonly timeoutMs: number;

	constructor(timeoutMs = 5000) {
		this.timeoutMs = timeoutMs;
	}

	/**
	 * 見出しジャンプ開始を宣言する。
	 * 前回のジャンプが残っていても新しいトークンで上書きされる。
	 * @returns 今回のジャンプトークン
	 */
	begin(): number {
		this.token += 1;
		this.active = true;
		this.startedAt = Date.now();
		return this.token;
	}

	/**
	 * 指定トークンのジャンプが完了したことを通知する。
	 * トークン不一致の場合は無視（別のジャンプが開始済み）。
	 */
	end(jumpToken: number): void {
		if (this.token === jumpToken) {
			this.active = false;
		}
	}

	/**
	 * 現在進行中のジャンプを強制キャンセルする。
	 * トークンは進めず、active フラグのみ解除。
	 */
	cancel(): void {
		this.active = false;
	}

	/**
	 * 見出しジャンプが進行中かどうかを返す。
	 * タイムアウトを超えた場合は自動解除して false を返す。
	 */
	isJumpInProgress(): boolean {
		if (!this.active) return false;
		if (Date.now() - this.startedAt > this.timeoutMs) {
			this.active = false;
			return false;
		}
		return true;
	}

	/**
	 * finalizeRender() のスクロール復元を抑制すべきかどうか。
	 * ジャンプ中であれば true を返す。
	 */
	shouldSuppressScrollRestore(): boolean {
		return this.isJumpInProgress();
	}

	/**
	 * 指定トークンが現在有効かどうか。
	 * scrollToOutlineLine 内の非同期処理で使用。
	 */
	isTokenValid(jumpToken: number): boolean {
		return this.token === jumpToken;
	}
}
