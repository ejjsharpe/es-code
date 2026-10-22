/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { CloudSandboxAutoConnectOnOpenSettingId, CloudSandboxEarlyPreparationSettingId, CloudSandboxEnabledSettingId, CloudSandboxSessionFeedEnabledSettingId, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxDraftPreparationService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { CloudSandboxAgentHostService } from './cloudSandboxAgentHostService.js';
import { CloudSandboxApiService } from './cloudSandboxApiService.js';
import { CloudSandboxDraftPreparationService } from './cloudSandboxDraftPreparationService.js';
import { CloudSandboxModelCatalogService, ICloudSandboxModelCatalogService } from './cloudSandboxModels.js';
import { CloudSandboxTelemetryService, ICloudSandboxTelemetryService } from './cloudSandboxTelemetry.js';
import { EditorCloudSandboxContribution } from './editorCloudSandboxContribution.js';
import { RemoteAgentHostContribution } from './remoteAgentHostChatContribution.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { IAgentHostAdvertisedAuthenticationResolver } from '../../../../../platform/agentHost/common/agentHostAdvertisedAuthentication.js';
import { RemoteAgentHostAuthenticationResolver } from './remoteAgentHostAuthenticationResolver.js';

const legacySharingStorageKey = 'agentHost.missionControl.sharing';

export class RemoteSharingMigrationContribution {
	static readonly ID = 'workbench.contrib.remoteSharingMigration';

	constructor(@IStorageService storageService: IStorageService) {
		storageService.remove(legacySharingStorageKey, StorageScope.APPLICATION);
	}
}

registerSingleton(ICloudSandboxTelemetryService, CloudSandboxTelemetryService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxApiService, CloudSandboxApiService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxDraftPreparationService, CloudSandboxDraftPreparationService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxModelCatalogService, CloudSandboxModelCatalogService, InstantiationType.Delayed);
registerSingleton(ICloudSandboxAgentHostService, CloudSandboxAgentHostService, InstantiationType.Delayed);
registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);
registerSingleton(IAgentHostAdvertisedAuthenticationResolver, RemoteAgentHostAuthenticationResolver, InstantiationType.Delayed);

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(EditorCloudSandboxContribution.ID, EditorCloudSandboxContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(RemoteSharingMigrationContribution.ID, RemoteSharingMigrationContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[RemoteAgentHostsEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[CloudSandboxEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.enabled', "Use GitHub Cloud for new Cloud sessions in the Agents Window instead of Copilot coding agent on GitHub Actions. Also enables discovering and opening GitHub Cloud sessions."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
		},
		[CloudSandboxAutoConnectOnOpenSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.autoConnectOnOpen', "Automatically connect to or wake a cloud sandbox environment in the background when opening or restoring its chat in the Agents Window. When disabled, connecting waits until you start composing or explicitly connect."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[CloudSandboxEarlyPreparationSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.earlyPreparation', "Prepare an eligible cloud environment while typing in a new Cloud chat in the editor or Agents Window. This can allocate cloud compute before you send a message."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
		},
		[CloudSandboxSessionFeedEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.cloudSandbox.sessionFeed.enabled', "Try Mission Control push notifications to discover and refresh cloud sandbox sessions when enabled for your GitHub account. If unavailable, use normal polling without repeated connection attempts until the window reloads, the account changes, or this setting is toggled. When disabled, do not request feed credentials or open a feed connection; use normal polling only."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
	},
});
