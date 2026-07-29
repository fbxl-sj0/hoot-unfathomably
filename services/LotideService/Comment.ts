/*
    Project: Hoot Mobile
    -------------------

    File: Comment.ts

    Purpose:

        Implement Lotide comment endpoints.

    Responsibilities:

        - Load comments and reply pages
        - Submit post/comment replies
        - Apply and remove comment votes

    This file intentionally does NOT contain:

        - React state
        - post endpoints
*/

import { lotideRequest, readJson } from "./util";
import {
  normalizeComment,
  normalizePaged,
  normalizeSubmittedId,
  normalizeVote,
  RawComment,
} from "./validation";

export async function getComment(
  ctx: LotideContext,
  commentId: CommentId,
): Promise<Comment[]> {
  return lotideRequest(
    ctx,
    "GET",
    `comments/${commentId}${ctx.login ? "?include_your=true" : ""}`,
    undefined,
    true,
  )
    .then(readJson)
    .then(normalizeComment)
    .then(transformComment);
}

export async function getRawComment(
  ctx: LotideContext,
  commentId: CommentId,
): Promise<RawComment> {
  return lotideRequest(
    ctx,
    "GET",
    `comments/${commentId}${ctx.login ? "?include_your=true" : ""}`,
    undefined,
    true,
  )
    .then(readJson)
    .then(normalizeComment);
}

export async function getPostComments(
  ctx: LotideContext,
  postId: PostId,
  page?: string,
): Promise<[Paged<CommentId> | undefined, Comment[]]> {
  return lotideRequest(
    ctx,
    "GET",
    [
      `posts/${postId}/replies?limit=10&sort=hot`,
      ctx.login && "include_your=true",
      page && `page=${encodeURIComponent(page)}`,
    ].filter(Boolean).join("&"),
    undefined,
    true,
  )
    .then(readJson)
    .then(data => normalizePaged(data, normalizeComment, "post replies"))
    .then(transformCommentMulti);
}

export async function getCommentComments(
  ctx: LotideContext,
  commentId: CommentId,
  page?: string,
): Promise<[Paged<CommentId> | undefined, Comment[]]> {
  return lotideRequest(
    ctx,
    "GET",
    [
      `comments/${commentId}/replies?limit=10&sort=hot`,
      ctx.login && "include_your=true",
      page && `page=${encodeURIComponent(page)}`,
    ].filter(Boolean).join("&"),
    undefined,
    true,
  )
    .then(readJson)
    .then(data => normalizePaged(data, normalizeComment, "comment replies"))
    .then(transformCommentMulti);
}

export async function commentOnPost(
  ctx: LotideContext,
  postId: PostId,
  content: string,
): Promise<{ id: CommentId }> {
  return lotideRequest(ctx, "POST", `posts/${postId}/replies`, {
    content_markdown: content,
  })
    .then(readJson)
    .then(data => normalizeSubmittedId(data, "post reply"));
}

export async function commentOnComment(
  ctx: LotideContext,
  commentId: CommentId,
  content: string,
): Promise<CommentId> {
  return lotideRequest(ctx, "POST", `comments/${commentId}/replies`, {
    content_markdown: content,
  })
    .then(readJson)
    .then(data => normalizeSubmittedId(data, "comment reply"))
    .then(data => data.id);
}

export async function applyCommentVote(
  ctx: LotideContext,
  commentId: CommentId,
) {
  return lotideRequest(ctx, "PUT", `comments/${commentId}/your_vote`);
}

export async function removeCommentVote(
  ctx: LotideContext,
  commentId: CommentId,
) {
  return lotideRequest(ctx, "DELETE", `comments/${commentId}/your_vote`);
}

export function transformComment(comment: Readonly<RawComment>): Comment[] {
  const comments = comment.replies;

  const [childIds, childData] = transformCommentMulti(comments || undefined);

  const newComment = {
    ...comment,
    replies: childIds,
    your_vote: normalizeVote(comment.your_vote),
  } as Comment;

  return [newComment, ...childData];
}

export function transformCommentMulti(
  comments?: Readonly<Paged<RawComment>>,
): [Paged<CommentId> | undefined, Comment[]] {
  if (!comments) return [undefined, []];
  return [
    {
      items: comments.items.map(reply => reply.id as CommentId),
      next_page: comments.next_page,
    },
    comments.items.flatMap(transformComment),
  ];
}

/* end of Comment.ts */
