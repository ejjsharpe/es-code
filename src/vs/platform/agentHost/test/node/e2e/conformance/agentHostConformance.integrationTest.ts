/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Host Protocol conformance tests.
 *
 * These are the scenarios whose contract is owned by the **agent host**, not by
 * any particular agent provider: session and chat lifecycle, state operations,
 * peer-catalog semantics, host-executed commands, and completions. They are
 * registered once — not once per provider — because running them once per provider
 * only re-verifies host code that has no provider-dependent branch.
 *
 * Everything here is host-only: no request ever reaches the model boundary, so
 * the suite needs no credentials, no network, and no recorded fixtures beyond
 * the empty capture.
 *
 * A provider still has to exist so that sessions can be materialized. Claude
 * is the reference provider. Provider-specific assertions belong in the
 * parity tier (`providers/*AgentHostE2E.integrationTest.ts`).
 *
 * The implementation under test is reached only through `IAgentHostTarget`
 * (see `harness/agentHostTarget.ts`). Any process that speaks the Agent Host
 * Protocol can be substituted there and should pass this suite unchanged.
 */

import { defineAgentHostConformanceTests } from '../suites/agentHostE2ESuites.js';
import { CLAUDE_CONFIG } from '../providers/claudeTestConfiguration.js';

defineAgentHostConformanceTests({ ...CLAUDE_CONFIG, suiteTitle: 'Agent Host E2E — Conformance' });
