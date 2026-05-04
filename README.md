# Tategaki (vertical writing editor for Obsidian)

[English](README.md) | [日本語](README.ja.md)

Tategaki is a desktop-first Obsidian plugin that lets you edit and view Markdown in a vertical (tategaki) layout.
Desktop only. Mobile is not supported.

Status:
- Submitted to Obsidian Community Plugins (currently under review).

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
- Compatibility mode (TipTap-based editor) for older workflows
  - Search / replace
  - Inline source text editing
  - Checklist editing and heading folding
  - Automatic TCY digit-range settings are also applied here
  - Sync backups (can be disabled in settings)
  - Planned for removal in a future update; migration to Writing & Reference mode is recommended
- Theme and display settings
  - Fonts, spacing, heading layout, IME offsets, and related display options
  - Typewriter settings are temporarily disabled while source mode / plain text view / paragraph plain edit is active, then restored when returning to normal Writing & Reference mode

## Installation (current)

Until it is available in Community Plugins, the recommended installation method is BRAT.
Manual installation from GitHub Releases is still available as an alternative.

- Recommended: install via BRAT
- Alternative: https://github.com/cat-left-paw/tategaki-plugin-release/releases

See `INSTALL.md` for detailed steps: `INSTALL.md`
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
- **Network access**: The only outbound request is the manual update check (Settings → "Check for updates" button). No automatic network calls occur.
- **Local storage**: Compatibility mode writes sync backups to `<vault config folder>/tategaki-sync-backups/` (typically `.obsidian/tategaki-sync-backups/`). Writing & Reference mode does not create backup files.

## Documentation

- Quick start: `QUICKSTART.md`
- Manual: `MANUAL.md`
- Changelog: `CHANGELOG.md`
- Japanese README: `README.ja.md`

## License

Apache-2.0 (see `LICENSE`)
