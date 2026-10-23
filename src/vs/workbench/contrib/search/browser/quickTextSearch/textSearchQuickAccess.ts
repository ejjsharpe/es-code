/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { basenameOrAuthority, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITextEditorSelection } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { FastAndSlowPicks, IPickerQuickAccessItem, IPickerQuickAccessSeparator, PickerQuickAccessProvider, Picks, TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { DefaultQuickAccessFilterValue, IQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IKeyMods, IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEditorConfiguration } from '../../../../common/editor.js';
import { searchOpenInFileIcon } from '../searchIcons.js';
import { getEditorSelectionFromMatch } from '../searchView.js';
import { IWorkbenchSearchConfiguration, getOutOfWorkspaceEditorResources } from '../../common/search.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { ITextQueryBuilderOptions, QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { IPatternInfo, ISearchComplete, ITextQuery } from '../../../../services/search/common/search.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { SearchModelImpl } from '../searchTreeModel/searchModel.js';
import { SearchModelLocation, ISearchTreeFileMatch, ISearchTreeMatch } from '../searchTreeModel/searchTreeCommon.js';
import { searchComparer } from '../searchCompare.js';
import { IMatch } from '../../../../../base/common/filters.js';
import { isSearchModeSwitch, SearchQuickAccessWidget, TEXT_SEARCH_QUICK_ACCESS_PREFIX } from '../searchQuickAccessWidget.js';
import { getSearchQuickAccessOptions, getSearchScopeOptions, ISearchQuickAccessOptions } from '../searchQuickAccessOptions.js';

export { TEXT_SEARCH_QUICK_ACCESS_PREFIX };

const DEFAULT_TEXT_QUERY_BUILDER_OPTIONS: ITextQueryBuilderOptions = {
	_reason: 'quickAccessSearch',
	disregardIgnoreFiles: false,
	disregardExcludeSettings: false,
	onlyOpenEditors: false,
	expandPatterns: true
};

interface ITextSearchQuickAccessItem extends IPickerQuickAccessItem {
	match?: ISearchTreeMatch;
}
export class TextSearchQuickAccess extends PickerQuickAccessProvider<ITextSearchQuickAccessItem> {

	private queryBuilder: QueryBuilder;
	private readonly searchModel: SearchModelImpl;
	private searchOptions: ISearchQuickAccessOptions | undefined;
	private currentSearchValue: string | undefined;
	private currentAsyncSearch: Promise<ISearchComplete> = Promise.resolve({
		results: [],
		messages: []
	});

	private _getTextQueryBuilderOptions(charsPerLine: number): ITextQueryBuilderOptions {
		return {
			...DEFAULT_TEXT_QUERY_BUILDER_OPTIONS,
			...getSearchScopeOptions(this.searchOptions),
			... {
				extraFileResources: this._instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
				maxResults: this.configuration.maxResults ?? undefined,
				isSmartCase: this.configuration.smartCase,
			},

			previewOptions: {
				matchLines: 1,
				charsPerLine
			}
		};
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super(TEXT_SEARCH_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true, shouldSkipTrimPickFilter: true });

		this.queryBuilder = this._instantiationService.createInstance(QueryBuilder);
		this.searchModel = this._register(this._instantiationService.createInstance(SearchModelImpl));
		this.searchModel.location = SearchModelLocation.QUICK_ACCESS;
	}

	override dispose(): void {
		this.searchModel.dispose();
		super.dispose();
	}

	override provide(picker: IQuickPick<ITextSearchQuickAccessItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		const disposables = new DisposableStore();
		if (!isSearchModeSwitch(runOptions) && TEXT_SEARCH_QUICK_ACCESS_PREFIX.length < picker.value.length) {
			picker.valueSelection = [TEXT_SEARCH_QUICK_ACCESS_PREFIX.length, picker.value.length];
		}
		this.searchOptions = getSearchQuickAccessOptions(runOptions, this.searchOptions);
		const canReplace = () => this.currentSearchValue === this.getFilterValue(picker.value, runOptions);
		const widget = disposables.add(this._instantiationService.createInstance(SearchQuickAccessWidget, picker, 'contents', { ...runOptions, searchOptions: this.searchOptions }, {
			refresh: () => this.refresh(picker),
			replace: () => this.replace(picker, false, token),
			replaceAll: () => this.replace(picker, true, token),
			canReplace: () => canReplace() && !!picker.activeItems[0]?.match,
			canReplaceAll: () => canReplace() && this.searchModel.searchResult.count() > 0
		}));
		const onDidChangeActive = () => {
			const [item] = picker.activeItems;
			void widget.preview.setInput(item?.match?.parent().resource, item?.match?.range());
		};

		disposables.add(picker.onDidChangeActive(onDidChangeActive));
		onDidChangeActive();

		disposables.add(Event.once(picker.onDidHide)(({ reason }) => {
			this.searchModel.searchResult.toggleHighlights(false);
		}));

		disposables.add(super.provide(picker, token, runOptions));
		disposables.add(picker.onDidAccept(() => this.searchModel.searchResult.toggleHighlights(false)));
		return disposables;
	}

	protected override getFilterValue(value: string, runOptions?: IQuickAccessProviderRunOptions): string {
		return isSearchModeSwitch(runOptions) && !value.startsWith(TEXT_SEARCH_QUICK_ACCESS_PREFIX) ? value : super.getFilterValue(value, runOptions);
	}

	private async replace(picker: IQuickPick<ITextSearchQuickAccessItem, { useSeparators: true }>, all: boolean, token: CancellationToken): Promise<void> {
		const model = this.searchModel;
		const value = picker.value;
		const query = model.searchResult.query;
		const replacement = this.searchOptions?.replaceText ?? '';
		const preserveCase = this.searchOptions?.preserveCase ?? false;
		const match = picker.activeItems[0]?.match;
		if (!this.currentSearchValue || (!all && !match)) {
			return;
		}
		try {
			await this.currentAsyncSearch;
			if (token.isCancellationRequested || value !== picker.value || model !== this.searchModel || query !== model.searchResult.query || !model.searchResult.count()) {
				return;
			}
			model.replaceActive = true;
			model.preserveCase = preserveCase;
			model.replaceString = replacement;
			if (all) {
				const ignoreFocusOut = picker.ignoreFocusOut;
				picker.ignoreFocusOut = true;
				let confirmed: boolean;
				try {
					({ confirmed } = await this.dialogService.confirm({
						title: localize('replaceAll', "Replace All"),
						message: localize('confirmReplaceAll', "Replace {0} matches in {1} files?", model.searchResult.count(), model.searchResult.fileCount()),
						primaryButton: localize('confirmReplace', "Replace")
					}));
				} finally {
					picker.ignoreFocusOut = ignoreFocusOut;
					this.quickInputService.focus();
				}
				if (!confirmed || token.isCancellationRequested || value !== picker.value || query !== model.searchResult.query) {
					return;
				}
				await model.searchResult.replaceAll({ report: () => { } });
			} else if (match) {
				await match.parent().replace(match);
			}
			this.refresh(picker);
		} catch (error) {
			if (!token.isCancellationRequested) {
				this.notificationService.error(error instanceof Error ? error : localize('replaceFailed', "Could not replace the search results."));
			}
		}
	}

	private get configuration() {
		const editorConfig = this._configurationService.getValue<IWorkbenchEditorConfiguration>().workbench?.editor;
		const searchConfig = this._configurationService.getValue<IWorkbenchSearchConfiguration>().search;

		return {
			openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
			preserveInput: searchConfig.quickAccess.preserveInput,
			maxResults: searchConfig.maxResults,
			smartCase: searchConfig.smartCase,
			sortOrder: searchConfig.sortOrder,
		};
	}

	get defaultFilterValue(): DefaultQuickAccessFilterValue | undefined {
		if (this.configuration.preserveInput) {
			return DefaultQuickAccessFilterValue.LAST;
		}

		return undefined;
	}

	private doSearch(contentPattern: string, token: CancellationToken): {
		syncResults: ISearchTreeFileMatch[];
		asyncResults: Promise<ISearchTreeFileMatch[]>;
	} | undefined {
		if (contentPattern === '') {
			return undefined;
		}

		const folderResources: IWorkspaceFolder[] = this._contextService.getWorkspace().folders;
		const content: IPatternInfo = {
			pattern: contentPattern,
			isCaseSensitive: this.searchOptions?.matchCase,
			isWordMatch: this.searchOptions?.wholeWord,
			isRegExp: this.searchOptions?.regex,
		};
		this.searchModel.searchResult.toggleHighlights(false);
		const charsPerLine = content.isRegExp ? 10000 : 1000; // from https://github.com/microsoft/vscode/blob/e7ad5651ac26fa00a40aa1e4010e81b92f655569/src/vs/workbench/contrib/search/browser/searchView.ts#L1508

		const query: ITextQuery = this.queryBuilder.text(content, folderResources.map(folder => folder.uri), this._getTextQueryBuilderOptions(charsPerLine));

		const result = this.searchModel.search(query, undefined, token);
		this.currentSearchValue = contentPattern;

		const getAsyncResults = async () => {
			this.currentAsyncSearch = result.asyncResults;
			await result.asyncResults;
			const syncResultURIs = new ResourceSet(result.syncResults.map(e => e.resource));
			return this.searchModel.searchResult.matches(false).filter(e => !syncResultURIs.has(e.resource));
		};
		return {
			syncResults: this.searchModel.searchResult.matches(false),
			asyncResults: getAsyncResults()
		};
	}

	private _getPicksFromMatches(matches: ISearchTreeFileMatch[], firstFile?: URI): (IPickerQuickAccessSeparator | ITextSearchQuickAccessItem)[] {
		matches = matches.sort((a, b) => {
			if (firstFile) {
				if (firstFile === a.resource) {
					return -1;
				} else if (firstFile === b.resource) {
					return 1;
				}
			}
			return searchComparer(a, b, this.configuration.sortOrder);
		});

		const picks: Array<ITextSearchQuickAccessItem | IPickerQuickAccessSeparator> = [];

		for (const iFileInstanceMatch of matches) {

			const label = basenameOrAuthority(iFileInstanceMatch.resource);
			const description = this._labelService.getUriLabel(dirname(iFileInstanceMatch.resource), { relative: true });


			picks.push({
				label,
				type: 'separator',
				description,
				buttons: [{
					iconClass: ThemeIcon.asClassName(searchOpenInFileIcon),
					tooltip: localize('QuickSearchOpenInFile', "Open File")
				}],
				trigger: async (): Promise<TriggerAction> => {
					await this.handleAccept(iFileInstanceMatch, {});
					return TriggerAction.CLOSE_PICKER;
				},
			});

			const results: ISearchTreeMatch[] = iFileInstanceMatch.matches() ?? [];
			for (const element of results) {
				const preview = element.preview();
				const previewText = (preview.before + preview.inside + preview.after).trim().substring(0, 999);
				const match: IMatch[] = [{
					start: preview.before.length,
					end: preview.before.length + preview.inside.length
				}];
				picks.push({
					label: `${previewText}`,
					description: localize('matchLine', "Line {0}", element.range().startLineNumber),
					highlights: {
						label: match
					},
					ariaLabel: localize('matchLocation', "Match at location {0}:{1} - {2}", element.range().startLineNumber, element.range().startColumn, previewText),
					accept: async (keyMods, event) => {
						await this.handleAccept(iFileInstanceMatch, {
							keyMods,
							selection: getEditorSelectionFromMatch(element, this.searchModel),
							preserveFocus: event.inBackground,
							forcePinned: event.inBackground
						});
					},
					match: element
				});
			}
		}
		return picks;
	}

	private async handleAccept(iFileInstanceMatch: ISearchTreeFileMatch, options: { keyMods?: IKeyMods; selection?: ITextEditorSelection; preserveFocus?: boolean; range?: IRange; forcePinned?: boolean; forceOpenSideBySide?: boolean }): Promise<void> {
		const editorOptions = {
			preserveFocus: options.preserveFocus,
			pinned: options.keyMods?.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
			selection: options.selection
		};

		// from https://github.com/microsoft/vscode/blob/f40dabca07a1622b2a0ae3ee741cfc94ab964bef/src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts#L1037
		const targetGroup = options.keyMods?.alt || (this.configuration.openEditorPinned && options.keyMods?.ctrlCmd) || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;

		await this._editorService.openEditor({
			resource: iFileInstanceMatch.resource,
			options: editorOptions
		}, targetGroup);
	}

	protected _getPicks(contentPattern: string, disposables: DisposableStore, token: CancellationToken): Picks<IQuickPickItem> | Promise<Picks<IQuickPickItem> | FastAndSlowPicks<IQuickPickItem>> | FastAndSlowPicks<IQuickPickItem> | null {
		this.currentSearchValue = undefined;
		if (this.searchOptions?.regex && contentPattern) {
			try {
				new RegExp(contentPattern, 'u');
			} catch (error) {
				return [{ label: localize('invalidRegex', "Invalid regular expression: {0}", error instanceof Error ? error.message : contentPattern) }];
			}
		}

		if (contentPattern === '') {
			this.searchModel.searchResult.clear();
			return [];
		}

		const conditionalTokenCts = disposables.add(new CancellationTokenSource(token));
		const allMatches = this.doSearch(contentPattern, conditionalTokenCts.token);

		if (!allMatches) {
			return null;
		}
		const matches = allMatches.syncResults;
		const syncResult = this._getPicksFromMatches(matches, this._editorService.activeEditor?.resource);

		return {
			picks: syncResult,
			additionalPicks: allMatches.asyncResults
				.then(asyncResults => (asyncResults.length + syncResult.length === 0) ? [{
					label: localize('noAnythingResults', "No matching results")
				}] : this._getPicksFromMatches(asyncResults))
		};

	}
}
