/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { RemoteSharingMigrationContribution } from '../../../browser/remoteAgentHost/remoteAgentHost.contribution.js';

suite('Remote sharing migration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('clears an enabled GitHub environment sharing choice and preserves unrelated storage', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('agentHost.missionControl.sharing', true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store('other.setting', 'retained', StorageScope.APPLICATION, StorageTarget.MACHINE);

		new RemoteSharingMigrationContribution(storage);

		assert.deepStrictEqual({
			sharing: storage.get('agentHost.missionControl.sharing', StorageScope.APPLICATION),
			other: storage.get('other.setting', StorageScope.APPLICATION),
		}, { sharing: undefined, other: 'retained' });
	});
});
