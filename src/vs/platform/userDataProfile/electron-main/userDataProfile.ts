/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { joinPath } from '../../../base/common/resources.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, WillCreateProfileEvent, WillRemoveProfileEvent, IUserDataProfile, IUserDataProfileOptions, StoredUserDataProfile } from '../common/userDataProfile.js';
import { UserDataProfilesService } from '../node/userDataProfile.js';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IStateService } from '../../state/node/state.js';
import { URI } from '../../../base/common/uri.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { env } from '../../../base/common/process.js';
import { join, resolve } from '../../../base/common/path.js';

export const IUserDataProfilesMainService = refineServiceDecorator<IUserDataProfilesService, IUserDataProfilesMainService>(IUserDataProfilesService);
export interface IUserDataProfilesMainService extends IUserDataProfilesService {
	getProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier): IUserDataProfile | undefined;
	unsetWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, transient?: boolean): void;
	getAssociatedEmptyWindows(): IEmptyWorkspaceIdentifier[];
	readonly onWillCreateProfile: Event<WillCreateProfileEvent>;
	readonly onWillRemoveProfile: Event<WillRemoveProfileEvent>;
}

export class UserDataProfilesMainService extends UserDataProfilesService implements IUserDataProfilesMainService {

	private readonly agentPluginsHome: URI;

	constructor(
		@IStateService stateService: IStateService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@IProductService productService: IProductService,
	) {
		super(stateService, uriIdentityService, environmentService, fileService, logService);
		this.agentPluginsHome = URI.file(getAgentPluginsPath(environmentService.args, joinPath(environmentService.userHome, productService.dataFolderName)));
	}

	protected override createDefaultProfile(): IUserDataProfile {
		return {
			...super.createDefaultProfile(),
			agentPluginsHome: this.agentPluginsHome
		};
	}

	protected override getStoredProfiles(): StoredUserDataProfile[] {
		return []; // Preserve old profiles on disk for manual recovery.
	}

	protected override saveStoredProfiles(_storedProfiles: StoredUserDataProfile[]): void {
		// The single-profile app does not rewrite stored legacy profiles.
	}

	override async createProfile(_id: string, _name: string, _options?: IUserDataProfileOptions, _workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		throw new Error('Additional user profiles are not supported');
	}

	override async setProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, profile: IUserDataProfile): Promise<void> {
		if (!profile.isDefault) {
			throw new Error('Only the default profile is supported for workspaces');
		}
		return super.setProfileForWorkspace(workspaceIdentifier, profile);
	}

	override async cleanUp(): Promise<void> {
		// Profiles created by an older version remain on disk for manual recovery.
	}

	getAssociatedEmptyWindows(): IEmptyWorkspaceIdentifier[] {
		const emptyWindows: IEmptyWorkspaceIdentifier[] = [];
		for (const id of this.profilesObject.emptyWindows.keys()) {
			emptyWindows.push({ id });
		}
		return emptyWindows;
	}
}

function getAgentPluginsPath(args: NativeParsedArgs, userHome: URI): string {
	const cliAgentPluginsDir = args['agent-plugins-dir'];
	if (cliAgentPluginsDir) {
		return resolve(cliAgentPluginsDir);
	}

	const vscodeAgentPlugins = env['VSCODE_AGENT_PLUGINS'];
	if (vscodeAgentPlugins) {
		return vscodeAgentPlugins;
	}

	const vscodePortable = env['VSCODE_PORTABLE'];
	if (vscodePortable) {
		return join(vscodePortable, 'agent-plugins');
	}

	return joinPath(userHome, 'agent-plugins').fsPath;
}
