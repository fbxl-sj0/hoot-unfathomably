/*
    Project: Hoot Mobile
    -------------------

    File: Notification.test.ts

    Purpose:

        Validate Lotide notification service normalization for Lotide's
        typed notification API responses.

    Responsibilities:

        • Verify Lotide notification variants become mobile notification data
        • Verify legacy notification shapes still work
        • Verify unknown and malformed notifications are ignored safely

    This file intentionally does NOT contain:

        • React component rendering tests
        • Live network integration tests
        • Push notification behavior
*/

import {
  getNotifications,
  normalizeNotificationList,
  transformToFullNotification,
} from "../Notification";

describe("transformToFullNotification", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("transforms Lotide post reply notifications", () => {
    const out = transformToFullNotification({
      type: "post_reply",
      unseen: true,
      reply: {
        id: 44,
      },
      post: {
        id: 13,
      },
    });

    expect(out).toEqual({
      unseen: true,
      notificationType: "post_reply",
      commentId: 44,
      origin: {
        type: "post",
        id: 13,
      },
      postId: 13,
    });
  });

  test("keeps embedded post and reply data from Lotide notifications", () => {
    const out = transformToFullNotification({
      type: "post_reply",
      unseen: true,
      reply: {
        id: 44,
        content_text: "Fresh reply",
        created: "2026-06-18T12:00:00Z",
        score: 0,
        author: {
          id: 3,
          username: "commenter",
          host: "lotide.fbxl.net",
          local: true,
        },
      },
      post: {
        id: 13,
        title: "Notification target",
        created: "2026-06-18T11:00:00Z",
        replies_count_total: 1,
        score: 5,
      },
    });

    expect(out).toEqual(
      expect.objectContaining({
        post: expect.objectContaining({
          id: 13,
          title: "Notification target",
          score: 5,
        }),
        reply: expect.objectContaining({
          id: 44,
          content_text: "Fresh reply",
        }),
      }),
    );
  });

  test("transforms Lotide comment reply notifications", () => {
    const out = transformToFullNotification({
      type: "comment_reply",
      unseen: false,
      reply: {
        id: 45,
      },
      comment: {
        id: 44,
      },
      post: {
        id: 13,
      },
    });

    expect(out).toEqual({
      unseen: false,
      notificationType: "comment_reply",
      commentId: 45,
      origin: {
        type: "comment",
        id: 44,
      },
      postId: 13,
    });
  });

  test("transforms Lotide comment mention notifications", () => {
    const out = transformToFullNotification({
      type: "comment_mention",
      unseen: true,
      comment: {
        id: 45,
      },
      post: {
        id: 13,
      },
    });

    expect(out).toEqual({
      unseen: true,
      notificationType: "comment_mention",
      commentId: 45,
      origin: {
        type: "comment",
        id: 45,
      },
      postId: 13,
    });
  });

  test("transforms legacy post-only notifications to post origin events", () => {
    const out = transformToFullNotification({
      unseen: false,
      post: {
        id: 13,
      },
      comment: undefined,
    });

    expect(out).toEqual({
      unseen: false,
      notificationType: "legacy",
      commentId: 13,
      origin: {
        type: "post",
        id: 13,
      },
      postId: 13,
    });
  });

  test("transforms legacy comment notifications to comment origin events", () => {
    const out = transformToFullNotification({
      unseen: true,
      post: {
        id: 13,
      },
      comment: {
        id: 44,
      },
    });

    expect(out).toEqual({
      unseen: true,
      notificationType: "legacy",
      commentId: 44,
      origin: {
        type: "comment",
        id: 44,
      },
      postId: 13,
    });
  });

  test("supports user follow notifications on Lotide 0.17+", () => {
    const out = transformToFullNotification(
      {
        type: "user_follow",
        unseen: true,
        user: {
          id: 31,
          username: "alice",
          local: false,
          host: "example.com",
          is_bot: false,
        },
      },
      17,
    );

    expect(out).toEqual(
      expect.objectContaining({
        unseen: true,
        kind: "user_follow",
        actor: expect.objectContaining({
          id: 31,
          username: "alice",
          local: false,
          host: "example.com",
          is_bot: false,
        }),
      }),
    );
  });

  test("ignores user follow notifications on pre-0.17 servers", () => {
    const out = transformToFullNotification(
      {
        type: "user_follow",
        unseen: true,
        user: {
          id: 31,
          username: "alice",
          local: false,
          host: "example.com",
          is_bot: false,
        },
      },
      16,
    );

    expect(out).toBeUndefined();
  });

  test("supports private message notifications on Lotide 0.18+", () => {
    const out = transformToFullNotification(
      {
        type: "private_message",
        unseen: true,
        message: {
          id: 33,
          author: {
            id: 2,
            username: "remote",
            local: false,
            host: "remote.example",
            is_bot: false,
          },
          recipient: {
            id: 1,
            username: "sj_zero",
            local: true,
            host: "lotide.example",
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
        },
      },
      18,
    );

    expect(out).toEqual(
      expect.objectContaining({
        unseen: true,
        kind: "private_message",
        message: expect.objectContaining({
          id: 33,
          content_html: "<p>hello</p>",
          federation_status: "received",
        }),
      }),
    );
  });

  test("ignores private message notifications on pre-0.18 servers", () => {
    const out = transformToFullNotification(
      {
        type: "private_message",
        unseen: true,
        message: {
          id: 33,
          author: {
            id: 2,
            username: "remote",
            local: false,
            host: "remote.example",
            is_bot: false,
          },
          recipient: {
            id: 1,
            username: "sj_zero",
            local: true,
            host: "lotide.example",
            is_bot: false,
          },
          created: "2026-06-18T12:00:00Z",
          local: false,
          content_text: "hello",
          content_markdown: null,
          content_html: "<p>hello</p>",
          in_reply_to: null,
          sensitive: false,
        },
      },
      17,
    );

    expect(out).toBeUndefined();
  });

  test("drops unknown and malformed notification entries", () => {
    const out = normalizeNotificationList({
      items: [
        { type: "unknown", unseen: true },
        { type: "post_reply", unseen: true, reply: { id: "bad" }, post: { id: 1 } },
        { type: "post_mention", unseen: false, post: { id: 2 } },
      ],
      next_page: null,
    });

    expect(out).toEqual([
      {
        unseen: false,
        notificationType: "post_mention",
        commentId: 2,
        origin: {
          type: "post",
          id: 2,
        },
        postId: 2,
      },
    ]);
  });

  test("accepts legacy raw notification arrays", () => {
    const out = normalizeNotificationList([
      {
        unseen: false,
        post: {
          id: 13,
        },
      },
    ]);

    expect(out).toEqual([
      {
        unseen: false,
        notificationType: "legacy",
        commentId: 13,
        origin: {
          type: "post",
          id: 13,
        },
        postId: 13,
      },
    ]);
  });

  test("loads paged Lotide notification responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            type: "post_mention",
            unseen: true,
            post: { id: 99 },
          },
        ],
        next_page: null,
      }),
    });

    const out = await getNotifications({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      login: { token: "token-1" },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/users/~me/notifications",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
    expect(out).toEqual([
      {
        unseen: true,
        notificationType: "post_mention",
        commentId: 99,
        origin: {
          type: "post",
          id: 99,
        },
        postId: 99,
      },
    ]);
  });

  test("loads and filters user follow notifications based on server version", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            type: "user_follow",
            unseen: false,
            user: {
              id: 44,
              username: "alice",
              local: false,
              host: "example.com",
              is_bot: false,
            },
          },
        ],
        next_page: null,
      }),
    });

    const modern = await getNotifications({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 17,
      login: { token: "token-1" },
    });
    const legacy = await getNotifications({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 16,
      login: { token: "token-1" },
    });

    expect(modern).toEqual([
      expect.objectContaining({
        kind: "user_follow",
        actor: expect.objectContaining({ id: 44 }),
      }),
    ]);
    expect(legacy).toEqual([]);
  });
});

/* end of Notification.test.ts */
