/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionsSetUpService } from '../../browser/sessionsSetUpService.js';

suite('Sessions - Setup Service', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lets workspace handoff proceed without a product welcome dialog', async () => {
		const service = new SessionsSetUpService();
		await service.whenWelcomeDone();
		assert.strictEqual(service.initialSignInDialogShown, false);
	});
});
