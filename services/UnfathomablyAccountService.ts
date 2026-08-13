/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyAccountService.ts

    Purpose:

        Provide the portable Mastodon-compatible account workflow boundary.

    Responsibilities:

        - Load accounts, relationships, and connection lists
        - Search for local or federated people through the selected server
        - Apply follow, mute, block, and follow-request decisions
        - Load the signed-in account's saved posts

    This file intentionally does NOT contain:

        - React state or screen navigation
        - Group and Source relationships
        - Direct requests to remote instances
*/

import {
  query,
  request,
  UnfathomablyAccount,
  UnfathomablyAccountRelationship,
  UnfathomablyStatus,
} from "./UnfathomablyService";

const MAX_ACCOUNT_RESULTS = 40;
const UNAVAILABLE_SEARCH_STATUSES = new Set([404, 405, 410, 501]);

type SearchResults = {
  accounts?: UnfathomablyAccount[];
};

function requireAccountId(id: string): string {
  const normalized = id.trim();

  if (!normalized || normalized.length > 512) {
    throw new Error("The server supplied an invalid account identifier.");
  }

  return encodeURIComponent(normalized);
}

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 20;

  return Math.max(1, Math.min(MAX_ACCOUNT_RESULTS, Math.trunc(limit)));
}

export async function getAccount(ctx: LotideContext, id: string) {
  return request<UnfathomablyAccount>(
    ctx,
    `/api/v1/accounts/${requireAccountId(id)}`,
  );
}

export async function getAccountRelationship(
  ctx: LotideContext,
  id: string,
): Promise<UnfathomablyAccountRelationship> {
  const accountId = requireAccountId(id);
  const relationships = await request<UnfathomablyAccountRelationship[]>(
    ctx,
    `/api/v1/accounts/relationships?id%5B%5D=${accountId}`,
  );
  const relationship = relationships.find(item => String(item.id) === id);

  if (!relationship) {
    throw new Error("The server did not return this account relationship.");
  }

  return relationship;
}

export async function setAccountFollowed(
  ctx: LotideContext,
  id: string,
  followed: boolean,
) {
  return request<UnfathomablyAccountRelationship>(
    ctx,
    `/api/v1/accounts/${requireAccountId(id)}/${followed ? "follow" : "unfollow"}`,
    { method: "POST" },
  );
}

export async function setAccountMuted(
  ctx: LotideContext,
  id: string,
  muted: boolean,
) {
  return request<UnfathomablyAccountRelationship>(
    ctx,
    `/api/v1/accounts/${requireAccountId(id)}/${muted ? "mute" : "unmute"}`,
    {
      method: "POST",
      body: muted ? JSON.stringify({ notifications: true }) : undefined,
    },
  );
}

export async function setAccountBlocked(
  ctx: LotideContext,
  id: string,
  blocked: boolean,
) {
  return request<UnfathomablyAccountRelationship>(
    ctx,
    `/api/v1/accounts/${requireAccountId(id)}/${blocked ? "block" : "unblock"}`,
    { method: "POST" },
  );
}

export async function searchAccounts(
  ctx: LotideContext,
  search: string,
  limit = 20,
): Promise<UnfathomablyAccount[]> {
  const normalized = search.trim().slice(0, 256);
  if (!normalized) return [];

  const parameters = {
    limit: boundedLimit(limit),
    q: normalized,
    resolve: true,
  };

  try {
    const result = await request<SearchResults>(
      ctx,
      `/api/v2/search${query({ ...parameters, type: "accounts" })}`,
    );
    return Array.isArray(result.accounts) ? result.accounts : [];
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (!status || !UNAVAILABLE_SEARCH_STATUSES.has(status)) throw error;

    /*
        Older Pleroma and Rebased releases expose only the v1 account search.
        Fallback is limited to explicit route-unavailable responses so an
        authorization or gateway failure is never disguised as no results.
    */
    return request<UnfathomablyAccount[]>(
      ctx,
      `/api/v1/accounts/search${query(parameters)}`,
    );
  }
}

async function getAccountConnections(
  ctx: LotideContext,
  id: string,
  connection: "followers" | "following",
  maxId?: string,
) {
  return request<UnfathomablyAccount[]>(
    ctx,
    `/api/v1/accounts/${requireAccountId(id)}/${connection}${query({
      limit: MAX_ACCOUNT_RESULTS,
      max_id: maxId,
    })}`,
  );
}

export function getAccountFollowers(
  ctx: LotideContext,
  id: string,
  maxId?: string,
) {
  return getAccountConnections(ctx, id, "followers", maxId);
}

export function getAccountFollowing(
  ctx: LotideContext,
  id: string,
  maxId?: string,
) {
  return getAccountConnections(ctx, id, "following", maxId);
}

export function getFollowRequests(ctx: LotideContext, maxId?: string) {
  return request<UnfathomablyAccount[]>(
    ctx,
    `/api/v1/follow_requests${query({ limit: MAX_ACCOUNT_RESULTS, max_id: maxId })}`,
  );
}

export async function resolveFollowRequest(
  ctx: LotideContext,
  id: string,
  accept: boolean,
) {
  return request<UnfathomablyAccountRelationship>(
    ctx,
    `/api/v1/follow_requests/${requireAccountId(id)}/${accept ? "authorize" : "reject"}`,
    { method: "POST" },
  );
}

export function getBookmarks(ctx: LotideContext, maxId?: string) {
  return request<UnfathomablyStatus[]>(
    ctx,
    `/api/v1/bookmarks${query({ limit: 30, max_id: maxId })}`,
  );
}

/* end of UnfathomablyAccountService.ts */
