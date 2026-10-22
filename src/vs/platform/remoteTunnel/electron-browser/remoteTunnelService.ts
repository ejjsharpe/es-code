/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { Registry } from '../../registry/common/platform.js';
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, IRemoteTunnelService } from '../common/remoteTunnel.js';

registerSharedProcessRemoteService(IRemoteTunnelService, 'remoteTunnel');

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	type: 'object',
	properties: {
		[CONFIGURATION_KEY_HOST_NAME]: {
			description: localize('remoteTunnelAccess.machineName', "The name under which the remote tunnel access is registered. If not set, the host name is used."),
			type: 'string',
			scope: ConfigurationScope.APPLICATION,
			ignoreSync: true,
			pattern: '^(\\w[\\w-]*)?$',
			patternErrorMessage: localize('remoteTunnelAccess.machineNameRegex', "The name must only consist of letters, numbers, underscore and dash. It must not start with a dash."),
			maxLength: 20,
			default: ''
		},
		[CONFIGURATION_KEY_PREVENT_SLEEP]: {
			description: localize('remoteTunnelAccess.preventSleep', "Prevent this computer from sleeping when remote tunnel access is turned on."),
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			default: false,
		}
	}
});
