import { Notice } from "obsidian";
import { t } from "../../../shared/i18n";
import type { SourceOwnerBinding } from "./source-owner";
import type { KeylessReason } from "./input-surface";
import type { CommitTargetRestriction } from "./commit-target-restriction";
import { excerptForNotice, type DocumentActionStatus } from "./document-action";

/** J16's wording of a write that was refused and kept on the surface. The notices of leaving a view (M4a, D-M4-11 and D-M4-12) are below. */
export const showPmModeInputNotice: SourceOwnerBinding["notice"] = reason => {
	if (reason === "mismatch") { new Notice(t("pm.notice.inputMismatch"), 6000); return; }
	const key = reason === "partial-atom" || reason === "atom-neighbor" || reason === "gap" || reason === "protected-target" ? "location" : reason;
	new Notice(t("pm.notice.inputRetained", { reason: t(`pm.notice.input.${key}`) }), 4000);
};

/**
 * BLOCK-WARN1 (D-W-4): said before a text is typed where a commit is refused by where it goes: a direct input is stopped (`direct`), a composition is not (`composition`: what is confirmed stays on the
 * input surface and is not written). The reason is the commit's own (`pm.notice.input.*`: the refusal's wording is the same before and after).
 */
export function showPmModeBlockWarnNotice(reason: CommitTargetRestriction, via: "direct" | "composition"): void {
	new Notice(t(via === "direct" ? "pm.notice.inputBlocked" : "pm.notice.inputBlockedComposition", { reason: t(`pm.notice.input.${reason === "partial-atom" ? "location" : reason}`) }), 4000);
}

/** The clipboard stage (D-C-6; round 2, P3-5, P3-6): a paste or a menu's cut that was not written because the surface is composing or holds text. The clipboard keeps the text. */
export function showPmModeClipboardBusyNotice(reason: "composing" | "retained"): void {
	new Notice(t("pm.notice.keyBlocked", { reason: t(`pm.notice.clipboard.${reason}`) }), 4000);
}

/**
 * J20: a composition no typed key began (over a selection, or right after an input at the same place) is kept on the
 * surface and not written. The same sentence as the owner's, with its own reason; once per retention (the surface asks).
 */
export function showPmModeKeylessNotice(reason: KeylessReason): void {
	new Notice(t("pm.notice.inputRetained", { reason: t(`pm.notice.input.${reason}`) }), 4000);
}

/**
 * M4a (D-M4-11): a stoppable entry (Tategaki's own opening, replacing or closing of its views) did nothing because the surface is composing, is committing or holds text.
 * The sentence says what to do first: finish the composition, or delete or copy the retained text, then do it again.
 */
export function showPmModeLeaveBlockedNotice(status: Exclude<DocumentActionStatus, "ready">): void {
	new Notice(t(status === "recovery-required" ? "pm.notice.leaveBlocked.retained" : "pm.notice.leaveBlocked.composing"), 6000);
}

/**
 * M4a (D-M4-12, D10): the view went away with text still on its input surface (retained text, or a composition that did not end). The notice shows the first characters
 * (`excerptForNotice`) so that they can be typed again; the text is not written to the clipboard.
 */
export function showPmModeLostTextNotice(text: string): void {
	new Notice(t("pm.notice.lostText", { text: excerptForNotice(text) }), 15000);
}
