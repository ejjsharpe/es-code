/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../platform/instantiation/common/instantiation.js';

export const ISessionsSetUpService = createDecorator<ISessionsSetUpService>('sessionsSetUpService');

export interface ISessionsSetUpService {
	readonly _serviceBrand: undefined;
	readonly initialSignInDialogShown: boolean;
	/** Resolves when the Agents window can process an incoming workspace handoff. */
	whenWelcomeDone(): Promise<void>;
}

/**
 * Keep the handoff and window-open telemetry contract for Agents sessions.
 * There is no product-owned welcome or sign-in dialog; session types provide
 * their own authentication and initialization when selected.
 */
export class SessionsSetUpService implements ISessionsSetUpService {
	declare readonly _serviceBrand: undefined;
	readonly initialSignInDialogShown = false;

	whenWelcomeDone(): Promise<void> {
		return Promise.resolve();
	}
}
