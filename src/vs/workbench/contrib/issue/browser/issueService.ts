/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { localize } from '../../../../nls.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IssueReportOptions, IWorkbenchIssueService } from '../common/issue.js';

/** Returns a plain external issue URL without query parameters, fragments, or credentials. */
export function getIssueReportUrl(productUrl: string | undefined, extension?: Pick<IExtensionDescription, 'bugs' | 'repository'>): string | undefined {
	const cleanUrl = (value: string | undefined): URL | undefined => {
		if (!value) {
			return undefined;
		}
		try {
			const url = new URL(value);
			if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
				return undefined;
			}
			url.search = '';
			url.hash = '';
			return url;
		} catch {
			return undefined;
		}
	};

	const bugs = cleanUrl(extension?.bugs?.url);
	if (bugs) {
		if (bugs.hostname === 'github.com' && /^\/[^/]+\/[^/]+(?:\.git)?\/?$/.test(bugs.pathname)) {
			bugs.pathname = `${bugs.pathname.replace(/\/$/, '').replace(/\.git$/, '')}/issues/new`;
		} else if (bugs.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/issues\/?$/.test(bugs.pathname)) {
			bugs.pathname = `${bugs.pathname.replace(/\/$/, '')}/new`;
		}
		return bugs.toString();
	}

	const repository = cleanUrl(extension?.repository?.url);
	if (repository?.hostname === 'github.com' && /^\/[^/]+\/[^/]+(?:\.git)?\/?$/.test(repository.pathname)) {
		return `${repository.origin}${repository.pathname.replace(/\/$/, '').replace(/\.git$/, '')}/issues/new`;
	}

	return cleanUrl(productUrl)?.toString();
}

export class BrowserIssueService implements IWorkbenchIssueService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async openReporter(options: IssueReportOptions = {}): Promise<void> {
		let extension: Pick<IExtensionDescription, 'bugs' | 'repository'> | undefined;
		if (options.extensionId) {
			try {
				await this.extensionService.whenInstalledExtensionsRegistered();
				extension = this.extensionService.extensions.find(extension => extension.identifier.value.toLowerCase() === options.extensionId?.toLowerCase());
				if (!extension) {
					const installed = await this.extensionManagementService.getInstalled();
					extension = installed.find(item => item.identifier.id.toLowerCase() === options.extensionId?.toLowerCase())?.manifest;
				}
			} catch {
				// The product issue page remains available when extensions cannot be enumerated.
			}
		}
		const url = getIssueReportUrl(this.productService.reportIssueUrl, extension);
		if (!url) {
			this.notificationService.error(localize('issueDestinationMissing', "No issue reporting URL is configured."));
			return;
		}

		const details = [
			options.extensionId && localize('issueExtension', "Extension: {0}", options.extensionId),
			options.issueTitle && localize('issueTitle', "Title: {0}", options.issueTitle),
			options.issueBody
		].filter((part): part is string => !!part).join('\n\n');
		if (details) {
			await this.clipboardService.writeText(details);
			this.notificationService.info(localize('issueDetailsCopied', "Issue details were copied to the clipboard. Paste them into the issue page."));
		}

		await this.openerService.open(url, { openExternal: true });
	}
}
