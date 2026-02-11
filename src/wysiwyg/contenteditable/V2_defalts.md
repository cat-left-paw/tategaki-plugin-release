参照元は `src/types/settings.ts:210` の `DEFAULT_V2_SETTINGS` です。

## IME補正のデフォルト値

- `wysiwyg.imeOffsetHorizontalEm`: `0.1`（横書きIMEの縦方向補正）
- `wysiwyg.imeOffsetVerticalEm`: `0.5`（縦書きIMEの横方向補正）
- 補正値の許容範囲: `-1` 〜 `1`（`src/types/settings.ts:713`）

## デフォルト値一覧（Markdown）

### Top-level

| key                     | default           |
| ----------------------- | ----------------- |
| `settingsVersion`       | `3`               |
| `defaultMode`           | `"tiptap"`        |
| `showModeDialog`        | `true`            |
| `lastViewMode`          | `"edit"`          |
| `lastViewOpenPlacement` | `"right"`         |
| `enableLegacyTiptap`    | `true`            |
| `activeTheme`           | `"obsidian-base"` |
| `customFonts`           | `[]`              |
| `temporaryOverrides`    | `{}`              |

### common

| key                   | default                                    |
| --------------------- | ------------------------------------------ |
| `writingMode`         | `"vertical-rl"`                            |
| `fontFamily`          | `"Yu Mincho, Hiragino Mincho ProN, serif"` |
| `fontSize`            | `18`                                       |
| `lineHeight`          | `1.8`                                      |
| `letterSpacing`       | `0`                                        |
| `pageScale`           | `1`                                        |
| `textColor`           | `"#2e2e2e"`                                |
| `backgroundColor`     | `"#ffffff"`                                |
| `pageBackgroundColor` | `"#f5f5f5"`                                |
| `accentColor`         | `"#1e90ff"`                                |
| `lineEndProcessing`   | `"allow-end"`                              |
| `rubySize`            | `0.5`                                      |
| `headingSpacing`      | `2`                                        |
| `rubyVerticalGap`     | `0`                                        |
| `rubyHorizontalGap`   | `0`                                        |
| `headingFontFamily`   | `""`                                       |
| `headingTextColor`    | `""`                                       |
| `debugLogging`        | `false`                                    |

### preview

| key                            | default          |
| ------------------------------ | ---------------- |
| `syncCursor`                   | `true`           |
| `updateInterval`               | `300`            |
| `showCaret`                    | `true`           |
| `pageModeEnabled`              | `false`          |
| `outlineOpen`                  | `false`          |
| `hideFrontmatter`              | `true`           |
| `showFrontmatterTitle`         | `true`           |
| `showFrontmatterSubtitle`      | `true`           |
| `showFrontmatterOriginalTitle` | `true`           |
| `showFrontmatterAuthor`        | `true`           |
| `showFrontmatterCoAuthors`     | `true`           |
| `showFrontmatterTranslator`    | `true`           |
| `showFrontmatterCoTranslators` | `true`           |
| `followActiveFile`             | `false`          |
| `headerContent`                | `"none"`         |
| `headerAlign`                  | `"center"`       |
| `footerContent`                | `"pageNumber"`   |
| `footerAlign`                  | `"center"`       |
| `pageNumberFormat`             | `"currentTotal"` |
| `pageTransitionEffect`         | `"fade"`         |
| `bookPaddingTop`               | `44`             |
| `bookPaddingBottom`            | `32`             |

### wysiwyg

| key                     | default     |
| ----------------------- | ----------- |
| `autoSave`              | `true`      |
| `syncMode`              | `"auto"`    |
| `syncCursor`            | `true`      |
| `enableRuby`            | `true`      |
| `enableTcy`             | `true`      |
| `enableAssistantInput`  | `false`     |
| `enableSyncBackup`      | `true`      |
| `plainTextView`         | `false`     |
| `appCloseAction`        | `"save"`    |
| `imeOffsetHorizontalEm` | `0.1`       |
| `imeOffsetVerticalEm`   | `0.5`       |
| `caretColorMode`        | `"accent"`  |
| `caretCustomColor`      | `"#1e90ff"` |
| `caretWidthPx`          | `3`         |
| `ceUseNativeCaret`      | `true`      |
| `useNativeSelection`    | `false`     |
| `sotPaddingTop`         | `32`        |
| `sotPaddingBottom`      | `16`        |

### controlPanel

| key        | default |
| ---------- | ------- |
| `enabled`  | `true`  |
| `position` | `"top"` |
| `autoHide` | `false` |

### themes（初期登録）

- `default`
- `ashberry-light`
- `ashberry-dark`
- `dusty-navy`
- `dark`
- `paper-like`

必要なら次に、`themes` 各項目（色・フォント・行間）の完全展開版をそのまま Markdown で出します。
