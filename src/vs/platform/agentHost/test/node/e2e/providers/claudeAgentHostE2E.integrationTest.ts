/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent host end-to-end tests (Claude).
 *
 * The cross-provider portion lives in {@link defineAgentHostE2ETests}; this
 * file would layer on Claude-specific assertions as the provider grows.
 *
 * Runs by default in deterministic replay mode against committed fixtures (no
 * token, no network). To re-record against real CAPI, set
 * `AGENT_HOST_REPLAY_RECORD=1`. The Claude SDK is resolved automatically from
 * the dev dependency in `node_modules/@anthropic-ai/claude-agent-sdk`.
 *
 *   AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
 *     src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts
 *
 * **Recording authentication:** token from `GITHUB_TOKEN` (preferred) or `gh auth
 * token`. Either works — the agent host's `CopilotApiService` discovers the
 * user's CAPI endpoint via `GET /copilot_internal/user` and uses the GitHub
 * token directly as a Bearer credential. Replay needs no credential.
 */

import { defineAgentHostE2ETests } from '../suites/agentHostE2ESuites.js';
import { CLAUDE_CONFIG } from './claudeTestConfiguration.js';

defineAgentHostE2ETests(CLAUDE_CONFIG);
