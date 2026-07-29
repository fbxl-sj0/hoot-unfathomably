/*
    Project: Hoot Mobile
    -------------------

    File: Comment.test.ts

    Purpose:

        Validate Lotide comment service behavior against Lotide reply
        response shapes.

    Responsibilities:

        • Verify post and comment reply endpoints use Lotide query parameters
        • Verify malformed comment list entries are dropped safely
        • Verify malformed submit responses are rejected before callers use them

    This file intentionally does NOT contain:

        • React component rendering tests
        • Live network integration tests
        • Vote mutation tests
*/

import {
  commentOnComment,
  getCommentComments,
  getPostComments,
  getRawComment,
} from "../Comment";

const publicCtx = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
};

const loggedInCtx = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
  login: { token: "token-1" },
};

describe("Comment service", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [],
        next_page: null,
      }),
    });
  });

  function comment(overrides: Record<string, unknown> = {}) {
    return {
      id: 21,
      remote_url: "https://lotide.fbxl.net/comment/21",
      content_text: "Good comment",
      content_markdown: "Good **comment**",
      content_html: "<p>Good comment</p>",
      created: "2026-06-04T00:00:00Z",
      deleted: false,
      local: true,
      score: 3,
      your_vote: null,
      author: {
        id: 3,
        username: "commenter",
        host: "lotide.fbxl.net",
        local: true,
        is_bot: false,
      },
      ...overrides,
    };
  }

  test("uses Lotide-compatible post reply query parameters", async () => {
    await getPostComments(publicCtx, 7, "page token&unsafe=true");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/posts/7/replies?limit=10&sort=hot&page=page%20token%26unsafe%3Dtrue",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("includes include_your only when requesting replies as a logged-in user", async () => {
    await getCommentComments(loggedInCtx, 21, "next page");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/comments/21/replies?limit=10&sort=hot&include_your=true&page=next%20page",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  test("filters malformed comments and nested replies out of paged responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          comment({
            replies: {
              items: [
                comment({
                  id: 22,
                  content_text: "Good child",
                  your_vote: false,
                  replies: null,
                }),
                comment({
                  id: "bad child",
                }),
              ],
              next_page: 44,
            },
          }),
          comment({
            id: "bad parent",
          }),
        ],
        next_page: 55,
      }),
    });

    const [page, comments] = await getPostComments(publicCtx, 7);

    expect(page).toEqual({
      items: [21],
      next_page: null,
    });
    expect(comments).toEqual([
      expect.objectContaining({
        id: 21,
        remote_url: "https://lotide.fbxl.net/comment/21",
        content_markdown: "Good **comment**",
        deleted: false,
        replies: {
          items: [22],
          next_page: null,
        },
        your_vote: false,
      }),
      expect.objectContaining({
        id: 22,
        your_vote: false,
      }),
    ]);
  });

  test("rejects malformed comment list envelopes", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: {},
        next_page: null,
      }),
    });

    await expect(getPostComments(publicCtx, 7)).rejects.toThrow(
      "Invalid Lotide API response",
    );
  });

  test("accepts comment detail responses with missing or malformed authors", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(comment({
        author: {
          id: "bad optional author",
        },
      })),
    });

    await expect(getRawComment(publicCtx, 21)).resolves.toEqual(
      expect.objectContaining({
        id: 21,
        author: undefined,
      }),
    );
  });

  test("rejects malformed comment submit responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "not a number",
      }),
    });

    await expect(
      commentOnComment(loggedInCtx, 21, "New reply"),
    ).rejects.toThrow("Invalid Lotide API response");
  });
});

/* end of Comment.test.ts */
