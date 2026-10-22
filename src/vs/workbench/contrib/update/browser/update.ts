/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ReleaseNotesManager } from './releaseNotesEditor.js';

let releaseNotesManager: ReleaseNotesManager | undefined;

export function showReleaseNotesInEditor(instantiationService: IInstantiationService, version: string, useCurrentFile: boolean) {
	if (!releaseNotesManager) {
		releaseNotesManager = instantiationService.createInstance(ReleaseNotesManager);
	}
	return releaseNotesManager.show(version, useCurrentFile);
}
