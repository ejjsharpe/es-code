/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { Server, Connection, utils as sshUtils } from 'ssh2';
import treeKill = require('tree-kill');
import WebSocket = require('ws');
import { ApplicationOptions, getBuildElectronPath, getBuildProductPath, getDevElectronPath, Logger } from '../../../../automation';

export type RemoteDevContainerTransport = 'ssh' | 'wsl';

export interface IRemoteDevContainerFixtureOptions {
	transport: RemoteDevContainerTransport;
	workspacePath: string;
	testDataPath: string;
	logsPath: string;
	mockServerUrl: string;
	appOptions: ApplicationOptions;
}

export interface IRemoteDevContainerFixture {
	readonly name: string;
	readonly settings: Record<string, unknown>;
	readonly extraEnv?: Record<string, string | undefined>;
	readonly extraArgs?: string[];
	readonly workspacePath?: string;
	readonly ssh?: { host: string; port: number; username: string; password: string; fingerprint: string };
	verifyMockServerRouting?(): Promise<void>;
	dumpConnectionDiagnostics?(uiState: string): Promise<void>;
	dispose(): Promise<void>;
}

const repositoryRoot = path.resolve(__dirname, '../../../../..');
const startupTimeout = 90_000;
const fakeModelToken = 'smoketest-fake-agent-host-token';

/** Provision a matching CLI when published, otherwise a same-quality fallback for unpublished builds. */
export function getDevContainerCliInstallCommand(codePath?: string): string {
	const productPath = codePath ? getBuildProductPath(codePath) : path.join(repositoryRoot, 'product.json');
	const product: { quality?: string; commit?: string; serverDataFolderName?: string } = JSON.parse(fs.readFileSync(productPath, 'utf8'));
	const overridesPath = path.join(repositoryRoot, 'product.overrides.json');
	if (!codePath && fs.existsSync(overridesPath)) {
		Object.assign(product, JSON.parse(fs.readFileSync(overridesPath, 'utf8')));
	}
	if (!codePath && product.serverDataFolderName) {
		product.serverDataFolderName += '-dev';
	}
	const quality = product.quality ?? 'insider';
	assertCliQuality(quality);
	const archive = quality === 'stable' ? 'code' : quality === 'exploration' ? 'code-exploration' : 'code-insiders';
	const legacyDirectory = quality === 'stable' ? '.vscode-cli' : `.vscode-cli-${quality}`;
	const serverDirectory = product.serverDataFolderName ?? '.vscode-server-oss';
	if (!/^[\w.-]+$/.test(serverDirectory)) {
		throw new Error(`Invalid CLI server data folder: ${serverDirectory}`);
	}
	if (product.commit !== undefined && !/^[0-9a-f]{40}$/i.test(product.commit)) {
		throw new Error(`Invalid CLI commit: ${product.commit}`);
	}
	const commit = product.commit?.toLowerCase();
	const latestDownload = `curl -fsSL "https://update.code.visualstudio.com/latest/cli-linux-\${cli_arch}/${quality}" -o "$cli_tmp/cli.tar.gz"`;
	return [
		'set -e',
		'case "$(uname -m)" in x86_64) cli_arch=x64 ;; aarch64|arm64) cli_arch=arm64 ;; *) exit 1 ;; esac',
		'cli_tmp=$(mktemp -d)',
		'trap \'rm -rf "$cli_tmp"\' EXIT',
		`cli_dir="$HOME/${legacyDirectory}"`,
		`cli_bin="$cli_dir/${archive}"`,
		...(commit ? [
			`if curl -fsSL "https://update.code.visualstudio.com/commit:${commit}/cli-linux-\${cli_arch}/${quality}" -o "$cli_tmp/cli.tar.gz"; then`,
			`cli_dir="$HOME/${serverDirectory}"`,
			`cli_bin="$cli_dir/${archive}-${commit}"`,
			`echo "Installing ${quality} CLI matching desktop commit ${commit}"`,
			'else',
			`echo "CLI for desktop commit ${commit} unavailable; falling back to latest ${quality} CLI" >&2`,
			latestDownload,
			'fi',
		] : [latestDownload]),
		'mkdir -p "$cli_dir"',
		'tar -xzf "$cli_tmp/cli.tar.gz" -C "$cli_tmp"',
		`mv "$cli_tmp/${archive}" "$cli_bin"`,
		'chmod +x "$cli_bin"',
		'"$cli_bin" --version',
	].join('\n');
}

function assertCliQuality(quality: string): void {
	if (quality !== 'stable' && quality !== 'insider' && quality !== 'exploration') {
		throw new Error(`Unsupported CLI quality: ${quality}`);
	}
}

async function readConnectionLogTail(file: string): Promise<string> {
	const handle = await fs.promises.open(file, 'r');
	try {
		const { size } = await handle.stat();
		const length = Math.min(size, 256 * 1024);
		const start = size - length;
		const buffer = Buffer.alloc(length);
		let offset = 0;
		while (offset < length) {
			const { bytesRead } = await handle.read(buffer, offset, length - offset, start + offset);
			if (bytesRead === 0) {
				break;
			}
			offset += bytesRead;
		}
		const content = buffer.toString('utf8', 0, offset);
		if (start === 0) {
			return content;
		}
		// Discard the leading partial entry, including any truncated credential.
		const firstEntry = content.search(/^\d{4}-\d{2}-\d{2} /m);
		return firstEntry === -1 ? '' : content.slice(firstEntry);
	} finally {
		await handle.close();
	}
}

function withoutSecrets(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const result = { ...environment };
	for (const key of [
		'VSCODE_CLI_ACCESS_TOKEN', 'VSCODE_CLI_REFRESH_TOKEN',
		'GH_TOKEN', 'GITHUB_TOKEN', 'GITHUB_PAT', 'GITHUB_COPILOT_API_TOKEN',
		'VSCODE_COPILOT_CHAT_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
		'AZURE_OPENAI_API_KEY', 'SSH_AUTH_SOCK', 'NODE_OPTIONS',
	]) {
		delete result[key];
	}
	return result;
}

class FixtureResources {
	private readonly cleanup: (() => Promise<void>)[] = [];
	private readonly secrets: string[] = [];
	private disposal: Promise<void> | undefined;

	constructor(readonly root: string, private readonly logger: Logger) {
		this.add(async () => fs.promises.rm(root, { recursive: true, force: true }));
	}

	add(cleanup: () => Promise<void>): void {
		this.cleanup.push(cleanup);
	}

	addSecret(secret: string): void {
		this.secrets.push(secret);
	}

	redact(text: string): string {
		for (const secret of this.secrets) {
			text = text.split(secret).join('<redacted>');
		}
		return text
			.replace(/([?&](?:tkn|access_token)=)[^&\s"']+/gi, '$1<redacted>')
			.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '<redacted>')
			.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<redacted>')
			.replace(/((?:authorization|accessToken|refreshToken|connectionToken)["']?\s*[:=]\s*["']?)[^"',\s]+/gi, '$1<redacted>');
	}

	log(message: string): void {
		this.logger.log(`[remote-devcontainer] ${this.redact(message)}`);
	}

	preserveLogs(source: string, destination: string): void {
		if (!fs.existsSync(source)) {
			return;
		}
		for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
			const input = path.join(source, entry.name);
			const output = path.join(destination, entry.name);
			if (entry.isDirectory()) {
				this.preserveLogs(input, output);
			} else if (entry.isFile() && /\.(?:log|jsonl)$/.test(entry.name)) {
				fs.mkdirSync(destination, { recursive: true });
				fs.writeFileSync(output, this.redact(fs.readFileSync(input, 'utf8')), { mode: 0o600 });
			}
		}
	}

	capture(child: cp.ChildProcessWithoutNullStreams, file: string): void {
		for (const [label, stream] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
			const lines = readline.createInterface({ input: stream });
			lines.on('line', line => fs.appendFileSync(file, `[${label}] ${this.redact(line)}\n`, { mode: 0o600 }));
			child.once('close', () => lines.close());
		}
	}

	spawn(executable: string, args: string[], env: NodeJS.ProcessEnv, cwd: string, logFile: string): cp.ChildProcessWithoutNullStreams {
		const child = cp.spawn(executable, args, {
			cwd, env, windowsHide: true, stdio: 'pipe',
			// A private process group also lets cleanup stop descendants after
			// their immediate parent has exited. Never kill processes by name.
			detached: process.platform !== 'win32',
		});
		this.add(() => stopProcess(child));
		this.capture(child, logFile);
		child.on('error', error => this.log(`Process failed: ${error.message}`));
		return child;
	}

	dispose(): Promise<void> {
		return this.disposal ??= (async () => {
			const errors: string[] = [];
			for (const cleanup of this.cleanup.reverse()) {
				try {
					await cleanup();
				} catch (error) {
					errors.push(this.redact(error instanceof Error ? error.message : String(error)));
				}
			}
			if (errors.length) {
				throw new Error(`Remote fixture cleanup failed: ${errors.join('; ')}`);
			}
		})();
	}
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const stoppingProcesses = new WeakMap<cp.ChildProcess, Promise<void>>();

function stopProcess(child: cp.ChildProcess): Promise<void> {
	let stopping = stoppingProcesses.get(child);
	if (!stopping) {
		stopping = stopProcessTree(child);
		stoppingProcesses.set(child, stopping);
	}
	return stopping;
}

async function stopProcessTree(child: cp.ChildProcess): Promise<void> {
	if (!child.pid) {
		return;
	}
	const signalGroup = (signal: NodeJS.Signals) => {
		if (process.platform !== 'win32') {
			try {
				process.kill(-child.pid!, signal);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
					throw error;
				}
			}
		}
	};
	if (child.exitCode === null && child.signalCode === null) {
		child.stdin?.end();
		signalGroup('SIGTERM');
		await new Promise<void>(resolve => treeKill(child.pid!, 'SIGTERM', () => resolve()));
		const deadline = Date.now() + 5_000;
		while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
			await delay(50);
		}
	}
	signalGroup('SIGKILL');
	if (child.exitCode === null && child.signalCode === null) {
		await new Promise<void>((resolve, reject) => treeKill(child.pid!, 'SIGKILL', error => error ? reject(error) : resolve()));
		const deadline = Date.now() + 5_000;
		while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
			await delay(50);
		}
		if (child.exitCode === null && child.signalCode === null) {
			throw new Error(`Process ${child.pid} did not exit after SIGKILL.`);
		}
	}
}

function waitForOutput<T>(child: cp.ChildProcessWithoutNullStreams, label: string, match: (line: string) => T | undefined, timeout = startupTimeout): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const lines = [readline.createInterface({ input: child.stdout }), readline.createInterface({ input: child.stderr })];
		const finish = (error?: Error, value?: T) => {
			clearTimeout(timer);
			for (const reader of lines) {
				reader.close();
			}
			child.off('error', onError);
			child.off('exit', onExit);
			if (error) {
				reject(error);
			} else {
				resolve(value!);
			}
		};
		const onError = (error: Error) => finish(error);
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(new Error(`${label} exited before ready (${code ?? signal}). See fixture logs.`));
		const timer = setTimeout(() => finish(new Error(`${label} startup timed out after ${timeout}ms. See fixture logs.`)), timeout);
		child.once('error', onError);
		child.once('exit', onExit);
		for (const reader of lines) {
			reader.on('line', line => {
				try {
					const result = match(line);
					if (result !== undefined) {
						finish(undefined, result);
					}
				} catch (error) {
					finish(error instanceof Error ? error : new Error(String(error)));
				}
			});
		}
	});
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

interface IHostRuntime {
	executable: string;
	args: string[];
	env: NodeJS.ProcessEnv;
	token: string;
}

function createAppEnvironment(options: IRemoteDevContainerFixtureOptions, resources: FixtureResources): Record<string, string | undefined> {
	const home = path.join(resources.root, 'app-home');
	const state = path.join(resources.root, 'app-state');
	for (const directory of [home, state, path.join(home, '.config'), path.join(home, '.cache'), path.join(home, '.ssh')]) {
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	}
	return {
		// The real SSH UI saves its host entries in ~/.ssh/config. Isolate the
		// workbench's home as well as the source host, not just user-data-dir.
		HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
		XDG_STATE_HOME: state, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'),
		CODEX_HOME: path.join(state, '.codex'), SSH_AUTH_SOCK: undefined,
		VSCODE_CLI_DATA_DIR: path.join(resources.root, 'app-cli'), VSCODE_CLI_USE_FILE_KEYCHAIN: '1',
		VSCODE_CLI_ACCESS_TOKEN: undefined, VSCODE_CLI_REFRESH_TOKEN: undefined,
		GH_TOKEN: undefined, GITHUB_TOKEN: undefined, GITHUB_PAT: 'smoketest-fake-pat',
		GITHUB_COPILOT_API_TOKEN: fakeModelToken, COPILOT_API_URL: options.mockServerUrl,
		COPILOT_DEBUG_GITHUB_API_URL: options.mockServerUrl, VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: options.mockServerUrl,
	};
}

function createHostRuntime(options: IRemoteDevContainerFixtureOptions, resources: FixtureResources): IHostRuntime {
	const appRoot = options.appOptions.codePath ? path.dirname(getBuildProductPath(options.appOptions.codePath)) : repositoryRoot;
	const executable = options.appOptions.codePath ? getBuildElectronPath(options.appOptions.codePath) : getDevElectronPath();
	const entry = options.appOptions.codePath
		? path.join(appRoot, 'out/bootstrap-fork.js')
		: path.join(appRoot, 'out/vs/platform/agentHost/node/agentHostServerMain.js');
	const packagedLauncher = path.join(__dirname, 'fixtures/packagedAgentHost.js');
	const requiredFiles = options.appOptions.codePath
		? [executable, entry, path.join(appRoot, 'out/vs/platform/agentHost/node/agentHostMain.js'), packagedLauncher]
		: [executable, entry];
	for (const file of requiredFiles) {
		if (!fs.existsSync(file)) {
			throw new Error(`Remote Dev Container smoke fixture requires an existing compiled Agent Host and its matching Electron runtime: ${file}`);
		}
	}
	const token = randomBytes(32).toString('hex');
	resources.addSecret(token);
	const tokenFile = path.join(resources.root, 'host-token');
	fs.writeFileSync(tokenFile, token, { mode: 0o600 });
	const home = path.join(resources.root, 'home');
	const state = path.join(resources.root, 'state');
	for (const directory of [home, state, path.join(home, '.config'), path.join(home, '.cache')]) {
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	}
	const env: NodeJS.ProcessEnv = {
		...withoutSecrets({ ...process.env, ...options.appOptions.extraEnv }),
		ELECTRON_RUN_AS_NODE: '1',
		VSCODE_DEV: options.appOptions.codePath ? undefined : '1',
		HOME: home, USERPROFILE: home,
		XDG_STATE_HOME: state, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'),
		CODEX_HOME: path.join(home, '.codex'),
		VSCODE_CLI_DATA_DIR: path.join(resources.root, 'host-cli'), VSCODE_CLI_USE_FILE_KEYCHAIN: '1',
		// Retain the selected Docker context without moving/writing the user's
		// Docker configuration into the isolated HOME.
		DOCKER_CONFIG: process.env.DOCKER_CONFIG ?? path.join(os.homedir(), '.docker'),
		COPILOT_API_URL: options.mockServerUrl,
		COPILOT_DEBUG_GITHUB_API_URL: options.mockServerUrl,
		VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: options.mockServerUrl,
		GITHUB_COPILOT_API_TOKEN: fakeModelToken,
		GITHUB_PAT: 'smoketest-fake-pat',
		IS_SCENARIO_AUTOMATION: '1',
		VSCODE_AGENT_HOST_CLAUDE_AGENT_ENABLED: 'false',
		VSCODE_AGENT_HOST_CODEX_AGENT_ENABLED: 'false',
		VSCODE_AGENT_HOST_TELEMETRY_LEVEL: 'off',
	};
	resources.add(async () => {
		resources.preserveLogs(path.join(resources.root, 'host-user-data', 'logs'), path.join(options.logsPath, 'remote-devcontainer-host-runtime'));
	});
	return {
		executable, env, token,
		args: options.appOptions.codePath
			? [packagedLauncher, entry, tokenFile, path.join(resources.root, 'host-user-data')]
			: [entry, '--host', '127.0.0.1', '--port', '0', '--connection-token-file', tokenFile,
				'--user-data-dir', path.join(resources.root, 'host-user-data'), '--log', 'trace', '--disable-telemetry'],
	};
}

interface IHostHandshake {
	protocolVersion: string;
}

async function verifyHost(port: number, token: string): Promise<IHostHandshake> {
	// Read the checkout's protocol version rather than duplicating the version
	// registry in a test. A --build server can negotiate its own version below.
	const registry = fs.readFileSync(path.join(repositoryRoot, 'src/vs/platform/agentHost/common/state/protocol/version/registry.ts'), 'utf8');
	const version = /PROTOCOL_VERSION\s*=\s*'(?<version>[^']+)'/.exec(registry)?.groups?.version;
	if (!version) {
		throw new Error('Cannot read the Agent Host protocol version.');
	}
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(`ws://127.0.0.1:${port}/?tkn=${encodeURIComponent(token)}`);
		const timer = setTimeout(() => finish(new Error('Agent Host capability handshake timed out.')), 20_000);
		const finish = (error?: Error, result?: IHostHandshake) => {
			clearTimeout(timer);
			socket.removeAllListeners();
			socket.on('error', () => { /* Terminating a connecting socket can emit an error. */ });
			socket.terminate();
			error ? reject(error) : resolve(result!);
		};
		let requestId = 0;
		const initialize = (protocolVersion: string) => socket.send(JSON.stringify({
			jsonrpc: '2.0', id: ++requestId, method: 'initialize',
			params: { channel: 'ahp-root://', clientId: randomUUID(), protocolVersions: [protocolVersion] },
		}));
		socket.on('open', () => initialize(version));
		socket.on('error', () => finish(new Error('Cannot connect to the fixture Agent Host.')));
		socket.on('close', () => finish(new Error('Fixture Agent Host closed during capability handshake.')));
		socket.on('message', data => {
			try {
				const response = JSON.parse(data.toString()) as {
					id?: number;
					result?: { protocolVersion?: string; _meta?: Record<string, unknown> };
					error?: { code?: number; data?: { supportedVersions?: string[] } };
				};
				if (response.id !== requestId) {
					return;
				}
				const supportedVersion = response.error?.data?.supportedVersions?.[0]?.replace(/^\^/, '');
				if (response.error?.code === -32005 && requestId === 1 && supportedVersion) {
					initialize(supportedVersion);
				} else if (response.result?.protocolVersion && response.result._meta?.['vscode.devContainers'] === true) {
					finish(undefined, { protocolVersion: response.result.protocolVersion });
				} else {
					finish(new Error('The real Agent Host did not advertise vscode.devContainers. Compile the matching source/build; do not substitute a mock host.'));
				}
			} catch {
				finish(new Error('Invalid Agent Host capability handshake.'));
			}
		});
	});
}

async function startHost(options: IRemoteDevContainerFixtureOptions, resources: FixtureResources, runtime: IHostRuntime) {
	resources.log('Starting the compiled Agent Host with its matching Electron runtime.');
	const child = resources.spawn(runtime.executable, runtime.args, runtime.env, options.workspacePath, path.join(options.logsPath, 'remote-devcontainer-host.log'));
	const port = await waitForOutput(child, 'Agent Host', line => {
		const value = /^READY:(?<port>\d+)$/.exec(line)?.groups?.port;
		return value ? Number(value) : undefined;
	});
	const handshake = await verifyHost(port, runtime.token);
	resources.log(`Real Agent Host ready on loopback port ${port}; vscode.devContainers is advertised.`);
	return { child, port, ...handshake };
}

async function createSshFixture(options: IRemoteDevContainerFixtureOptions, resources: FixtureResources, runtime: IHostRuntime): Promise<IRemoteDevContainerFixture> {
	if (process.platform === 'win32') {
		throw new Error('The local SSH fixture requires a POSIX host with bash (Linux or macOS).');
	}
	const preflight = await startHost(options, resources, runtime);
	await stopProcess(preflight.child);
	const password = randomBytes(24).toString('hex');
	resources.addSecret(password);
	const username = 'vscode-smoke';
	const name = `ssh-devcontainer-${randomBytes(5).toString('hex')}`;
	const key = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
	const parsedKey = sshUtils.parseKey(key.privateKey);
	if (parsedKey instanceof Error) {
		throw parsedKey;
	}
	const fingerprint = `SHA256:${createHash('sha256').update(parsedKey.getPublicSSH()).digest('base64').replace(/=+$/, '')}`;
	const connections = new Set<Connection>();
	const sockets = new Set<net.Socket>();
	const server = new Server({ hostKeys: [key.privateKey], ident: 'VSCode-Smoke-SSH' }, connection => {
		connections.add(connection);
		connection.on('close', () => connections.delete(connection));
		connection.on('error', error => resources.log(`SSH connection: ${error.message}`));
		connection.on('authentication', context => {
			if (context.method === 'password' && context.username === username && context.password === password) {
				context.accept();
			} else {
				context.reject(['password']);
			}
		});
		connection.on('ready', () => {
			connection.on('session', accept => {
				const session = accept();
				session.on('exec', (acceptExec, _rejectExec, info) => {
					const channel = acceptExec();
					const child = resources.spawn('/bin/bash', ['--noprofile', '--norc', '-c', info.command], runtime.env, options.workspacePath, path.join(options.logsPath, 'remote-devcontainer-ssh.log'));
					channel.pipe(child.stdin);
					child.stdout.pipe(channel, { end: false });
					child.stderr.pipe(channel.stderr, { end: false });
					child.stdin.on('error', () => { /* SSH may close stdin during shutdown. */ });
					channel.on('error', (error: Error) => resources.log(`SSH command channel: ${error.message}`));
					child.once('error', () => { channel.exit(1); channel.end(); });
					child.once('close', code => { channel.exit(code ?? 1); channel.end(); });
					channel.once('close', () => void stopProcess(child).catch(error => resources.log(`SSH command cleanup: ${error.message}`)));
					session.on('signal', acceptSignal => {
						acceptSignal?.();
						void stopProcess(child).catch(error => resources.log(`SSH signal cleanup: ${error.message}`));
					});
				});
			});
			connection.on('tcpip', (accept, reject, info) => {
				if (!['127.0.0.1', 'localhost', '::1'].includes(info.destIP)) {
					reject();
					return;
				}
				const socket = net.connect({ host: info.destIP, port: info.destPort });
				sockets.add(socket);
				socket.once('close', () => sockets.delete(socket));
				socket.once('error', () => reject());
				socket.once('connect', () => {
					const channel = accept();
					socket.removeAllListeners('error');
					socket.on('error', () => channel.destroy());
					channel.on('error', () => socket.destroy());
					channel.on('close', () => socket.destroy());
					socket.on('close', () => channel.destroy());
					socket.pipe(channel).pipe(socket);
				});
			});
		});
	});
	// Inject accepted sockets through ssh2's public API so even sockets that
	// have not finished their SSH handshake are tracked and forcibly closed.
	const listener = net.createServer(socket => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
		server.injectSocket(socket);
	});
	resources.add(async () => {
		for (const socket of sockets) {
			socket.destroy();
		}
		for (const connection of connections) {
			connection.end();
		}
		if (listener.listening) {
			await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
		}
	});
	await new Promise<void>((resolve, reject) => {
		listener.once('error', reject);
		listener.listen(0, '127.0.0.1', () => { listener.off('error', reject); resolve(); });
	});
	server.on('error', (error: Error) => resources.log(`SSH server: ${error.message}`));
	listener.on('error', error => resources.log(`SSH listener: ${error.message}`));
	const port = (listener.address() as net.AddressInfo).port;
	// Reassert isolation inside the login shell used by the real SSH client.
	// No real credential is present in this command or in settings.json.
	const environment = Object.entries(runtime.env).filter((entry): entry is [string, string] => entry[1] !== undefined &&
		['HOME', 'USERPROFILE', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'CODEX_HOME', 'ELECTRON_RUN_AS_NODE', 'VSCODE_DEV',
			'PATH', 'DOCKER_CONFIG', 'COPILOT_API_URL', 'COPILOT_DEBUG_GITHUB_API_URL', 'VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE',
			'GITHUB_COPILOT_API_TOKEN', 'GITHUB_PAT', 'IS_SCENARIO_AUTOMATION', 'VSCODE_AGENT_HOST_CLAUDE_AGENT_ENABLED',
			'VSCODE_AGENT_HOST_CODEX_AGENT_ENABLED', 'VSCODE_AGENT_HOST_TELEMETRY_LEVEL', 'VSCODE_CLI_DATA_DIR', 'VSCODE_CLI_USE_FILE_KEYCHAIN'].includes(entry[0]));
	const command = ['env', ...environment.map(([key, value]) => `${key}=${value}`), runtime.executable, ...runtime.args].map(shellQuote).join(' ');
	resources.log(`Real SSH server listening on 127.0.0.1:${port}.`);
	return {
		name, settings: { 'chat.sshRemoteAgentHostCommand': command },
		ssh: { host: '127.0.0.1', port, username, password, fingerprint },
		extraEnv: { VSCODE_CLI_ACCESS_TOKEN: undefined },
		dispose: () => resources.dispose(),
	};
}

async function createWslFixture(options: IRemoteDevContainerFixtureOptions, resources: FixtureResources): Promise<IRemoteDevContainerFixture> {
	const distro = process.env.VSCODE_SMOKE_TEST_WSL_DISTRO;
	const serverPath = process.env.VSCODE_SMOKE_TEST_WSL_SERVER_PATH;
	if (process.platform !== 'win32' || !distro || !serverPath?.startsWith('/')) {
		throw new Error('WSL smoke tests require Windows, VSCODE_SMOKE_TEST_WSL_DISTRO, and VSCODE_SMOKE_TEST_WSL_SERVER_PATH pointing to an extracted Linux VS Code server inside that distribution.');
	}
	const wsl = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wsl.exe');
	const run = (command: string, timeout = 60_000): Promise<string> => new Promise((resolve, reject) => {
		cp.execFile(wsl, ['--distribution', distro, '--exec', 'sh', '-c', command], {
			encoding: 'utf8', timeout, windowsHide: true, env: { ...withoutSecrets(process.env), WSL_UTF8: '1' },
		}, (error, stdout, stderr) => error
			? reject(new Error(resources.redact(`WSL fixture command failed: ${error.message}\n${stderr}`)))
			: resolve(stdout.trim()));
	});
	const dockerType = await run('docker info --format "{{.OSType}}"');
	if (dockerType !== 'linux') {
		throw new Error(`WSL distribution ${distro} needs a reachable Linux Docker daemon, but reports '${dockerType}'. Enable Docker Desktop WSL integration or install Docker in the distribution.`);
	}
	await run(`test -x ${shellQuote(`${serverPath}/node`)} && test -f ${shellQuote(`${serverPath}/out/bootstrap-fork.js`)}`);
	const copiedLogs = path.join(resources.root, 'wsl-logs');
	fs.mkdirSync(copiedLogs);
	const windowsRoot = await run(`wslpath -u ${shellQuote(resources.root)}`);
	const root = await run('mktemp -d /tmp/vscode-smoke-wsl-XXXXXXXX');
	if (!/^\/tmp\/vscode-smoke-wsl-[A-Za-z0-9]+$/.test(root)) {
		throw new Error(`Unexpected WSL fixture directory: ${root}`);
	}
	const workspacePath = `${root}/workspace`;
	resources.add(async () => {
		try {
			await run([
				`if [ -f ${shellQuote(`${root}/host.pid`)} ]; then kill -TERM "$(cat ${shellQuote(`${root}/host.pid`)})" 2>/dev/null || test ! -d "/proc/$(cat ${shellQuote(`${root}/host.pid`)})"; fi`,
				`ids=$(docker ps -aq --filter ${shellQuote(`label=devcontainer.local_folder=${workspacePath}`)})`,
				'if [ -n "$ids" ]; then docker rm --force $ids; fi',
				`if [ -d ${shellQuote(`${root}/user-data/logs`)} ]; then cp -r ${shellQuote(`${root}/user-data/logs`)} ${shellQuote(`${windowsRoot}/wsl-logs/host`)}; fi`,
			].join(' && '));
			resources.preserveLogs(copiedLogs, path.join(options.logsPath, 'remote-devcontainer-wsl'));
		} finally {
			await run(`rm -rf -- ${shellQuote(root)}`);
		}
	});
	const token = randomBytes(32).toString('hex');
	resources.addSecret(token);
	fs.writeFileSync(path.join(resources.root, 'host-token'), token, { mode: 0o600 });
	fs.copyFileSync(path.join(__dirname, 'fixtures/packagedAgentHost.js'), path.join(resources.root, 'packagedAgentHost.cjs'));
	const sourceWorkspace = await run(`wslpath -u ${shellQuote(options.workspacePath)}`);
	await run([
		`cp -r ${shellQuote(sourceWorkspace)} ${shellQuote(workspacePath)}`,
		`cp ${shellQuote(`${windowsRoot}/host-token`)} ${shellQuote(`${root}/host-token`)}`,
		`cp ${shellQuote(`${windowsRoot}/packagedAgentHost.cjs`)} ${shellQuote(`${root}/packagedAgentHost.cjs`)}`,
		`chmod 600 ${shellQuote(`${root}/host-token`)}`,
		`mkdir -p ${shellQuote(`${root}/home/.config`)} ${shellQuote(`${root}/home/.cache`)}`,
	].join(' && '));
	const hostAddress = await run('if [ "$(wslinfo --networking-mode 2>/dev/null)" = mirrored ]; then printf 127.0.0.1; else ip route show default | awk \'{ print $3; exit }\'; fi');
	if (!/^[0-9.]+$/.test(hostAddress)) {
		throw new Error(`Cannot determine the Windows host address from WSL: ${hostAddress}`);
	}
	const containerConfig: { runArgs: string[] } = JSON.parse(fs.readFileSync(path.join(options.workspacePath, '.devcontainer', 'devcontainer.json'), 'utf8'));
	containerConfig.runArgs = containerConfig.runArgs.map(arg => arg === '--add-host=vscode-smoke.test:host-gateway' ? `--add-host=vscode-smoke.test:${hostAddress}` : arg);
	fs.writeFileSync(path.join(resources.root, 'devcontainer.json'), JSON.stringify(containerConfig, null, 2));
	await run(`cp ${shellQuote(`${windowsRoot}/devcontainer.json`)} ${shellQuote(`${workspacePath}/.devcontainer/devcontainer.json`)}`);
	const mockServerUrl = new URL(options.mockServerUrl);
	mockServerUrl.hostname = hostAddress;
	const environment: Record<string, string> = {
		HOME: `${root}/home`, XDG_STATE_HOME: `${root}/state`, XDG_CONFIG_HOME: `${root}/home/.config`, XDG_CACHE_HOME: `${root}/home/.cache`,
		PATH: `${serverPath}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
		CODEX_HOME: `${root}/home/.codex`,
		VSCODE_CLI_DATA_DIR: `${root}/cli`, VSCODE_CLI_USE_FILE_KEYCHAIN: '1',
		VSCODE_SMOKE_TEST_WSL_MOCK_UPSTREAM: mockServerUrl.href,
		VSCODE_SMOKE_TEST_PROXY_HEADER: process.env.VSCODE_SMOKE_TEST_PROXY_HEADER ?? 'dev-container',
		GITHUB_COPILOT_API_TOKEN: fakeModelToken, GITHUB_PAT: 'smoketest-fake-pat',
		IS_SCENARIO_AUTOMATION: '1', VSCODE_AGENT_HOST_CLAUDE_AGENT_ENABLED: 'false', VSCODE_AGENT_HOST_CODEX_AGENT_ENABLED: 'false',
		VSCODE_AGENT_HOST_TELEMETRY_LEVEL: 'off',
	};
	const command = [
		`echo $$ > ${shellQuote(`${root}/host.pid`)}`,
		`exec env -i ${Object.entries(environment).map(([key, value]) => `${key}=${shellQuote(value)}`).join(' ')} ${shellQuote(`${serverPath}/node`)} ${shellQuote(`${root}/packagedAgentHost.cjs`)} ${shellQuote(`${serverPath}/out/bootstrap-fork.js`)} ${shellQuote(`${root}/host-token`)} ${shellQuote(`${root}/user-data`)} --ignore-stdin`,
	].join(' && ');
	resources.log(`Using ${distro} source workspace ${workspacePath}`);
	return {
		name: distro,
		workspacePath,
		settings: { 'chat.wslRemoteAgentHostCommand': command },
		verifyMockServerRouting: async () => {
			const logs = await run(`find ${shellQuote(`${root}/user-data/logs`)} -name agenthost.log -type f -exec cat {} +`);
			if (!logs.includes('Using CAPI URL override http://127.0.0.1:') || logs.includes('Ignoring non-loopback CAPI URL override')) {
				throw new Error('The WSL source Agent Host did not accept the loopback mock CAPI endpoint.');
			}
		},
		dumpConnectionDiagnostics: async uiState => {
			const report = (message: string) => {
				const redacted = resources.redact(`[WSL connection diagnostics] ${message}`);
				resources.log(redacted);
				console.error(redacted);
			};
			report(`UI state: ${uiState}`);
			const windowDirectories = (await fs.promises.readdir(options.logsPath, { withFileTypes: true }))
				.filter(entry => entry.isDirectory() && /^window\d+$/.test(entry.name));
			const files = [
				path.join(options.logsPath, 'sharedprocess.log'),
				...windowDirectories.map(entry => path.join(options.logsPath, entry.name, 'renderer.log')),
			];
			for (const file of files) {
				try {
					const entries = (await readConnectionLogTail(file)).split(/(?=^\d{4}-\d{2}-\d{2} )/m)
						.filter(entry => /\[WSL|\[RemoteAgentHost|WSLRelayTransport/.test(entry)).slice(-20);
					report(`${path.relative(options.logsPath, file)}:\n${entries.length ? entries.map(entry => resources.redact(entry).slice(0, 2000)).join('\n') : '(no WSL or remote-host entries)'}`);
				} catch (error) {
					report(`Cannot read ${path.relative(options.logsPath, file)}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		},
		dispose: () => resources.dispose(),
	};
}

export async function createRemoteDevContainerFixture(options: IRemoteDevContainerFixtureOptions, logger: Logger): Promise<IRemoteDevContainerFixture> {
	fs.mkdirSync(options.testDataPath, { recursive: true });
	fs.mkdirSync(options.logsPath, { recursive: true });
	const root = fs.mkdtempSync(path.join(options.testDataPath, `${options.transport}-fixture-`));
	fs.chmodSync(root, 0o700);
	const resources = new FixtureResources(root, logger);
	try {
		const extraEnv = createAppEnvironment(options, resources);
		let fixture: IRemoteDevContainerFixture;
		if (options.transport === 'wsl') {
			fixture = await createWslFixture(options, resources);
		} else {
			const runtime = createHostRuntime(options, resources);
			fixture = await createSshFixture(options, resources, runtime);
		}
		return {
			...fixture,
			settings: { 'chat.remoteAgentHostsAutoConnect': false, ...fixture.settings },
			extraEnv: { ...extraEnv, ...fixture.extraEnv },
		};
	} catch (error) {
		const message = resources.redact(error instanceof Error ? error.message : String(error));
		try {
			await resources.dispose();
		} catch (cleanupError) {
			throw new Error(`${message}\n${resources.redact(cleanupError instanceof Error ? cleanupError.message : String(cleanupError))}`);
		}
		throw new Error(message);
	}
}
