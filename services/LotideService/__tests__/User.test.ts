/*
    Project: Hoot Mobile
    -------------------

    File: User.test.ts

    Purpose:

        Validate Lotide user service helpers that are used by profile
        and account screens.

    Responsibilities:

        • Verify profile activity uses the users/{id}/things endpoint
        • Verify pagination is passed to the profile activity endpoint

    This file intentionally does NOT contain:

        • Component rendering tests
        • Authentication lifecycle tests
        • Network integration tests against a live Lotide node
*/

import {
  followUser,
  getUserThings,
  unfollowUser,
} from "../User";

describe("User service", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [],
        next_page: null,
      }),
    });
  });

  test("loads user activity from the Lotide things endpoint", async () => {
    await getUserThings(
      {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      },
      1,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/users/1/things",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("passes pagination to the user activity endpoint", async () => {
    await getUserThings(
      {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      },
      1,
      "page token&unsafe=true",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://lotide.fbxl.net/api/unstable/users/1/things?page=page%20token%26unsafe%3Dtrue",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  test("filters malformed and unknown user activity records", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            type: "post",
            id: 11,
            title: "Good post",
          },
          {
            type: "comment",
            id: 12,
            content_text: "Good comment",
            content_html: "<p>Good comment</p>",
            post: {
              id: 11,
              title: "Good post",
            },
          },
          {
            type: "comment",
            id: "bad",
            post: {
              id: 11,
              title: "Bad comment",
            },
          },
          {
            type: "future_type",
            id: 13,
          },
        ],
        next_page: 33,
      }),
    });

    const things = await getUserThings(
      {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      },
      1,
    );

    expect(things).toEqual({
      items: [
        expect.objectContaining({
          type: "post",
          id: 11,
          title: "Good post",
        }),
        expect.objectContaining({
          type: "comment",
          id: 12,
          post: {
            id: 11,
            title: "Good post",
            remote_url: undefined,
            sensitive: undefined,
          },
        }),
      ],
      next_page: null,
    });
  });

  test("rejects malformed user activity envelopes", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: null,
        next_page: null,
      }),
    });

    await expect(
      getUserThings(
        {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        },
        1,
      ),
    ).rejects.toThrow("Invalid Lotide API response");
  });

  test("follows and unfollows users on Lotide 0.18 servers", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          accepted: false,
          federation_status: "sent",
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    const ctx = {
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 18,
      login: { token: "token-1" },
    };

    await expect(followUser(ctx, 2)).resolves.toEqual({
      accepted: false,
      federation_status: "sent",
    });
    await unfollowUser(ctx, 2);

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://lotide.fbxl.net/api/unstable/users/2/follow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ try_wait_for_accept: true }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://lotide.fbxl.net/api/unstable/users/2/unfollow",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("blocks user-follow calls on older servers", async () => {
    global.fetch = jest.fn();

    await expect(followUser({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 17,
      login: { token: "token-1" },
    }, 2)).rejects.toThrow("user follows");

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/* end of User.test.ts */
