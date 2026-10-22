/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { type IRemoteConnectionDiagnosticEvent } from '../../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostPendingConnection, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/common/environmentService.js';
import { ConnectionDiagnosticsService } from '../../browser/connectionDiagnosticsService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { IConnectionDiagnosticsSnapshot } from '../../browser/connectionDiagnostics.js';

suite('ConnectionDiagnosticsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(web = true) {
		const changes = store.add(new Emitter<void>());
		const pendingChanges = store.add(new Emitter<void>());
		const remote = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = changes.event;
			override readonly onDidChangePendingConnections = pendingChanges.event;
			override pendingConnections: IRemoteAgentHostPendingConnection[] = [];
			override connections: IRemoteAgentHostConnectionInfo[] = [];
			override configuredEntries: IRemoteAgentHostEntry[] = [];
			override getConnection(): IAgentConnection | undefined { return undefined; }
			diagnostics: IRemoteConnectionDiagnosticEvent[] = [];
			override getConnectionDiagnostics() { return this.diagnostics; }
		}();
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [RemoteAgentHostAutoConnectSettingId]: true });
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IRemoteAgentHostService, remote);
		instantiation.stub(IConfigurationService, configuration);
		const filter = new class extends mock<IAgentHostFilterService>() {
			override readonly onDidChange = Event.None;
			override readonly onDidChangeDiscovering = Event.None;
			override hosts: IAgentHostFilterEntry[] = [];
			override readonly selectedHost = undefined;
			override readonly selectedHostId = undefined;
			override readonly isDiscovering = false;
			readonly reconnects: string[] = [];
			readonly disconnects: string[] = [];
			rediscoverCount = 0;
			discoverySucceeded = true;
			override async reconnect(id: string): Promise<void> { this.reconnects.push(id); }
			override async disconnect(id: string): Promise<void> { this.disconnects.push(id); }
			override async rediscover(): Promise<boolean> { this.rediscoverCount++; return this.discoverySucceeded; }
		}();
		instantiation.stub(IAgentHostFilterService, filter);
		instantiation.stub(IProductService, { version: '1.139.0', commit: 'test-commit' });
		const files = store.add(new FileService(new NullLogService()));
		store.add(files.registerProvider('test', store.add(new InMemoryFileSystemProvider())));
		const logFile = URI.parse('test:/window.log');
		instantiation.stub(IFileService, files);
		instantiation.stub(IWorkbenchEnvironmentService, { logFile });
		const service = store.add(instantiation.createInstance(class extends ConnectionDiagnosticsService {
			protected override get isWebPlatform(): boolean { return web; }
		}));
		return { service, remote, changes, pendingChanges, configuration, instantiation, filter, files, logFile };
	}

	function values(snapshot: IConnectionDiagnosticsSnapshot, title: string): Record<string, string> {
		const section = snapshot.sections.find(section => section.title.startsWith(title));
		assert.ok(section, `Missing ${title} section`);
		return Object.fromEntries(section.entries.map(entry => [entry.label, entry.value]));
	}

	test('exports authoritative pending automatic setup and updates live host status before a connection exists', async () => {
		const { service, remote, filter, pendingChanges, files, logFile } = createService();
		filter.hosts = [{ id: 'host', address: 'localhost:1234', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Disconnected }];
		remote.pendingConnections = [{ address: 'localhost:1234', startedAt: Date.now() - 5000, userInitiated: false }];
		remote.diagnostics.push({ address: 'localhost:1234', operationId: 'setup', phase: 'relay.connect', outcome: 'started', timestamp: remote.pendingConnections[0].startedAt });
		await files.writeFile(logFile, VSBuffer.fromString('2026-09-16 12:00:00.000 [info] [RemoteAgentHost] Connecting to mock host'));
		let notifications = 0;
		store.add(service.onDidChangeHostManagement(() => notifications++));
		pendingChanges.fire();
		const snapshot = await service.getSnapshot();
		const details = values(snapshot, 'Mock host');
		const pendingStatus = service.getHostManagementState().hosts[0].status;
		remote.pendingConnections = [];
		pendingChanges.fire();
		const completedSnapshot = await service.getSnapshot();
		assert.deepStrictEqual({
			pendingStatus,
			statusAfterCompletion: service.getHostManagementState().hosts[0].status,
			status: details['Connection status'],
			attempt: details['Connection attempt'],
			trigger: details['Attempt trigger'],
			entry: details['Connection entry present'],
			elapsed: Number(details['Attempt elapsed at capture (ms)']) >= 5000,
			exported: snapshot.text.includes('Connection attempt: Pending'),
			stage: details['Last observed connection stage'],
			logs: snapshot.text.includes('[RemoteAgentHost] Connecting to mock host'),
			completedStatus: values(completedSnapshot, 'Mock host')['Connection status'],
			historicalStartRetained: completedSnapshot.text.includes('relay.connect: started'),
			notified: notifications,
		}, {
			pendingStatus: 'connecting', statusAfterCompletion: 'disconnected', status: 'connecting',
			attempt: 'Pending', trigger: 'automatic', entry: 'No', elapsed: true, exported: true,
			stage: 'relay.connect: started', logs: true, completedStatus: 'No connection entry', historicalStartRetained: true, notified: 2,
		});
	});

	test('native host status does not change for pending setup metadata', async () => {
		const { service, remote, filter } = createService(false);
		filter.hosts = [{ id: 'host', address: 'localhost:1234', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Disconnected }];
		remote.pendingConnections = [{ address: 'localhost:1234', startedAt: Date.now(), userInitiated: false }];
		const details = values(await service.getSnapshot(), 'Mock host');
		assert.deepStrictEqual({
			live: service.getHostManagementState().hosts[0].status,
			status: details['Connection status'],
			attempt: details['Connection attempt'],
		}, { live: 'disconnected', status: 'No connection entry', attempt: undefined });
	});

	test('pending metadata does not replace established or retrying connection state', async () => {
		const { service, remote, filter } = createService();
		filter.hosts = [{ id: 'host', address: 'localhost:1234', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connecting }];
		remote.pendingConnections = [{ address: 'localhost:1234', startedAt: Date.now(), userInitiated: false }];
		const states = [RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.reconnecting, RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'])];
		const actual = [];
		for (const status of states) {
			remote.connections = [{ address: 'localhost:1234', name: 'Mock host', status }];
			actual.push({
				live: service.getHostManagementState().hosts[0].status,
				captured: values(await service.getSnapshot(), 'Mock host')['Connection status'],
			});
		}
		assert.deepStrictEqual(actual, [
			{ live: 'connected', captured: 'connected' },
			{ live: 'reconnecting', captured: 'reconnecting' },
			{ live: 'incompatible', captured: 'incompatible' },
		]);
	});

	test('collapsed host summary distinguishes connectivity from selectability', async () => {
		const { service, remote, filter } = createService();
		remote.connections = [{ address: 'localhost:1234', name: 'Mock host', status: RemoteAgentHostConnectionStatus.connected }];
		filter.hosts = [{ id: 'host', address: 'localhost:1234', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connected }];
		const connected = (await service.getSnapshot()).sections;
		remote.connections = [{ ...remote.connections[0], status: RemoteAgentHostConnectionStatus.disconnected }];
		const disconnected = (await service.getSnapshot()).sections;
		assert.deepStrictEqual({
			connected: connected.find(section => section.title.startsWith('Mock host'))?.title,
			disconnected: disconnected.find(section => section.title.startsWith('Mock host'))?.title,
			allCollapsed: connected.every(section => section.collapsed) && disconnected.every(section => section.collapsed),
		}, {
			connected: 'Mock host - connected, selectable',
			disconnected: 'Mock host - disconnected, selectable',
			allCollapsed: true,
		});
	});

	test('records connection transitions, retry deadlines and removals without duplicate events', async () => {
		const { service, remote, changes } = createService();
		remote.connections = [{ address: 'localhost:1234', name: 'Mock host', status: RemoteAgentHostConnectionStatus.connecting }];
		changes.fire();
		changes.fire();
		remote.connections = [{ ...remote.connections[0], status: RemoteAgentHostConnectionStatus.reconnectingUntil(1000) }];
		changes.fire();
		const retry = values(await service.getSnapshot(), 'Mock host')['Next reconnect attempt'];
		remote.connections = [];
		changes.fire();

		assert.deepStrictEqual({
			retry,
			activity: (await service.getSnapshot()).sections.find(section => section.title === 'Recent activity logs')?.entries.map(entry => entry.value),
		}, {
			retry: '1970-01-01T00:00:01.000Z',
			activity: [
				'localhost:1234: connecting.',
				'localhost:1234: reconnecting; next attempt at 1970-01-01T00:00:01.000Z.',
				'localhost:1234: connection entry removed.',
			],
		});
	});

	test('excludes connection tokens, URL credentials, query strings and fragments', async () => {
		const { service, remote, changes } = createService();
		const address = 'wss://alice:password@example.test:443/?token=query-secret#fragment-secret';
		remote.configuredEntries = [{ name: address, connectionToken: 'connection-secret', connection: { type: RemoteAgentHostEntryType.WebSocket, address } }];
		remote.connections = [{ address, name: address, status: RemoteAgentHostConnectionStatus.connected }];
		changes.fire();
		service.recordHostAction(address, 'connect', true);
		const snapshot = await service.getSnapshot();

		assert.deepStrictEqual({
			address: values(snapshot, 'wss://example.test:443/').Address,
			exposesSecret: /alice|password|query-secret|fragment-secret|connection-secret/.test(snapshot.text),
		}, { address: 'wss://example.test:443/', exposesSecret: false });
	});

	test('bounded activity records explicit disconnect and copies the same displayed evidence', async () => {
		const { service } = createService();
		for (let i = 0; i < 105; i++) {
			service.recordHostAction(`tunnel:${i}`, 'disconnect', true);
		}
		const snapshot = await service.getSnapshot();
		const activity = snapshot.sections.find(section => section.title === 'Recent activity logs')!;

		assert.deepStrictEqual({
			count: activity.entries.length,
			newest: activity.entries.at(-1)?.value,
			oldest: activity.entries[0].value,
			textMatches: snapshot.sections.every(section => section.entries.every(entry => snapshot.text.includes(`${entry.label}: ${entry.value}`))),
		}, {
			count: 100,
			newest: 'tunnel:104: disconnect requested by the user; automatic reconnect suppressed.',
			oldest: 'tunnel:5: disconnect requested by the user; automatic reconnect suppressed.',
			textMatches: true,
		});

	});

	test('shows setup evidence before a connection entry exists', async () => {
		const { service, remote } = createService();
		remote.configuredEntries = [{ name: 'Mock host', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'localhost:1234' } }];
		remote.diagnostics.push({ address: 'localhost:1234', operationId: 'setup', attemptId: 'attempt', phase: 'relay.connect', outcome: 'started', timestamp: 1000 });
		const pending = values(await service.getSnapshot(), 'Mock host');
		remote.diagnostics.push({ address: 'localhost:1234', operationId: 'setup', attemptId: 'attempt', phase: 'relay.connect', outcome: 'failed', timestamp: 2000, error: { name: 'Error', message: 'Network Error', requestId: 'request-123' } });
		const failed = values(await service.getSnapshot(), 'Mock host');
		assert.deepStrictEqual({
			status: pending['Connection status'],
			start: pending['Last observed connection stage'],
			finish: failed['Last observed connection stage'],
			time: failed['Stage observed at'],
			error: failed['Stage error'],
			connections: remote.connections,
		}, {
			status: 'No connection entry',
			start: 'relay.connect: started',
			finish: 'relay.connect: failed',
			time: '1970-01-01T00:00:02.000Z',
			error: 'Error: Network Error; requestId=request-123',
			connections: [],
		});
	});

	test('snapshot captures Window logs and keeps that excerpt stable until refreshed', async () => {
		const { service, files, logFile } = createService();
		const prefix = '2026-09-16 12:00:00.000 [info] ';
		await files.writeFile(logFile, VSBuffer.fromString(`${prefix}[RemoteAgentHost] Connected to test-host\n[Other] private payload`));
		const snapshot = await service.getSnapshot();
		const section = snapshot.sections.at(-2)!;
		await files.writeFile(logFile, VSBuffer.fromString(`${prefix}[RemoteAgentHost] Reconnecting to test-host`));
		const refreshed = await service.getSnapshot();
		assert.deepStrictEqual({
			title: section.title,
			collapsed: section.collapsed,
			messages: values(snapshot, section.title).Messages,
			copied: snapshot.text.includes(`Messages: ${prefix}[RemoteAgentHost] Connected to test-host`),
			excludesPayload: !snapshot.text.includes('private payload'),
			refreshed: values(refreshed, section.title).Messages,
		}, {
			title: 'Connection-related Window log excerpt',
			collapsed: true,
			messages: `${prefix}[RemoteAgentHost] Connected to test-host`,
			copied: true,
			excludesPayload: true,
			refreshed: `${prefix}[RemoteAgentHost] Reconnecting to test-host`,
		});
	});

	test('missing Window logs are reported in the snapshot and exported text', async () => {
		const { service } = createService();
		const snapshot = await service.getSnapshot();
		const error = values(snapshot, 'Connection-related Window log excerpt')['Log collection failed'];
		assert.ok(error && snapshot.text.includes(`Log collection failed: ${error}`));
	});
});
