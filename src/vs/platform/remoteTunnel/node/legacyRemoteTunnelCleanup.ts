/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService, StorageScope } from '../../storage/common/storage.js';
import { CodeTunnelCli } from './codeTunnelCliProcess.js';

const legacySessionKey = 'remoteTunnelSession';
const legacyServiceKey = 'remoteTunnelIsService';

/** Withdraw a tunnel hosted by an older release before it can be restored again. */
export async function withdrawLegacyRemoteTunnel(
	storageService: IStorageService,
	environmentService: INativeEnvironmentService,
	productService: IProductService,
	logService: ILogService,
	uninstallService?: () => Promise<number>,
): Promise<void> {
	const wasService = storageService.getBoolean(legacyServiceKey, StorageScope.APPLICATION, false);
	storageService.remove(legacySessionKey, StorageScope.APPLICATION);
	if (!wasService) {
		storageService.remove(legacyServiceKey, StorageScope.APPLICATION);
		return;
	}
	try {
		const result = await (uninstallService ?? (() => {
			const cli = new CodeTunnelCli({
				appRoot: environmentService.appRoot,
				isBuilt: environmentService.isBuilt,
				tunnelApplicationName: productService.tunnelApplicationName,
				win32VersionedUpdate: !!productService.win32VersionedUpdate,
			});
			return cli.run('legacyTunnelUninstall', ['tunnel', 'service', 'uninstall'], message => logService.info(message)).result;
		}))();
		if (result !== 0) {
			throw new Error(`Tunnel service uninstall exited with code ${result}`);
		}
		storageService.remove(legacyServiceKey, StorageScope.APPLICATION);
	} catch (error) {
		// Keep the flag so the next launch retries the uninstall. The old session is gone.
		logService.error('Failed to withdraw previously enabled Remote Tunnel service', error);
	}
}
