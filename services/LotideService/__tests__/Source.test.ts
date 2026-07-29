/*
    Project: Hoot Mobile
    -------------------

    File: Source.test.ts

    Purpose:

        Validate Lotide source-feed service helpers.

    Responsibilities:

        - Verify collection target endpoint paths and query encoding
        - Verify source, source item, vote, and comment requests
        - Verify older servers are protected by feature gates

    This file intentionally does NOT contain:

        - React screen rendering
        - Live network tests
*/

import {
  applyCollectionTargetItemVote,
  commentOnCollectionTargetItem,
  followCollectionTarget,
  getCollectionTarget,
  getCollectionTargetItem,
  getCollectionTargets,
  removeCollectionTargetItemVote,
  unfollowCollectionTarget,
} from "../Source";

describe("Source service", () => {
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

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [],
        next_page: null,
        total_count: 0,
        scope_total_count: 0,
        software_counts: [],
      }),
    });
  });

  test("loads collection targets with Hitide-compatible filters", async () => {
    await getCollectionTargets(ctx, {
      scope: "everything",
      pageNumber: 2,
      search: "we distribute",
      software: "wordpress",
      sort: "latest",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/collection_targets?scope=everything&include_your=true&limit=150&page_number=2&sort=latest&search=we%20distribute&software=wordpress",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  test("allows public source browsing without a login", async () => {
    await getCollectionTargets({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 18,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/collection_targets?scope=everything&include_your=false&limit=150&page_number=1&sort=alphabetic",
      expect.objectContaining({
        method: "GET",
        headers: undefined,
      }),
    );
  });

  test("normalizes collection target list records", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [{
          id: 12,
          type: "actor_feed",
          software: "castopod",
          name: "The Show",
          remote_url: "https://podcasts.example/@show",
          owner: { id: null, remote_url: "https://podcasts.example/@show" },
          total_items: 42,
          preview_item_count: 3,
          latest_preview_item: "Episode 1",
          latest_preview_published: "2026-06-18T12:00:00Z",
          latest_preview_url: "https://podcasts.example/episodes/1",
          summary_excerpt: "A compact source summary",
          your_follow: { accepted: false, federation_status: "sent" },
          latest_unfollow_status: null,
        }],
        next_page: null,
        total_count: 1,
        scope_total_count: 1,
        software_counts: [{ software: "castopod", count: 1 }],
      }),
    });

    await expect(getCollectionTargets(ctx)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 12,
          software: "castopod",
          summary_excerpt: "A compact source summary",
          your_follow: expect.objectContaining({
            accepted: false,
            federation_status: "sent",
          }),
        }),
      ],
      next_page: null,
      total_count: 1,
      scope_total_count: 1,
      software_counts: [{ software: "castopod", count: 1 }],
    });
  });

  test("loads source details and defaults preview likes to supported", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: 12,
        type: "actor_feed",
        software: "postmarks",
        name: "Bookmarks",
        remote_url: "https://bookmarks.example/u/links",
        owner: { id: null, remote_url: "https://bookmarks.example/u/links" },
        followers: null,
        first_page: null,
        last_page: null,
        summary_html: null,
        total_items: 10,
        your_follow: null,
        latest_unfollow_status: null,
        preview_items: [{
          id: 44,
          ap_id: "https://bookmarks.example/items/44",
          type: "Page",
          name: "Readable source item",
          url: null,
          attributed_to: null,
          content_html: null,
          summary_html: null,
          image_url: null,
          published: null,
          your_vote: { federation_status: "received" },
        }],
      }),
    });

    const source = await getCollectionTarget(ctx, 12);

    expect(source.preview_item_likes_supported).toBe(true);
    expect(source.preview_items[0]).toEqual(
      expect.objectContaining({
        id: 44,
        your_vote: true,
        federation_status: "received",
      }),
    );
  });

  test("loads native source item reader data", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        collection: {
          id: 12,
          type: "actor_feed",
          software: "wordpress",
          name: "A Blog",
          remote_url: "https://blog.example/ap/actor",
          owner: { id: null, remote_url: "https://blog.example/ap/actor" },
          preview_item_likes_supported: false,
          preview_item_replies_supported: true,
          can_reply: true,
        },
        item: {
          id: 44,
          ap_id: "https://blog.example/posts/1",
          type: "Article",
          name: "Readable source item",
          url: "https://blog.example/readable-source-item",
          attributed_to: null,
          content_html: "<p>Cached body.</p>",
          summary_html: null,
          image_url: null,
          published: "2026-06-19T12:00:00Z",
          your_vote: null,
        },
        comments: [{
          id: 6,
          remote_url: null,
          content_text: null,
          content_markdown: "Good post.",
          content_html: "<p>Good post.</p>",
          created: "2026-06-19T12:30:00Z",
          local: true,
          author: {
            id: 1,
            username: "alice",
            local: true,
            host: "lotide.example",
            is_bot: false,
          },
          sensitive: false,
          federation_status: "received",
        }],
      }),
    });

    const item = await getCollectionTargetItem(ctx, 12, 44);

    expect(item.collection.can_reply).toBe(true);
    expect(item.collection.preview_item_likes_supported).toBe(false);
    expect(item.item.content_html).toBe("<p>Cached body.</p>");
    expect(item.comments[0].author?.username).toBe("alice");
  });

  test("follows, unfollows, likes, unlikes, and comments on source items", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          accepted: false,
          federation_status: "sent",
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 6,
        }),
      });

    await expect(followCollectionTarget(ctx, 12)).resolves.toEqual({
      accepted: false,
      federation_status: "sent",
    });
    await unfollowCollectionTarget(ctx, 12);
    await applyCollectionTargetItemVote(ctx, 12, 44);
    await removeCollectionTargetItemVote(ctx, 12, 44);
    await expect(
      commentOnCollectionTargetItem(ctx, 12, 44, "Good post."),
    ).resolves.toEqual({ id: 6 });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://lotide.fbxl.net/api/unstable/collection_targets/12/follow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ try_wait_for_accept: true }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://lotide.fbxl.net/api/unstable/collection_targets/12/unfollow",
      expect.objectContaining({ method: "POST" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "https://lotide.fbxl.net/api/unstable/collection_targets/12/items/44/your_vote",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      "https://lotide.fbxl.net/api/unstable/collection_targets/12/items/44/your_vote",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      5,
      "https://lotide.fbxl.net/api/unstable/collection_targets/12/items/44/comments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content_markdown: "Good post." }),
      }),
    );
  });

  test("rejects malformed source-item comment submit responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "bad" }),
    });

    await expect(
      commentOnCollectionTargetItem(ctx, 12, 44, "Good post."),
    ).rejects.toThrow("collection target comment.id");
  });

  test("blocks collection target calls on older servers", async () => {
    global.fetch = jest.fn();

    await expect(getCollectionTargets({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 17,
    })).rejects.toThrow("source feeds");

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/* end of Source.test.ts */
