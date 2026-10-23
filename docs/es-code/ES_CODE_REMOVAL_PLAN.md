# ES Code: product direction and removal record

**Current decision source, 23 October 2026.** This document records the editor ES Code is intended to be and the current state of the removal work. It supersedes conflicting retention language in the historical pass records linked below. The installed macOS arm64 app at `/Applications/ES Code.app` contains runtime source commit `b0780087f27cbd9aba9d18d1492c23331e7ac1e1`; later documentation commits do not change that binary. The previous app is preserved at `/Applications/ES Code.app.backup-before-extension-only-20261023`. The normal profile and user transcript files were not changed during installation.

## The editor we are making

ES Code is a personal, local-first desktop code editor. It keeps VS Code's editing, languages, Source Control, terminal, Run/Debug/Test, and extension platform. The base app stays focused; optional capabilities come from installed extensions. "Local-first" does not mean offline-only: Open VSX, GitHub sign-in, Git operations, and installed extensions may use network services when the owner chooses them.

The owner confirmed these choices on 23 October 2026:

- **Extension-only AI.** No bundled Copilot provider, first-party local Claude/Codex Agent Host experience, GitHub Cloud agent sessions, or first-party voice and dictation. Keep general chat and language-model extension APIs (`vscode.chat` and `vscode.lm`) and repair their current bridge errors so extensions can supply AI. An extension's independent webview is also supported.
- **Local development.** Keep local Dev Containers CLI, headless server, remote extension-host infrastructure needed for local containers, and localhost port access. Leave GitHub Codespaces, Remote SSH, public tunnels, Agent Host sharing, and browser-hosted ES Code removed. The editor's **Reopen in Container** flow is still unverified because no compatible connector is available.
- **Git and GitHub.** Keep the built-in Git/Source Control experience, bundled GitHub authentication provider, and GitHub-specific actions such as repository publishing. Git over SSH is handled by the system Git executable and the user's SSH configuration; it does not require signing in through ES Code. GitHub sign-in remains useful for GitHub actions and extensions that request it.
- **Simple ownership.** Keep one internal default profile, user and workspace settings, manual app installation, Open VSX extension installation, Tokyo Night and Nomo Dark defaults, shell-driven terminal completion, Markdown/Mermaid, and bundled language support. No Settings Sync, profile-management UI, or built-in updater.

macOS desktop packaging is the current release target. Windows and Linux desktop source and build paths remain for possible later packages, but their latest packages have not been built. Source and test code is not automatically a shipped feature: distinguish removed code, disabled registration, excluded release payload, and a validated runtime behavior before declaring work complete. Audit shared services before deleting them. Do not infer startup speed from source deletion or package size.

## What has been removed or replaced

| Area | Current product state | What remains |
| --- | --- | --- |
| Copilot and first-party AI | The bundled Copilot extension, setup/entitlement and provider paths were removed. Built-in workbench AI and local Claude/Codex Agent Host startup are disabled. Six inactive AI SDK packages are excluded from the installed release manifest and payload. | Extension host, webviews, authentication extension points, and intended general chat/language-model APIs. Dormant Agent Host source and source/test dependencies still exist; see the bridge gap below. |
| Voice and dictation | First-party Voice Mode, chat playback/speech controls, editor and terminal dictation, voice windows/transcripts, local transcription runtime, Foundry dependency and its CI pipeline were removed. | The generic `vscode.speech` provider bridge, related compatibility fields and provider recording cues for extensions. Existing user transcript files were not deleted. |
| Cloud and shared agents | GitHub Cloud sandbox/coding-agent session creation, transport, picker, feed, settings and UI were removed. Dev Tunnel and GitHub-environment sharing of the local Agent Host were removed; old sharing state is cleared on startup. | Inert legacy cloud-session identifiers for stored references, GitHub sign-in, and shared remote/server code with local container consumers. |
| Separate Sessions window | Its renderer, native window route, special workspace/profile, commands and assets were removed. | Ordinary editor, extension APIs and a few shared types still consumed there. Extension-provided AI should live in the normal editor. |
| Settings Sync, profiles and Edit Sessions | The built-in Sync client, profile creation/switching/import/export UI, Cloud Changes/Continue On/Edit Sessions workbench feature and their configured service routes were removed. | Internal default profile, settings, extension storage and shared data contracts with live consumers. |
| Hosted and remote editing | GitHub Codespaces setup, dedicated Remote SSH and Remote Tunnel workbench paths, public tunnel forwarding package, browser-served editor and standalone web release targets were removed. | Local Dev Containers infrastructure, generic extension/remote contracts with live consumers, localhost access and native extension webviews. |
| In-editor browser | Browser editor and the bundled `simple-browser` extension were removed. | HTTPS and localhost links open the macOS default browser; extension webviews remain. |
| Notebooks | Bundled `ipynb` and `notebook-renderers` packages and Mermaid's notebook-only renderer/output were removed. | Generic notebook extension API; Mermaid rendering in ordinary Markdown preview and the optional rich Markdown editor. A Mermaid chat renderer asset remains, but built-in chat is disabled. |
| Terminal suggestions | Bundled `terminal-suggest` and ES Code's default terminal-suggestion behavior were removed. | Integrated terminal, shell integration, the Pi shortcut, shell completion, editor IntelliSense and generic terminal-completion extension API. |
| Account provider | Bundled Microsoft authentication was removed. | GitHub authentication and the general authentication-provider API. |
| Issue reporting | Native issue reporter window/wizard, screenshot annotation and direct upload flow were removed. | Help and extension issue commands open safe external issue links; supplied details are copied locally for manual paste. |
| Surveys | Copilot product-market-fit, NPS and language survey contributions were removed. | The general feedback setting and unrelated feedback/telemetry paths that still have consumers. |
| Themes and icons | Eleven stock theme/icon packages were removed. | Source-controlled Tokyo Night color and Nomo Dark file icon defaults; installed theme extensions remain selectable. |
| Updates and release maps | Built-in automatic-update service/UI was removed. Generated source maps are excluded from local release app payloads. | Manual app replacement, version/About information, ordinary reload/restart and release-note links; development builds retain source maps. |

The original bundled language support remains, and Kotlin was not added as a built-in. Open VSX package-signature verification is retained; the removal work does not ship a signature-check bypass.

## Retained workflows and their limits

| Workflow | Current evidence or limit |
| --- | --- |
| Core editor | Tokyo Night and Nomo Dark rendered in an installed-app check. TypeScript completion, Python/C++ highlighting, Git diff/dirty gutter, Quick Diff Peek, terminal and a disposable Run/Debug/Test adapter were exercised in earlier acceptance checks. |
| Markdown and Mermaid | Ordinary Markdown Preview and the rich Markdown editor rendered Mermaid in the sixth-pass disposable app. The new bundle keeps those assets and removes only Mermaid's notebook output. |
| Extensions | Open VSX signature verification and installations passed earlier UI/CLI checks. Claude Code 2.1.308 exposed its commands and opened its own sidebar webview to login choices on the sixth-pass disposable app. The current installed app showed Claude Code in Extensions; its isolated smoke file opened in Restricted Mode, so a signed-in prompt was not tested. One extension does not prove universal compatibility. |
| Git and GitHub | Source Control and local Git UI were exercised. Bundled GitHub authentication and actions remain. Live GitHub sign-in and authenticated SSH clone were not completed in the latest app; SSH Git depends on the system Git/SSH credentials. |
| Local containers | The bundled Dev Containers CLI 0.88.0 started a local Docker container, executed a command and served HTTP on localhost in an earlier installed-app check. **Reopen in Container**, the editor session inside a container and its extension host remain unverified without a compatible connector. |
| Packaging | The latest signed macOS arm64 app launched from `/Applications` with a disposable profile, passed `codesign --verify --deep --strict` and all six release payload checksums, and embeds `b0780087f27`. The normal profile and transcript files were not touched. |

The comparable signed sixth-pass and extension-only macOS arm64 release apps occupy **488,504 KiB** and **487,288 KiB** by `du -sk`, respectively (−1,216 KiB). Their regular-file logical bytes are **494,440,898** and **493,203,833** (−1,237,065 bytes). The fifth pass separately measured 1,091 generated maps (210,531,050 bytes) removed from a comparable local release payload while retaining development maps. These are package measurements, not startup timings. **No startup improvement is claimed.**

## Open work

1. **Extension API bridge:** The current renderer still logs `Unknown actor MainThreadChatSkills` and `MainThreadChatOutputRenderer`. The owner confirmed that `vscode.chat` and `vscode.lm` should remain usable by extensions without restoring built-in AI providers or first-party Agent Host experiences. Repair and validate those shared actors/services; test at least one extension that actually uses the affected APIs. This is a compatibility gap in the installed app.
2. **AI extension acceptance:** In a project the owner already trusts, open Claude Code's sidebar, sign in and send a harmless one-line prompt. The automated installed-app check could not enable extensions in its Restricted Mode window: automatic approval review rejected clicking **Trust** because it would enable tasks, debugging and all extensions. No trust setting was changed.
3. **Local container editor flow:** Find a compatible connector and verify **Reopen in Container**, editor commands and the remote extension host. CLI and localhost checks do not establish this workflow.
4. **Authenticated and cross-platform checks:** Exercise GitHub sign-in and an authenticated Git operation when credentials are available. Build Windows and Linux packages before claiming those releases work.
5. **Further source cleanup and performance:** Audit dormant Agent Host/Copilot source and source/test dependencies before deleting them; the installed app already excludes their inactive SDK payload. Measure comparable startup timings before reporting a speed change.

## Work-area status and historical evidence

| Work areas | Current status | Detailed record |
| --- | --- | --- |
| Initial A–H: themes, browser, accounts, remote paths, Copilot, notebooks, terminal suggestions, Open VSX | Integrated; retained workflows checked as above | Earlier source and acceptance evidence remains in Git history of this file. |
| Second pass S/T/E/V: surveys, Remote Tunnel UI, Edit Sessions | Integrated | [Second pass](ES_CODE_REMOVAL_ROUND_2.md) |
| Third pass R/C/D/V: external issue links and reporter removal | Integrated and installed at the time | [Third pass](ES_CODE_REMOVAL_ROUND_3.md) |
| Fourth pass W/H/C/V: browser delivery and Agent Host sharing | Integrated; disposable app and headless server checked | [Fourth pass](ES_CODE_REMOVAL_ROUND_4.md) |
| Fifth pass P/U/S/V: release maps, updater, separate Sessions window | Integrated; disposable app checked | [Fifth pass](ES_CODE_REMOVAL_ROUND_5.md) |
| Sixth pass M/V/C/I: Mermaid notebook output, voice, GitHub Cloud agents, integration | Integrated; disposable app checked | [Sixth pass](ES_CODE_REMOVAL_ROUND_6.md) |
| Extension-only AI follow-up | Packaged and installed from `b0780087f27`; extension API and authenticated prompt gaps remain | [Sixth-pass follow-up](ES_CODE_REMOVAL_ROUND_6.md#extension-only-ai-follow-up-23-october-2026) |

The round plans are historical implementation and measurement records. Their earlier requirements to retain built-in Claude/Codex sessions, first-party chat, cloud agent paths, or the native issue reporter do **not** override the current decisions above. Update this document when a product choice or work-area status changes; keep the round records for traceability.
