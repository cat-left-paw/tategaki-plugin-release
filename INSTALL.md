# インストールガイド

このプラグインは **コミュニティプラグイン未登録**のため、Obsidian 内の「参照」から検索してインストールすることはできません。  
配布 Zip を展開し、Vault の `.obsidian/plugins/` に入れて使います。

このガイドでは、次の 2 通りの方法を説明します。

-   **簡易インストール（推奨）**: Vault フォルダを選ぶだけで自動コピー（`-installer.zip`）
-   **手動インストール**: うまくいかなかった場合の方法（全 OS 共通の確実ルート）

## 事前準備（共通）

1. Obsidian をいったん終了します（安全のため）。
2. 配布 Zip をダウンロードして展開します。
    - 通常 Zip: `tategaki-plugin-1.0.0.zip`
    - インストーラー同梱 Zip: `tategaki-plugin-1.0.0-installer.zip`
3. 展開した中に、`tategaki-plugin/` フォルダがあることを確認します。
    - `tategaki-plugin/main.js`
    - `tategaki-plugin/manifest.json`
    - `tategaki-plugin/styles.css`

`-installer.zip` の場合は、さらに OS 別フォルダが入っています。

-   `Windows/`（インストール/アンインストール）
-   `macOS/`（インストール/アンインストール）

---

## 簡易インストール（推奨 / -installer.zip）

展開したフォルダにあるインストーラーを実行し、Vault フォルダを選ぶだけでインストールできます。

※OS の安全機能により「未署名のスクリプト」などの警告が出ることがあります。強くブロックされて先に進めない場合は、この下の「手動インストール」を使ってください。

※簡易インストールは **Windows / macOS のみ**対応です。Linux は「手動インストール（Linux）」でインストールしてください。

スクリプトを使いたくない場合（または不安な場合）も、下の「手動インストール」で問題なくインストールできます。

このインストーラー（スクリプト）は、選択した Vault の `.obsidian/plugins/tategaki-plugin/` に、`tategaki-plugin/` フォルダ内のファイルを**コピーするだけ**のものです。

### Windows（簡易）

1. 展開したフォルダで `Windows/INSTALL.ps1` を右クリック
2. 「PowerShell で実行」を選びます
3. 表示されるダイアログで **Vault フォルダ** を選びます（`.obsidian` の外側）
4. 完了メッセージが出たら、下の「有効化」へ進みます

### macOS（簡易）

1. 展開したフォルダで `macOS/INSTALL.command` をダブルクリック  
   （実行できない場合は右クリック → 「開く」）
2. 表示されるダイアログで **Vault フォルダ** を選びます（`.obsidian` の外側）
3. 完了メッセージが出たら、下の「有効化」へ進みます

### Obsidian で有効化（共通）

1. Obsidian を起動します
2. 設定 → 「コミュニティプラグイン」へ進みます
3. 「セーフモード（制限モード）」がオンの場合はオフにします
4. 「インストール済みプラグイン」の一覧に `tategaki-plugin` が出てくるので、有効化します

うまくいかない場合は、いったん Obsidian を再起動してください。

---

## 手動インストール（簡易でうまくいかない場合）

ここからは、OS 別に「Vault フォルダを開く → `.obsidian` を見えるようにする → コピーする」までを詳しく書きます。スクリプトを使いたくない場合も、こちらを使ってください。

### Windows（手動）

#### 1) Vault フォルダを開く

1. Obsidian で対象の Vault を開きます
2. コマンドパレット（`Ctrl+P`）を開きます
3. 次のようなコマンドを実行します（表示名は環境で少し違います）
    - `Open vault folder` / `Reveal vault in system explorer`
    - 日本語 UI の場合: 「保管庫を…で開く」など

#### 2) `.obsidian` を見えるようにする（隠しファイル表示）

1. エクスプローラー上部の「表示」を開きます
2. 「隠しファイル」にチェックを入れます  
   （Windows 11 の場合: 「表示」→「表示」→「隠しファイル」）
3. Vault フォルダ内に `.obsidian` が見えるようになります

#### 3) プラグインをコピーする

1. Vault フォルダ内の `.obsidian/plugins/` を開きます（無ければ作成します）
2. そこへ、展開した `tategaki-plugin/` フォルダをコピーします  
   （結果として `.obsidian/plugins/tategaki-plugin/` になります）

#### 4) Obsidian で有効化する

上の「Obsidian で有効化（共通）」を実施してください。

### macOS（手動）

#### 1) Vault フォルダを開く

1. Obsidian で対象の Vault を開きます
2. コマンドパレット（`Cmd+P`）を開きます
3. 次のようなコマンドを実行します（表示名は環境で少し違います）
    - `Open vault folder` / `Reveal vault in system explorer`
    - 日本語 UI の場合: 「保管庫を…で開く」など

#### 2) `.obsidian` を見えるようにする（隠しファイル表示）

1. Finder で Vault フォルダを開きます
2. `Cmd + Shift + .`（ピリオド）を押します
3. `.obsidian` が表示されます（もう一度押すと非表示に戻ります）

#### 3) プラグインをコピーする

1. Vault フォルダ内の `.obsidian/plugins/` を開きます（無ければ作成します）
2. そこへ、展開した `tategaki-plugin/` フォルダをコピーします  
   （結果として `.obsidian/plugins/tategaki-plugin/` になります）

#### 4) Obsidian で有効化する

上の「Obsidian で有効化（共通）」を実施してください。

### Linux（手動）

#### 1) Vault フォルダを開く

1. Obsidian で対象の Vault を開きます
2. コマンドパレット（`Ctrl+P`）を開きます
3. 次のようなコマンドを実行します（表示名は環境で少し違います）
    - `Open vault folder` / `Reveal vault in system explorer`

#### 2) `.obsidian` を見えるようにする（隠しファイル表示）

ファイルマネージャで Vault フォルダを開き、次のいずれかを試してください。

-   `Ctrl + H`（多くの環境で「隠しファイル表示」の切替）
-   メニューから「隠しファイルを表示」相当の項目をオン

#### 3) プラグインをコピーする

1. Vault フォルダ内の `.obsidian/plugins/` を開きます（無ければ作成します）
2. そこへ、展開した `tategaki-plugin/` フォルダをコピーします  
   （結果として `.obsidian/plugins/tategaki-plugin/` になります）

#### 4) Obsidian で有効化する

上の「Obsidian で有効化（共通）」を実施してください。

## アップデート

新しいバージョンに更新するときは、基本的に次のどちらかです。

-   `-installer.zip` を使っている場合: インストーラーをもう一度実行して上書きする
-   手動の場合: `.obsidian/plugins/tategaki-plugin/` の中身を、新しいファイルで上書きする
-   いったん `.obsidian/plugins/tategaki-plugin/` を削除してから、同じ手順で入れ直す

更新後は Obsidian を再起動すると確実です。

## アンインストール（重要）

1. Obsidian の設定 → 「コミュニティプラグイン」から、このプラグインをオフにします
2. Obsidian を終了します
3. 次のいずれかで削除します
    - 簡易（`-installer.zip`）: `Windows/UNINSTALL.ps1` / `macOS/UNINSTALL.command`
    - 手動: Vault 内の `.obsidian/plugins/tategaki-plugin/` を削除

さらに、このプラグインは同期の安全策としてバックアップを作成しています。不要であれば次も削除してください。

-   `.obsidian/tategaki-sync-backups/`

※バックアップフォルダには、同期前後の内容が保存されていることがあります。必要な場合は削除前に退避してください。

補足: 設定画面（またはコマンド）から「同期バックアップをゴミ箱へ移動」を実行して消すこともできます（OS のゴミ箱、または Vault 直下の `.trash` に移動します）。

## モバイル（Android / iOS）について（注意）

-   スマホの小さい画面では編集が難しいため、基本はタブレット（できれば外部キーボードとマウス）を推奨します
-   iOS は実機未テストです（動作する可能性はありますが保証できません）

モバイルでの手動インストールは、ファイルアプリ/ファイルマネージャの仕様で **`.obsidian` が見えない**場合があります。  
その場合は、PC でインストールしてから同期（iCloud/Dropbox/Syncthing 等）する方法が確実です。

また、Google Drive などの一部の外部ストレージ/同期方法では、`.obsidian` のような隠しフォルダや `plugins` フォルダが同期対象から外れることがあり、プラグインがモバイル側に反映されない場合があります。  
その場合は、Obsidian Sync や、`.obsidian` まで確実に同期できる方法（例: iCloud/Dropbox/Syncthing 等）を検討してください。
