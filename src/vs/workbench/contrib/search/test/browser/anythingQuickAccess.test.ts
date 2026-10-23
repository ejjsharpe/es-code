/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { OpenerService } from '../../../../../editor/browser/services/openerService.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { NullCommandService } from '../../../../../platform/commands/test/common/nullCommandService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ViewColumn } from '../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IQuickInputService, NO_KEY_MODS } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IQuickChatService } from '../../../chat/browser/chat.js';
import { AnythingQuickAccessProvider, IAnythingQuickPickItem } from '../../browser/anythingQuickAccess.js';
import { AnythingQuickAccessPreview } from '../../browser/anythingQuickAccessPreview.js';
import { SearchQuickAccessWidget } from '../../browser/searchQuickAccessWidget.js';
import { getSearchQuickAccessOptions } from '../../browser/searchQuickAccessOptions.js';
import { IQuickAccessOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IAnythingQuickAccessProviderRunOptions } from '../../common/search.js';

suite('Search Quick Access - modes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('content filters refresh the query and stay hidden in file-name mode', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick({ useSeparators: true }));
		picker.value = 'alpha';
		const options = getSearchQuickAccessOptions();
		options.regex = true;
		options.filtersExpanded = true;
		let refreshes = 0;
		const content = store.add(instantiationService.createInstance(SearchQuickAccessWidget, picker, 'contents', { searchOptions: options }, { refresh: () => refreshes++ }));
		assert.ok(picker.inputDetails instanceof HTMLElement);
		const include = picker.inputDetails.querySelector<HTMLInputElement>('input[aria-label="Files to Include"]')!;
		include.value = '*.ts';
		include.dispatchEvent(new Event('input', { bubbles: true }));
		const exclude = picker.inputDetails.querySelector<HTMLInputElement>('input[aria-label="Files to Exclude"]')!;
		exclude.value = '*.test.ts';
		exclude.dispatchEvent(new Event('input', { bubbles: true }));
		const contentButtons = picker.buttons.map(button => ({ label: button.tooltip, checked: button.toggle?.checked }));
		content.dispose();
		store.add(instantiationService.createInstance(SearchQuickAccessWidget, picker, 'files', { searchOptions: options }, { refresh: () => refreshes++ }));
		assert.ok(picker.header instanceof HTMLElement);
		assert.deepStrictEqual({ query: picker.value, refreshes, include: options.includePattern, exclude: options.excludePattern, contentButtons, fileButtons: picker.buttons.length, filtersVisible: !!picker.inputDetails }, {
			query: 'alpha', refreshes: 2, include: '*.ts', exclude: '*.test.ts',
			contentButtons: [{ label: 'Match Case', checked: false }, { label: 'Match Whole Word', checked: false }, { label: 'Use Regular Expression', checked: true }],
			fileButtons: 0, filtersVisible: false
		});
	});

	for (const mode of ['files', 'contents'] as const) {
		test(`Tab switches from ${mode} only inside the active picker`, () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick({ useSeparators: true }));
			picker.value = 'search query';
			const shown: { value: string | undefined; options: IQuickAccessOptions | undefined }[] = [];
			instantiationService.stub(IQuickInputService, {
				currentQuickInput: picker,
				quickAccess: {
					show: (value, options) => { shown.push({ value, options }); },
					pick: async () => undefined
				}
			});
			const widget = store.add(instantiationService.createInstance(SearchQuickAccessWidget, picker, mode, { from: 'searchModeSwitch' }, { refresh: () => { } }));
			assert.ok(picker.header instanceof HTMLElement);
			const fixture = document.createElement('div');
			const header = fixture.appendChild(document.createElement('div'));
			header.appendChild(picker.header);
			const input = fixture.appendChild(document.createElement('input'));
			document.body.appendChild(fixture);
			store.add(toDisposable(() => fixture.remove()));
			const dispatchTab = (target: HTMLElement, options: KeyboardEventInit = {}) => {
				const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...options });
				target.dispatchEvent(event);
				return event.defaultPrevented;
			};
			const prevented = [
				dispatchTab(input, { shiftKey: true }),
				dispatchTab(input, { ctrlKey: true }),
				dispatchTab(input, { altKey: true }),
				dispatchTab(input, { metaKey: true }),
				dispatchTab(document.body),
				dispatchTab(input, { repeat: true }),
				dispatchTab(input)
			];
			widget.dispose();
			prevented.push(dispatchTab(input));
			assert.deepStrictEqual({ prevented, shown }, {
				prevented: [false, false, false, false, false, true, true, false],
				shown: [{ value: 'search query', options: { providerPrefix: mode === 'files' ? '%' : '', allowPrefixSwitching: true, preserveValue: true, providerOptions: { from: 'searchModeSwitch', searchOptions: widget.options } } }]
			});
		});
	}

	for (const [mode, value, from, expectedQuery, expectedPrefix] of [
		['files', '%word', undefined, '%word', '%'],
		['contents', 'word', 'searchModeSwitch', 'word', ''],
		['contents', '%word', undefined, 'word', '']
	] as const) {
		test(`preserves the query when switching from ${mode}, ${value}, ${from}`, () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick({ useSeparators: true }));
			picker.value = value;
			const shown: { value: string | undefined; options: IQuickAccessOptions | undefined }[] = [];
			instantiationService.stub(IQuickInputService, {
				quickAccess: {
					show: (value, options) => { shown.push({ value, options }); },
					pick: async () => undefined
				}
			});
			const widget = store.add(instantiationService.createInstance(SearchQuickAccessWidget, picker, mode, { from }, { refresh: () => { } }));
			assert.ok(picker.header instanceof HTMLElement);
			picker.header.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')!.click();
			picker.header.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click();
			assert.deepStrictEqual(shown, [{
				value: expectedQuery,
				options: { providerPrefix: expectedPrefix, allowPrefixSwitching: true, preserveValue: true, providerOptions: { from: 'searchModeSwitch', searchOptions: widget.options } }
			}]);
		});
	}
});

suite('AnythingQuickAccess - preview', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('late preview loads cannot replace the selected file and release their references', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const editor = store.add(instantiationService.createInstance(TestCodeEditor, document.createElement('div'), {}, { contributions: [] }));
		instantiationService.stubInstance(CodeEditorWidget, editor);
		const pending = new Map<string, DeferredPromise<IReference<IResolvedTextEditorModel>>>();
		const released: string[] = [];
		const resources = [URI.file('/first.ts'), URI.file('/second.ts')];
		const references = resources.map(resource => {
			pending.set(resource.toString(), new DeferredPromise());
			const model = store.add(createTextModel('const value = 1;', 'typescript', undefined, resource));
			return {
				object: new class extends mock<IResolvedTextEditorModel>() {
					override readonly textEditorModel = model;
				},
				dispose: () => released.push(resource.path)
			};
		});
		instantiationService.stub(ITextModelService, { createModelReference: resource => pending.get(resource.toString())!.p });
		const preview = store.add(instantiationService.createInstance(AnythingQuickAccessPreview));
		const first = preview.setInput(resources[0]);
		const second = preview.setInput(resources[1]);
		await pending.get(resources[1].toString())!.complete(references[1]);
		await second;
		await pending.get(resources[0].toString())!.complete(references[0]);
		await first;
		const displayedResource = editor.getModel()?.uri.toString();
		preview.dispose();

		assert.deepStrictEqual({ displayedResource, released }, {
			displayedResource: resources[1].toString(),
			released: ['/first.ts', '/second.ts']
		});
	});

	test('closing the preview releases a model that is still loading', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const pending = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		instantiationService.stub(ITextModelService, { createModelReference: () => pending.p });
		const preview = store.add(instantiationService.createInstance(AnythingQuickAccessPreview));
		const loading = preview.setInput(URI.file('/first.ts'));
		preview.dispose();
		let released = false;
		await pending.complete({
			object: new class extends mock<IResolvedTextEditorModel>() { },
			dispose: () => { released = true; }
		});
		await loading;
		assert.strictEqual(released, true);
	});
});

suite('AnythingQuickAccess - links', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let provider: TestAnythingQuickAccessProvider;
	let opened: { resource: URI | string; options?: OpenOptions }[];
	let notifications: NotificationMessage[];
	let activeGroup: IEditorGroup;
	let activatedGroups: number[];
	let handled: boolean;
	let openError: Error | undefined;
	let sourceGroup: IEditorGroup;
	let otherGroup: IEditorGroup;
	let allowActiveGroupAccess: boolean;

	class TestAnythingQuickAccessProvider extends AnythingQuickAccessProvider {
		getPicks(filter: string, options?: IAnythingQuickAccessProviderRunOptions) {
			return this._getPicks(filter, store.add(new DisposableStore()), CancellationToken.None, options);
		}
	}

	class EmptyAnythingQuickAccessProvider extends AnythingQuickAccessProvider {
		protected override _getPicks(): IAnythingQuickPickItem[] {
			return [];
		}
	}

	setup(() => {
		opened = [];
		notifications = [];
		activatedGroups = [];
		handled = true;
		openError = undefined;
		allowActiveGroupAccess = true;
		sourceGroup = new class extends mock<IEditorGroup>() { override readonly id = 1; };
		otherGroup = new class extends mock<IEditorGroup>() { override readonly id = 2; };
		activeGroup = sourceGroup;
		instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IEditorGroupsService, {
			get activeGroup() {
				assert.ok(allowActiveGroupAccess, 'This picker must not access the active editor group');
				return activeGroup;
			},
			getGroup: id => id === sourceGroup.id ? sourceGroup : otherGroup,
			activateGroup: group => {
				const id = typeof group === 'number' ? group : group.id;
				activatedGroups.push(id);
				activeGroup = id === sourceGroup.id ? sourceGroup : otherGroup;
				return activeGroup;
			}
		});
		instantiationService.stub(IOpenerService, {
			open: async (resource, options) => {
				opened.push({ resource, options });
				if (openError) {
					throw openError;
				}
				return handled;
			}
		});
		instantiationService.stub(INotificationService, {
			warn: message => { notifications.push(...Array.isArray(message) ? message : [message]); },
			error: message => { notifications.push(...Array.isArray(message) ? message : [message]); }
		});
		instantiationService.stub(ISearchService, {
			fileSearch: async () => ({ results: [], messages: [] }),
			clearCache: async () => { }
		});
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(IOutlineService, {});
		instantiationService.stub(IOutlineModelService, {});
		configurationService = new TestConfigurationService({
			workbench: { editor: { enablePreview: true, enablePreviewFromQuickOpen: true, openSideBySideDirection: 'right' } },
			search: {}
		});
		instantiationService.stub(IConfigurationService, configurationService);
		provider = store.add(instantiationService.createInstance(TestAnythingQuickAccessProvider));
	});

	function getLinkPick(filter: string): IAnythingQuickPickItem {
		const picks = provider.getPicks(filter);
		assert.ok(Array.isArray(picks));
		assert.strictEqual(picks.length, 1);
		const pick: IAnythingQuickPickItem = picks[0];
		return pick;
	}

	for (const link of [
		'https://github.com/microsoft/vscode/pull/123?view=files#diff-123',
		'https://example.com:8443/path#L12,3-L14,5',
		'https://user@example.com/path',
		'file:///workspace/file.ts#L12',
		'vscode://publisher.extension/open?id=123',
		'custom-editor://session/123'
	]) {
		test(`opens through shared handlers without changing the link: ${link}`, async () => {
			const pick = getLinkPick(link);
			await pick.accept?.(NO_KEY_MODS, { inBackground: false });
			assert.deepStrictEqual(opened, [{
				resource: link,
				options: {
					fromUserGesture: true,
					allowContributedOpeners: true,
					openToSide: false,
					editorOptions: { preserveFocus: false, pinned: false }
				}
			}]);
		});
	}

	test('Alt+Enter opens beside the originating group even after the active group changes', async () => {
		const pick = getLinkPick('https://example.com');
		activeGroup = otherGroup;
		await pick.accept?.({ ...NO_KEY_MODS, alt: true }, { inBackground: false });
		assert.deepStrictEqual({
			activatedGroups,
			options: opened[0].options,
			hint: pick.detail,
			button: pick.buttons?.[0].tooltip
		}, {
			activatedGroups: [1],
			options: {
				fromUserGesture: true,
				allowContributedOpeners: true,
				openToSide: true,
				editorOptions: { preserveFocus: false, pinned: false }
			},
			hint: 'Hold Alt while accepting to open to the side.',
			button: 'Open to the Side'
		});
	});

	test('side button uses shared handlers and closes the picker', async () => {
		const pick = getLinkPick('https://example.com');
		const action = await pick.trigger?.(0, NO_KEY_MODS);
		assert.deepStrictEqual({ action, side: opened[0].options?.openToSide }, {
			action: TriggerAction.CLOSE_PICKER,
			side: true
		});
	});

	test('renders the link icon inline rather than applying icon font classes to the row', () => {
		const pick = getLinkPick('https://example.com');
		assert.deepStrictEqual({ label: pick.label, iconClasses: pick.iconClasses }, {
			label: '$(link-external) Open Link',
			iconClasses: undefined
		});
	});

	test('side-opening intent reaches a contributed external URI handler', async () => {
		const openerService = store.add(new OpenerService(instantiationService.get(ICodeEditorService), NullCommandService));
		const targets: { href: string; sourceUri: string; viewColumn: ViewColumn | undefined }[] = [];
		store.add(openerService.registerExternalOpener({
			openExternal: async (href, context) => {
				targets.push({ href, sourceUri: context.sourceUri.toString(), viewColumn: context.viewColumn });
				return true;
			}
		}));
		instantiationService.stub(IOpenerService, openerService);
		provider = store.add(instantiationService.createInstance(TestAnythingQuickAccessProvider));
		const link = 'https://github.com/microsoft/vscode/pull/123?view=files#diff-123';
		await getLinkPick(link).accept?.({ ...NO_KEY_MODS, alt: true }, { inBackground: false });
		assert.deepStrictEqual(targets, [{
			href: link,
			sourceUri: URI.parse(link).toString(),
			viewColumn: ViewColumn.Beside
		}]);
	});

	test('respects preview configuration and the existing Ctrl/Cmd side-opening gesture', async () => {
		await configurationService.setUserConfiguration('workbench', {
			editor: { enablePreview: false, enablePreviewFromQuickOpen: true, openSideBySideDirection: 'right' }
		});
		await getLinkPick('https://example.com').accept?.({ ...NO_KEY_MODS, ctrlCmd: true }, { inBackground: false });
		assert.deepStrictEqual(opened[0].options, {
			fromUserGesture: true,
			allowContributedOpeners: true,
			openToSide: true,
			editorOptions: { preserveFocus: false, pinned: true }
		});
	});

	test('background acceptance preserves focus and pins the editor', async () => {
		await getLinkPick('https://example.com').accept?.(NO_KEY_MODS, { inBackground: true });
		assert.deepStrictEqual(opened[0].options?.editorOptions, { preserveFocus: true, pinned: true });
	});

	for (const filter of ['readme.md', 'src/file.ts:12:3', 'file.ts@symbol', 'C:/src/file.ts', 'C:\\src\\file.ts', '>command', '@symbol', ':12', 'example.com']) {
		test(`preserves file queries and Quick Access prefixes: ${filter}`, () => {
			const picks = provider.getPicks(filter);
			assert.ok(!Array.isArray(picks));
		});
	}

	for (const link of ['https://', 'https:///path', 'https://[invalid', 'https://example.com/not a link', 'command://run', 'javascript://run', 'data://payload', `${Schemas.internal}://target`]) {
		test(`reports an invalid or disallowed link without an open action: ${link}`, () => {
			const pick = getLinkPick(link);
			assert.deepStrictEqual({ label: pick.label, accept: pick.accept, trigger: pick.trigger }, {
				label: 'Invalid Link',
				accept: undefined,
				trigger: undefined
			});
		});
	}

	test('respects caller filtering', () => {
		assert.deepStrictEqual(provider.getPicks('https://example.com', { filter: () => false }), []);
	});

	test('file-only and delegated pickers do not offer link actions', async () => {
		const filesOnly = await provider.getPicks('https://example.com', { filesOnly: true });
		const delegated = provider.getPicks('https://example.com', {
			fileSearchDelegate: { search: async () => ({ results: [], messages: [] }) }
		});
		assert.deepStrictEqual({ filesOnly, delegatedIsFileSearch: !Array.isArray(delegated) }, {
			filesOnly: [],
			delegatedIsFileSearch: true
		});
	});

	for (const [before, after] of [
		['readme.md', 'readme.md:12'],
		['readme.md:12', 'readme.md'],
		['readme.md', 'readme.md']
	]) {
		for (const link of ['https://example.com', 'https://']) {
			test(`refreshes file picks after ${before} -> ${link} -> ${after}`, () => {
				provider.getPicks(before);
				getLinkPick(link);
				const picks = provider.getPicks(after);
				assert.notStrictEqual(picks, null);
				assert.ok(!Array.isArray(picks), 'Returning to a file query must replace the link pick');
				assert.strictEqual(provider.getPicks('readme.md:13'), null, 'Range-only changes should still preserve file picks');
			});
		}
	}

	test('refreshes file picks after a link was filtered out', () => {
		provider.getPicks('readme.md');
		assert.deepStrictEqual(provider.getPicks('https://example.com', { filter: () => false }), []);
		assert.notStrictEqual(provider.getPicks('readme.md:12'), null);
	});

	for (const options of [
		{ filesOnly: true },
		{ fileSearchDelegate: { search: async () => ({ results: [], messages: [] }) } },
		{ handleAccept: () => { } }
	] satisfies IAnythingQuickAccessProviderRunOptions[]) {
		test(`does not require an active editor group for a specialized picker: ${Object.keys(options)[0]}`, () => {
			const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick<IAnythingQuickPickItem>({ useSeparators: true }));
			const provider = store.add(instantiationService.createInstance(EmptyAnythingQuickAccessProvider));
			allowActiveGroupAccess = false;
			store.add(provider.provide(picker, CancellationToken.None, options));
		});
	}

	test('does not require an active editor group for quick navigation', () => {
		const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick<IAnythingQuickPickItem>({ useSeparators: true }));
		const provider = store.add(instantiationService.createInstance(EmptyAnythingQuickAccessProvider));
		picker.quickNavigate = { keybindings: [] };
		allowActiveGroupAccess = false;
		store.add(provider.provide(picker, CancellationToken.None));
	});

	test('reports unhandled links', async () => {
		handled = false;
		await getLinkPick('unsupported://target').accept?.(NO_KEY_MODS, { inBackground: false });
		assert.deepStrictEqual(notifications, ['The link could not be opened. It may be unsupported or opening it was canceled.']);
	});

	test('reports opener errors', async () => {
		openError = new Error('Failed to open link');
		await getLinkPick('https://example.com').accept?.(NO_KEY_MODS, { inBackground: false });
		assert.deepStrictEqual(notifications, [openError]);
	});

	test('captures the source group when the picker is provided, not when the link is typed', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick<IAnythingQuickPickItem>({ useSeparators: true }));
		picker.value = 'https://example.com';
		store.add(provider.provide(picker, CancellationToken.None));
		activeGroup = otherGroup;
		const pick = getLinkPick('https://example.com/another');
		await pick.accept?.({ ...NO_KEY_MODS, alt: true }, { inBackground: false });
		assert.deepStrictEqual(activatedGroups, [1]);
	});
});
