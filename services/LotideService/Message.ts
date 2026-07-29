/*
    Project: Hoot Mobile
    -------------------

    File: Message.ts

    Purpose:

        Implement Lotide private message endpoints.

    Responsibilities:

        - Load the private-message conversation list
        - Load a conversation thread with another user
        - Send direct messages and dismiss conversations
        - Gate all calls behind the Lotide 0.18 API capability

    This file intentionally does NOT contain:

        - Push or local notification scheduling
        - Navigation logic
        - User profile loading
*/

import { supportsPrivateMessages } from "../../constants/LotideApi";
import { lotideRequest, readJson } from "./util";
import {
  normalizeBooleanResult,
  normalizePaged,
  normalizePrivateMessage,
} from "./validation";

function requirePrivateMessages(ctx: LotideContext) {
  if (!supportsPrivateMessages(ctx.apiVersion)) {
    throw new Error("This Lotide server does not provide private messages.");
  }
}

export async function getPrivateMessageConversations(
  ctx: LotideContext,
  page?: string,
): Promise<Paged<PrivateMessage>> {
  requirePrivateMessages(ctx);

  const query = [
    "conversations=true",
    page ? `page=${encodeURIComponent(page)}` : undefined,
  ].filter(Boolean).join("&");

  return lotideRequest(ctx, "GET", `users/~me/messages?${query}`)
    .then(readJson)
    .then(data =>
      normalizePaged(data, normalizePrivateMessage, "private messages"),
    );
}

export async function getPrivateMessageThread(
  ctx: LotideContext,
  userId: UserId,
  page?: string,
): Promise<Paged<PrivateMessage>> {
  requirePrivateMessages(ctx);

  const query = [
    `with_user=${userId}`,
    page ? `page=${encodeURIComponent(page)}` : undefined,
  ].filter(Boolean).join("&");

  return lotideRequest(ctx, "GET", `users/~me/messages?${query}`)
    .then(readJson)
    .then(data =>
      normalizePaged(data, normalizePrivateMessage, "private message thread"),
    );
}

export async function sendPrivateMessage(
  ctx: LotideContext,
  recipient: UserId,
  contentText: string,
  inReplyTo?: PrivateMessageId,
): Promise<PrivateMessage> {
  requirePrivateMessages(ctx);

  return lotideRequest(ctx, "POST", "users/~me/messages", {
    recipient,
    content_text: contentText,
    ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
  })
    .then(readJson)
    .then(normalizePrivateMessage);
}

export async function dismissPrivateMessageConversation(
  ctx: LotideContext,
  userId: UserId,
): Promise<boolean> {
  requirePrivateMessages(ctx);

  return lotideRequest(ctx, "POST", "users/~me/messages:dismiss", {
    with_user: userId,
  })
    .then(readJson)
    .then(data =>
      normalizeBooleanResult(data, "dismissed", "private message dismissal"),
    );
}

export function getPrivateMessagePartner(
  message: PrivateMessage,
  loginUserId?: UserId,
): Profile {
  if (message.author.id === loginUserId) {
    return message.recipient;
  }

  return message.author;
}

/* end of Message.ts */
