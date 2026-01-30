#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="__PLUGIN_ID__"
BACKUP_REL=".obsidian/tategaki-sync-backups"

VAULT_PATH="$(
	osascript <<'APPLESCRIPT'
set theFolder to choose folder with prompt "Obsidian の Vault フォルダを選択してください（.obsidian の外側のフォルダ）"
POSIX path of theFolder
APPLESCRIPT
)" || exit 0

VAULT_PATH="${VAULT_PATH%/}"

leaf="$(basename "$VAULT_PATH")"
if [[ "$leaf" == "plugins" ]]; then
	VAULT_PATH="$(dirname "$VAULT_PATH")"
	leaf="$(basename "$VAULT_PATH")"
fi
if [[ "$leaf" == ".obsidian" ]]; then
	VAULT_PATH="$(dirname "$VAULT_PATH")"
fi

PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
BACKUP_DIR="$VAULT_PATH/$BACKUP_REL"

if [[ ! -e "$PLUGIN_DIR" ]]; then
	osascript -e "display dialog \"プラグインフォルダが見つかりませんでした。\n\n$PLUGIN_DIR\" buttons {\"OK\"} default button \"OK\" with icon caution"
	exit 0
fi

ANSWER="$(
	osascript -e "button returned of (display dialog \"プラグインフォルダをゴミ箱へ移動します。続行しますか？\n\n$PLUGIN_DIR\" buttons {\"キャンセル\",\"続行\"} default button \"キャンセル\" with icon caution)"
)" || exit 0
[[ "$ANSWER" == "続行" ]] || exit 0

osascript -e "tell application \"Finder\" to delete POSIX file \"${PLUGIN_DIR}\""

if [[ -e "$BACKUP_DIR" ]]; then
	ANSWER2="$(
		osascript -e "button returned of (display dialog \"同期バックアップフォルダ（任意）もゴミ箱へ移動しますか？\n\n$BACKUP_DIR\" buttons {\"いいえ\",\"はい\"} default button \"いいえ\" with icon caution)"
	)" || exit 0
	if [[ "$ANSWER2" == "はい" ]]; then
		osascript -e "tell application \"Finder\" to delete POSIX file \"${BACKUP_DIR}\"" || true
	fi
fi

osascript -e 'display dialog "アンインストールが完了しました。" buttons {"OK"} default button "OK" with icon note'

