/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { BaseIssueContribution } from '../common/issue.contribution.js';
import { IWorkbenchIssueService } from '../common/issue.js';
import { BrowserIssueService } from './issueService.js';

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(BaseIssueContribution, LifecyclePhase.Restored);
registerSingleton(IWorkbenchIssueService, BrowserIssueService, InstantiationType.Delayed);

CommandsRegistry.registerCommand('_issues.getSystemStatus', () => localize('statusUnsupported', "The --status argument is not yet supported in browsers."));
