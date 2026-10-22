/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type OnboardingTryoutSource = 'releaseNotes' | 'externalLink' | 'direct';

export interface IOnboardingTryoutRunOptions {
	readonly source: OnboardingTryoutSource;
	readonly runId?: string;
}

export function isOnboardingTryoutSource(value: unknown): value is OnboardingTryoutSource {
	return value === 'releaseNotes' || value === 'externalLink' || value === 'direct';
}
