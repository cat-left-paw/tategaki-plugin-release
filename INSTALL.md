# インストールガイド

このプラグインは現在、Obsidian Community Plugins への申請中です。  
そのため、インストールは GitHub Releases の配布 Zip から行います。

## 重要な変更

- **v1.2.0 以降、インストーラースクリプトの同梱を廃止**しています
- インストーラーを同梱していたのは **v1.1.1 まで**です
- 現在の配布物は、プラグイン本体（`main.js` / `manifest.json` / `styles.css`）を中心とした構成です

## 旧版ユーザー向け注意（ID変更）

- `1.2.2` からプラグインIDは `tategaki-plugin` から `tategaki` に変更されています
- 旧版から更新すると、Obsidian 上では別プラグインとして扱われる場合があります
- 旧プラグイン `tategaki-plugin` を無効化し、新プラグイン `tategaki` を有効化してください
- 必要に応じて設定を手動コピーしてください
  - コピー元: `.obsidian/plugins/tategaki-plugin/data.json`
  - コピー先: `.obsidian/plugins/tategaki/data.json`
- 既存のホットキー割り当ては再確認してください
- 動作確認後、旧フォルダ `.obsidian/plugins/tategaki-plugin/` は削除可能です

## 事前準備（共通）

1. Obsidian を終了します
2. Releases から Zip をダウンロードして展開します
3. 展開先にプラグインフォルダがあることを確認します
   - Zip 名: `<plugin-id>-<version>.zip`（例: `tategaki-1.2.3.zip`）

フォルダ構成の例:

- `tategaki/main.js`
- `tategaki/manifest.json`
- `tategaki/styles.css`

## 手動インストール（推奨）

1. Vault フォルダを開きます
2. Vault 内の `.obsidian/plugins/` を開きます（なければ作成）
3. 展開した `tategaki/` フォルダを `.obsidian/plugins/` にコピーします
4. 結果が `.obsidian/plugins/tategaki/` になることを確認します
5. Obsidian を起動し、設定 → コミュニティプラグイン で `tategaki` を有効化します

## OS別メモ

### Windows

- エクスプローラーで隠しファイル表示を有効化して `.obsidian` を表示してください
- 「表示」→「隠しファイル」をオン

### macOS

- Finder で `Cmd + Shift + .` を押すと `.obsidian` の表示を切り替えできます

### Linux

- ファイルマネージャで `Ctrl + H` を押すと隠しファイル表示を切り替えできます

## アップデート

1. 新しいバージョンの Zip を展開します
2. `.obsidian/plugins/tategaki/` の中身を上書きします
3. Obsidian を再起動します

## アンインストール

1. Obsidian の設定 → コミュニティプラグインで `tategaki` を無効化
2. そのままアンインストール
3. 必要に応じて次を削除

- `.obsidian/plugins/tategaki/`
- `.obsidian/tategaki-sync-backups/`（互換モードのバックアップ）
