/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IManagedSettingsCompatibilityError } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

export const ManagedSettingsUpdateRequiredContext = new RawContextKey<boolean>('managedSettingsUpdateRequired', false);
export const MANAGED_SETTINGS_UPDATE_VIEW_ID = 'workbench.panel.chat.updateRequired';

export interface IManagedSettingsUpdateInfo {
	readonly title: string;
	readonly message: string;
	readonly detail: string | undefined;
	readonly action: { readonly label: string; readonly href: string } | undefined;
	readonly updateStatus: string | undefined;
}

export const IManagedSettingsUpdateService = createDecorator<IManagedSettingsUpdateService>('managedSettingsUpdateService');

/** Presentation of the existing client compatibility block; does not evaluate or enforce policy. */
export interface IManagedSettingsUpdateService {
	readonly _serviceBrand: undefined;
	readonly updateInfo: IObservable<IManagedSettingsUpdateInfo | undefined>;
}

function getManagedSettingsUpdateMessage(error: IManagedSettingsCompatibilityError, product: IProductService): Pick<IManagedSettingsUpdateInfo, 'title' | 'message' | 'detail'> {
	// The managed-settings request identifies this client as vscode; runtime targets are not in the response contract.
	const component = product.nameShort;
	const currentVersion = error.clientVersion || product.version;
	const requiredVersion = error.minimumClientVersion;
	return {
		title: localize('managedSettingsUpdate.title', "Update required by your organization"),
		message: requiredVersion
			? localize('managedSettingsUpdate.minimumVersion', "Your organization requires {0} {1} or later to use AI features.", component, requiredVersion)
			: localize('managedSettingsUpdate.message', "Your organization requires an update to {0} to use AI features.", component),
		detail: currentVersion ? localize('managedSettingsUpdate.installed', "Installed: {0}", currentVersion) : undefined,
	};
}

export function getManagedSettingsUpdateInfo(error: IManagedSettingsCompatibilityError, product: IProductService): IManagedSettingsUpdateInfo {
	return {
		...getManagedSettingsUpdateMessage(error, product),
		action: undefined,
		updateStatus: localize('managedSettingsUpdate.manual', "Install an approved newer version manually or contact your administrator."),
	};
}
