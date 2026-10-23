/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickAccessProviderRunOptions } from '../../../../platform/quickinput/common/quickAccess.js';
import { IFileQueryBuilderOptions } from '../../../services/search/common/queryBuilder.js';

export interface ISearchQuickAccessOptions {
	matchCase: boolean;
	wholeWord: boolean;
	regex: boolean;
	includePattern: string;
	excludePattern: string;
	onlyOpenEditors: boolean;
	useExcludesAndIgnoreFiles: boolean;
	filtersExpanded: boolean;
	replaceExpanded: boolean;
	replaceText: string;
	preserveCase: boolean;
}

export interface ISearchQuickAccessRunOptions extends IQuickAccessProviderRunOptions {
	readonly searchOptions?: ISearchQuickAccessOptions;
}

export function getSearchQuickAccessOptions(runOptions?: IQuickAccessProviderRunOptions, previous?: ISearchQuickAccessOptions): ISearchQuickAccessOptions {
	return (runOptions as ISearchQuickAccessRunOptions | undefined)?.searchOptions ?? previous ?? {
		matchCase: false,
		wholeWord: false,
		regex: false,
		includePattern: '',
		excludePattern: '',
		onlyOpenEditors: false,
		useExcludesAndIgnoreFiles: true,
		filtersExpanded: false,
		replaceExpanded: false,
		replaceText: '',
		preserveCase: false
	};
}

export function getSearchScopeOptions(options?: ISearchQuickAccessOptions): IFileQueryBuilderOptions {
	if (!options) {
		return {};
	}
	return {
		includePattern: options.includePattern.trim(),
		excludePattern: options.excludePattern.trim() ? [{ pattern: options.excludePattern.trim() }] : undefined,
		onlyOpenEditors: options.onlyOpenEditors,
		disregardIgnoreFiles: !options.useExcludesAndIgnoreFiles || undefined,
		disregardExcludeSettings: !options.useExcludesAndIgnoreFiles || undefined,
		expandPatterns: true
	};
}
