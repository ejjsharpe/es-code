/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IProcessService } from '../../../../platform/process/common/process.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { BrowserIssueService } from '../browser/issueService.js';
import { BaseIssueContribution } from '../common/issue.contribution.js';
import { IWorkbenchIssueService } from '../common/issue.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(BaseIssueContribution, LifecyclePhase.Restored);
registerSingleton(IWorkbenchIssueService, BrowserIssueService, InstantiationType.Delayed);

class ReportPerformanceIssueAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.reportPerformanceIssueUsingReporter',
			title: localize2({ key: 'reportPerformanceIssue', comment: [`Here, 'issue' means problem or bug`] }, "Report Performance Issue..."),
			category: Categories.Help,
			f1: true
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IWorkbenchIssueService).openReporter({ issueTitle: localize2('performanceIssueTitle', "Performance Issue").value });
	}
}

registerAction2(ReportPerformanceIssueAction);
CommandsRegistry.registerCommand('_issues.getSystemStatus', accessor => accessor.get(IProcessService).getSystemStatus());
