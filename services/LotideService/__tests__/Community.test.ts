/*
    Project: Hoot Mobile
    -------------------

    File: Community.test.ts

    Purpose:

        Validate Lotide community service helpers used by community and
        moderation screens.

    Responsibilities:

        • Verify moderated communities use the Lotide moderation endpoint
        • Verify community flags use the selected community id
        • Verify authenticated moderation requests include the bearer token

    This file intentionally does NOT contain:

        • Component rendering tests
        • Flag action tests
        • Network integration tests against a live Lotide node
*/

import {
  dismissCommunityFlag,
  editCommunity,
  followCommunity,
  getAllCommunities,
  getCommunities,
  getCommunity,
  getCommunityFlags,
  getModeratedCommunities,
  newCommunity,
} from "../Community";

describe("Community service", () => {
  const ctx = {
    apiUrl: "https://lotide.fbxl.net/api/unstable",
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
      }),
    });
  });

  function community(overrides: Record<string, unknown> = {}) {
    return {
      id: 7,
      name: "hoot",
      host: "lotide.fbxl.net",
      local: true,
      deleted: false,
      description: {
        content_text: "A Lotide community",
        content_markdown: null,
        content_html: null,
      },
      ...overrides,
    };
  }

  test("loads communities moderated by the current user", async () => {
    await getModeratedCommunities(ctx);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/communities?you_are_moderator=true&include_your=true",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  test("encodes community list pagination tokens", async () => {
    await getCommunities(ctx, true, "page token&unsafe=true");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/communities?scope=mine&include_your=true&limit=150&your_follow.accepted=true&sort=alphabetic&page=page%20token%26unsafe%3Dtrue",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("uses lotide community scopes and numbered pagination", async () => {
    await getCommunities(ctx, false, "2");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/communities?scope=everything&include_your=true&limit=150&sort=alphabetic&page_number=2",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("loads all community pages with cursor safety", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          items: [community({ id: 7, name: "first" })],
          next_page: "2",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          items: [community({ id: 8, name: "second" })],
          next_page: null,
        }),
      });

    const communities = await getAllCommunities(ctx, false);

    expect(communities.map(item => item.id)).toEqual([7, 8]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://lotide.fbxl.net/api/unstable/communities?scope=everything&include_your=true&limit=150&sort=alphabetic&page_number=2",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("rejects repeated community pagination cursors", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [community()],
        next_page: "2",
      }),
    });

    await expect(getAllCommunities(ctx, false)).rejects.toThrow(
      "pagination loop",
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("allows public community browsing without a login", async () => {
    await getCommunities(
      {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      },
      false,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/communities?scope=everything&include_your=false&limit=150&sort=alphabetic",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("filters malformed moderated communities out of paged responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          community(),
          community({
            id: "not a number",
          }),
        ],
        next_page: 123,
      }),
    });

    const communities = await getModeratedCommunities(ctx);

    expect(communities).toEqual({
      items: [expect.objectContaining({ id: 7, name: "hoot" })],
      next_page: null,
    });
  });

  test("rejects malformed community list envelopes", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: "not a list",
        next_page: null,
      }),
    });

    await expect(getModeratedCommunities(ctx)).rejects.toThrow(
      "Invalid Lotide API response",
    );
  });

  test("rejects malformed community detail responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "not a number",
        name: "hoot",
        host: "lotide.fbxl.net",
      }),
    });

    await expect(getCommunity(ctx, 7)).rejects.toThrow(
      "Invalid Lotide API response",
    );
  });

  test("loads pending flags for the selected community", async () => {
    await getCommunityFlags(ctx, 7);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/flags?to_community=7&dismissed=false",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  test("filters malformed community flag records", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            id: 5,
            type: "post",
            created_local: "2026-06-04T00:00:00Z",
            content: {
              content_text: "Needs review",
            },
            flagger: {
              id: 3,
              username: "modwatch",
              host: "lotide.fbxl.net",
              local: true,
              is_bot: false,
            },
            post: {
              id: 8,
              title: "Flagged post",
            },
          },
          {
            id: 6,
            type: "post",
            post: {
              id: "bad",
              title: "Broken post",
            },
          },
        ],
        next_page: null,
      }),
    });

    const flags = await getCommunityFlags(ctx, 7);

    expect(flags.items).toEqual([
      expect.objectContaining({
        id: 5,
        post: {
          id: 8,
          title: "Flagged post",
        },
      }),
    ]);
  });

  test("dismisses a community moderation flag", async () => {
    await dismissCommunityFlag(ctx, 55);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/flags/55",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          community_dismissed: true,
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  test("normalizes lotide follow responses", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          accepted: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          accepted: false,
        }),
      });

    await expect(followCommunity(ctx, 7)).resolves.toEqual({
      accepted: true,
    });
    await expect(followCommunity(ctx, 7)).resolves.toEqual({
      accepted: false,
    });
    expect(global.fetch).toHaveBeenLastCalledWith(
      "https://lotide.fbxl.net/api/unstable/communities/7/follow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          try_wait_for_accept: true,
        }),
      }),
    );
  });

  test("rejects malformed lotide follow responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    });

    await expect(followCommunity(ctx, 7)).rejects.toThrow(
      "Invalid Lotide API response",
    );
  });

  test("edits community descriptions through lotide markdown content", async () => {
    await editCommunity(ctx, 7, "A better description");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/communities/7",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          description_markdown: "A better description",
        }),
      }),
    );
  });

  test("accepts both nested and flat new community id responses", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          community: {
            id: 9,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 10,
        }),
      });

    await expect(newCommunity(ctx, "lotide")).resolves.toEqual({
      community: { id: 9 },
    });
    await expect(newCommunity(ctx, "narwhal")).resolves.toEqual({
      community: { id: 10 },
    });
  });
});

/* end of Community.test.ts */
