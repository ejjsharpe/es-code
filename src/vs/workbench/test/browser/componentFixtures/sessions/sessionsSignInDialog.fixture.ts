/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionsSigningInDialog } from '../../../../../sessions/browser/sessionsSignInDialog.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'sessions/signInDialog/' }, {
	SigningIn: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderSigningInDialog,
	}),
});

function renderSigningInDialog(context: ComponentFixtureContext): void {
	const instantiationService = createDialogServices(context);
	context.disposableStore.add(instantiationService.createInstance(SessionsSigningInDialog, () => { }));
}

function createDialogServices({ container, disposableStore, theme }: ComponentFixtureContext) {
	container.classList.add('agent-sessions-workbench');
	container.style.width = '720px';
	container.style.height = '520px';
	container.style.position = 'relative';
	container.style.overflow = 'hidden';
	container.style.transform = 'translate3d(0, 0, 0)';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-editor-foreground)';

	return createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.define(IMarkdownRendererService, MarkdownRendererService);
			registration.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				declare readonly _serviceBrand: undefined;
				override get mainContainer() { return container; }
				override get activeContainer() { return container; }
			}());
			registration.defineInstance(IHostService, new class extends mock<IHostService>() {
				declare readonly _serviceBrand: undefined;
				override async setWindowDimmed(): Promise<void> { }
			}());
		},
	});
}
