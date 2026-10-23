# ES Code removal plan: second pass

> Historical implementation record. [ES Code: product direction and removal record](ES_CODE_REMOVAL_PLAN.md) is the current decision source; later choices supersede any older retention requirements here.

**Status:** Implemented and source-validated from `main` commit `12ec2e3e44ead8dac0a659fb772496f06d2a3bea` on 22 October 2026. The existing user edit to `AGENTS.md` is outside this pass and was preserved. This document records the scope, decisions, implementation tracks, and acceptance evidence for the second pass; the [original removal plan](ES_CODE_REMOVAL_PLAN.md) remains the overall decision log.

The goal is to remove workbench features that the current product does not configure or use, while preserving the installed editor, Sessions, extension compatibility, local Dev Containers infrastructure, and the workflows listed in the original plan. Tracked TypeScript line counts below are rough upper bounds on maintenance code, not expected package or startup savings.

## Decisions and boundaries

| Area | Decision | Required behavior |
| --- | --- | --- |
| Surveys | Remove the Copilot product-market-fit survey and the dormant NPS and language survey contributions, about 941 tracked production TypeScript lines before integration. | Keep the general `telemetry.feedback.enabled` setting, chat feedback surveys, issue reporting, and unrelated telemetry paths. Audit desktop and Sessions registrations, survey-only accessibility and product types, and localization/build references. |
| Remote Tunnel UI | Remove the Remote Tunnel workbench contribution and its tests, about 937 tracked production TypeScript lines. The contribution returns before registering commands because `product.json` has no `tunnelApplicationConfig`. | Keep the platform tunnel service, shared-process channel, Sessions and agent-host tunnel consumers, tunnel CLI/build fields, remote extension host, and local Dev Containers port paths. Remove only code proven specific to the unused workbench UI. |
| Cloud Changes / Edit Sessions | Remove the endpoint-dependent Edit Sessions workbench feature and its tests, about 2,470 tracked production TypeScript lines before integration. `product.json` has no `editSessions.store` URL. | Audit command aliases, URL/protocol and window payloads, the extension-facing edit-session identity API, workspace identity, shared Sync types/transport, and Sessions startup. Keep live generic extension APIs and services; delete shared Sync pieces only after proving they have no remaining consumer. |
| Native issue reporter | Keep it in this pass, per the owner's decision. | Keep extension issue reporting and `vscode.openIssueReporter`. A future simplification can assess replacing its native UI with external links. |

The first plan's retained behavior remains required: Open VSX installation, Git/GitHub workflows, Markdown/Mermaid, bundled languages, editor IntelliSense, Run/Debug/Test, general chat and extension APIs, webviews, the macOS default browser for ordinary links, and local Dev Containers infrastructure. The notebook and BrowserView systems are outside this pass. Windows and Linux source paths remain available.

## Work areas

Each implementation track works in an isolated Git worktree from the baseline above. Root integrates shared entry-point edits and updates this table when a track is complete.

| ID | Area and starting points | Owner / worktree | Status | Result and validation |
| --- | --- | --- | --- | --- |
| S | `src/vs/workbench/contrib/surveys`, workbench and Sessions entry points, survey-only product/accessibility references | Survey agent, `/private/tmp/es-code-round2-surveys` | Complete | `698480cffb6` integrated as `48638287e79`: removed seven survey implementation files and registrations from desktop, web, and Sessions; removed survey-only product, accessibility, and localization references. Isolated JSON, diff, and reference checks passed; integrated client compile passed. |
| T | `src/vs/workbench/contrib/remoteTunnel`, workbench and Sessions entry points, UI-only references; audit shared tunnel consumers | Remote UI agent, `/private/tmp/es-code-round2-remote-ui` | Complete | `4bd2b6770b4` integrated as `087137b80ae`: removed the classic contribution/test and both desktop registrations, moved retained tunnel settings and small Agent Host command contracts to live modules, and removed hover links to unregistered commands. The platform tunnel service and Agent Host UI/settings remain. In this product, the Agent Host Dev Tunnel toggle was already inert because no tunnel application config is supplied; its separate control remains a future product decision. Integrated client compile and focused tests passed. |
| E | `src/vs/workbench/contrib/editSessions`, workbench and Sessions entry points, commands, protocol and shared Sync audit | Edit Sessions agent, `/private/tmp/es-code-round2-edit-sessions` | Complete | `cb9dddef09e` integrated as `447f2b3fc2b`: removed dormant Cloud Changes/Continue On workbench code, feature-specific proposed APIs and extension contributions, URL/window plumbing, and stale build/localization references. `a8da6b7c126` integrated as `1c49a9f033f`: removed the now-orphaned Settings Sync stack, log registrations, environment/CLI options, and obsolete web configuration. The Sync stack had no external production consumer after Edit Sessions removal; user/workspace settings, profile storage, `--do-not-sync` for extension installs, and unrelated chat editing sessions remain. Isolated JSON, syntax, reference, and diff checks passed; integrated extension and client compiles passed. |
| V | Integrate S, T and E; review the retained dependency graph; validate and record source/package evidence | Root, `main` | Complete for source validation | Four agent commits integrated as `48638287e79`, `447f2b3fc2b`, `087137b80ae`, and `1c49a9f033f`. Removed the now-unused browser environment `workspaceId` constructor argument and updated its callers. The checks and runtime limits are below. |

## Acceptance checks

- The desktop workbench and Sessions have no imports of the removed survey, Remote Tunnel UI, or Edit Sessions contributions; their removed commands, settings, and product types have no stale references.
- The retained platform remote-tunnel paths still build, and local Dev Containers support is not conflated with public Remote Tunnel hosting. The absence of a compatible `Reopen in Container` connector remains a known acceptance gap from the first plan.
- General extension APIs, especially chat, notebook, authentication, and extension issue reporting, remain usable. The feature-specific edit-session identity proposal had no remaining consumer and was removed. User/workspace settings and the single internal default profile remain available.
- Run targeted checks for affected code, then a client typecheck and source compile on the integrated tree. Check the diff for whitespace errors. Package and launch an isolated macOS app only if validation warrants a runtime check; record exactly what was and was not exercised.
- Record removed tracked file and line counts from Git, and measure package size or startup only if a comparable build is available. Do not claim performance gains from source deletion alone.

## Integration record

- Against baseline `12ec2e3e44ea`, the four agent commits changed 79 tracked files, with 59 added and 8,797 deleted lines; 31 tracked files were deleted. The final integration fix and these plans add a few small changes, so use the final Git diff for the exact total. Source deletion alone is not evidence of package-size or startup improvement.
- `npm run gulp compile-extensions` passed, including Git and GitHub. `npm run compile-client` passed after updating the browser environment constructor and its test callers. Targeted ESLint passed on all 43 changed surviving TypeScript files. `git diff --check` passed.
- Focused Electron tests for `RemoteConnectionsActionViewItem`, `BrowserWorkbenchEnvironmentService`, and `Sessions - Tunnel Host Contribution` passed: 61 tests. The local development Electron binary initially aborted in the sandbox; after an ad hoc local signature repair, the test run succeeded outside the sandbox. No tracked source was changed by that repair.
- A source-built ES Code workbench launched with an isolated empty profile. Its editor UI rendered and the browser console reported zero errors. A second launch with `--agents` also started, but DevTools exposed a standard workbench window rather than a Sessions renderer. `WindowsMainService.openAgentsWindow()` already returns an empty array in this fork, which explains why this route cannot verify Sessions UI behavior.
- No comparable packaged app or installed-app acceptance run was produced in this pass. The first plan's local Dev Containers connector gap remains open. The native issue reporter and Agent Host Remote Connections UI remain intentionally in scope for a later decision.
