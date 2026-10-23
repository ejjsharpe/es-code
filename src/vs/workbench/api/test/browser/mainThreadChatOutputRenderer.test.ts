/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IChatOutputRendererService } from '../../../contrib/chat/browser/chatOutputItemRenderer.js';
import { MainThreadChatOutputRenderer } from '../../browser/mainThreadChatOutputRenderer.js';
import { MainThreadWebviews } from '../../browser/mainThreadWebviews.js';
import { ExtHostChatOutputRendererShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadChatOutputRenderer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers and disposes an extension renderer', () => {
		const calls: string[] = [];
		const rendererService = new class extends mock<IChatOutputRendererService>() {
			override registerRenderer(viewType: string): IDisposable {
				calls.push(`register:${viewType}`);
				return toDisposable(() => calls.push(`dispose:${viewType}`));
			}
		};
		const actor = disposables.add(new MainThreadChatOutputRenderer(
			SingleProxyRPCProtocol(new class extends mock<ExtHostChatOutputRendererShape>() { }),
			new class extends mock<MainThreadWebviews>() { },
			rendererService,
			new NullLogService(),
		));

		actor.$registerChatOutputRenderer('test.renderer', new ExtensionIdentifier('test.extension'), URI.file('/extension'));
		actor.$unregisterChatOutputRenderer('test.renderer');

		assert.deepStrictEqual(calls, ['register:test.renderer', 'dispose:test.renderer']);
	});
});
