/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { getManagedSettingsUpdateInfo, IManagedSettingsUpdateInfo, IManagedSettingsUpdateService, MANAGED_SETTINGS_UPDATE_VIEW_ID } from '../../../../../services/policies/common/managedSettingsUpdate.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatUpdateRequiredView } from '../../../browser/viewsWelcome/chatUpdateRequiredView.js';

class TestUpdateRequiredView extends ChatUpdateRequiredView {
	renderForTest(container: HTMLElement): void { this.renderBody(container); }
	layoutForTest(height: number, width: number): void { this.layoutBody(height, width); }
}

suite('Chat update required view', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const product = new class extends mock<IProductService>() {
		override readonly nameShort = 'Code';
		override readonly version = '1.140.0';
	}();
	const info = getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: '1.141.0' }, product);

	function setup(initial: IManagedSettingsUpdateInfo | undefined = info, width = 300) {
		const services = workbenchInstantiationService(undefined, store);
		services.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override readonly onDidChangeLocation = Event.None;
			override getViewLocationById() { return ViewContainerLocation.AuxiliaryBar; }
		}());
		const updateInfo = observableValue<IManagedSettingsUpdateInfo | undefined>('updateInfo', initial);
		services.stub(IManagedSettingsUpdateService, { updateInfo });
		const opened: string[] = [];
		services.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(target: string) { opened.push(target); return true; }
		}());
		const container = append(mainWindow.document.body, $('.pane-body'));
		container.style.width = `${width}px`;
		container.style.height = '120px';
		store.add(toDisposable(() => container.remove()));
		const view = store.add(services.createInstance(TestUpdateRequiredView, { id: MANAGED_SETTINGS_UPDATE_VIEW_ID, title: 'Chat' }));
		view.renderForTest(container);
		view.layoutForTest(120, width);
		return { view, container, updateInfo, opened };
	}

	test('renders read-only manual update guidance without an updater action', () => {
		const { container, opened } = setup();
		assert.deepStrictEqual({
			title: container.querySelector('.chat-welcome-view-title')?.textContent,
			detail: container.querySelector('.chat-welcome-view-disclaimer')?.textContent,
			buttons: container.querySelectorAll('.monaco-button').length,
			inputs: container.querySelectorAll('textarea, input, .interactive-session').length,
			opened,
		}, { title: info.title, detail: info.detail, buttons: 0, inputs: 0, opened: [] });
		assert.ok(container.textContent?.includes('Install an approved newer version manually'));
	});

	test('updates the required version and clears the explanation when the block ends', () => {
		const { container, updateInfo } = setup(undefined);
		updateInfo.set(info, undefined);
		updateInfo.set({ ...info, message: 'Your organization requires Code 1.142.0 or later to use AI features.' }, undefined);
		assert.ok(container.textContent?.includes('1.142.0'));
		updateInfo.set(undefined, undefined);
		assert.strictEqual(container.querySelector('.chat-update-required-content')?.textContent, '');
	});

	test('renders untrusted response metadata as text', () => {
		const maliciousVersion = '[Run](command:unexpected.command) <a href="command:unexpected.command">Run</a>';
		const { container } = setup(getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: maliciousVersion }, product));
		assert.ok(container.textContent?.includes(maliciousVersion));
		assert.strictEqual(container.querySelectorAll('.chat-welcome-view-message a').length, 0);
		assert.strictEqual(container.querySelectorAll('.monaco-button').length, 0);
	});
});
