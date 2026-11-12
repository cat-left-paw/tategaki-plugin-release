# Tategaki (vertical writing editor for Obsidian)

[English](https://github.com/cat-left-paw/tategaki-plugin-release/blob/main/README.md) | [日本語](https://github.com/cat-left-paw/tategaki-plugin-release/blob/main/README.ja.md)

Tategaki is a desktop-first Obsidian plugin that lets you edit and view Markdown in a vertical (tategaki) layout.
Desktop only. Mobile is not supported.

Status:
- Available from Obsidian Community Plugins.
- 1.4.0 retired the compatibility mode (TipTap) and the plugin's own update check, and added the experimental new writing mode.

## What it can do

- Writing & Reference mode
  - Edits Obsidian Markdown directly (no conversion / no sync step)
  - Vertical / horizontal writing layout
  - Paragraph-level source text editing
  - Keyboard navigation tuned for vertical writing, including `Home` / `End` / `PageUp` / `PageDown`
  - Typewriter scroll
    - Keeps the caret near a configurable follow position while typing
    - Supports configurable follow position and follow band width
    - Works together with scroll past end so the caret stays comfortable near the document end
  - Visual focus options for Writing & Reference mode
    - Highlight the active editing block
    - Highlight the current line
    - Dim non-focused paragraphs / blocks
    - Can be used together with Typewriter scroll or independently
  - Ruby (furigana) support (Aozora Bunko style), e.g. `｜漢字《かんじ》`
  - TCY support
    - Explicit TCY: `｟A｠` / `｟12｠` for 1-4 characters
    - Automatic TCY with configurable minimum / maximum alphanumeric digit length
  - Images (standard Markdown images and Obsidian embeds)
  - Outline navigation and heading folding
  - Selection mode options for Writing & Reference mode (`fast-click` / `native-drag`)
    - New installs now default to `fast-click`
    - While Typewriter scroll is active, selection behavior is treated effectively as `fast-click`
  - Outliner-style list editing: move items, change nesting with `Tab` / `Shift+Tab`, and keep ordered lists renumbered
  - Improved `Enter` / `Shift+Enter` behavior in list items and blockquotes
    - `Enter` continues or exits naturally, and `Shift+Enter` can be used for in-item line breaks and continuing blank lines
  - Horizontal rules can be deleted directly in Writing & Reference mode with `Delete` / `Backspace`
  - Toolbar controls for Typewriter features
    - Toggle `Typewriter scroll`, editing-block highlight, current-line highlight, and non-focus dimming from one menu
- Book mode
  - Measured pagination for reading
  - Frontmatter can be shown on a separate cover page
  - Page breaks or title pages can be inserted before headings
  - Ruby display support
  - Outline navigation and page transition effects
- New writing mode (Experimental, off by default)
  - Basic typing, composition (IME), selection, copy and paste work; this is experimental and some things are not possible yet (see below)
- Theme and display settings
  - Fonts, spacing, heading layout, IME offsets, and related display options
  - Typewriter settings are temporarily disabled while source mode / plain text view / paragraph plain edit is active, then restored when returning to normal Writing & Reference mode

## New writing mode (Experimental)

The new writing mode is a new kind of vertical writing mode that works together with the Obsidian editor of the same note. Basic typing, composition (IME), selection, copy and paste work, but it is experimental and some things are not possible yet. It is off by default (turn on `New writing mode (Experimental)` in the plugin settings); the default mode stays Writing & Reference mode.

- It is paired with the Markdown editor of the same note (opened in another tab if it is not open yet), and **writes to the open note through that editor**. If the paired editor is closed or switched to another note, the new writing mode closes too.
- **Back up important manuscripts before using it** (copy the file, use Obsidian's version history).

### What the new writing mode cannot do yet

**Commands**
1. The toolbar has only three buttons: switch vertical / horizontal, display settings, outline. There are no commands for formatting, headings, lists, ruby or TCY yet, and the context menu has only Copy, Cut and Paste. Apply formatting in the paired Obsidian editor or in Writing & Reference mode.
2. Re-conversion (converting a confirmed text again with the IME) is not available.
3. Paste is text only (no formatting). Dropping files or images is not accepted.

**Places where text cannot be written** (nothing is written and a notice is shown; the note is unchanged)
4. When you cut, delete, paste or type over a range that contains a horizontal rule, a code block or an inline math expression (a horizontal rule line can be removed with Backspace / Delete from the end of a neighbouring line); when you type over only a part of a ruby; when you enter text that contains notation characters inside a TCY or in the middle of a ruby base; when you commit or paste text that contains notation (`**bold**`, `｜漢字《かんじ》`, `[[memo]]`, ...) over a selected range.
5. Text that was confirmed by the IME but could not be written stays in the input field. Press Backspace to remove it, or select it inside the field and copy it to use it (there is no dedicated command yet).

**Caret and selection**
6. Clicking where a caret cannot be placed (a horizontal rule, a code block line, before the frontmatter) leaves the caret where it was.
7. If the paired note is in Live Preview, the caret cannot be placed where Live Preview hides notation (right after an unclosed emphasis mark, inside the label of a footnote definition) and movement skips those places; a range that ends there may not be closed by the Down key or Esc (the Up key closes it). With the paired note in Source mode, the caret can go anywhere.

**Composition (IME)**
8. On Mac, after cancelling a composition (clearing it all with Esc or Backspace) and typing again, the IME candidate window may appear away from the previous position (same as Writing & Reference mode).
9. Composing inside a TCY or in the middle of a ruby base is drawn over the text (it does not push the following text aside). Composing between the digits of an automatic TCY shows the digits split in two while composing.
10. A composition that fills the line exactly may look about one character tighter; at the moment of confirmation, following text may move by about half a character for punctuation compression (display only).
11. If you switch between vertical and horizontal while composing and then cancel with Esc, the caret may remain outside the screen.
12. While the ATOK prediction window is shown, the context menu does not appear (composition continues and the text is not damaged).
13. With Mac's Character Viewer or IME pad, entering the same character again without keys right after a confirmation may drop the first one (rare).

**Closing and windows**
14. Depending on how you close (for example closing the tab while composing), the composing text may not enter the note and is shown in a notice instead (text is never silently lost). A notice right before quitting (Cmd+Q, Alt+F4) may not be visible.
15. Moving to a new window while composing makes clicks in the new window ineffective until the composition ends.
16. Moving a long document to a new window may freeze for a few seconds and leave the new window black for a while; "Open in new window" from the start is faster.

**Display**
17. The fix that prevents a short column when a closing bracket at the end of a paragraph lands at the end of a column is only in ordinary paragraphs. Headings, lists and quotes may still get a short column.

## Installation

The recommended installation method is Obsidian's built-in Community Plugins browser.

1. Open Obsidian Settings.
2. Go to `Community plugins`.
3. Select `Browse` and search for `Tategaki`.
4. Install and enable `Tategaki`.

See `INSTALL.md` for detailed install, update, manual install, and uninstall notes.
If you are upgrading from `<=1.2.1`, check the ID migration notes in both `README` and `INSTALL.md`.

## Migration Note (ID change)

As of `1.2.2`, the plugin ID changed from `tategaki-plugin` to `tategaki` (submission requirement alignment).

If you are updating from older versions, Obsidian may treat this as a different plugin.

- Disable old plugin: `tategaki-plugin`
- Install/enable new plugin: `tategaki`
- If needed, copy settings manually:
  - from `.obsidian/plugins/tategaki-plugin/data.json`
  - to `.obsidian/plugins/tategaki/data.json`
- Re-check custom hotkeys for plugin commands
- After confirming everything works, remove old folder `tategaki-plugin`

## Reviewer Notes

- **Platform**: Desktop only (Windows / macOS / Linux). Mobile is not supported.
- **Telemetry**: No telemetry or analytics of any kind.
- **Network access**: The plugin makes no network calls of its own. External pages (release / support links) are opened only when the user clicks a link, through Obsidian. The plugin does not check for updates (updates come from Obsidian's Community Plugins).
- **Vault file listing**: The plugin enumerates Markdown files to support file switching, paired Writing & Reference views, and new-note workflows.
- **Vault read/write**: The plugin reads and writes vault files only for editor/reader operation and new-note creation. The experimental new writing mode writes to the open note through that note's own Obsidian editor.
- **Clipboard access**: Clipboard read/write is used for explicit copy, cut, and paste operations inside the editor or context menu (including the three-item context menu of the new writing mode).
- **Local storage**: The plugin creates no backup files. (The compatibility mode retired in 1.4.0 used to write sync backups to `<vault config folder>/tategaki-sync-backups/`; the plugin never deletes them by itself, and a setting that appears only when they exist moves them to the trash when the user presses it.)

## Documentation

- Quick start: `QUICKSTART.md`
- Manual: `MANUAL.md`
- Changelog: `CHANGELOG.md`
- Japanese README: `README.ja.md`

## License

Apache-2.0 (see `LICENSE`)
