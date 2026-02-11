# Tategaki Plugin (vertical writing editor for Obsidian)

English: `README.md` / 日本語: `README.ja.md`

Tategaki is a desktop-first Obsidian plugin that lets you edit and view Markdown in a vertical (tategaki) layout.
Desktop only. Mobile is not supported.

Status:
- Planned to be submitted to Obsidian Community Plugins (not registered yet).

## What it can do

- Vertical writing editor (WYSIWYG-style layout)
- New “Writing & Reference” mode: edits Obsidian Markdown directly (no conversion / no sync step)
- Ruby (furigana) support (Aozora Bunko style), e.g. `｜漢字《かんじ》`
- Images (standard Markdown images and Obsidian embeds)
- Outline navigation and heading folding
- Book mode for reading (paging)
- Compatibility mode (TipTap-based editor) for older workflows
  - Maintained for now, alongside the new Writing & Reference mode
- Theme settings (font, spacing, etc.)

## Installation (current)

Until it is available in Community Plugins, install from GitHub Releases:
- https://github.com/cat-left-paw/tategaki-plugin-release/releases

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

## Documentation

- Quick start: `QUICKSTART.md`
- Manual: `MANUAL.md`
- Changelog: `CHANGELOG.md`
- Japanese README: `README.ja.md`

## License

Apache-2.0 (see `LICENSE`)
