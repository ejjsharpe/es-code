/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
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

registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);
registerSingleton(IAgentHostAdvertisedAuthenticationResolver, RemoteAgentHostAuthenticationResolver, InstantiationType.Delayed);

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
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
	},
});
