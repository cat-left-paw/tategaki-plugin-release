# 新執筆モードが写したNyozeのコード

参照元はNyoze（作者の別のアプリ）の main、固定commit `020b5501`（2026-10-22）。設計書（`docs/tategaki-new-mode-design.md`）§10.2・D3の作者の許諾により、Apache-2.0として利用する。Nyozeのファイルは変更していない。写したfileは先頭にSPDX、Copyright、`Origin`、`Local changes`を書く。元のfileへのimportは残さない。

試作（`src/pm-mode-spike/`、Nyozeの`07a64e03`から写した。1.4.0で配布物から外した。`10/22-043`までのgit履歴にある）とは別の写しで、試作のcodeはimportしない。Nyozeの`src/editor-core/features/inputSurface/`は、`07a64e03`から`020b5501`まで変わっていない（2026-10-22に確認）。

| 写し先（`src/wysiwyg/pm-mode/`以下） | Nyozeの元path（`src/editor-core/features/`以下） | Local changes |
| --- | --- | --- |
| `input/surface-state.ts` | `inputSurface/surfaceState.ts`、`localImeHistoryHandoffState.ts`の`readLocalImeAltGraphState` | 名前を`readAltGraphState`へ。純関数はNyozeのまま（新モードの接続は`handoff` / `host-focus`を送らない） |
| `input/composition-intent.ts` | `inputSurface/compositionIntent.ts` | `sameMirrorRange`（`selectionMirror.ts`）を`sameSnapshot`として内に持つ。写し（再変換）はM6 |
| `input/history-chord.ts` | `localImeHistoryHandoffState.ts`の`classifyLocalImeHistoryChord` | 名前だけ |
| `input/edit-owner.ts` | `inputSurface/editOwner.ts` | M2で使うportだけ。`docRef`はowner非依存の`unknown`。受領に新モードの理由を足す |

### M2-2b（入力面・focus・pointer・範囲の表示。2026-10-23）

Nyozeの`020b5501`から写した。いずれも`obsidian/`にあり、先頭に`Origin`と`Local changes`を書いた。

| 写し先（`src/wysiwyg/pm-mode/obsidian/`） | Nyozeの元path（`src/editor-core/features/`以下） | Local changes |
| --- | --- | --- |
| `input-surface.ts` | `inputSurface/inputSurface.ts`。変換の開始・終了の判断は`reconversionState.ts`の`beginReconversion` / `finishReconversion`と`selectionMirrorController.ts`の`noteKey` / `noteInputFinished`の、写しなしの部分 | 写しと再変換（M6）、押し出しの表示（`presentComposition`ほか、M4）、前後の文脈と開始位置の追従（INLINE-2 / 2B、M4）、行内の書式（`surfaceMarks`）、変換の開始時のreveal（M2設計§7.3は確定の後だけ）を除く。ownerは新モードのSourceOwner。親はShadow DOMの中のscroll要素。`paste` / `cut` / `drop`を止める。打鍵で始まっていない変換は、範囲の上では書かず、直前の入力と同じ場所でも書かない（Nyozeの`unmirrored-range` / `keyless-after-input`）。**Nyozeは書かずに捨てるが、新モードは捨てず入力面に保持し、Noticeを1回出す**（J20。Nyozeの範囲には本文の写しがあり捨てる文字は再変換の結果だが、新モードの入力面は空で、その文字は利用者の入力だから）。`compositionend`でDOMが空のときは、確定の前にNyozeの`if (!text() && payload)`の書き込みを行う（`textContent`でなく`replacePayloadIfDifferent`。caretをpayloadの末尾に保つ。M2-2b review 1のR1）。**review 2**: (S3) Nyozeの`restoreRetained`（失敗した周期が、その前に保持した文字へ戻り、新しい文字を捨てる）は写していない。保持した文字と新しい文字を両方残す。pointerdownと`setEnabled(false)`は、直前の入力と直前のキーの印を終える（Nyozeの`invalidate`。pointerの貸し出しの`boundary`から呼ぶ。M2-2cではblurも同じ境界にした）。(S5) 保持した文字があるまま始まった周期の終わりで入力面が空なら、保持した文字を、dataの前へ戻す。(S1) 文字を保持した入力面へfocusが戻るとき、caretを末尾に置く（Nyozeは先頭のまま）。すでにfocusがあるときは動かさない |
| `key-router.ts` | `inputSurface/keyRouter.ts` | Hostへの受け渡し（`handoff`・`focusHost`・I8）、全選択、navigationの操作を除く。ownerのキーはM2-2では止めるだけ（M2-3で中身）。`OWNER_SCOPE_KEYS`（view.scopeへ登録するキー、D9）を足した |
| `focus-safety.ts` | `inputSurface/focusSafety.ts`の`judgeHostFocus`、`focusIntegration.ts`の`onHostFocus` | Hostがない。viewの中へ来た入力面以外のfocusを、同じeventの中で入力面へ戻す（M2設計§6.1）。許可の一覧（`HostFocusPermission`）はない |
| `range-presenter.ts` | `inputSurface/rangePresenter.ts` | 範囲は新モードのPMの表示の選択。ruleはviewのshadow rootの中。highlightの名前は`tategaki-pm-range-n` |
| `preedit-highlight.ts` | `inputSurface/preeditHighlight.ts` | ruleはviewのshadow rootの中。名前は`tategaki-pm-preedit-n`、変数は`--tategaki-pm-preedit-background`。書式の背景と短い横倒しの字の影（M4）を除く |
| `surface-typography.ts` | `inputSurface/surfaceTypography.ts`と、`localImeLocalWindowTypographyParity.ts`の組版のpropertyの一覧 | 書式の印を描かないので、styleは常にtextblockから。ancestorはshadowの境界をまたいで辿る |
| `surface-placement.ts` | `inputSurface/surfacePlacement.ts` | `SurfaceFrozenPlacement`・`surfaceFollowStart`（INLINE-2B、M4）を除く |
| `content-coordinates.ts` | `inputSurface/contentCoordinates.ts` | 式はNyozeのまま。ただしページ拡大率（`transform: scale()`）を足した（新モードのページ枠が拡大率を持つ。Nyozeにない）。viewportの長さは「CSS pixel × 拡大率」で、拡大率1なら値はNyozeと同じ |
| `surface-backdrop.ts` | `inputSurface/surfaceBackdrop.ts` | 式はNyozeのまま |
| `empty-surface-caret.ts` | `inputSurface/emptySurfaceCaret.ts` | 同じ |

試作（`src/pm-mode-spike/`）を参考にして新しく書いたもの（importしない）: `composed-tree.ts`（`composedTree.ts`）、`display-geometry.ts`（`geometry.ts`の`probeCaret`）、`pointer-lending.ts`（`pointerLending.ts`）、`highlight-support.ts`（`diagnostics.ts` / `rangeDisplay.ts`のhighlightの型）。`pointer-selection.ts`・`input-wiring.ts`は新しく書いた（J7・J8）。

### M2-2c（配置・reveal・まとまりの省略。2026-10-24）

| 写し先（`src/wysiwyg/pm-mode/obsidian/`） | Nyozeの元path（`src/editor-core/features/`以下、`020b5501`） | Local changes |
| --- | --- | --- |
| `caret-reveal.ts` | `inputSurface/caretReveal.ts`（137行）、`inputSurface/navigation/scroll.ts`の`revealDelta` | 次の表示frameを1回だけ予約し、実行時に世代・focus・変換中かを読み直す形を写した。PMの`scrolledIntoView`ではなく、CMの`pmModeInput`の`commit`注釈を入口にする。`./navigation/scroll`のimportは持ち込まない。TipTapのEditorView・NodeSelection・`handleScrollToSelection`・ownerの`caretRect`・`caretGeometry`・`pageUpDownNavigation`への依存を除き、新モードの`display-geometry.ts`と明示したscroll要素から求める。M2のcaretはtextだけ。shadow treeのSelectionと入力面のfocusで読み直す。5 viewport pxの余白、ページ拡大率を換算。同じcallbackで配置する（scroll不要でも）。J28: scrollを書いた直後、同じcallbackでcaretの行とその開始辺をまとまり省略の基準へ渡す。辺はscroll前の読み取りと実際のscroll差で求め、scaleを換算。入力がすでにscrollした場合もその辺を保つ。後続のResizeObserverはその行を保ち、利用者の次のscrollで従来の画面先頭の基準へ戻る。timer・所有・完了の推測はない |
| `input-surface.ts`（既存の写しへの追加） | `inputSurfaceIntegration.ts`のblur時の`invalidateMirror` | T2: blurでも直前の入力とキーの印を解く。T3: `selectNodeContents` + `collapse(false)`で複数の子にも末尾caretを置く。§7.4のまとまりresizeの通知は、変換中は保存した行の開始辺の内容座標の差だけを足す。CSS文字列の丸めを累積させず数値を保つ。組版・inline長・親・position・displayは凍結。caretの矩形が取れないときは前の配置と書式を保つ（M2-2b・Nyozeではこの枝でrootの書式だけを書いていた） |
| `surface-typography.ts`（既存の写しへの追加） | 同上のM2-2bの行 | 書式のsnapshotと書くclosureを分け、配置の読み取りをすべて済ませてから入力面のstyleを直接書く。行・書式が同じときはsnapshotの値を再利用し、書式は書かない。変換開始ではNyozeどおり強制して読み直す（review 1 R2。attributeが変わらないstylesheetの変更も拾う）。通常配置だけ行と書式の署名で再利用する |
| `range-presenter.ts`（既存の写しへの追加） | 同上のM2-2bの行 | T5: `comparePoint(ruby, 0)`の常に真の条件を除いた。今のPMのDOMでは`closest("ruby")`だけで範囲先頭がRuby内の親文字の途中にあると分かる理由をコメントに記した |

`display-geometry.ts`（新規実装の続き）: 縦書きでは折り返すspan全体の矩形でなく、その最初・最後の親文字1字の矩形を読む。Rubyの読みを除く。PMの横書き用`coordsAtPos`は縦書きで呼ばない。

### M2-2d（続け打ちとObsidianの選択CSS。2026-10-25）

| 写し先 | Origin | Local changes |
| --- | --- | --- |
| `obsidian/input-surface.ts`（既存の写しへの追加） | 同上のM2-2bの`inputSurface.ts`・変換の開始終了の判断（`020b5501`） | J30: 変換中の229の打鍵からcompositionendを経た次のcompositionstartへ、1回だけ打鍵の意図を渡す。印はendで立て、次のstartで消費し、keydown・input・pointerの境界・blur・disableで消す。既存の純関数でIME機能キー・修飾・snapshotを確かめ、次のstartも確定後と同じsnapshotのときだけ使う。timer・時刻は使わない。Nyozeにはない新モードの差。再変換の拒否と保持は変えない。J31: 変換を終えたcodeがEnter・NumpadEnter・Escape・Backspace・Deleteなら、この印を立てない（NyozeにはないJ30の手渡しを文字のキーへ絞る）。**H24（2026-11-06、下の「H24」の節）で、J31のうち`keyless-after-input`の判定に及んでいた分は、確定の直後の印の有効化の規則に置き換わった**（J30の印とJ31のcodeの絞りは残る） |
| `obsidian/surface-typography.ts`（既存の写しへの追加） | 同上のM2-2bの`surfaceTypography.ts`（`020b5501`） | J33: Nyozeが写すtext-align・text-align-lastを写さず、入力面では常にstartとする。見出しの中央／末尾寄せを二重に掛けない。配置のtext-indentは変えない |

`obsidian/styles/stylesheet.ts`: 本文rootを明示して選択可能にする。J7の余白から本文へのdragも保つため、新モードのshadow hostにも指定する（Obsidianのbodyは選択不可）。試作の`styles.ts`を参照しただけでimportしない。rt・折りたたみのつまみの選択不可は保つ。

### M2-3a（削除とEnter。2026-10-26）

`obsidian/caret-reveal.ts`（M2-2cの既存の写しへの追加）: 入口のCM注釈をcommitだけからdelete・enterにも広げる。選択だけのEnterも1回の表示frameへ渡す。NyozeのPMのscroll要求とは異なり、SourceOwnerの操作の注釈を読む。所有・完了・focusの判断にframeは使わない。

`source-owner.ts`・`display-selection.ts`・`key-notice.ts`は新モード用の実装。Nyozeからの新しい写しはない。既存の純関数planDeletion / planEnterを使い、確定と同じCMの安全網・適用後の照合・checked.after / checked.optionsの再利用へ通す。K2のNoticeは理由と選択・文書・接続を基準に抑止し、timerは使わない。J19 / J26を削除・Enterにも適用し、J27は範囲のshownSpanの中だけを調べる。全選択は、frontmatterを除いた編集対象のsource全体を調べる。M1で埋め込みの!だけが出る場合も、空alias自体が塗られたとは数えない。B15のblock選択は確定・Enterでは後ろへ挿入するが、削除では塗れないblock自体を消すため拒否する。

M2-3aラウンド2（2026-10-26、レビュー1）: `key-router.ts`のLocal changesに、Shift+Backspace / Shift+Deleteのscope登録（D9）と、保持文字の削除を始めたkeydownを覚え、空になった後の同じキーのrepeatだけを止めるK8を追加した。このrepeatの扱いはNyozeの写しにない新モードの差。押し直し（repeat:false）でそのキーの印を解く。K2のNoticeはpointerdown・別のキー・確定・選択の変化・入力面のblurで解く。K7の空の計画はJ6と同じ選択専用の監査を使い、本文が変わらない選択/注釈の差はCMを正として診断の件数へ記録し、本文が変わればD26。入力の純関数・入力面の変換周期は変更しない。

### M2-3b（Undo・Redo・E4。2026-10-26）

`history-command.ts`と`composition-recovery.ts`は新モード用の実装で、新しい写しはない。K3: CMのundo / redoをpaired leafへそのまま呼び、同期の間に全transactionの数とhistoryの両方の深さを照合する。計画の安全網は掛けない。`caret-reveal.ts`のLocal changes: 注釈のないCMのhistoryは、同期の実行中の印をrevealの入口へ渡す。外からのUndoにはこの印を付けない。K4: E4はmode切替ではなくcommand paletteから入り、同じ入力面・変換周期の2回目に確認のmodalを出す。保持文字のある周期は対象外。捨てる処理と遅いcompositionendの抑えは既存のNyozeの写しのまま。`key-router.ts`のLocal changes: K8の印をblur・pointerdown・別のキー・compositionstartでも解き、freshなkeydownでの解除を変換中の早い戻りより前へ置いた（S1）。timer・時刻は使わない。

M2-3bラウンド2（2026-10-27、レビュー1）: K9は、同期のtransactionが1回であることを保ち、historyの受け取る側がちょうど1増え、出す側が1以上減ることを照合する。CMがmappedの空の段を落としても止めない。K10のLocal changes: 新モードのowner/保持中のrouterは`obsidian/history-keys.ts`のプラットフォーム別の判断を共有する。MacはCmd+Z / Cmd+Shift+Z、それ以外はCtrl+Z / Ctrl+Shift+Z / Ctrl+Y。M2-1で写した`input/history-chord.ts`の`classifyHistoryChord`（NyozeはCmd/Ctrlの両方）とは違い、MacのCtrl系・それ以外のMeta系ではCMのhistoryを動かさない。input/の元のコメントは変更せず、この差をここへ記録する。作者の2026-10-27追記に従い、全候補のOWNER_SCOPE_KEYSからownerScopeKeys(mac)で登録列を作り、MacのCtrl+Yを除く。MacではCmd系の2件、それ以外ではCtrl系の3件だけをhistoryキーとして登録し、MacのCtrl+Z・Ctrl+Yに割り当てたappのhotkeyは止めない。R2のLocal changes: K8の印を解く「別のキー」から`isModifierOnly`の修飾キーだけのkeydownを除く。R6のLocal changes: 保持文字があるときのプラットフォーム別のhistoryキーはdefaultと伝播を止め、ownerへ渡さない。R5は、開始時の保持文字でE4を拒否した周期に理由のNoticeを1回出す。新しい写しはない。

### M2-3c（操作列・性能の記録。2026-10-27）

新しいNyozeの写しはない。Local changes: `history-command.ts`は、K9の深さとtransaction 1回に加え、同期dispatch中のtransactionが要求した向きの`tr.isUserEvent("undo" / "redo")`であることも照合する（M2-3bレビュー2 S1）。`source-owner.ts`はpaired CMのwindowではなく、新モードのsessionを作るwindowから渡したMac判定を使う（S2。scope・routerと同じ出所）。Nyozeとの差であるK10のキーの分け方と、CMのhistory groupingは変えない。入力面・入力の純関数・listの継続の処理も変更しない。

ラウンド2（2026-10-28、K13）のLocal changes: 本文の変更が空のhistory transactionは、1回・要求した向き・出す側1段以上減ることを保ったまま、受け取る側が増えない場合も許す。本文を変えるtransactionには受け取る側+1を引き続き求める。相殺された入力と削除をCMのgroupから切り離さない。SourceOwnerBindingには、sessionがmacを足して写すためgetterやthisに依存しない値を使う旨のコメントを加えた。

ラウンド3（2026-10-28、K14(a)）のLocal changes: CMのundo / redoへstateとdispatchの受け口を渡し、CMが作ったtransactionのchanges.emptyを、viewへ渡す前に確かめる。K13の受け取る側0の許しは、CMが作った変更も、viewで観測した変更も空の場合だけに限る。観測のtransaction 1回・向き・出す側1段以上減の照合は保つ。dispatchの差し替えが途中で変更だけを落とした場合はD26で止める。historyのまとまり・input/は変更しない。

ラウンド4（2026-10-29、K15(a)）のLocal changes: CMが作ったUndo / RedoのchangesをtoJSONの文字列としてdispatch前に保存し、同期のupdateで観測したchangesと一致することも要求する。空にされた変更に限らず、同じ長さの別の変更へ差し替えられた場合もD26で止める。K13の受け取る側0の許しはCMが作った変更が空の場合だけ。transaction 1回・要求した向き・K9の深さ、CMのhistory grouping・filter:falseの経路は保つ。

試験の正解はM2-1の見える文字モデルをexportして共有する。作者の2026-10-27の補足に従い、表示は通常行でも現行のlist継続関数が続きを返す字下げ行をpreserveで検証し、単発の総当たりの型を2つ増やす。字下げを残して定義リスト・画像だけの行へ変わる拒否も、既存のdeflist / image-lineの理由として正解側で数える（製品は変えない）。これはNyozeの入力規則の変更ではない。

### M2-4a（gateの準備。2026-10-29）

新しいNyozeのcodeの写しはない。開発用の入力記録は、`tests/pm-mode/ime-records.json`（1.4.0で`tests/pm-mode-spike/`から移した）（Nyozeの物理keyboardの記録の、作者が許可した抜粋）のtype / key / code / keyCode / data / inputType / anchor / headに合わせた。Local changes: textはCM文書全体ではなく入力面の文字だけ。composingはisComposingのbooleanで、isTrusted / timeStamp・修飾キー・repeat、順序・経過ms、製品の判断のchannelとpayloadを加える。記録していない間は既存のrecord呼出しが何もしない口へ届くだけで、recorder・event listener・JSON変換・writerは呼ばれない。記録・見張りはeventを聞くだけで、入力の判断・書込み・focus・選択・historyは変えない。

## 試作（⑬、M1の行内の読み方。2026-10-23）

M1の読み方をNyozeへ寄せる試作（作者の判断の⑬、A案）は、Nyozeの main `0e4e68b3`（2026-10-22）の読み込みの2つのfileを写した。M1はまだ使わない（`tests/pm-mode/M13-PROTO-REPORT.md`）。

| 写し先 | Nyozeの元path | Local changes |
| --- | --- | --- |
| `tests/pm-mode/m13-commonmark-inline.ts` | `src/editor-core/io/rescueOrphanDelimiters.ts`、`src/editor-core/io/fallbackEmphasis.ts`の`INLINE_PATTERN_WITH_EMPHASIS_REGEX`（強調の枝）、`escapedStarMask.ts`の考え方 | markdown-itのtokenでなく、Lezer（`@codemirror/lang-markdown`）の行内の要素から作ったtokenの上で動かす。sourceのoffsetを保つ。下線（`\|\|`）の枝を除く |

## このrepoの中からの写し

| 写し先 | 元 | Local changes |
| --- | --- | --- |
| `input/ordered-list.ts` | `src/wysiwyg/sot/sot-list-enter.ts`の`collectOrderedListRenumberChanges`ほか（`3b2c3dd`） | 番号付きリストの最初の番号を保つ（M2-1 review S6）。行と種類を配列で受け取る。元のfileは変えていない |

## 写さなかった部分と、その代わり

- `inputSurface/deletionRules.ts`・`deletionGuard.ts`・`hostOwner.ts`（PMを編集する規則と安全網）は写していない。新モードはPMを編集せず、CMのsourceを編集する。規則は設計書（`docs/tategaki-new-mode-m2-design.md`§5）に沿って`input/source-*.ts`に新しく書いた（意味はNyozeに合わせ、違いはD30として記録）。

## 試作C（L9b、⑬の区切り解決。2026-11-01）

M1はまだ使わない。新しい依存は追加せず、localにあるmarkdown-it 14.2.0の元fileを写した。

| 写し先 | Origin | Local changes |
| --- | --- | --- |
| `tests/pm-mode/m13c-delimiters.ts` | markdown-it 14.2.0 `lib/rules_inline/balance_pairs.mjs`、`emphasis.mjs`・`strikethrough.mjs`のpostProcess（MIT、Copyright 2014 Vitaly Puzrin, Alex Kocharin） | TypeScriptの型、linkごとの区切りの列、元のUTF-16位置を保持。strongへまとめる際は両方の記号の位置をまとめる。対の探索・rule of 3・jump・余ったtildeの後処理は維持。`loneMarkers.pop()`がundefinedならloopを抜ける型の検査を追加（非nullの表明は使わない）。markdown-itのruntime importなし |
| `tests/pm-mode/m13c-inline.ts` | 同版`state_inline.mjs`の`scanDelims`、`emphasis.mjs`・`strikethrough.mjs`のtokenize（MIT）。Nyoze `src/editor-core/io/{rescueOrphanDelimiters,fallbackEmphasis,escapedStarMask}.ts` @ `0e4e68b3`（Apache-2.0、作者許諾） | 区切りのtoken化と左右の判定を位置配列へ適用。Unicode P/S・Zsで句読点と空白を判定。Nyozeの救済とfallbackはA案の位置を保つ写しを共有元として変更せずコピーし、下線の枝は除外。code・link・escape・autolink・HTMLの境界だけは既存Lezerを使い、Lezerの強調・取り消し線の対は使わない。highlightはNyozeのfallback（pluginはない）。行の関数で、数式・コメントの読まない範囲、entity・codeの空白の正規化はまだない |

MITの著作権と許諾全文はrepo rootの`NOTICE`に記載する。これは行内の読みの試作だけで、M1・入力の網・正解のモデルを変更しない。

## M1-6a（製品の行内の読み方、2026-11-02）

M1の`line-segments.ts`は次の読み方を使う。`source/inline-formatting.ts`は削除せず、旧Vの読みの説明・差分・費用の比較用に残す（M1からの呼出しはない）。試作A・Cも変更しない。

| 写し先 | Origin | Local changes |
| --- | --- | --- |
| `source/inline-delimiters.ts` | `tests/pm-mode/m13c-delimiters.ts` @ `7e0c8a9`経由、markdown-it 14.2.0 `balance_pairs.mjs`・`emphasis.mjs`・`strikethrough.mjs`（MIT） | 製品用の名前。対の解決・安全なpopの検査は試作と同じ |
| `source/inline-reading.ts` | `m13c-inline.ts` @ `7e0c8a9`、Nyoze `io/{rescueOrphanDelimiters,fallbackEmphasis,escapedStarMask}.ts` @ `0e4e68b3`（Apache-2.0）。markdown-it 14.2.0 `state_inline.mjs`のscanDelims、`emphasis.mjs`・`strikethrough.mjs`のtokenize、`backticks.mjs`・`escape.mjs`・`html_inline.mjs`（MIT） | Lezerを使わずM1 collectorの範囲を受け取る。本文の行頭だけを読み、link文字の区切りを分離。隠れる記法・数式・同じ行のコメントを不透明にする。backticksは長さごとの失敗cache、escapeはASCII句読点とsurrogateの処理、html_inlineはtag境界だけを採用。codeの両端の空白とescapeのslashは隠す。entity・下線は読まずsourceを保つ（D-M16-1〜4）。escapeしたASCII句読点はすべて位置で保護し、fallbackが~・=を読み直して隠すことも防ぐ（NyozeとのD-M16-4の意図した差）。Nyozeの救済・fallbackの方針は維持 |
| `source/inline-html.ts` | markdown-it 14.2.0 `lib/common/html_re.mjs`（MIT） | 正規表現をTypeScriptのexportへ。tagは文字として見せる |

markdown-itをruntime importせず、依存を追加しない。MITの全文・著作権はrootの`NOTICE`を参照。

## M3a（keyboardの選択、2026-11-05）

固定commit `020b5501`を`git show`で読んだ。Nyozeのworking treeは変更していない。写し先は`obsidian/navigation/`。selectionだけをCMのSourceOwnerへ渡し、PMの本文とDOMのSelectionは変更しない。

| 写し先 | Nyozeの元（`src/editor-core/features/`以下） | Local changes |
| --- | --- | --- |
| `navigation.ts` | `inputSurface/navigation/navigation.ts` | dispatchを既存の`SourceOwner.select`へ。flat↔chunkedの位置、両端のhint、正規化を通す。出所の注釈はCMのtransactionExtenderで同じtransactionへ付け、同期の通知でgoal・affinityを保つ。状態はviewごと。NodeSelection・GapCursor・Hostへのfocus・Nyozeのscrollは持ち込まない。**ラウンド2の違い（R2-2）**: 字の矢印のaffinityを、前へ（文書の末尾の向き）は`end`、後ろへは`head`にする（折り返しの位置で、前へ進むとcaretは列（行）の末尾、戻ると次の列の頭に見える。Obsidianの編集画面と同じ）。Nyozeは字の移動で常に`head`。**R2-10**: `closeRange()`を足した（範囲・全選択をheadのcaretへ閉じる。CodeMirrorの`simplifySelection`と同じ。Nyozeに同じ操作はない）。PageのRound 2の違いは`page.ts`の行。**ラウンド3・4の違い（R3-2・R4-1、作者の判断H13・H14）**: 範囲でgoalがまだないとき、Nyozeはgoalを`head`の側（下流）のcaretの矩形から取る（NyozeのcommentはChromiumのnativeの観測という）。ここでは、範囲の作り方（行の端の操作・字の移動・pointer）を問わず、goalを行の起点と同じ上流（`end`）のcaretの矩形（`current.rect`）から取る（折り返しの位置にheadがあるとき、headは行の末尾に見えている）。理由: Nyozeのままだと、折り返しの位置の直後のShift+↓の1打目が何も書かず、2打目で動く。nativeのChromium（同じ折り返しで観測）とVは、行の端の操作で作った範囲でも字で作った範囲でも、1打目で次の行の末尾へ動く（報告§14・§15）。R3-2では行の端の操作で作った範囲だけ（`edgeRange`）を直し、R4-1で条件を外した。 |
| `rules.ts`・`key-operation.ts`・`writing-mode.ts` | `inputSurface/navigation/rules.ts`・`keyOperation.ts`、`writingModeNavigationMapping.ts` | H3のキー表・軸・goal・anchorで一度止まる規則は維持。importと型の境界を新モードへ |
| `characters.ts`・`ruby-boundary.ts` | `inputSurface/navigation/characterNavigation.ts`、`rubyBoundaryArrowNavigation.ts`の純関数 | schema名をruby/tcyへ。Intl.Segmenterで書記素を区切る。TCY・脚注参照の途中とRubyの重複した内側端を停止位置から除く。探索前にもRubyの同じ見た目の端を揃える。Selection.nearでatomの選択を作り得る枝は写さず、見える隣のlineへ進む。範囲のanchorを停止位置から消さず、文末のanchorにも戻れる。Rubyの親文字の途中を広げない。NodeSelectionは作らない |
| `line-geometry.ts`・`read-batch.ts` | `inputSurface/navigation/lineGeometry.ts`・`readBatch.ts` | R3-1: `blocksBeyond`（見えない位置の先の見える行を、文書の順に近い順に返す）を足した。**R4-2**: `position()`が、行の末尾の位置を`end`のaffinityでも候補に数える（Nyozeは`head`だけ。折り返す行の末尾は次の行の頭と同じ位置で、`head`では次の行に属すので、goalが行の右端（下端）のとき最後の字の手前で止まった。候補ごとにaffinityを持ち、同じ距離なら`head`を選ぶ）。見えるlineだけ。読み取り専用のPM root自身のcontenteditable=falseを除外の対象にしない。位置のhit testはShadow DOMの補助。書込みの前にcacheを解く。non-null assertionは使わない。`read-batch.ts`は字下げをtabにし、`values.get(key)!`を`as V`にしただけ（importも他の変更もない） |
| `writing-mode.ts` | `writingModeNavigationMapping.ts` | 字下げをtabにしただけ（関数・矢印の対応表（B9）はNyozeと同じ） |
| `geometry.ts` | `inputSurface/navigation/caretGeometry.ts`の矩形の算術 | caretの読みは既存のdisplay-geometry.tsを1つだけ使う（M2-4d F6を維持）。Nyozeのcaret読取・GapCursor・pseudo-caretの枝は写さない。既存の読取へhead/end affinityを足す |
| `home-end.ts`・`ruby-visual-edge.ts` | `homeEndNavigation.ts`のfocuslessの規則、`rubyHomeEndVisualEdge.ts` | 表示端→論理端、B6を保つ。段階はviewごと。Selection.modify・Hostのfocus・module globalは除く。Rubyの表示端も同じcaret読取を使う |
| `page.ts` | `pageUpDownNavigation.ts` | **ラウンド2（R2-3）**: 当たった位置は、呼び出し側が渡す`accept`（書込みと同じ「見える位置になるか」の規則）を通るものだけ受け取る。どの点もだめなら、同じ軸の座標でページの向きに6 pxずつ進み、viewportの中で最初に見える位置になる点を使う（水平線の並び・高い部品の上。Nyozeは最初の当たりをそのまま使う）。それもなければ（R3-1）、当たった位置（点の下に文字がない部品なら、その部品の位置。それもなければcaretの位置）から文書の順でページの向きの次の見える行の端（前へ進むなら行頭、戻るなら行末）へ`select`の口1回で寄せる（revealがscrollする）。先に見える行がなければscrollを戻して書かない。pageの計画と点のclampを写す。scroll要素は明示した新モードのもの。CSS scroll量とviewport座標を混同しない。shadow内の点を読む前に、当たったchunkの子の組版を読む。A3のscrollだけ、B4のanchorの保持を維持。端はNyozeのno-opで、Vとの違いを記録する |
| `all-selection.ts` | `inputSurface/navigation/allSelectionProjection.ts` | 見えるlineの最初〜最後へ投影する。CMの全選択は補足後のD-M3-6どおり別のSourceOwner入口から0..長さをhintなしで1回書く。Shiftで作った後ろ向きの全範囲もCMの向きを保って投影する。表示の投影は編集の許可にしない |

**ラウンド2の接続の変更**: `display-geometry.ts`の`readCaretRect`は、affinityが`end`のとき、`end`の矩形と`head`の矩形が同じ行（列）にあれば`head`の矩形を返す（TCY・脚注の番号など大きさの違う字の隣で、折り返しでない位置の矩形を変えない。判定は`line-geometry.ts`の`belongs`と同じ式）。`input-wiring.ts`は、collapsedのとき入力面の配置をnavigationのaffinityで読む（R2-1。Nyozeの`insertionCaretRect`→`caretRect`と同じ。範囲は`from`・`head`側のまま）。`key-router.ts`の`escape`と、`pm-mode-view.ts`の`window`のcaptureのEscape守りからの呼び出し（R2-10。R3-4: `try { escape } finally { stopPropagation }`で、閉じる処理が投げても止める。守りがEscapeを止めるため、surfaceのkeydownには届かない。変換中・保持文字・collapsedは何もしない）。

新しく書いた接続: `normalize.ts`（pointerと同じ正規化にRubyの同じ見た目の内側端→外側端を足す）、`point.ts`（D21のshadow補助と対象chunkの組版の読取）、`origin.ts`・`scope-keys.ts`。`key-router.ts`は、保持文字・IME・K8/L14を変えず、H3のnavigationとMod+Aを足した。`PmModeView`は今の書字方向で処理するキーだけをscopeへ登録する。revealは既存の表示frameを使い、navigationの注釈の後はheadを見る。範囲の入力面の配置はfromのまま。

試験: `tests/pm-mode/m3a-units.ts`はNyozeの`tests/pis-s3.test.ts`の主張を新モードのschemaへ移したもの。`m3a-compare.cjs`は`tests/e2e/pis-s3-navigation-diag.spec.ts`の文書×方向×位置×キー×範囲×続けた押下の比較の形を参考にし、基準を本物のVとCMに替えた。Nyozeのmac実キーの90件を新モードの実機の証拠とは扱わない。

## M3b（pointerの仕上げと範囲の表示、2026-11-05）

読んだ元は2つ。固定commit `020b5501`より**後**のNyoze `c63cd4a0`（PIS-RANGE-DISPLAY1、2026-11-04、「Match the native selection colors and show selected newlines in long-document mode」）を`git show`で読んだ（Nyozeのworking treeは変更していない）。もう1つはこのrepoの試作`src/pm-mode-spike/rangeDisplay.ts`（S1の(6)、矩形layer。importしない）。余白のclickの重ね・triple click・Shift付きのclick・脚注の番号からのdrag・popoutの結び直しはNyozeの`020b5501`にも`c63cd4a0`にもなく、新しく書いた。

| 写し先 | 元 | Local changes |
| --- | --- | --- |
| `obsidian/range-overlay.ts`（改行の帯） | Nyoze `inputSurface/rangeNewlines.ts`・`rangeNewlineBands.ts` @ `c63cd4a0`（Apache-2.0） | 改行の位置の並びは、PMのtextblockではなく新モードの`line`のblock（表示される本文の行の末尾。`state.blocks`から）から作る。hr・fenceの行は帯でなくatomとして描く。帯の矩形は既存の`display-geometry.ts`の`readCaretRect`で読む（Nyozeの`caretGeometry.ts`は写さない）。**styleの直接代入（`Object.assign(layer.style…)`・`band.style.left = …`）は使わず、`setCssStyles`（変わった値だけ）と`setCssProps`（色）**。scale付きの内容の座標。`requestFrame`は`caret-reveal.ts`の表示のframeへ（新しいrAFを持たない）。選択の写しの直後に同期でも描く。矩形の読みは改行ごとにcacheし、docか配置が変わったときに消す。上限300は同じ |
| `obsidian/range-overlay.ts`（atom・矩形layer） | `src/pm-mode-spike/rangeDisplay.ts` S1(6) | 描く矩形は範囲の本文のtextのRangeを`TreeWalker`で走査して得る（試作と同じ）が、前後1画面だけでなく範囲の全部を内容の座標で持つ（scrollで描き直さない）。上限は4000矩形と`sot-selection-policy.ts`の大きさ。atom（部品・水平線・fenceの行・frontmatter・行内の数式）は、その外接矩形を選択の色の薄い膜で重ねる（H4 (b)。Nyozeにも試作にもない） |
| `obsidian/range-presenter.ts` | Nyoze `inputSurface/rangePresenter.ts` @ `c63cd4a0`（Apache-2.0） | 選択の文字色をplatformで分ける: macOSは`color`を書かない、Windows・Linuxは`HighlightText`（`::selection`が色を決めていればその計算値）。`readSelectionPaint`として切り出し、帯・膜の色（`::selection`の背景）と共有する。Nyozeの`isShown`・`subscribe`は写さない（表示の事実は`paintRange`が1つ持つ）。windowは使うときに読む（`highlightWindow(host)`） |

新しく書いた接続: `pointer-lending.ts`（H5: 余白で始まった2回以上のclickは選択を置かない。クリックの回数は`pointerdown`の`detail`が常に0なので、同じgestureの`mousedown`の`detail`。D-M3-14: 3回以上のclickはclickした行の本文の最初〜最後。**Chromiumはこのgestureの選択をPM rootに作らない**ので自前。D-M3-13: Shiftはpointerdownで貸し出しを始め、離したときCMのanchorを残してheadを座標で置く。D-M3-11: 脚注の番号から始まって動いたgestureは、はじめの位置と離した位置の2点から作る）、`caret-reveal.ts`（表示のframeに合流する`requestDisplay`）、`pm-mode-view.ts`（R3-1: leafを新しいwindowへ移すとObsidianはviewを作り直さず、`ShadowRoot.getSelection()`が古いwindowのままになる（`getComposedRanges`もObsidianのChromiumにない）ので、移したと気づいたら`setViewState`を2回呼んで、そのwindowで開き直す。保持文字・変換中のときは開き直さず知らせる）。R4-1: 保持文字（書込みが拒否されて入力面に残った字）は、開き直した新しいviewの入力面へ、書かれなかった理由ごと引き継ぐ（`input-surface.ts`の`retainedState`・`adoptRetained`）。R4-2: popout windowのEscは、Obsidianが複製してmain windowへ送り、main windowのworkspaceのEscape処理がfocusを動かすので、`view.scope`のEscapeを、入力面にfocusがあり変換中でないとき`false`で答える（Vの`registerEscapeKeymap`と同じ道）。R4-3: タブを切り替えるcommandのhotkey（`tab-switch-keys.ts`。Obsidianの`hotkeyManager`から読む）を`view.scope`で受け、変換中は見えている間に入力面のfocusを外してから同じcommandを実行する。M3d: R-D1（変換中のEscも`false`。Vと同じ）、R-D2（同じ道に、leafを閉じる・前面に新しいタブを出すcommand `workspace:close`・`close-window`・`close-tab-group`・`new-tab`を足した）、R-D4（`isPmModeWritablePath`はvaultの`.md`のpath。`diagnostics/`の入力記録は`isPmModeSamplePath`で試料だけのまま）。試験は`tests/pm-mode/m3b-browser.cjs`・`m3b-mutations.cjs`。

## M3c（見せ方: 擬似キャレット・現在行の帯・視覚フォーカス・Typewriter・保持文字の色、2026-11-05）

読んだ元は3つ。固定commit `020b5501`のNyoze（`pseudoCaretSource.ts`・`pseudoCaretGeometry.ts`・`pseudoCaretOverlay.ts`・`pseudoCaretController.ts`の入力面の枝・`pseudoCaretWiring.ts`）、固定commitより**後**のNyoze `38750b33`（PIS-RETAINED-TEXT-COLOR1、2026-11-05、「Show text left in the long-document input box in a red tone」。`retainedDisplay.ts`）、このrepoの現行の執筆・参照モードV（`src/wysiwyg/sot-wysiwyg-view.ts`と`src/wysiwyg/sot/`）。Nyozeのworking treeは変更していない（すべて`git show`）。H7 (b)のとおり、Typewriter・現在行の帯・視覚フォーカスの**計算はVの純関数をimport**し、配線はNyozeの入力面の枝の形で新しく書いた。Nyozeの`typewriterMode.ts`・`visualFocusCurrentLine*.ts`・`visualFocusBlockDecoration.ts`は写していない。

| 写し先 | 元 | Local changes |
| --- | --- | --- |
| `obsidian/pseudo-caret.ts` | Nyoze `inputSurface/pseudoCaretSource.ts`の`isInputSurfacePseudoCaretLive`、`pseudoCaretGeometry.ts`の`buildPseudoCaretShape`・`PSEUDO_CARET_MIN_LENGTH_PX`、`pseudoCaretOverlay.ts`（向き・点滅・隠す）、`pseudoCaretController.ts`の入力面の枝（`resolveDomCaretViewportRect`: 変換中・保持文字のcaretは入力面のDOMの選択から）@ `020b5501`（Apache-2.0） | 重ねる要素は`.editor-surface`でなくscrollの要素の子（内容の座標。ブラウザが本文と一緒に動かす）。矩形は`setCssStyles`（変わった値だけ）、色は`setCssProps`（styleの直接代入は使わない）。表示・非表示は属性（CSSの`display: none`）。入力面が空で静かなcaretは、入力面の配置と同じ`readDisplayCaret`（`display-geometry.ts`）で読む。変換中・保持文字は入力面のDOMのcaret（shadow rootをまたぐ`composed-tree.ts`）で、読めなければ表示のcaret。**範囲では描かない**（Nyozeの`surface-range`かつ変換中の枝は写さない。D-M3-17）。入力面のnative caretは描いている間だけ属性で透明にする。点滅はCSSのanimation（`steps(1, end)`）。設定の有効・無効（Nyozeの`getEnabled`）はなく、太さ・色は現行の`caretWidthPx`・`caretColorMode`・`caretCustomColor`。Nyozeの折り返し境界のaffinity選び（`pickVerticalWrapBoundaryRect`・pointerの意図）は写さない（M3aのaffinityで表示のcaretが決まる）。rAFは持たない（`display-visuals.ts`の1つのjobが表示のframeに乗る） |
| `obsidian/display-visuals.ts` | Nyoze `inputSurface/pseudoCaretWiring.ts`の`createInputSurfaceDisplayCallbacks`（表示の変化と変換の更新を、擬似キャレット・視覚フォーカス・Typewriterへ渡す順序）@ `020b5501` | Nyozeは3つのcontrollerがそれぞれのrAFを持つ。ここでは1つのjobが`caret-reveal.ts`の表示のframe（`requestDisplay`）に乗り、読み取りをすべて済ませてから書く（scroll → caret・帯 → native caretの属性 → 視覚フォーカスの属性 → PMのdecoration）。新しいrAF・timerなし |
| `obsidian/current-line.ts` | V `sot-wysiwyg-view.ts`の`getLineVisualRects`（V:15972-16011）・`mergeVisualLineRects`（V:16043-16097）・`updateCurrentLineVisualOverlay`（V:14693-14721）と、Vの純関数`sot/sot-current-line-visual.ts`（importする） | Vは帯を`el.style.left = …`で書く。ここでは`setCssStyles`（変わった値だけ）で内容の座標へ。行の文字は`rt`・`rp`（Rubyの読み）を除く。変換中・保持文字のときは入力面の文字のrectが候補に加わる（Vの`usePendingCaret`） |
| `obsidian/focus-block.ts`・`pm/decorations.ts`（`focusLineDecorations`）・`pm/view.ts`（`setFocusBlocks`） | Vの`refreshFocusVisualState`（V:14644-14671）と、Vの純関数`sot/sot-focus-visual-state.ts`・`sot-focus-block-resolver.ts`（importする） | 選択はCMの主選択、行の番号は表示の状態の`lineRanges`から。「焦点のblock」の決め方（段落は現在の行だけ、見出し・code fenceの中などはblock全体）はVのまま。描くのは表示PMのnode decoration（class）と、scrollの要素の属性`data-tategaki-pm-focus`。PMの`Plugin`の`props.decorations`で、表示のdecorationとPM自身が合成する。ブロック数が変わらない編集は同じupdateの中で付け直す |
| `obsidian/typewriter.ts` | Vの追従（V:11913-11940）・抑止の印（V:867-910）・末尾の余白（V:1585-1598）と、Vの純関数`sot/sot-typewriter-scroll.ts`・`sot-typewriter-suppression.ts`・`sot-scroll-past-end.ts`・`sot-typewriter-availability.ts`（importする） | 抑止は1回きりの印で、時間の窓は使わない。**印は1つの表示のframeの間だけ有効**（キーが何も動かさなかったときに、後のキーを抑止しない）。Vの`isScrolling`などは「scrollは追従を頼まない」ので、Vのjump-or-collapseの印（fold）は「foldは追従を頼まない」ので持たない。追従はrevealの1回のstepの中（`caret-reveal.ts`の`follow`）で決め、2回scrollしない（D-M3-8）。変換中は表示のjobが入力面のcaretで追従。**末尾の余白**はVのrootのpaddingでなく、最後のchunkの後ろの`widget` decoration（`pm/decorations.ts`の`tailSpacerDecorations`）: 新モードのrootはviewと同じ幅で、chunkがはみ出すので、rootのpaddingでは長さが増えない |
| `obsidian/display-settings.ts` | Vの`resolveCaretColor`（V:1632-1646）、`caretWidthPx ?? 3`（V:11381）、`sotTypewriter*`のkeyと既定（V:11913-11932、14644-14660、`sot-focus-visual-style.ts`） | 新しいkeyなし。viewを作るとき・設定が変わるとき（`session.updateSettings`）に1つの値へ読む。plain text viewではTypewriterの族を使えない（`resolveSoTTypewriterAvailability`） |
| `obsidian/retained-display.ts`・`input-surface.ts`・`surface-typography.ts`・`styles/stylesheet.ts` | Nyoze `inputSurface/retainedDisplay.ts`（梯子・コントラスト4.5・述語・属性を付け外しする1つの関数）、`inputSurface.ts`（`settleRetained`: 入口を抜けるときに1回だけ合わせる）、`surfaceTypography.ts`（下地を読む所で色の変数を書く）、`styles.css`（固定の規則）@ `38750b33`（Apache-2.0） | 属性は`data-tategaki-pm-retained`、変数は`--tategaki-pm-retained-color`。新モードには写しの種類（mirror）がないので述語から`kind`を除いた。`failure`の代入ごとには付け外ししない（Nyozeの修正のとおり） |

新しく書いた接続: `input-wiring.ts`（表示のjobへの通知、Home・End・Page・文書の端の印、設定の変更の受け口）、`session.ts`（設定を読む）、`caret-reveal.ts`（`follow`: revealの1回のstepでTypewriterの追従を使う）、`pm/prosemirror.ts`（`Plugin`の輸出）、`styles/stylesheet.ts`（擬似キャレット・帯・視覚フォーカスのCSS）。

試験: `tests/pm-mode/m3c-units.ts`（保持文字の色・述語、設定、Typewriterの計画、キャレットの形、行・blockの索引）、`m3c-browser.cjs`・`m3c-browser-entry.ts`、`m3c-mutations.cjs`。Nyozeの`tests/pis-retained-text-color1.test.ts`の主張（梯子・4.5・述語・属性の切り替え）を同じ形で移した。

### M3cラウンド2（2026-11-06）で変えた所

- `obsidian/caret-reveal.ts`・`display-visuals.ts`・`range-overlay.ts`・`input-wiring.ts`: 表示のframeを読む段と書く段に分けた（R2-5）。revealの読み・jobの読み・範囲の層の読みを先に済ませ、書きはその後（reveal → job の順）。`obsidian/surface-placement.ts`の中は変えていない。
- `display-visuals.ts`: 視覚フォーカスをjobから出した（`createFocusVisual`。R2-4・R2-5）。選択の写しと同じPMの更新で描く。Vの`refreshFocusVisualState`（V:14644-14671）は、focus・pointerの条件を持たない。
- `display-visuals.ts`・`current-line.ts`: 帯の「同じ視覚行」の閾値はルートの文字の大きさ（Vの`getEffectiveFontSize()`）、帯を出す条件はVの`active`と`currentLineIndex`（P3-6）。
- `display-settings.ts`: `caretWidthPx`が0以下のとき3にする（意図した差。Vは`?? 3`。P3-6）。
- `navigation/page.ts`・`navigation/navigation.ts`: Typewriterの末尾の余白の長さを受け取り、PageDownが余白の中へ進まないようにした（R2-7）。Vの純関数`sot/sot-scroll-past-end.ts`の`clampSoTPageDownDelta`をimportする（写していない）。余白がないとき（Typewriterを切っているとき）は今までと同じ。
- `pm/view.ts`・`pm/prosemirror.ts`・`pm/decorations.ts`: M3cで`pm/`の層を触った。`Plugin`の輸出、`setFocusBlocks`・`flushFocus`、末尾の余白の要素を`obsidian/`から渡す口（`createTailSpacer`。R2-6: `pm/`にObsidianのAPIを入れない）。設計・レビュー担当が後から認めた（M3の包み§3の表）。
- `tests/pm-mode/boundaries.ts`: `setCssStyles`・`setCssProps`は`obsidian/`の中だけ、の検査を足した（境界を狭める側）。


## H24（確定の直後の打鍵なしの変換: 部分確定・音声入力、2026-11-06）

Nyozeの`f25c5d35`（2026-10-29、`PIS-IME-KEYLESS-CONTINUATION1`。追記1: 修飾キーをすべて離したら有効化を外す、を含む）から写した。固定の`020b5501`より後の直しで、同じ条件（Apache-2.0）。作者の判断H24（2026-11-06）による。報告は`tests/pm-mode/KEYLESS-CONTINUATION-REPORT.md`、包みは`docs/tategaki-new-mode-keyless-continuation-brief.md`。

| 写し先 | Nyozeの元path（`src/editor-core/features/inputSurface/`以下） | Local changes |
| --- | --- | --- |
| `input/recent-input.ts`（新） | `reconversionState.ts`の`RecentInput`・`noteInputFinished`・`armRecentInput`・`disarmRecentInput`・`allowsKeylessAfterInput`、`beginReconversion`の`keyless-after-input`の条件 | Nyozeの`ReconversionState`（写しと拒否帳簿を持つ。再変換はM6）ではなく、印（`RecentInput \| null`）そのものを受け取り返す。拒否の判定は`rejectsKeylessAfterInput`として独立（有効化された印・打鍵なし・collapsed・同じsnapshot）。判定の中身は変えていない |
| `input/composition-intent.ts`（既存の写しへの追加） | `compositionIntent.ts`の`releasesAllModifiers` | なし（そのまま） |
| `obsidian/input-surface.ts`（既存の写しへの追加） | `inputSurface.ts`の`commit`（確定の成功を返す）・`onEnd`、`selectionMirrorController.ts`の`noteKey`・`noteKeyUp`・`noteInputFinished`・`begin`の記録 | 印を有効化つきにする。確定の成功の後は有効化せず、成功しなかった終わり（拒否・空の終了・保持・E4の破棄の後）は前の有効化を引き継ぐ。変換の外のkeydownで印を外さなければ有効化し（`recent-armed`）、変換の外のkeyupで修飾キーがすべて離れていれば有効化を外す（`recent-disarmed`）。**打鍵で始まった開始（`keyed`。J30の続け打ちで打鍵扱いになったものを含む）は、確定の直後の印を消す**（Nyozeの`beginReconversion`の`keyed`の枝。M3d R-D5。それまでは消さず、J30の続け打ちの開始の後に、有効化された印が残っていた）。`keyless-after-input`で拒否するのは有効化された印・collapsed・同じsnapshotのときだけ。有効化されていない印での打鍵なしの開始は`keyless-after-input-allowed`を記録する。Nyozeのkeyup（`noteKeyUp`）はIMPLICIT-COMMIT1の`continuedKey`も扱うが、新モードにはJ30の`continuation`があるので、有効化を外す部分だけを写した。**J31の効き目の変更**: J31（Enter・NumpadEnter・Escape・Backspace・Deleteで終わった変換は続け打ちの印を立てない）のうち、`keyless-after-input`の判定に及んでいた分は、この規則で置き換わった（確定の直後の印が有効化されていなければ、Enterで終わった後でも打鍵なしの開始は書かれる）。J30の続け打ちの印とJ31のcodeの絞りは、そのまま残す。Nyozeが同じ役目に持つIMPLICIT-COMMIT1（`isComposingTypingKey`）は写していない |


## M1-7（定義の行をNyozeとそろえる、2026-11-06）

Nyozeの`e1da1a98`（2026-11-05、`MD-ESCAPE-EXPLICIT1`）から。固定の`020b5501`より後の直しで、同じ条件（Apache-2.0）。作者の判断（本設計§10.4.3、2026-11-05）による。報告は`tests/pm-mode/M1-7-REPORT.md`、包みは`docs/tategaki-new-mode-m1-7-brief.md`。

| 写し先 | Nyozeの元path（`src/`以下） | Local changes |
| --- | --- | --- |
| `pm/decorations.ts`（`DEFINITION_LABEL_CLASS`と、定義の行の`[label]:`のinline decoration） | `editor-core/features/referenceDefinitionDecorationState.ts`（段落の先頭の`[label]:`の範囲に1つのclassを付ける、表示だけのdecoration）、`editor-core/extensions/referenceDefinitionDecoration.ts` | codeは写していない。考え方（元の字のまま、`[label]:`の範囲だけ。文書・markdown・historyは変えない）を写した。classの名前は`tategaki-md-definition-label`。範囲はNyozeの正規表現とmarkdown-itの`reference` ruleではなく、Vの2つの正規表現（脚注の表`sot/sot-line-model.ts:137`・`linkReferenceMap`の`:152`。包みD-M17-1）で決め、行のdecoration（`source/line-decoration.ts`の`definitionLine`・`dataset.definitionLabel`）に記す。blockが作り直されるとき（`updateDecorations`）に付け直す。Nyozeの`changedBlockRanges`・`DecorationSet.map`は使わない |
| `obsidian/styles/stylesheet.ts`（`.tategaki-md-definition-label`の規則） | `styles.css`の`.nyoze-ref-def-label { color: var(--text-muted) }` | 選択子だけ新モードのもの。色は同じ`var(--text-muted)`で、新モードの`:host`が本文の色と下地の混色に写す（`copied-lines.ts`の`--text-muted: var(--tategaki-muted-text)`） |
| `source/line-segments.ts`（定義の行の`[label]:`までを元の字のままの区間にし、本文だけを読む） | `editor-core/io/referenceDefinitionLine.ts`（markdown-itの`reference` ruleを包み、定義の行を元の字のままの段落にする） | codeは写していない（新モードはmarkdown-itを使わない）。同じ結果（定義の行は元の字のまま1行で見せる）を、Vの2つの正規表現で決めた行の読みで得る。Nyozeは本文も元の字のままだが、新モードは本文を今のinlineの読み（書式・link・Ruby）のままにする（包みD-M17-4。本設計§10.4.3に違いとして書く） |

Vの`sot-wysiwyg-view.ts`の脚注の定義の分岐（`src/wysiwyg/pm-mode/source/line-decoration.ts`の写し、V:3881-3882）は、隠す範囲と枠のclass（`tategaki-md-footnote-def`）をやめ、`dataset.definitionLabel`だけを付ける（そのfileの`Local changes`に書いた）。`copied-lines.ts`は、Vの脚注の定義の枠と`::before`の添え字のrule（`styles.css:4496`・`:4507`）を外した（`tests/pm-mode/m1-2-css-provenance.json`に記録）。


## M4a（変換中・保持文字があるときの離脱の守り、2026-11-06）

Nyozeの`58a98a90`（2026-11-06。`inputSurface/documentAction.ts`は固定の`020b5501`と同じfile）から、判定の関数だけを写した。固定の`020b5501`より後の日付だが、同じ条件（Apache-2.0）。作者の判断（M4の包みの決めD-M4-11、2026-11-06）による。報告は`tests/pm-mode/M4a-REPORT.md`、包みは`docs/tategaki-new-mode-m4-brief.md`。

| 写し先 | Nyozeの元path（`src/editor-core/features/`以下） | Local changes |
| --- | --- | --- |
| `obsidian/document-action.ts`（新） | `inputSurface/documentAction.ts`の`classifyInputSurfaceDocumentAction`（変換の確定の途中→`busy-flushing`、変換中→`wait-for-composition`、保持文字→`recovery-required`、他→`ready`。同じ4つの答え・同じ順） | 答えの型は新モード自身のもの（`DocumentActionStatus`）。Nyozeの`LocalImeDocumentActionPreparation['status']`はアプリ全体のbarrier（`localImeDocumentActionBarrier`）に属し、新モードにはない。Nyozeのcontroller（Reactへの知らせのsnapshot、保持文字のcopy・破棄、保存の続き）は写していない（新モードに保存はなく、Obsidianが保存する。知らせは`Notice`）。`excerptForNotice`（知らせに出す字の先頭30字、書記素で切る、改行は`⏎`）は新しく書いた |
| `obsidian/input-surface.ts`（既存の写しへの追加） | 同上（判定の入力`committing`・`composing`・`text`は、写した入力面の状態） | `documentAction()`（判定を入力面の状態から読む。読むだけ）と`settleBeforeLeave()`（離れる前に、変換中ならfocusを外して見えている間に変換を終え、入力面に残った字を返す。書くのは普通の`compositionend`の道）を足した。Nyozeにはない |

新しく書いた接続（Nyozeに対応がない）: `pm-mode-view.ts`（`requestLeave`: 止められる入口が離れてよいかを聞く。`settleBeforeClose`: 止められない入口の確定→知らせ。`closeSelf`・`onClose`・Obsidianの`quit`の前に通す。`checkFollow`: CMの付け替えで保持文字を新しいsessionへ引き継ぎ、変換中は次の知らせへ送る。`reopenInThisWindow`・`onOpen`: 引き継ぎの字が行き場を失うときは知らせる。`isCurrent`に「paired leafがworkspaceにまだある」を足した: 閉じたleafのCMは書き込み先ではない）、`mode-manager.ts`（Tategakiの画面を開く・置き換える入口を止める、1画面の制約で閉じる前に聞く、設定OFFとcleanupは先に確定→知らせ）、`plugin.ts`（`onunload`の強制cleanupの前に確定→知らせ）、`input-notice.ts`・`shared/i18n.ts`（知らせの文）。試験は`tests/pm-mode/m4a-units.ts`・`m4a-mode-manager.cjs`・`m4a-browser.cjs`・`m4a-mutations.cjs`。

## M4b（変換中の字の場所を本文の中に取る押し出しの表示、2026-11-06）

Nyozeの`58a98a90`（2026-11-06）から。固定の`020b5501`より後の日付だが、使うfileは`020b5501`から変わっていない（`surfacePreferences.ts`だけは`c80df99f` PREEDIT-DISPLAY1で新しく入った）。同じ条件（Apache-2.0）。作者の判断（M4の包みの決めM4-1・M4-2、2026-11-06）による。報告は`tests/pm-mode/M4b-REPORT.md`、包みは`docs/tategaki-new-mode-m4-brief.md`。INLINE-2（前後の文脈）は入れない（M4-2）。

| 写し先 | Nyozeの元path（`src/editor-core/features/inputSurface/`以下） | Local changes |
| --- | --- | --- |
| `pm/composition-widget.ts`（新） | `compositionPresentation.ts`（`apply`の規則: 本文の変更なら必ず同じ適用で消す、metaだけのtransactionで置く、場所を取る透明なwidget、`firstCharacterRect`） | 新モードの表示PMは読み取り専用なので、Nyozeの`view.editable`の条件は外した。ownerのsnapshotはCodeMirrorのもの（`docRef`は`Text`）なので、「ownerがまだ同じsnapshotを持つ」は呼ぶ側（`obsidian/`）が渡す`valid()`にし、表示PMの側の照合は「表示のdocが開始の時点のもの、表示のselectionが開始の時点のもの」。widgetの要素は`obsidian/`から渡す（直接のstyle代入を避ける、1.3.4の規則）。widgetはmarkの外に置く（`marks: []`。入力面は書式を描かないので、太字の中なら場所が広がってしまう）。Rubyの親文字の中・縦中横の中（親がtext lineでない所）には置かない（D-M4-10）。範囲の再変換（`reconversion-hidden`、M6）・選択の写し・範囲のmark・Rubyの境の正規化・`document.head`への`<style>`・段落末のZWSPの規則は写していない |
| `obsidian/composition-presentation.ts`（新） | `surfacePreferences.ts`（`shouldPresentCompositionAtStart`、型`InputSurfacePreeditDisplay`）、`compositionPresentation.ts`のownerの側（`present`・`firstCharacterRect`・cycleの有効性）、`editOwner.ts`の`insertionCaretAtWrapEnd` | `shouldPresentCompositionAtStart`はNyozeのまま（再変換の枝はM6から。今は`reconversion`が常にfalse）。Nyozeのmodule globalの設定（UIが書き、入力面が`compositionstart`で読む）は、viewが入力面へ渡す関数（`options.preeditDisplay`）にし、製品の設定の新しいkey`pmPreeditDisplay`（既定`inline`）を変換の開始の時点で1回読む。widgetの要素はstylesheetのclass。cycleの有効性は「CodeMirrorの文書とownerのidentityが開始の時点のもの」。`atWrapEnd`は表示のcaretの矩形が`end`と`head`で違うこと |
| `obsidian/surface-placement.ts`（既存の写しへの追加） | `surfacePlacement.ts`の`SurfaceFrozenPlacement`・`surfaceFollowStart`（INLINE-2B） | そのまま。呼ぶ側（`input-surface.ts`）で、矩形は内容の座標（ページの拡大率つき）、凍結時の開始は`placedLine`（chunkの平行移動に追従する） |
| `obsidian/short-preedit-shadow.ts`（新） | `shortPreeditShadow.ts`（SIDEWAYS-CLIP1） | 判定はそのまま。canvasの`fontStretch`・`letterSpacing`・`wordSpacing`の型を、このrepoのDOMの型より新しいので足した |
| `obsidian/preedit-highlight.ts`（既存の写しへの追加） | `preeditHighlight.ts`（`update(painted)`・影の変数） | 押し出し中（`painted`がfalse）は何も塗らない（Nyoze PIS-S10-CURRENT-LINE2 (b)）。影は`--tategaki-pm-preedit-shadow`へ`setCssProps`で書く（1.3.4の規則）。書式の背景は、入力面が書式を描かないので、引き続き写していない |
| `obsidian/input-surface.ts`（既存の写しへの追加） | `inputSurface.ts`の`followPresentation`・`restoreFrozenStart`・`endCompositionPresentation`・`updateCompositionPresentation`・`preeditPainted`・`onStart`の押し出しの枝・`onInput`の更新 | 文脈（`applyContext`・INLINE-2）は写していない。置かない場面（範囲・保持文字・J20の拒否・確定の失敗の後・設定が重ねる・Rubyの親文字と縦中横）の条件は包みの決めD-M4-2・D-M4-10。**追従とchunkの平行移動（`chunkLayoutChanged`、Nyozeにない）を合成した**: 追従が書いた交差方向の値（縦書きは`right`、横書きは`top`）も、行の起点と同じ量だけ動かす。追従をやめるとき（`restoreFrozenStart`）の戻し先は、Nyozeの凍結時の文字列でなく、平行移動に追従している`placedLine`。表示が変換中のroomを失ったことは、CodeMirrorのtransactionの直後（`input-wiring.ts`の`transactionsApplied`）と表示の作り直し（`selectionSynced`）から、同じ同期の中で知らされる（Nyozeは次の`compositionupdate`で気づく）。新しい書き込みは`setCssStyles` |

新しく書いた接続: `pm/view.ts`（pluginの登録、`presentComposition`・`updateComposition`・`clearComposition`・`compositionPresented`・`compositionFirstCharacterRect`）、`pm/prosemirror.ts`（`PluginKey`の輸出）、`obsidian/input-wiring.ts`・`session.ts`（口と設定の読み取り）、`obsidian/display-visuals.ts`（帯: 押し出し中は入力面の矩形を足さない。D-M4-9）、`obsidian/styles/stylesheet.ts`（widgetのclass）、`src/types/settings.ts`・`src/shared/ui/settings-tab.ts`・`src/shared/i18n.ts`（設定「変換中の表示」）。試験は`tests/pm-mode/m4b-units.ts`・`m4b-browser.cjs`・`m4b-mutations.cjs`・`m4b-bench.cjs`。M4aの前から壊れていた`m2-2c-mutations.cjs`・`m2-4d-r1-mutations.cjs`は、試験の側だけ直した（`m2-2c-browser.cjs`・`m2-4d-r1-browser.cjs`の該当の場面を含む。報告§7）。

M4cラウンド2（2026-11-07、R2-2・R2-3）: **Nyozeから写したものはない**（読んだだけ）。`pm/composition-widget.ts`の`roomPosition`（Rubyの端のroomをRubyの外に置く）と、`obsidian/input-surface.ts`の`applyRowRules`・`restoreRowRules`（roomの間だけ、入力面の行の割り方を本文の行に合わせる: 両端揃えの行なら`text-align: justify`、roomの後ろに本文が続くなら`text-wrap: wrap`）は、新モードの側で書いたもの。Nyozeは`localImeLocalWindowTypographyParity.ts`の許可リスト（`text-wrap`・`text-align`・`text-align-last`・`text-justify`ほか）で、本文の行の値を入力面へ写す。新モードは見出しの寄せの二重がけ（J33）を避けるため`text-align`を写さず、`justify`だけを同じ規則で足す。書き込みは`setCssProps`（1.3.4の規則）。

M4cラウンド2のR2-1（D-M4-16、2026-11-07）: **Nyozeにない、新モードの差**（Nyozeから写したものではなく、作者のWindowsの記録で分かった新しい規則）。`obsidian/input-surface.ts`の`commitEcho`: 変換を`compositionend`で終えたとき、その字（`compositionend`のdata）を印として持ち、次のキーの押下（`keydown`）・次の`compositionstart`・次の別の入力・入力面の無効化（`setEnabled(false)`）まで（timerなし）、**変換でない`insertText`で、字が同じ最初の1回**を、IMEの確定のこだまとして書かない（`beforeinput`で既定を止め、入力面にも入れず、記録に`commit-echo-dropped`を残す。1回の変換につき1回だけ）。確定が拒否されて字が入力面に残っているときも同じで、保持文字が2回分にならない。Windowsは、変換中に入力面からfocusが外れる（タブの×のclick）と、変換を確定し（`compositionend`。1回目、書く）、その直後にキーも`compositionstart`もなしで、同じ字を普通の`insertText`として送る（2回目）。Ctrl+Wのときは送らない。正解の模型`tests/pm-mode/m2-3c-harness.ts`にも同じ規則を入れた（規則の写しで、緩めではない）。

M4cラウンド3（2026-11-07、P2-1・P3-1・P3-4・P3-5）: **Nyozeから写したものはない**。`obsidian/styles/stylesheet.ts`のwidgetに`text-spacing-trim: space-all`、`obsidian/input-surface.ts`の`applyRowRules`が入力面にも同じ値を書く（約物の組の詰めを、roomと入力面でそろえる。Nyozeは本文の行の値を入力面へ写す許可リストの方式）。`pm/composition-widget.ts`の`roomPosition`が縦中横の端も外側に置く。`obsidian/input-surface.ts`の`releaseCommitEcho`と`obsidian/input-wiring.ts`のEscapeの口（こだまの印は、窓のEscapeの守りが入力面の`keydown`より前に止めるキーでも消す。D-M4-16、Nyozeにない新モードの差）。正解の模型`tests/pm-mode/m2-3c-harness.ts`の`direct`（打鍵つき）と`echo`（打鍵なし）の分け。

## clipboardの段（C-a・C-b: 切り取り・コピー・貼り付け・右クリックメニュー・2つの書き方、2026-11-08）

Nyozeの`58a98a90`（2026-11-06）から。固定の`020b5501`より後の日付だが、同じ条件（Apache-2.0）。包みは`docs/tategaki-new-mode-clipboard-brief.md`（決めD-C-1〜12）、報告は`tests/pm-mode/CLIPBOARD-REPORT.md`、下調べは`tests/pm-mode/review/evidence/clipboard-inventory/clipboard-inventory.md`。

| 写し先 | Nyozeの元path（`src/editor-core/features/inputSurface/`以下） | Local changes |
| --- | --- | --- |
| `obsidian/clipboard.ts`（新） | `clipboard.ts`（`createInputSurfaceClipboard`: `beforecopy` / `beforecut`、`copy` / `cut`、`paste`の3つのhandlerの形） | focusは入力面のrootの`activeElement`（Shadow DOMの中）。copy・cut・pasteが何をするかはownerのもの（`source-owner.ts`の`copyText`・`cutText`・`pasteText`。Nyozeはhost editorのhandler）。読むのは`text/plain`だけ（`\r\n`・`\r`は`\n`、D-C-4）、書くのは`text/plain`と`text/markdown`の同じ文字列。HTMLの形式と「書式なしで貼り付け」のchordは写さない。取ったeventは止める（既定の動作と伝播: Obsidianの`window`のhandlerとその合成の`copy`が2回目を作らないように）。変換中・保持文字があるときは、copyと切り取りはブラウザの既定のまま（D-C-3）、貼り付けは書かない（D-C-6）。D-C-12: 切り取りと貼り付けは、確定の直後の印（D-M4-16）を終える |
| `input/clipboard-policy.ts`（新） | `clipboardPolicy.ts`（`mayCopyCutFromSurface`） | 同じ。`normalizePasteText`（D-C-4）は新しい |

新しく書いたもの（Nyozeに対応がない）: `input/source-copy.ts`（copyの範囲は切り取りで消える範囲と同じ。全選択はfrontmatterを除く。C-Q1・C-Q2）、`input/source-paste.ts`（貼り付けは字をsourceのままの記法として入れる計画: 範囲は確かめた削除（Backspaceの計画）の後に、1つの編集として。TCYの中・定義のlabelの中・記法の失せる所は断る。D-C-5〜7）、`input/source-commit.ts`の`planCommit`（D-C-8: 記号と字の混ざった確定、D-C-9: 空の記法の中へ打った字を、打ったとおりに書く。確かめた確定が`structure`で断ったときだけ）、`obsidian/context-menu.ts`（右クリックのメニュー: Obsidianの`Menu`・`showAtMouseEvent`、項目はコピー・切り取り・貼り付けの3つ。Vの`command-context-menu.ts`の形を、要素の属するwindowの`navigator.clipboard`で。Nyozeのメニューは`execCommand`と合成eventで動くが、製品は使わない）、`obsidian/source-owner.ts`（`selectionEmpty`・`copyText`・`cutText`・`pasteText`）、`obsidian/input-wiring.ts`（接続）、`obsidian/input-surface.ts`（`drop`だけを止める）、`obsidian/edit-guard.ts`・`obsidian/caret-reveal.ts`・`input/edit-plan.ts`（注釈`paste`・`userEvent`の`delete.cut`と`input.paste`）。

### C-d（3つのボタンのtoolbarと、元のnoteからのcaretの同期、2026-11-08）

**Nyozeから写したものはない。** `obsidian/toolbar.ts`（新）は、今の執筆モードの`src/wysiwyg/shared/command-toolbar.ts`の3つのボタン（縦横の切り替え・表示設定・アウトライン）のicon名・i18nのkey・classを同じにして、新しく書いた（`command-toolbar.ts`は使わず、変えていない）。`obsidian/pm-mode-view.ts`: viewのframeを「toolbar＋表示のbody」の2つに分け、sessionの`container`をbodyにした（表示の大きさはbodyのもの）。ボタンの動き（`common.writingMode`の切り替えと`plugin.updateSettings`、`SettingsPanelModal`（`mode: "sot"`）、Obsidianの`outline:open`）は今の執筆モードと同じ道。`obsidian/caret-reveal.ts`: 元のnoteのeditorが置いた、見える所へ送ることを求める（`tr.scrollIntoView`）選択は、新モード自身の入力の道（`pmModeInput`の注釈）と別に、次のframeのrevealの1歩を求める（focusは取らず、transactionも出さない）。`styles.css`に`tategaki-pm-frame`・`tategaki-pm-toolbar`・`tategaki-pm-body`。

### clipboardの段 ラウンド2（C-cのレビュー1回目の直し、2026-11-08）

**Nyozeから写したものはない**（包み§11。読んでもいない）。`input/source-paste.ts`は貼り付け・D-C-8・D-C-9の計画を、確かめた確定（`planCommitChecked`）に合わせて直した（D-C-13〜15、D-C-8の絞り）。`input/display-signature.ts`に、表示の字と印を比べる`lineTokenKeys`・`lineChars`を足した（新しく書いたもの）。`obsidian/source-owner.ts`の`cutPlan`（切り取りの計画だけ）、`obsidian/context-menu.ts`・`obsidian/clipboard.ts`の「変換中・保持文字の見直し」と知らせ、`obsidian/input-notice.ts`の`showPmModeClipboardBusyNotice`、`obsidian/pm-mode-view.ts`の縦横の切り替えが`preview.pageModeEnabled`を明示して渡す形も、新しく書いた。

### clipboardの段 実機（Mac）の後の直し（F-1・F-2・F-3、2026-11-11）

**Nyozeから写したものはない**（包み§11.11。読んでもいない）。`obsidian/pointer-lending.ts`に`lendsPointer`（主ボタンでCtrl・Cmd・Altのどれも伴わない押下だけがpointerを貸す。`onDown`の条件と同じ規則）を出し、`obsidian/context-menu.ts`の`mousedown`の止め（右ボタンの押下）を、貸さない主ボタンの押下（macOSのCtrl＋クリックなど）にも広げた（D-C-18。表示の選択だけが動いてCMの選択と食い違う形をなくす）。`obsidian/source-owner.ts`の`refuseClipboard`・`obsidian/key-notice.ts`は、切り取り・貼り付けの断りを、キーの文で、断られた1回の操作ごとに知らせる（確定の`failure`の印を読まず・書かない。D-C-19）。`src/shared/i18n.ts`の`pm.notice.input.inside-inline`はRubyの親文字も言う文にした。`obsidian/caret-reveal.ts`に、popoutで元のnoteの選択を追わない件（F-2。headlessでは再現しなかった）の実機の記録のための診断の記録3種（`caret-reveal-external-selection`・`-ask`・`-frame`。動きは変えない）を足した。

### 1.4.0の前の小さな回（D-C-20・P3-a・O-2、2026-11-11）

**Nyozeから新しく写したものはない**（包み§11.16。読んでもいない）。Nyozeの写しへの局所の変更だけ:

| 写し先 | Nyozeの元path（`src/editor-core/features/inputSurface/`以下） | Local changes |
| --- | --- | --- |
| `obsidian/navigation/navigation.ts`（既存の写しへの変更） | `navigation/navigation.ts`（文字の移動の書き込み`put`） | D-C-20: 文字の軸の移動で、書いた選択が書く前の選択へ、元のnoteのLive Previewに戻されたときだけ、同じ向きの次の止まれる位置を、同じ口（`PmModeSourceOwner.select`）でもう一度書く。上限は`NAVIGATION_RETRY_LIMIT`（64）。書く前と違う選択になれば終わり。記録`navigation-retried`・`navigation-pulled-back`を足した。D-M3-1「1押下につきtransactionは0回か1回」の例外（選択だけのtransaction、本文と履歴には触れない）。Nyozeの`put`は書き込みを1回しか行わない |
| `obsidian/navigation/characters.ts`（既存の写しへの変更） | `navigation/characterNavigation.ts`（`characterSelection`） | 止まれる位置の並べ方を`characterSteps`へ出し、`characterMove`が最初の選択（`characterSelection`と同じ）と、その後の段（試し直しの選択）を返す。`characterSelection`の振る舞いは変えていない。範囲を端へ閉じるだけの移動と、全選択からの移動では、試し直しの段を作らない |
| `obsidian/caret-reveal.ts`（既存の写しへの追加。包み§11.17） | `caretReveal.ts`（フレームの見せ方の1段） | D-C-22（O-3）: 書字方向が変わったとき、D-T-5の「外の選択を見せる」段（表示だけを動かす。focus・transactionなし）を1回求める`writingModeChanged`を足した。見えていないviewは、D-T-7の印で、見えたときに動かす。`session.ts`が書字方向の変化だけを`input-wiring.ts`経由で知らせる |

新しく書いたもの（Nyozeに対応がない）: `obsidian/context-menu.ts`のD-C-21（O-1）: メニューを閉じたEscだけを覚える（Obsidian 1.15.0の`Menu`のscopeがEscで`hide`をkey eventつきで呼ぶことに合わせ、`Menu`を継いだ小さなclassの`hide`が、そのEscのkeydownを`WeakSet`に入れる。印は次のkeyまで残らず、timerも`window.event`も使わない）。`input-wiring.ts`のEscの入口が、その印のあるEscでは範囲を閉じない。`obsidian/pointer-lending.ts`の`domEnds`は、DOM選択の両端を`view.posAtDOM(node, offset, 1)`（ProseMirrorの`selectionFromDOM`と同じbias）で読む（P3-a）。`src/shared/i18n.ts`の`pm.settings.desc`の文（O-2）は、D29を外したことに合わせて書き換えた。

D-C-23（F-8、2026-11-12。包み§11.19）: **Nyozeから写したものはない**（読んでもいない）。`obsidian/context-menu.ts`の`EscapeAwareMenu.hide`が、Escのkeydownで閉じたとき、そのeventの`preventDefault`を呼ぶ（新しいwindowで本体のworkspaceのEscの処理がfocusを取るのを止める）。新しいwindowでは`hide`が受け取るのはObsidianのrelayの写しなので、写しの`target`（元のeventの`target`）を1つだけ覚えて、viewの守りが受け取る元のeventと対にする（`relayedClose`。守りのその1回の問いで使い切る。timer・`window.event`なし）。

D-C-24（F-9、2026-11-12。包み§11.20）: **Nyozeから写したものはない**。`obsidian/mount.ts`の`applyHeight`が、縦書きのroot（`pmHost`）の`height`を、scroll要素の外側の高さのpxから`100%`（client box）にした。classic（overlayでない）スクロールバーが横に出る環境で、縦書きに要らない縦のスクロールバーが出ていた（15px）。

D-C-25・D-C-26（2026-11-12。Opusのレビュー3回目の直し。包み§11.23）: **Nyozeから写したものはない**。`obsidian/caret-reveal.ts`（Nyoze `caretReveal.ts`の写し）: 外のstepに種類（`scroll`／`select`）を持たせ、`select`だけの外の選択（D-T-6）のstepはTypewriterの`follow`を使わない（局所の変更）。`obsidian/pointer-lending.ts`: taskの箱の中で離したclickは何も書かない（`taskBox`・`pointer-task-box`）。

### 1.4.0の前の2つの段（VLB1・BLOCK-WARN1、2026-11-12）

| 写し先 | Nyozeの元 | Local changes |
| --- | --- | --- |
| `obsidian/styles/stylesheet.ts`（縦書きの普通の段落の行の`::after`の1つの規則） | `src/styles.css`のBETA-TY-VLB1（`p::after { content: "\200B" / ""; }`）、HEAD `6fb200f8`で読んだ。調査`docs/vertical-inline-boundary-line-break-investigation.md` | 対象は`tg-line.tategaki-pm-line`のうち、`data-md-kind`・`data-definition-label`のない行（見出し・list・引用・code・部品・定義の行は外す）。空の列を増やす形（trailingBreakを持つ行: 空の行、Ruby・縦中横・行内の数式で終わる行、変換の押し出しが段落末にある行）は、同じ規則の`:not(:has(> br.ProseMirror-trailingBreak))`で外す（Nyozeは別の規則2つ）。この新モードの規則（`m1-2-unit.ts`）で、位置の疑似classと兄弟のcombinatorは使わない |
| `obsidian/commit-target-restriction.ts`（新）・`obsidian/source-owner.ts`・`obsidian/input-surface.ts`・`obsidian/input-notice.ts`・`obsidian/input-wiring.ts`・`input/source-commit.ts`・`src/shared/i18n.ts` | `src/editor-core/features/inputSurface/commitTargetRestriction.ts` ほか、PIS-INPUT-BLOCK-WARN1（`254120c9`。`inputSurface.ts`の`beforeinput`・`compositionstart`、`hostOwner.ts`、`docs/pis/input-block-warn1-report.md`） | 判定の1つの関数`resolveCommitTargetRestriction`は、Nyozeの3つの制限（縦中横・付箋のマーカー・Bのatom）の代わりに、新モードの確定先だけで断られる所（`canDisplayEditTarget(ctx, "commit")`と`resolveEditTarget`の`blocked`の`partial-ruby`・`partial-atom`・`structure`）を言う。確定（`commitText`）と事前の判定（`commitTargetRestriction`）の両方がこの関数を呼ぶ。直接の入力は`beforeinput`で止めて知らせ（`beforeinput-restricted`）、変換は`compositionstart`で知らせる（`composition-restricted`。止めない）。保持文字・failureがあるときは判定しない。同じ所で続けて打っても知らせは積み重ならない。知らせの文は新しく2つ。`refusedWhereverItGoes`は、確定の計画が目標より先に言う断り（改行・空）を、関数と共有する |
