# インストールガイド

このプラグインは現在、Obsidian Community Plugins への申請中です。  
そのため、**現時点では BRAT でのインストールを推奨**します。  
手動で入れたい場合は、GitHub Releases の配布 Zip からもインストールできます。

## 重要な変更

- **v1.2.0 以降、インストーラースクリプトの同梱を廃止**しています
- インストーラーを同梱していたのは **v1.1.1 まで**です
- 現在の配布物は、プラグイン本体（`main.js` / `manifest.json` / `styles.css`）を中心とした構成です

## 旧版ユーザー向け注意（ID変更）

- `1.2.2` からプラグインIDは `tategaki-plugin` から `tategaki` に変更されています
- 旧版から更新すると、Obsidian 上では別プラグインとして扱われる場合があります
- 旧プラグイン `tategaki-plugin` を無効化し、新プラグイン「Tategaki」（ID: tategaki）を有効化してください
- 必要に応じて設定を手動コピーしてください
    - コピー元: `.obsidian/plugins/tategaki-plugin/data.json`
    - コピー先: `.obsidian/plugins/tategaki/data.json`
- 既存のホットキー割り当ては再確認してください
- 動作確認後、旧フォルダ `.obsidian/plugins/tategaki-plugin/` は削除可能です

## 推奨: BRAT でインストール

コミュニティプラグイン登録前の段階では、**更新しやすさの面でも BRAT が最も扱いやすい**です。

1. Obsidian の `設定` → `コミュニティプラグイン` で、BRAT をインストールして有効化します
2. BRAT の設定画面を開き、`Add Beta plugin` を選びます
3. リポジトリとして次のどちらかを入力します
    - `cat-left-paw/tategaki-plugin-release`
    - `https://github.com/cat-left-paw/tategaki-plugin-release`
4. 追加された `Tategaki` をインストールします
5. Obsidian の `設定` → `コミュニティプラグイン` で `Tategaki` を有効化します

英語 UI が分かりにくい場合の目安:

- `Add Beta plugin` または `Add a beta plugin for testing`
  GitHub リポジトリを登録して、対象プラグインをインストールする項目です
- `Beta plugin list`
  BRAT で管理しているプラグイン一覧です
- `Check for updates ... and UPDATE`
  更新確認とアップデートを行う項目です

補足:

- BRAT を使うと、コミュニティプラグイン登録前でもアップデートしやすくなります
- 互換モードの同期バックアップなど、既存のデータ保存場所は通常どおり使われます
- BRAT のバージョンによって、ボタン名やコマンド名が少し異なることがあります

## 手動インストールの事前準備

1. Obsidian を終了します
2. Releases から Zip をダウンロードして展開します
3. 展開先にプラグインフォルダがあることを確認します
    - Zip 名: `<plugin-id>-<version>.zip`（例: `tategaki-1.2.3.zip`）

フォルダ構成の例:

- `tategaki/main.js`
- `tategaki/manifest.json`
- `tategaki/styles.css`

## 手動インストール（代替手段）

1. Vault フォルダを開きます
2. Vault 内の `.obsidian/plugins/` を開きます（なければ作成）
3. 展開した `tategaki/` フォルダを `.obsidian/plugins/` にコピーします
4. 結果が `.obsidian/plugins/tategaki/` になることを確認します
5. Obsidian を起動し、設定 → コミュニティプラグイン で `Tategaki` を有効化します

## OS別メモ

### Windows

- エクスプローラーで隠しファイル表示を有効化して `.obsidian` を表示してください
- 「表示」→「隠しファイル」をオン

### macOS

- Finder で `Cmd + Shift + .` を押すと `.obsidian` の表示を切り替えできます

### Linux

- ファイルマネージャで `Ctrl + H` を押すと隠しファイル表示を切り替えできます

## アップデート

### BRAT を使っている場合

- BRAT 側の更新機能からアップデートしてください
- コミュニティプラグイン登録前は、手動 ZIP 更新より BRAT のほうが管理しやすいです

更新方法の例:

1. コマンドパレット（`Ctrl+P` / `Cmd+P`）を開きます
2. `BRAT` または `update` で検索します
3. 次のようなコマンドを実行します
    - `Check for updates to beta plugins and UPDATE`
    - または `Check for updates to all beta plugins and UPDATE`
4. 更新が見つかれば、そのままダウンロードと差し替えが行われます
5. 必要なら Obsidian を再起動します

補足:

- 特定のプラグインだけ更新したい場合は、`Choose a single plugin to update` のようなコマンドを使います
- 起動時に自動で更新確認したい場合は、BRAT の設定画面で自動チェック系の項目を有効にしてください
- GitHub 側の反映タイミングにより、リリース直後は少し待ってから更新確認したほうが見つかりやすいことがあります

### 手動インストールしている場合

1. 新しいバージョンの Zip を展開します
2. `.obsidian/plugins/tategaki/` の中身を上書きします
3. Obsidian を再起動します

## アンインストール

1. Obsidian の設定 → コミュニティプラグインで `Tategaki` を無効化
2. BRAT 経由で入れている場合は、必要に応じて BRAT の管理対象から外します
3. そのままアンインストール
4. 必要に応じて次を削除

- `.obsidian/plugins/tategaki/`
- `<Vault設定フォルダ>/tategaki-sync-backups/`（互換モードのバックアップ。通常は `.obsidian/tategaki-sync-backups/`）
