/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Canvas and chat still use the browser view service internally. The integrated
// browser editor, its actions, and the localhost link opener are not registered.
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserViewCDPService, IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewWorkbenchService } from './browserViewWorkbenchService.js';
import { BrowserViewCDPService } from './browserViewCDPService.js';

registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, InstantiationType.Delayed);
registerSingleton(IBrowserViewCDPService, BrowserViewCDPService, InstantiationType.Delayed);
