/*
    Project: Hoot Mobile
    -------------------

    File: validation.ts

    Purpose:

        Validates and normalizes untrusted Lotide API response payloads
        before the rest of the app uses them.

    Responsibilities:

        • Provide shared runtime type guards for API payloads
        • Normalize paged API responses and skip malformed list items
        • Normalize common Lotide actor, community, post, and comment shapes
        • Produce friendly errors for structurally invalid API responses

    This file intentionally does NOT contain:

        • Fetch or authentication logic
        • React UI state
        • Endpoint-specific request construction
*/

import type { UserThing } from "./User";

/* ------------------------------------------------------------------------- */
/* Errors and Primitive Guards                                               */
/* ------------------------------------------------------------------------- */

export class InvalidLotideResponseError extends Error {
  constructor(context: string) {
    super(`Invalid Lotide API response: ${context}`);
    this.name = "InvalidLotideResponseError";
  }
}

export type Normalizer<T> = (value: unknown) => T;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expectRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidLotideResponseError(context);
  }

  return value;
}

export function expectNumber(
  value: unknown,
  context: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidLotideResponseError(context);
  }

  return value;
}

export function expectString(
  value: unknown,
  context: string,
): string {
  if (typeof value !== "string") {
    throw new InvalidLotideResponseError(context);
  }

  return value;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function optionalFederationStatus(value: unknown): FederationStatus | undefined {
  return value === "unsent" ||
    value === "sent" ||
    value === "received" ||
    value === "posted"
    ? value
    : undefined;
}

export function normalizeVote(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return false;
  }

  return isRecord(value);
}

/* ------------------------------------------------------------------------- */
/* Paged Responses                                                           */
/* ------------------------------------------------------------------------- */

export function normalizePaged<T>(
  value: unknown,
  itemNormalizer: Normalizer<T>,
  context: string,
): Paged<T> {
  const data = expectRecord(value, context);

  if (!Array.isArray(data.items)) {
    throw new InvalidLotideResponseError(`${context}.items`);
  }

  return {
    items: data.items.flatMap(item => {
      try {
        return [itemNormalizer(item)];
      } catch (error) {
        if (error instanceof InvalidLotideResponseError) {
          return [];
        }

        throw error;
      }
    }),
    next_page:
      typeof data.next_page === "string" || data.next_page === null
        ? data.next_page
        : null,
  };
}

/* ------------------------------------------------------------------------- */
/* Shared Lotide Shapes                                                      */
/* ------------------------------------------------------------------------- */

export function normalizeContent(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return {
      content_text: "",
      content_markdown: null,
      content_html: null,
    };
  }

  return {
    content_text:
      typeof value.content_text === "string" ? value.content_text : null,
    content_markdown:
      typeof value.content_markdown === "string" ? value.content_markdown : null,
    content_html:
      typeof value.content_html === "string" ? value.content_html : null,
  };
}

export function normalizeOptionalRecord<T>(
  value: unknown,
  normalizer: Normalizer<T>,
): T | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  try {
    return normalizer(value);
  } catch (error) {
    if (error instanceof InvalidLotideResponseError) {
      return undefined;
    }

    throw error;
  }
}

export function normalizeYourFollow(value: unknown): CommunityFollow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const federationStatus = optionalFederationStatus(value.federation_status);

  return {
    ...value,
    accepted: optionalBoolean(value.accepted) ?? false,
    federation_status: federationStatus,
  };
}

function normalizeVisibilitySuppression(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    server: optionalBoolean(value.server) ?? false,
    user: optionalBoolean(value.user) ?? false,
  };
}

function normalizeCommunityLastPost(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...value,
    id: expectNumber(value.id, "community.last_post.id"),
    title: expectString(value.title, "community.last_post.title"),
    created: optionalString(value.created),
    remote_url: optionalString(value.remote_url),
    sensitive: optionalBoolean(value.sensitive) ?? false,
  };
}

export function normalizeActor(value: unknown): Profile {
  const data = expectRecord(value, "actor");

  return {
    ...data,
    id: expectNumber(data.id, "actor.id"),
    username: expectString(data.username, "actor.username"),
    host: expectString(data.host, "actor.host"),
    avatar: isRecord(data.avatar) && typeof data.avatar.url === "string"
      ? { url: data.avatar.url }
      : undefined,
    local: optionalBoolean(data.local) ?? false,
    is_bot: optionalBoolean(data.is_bot) ?? false,
    remote_url: optionalString(data.remote_url),
  } as Profile;
}

export function normalizeUserProfile(value: unknown): Profile {
  const data = expectRecord(value, "user");
  const actor = normalizeActor(data);

  return {
    ...data,
    ...actor,
    description: normalizeContent(data.description),
    suspended: optionalBoolean(data.suspended),
    your_note: isRecord(data.your_note)
      ? normalizeContent(data.your_note)
      : undefined,
  } as Profile;
}

export function normalizeCommunity(value: unknown): Community {
  const data = expectRecord(value, "community");

  return {
    ...data,
    id: expectNumber(data.id, "community.id"),
    name: expectString(data.name, "community.name"),
    host: expectString(data.host, "community.host"),
    local: optionalBoolean(data.local) ?? false,
    description: normalizeContent(data.description),
    deleted: optionalBoolean(data.deleted) ?? false,
    you_are_moderator: optionalBoolean(data.you_are_moderator),
    your_follow: normalizeYourFollow(data.your_follow),
    last_post: normalizeCommunityLastPost(data.last_post),
    remote_post_count: optionalNumber(data.remote_post_count),
    latest_unfollow_status: optionalFederationStatus(data.latest_unfollow_status),
    visibility_suppression: normalizeVisibilitySuppression(
      data.visibility_suppression,
    ),
    pending_moderation_actions: optionalNumber(data.pending_moderation_actions),
  } as Community;
}

function normalizeCollectionTargetOwner(value: unknown): CollectionTargetOwner {
  if (!isRecord(value)) {
    return {};
  }

  return {
    id: value.id === null ? null : optionalNumber(value.id),
    remote_url:
      value.remote_url === null ? null : optionalString(value.remote_url),
  };
}

function normalizeCollectionTargetPreviewItem(
  value: unknown,
): CollectionTargetPreviewItem {
  const data = expectRecord(value, "collection target preview item");

  return {
    ...data,
    id: expectNumber(data.id, "collection target preview item.id"),
    ap_id: expectString(data.ap_id, "collection target preview item.ap_id"),
    type: data.type === null ? null : optionalString(data.type),
    name: expectString(data.name, "collection target preview item.name"),
    url: data.url === null ? null : optionalString(data.url),
    attributed_to:
      data.attributed_to === null ? null : optionalString(data.attributed_to),
    content_html:
      data.content_html === null ? null : optionalString(data.content_html),
    summary_html:
      data.summary_html === null ? null : optionalString(data.summary_html),
    image_url: data.image_url === null ? null : optionalString(data.image_url),
    published: data.published === null ? null : optionalString(data.published),
    your_vote: data.your_vote === undefined
      ? undefined
      : normalizeVote(data.your_vote),
    federation_status: isRecord(data.your_vote)
      ? optionalFederationStatus(data.your_vote.federation_status)
      : undefined,
  } as CollectionTargetPreviewItem;
}

export function normalizeCollectionTargetList(
  value: unknown,
): CollectionTargetList {
  const data = expectRecord(value, "collection target list");

  if (!Array.isArray(data.items)) {
    throw new InvalidLotideResponseError("collection target list.items");
  }

  return {
    items: data.items.flatMap(item => {
      try {
        return [normalizeCollectionTargetListItem(item)];
      } catch (error) {
        if (error instanceof InvalidLotideResponseError) {
          return [];
        }

        throw error;
      }
    }),
    next_page:
      typeof data.next_page === "string" || data.next_page === null
        ? data.next_page
        : null,
    total_count: optionalNumber(data.total_count) ?? 0,
    scope_total_count: optionalNumber(data.scope_total_count) ?? 0,
    software_counts: Array.isArray(data.software_counts)
      ? data.software_counts.flatMap(value => {
          try {
            const row = expectRecord(value, "collection target software count");
            return [{
              software: expectString(
                row.software,
                "collection target software count.software",
              ),
              count: optionalNumber(row.count) ?? 0,
            }];
          } catch (error) {
            if (error instanceof InvalidLotideResponseError) {
              return [];
            }

            throw error;
          }
        })
      : [],
  };
}

export function normalizeCollectionTargetListItem(
  value: unknown,
): CollectionTargetListItem {
  const data = expectRecord(value, "collection target list item");

  return {
    ...data,
    id: expectNumber(data.id, "collection target list item.id"),
    type: expectString(data.type, "collection target list item.type"),
    software: expectString(data.software, "collection target list item.software"),
    name: expectString(data.name, "collection target list item.name"),
    remote_url: expectString(
      data.remote_url,
      "collection target list item.remote_url",
    ),
    owner: normalizeCollectionTargetOwner(data.owner),
    total_items:
      data.total_items === null ? null : optionalNumber(data.total_items),
    preview_item_count: optionalNumber(data.preview_item_count) ?? 0,
    latest_preview_item:
      data.latest_preview_item === null
        ? null
        : optionalString(data.latest_preview_item),
    latest_preview_published:
      data.latest_preview_published === null
        ? null
        : optionalString(data.latest_preview_published),
    latest_preview_url:
      data.latest_preview_url === null
        ? null
        : optionalString(data.latest_preview_url),
    summary_excerpt:
      data.summary_excerpt === null ? null : optionalString(data.summary_excerpt),
    your_follow: normalizeYourFollow(data.your_follow),
    latest_unfollow_status: optionalFederationStatus(data.latest_unfollow_status),
  } as CollectionTargetListItem;
}

export function normalizeCollectionTarget(value: unknown): CollectionTarget {
  const data = expectRecord(value, "collection target");

  return {
    ...data,
    id: expectNumber(data.id, "collection target.id"),
    type: expectString(data.type, "collection target.type"),
    software: data.software === null ? null : optionalString(data.software),
    name: expectString(data.name, "collection target.name"),
    remote_url: expectString(data.remote_url, "collection target.remote_url"),
    owner: normalizeCollectionTargetOwner(data.owner),
    followers: data.followers === null ? null : optionalString(data.followers),
    first_page: data.first_page === null ? null : optionalString(data.first_page),
    last_page: data.last_page === null ? null : optionalString(data.last_page),
    summary_html:
      data.summary_html === null ? null : optionalString(data.summary_html),
    total_items:
      data.total_items === null ? null : optionalNumber(data.total_items),
    your_follow: normalizeYourFollow(data.your_follow),
    latest_unfollow_status: optionalFederationStatus(data.latest_unfollow_status),
    preview_item_likes_supported:
      optionalBoolean(data.preview_item_likes_supported) ?? true,
    preview_items: Array.isArray(data.preview_items)
      ? data.preview_items.flatMap(item => {
          try {
            return [normalizeCollectionTargetPreviewItem(item)];
          } catch (error) {
            if (error instanceof InvalidLotideResponseError) {
              return [];
            }

            throw error;
          }
        })
      : [],
  } as CollectionTarget;
}

function normalizeCollectionTargetItemCollection(
  value: unknown,
): CollectionTargetItemCollection {
  const data = expectRecord(value, "collection target item collection");

  return {
    ...data,
    id: expectNumber(data.id, "collection target item collection.id"),
    type: expectString(data.type, "collection target item collection.type"),
    software: data.software === null ? null : optionalString(data.software),
    name: expectString(data.name, "collection target item collection.name"),
    remote_url: expectString(
      data.remote_url,
      "collection target item collection.remote_url",
    ),
    owner: normalizeCollectionTargetOwner(data.owner),
    preview_item_likes_supported:
      optionalBoolean(data.preview_item_likes_supported) ?? true,
    preview_item_replies_supported:
      optionalBoolean(data.preview_item_replies_supported) ?? false,
    can_reply: optionalBoolean(data.can_reply) ?? false,
  } as CollectionTargetItemCollection;
}

function normalizeCollectionTargetItemComment(
  value: unknown,
): CollectionTargetItemComment {
  const data = expectRecord(value, "collection target item comment");

  return {
    ...data,
    id: expectNumber(data.id, "collection target item comment.id"),
    remote_url: data.remote_url === null ? null : optionalString(data.remote_url),
    content_text:
      data.content_text === null ? null : optionalString(data.content_text),
    content_markdown:
      data.content_markdown === null
        ? null
        : optionalString(data.content_markdown),
    content_html:
      data.content_html === null ? null : optionalString(data.content_html),
    created:
      optionalString(data.created) || new Date(0).toISOString(),
    local: optionalBoolean(data.local) ?? false,
    author: normalizeOptionalRecord(data.author, normalizeActor),
    sensitive: optionalBoolean(data.sensitive) ?? false,
    federation_status: optionalFederationStatus(data.federation_status),
  } as CollectionTargetItemComment;
}

export function normalizeCollectionTargetItem(
  value: unknown,
): CollectionTargetItem {
  const data = expectRecord(value, "collection target item");

  return {
    collection: normalizeCollectionTargetItemCollection(data.collection),
    item: normalizeCollectionTargetPreviewItem(data.item),
    comments: Array.isArray(data.comments)
      ? data.comments.flatMap(comment => {
          try {
            return [normalizeCollectionTargetItemComment(comment)];
          } catch (error) {
            if (error instanceof InvalidLotideResponseError) {
              return [];
            }

            throw error;
          }
        })
      : [],
  };
}

export function normalizePost(value: unknown): Post {
  const data = expectRecord(value, "post");

  return {
    ...data,
    id: expectNumber(data.id, "post.id"),
    title: expectString(data.title, "post.title"),
    author: normalizeOptionalRecord(data.author, normalizeActor),
    community: normalizeOptionalRecord(data.community, normalizeCommunity),
    created: optionalString(data.created) || new Date(0).toISOString(),
    remote_url: optionalString(data.remote_url),
    content_text:
      typeof data.content_text === "string" ? data.content_text : undefined,
    content_markdown:
      typeof data.content_markdown === "string"
        ? data.content_markdown
        : undefined,
    content_html:
      typeof data.content_html === "string" ? data.content_html : undefined,
    href: optionalString(data.href),
    replies_count_total: optionalNumber(data.replies_count_total) ?? 0,
    score: optionalNumber(data.score) ?? 0,
    sticky: optionalBoolean(data.sticky) ?? false,
    sensitive: optionalBoolean(data.sensitive) ?? false,
    federation_status: optionalFederationStatus(data.federation_status),
    your_vote: normalizeVote(data.your_vote),
  } as Post;
}

export type RawComment = Omit<Omit<Comment, "replies">, "your_vote"> & {
  replies?: Paged<RawComment> | null;
  your_vote?: object | boolean | null;
};

export function normalizeComment(value: unknown): RawComment {
  const data = expectRecord(value, "comment");

  return {
    ...data,
    id: expectNumber(data.id, "comment.id"),
    remote_url: optionalString(data.remote_url),
    content_text:
      typeof data.content_text === "string" ? data.content_text : undefined,
    content_markdown:
      typeof data.content_markdown === "string"
        ? data.content_markdown
        : undefined,
    content_html:
      typeof data.content_html === "string" ? data.content_html : undefined,
    author: normalizeOptionalRecord(data.author, normalizeActor),
    created: optionalString(data.created) || new Date(0).toISOString(),
    deleted: optionalBoolean(data.deleted) ?? false,
    local: optionalBoolean(data.local) ?? false,
    score: optionalNumber(data.score) ?? 0,
    sensitive: optionalBoolean(data.sensitive) ?? false,
    attachments: Array.isArray(data.attachments)
      ? data.attachments.flatMap(attachment =>
          isRecord(attachment) && typeof attachment.url === "string"
            ? [{ url: attachment.url }]
            : [],
        )
      : [],
    federation_status: optionalFederationStatus(data.federation_status),
    replies: isRecord(data.replies)
      ? normalizePaged(data.replies, normalizeComment, "comment.replies")
      : undefined,
    your_vote: data.your_vote,
  } as RawComment;
}

export function normalizePrivateMessage(value: unknown): PrivateMessage {
  const data = expectRecord(value, "private message");

  return {
    ...data,
    id: expectNumber(data.id, "private message.id"),
    author: normalizeActor(data.author),
    recipient: normalizeActor(data.recipient),
    created: optionalString(data.created) || new Date(0).toISOString(),
    local: optionalBoolean(data.local) ?? false,
    remote_url: data.remote_url === null ? null : optionalString(data.remote_url),
    content_text:
      data.content_text === null ? null : optionalString(data.content_text),
    content_markdown:
      data.content_markdown === null
        ? null
        : optionalString(data.content_markdown),
    content_html:
      data.content_html === null ? null : optionalString(data.content_html),
    in_reply_to:
      data.in_reply_to === null ? null : optionalNumber(data.in_reply_to),
    federation_status: optionalFederationStatus(data.federation_status),
    sensitive: optionalBoolean(data.sensitive) ?? false,
  } as PrivateMessage;
}

export function normalizeSubmittedId(
  value: unknown,
  context: string,
): { id: number } {
  const data = expectRecord(value, context);

  return {
    id: expectNumber(data.id, `${context}.id`),
  };
}

export function normalizeBooleanResult(
  value: unknown,
  key: string,
  context: string,
): boolean {
  const data = expectRecord(value, context);

  if (typeof data[key] !== "boolean") {
    throw new InvalidLotideResponseError(`${context}.${key}`);
  }

  return data[key];
}

export function normalizeCommunityFlag(value: unknown) {
  const data = expectRecord(value, "flag");
  const rawContent = isRecord(data.content)
    ? normalizeContent(data.content)
    : undefined;
  const content =
    typeof rawContent === "string"
      ? { content_text: rawContent }
      : rawContent;

  return {
    ...data,
    id: expectNumber(data.id, "flag.id"),
    flagger: normalizeOptionalRecord(data.flagger, normalizeActor),
    created_local: optionalString(data.created_local),
    content,
    type: optionalString(data.type),
    post: isRecord(data.post)
      ? {
          id: expectNumber(data.post.id, "flag.post.id"),
          title: expectString(data.post.title, "flag.post.title"),
        }
      : undefined,
  };
}

export function normalizeUserThing(value: unknown): UserThing {
  const data = expectRecord(value, "user thing");
  const type = expectString(data.type, "user thing.type");

  if (type === "post") {
    return {
      ...normalizePost(data),
      type: "post",
    } as UserThing;
  }

  if (type === "comment") {
    const post = expectRecord(data.post, "user thing.post");

    return {
      ...data,
      type: "comment",
      id: expectNumber(data.id, "user thing.id"),
      content_text:
        typeof data.content_text === "string" ? data.content_text : null,
      content_html:
        typeof data.content_html === "string" ? data.content_html : null,
      created: optionalString(data.created),
      post: {
        id: expectNumber(post.id, "user thing.post.id"),
        title: expectString(post.title, "user thing.post.title"),
        remote_url: optionalString(post.remote_url),
        sensitive: optionalBoolean(post.sensitive),
      },
      remote_url: optionalString(data.remote_url),
      sensitive: optionalBoolean(data.sensitive),
    } as UserThing;
  }

  throw new InvalidLotideResponseError("user thing.type");
}

/* end of validation.ts */
