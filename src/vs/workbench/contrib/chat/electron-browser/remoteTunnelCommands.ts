/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Legacy command identifiers used by the Agent Host Remote Connections toggle.
 * The classic workbench contribution that registered these commands was removed.
 */
export const RemoteTunnelCommandIds = {
	turnOn: 'workbench.remoteTunnel.actions.turnOn',
	turnOff: 'workbench.remoteTunnel.actions.turnOff',
} as const;

export interface IRemoteTunnelStartOptions {
	readonly authenticationProviderId?: 'github';
	readonly showServiceOption?: boolean;
	readonly showSuccessNotification?: boolean;
}
