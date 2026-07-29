/*
    Project: Hoot Mobile
    -------------------

    File: User.ts

    Purpose:

        Implement Lotide account and user endpoints.

    Responsibilities:

        - Login, register, logout, and reset passwords
        - Load mixed user activity pages

    This file intentionally does NOT contain:

        - profile screen rendering
        - context persistence
*/

import { lotideRequest, readJson } from "./util";
import { supportsUserFollows } from "../../constants/LotideApi";
import {
  InvalidLotideResponseError,
  normalizePaged,
  normalizeUserThing,
  normalizeYourFollow,
} from "./validation";

export type UserThing =
  | {
      type: "post";
      id: PostId;
      title: string;
      author?: Profile;
      community?: Community;
      created?: string;
      replies_count_total?: number;
      remote_url?: string;
      sticky?: boolean;
    }
  | {
      type: "comment";
      id: CommentId;
      content_text?: string | null;
      content_html?: string | null;
      created?: string;
      post: {
        id: PostId;
        title: string;
        remote_url?: string;
        sensitive?: boolean;
      };
      remote_url?: string;
      sensitive?: boolean;
    };

export async function login(
  apiUrl: string,
  username: string,
  password: string,
): Promise<Login> {
  return lotideRequest(
    { apiUrl },
    "POST",
    "logins",
    { username, password },
    true,
  )
    .then(readJson)
    .then(data => data as Login);
}

export async function register(
  apiUrl: string,
  username: string,
  password: string,
  email?: string,
): Promise<Login> {
  return lotideRequest(
    { apiUrl },
    "POST",
    "users",
    {
      username,
      password,
      email_address: email,
      login: true,
    },
    true,
  )
    .then(readJson)
    .then(data => data as Login);
}

export async function logout(ctx: LotideContext) {
  return lotideRequest(ctx, "DELETE", "logins/~current");
}

export async function forgotPasswordRequestKey(
  ctx: LotideContext,
  email: string,
) {
  return lotideRequest(
    ctx,
    "POST",
    "forgot_password/keys",
    {
      email_address: email,
    },
    true,
  );
}

export async function forgotPasswordTestKey(ctx: LotideContext, key: string) {
  return lotideRequest(
    ctx,
    "GET",
    `forgot_password/keys/${key}`,
    undefined,
    true,
  );
}

export async function forgotPasswordReset(
  ctx: LotideContext,
  key: string,
  newPassword: string,
) {
  return lotideRequest(
    ctx,
    "POST",
    `forgot_password/keys/${key}/reset`,
    { new_password: newPassword },
    true,
  );
}

export async function getUserThings(
  ctx: LotideContext,
  userId: UserId,
  page?: string,
): Promise<Paged<UserThing>> {
  return lotideRequest(
    ctx,
    "GET",
    `users/${userId}/things${page ? `?page=${encodeURIComponent(page)}` : ""}`,
    undefined,
    true,
  )
    .then(readJson)
    .then(data => normalizePaged(data, normalizeUserThing, "user things"));
}

function requireUserFollows(ctx: LotideContext) {
  if (!supportsUserFollows(ctx.apiVersion)) {
    throw new Error("This Lotide server does not provide user follows.");
  }
}

export async function followUser(
  ctx: LotideContext,
  userId: UserId,
): Promise<CommunityFollow> {
  requireUserFollows(ctx);

  return lotideRequest(ctx, "POST", `users/${userId}/follow`, {
    try_wait_for_accept: true,
  })
    .then(readJson)
    .then(data => {
      const follow = normalizeYourFollow(data);

      if (!follow) {
        throw new InvalidLotideResponseError("user follow");
      }

      return follow;
    });
}

export async function unfollowUser(
  ctx: LotideContext,
  userId: UserId,
) {
  requireUserFollows(ctx);

  return lotideRequest(ctx, "POST", `users/${userId}/unfollow`);
}

/* end of User.ts */
