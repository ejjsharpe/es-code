# ES Code built-in themes

This extension bundles the base Tokyo Night color theme from `enkia.tokyo-night` 1.1.2 and Nomo Dark file icons from `be5invis.vscode-icontheme-nomo-dark` 1.3.9. The copied assets are maintained here so the installed app does not depend on either gallery extension. Their MIT notices are in `TokyoNight.LICENSE.txt` and `NomoDark.LICENSE.txt`.

The Nomo Dark 1.3.9 manifest refers to two SVG files that are absent from its published package. `file.binary.svg` copies Nomo's generic `file.svg`, and `config.dub.svg` copies Nomo's `file.d.svg`, so every icon reference resolves in the bundled theme.
