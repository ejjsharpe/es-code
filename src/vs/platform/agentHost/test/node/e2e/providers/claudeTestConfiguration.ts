/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';
import { join } from '../../../../../../base/common/path.js';
import type { IAgentHostE2EProviderConfig } from '../harness/agentHostE2ETestHarness.js';

/**
 * Resolve the path of the locally installed `@anthropic-ai/claude-agent-sdk`
 * package. It's a dev dep so it's always present at
 * `<repo>/node_modules/@anthropic-ai/claude-agent-sdk`; we hand the repo
 * directory (the SDK root — the parent of `node_modules/`) to the agent
 * host server via `--claude-sdk-root` so the Claude provider gets
 * registered.
 *
 * The Electron renderer test loader rejects bare module-specifier resolution
 * (no `import.meta.resolve('pkg')`, no `require.resolve('pkg')`), so we
 * locate the package by joining `process.cwd()` with the well-known path.
 * Tests are always invoked from the repo root.
 *
 * Returns `undefined` when the directory is missing, which disables the suite.
 */
function resolveClaudeSdkRoot(): string | undefined {
	const sdkPackageDir = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
	return existsSync(sdkPackageDir) ? process.cwd() : undefined;
}

// The shared suite runs by default in deterministic replay mode; recording is
// opt-in via `AGENT_HOST_REPLAY_RECORD=1`. Both need the SDK on disk (it drives
// the HTTP the proxy answers), so resolve it unconditionally.
const CLAUDE_SDK_ROOT = resolveClaudeSdkRoot();

export const CLAUDE_CONFIG: IAgentHostE2EProviderConfig = {
	suiteTitle: 'Agent Host E2E — Claude',
	provider: 'claude',
	scheme: 'claude',
	shellToolName: 'Bash',
	fileOperationStrategy: 'fileTools',
	subagentToolNames: ['Task', 'Agent'],
	exitPlanModeToolName: 'ExitPlanMode',
	streamingFileCreateToolName: 'Write',
	modelSwitchTarget: 'claude-opus-5',
	modelSwitchReturnTarget: 'claude-opus-5.5',
	interactiveInputPrompt: 'Use AskUserQuestion exactly once to ask "Which fruit?" with options "Apple" and "Banana". After the answer, reply with only the selected fruit.',
	cancelledInputPrompt: 'Use AskUserQuestion exactly once to ask "Continue?" with options "Yes" and "No". If the request is cancelled, reply exactly "cancelled".',
	multiSelectInputPrompt: 'Use AskUserQuestion exactly once to ask "Which colors?" with options "Red" and "Blue" and multiSelect true. After the answer, name the selected colors.',
	supportsRuntimeSlashCommandsE2E: true,
	supportsAttachmentsE2E: true,
	supportsWorktreeIncludeFilesE2E: true,
	enabled: !!CLAUDE_SDK_ROOT,
	claudeSdkRoot: CLAUDE_SDK_ROOT,
	// Worktree isolation is now shared across agents via the host-owned
	// worktree isolation controller.
	supportsWorktreeIsolation: true,
	// Claude runs shell commands (`Bash`) inside its own SDK subprocess, not
	// the host-managed custom terminal tool, so the worktree suite verifies
	// isolation via the resolved working directory alone.
	supportsHostTerminalTool: false,
	supportsSubagents: true,
	supportsSideChats: true,
	supportsSideChatsE2E: true,
	fileDeleteReplayUnstableOnWindows: true,
	// Plan mode is wired (`ExitPlanMode` interactive tool exists) but the
	// shared test's Copilot-flavoured prompt doesn't reliably drive Claude
	// to invoke it. TODO: rework the prompt for Claude conventions.
	supportsMultipleChats: true,
	supportsInitialTitle: true,
	supportsChatFork: true,
	// Claude cannot resolve a client-assigned AHP turn id to an SDK message UUID,
	// so a provider fork silently starts with fresh context.
	supportsChatForkE2E: false,
};

