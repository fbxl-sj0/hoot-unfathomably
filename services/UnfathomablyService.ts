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
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  favourited?: boolean;
  reblogged?: boolean;
  emoji_reactions?: { name: string; count: number; me?: boolean; url?: string }[];
  pleroma?: { emoji_reactions?: { name: string; count: number; me?: boolean; url?: string }[] };
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

type OAuthApp = { client_id: string; client_secret: string };
type OAuthToken = { access_token: string };

export function normalizeServerUrl(value: string): string {
  const candidate = value.trim().replace(/\/+$/, "");
  if (!candidate) return "";
  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

function requireSecureTransport(serverUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new Error("Enter a valid Unfathomably server URL.");
  }

  if (parsed.protocol === "https:") return;

  const localHosts = new Set(["127.0.0.1", "10.0.2.2", "localhost", "::1"]);
  if (parsed.protocol === "http:" && localHosts.has(parsed.hostname.toLowerCase())) return;

  throw new Error("For your account security, remote Unfathomably servers must use HTTPS.");
}

async function request<T>(
  ctx: LotideContext | { apiUrl: string; login?: { token?: string } },
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = normalizeServerUrl(ctx.apiUrl || "");
  if (!base) throw new Error("No Unfathomably server URL selected.");
  requireSecureTransport(base);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = setTimeout(() => controller?.abort(), LOTIDE_REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(ctx.login?.token ? { Authorization: `Bearer ${ctx.login.token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(`${base}${path}`, { ...init, headers, signal: controller?.signal });
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(body || `Unfathomably returned ${response.status}.`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The Unfathomably server did not respond within 30 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
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

export async function getInstance(serverUrl: string): Promise<{ title?: string; version?: string; description?: string }> {
  return request({ apiUrl: serverUrl }, "/api/v1/instance");
}

export async function loginWithPassword(serverUrl: string, username: string, password: string): Promise<{ token: string; account: UnfathomablyAccount }> {
  const app = await request<OAuthApp>({ apiUrl: serverUrl }, "/api/v1/apps", {
    method: "POST",
    body: JSON.stringify({
      client_name: "Hoot Unfathomably",
      redirect_uris: "urn:ietf:wg:oauth:2.0:oob",
      scopes: "read write follow push",
      website: "https://github.com/fbxl-sj0/unfathomably-fe",
    }),
  });
  const form = new URLSearchParams({
    grant_type: "password",
    client_id: app.client_id,
    client_secret: app.client_secret,
    username,
    password,
    scope: "read write follow push",
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
  const statuses = await getHomeTimeline(ctx, maxId, "groups");
  // A group timeline must never silently render ordinary home statuses if an
  // instance returns a malformed aggregate response.
  return statuses.filter(status => !!(status.group || status.reblog?.group));
}

export function getStatus(ctx: LotideContext, id: string) {
  return request<UnfathomablyStatus>(ctx, `/api/v1/statuses/${encodeURIComponent(id)}`);
}

export function getStatusContext(ctx: LotideContext, id: string) {
  return request<{ ancestors: UnfathomablyStatus[]; descendants: UnfathomablyStatus[] }>(ctx, `/api/v1/statuses/${encodeURIComponent(id)}/context`);
}

export function favouriteStatus(ctx: LotideContext, id: string, remove = false) {
  return request<UnfathomablyStatus>(ctx, `/api/v1/statuses/${encodeURIComponent(id)}/${remove ? "unfavourite" : "favourite"}`, { method: "POST" });
}

export function reblogStatus(ctx: LotideContext, id: string, remove = false) {
  return request<UnfathomablyStatus>(ctx, `/api/v1/statuses/${encodeURIComponent(id)}/${remove ? "unreblog" : "reblog"}`, { method: "POST" });
}

export function reactToStatus(ctx: LotideContext, id: string, emoji: string, remove = false) {
  return request<UnfathomablyStatus>(ctx, `/api/v1/pleroma/statuses/${encodeURIComponent(id)}/reactions/${encodeURIComponent(emoji)}`, { method: remove ? "DELETE" : "PUT" });
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

export function getGroups(ctx: LotideContext, search = "") {
  return request<UnfathomablyGroup[]>(ctx, `/api/v1/groups${query({ q: search })}`);
}

export function getGroupStatuses(ctx: LotideContext, id: string, maxId?: string) {
  return request<UnfathomablyStatus[]>(ctx, `/api/v1/groups/${encodeURIComponent(id)}/statuses${query({ limit: 30, max_id: maxId })}`);
}

export function joinGroup(ctx: LotideContext, id: string, leave = false) {
  return request(ctx, `/api/v1/groups/${encodeURIComponent(id)}/${leave ? "leave" : "join"}`, { method: "POST" });
}

export function getNotifications(ctx: LotideContext, maxId?: string) {
  return request<UnfathomablyNotification[]>(ctx, `/api/v1/notifications${query({ limit: 30, max_id: maxId })}`);
}

export function getAccountStatuses(ctx: LotideContext, id: string, maxId?: string) {
  return request<UnfathomablyStatus[]>(ctx, `/api/v1/accounts/${encodeURIComponent(id)}/statuses${query({ limit: 30, max_id: maxId })}`);
}

/* end of UnfathomablyService.ts */
