/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyService.ts

    Purpose:

        Provide the Mastodon-compatible client boundary used by the mobile app.

    Responsibilities:

        - Validate server addresses and execute bounded authenticated requests
        - Model shared Mastodon, Pleroma, Akkoma, Rebased, and Unfathomably APIs
        - Isolate optional extension fallbacks at their API boundaries

    This file intentionally does NOT contain:

        - React state
        - screen rendering
        - direct federation or provider requests
*/

import { LOTIDE_REQUEST_TIMEOUT_MS } from "./LotideService/util";

export type UnfathomablyAccount = {
  id: string;
  username: string;
  acct: string;
  display_name: string;
  avatar: string;
  avatar_static?: string;
  bot?: boolean;
  created_at?: string;
  discoverable?: boolean;
  fields?: { name: string; value: string; verified_at?: string | null }[];
  followers_count?: number;
  following_count?: number;
  header?: string;
  header_static?: string;
  locked?: boolean;
  note: string;
  statuses_count?: number;
  url: string;
  pleroma?: {
    relationship?: UnfathomablyAccountRelationship | null;
  };
};

export type UnfathomablyAccountRelationship = {
  id: string;
  blocked_by?: boolean;
  blocking: boolean;
  domain_blocking?: boolean;
  endorsed?: boolean;
  followed_by: boolean;
  following: boolean;
  muting: boolean;
  muting_notifications?: boolean;
  note?: string;
  notifying?: boolean;
  requested: boolean;
  showing_reblogs?: boolean;
  subscribing?: boolean;
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
  moderators_count?: number;
  statuses_count?: number;
  locked: boolean;
  platform?: string;
  platform_label?: string;
  platform_family?: string;
  target_kind?: string;
  target_kind_label?: string;
  capabilities?: string[];
  relationship?: {
    member?: boolean;
    requested?: boolean;
    role?: string;
    can_follow?: boolean;
    can_post?: boolean;
    federation_blocked?: boolean;
    moderation_message?: string | null;
    moderation_status?: string;
  } | null;
};

export type UnfathomablyNativeFieldValue =
  | string
  | number
  | boolean
  | string[];

export type UnfathomablyNativePresentation = {
  canonical_id: string;
  class: string;
  context?: string | null;
  controls: string[];
  fields: Record<string, UnfathomablyNativeFieldValue>;
  type: string;
};

export type UnfathomablyPollOption = {
  title: string;
  votes_count?: number | null;
};

export type UnfathomablyPoll = {
  id: string;
  expires_at?: string | null;
  expired: boolean;
  multiple: boolean;
  votes_count: number;
  voters_count?: number | null;
  voted?: boolean;
  own_votes?: number[];
  options: UnfathomablyPollOption[];
};

export type UnfathomablyPreviewCard = {
  type?: "link" | "photo" | "video" | "rich" | string;
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  image_description?: string | null;
  provider_name?: string | null;
  provider_url?: string | null;
  width?: number;
  height?: number;
};

export type UnfathomablyMediaAttachment = {
  id: string;
  type: string;
  description?: string | null;
  preview_url?: string;
  url: string;
  remote_url?: string | null;
  text_url?: string | null;
  meta?: {
    original?: { width?: number; height?: number; duration?: number };
    small?: { width?: number; height?: number };
  } | null;
};

export type MediaUploadInput = {
  description?: string;
  focus?: string;
  mimeType?: string;
  name?: string;
  uri: string;
};

export type UnfathomablyEvent = {
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  join_mode?: "free" | "restricted" | "invite" | null;
  participants_count: number;
  location?: {
    name?: string | null;
    description?: string | null;
    country?: string | null;
    locality?: string | null;
    postal_code?: string | null;
    region?: string | null;
    street?: string | null;
  } | null;
  join_state?: "pending" | "reject" | "accept" | null;
  banner?: UnfathomablyMediaAttachment | null;
  links?: UnfathomablyMediaAttachment[] | null;
};

export type UnfathomablyStatus = {
  id: string;
  created_at: string;
  edited_at?: string | null;
  content: string;
  uri?: string;
  url?: string;
  in_reply_to_id?: string | null;
  in_reply_to_account_id?: string | null;
  quote_id?: string | null;
  quote?:
    | UnfathomablyStatus
    | {
        state?: string;
        quoted_status?: UnfathomablyStatus | null;
      }
    | null;
  quote_approval?: {
    automatic?: string[];
    current_user?: string;
    manual?: string[];
  } | null;
  quotes_count?: number;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  dislikes_count?: number;
  favourited?: boolean;
  disliked?: boolean;
  reblogged?: boolean;
  bookmarked?: boolean;
  filtered?: {
    filter: {
      context?: string[];
      filter_action?: "hide" | "warn" | string;
      id: string;
      title: string;
    };
    keyword_matches?: string[] | null;
    status_matches?: string[] | null;
  }[] | null;
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
    native?: UnfathomablyNativePresentation | null;
    event?: UnfathomablyEvent | null;
    nostr?: { event_id?: string; pubkey?: string; relay?: string } | null;
    atproto?: { uri?: string; cid?: string; url?: string | null } | null;
    diaspora?: { guid?: string; author?: string } | null;
  };
  sensitive: boolean;
  spoiler_text: string;
  visibility?: string;
  account: UnfathomablyAccount;
  card?: UnfathomablyPreviewCard | null;
  group?: UnfathomablyGroup | null;
  media_attachments: UnfathomablyMediaAttachment[];
  poll?: UnfathomablyPoll | null;
  reblog?: UnfathomablyStatus | null;
};

export type UnfathomablyNotification = {
  id: string;
  type: string;
  created_at: string;
  account: UnfathomablyAccount;
  status?: UnfathomablyStatus;
  target?: UnfathomablyAccount;
  emoji?: string;
  emoji_url?: string;
};

export type UnfathomablyNotificationGroup = {
  group_key: string;
  latest_page_notification_at?: string;
  most_recent_notification_id: string;
  notifications_count: number;
  page_max_id?: string;
  page_min_id?: string;
  sample_account_ids: string[];
  status_id?: string;
  type: string;
};

export type UnfathomablyGroupedNotifications = {
  accounts: UnfathomablyAccount[];
  notification_groups: UnfathomablyNotificationGroup[];
  statuses: UnfathomablyStatus[];
};

export type UnfathomablyStatusSource = {
  id: string;
  spoiler_text: string;
  text: string;
};

export type UnfathomablyScheduledStatus = {
  id: string;
  media_attachments: UnfathomablyMediaAttachment[];
  params: {
    in_reply_to_id?: string | null;
    media_ids?: string[] | null;
    poll?: {
      expires_in: number;
      multiple: boolean;
      options: string[];
    } | null;
    scheduled_at?: string | null;
    sensitive?: boolean;
    spoiler_text?: string | null;
    text: string;
    visibility?: string;
  };
  scheduled_at: string;
};

export type UnfathomablyInstance = {
  title?: string;
  version?: string;
  description?: string;
  configuration?: {
    urls?: {
      streaming?: string;
    };
  };
  urls?: {
    streaming_api?: string;
  };
  pleroma?: {
    metadata?: {
      features?: string[];
    };
  };
  unfathomably?: {
    backend?: string;
    frontend?: string;
  };
};

export type FediverseServerFamily =
  | "akkoma"
  | "mastodon"
  | "pleroma"
  | "rebased"
  | "unfathomably"
  | "unknown";

export type FediverseSoftwareIdentity = {
  family: FediverseServerFamily;
  name: string;
  version: string;
};

export type InstanceCapabilities = {
  dislikes: boolean;
  emojiReactions: boolean;
  events: boolean;
  groupedNotifications: boolean;
  groupDiscovery: boolean;
  groupSearch: boolean;
  groups: boolean;
  quotes: boolean;
  sources: boolean;
  worlds: boolean;
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

export type QuoteParameter = "quote_id" | "quoted_status_id";

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
    throw new Error("No Fediverse server URL selected.");
  }

  const supported = getSupportedServerUrl(value);
  if (supported) return supported;

  const parsed = parseServerInput(value);
  if (parsed?.protocol === "http:") {
    throw new Error(
      "For your account security, remote Fediverse servers must use HTTPS.",
    );
  }

  throw new Error("Enter a valid Fediverse server URL.");
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
  return `The selected server returned ${status}${reason ? ` (${reason})` : ""}.`;
}

/*
    Feature modules share this guarded request boundary so authentication,
    HTTPS enforcement, timeout behavior, and server error handling cannot
    drift between ordinary timelines and newer Unfathomably extensions.
*/
export async function request<T>(
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
    `The selected server did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`,
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

export function query(
  params: Record<string, string | number | boolean | undefined>,
): string {
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
  const mastodonQuoteDenied = status.quote_approval?.current_user === "denied";

  return {
    dislike:
      typeof status.disliked === "boolean" ||
      typeof status.dislikes_count === "number",
    emojiReactions:
      Array.isArray(status.emoji_reactions) ||
      Array.isArray(status.pleroma?.emoji_reactions),
    quote:
      !mastodonQuoteDenied && (
        status.quote !== undefined ||
        status.quote_id !== undefined ||
        status.quote_approval !== undefined ||
        status.quotes_count !== undefined ||
        status.pleroma?.quote !== undefined ||
        status.pleroma?.quote_id !== undefined ||
        status.pleroma?.quote_visible !== undefined ||
        status.pleroma?.quotes_count !== undefined
      ),
  };
}

export function getQuoteParameter(
  status: UnfathomablyStatus,
): QuoteParameter {
  return status.quote_approval !== undefined
    ? "quoted_status_id"
    : "quote_id";
}

export function getQuotedStatus(
  status: UnfathomablyStatus,
): UnfathomablyStatus | undefined {
  const topLevelQuote = status.quote;
  if (topLevelQuote && "id" in topLevelQuote) return topLevelQuote;
  if (topLevelQuote?.quoted_status) return topLevelQuote.quoted_status;

  return status.pleroma?.quote || undefined;
}

function rethrowUnavailableFeature(error: unknown, message: string): never {
  const status = (error as Error & { status?: number })?.status;
  if (status && [404, 405, 410, 501].includes(status)) {
    throw new Error(message);
  }
  throw error;
}

export async function getInstance(serverUrl: string): Promise<UnfathomablyInstance> {
  return request({ apiUrl: serverUrl }, "/api/v1/instance");
}

export function getInstanceSoftware(
  instance: UnfathomablyInstance,
): FediverseSoftwareIdentity {
  const advertisedVersion = instance.version?.trim() || "Mastodon API";
  const compatible = advertisedVersion.match(
    /^([^\s(]+)(?:\s+\(compatible;\s*([^\s)]+)\s+([^)]*)\))?/i,
  );
  const backendName = compatible?.[2] || "";
  const backendVersion = compatible?.[3]?.trim() || advertisedVersion;
  const features = new Set(
    instance.pleroma?.metadata?.features?.filter(
      (feature): feature is string => typeof feature === "string",
    ) || [],
  );
  const identity = [
    backendName,
    backendVersion,
    instance.unfathomably?.backend || "",
  ].join(" ");

  if (/unfathomably/i.test(identity)) {
    return {
      family: "unfathomably",
      name: "Unfathomably",
      version: backendVersion,
    };
  }
  if (/akkoma/i.test(identity) || features.has("akkoma_api")) {
    return { family: "akkoma", name: "Akkoma", version: backendVersion };
  }
  if (/rebased/i.test(identity) || /\+soapbox\b/i.test(backendVersion)) {
    return { family: "rebased", name: "Rebased", version: backendVersion };
  }
  if (/pleroma/i.test(identity) || features.has("pleroma_api")) {
    return { family: "pleroma", name: "Pleroma", version: backendVersion };
  }
  if (/^\d+\.\d+(?:\.\d+)?(?:[-+].*)?$/i.test(advertisedVersion)) {
    return {
      family: "mastodon",
      name: "Mastodon",
      version: advertisedVersion,
    };
  }

  return { family: "unknown", name: backendName || "Fediverse", version: backendVersion };
}

export function getInstanceCapabilities(
  instance: UnfathomablyInstance,
): InstanceCapabilities {
  const features = new Set(
    Array.isArray(instance.pleroma?.metadata?.features)
      ? instance.pleroma.metadata.features.filter(
          (feature): feature is string => typeof feature === "string",
        )
      : [],
  );
  const isUnfathomably =
    typeof instance.unfathomably?.backend === "string" ||
    /unfathomably/i.test(instance.version || "");

  return {
    dislikes: features.has("pleroma_dislikes"),
    emojiReactions:
      features.has("pleroma_emoji_reactions") ||
      features.has("pleroma_custom_emoji_reactions") ||
      features.has("custom_emoji_reactions"),
    events: features.has("events"),
    groupedNotifications: features.has("notifications_v2"),
    groupDiscovery: features.has("groups_discovery"),
    groupSearch: features.has("groups_search"),
    groups: features.has("groups"),
    quotes: features.has("quote_posting"),
    sources: features.has("sources"),
    worlds: isUnfathomably,
  };
}

/*
    Some Pleroma-family servers implement application registration as a
    lookup followed by an insert without a database uniqueness constraint.
    Coalescing identical in-flight requests prevents simultaneous account
    logins from creating duplicate client records and breaking later logins.
    Completed registrations are not retained, so client secrets remain only
    as long as their immediate authorization flow needs them.
*/
const pendingOAuthRegistrations = new Map<string, Promise<OAuthApplication>>();

export async function registerOAuthApplication(
  serverUrl: string,
  redirectUri: string,
): Promise<OAuthApplication> {
  const normalizedRedirectUri = redirectUri.trim();
  if (!normalizedRedirectUri) {
    throw new Error("Cannot start server login without a redirect URI.");
  }

  const normalizedServerUrl = requireSupportedServerUrl(serverUrl);
  const registrationKey = `${normalizedServerUrl}\n${normalizedRedirectUri}`;
  const existing = pendingOAuthRegistrations.get(registrationKey);
  if (existing) return existing;

  const pending = request<OAuthApplication>(
    { apiUrl: normalizedServerUrl },
    "/api/v1/apps",
    {
      method: "POST",
      body: JSON.stringify({
        client_name: "Hoot Unfathomably",
        redirect_uris: normalizedRedirectUri,
        scopes: OAUTH_SCOPES,
        website: "https://github.com/fbxl-sj0/hoot-unfathomably",
      }),
    },
  );
  pendingOAuthRegistrations.set(registrationKey, pending);

  try {
    return await pending;
  } finally {
    if (pendingOAuthRegistrations.get(registrationKey) === pending) {
      pendingOAuthRegistrations.delete(registrationKey);
    }
  }
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

export async function getGroupTimeline(
  ctx: LotideContext,
  maxId?: string,
  discover = false,
) {
  try {
    const statuses = await request<UnfathomablyStatus[]>(
      ctx,
      `/api/v1/timelines/groups${query({
        limit: 30,
        max_id: maxId,
        discover: discover || undefined,
      })}`,
    );
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

function mediaUploadForm(input: MediaUploadInput): FormData {
  const uri = input.uri.trim();
  if (!uri || uri.length > 4_096) {
    throw new Error("The selected media file is unavailable.");
  }
  const form = new FormData();
  form.append("file", {
    name: input.name?.trim().slice(0, 500) || "upload.jpg",
    type: input.mimeType?.trim().slice(0, 200) || "image/jpeg",
    uri,
  } as unknown as Blob);
  if (input.description?.trim()) {
    form.append("description", input.description.trim().slice(0, 1_500));
  }
  if (input.focus?.trim()) {
    form.append("focus", input.focus.trim().slice(0, 100));
  }
  return form;
}

export async function uploadMedia(
  ctx: LotideContext,
  input: MediaUploadInput,
): Promise<UnfathomablyMediaAttachment> {
  try {
    return await request<UnfathomablyMediaAttachment>(ctx, "/api/v2/media", {
      body: mediaUploadForm(input),
      method: "POST",
    });
  } catch (error) {
    const status = (error as Error & { status?: number })?.status;
    if (!status || ![404, 405, 410, 501].includes(status)) throw error;

    /* Pleroma and older Mastodon-compatible servers expose uploads at v1. */
    return request<UnfathomablyMediaAttachment>(ctx, "/api/v1/media", {
      body: mediaUploadForm(input),
      method: "POST",
    });
  }
}

export function updateMediaDescription(
  ctx: LotideContext,
  id: string,
  description: string,
) {
  return request<UnfathomablyMediaAttachment>(
    ctx,
    `/api/v1/media/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify({ description: description.trim().slice(0, 1_500) }),
      method: "PUT",
    },
  );
}

export async function resolveStatusByUrl(
  ctx: LotideContext,
  statusUrl: string,
): Promise<UnfathomablyStatus> {
  const normalizedUrl = statusUrl.trim();
  let parsed: URL;

  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error("This post does not have a valid federated address.");
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    normalizedUrl.length > 4_096
  ) {
    throw new Error("This post does not have a safe federated address.");
  }

  const parameters = query({
    limit: 5,
    q: normalizedUrl,
    resolve: true,
    type: "statuses",
  });
  let result: { statuses?: UnfathomablyStatus[] };

  try {
    result = await request<{ statuses?: UnfathomablyStatus[] }>(
      ctx,
      `/api/v2/search${parameters}`,
    );
  } catch (error) {
    const status = (error as Error & { status?: number })?.status;
    if (!status || ![404, 405, 410, 501].includes(status)) throw error;

    /*
        Older Pleroma-family servers expose the same search shape under v1.
        Only endpoint-unavailable responses trigger this compatibility path.
    */
    result = await request<{ statuses?: UnfathomablyStatus[] }>(
      ctx,
      `/api/v1/search${parameters}`,
    );
  }

  const exact = result.statuses?.find(
    status => status.uri === normalizedUrl || status.url === normalizedUrl,
  );
  const resolved = exact || result.statuses?.[0];
  if (!resolved) {
    throw new Error("This account's server could not resolve the post.");
  }

  return resolved;
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

  throw new Error("The selected server returned an incomplete discussion.");
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

export function bookmarkStatus(
  ctx: LotideContext,
  id: string,
  remove = false,
) {
  return request<UnfathomablyStatus>(
    ctx,
    `/api/v1/statuses/${encodeURIComponent(id)}/${remove ? "unbookmark" : "bookmark"}`,
    { method: "POST" },
  );
}

export function deleteStatus(ctx: LotideContext, id: string) {
  return request<UnfathomablyStatus>(
    ctx,
    `/api/v1/statuses/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
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

export function voteOnPoll(
  ctx: LotideContext,
  id: string,
  choices: number[],
) {
  const validChoices = Array.from(
    new Set(
      choices.filter(
        choice => Number.isInteger(choice) && choice >= 0 && choice <= 99,
      ),
    ),
  );

  if (validChoices.length === 0) {
    return Promise.reject(new Error("Choose at least one poll option."));
  }

  return request<UnfathomablyPoll>(
    ctx,
    `/api/v1/polls/${encodeURIComponent(id)}/votes`,
    {
      method: "POST",
      body: JSON.stringify({ choices: validChoices }),
    },
  );
}

export async function setEventJoined(
  ctx: LotideContext,
  id: string,
  joined: boolean,
) {
  try {
    return await request<UnfathomablyStatus>(
      ctx,
      `/api/v1/pleroma/events/${encodeURIComponent(id)}/${joined ? "join" : "leave"}`,
      { method: "POST" },
    );
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Event participation is not available on this server.",
    );
  }
}

export type CreateStatusOptions = {
  contentWarning?: string;
  groupId?: string;
  idempotencyKey?: string;
  inReplyToId?: string;
  language?: string;
  mediaIds?: string[];
  poll?: {
    expiresIn: number;
    multiple: boolean;
    options: string[];
  };
  quoteId?: string;
  quoteParameter?: QuoteParameter;
  scheduledAt?: string;
  sensitive?: boolean;
  visibility?: string;
};

export type UpdateStatusOptions = Pick<
  CreateStatusOptions,
  "contentWarning" | "language" | "mediaIds" | "poll" | "sensitive"
>;

const MINIMUM_SCHEDULE_DELAY_MS = 5 * 60 * 1_000;

export function normalizeScheduledAt(
  value: string,
  now = Date.now(),
): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error("Choose a valid date and time for this scheduled post.");
  }
  if (timestamp < now + MINIMUM_SCHEDULE_DELAY_MS) {
    throw new Error("Scheduled posts must be at least five minutes in the future.");
  }

  return new Date(timestamp).toISOString();
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  const key = value?.trim().slice(0, 255);
  return key || undefined;
}

function normalizeMediaIds(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;

  const ids = Array.from(new Set(
    value.map(id => id.trim()).filter(Boolean),
  )).slice(0, 4);
  return ids.length > 0 ? ids : undefined;
}

function createPollPayload(options: CreateStatusOptions) {
  const pollOptions = options.poll?.options
    .map(option => option.trim())
    .filter(Boolean)
    .slice(0, 4);
  return pollOptions && pollOptions.length >= 2
    ? {
        expires_in: Math.max(
          300,
          Math.min(Math.trunc(options.poll?.expiresIn || 86_400), 2_592_000),
        ),
        multiple: options.poll?.multiple === true,
        options: pollOptions,
      }
    : undefined;
}

export function createStatus(
  ctx: LotideContext,
  content: string,
  options: CreateStatusOptions = {},
) {
  const poll = createPollPayload(options);

  const quote = options.quoteId
    ? { [options.quoteParameter || "quote_id"]: options.quoteId }
    : {};

  const scheduledAt = options.scheduledAt
    ? normalizeScheduledAt(options.scheduledAt)
    : undefined;
  const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);

  return request<UnfathomablyStatus | UnfathomablyScheduledStatus>(ctx, "/api/v1/statuses", {
    method: "POST",
    headers: idempotencyKey
      ? { "Idempotency-Key": idempotencyKey }
      : undefined,
    body: JSON.stringify({
      status: content,
      in_reply_to_id: options.inReplyToId,
      ...quote,
      group_id: options.groupId,
      language: options.language?.trim() || undefined,
      media_ids: normalizeMediaIds(options.mediaIds),
      poll,
      scheduled_at: scheduledAt,
      sensitive: options.sensitive === true || undefined,
      spoiler_text: options.contentWarning?.trim() || undefined,
      visibility: options.visibility || (options.groupId ? "unlisted" : "public"),
    }),
  });
}

export function getStatusSource(ctx: LotideContext, id: string) {
  return request<UnfathomablyStatusSource>(
    ctx,
    `/api/v1/statuses/${encodeURIComponent(id)}/source`,
  );
}

export function updateStatus(
  ctx: LotideContext,
  id: string,
  content: string,
  options: UpdateStatusOptions = {},
) {
  return request<UnfathomablyStatus>(
    ctx,
    `/api/v1/statuses/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        language: options.language?.trim() || undefined,
        media_ids: normalizeMediaIds(options.mediaIds),
        poll: createPollPayload(options),
        sensitive: options.sensitive === true || undefined,
        spoiler_text: options.contentWarning?.trim() || undefined,
        status: content,
      }),
    },
  );
}

export function getScheduledStatuses(ctx: LotideContext, maxId?: string) {
  return request<UnfathomablyScheduledStatus[]>(
    ctx,
    `/api/v1/scheduled_statuses${query({ limit: 40, max_id: maxId })}`,
  );
}

export function getScheduledStatus(ctx: LotideContext, id: string) {
  return request<UnfathomablyScheduledStatus>(
    ctx,
    `/api/v1/scheduled_statuses/${encodeURIComponent(id)}`,
  );
}

export function updateScheduledStatus(
  ctx: LotideContext,
  id: string,
  scheduledAt: string,
) {
  return request<UnfathomablyScheduledStatus>(
    ctx,
    `/api/v1/scheduled_statuses/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        scheduled_at: normalizeScheduledAt(scheduledAt),
      }),
    },
  );
}

export function cancelScheduledStatus(ctx: LotideContext, id: string) {
  return request<UnfathomablyScheduledStatus>(
    ctx,
    `/api/v1/scheduled_statuses/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function getGroups(ctx: LotideContext, search = "") {
  try {
    const normalizedSearch = search.trim();
    if (!normalizedSearch) {
      return await request<UnfathomablyGroup[]>(ctx, "/api/v1/groups");
    }

    try {
      return await request<UnfathomablyGroup[]>(
        ctx,
        `/api/v1/groups/search${query({ q: normalizedSearch })}`,
      );
    } catch (error) {
      const status = (error as Error & { status?: number })?.status;
      if (!status || ![404, 405, 410, 501].includes(status)) throw error;

      /*
          Older Rebased group implementations search through GET /groups?q=.
          Keep that fallback isolated to the explicit unavailable statuses so
          gateway and authorization failures are never hidden by a retry.
      */
      return await request<UnfathomablyGroup[]>(
        ctx,
        `/api/v1/groups${query({ q: normalizedSearch })}`,
      );
    }
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Groups are not available on this server.",
    );
  }
}

export async function getGroup(ctx: LotideContext, id: string) {
  try {
    return await request<UnfathomablyGroup>(
      ctx,
      `/api/v1/groups/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    const status = (error as Error & { status?: number })?.status;
    if (status && [404, 405, 410, 501].includes(status)) {
      /*
          Early Rebased group APIs exposed only the collection route. The
          detail screen can still operate in a reduced mode when that older
          collection includes the selected group.
      */
      const groups = await getGroups(ctx);
      const group = groups.find(item => item.id === id);
      if (group) return group;
    }
    rethrowUnavailableFeature(
      error,
      "Group details are not available on this server.",
    );
  }
}

export async function getDiscoverableGroups(ctx: LotideContext) {
  try {
    return await request<UnfathomablyGroup[]>(
      ctx,
      `/api/v1/groups/discover${query({ limit: 50 })}`,
    );
  } catch (error) {
    rethrowUnavailableFeature(
      error,
      "Group discovery is not available on this server.",
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

export async function getGroupedNotifications(
  ctx: LotideContext,
  maxId?: string,
): Promise<UnfathomablyGroupedNotifications | undefined> {
  try {
    return await request<UnfathomablyGroupedNotifications>(
      ctx,
      `/api/v2/notifications${query({ limit: 30, max_id: maxId })}`,
    );
  } catch (error) {
    const status = (error as Error & { status?: number })?.status;
    if (status && [404, 405, 410, 501].includes(status)) return undefined;
    throw error;
  }
}

export function dismissGroupedNotification(
  ctx: LotideContext,
  groupKey: string,
) {
  return request<Record<string, never>>(
    ctx,
    `/api/v2/notifications/${encodeURIComponent(groupKey)}/dismiss`,
    { method: "POST" },
  );
}

export function getAccountStatuses(ctx: LotideContext, id: string, maxId?: string) {
  return request<UnfathomablyStatus[]>(ctx, `/api/v1/accounts/${encodeURIComponent(id)}/statuses${query({ limit: 30, max_id: maxId })}`);
}

/* end of UnfathomablyService.ts */
