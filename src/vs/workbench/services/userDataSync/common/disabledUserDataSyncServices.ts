/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataSyncAccount, IUserDataSyncAccountService } from '../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { IUserDataAutoSyncService, IUserDataSyncEnablementService, SyncOptions, SyncResource } from '../../../../platform/userDataSync/common/userDataSync.js';

/** Compatibility services for extension management, without a Settings Sync client. */
class DisabledUserDataSyncEnablementService implements IUserDataSyncEnablementService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeEnablement = Event.None;
	readonly onDidChangeResourceEnablement = Event.None;
	isEnabled(): boolean { return false; }
	canToggleEnablement(): boolean { return false; }
	setEnablement(_enabled: boolean): void { }
	isResourceEnabled(_resource: SyncResource): boolean { return false; }
	setResourceEnablement(_resource: SyncResource, _enabled: boolean): void { }
	getResourceSyncStateVersion(_resource: SyncResource): string | undefined { return undefined; }
	isResourceEnablementConfigured(_resource: SyncResource): boolean { return false; }
}

class DisabledUserDataSyncAccountService implements IUserDataSyncAccountService {
	declare readonly _serviceBrand: undefined;
	readonly onTokenFailed = Event.None;
	readonly account: IUserDataSyncAccount | undefined = undefined;
	readonly onDidChangeAccount = Event.None;
	async updateAccount(_account: IUserDataSyncAccount | undefined): Promise<void> { }
}

class DisabledUserDataAutoSyncService implements IUserDataAutoSyncService {
	declare readonly _serviceBrand: undefined;
	readonly onError = Event.None;
	async turnOn(): Promise<void> { }
	async turnOff(_everywhere: boolean): Promise<void> { }
	async triggerSync(_sources: string[], _options?: SyncOptions): Promise<void> { }
}

registerSingleton(IUserDataSyncEnablementService, DisabledUserDataSyncEnablementService, InstantiationType.Delayed);
registerSingleton(IUserDataSyncAccountService, DisabledUserDataSyncAccountService, InstantiationType.Delayed);
registerSingleton(IUserDataAutoSyncService, DisabledUserDataAutoSyncService, InstantiationType.Delayed);
