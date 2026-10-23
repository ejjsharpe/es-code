# ES Code removal plan: fifth pass

> Historical implementation record. [ES Code: product direction and removal record](ES_CODE_REMOVAL_PLAN.md) is the current decision source; later choices supersede any older retention requirements here.

**Status:** Implemented in the worktree on 22 October 2026 from `main` commit `942b17f952338c66635ffc3e236817bdfc7f909e`. Focused checks and a disposable macOS arm64 build passed with the runtime limits below. The app in `/Applications` was not changed. The owner's existing staged edit to `AGENTS.md` was preserved. The [overall removal plan](ES_CODE_REMOVAL_PLAN.md) records the retained workflows and earlier acceptance results.

The goal is to simplify local release packaging and remove two workbench paths that this personal desktop build does not use. This pass does not remove built-in extension packages or change the decision to retain Windows and Linux source paths for possible future builds.

## Decisions and boundaries

| Area | Remove or change | Preserve and verify |
| --- | --- | --- |
| Local release source maps | Exclude generated JavaScript and CSS source maps from locally packaged release apps, independent of the `CI` environment variable. | Keep source maps in development and build output for debugging. Do not strip code, licensing notices, or maps needed by a separate debug artifact. Measure package size against a comparable build; do not claim startup gains from this change. |
| Built-in updater | Remove the updater service, checks, downloads, update IPC, commands, settings, menus, status UI, release-notes-after-update UI, and updater-only tests/build plumbing where the dependency audit proves they are exclusive. | Preserve ordinary reload/restart, version information, installed-app replacement, and unrelated release notes or documentation links with live consumers. The current `product.json` has no `updateUrl`; future automatic updates would require reintroducing an updater and operating a signed release/update feed. |
| Separate Sessions window | Remove the dedicated Sessions window renderer, native window routing, special workspace/profile, entry points, commands and UI that only open or support that window, plus orphaned tests and resources after a consumer audit. | Keep chat and agent sessions in the ordinary editor, the local Agent Host and Claude/Codex providers, general chat and extension APIs, extension webviews, and the Pi terminal shortcut. Keep any component under `src/vs/sessions` that another live surface imports until its replacement or relocation is validated. |

The updater decision is deliberate: an MIT-licensed fork can distribute its own automatic updates, but ES Code currently has no update feed and is installed manually. This plan does not assume that a fork is barred from providing updates.

## Baseline and audit starting points

- The installed app inspected on 22 October 2026 contains approximately **166.8 MiB** of `.map` files by logical file size: **120.3 MiB** under `Contents/Resources/app/out`, **46.4 MiB** under `extensions`, and a small remainder under `node_modules`. These are contents of the earlier installed app, not an isolated estimate of fifth-pass savings. At the start of this pass, [`build/gulpfile.vscode.ts`](build/gulpfile.vscode.ts) set `stripSourceMapsInPackagingTasks = isCI`; its source and dependency package filters already knew how to omit JavaScript and CSS maps in CI. The implementation audited extension media and dependency archives for other generated map formats.
- At the start of this pass, [`product.json`](product.json) had no `updateUrl`, so `AbstractUpdateService.initialize` disabled updates for missing configuration. Registration and IPC still existed in [`app.ts`](src/vs/code/electron-main/app.ts), with platform implementations under `src/vs/platform/update`, workbench services under `src/vs/workbench/services/update`, and UI under `src/vs/workbench/contrib/update`. The audit covered every `IUpdateService` consumer and policy/CLI/build reference before deleting shared types or registrations.
- At the start of this pass, `WindowsMainService.openAgentsWindow` returned `[]`, and [`build/next/index.ts`](build/next/index.ts) did not list a Sessions renderer entry point for desktop packaging. However, `isSessionsWindow` could still be derived from the special agent-sessions workspace and [`windowImpl.ts`](src/vs/platform/windows/electron-main/windowImpl.ts) still selected Sessions HTML for that configuration. The audit covered every path that could create or restore that workspace and every import from `src/vs/sessions` before deletion. The dedicated window was distinct from agent sessions shown in the ordinary workbench.

## Work areas and status

| ID | Area | Status | Result / evidence |
| --- | --- | --- | --- |
| P | Local release map filtering, source-map references, and comparable macOS package measurement | Complete | Comparable packages from the same source and compiled output contained 1,091 generated maps (210,531,050 bytes) with maps and zero after filtering; disk allocation fell by 217,096,192 bytes. Development output retained 76 maps (174,210,320 bytes). Six packaged integrity checksums matched. |
| U | Update platform service, main-process IPC, workbench UI, configuration/policy, build metadata, and tests | Complete | Removed update services, IPC, checks/downloads, commands/UI, `update.mode`, CLI/build/test plumbing and policy fixtures. Retained manual Show Release Notes, managed minimum-version guidance, normal lifecycle commands, and Windows installer detection in `platform/windows/electron-main/innoSetup.ts`. Reload, extension-host restart, app relaunch and About version were exercised in the disposable app. |
| S | Sessions-only renderer/window/workspace/profile/commands/resources, shared consumer audit, and tests | Complete with retained shared code | Removed 1,071 Sessions-tree files, renderer/window route, special workspace/profile, `--agents` and window-only CLI flags, commands, banners, policy export, fixtures, resources and tests. Three common `src/vs/sessions` modules remain for the ordinary editor. Editor chat links, Agent Host, Claude/Codex provider source, APIs and Pi command remain. A packaged editor opened Markdown and rendered Mermaid. |
| V | Integration, focused tests, source/build checks, package smoke test, and plan status | Complete with runtime limits | Focused Electron suites: 200 passing/1 pending, 17 passing, 123 passing. Build tests: 18/18. Client/build/API typechecks, targeted lint (135 files and the final package filter), smoke/scenario TypeScript compilation, macOS arm64 package, strict signature verification and `git diff --check` passed. The fully filtered final package launched with fresh-profile extension activation logged; authenticated agent, Open VSX install, container reopening, Windows/Linux packaging and startup timing were not exercised. |

## Implementation and measurements

The release packaging flag in `build/gulpfile.vscode.ts` is independent of `CI`. Package source, extension and dependency streams exclude generated `.js.map`, `.css.map`, `.mjs.map`, `.cjs.map`, `.ts.map`, `.mts.map`, and `.cts.map` files. The first package audit found declaration and module maps in dependencies after JavaScript/CSS maps were filtered; the final filter covers those formats too. Locally packaged JS, CSS, MJS, CJS, TS, MTS and CTS lose only local `sourceMappingURL` comments. Source maps stay in `out-vscode-min` and `.build/extensions`. Package integrity checksums are calculated from the filtered bytes, which fixed an integrity warning found during the first smoke launch. CI packages can still use their CDN source-map references.

The final filtered app was built with `VSCODE_BUILD_ROOT=/private/tmp/es-round5-build npm run gulp vscode-darwin-arm64-min`. For comparison, the same compiled output was packaged with `VSCODE_BUILD_ROOT=/private/tmp/es-round5-build npm run gulp vscode-darwin-arm64-min-ci` after temporarily disabling the filter; the filter was restored to `true` afterward. Measurements below were taken before ad hoc signing. Maps inside `node_modules.asar` were counted from the archive index.

| Final arm64 app | With maps | Filtered | Change |
| --- | ---: | ---: | ---: |
| Generated maps, including ASAR | 1,091 | 0 | −1,091 |
| Generated map bytes | 210,531,050 | 0 | −210,531,050 |
| App logical bytes | 724,808,154 | 514,193,167 | −210,614,987 |
| App disk allocation | 737,374,208 | 520,278,016 | −217,096,192 (207.039 MiB) |
| `du -sk` | 720,092 KiB | 508,084 KiB | −212,008 KiB |
| Local map references in loose JS/CSS | 102 | 0 | −102 |

The development output still contains 76 generated maps totaling 174,210,320 bytes. The package size result does not measure startup time or a download artifact.

The fifth-pass worktree diff, excluding the owner's staged `AGENTS.md` edit, changes 1,320 tracked paths (321 added and 463,827 deleted lines) and adds five new files totaling 136 lines. This includes the removal of 1,071 Sessions-tree files.

## Consumer audit and retained code

- The only live import from the former `src/vs/sessions` renderer tree outside that tree was the common Agent Host sessions provider used by ordinary editor customization. Kept `common/agentHostSessionsProvider.ts` and `services/sessions/common/{session,sessionsProvider}.ts`; removed the other 1,071 files. Internal `agent-host-session://` links still open chats in the editor. Removed the external `://agents/agent-host-session` route.
- Kept ordinary editor chat/session services, local Agent Host and Claude/Codex providers, extension and webview APIs, shared agent theme/size tokens consumed by editor chat CSS, and the Pi terminal action. Dormant `isSessionsWindow` and `agentsWindow` extension/configuration compatibility fields remain because ordinary workbench and extension consumers still compile against them; no native or renderer path creates that window.
- Kept generic policy minimum-version compatibility and manual release notes. The `updateUrl` in the unbundled `vscode-test-resolver` is for downloading a remote test server, not the removed desktop updater; the mock policy server's `update.mode` is an HTTP response mode. Windows and Linux source paths remain, including the Windows Inno Setup mutex helper and Linux packaging sources.

## Validation and limits

- `npm run typecheck-client`, `npm --prefix build run typecheck`, `npm run vscode-dts-compile-check`, `npm run build-fast -- --client-only`, and the full arm64 minified gulp build passed. The final wider source-map filter was typechecked and used to repackage the compiled arm64 output successfully. `npm run compile --prefix test/smoke` and `npm run compile --prefix test/scenario` passed. Targeted ESLint checked 135 changed TypeScript files and the final three filter files; `git diff --check` passed.
- Focused Electron tests passed in three runs: 200 passing/1 pending for links, policy, onboarding, keybindings, editor resolution, chat handoff and pet catalog; 17 passing for lifecycle, menubar, profile and workspace storage; 123 passing after the Sessions-only chat tip cleanup. The sandboxed Electron runner aborted before tests began, so these runs used the approved unsandboxed test command. Build package-filter, i18n and policy conversion tests passed 18/18.
- The filtered app's six declared file checksums match its payload. Its ASAR contains zero maps and zero source-map comments among 2,409 checked JS/CSS/MJS/CJS/TS/MTS/CTS files. Ad hoc signing and `codesign --verify --deep --strict` passed. Its CLI reports `1.144.0`, baseline commit `942b17f952338c66635ffc3e236817bdfc7f909e`, and `arm64`. A disposable launch before the last CLI/tip cleanup opened a Markdown file, rendered a Mermaid diagram in the Markdown webview, reloaded its window, restarted its extension host, showed the About version and reopened after quit. The fully filtered final package launched directly with fresh isolated user data; its logs show the Markdown, Mermaid, Git and GitHub extensions activated and no integrity warning. UI automation timed out on the preceding launch, so no final-package interactive command result is claimed.
- The final launch logged `Unknown actor MainThreadChatSkills` and `Unknown actor MainThreadChatOutputRenderer`. Their disabled-actor entries already exist in baseline `HEAD`; this pass did not change them. Authenticated Claude/Codex sessions, live Agent Host requests, Open VSX installation, GitHub sign-in, Run/Debug/Test execution, Windows/Linux packages, and `Reopen in Container` were not exercised. The compatible Dev Containers connector is still unavailable. No startup improvement is claimed.

## Acceptance checks

- A local macOS arm64 release package contains no generated source-map files in the app payload, while a development build still emits usable local maps. Report measured disk size for comparable builds and keep separate source-map artifacts if debugging requires them.
- No automatic-update check, download, update command, setting, status indicator, or dead IPC/service registration remains in the desktop app. Normal reload and restart still work; the app still reports its version and can be replaced manually. Windows and Linux desktop paths compile after update-specific cleanup.
- No action points to the absent Sessions window or its special workspace. The ordinary editor launches, opens files, and retains chat, Claude/Codex/local Agent Host sessions, Pi, Git/GitHub authentication, Open VSX extension installation, extension webviews, Markdown/Mermaid viewing, Run/Debug/Test, and local Dev Containers infrastructure. Do not claim `Reopen in Container` is verified until a compatible connector is available.
- Use focused tests for changed package filters, updater registrations and surviving lifecycle behavior, and Sessions routing/shared consumers. Then run the smallest necessary client/build checks, targeted lint, `git diff --check`, and a disposable macOS arm64 package and launch. Update this plan with measured file/line and package changes and explicit untested paths; do not infer startup improvement from deletion.
