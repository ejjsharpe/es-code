/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationRegistry, ConfigurationScope, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { localize } from '../../../../nls.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { IRemoteAgentHostService, NullRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { NullAgentHostService } from '../../../../platform/agentHost/browser/nullAgentHostService.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IChatDebugService } from '../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../common/chatDebugServiceImpl.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatService } from '../common/chatService/chatServiceImpl.js';
import { ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService } from '../common/ignoredFiles.js';
import { ILanguageModelsService, LanguageModelsService } from '../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../common/languageModelsConfiguration.js';
import { ChatTransferService, IChatTransferService } from '../common/model/chatTransferService.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../common/participants/chatSlashCommands.js';
import { AgentPluginEnablementService, IAgentPluginEnablementService } from '../common/plugins/agentPluginEnablement.js';
import { AgentPluginService } from '../common/plugins/agentPluginServiceImpl.js';
import { IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../common/promptSyntax/service/promptsServiceImpl.js';
import { ILanguageModelToolsConfirmationService } from '../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../common/tools/languageModelToolsService.js';
import { LanguageModelToolsExtensionPointHandler } from '../common/tools/languageModelToolsContribution.js';
import { IToolResultCompressor } from '../common/tools/toolResultCompressor.js';
import { ChatUtilityModelService, IChatUtilityModelService } from '../common/chatUtilityModelService.js';
import { ChatOutputRendererService, IChatOutputRendererService } from './chatOutputItemRenderer.js';
import { ChatExtensionPointHandler } from './chatParticipant.contribution.js';
import { LanguageModelsConfigurationService } from './languageModelsConfigurationService.js';
import { ChatToolRiskAssessmentService, IChatToolRiskAssessmentService } from './tools/chatToolRiskAssessmentService.js';
import { LanguageModelToolsConfirmationService } from './tools/languageModelToolsConfirmationService.js';
import { LanguageModelToolsService } from './tools/languageModelToolsService.js';
import { ToolResultCompressorService } from './tools/toolResultCompressorService.js';
import { IMcpService } from '../../mcp/common/mcpTypes.js';
import { McpService } from '../../mcp/common/mcpService.js';
import { McpRegistry } from '../../mcp/common/mcpRegistry.js';
import { IMcpRegistry } from '../../mcp/common/mcpRegistryTypes.js';
import { IMcpSandboxService, McpSandboxService } from '../../mcp/common/mcpSandboxService.js';
import { BrowserMcpGatewayService } from '../../mcp/browser/mcpGatewayService.js';
import { IWorkbenchMcpGatewayService } from '../../mcp/common/mcpGatewayService.js';
import { AllowedMcpServersService } from '../../../../platform/mcp/common/allowedMcpServersService.js';
import { IAllowedMcpServersService } from '../../../../platform/mcp/common/mcpManagement.js';

// The extension API needs these shared registries even though the built-in chat workbench is absent.
// Keep the full chat contribution out of the editor: it also registers first-party actions and sessions.
import './chatSessions/chatSessions.contribution.js';
import './aiCustomization/customizationHarnessService.js';
import '../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import '../../../services/chat/common/chatEntitlementService.js';
import '../common/chatOpenDiagnosticsService.js';
import '../../../../platform/mcp/common/mcpResourceScannerService.js';
import '../../../services/authentication/browser/authenticationMcpService.js';
import '../../../services/authentication/browser/authenticationMcpAccessService.js';
import '../../../services/authentication/browser/authenticationMcpUsageService.js';

registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatDebugService, ChatDebugServiceImpl, InstantiationType.Delayed);
registerSingleton(IChatTransferService, ChatTransferService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsConfigurationService, LanguageModelsConfigurationService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService, InstantiationType.Delayed);
registerSingleton(IAgentPluginEnablementService, AgentPluginEnablementService, InstantiationType.Delayed);
registerSingleton(IAgentPluginService, AgentPluginService, InstantiationType.Delayed);
registerSingleton(IPromptsService, PromptsService, InstantiationType.Delayed);
registerSingleton(IChatUtilityModelService, ChatUtilityModelService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsConfirmationService, LanguageModelToolsConfirmationService, InstantiationType.Delayed);
registerSingleton(IChatToolRiskAssessmentService, ChatToolRiskAssessmentService, InstantiationType.Delayed);
registerSingleton(IToolResultCompressor, ToolResultCompressorService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(IChatOutputRendererService, ChatOutputRendererService, InstantiationType.Delayed);
registerSingleton(IMcpService, McpService, InstantiationType.Delayed);
registerSingleton(IMcpRegistry, McpRegistry, InstantiationType.Delayed);
registerSingleton(IMcpSandboxService, McpSandboxService, InstantiationType.Delayed);
registerSingleton(IRemoteAgentHostService, NullRemoteAgentHostService, InstantiationType.Delayed);
registerSingleton(IAgentHostService, NullAgentHostService, InstantiationType.Delayed);
registerSingleton(IWorkbenchMcpGatewayService, BrowserMcpGatewayService, InstantiationType.Delayed);
registerSingleton(IAllowedMcpServersService, AllowedMcpServersService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatAIDisabledSettingId]: {
			type: 'boolean',
			description: localize('chat.disableAIFeatures', "Disable and hide built-in AI features provided by GitHub Copilot, including chat and inline suggestions."),
			default: true,
			scope: ConfigurationScope.WINDOW,
		}
	}
});

registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, WorkbenchPhase.BlockStartup);
