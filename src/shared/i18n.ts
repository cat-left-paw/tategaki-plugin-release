export type Locale = "ja" | "en";

const jaDict = {
	"common.cancel": "キャンセル",
	"common.ok": "OK",
	"common.open": "開く",
	"common.move": "移動",
	"common.save": "保存",
	"common.cut": "切り取り",
	"common.copy": "コピー",
	"common.paste": "貼り付け",
	"common.selectAll": "すべて選択",
	"common.discard": "破棄",
	"common.delete": "削除",
	"common.confirmation": "確認",
	"common.displaySettings": "表示設定",
	"common.close": "閉じる",
	"common.loading": "読み込み中…",

	"command.openView": "縦書きビューを開く",
	"command.listMoveUp": "リスト項目を上へ移動",
	"command.listMoveDown": "リスト項目を下へ移動",
	"toolbar.writingMode.toggle": "書字方向切り替え",
	"toolbar.writingMode.toHorizontal": "横書きに切り替え",
	"toolbar.writingMode.toVertical": "縦書きに切り替え",
	"toolbar.fileSwitch": "ファイル切替",
	"toolbar.readingMode.enter": "書籍モードへ移動",
	"toolbar.readingMode.exit": "書籍モードを終了",
	"toolbar.undo": "元に戻す",
	"toolbar.redo": "やり直す",
	"toolbar.bold": "太字",
	"toolbar.italic": "斜体",
	"toolbar.strikethrough": "取り消し線",
	"toolbar.underline": "下線",
	"toolbar.highlight": "ハイライト",
	"toolbar.inlineCode": "インラインコード",
	"toolbar.heading": "見出し",
	"toolbar.heading.level": "見出し{level}",
	"toolbar.heading.clear": "見出し解除",
	"toolbar.bulletList": "箇条書きリスト",
	"toolbar.taskList": "チェックリスト",
	"toolbar.orderedList": "番号付きリスト",
	"toolbar.blockquote": "引用",
	"toolbar.codeBlock": "コードブロック",
	"toolbar.linkInsert": "リンク挿入",
	"toolbar.rubyInsert": "ルビ挿入",
	"toolbar.tcyInsert": "縦中横",
	"toolbar.tcyClear": "縦中横解除",
	"toolbar.horizontalRule": "区切り線",
	"toolbar.clearFormatting": "書式クリア",
	"toolbar.ruby.toggle": "ルビ表示のオン/オフ",
	"toolbar.ruby.enable": "ルビ表示をオンにする",
	"toolbar.ruby.disable": "ルビ表示をオフにする",
	"toolbar.plainText.toggle": "全文プレーン表示",
	"toolbar.plainText.enable": "全文プレーン表示をオンにする",
	"toolbar.plainText.disable": "全文プレーン表示をオフにする",
	"toolbar.source.toggle": "ソーステキスト編集",
	"toolbar.source.enable": "ソーステキスト編集モード",
	"toolbar.source.disable": "装飾表示に戻す",
	"toolbar.ceIme.toggle": "CE補助(IME)",
	"toolbar.ceIme.enable": "CE補助(IME)をオンにする",
	"toolbar.ceIme.disable": "CE補助(IME)をオフにする",
	"toolbar.outline": "アウトライン",
	"toolbar.findReplace": "検索・置換",
	"toolbar.readingMode.pagination": "書籍モード（ページネーション）",
	"toolbar.auxiliary.toggle": "補助入力パネル",
	"toolbar.auxiliary.enable": "補助入力パネルをオンにする",
	"toolbar.auxiliary.disable": "補助入力パネルをオフにする",
	"toolbar.syncMode.manualToAuto":
		"手動同期モード（クリックで自動同期に切替）",
	"toolbar.syncMode.autoToManual":
		"自動同期モード（クリックで手動同期に切替）",
	"toolbar.status.saved": "保存済み",
	"toolbar.status.saving": "保存中...",
	"toolbar.status.syncError": "同期エラー",
	"toolbar.status.unsaved": "未保存",
	"toolbar.sync.saveShortcut": "保存 ({shortcut})",
	"toolbar.reading.return": "戻る",
	"toolbar.reading.returnTo": "{view}へ戻る",
	"reading.returnLabel.sot": "SoT編集ビュー",
	"reading.returnLabel.compat": "互換モード",
	"view.reading.display": "Tategaki 書籍",
	"view.reading.displayWithTitle": "Tategaki 書籍: - {title} -",
	"badge.mode.reading": "書籍",
	"badge.mode.compat": "互換",
	"badge.pairedMarkdown.short": "縦",
	"badge.pairedMarkdown.title": "Tategaki編集中",
	"outline.title": "アウトライン",
	"outline.empty": "見出しがありません",
	"outline.untitledHeading": "（無題）",
	"heading.toggle.expand": "見出しを展開",
	"heading.toggle.collapse": "見出しを折りたたむ",
	"task.checked": "完了",
	"task.unchecked": "未完了",

	"plugin.syncBackupTrash.title": "同期バックアップをゴミ箱へ移動",
	"plugin.syncBackupTrash.message":
		"同期バックアップをゴミ箱へ移動しますか？\n\n移動すると、バックアップからの復元はできなくなります。",
	"plugin.syncBackupTrash.confirm": "移動する",
	"plugin.notice.syncBackup.none": "同期バックアップは見つかりませんでした。",
	"plugin.notice.syncBackup.movedSystem":
		"同期バックアップをゴミ箱へ移動しました。",
	"plugin.notice.syncBackup.movedDotTrash":
		"同期バックアップを .trash に移動しました。",
	"plugin.notice.syncBackup.moveFailed":
		"同期バックアップの移動に失敗しました。",
	"plugin.notice.backup.desktopOnly":
		"バックアップフォルダを開くにはデスクトップ版が必要です。",
	"plugin.notice.backup.notFound":
		"同期バックアップフォルダが見つかりませんでした。",
	"plugin.notice.backup.openFailed":
		"バックアップフォルダを開けませんでした。",

	"settings.section.main": "Tategaki設定",
	"settings.compatMode.name": "互換モード（旧エディタ）",
	"settings.compatMode.desc":
		"互換ビューと同期機能を有効化します。オフにすると互換用の同期/バックアップ設定を非表示にします",
	"settings.showModeDialog.name": "ビュー起動時にモード選択を表示",
	"settings.showModeDialog.desc":
		"縦書きビューを開くときに、執筆モード/参照モードを選択するダイアログを表示します",
	"settings.section.syncAndUpdateCompat": "同期と更新（互換モード専用）",
	"settings.updateInterval.name": "外部同期の更新間隔(ms)",
	"settings.updateInterval.desc":
		"カーソル同期や追従時のポーリング間隔です。0=リアルタイム（高負荷の可能性）。値を大きくするほど負荷は軽くなります",
	"settings.syncMode.name": "同期モード",
	"settings.syncMode.desc":
		"自動: 編集時に自動保存、手動: 同期ボタンで保存します（縦書きエディタ）",
	"settings.syncMode.auto": "自動同期",
	"settings.syncMode.manual": "手動同期",
	"settings.syncBackupCreate.name": "同期バックアップを作成",
	"settings.syncBackupCreate.desc":
		"互換モードの同期時にバックアップを作成します。無効にするとバックアップは作成されません（事故時は Obsidian の「ファイル履歴」を利用してください）。",
	"settings.syncBackupOpen.name": "同期バックアップフォルダを開く",
	"settings.syncBackupOpen.desc": "バックアップ保存先フォルダを開きます。",
	"settings.syncBackupMove.name": "同期バックアップをゴミ箱へ移動",
	"settings.syncBackupMove.desc":
		"同期の安全策として作成されたバックアップをゴミ箱へ移動します（復元できなくなるので注意）",
	"settings.appCloseAction.name": "アプリ終了時の未保存変更",
	"settings.appCloseAction.desc":
		"未保存の変更がある場合に、終了時に保存するか破棄するかを選びます",
	"settings.appCloseAction.save": "保存して終了",
	"settings.appCloseAction.discard": "破棄して終了",
	"settings.syncCursor.name": "カーソル同期",
	"settings.syncCursor.desc":
		"標準エディタでアクティブなカーソル位置を縦書きエディタにも反映します",
	"settings.section.update": "アップデート",
	"settings.manualUpdate.name": "手動でアップデートを確認",
	"settings.manualUpdate.desc":
		"ボタンを押したときだけ通信して、公開URL上の最新版情報を確認します",
	"settings.manualUpdate.button": "更新の確認",
	"settings.notice.update.invalidResponse":
		"更新情報を取得できませんでした（latest.jsonの形式を確認してください）。",
	"settings.notice.update.latest":
		"Tategakiエディタは最新です（現在: {current}）。",
	"settings.notice.update.compareUnavailableWithUrl":
		"更新情報を取得しました（公開: {latest} / 現在: {current}）。バージョン比較ができないため、Releases を確認してください: {url}",
	"settings.notice.update.compareUnavailableNoUrl":
		"更新情報を取得しました（公開: {latest} / 現在: {current}）。バージョン比較ができないため、Releases を確認してください。",
	"settings.notice.update.currentNewer":
		"現在のほうが新しいバージョンです（現在: {current} / 公開: {latest}）。",
	"settings.notice.update.newVersionWithUrl":
		"新しいバージョン {latest} が利用可能です（現在: {current}）。ダウンロード: {url}",
	"settings.notice.update.newVersionNoUrl":
		"新しいバージョン {latest} が利用可能です（現在: {current}）。",
	"settings.notice.update.failed":
		"更新確認に失敗しました。通信状況と更新URLを確認してください。",
	"settings.releasePage": "リリースページ",
	"settings.notice.linkOpenFailed": "リンクを開けませんでした。",
	"settings.section.support": "サポート",
	"settings.supportDonation.name": "サポート（寄付）",
	"settings.supportDonation.desc":
		"このプラグインを気に入っていただけたらサポートをしていただくと幸いです（任意）",
	"settings.section.theme": "テーマ管理",
	"settings.theme.obsidianBase.name": "Obsidian ベーステーマ",
	"settings.theme.obsidianBase.desc":
		"Obsidianで適用されているテーマをベースとしたテーマです",
	"settings.theme.unknown": "未知のテーマ",
	"settings.theme.current": "現在のテーマ: {themeName}",
	"settings.theme.saved": "保存されているテーマ",
	"settings.theme.sameAsBody": "本文と同じ",
	"settings.theme.preview": "{fontFamily} | {fontSize}px | 行間{lineHeight}",
	"settings.theme.previewHeading": "見出し: {headingFont} | {headingColor}",
	"settings.theme.apply": "適用",
	"settings.theme.inUse": "使用中",
	"settings.notice.themeApplyFailed": "テーマの適用に失敗しました。",
	"settings.theme.deleteTitle": "テーマの削除",
	"settings.theme.deleteMessage":
		"テーマ「{themeName}」を削除しますか？この操作は元に戻せません。",
	"settings.notice.themeDeleteFailed": "テーマの削除に失敗しました。",
	"settings.theme.usage.name": "テーマの使用方法",
	"settings.theme.usage.desc":
		"設定パネルで見た目を調整した後、「現在の設定をテーマとして保存」ボタンから新しいテーマとして保存できます。保存されたテーマはここで管理できます。",
	"theme.userCreatedDescription": "ユーザー作成テーマ",

	"modal.viewMode.title": "Tategakiエディタを開く",
	"modal.viewMode.prompt": "表示モードを選択してください。",
	"modal.viewMode.edit.title": "執筆・参照モード",
	"modal.viewMode.edit.desc": "SoTビューで編集・参照を行います。",
	"modal.viewMode.reading.title": "書籍モード",
	"modal.viewMode.reading.desc":
		"縦書き読書モードで、ページめくりスタイルで閲覧します。",
	"modal.viewMode.compat.title": "互換モード（旧TipTap）",
	"modal.viewMode.compat.desc": "旧TipTapベースの互換ビューで編集します。",
	"modal.viewMode.placement.right": "右側に開く",
	"modal.viewMode.placement.tab": "隣のタブに開く",
	"modal.viewMode.placement.window": "新規ウィンドウで開く",

	"modal.viewAlreadyOpen.title": "縦書きビューは既に開かれています",
	"modal.viewAlreadyOpen.desc":
		"既に縦書きビュー（執筆モード、参照モード、または書籍モード）が開かれています。新しいビューを開くには、既存のビューを閉じてください。",

	"modal.unsupportedHtml.title": "未対応HTMLタグの検出",
	"modal.unsupportedHtml.desc":
		"未対応のHTMLタグが含まれているため、そのまま編集すると失われる可能性があります。",
	"modal.unsupportedHtml.detectedTags": "検出されたタグ: {tags}",
	"modal.unsupportedHtml.readOnly": "読み取り専用で開く",
	"modal.unsupportedHtml.discard": "破棄して開く",

	"modal.unsavedChanges.defaultMessage": "未保存の変更があります。",
	"modal.unsavedChanges.closeTabPrompt":
		"未保存の変更があります。タブを閉じる前に保存しますか？",
	"modal.unsavedChanges.title": "未保存の変更",
	"modal.settingsPanel.title": "表示設定",
	"modal.newNote.title": "新規ノートを作成",
	"modal.newNote.desc": "ファイル名を入力してください（.md は省略可）",
	"modal.newNote.destination": "作成先: {folder}",
	"modal.newNote.placeholder": "新規ノート名",
	"modal.newNote.create": "作成",
	"modal.fileSwitch.placeholder": "切り替えるファイルを選択",
	"modal.fileSwitch.createNew": "新規ノートを作成",
	"modal.linkInput.title": "リンクの挿入",
	"modal.linkInput.urlLabel": "URL",
	"modal.linkInput.textLabel": "リンクテキスト",
	"modal.linkInput.textPlaceholder": "リンクのテキスト",
	"modal.linkInput.insert": "挿入",
	"modal.rubyInput.title": "ルビの挿入",
	"modal.rubyInput.targetLabel": "対象テキスト:",
	"modal.rubyInput.rubyLabel": "ルビ:",
	"modal.rubyInput.rubyPlaceholder": "ふりがな",
	"modal.rubyInput.emphasisLabel": "傍点:",
	"modal.rubyInput.emphasisNone": "使用しない",
	"modal.rubyInput.customPlaceholder": "傍点用文字を1文字入力",
	"modal.rubyInput.customAdd": "登録",
	"modal.rubyInput.customRemove": "選択を削除",
	"modal.rubyInput.customInvalid":
		"傍点として登録する1文字を入力してください。",
	"modal.rubyInput.customRemoveNotFound":
		"削除する登録傍点を選択してください。",
	"modal.rubyInput.customRemoveDefault":
		"標準候補は削除できません。",
	"modal.rubyInput.customRemoved": "登録傍点を削除しました。",
	"modal.rubyInput.emphasisNote":
		"※ 傍点文字（﹅/﹆/⚬など）はフォント・OSにより見え方が変わる場合があります。",
	"modal.rubyInput.insert": "挿入",

	"modal.fileSwitch.title": "未保存の変更があります",
	"modal.fileSwitch.heading": "ファイルを切り替えようとしています",
	"modal.fileSwitch.detail":
		"現在のファイルに未保存の変更があります。変更を保存しますか？",
	"modal.fileSwitch.currentFile": "現在のファイル:",
	"modal.fileSwitch.unsaved": "●未保存",
	"modal.fileSwitch.nextFile": "切り替え先:",
	"modal.fileSwitch.choose": "次のいずれかを選択してください：",
	"modal.fileSwitch.option.save": "保存して切り替え:",
	"modal.fileSwitch.option.saveDesc":
		"現在の変更を保存してから新しいファイルを開きます",
	"modal.fileSwitch.option.discard": "破棄して切り替え:",
	"modal.fileSwitch.option.discardDesc":
		"変更を破棄して新しいファイルを開きます",
	"modal.fileSwitch.option.cancel": "キャンセル:",
	"modal.fileSwitch.option.cancelDesc": "ファイル切り替えをキャンセルします",
	"modal.fileSwitch.button.discardAndSwitch": "破棄して切り替え",
	"modal.fileSwitch.button.saveAndSwitch": "保存して切り替え",

	"modal.conflict.title": "ファイル競合の解決",
	"modal.conflict.file": "ファイル: {filePath}",
	"modal.conflict.desc":
		"このファイルが外部で変更されましたが、未保存の編集内容があります。保存方法を選択してください。",
	"modal.conflict.overwrite": "現在の内容で上書き保存",
	"modal.conflict.acceptExternal": "外部変更を取り込む",
	"modal.conflict.keepBoth": "両方のバージョンを保存",

	"context.notice.copyFailed": "コピーに失敗しました。",
	"context.notice.cutFailed": "切り取りに失敗しました。",
	"context.notice.pasteFailed":
		"貼り付けに失敗しました。ブラウザの権限設定を確認してください。",
	"context.notice.findReplaceNotImplemented": "検索・置換は未実装です。",
	"search.placeholder": "検索...",
	"search.prev": "前を検索",
	"search.next": "次を検索",
	"search.close": "閉じる",
	"search.replacePlaceholder": "置換...",
	"search.replaceOne": "置換",
	"search.replaceAll": "全置換",
	"search.caseSensitive": "大文字小文字区別",
	"search.noMatch": "マッチなし",
	"aux.placeholder": "入力して Enter で挿入、Shift+Enter で改行...",
	"aux.insert": "挿入",
	"link.defaultText": "リンクテキスト",
	"widget.math.parseFailed": "数式ブロックの解析に失敗しました。",
	"widget.math.rendering": "数式をレンダリング中…",
	"widget.math.rangeInvalid": "数式ブロック範囲が不正です。",
	"widget.math.renderFailed": "数式のレンダリングに失敗しました。",
	"widget.callout.parseFailed": "コールアウトの解析に失敗しました。",
	"widget.callout.rendering": "コールアウトをレンダリング中…",
	"widget.callout.renderFailed": "コールアウトのレンダリングに失敗しました。",
	"widget.table.parseFailed": "テーブルの解析に失敗しました。",
	"widget.table.rendering": "テーブルをレンダリング中…",
	"widget.table.renderFailed": "テーブルのレンダリングに失敗しました。",
	"widget.deflist.parseFailed": "定義リストの解析に失敗しました。",
	"widget.deflist.rendering": "定義リストをレンダリング中…",
	"widget.deflist.renderFailed": "定義リストのレンダリングに失敗しました。",
	"widget.embed.loading": "埋め込みを読み込み中…",
	"widget.embed.empty": "埋め込み先が空です。",
	"widget.embed.invalidFormat": "埋め込みの形式が不正です: {target}",
	"widget.embed.notFound": "埋め込み先が見つかりません: {linkpath}",
	"widget.embed.headingNotFound": "見出しが見つかりません: {heading}",
	"widget.embed.blockNotFound": "ブロックが見つかりません: {blockId}",
	"widget.embed.renderFailed": "埋め込みのレンダリングに失敗しました。",
	"notice.compatMode.disabled":
		"互換モードが無効です。設定で有効化してください。",
	"notice.writingMode.toggleFailed": "書字方向の切り替えに失敗しました。",
	"notice.displaySettings.switchingTo":
		"表示設定を開くため、{view}へ切り替えます。",
	"notice.targetFileNotFound": "対象ファイルが見つかりません。",
	"notice.targetFileNotFoundAlt": "対象のファイルが見つかりません。",
	"notice.switchableFilesNotFound": "切り替え可能なファイルが見つかりません。",
	"notice.fileNameRequired": "ファイル名を入力してください。",
	"notice.openExistingNote": "既存ノートを開きます。",
	"notice.createFolderFailed": "フォルダの作成に失敗しました。",
	"notice.invalidFolderName": "フォルダ名が不正です。",
	"notice.createNoteFailed": "新規ノートの作成に失敗しました。",
	"notice.fileAlreadyDisplayed": "既に表示中のファイルです。",
	"notice.markdownViewMissingClose":
		"Markdown ビューが見つからないため閉じます。",
	"notice.markdownViewMissingExecute":
		"Markdown ビューが見つからないため実行できません。",
	"notice.markdownPairMissingSwitch":
		"ペアの Markdown ビューが見つからないため切り替えできません。",
	"notice.fileSwitchFailed": "ファイル切り替えに失敗しました。",
	"notice.markdownPairMismatchClose":
		"ペアの Markdown ビューが対象ファイルと一致しないため閉じます。",
	"notice.layoutChanged.switchedTo":
		"レイアウト変更を検出したため、{view}へ切り替えました。",
	"notice.layoutChanged.readingClosed":
		"レイアウト変更を検出したため、書籍モードを終了しました。",
	"notice.readOnly.sourceEditUnavailable":
		"読み取り専用ではソーステキスト編集は使用できません。",
	"notice.readOnly.syncModeUnavailable":
		"読み取り専用では同期モードは変更できません。",
	"notice.readOnly.saveUnavailable": "読み取り専用では保存できません。",
	"notice.readOnly.auxiliaryUnavailable":
		"読み取り専用では補助入力パネルは使用できません。",
	"notice.auxiliary.toggleFailed": "補助入力パネルの切り替えに失敗しました。",
	"notice.syncMode.switched.manual": "手動同期モードに切り替えました。",
	"notice.syncMode.switched.auto": "自動同期モードに切り替えました。",
	"notice.syncMode.toggleFailed": "同期モードの切り替えに失敗しました。",
	"notice.ruby.enabled": "ルビ表示をオンにしました。",
	"notice.ruby.disabled": "ルビ表示をオフにしました。",
	"notice.ruby.toggleFailed": "ルビ表示の切り替えに失敗しました。",
	"notice.ruby.singleLineOnly": "ルビは1行内の選択のみ対応しています。",
	"notice.customEmphasis.saveFailed": "傍点候補の保存に失敗しました。",
	"notice.bookMode.opened": "書籍モードビューを開きました。",
	"notice.bookMode.closed": "書籍モードビューを閉じました。",
	"notice.outline.openFailed": "アウトラインを開けませんでした。",
	"notice.sourceEdit.unavailableInPlainText":
		"全文プレーン表示中はソーステキスト編集を使えません。",
	"notice.ceIme.suspended":
		"CE補助モードを一時停止しました ({reason})",
	"notice.ceIme.reason.selectionRestoreFailed": "選択の復元に失敗",
	"notice.ceIme.reason.externalUpdated": "外部更新を検知",
	"notice.ceIme.reason.caretVerification": "キャレット整合性チェック",
	"notice.tcy.invalidSelection":
		"縦中横は半角英数字/!? の2〜4文字のみ対応です。",
	"notice.unsupported.readOnlyOpened":
		"未対応タグがあるため読み取り専用で開きました。",
	"notice.unsupported.backupFailed":
		"未対応タグのバックアップ作成に失敗しました。",
	"notice.sync.noFileOpen": "同期するファイルが開かれていません。",
	"notice.sync.fileSaved": "ファイルを保存しました。",
	"notice.sync.readBeforeSaveFailed": "保存前の読み取りに失敗しました。",
	"notice.sync.backupCreateFailedContinue":
		"バックアップの作成に失敗しました（保存は続行します）。",
	"notice.sync.readBackFailedBackedUp":
		"保存後の読み戻し検証に失敗しました（バックアップ済み）。",
	"notice.sync.readBackFailed": "保存後の読み戻し検証に失敗しました。",
	"notice.sync.mismatchBackedUp":
		"同期に失敗した可能性があります（読み戻し不一致）。バックアップ済みです。",
	"notice.sync.rollbackDone": "安全のため同期前の内容へロールバックしました。",
	"notice.sync.rollbackFailedRestore":
		"ロールバックに失敗しました。バックアップから復元してください。",
	"notice.sync.rollbackDueToMismatch":
		"読み戻し不一致のためロールバックしました。",
	"notice.sync.saveFailed": "ファイルの保存に失敗しました。",
	"notice.sync.loadFailed": "ファイルの読み込みに失敗しました。",
	"notice.sync.conflictCancelled": "競合解決がキャンセルされました。",
	"notice.sync.conflictOverwriteSaved": "現在の内容で上書き保存しました。",
	"notice.sync.conflictAcceptedExternal": "外部変更を取り込みました。",
	"notice.sync.conflictResolutionFailed":
		"競合解決処理でエラーが発生しました。",
	"notice.sync.conflictCopyLabel": "競合コピー",
	"notice.sync.keepBothApplied":
		"現在の内容を「{copyName}」として保存し、外部変更を反映しました。",
	"notice.sync.fileSwitchActionFailed":
		"ファイル切り替え処理でエラーが発生しました。",
	"notice.sync.switchedAfterSave":
		"変更を保存してファイルを切り替えました。",
	"notice.sync.switchedAfterDiscard":
		"変更を破棄してファイルを切り替えました。",
} as const;

type I18nKey = keyof typeof jaDict;

const enDict: Record<I18nKey, string> = {
	"common.cancel": "Cancel",
	"common.ok": "OK",
	"common.open": "Open",
	"common.move": "Move",
	"common.save": "Save",
	"common.cut": "Cut",
	"common.copy": "Copy",
	"common.paste": "Paste",
	"common.selectAll": "Select all",
	"common.discard": "Discard",
	"common.delete": "Delete",
	"common.confirmation": "Confirmation",
	"common.displaySettings": "Display settings",
	"common.close": "Close",
	"common.loading": "Loading...",

	"command.openView": "Open vertical writing view",
	"command.listMoveUp": "Move list item up",
	"command.listMoveDown": "Move list item down",
	"toolbar.writingMode.toggle": "Toggle writing direction",
	"toolbar.writingMode.toHorizontal": "Switch to horizontal writing",
	"toolbar.writingMode.toVertical": "Switch to vertical writing",
	"toolbar.fileSwitch": "Switch file",
	"toolbar.readingMode.enter": "Enter book mode",
	"toolbar.readingMode.exit": "Exit book mode",
	"toolbar.undo": "Undo",
	"toolbar.redo": "Redo",
	"toolbar.bold": "Bold",
	"toolbar.italic": "Italic",
	"toolbar.strikethrough": "Strikethrough",
	"toolbar.underline": "Underline",
	"toolbar.highlight": "Highlight",
	"toolbar.inlineCode": "Inline code",
	"toolbar.heading": "Heading",
	"toolbar.heading.level": "Heading {level}",
	"toolbar.heading.clear": "Clear heading",
	"toolbar.bulletList": "Bulleted list",
	"toolbar.taskList": "Checklist",
	"toolbar.orderedList": "Numbered list",
	"toolbar.blockquote": "Blockquote",
	"toolbar.codeBlock": "Code block",
	"toolbar.linkInsert": "Insert link",
	"toolbar.rubyInsert": "Insert ruby",
	"toolbar.tcyInsert": "Apply TCY",
	"toolbar.tcyClear": "Clear TCY",
	"toolbar.horizontalRule": "Horizontal rule",
	"toolbar.clearFormatting": "Clear formatting",
	"toolbar.ruby.toggle": "Toggle ruby display",
	"toolbar.ruby.enable": "Enable ruby display",
	"toolbar.ruby.disable": "Disable ruby display",
	"toolbar.plainText.toggle": "Full plain-text view",
	"toolbar.plainText.enable": "Enable full plain-text view",
	"toolbar.plainText.disable": "Disable full plain-text view",
	"toolbar.source.toggle": "Source text editing",
	"toolbar.source.enable": "Source text editing mode",
	"toolbar.source.disable": "Return to formatted view",
	"toolbar.ceIme.toggle": "CE assist (IME)",
	"toolbar.ceIme.enable": "Enable CE assist (IME)",
	"toolbar.ceIme.disable": "Disable CE assist (IME)",
	"toolbar.outline": "Outline",
	"toolbar.findReplace": "Find and replace",
	"toolbar.readingMode.pagination": "Book mode (pagination)",
	"toolbar.auxiliary.toggle": "Auxiliary input panel",
	"toolbar.auxiliary.enable": "Enable auxiliary input panel",
	"toolbar.auxiliary.disable": "Disable auxiliary input panel",
	"toolbar.syncMode.manualToAuto":
		"Manual sync mode (click to switch to auto sync)",
	"toolbar.syncMode.autoToManual":
		"Auto sync mode (click to switch to manual sync)",
	"toolbar.status.saved": "Saved",
	"toolbar.status.saving": "Saving...",
	"toolbar.status.syncError": "Sync error",
	"toolbar.status.unsaved": "Unsaved",
	"toolbar.sync.saveShortcut": "Save ({shortcut})",
	"toolbar.reading.return": "Back",
	"toolbar.reading.returnTo": "Back to {view}",
	"reading.returnLabel.sot": "SoT editor view",
	"reading.returnLabel.compat": "Compatibility mode",
	"view.reading.display": "Tategaki Book",
	"view.reading.displayWithTitle": "Tategaki Book: - {title} -",
	"badge.mode.reading": "Book",
	"badge.mode.compat": "Compat",
	"badge.pairedMarkdown.short": "V",
	"badge.pairedMarkdown.title": "Editing in Tategaki",
	"outline.title": "Outline",
	"outline.empty": "No headings found",
	"outline.untitledHeading": "(Untitled)",
	"heading.toggle.expand": "Expand heading",
	"heading.toggle.collapse": "Collapse heading",
	"task.checked": "Completed",
	"task.unchecked": "Not completed",

	"plugin.syncBackupTrash.title": "Move sync backups to trash",
	"plugin.syncBackupTrash.message":
		"Move sync backups to trash?\n\nAfter moving, you will no longer be able to restore from those backups.",
	"plugin.syncBackupTrash.confirm": "Move",
	"plugin.notice.syncBackup.none": "No sync backups were found.",
	"plugin.notice.syncBackup.movedSystem":
		"Sync backups were moved to the trash.",
	"plugin.notice.syncBackup.movedDotTrash":
		"Sync backups were moved to .trash.",
	"plugin.notice.syncBackup.moveFailed": "Failed to move sync backups.",
	"plugin.notice.backup.desktopOnly":
		"Desktop app is required to open the backup folder.",
	"plugin.notice.backup.notFound": "Sync backup folder was not found.",
	"plugin.notice.backup.openFailed": "Failed to open the backup folder.",

	"settings.section.main": "Tategaki Settings",
	"settings.compatMode.name": "Compatibility mode (legacy editor)",
	"settings.compatMode.desc":
		"Enable the compatibility view and sync features. Turning this off hides compatibility sync/backup settings.",
	"settings.showModeDialog.name": "Show mode selection when opening view",
	"settings.showModeDialog.desc":
		"Show a dialog to choose writing/reading mode when opening the vertical writing view.",
	"settings.section.syncAndUpdateCompat":
		"Sync and Updates (compatibility mode only)",
	"settings.updateInterval.name": "External sync update interval (ms)",
	"settings.updateInterval.desc":
		"Polling interval for cursor sync/follow behavior. 0 = real-time (may increase load). Larger values reduce load.",
	"settings.syncMode.name": "Sync mode",
	"settings.syncMode.desc":
		"Auto: saves automatically while editing. Manual: saves only when you click the sync button (vertical editor).",
	"settings.syncMode.auto": "Auto sync",
	"settings.syncMode.manual": "Manual sync",
	"settings.syncBackupCreate.name": "Create sync backups",
	"settings.syncBackupCreate.desc":
		"Create backups when syncing in compatibility mode. If disabled, backups are not created (use Obsidian File Recovery if needed).",
	"settings.syncBackupOpen.name": "Open sync backup folder",
	"settings.syncBackupOpen.desc": "Open the folder where backups are stored.",
	"settings.syncBackupMove.name": "Move sync backups to trash",
	"settings.syncBackupMove.desc":
		"Move safety backups created during sync to the trash (cannot be restored afterward).",
	"settings.appCloseAction.name": "Unsaved changes on app close",
	"settings.appCloseAction.desc":
		"Choose whether to save or discard when unsaved changes exist on exit.",
	"settings.appCloseAction.save": "Save and exit",
	"settings.appCloseAction.discard": "Discard and exit",
	"settings.syncCursor.name": "Cursor sync",
	"settings.syncCursor.desc":
		"Reflect cursor position from the standard editor in the vertical editor.",
	"settings.section.update": "Updates",
	"settings.manualUpdate.name": "Check for updates manually",
	"settings.manualUpdate.desc":
		"Only contacts the network when the button is pressed, and checks latest version info from the public URL.",
	"settings.manualUpdate.button": "Check updates",
	"settings.notice.update.invalidResponse":
		"Could not get update info (check latest.json format).",
	"settings.notice.update.latest":
		"Tategaki editor is up to date (current: {current}).",
	"settings.notice.update.compareUnavailableWithUrl":
		"Update info received (published: {latest} / current: {current}). Could not compare versions, please check Releases: {url}",
	"settings.notice.update.compareUnavailableNoUrl":
		"Update info received (published: {latest} / current: {current}). Could not compare versions, please check Releases.",
	"settings.notice.update.currentNewer":
		"Current version is newer (current: {current} / published: {latest}).",
	"settings.notice.update.newVersionWithUrl":
		"New version {latest} is available (current: {current}). Download: {url}",
	"settings.notice.update.newVersionNoUrl":
		"New version {latest} is available (current: {current}).",
	"settings.notice.update.failed":
		"Failed to check updates. Check your network and update URL.",
	"settings.releasePage": "Releases",
	"settings.notice.linkOpenFailed": "Failed to open link.",
	"settings.section.support": "Support",
	"settings.supportDonation.name": "Support (donation)",
	"settings.supportDonation.desc":
		"If you enjoy this plugin, your support is appreciated (optional).",
	"settings.section.theme": "Theme Management",
	"settings.theme.obsidianBase.name": "Obsidian Base Theme",
	"settings.theme.obsidianBase.desc":
		"A theme based on the currently applied Obsidian theme.",
	"settings.theme.unknown": "Unknown theme",
	"settings.theme.current": "Current theme: {themeName}",
	"settings.theme.saved": "Saved themes",
	"settings.theme.sameAsBody": "Same as body",
	"settings.theme.preview":
		"{fontFamily} | {fontSize}px | Line height {lineHeight}",
	"settings.theme.previewHeading": "Heading: {headingFont} | {headingColor}",
	"settings.theme.apply": "Apply",
	"settings.theme.inUse": "In use",
	"settings.notice.themeApplyFailed": "Failed to apply theme.",
	"settings.theme.deleteTitle": "Delete theme",
	"settings.theme.deleteMessage":
		'Delete theme "{themeName}"? This action cannot be undone.',
	"settings.notice.themeDeleteFailed": "Failed to delete theme.",
	"settings.theme.usage.name": "How to use themes",
	"settings.theme.usage.desc":
		'After adjusting appearance in the settings panel, save it as a new theme with "Save current settings as theme". Saved themes are managed here.',
	"theme.userCreatedDescription": "User theme",

	"modal.viewMode.title": "Open Tategaki Editor",
	"modal.viewMode.prompt": "Select a display mode.",
	"modal.viewMode.edit.title": "Writing/Reading mode",
	"modal.viewMode.edit.desc": "Edit/read in the SoT view.",
	"modal.viewMode.reading.title": "Book mode",
	"modal.viewMode.reading.desc":
		"Browse in vertical reading mode with page-turn style navigation.",
	"modal.viewMode.compat.title": "Compatibility mode (legacy TipTap)",
	"modal.viewMode.compat.desc":
		"Edit in the legacy TipTap-based compatibility view.",
	"modal.viewMode.placement.right": "Open on the right",
	"modal.viewMode.placement.tab": "Open in adjacent tab",
	"modal.viewMode.placement.window": "Open in new window",

	"modal.viewAlreadyOpen.title": "Vertical writing view is already open",
	"modal.viewAlreadyOpen.desc":
		"A vertical writing view (writing mode, reading mode, or book mode) is already open. Close the existing view before opening a new one.",

	"modal.unsupportedHtml.title": "Unsupported HTML tags detected",
	"modal.unsupportedHtml.desc":
		"This note contains unsupported HTML tags. Editing as-is may cause data loss.",
	"modal.unsupportedHtml.detectedTags": "Detected tags: {tags}",
	"modal.unsupportedHtml.readOnly": "Open read-only",
	"modal.unsupportedHtml.discard": "Discard and open",

	"modal.unsavedChanges.defaultMessage": "You have unsaved changes.",
	"modal.unsavedChanges.closeTabPrompt":
		"You have unsaved changes. Save before closing the tab?",
	"modal.unsavedChanges.title": "Unsaved changes",
	"modal.settingsPanel.title": "Display settings",
	"modal.newNote.title": "Create new note",
	"modal.newNote.desc":
		"Enter a file name (.md extension is optional)",
	"modal.newNote.destination": "Create in: {folder}",
	"modal.newNote.placeholder": "New note name",
	"modal.newNote.create": "Create",
	"modal.fileSwitch.placeholder": "Select a file to switch to",
	"modal.fileSwitch.createNew": "Create new note",
	"modal.linkInput.title": "Insert link",
	"modal.linkInput.urlLabel": "URL",
	"modal.linkInput.textLabel": "Link text",
	"modal.linkInput.textPlaceholder": "Link text",
	"modal.linkInput.insert": "Insert",
	"modal.rubyInput.title": "Insert ruby",
	"modal.rubyInput.targetLabel": "Target text:",
	"modal.rubyInput.rubyLabel": "Ruby:",
	"modal.rubyInput.rubyPlaceholder": "Reading",
	"modal.rubyInput.emphasisLabel": "Emphasis marks:",
	"modal.rubyInput.emphasisNone": "Do not use",
	"modal.rubyInput.customPlaceholder":
		"Enter one character for emphasis",
	"modal.rubyInput.customAdd": "Add",
	"modal.rubyInput.customRemove": "Remove selected",
	"modal.rubyInput.customInvalid":
		"Enter one character to register as an emphasis mark.",
	"modal.rubyInput.customRemoveNotFound":
		"Select a registered emphasis mark to remove.",
	"modal.rubyInput.customRemoveDefault":
		"Default candidates cannot be removed.",
	"modal.rubyInput.customRemoved": "Removed the registered emphasis mark.",
	"modal.rubyInput.emphasisNote":
		"Note: Emphasis marks (e.g., ﹅/﹆/⚬) may render differently depending on OS and fonts.",
	"modal.rubyInput.insert": "Insert",

	"modal.fileSwitch.title": "You have unsaved changes",
	"modal.fileSwitch.heading": "You are about to switch files",
	"modal.fileSwitch.detail":
		"The current file has unsaved changes. Do you want to save them?",
	"modal.fileSwitch.currentFile": "Current file:",
	"modal.fileSwitch.unsaved": "●Unsaved",
	"modal.fileSwitch.nextFile": "Switching to:",
	"modal.fileSwitch.choose": "Please choose one of the following:",
	"modal.fileSwitch.option.save": "Save and switch:",
	"modal.fileSwitch.option.saveDesc":
		"Save current changes, then open the new file.",
	"modal.fileSwitch.option.discard": "Discard and switch:",
	"modal.fileSwitch.option.discardDesc":
		"Discard changes, then open the new file.",
	"modal.fileSwitch.option.cancel": "Cancel:",
	"modal.fileSwitch.option.cancelDesc": "Cancel file switching.",
	"modal.fileSwitch.button.discardAndSwitch": "Discard and switch",
	"modal.fileSwitch.button.saveAndSwitch": "Save and switch",

	"modal.conflict.title": "Resolve file conflict",
	"modal.conflict.file": "File: {filePath}",
	"modal.conflict.desc":
		"This file was changed externally and there are unsaved edits. Choose how to proceed.",
	"modal.conflict.overwrite": "Overwrite with current content",
	"modal.conflict.acceptExternal": "Accept external changes",
	"modal.conflict.keepBoth": "Keep both versions",

	"context.notice.copyFailed": "Failed to copy.",
	"context.notice.cutFailed": "Failed to cut.",
	"context.notice.pasteFailed":
		"Failed to paste. Check browser permission settings.",
	"context.notice.findReplaceNotImplemented":
		"Find and replace is not implemented.",
	"search.placeholder": "Search...",
	"search.prev": "Find previous",
	"search.next": "Find next",
	"search.close": "Close",
	"search.replacePlaceholder": "Replace...",
	"search.replaceOne": "Replace",
	"search.replaceAll": "Replace all",
	"search.caseSensitive": "Case sensitive",
	"search.noMatch": "No matches",
	"aux.placeholder":
		"Type and press Enter to insert, Shift+Enter for newline...",
	"aux.insert": "Insert",
	"link.defaultText": "Link text",
	"widget.math.parseFailed": "Failed to parse math block.",
	"widget.math.rendering": "Rendering math...",
	"widget.math.rangeInvalid": "Invalid math block range.",
	"widget.math.renderFailed": "Failed to render math.",
	"widget.callout.parseFailed": "Failed to parse callout.",
	"widget.callout.rendering": "Rendering callout...",
	"widget.callout.renderFailed": "Failed to render callout.",
	"widget.table.parseFailed": "Failed to parse table.",
	"widget.table.rendering": "Rendering table...",
	"widget.table.renderFailed": "Failed to render table.",
	"widget.deflist.parseFailed": "Failed to parse definition list.",
	"widget.deflist.rendering": "Rendering definition list...",
	"widget.deflist.renderFailed": "Failed to render definition list.",
	"widget.embed.loading": "Loading embed...",
	"widget.embed.empty": "Embed target is empty.",
	"widget.embed.invalidFormat": "Invalid embed format: {target}",
	"widget.embed.notFound": "Embed target not found: {linkpath}",
	"widget.embed.headingNotFound": "Heading not found: {heading}",
	"widget.embed.blockNotFound": "Block not found: {blockId}",
	"widget.embed.renderFailed": "Failed to render embed.",
	"notice.compatMode.disabled":
		"Compatibility mode is disabled. Enable it in settings.",
	"notice.writingMode.toggleFailed":
		"Failed to toggle writing direction.",
	"notice.displaySettings.switchingTo":
		"Switching to {view} to open display settings.",
	"notice.targetFileNotFound": "Target file was not found.",
	"notice.targetFileNotFoundAlt": "The target file was not found.",
	"notice.switchableFilesNotFound": "No switchable files were found.",
	"notice.fileNameRequired": "Enter a file name.",
	"notice.openExistingNote": "Opening the existing note.",
	"notice.createFolderFailed": "Failed to create folder.",
	"notice.invalidFolderName": "Invalid folder name.",
	"notice.createNoteFailed": "Failed to create new note.",
	"notice.fileAlreadyDisplayed": "This file is already displayed.",
	"notice.markdownViewMissingClose":
		"Closing because no Markdown view was found.",
	"notice.markdownViewMissingExecute":
		"Cannot run because no Markdown view was found.",
	"notice.markdownPairMissingSwitch":
		"Cannot switch because the paired Markdown view was not found.",
	"notice.fileSwitchFailed": "Failed to switch file.",
	"notice.markdownPairMismatchClose":
		"Closing because the paired Markdown view does not match the target file.",
	"notice.layoutChanged.switchedTo":
		"Layout change detected. Switched to {view}.",
	"notice.layoutChanged.readingClosed":
		"Layout change detected, so book mode was closed.",
	"notice.readOnly.sourceEditUnavailable":
		"Source text editing is unavailable in read-only mode.",
	"notice.readOnly.syncModeUnavailable":
		"Cannot change sync mode in read-only mode.",
	"notice.readOnly.saveUnavailable": "Cannot save in read-only mode.",
	"notice.readOnly.auxiliaryUnavailable":
		"Auxiliary input panel is unavailable in read-only mode.",
	"notice.auxiliary.toggleFailed":
		"Failed to toggle auxiliary input panel.",
	"notice.syncMode.switched.manual": "Switched to manual sync mode.",
	"notice.syncMode.switched.auto": "Switched to auto sync mode.",
	"notice.syncMode.toggleFailed": "Failed to toggle sync mode.",
	"notice.ruby.enabled": "Ruby display enabled.",
	"notice.ruby.disabled": "Ruby display disabled.",
	"notice.ruby.toggleFailed": "Failed to toggle ruby display.",
	"notice.ruby.singleLineOnly":
		"Ruby is only supported for selections within a single line.",
	"notice.customEmphasis.saveFailed":
		"Failed to save emphasis mark candidates.",
	"notice.bookMode.opened": "Book mode view opened.",
	"notice.bookMode.closed": "Book mode view closed.",
	"notice.outline.openFailed": "Could not open outline.",
	"notice.sourceEdit.unavailableInPlainText":
		"Source text editing cannot be used in full plain-text view.",
	"notice.ceIme.suspended":
		"CE assist mode was temporarily suspended ({reason})",
	"notice.ceIme.reason.selectionRestoreFailed":
		"failed to restore selection",
	"notice.ceIme.reason.externalUpdated":
		"external update detected",
	"notice.ceIme.reason.caretVerification":
		"caret consistency check",
	"notice.tcy.invalidSelection":
		"TCY supports only 2-4 half-width alphanumeric/!? characters.",
	"notice.unsupported.readOnlyOpened":
		"Opened in read-only mode because unsupported tags were found.",
	"notice.unsupported.backupFailed":
		"Failed to create backup for unsupported tags.",
	"notice.sync.noFileOpen": "No file is open for sync.",
	"notice.sync.fileSaved": "File saved.",
	"notice.sync.readBeforeSaveFailed":
		"Failed to read file before saving.",
	"notice.sync.backupCreateFailedContinue":
		"Failed to create backup (save will continue).",
	"notice.sync.readBackFailedBackedUp":
		"Failed to verify read-back after save (backup created).",
	"notice.sync.readBackFailed": "Failed to verify read-back after save.",
	"notice.sync.mismatchBackedUp":
		"Sync may have failed (read-back mismatch). Backup is available.",
	"notice.sync.rollbackDone":
		"Rolled back to pre-sync content for safety.",
	"notice.sync.rollbackFailedRestore":
		"Rollback failed. Please restore from backup.",
	"notice.sync.rollbackDueToMismatch":
		"Rolled back due to read-back mismatch.",
	"notice.sync.saveFailed": "Failed to save file.",
	"notice.sync.loadFailed": "Failed to load file.",
	"notice.sync.conflictCancelled": "Conflict resolution was cancelled.",
	"notice.sync.conflictOverwriteSaved":
		"Overwritten with current content and saved.",
	"notice.sync.conflictAcceptedExternal":
		"Accepted external changes.",
	"notice.sync.conflictResolutionFailed":
		"An error occurred during conflict resolution.",
	"notice.sync.conflictCopyLabel": "Conflict copy",
	"notice.sync.keepBothApplied":
		'Saved current content as "{copyName}" and applied external changes.',
	"notice.sync.fileSwitchActionFailed":
		"An error occurred during file switch processing.",
	"notice.sync.switchedAfterSave":
		"Saved changes and switched file.",
	"notice.sync.switchedAfterDiscard":
		"Discarded changes and switched file.",
};

const dictionaries: Record<Locale, Record<I18nKey, string>> = {
	ja: jaDict,
	en: enDict,
};

let cachedLocale: Locale | null = null;

function detectLanguageCode(): string {
	if (typeof window !== "undefined") {
		try {
			const fromStorage = window.localStorage?.getItem("language");
			if (fromStorage && fromStorage.trim()) {
				return fromStorage;
			}
		} catch {
			// ignore
		}
	}

	if (typeof navigator !== "undefined") {
		if (Array.isArray(navigator.languages)) {
			for (const lang of navigator.languages) {
				if (lang && lang.trim()) {
					return lang;
				}
			}
		}
		if (navigator.language && navigator.language.trim()) {
			return navigator.language;
		}
	}

	return "ja";
}

function normalizeLocale(languageCode: string): Locale {
	return languageCode.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function resolveLocale(): Locale {
	if (cachedLocale) return cachedLocale;
	cachedLocale = normalizeLocale(detectLanguageCode());
	return cachedLocale;
}

export function resetLocaleCacheForTests(): void {
	cachedLocale = null;
}

export function t(
	key: I18nKey,
	params?: Record<string, string | number>,
): string {
	const template = dictionaries[resolveLocale()][key] ?? jaDict[key];
	if (!params) {
		return template;
	}
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token) => {
		const value = params[token];
		return value === undefined ? match : String(value);
	});
}
