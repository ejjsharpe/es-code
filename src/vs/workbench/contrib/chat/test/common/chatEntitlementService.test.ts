/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementContextKeys, ChatEntitlementService, getQuotaReset, getQuotaUsage, QuotaUsageKind } from '../../../../services/chat/common/chatEntitlementService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('getQuotaUsage', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('derives usage for every quota shape', () => {
		assert.deepStrictEqual({
			missing: getQuotaUsage(undefined),
			unlimitedWithCredits: getQuotaUsage({ percentRemaining: 100, unlimited: true, creditsUsed: 206141 }),
			unlimitedWithoutCredits: getQuotaUsage({ percentRemaining: 100, unlimited: true }),
			unlimitedPooledDepleted: getQuotaUsage({ percentRemaining: 0, unlimited: true, hasQuota: false, creditsUsed: 500 }),
			cappedWithRemaining: getQuotaUsage({ percentRemaining: 25, unlimited: false, entitlement: 400, quotaRemaining: 100 }),
			cappedIgnoresCreditsUsed: getQuotaUsage({ percentRemaining: 6.2, unlimited: false, entitlement: 13000, quotaRemaining: 807.7, creditsUsed: 14517 }),
			cappedWithoutRemaining: getQuotaUsage({ percentRemaining: 25, unlimited: false, entitlement: 400 }),
			cappedWithoutEntitlement: getQuotaUsage({ percentRemaining: 25, unlimited: false }),
			cappedZeroEntitlement: getQuotaUsage({ percentRemaining: 25, unlimited: false, entitlement: 0 }),
		}, {
			missing: undefined,
			unlimitedWithCredits: { kind: QuotaUsageKind.CreditsUsed, creditsUsed: 206141 },
			unlimitedWithoutCredits: undefined,
			unlimitedPooledDepleted: undefined,
			cappedWithRemaining: { kind: QuotaUsageKind.Percentage, usedPercentage: 75, used: 300, total: 400 },
			cappedIgnoresCreditsUsed: { kind: QuotaUsageKind.Percentage, usedPercentage: 93.8, used: 12192.3, total: 13000 },
			cappedWithoutRemaining: { kind: QuotaUsageKind.Percentage, usedPercentage: 75, used: 300, total: 400 },
			cappedWithoutEntitlement: { kind: QuotaUsageKind.Percentage, usedPercentage: 75, used: undefined, total: undefined },
			cappedZeroEntitlement: { kind: QuotaUsageKind.Percentage, usedPercentage: 75, used: undefined, total: undefined },
		});
	});
});

suite('getQuotaReset', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const account = { resetDate: '2026-09-01T00:00:00Z', resetDateHasTime: true };
	const snapshotResetAt = Math.floor(Date.UTC(2026, 7, 20, 14, 0, 0) / 1000);

	test('prefers the snapshot reset over the account reset', () => {
		assert.deepStrictEqual({
			snapshotWins: getQuotaReset({ percentRemaining: 50, unlimited: false, resetAt: snapshotResetAt }, account),
			fallsBackToAccount: getQuotaReset({ percentRemaining: 50, unlimited: false }, account),
			accountWithoutTime: getQuotaReset(undefined, { resetDate: '2026-09-01T00:00:00Z' }),
			malformedAccountDate: getQuotaReset(undefined, { resetDate: 'not-a-date' }),
			noSnapshotNoAccount: getQuotaReset(undefined, {}),
		}, {
			snapshotWins: { date: new Date(snapshotResetAt * 1000), hasTime: true },
			fallsBackToAccount: { date: new Date('2026-09-01T00:00:00Z'), hasTime: true },
			accountWithoutTime: { date: new Date('2026-09-01T00:00:00Z'), hasTime: false },
			malformedAccountDate: undefined,
			noSnapshotNoAccount: undefined,
		});
	});
});

suite('ChatEntitlementService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): ChatEntitlementService {
		return store.add(new ChatEntitlementService(
			store.add(new MockContextKeyService()),
			new TestConfigurationService(),
			NullTelemetryService,
			new NullLogService(),
			store.add(new TestStorageService()),
		));
	}

	test('signals changed usage when only consumed credits move on an unlimited plan', () => {
		const service = createService();
		const fired: string[] = [];
		service.acceptQuotas({ premiumChat: { percentRemaining: 100, unlimited: true, creditsUsed: 100 } });
		store.add(service.onDidChangeQuotaRemaining(() => fired.push('remaining')));

		service.acceptQuotas({ premiumChat: { percentRemaining: 100, unlimited: true, creditsUsed: 250 } });
		const afterCreditsChange = [...fired];

		service.acceptQuotas({ premiumChat: { percentRemaining: 100, unlimited: true, creditsUsed: 250 } });

		assert.deepStrictEqual({ afterCreditsChange, afterNoChange: fired }, {
			afterCreditsChange: ['remaining'],
			afterNoChange: ['remaining'],
		});
	});

	const availabilityChanges: { name: string; before: ChatEntitlementService['quotas']; after: ChatEntitlementService['quotas'] }[] = [
		{
			name: 'additional usage permission',
			before: { premiumChat: { percentRemaining: 0, unlimited: false }, additionalUsageEnabled: true },
			after: { premiumChat: { percentRemaining: 0, unlimited: false }, additionalUsageEnabled: false },
		},
		{
			name: 'pooled allowance availability',
			before: { premiumChat: { percentRemaining: 100, unlimited: true, hasQuota: true } },
			after: { premiumChat: { percentRemaining: 100, unlimited: true, hasQuota: false } },
		},
		{
			name: 'premium allowance becomes limited',
			before: { premiumChat: { percentRemaining: 0, unlimited: true } },
			after: { premiumChat: { percentRemaining: 0, unlimited: false } },
		},
		{
			name: 'session rate limit becomes limited',
			before: { sessionRateLimit: { percentRemaining: 0, unlimited: true } },
			after: { sessionRateLimit: { percentRemaining: 0, unlimited: false } },
		},
		{
			name: 'weekly rate limit becomes limited',
			before: { weeklyRateLimit: { percentRemaining: 0, unlimited: true } },
			after: { weeklyRateLimit: { percentRemaining: 0, unlimited: false } },
		},
	];
	for (const { name, before, after } of availabilityChanges) {
		test(`signals quota availability changes without a percentage change: ${name}`, () => {
			const service = createService();
			service.acceptQuotas(before);
			let changes = 0;
			store.add(service.onDidChangeQuotaRemaining(() => changes++));

			service.acceptQuotas(after);
			const afterChange = changes;
			service.acceptQuotas(after);
			const afterIdenticalSnapshot = changes;
			service.acceptQuotas(before);

			assert.deepStrictEqual({ afterChange, afterIdenticalSnapshot, afterRecovery: changes }, {
				afterChange: 1, afterIdenticalSnapshot: 1, afterRecovery: 2,
			});
		});
	}

	test('merges defined snapshot fields until the snapshot is removed', () => {
		const service = createService();
		service.acceptQuotas({
			premiumChat: {
				percentRemaining: 90,
				unlimited: true,
				hasQuota: true,
				resetAt: 100,
				usageBasedBilling: true,
				entitlement: 1000,
				quotaRemaining: 900,
				creditsUsed: 100,
			},
		});

		service.acceptQuotas({
			premiumChat: {
				percentRemaining: 80,
				unlimited: true,
				hasQuota: undefined,
				resetAt: undefined,
				usageBasedBilling: undefined,
				entitlement: undefined,
				quotaRemaining: undefined,
				creditsUsed: undefined,
			},
		});
		const merged = service.quotas.premiumChat;

		service.acceptQuotas({
			premiumChat: {
				percentRemaining: 70,
				unlimited: false,
				hasQuota: false,
				resetAt: 200,
				usageBasedBilling: false,
				entitlement: 2000,
				quotaRemaining: 1300,
				creditsUsed: 700,
			},
		});
		const updated = service.quotas.premiumChat;

		service.acceptQuotas({});

		assert.deepStrictEqual({ merged, updated, removed: service.quotas.premiumChat }, {
			merged: {
				percentRemaining: 80,
				unlimited: true,
				hasQuota: true,
				resetAt: 100,
				usageBasedBilling: true,
				entitlement: 1000,
				quotaRemaining: 900,
				creditsUsed: 100,
			},
			updated: {
				percentRemaining: 70,
				unlimited: false,
				hasQuota: false,
				resetAt: 200,
				usageBasedBilling: false,
				entitlement: 2000,
				quotaRemaining: 1300,
				creditsUsed: 700,
			},
			removed: undefined,
		});
	});
});

suite('ChatEntitlementContext', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function resolveInternal(organisations: string[], isStaff: boolean | undefined): Promise<boolean | undefined> {
		const contextKeyService = store.add(new MockContextKeyService());
		const context = store.add(new ChatEntitlementContext(
			contextKeyService,
			store.add(new TestStorageService()),
			new NullLogService(),
			new TestConfigurationService(),
			NullTelemetryService,
		));

		await context.update({ entitlement: ChatEntitlement.Pro, organisations, isStaff, sku: undefined, copilotTrackingId: undefined });

		return contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.internal.key);
	}

	test('treats staff and internal organisation members as internal', async () => {
		assert.deepStrictEqual({
			external: await resolveInternal(['contoso'], false),
			staff: await resolveInternal(['contoso'], true),
			internalOrg: await resolveInternal(['microsoft'], false),
			unknownStaff: await resolveInternal(['contoso'], undefined),
		}, {
			external: false,
			staff: true,
			internalOrg: true,
			unknownStaff: false,
		});
	});
});
