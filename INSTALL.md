# インストールガイド

Tategaki は Obsidian のコミュニティプラグインからインストールできます。
通常は、Obsidian 標準のインストール/更新機能を使ってください。

## 推奨: コミュニティプラグインからインストール

1. Obsidian の `設定` を開きます。
2. `コミュニティプラグイン` を開きます。
3. セーフモードが有効な場合は、コミュニティプラグインを有効化します。
4. `閲覧` を開き、`Tategaki` を検索します。
5. `Tategaki` をインストールします。
6. インストール後、`有効化` を押します。

設定画面は、Obsidian の `設定` → `コミュニティプラグイン` → `Tategaki` から開けます。

## アップデート

コミュニティプラグインからインストールした場合は、Obsidian の通常の更新機能でアップデートできます。

1. Obsidian の `設定` を開きます。
2. `コミュニティプラグイン` を開きます。
3. `更新を確認` を実行します。
4. 更新が表示されたら、Obsidian の案内に従って更新します。

Tategaki の設定画面にある「更新の確認」ボタンは、GitHub Releases の公開情報を確認するための補助機能です。通常のアップデートは Obsidian のコミュニティプラグイン更新機能を使ってください。

## 旧版ユーザー向け注意（ID変更）

`1.2.2` から、プラグイン ID は `tategaki-plugin` から `tategaki` に変更されています。
古い手動インストール版や BRAT 版から移行する場合、Obsidian 上で別プラグインとして扱われることがあります。

必要に応じて次を確認してください。

- 旧プラグイン `tategaki-plugin` を無効化します。
- 新プラグイン `Tategaki`（ID: `tategaki`）を有効化します。
- 必要であれば設定を手動コピーします。
    - コピー元: `.obsidian/plugins/tategaki-plugin/data.json`
    - コピー先: `.obsidian/plugins/tategaki/data.json`
- 既存のホットキー割り当てを再確認します。
- 動作確認後、旧フォルダ `.obsidian/plugins/tategaki-plugin/` は削除できます。

## 手動インストール（通常は不要）

通常はコミュニティプラグインからインストールしてください。
検証目的などで手動インストールする場合のみ、GitHub Releases の 3 ファイルを使います。

必要なファイル:

- `main.js`
- `manifest.json`
- `styles.css`

手順:

1. Obsidian を終了します。
2. GitHub Releases から同じバージョンの `main.js` / `manifest.json` / `styles.css` をダウンロードします。
3. Vault フォルダを開きます。
4. Vault 内の `.obsidian/plugins/` を開きます（なければ作成します）。
5. `.obsidian/plugins/tategaki/` フォルダを作成します。
6. 3 ファイルを `.obsidian/plugins/tategaki/` に配置します。
7. Obsidian を起動し、`設定` → `コミュニティプラグイン` で `Tategaki` を有効化します。

手動インストールでは、ファイルの取り違えを避けるため、必ず同じ Release の 3 ファイルを使ってください。次回以降の Release では、Community Plugin Review の警告を避けるため zip は添付しません。

## BRAT について

Tategaki はコミュニティプラグインに登録済みのため、通常は BRAT を使う必要はありません。
開発版や検証版を試す場合だけ、BRAT で GitHub リポジトリを登録してください。

BRAT を使う場合のリポジトリ:

- `cat-left-paw/tategaki-plugin-release`
- `https://github.com/cat-left-paw/tategaki-plugin-release`

BRAT からコミュニティプラグイン版へ戻す場合は、BRAT 側の管理対象から Tategaki を外し、Obsidian のコミュニティプラグイン画面から通常版をインストールし直してください。

## OS別メモ（手動インストール時）

### Windows

- エクスプローラーで隠しファイル表示を有効化して `.obsidian` を表示してください。
- 「表示」→「隠しファイル」をオンにします。

### macOS

- Finder で `Cmd + Shift + .` を押すと `.obsidian` の表示を切り替えできます。

### Linux

- ファイルマネージャで `Ctrl + H` を押すと隠しファイル表示を切り替えできます。

## アンインストール

1. Obsidian の `設定` → `コミュニティプラグイン` で `Tategaki` を無効化します。
2. Obsidian の案内に従ってアンインストールします。
3. 必要に応じて次を削除します。

- `.obsidian/plugins/tategaki/`
- `<Vault設定フォルダ>/tategaki-sync-backups/`（互換モードのバックアップ。通常は `.obsidian/tategaki-sync-backups/`）
