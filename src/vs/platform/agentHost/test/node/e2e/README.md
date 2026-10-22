# Agent Host end-to-end tests

These tests start the real Agent Host server and the Claude or Codex provider SDK, then drive sessions through the AHP WebSocket protocol. A local `CapiReplayProxy` serves recorded model responses from committed YAML captures. Normal replay needs no GitHub token or upstream model request. The server, provider process, tools, and protocol remain real.

## Run

From the repository root:

```bash
# Conformance, Claude, and Codex entrypoints in isolated processes.
npm run test-agent-host-e2e

# Limit parallel workers if the machine is constrained.
./scripts/test-agent-host-e2e.sh --jobs 2

# Run one provider with deterministic replay.
./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts
./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/codexAgentHostE2E.integrationTest.ts
```

On Windows use `scripts\test-agent-host-e2e.bat` and `scripts\test-integration.bat`. The complete-suite runner accepts `--jobs`, `--grep`, and `--build`. `scripts/test-integration.sh` runs a selected E2E entrypoint directly; it does not include all E2E suites in its ordinary integration run.

The shared conformance entrypoint is `conformance/agentHostConformance.integrationTest.ts`. Provider entrypoints are under `providers/`; `codexAgentHostLive.integrationTest.ts` is an explicitly live suite. Each suite owns a temporary home and user-data directory, with ambient provider configuration excluded.

## Captures and snapshots

`captures/claude-*.yaml` and `captures/codex-*.yaml` hold normalized request and response traffic for each replay scenario. `providers/__snapshots__/` and `conformance/__snapshots__/` hold semantic AHP traffic and prompt snapshots. The proxy matches recorded endpoint calls in sequence and fails if a requested response is missing or a recorded response remains unused. It supports Anthropic Messages and OpenAI Responses traffic.

A normal test run reads these files. To review an intentional behavior change, select a provider and preferably one test title:

```bash
# Update AHP snapshots using existing model captures; no token needed.
AGENT_HOST_UPDATE_AHP_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
  --grep '<test title>'

# Re-record model captures and AHP snapshots against real CAPI.
AGENT_HOST_UPDATE_SNAPSHOTS=1 ./scripts/test-integration.sh --run \
  src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts \
  --grep '<test title>'
```

Recording requires `GITHUB_TOKEN` or a token available through `gh auth token`. `AGENT_HOST_REPLAY_RECORD=1` records only model traffic. Review the changed captures and snapshots, then rerun without update flags. A mismatch in an ordinary run writes a sibling `.actual` file for diagnosis.

## Adding a scenario

Add provider-independent behavior to the suites under `suites/` or `conformance/`. Add provider-specific behavior to the appropriate file under `providers/`. Use the existing test context and fixtures to start sessions, assert AHP traffic, and register mock model responses. Keep model responses deterministic and redact paths, usernames, tokens, and personal data before committing a capture. Tests touching `SessionDatabase` must use an in-memory database, as required by `test/node/AGENTS.md`.

For a new replayed model turn, record its capture with the update mode above. Verify the request projection as well as the visible reply when the request content matters. Tool and file assertions should inspect the real test workspace rather than infer success from model text. Preserve separate Claude and Codex fixtures when the provider wire formats or behaviors differ.

## Troubleshooting

- A proxy cache miss means the scenario sent a model request with no recorded response. Check the selected provider capture and request order.
- Unused responses mean the provider stopped or changed its request sequence before consuming the fixture. Inspect the Agent Host log and the `.actual` snapshot.
- A request projection mismatch means the provider sent different model input. Review the diff before updating the baseline.
- If a test only fails on one OS, inspect shell commands, path normalization, file permissions, and process cleanup before changing the fixture.
- For known product or replay limitations, see [KNOWN_ISSUES.md](KNOWN_ISSUES.md). Its removed-provider records are historical.
