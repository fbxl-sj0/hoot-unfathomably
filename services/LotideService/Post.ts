/*
    Project: Hoot Mobile
    -------------------

    File: Post.ts

    Purpose:

        Implement Lotide post endpoints.

    Responsibilities:

        - Load post details and feed pages
        - Submit new posts
        - Apply and remove post votes

    This file intentionally does NOT contain:

        - comment endpoints
        - React state
*/

import { lotideRequest, readJson } from "./util";
import {
  normalizePaged,
  normalizePost,
  normalizeSubmittedId,
} from "./validation";

export async function getPost(
  ctx: LotideContext,
  postId: PostId,
): Promise<Post> {
  return lotideRequest(
    ctx,
    "GET",
    `posts/${postId}${ctx.login ? "?include_your=true" : ""}`,
    undefined,
    true,
  )
    .then(readJson)
    .then(normalizePost)
    .then(transformVote);
}

export async function getPosts(
  ctx: LotideContext,
  page: string | null,
  sort: SortOption = "hot",
  inYourFollows?: boolean,
  communityId?: CommunityId,
): Promise<Paged<Post>> {
  const query = [
    `sort=${encodeURIComponent(sort)}`,
    page !== null && `page=${encodeURIComponent(page)}`,
    ctx.login && `include_your=true`,
    inYourFollows !== undefined && `in_your_follows=${inYourFollows}`,
    inYourFollows === undefined &&
      communityId === undefined &&
      `use_aggregate_filters=true`,
    communityId !== undefined && `community=${communityId}`,
    communityId !== undefined && sort === "hot" && `sort_sticky=true`,
  ]
    .filter(x => x)
    .join("&");
  return lotideRequest(ctx, "GET", `posts?${query}`, undefined, true)
    .then(readJson)
    .then(data => normalizePaged(data, normalizePost, "posts"))
    .then(data => ({
      ...data,
      items: data.items.map(transformVote),
    }));
}

export async function submitPost(
  ctx: LotideContext,
  post: NewPost,
): Promise<{ id: PostId }> {
  return lotideRequest(ctx, "POST", "posts", post)
    .then(readJson)
    .then(data => normalizeSubmittedId(data, "new post"));
}

export async function applyVote(ctx: LotideContext, postId: PostId) {
  return lotideRequest(ctx, "PUT", `posts/${postId}/your_vote`);
}

export async function removeVote(ctx: LotideContext, postId: PostId) {
  return lotideRequest(ctx, "DELETE", `posts/${postId}/your_vote`);
}

export function transformVote(post: Readonly<Post>): Post {
  if (typeof post.your_vote === "boolean") {
    return post as Post;
  }

  if (post.your_vote !== undefined) {
    return {
      ...post,
      your_vote: post.your_vote !== null,
    };
  } else {
    return post;
  }
}

/* end of Post.ts */
