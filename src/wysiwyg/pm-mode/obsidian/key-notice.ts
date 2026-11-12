import { Notice } from "obsidian";
import { t } from "../../../shared/i18n";
import type { SourceOwnerBinding } from "./source-owner";
import { showPmModeInputNotice } from "./input-notice";

/**
 * K2 / J16: key failures have no retained text. Commit failures keep the existing recovery sentence. D-C-19 (F-3): a refused cut or paste has none either (the text is on the clipboard or in the note,
 * not on the input surface), so it takes the key's sentence; its reason is the input's wording of it (the Enter's own `inside-inline` is about a line break, which a paste's is not). A stopped write
 * (`mismatch`) says so, whatever the operation.
 */
export const showPmModeEditNotice: SourceOwnerBinding["notice"] = (reason, operation) => {
	if (operation === undefined || reason === "mismatch") { showPmModeInputNotice(reason); return; }
	const key = reason === "partial-atom" || reason === "atom-neighbor" || reason === "gap" || reason === "protected-target" ? "location" : reason;
	const message = reason === "inside-inline" && operation === "key" ? t("pm.notice.key.inside-inline") : t(`pm.notice.input.${key}`);
	new Notice(t("pm.notice.keyBlocked", { reason: message }), 4000);
};
