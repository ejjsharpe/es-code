# ES Code workflow

ES Code opens in its minimal dark theme with file icons, the Explorer on the right, and the editor ready. Tabs at the top of the sidebar let you switch views, including Explorer and Source Control. Source Control lists changed files and shows their count on its tab. The status bar, minimap, breadcrumbs, command center, chat controls, and onboarding are hidden by default. Git, the terminal, language support, and extension installation remain available. Extensions come from Open VSX. You can restore the status bar through **View: Toggle Status Bar Visibility** and change the theme or sidebar location in Settings.

| Shortcut | Action |
| --- | --- |
| ⌘⌥P | Open or focus the same Pi terminal. If the status bar is visible, its `Pi` button does this too. |
| ⌘D | Swap the active file and its Git diff in the same tab. The editor title shows `Diff` or `Code` and this shortcut. |
| ⌘I | Trigger IntelliSense suggestions in the code editor. |

The diff uses working-tree changes first, then staged changes. An untracked file is compared with an empty file. Save a dirty file before opening its diff. Files without Git changes stay in the code view.

To run from the source tree, install dependencies and compile according to the upstream build instructions, then run `scripts/es-code.sh /path/to/project`. To build the macOS arm64 app, run `npm run gulp -- vscode-darwin-arm64`; the result is `../VSCode-darwin-arm64/ES Code.app`. Pi must be available on the shell `PATH`; if it is missing, the Pi terminal explains that rather than silently failing. ES Code uses its own `.es-code` user-data folder and does not load the Copilot extension.

On this Mac, `code .` and `es-code .` open the installed `/Applications/ES Code.app`. After rebuilding `../VSCode-darwin-arm64/ES Code.app`, install the new bundle in Applications to update these commands.
