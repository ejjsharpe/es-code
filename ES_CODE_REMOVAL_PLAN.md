# ES Code removal plan

**Status:** Independent tracks integrated on 22 October 2026 from baseline commit `95a444f5c569d1da939b11812c4578215e398c71`. Runtime and package acceptance checks listed below remain. The starting `main` worktree had a pre-existing edit to `AGENTS.md`; it has been preserved without staging it.

ES Code is a personal, installed desktop editor. The goal is to make the fork easier to maintain and extend, and to reduce its packaged size where that does not compromise the owner's workflow. A faster startup is a goal to measure, not an assumed result of deleting dormant extensions.

## Decisions

| Area | Remove or replace | Required behavior |
| --- | --- | --- |
| Copilot | Copilot-specific extension source, build inputs, entitlement and account setup, provider implementations, prompts, and UI | Keep the general extension host and chat APIs so other extensions, including Claude Code, can work. ES Code already excludes the Copilot extension from its app bundle. |
| Browsers | The integrated Browser workbench feature and the built-in `simple-browser` extension | Ordinary HTTPS and localhost links from the editor and terminal open the macOS default browser. Keep extension webviews and the native external-link opener. |
| Settings Sync | The built-in Settings Sync client and its UI | User settings and workspace settings remain available. The owner stores chosen settings in Git dotfiles. `product.json` has no `configurationSync.store` endpoint. |
| Profiles | Profile creation, switching, import/export, and associated UI | Keep a single internal default profile if the settings and extension services require it. Keep user and repo workspace settings. |
| Remote services | Remote SSH, GitHub Codespaces, Remote Tunnels, and public tunnel forwarding features | Keep the remote extension host/server and local port access needed by **local Dev Containers**. Do not delete shared tunnel or remote code without checking container call sites. |
| Web edition | Browser-hosted ES Code build and release targets | Keep Electron's shared renderer code, extension webviews, and server pieces needed by local Dev Containers. Package macOS now; retain Windows and Linux source paths for possible future builds. |
| Notebooks | Built-in `.ipynb` support and notebook output renderers | Keep general notebook extension APIs so an extension can add notebook support later. |
| Microsoft sign-in | Bundled Microsoft authentication provider | Keep regular GitHub authentication, SSH Git access, and the general authentication provider API. |
| Terminal completion | Bundled terminal suggestion provider and ES Code's default terminal completion behavior | Shell completion comes from the owner's Oh My Zsh setup. Keep the integrated terminal, shell integration used by other features, **editor IntelliSense**, and the generic terminal completion extension API. |
| Themes and icons | Stock bundled color and file icon choices | Make the base **Tokyo Night** color theme and **Nomo Dark** file icon theme source-controlled built-ins and the defaults. Keep the theme extension point so installed themes still work. |

Keep every currently bundled language extension; do not add Kotlin as a built-in. Keep Markdown and Mermaid viewing, Git and GitHub workflows, Open VSX extension installation, the Pi terminal shortcut, and the Run, Debug, and Test platform for Jest, Vitest, React Native, and other adapters. The owner occasionally edits inside a local Dev Container as well as running container commands from a host terminal.

Only the packages named below and the stock theme packages are approved for package removal. Keep the other bundled extensions unless the owner makes another decision.

## Built-in extension packages to remove

These sizes are approximate disk footprints in the installed macOS app reviewed on 22 October 2026. They describe package size, not expected startup savings.

| Package | Approximate size | Reason |
| --- | ---: | --- |
| `microsoft-authentication` | 7.2 MB | No Microsoft or Azure sign-in workflow; Settings Sync is also being removed. |
| `simple-browser` | 196 KB | Links should open in the system browser. |
| `ipynb` | 840 KB | No notebook use. |
| `notebook-renderers` | 508 KB | No notebook use. |
| `tunnel-forwarding` | 52 KB | No public port-sharing workflow. Keep ordinary local container port access. |
| `terminal-suggest` | 4.8 MB | Terminal completion comes from the shell. |

The six packages total roughly 13.6 MB. The Copilot extension is already excluded from the packaged app in [`build/gulpfile.vscode.ts`](build/gulpfile.vscode.ts); removing its source chiefly reduces maintenance work.

Remove these stock theme packages: `theme-abyss`, `theme-kimbie-dark`, `theme-modern-icons`, `theme-monokai`, `theme-monokai-dimmed`, `theme-quietlight`, `theme-red`, `theme-seti`, `theme-solarized-dark`, `theme-solarized-light`, and `theme-tomorrow-night-blue`. Replace the selectable themes and minimal file icons in [`theme-defaults`](extensions/theme-defaults/package.json) with one source-controlled Tokyo Night theme and Nomo Dark icon set. The replacement assets are roughly the same size as the stock theme packages, so this is primarily a customization and maintenance decision.

The selected color theme is `Tokyo Night` from `enkia.tokyo-night` 1.1.2, not its Storm or Light variant. The selected file icon theme is `vs-nomo-dark` from `be5invis.vscode-icontheme-nomo-dark` 1.3.9. Both [Tokyo Night](https://github.com/tokyo-night/tokyo-night-vscode-theme) and [Nomo Dark](https://github.com/be5invis/vscode-iconset) publish their source under MIT licences; retain their copyright and licence notices with copied assets. The current defaults are set in [`esCode.contribution.ts`](src/vs/workbench/contrib/esCode/browser/esCode.contribution.ts). Account for the startup color fallback when changing the default theme.

Remote SSH and Codespaces connector extensions are not bundled in the current app. Their work area concerns dedicated entry points, services, product configuration, and build outputs; it is not a package deletion. The compatible Dev Containers connector and **Reopen in Container** flow have not yet been verified in this fork, so that baseline must be established before removing shared remote infrastructure.

### Baseline established before remote edits

At commit `95a444f5`, the installed `~/.es-code/extensions` directory contained only `enkia.tokyo-night-1.1.2-universal`; no Dev Containers connector was installed. Source and product searches found no bundled `remote-containers` connector or `Reopen in Container` command. A runtime check of `es-code --list-extensions --show-versions` could not complete because the sandbox denied creating the app log directory under `~/Library/Application Support/ES Code/logs` (`EPERM`). `docker info` also could not connect to `~/.docker/run/docker.sock` (`EPERM`). Thus the Reopen in Container and local server flow is **not verified as a working baseline** in this environment; do not claim this removal broke or preserved that runtime flow. Shared remote extension host, server, and local port infrastructure will be retained while the compatible connector is unavailable.

The installed baseline macOS app (`/Applications/ES Code.app`, version 1.144.0) occupied 747 MB, including 151 MB under `Contents/Resources/app/extensions` (`du -sh`, 22 October 2026). This installed app is a baseline artifact, not a build of the changes below. No comparable post-change app package or startup timing has been produced, so no size or startup gain is claimed.

## Work areas for separate agents

Each agent should claim one area in an isolated branch or worktree, record the resulting commit or PR here, and report the validation performed. Coordinate edits to shared entry points such as `workbench.desktop.main.ts`, `product.json`, and build files during integration.

| ID | Area and starting points | Owner | Status | Result / evidence |
| --- | --- | --- | --- | --- |
| A | Theme transition: `extensions/theme-*`, `src/vs/workbench/contrib/esCode/browser/esCode.contribution.ts`, theme startup fallback, licence notices | Theme agent, `codex/es-code-theme`, isolated worktree A | Integrated; packaged check pending | `32254125167` integrated as `2c7ea38272f`. Replaced 11 stock packages with Tokyo Night and Nomo Dark; 114 icon paths, MIT notices, JSONC/assets checked. Isolated source launch showed `vscode-theme-defaults-themes-tokyo-night-color-theme-json` and `file-icons-enabled`; Nomo icon rendering and theme switching still need a file-tree check. |
| B | Browser removal: `extensions/simple-browser`, `src/vs/workbench/contrib/browserView`, browser registration in `workbench.desktop.main.ts`; retain `src/vs/workbench/electron-browser/window.ts` external opening | Root agent, `codex/es-code-browser`, isolated worktree B | Integrated; link check pending | `037f62d7b87` integrated as `fb599613be8`. Removed Browser editor/actions, localhost opener and Sessions Browser actions. macOS native external opener no longer honors an app-specific browser override. Shared BrowserView services remain for Canvas and chat. HTTPS/localhost and webview runtime checks remain. |
| C | Accounts and settings: `extensions/microsoft-authentication`, `src/vs/platform/userDataSync`, `src/vs/workbench/contrib/userDataSync`, `src/vs/workbench/contrib/userDataProfile` | Accounts agent, `codex/es-code-accounts`, isolated worktree C | Integrated; remaining backend audit | `556528a2d2c`, `d75e68a1cb8`, `2271b5cdcdb` integrated as `d35832568a0`, `4bf44a70c06`, `870778a1954`. Removed Microsoft provider, Sync UI/live startup services/channels, profile creation/switch/import/export UI; Electron uses the default profile. Kept profile storage and internal Agents profile. Client typecheck and source compile passed after integration. Platform Sync implementation source remains dormant; no product store endpoint. |
| D | Remote and packaging: `extensions/tunnel-forwarding`, `src/vs/platform/remoteTunnel`, `src/vs/workbench/contrib/remoteTunnel`, remote entry points, `build/gulpfile.vscode.web.ts`; audit Dev Containers dependencies first | Remote agent, `codex/es-code-remote`, isolated worktree D | Integrated; container runtime check pending | `0db1bf4eed1` integrated as `c3755083838`. Removed tunnel-forwarding package and standalone web build targets/pipelines. Shared remote extension host, server and local port paths retained after call-site audit. Dev Containers flow was unavailable for baseline verification as recorded above. |
| E | Copilot-specific code: `extensions/copilot`, `src/vs/workbench/services/chat/common/chatEntitlementService.ts`, `src/vs/platform/agentHost/node/copilot`, build dependencies; keep shared chat and agent extension APIs | Remote agent, `codex/es-code-copilot`, isolated worktrees E and E-CI | Integrated in part; dormant code audit remains | `602971e1cf9`, `ae2fe8a6e79`, `c1fca878fc3`, `f95b38535a3` integrated as `a124eb13219`, `23830e7af2b`, `c6a70f073da`, `8e3921428b4`. Removed Copilot extension, provider-only agent-host source/tests, dedicated CI and VSIX pipeline, Copilot onboarding/probe and smoke suites. Host conformance now uses Claude. Retained shared chat/agent APIs and required Copilot SDK/API dependencies for those APIs. Entitlement/chat-setup code is dormant because `product.defaultChatAgent` is absent; `copilot_shim` and historical E2E YAML/docs remain. |
| F | Notebook packages: `extensions/ipynb` and `extensions/notebook-renderers`; retain notebook extension APIs | Remote agent, `codex/es-code-notebooks`, isolated worktree F | Integrated | `1a9e5792552` integrated as `cc58f58a734`. Both manifests and sources removed; general notebook APIs retained. Shared build/test references cleaned, extension compilation and client typecheck passed. |
| G | Terminal suggestions: `extensions/terminal-suggest` and default behavior in `src/vs/workbench/contrib/terminalContrib/suggest`; retain editor IntelliSense and shell integration | Remote agent, `codex/es-code-terminal`, isolated worktree G | Integrated | `eed8d7b18b1` integrated as `4d5d6d5923c`. Package removed, `terminal.integrated.suggest.enabled` defaults false. Generic terminal completion API, editor suggest, integrated terminal and shell integration remain. Extension compilation and client typecheck passed. |
| V | Integration and verification across the tracks above | Root agent, `main` | Integrated; acceptance checks remain | Shared cleanup commits `a4b3bb99f84`, `1820434731c`, `5790c96c02c`, plus command-picker and E2E runner follow-up. Built-in extension compilation, client typecheck/source compile, smoke TypeScript compile and 69 focused build tests passed. Static audit confirms Open VSX endpoints, Git/GitHub auth, bundled languages without Kotlin, Markdown/Mermaid, editor IntelliSense, Run/Debug/Test, Pi shortcut and Windows/Linux source paths remain. Isolated source window opened with Tokyo Night and a working command palette. No package or release. |

## Acceptance checks for implementation

- A clean macOS build opens with source-controlled Tokyo Night and Nomo Dark defaults. Theme extensions remain installable and selectable.
- HTTPS and localhost links from editor content and the terminal open the macOS default browser. Extension webviews still open.
- Git clone over SSH, Source Control, normal GitHub sign-in, and Open VSX installation still work. Test a Claude Code extension from Open VSX as a compatibility check, without treating one extension as proof that all extensions work.
- A local repository can reopen inside a Dev Container, run commands there, and access its local development server. Establish the current fork's baseline first because no Dev Containers connector is bundled.
- TypeScript editor IntelliSense, other bundled language support, Markdown/Mermaid viewing, and Run/Debug/Test extension points remain available. Terminal completions come from zsh; ES Code does not show its own suggestions by default.
- The macOS app package omits the selected built-in extensions and stock themes. Record package size and startup measurements before claiming performance gains.

### Evidence and checks on the integrated tree

- `npm run typecheck-client`, `npm run compile-client`, `npm run gulp compile-extensions`, and `npm run compile --prefix test/smoke` passed with zero TypeScript errors. The final compile includes the command-picker service fix.
- Focused build tests covering change detection, cache selection, Agent Host test selection, build-fast and retained Copilot SDK package filters passed **69/69**. YAML parsing, `bash -n scripts/test-integration.sh`, and `git diff --check` passed.
- The selected six package manifests and 11 stock theme manifests are absent from `extensions/` and `.build/extensions/`; required Git, GitHub authentication, TypeScript, Markdown, Mermaid and theme-defaults manifests remain. `product.json` still points to Open VSX. Kotlin is not bundled. The client and extension compiles include editor IntelliSense and the default language extensions.
- An isolated source-built Electron window opened. Its workbench class included `vscode-theme-defaults-themes-tokyo-night-color-theme-json` and `file-icons-enabled`. The Pi terminal shortcut appeared on the welcome surface. The command palette opened after registering its AI-related and chat-agent dependencies in the editor workbench. Searching for `Profiles` exposed no user-profile creation/switching commands; searching for `Settings Sync` exposed no Sync command. The initial command-palette failure was found and corrected during this runtime check.
- Package size and startup comparison remain unmeasured. The macOS package task was not run: its default output is a pre-existing sibling directory outside the writable workspace. A package in an isolated build location, theme icon rendering/switching, HTTPS/localhost default-browser behavior, webviews, Git/Open VSX/Claude workflows, and a local Dev Container session still need end-to-end checks. The baseline lacks a compatible Dev Containers connector, and Docker access was denied, as recorded above.

## Coordination notes

Implementation was authorized by the 22 October 2026 task and carried out in isolated worktrees before cherry-pick integration. Follow the nearest `AGENTS.md` before further code changes. Keep this table and the acceptance evidence current. The original `AGENTS.md` worktree edit belongs to the user and is excluded from implementation commits.
