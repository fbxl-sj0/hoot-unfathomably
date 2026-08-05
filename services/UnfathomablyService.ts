/*
    Project: Hoot Mobile
    --------------------------

    File: UnfathomablyService.ts

    Purpose:

        Provide the Mastodon-compatible client boundary used by the mobile app.

    This file intentionally does NOT contain:

        - React state
        - screen rendering
*/

import { LOTIDE_REQUEST_TIMEOUT_MS } from "./LotideService/util";

export type UnfathomablyAccount = {
  id: string;
  username: string;
  acct: string;
  display_name: string;
  avatar: string;
  note: string;
  url: string;
};

export type UnfathomablyMention = {
  id: string;
  username: string;
  acct: string;
  url: string;
};

export type UnfathomablyGroup = {
  id: string;
  display_name: string;
  note: string;
  avatar: string;
  header: string;
  members_count: number;
  locked: boolean;
  relationship?: { member?: boolean; requested?: boolean } | null;
};

export type UnfathomablyStatus = {
  id: string;
  created_at: string;
  content: string;
  url?: string;
  in_reply_to_id?: string | null;
  in_reply_to_account_id?: string | null;
  quote_id?: string | null;
  quotes_count?: number;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  dislikes_count?: number;
  favourited?: boolean;
  disliked?: boolean;
  reblogged?: boolean;
  mentions?: UnfathomablyMention[];
  emoji_reactions?: { name: string; count: number; me?: boolean; url?: string }[] | null;
  pleroma?: {
    emoji_reactions?: { name: string; count: number; me?: boolean; url?: string }[] | null;
    in_reply_to_account_acct?: string | null;
    parent_visible?: boolean;
    quote?: UnfathomablyStatus | null;
    quote_id?: string | null;
    quote_visible?: boolean;
    quotes_count?: number;
  };
  sensitive: boolean;
  spoiler_text: string;
  account: UnfathomablyAccount;
  group?: UnfathomablyGroup | null;
  media_attachments: { id: string; type: string; description?: string; preview_url?: string; url: string }[];
  reblog?: UnfathomablyStatus;
};

export type UnfathomablyNotification = {
  id: string;
  type: string;
  created_at: string;
  account: UnfathomablyAccount;
  status?: UnfathomablyStatus;
};

export type OAuthApplication = {
  client_id: string;
  client_secret: string;
};
type OAuthToken = { access_token: string };

export type StatusCapabilities = {
  dislike: boolean;
  emojiReactions: boolean;
  quote: boolean;
};

export type StatusContextPage = {
  statuses: UnfathomablyStatus[];
  hasMore: boolean;
};

export type StatusContextWindow = {
  ancestors: UnfathomablyStatus[];
  descendants: UnfathomablyStatus[];
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
  mode: "paged" | "legacy";
};

export const OAUTH_SCOPES = "read write follow push";
export const STATUS_CONTEXT_REQUEST_TIMEOUT_MS = 120_000;
export const INITIAL_CONTEXT_ANCESTOR_LIMIT = 10;
export const INITIAL_CONTEXT_DESCENDANT_LIMIT = 20;

const MAX_CONTEXT_PAGE_SIZE = 39;
const UNAVAILABLE_CONTEXT_PAGE_STATUSES = new Set([404, 405, 410, 501]);

const LOCAL_SERVER_HOSTS = new Set([
  "127.0.0.1",
  "10.0.2.2",
  "localhost",
  "::1",
]);

function parseServerInput(value: string): URL | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(candidate);
  } catch {
    return undefined;
  }
}

export function normalizeServerUrl(value: string): string {
  const parsed = parseServerInput(value);
  if (!parsed) return "";
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

  return parsed.origin;
}

export function getSupportedServerUrl(value: string): string | undefined {
  const parsed = parseServerInput(value);
  if (!parsed || parsed.username || parsed.password) return undefined;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  const isLocal = LOCAL_SERVER_HOSTS.has(hostname);
  if (!isLocal && !hostname.includes(".")) return undefined;

  if (parsed.protocol === "https:") return parsed.origin;

  return isLocal ? parsed.origin : undefined;
}

function requireSupportedServerUrl(value: string): string {
  if (!value.trim()) {
    throw new Error("No Unfathomably server URL selected.");
  }

  const supported = getSupportedServerUrl(value);
  if (supported) return supported;

  const parsed = parseServerInput(value);
  if (parsed?.protocol === "http:") {
    throw new Error(
      "For your account security, remote Unfathomably servers must use HTTPS.",
    );
  }

  throw new Error("Enter a valid Unfathomably server URL.");
}

function getResponseErrorMessage(
  status: number,
  statusText: string | undefined,
  body: string,
): string {
  const trimmedBody = body.trim();

  if (trimmedBody) {
    try {
      const parsed = JSON.parse(trimmedBody) as {
        error?: unknown;
        message?: unknown;
      };
      const apiMessage =
        typeof parsed.error === "string"
          ? parsed.error
          : typeof parsed.message === "string"
            ? parsed.message
            : undefined;
      if (apiMessage) return apiMessage;
    } catch {
      if (!/^\s*(?:<!doctype\s+html|<html)\b/i.test(trimmedBody)) {
        return trimmedBody;
      }
    }
  }

  const reason = statusText?.trim();
  return `Unfathomably returned ${status}${reason ? ` (${reason})` : ""}.`;
}

async function request<T>(
  ctx: LotideContext | { apiUrl: string; login?: { token?: string } },
  path: string,
  init: RequestInit = {},
  timeoutMs = LOTIDE_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const base = requireSupportedServerUrl(ctx.apiUrl || "");
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  let didTimeout = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(ctx.login?.token ? { Authorization: `Bearer ${ctx.login.token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const timeoutError = new Error(
    `The Unfathomably server did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`,
  );
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      didTimeout = true;
      controller?.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(`${base}${path}`, {
        ...init,
        headers,
        signal: controller?.signal,
      }),
      timeout,
    ]);
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(
        getResponseErrorMessage(response.status, response.statusText, body),
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return await response.json() as T;
  } catch (error) {
    if (
      didTimeout ||
      error === timeoutError ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = Object.entries(params).reduce((result, [key, value]) => {
    if (value !== undefined && value !== "") result.set(key, String(value));
    return result;
  }, new URLSearchParams());
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function getStatusCapabilities(
  status: UnfathomablyStatus,
): StatusCapabilities {
  return {
    dislike:
      typeof status.disliked === "boolean" ||
      typeof status.dislikes_count === "number",
    emojiReactions:
      Array.isArray(status.emoji_reactions) ||
      Array.isArray(status.pleroma?.emoji_reactions),
    quote:
      status.quote_id !== undefined ||
      status.quotes_count !== undefined ||
      status.pleroma?.quote !== undefined ||
      status.pleroma?.quote_id !== undefined ||
      status.pleroma?.quote_visible !== undefined ||
      status.pleroma?.quotes_count !== undefined,
  };
}

function rethrowUnavailableFeature(error: unknown, message: string): never {
  const status = (error as Error & { status?: number })?.status;
  if (status && [404, 405, 410, 501].includes(status)) {
    throw new Error(message);
  }
  throw error;
}

export async function getInstance(serverUrl: string): Promise<{ title?: string; version?: string; description?: string }> {
  return request({ apiUrl: serverUrl }, "/api/v1/instance");
}

export async function registerOAuthApplication(
  serverUrl: string,
  redirectUri: string,
): Promise<OAuthApplication> {
  if (!redirectUri.trim()) {
    throw new Error("Cannot start server login without a redirect URI.");
  }

  return request<OAuthApplication>({ apiUrl: serverUrl }, "/api/v1/apps", {
    method: "POST",
    body: JSON.stringify({
      client_name: "Hoot Unfathomably",
      redirect_uris: redirectUri,
      scopes: OAUTH_SCOPES,
      website: "https://github.com/fbxl-sj0/hoot-unfathomably",
    }),
  });
}

export function buildOAuthAuthorizationUrl(
  serverUrl: string,
  application: OAuthApplication,
  redirectUri: string,
  state: string,
): string {
  const base = requireSupportedServerUrl(serverUrl);
  const authorizationUrl = new URL("/oauth/authorize", base);

  authorizationUrl.search = new URLSearchParams({
    client_id: application.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OAUTH_SCOPES,
    state,
  }).toString();

  return authorizationUrl.toString();
}

export function readOAuthAuthorizationCode(
  redirectUrl: string,
  expectedState: string,
): string {
  let parsed: URL;

  try {
    parsed = new URL(redirectUrl);
  } catch {
    throw new Error("The server returned an invalid login response.");
  }

  const errorDescription =
    parsed.searchParams.get("error_description") ??
    parsed.searchParams.get("error");
  if (errorDescription) {
    throw new Error(`Server login was not completed: ${errorDescription}`);
  }

  if (
    !expectedState ||
    parsed.searchParams.get("state") !== expectedState
  ) {
    throw new Error(
      "The server returned an invalid login state. Please try again.",
    );
  }

  const code = parsed.searchParams.get("code");
  if (!code) {
    throw new Error("The server did not return a login authorization code.");
  }

  return code;
}

export async function loginWithAuthorizationCode(
  serverUrl: string,
  application: OAuthApplication,
  redirectUri: string,
  code: string,
): Promise<{ token: string; account: UnfathomablyAccount }> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: application.client_id,
    client_secret: application.client_secret,
    redirect_uri: redirectUri,
    code,
  });
  const token = await request<OAuthToken>(
    { apiUrl: serverUrl },
    "/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
  );
  const account = await request<UnfathomablyAccount>(
    { apiUrl: serverUrl, login: { token: token.access_token } },
    "/api/v1/accounts/verify_credentials",
  );

  return { token: token.access_token, account };
}

export async function loginWithPassword(serverUrl: string, username: string, password: string): Promise<{ token: string; account: UnfathomablyAccount }> {
  const app = await registerOAuthApplication(
    serverUrl,
    "urn:ietf:wg:oauth:2.0:oob",
  );
  const form = new URLSearchParams({
    grant_type: "password",
    client_id: app.client_id,
    client_secret: app.client_secret,
    username,
    password,
    scope: OAUTH_SCOPES,
  });
  const token = await request<OAuthToken>({ apiUrl: serverUrl }, "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const account = await request<UnfathomablyAccount>({ apiUrl: serverUrl, login: { token: token.access_token } }, "/api/v1/accounts/verify_credentials");
  return { token: token.access_token, account };
}

export function getHomeTimeline(ctx: LotideContext, maxId?: string, scope: "home" | "groups" = "home") {
  const endpoint = scope === "groups" ? "/api/v1/timelines/groups" : "/api/v1/timelines/home";
  return request<UnfathomablyStatus[]>(ctx, `${endpoint}${query({ limit: 30, max_id: maxId })}`);
}

export async function getGroupTimeline(ctx: LotideContext, maxId?: string) {
  try {
    const statuses = await getHomeTimeline(ctx, maxId, "groups");
    // A group timeline must never silently render ordinary home statuses if an
    // instance returns a malformed aggregate response.
    return statuses.filter(status => !!(status.group || status.reblog?.group));
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Group timelines are not available on this server.",
    );
  }
}

export function getStatus(ctx: LotideContext, id: string) {
  return request<UnfathomablyStatus>(ctx, `/api/v1/statuses/${encodeURIComponent(id)}`);
}

export function getStatusContext(ctx: LotideContext, id: string) {
  return request<{
    ancestors: UnfathomablyStatus[];
    descendants: UnfathomablyStatus[];
  }>(
    ctx,
    `/api/v1/statuses/${encodeURIComponent(id)}/context`,
    {},
    STATUS_CONTEXT_REQUEST_TIMEOUT_MS,
  );
}

function isUnavailableContextPage(error: unknown): boolean {
  const status = (error as Error & { status?: number })?.status;
  return typeof status === "number" &&
    UNAVAILABLE_CONTEXT_PAGE_STATUSES.has(status);
}

function boundedContextPageSize(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.max(1, Math.min(Math.trunc(limit), MAX_CONTEXT_PAGE_SIZE));
}

async function getStatusContextPage(
  ctx: LotideContext,
  id: string,
  direction: "ancestors" | "descendants",
  cursor: string | undefined,
  limit: number,
): Promise<StatusContextPage> {
  const pageSize = boundedContextPageSize(limit);
  const statuses = await request<UnfathomablyStatus[]>(
    ctx,
    `/api/v1/statuses/${encodeURIComponent(id)}/context/${direction}${query({
      limit: pageSize + 1,
      [direction === "ancestors" ? "max_id" : "min_id"]: cursor,
    })}`,
  );
  const hasMore = statuses.length > pageSize;

  return {
    statuses: direction === "ancestors"
      ? statuses.slice(-pageSize)
      : statuses.slice(0, pageSize),
    hasMore,
  };
}

export function getStatusAncestors(
  ctx: LotideContext,
  id: string,
  maxId?: string,
  limit = INITIAL_CONTEXT_ANCESTOR_LIMIT,
) {
  return getStatusContextPage(ctx, id, "ancestors", maxId, limit);
}

export function getStatusDescendants(
  ctx: LotideContext,
  id: string,
  minId?: string,
  limit = INITIAL_CONTEXT_DESCENDANT_LIMIT,
) {
  return getStatusContextPage(ctx, id, "descendants", minId, limit);
}

export async function getStatusContextWindow(
  ctx: LotideContext,
  id: string,
): Promise<StatusContextWindow> {
  const [ancestors, descendants] = await Promise.allSettled([
    getStatusAncestors(ctx, id),
    getStatusDescendants(ctx, id),
  ]);

  if (ancestors.status === "fulfilled" && descendants.status === "fulfilled") {
    return {
      ancestors: ancestors.value.statuses,
      descendants: descendants.value.statuses,
      hasMoreAncestors: ancestors.value.hasMore,
      hasMoreDescendants: descendants.value.hasMore,
      mode: "paged",
    };
  }

  const failures = [ancestors, descendants].filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  const serverFailure = failures.find(
    result => !isUnavailableContextPage(result.reason),
  );
  if (serverFailure) throw serverFailure.reason;

  if (failures.length > 0) {
    const legacy = await getStatusContext(ctx, id);
    return {
      ...legacy,
      hasMoreAncestors: false,
      hasMoreDescendants: false,
      mode: "legacy",
    };
  }

  throw new Error("The Unfathomably server returned an incomplete discussion.");
}

export function favouriteStatus(ctx: LotideContext, id: string, remove = false) {
  return request<UnfathomablyStatus>(ctx, `/api/v1/statuses/${encodeURIComponent(id)}/${remove ? "unfavourite" : "favourite"}`, { method: "POST" });
}

export async function dislikeStatus(ctx: LotideContext, id: string, remove = false) {
  try {
    return await request<UnfathomablyStatus>(
      ctx,
      `/api/friendica/statuses/${encodeURIComponent(id)}/${remove ? "undislike" : "dislike"}`,
      { method: "POST" },
    );
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Thumbs-down reactions are not available on this server.",
    );
  }
}

export function reblogStatus(ctx: LotideContext, id: string, remove = false) {
  return request<UnfathomablyStatus>(ctx, `/api/v1/statuses/${encodeURIComponent(id)}/${remove ? "unreblog" : "reblog"}`, { method: "POST" });
}

export async function reactToStatus(ctx: LotideContext, id: string, emoji: string, remove = false) {
  try {
    return await request<UnfathomablyStatus>(ctx, `/api/v1/pleroma/statuses/${encodeURIComponent(id)}/reactions/${encodeURIComponent(emoji)}`, { method: remove ? "DELETE" : "PUT" });
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Emoji reactions are not available on this server.",
    );
  }
}

export function createStatus(ctx: LotideContext, content: string, options: { inReplyToId?: string; quoteId?: string; groupId?: string; visibility?: string } = {}) {
  return request<UnfathomablyStatus>(ctx, "/api/v1/statuses", {
    method: "POST",
    body: JSON.stringify({
      status: content,
      in_reply_to_id: options.inReplyToId,
      quote_id: options.quoteId,
      group_id: options.groupId,
      visibility: options.visibility || (options.groupId ? "unlisted" : "public"),
    }),
  });
}

export async function getGroups(ctx: LotideContext, search = "") {
  try {
    return await request<UnfathomablyGroup[]>(ctx, `/api/v1/groups${query({ q: search })}`);
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Groups are not available on this server.",
    );
  }
}

export async function getGroupStatuses(ctx: LotideContext, id: string, maxId?: string) {
  try {
    return await request<UnfathomablyStatus[]>(ctx, `/api/v1/groups/${encodeURIComponent(id)}/statuses${query({ limit: 30, max_id: maxId })}`);
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Group discussions are not available on this server.",
    );
  }
}

export async function joinGroup(ctx: LotideContext, id: string, leave = false) {
  try {
    return await request(ctx, `/api/v1/groups/${encodeURIComponent(id)}/${leave ? "leave" : "join"}`, { method: "POST" });
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Group membership is not available on this server.",
    );
  }
}

export function getNotifications(ctx: LotideContext, maxId?: string) {
  return request<UnfathomablyNotification[]>(ctx, `/api/v1/notifications${query({ limit: 30, max_id: maxId })}`);
}

export function getAccountStatuses(ctx: LotideContext, id: string, maxId?: string) {
  return request<UnfathomablyStatus[]>(ctx, `/api/v1/accounts/${encodeURIComponent(id)}/statuses${query({ limit: 30, max_id: maxId })}`);
}

/* end of UnfathomablyService.ts */
