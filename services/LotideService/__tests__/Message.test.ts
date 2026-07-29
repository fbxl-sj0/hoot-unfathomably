/*
    Project: Hoot Mobile
    -------------------

    File: Message.test.ts

    Purpose:

        Validate Lotide private message service helpers.

    Responsibilities:

        - Verify private-message endpoint paths and payloads
        - Verify conversation pagination query construction
        - Verify thread pagination query construction
        - Verify message response normalization
        - Verify older servers are protected by feature gates

    This file intentionally does NOT contain:

        - React screen rendering
        - Local notification behavior
*/

import {
  dismissPrivateMessageConversation,
  getPrivateMessageConversations,
  getPrivateMessagePartner,
  getPrivateMessageThread,
  sendPrivateMessage,
} from "../Message";

describe("Message service", () => {
  const ctx = {
    apiUrl: "https://lotide.fbxl.net/api/unstable",
    apiVersion: 18,
    login: {
      token: "token-1",
      user: {
        id: 1,
        username: "sj_zero",
        host: "lotide.fbxl.net",
      },
    },
  };

  function message(overrides: Record<string, unknown> = {}) {
    return {
      id: 33,
      author: {
        id: 2,
        username: "remote",
        local: false,
        host: "remote.example",
        remote_url: "https://remote.example/users/remote",
        is_bot: false,
      },
      recipient: {
        id: 1,
        username: "sj_zero",
        local: true,
        host: "lotide.fbxl.net",
        remote_url: "https://lotide.fbxl.net/apub/users/1",
        is_bot: false,
      },
      created: "2026-06-18T12:00:00Z",
      local: false,
      remote_url: "https://remote.example/messages/33",
      content_text: "hello",
      content_markdown: null,
      content_html: "<p>hello</p>",
      in_reply_to: null,
      federation_status: "received",
      sensitive: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [message()],
        next_page: null,
      }),
    });
  });

  test("loads the private-message conversation list", async () => {
    const out = await getPrivateMessageConversations(ctx);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/users/~me/messages?conversations=true",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
    expect(out.items[0]).toEqual(
      expect.objectContaining({
        id: 33,
        content_html: "<p>hello</p>",
        federation_status: "received",
      }),
    );
  });

  test("loads a private-message thread with another user", async () => {
    await getPrivateMessageThread(ctx, 2);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/users/~me/messages?with_user=2",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("loads a later private-message conversation page", async () => {
    await getPrivateMessageConversations(ctx, "page 2");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/users/~me/messages?conversations=true&page=page%202",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("loads a later private-message thread page", async () => {
    await getPrivateMessageThread(ctx, 2, "page 2");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/users/~me/messages?with_user=2&page=page%202",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("sends and dismisses private messages", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(message({
          id: 34,
          author: ctx.login.user,
          recipient: message().author,
          content_text: "hello back",
          in_reply_to: 33,
          federation_status: "sent",
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ dismissed: true }),
      });

    await sendPrivateMessage(ctx, 2, "hello back", 33);
    await expect(dismissPrivateMessageConversation(ctx, 2)).resolves.toBe(true);

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://lotide.fbxl.net/api/unstable/users/~me/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          recipient: 2,
          content_text: "hello back",
          in_reply_to: 33,
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://lotide.fbxl.net/api/unstable/users/~me/messages:dismiss",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          with_user: 2,
        }),
      }),
    );
  });

  test("rejects malformed private-message submit and dismissal responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ dismissed: "yes" }),
    });

    await expect(dismissPrivateMessageConversation(ctx, 2)).rejects.toThrow(
      "private message dismissal.dismissed",
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "bad" }),
    });

    await expect(sendPrivateMessage(ctx, 2, "hello")).rejects.toThrow(
      "private message.id",
    );
  });

  test("selects the other participant as the message partner", () => {
    const received = message() as PrivateMessage;
    const sent = message({
      author: received.recipient,
      recipient: received.author,
    }) as PrivateMessage;

    expect(getPrivateMessagePartner(received, 1).id).toBe(2);
    expect(getPrivateMessagePartner(sent, 1).id).toBe(2);
  });

  test("blocks private-message calls on older servers", async () => {
    global.fetch = jest.fn();

    await expect(getPrivateMessageConversations({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 17,
      login: { token: "token-1" },
    })).rejects.toThrow("private messages");

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/* end of Message.test.ts */
