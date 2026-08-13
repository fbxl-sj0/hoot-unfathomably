/*
    Project: Hoot Unfathomably
    -------------------

    File: UnfathomablyService.test.ts

    Purpose:

        Verify the request boundary against Unfathomably, Rebased, and
        Pleroma-compatible contracts.

    Responsibilities:

        - Verify current Unfathomably endpoints and feature detection
        - Verify degraded Rebased and Pleroma request behavior
        - Guard authentication, group, status, poll, and context contracts

    This file intentionally does NOT contain:

        - live server requests
        - UI behavior
        - provider-specific federation tests
*/

import {
  buildOAuthAuthorizationUrl,
  createStatus,
  dislikeStatus,
  favouriteStatus,
  getAccountStatuses,
  getDiscoverableGroups,
  getGroup,
  getGroups,
  getGroupTimeline,
  getGroupStatuses,
  getHomeTimeline,
  getInstance,
  getInstanceCapabilities,
  getNotifications,
  getStatus,
  getStatusAncestors,
  getStatusCapabilities,
  getStatusContext,
  getStatusContextWindow,
  getStatusDescendants,
  getSupportedServerUrl,
  joinGroup,
  loginWithAuthorizationCode,
  loginWithPassword,
  normalizeServerUrl,
  readOAuthAuthorizationCode,
  reactToStatus,
  registerOAuthApplication,
  reblogStatus,
  setEventJoined,
  STATUS_CONTEXT_REQUEST_TIMEOUT_MS,
  voteOnPoll,
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

  test("detects the Unfathomably 3.5 extension manifest", () => {
    expect(getInstanceCapabilities({
      version: "2.7.2 (compatible; unfathomably-be 3.5.0+unfathomably-be)",
      pleroma: {
        metadata: {
          features: [
            "events",
            "groups",
            "groups_discovery",
            "groups_search",
            "notifications_v2",
            "pleroma_dislikes",
            "pleroma_emoji_reactions",
            "quote_posting",
            "sources",
          ],
        },
      },
      unfathomably: {
        backend: "unfathomably-be 3.5.0+unfathomably-be",
        frontend: "unfathomably-fe 3.4.0",
      },
    })).toEqual({
      dislikes: true,
      emojiReactions: true,
      events: true,
      groupedNotifications: true,
      groupDiscovery: true,
      groupSearch: true,
      groups: true,
      quotes: true,
      sources: true,
      worlds: true,
    });

    expect(getInstanceCapabilities({ version: "2.9.0" })).toEqual({
      dislikes: false,
      emojiReactions: false,
      events: false,
      groupedNotifications: false,
      groupDiscovery: false,
      groupSearch: false,
      groups: false,
      quotes: false,
      sources: false,
      worlds: false,
    });
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

  test("omits community and quote fields from an ordinary reply", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ordinary-reply" }),
    });

    await createStatus(makeContext("pleroma"), "A plain reply", {
      inReplyToId: "ordinary-parent",
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      in_reply_to_id: "ordinary-parent",
      status: "A plain reply",
      visibility: "public",
    });
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
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/groups/search?q=federation`,
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

  test("loads current group detail and discovery without weakening older fallbacks", async () => {
    const group = {
      id: "group-1",
      display_name: "Current group",
      relationship: { can_follow: true, can_post: true, member: false },
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => group })
      .mockResolvedValueOnce({ ok: true, json: async () => [group] });
    const ctx = makeContext("unfathomably");

    await expect(getGroup(ctx, "group/one")).resolves.toEqual(group);
    await expect(getDiscoverableGroups(ctx)).resolves.toEqual([group]);

    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/groups/group%2Fone`,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/groups/discover?limit=50`,
    ]);
  });

  test("publishes and votes on an Unfathomably poll with bounded fields", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "status-with-poll" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "poll-1", voted: true }) });
    const ctx = makeContext("unfathomably");

    await createStatus(ctx, "Pick a release day", {
      contentWarning: "Release planning",
      poll: {
        expiresIn: 86_400,
        multiple: true,
        options: [" Monday ", "Friday", "Next week", "A weekend", "Ignored fifth"],
      },
      sensitive: true,
      visibility: "unlisted",
    });
    await voteOnPoll(ctx, "poll/one", [2, 0, 2, -1, 100]);

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      poll: {
        expires_in: 86_400,
        multiple: true,
        options: ["Monday", "Friday", "Next week", "A weekend"],
      },
      sensitive: true,
      spoiler_text: "Release planning",
      status: "Pick a release day",
      visibility: "unlisted",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/polls/poll%2Fone/votes`,
      expect.objectContaining({
        body: JSON.stringify({ choices: [2, 0] }),
        method: "POST",
      }),
    );
  });

  test("joins and leaves current Unfathomably and Rebased events", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "event-status" }),
    });
    const ctx = makeContext("unfathomably");

    await setEventJoined(ctx, "event/one", true);
    await setEventJoined(ctx, "event/one", false);

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/pleroma/events/event%2Fone/join`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/pleroma/events/event%2Fone/leave`,
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

  test("loads a small bounded context window and keeps one look-ahead item", async () => {
    const ancestors = Array.from({ length: 11 }, (_value, index) =>
      makeStatus("unfathomably", { id: `ancestor-${index}` }),
    );
    const descendants = Array.from({ length: 21 }, (_value, index) =>
      makeStatus("unfathomably", { id: `descendant-${index}` }),
    );
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ancestors })
      .mockResolvedValueOnce({ ok: true, json: async () => descendants });
    const ctx = makeContext("unfathomably");

    await expect(
      getStatusContextWindow(ctx, "hell/thread"),
    ).resolves.toEqual({
      ancestors: ancestors.slice(1),
      descendants: descendants.slice(0, 20),
      hasMoreAncestors: true,
      hasMoreDescendants: true,
      mode: "paged",
    });
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/statuses/hell%2Fthread/context/ancestors?limit=11`,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/statuses/hell%2Fthread/context/descendants?limit=21`,
    ]);
  });

  test("uses directional cursors for just-in-time context pages", async () => {
    const statuses = [
      makeStatus("unfathomably", { id: "first" }),
      makeStatus("unfathomably", { id: "second" }),
      makeStatus("unfathomably", { id: "look-ahead" }),
    ];
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => statuses })
      .mockResolvedValueOnce({ ok: true, json: async () => statuses });
    const ctx = makeContext("unfathomably");

    await expect(
      getStatusAncestors(ctx, "current", "first-page", 2),
    ).resolves.toEqual({
      statuses: statuses.slice(1),
      hasMore: true,
    });
    await expect(
      getStatusDescendants(ctx, "current", "last-page", 2),
    ).resolves.toEqual({
      statuses: statuses.slice(0, 2),
      hasMore: true,
    });
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/statuses/current/context/ancestors?limit=3&max_id=first-page`,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/statuses/current/context/descendants?limit=3&min_id=last-page`,
    ]);
  });

  test("falls back to the legacy context contract on older Rebased and Pleroma servers", async () => {
    const unavailable = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "{\"error\":\"Not implemented\"}",
    };
    const legacyContext = {
      ancestors: [makeStatus("pleroma", { id: "old-parent" })],
      descendants: [makeStatus("pleroma", { id: "old-reply" })],
    };
    mockFetch
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => legacyContext,
      });
    const ctx = makeContext("pleroma");

    await expect(
      getStatusContextWindow(ctx, "old-server-status"),
    ).resolves.toEqual({
      ...legacyContext,
      hasMoreAncestors: false,
      hasMoreDescendants: false,
      mode: "legacy",
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2][0]).toBe(
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/old-server-status/context`,
    );
  });

  test("does not retry the unbounded endpoint after a bounded page gets a gateway error", async () => {
    const gatewayError = {
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "<html><body>nginx</body></html>",
    };
    mockFetch.mockResolvedValue(gatewayError);

    await expect(
      getStatusContextWindow(
        makeContext("unfathomably"),
        "large-thread",
      ),
    ).rejects.toThrow("Unfathomably returned 502 (Bad Gateway).");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls.map(call => call[0])).not.toContain(
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/statuses/large-thread/context`,
    );
  });

  test("does not fall back when only one bounded direction is unavailable and the other fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "{\"error\":\"Not implemented\"}",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => "<html><body>nginx</body></html>",
      });

    await expect(
      getStatusContextWindow(
        makeContext("unfathomably"),
        "partially-failed-thread",
      ),
    ).rejects.toThrow("Unfathomably returned 502 (Bad Gateway).");
    expect(mockFetch).toHaveBeenCalledTimes(2);
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
