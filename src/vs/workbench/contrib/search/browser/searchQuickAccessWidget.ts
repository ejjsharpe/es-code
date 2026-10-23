/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/anythingQuickAccess.css';
import * as dom from '../../../../base/browser/dom.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ReplaceInput } from '../../../../base/browser/ui/findinput/replaceInput.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickAccessProviderRunOptions } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickInputButtonLocation } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles, defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AnythingQuickAccessPreview } from './anythingQuickAccessPreview.js';
import { getSearchQuickAccessOptions, ISearchQuickAccessOptions, ISearchQuickAccessRunOptions } from './searchQuickAccessOptions.js';

export const TEXT_SEARCH_QUICK_ACCESS_PREFIX = '%';
const SEARCH_MODE_SWITCH = 'searchModeSwitch';

interface ISearchQuickAccessActions {
	refresh(): void;
	replace?(): Promise<void>;
	replaceAll?(): Promise<void>;
	canReplace?(): boolean;
	canReplaceAll?(): boolean;
}

/** Whether the content query is presented without a Quick Access prefix. */
export function isSearchModeSwitch(runOptions?: IQuickAccessProviderRunOptions): boolean {
	return runOptions?.from === SEARCH_MODE_SWITCH;
}

/** Shared search mode controls and file preview for file-name and content searches. */
export class SearchQuickAccessWidget extends Disposable {

	readonly preview: AnythingQuickAccessPreview;
	readonly options: ISearchQuickAccessOptions;

	constructor(
		picker: IQuickPick<IQuickPickItem, { useSeparators: true }>,
		mode: 'files' | 'contents',
		runOptions: ISearchQuickAccessRunOptions | undefined,
		private readonly actions: ISearchQuickAccessActions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super();
		this.options = getSearchQuickAccessOptions(runOptions);
		this.preview = this._register(instantiationService.createInstance(AnythingQuickAccessPreview));
		const header = dom.$('.search-quick-access-header');
		const details = dom.$('.search-quick-access-details');
		const modes = dom.append(header, dom.$('.search-quick-access-modes', {
			role: 'group',
			'aria-label': localize('searchMode', "Search Mode")
		}));
		const switchMode = () => {
			const query = mode === 'contents' && !isSearchModeSwitch(runOptions) ? picker.value.substring(TEXT_SEARCH_QUICK_ACCESS_PREFIX.length) : picker.value;
			const providerOptions: ISearchQuickAccessRunOptions = { from: SEARCH_MODE_SWITCH, searchOptions: this.options };
			quickInputService.quickAccess.show(query, {
				providerPrefix: mode === 'files' ? TEXT_SEARCH_QUICK_ACCESS_PREFIX : '',
				allowPrefixSwitching: true,
				preserveValue: true,
				providerOptions
			});
		};
		for (const [buttonMode, label] of [
			['files', localize('fileNames', "File Names")],
			['contents', localize('fileContents', "File Contents")]
		] as const) {
			const button = dom.append(modes, dom.$('button.search-quick-access-mode', {
				type: 'button',
				'aria-pressed': String(buttonMode === mode)
			}, label));
			if (buttonMode !== mode) {
				button.setAttribute('aria-keyshortcuts', 'Tab');
			}
			this._register(dom.addDisposableListener(button, dom.EventType.CLICK, () => {
				if (buttonMode === mode) {
					return;
				}
				switchMode();
			}));
		}
		const initialButtons = picker.buttons;
		if (mode === 'contents') {
			this.addReplaceControls(picker, details);
			this.addContentControls(picker, details);
		}
		const onControlKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Enter' && dom.isHTMLElement(event.target) && event.target.tagName === 'INPUT') {
				event.preventDefault();
				quickInputService.focus();
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.stopPropagation();
			}
		};
		this._register(dom.addDisposableListener(header, dom.EventType.KEY_DOWN, onControlKeyDown));
		this._register(dom.addDisposableListener(details, dom.EventType.KEY_DOWN, onControlKeyDown));
		this._register(dom.addDisposableListener(dom.getActiveWindow(), dom.EventType.KEY_DOWN, event => {
			const container = header.parentElement?.parentElement;
			if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || quickInputService.currentQuickInput !== picker || !dom.isHTMLElement(event.target) || header.contains(event.target) || details.contains(event.target) || !container?.contains(event.target)) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) {
				switchMode();
			}
		}, true));
		picker.header = header;
		picker.inputDetails = mode === 'contents' ? details : undefined;
		picker.preview = this.preview.element;
		this._register(toDisposable(() => {
			picker.buttons = initialButtons;
			picker.header = undefined;
			picker.inputDetails = undefined;
			picker.preview = undefined;
		}));
	}

	private addContentControls(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, header: HTMLElement): void {
		const details = dom.append(header, dom.$<HTMLDetailsElement>('details.search-quick-access-filters'));
		details.open = this.options.filtersExpanded;
		const summary = dom.append(details, dom.$('summary', undefined, localize('searchFilters', "Filters")));
		const fields = dom.append(details, dom.$('.search-quick-access-filter-fields'));
		const updateSummary = () => {
			const count = Number(!!this.options.includePattern.trim()) + Number(!!this.options.excludePattern.trim()) + Number(this.options.onlyOpenEditors) + Number(!this.options.useExcludesAndIgnoreFiles);
			summary.textContent = count ? localize('activeSearchFilters', "Filters ({0})", count) : localize('searchFilters', "Filters");
		};
		updateSummary();
		const updateOptions = () => {
			updateSummary();
			this.actions.refresh();
		};
		for (const [key, label, placeholder] of [
			['includePattern', localize('filesToInclude', "Files to Include"), localize('includePlaceholder', "e.g. *.ts, src/**")],
			['excludePattern', localize('filesToExclude', "Files to Exclude"), localize('excludePlaceholder', "e.g. *.test.ts, dist/**")]
		] as const) {
			const field = dom.append(fields, dom.$('.search-quick-access-filter-field'));
			dom.append(field, dom.$('span', undefined, label));
			const input = this._register(new InputBox(field, undefined, { ariaLabel: label, placeholder, inputBoxStyles: defaultInputBoxStyles }));
			input.value = this.options[key];
			this._register(input.onDidChange(value => {
				this.options[key] = value;
				updateOptions();
			}));
		}
		for (const [key, label] of [
			['onlyOpenEditors', localize('onlyOpenEditors', "Search Only in Open Editors")],
			['useExcludesAndIgnoreFiles', localize('useIgnoreFiles', "Use Exclude Settings and Ignore Files")]
		] as const) {
			const field = dom.append(fields, dom.$('label.search-quick-access-scope'));
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = this.options[key];
			field.append(checkbox, label);
			this._register(dom.addDisposableListener(checkbox, dom.EventType.CHANGE, () => {
				this.options[key] = checkbox.checked;
				updateOptions();
			}));
		}
		this._register(dom.addDisposableListener(details, 'toggle', () => {
			this.options.filtersExpanded = details.open;
			picker.inputDetails = header;
		}));
		for (const [key, icon, label] of [
			['matchCase', Codicon.caseSensitive, localize('matchCase', "Match Case")],
			['wholeWord', Codicon.wholeWord, localize('wholeWord', "Match Whole Word")],
			['regex', Codicon.regex, localize('regex', "Use Regular Expression")]
		] as const) {
			const button = { location: QuickInputButtonLocation.Input, iconClass: ThemeIcon.asClassName(icon), tooltip: label, toggle: { checked: this.options[key] } };
			picker.buttons = [...picker.buttons, button];
			this._register(picker.onDidTriggerButton(triggered => {
				if (triggered === button) {
					this.options[key] = button.toggle.checked;
					this.actions.refresh();
				}
			}));
		}
	}

	private addReplaceControls(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, container: HTMLElement): void {
		const details = dom.append(container, dom.$<HTMLDetailsElement>('details.search-quick-access-replace'));
		details.open = this.options.replaceExpanded;
		dom.append(details, dom.$('summary', undefined, localize('replace', "Replace")));
		const input = this._register(new ReplaceInput(details, undefined, true, {
			label: localize('replaceWith', "Replace With"),
			placeholder: localize('replaceWith', "Replace With"),
			inputBoxStyles: defaultInputBoxStyles,
			toggleStyles: defaultToggleStyles
		}));
		input.setValue(this.options.replaceText);
		input.setPreserveCase(this.options.preserveCase);
		this._register(input.onInput(() => this.options.replaceText = input.getValue()));
		this._register(input.onDidOptionChange(() => this.options.preserveCase = input.getPreserveCase()));
		const buttons = dom.append(details, dom.$('.search-quick-access-replace-actions'));
		let busy = false;
		const replace = dom.append(buttons, dom.$<HTMLButtonElement>('button', { type: 'button' }, localize('replaceSelected', "Replace")));
		const replaceAll = dom.append(buttons, dom.$<HTMLButtonElement>('button', { type: 'button' }, localize('replaceAll', "Replace All")));
		const update = () => {
			replace.disabled = busy || !this.actions.replace || !this.actions.canReplace?.();
			replaceAll.disabled = busy || !this.actions.replaceAll || !this.actions.canReplaceAll?.();
		};
		const run = async (action: (() => Promise<void>) | undefined) => {
			if (!action || busy) {
				return;
			}
			this.quickInputService.focus();
			busy = true;
			update();
			try {
				await action();
			} finally {
				busy = false;
				update();
			}
		};
		this._register(dom.addDisposableListener(replace, dom.EventType.CLICK, () => void run(this.actions.replace)));
		this._register(dom.addDisposableListener(replaceAll, dom.EventType.CLICK, () => void run(this.actions.replaceAll)));
		this._register(picker.onDidChangeActive(update));
		this._register(picker.onDidChangeValue(update));
		this._register(dom.addDisposableListener(details, 'toggle', () => {
			this.options.replaceExpanded = details.open;
			picker.inputDetails = container;
		}));
		update();
	}
}
