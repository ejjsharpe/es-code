/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Application, ApplicationOptions, Logger, Quality } from '../../../../automation';
import { createApp, dumpFailureDiagnostics, getMockLlmServerPath, getMockLlmServerUrl, installAppAfterHandler, installDiagnosticsHandler, MockLlmServer, suiteCrashPath, suiteLogsPath } from '../../utils';
import { createRemoteDevContainerFixture, IRemoteDevContainerFixture, RemoteDevContainerTransport } from './remoteDevContainerFixtures';

// Selector for the send button in the Agents Window new-session homepage.
// Kept in sync with `SEND_BUTTON_ENABLED` in `test/automation/src/agentsWindow.ts`
// (without the `:not(.disabled)` filter so we can observe the disabled state).
const AGENTS_SEND_BUTTON_SELECTOR = '.sessions-chat-widget .new-chat-widget-container .sessions-shared-chat-input .chat-execute-toolbar .action-item.chat-submit-button';
const NETWORK_PROXY_HEADER_NAME = 'X-VSCode-Smoke-Proxy';

function mockServerStartOptions(logger: (message: string) => void, captureRequests = false) {
	const requiredRequestHeaderValue = process.env.VSCODE_SMOKE_TEST_PROXY_HEADER;
	const certificatePath = process.env.VSCODE_SMOKE_TEST_MOCK_CERT;
	const keyPath = process.env.VSCODE_SMOKE_TEST_MOCK_KEY;
	if (!!certificatePath !== !!keyPath) {
		throw new Error('Mock HTTPS requires both VSCODE_SMOKE_TEST_MOCK_CERT and VSCODE_SMOKE_TEST_MOCK_KEY');
	}
	return {
		logger,
		verbose: true,
		captureRequests,
		requiredRequestHeader: requiredRequestHeaderValue ? { name: NETWORK_PROXY_HEADER_NAME, value: requiredRequestHeaderValue } : undefined,
		trustedRequestHost: requiredRequestHeaderValue ? process.env.VSCODE_SMOKE_TEST_MOCK_HOST : undefined,
		tls: certificatePath && keyPath ? {
			cert: fs.readFileSync(certificatePath, 'utf8'),
			key: fs.readFileSync(keyPath, 'utf8'),
		} : undefined,
	};
}

const CODEX_SCENARIO_ID = 'smoke-hello-codex';
const CODEX_REPLY = 'MOCKED_CODEX_RESPONSE';

// Lightweight throwaway scenario used by {@link warmUpCodexModel} to pre-pay
// the Codex session cold-start cost (native codex app-server spawn + model
// list resolution) before the real assertion runs.
const CODEX_WARMUP_SCENARIO_ID = 'smoke-hello-codex-warmup';
const CODEX_WARMUP_REPLY = 'MOCKED_CODEX_WARMUP_RESPONSE';

export function setup(logger: Logger, quality: Quality) {

	describe('Agents Window (Codex)', () => {

		const codex = setupAgentHostSuite(logger, {
			serverLabel: 'Codex',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(CODEX_SCENARIO_ID, new ScenarioBuilder().emit(CODEX_REPLY).build());
				registerScenario(CODEX_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(CODEX_WARMUP_REPLY).build());
			},
			settings: {
				// Register the Codex provider in the agent host process (it is
				// off by default). The provider resolves the codex SDK from the
				// repo's `node_modules` in dev, or `product.agentSdks.codex` in
				// packaged builds (or the VSCODE_AGENT_HOST_CODEX_SDK_ROOT
				// override) — so the test below is a hard requirement in dev and
				// skips only in built products where the SDK is genuinely absent.
				'chat.agentHost.codexAgent.enabled': true,
			},
		});

		it('recovers when the command palette loses focus before finding New Session', async function () {
			const app = this.app as Application;
			await app.workbench.agentsWindow.waitForNewSessionView();
			const inputSelector = `.sessions-shared-chat-input .interactive-input-part .monaco-editor[role="code"] ${app.code.editContextEnabled ? '.native-edit-context' : 'textarea'}`;
			const interruption = await app.code.driver.currentPage.evaluateHandle(selector => {
				const chatInput = document.querySelector<HTMLElement>(selector);
				if (!chatInput) {
					throw new Error('New-session chat input not found');
				}
				let interrupted = false;
				const interruptFocus = (event: Event) => {
					if (event.target instanceof HTMLInputElement && event.target.matches('.quick-input-box input') && event.target.value === '>workbench.action.sessions.newChat') {
						document.removeEventListener('input', interruptFocus);
						chatInput.focus();
						interrupted = true;
					}
				};
				document.addEventListener('input', interruptFocus);
				return {
					get interrupted() { return interrupted; },
					dispose: () => document.removeEventListener('input', interruptFocus),
				};
			}, inputSelector);
			try {
				await app.workbench.agentsWindow.startNewSession();
				assert.strictEqual(await interruption.evaluate(state => state.interrupted), true);
			} finally {
				await interruption.evaluate(state => state.dispose());
				await interruption.dispose();
			}
		});

		it('Test Codex session', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			// Resolve Codex availability OUTSIDE the try/catch below so that the
			// Pending thrown by `this.skip()` is not swallowed (and re-thrown as a
			// failure) by the failure-diagnostics handler.
			await app.workbench.agentsWindow.startNewSession();
			const codexAvailable = await app.workbench.agentsWindow.isSessionTypeAvailable('Codex');
			if (!codexAvailable) {
				// Codex must be available — and so this test must run rather than
				// skip — whenever the build under test is supposed to be able to
				// resolve the SDK:
				//   - Running from source (VSCODE_DEV=1, set by the smoke runner
				//     when no `--build` is passed): the agent host is not built, so
				//     it resolves the SDK from the repo's `node_modules`
				//     (`@openai/codex` is a devDependency).
				//   - Publish builds: `product.agentSdks.codex` is stamped (only
				//     when VSCODE_PUBLISH=true, see build/azure-pipelines/common/
				//     agent-sdk-produce.yml) so the SDK is fetched from the CDN.
				// In both cases an unavailable Codex is a regression — fail loudly.
				// Otherwise (built non-publish CI, where the SDK is neither shipped
				// nor stamped) Codex is legitimately absent, so skip gracefully.
				//
				// VSCODE_DEV (not app.quality === Quality.Dev) is the precise
				// "from source" signal: parseQuality() also returns Quality.Dev for
				// a `--build` product when VSCODE_QUALITY is unset, which would
				// wrongly hard-fail a packaged build that legitimately lacks Codex.
				const isFromSource = process.env.VSCODE_DEV === '1';
				const isPublishBuild = (process.env.VSCODE_PUBLISH ?? '').toLowerCase() === 'true';
				if (isFromSource || isPublishBuild) {
					throw new Error(`[Agents Window/Codex] Codex session type unexpectedly unavailable (VSCODE_DEV=${process.env.VSCODE_DEV ?? '<unset>'}, VSCODE_PUBLISH=${process.env.VSCODE_PUBLISH ?? '<unset>'}) — the SDK should be resolvable from node_modules (from source) or product.agentSdks.codex (publish build)`);
				}
				logger.log('[Agents Window/Codex] Codex session type not available in this built product (no product.agentSdks.codex); skipping');
				this.skip();
			}

			// Codex reports as "available" once the `@openai/codex` launcher shim
			// resolves, but the native binary ships as a separate per-platform
			// optional dependency that npm silently skips when its install fails.
			// A stale `node_modules` cache can thus have the shim but no binary, so
			// fail fast here (from source) instead of timing out at spawn time.
			if (process.env.VSCODE_DEV === '1') {
				const repoRoot = path.resolve(process.cwd(), '..', '..');
				const platformPkgDir = path.join(repoRoot, 'node_modules', `@openai/codex-${process.platform}-${process.arch}`);
				const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
				let codexBinaryFound = false;
				try {
					const vendorDir = path.join(platformPkgDir, 'vendor');
					codexBinaryFound = fs.readdirSync(vendorDir).some(triple => fs.existsSync(path.join(vendorDir, triple, 'bin', binaryName)));
				} catch {
					// vendor dir (or the whole platform package) is missing → treated as not found
				}
				if (!codexBinaryFound) {
					throw new Error(`[Agents Window/Codex] Codex native binary missing at ${platformPkgDir}. We depend on \`@openai/codex\`, which is only a thin launcher shim; the actual native binaries ship as its per-platform optional dependencies (\`@openai/codex-<platform>-<arch>\`). \`npm install\` does not fail when an optional dependency can't be installed, so node_modules can end up with the shim but no binary — Codex then reports as "available" but has nothing to spawn. Try bumping build/.cachesalt to force a fresh \`npm ci\` that reinstalls the binary.`);
				}
			}

			try {
				// Pre-pay the Codex session cold-start cost: the first Codex session
				// in a fresh agent host has to spawn the native codex app-server and
				// resolve its model list before the first /responses request can
				// complete. A throwaway prompt absorbs that so the real assertion
				// runs against a warm pipeline.
				await warmUpCodexModel(app, logger, 'Agents Window/Codex');

				const requestsBefore = codex.mockServer.requestCount();
				logger.log(`[Agents Window/Codex] submitting prompt; requestCount=${requestsBefore}`);
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CODEX_SCENARIO_ID}]`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(CODEX_REPLY);
				logger.log(`[Agents Window/Codex] response (length=${text.length}): ${text}`);

				assert.ok(
					codex.mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Codex session (before=${requestsBefore}, after=${codex.mockServer.requestCount()})`
				);

				// Confirm the request flowed through the AgentHost process (the codex
				// harness) and not a renderer-side fallback by checking for a
				// `chat/turnStarted` frame in the AHP JSONL transcript. The transcript
				// is written through an async queue, so poll briefly.
				const ahpLogDir = path.join(codex.logsPath, 'ahp');
				const ahpFrames = await waitForLogContent(() => readAhpFrames(ahpLogDir), '"type":"chat/turnStarted"');
				assert.ok(
					ahpFrames.includes('"type":"chat/turnStarted"'),
					`expected the AgentHost process to have received a chat/turnStarted dispatchAction (checked ${ahpJsonlFiles(ahpLogDir).length} jsonl files under ${ahpLogDir}); if missing, the renderer-side extension likely served the reply instead`
				);
			} catch (error) {
				logger.log(`[Agents Window/Codex] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window/Codex', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});
}

/**
 * Pre-pays the Codex session cold-start cost: the first Codex session in a
 * fresh agent host has to spawn the native `codex app-server` binary and
 * resolve its model list before the first `/responses` request can complete.
 *
 * Assumes the Agents Window is showing a new-session view AND that the 'Codex'
 * session type is available (callers gate on
 * {@link AgentsWindow.isSessionTypeAvailable} first). Sends a throwaway prompt
 * to a 'Codex' session, ignores its outcome (the warm-up itself may hit the
 * cold start), then leaves a fresh new-session view with 'Codex' selected so
 * the caller can submit the real prompt against a warm pipeline.
 */
async function warmUpCodexModel(app: Application, logger: Logger, label: string): Promise<void> {
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Codex');
	await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CODEX_WARMUP_SCENARIO_ID}]`);
	try {
		await app.workbench.agentsWindow.waitForAssistantText(CODEX_WARMUP_REPLY, 60_000);
	} catch (error) {
		// Ignore — the warm-up itself may hit the cold-start race; the caller's
		// real attempt runs against an already-warmed pipeline.
		logger.log(`${label} warm-up attempt did not produce the expected reply (likely the cold-start race); proceeding with the real attempt. Reason: ${error instanceof Error ? error.message : String(error)}`);
	}
	await app.workbench.agentsWindow.startNewSession();
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Codex');
}

/**
 * Accessors for the per-suite state owned by {@link setupAgentHostSuite}.
 * Implemented with getters so tests read the values populated by the
 * `before` hooks (which run after the suite body registers the tests).
 */
interface IAgentHostSuiteContext {
	readonly mockServer: MockLlmServer;
	readonly logsPath: string;
	readonly remoteFixture?: IRemoteDevContainerFixture;
}

/**
 * Installs the shared `before`/`after` hooks for a "local AgentHost" smoke
 * suite: starts the mock LLM server, creates the app with the AgentHost env
 * vars, pre-seeds `settings.json` into both the default and Agents profiles,
 * and opens the workspace folder in the Agents Window.
 *
 * The only per-suite differences are the registered scenarios and the
 * sandbox-related settings overlay, so those are passed in.
 */
function setupAgentHostSuite(logger: Logger, config: {
	readonly serverLabel: string;
	readonly mockServerHost?: string;
	readonly registerScenarios: (api: { ScenarioBuilder: any; registerScenario: (id: string, scenario: unknown) => void }) => void;
	readonly settings: Record<string, unknown>;
	readonly remoteTransport?: RemoteDevContainerTransport;
	readonly prepareWorkspace?: (workspacePath: string, options: ApplicationOptions) => Promise<void> | void;
	readonly cleanupWorkspace?: (workspacePath: string) => Promise<void> | void;
}): IAgentHostSuiteContext {
	let mockServer: MockLlmServer;
	let logsPath: string;
	let workspacePath: string | undefined;
	let remoteFixture: IRemoteDevContainerFixture | undefined;
	let remoteFixtureSetup: Promise<IRemoteDevContainerFixture> | undefined;
	let fixtureDataPath: string | undefined;
	let tearingDown = false;

	before(async function () {
		const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

		registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
		config.registerScenarios({ ScenarioBuilder, registerScenario });

		mockServer = await startServer(0, {
			...mockServerStartOptions((msg: string) => logger.log(msg), !!process.env.VSCODE_SMOKE_TEST_PROXY_HEADER),
			host: config.mockServerHost,
		});
		logger.log(`Mock LLM server (${config.serverLabel}) started at ${getMockLlmServerUrl(mockServer)}`);
	});

	installDiagnosticsHandler(logger);

	before(async function () {
		if (config.remoteTransport) {
			this.timeout(5 * 60 * 1000);
		}
		const suiteName = this.test?.parent?.title ?? 'unknown';
		const defaultOptions: ApplicationOptions = {
			...this.defaultOptions,
			logsPath: suiteLogsPath(this.defaultOptions, suiteName),
			crashesPath: suiteCrashPath(this.defaultOptions, suiteName),
		};
		logsPath = defaultOptions.logsPath;
		workspacePath = defaultOptions.workspacePath;
		assert.ok(workspacePath, 'Expected an Agents Window smoke workspace');
		await config.prepareWorkspace?.(workspacePath, defaultOptions);
		if (config.remoteTransport) {
			assert.ok(defaultOptions.userDataDir, 'Expected an isolated smoke user-data directory');
			fixtureDataPath = fs.mkdtempSync(path.join(path.dirname(defaultOptions.userDataDir), 'remote-devcontainer-'));
			remoteFixtureSetup = createRemoteDevContainerFixture({
				transport: config.remoteTransport,
				workspacePath,
				testDataPath: fixtureDataPath,
				logsPath,
				mockServerUrl: getMockLlmServerUrl(mockServer),
				appOptions: defaultOptions,
			}, logger);
			remoteFixture = await remoteFixtureSetup;
			if (tearingDown) {
				return;
			}
		}
		this.app = createApp(defaultOptions, opts => ({
			...opts,
			sourceAppRoot: remoteFixture?.sourceAppRoot ?? opts.sourceAppRoot,
			extraArgs: [...(opts.extraArgs ?? []), ...(remoteFixture?.extraArgs ?? [])],
			extraEnv: {
				...(opts.extraEnv ?? {}),
				CODEX_HOME: opts.userDataDir ? path.join(opts.userDataDir, 'codex-home') : undefined,
				GITHUB_COPILOT_API_TOKEN: 'smoketest-fake-agent-host-token',
				// Route the agent host's shared CAPI client (used by the Codex /
				// agent-host harnesses for model discovery + requests) at the mock
				// instead of api.github.com, which would 401 with the fake token.
				VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: getMockLlmServerUrl(mockServer),
				VSCODE_SMOKE_TEST_TUNNEL_TOKEN: undefined,
				...remoteFixture?.extraEnv,
			},
		}));

		// Pre-seed settings.json on disk into BOTH the default profile and the
		// Agents profile so Agent Host startup observes the test configuration.
		const userDataDir = (this.app as Application).userDataPath;
		if (userDataDir) {
			const settings = JSON.stringify({
				// AgentHost's fetch patch honors PAC/system proxy resolution only
				// when proxy support is enabled. The smoke profile is pre-seeded from
				// scratch, so set the production default explicitly rather than
				// relying on configuration registration timing.
				'http.proxySupport': 'override',
				...(process.env.VSCODE_SMOKE_TEST_PROXY_HEADER ? {
					'sessions.useWorktree': false,
				} : {}),
				'chat.agentHost.ahpJsonlLoggingEnabled': true,
				'chat.agentHost.unsafeTestToken': 'smoketest-fake-agent-host-token',
				...config.settings,
				...remoteFixture?.settings,
			}, null, 2);
			for (const settingsPath of [
				path.join(userDataDir, 'User', 'settings.json'),
				path.join(userDataDir, 'User', 'profiles', 'builtin', 'agents', 'settings.json'),
			]) {
				fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
				fs.writeFileSync(settingsPath, settings);
			}
		}

		await (this.app as Application).start();
	});

	installAppAfterHandler(undefined, async () => {
		tearingDown = true;
		try {
			if (remoteFixtureSetup && !remoteFixture) {
				await remoteFixtureSetup.then(
					fixture => { remoteFixture = fixture; },
					error => logger.log(`Remote fixture setup failed during teardown: ${error instanceof Error ? error.message : String(error)}`),
				);
			}
			await remoteFixture?.dispose();
		} finally {
			try {
				if (workspacePath) {
					await config.cleanupWorkspace?.(workspacePath);
				}
			} finally {
				if (fixtureDataPath) {
					fs.rmSync(fixtureDataPath, { recursive: true, force: true });
				}
			}
		}
	});

	before(async function () {
		const app = this.app as Application;
		cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });
		const windowsBefore = app.code.driver.getAllWindows().length;
		await app.workbench.agentsWindow.openCurrentFolderInAgentsWindow();
		await app.workbench.agentsWindow.switchToAgentsWindow(windowsBefore);
	});

	after(async function () {
		if (mockServer) {
			await mockServer.close();
		}
	});

	return {
		get mockServer() { return mockServer; },
		get logsPath() { return logsPath; },
		get remoteFixture() { return remoteFixture; },
	};
}

/**
 * Polls `readContent` until it returns a string matching `matcher` or the
 * timeout elapses, then returns the last content read. Log files in these
 * suites are written through async queues (e.g. AhpJsonlLogger), so an entry
 * may not be on disk yet even after the assistant reply has rendered.
 */
async function waitForLogContent(readContent: () => string, matcher: RegExp | string | ((content: string) => boolean), timeoutMs = 5_000): Promise<string> {
	const matches = (content: string) => typeof matcher === 'function' ? matcher(content) : typeof matcher === 'string' ? content.includes(matcher) : matcher.test(content);
	const deadline = Date.now() + timeoutMs;
	let content = readContent();
	while (!matches(content) && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 100));
		content = readContent();
	}
	return content;
}

/** Reads a file, returning '' if it does not exist yet. */
/** Lists the `.jsonl` transcript files in an AHP log directory. */
function ahpJsonlFiles(ahpLogDir: string): string[] {
	return fs.existsSync(ahpLogDir) ? fs.readdirSync(ahpLogDir).filter(f => f.endsWith('.jsonl')) : [];
}

/** Concatenates every AHP JSONL transcript in `ahpLogDir` into one string. */
function readAhpFrames(ahpLogDir: string): string {
	return ahpJsonlFiles(ahpLogDir).map(f => fs.readFileSync(path.join(ahpLogDir, f), 'utf8')).join('\n');
}
