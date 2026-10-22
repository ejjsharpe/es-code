/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../base/common/event.js';
import { IObservable, observableFromEvent } from '../../base/common/observable.js';
import { isWeb } from '../../base/common/platform.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../platform/agentHost/common/agentService.js';
import type { IConfigurationService } from '../../platform/configuration/common/configuration.js';

/** Whether signed-out session types may be used in a desktop Agents window. */
export function isAllowSignedOutWhenUsableEnabled(configurationService: IConfigurationService): boolean {
	return !isWeb && configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
}

/** Whether the GitHub workspace group should offer sign-in. */
export function shouldShowGitHubWorkspaceGroupSignIn(signedIn: boolean, allowSignedOutWhenUsable: boolean): boolean {
	return !signedIn && allowSignedOutWhenUsable;
}

/** Observe the setting for session types that can run without GitHub sign-in. */
export function observeAllowSignedOutWhenUsable(configurationService: IConfigurationService): IObservable<boolean> {
	return observableFromEvent(
		Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId)),
		() => isAllowSignedOutWhenUsableEnabled(configurationService));
}
