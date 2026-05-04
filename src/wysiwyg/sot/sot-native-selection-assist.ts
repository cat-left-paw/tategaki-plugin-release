/**
 * SoT Native Selection Assist – 状態遷移の明文化
 *
 * `nativeSelectionAssistActive` の ON/OFF を決定するロジックを
 * 1か所に集約する。すべての関数は **純関数** であり副作用を持たない。
 *
 * ─── 状態遷移表 ───
 *
 * | イベント                    | 前提条件                                                | 次状態 |
 * |---------------------------|--------------------------------------------------------|-------|
 * | autoscroll-start          | !ceIme && !sourceMode                                  | ON    |
 * |                           |   && isPointerSelecting && !scrollbarHold               |       |
 * | autoscroll-stop           | assistByAutoScroll === true                             | OFF   |
 * | pointerdown-scrollbar     | !ceIme && !sourceMode && button===0 && onScrollbar      | ON    |
 * | pointerdown-content       | !ceIme && !sourceMode && button===0 && !onScrollbar     | OFF   |
 * | pointerup                 | button===0                                             | OFF   |
 * | pointercancel             | button===0                                             | OFF   |
 * | escape                    | always                                                 | OFF   |
 * | setCeImeMode              | always                                                 | OFF   |
 *
 * PR3a: 同値リファクタ。PR3b: 設定非依存化。PR4: ターゲット分類導入。
 * 2026-03: 通常クリック性能を優先し、pointerdown では native-first を起動しない。
 */

import type { PointerStrategy } from "./sot-pointer-strategy";
import type { SoTSelectionMode } from "../../types/settings";

// ---------------------------------------------------------------------------
// 入力型
// ---------------------------------------------------------------------------

/** autoscroll-start の判定に必要な状態 */
export interface AutoScrollStartContext {
	ceImeMode: boolean;
	sourceModeEnabled: boolean;
	isPointerSelecting: boolean;
	scrollbarSelectionHold: boolean;
}

/** pointerdown の判定に必要な状態 */
export interface PointerDownContext {
	ceImeMode: boolean;
	sourceModeEnabled: boolean;
	button: number;
	onScrollbar: boolean;
	/** ターゲット要素の選択戦略（省略時は既存動作） */
	targetStrategy?: PointerStrategy;
	/** SoT選択モード設定 */
	selectionMode?: SoTSelectionMode;
}

export interface NativeSelectionMouseUpFallbackContext {
	button: number;
	hasPendingClick: boolean;
	pendingFocus: boolean;
	assistActive: boolean;
	alreadyHandled: boolean;
}

// ---------------------------------------------------------------------------
// 遷移判定: 個別イベント
// ---------------------------------------------------------------------------

/**
 * autoscroll-start 時: assist を ON にすべきか。
 * true → ON, false → 変更なし（現状維持）。
 */
export function shouldActivateOnAutoScrollStart(
	ctx: AutoScrollStartContext,
): boolean {
	return (
		!ctx.ceImeMode &&
		!ctx.sourceModeEnabled &&
		ctx.isPointerSelecting &&
		!ctx.scrollbarSelectionHold
	);
}

/**
 * autoscroll-stop 時: assist を OFF にすべきか。
 * @param assistByAutoScroll 現在の nativeSelectionAssistByAutoScroll
 */
export function shouldDeactivateOnAutoScrollStop(
	assistByAutoScroll: boolean,
): boolean {
	return assistByAutoScroll;
}

/** pointerdown の判定結果 */
export type PointerDownDecision =
	| { action: "activate"; reason: "pointerdown-scrollbar" }
	| { action: "activate"; reason: "pointerdown-content-native" }
	| { action: "deactivate"; reason: "pointerdown-content" }
	| { action: "none" };

/**
 * pointerdown 時: assist をどう遷移させるか。
 *
 * selectionMode による分岐:
 * - "fast-click" (default): 通常テキストは deactivate（SoT高速キャレット）
 * - "native-drag": targetStrategy==="native-first" なら activate（ネイティブ選択）
 */
export function decideOnPointerDown(
	ctx: PointerDownContext,
): PointerDownDecision {
	if (ctx.button !== 0) return { action: "none" };
	if (ctx.ceImeMode || ctx.sourceModeEnabled) {
		return { action: "none" };
	}
	if (ctx.onScrollbar) {
		return { action: "activate", reason: "pointerdown-scrollbar" };
	}
	const mode = ctx.selectionMode ?? "fast-click";
	if (mode === "native-drag" && ctx.targetStrategy === "native-first") {
		return { action: "activate", reason: "pointerdown-content-native" };
	}
	return { action: "deactivate", reason: "pointerdown-content" };
}

export function shouldHandleNativeSelectionMouseUpFallback(
	ctx: NativeSelectionMouseUpFallbackContext,
): boolean {
	if (ctx.button !== 0) return false;
	if (ctx.alreadyHandled) return false;
	return ctx.hasPendingClick || ctx.pendingFocus || ctx.assistActive;
}

// ---------------------------------------------------------------------------
// 遷移判定: 無条件 OFF イベント
// ---------------------------------------------------------------------------

/**
 * pointerup / pointercancel 時: button===0 なら OFF にすべきか。
 */
export function shouldDeactivateOnPointerEnd(button: number): boolean {
	return button === 0;
}

// escape / setCeImeMode は常に OFF → 呼び出し側で直接 false を渡す。
// 定数化の必要がないため関数は用意しない。

// ---------------------------------------------------------------------------
// Typewriter 実効 selection mode
// ---------------------------------------------------------------------------

/**
 * 保存値の sotSelectionMode と sotTypewriterMode を受け取り、
 * pointerdown 判定で使う実効 selection mode を返す純粋関数。
 *
 * Typewriter ON 中は保存値に関わらず "fast-click" を返す。
 * 保存値そのものは変更しない。
 */
export function resolveEffectiveSelectionMode(
	saved: SoTSelectionMode,
	typewriterMode: boolean,
): SoTSelectionMode {
	return typewriterMode ? "fast-click" : saved;
}
