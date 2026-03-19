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
  - Ruby (furigana) support (Aozora Bunko style), e.g. `｜漢字《かんじ》`
  - Images (standard Markdown images and Obsidian embeds)
  - Outline navigation and heading folding
  - Selection mode options for Writing & Reference mode (`fast-click` / `native-drag`)
  - Outliner-style list editing: move items, change nesting with `Tab` / `Shift+Tab`, and keep ordered lists renumbered
  - Improved `Enter` / `Shift+Enter` behavior in list items and blockquotes
    - `Enter` continues or exits naturally, and `Shift+Enter` can be used for in-item line breaks and continuing blank lines
- Book mode
  - Measured pagination for reading
  - Frontmatter can be shown on a separate cover page
  - Page breaks or title pages can be inserted before headings
  - Ruby display support
  - Outline navigation and page transition effects
- Compatibility mode (TipTap-based editor) for older workflows
  - Search / replace
  - Inline source text editing
  - Sync backups (can be disabled in settings)
  - Planned for removal in a future update; migration to Writing & Reference mode is recommended
- Theme and display settings
  - Fonts, spacing, heading layout, IME offsets, and related display options

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
