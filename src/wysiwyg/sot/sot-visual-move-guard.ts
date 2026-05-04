/**
 * isVisualMoveSuccessful:
 * getVisualMoveInfo() が「実際に位置を変えた」かどうかを判定する。
 *
 * false を返す条件:
 *   - visualOffset が null  → 視覚ナビが試みられなかった、または明示的に失敗した
 *   - visualOffset === currentOffset → 視覚ナビが同一位置に留まった（スタック状態）
 *
 * どちらの場合も handleNavigate は論理ナビゲーションへ fallback する必要がある。
 */
export function isVisualMoveSuccessful(
	visualOffset: number | null,
	currentOffset: number,
): boolean {
	return visualOffset !== null && visualOffset !== currentOffset;
}
