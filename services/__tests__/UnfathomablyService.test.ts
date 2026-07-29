/*
    Project: Hoot Unfathomably
    -------------------

    File: UnfathomablyService.test.ts

    Purpose:

        Verify the request boundary against Unfathomably, Rebased, and
        Pleroma-compatible contracts.
*/

import {
  buildOAuthAuthorizationUrl,
  createStatus,
  dislikeStatus,
  favouriteStatus,
  getAccountStatuses,
  getGroups,
  getGroupTimeline,
  getGroupStatuses,
  getHomeTimeline,
  getInstance,
  getNotifications,
  getStatus,
  getStatusCapabilities,
  getStatusContext,
  getSupportedServerUrl,
  joinGroup,
  loginWithAuthorizationCode,
  loginWithPassword,
  normalizeServerUrl,
  readOAuthAuthorizationCode,
  reactToStatus,
  registerOAuthApplication,
  reblogStatus,
  STATUS_CONTEXT_REQUEST_TIMEOUT_MS,
} from "../UnfathomablyService";
import {
  FEDIVERSE_SERVERS,
  makeContext,
  makeDegradedStatus,
  makeNotification,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("UnfathomablyService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("normalizes a selected Rebased server to its origin", () => {
    expect(normalizeServerUrl(" rebased.example/ ")).toBe(
      FEDIVERSE_SERVERS.rebased.origin,
    );
    expect(normalizeServerUrl("https://rebased.example/a/pasted/path?x=1")).toBe(
      FEDIVERSE_SERVERS.rebased.origin,
    );
  });

  test("accepts secure Unfathomably, Rebased, and Pleroma hosts", () => {
    Object.values(FEDIVERSE_SERVERS).forEach(server => {
      expect(getSupportedServerUrl(server.origin)).toBe(server.origin);
    });
    expect(getSupportedServerUrl("http://10.0.2.2:4000")).toBe(
      "http://10.0.2.2:4000",
    );
    expect(getSupportedServerUrl("http://remote.example")).toBeUndefined();
    expect(getSupportedServerUrl("not a host")).toBeUndefined();
  });

  test("refuses to send credentials or tokens to a remote plaintext server", async () => {
    await expect(
      getHomeTimeline({
        apiUrl: "http://rebased.example",
        login: { token: "secret" },
      }),
    ).rejects.toThrow("must use HTTPS");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("registers an OAuth app, exchanges credentials, and verifies the account", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          client_id: "client-id",
          client_secret: "client-secret",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1", username: "alice" }),
      });

    await expect(
      loginWithPassword(
        FEDIVERSE_SERVERS.pleroma.origin,
        "alice",
        "password",
      ),
    ).resolves.toMatchObject({
      token: "access-token",
      account: { id: "1", username: "alice" },
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/apps`,
      expect.objectContaining({ method: "POST" }),
    );
    const tokenBody = new URLSearchParams(mockFetch.mock.calls[1][1].body);
    expect(Object.fromEntries(tokenBody.entries())).toEqual({
      grant_type: "password",
      client_id: "client-id",
      client_secret: "client-secret",
      username: "alice",
      password: "password",
      scope: "read write follow push",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/accounts/verify_credentials`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  test("builds a server-specific browser authorization request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        client_id: "custom-client",
        client_secret: "custom-secret",
      }),
    });

    const application = await registerOAuthApplication(
      FEDIVERSE_SERVERS.rebased.origin,
      "hoot-unfathomably://oauth/callback",
    );
    const authorizationUrl = new URL(
      buildOAuthAuthorizationUrl(
        FEDIVERSE_SERVERS.rebased.origin,
        application,
        "hoot-unfathomably://oauth/callback",
        "state-123",
      ),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS.rebased.origin}/api/v1/apps`,
      expect.objectContaining({
        body: expect.stringContaining(
          "hoot-unfathomably://oauth/callback",
        ),
        method: "POST",
      }),
    );
    expect(authorizationUrl.origin).toBe(
      FEDIVERSE_SERVERS.rebased.origin,
    );
    expect(authorizationUrl.pathname).toBe("/oauth/authorize");
    expect(Object.fromEntries(authorizationUrl.searchParams.entries())).toEqual({
      client_id: "custom-client",
      redirect_uri: "hoot-unfathomably://oauth/callback",
      response_type: "code",
      scope: "read write follow push",
      state: "state-123",
    });
  });

  test("validates the browser callback state and authorization code", () => {
    expect(
      readOAuthAuthorizationCode(
        "hoot-unfathomably://oauth/callback?code=code-1&state=state-1",
        "state-1",
      ),
    ).toBe("code-1");
    expect(() =>
      readOAuthAuthorizationCode(
        "hoot-unfathomably://oauth/callback?code=code-1&state=wrong",
        "state-1",
      ),
    ).toThrow("invalid login state");
    expect(() =>
      readOAuthAuthorizationCode(
        "hoot-unfathomably://oauth/callback?error=access_denied&state=state-1",
        "state-1",
      ),
    ).toThrow("access_denied");
  });

  test("exchanges a browser authorization code on the selected host", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "browser-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "9", username: "remote-user" }),
      });

    await expect(
      loginWithAuthorizationCode(
        FEDIVERSE_SERVERS.unfathomably.origin,
        {
          client_id: "client-id",
          client_secret: "client-secret",
        },
        "hoot-unfathomably://oauth/callback",
        "authorization-code",
      ),
    ).resolves.toEqual({
      token: "browser-token",
      account: { id: "9", username: "remote-user" },
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/oauth/token`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      Object.fromEntries(
        new URLSearchParams(mockFetch.mock.calls[0][1].body).entries(),
      ),
    ).toEqual({
      grant_type: "authorization_code",
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uri: "hoot-unfathomably://oauth/callback",
      code: "authorization-code",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/accounts/verify_credentials`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer browser-token",
        }),
      }),
    );
  });

  test.each([
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)(
    "loads the authenticated home timeline from %s",
    async (_label, family) => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const ctx = makeContext(family);

      await getHomeTimeline(ctx, "123");

      expect(mockFetch).toHaveBeenCalledWith(
        `${FEDIVERSE_SERVERS[family].origin}/api/v1/timelines/home?limit=30&max_id=123`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${family}-access-token`,
          }),
        }),
      );
    },
  );

  test("keeps only statuses with group context in the group feed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "group-post", group: { id: "group-1", display_name: "A group" } },
        { id: "ordinary-post" },
        { id: "boosted-group-post", reblog: { group: { id: "group-2", display_name: "Another group" } } },
      ],
    });

    await expect(getGroupTimeline(makeContext("unfathomably"))).resolves.toEqual([
      { id: "group-post", group: { id: "group-1", display_name: "A group" } },
      { id: "boosted-group-post", reblog: { group: { id: "group-2", display_name: "Another group" } } },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/timelines/groups?limit=30`,
      expect.any(Object),
    );
  });

  test.each([
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)(
    "detects only baseline status capabilities for degraded %s responses",
    (_label, family) => {
      expect(getStatusCapabilities(makeDegradedStatus(family))).toEqual({
        dislike: false,
        emojiReactions: false,
        quote: false,
      });
      expect(getStatusCapabilities(makeStatus(family))).toEqual({
        dislike: true,
        emojiReactions: true,
        quote: true,
      });
    },
  );

  test("normalizes unsupported Pleroma group endpoints", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "{\"error\":\"Not found\"}",
    });
    const ctx = makeContext("pleroma");

    await expect(getGroupTimeline(ctx)).rejects.toThrow(
      "Group timelines are not available on this server.",
    );
    await expect(getGroups(ctx)).rejects.toThrow(
      "Groups are not available on this server.",
    );
    await expect(getGroupStatuses(ctx, "missing")).rejects.toThrow(
      "Group discussions are not available on this server.",
    );
    await expect(joinGroup(ctx, "missing")).rejects.toThrow(
      "Group membership is not available on this server.",
    );
  });

  test("normalizes unsupported optional reaction endpoints", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 501,
      text: async () => "{\"error\":\"Not implemented\"}",
    });
    const ctx = makeContext("rebased");

    await expect(dislikeStatus(ctx, "status-1")).rejects.toThrow(
      "Thumbs-down reactions are not available on this server.",
    );
    await expect(reactToStatus(ctx, "status-1", "❤️")).rejects.toThrow(
      "Emoji reactions are not available on this server.",
    );
  });

  test("uses Rebased quote/repost fields and the Pleroma reaction extension", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "post-1" }) });
    const ctx = makeContext("rebased");

    await createStatus(ctx, "My thoughts", { quoteId: "quoted-post" });
    await reblogStatus(ctx, "post-1");
    await reactToStatus(ctx, "post-1", "👍");

    expect(mockFetch).toHaveBeenNthCalledWith(1, `${FEDIVERSE_SERVERS.rebased.origin}/api/v1/statuses`, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({ status: "My thoughts", quote_id: "quoted-post" }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, `${FEDIVERSE_SERVERS.rebased.origin}/api/v1/statuses/post-1/reblog`, expect.objectContaining({ method: "POST" }));
    expect(mockFetch).toHaveBeenNthCalledWith(3, `${FEDIVERSE_SERVERS.rebased.origin}/api/v1/pleroma/statuses/post-1/reactions/%F0%9F%91%8D`, expect.objectContaining({ method: "PUT" }));
  });

  test("uses the Unfathomably group contract for discovery, discussion, and membership", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const ctx = makeContext("unfathomably");

    await getGroups(ctx, "federation");
    await getGroupStatuses(ctx, "group/one", "older");
    await joinGroup(ctx, "group/one");
    await joinGroup(ctx, "group/one", true);

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/groups?q=federation`,
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/groups/group%2Fone/statuses?limit=30&max_id=older`,
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/groups/group%2Fone/join`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/groups/group%2Fone/leave`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("uses common Mastodon endpoints for statuses, context, notifications, and profiles", async () => {
    const status = makeStatus("pleroma");
    const notification = makeNotification("pleroma");
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ title: "Pleroma Test" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => status })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ancestors: [], descendants: [] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => status })
      .mockResolvedValueOnce({ ok: true, json: async () => status })
      .mockResolvedValueOnce({ ok: true, json: async () => [notification] })
      .mockResolvedValueOnce({ ok: true, json: async () => [status] });
    const ctx = makeContext("pleroma");

    await getInstance(FEDIVERSE_SERVERS.pleroma.origin);
    await getStatus(ctx, "status/one");
    await getStatusContext(ctx, "status/one");
    await favouriteStatus(ctx, "status/one");
    await dislikeStatus(ctx, "status/one");
    await getNotifications(ctx, "older");
    await getAccountStatuses(ctx, "account/one", "older");

    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/instance`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone/context`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone/favourite`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/friendica/statuses/status%2Fone/dislike`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/notifications?limit=30&max_id=older`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/accounts/account%2Fone/statuses?limit=30&max_id=older`,
    ]);
  });

  test("reports a stable timeout for an oversized status context", async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(
              new TypeError("fetch failed: Fetch request has been canceled"),
            );
          });
        }),
    );

    const contextRequest = getStatusContext(
      makeContext("unfathomably"),
      "large-thread",
    );
    const capturedError = contextRequest.catch(error => error);

    await jest.advanceTimersByTimeAsync(
      STATUS_CONTEXT_REQUEST_TIMEOUT_MS,
    );
    await expect(capturedError).resolves.toThrow(
      "did not respond within 120 seconds",
    );
    jest.useRealTimers();
  });
});

/* end of UnfathomablyService.test.ts */
