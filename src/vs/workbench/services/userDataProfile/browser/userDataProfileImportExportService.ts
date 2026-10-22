/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataProfile, ProfileResourceTypeFlags } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IProfileImportOptions, IUserDataProfileContentHandler, IUserDataProfileCreateOptions, IUserDataProfileImportExportService, IUserDataProfileTemplate } from '../common/userDataProfile.js';

/** Keeps the proposed extension registration API available without providing profile import or export. */
export class UserDataProfileImportExportService implements IUserDataProfileImportExportService {
	readonly _serviceBrand: undefined;

	private readonly profileContentHandlers = new Map<string, IUserDataProfileContentHandler>();

	registerProfileContentHandler(id: string, handler: IUserDataProfileContentHandler): IDisposable {
		if (this.profileContentHandlers.has(id)) {
			throw new Error(`Profile content handler with id '${id}' already registered.`);
		}
		this.profileContentHandlers.set(id, handler);
		return toDisposable(() => this.unregisterProfileContentHandler(id));
	}

	unregisterProfileContentHandler(id: string): void {
		this.profileContentHandlers.delete(id);
	}

	async resolveProfileTemplate(_uri: URI, _options?: IProfileImportOptions): Promise<IUserDataProfileTemplate | null> {
		return null;
	}

	async exportProfile(_profile: IUserDataProfile, _exportFlags?: ProfileResourceTypeFlags): Promise<void> {
		throw new Error('Profile export is not supported');
	}

	async createFromProfile(_from: IUserDataProfile, _options: IUserDataProfileCreateOptions, _token: CancellationToken): Promise<IUserDataProfile | undefined> {
		throw new Error('Profile creation is not supported');
	}

	async createProfileFromTemplate(_template: IUserDataProfileTemplate, _options: IUserDataProfileCreateOptions, _token: CancellationToken): Promise<IUserDataProfile | undefined> {
		throw new Error('Profile import is not supported');
	}

	async createTroubleshootProfile(): Promise<void> {
		throw new Error('Profile creation is not supported');
	}
}

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
