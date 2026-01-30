#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="__PLUGIN_ID__"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$PACKAGE_ROOT/$PLUGIN_ID"

if [[ ! -f "$SOURCE_DIR/manifest.json" ]]; then
	osascript -e 'display dialog "同じZip内にプラグインフォルダが見つかりませんでした。Zipを正しく展開してから実行してください。" buttons {"OK"} default button "OK" with icon stop'
	exit 1
fi

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

if [[ ! -d "$VAULT_PATH/.obsidian" ]]; then
	ANSWER="$(
		osascript -e 'button returned of (display dialog "選んだフォルダに .obsidian が見つかりませんでした。本当にVaultフォルダですか？\n\n続行しますか？" buttons {"キャンセル","続行"} default button "キャンセル" with icon caution)'
	)" || exit 0
	[[ "$ANSWER" == "続行" ]] || exit 0
fi

DEST_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$DEST_DIR"

cp -f "$SOURCE_DIR/main.js" "$DEST_DIR/"
cp -f "$SOURCE_DIR/manifest.json" "$DEST_DIR/"
cp -f "$SOURCE_DIR/styles.css" "$DEST_DIR/"

osascript -e "display dialog \"インストールが完了しました。\n\nインストール先:\n$DEST_DIR\n\nObsidian を再起動して、設定 → コミュニティプラグイン から有効化してください。\" buttons {\"OK\"} default button \"OK\" with icon note"

