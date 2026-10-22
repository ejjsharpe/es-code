/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Whether this Windows target uses the Inno Setup installer. */
export function isInnoSetupInstall(target: string | undefined): boolean {
	return target === 'user' || target === 'system';
}
