/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../storage/common/storage.js';
import { withdrawLegacyRemoteTunnel } from '../../node/legacyRemoteTunnelCleanup.js';

suite('Legacy Remote Tunnel cleanup', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const environment = upcastPartial<INativeEnvironmentService>({});
	const product = upcastPartial<IProductService>({});
	const errors: unknown[] = [];
	const log = upcastPartial<ILogService>({ error: (_message: string, error: unknown) => errors.push(error) });

	setup(() => errors.length = 0);

	test('clears an old session without invoking the CLI when no service was enabled', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store('remoteTunnelSession', 'old-session', StorageScope.APPLICATION, StorageTarget.MACHINE);
		let called = false;
		await withdrawLegacyRemoteTunnel(storage, environment, product, log, async () => { called = true; return 0; });
		assert.strictEqual(storage.get('remoteTunnelSession', StorageScope.APPLICATION), undefined);
		assert.strictEqual(called, false);
	});

	test('uninstalls an enabled service and clears the old state', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store('remoteTunnelSession', 'old-session', StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store('remoteTunnelIsService', true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		let called = 0;
		await withdrawLegacyRemoteTunnel(storage, environment, product, log, async () => { called++; return 0; });
		assert.strictEqual(called, 1);
		assert.strictEqual(storage.get('remoteTunnelSession', StorageScope.APPLICATION), undefined);
		assert.strictEqual(storage.get('remoteTunnelIsService', StorageScope.APPLICATION), undefined);
	});

	test('keeps the service flag for a retry when uninstall fails', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store('remoteTunnelSession', 'old-session', StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store('remoteTunnelIsService', true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		await withdrawLegacyRemoteTunnel(storage, environment, product, log, async () => 7);
		assert.strictEqual(storage.get('remoteTunnelSession', StorageScope.APPLICATION), undefined);
		assert.strictEqual(storage.getBoolean('remoteTunnelIsService', StorageScope.APPLICATION), true);
		assert.strictEqual(errors.length, 1);
	});
});
