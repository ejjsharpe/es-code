/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ChatAgentService, IChatAgentService } from '../common/participants/chatAgents.js';
import { IInlineChatSession, IInlineChatSessionService } from '../../inlineChat/browser/inlineChatSessionService.js';
import { IChatWidget, IChatWidgetService, IQuickChatService } from './chat.js';

class DisabledQuickChatService implements IQuickChatService {
	declare readonly _serviceBrand: undefined;
	readonly onDidClose = Event.None;
	readonly enabled = false;
	readonly focused = false;
	readonly sessionResource = undefined;

	toggle(): void { }
	focus(): void { }
	open(): void { }
	close(): void { }
	openInChatView(): void { }
}

class DisabledChatWidgetService implements IChatWidgetService {
	declare readonly _serviceBrand: undefined;
	readonly lastFocusedWidget = undefined;
	readonly onDidAddWidget = Event.None;
	readonly onDidRemoveWidget = Event.None;
	readonly onDidChangeWidgetVisibility = Event.None;
	readonly onDidBackgroundSession = Event.None;
	readonly onDidChangeFocusedWidget = Event.None;
	readonly onDidChangeFocusedSession = Event.None;

	async reveal(): Promise<boolean> { return false; }
	async revealWidget(): Promise<IChatWidget | undefined> { return undefined; }
	getAllWidgets(): ReadonlyArray<IChatWidget> { return []; }
	getWidgetByInputUri(): IChatWidget | undefined { return undefined; }
	async openSession(): Promise<IChatWidget | undefined> { return undefined; }
	getWidgetBySessionResource(): IChatWidget | undefined { return undefined; }
	getWidgetsByLocations(): ReadonlyArray<IChatWidget> { return []; }
	register(): IDisposable { return Disposable.None; }
}

class DisabledInlineChatSessionService implements IInlineChatSessionService {
	declare readonly _serviceBrand: undefined;
	readonly onWillStartSession = Event.None;
	readonly onDidChangeSessions = Event.None;

	async createSession(): Promise<IInlineChatSession> { throw new Error('Inline Chat is unavailable in the editor workbench'); }
	getSessionByTextModel(): undefined { return undefined; }
	getSessionBySessionUri(): undefined { return undefined; }
}

registerSingleton(IQuickChatService, DisabledQuickChatService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, DisabledChatWidgetService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IInlineChatSessionService, DisabledInlineChatSessionService, InstantiationType.Delayed);
