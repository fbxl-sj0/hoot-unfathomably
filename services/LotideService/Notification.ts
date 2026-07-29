/*
    Project: Hoot Mobile
    -------------------

    File: Notification.ts

    Purpose:

        Normalize Lotide notification payloads.

    Responsibilities:

        - Load user notifications
        - Support reply, mention, and follow notification shapes
        - Skip malformed notification rows safely

    This file intentionally does NOT contain:

        - local notification scheduling
        - screen rendering
*/

import { transformComment } from "./Comment";
import { transformVote } from "./Post";
import {
  supportsPrivateMessages,
  supportsUserFollowNotifications,
} from "../../constants/LotideApi";
import { lotideRequest, readJson } from "./util";
import {
  expectNumber,
  InvalidLotideResponseError,
  isRecord,
  normalizeActor,
  normalizeComment,
  normalizePrivateMessage,
  normalizePost,
} from "./validation";

function normalizeEmbeddedPost(value: unknown): Post | undefined {
  if (!isRecord(value)) return undefined;

  try {
    return transformVote(normalizePost(value));
  } catch (error) {
    if (error instanceof InvalidLotideResponseError) return undefined;
    throw error;
  }
}

function normalizeEmbeddedPrivateMessage(
  value: unknown,
): PrivateMessage | undefined {
  if (!isRecord(value)) return undefined;

  try {
    return normalizePrivateMessage(value);
  } catch (error) {
    if (error instanceof InvalidLotideResponseError) return undefined;
    throw error;
  }
}

function normalizeEmbeddedComment(value: unknown): Comment | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.content_text !== "string" &&
    typeof value.content_markdown !== "string" &&
    typeof value.content_html !== "string" &&
    typeof value.created !== "string" &&
    !isRecord(value.author)
  ) {
    return undefined;
  }

  try {
    const [comment] = transformComment(normalizeComment(value));
    return comment;
  } catch (error) {
    if (error instanceof InvalidLotideResponseError) return undefined;
    throw error;
  }
}

export async function getNotifications(
  ctx: LotideContext,
): Promise<FullNotification[]> {
  return lotideRequest(ctx, "GET", "users/~me/notifications")
    .then(readJson)
    .then(data => normalizeNotificationList(data, ctx.apiVersion ?? 0));
}

export function transformToFullNotification(
  notification: unknown,
  apiVersion = 0,
): FullNotification | undefined {
  if (!isRecord(notification)) {
    return undefined;
  }

  const type = typeof notification.type === "string"
    ? notification.type
    : undefined;
  const post = isRecord(notification.post) ? notification.post : undefined;
  const reply = isRecord(notification.reply) ? notification.reply : undefined;
  const comment = isRecord(notification.comment)
    ? notification.comment
    : undefined;
  const user = isRecord(notification.user) ? notification.user : undefined;
  const message = isRecord(notification.message)
    ? notification.message
    : undefined;
  const postSnapshot = normalizeEmbeddedPost(post);
  const replySnapshot = normalizeEmbeddedComment(reply);
  const commentSnapshot = normalizeEmbeddedComment(comment);
  const privateMessageSnapshot = normalizeEmbeddedPrivateMessage(message);

  if (type === "post_reply" && post && reply) {
    return {
      unseen: notification.unseen === true,
      notificationType: "post_reply",
      commentId: expectNumber(reply.id, "notification.reply.id"),
      origin: {
        type: "post",
        id: expectNumber(post.id, "notification.post.id"),
      },
      postId: expectNumber(post.id, "notification.post.id"),
      ...(postSnapshot ? { post: postSnapshot } : {}),
      ...(replySnapshot ? { reply: replySnapshot } : {}),
    };
  }

  if (
    type === "private_message" &&
    supportsPrivateMessages(apiVersion) &&
    privateMessageSnapshot
  ) {
    return {
      unseen: notification.unseen === true,
      kind: "private_message",
      message: privateMessageSnapshot,
    };
  }

  if (
    type === "user_follow" &&
    supportsUserFollowNotifications(apiVersion) &&
    user
  ) {
    return {
      unseen: notification.unseen === true,
      kind: "user_follow",
      actor: normalizeActor(user),
    };
  }

  if (type === "post_mention" && post) {
    return {
      unseen: notification.unseen === true,
      notificationType: "post_mention",
      commentId: expectNumber(post.id, "notification.post.id"),
      origin: {
        type: "post",
        id: expectNumber(post.id, "notification.post.id"),
      },
      postId: expectNumber(post.id, "notification.post.id"),
      ...(postSnapshot ? { post: postSnapshot } : {}),
    };
  }

  if (type === "comment_reply" && post && reply && comment) {
    return {
      unseen: notification.unseen === true,
      notificationType: "comment_reply",
      commentId: expectNumber(reply.id, "notification.reply.id"),
      origin: {
        type: "comment",
        id: expectNumber(comment.id, "notification.comment.id"),
      },
      postId: expectNumber(post.id, "notification.post.id"),
      ...(postSnapshot ? { post: postSnapshot } : {}),
      ...(replySnapshot ? { reply: replySnapshot } : {}),
      ...(commentSnapshot ? { comment: commentSnapshot } : {}),
    };
  }

  if (type === "comment_mention" && post && comment) {
    return {
      unseen: notification.unseen === true,
      notificationType: "comment_mention",
      commentId: expectNumber(comment.id, "notification.comment.id"),
      origin: {
        type: "comment",
        id: expectNumber(comment.id, "notification.comment.id"),
      },
      postId: expectNumber(post.id, "notification.post.id"),
      ...(postSnapshot ? { post: postSnapshot } : {}),
      ...(commentSnapshot
        ? { comment: commentSnapshot, reply: commentSnapshot }
        : {}),
    };
  }

  if (post) {
    const legacyCommentId = isRecord(notification.comment)
      ? notification.comment.id
      : undefined;
    const postId = expectNumber(post.id, "notification.post.id");

    if (legacyCommentId === undefined) {
      return {
        unseen: notification.unseen === true,
        notificationType: "legacy",
        commentId: postId,
        origin: { type: "post", id: postId },
        postId,
        ...(postSnapshot ? { post: postSnapshot } : {}),
      };
    }

    return {
      unseen: notification.unseen === true,
      notificationType: "legacy",
      commentId: expectNumber(legacyCommentId, "notification.comment.id"),
      origin: {
        type: "comment",
        id: expectNumber(legacyCommentId, "notification.comment.id"),
      },
      postId,
      ...(postSnapshot ? { post: postSnapshot } : {}),
      ...(commentSnapshot ? { reply: commentSnapshot } : {}),
    };
  }

  return undefined;
}

export function normalizeNotificationList(
  data: unknown,
  apiVersion = 0,
): FullNotification[] {
  const rawItems = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
    ? data.items
    : [];

  return rawItems.flatMap(item => {
    try {
      const notification = transformToFullNotification(item, apiVersion);
      return notification ? [notification] : [];
    } catch {
      return [];
    }
  });
}

/* end of Notification.ts */
