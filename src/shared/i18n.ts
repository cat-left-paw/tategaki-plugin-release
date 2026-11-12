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
	"toolbar.typewriter.menu": "タイプライターモード",
	"toolbar.typewriter.scroll": "Typewriter scroll",
	"toolbar.typewriter.blockHighlight": "編集ブロックハイライト",
	"toolbar.typewriter.currentLineHighlight": "現在行ハイライト",
	"toolbar.typewriter.nonFocusDim": "非フォーカス減光",
	"toolbar.plainText.toggle": "全文プレーン表示",
	"toolbar.plainText.enable": "全文プレーン表示をオンにする",
	"toolbar.plainText.disable": "全文プレーン表示をオフにする",
	"toolbar.source.toggle": "ソーステキスト編集",
	"toolbar.source.enable": "ソーステキスト編集モード",
	"toolbar.source.disable": "装飾表示に戻す",
	"toolbar.outline": "アウトライン",
	"toolbar.reading.return": "戻る",
	"toolbar.reading.returnTo": "{view}へ戻る",
	"reading.returnLabel.sot": "執筆・参照ビュー",
	"view.reading.display": "書籍ビュー",
	"view.reading.displayWithTitle": "書籍ビュー: - {title} -",
	"badge.mode.reading": "書籍",
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

	"settings.section.main": "一般",
	"pm.settings.name": "新執筆モード（実験的）",
	"pm.settings.desc": "基本的な入力・変換・選択・コピーと貼り付けは使えますが、実験的な機能で、まだできないことがあります（マニュアルの『新執筆モードでまだできないこと』）。開いたノートへ直接書き込みます。大事な原稿は控えを取ってからお使いください。",
	"pm.settings.preeditDisplay.name": "新執筆モード: 変換中の表示",
	"pm.settings.preeditDisplay.desc": "変換中の字を、本文の中に場所を取って表示する（後ろの本文が押し出される）か、本文の上に重ねて表示するかを選びます。変換を始めるときに読むので、変えた設定は次の変換から効きます。範囲を選んだまま始める変換は、いつも重ねて表示します。",
	"pm.settings.preeditDisplay.inline": "押し出す（既定）",
	"pm.settings.preeditDisplay.overlay": "重ねる",
	"pm.view.title": "新執筆モード: {name}",
	"pm.badge.title": "新執筆モード",
	"pm.badge.short": "新",
	"pm.paired.title": "新執筆モードと対応するMarkdown",
	"pm.notice.unavailable": "この環境では新執筆モードを使えません: ",
	"pm.notice.cmMissing": "Markdownの編集画面を取得できません。現行の執筆モードを使ってください。",
	"pm.notice.pairClosed": "対応するMarkdownが閉じたか別の文書に変わったため、新執筆モードを閉じました。",
	"pm.notice.keyBlocked": "新執筆モード: 編集しませんでした（{reason}）。",
	"pm.notice.key.inside-inline": "Ruby・縦中横の途中では改行できないため",
	"pm.notice.inputRetained": "新執筆モード: 書き込みませんでした（{reason}）。入力面の文字はBackspaceで消すか、コピーして使ってください。",
	"pm.notice.inputBlocked": "新執筆モード: ここには打てません（{reason}）。",
	"pm.notice.inputBlockedComposition": "新執筆モード: ここで確定しても書き込みません（{reason}）。確定した字は入力面に残ります。",
	"pm.notice.inputMismatch": "書き込みが計画と違う形で本文に入ったため、新執筆モードの書き込みを止めました。Markdownの編集画面で本文を確かめてください（Undoで戻せます）。新執筆モードを開き直すと再開します。",
	"pm.notice.input.stale": "本文が変わったため",
	"pm.notice.input.newline-in-payload": "改行を含むため",
	"pm.notice.input.dispatch-rejected": "ほかの処理が書き込みを変えたため",
	"pm.notice.input.structure": "表示の形を保てないため",
	"pm.notice.input.partial-ruby": "Rubyの一部だけを選んでいるため",
	"pm.notice.input.inside-inline": "Rubyの親文字・縦中横の中には書けない字を含むため",
	"pm.notice.input.location": "ここには書けないため",
	"pm.notice.input.reading-view": "Markdownの編集画面が閲覧表示のため",
	"pm.notice.input.out-of-scope": "この文書には書き込みません（Markdownのnoteでないか、この環境では範囲の見せ方が書き込みに向かないため）",
	"pm.notice.input.stopped": "書き込みを止めています。新執筆モードを開き直すと再開します",
	"pm.notice.input.keyless-range": "範囲の上では、打鍵で始まっていない変換は書かないため",
	"pm.notice.input.keyless-after-input": "再変換と思われる変換は書かないため",
	"pm.notice.clipboard.composing": "変換中のため",
	"pm.notice.clipboard.retained": "書き込めなかった字が入力面に残っているため",
	"pm.notice.leaveBlocked.composing": "新執筆モード: 変換中のため、何もしませんでした。変換を終えてから、もう一度行ってください。",
	"pm.notice.leaveBlocked.retained": "新執筆モード: 書き込めなかった字が入力面に残っているため、何もしませんでした。字をBackspaceで消すか、コピーしてから、もう一度行ってください。",
	"pm.notice.lostText": "新執筆モードを閉じました。入力面にあった字は本文に書き込まれていません（クリップボードにも書いていません）: 「{text}」",
	"pm.command.discardComposition": "新執筆モード: 終わらない変換を捨てる",
	"pm.command.recordInput": "Tategaki（開発用）: 新執筆モードの入力の記録（M2-4）の開始・終了",
	"pm.record.label": "記録のラベル（例: mac-standard）",
	"pm.record.start": "記録を開始",
	"pm.record.cancel": "キャンセル",
	"pm.record.started": "新執筆モードの入力の記録を始めました。終わったら同じcommandを実行してください。",
	"pm.record.saved": "入力の記録を保存しました:",
	"pm.record.limit": "上限に達したため記録を停止",
	"pm.record.failed": "入力の記録を保存できませんでした:",
	"pm.notice.discardCompositionRetained": "新執筆モード: 変換を捨てませんでした（変換の開始時に入力面へ保持した文字があるため）。",
	"pm.notice.discardCompositionFirst": "新執筆モード: 変換中です。同じ変換が終わらない場合は、もう一度このコマンドを実行すると、捨てるかを確認します。",
	"pm.recovery.title": "終わらない変換を捨てますか？",
	"pm.recovery.message": "変換中の文字を捨てます。本文には書き込みません。",
	"pm.recovery.cancel": "キャンセル",
	"pm.recovery.discard": "変換を捨てる",
	"pm.input.label": "新執筆モードの入力面",
	"settings.showModeDialog.name": "ビュー起動時にモード選択を表示",
	"settings.showModeDialog.desc":
		"縦書きビューを開くときに、表示モードを選ぶダイアログを表示します",
	"settings.statusBarOverlap.name": "ステータスバーとの重なり",
	"settings.statusBarOverlap.desc":
		"Obsidianのステータスバー（右下）が縦書きビューのスクロールバーに重なるときの扱いです。「半透明」は、重なっている間ステータスバーを半透明にし、スクロールバーの上にポインタが来たときだけ下のスクロールバーを操作できるようにします。「隠す」は、縦書きビューがアクティブな間ステータスバーを隠します",
	"settings.statusBarOverlap.translucent": "半透明にしてスクロールバーを操作できるようにする",
	"settings.statusBarOverlap.hide": "縦書きビューがアクティブな間は隠す",
	"settings.statusBarOverlap.off": "何もしない（Obsidianのまま）",
	"settings.section.sotWysiwyg": "執筆・参照モード",
	"settings.currentValue": "現在値: {value}",
	"settings.typewriter.section": "タイプライターモード",
	"settings.value.enabled": "有効",
	"settings.value.disabled": "無効",
	"settings.sotTypewriterMode.name": "タイプライタースクロール",
	"settings.sotTypewriterMode.desc":
		"執筆・参照モードで、キャレットを追従帯の範囲に保つようスクロールを追従させます。視覚フォーカス（編集ブロック / 現在行 / 非フォーカス減光）はこの設定に依存せず個別に切り替えられます",
	"settings.sotTypewriterOffsetRatio.name": "追従位置",
	"settings.sotTypewriterOffsetRatio.desc":
		"画面中央からの相対位置です。正の値ほど進行方向へ寄ります",
	"settings.sotTypewriterFollowBandRatio.name": "追従帯の幅",
	"settings.sotTypewriterFollowBandRatio.desc":
		"追従帯の幅です。この範囲内では追加スクロールしません",
	"settings.sotTypewriterVisualFocus.section": "視覚フォーカス",
	"settings.sotTypewriterBlockHighlightEnabled.name":
		"編集ブロックハイライト",
	"settings.sotTypewriterBlockHighlightEnabled.desc":
		"現在の編集ブロックに背景ハイライトを表示します",
	"settings.sotTypewriterCurrentLineHighlightEnabled.name":
		"現在行ハイライト",
	"settings.sotTypewriterCurrentLineHighlightEnabled.desc":
		"キャレットがある現在行を強調表示します",
	"settings.sotTypewriterNonFocusDimEnabled.name":
		"非フォーカス減光",
	"settings.sotTypewriterNonFocusDimEnabled.desc":
		"現在の編集ブロック以外を opacity で減光します",
	"settings.sotTypewriterBlockHighlightColor.name":
		"編集ブロック色",
	"settings.sotTypewriterBlockHighlightColor.desc":
		"編集ブロックハイライトの色です",
	"settings.sotTypewriterBlockHighlightOpacity.name":
		"編集ブロック透明度",
	"settings.sotTypewriterBlockHighlightOpacity.desc":
		"編集ブロックハイライトの濃さです",
	"settings.sotTypewriterCurrentLineHighlightColor.name":
		"現在行色",
	"settings.sotTypewriterCurrentLineHighlightColor.desc":
		"現在行ハイライトの色です",
	"settings.sotTypewriterCurrentLineHighlightOpacity.name":
		"現在行透明度",
	"settings.sotTypewriterCurrentLineHighlightOpacity.desc":
		"現在行ハイライトの濃さです",
	"settings.sotTypewriterNonFocusOpacity.name":
		"非フォーカス透明度",
	"settings.sotTypewriterNonFocusOpacity.desc":
		"非フォーカス段落/ブロックの透明度です",
	"settings.sotTypewriter.unavailable.sourceMode":
		"ソーステキスト編集中はタイプライター機能が一時的に利用できません。通常の SoT に戻ると、保存されている設定がそのまま復帰します",
	"settings.sotTypewriter.unavailable.plainTextView":
		"プレーンテキスト表示中はタイプライター機能が一時的に利用できません。プレーンテキスト表示を解除すると、保存されている設定がそのまま復帰します",
	"settings.sotTypewriter.unavailable.plainEdit":
		"段落プレーン編集中はタイプライター機能が一時的に利用できません。プレーン編集を抜けると、保存されている設定がそのまま復帰します",
	"settings.syncBackupMove.name": "互換モードの古いバックアップをゴミ箱へ移す",
	"settings.syncBackupMove.desc":
		"互換モード（1.4.0 で廃止）が同期の安全策として作っていたバックアップを、ゴミ箱へ移します（復元できなくなるので注意）",
	"settings.releasePage": "リリースページ",
	"settings.releasePage.name": "リリースノート",
	"settings.notice.linkOpenFailed": "リンクを開けませんでした。",
	"settings.section.support": "サポート",
	"settings.supportDonation.name": "サポート（寄付）",
	"settings.supportDonation.desc":
		"このプラグインを気に入っていただけたらサポートをしていただくと幸いです（任意）",
	"settings.section.theme": "テーマ",
	"settings.theme.obsidianBase.name": "アプリテーマ",
	"settings.theme.obsidianBase.desc":
		"現在適用中のアプリテーマをベースにしたテーマです",
	"settings.theme.preset.default.name": "デフォルト",
	"settings.theme.preset.default.desc": "標準的な縦書きテーマ",
	"settings.theme.preset.ashberryLight.name": "アッシュベリー（ライト）",
	"settings.theme.preset.ashberryLight.desc":
		"淡いアッシュベリー調の明るいテーマ（丸ゴシック）",
	"settings.theme.preset.ashberryDark.name": "アッシュベリー（ダーク）",
	"settings.theme.preset.ashberryDark.desc":
		"アッシュベリー調の落ち着いたダークテーマ（丸ゴシック）",
	"settings.theme.preset.dustyNavy.name": "ダスティネイビー",
	"settings.theme.preset.dustyNavy.desc":
		"くすんだダークブルーの落ち着いたテーマ（明朝）",
	"settings.theme.preset.dark.name": "ダーク",
	"settings.theme.preset.dark.desc": "ダークモード縦書きテーマ",
	"settings.theme.preset.paperLike.name": "紙風",
	"settings.theme.preset.paperLike.desc": "紙のような温かみのあるテーマ",
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

	"modal.viewMode.title": "縦書きビューを開く",
	"modal.viewMode.prompt": "表示モードを選択してください。",
	"modal.viewMode.edit.title": "執筆・参照モード",
	"modal.viewMode.edit.desc":
		"執筆・参照モードで編集・参照を行います。",
	"modal.viewMode.reading.title": "書籍モード",
	"modal.viewMode.reading.desc":
		"縦書き読書モードで、ページめくりスタイルで閲覧します。",
	"modal.viewMode.placement.right": "右側に開く",
	"modal.viewMode.placement.tab": "隣のタブに開く",
	"modal.viewMode.placement.window": "新規ウィンドウで開く",

	"modal.viewAlreadyOpen.title": "縦書きビューは既に開かれています",
	"modal.viewAlreadyOpen.desc":
		"既に縦書きビューが開かれています。新しいビューを開くには、既存のビューを閉じてください。",


	"modal.settingsPanel.title": "表示設定",
	"modal.settingsPanel.pluginSettingsHint":
		"起動方法や一般項目はプラグイン設定から変更できます。",
	"modal.settingsPanel.openPluginSettings": "プラグイン設定を開く",
	"settings.headingMarginAfter": "見出し後マージン",
	"settings.headingMarginAfter.desc": "見出しの後（縦書き：左側、横書き：下側）のマージン（em）",
	"settings.headingDividerLevels": "見出し区切り線",
	"settings.headingDividerLevels.desc": "区切り線を表示する見出しレベルを選択",
	"settings.headingAlign": "見出しの位置",
	"settings.headingAlign.desc": "見出しテキストの配置位置",
	"settings.headingAlign.start.vertical": "上",
	"settings.headingAlign.center.vertical": "中央",
	"settings.headingAlign.end.vertical": "下",
	"settings.headingAlign.start.horizontal": "左",
	"settings.headingAlign.center.horizontal": "中央",
	"settings.headingAlign.end.horizontal": "右",
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
	"notice.compatMode.retired":
		"互換モードは 1.4.0 で廃止しました。執筆・参照モードで開きます。",
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
	"notice.sotReadingViewInputRetained": "書き込みませんでした（Markdownの編集画面が閲覧表示のため）。入力欄の文は残しています。",
	"notice.sotPlainTargetChangedRetained": "本文が外で変わったため、書き込みませんでした。入力欄の文は残しています。必要ならコピーしてから入力欄を閉じてください。",
	"notice.sotPlainTargetChanged": "本文が外で変わったため、書き込みませんでした。",
	"notice.sotPlainTargetChangedClosed": "本文が外で変わったため、入力欄の文を書かずに閉じました。入力は保存されていません。",
	"notice.sotEditingModeFailed": "Markdownの画面を編集の表示に切り替えられなかったため、開けませんでした。",
	"notice.sotReadingViewWriteBlocked": "書き込みませんでした（Markdownの編集画面が閲覧表示のため）。入力は保存されていません。",
	"notice.fileSwitchFailed": "ファイル切り替えに失敗しました。",
	"notice.markdownPairMismatchClose":
		"ペアの Markdown ビューが対象ファイルと一致しないため閉じます。",
	"notice.layoutChanged.switchedTo":
		"レイアウト変更を検出したため、{view}へ切り替えました。",
	"notice.ruby.enabled": "ルビ表示をオンにしました。",
	"notice.ruby.disabled": "ルビ表示をオフにしました。",
	"notice.ruby.toggleFailed": "ルビ表示の切り替えに失敗しました。",
	"notice.ruby.singleLineOnly": "ルビは1行内の選択のみ対応しています。",
	"notice.customEmphasis.saveFailed": "傍点候補の保存に失敗しました。",
	"notice.bookMode.opened": "書籍モードを開きました。",
	"notice.bookMode.closed": "書籍モードを閉じました。",
	"notice.outline.openFailed": "アウトラインを開けませんでした。",
	"notice.sourceEdit.unavailableInPlainText":
		"全文プレーン表示中はソーステキスト編集を使えません。",
	"notice.ceIme.suspended":
		"CE補助モードを一時停止しました ({reason})",
	"notice.ceIme.reason.selectionRestoreFailed": "選択の復元に失敗",
	"notice.ceIme.reason.externalUpdated": "外部更新を検知",
	"notice.ceIme.reason.caretVerification": "キャレット整合性チェック",
	"notice.tcy.invalidSelection":
		"縦中横は半角英数字/!? の1〜4文字のみ対応です。",
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
	"toolbar.typewriter.menu": "Typewriter mode",
	"toolbar.typewriter.scroll": "Typewriter scroll",
	"toolbar.typewriter.blockHighlight": "Edit block highlight",
	"toolbar.typewriter.currentLineHighlight": "Current line highlight",
	"toolbar.typewriter.nonFocusDim": "Dim non-focused blocks",
	"toolbar.plainText.toggle": "Full plain-text view",
	"toolbar.plainText.enable": "Enable full plain-text view",
	"toolbar.plainText.disable": "Disable full plain-text view",
	"toolbar.source.toggle": "Source text editing",
	"toolbar.source.enable": "Source text editing mode",
	"toolbar.source.disable": "Return to formatted view",
	"toolbar.outline": "Outline",
	"toolbar.reading.return": "Back",
	"toolbar.reading.returnTo": "Back to {view}",
	"reading.returnLabel.sot": "Writing/Reading view",
	"view.reading.display": "Book view",
	"view.reading.displayWithTitle": "Book view: - {title} -",
	"badge.mode.reading": "Book",
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

	"settings.section.main": "General",
	"pm.settings.name": "New writing mode (Experimental)",
	"pm.settings.desc": "Basic typing, composition, selection, copy and paste work, but this is an experimental feature and some things are not possible yet (see “What the new writing mode cannot do yet” in the README). Edits are written directly to the open note. Back up important manuscripts before use.",
	"pm.settings.preeditDisplay.name": "New writing mode: display while composing",
	"pm.settings.preeditDisplay.desc": "Choose whether the text being composed takes room in the line (the text after it is pushed aside) or is drawn over the text. The setting is read when a composition starts, so a change applies from the next one. A composition that starts over a selected range is always drawn over.",
	"pm.settings.preeditDisplay.inline": "Push aside (default)",
	"pm.settings.preeditDisplay.overlay": "Draw over",
	"pm.view.title": "New writing mode: {name}",
	"pm.badge.title": "New writing mode",
	"pm.badge.short": "N",
	"pm.paired.title": "Markdown paired with new writing mode",
	"pm.notice.unavailable": "New writing mode is unavailable in this environment: ",
	"pm.notice.cmMissing": "The Markdown editor is unavailable. Please use the existing writing mode.",
	"pm.notice.pairClosed": "New writing mode closed because its paired Markdown closed or changed files.",
	"pm.notice.keyBlocked": "New writing mode: the edit was not applied ({reason}).",
	"pm.notice.key.inside-inline": "a line break cannot be inserted inside Ruby or vertical-in-horizontal text",
	"pm.notice.inputRetained": "New writing mode: text was not written ({reason}). Delete the retained text with Backspace, or copy it for use elsewhere.",
	"pm.notice.inputBlocked": "New writing mode: text cannot be typed here ({reason}).",
	"pm.notice.inputBlockedComposition": "New writing mode: text confirmed here will not be written ({reason}). The confirmed text stays on the input surface.",
	"pm.notice.inputMismatch": "The write reached the document in a different form than planned. New writing mode has stopped writing. Check the text in the Markdown editor (Undo can restore it). Close and reopen new writing mode to resume.",
	"pm.notice.input.stale": "the document or connection changed",
	"pm.notice.input.newline-in-payload": "the text contains a line break",
	"pm.notice.input.dispatch-rejected": "another process changed the write",
	"pm.notice.input.structure": "the displayed structure could not be preserved",
	"pm.notice.input.partial-ruby": "only part of a Ruby is selected",
	"pm.notice.input.inside-inline": "the text contains characters that cannot be written inside a Ruby base or vertical-in-horizontal text",
	"pm.notice.input.location": "text cannot be written here",
	"pm.notice.input.reading-view": "the Markdown editor is in reading view",
	"pm.notice.input.out-of-scope": "this document is not writable (it is not a Markdown note, or this environment does not show a range in a way that is safe to write)",
	"pm.notice.input.stopped": "writing has stopped; close and reopen new writing mode to resume",
	"pm.notice.input.keyless-range": "a conversion that no typed key began is not written over a selection",
	"pm.notice.input.keyless-after-input": "a conversion that looks like a reconversion is not written",
	"pm.notice.clipboard.composing": "a composition is in progress",
	"pm.notice.clipboard.retained": "text that could not be written is still on the input surface",
	"pm.notice.leaveBlocked.composing": "New writing mode: nothing was done because a composition is in progress. Finish the composition, then try again.",
	"pm.notice.leaveBlocked.retained": "New writing mode: nothing was done because text that could not be written is still on the input surface. Delete it with Backspace, or copy it, then try again.",
	"pm.notice.lostText": "New writing mode closed. Text that was on the input surface was not written to the note (and not copied to the clipboard): \"{text}\"",
	"pm.command.discardComposition": "New writing mode: discard a stuck composition",
	"pm.command.recordInput": "Tategaki (development): Start/stop new writing mode input recording (M2-4)",
	"pm.record.label": "Recording label (e.g. mac-standard)",
	"pm.record.start": "Start recording",
	"pm.record.cancel": "Cancel",
	"pm.record.started": "Input recording started. Run the same command to stop.",
	"pm.record.saved": "Input recording saved:",
	"pm.record.limit": "Recording stopped at the limit",
	"pm.record.failed": "Could not save input recording:",
	"pm.notice.discardCompositionRetained": "New writing mode: the composition was not discarded (the input surface held retained text when it started).",
	"pm.notice.discardCompositionFirst": "New writing mode: a composition is active. If it remains stuck, run this command again to confirm discarding it.",
	"pm.recovery.title": "Discard the stuck composition?",
	"pm.recovery.message": "The composing text will be discarded without writing it to the document.",
	"pm.recovery.cancel": "Cancel",
	"pm.recovery.discard": "Discard composition",
	"pm.input.label": "Input surface of the new writing mode",
	"settings.showModeDialog.name": "Show mode selection when opening view",
	"settings.showModeDialog.desc":
		"Show a dialog to choose a view mode when opening the vertical writing view.",
	"settings.statusBarOverlap.name": "Status bar overlap",
	"settings.statusBarOverlap.desc":
		"How to handle Obsidian's status bar (bottom right) when it covers the scroll bar of the vertical writing view. \"Translucent\" makes the status bar translucent while it covers the view, and lets you use the scroll bar underneath when the pointer is over it. \"Hide\" hides the status bar while the vertical writing view is active.",
	"settings.statusBarOverlap.translucent":
		"Translucent, with the scroll bar usable underneath",
	"settings.statusBarOverlap.hide": "Hide while the vertical writing view is active",
	"settings.statusBarOverlap.off": "Do nothing (Obsidian default)",
	"settings.section.sotWysiwyg": "Writing & Reference",
	"settings.currentValue": "Current: {value}",
	"settings.typewriter.section": "Typewriter mode",
	"settings.value.enabled": "Enabled",
	"settings.value.disabled": "Disabled",
	"settings.sotTypewriterMode.name": "Typewriter scroll",
	"settings.sotTypewriterMode.desc":
		"Scroll automatically to keep the caret within the follow band in Writing & Reference mode. Visual focus (edit block / current line / dim) is independent of this setting.",
	"settings.sotTypewriterOffsetRatio.name": "Follow position",
	"settings.sotTypewriterOffsetRatio.desc":
		"Relative position from the viewport center. Positive values move toward the reading direction.",
	"settings.sotTypewriterFollowBandRatio.name": "Follow band width",
	"settings.sotTypewriterFollowBandRatio.desc":
		"Width of the follow band. No extra scroll occurs while the caret stays inside it.",
	"settings.sotTypewriterVisualFocus.section": "Visual focus",
	"settings.sotTypewriterBlockHighlightEnabled.name":
		"Edit block highlight",
	"settings.sotTypewriterBlockHighlightEnabled.desc":
		"Show a background highlight for the current editing block.",
	"settings.sotTypewriterCurrentLineHighlightEnabled.name":
		"Current line highlight",
	"settings.sotTypewriterCurrentLineHighlightEnabled.desc":
		"Emphasize the current line containing the caret.",
	"settings.sotTypewriterNonFocusDimEnabled.name":
		"Dim non-focused blocks",
	"settings.sotTypewriterNonFocusDimEnabled.desc":
		"Reduce opacity outside the current editing block.",
	"settings.sotTypewriterBlockHighlightColor.name": "Edit block color",
	"settings.sotTypewriterBlockHighlightColor.desc":
		"Color used for the editing block highlight.",
	"settings.sotTypewriterBlockHighlightOpacity.name":
		"Edit block opacity",
	"settings.sotTypewriterBlockHighlightOpacity.desc":
		"Strength of the editing block highlight.",
	"settings.sotTypewriterCurrentLineHighlightColor.name":
		"Current line color",
	"settings.sotTypewriterCurrentLineHighlightColor.desc":
		"Color used for the current line highlight.",
	"settings.sotTypewriterCurrentLineHighlightOpacity.name":
		"Current line opacity",
	"settings.sotTypewriterCurrentLineHighlightOpacity.desc":
		"Strength of the current line highlight.",
	"settings.sotTypewriterNonFocusOpacity.name": "Non-focus opacity",
	"settings.sotTypewriterNonFocusOpacity.desc":
		"Opacity applied to non-focused paragraphs and blocks.",
	"settings.sotTypewriter.unavailable.sourceMode":
		"Typewriter features are temporarily unavailable while editing source text. Returning to regular SoT restores the saved settings.",
	"settings.sotTypewriter.unavailable.plainTextView":
		"Typewriter features are temporarily unavailable while plain text view is on. Disabling plain text view restores the saved settings.",
	"settings.sotTypewriter.unavailable.plainEdit":
		"Typewriter features are temporarily unavailable while editing a paragraph in plain mode. Exiting plain edit restores the saved settings.",
	"settings.syncBackupMove.name": "Move old compatibility-mode backups to trash",
	"settings.syncBackupMove.desc":
		"Move the backups that compatibility mode (retired in 1.4.0) made as a sync safety net to the trash (cannot be restored afterward).",
	"settings.releasePage": "Releases",
	"settings.releasePage.name": "Release notes",
	"settings.notice.linkOpenFailed": "Failed to open link.",
	"settings.section.support": "Support",
	"settings.supportDonation.name": "Support (donation)",
	"settings.supportDonation.desc":
		"If you enjoy this plugin, your support is appreciated (optional).",
	"settings.section.theme": "Themes",
	"settings.theme.obsidianBase.name": "App theme",
	"settings.theme.obsidianBase.desc":
		"A theme based on the current app theme.",
	"settings.theme.preset.default.name": "Default",
	"settings.theme.preset.default.desc": "Standard vertical-writing theme.",
	"settings.theme.preset.ashberryLight.name": "Ashberry (Light)",
	"settings.theme.preset.ashberryLight.desc":
		"Light ashberry-toned theme with rounded gothic fonts.",
	"settings.theme.preset.ashberryDark.name": "Ashberry (Dark)",
	"settings.theme.preset.ashberryDark.desc":
		"Calm dark ashberry-toned theme with rounded gothic fonts.",
	"settings.theme.preset.dustyNavy.name": "Dusty Navy",
	"settings.theme.preset.dustyNavy.desc":
		"Muted dark blue theme with a calm Mincho style.",
	"settings.theme.preset.dark.name": "Dark",
	"settings.theme.preset.dark.desc": "Dark-mode vertical-writing theme.",
	"settings.theme.preset.paperLike.name": "Paper",
	"settings.theme.preset.paperLike.desc": "Warm paper-like theme.",
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

	"modal.viewMode.title": "Open vertical writing view",
	"modal.viewMode.prompt": "Select a display mode.",
	"modal.viewMode.edit.title": "Writing and reading mode",
	"modal.viewMode.edit.desc":
		"Edit and read in writing and reading mode.",
	"modal.viewMode.reading.title": "Book mode",
	"modal.viewMode.reading.desc":
		"Browse in vertical reading mode with page-turn style navigation.",
	"modal.viewMode.placement.right": "Open on the right",
	"modal.viewMode.placement.tab": "Open in adjacent tab",
	"modal.viewMode.placement.window": "Open in new window",

	"modal.viewAlreadyOpen.title": "Vertical writing view is already open",
	"modal.viewAlreadyOpen.desc":
		"A vertical writing view is already open. Close the existing view before opening a new one.",


	"modal.settingsPanel.title": "Display settings",
	"modal.settingsPanel.pluginSettingsHint":
		"Startup and general options can be changed in the plugin settings.",
	"modal.settingsPanel.openPluginSettings": "Open plugin settings",
	"settings.headingMarginAfter": "Heading after-margin",
	"settings.headingMarginAfter.desc": "Margin after headings (vertical: left side, horizontal: bottom) in em",
	"settings.headingDividerLevels": "Heading divider lines",
	"settings.headingDividerLevels.desc": "Select heading levels that show a divider line",
	"settings.headingAlign": "Heading alignment",
	"settings.headingAlign.desc": "Text alignment within headings",
	"settings.headingAlign.start.vertical": "Top",
	"settings.headingAlign.center.vertical": "Center",
	"settings.headingAlign.end.vertical": "Bottom",
	"settings.headingAlign.start.horizontal": "Left",
	"settings.headingAlign.center.horizontal": "Center",
	"settings.headingAlign.end.horizontal": "Right",
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
	"notice.compatMode.retired":
		"Compatibility mode was retired in 1.4.0. Opening in Writing/Reading mode instead.",
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
	"notice.sotReadingViewInputRetained": "Not written: the paired Markdown pane is in reading view. The text remains in the input field.",
	"notice.sotPlainTargetChangedRetained": "Not written because the source changed outside this field. The text remains in the input field. If needed, copy it before closing the field.",
	"notice.sotPlainTargetChanged": "Not written because the source changed outside this field.",
	"notice.sotPlainTargetChangedClosed": "The source changed outside this field. The field was closed without writing its text. This input has not been saved.",
	"notice.sotEditingModeFailed": "Could not open: the paired Markdown pane could not switch to editing view.",
	"notice.sotReadingViewWriteBlocked": "Not written: the paired Markdown pane is in reading view. Your input has not been saved.",
	"notice.fileSwitchFailed": "Failed to switch file.",
	"notice.markdownPairMismatchClose":
		"Closing because the paired Markdown view does not match the target file.",
	"notice.layoutChanged.switchedTo":
		"Layout change detected. Switched to {view}.",
	"notice.ruby.enabled": "Ruby display enabled.",
	"notice.ruby.disabled": "Ruby display disabled.",
	"notice.ruby.toggleFailed": "Failed to toggle ruby display.",
	"notice.ruby.singleLineOnly":
		"Ruby is only supported for selections within a single line.",
	"notice.customEmphasis.saveFailed":
		"Failed to save emphasis mark candidates.",
	"notice.bookMode.opened": "Opened book mode.",
	"notice.bookMode.closed": "Closed book mode.",
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
		"TCY supports only 1-4 half-width alphanumeric/!? characters.",
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
		const languages: unknown = navigator.languages;
		if (Array.isArray(languages)) {
			for (const lang of languages as string[]) {
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
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match: string, token: string) => {
		const value = params[token];
		return value === undefined ? match : String(value);
	});
}

export function localizePresetThemeName(
	themeId: string,
	fallbackName: string,
): string {
	switch (themeId) {
		case "default":
			return t("settings.theme.preset.default.name");
		case "ashberry-light":
			return t("settings.theme.preset.ashberryLight.name");
		case "ashberry-dark":
			return t("settings.theme.preset.ashberryDark.name");
		case "dusty-navy":
			return t("settings.theme.preset.dustyNavy.name");
		case "dark":
			return t("settings.theme.preset.dark.name");
		case "paper-like":
			return t("settings.theme.preset.paperLike.name");
		default:
			return fallbackName;
	}
}

export function localizePresetThemeDescription(
	themeId: string,
	fallbackDescription: string,
): string {
	switch (themeId) {
		case "default":
			return t("settings.theme.preset.default.desc");
		case "ashberry-light":
			return t("settings.theme.preset.ashberryLight.desc");
		case "ashberry-dark":
			return t("settings.theme.preset.ashberryDark.desc");
		case "dusty-navy":
			return t("settings.theme.preset.dustyNavy.desc");
		case "dark":
			return t("settings.theme.preset.dark.desc");
		case "paper-like":
			return t("settings.theme.preset.paperLike.desc");
		default:
			return fallbackDescription;
	}
}

export function localizeThemeDescription(
	themeId: string,
	fallbackDescription: string,
): string {
	if (
		fallbackDescription === jaDict["theme.userCreatedDescription"] ||
		fallbackDescription === enDict["theme.userCreatedDescription"]
	) {
		return t("theme.userCreatedDescription");
	}
	return localizePresetThemeDescription(themeId, fallbackDescription);
}
