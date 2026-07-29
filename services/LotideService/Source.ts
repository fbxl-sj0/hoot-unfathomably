/*
    Project: Hoot Mobile
    -------------------

    File: Source.ts

    Purpose:

        Implement Lotide collection target and source-feed endpoints.

    Responsibilities:

        - List remote source feeds when the server exposes the 0.18 API
        - Load source detail and cached source item reader data
        - Follow and unfollow source feeds
        - Apply likes and comments to cached source items

    This file intentionally does NOT contain:

        - React screen state
        - Community endpoint compatibility shims
*/

import { supportsCollectionTargets } from "../../constants/LotideApi";
import { lotideRequest, readJson } from "./util";
import {
  InvalidLotideResponseError,
  normalizeCollectionTarget,
  normalizeCollectionTargetItem,
  normalizeCollectionTargetList,
  normalizeSubmittedId,
  normalizeYourFollow,
} from "./validation";

export type CollectionTargetListOptions = {
  scope?: CollectionTargetScope;
  pageNumber?: number;
  search?: string;
  software?: string;
  sort?: CollectionTargetSort;
};

function requireCollectionTargets(ctx: LotideContext) {
  if (!supportsCollectionTargets(ctx.apiVersion)) {
    throw new Error("This Lotide server does not provide source feeds.");
  }
}

function collectionTargetQuery(
  ctx: LotideContext,
  options: CollectionTargetListOptions,
): string {
  const scope = options.scope || (ctx.login ? "mine" : "everything");
  const params = [
    ["scope", scope],
    ["include_your", ctx.login ? "true" : "false"],
    ["limit", "150"],
    ["page_number", String(Math.max(1, options.pageNumber || 1))],
    ["sort", options.sort || "alphabetic"],
    options.search?.trim() ? ["search", options.search.trim()] : undefined,
    options.software && options.software !== "all"
      ? ["software", options.software]
      : undefined,
  ].filter((value): value is [string, string] => !!value);

  return params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

export async function getCollectionTargets(
  ctx: LotideContext,
  options: CollectionTargetListOptions = {},
): Promise<CollectionTargetList> {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "GET",
    `collection_targets?${collectionTargetQuery(ctx, options)}`,
    undefined,
    !ctx.login,
  )
    .then(readJson)
    .then(normalizeCollectionTargetList);
}

export async function getCollectionTarget(
  ctx: LotideContext,
  collectionTargetId: CollectionTargetId,
): Promise<CollectionTarget> {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "GET",
    `collection_targets/${collectionTargetId}`,
    undefined,
    !ctx.login,
  )
    .then(readJson)
    .then(normalizeCollectionTarget);
}

export async function followCollectionTarget(
  ctx: LotideContext,
  collectionTargetId: CollectionTargetId,
): Promise<CommunityFollow> {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "POST",
    `collection_targets/${collectionTargetId}/follow`,
    { try_wait_for_accept: true },
  )
    .then(readJson)
    .then(data => {
      const follow = normalizeYourFollow(data);

      if (!follow) {
        throw new InvalidLotideResponseError("collection target follow");
      }

      return follow;
    });
}

export async function unfollowCollectionTarget(
  ctx: LotideContext,
  collectionTargetId: CollectionTargetId,
) {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "POST",
    `collection_targets/${collectionTargetId}/unfollow`,
  );
}

export async function getCollectionTargetItem(
  ctx: LotideContext,
  collectionTargetId: CollectionTargetId,
  itemId: CollectionTargetItemId,
): Promise<CollectionTargetItem> {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "GET",
    `collection_targets/${collectionTargetId}/items/${itemId}`,
    undefined,
    !ctx.login,
  )
    .then(readJson)
    .then(normalizeCollectionTargetItem);
}

export async function applyCollectionTargetItemVote(
  ctx: LotideContext,
  collectionTargetId: CollectionTargetId,
  itemId: CollectionTargetItemId,
) {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "PUT",
    `collection_targets/${collectionTargetId}/items/${itemId}/your_vote`,
  );
}

export async function removeCollectionTargetItemVote(
  ctx: LotideContext,
  collectionTargetId: CollectionTargetId,
  itemId: CollectionTargetItemId,
) {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "DELETE",
    `collection_targets/${collectionTargetId}/items/${itemId}/your_vote`,
  );
}

export async function commentOnCollectionTargetItem(
  ctx: LotideContext,
  collectionTargetId: CollectionTargetId,
  itemId: CollectionTargetItemId,
  content: string,
): Promise<{ id: CommentId }> {
  requireCollectionTargets(ctx);

  return lotideRequest(
    ctx,
    "POST",
    `collection_targets/${collectionTargetId}/items/${itemId}/comments`,
    { content_markdown: content },
  )
    .then(readJson)
    .then(data => normalizeSubmittedId(data, "collection target comment"));
}

/* end of Source.ts */
