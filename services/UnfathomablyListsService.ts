/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyListsService.ts

    Purpose:

        Implement portable Mastodon-compatible account lists and timelines.

    Responsibilities:

        - List, create, update, and delete named account lists
        - Read and change list membership
        - Load a list timeline with bounded pagination
        - Preserve current reply-policy and exclusive-list extensions

    This file intentionally does NOT contain:

        - React list-management state
        - account search
        - home timeline filtering
*/

import { query, request } from "./UnfathomablyService";
import type {
  UnfathomablyAccount,
  UnfathomablyStatus,
} from "./UnfathomablyService";

export type FediverseListRepliesPolicy = "followed" | "list" | "none";

export type FediverseList = {
  exclusive?: boolean;
  id: string;
  replies_policy?: FediverseListRepliesPolicy;
  title: string;
};

export type FediverseListInput = {
  exclusive?: boolean;
  repliesPolicy?: FediverseListRepliesPolicy;
  title: string;
};

function listPayload(input: FediverseListInput) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("Enter a name for this list.");

  return {
    exclusive: input.exclusive === true || undefined,
    replies_policy: input.repliesPolicy || "list",
    title,
  };
}

function rejectsListExtensions(error: unknown): boolean {
  const status = (error as Error & { status?: number })?.status;
  return status === 400 || status === 422;
}

function requestListWithPortableFallback(
  ctx: LotideContext,
  path: string,
  method: "POST" | "PUT",
  payload: ReturnType<typeof listPayload>,
) {
  return request<FediverseList>(ctx, path, {
    method,
    body: JSON.stringify(payload),
  }).catch(error => {
    /*
        Mastodon accepts replies_policy and exclusive, but some Pleroma
        releases reject otherwise valid list requests when either extension
        reaches their parameter caster. Retrying with the common title-only
        contract keeps lists usable without hiding authorization or server
        failures.
    */
    if (!rejectsListExtensions(error)) throw error;
    return request<FediverseList>(ctx, path, {
      method,
      body: JSON.stringify({ title: payload.title }),
    });
  });
}

function normalizedAccountIds(accountIds: string[]): string[] {
  return Array.from(new Set(
    accountIds.map(id => id.trim()).filter(Boolean),
  )).slice(0, 100);
}

export function getLists(ctx: LotideContext) {
  return request<FediverseList[]>(ctx, "/api/v1/lists");
}

export function getList(ctx: LotideContext, id: string) {
  return request<FediverseList>(
    ctx,
    `/api/v1/lists/${encodeURIComponent(id)}`,
  );
}

export function createList(ctx: LotideContext, input: FediverseListInput) {
  const payload = listPayload(input);
  return requestListWithPortableFallback(
    ctx,
    "/api/v1/lists",
    "POST",
    payload,
  );
}

export function updateList(
  ctx: LotideContext,
  id: string,
  input: FediverseListInput,
) {
  const payload = listPayload(input);
  return requestListWithPortableFallback(
    ctx,
    `/api/v1/lists/${encodeURIComponent(id)}`,
    "PUT",
    payload,
  );
}

export function deleteList(ctx: LotideContext, id: string) {
  return request<Record<string, never>>(
    ctx,
    `/api/v1/lists/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function getListAccounts(
  ctx: LotideContext,
  id: string,
  maxId?: string,
) {
  return request<UnfathomablyAccount[]>(
    ctx,
    `/api/v1/lists/${encodeURIComponent(id)}/accounts${query({
      limit: 80,
      max_id: maxId,
    })}`,
  );
}

export function addAccountsToList(
  ctx: LotideContext,
  id: string,
  accountIds: string[],
) {
  const normalized = normalizedAccountIds(accountIds);
  if (normalized.length === 0) {
    return Promise.reject(new Error("Choose at least one account to add."));
  }

  return request<Record<string, never>>(
    ctx,
    `/api/v1/lists/${encodeURIComponent(id)}/accounts`,
    {
      method: "POST",
      body: JSON.stringify({ account_ids: normalized }),
    },
  );
}

export function removeAccountsFromList(
  ctx: LotideContext,
  id: string,
  accountIds: string[],
) {
  const normalized = normalizedAccountIds(accountIds);
  if (normalized.length === 0) {
    return Promise.reject(new Error("Choose at least one account to remove."));
  }

  return request<Record<string, never>>(
    ctx,
    `/api/v1/lists/${encodeURIComponent(id)}/accounts`,
    {
      method: "DELETE",
      body: JSON.stringify({ account_ids: normalized }),
    },
  );
}

export function getListTimeline(
  ctx: LotideContext,
  id: string,
  maxId?: string,
) {
  return request<UnfathomablyStatus[]>(
    ctx,
    `/api/v1/timelines/list/${encodeURIComponent(id)}${query({
      limit: 30,
      max_id: maxId,
    })}`,
  );
}

/* end of UnfathomablyListsService.ts */
