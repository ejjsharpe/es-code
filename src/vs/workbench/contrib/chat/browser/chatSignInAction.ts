/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { CHAT_CATEGORY, CHAT_SETUP_ACTION_ID } from './actions/chatActions.js';

export interface IChatSignInResult {
	readonly success: boolean | undefined;
	readonly error?: Error;
}

interface IChatSignInOptions {
	readonly additionalScopes?: readonly string[];
	readonly returnResult?: boolean;
}

class ChatSignInAction extends Action2 {
	constructor() {
		super({
			id: CHAT_SETUP_ACTION_ID,
			title: localize2('chat.signIn', "Sign In with GitHub"),
			category: CHAT_CATEGORY,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, _mode?: string, options?: IChatSignInOptions): Promise<boolean | IChatSignInResult> {
		try {
			await accessor.get(IAuthenticationService).createSession('github', [...new Set(options?.additionalScopes ?? [])], { activateImmediate: true });
			return options?.returnResult ? { success: true } : true;
		} catch (error) {
			const result: IChatSignInResult = {
				success: isCancellationError(error) ? undefined : false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
			if (options?.returnResult) {
				return result;
			}
			if (result.success === false) {
				throw result.error;
			}
			return false;
		}
	}
}

registerAction2(ChatSignInAction);
