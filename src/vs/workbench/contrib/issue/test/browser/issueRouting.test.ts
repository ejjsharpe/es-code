/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastDeepPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IExtensionManagementService, ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { BrowserIssueService, getIssueReportUrl } from '../../browser/issueService.js';
import { BaseIssueContribution } from '../../common/issue.contribution.js';
import { IssueReportOptions, IWorkbenchIssueService } from '../../common/issue.js';

const productUrl = 'https://github.com/ejjsharpe/es-code/issues/new';

suite('External Issue Routing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes declared bugs URLs and strips URL data', () => {
		assert.deepStrictEqual([
			getIssueReportUrl(productUrl),
			getIssueReportUrl(productUrl, { bugs: { url: 'https://github.com/example/extension/issues?token=secret#details' } }),
			getIssueReportUrl(productUrl, { bugs: { url: 'https://bugs.example.test/new?token=secret' } }),
			getIssueReportUrl(productUrl, { repository: { url: 'https://github.com/example/extension.git' } }),
			getIssueReportUrl(productUrl, { bugs: { url: 'javascript:alert(1)' } }),
		], [
			productUrl,
			'https://github.com/example/extension/issues/new',
			'https://bugs.example.test/new',
			'https://github.com/example/extension/issues/new',
			productUrl,
		]);
	});

	test('opens extension destination externally and keeps issue text off the URL', async () => {
		const clipboard = new TestClipboardService();
		const opened: string[] = [];
		const extension = new class extends mock<IExtensionDescription>() {
			override readonly identifier = new ExtensionIdentifier('example.extension');
			override readonly bugs = { url: 'https://github.com/example/extension/issues/new?token=secret' };
		};
		const service = new BrowserIssueService(
			new class extends mock<IExtensionService>() {
				override readonly extensions = [extension];
				override async whenInstalledExtensionsRegistered(): Promise<boolean> { return true; }
			},
			new class extends mock<IExtensionManagementService>() { override async getInstalled(): Promise<ILocalExtension[]> { return []; } },
			new class extends mock<IProductService>() { override readonly reportIssueUrl = productUrl; },
			new class extends mock<IOpenerService>() {
				override async open(resource: URI | string, options?: { openExternal?: boolean }): Promise<boolean> {
					assert.strictEqual(options?.openExternal, true);
					opened.push(resource.toString());
					return true;
				}
			},
			clipboard,
			new TestNotificationService()
		);
		await service.openReporter({ extensionId: 'EXAMPLE.EXTENSION', issueTitle: 'Slow renderer', issueBody: 'private diagnostic text' });
		assert.deepStrictEqual({ opened, clipboard: await clipboard.readText() }, {
			opened: ['https://github.com/example/extension/issues/new'],
			clipboard: 'Extension: EXAMPLE.EXTENSION\n\nTitle: Slow renderer\n\nprivate diagnostic text'
		});
	});

	test('finds a disabled installed extension for extension bisect', async () => {
		const opened: string[] = [];
		const service = new BrowserIssueService(
			new class extends mock<IExtensionService>() {
				override readonly extensions = [];
				override async whenInstalledExtensionsRegistered(): Promise<boolean> { return true; }
			},
			new class extends mock<IExtensionManagementService>() {
				override async getInstalled(): Promise<ILocalExtension[]> {
					return [upcastDeepPartial<ILocalExtension>({ identifier: { id: 'example.disabled' }, manifest: { bugs: { url: 'https://github.com/example/disabled/issues' } } })];
				}
			},
			new class extends mock<IProductService>() { override readonly reportIssueUrl = productUrl; },
			new class extends mock<IOpenerService>() {
				override async open(resource: URI | string): Promise<boolean> { opened.push(resource.toString()); return true; }
			},
			new TestClipboardService(),
			new TestNotificationService()
		);
		await service.openReporter({ extensionId: 'example.disabled' });
		assert.deepStrictEqual(opened, ['https://github.com/example/disabled/issues/new']);
	});

	test('both public commands keep string, array and title/body arguments', async () => {
		const product = new class extends mock<IProductService>() { override readonly reportIssueUrl = productUrl; };
		const received: IssueReportOptions[] = [];
		const instantiation = new TestInstantiationService();
		instantiation.stub(IWorkbenchIssueService, new class extends mock<IWorkbenchIssueService>() {
			override async openReporter(options: IssueReportOptions = {}): Promise<void> { received.push(options); }
		});
		const contribution = new BaseIssueContribution(product);
		try {
			await instantiation.invokeFunction(CommandsRegistry.getCommand('workbench.action.openIssueReporter')!.handler, ['example.extension']);
			await instantiation.invokeFunction(CommandsRegistry.getCommand('vscode.openIssueReporter')!.handler, { extensionId: 'example.extension', issueTitle: 'Title', issueBody: 'Body' });
			assert.deepStrictEqual(received, [
				{ extensionId: 'example.extension' },
				{ extensionId: 'example.extension', issueTitle: 'Title', issueBody: 'Body' }
			]);
		} finally {
			contribution.dispose();
		}
	});
});
