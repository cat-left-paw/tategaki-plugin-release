/**
 * shouldSkipRunBoundaryJump:
 * calculateOffsetWithinLine() における run 境界 marker-gap ジャンプ最適化を
 * スキップすべき行かを判定する。
 *
 * code 行は lowlight (hljs) トークンが隣接配置 (nextFrom === runTo) されるため、
 * marker-gap ジャンプ最適化は本来発火する条件 (nextFrom > runTo) を満たさないが、
 * トークン分割境界で誤発火する経路を持っていた。
 * dataset.mdKind === "code" の行では一律で marker-gap ジャンプを行わない。
 *
 * 戻り値:
 *   true  = 該当行 (= code 行) で marker-gap ジャンプをスキップすべき
 *   false = 通常行などでスキップ不要
 */
export function shouldSkipRunBoundaryJump(
	mdKind: string | undefined,
): boolean {
	return mdKind === "code";
}
