/*
    Project: Hoot Mobile
    -------------------

    File: Post.test.ts

    Purpose:

        Validate Lotide post service behavior at the API boundary.

    Responsibilities:

        • Verify vote normalization is idempotent
        • Verify malformed post lists drop bad items
        • Verify malformed post details and server errors do not crash callers

    This file intentionally does NOT contain:

        • React component rendering tests
        • Live network integration tests
        • Comment API validation
*/

import { getPost, getPosts, submitPost, transformVote } from "../Post";

const ctx = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
  login: { token: "token-1" },
};

describe("Post Service Utilities", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("transformVote normalizes null your_vote to false", () => {
    const post = {
      id: 1,
      title: "Test Post",
      your_vote: null,
    } as unknown as Post;
    const transformed = transformVote(post);
    expect(transformed.your_vote).toBe(false);
  });

  test("transformVote keeps true your_vote as true", () => {
    const post = {
      id: 1,
      title: "Test Post",
      your_vote: true,
    } as unknown as Post;
    const transformed = transformVote(post);
    expect(transformed.your_vote).toBe(true);
  });

  test("transformVote keeps false your_vote as false", () => {
    const post = {
      id: 1,
      title: "Test Post",
      your_vote: false,
    } as unknown as Post;
    const transformed = transformVote(post);
    expect(transformed.your_vote).toBe(false);
  });

  test("transformVote handles undefined your_vote", () => {
    const post = {
      id: 1,
      title: "Test Post",
    } as unknown as Post;
    const transformed = transformVote(post);
    expect(transformed.your_vote).toBeUndefined();
  });

  test("filters malformed posts out of paged responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            id: 1,
            title: "Good post",
            remote_url: "https://lotide.fbxl.net/post/1",
            content_markdown: "Good **post**",
            your_vote: false,
            author: {
              id: "bad optional author",
            },
          },
          {
            id: "bad",
            title: "Bad post",
          },
        ],
        next_page: 5,
      }),
    });

    const posts = await getPosts(ctx, null, "hot");

    expect(posts.items).toHaveLength(1);
    expect(posts.items[0].title).toBe("Good post");
    expect(posts.items[0].remote_url).toBe("https://lotide.fbxl.net/post/1");
    expect(posts.items[0].content_markdown).toBe("Good **post**");
    expect(posts.items[0].author).toBeUndefined();
    expect(posts.items[0].your_vote).toBe(false);
    expect(posts.next_page).toBeNull();
  });

  test("uses Lotide-compatible post list query parameters", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [],
        next_page: null,
      }),
    });

    await getPosts(ctx, "page token&bad=true", "hot");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/posts?sort=hot&page=page%20token%26bad%3Dtrue&include_your=true&use_aggregate_filters=true",
      expect.objectContaining({
        method: "GET",
      }),
    );

    await getPosts(ctx, null, "hot", undefined, 7);

    expect(global.fetch).toHaveBeenLastCalledWith(
      "https://lotide.fbxl.net/api/unstable/posts?sort=hot&include_your=true&community=7&sort_sticky=true",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("rejects malformed post details", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "bad",
        title: "Bad post",
      }),
    });

    await expect(getPost(ctx, 1)).rejects.toThrow("Invalid Lotide API response");
  });

  test("submits posts and validates the returned post id", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: 77,
      }),
    });

    await expect(
      submitPost(ctx, {
        community: 7,
        title: "Lotide post",
        content_markdown: "Body",
      }),
    ).resolves.toEqual({ id: 77 });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/posts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          community: 7,
          title: "Lotide post",
          content_markdown: "Body",
        }),
      }),
    );
  });

  test("rejects server errors with status metadata", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue("server exploded"),
    });

    await expect(getPost(ctx, 1)).rejects.toMatchObject({
      status: 500,
      body: "server exploded",
    });
  });
});

/* end of Post.test.ts */
