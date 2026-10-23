/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IOSProperties } from '../../../native/common/native.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { createNativeAboutDialogDetails } from '../../electron-browser/dialog.js';

suite('Dialog', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('About details show editor and platform versions without bundled AI versions', () => {
		const osProperties: IOSProperties = {
			type: 'Test OS',
			release: '1.0',
			arch: 'test-arch',
			platform: 'test',
			cpus: []
		};
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			copilotVersions: { runtime: '1.0.84', sdk: '0.1.23' }
		};
		const { details, detailsToCopy } = createNativeAboutDialogDetails(productService, osProperties);
		for (const value of [details, detailsToCopy]) {
			assert.ok(value.includes('Version: '));
			assert.ok(value.includes('Electron: '));
			assert.ok(value.includes('OS: Test OS test-arch 1.0'));
			assert.ok(!value.includes('copilot'));
		}
	});
});
