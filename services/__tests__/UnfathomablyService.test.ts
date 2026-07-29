/*
    Project: Hoot Mobile
    -------------------

    File: UnfathomablyService.test.ts

    Purpose:

        Verify the Mastodon-compatible request boundary used by Hoot
        Unfathomably.
*/

import {
  buildOAuthAuthorizationUrl,
  createStatus,
  getGroupTimeline,
  getHomeTimeline,
  getSupportedServerUrl,
  loginWithAuthorizationCode,
  loginWithPassword,
  normalizeServerUrl,
  readOAuthAuthorizationCode,
  reactToStatus,
  registerOAuthApplication,
  reblogStatus,
} from "../UnfathomablyService";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("UnfathomablyService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("normalizes server URLs without changing an explicit scheme", () => {
    expect(normalizeServerUrl(" example.test/ ")).toBe("https://example.test");
    expect(normalizeServerUrl("http://example.test/")).toBe("http://example.test");
    expect(normalizeServerUrl("https://example.test/a/pasted/path?x=1")).toBe(
      "https://example.test",
    );
  });

  test("accepts arbitrary secure hosts and local development HTTP only", () => {
    expect(getSupportedServerUrl("pleroma.example")).toBe(
      "https://pleroma.example",
    );
    expect(getSupportedServerUrl("https://mastodon.example/path")).toBe(
      "https://mastodon.example",
    );
    expect(getSupportedServerUrl("http://10.0.2.2:4000")).toBe(
      "http://10.0.2.2:4000",
    );
    expect(getSupportedServerUrl("http://remote.example")).toBeUndefined();
    expect(getSupportedServerUrl("not a host")).toBeUndefined();
  });

  test("refuses to send credentials or tokens to a remote plaintext server", async () => {
    await expect(getHomeTimeline({ apiUrl: "http://example.test", login: { token: "secret" } })).rejects.toThrow("must use HTTPS");
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
      loginWithPassword("https://example.test", "alice", "password"),
    ).resolves.toMatchObject({
      token: "access-token",
      account: { id: "1", username: "alice" },
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://example.test/api/v1/apps",
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
      "https://example.test/api/v1/accounts/verify_credentials",
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
      "https://community.example",
      "hoot-unfathomably://oauth/callback",
    );
    const authorizationUrl = new URL(
      buildOAuthAuthorizationUrl(
        "https://community.example",
        application,
        "hoot-unfathomably://oauth/callback",
        "state-123",
      ),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://community.example/api/v1/apps",
      expect.objectContaining({
        body: expect.stringContaining(
          "hoot-unfathomably://oauth/callback",
        ),
        method: "POST",
      }),
    );
    expect(authorizationUrl.origin).toBe("https://community.example");
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
        "https://remote.example",
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
      "https://remote.example/oauth/token",
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
      "https://remote.example/api/v1/accounts/verify_credentials",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer browser-token",
        }),
      }),
    );
  });

  test("loads the authenticated home timeline with a Mastodon cursor", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

    await getHomeTimeline({ apiUrl: "https://example.test", login: { token: "secret" } }, "123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.test/api/v1/timelines/home?limit=30&max_id=123",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
  });

  test("keeps only statuses with group context in the group feed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "group-post", group: { id: "group-1", display_name: "A group" } },
        { id: "ordinary-post" },
        { id: "boosted-group-post", reblog: { group: { id: "group-2", display_name: "Another group" } } },
      ],
    });

    await expect(getGroupTimeline({ apiUrl: "https://example.test", login: { token: "secret" } })).resolves.toEqual([
      { id: "group-post", group: { id: "group-1", display_name: "A group" } },
      { id: "boosted-group-post", reblog: { group: { id: "group-2", display_name: "Another group" } } },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.test/api/v1/timelines/groups?limit=30",
      expect.any(Object),
    );
  });

  test("uses the Unfathomably endpoints for quote reposts, reposts, and emoji reactions", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "post-1" }) });
    const ctx = { apiUrl: "https://example.test", login: { token: "secret" } };

    await createStatus(ctx, "My thoughts", { quoteId: "quoted-post" });
    await reblogStatus(ctx, "post-1");
    await reactToStatus(ctx, "post-1", "👍");

    expect(mockFetch).toHaveBeenNthCalledWith(1, "https://example.test/api/v1/statuses", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({ status: "My thoughts", quote_id: "quoted-post" }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, "https://example.test/api/v1/statuses/post-1/reblog", expect.objectContaining({ method: "POST" }));
    expect(mockFetch).toHaveBeenNthCalledWith(3, "https://example.test/api/v1/pleroma/statuses/post-1/reactions/%F0%9F%91%8D", expect.objectContaining({ method: "PUT" }));
  });
});

/* end of UnfathomablyService.test.ts */
