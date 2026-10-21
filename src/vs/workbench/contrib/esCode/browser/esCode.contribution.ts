/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ISCMResource, ISCMService } from '../../scm/common/scm.js';
import { ITerminalChatService, ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { ITerminalChatSessionResolver, TerminalChatService, TerminalChatSessionResolver } from '../../terminal/terminalContribChatExports.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';

const emptyScheme = 'es-code-empty';
const diffActive = new RawContextKey<boolean>('esCode.diffActive', false);
const fileActive = new RawContextKey<boolean>('esCode.fileActive', false);

// TerminalTabbedView uses these contracts even when terminal chat is not loaded.
registerSingleton(ITerminalChatService, TerminalChatService, InstantiationType.Delayed);
registerSingleton(ITerminalChatSessionResolver, TerminalChatSessionResolver, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([{ overrides: {
	'workbench.startupEditor': 'none',
	'workbench.secondarySideBar.defaultVisibility': 'hidden',
	'workbench.activityBar.location': 'top',
	'editor.minimap.enabled': false,
	'breadcrumbs.enabled': false,
	'window.commandCenter': false,
	'chat.disableAIFeatures': true,
	'workbench.welcomePage.experimentalOnboarding': false
} }]);

/** Provides a stable empty side for untracked and newly added files. */
class EmptyGitContentContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'esCode.emptyGitContent';

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(emptyScheme, {
			provideTextContent: async resource => modelService.getModel(resource) ?? modelService.createModel('', languageService.createById('plaintext'), resource)
		}));
	}
}

/** Keeps one Pi terminal for this window and exposes the shortcut at rest. */
class PiTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'esCode.piTerminal';
	static instance: PiTerminalContribution | undefined;
	private terminal: ITerminalInstance | undefined;

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@IStatusbarService statusbarService: IStatusbarService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();
		PiTerminalContribution.instance = this;
		this._register(statusbarService.addEntry({
			name: localize('esCode.pi.name', "Pi Terminal"),
			text: '$(terminal) Pi',
			ariaLabel: localize('esCode.pi.aria', "Open Pi Terminal"),
			tooltip: localize('esCode.pi.tooltip', "Open Pi Terminal (⌘⌥P)"),
			command: { id: 'esCode.openPi', title: localize('esCode.pi.command', "Open Pi Terminal") }
		}, 'esCode.pi', StatusbarAlignment.LEFT, 100));
		this._register(this.terminalService.onDidDisposeInstance(instance => {
			if (this.terminal === instance) {
				this.terminal = undefined;
			}
		}));
	}

	override dispose(): void {
		if (PiTerminalContribution.instance === this) {
			PiTerminalContribution.instance = undefined;
		}
		super.dispose();
	}

	async open(): Promise<void> {
		if (!this.terminal) {
			const resource = EditorResourceAccessor.getCanonicalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
			const cwd = (resource && this.workspaceService.getWorkspaceFolder(resource)?.uri) ?? this.workspaceService.getWorkspace().folders[0]?.uri;
			this.terminal = await this.terminalService.createTerminal({
				config: { name: localize('esCode.pi.terminalName', "Pi") },
				cwd,
				location: TerminalLocation.Panel
			});
			const missingMessage = localize('esCode.pi.missing', "Pi is not installed or is not on PATH. Install pi and reopen this terminal.");
			const quote = String.fromCharCode(39);
			const quotedMessage = missingMessage.replaceAll(quote, `${quote}\\${quote}${quote}`);
			await this.terminal.sendText(`if command -v pi >/dev/null 2>&1; then pi; else printf '%s\\n' '${quotedMessage}'; fi`, true);
		}
		this.terminalService.setActiveInstance(this.terminal);
		await this.terminalService.revealActiveTerminal();
		await this.terminal.focusWhenReady();
	}
}

class OpenPiAction extends Action2 {
	constructor() {
		super({
			id: 'esCode.openPi',
			title: localize2('esCode.openPi', "Open Pi Terminal"),
			keybinding: { primary: 0, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP }, weight: KeybindingWeight.WorkbenchContrib + 100 }
		});
	}

	async run(_accessor: ServicesAccessor): Promise<void> {
		await PiTerminalContribution.instance?.open();
	}
}

/** The active editor remains selected when terminal focus moves away from code. */
class DiffTitleContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'esCode.diffTitle';

	constructor(@IEditorService editorService: IEditorService, @IContextKeyService contextKeyService: IContextKeyService) {
		super();
		const diffKey = diffActive.bindTo(contextKeyService);
		const fileKey = fileActive.bindTo(contextKeyService);
		const update = () => {
			const editor = editorService.activeEditor;
			diffKey.set(editor instanceof DiffEditorInput);
			fileKey.set(EditorResourceAccessor.getCanonicalUri(editor)?.scheme === 'file');
		};
		this._register(editorService.onDidActiveEditorChange(update));
		update();
	}
}

function findChange(scmService: ISCMService, resource: URI): ISCMResource | undefined {
	const repository = scmService.getRepository(resource);
	if (!repository || repository.provider.providerId !== 'git') {
		return undefined;
	}
	for (const groupId of ['workingTree', 'untracked', 'index']) {
		const group = repository.provider.groups.find(candidate => candidate.id === groupId);
		const change = group?.resources.find(candidate => candidate.sourceUri.toString() === resource.toString());
		if (change) {
			return change;
		}
	}
	return undefined;
}

async function toggleDiff(accessor: ServicesAccessor): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const groupsService = accessor.get(IEditorGroupsService);
	const scmService = accessor.get(ISCMService);
	const notificationService = accessor.get(INotificationService);
	const editor = editorService.activeEditor;
	if (!editor) {
		return;
	}
	const group = groupsService.activeGroup;
	if (editor instanceof DiffEditorInput) {
		const modified = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (modified && (modified.scheme === 'file' || modified.scheme === 'git')) {
			const resource = modified.scheme === 'git' ? URI.file(modified.path) : modified;
			await editorService.replaceEditors([{ editor, replacement: { resource, options: { pinned: group.isPinned(editor) } } }], group);
		}
		return;
	}
	const resource = EditorResourceAccessor.getCanonicalUri(editor);
	if (!resource || resource.scheme !== 'file') {
		return;
	}
	if (editor.isDirty()) {
		notificationService.info(localize('esCode.diff.saveFirst', "Save this file before opening its Git diff."));
		return;
	}
	const change = findChange(scmService, resource);
	if (!change) {
		notificationService.info(localize('esCode.diff.noChanges', "This file has no Git changes."));
		return;
	}
	const original = change.multiDiffEditorOriginalUri ?? resource.with({ scheme: emptyScheme });
	const modified = change.multiDiffEditorModifiedUri ?? resource.with({ scheme: emptyScheme });
	await editorService.replaceEditors([{ editor, replacement: {
		original: { resource: original }, modified: { resource: modified },
		options: { pinned: group.isPinned(editor) }
	} }], group);
}

class ToggleDiffAction extends Action2 {
	constructor() {
		super({
			id: 'esCode.toggleDiff',
			title: localize2('esCode.toggleDiff', "Toggle Code and Diff"),
			keybinding: { primary: 0, mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyD }, weight: KeybindingWeight.WorkbenchContrib + 100 }
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return toggleDiff(accessor);
	}
}

class ShowDiffAction extends Action2 {
	constructor() {
		super({
			id: 'esCode.showDiff', title: localize2('esCode.showDiff', "Diff"),
			menu: { id: MenuId.EditorTitle, when: fileActive, group: 'navigation', order: 1 },
			keybinding: { primary: 0, mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyD }, when: fileActive, weight: KeybindingWeight.WorkbenchContrib + 101 }
		});
	}
	run(accessor: ServicesAccessor): Promise<void> { return toggleDiff(accessor); }
}

class ShowCodeAction extends Action2 {
	constructor() {
		super({
			id: 'esCode.showCode', title: localize2('esCode.showCode', "Code"),
			menu: { id: MenuId.EditorTitle, when: diffActive, group: 'navigation', order: 1 },
			keybinding: { primary: 0, mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyD }, when: diffActive, weight: KeybindingWeight.WorkbenchContrib + 101 }
		});
	}
	run(accessor: ServicesAccessor): Promise<void> { return toggleDiff(accessor); }
}

registerWorkbenchContribution2(EmptyGitContentContribution.ID, EmptyGitContentContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(PiTerminalContribution.ID, PiTerminalContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DiffTitleContribution.ID, DiffTitleContribution, WorkbenchPhase.AfterRestored);
registerAction2(OpenPiAction);
registerAction2(ToggleDiffAction);
registerAction2(ShowDiffAction);
registerAction2(ShowCodeAction);
