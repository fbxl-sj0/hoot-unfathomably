/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablySourcesService.ts

    Purpose:

        Provide first-class access to Unfathomably feeds and sources.

    Responsibilities:

        - List followed sources and search server-approved sources
        - Load source identity, relationships, and bounded preview items
        - Follow or unfollow a source explicitly
        - Load the combined followed-sources timeline

    This file intentionally does NOT contain:

        - direct RSS, Atom, or ActivityPub network access
        - React state or rendering
        - provider-specific discovery logic
*/

import {
  query,
  request,
  UnfathomablyStatus,
} from "./UnfathomablyService";

const SOURCE_PAGE_SIZE = 24;
const SOURCE_ITEM_LIMIT = 20;
const MAX_SOURCE_TEXT_LENGTH = 2_048;
const UNAVAILABLE_STATUSES = new Set([404, 405, 410, 501]);

export type UnfathomablySourceRelationship = {
  blocked_by?: boolean;
  federation_blocked?: boolean;
  following?: boolean;
  id: string;
  muting?: boolean | null;
  notifying?: boolean | null;
  requested?: boolean;
};

export type UnfathomablySource = {
  acct: string;
  actor_type: string;
  ap_id: string;
  avatar: string;
  capabilities: string[];
  display_name: string;
  domain: string;
  header: string;
  id: string;
  note: string;
  platform: string;
  platform_label: string;
  platform_family: string;
  relationship?: UnfathomablySourceRelationship | null;
  source_kind: string;
  source_kind_label: string;
  uri: string;
  url: string;
  username: string;
};

export type UnfathomablySourceItem = {
  id: string;
  type: string;
  title: string;
  summary?: string;
  url?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  attributedTo?: string;
  published?: string;
  platform: string;
  platformLabel: string;
  sourceKind: string;
  sourceKindLabel: string;
  capabilities: string[];
  status?: UnfathomablyStatus;
};

export type SourceItemsPage = {
  items: UnfathomablySourceItem[];
  next?: string;
  totalItems?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  maxLength = MAX_SOURCE_TEXT_LENGTH,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function stringList(value: unknown, limit = 30): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap(item => {
      const text = boundedString(item, 200);
      return text ? [text] : [];
    })
    .slice(0, limit);
}

function safeHttpUrl(value: unknown): string | undefined {
  const text = boundedString(value);
  if (!text) return undefined;

  try {
    const parsed = new URL(text);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeRelationship(
  value: unknown,
): UnfathomablySourceRelationship | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    blocked_by: value.blocked_by === true,
    federation_blocked: value.federation_blocked === true,
    following: value.following === true,
    muting: typeof value.muting === "boolean" ? value.muting : null,
    notifying:
      typeof value.notifying === "boolean" ? value.notifying : null,
    requested: value.requested === true,
  };
}

function normalizeSource(value: unknown): UnfathomablySource | undefined {
  if (!isRecord(value)) return undefined;
  const id = boundedString(value.id, 200);
  if (!id) return undefined;

  return {
    id,
    acct: boundedString(value.acct, 500) || "",
    actor_type: boundedString(value.actor_type, 120) || "Person",
    ap_id: safeHttpUrl(value.ap_id) || "",
    avatar: safeHttpUrl(value.avatar) || "",
    capabilities: stringList(value.capabilities),
    display_name:
      boundedString(value.display_name, 500) ||
      boundedString(value.username, 300) ||
      "Feed",
    domain: boundedString(value.domain, 255) || "",
    header: safeHttpUrl(value.header) || "",
    note: boundedString(value.note, 4_000) || "",
    platform: boundedString(value.platform, 120) || "unknown",
    platform_label:
      boundedString(value.platform_label, 160) || "Federated feed",
    platform_family: boundedString(value.platform_family, 120) || "generic",
    relationship: normalizeRelationship(value.relationship),
    source_kind: boundedString(value.source_kind, 120) || "actor_feed",
    source_kind_label:
      boundedString(value.source_kind_label, 160) || "Actor feed",
    uri: safeHttpUrl(value.uri) || "",
    url: safeHttpUrl(value.url) || safeHttpUrl(value.ap_id) || "",
    username: boundedString(value.username, 300) || "",
  };
}

function normalizeSourceList(value: unknown): UnfathomablySource[] {
  if (!Array.isArray(value)) {
    throw new Error("The server returned an invalid feed list.");
  }

  return value.flatMap(item => {
    const source = normalizeSource(item);
    return source ? [source] : [];
  });
}

function normalizeSourceItem(value: unknown): UnfathomablySourceItem | undefined {
  if (!isRecord(value)) return undefined;
  const id = boundedString(value.id, 500);
  const title = boundedString(value.title, 500) || "Remote item";
  if (!id) return undefined;

  const status =
    isRecord(value.status) &&
    typeof value.status.id === "string" &&
    isRecord(value.status.account)
      ? value.status as UnfathomablyStatus
      : undefined;

  return {
    id,
    type: boundedString(value.type, 160) || "Object",
    title,
    summary: boundedString(value.summary, 4_000),
    url: safeHttpUrl(value.url),
    mediaUrl: safeHttpUrl(value.media_url),
    mediaType: boundedString(value.media_type, 160),
    thumbnailUrl: safeHttpUrl(value.thumbnail_url),
    attributedTo: boundedString(value.attributed_to, 500),
    published: boundedString(value.published, 100),
    platform: boundedString(value.platform, 120) || "unknown",
    platformLabel:
      boundedString(value.platform_label, 160) || "Federated source",
    sourceKind: boundedString(value.source_kind, 120) || "actor_feed",
    sourceKindLabel:
      boundedString(value.source_kind_label, 160) || "Actor feed",
    capabilities: stringList(value.capabilities),
    status,
  };
}

function normalizeSourceItems(value: unknown): SourceItemsPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("The server returned an invalid feed preview.");
  }

  return {
    items: value.items.flatMap(item => {
      const normalized = normalizeSourceItem(item);
      return normalized ? [normalized] : [];
    }),
    next: safeHttpUrl(value.next),
    totalItems:
      typeof value.total_items === "number" && Number.isFinite(value.total_items)
        ? Math.max(0, Math.trunc(value.total_items))
        : undefined,
  };
}

function rethrowSourcesUnavailable(error: unknown): never {
  const status = (error as Error & { status?: number })?.status;
  if (status && UNAVAILABLE_STATUSES.has(status)) {
    throw new Error("Feeds are not available on this server.");
  }
  throw error;
}

export async function getSources(
  ctx: LotideContext,
  offset = 0,
): Promise<UnfathomablySource[]> {
  try {
    return normalizeSourceList(
      await request<unknown>(
        ctx,
        `/api/v1/feeds${query({
          limit: SOURCE_PAGE_SIZE,
          offset: Math.max(0, Math.trunc(offset)),
        })}`,
      ),
    );
  } catch (error) {
    rethrowSourcesUnavailable(error);
  }
}

export async function searchSources(
  ctx: LotideContext,
  search: string,
  offset = 0,
): Promise<UnfathomablySource[]> {
  const normalizedSearch = search.trim().slice(0, 300);
  if (!normalizedSearch) return [];

  try {
    return normalizeSourceList(
      await request<unknown>(
        ctx,
        `/api/v1/feeds/search${query({
          limit: SOURCE_PAGE_SIZE,
          offset: Math.max(0, Math.trunc(offset)),
          q: normalizedSearch,
        })}`,
      ),
    );
  } catch (error) {
    rethrowSourcesUnavailable(error);
  }
}

export async function getSource(
  ctx: LotideContext,
  id: string,
): Promise<UnfathomablySource> {
  try {
    const source = normalizeSource(
      await request<unknown>(ctx, `/api/v1/feeds/${encodeURIComponent(id)}`),
    );
    if (!source) throw new Error("The server returned an invalid feed.");
    return source;
  } catch (error) {
    rethrowSourcesUnavailable(error);
  }
}

export async function getSourceItems(
  ctx: LotideContext,
  id: string,
): Promise<SourceItemsPage> {
  try {
    return normalizeSourceItems(
      await request<unknown>(
        ctx,
        `/api/v1/feeds/${encodeURIComponent(id)}/items${query({
          limit: SOURCE_ITEM_LIMIT,
        })}`,
      ),
    );
  } catch (error) {
    rethrowSourcesUnavailable(error);
  }
}

export async function setSourceFollowed(
  ctx: LotideContext,
  id: string,
  followed: boolean,
): Promise<UnfathomablySourceRelationship> {
  try {
    const relationship = normalizeRelationship(
      await request<unknown>(
        ctx,
        `/api/v1/feeds/${encodeURIComponent(id)}/${followed ? "follow" : "unfollow"}`,
        { method: "POST" },
      ),
    );
    if (!relationship) {
      throw new Error("The server returned an invalid feed relationship.");
    }
    return relationship;
  } catch (error) {
    rethrowSourcesUnavailable(error);
  }
}

export async function getSourcesTimeline(
  ctx: LotideContext,
  maxId?: string,
): Promise<UnfathomablyStatus[]> {
  try {
    const statuses = await request<unknown>(
      ctx,
      `/api/v1/timelines/feeds${query({ limit: 30, max_id: maxId })}`,
    );
    if (!Array.isArray(statuses)) {
      throw new Error("The server returned an invalid feeds timeline.");
    }
    return statuses.filter(
      (status): status is UnfathomablyStatus =>
        isRecord(status) &&
        typeof status.id === "string" &&
        isRecord(status.account),
    );
  } catch (error) {
    rethrowSourcesUnavailable(error);
  }
}

/* end of UnfathomablySourcesService.ts */
