/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILinkPresentation, ILinkPresentationStatus } from '../../dataChannel/common/dataChannel.js';
import { AgentSession } from './agent.js';
import { SessionServerToolName } from './serverToolNames.js';
import { DEFAULT_CHAT_ID, getAgentHostChatId, isAhpChatChannel } from './state/sessionState.js';

/**
 * Dedicated URI scheme for "open this session" links surfaced in agent/tool
 * output (e.g. the `create_session` server tool result). A single stable
 * scheme keeps the chat markdown allow-list minimal and lets the Agents window
 * register one opener, rather than allow-listing every dynamic provider scheme.
 *
 * Shape: `agent-host-session://<provider>/<rawSessionId>` — the backend session
 * URI (`<provider>:/<rawSessionId>`) rearranged so the provider is the
 * authority and the id is the path.
 */
export const AGENT_HOST_SESSION_LINK_SCHEME = 'agent-host-session';
export const AGENT_HOST_SESSION_LINK_PATTERN = /^agent-host-session:\/\/[^/?#]+\/[^?#]+(?:\?[^#]*)?(?:#.*)?$/i;
export const AGENT_HOST_SESSION_ONLY_LINK_PATTERN = /^(?![^#]*[?&]chat=)agent-host-session:\/\/[^/?#]+\/[^?#]+(?:\?[^#]*)?(?:#.*)?$/i;
export const AGENT_HOST_CHAT_LINK_PATTERN = /^(?=[^#]*[?&]chat=)agent-host-session:\/\/[^/?#]+\/[^?#]+(?:\?[^#]*)?(?:#.*)?$/i;

export type AgentSessionLinkStatus = 'untitled' | 'inProgress' | 'needsInput' | 'completed' | 'error';

export function buildAgentSessionLinkPresentation(title: string, description: string | undefined, status: AgentSessionLinkStatus, kind: 'session' | 'chat' = 'session'): ILinkPresentation {
	const presentationStatus = getAgentSessionLinkPresentationStatus(status);
	return {
		kind,
		title,
		...(description ? { detail: description } : {}),
		status: presentationStatus,
		tooltip: localize('agentSessionLink.tooltip', "{0} · {1}", title, presentationStatus.label),
		ariaLabel: kind === 'chat'
			? localize('agentChatLink.ariaLabel', "Agent chat {0}, {1}", title, presentationStatus.label)
			: localize('agentSessionLink.ariaLabel', "Agent session {0}, {1}", title, presentationStatus.label),
	};
}

function getAgentSessionLinkPresentationStatus(status: AgentSessionLinkStatus): ILinkPresentationStatus {
	switch (status) {
		case 'untitled': return { kind: 'neutral', label: localize('agentSessionLink.notStarted', "Not started") };
		case 'inProgress': return { kind: 'pending', label: localize('agentSessionLink.working', "Working") };
		case 'needsInput': return { kind: 'warning', label: localize('agentSessionLink.needsInput', "Needs attention") };
		case 'completed': return { kind: 'success', label: localize('agentSessionLink.completed', "Completed") };
		case 'error': return { kind: 'error', label: localize('agentSessionLink.error', "Error") };
	}
}

/**
 * Whether {@link toolName} (as seen on a tool call) matches {@link bareName}.
 * Accepts the bare name and a transport prefix such as Claude's
 * `mcp__<server>__<name>` (matched as a `__`-delimited suffix).
 */
function matchesToolName(toolName: string, bareName: string): boolean {
	return toolName === bareName || toolName.endsWith(`__${bareName}`);
}

/** Whether {@link toolName} refers to the `create_session` server tool. */
export function isCreateSessionTool(toolName: string): boolean {
	return matchesToolName(toolName, SessionServerToolName.CreateSession);
}

/** Whether {@link toolName} refers to the `create_chat` server tool. */
export function isCreateChatTool(toolName: string): boolean {
	return matchesToolName(toolName, SessionServerToolName.CreateChat);
}

/** Whether {@link toolName} refers to the `send_message` server tool. */
export function isSendMessageTool(toolName: string): boolean {
	return matchesToolName(toolName, SessionServerToolName.SendMessage);
}

/**
 * Builds an {@link AGENT_HOST_SESSION_LINK_SCHEME} link for a backend session URI.
 *
 * Normalizes the default chat: when {@link chatId} is {@link DEFAULT_CHAT_ID}
 * the link is emitted **without** a `chat=` query param. The Agents window gives
 * the default chat a resource with no URI fragment and the link opener selects a
 * chat by exact URI equality, so a link carrying `chat=default` would open the
 * session but match no chat. Omitting the id for the default chat is an
 * ecosystem-wide invariant (an absent chat id already means "the default chat"),
 * so it is enforced here once rather than at each call site.
 */
export function buildOpenSessionLinkUri(backendSession: URI | string, chatId?: string, turnId?: string, connectionAuthority?: string): string {
	const session = typeof backendSession === 'string' ? URI.parse(backendSession) : backendSession;
	const provider = session.scheme;
	const rawId = AgentSession.id(backendSession);
	if (!provider) {
		throw new Error(`Cannot build open-session link: missing provider in ${backendSession.toString()}`);
	}
	const base = URI.from({ scheme: AGENT_HOST_SESSION_LINK_SCHEME, authority: provider, path: `/${rawId}` }).toString();
	const query: string[] = [];
	if (connectionAuthority) {
		query.push(`connectionAuthority=${encodeURIComponent(connectionAuthority)}`);
	}
	if (session.authority || session.query || session.fragment) {
		query.push(`session=${encodeURIComponent(session.toString())}`);
	}
	if (chatId && chatId !== DEFAULT_CHAT_ID) {
		query.push(`chat=${encodeURIComponent(chatId)}`);
	}
	if (turnId) {
		query.push(`turn=${encodeURIComponent(turnId)}`);
	}
	return query.length > 0 ? `${base}?${query.join('&')}` : base;
}

/**
 * Recovers the backend session URI from an {@link AGENT_HOST_SESSION_LINK_SCHEME}
 * link, or `undefined` when the URI is not such a link.
 */
export function parseOpenSessionLinkUri(uri: URI | string): URI | undefined {
	const parsed = typeof uri === 'string' ? URI.parse(uri) : uri;
	if (parsed.scheme !== AGENT_HOST_SESSION_LINK_SCHEME || !parsed.authority) {
		return undefined;
	}
	if (/(?:^|&)connectionAuthority=/.test(parsed.query) && !parseOpenSessionLinkConnectionAuthority(parsed)) {
		return undefined;
	}
	const rawId = parsed.path.replace(/^\//, '');
	if (!rawId) {
		return undefined;
	}
	const session = readOpenSessionLinkQueryParam(parsed, 'session');
	if (session) {
		return URI.parse(session, true);
	}
	return AgentSession.uri(parsed.authority, rawId);
}

/**
 * Recovers the target chat id carried by an {@link AGENT_HOST_SESSION_LINK_SCHEME}
 * link (from `create_chat`), or `undefined` when the link targets a whole session.
 *
 * Defense in depth against externally-authored links: a `chat=default` param is
 * treated as absent (returns `undefined`). The default chat is addressed by its
 * session with no chat id, so surfacing `default` here would produce a chat
 * resource that matches no open chat; collapsing it to `undefined` keeps such
 * links resolving to the default chat.
 */
export function parseOpenSessionLinkChatId(uri: URI | string): string | undefined {
	const chatId = readOpenSessionLinkQueryParam(uri, 'chat');
	return chatId === DEFAULT_CHAT_ID ? undefined : chatId;
}

export function parseOpenSessionLinkTurnId(uri: URI | string): string | undefined {
	return readOpenSessionLinkQueryParam(uri, 'turn');
}

export function parseOpenSessionLinkConnectionAuthority(uri: URI | string): string | undefined {
	return readOpenSessionLinkQueryParam(uri, 'connectionAuthority');
}

function readOpenSessionLinkQueryParam(uri: URI | string, name: string): string | undefined {
	const parsed = typeof uri === 'string' ? URI.parse(uri) : uri;
	if (parsed.scheme !== AGENT_HOST_SESSION_LINK_SCHEME) {
		return undefined;
	}
	const match = new RegExp(`(?:^|&)${name}=([^&]+)`).exec(parsed.query);
	try {
		return match ? decodeURIComponent(match[1]) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Builds an {@link AGENT_HOST_SESSION_LINK_SCHEME} link that opens
 * `chatResource` (an AHP chat channel URI or a bare backend session URI) in its
 * recorded owning session `owner`. `defaultChat` is the owner's default chat:
 * it and the bare session get a session-only link, and any other chat carries
 * its chat id so the link opens that specific chat. Returns `undefined` when no
 * link can be built.
 * `connectionAuthority` names the client's connection to the host that owns
 * `owner` so the link opens on that connection; it is `undefined` for links a
 * host builds for its own sessions.
 *
 * This mirrors the link the host builds when resolving chat attachments so the
 * chat-reference chip in the input opens the exact same target.
 */
export function buildOpenSessionLinkForChat(owner: URI | string, chatResource: URI | string, defaultChat: URI | string | undefined, connectionAuthority: string | undefined): string | undefined {
	try {
		const resourceStr = chatResource.toString();
		if (!isAhpChatChannel(resourceStr) || (defaultChat !== undefined && resourceStr === defaultChat.toString())) {
			return buildOpenSessionLinkUri(owner.toString(), undefined, undefined, connectionAuthority);
		}
		return buildOpenSessionLinkUri(owner.toString(), getAgentHostChatId(resourceStr), undefined, connectionAuthority);
	} catch {
		return undefined;
	}
}
