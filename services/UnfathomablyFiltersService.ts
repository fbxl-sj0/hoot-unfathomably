/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyFiltersService.ts

    Purpose:

        Manage current Mastodon filters with a narrow Pleroma-compatible v1
        fallback for servers that do not implement the v2 filter contract.

    Responsibilities:

        - Normalize v1 and v2 filters into one client model
        - Create, update, and delete warning or hide filters
        - Preserve multiple keywords, expiry, whole-word, and context controls
        - Match legacy warning filters locally when a status has no v2 result

    This file intentionally does NOT contain:

        - filtered-status presentation
        - timeline requests
        - server-family or hostname branching
*/

import { request } from "./UnfathomablyService";
import type { UnfathomablyStatus } from "./UnfathomablyService";

export type FediverseFilterContext =
  | "account"
  | "home"
  | "notifications"
  | "public"
  | "thread";

export type FediverseFilterAction = "hide" | "warn";

export type FediverseFilterKeyword = {
  id?: string;
  keyword: string;
  wholeWord: boolean;
};

export type FediverseFilter = {
  action: FediverseFilterAction;
  apiVersion: 1 | 2;
  contexts: FediverseFilterContext[];
  expiresAt?: string;
  id: string;
  keywords: FediverseFilterKeyword[];
  statuses: string[];
  title: string;
};

export type FediverseFilterInput = {
  action: FediverseFilterAction;
  contexts: FediverseFilterContext[];
  expiresIn?: number;
  keywords: FediverseFilterKeyword[];
  title: string;
};

type FilterV2 = {
  context: FediverseFilterContext[];
  expires_at?: string | null;
  filter_action: FediverseFilterAction;
  id: string;
  keywords: { id: string; keyword: string; whole_word: boolean }[];
  statuses?: { id: string; status_id: string }[];
  title: string;
};

type FilterV1 = {
  context: FediverseFilterContext[];
  expires_at?: string | null;
  id: string;
  irreversible?: boolean;
  phrase: string;
  whole_word?: boolean;
};

const UNAVAILABLE_FILTER_STATUSES = new Set([404, 405, 410, 501]);
const VALID_CONTEXTS = new Set<FediverseFilterContext>([
  "account",
  "home",
  "notifications",
  "public",
  "thread",
]);

function unavailable(error: unknown): boolean {
  const status = (error as Error & { status?: number })?.status;
  return typeof status === "number" && UNAVAILABLE_FILTER_STATUSES.has(status);
}

function normalizeContexts(
  contexts: FediverseFilterContext[],
): FediverseFilterContext[] {
  const normalized = Array.from(new Set(
    contexts.filter(context => VALID_CONTEXTS.has(context)),
  ));
  return normalized.length > 0 ? normalized : ["home"];
}

function normalizeKeywords(
  keywords: FediverseFilterKeyword[],
): FediverseFilterKeyword[] {
  const seen = new Set<string>();
  const normalized: FediverseFilterKeyword[] = [];

  for (const item of keywords) {
    const keyword = item.keyword.trim().slice(0, 500);
    const comparison = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(comparison)) continue;
    seen.add(comparison);
    normalized.push({
      id: item.id,
      keyword,
      wholeWord: item.wholeWord === true,
    });
    if (normalized.length >= 40) break;
  }

  if (normalized.length === 0) {
    throw new Error("Add at least one word or phrase to this filter.");
  }
  return normalized;
}

function normalizeExpiresIn(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(60, Math.min(Math.trunc(value), 31_536_000));
}

function normalizeTitle(title: string, fallback: string): string {
  return title.trim().slice(0, 200) || fallback.slice(0, 200);
}

function fromV2(filter: FilterV2): FediverseFilter {
  return {
    action: filter.filter_action === "hide" ? "hide" : "warn",
    apiVersion: 2,
    contexts: normalizeContexts(filter.context || []),
    expiresAt: filter.expires_at || undefined,
    id: filter.id,
    keywords: (filter.keywords || []).map(keyword => ({
      id: keyword.id,
      keyword: keyword.keyword,
      wholeWord: keyword.whole_word === true,
    })),
    statuses: (filter.statuses || []).map(status => status.status_id),
    title: filter.title || "Filtered content",
  };
}

function fromV1(filter: FilterV1): FediverseFilter {
  return {
    action: filter.irreversible ? "hide" : "warn",
    apiVersion: 1,
    contexts: normalizeContexts(filter.context || []),
    expiresAt: filter.expires_at || undefined,
    id: filter.id,
    keywords: [{
      keyword: filter.phrase,
      wholeWord: filter.whole_word === true,
    }],
    statuses: [],
    title: filter.phrase,
  };
}

function v2Payload(input: FediverseFilterInput) {
  const keywords = normalizeKeywords(input.keywords);
  return {
    context: normalizeContexts(input.contexts),
    expires_in: normalizeExpiresIn(input.expiresIn),
    filter_action: input.action === "hide" ? "hide" : "warn",
    keywords_attributes: keywords.map(keyword => ({
      id: keyword.id,
      keyword: keyword.keyword,
      whole_word: keyword.wholeWord,
    })),
    title: normalizeTitle(input.title, keywords[0].keyword),
  };
}

function v1Payload(input: FediverseFilterInput) {
  const keyword = normalizeKeywords(input.keywords)[0];
  return {
    context: normalizeContexts(input.contexts),
    expires_in: normalizeExpiresIn(input.expiresIn),
    irreversible: input.action === "hide",
    phrase: keyword.keyword,
    whole_word: keyword.wholeWord,
  };
}

export async function getFilters(ctx: LotideContext): Promise<FediverseFilter[]> {
  try {
    const filters = await request<FilterV2[]>(ctx, "/api/v2/filters");
    return filters.map(fromV2);
  } catch (error) {
    if (!unavailable(error)) throw error;
    const filters = await request<FilterV1[]>(ctx, "/api/v1/filters");
    return filters.map(fromV1);
  }
}

export async function createFilter(
  ctx: LotideContext,
  input: FediverseFilterInput,
): Promise<FediverseFilter> {
  try {
    return fromV2(await request<FilterV2>(ctx, "/api/v2/filters", {
      method: "POST",
      body: JSON.stringify(v2Payload(input)),
    }));
  } catch (error) {
    if (!unavailable(error)) throw error;
    return fromV1(await request<FilterV1>(ctx, "/api/v1/filters", {
      method: "POST",
      body: JSON.stringify(v1Payload(input)),
    }));
  }
}

export async function updateFilter(
  ctx: LotideContext,
  filter: FediverseFilter,
  input: FediverseFilterInput,
): Promise<FediverseFilter> {
  if (filter.apiVersion === 1) {
    return fromV1(await request<FilterV1>(
      ctx,
      `/api/v1/filters/${encodeURIComponent(filter.id)}`,
      {
        method: "PUT",
        body: JSON.stringify(v1Payload(input)),
      },
    ));
  }

  const payload = v2Payload(input);
  const retainedIds = new Set(
    payload.keywords_attributes.map(keyword => keyword.id).filter(Boolean),
  );
  const removed = filter.keywords
    .filter(keyword => keyword.id && !retainedIds.has(keyword.id))
    .map(keyword => ({ _destroy: true, id: keyword.id }));

  return fromV2(await request<FilterV2>(
    ctx,
    `/api/v2/filters/${encodeURIComponent(filter.id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...payload,
        keywords_attributes: [
          ...payload.keywords_attributes,
          ...removed,
        ],
      }),
    },
  ));
}

export function deleteFilter(ctx: LotideContext, filter: FediverseFilter) {
  return request<Record<string, never>>(
    ctx,
    `/api/v${filter.apiVersion}/filters/${encodeURIComponent(filter.id)}`,
    { method: "DELETE" },
  );
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchLegacyFilters(
  status: UnfathomablyStatus,
  filters: FediverseFilter[],
  context: FediverseFilterContext,
): FediverseFilter[] {
  const plainText = `${status.spoiler_text}\n${status.content.replace(/<[^>]*>/g, " ")}`;
  const now = Date.now();

  return filters.filter(filter => {
    if (filter.apiVersion !== 1 || !filter.contexts.includes(context)) return false;
    if (filter.expiresAt && Date.parse(filter.expiresAt) <= now) return false;
    return filter.keywords.some(keyword => {
      const escaped = regexEscape(keyword.keyword);
      const pattern = keyword.wholeWord ? `\\b${escaped}\\b` : escaped;
      return new RegExp(pattern, "iu").test(plainText);
    });
  });
}

/* end of UnfathomablyFiltersService.ts */
