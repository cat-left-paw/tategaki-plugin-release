// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/reconversionState.ts @ f25c5d35 (2026-10-29): the part of PIS-IME-KEYLESS-CONTINUATION1
//   that concerns the mark of the last input (`RecentInput`, `noteInputFinished`, `armRecentInput`, `disarmRecentInput`,
//   `allowsKeylessAfterInput`, and the `armed` condition of the `keyless-after-input` refusal in `beginReconversion`).
// Local changes: the functions take and return the mark (`RecentInput | null`) itself, not Nyoze's `ReconversionState`
//   (the state of the reconversion with its mirror and its book of refusals; those come with reconversion, M6). The refusal
//   is a function of its own (`rejectsKeylessAfterInput`), so the surface asks it at the start of a cycle. No behavior is changed.
import type { InsertionSnapshot } from "./edit-owner";
import { sameSnapshot } from "./composition-intent";

/**
 * 確定の直後の印。`armed`は有効化（確定の後に、変換の外でキーを押し、修飾キーをまだ押している）。
 * 有効化された印だけが、keyなしのcollapsedの開始を拒否する。部分確定・音声入力の続きは、確定から開始までkeydownがない。
 * 音声入力・絵文字パネルを修飾キーで開く場合は、修飾キーをすべて離してから始まる。確定の直後の再変換は、押したまま始まる。
 * 時間・timer・rAF・文字の内容・DOMの見え方は使わない。
 */
export type RecentInput = InsertionSnapshot & { readonly armed: boolean };

/**
 * 入力の終わりの印を作る。確定の成功（ownerが`"committed"`を返した）の後は有効化されていない印で始める。
 * 成功しなかった終わり（拒否・空の終了・保持・E4の破棄の後）は、前の印の有効化を引き継ぐ（前の印がなければ有効化されていない）。
 */
export function noteInputFinished(previous: RecentInput | null, current: InsertionSnapshot | null, outcome: { committed: boolean }): RecentInput | null {
	const armed = !outcome.committed && !!previous?.armed;
	return current ? { identity: current.identity, docRef: current.docRef, from: current.from, to: current.to, armed } : null;
}

/** 変換の外のkeydown（変換中でなく、印を外さなかった）で呼ぶ。印がなければ・有効化済みなら何もしない。 */
export function armRecentInput(recent: RecentInput | null): RecentInput | null {
	return recent && !recent.armed ? { ...recent, armed: true } : recent;
}

/** 変換の外のkeyupで、修飾キーがどれも押されていないときに呼ぶ。有効化されていなければ何もしない。 */
export function disarmRecentInput(recent: RecentInput | null): RecentInput | null {
	return recent?.armed ? { ...recent, armed: false } : recent;
}

/** `keyless-after-input`で拒否するのは、有効化された印がある・打鍵で始まっていない・collapsed・印と同じsnapshotのときだけ。 */
export function rejectsKeylessAfterInput(recent: RecentInput | null, snapshot: InsertionSnapshot | null, keyed: boolean): boolean {
	return !keyed && !!recent?.armed && !!snapshot && sameSnapshot(recent, snapshot) && snapshot.from === snapshot.to;
}

/** 有効化されていない印のある、打鍵なしのcollapsedの開始（診断の記録だけに使う。判定は`rejectsKeylessAfterInput`）。 */
export function allowsKeylessAfterInput(recent: RecentInput | null, snapshot: InsertionSnapshot | null, keyed: boolean): boolean {
	return !keyed && !!recent && !recent.armed && !!snapshot && sameSnapshot(recent, snapshot) && snapshot.from === snapshot.to;
}
