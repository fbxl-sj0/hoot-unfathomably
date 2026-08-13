/*
    Project: Hoot Unfathomably
    -------------------

    File: UnfathomablyService.test.ts

    Purpose:

        Verify the request boundary against Unfathomably, Rebased, Pleroma,
        Akkoma, and Mastodon-compatible contracts.

    Responsibilities:

        - Verify current Unfathomably endpoints and feature detection
        - Verify degraded Rebased, Pleroma, Akkoma, and Mastodon behavior
        - Guard authentication, group, status, poll, and context contracts

    This file intentionally does NOT contain:

        - live server requests
        - UI behavior
        - provider-specific federation tests
*/

import {
  buildOAuthAuthorizationUrl,
  bookmarkStatus,
  cancelScheduledStatus,
  createStatus,
  deleteStatus,
  dislikeStatus,
  emojiReactionNamesEqual,
  favouriteStatus,
  getAccountStatuses,
  getDiscoverableGroups,
  getGroup,
  getGroups,
  getGroupedNotifications,
  getGroupTimeline,
  getGroupStatuses,
  getHomeTimeline,
  getInstance,
  getInstanceCapabilities,
  getInstanceSoftware,
  getNotifications,
  getQuoteParameter,
  getScheduledStatus,
  getScheduledStatuses,
  getStatus,
  getStatusAncestors,
  getStatusCapabilities,
  getStatusContext,
  getStatusContextWindow,
  getStatusDescendants,
  getStatusEmojiReactions,
  getEmojiReactionRequestName,
  getStatusSource,
  getSupportedServerUrl,
  joinGroup,
  loginWithAuthorizationCode,
  loginWithPassword,
  normalizeScheduledAt,
  normalizeServerUrl,
  readOAuthAuthorizationCode,
  reactToStatus,
  reconcileEmojiReactionMutation,
  registerOAuthApplication,
  reblogStatus,
  resolveStatusByUrl,
  setEventJoined,
  STATUS_CONTEXT_REQUEST_TIMEOUT_MS,
  updateScheduledStatus,
  updateStatus,
  updateMediaDescription,
  uploadMedia,
  voteOnPoll,
} from "../UnfathomablyService";
import {
  FEDIVERSE_SERVERS,
  makeContext,
  makeDegradedStatus,
  makeInstance,
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

  test("accepts every supported secure Fediverse host", () => {
    Object.values(FEDIVERSE_SERVERS).forEach(server => {
      expect(getSupportedServerUrl(server.origin)).toBe(server.origin);
    });
    expect(getSupportedServerUrl("http://10.0.2.2:4000")).toBe(
      "http://10.0.2.2:4000",
    );
    expect(getSupportedServerUrl("http://remote.example")).toBeUndefined();
    expect(getSupportedServerUrl("not a host")).toBeUndefined();
  });

  test.each(["rebased", "unfathomably"] as const)(
    "uses grouped notification v2 on %s",
    async family => {
      const payload = {
        accounts: [],
        notification_groups: [{
          group_key: "favourite-status-bucket",
          most_recent_notification_id: "9",
          notifications_count: 4,
          page_min_id: "6",
          sample_account_ids: [],
          status_id: "status-1",
          type: "favourite",
        }],
        statuses: [],
      };
      mockFetch.mockResolvedValue({ ok: true, json: async () => payload });

      await expect(getGroupedNotifications(makeContext(family), "older")).resolves.toEqual(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        `${FEDIVERSE_SERVERS[family].origin}/api/v2/notifications?limit=30&max_id=older`,
        expect.any(Object),
      );
      mockFetch.mockReset();
    },
  );

  test.each(["akkoma", "mastodon", "pleroma"] as const)(
    "degrades cleanly when %s has no grouped notification API",
    async family => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      });
      await expect(getGroupedNotifications(makeContext(family))).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      mockFetch.mockReset();
    },
  );

  test.each([
    "akkoma",
    "mastodon",
    "pleroma",
    "rebased",
    "unfathomably",
  ] as const)("resolves a federated status through %s v2 search", async family => {
    const source = makeStatus("unfathomably");
    const resolved = makeStatus(family, { url: source.url });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ statuses: [resolved] }),
    });

    await expect(resolveStatusByUrl(makeContext(family), source.url!)).resolves.toEqual(resolved);
    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS[family].origin}/api/v2/search?limit=5&q=${encodeURIComponent(source.url!)}&resolve=true&type=statuses`,
      expect.any(Object),
    );
    mockFetch.mockReset();
  });

  test("resolves and matches a canonical ActivityPub status URI", async () => {
    const source = makeStatus("unfathomably");
    const resolved = makeStatus("mastodon", { uri: source.uri });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ statuses: [resolved] }),
    });

    await expect(
      resolveStatusByUrl(makeContext("mastodon"), source.uri!),
    ).resolves.toEqual(resolved);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`q=${encodeURIComponent(source.uri!)}`),
      expect.any(Object),
    );
  });

  test("uses legacy status search only when v2 is unavailable", async () => {
    const source = makeStatus("unfathomably");
    const resolved = makeStatus("pleroma", { url: source.url });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ statuses: [resolved] }),
      });

    await expect(resolveStatusByUrl(makeContext("pleroma"), source.url!)).resolves.toEqual(resolved);
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      expect.stringContaining("/api/v2/search?"),
      expect.stringContaining("/api/v1/search?"),
    ]);
  });

  test("rejects unsafe status addresses before cross-account resolution", async () => {
    await expect(
      resolveStatusByUrl(makeContext("unfathomably"), "javascript:alert(1)"),
    ).rejects.toThrow("safe federated address");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test.each([
    "akkoma",
    "mastodon",
    "pleroma",
    "rebased",
    "unfathomably",
  ] as const)("uploads described media through %s", async family => {
    const attachment = {
      id: `${family}-media-1`,
      type: "image",
      url: `${FEDIVERSE_SERVERS[family].origin}/media/one.jpg`,
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => attachment });

    await expect(uploadMedia(makeContext(family), {
      description: ` ${"alt ".repeat(500)} `,
      mimeType: "image/jpeg",
      name: "one.jpg",
      uri: "file:///private/one.jpg",
    })).resolves.toEqual(attachment);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${FEDIVERSE_SERVERS[family].origin}/api/v2/media`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    mockFetch.mockReset();
  });

  test("falls back to the older Pleroma media endpoint and updates alt text", async () => {
    const attachment = {
      id: "media/one",
      type: "image",
      url: "https://pleroma.example/media/one.jpg",
    };
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      })
      .mockResolvedValueOnce({ ok: true, json: async () => attachment })
      .mockResolvedValueOnce({ ok: true, json: async () => attachment });

    await uploadMedia(makeContext("pleroma"), {
      uri: "file:///private/one.jpg",
    });
    await updateMediaDescription(makeContext("pleroma"), "media/one", " New alt text ");

    expect(mockFetch.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      ["https://pleroma.example/api/v2/media", "POST"],
      ["https://pleroma.example/api/v1/media", "POST"],
      ["https://pleroma.example/api/v1/media/media%2Fone", "PUT"],
    ]);
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({
      description: "New alt text",
    });
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

  test("coalesces concurrent OAuth application registrations", async () => {
    const registered = {
      client_id: "shared-client",
      client_secret: "shared-secret",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => registered,
    });

    const registrations = await Promise.all([
      registerOAuthApplication(
        FEDIVERSE_SERVERS.unfathomably.origin,
        "urn:ietf:wg:oauth:2.0:oob",
      ),
      registerOAuthApplication(
        FEDIVERSE_SERVERS.unfathomably.origin,
        "urn:ietf:wg:oauth:2.0:oob",
      ),
    ]);

    expect(registrations).toEqual([registered, registered]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
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
    ["Akkoma", "akkoma"],
    ["Mastodon", "mastodon"],
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
    ["Akkoma", "akkoma"],
    ["Mastodon", "mastodon"],
    ["Pleroma", "pleroma"],
    ["Rebased", "rebased"],
    ["Unfathomably", "unfathomably"],
  ] as const)("identifies a live-shaped %s instance response", (name, family) => {
    expect(getInstanceSoftware(makeInstance(family))).toMatchObject({
      family,
      name,
    });
  });

  test("recognizes Akkoma's current custom-reaction feature alias", () => {
    expect(getInstanceCapabilities(makeInstance("akkoma"))).toMatchObject({
      emojiReactions: true,
      groups: false,
      quotes: true,
      worlds: false,
    });
  });

  test("uses populated Pleroma reactions when a top-level array is empty", () => {
    const status = makeStatus("pleroma", {
      emoji_reactions: [],
      pleroma: {
        emoji_reactions: [
          {
            account_ids: ["pleroma-account-1"],
            count: 2,
            me: true,
            name: "❤️",
            url: null,
          },
        ],
      },
    });

    expect(getStatusEmojiReactions(status)).toEqual([
      expect.objectContaining({ count: 2, me: true, name: "❤️" }),
    ]);
  });

  test("preserves the current account marker after an incomplete reaction response", () => {
    const previous = makeStatus("pleroma", {
      emoji_reactions: undefined,
      pleroma: { emoji_reactions: [] },
    });
    const returned = makeStatus("pleroma", {
      emoji_reactions: undefined,
      pleroma: {
        emoji_reactions: [{ count: 1, me: false, name: "❤" }],
      },
    });

    const reconciled = reconcileEmojiReactionMutation(
      returned,
      previous,
      "❤️",
      false,
      "pleroma-account-1",
    );

    expect(getStatusEmojiReactions(reconciled)).toEqual([
      expect.objectContaining({
        account_ids: ["pleroma-account-1"],
        count: 1,
        me: true,
        name: "❤",
      }),
    ]);
  });

  test("matches custom reaction shortcodes with and without Pleroma colons", () => {
    const customReaction = {
      count: 1,
      me: true,
      name: "dinosaur",
      url: "https://pleroma.example/emoji/dinosaur.gif",
    };

    expect(emojiReactionNamesEqual(":dinosaur:", "dinosaur")).toBe(true);
    expect(getEmojiReactionRequestName(customReaction)).toBe(":dinosaur:");
    expect(getEmojiReactionRequestName({
      count: 1,
      me: true,
      name: "😮",
      url: null,
    })).toBe("😮");
  });

  test.each([
    ["Akkoma", "akkoma"],
    ["Mastodon", "mastodon"],
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
        dislike: false,
        emojiReactions: family !== "mastodon",
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

  test("uses Mastodon's current quote field without leaking extension fields", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeStatus("mastodon", { id: "mastodon-quote" }),
    });
    const target = makeStatus("mastodon");

    expect(getQuoteParameter(target)).toBe("quoted_status_id");
    await createStatus(makeContext("mastodon"), "Current quote", {
      quoteId: target.id,
      quoteParameter: getQuoteParameter(target),
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      quoted_status_id: target.id,
      status: "Current quote",
      visibility: "public",
    });
    expect(body.quote_id).toBeUndefined();
    expect(body.group_id).toBeUndefined();
  });

  test("hides a Mastodon quote action when the server denies it", () => {
    const status = makeStatus("mastodon", {
      quote_approval: {
        automatic: [],
        current_user: "denied",
        manual: [],
      },
    });

    expect(getStatusCapabilities(status).quote).toBe(false);
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

  test.each([
    "akkoma",
    "mastodon",
    "pleroma",
    "rebased",
    "unfathomably",
  ] as const)("schedules a %s post with portable fields and an idempotency key", async family => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: `${family}-schedule-1`,
        media_attachments: [],
        params: { text: "Later" },
        scheduled_at: "2030-01-02T12:00:00.000Z",
      }),
    });

    await createStatus(makeContext(family), "Later", {
      idempotencyKey: `draft-${family}`,
      language: "fr",
      mediaIds: ["media-1", "media-1", "media-2"],
      scheduledAt: "2030-01-02T12:00:00.000Z",
      visibility: "private",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS[family].origin}/api/v1/statuses`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${family}-access-token`,
          "Idempotency-Key": `draft-${family}`,
        }),
        method: "POST",
      }),
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      language: "fr",
      media_ids: ["media-1", "media-2"],
      scheduled_at: "2030-01-02T12:00:00.000Z",
      status: "Later",
      visibility: "private",
    });
    mockFetch.mockReset();
  });

  test("rejects invalid or too-near schedules before making a request", async () => {
    expect(() => normalizeScheduledAt("not a date", 1_000)).toThrow(
      "valid date and time",
    );
    expect(() => normalizeScheduledAt(
      new Date(300_999).toISOString(),
      1_000,
    )).toThrow("at least five minutes");
    expect(normalizeScheduledAt(
      new Date(301_000).toISOString(),
      1_000,
    )).toBe("1970-01-01T00:05:01.000Z");

    expect(() => createStatus(makeContext("mastodon"), "Too soon", {
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    })).toThrow("at least five minutes");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("lists, loads, reschedules, and cancels scheduled posts", async () => {
    const scheduled = {
      id: "scheduled/one",
      media_attachments: [],
      params: { text: "Later" },
      scheduled_at: "2030-02-01T14:30:00.000Z",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => scheduled,
    });
    const context = makeContext("unfathomably");

    await getScheduledStatuses(context, "older");
    await getScheduledStatus(context, "scheduled/one");
    await updateScheduledStatus(
      context,
      "scheduled/one",
      "2030-02-01T14:30:00.000Z",
    );
    await cancelScheduledStatus(context, "scheduled/one");

    expect(mockFetch.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      [`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/scheduled_statuses?limit=40&max_id=older`, undefined],
      [`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/scheduled_statuses/scheduled%2Fone`, undefined],
      [`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/scheduled_statuses/scheduled%2Fone`, "PUT"],
      [`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/scheduled_statuses/scheduled%2Fone`, "DELETE"],
    ]);
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({
      scheduled_at: "2030-02-01T14:30:00.000Z",
    });
  });

  test.each([
    "akkoma",
    "mastodon",
    "pleroma",
    "rebased",
    "unfathomably",
  ] as const)("loads source and edits an existing %s post", async family => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "status/one",
          spoiler_text: "Old warning",
          text: "Original source",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeStatus(family, { id: "status/one" }),
      });
    const context = makeContext(family);

    await getStatusSource(context, "status/one");
    await updateStatus(context, "status/one", "Revised source", {
      contentWarning: "New warning",
      language: "en",
      mediaIds: ["attachment-1"],
      sensitive: true,
    });

    expect(mockFetch.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      [`${FEDIVERSE_SERVERS[family].origin}/api/v1/statuses/status%2Fone/source`, undefined],
      [`${FEDIVERSE_SERVERS[family].origin}/api/v1/statuses/status%2Fone`, "PUT"],
    ]);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
      language: "en",
      media_ids: ["attachment-1"],
      sensitive: true,
      spoiler_text: "New warning",
      status: "Revised source",
    });
    mockFetch.mockReset();
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
    await bookmarkStatus(ctx, "status/one");
    await deleteStatus(ctx, "status/one");
    await getNotifications(ctx, "older");
    await getAccountStatuses(ctx, "account/one", "older");

    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/instance`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone/context`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone/favourite`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/friendica/statuses/status%2Fone/dislike`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone/bookmark`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/statuses/status%2Fone`,
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

  test("falls back to the legacy context contract on older compatible servers", async () => {
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
    ).rejects.toThrow("The selected server returned 502 (Bad Gateway).");
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
    ).rejects.toThrow("The selected server returned 502 (Bad Gateway).");
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
