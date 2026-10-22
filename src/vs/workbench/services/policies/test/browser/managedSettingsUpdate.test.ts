/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService, IManagedSettingsCompatibilityError } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IBannerItem, IBannerService } from '../../../banner/browser/bannerService.js';
import { ManagedSettingsUpdateContribution } from '../../browser/managedSettingsUpdate.contribution.js';
import { ManagedSettingsUpdateService } from '../../browser/managedSettingsUpdateService.js';
import { getManagedSettingsUpdateInfo, ManagedSettingsUpdateRequiredContext } from '../../common/managedSettingsUpdate.js';

suite('Managed settings update presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const product = new class extends mock<IProductService>() { override readonly nameShort = 'Code'; override readonly version = '1.140.0'; }();
	const error: IManagedSettingsCompatibilityError = { errorCode: 'client_update_required', minimumClientVersion: '1.141.0' };

	function createService(initialError: IManagedSettingsCompatibilityError | null = null) {
		const changed = store.add(new Emitter<IManagedSettingsCompatibilityError | null>());
		const account = new class extends mock<IDefaultAccountService>() {
			override managedSettingsCompatibilityError = initialError;
			override readonly onDidChangeManagedSettingsCompatibilityError = changed.event;
		}();
		const service = store.add(new ManagedSettingsUpdateService(account, product));
		return { service, setError: (value: IManagedSettingsCompatibilityError | null) => { account.managedSettingsCompatibilityError = value; changed.fire(value); } };
	}

	test('shows required and installed versions with manual guidance', () => {
		assert.deepStrictEqual(getManagedSettingsUpdateInfo(error, product), {
			title: 'Update required by your organization',
			message: 'Your organization requires Code 1.141.0 or later to use AI features.',
			detail: 'Installed: 1.140.0',
			action: undefined,
			updateStatus: 'Install an approved newer version manually or contact your administrator.',
		});
	});

	test('recomputes only when the compatibility error changes', () => {
		const { service, setError } = createService();
		const seen: (string | undefined)[] = [];
		store.add(autorun(reader => seen.push(service.updateInfo.read(reader)?.message)));
		setError(error);
		setError({ ...error });
		setError({ ...error, minimumClientVersion: '1.142.0' });
		setError(null);
		assert.deepStrictEqual(seen, [undefined,
			'Your organization requires Code 1.141.0 or later to use AI features.',
			'Your organization requires Code 1.142.0 or later to use AI features.', undefined]);
	});

	test('shows ordinary editor banner and compatibility context without updater actions', () => {
		const { service } = createService(error);
		const context = new MockContextKeyService();
		const shown: IBannerItem[] = [];
		const config = new TestConfigurationService();
		store.add(config.onDidChangeConfigurationEmitter);
		store.add(new ManagedSettingsUpdateContribution(service, config, context, new class extends mock<IBannerService>() {
			override show(item: IBannerItem) { shown.push(item); }
			override hide() { }
		}()));
		assert.strictEqual(ManagedSettingsUpdateRequiredContext.getValue(context), true);
		assert.strictEqual(shown.length, 1);
		assert.deepStrictEqual(shown[0].actions, []);
		assert.ok(String(shown[0].message).includes('Install an approved newer version manually'));
	});
});
