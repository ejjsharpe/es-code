# ES Code removal plan: fourth pass

**Status:** Implemented and validated on 22 October 2026 from `main` commit `91f66080916853b8df0ec2d91e8f15eaa2ce3602`; the integrated source commit is `cc00cc60ec7227594bca00bcea323184f1689ef1`. A disposable macOS arm64 app was packaged and smoke launched. The installed `/Applications/ES Code.app` was not replaced. The worktree's pre-existing user edit to `AGENTS.md` was preserved and excluded from implementation commits. The [overall removal plan](ES_CODE_REMOVAL_PLAN.md) and [second](ES_CODE_REMOVAL_ROUND_2.md) and [third](ES_CODE_REMOVAL_ROUND_3.md) pass plans remain the decision and acceptance record for earlier work.

The owner uses ES Code as a macOS desktop app and has decided to remove the browser-served editor (`server-web`) and both **Allow Remote Connections** methods for the local Agent Host: Dev Tunnels and GitHub environments. This pass removes remote access to this Mac's Agent Host. It does not remove the local Agent Host, general chat and extension APIs, or the headless server and local port access reserved for local Dev Containers.

## Decisions and boundaries

| Area | Remove | Preserve and verify |
| --- | --- | --- |
| Browser-served editor | The `server-web` / `reh-web` target, its browser UI serving path, `remote/web` dependency installation if no other consumer remains, browser-server packages, CI artifacts, release metadata, and target-specific tests and documentation. | The macOS Electron workbench, extension webviews, shared renderer code, and the headless `server` / `reh` target needed for local Dev Containers. The existing `web` target is separate; audit its remaining references against the earlier standalone web decision before changing it. |
| Agent Host Dev Tunnels | The local Agent Host Dev Tunnel sharing branch, tunnel-based remote Agent Host connection/discovery UI and services that have no retained consumer, and their SDK bundles or dependencies after call-site audit. | Ordinary local container port access and generic extension tunnel/remote APIs where they have live consumers. Do not equate public Dev Tunnels with local port forwarding. |
| Agent Host GitHub environments | The **Allow Remote Connections** GitHub environment option, local host publication and sharing service, user-local remote host discovery/connection UI and services where they exist only for this option, settings, commands, and tests. | Regular GitHub authentication, Git workflows, local Agent Host sessions, and separate cloud sandbox/session features if they have live consumers. `missionControl` names are shared across features; audit imports before deleting a module or dependency. |
| Existing sharing state | Ensure an existing profile cannot silently resume Dev Tunnel or GitHub environment sharing after upgrading. Account for stored `agentHost.missionControl.sharing` and any previously published environment or active tunnel. | Existing user settings unrelated to remote sharing. Record how old sharing is withdrawn or expires, and test the upgrade path. |
| Platforms | Remove `server-web` artifacts across platform build definitions so CI and release manifests do not request missing outputs. | Windows and Linux desktop/headless server source paths remain as in the overall plan; only macOS desktop packaging is required for acceptance in this pass. |

The earlier local Dev Containers CLI and localhost HTTP check passed, but no compatible connector or **Reopen in Container** editor flow has been verified. Keep that gap explicit. Do not claim that removing browser delivery proves desktop container editing works. The prior round removed the classic Remote Tunnel workbench UI, but left Agent Host remote connection controls and services; those are the focus here.

## Code and build inventory to audit

- **Server/web packages:** `remote/package.json` and `remote/.npmrc` feed headless server packaging in `build/gulpfile.reh.ts`; `remote/web/package.json`, `remote/web/package-lock.json`, and `remote/web/.npmrc` are the separate browser dependency set. `build/npm/dirs.ts`, `build/npm/postinstall.ts`, `build/gulpfile.hygiene.ts`, and `scripts/xterm-update.js` name these install roots. The generated `remote/**/node_modules` directories are ignored, not tracked source.
- **Server-web target:** `build/gulpfile.reh.ts`, `build/gulpfile.vscode.ts`, `build/lib/esbuild.ts`, `build/next/index.ts`, and `build/next/resources.ts` define `reh-web` / `server-web`. `src/vs/server/node/remoteExtensionHostAgentServer.ts` conditionally creates `WebClientServer` from `src/vs/server/node/webClientServer.ts`. Audit that runtime path separately from resource serving, extension-host connections, and the headless server.
- **Build and release:** `build/azure-pipelines/{darwin,linux,win32,alpine}` still build, sign, test, or archive `vscode-server-*-web`; `build/azure-pipelines/product-build.yml` and `build/azure-pipelines/common/publish.ts` list web-server artifacts. `test/sanity/src/serverWeb.test.ts`, `test/sanity/src/wsl.test.ts`, build tests, and related docs refer to the target. Parse edited YAML and check all artifact consumers after removal.
- **Sharing UI and settings:** `src/vs/workbench/contrib/chat/electron-browser/{tunnelHost.contribution,toggleRemoteConnectionsActionViewItem,remoteTunnelCommands}.ts`, the Sessions titlebar contribution under `src/vs/sessions/contrib/tunnelHost/electron-browser/`, and `src/vs/workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHost.contribution.ts` register the command, menu controls, and `chat.agentHost.remoteConnections` setting. Remove stale accessibility help, tests, and localization references as part of the same change.
- **GitHub environment host:** `missionControlSharingService.ts` stores sharing state and calls `IAgentHostService.configureMissionControl`; the host implementation is reached through `src/vs/platform/agentHost/node/agentHostMain.ts` and `src/vs/platform/agentHost/node/missionControl/`. `missionControlAgentHostContribution.ts` also uses the sharing service to publish project folders. Audit host publication and remote environment discovery independently of cloud sandbox and local session clients.
- **Dev Tunnel Agent Host clients:** The desktop `tunnelAgentHostServiceImpl.ts`, browser `browserTunnelAgentHostService.ts` and `webTunnelAgentHostService.ts`, their registrations in `sessions.desktop.main.ts` / `sessions.web.main.ts`, the shared-process `TunnelAgentHostMainService`, `ITunnelAgentHostService`, and `build/next/devTunnelsWeb.ts` have connected call sites. Search all `ITunnelAgentHostService`, `RemoteAgentHostEntryType.Tunnel`, `tunnelApplicationConfig`, and `@microsoft/dev-tunnels-*` references before removing the service, types, or packages. Keep any dependency still used by generic port forwarding or another retained feature.

## Work areas for orchestration

W, H, and C were implemented in separate worktrees and cherry-picked into `main`. V used a detached disposable worktree for packaging and smoke testing. Integration and follow-up fixes were done in the main worktree.

| ID | Area | Status | Result / evidence |
| --- | --- | --- | --- |
| W | Remove `server-web` build/runtime delivery, `remote/web` only if orphaned, all package/pipeline/release/test references; retain headless `server` | Integrated | `/private/tmp/escode-round4-w`, `e12d935af96` cherry-picked as `a5ee9acfc16`. Removed the browser-serving runtime, `reh-web` / `server-web` build targets, `remote/web`, CI/release artifacts and target-specific tests. The separate standalone `web` target had no remaining delivery consumer and was also removed. |
| H | Remove both local Agent Host sharing methods, controls, setting and stored-state restoration; audit safe withdrawal of existing sharing | Integrated | `/private/tmp/escode-round4-h`, `81b7c1c110d` cherry-picked as `fb259f45e25`. Removed both sharing actions, the setting and host publishing. A startup migration deletes the old `agentHost.missionControl.sharing` application-storage key. |
| C | Remove orphaned Dev Tunnel and GitHub environment Agent Host client/host services, SDK bundles and dependencies after a consumer graph; preserve cloud sessions, GitHub auth and local container paths | Integrated | `/private/tmp/escode-round4-c`, `b74bde206ce` cherry-picked as `0b91b7de8ad`. Removed Agent Host tunnel and user-local GitHub environment clients, discovery, host services, Dev Tunnel SDKs and unused web bundle. Live cloud sandbox/session and GitHub authentication consumers remain. |
| V | Integrate, run focused source/build tests, package and launch a disposable macOS arm64 app, verify retained workflows, update this plan | Complete with limits below | Main integration follow-up `cc00cc60ec7`; validation in `/private/tmp/escode-round4-v`. Disposable app and headless server package passed; app launch, local files, Markdown webview and Dev Containers CLI/localhost smoke passed. |

## Acceptance checks

- A clean dependency install and the retained macOS desktop and headless server build do not request `remote/web`, `server-web`, `reh-web`, or `vscode-server-*-web`. No release manifest expects their artifacts. If a separate `web` target remains, explain its consumer and status; do not leave a second browser editor delivery path by accident.
- The desktop and Sessions UI contain no **Allow Remote Connections**, Dev Tunnel, or GitHub environment sharing controls or registered commands. Removed settings have no production registration; old stored sharing state does not start a host or publish this Mac on launch. Explicitly test or otherwise verify withdrawal/expiry for a profile that had sharing enabled.
- No Agent Host Dev Tunnel or GitHub environment connection service is registered solely for the removed paths. Audit any retained `remoteTunnel`, `ITunnelService`, `missionControl`, or `@microsoft/dev-tunnels-*` code with concrete consumers before deciding to keep it. No dangling imports, DI lookups, command aliases, tests, docs, or extension-facing references remain.
- The local Agent Host and Claude/Codex sessions still start. The macOS app opens local files, Git and GitHub authentication paths remain available, Open VSX installs and extension webviews remain intact. The installed-app Dev Containers CLI and localhost port check should be repeated if a comparable disposable runtime is available; editor reopen remains a known gap unless actually tested.
- Run targeted tests for changed build rules, Agent Host sharing/state, and retained remote/container paths; then the smallest appropriate client/build type checks and targeted ESLint. Validate edited JSON/YAML, run `git diff --check`, package a temporary macOS arm64 app if build inputs change, and smoke launch it with a disposable profile. Record exact commands, results, untested paths, deleted tracked file/line counts, and comparable package sizes only when measured. Do not attribute startup gains to source deletion without a timing comparison.

## Integration record

The four implementation commits above remove 92 tracked files (27,930 lines in those deleted files). Against the baseline, the integrated code has 217 changed files, 569 inserted lines and 33,876 deleted lines (`git diff --shortstat 91f6608 cc00cc6`; deleted-file count from `git diff --numstat --diff-filter=D`). This is source churn, not a measured package-size or startup improvement.

The shared-process upgrade cleanup clears `remoteTunnelSession` on launch. If the old `remoteTunnelIsService` flag says a tunnel service was installed, it calls the retained CLI's `tunnel service uninstall`, clearing the flag only after success and retrying on a later launch after failure. The workbench startup migration removes the old Mission Control sharing opt-in. The local publisher and its restoration path are gone, so a previously shared profile cannot republish the host; the old cloud listing's expiry was not measured. The cloud connection service rejects legacy `environmentKind: 'user-local'` before requesting credentials. Focused tests cover key removal, successful uninstall, retry after failed uninstall and user-local rejection. No live, previously published account was available to test cloud-side listing expiry.

Consumer audit retained `remote/package.json`, `reh` and the remote extension-host server for headless/local container use; generic extension port-tunnel APIs and the standalone CLI runner needed for upgrade uninstall; GitHub authentication and cloud sandbox/session clients; local Agent Host and chat providers; and Electron extension webviews. `missionControlAuthentication.ts` still supplies `resolveMissionControlIdentity` to the live local credential source. Historical `mission_control` / `user-local` telemetry enum values remain for older event compatibility, with documentation updated to call them historical. Removed the obsolete Dev Tunnel smoke fixture, public Agent Host tunnel discovery API and user-local workbench credential sealing branch. Search of active build/package rules found no `server-web`, `reh-web`, `remote/web`, `vscode-server-*-web`, `ITunnelAgentHostService` or Dev Tunnels SDK dependency.

### Validation results

| Check | Exact command or method | Result |
| --- | --- | --- |
| Dependencies | `npm run install-fast` | Passed after running with elevated sandbox access for the node-gyp cache and dependency network. Log: `/private/tmp/round4-install-fast-escalated.log`. |
| Build checks | `npm --prefix build run typecheck`; `npm run typecheck-client`; `npm run compile-client`; `npm run build-fast -- --client-only`; `npm run compile --prefix test/smoke` | All passed. Logs: `/private/tmp/round4-tsc6.log`, `/private/tmp/round4-compile-client-final.log`, `/private/tmp/round4-build-fast2.log`, `/private/tmp/round4-smoke-tsc3.log`. |
| Build-rule tests | `TMPDIR=/private/tmp node --experimental-strip-types --test build/next/test/resources.test.ts build/next/test/standalone.test.ts` | 31 passed, 0 failed. Log: `/private/tmp/round4-build-tests2.log`. |
| Agent Host and migration tests | Eight explicit `--run` test files listed below | 186 passed, 0 failed; includes sharing migration, legacy tunnel withdrawal, cloud sandbox connection, Dev Container connector, diagnostics and location preference. Logs: `/private/tmp/round4-unit-tests-final.log` and `/private/tmp/round4-unit-tests-explicit.log`. |
| Retained-path tests | Six explicit `--run` test files listed below | 1,049 passed, 0 failed. Logs: `/private/tmp/round4-retained-tests.log` and `/private/tmp/round4-retained-tests-explicit.log`. Electron tests required elevated sandbox access; the unprivileged process aborted before running tests. |
| Lint and metadata | Targeted ESLint over 49 changed TypeScript files; parsed 24 changed YAML/JSON files with `js-yaml` / `JSON.parse`; `git diff --check` | Passed. ESLint log: `/private/tmp/round4-eslint.log`. |
| macOS arm64 app | `BUILD_SOURCEVERSION=cc00cc60ec7227594bca00bcea323184f1689ef1 npm run gulp vscode-darwin-arm64-min` in detached V worktree | Passed; `/private/tmp/VSCode-darwin-arm64/ES Code.app` embeds that commit. `codesign --verify --deep --strict` passed; executable is Mach-O arm64. Log: `/private/tmp/round4-package-escalated.log`. |
| macOS arm64 headless server | `BUILD_SOURCEVERSION=cc00cc60ec7227594bca00bcea323184f1689ef1 npm run gulp vscode-reh-darwin-arm64-min` | Passed; `/private/tmp/vscode-reh-darwin-arm64`. Node 24.21.0 download checksum verified. Log: `/private/tmp/round4-reh-package.log`. |
| Disposable app launch | Opened staged app with isolated user, extension and shared-data directories, plus CDP port 56011 | Opened `smoke.txt` and `smoke.md`; Markdown preview rendered its heading and paragraph in an iframe. Command palette search for `>Allow Remote Connections` showed no matching action (only fuzzy `Remote: Show Remote Menu`). Evidence: `/private/tmp/round4-smoke2/{snapshot,palette-results,preview-snapshot}.txt`. App process stopped after smoke. |
| Local Dev Containers | Staged app's bundled `@devcontainers/cli` 0.88.0 `up --workspace-folder /private/tmp/round4-container-smoke/project --user-data-folder /private/tmp/round4-container-smoke/data --skip-post-create`, then `exec --workspace-folder ... -- /bin/sh -lc 'pwd; cat README.md; test -r .devcontainer/devcontainer.json'` | Both passed with Docker Desktop. A container HTTP server responded `200` and `ES Code round 4 port` at `127.0.0.1:56164`; container removed after test. Logs: `/private/tmp/round4-container-smoke/{up,exec2}.log`. |

The exact focused Electron test selections were rerun as:

```sh
VSCODE_SKIP_PRELAUNCH=1 ./scripts/test.sh \
  --run src/vs/platform/remoteTunnel/test/node/legacyRemoteTunnelCleanup.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/remoteAgentHost/remoteSharingMigration.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/remoteAgentHost/cloudSandboxConnectionCustomization.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/remoteAgentHost/cloudSandboxLegacySessionPreparation.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/remoteAgentHost/cloudSandboxAgentHostService.test.ts \
  --run src/vs/sessions/contrib/providers/remoteAgentHost/test/electron-browser/remoteAgentHostLocationPreferenceCommand.test.ts \
  --run src/vs/sessions/contrib/providers/remoteAgentHost/test/electron-browser/devContainerAgentHostConnector.test.ts \
  --run src/vs/sessions/contrib/providers/remoteAgentHost/test/browser/connectionDiagnosticsService.test.ts

VSCODE_SKIP_PRELAUNCH=1 ./scripts/test.sh \
  --run src/vs/platform/agentHost/test/node/protocolServerHandler.test.ts \
  --run src/vs/server/test/node/serverAgentHostManager.test.ts \
  --run src/vs/platform/agentHost/test/electron-browser/remoteAgentHostService.test.ts \
  --run src/vs/sessions/contrib/chat/test/browser/sessionsChatAccessibilityHelp.test.ts \
  --run src/vs/sessions/services/agentHostFilter/test/browser/agentHostFilterService.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/remoteAgentHost/cloudSandboxApiService.test.ts
```

The staged app occupied 720,488 KiB by `du -sk`; the existing installed app occupied 719,260 KiB by the same command. They are different revisions and app contents, so the comparison does not isolate this pass's size effect. No startup timing comparison was run.

### Remaining limits

- No compatible Dev Containers editor connector is bundled, so **Reopen in Container**, an editor session in the container and its remote extension host remain unverified. The CLI and localhost port checks above cover only local container execution and port access.
- Live authenticated Claude/Codex Agent Host sessions, GitHub sign-in, and Open VSX installation were not repeated in this disposable profile. Their code paths and bundled components remain; the earlier installed-app checks are in the overall and third-pass plans.
- Windows and Linux packages were not built. CI YAML and release metadata parsed, and their removed web-server artifact references were searched, but those platform pipelines were not executed.
- The disposable app log contained the same `Unknown actor MainThreadChatSkills` and `MainThreadChatOutputRenderer` errors already documented in the earlier app check. No new launch error was observed.
- The previously published GitHub environment's cloud-side listing expiry and an already installed tunnel service on a live profile were not exercised. The local restoration barrier and uninstall retry behavior are covered by focused tests.
