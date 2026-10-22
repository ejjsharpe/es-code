/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { basename, joinPath } from '../../../base/common/resources.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, WillCreateProfileEvent, WillRemoveProfileEvent, IUserDataProfile, IUserDataProfileOptions, AGENTS_WINDOW_PROFILE_ID, StoredProfileAssociations, StoredUserDataProfile } from '../common/userDataProfile.js';
import { UserDataProfilesService } from '../node/userDataProfile.js';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IStateService } from '../../state/node/state.js';
import { URI } from '../../../base/common/uri.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { env } from '../../../base/common/process.js';
import { join, resolve } from '../../../base/common/path.js';

export const IUserDataProfilesMainService = refineServiceDecorator<IUserDataProfilesService, IUserDataProfilesMainService>(IUserDataProfilesService);
export interface IUserDataProfilesMainService extends IUserDataProfilesService {
	createAgentsWindowProfile(): Promise<IUserDataProfile>;
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
		return super.getStoredProfiles().filter(profile => basename(profile.location) === AGENTS_WINDOW_PROFILE_ID);
	}

	protected override saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void {
		const legacyProfiles = super.getStoredProfiles().filter(profile => basename(profile.location) !== AGENTS_WINDOW_PROFILE_ID);
		super.saveStoredProfiles([...legacyProfiles, ...storedProfiles]);
	}

	protected override saveStoredProfileAssociations(associations: StoredProfileAssociations): void {
		const legacyProfileIds = new Set(super.getStoredProfiles().filter(profile => basename(profile.location) !== AGENTS_WINDOW_PROFILE_ID).map(profile => basename(profile.location)));
		const existing = super.getStoredProfileAssociations();
		const retainLegacy = (values: Record<string, string> | undefined) => Object.fromEntries(Object.entries(values ?? {}).filter(([, id]) => legacyProfileIds.has(id)));
		super.saveStoredProfileAssociations({
			workspaces: { ...retainLegacy(existing.workspaces), ...associations.workspaces },
			emptyWindows: { ...retainLegacy(existing.emptyWindows), ...associations.emptyWindows },
		});
	}

	override async createProfile(id: string, name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		if (id !== AGENTS_WINDOW_PROFILE_ID || name !== 'Agents' || options || workspaceIdentifier) {
			throw new Error('Additional user profiles are not supported');
		}
		return super.createProfile(id, name);
	}

	override async removeProfile(profile: IUserDataProfile): Promise<void> {
		if (profile.id === AGENTS_WINDOW_PROFILE_ID) {
			throw new Error('The Agents profile is internal');
		}
		return super.removeProfile(profile);
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

	async createAgentsWindowProfile(): Promise<IUserDataProfile> {
		const existing = this.profiles.find(p => p.id === AGENTS_WINDOW_PROFILE_ID);
		if (existing) {
			return existing;
		}

		return this.createProfile(AGENTS_WINDOW_PROFILE_ID, 'Agents');
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
