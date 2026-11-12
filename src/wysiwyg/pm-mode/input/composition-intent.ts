// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/compositionIntent.ts @ 020b5501 (2026-10-22)
// Local changes: `sameMirrorRange` (selectionMirror.ts) is inlined as `sameSnapshot` on the
//   owner-neutral snapshot; the mirror itself comes with reconversion (M6). `isMirrorNavigationKey`
//   is left out until then.
//   H24 (2026-11-06): `releasesAllModifiers` is added, copied from Nyoze PIS-IME-KEYLESS-CONTINUATION1
//   (compositionIntent.ts @ f25c5d35, 2026-10-29). It is the keyup half of the armed mark of the last input
//   (`recent-input.ts`).
import type { InsertionSnapshot } from "./edit-owner";

export type CompositionKey = Pick<KeyboardEvent, "isComposing" | "keyCode" | "ctrlKey" | "metaKey" | "code"> & { snapshot: InsertionSnapshot | null };
const IME_FUNCTION_CODES = new Set(["Convert", "NonConvert", "KanaMode", "Lang1", "Lang2", "Lang3", "Lang4", "Lang5"]);

export function sameSnapshot(a: InsertionSnapshot | null, b: InsertionSnapshot | null): boolean {
	return !!a && !!b && a.identity === b.identity && a.docRef === b.docRef && a.from === b.from && a.to === b.to;
}
/** 直前のkeydownとsnapshotだけを使う。時間・文字・DOMの見え方から推測しない。 */
export function isKeyStartedComposition(last: CompositionKey | null, current: InsertionSnapshot | null): boolean {
	return !!last && !last.isComposing && last.keyCode === 229 && !last.ctrlKey && !last.metaKey
		&& !IME_FUNCTION_CODES.has(last.code) && sameSnapshot(last.snapshot, current);
}
/** WindowsのIMEが引き受けなかったWin+文字だけ。 */
export function blocksUnclaimedWindowsCharacter(event: Pick<KeyboardEvent, "metaKey" | "key" | "keyCode" | "isComposing">, mac: boolean, composing: boolean): boolean {
	return !mac && event.metaKey && event.key.length === 1 && !event.isComposing && !composing && event.keyCode !== 229;
}
/**
 * KEYLESS-CONTINUATION1: 変換の外のkeyupで、修飾キー（Control・Meta・Alt・Shift）がどれも押されていない。
 * 確定の直後の再変換は修飾キーを押したまま始まり、音声入力（Control 2回・Win+H）は離してから始まる（作者の記録）。
 * keyupを取りこぼした場合は有効化が残る（拒否の側）。
 */
export function releasesAllModifiers(event: Pick<KeyboardEvent, "isComposing" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): boolean {
	return !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}
/** 直後の印は拒否帳簿とは別。IMEの再変換の合図では外さない。 */
export function releasesRecentInput(last: CompositionKey & { key: string }, current: InsertionSnapshot | null): boolean {
	if (IME_FUNCTION_CODES.has(last.code)) return false;
	if (isKeyStartedComposition(last, current)) return true;
	return last.keyCode !== 229 && !/^(Shift|Control|Alt|Meta|AltGraph|CapsLock|Fn)$/.test(last.key);
}
