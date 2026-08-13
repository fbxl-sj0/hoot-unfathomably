/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyAccountService.test.ts

    Purpose:

        Verify portable account workflows across every supported server family.

    Responsibilities:

        - Exercise account, relationship, follow, safety, and consent routes
        - Verify account search degradation for older Pleroma/Rebased servers
        - Guard cursor bounds, authentication, and invalid identifiers

    This file intentionally does NOT contain:

        - Live relationship mutations
        - Screen behavior
        - Group or Source follows
*/

import {
  getAccount,
  getAccountFollowers,
  getAccountFollowing,
  getAccountRelationship,
  getBookmarks,
  getFollowRequests,
  resolveFollowRequest,
  searchAccounts,
  setAccountBlocked,
  setAccountFollowed,
  setAccountMuted,
} from "../UnfathomablyAccountService";
import {
  FEDIVERSE_SERVERS,
  FediverseServerFamily,
  makeAccount,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const families: FediverseServerFamily[] = [
  "akkoma",
  "mastodon",
  "pleroma",
  "rebased",
  "unfathomably",
];

function ok(value: unknown) {
  return { ok: true, json: async () => value };
}

function relationship(id: string, overrides = {}) {
  return {
    blocked_by: false,
    blocking: false,
    followed_by: false,
    following: false,
    id,
    muting: false,
    requested: false,
    ...overrides,
  };
}

describe("UnfathomablyAccountService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test.each(families)(
    "uses the shared %s account and relationship contract",
    async family => {
      const ctx = makeContext(family);
      const origin = FEDIVERSE_SERVERS[family].origin;
      const account = makeAccount(family, { id: "account/one" });
      const status = makeStatus(family);
      const neutral = relationship("account/one");
      mockFetch
        .mockResolvedValueOnce(ok(account))
        .mockResolvedValueOnce(ok([neutral]))
        .mockResolvedValueOnce(ok(relationship("account/one", { following: true })))
        .mockResolvedValueOnce(ok(neutral))
        .mockResolvedValueOnce(ok(relationship("account/one", { muting: true })))
        .mockResolvedValueOnce(ok(neutral))
        .mockResolvedValueOnce(ok(relationship("account/one", { blocking: true })))
        .mockResolvedValueOnce(ok(neutral))
        .mockResolvedValueOnce(ok([account]))
        .mockResolvedValueOnce(ok([account]))
        .mockResolvedValueOnce(ok([account]))
        .mockResolvedValueOnce(ok(relationship("account/one", { followed_by: true })))
        .mockResolvedValueOnce(ok(neutral))
        .mockResolvedValueOnce(ok([status]));

      await getAccount(ctx, "account/one");
      await getAccountRelationship(ctx, "account/one");
      await setAccountFollowed(ctx, "account/one", true);
      await setAccountFollowed(ctx, "account/one", false);
      await setAccountMuted(ctx, "account/one", true);
      await setAccountMuted(ctx, "account/one", false);
      await setAccountBlocked(ctx, "account/one", true);
      await setAccountBlocked(ctx, "account/one", false);
      await getAccountFollowers(ctx, "account/one", "older");
      await getAccountFollowing(ctx, "account/one", "older");
      await getFollowRequests(ctx, "older");
      await resolveFollowRequest(ctx, "account/one", true);
      await resolveFollowRequest(ctx, "account/one", false);
      await getBookmarks(ctx, "older");

      expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
        `${origin}/api/v1/accounts/account%2Fone`,
        `${origin}/api/v1/accounts/relationships?id%5B%5D=account%2Fone`,
        `${origin}/api/v1/accounts/account%2Fone/follow`,
        `${origin}/api/v1/accounts/account%2Fone/unfollow`,
        `${origin}/api/v1/accounts/account%2Fone/mute`,
        `${origin}/api/v1/accounts/account%2Fone/unmute`,
        `${origin}/api/v1/accounts/account%2Fone/block`,
        `${origin}/api/v1/accounts/account%2Fone/unblock`,
        `${origin}/api/v1/accounts/account%2Fone/followers?limit=40&max_id=older`,
        `${origin}/api/v1/accounts/account%2Fone/following?limit=40&max_id=older`,
        `${origin}/api/v1/follow_requests?limit=40&max_id=older`,
        `${origin}/api/v1/follow_requests/account%2Fone/authorize`,
        `${origin}/api/v1/follow_requests/account%2Fone/reject`,
        `${origin}/api/v1/bookmarks?limit=30&max_id=older`,
      ]);
      mockFetch.mock.calls.forEach(call => {
        expect(call[1].headers.Authorization).toBe(
          `Bearer ${family}-access-token`,
        );
      });
      expect(JSON.parse(mockFetch.mock.calls[4][1].body)).toEqual({
        notifications: true,
      });
    },
  );

  test.each(families)("searches for accounts on %s", async family => {
    const account = makeAccount(family);
    mockFetch.mockResolvedValueOnce(ok({ accounts: [account] }));

    await expect(
      searchAccounts(makeContext(family), " @alice@example.test ", 500),
    ).resolves.toEqual([account]);
    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS[family].origin}/api/v2/search?limit=40&q=%40alice%40example.test&resolve=true&type=accounts`,
      expect.any(Object),
    );
  });

  test("falls back to the older account-search route only when v2 is unavailable", async () => {
    const account = makeAccount("pleroma");
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => '{"error":"Not implemented"}',
      })
      .mockResolvedValueOnce(ok([account]));

    await expect(
      searchAccounts(makeContext("pleroma"), "alice"),
    ).resolves.toEqual([account]);
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v2/search?limit=20&q=alice&resolve=true&type=accounts`,
      `${FEDIVERSE_SERVERS.pleroma.origin}/api/v1/accounts/search?limit=20&q=alice&resolve=true`,
    ]);
  });

  test("does not hide gateway failures behind the legacy search fallback", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "<html>gateway failed</html>",
    });

    await expect(
      searchAccounts(makeContext("unfathomably"), "alice"),
    ).rejects.toThrow("502 (Bad Gateway)");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid account identifiers before a network request", async () => {
    await expect(
      getAccount(makeContext("mastodon"), " "),
    ).rejects.toThrow("invalid account identifier");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

/* end of UnfathomablyAccountService.test.ts */
