/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyPowerToolsService.test.ts

    Purpose:

        Verify lists, filters, translation, reporting, and profile contracts.

    Responsibilities:

        - Exercise portable routes across all five supported server families
        - Prove v2 filter behavior and the explicit legacy v1 fallback
        - Verify moderation and translation payload bounds
        - Verify profile multipart requests do not override content type

    This file intentionally does NOT contain:

        - live server mutations
        - React screen tests
        - external translation-provider calls
*/

import {
  addAccountsToList,
  createList,
  deleteList,
  getListAccounts,
  getLists,
  getListTimeline,
  removeAccountsFromList,
  updateList,
} from "../UnfathomablyListsService";
import {
  createFilter,
  deleteFilter,
  getFilters,
  matchLegacyFilters,
  updateFilter,
} from "../UnfathomablyFiltersService";
import {
  reportAccountOrStatus,
  translateStatus,
} from "../UnfathomablySafetyService";
import { updateProfile } from "../UnfathomablyProfileService";
import {
  FEDIVERSE_SERVERS,
  makeAccount,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const families = [
  "akkoma",
  "mastodon",
  "pleroma",
  "rebased",
  "unfathomably",
] as const;

describe("Fediverse power-user service contracts", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test.each(families)("uses standard list routes on %s", async family => {
    const list = {
      exclusive: true,
      id: "list/one",
      replies_policy: "followed",
      title: "Friends",
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => list });
    const context = makeContext(family);

    await getLists(context);
    await createList(context, {
      exclusive: true,
      repliesPolicy: "followed",
      title: " Friends ",
    });
    await updateList(context, "list/one", {
      exclusive: false,
      repliesPolicy: "none",
      title: "Quiet friends",
    });
    await getListAccounts(context, "list/one", "older");
    await addAccountsToList(context, "list/one", ["a", "a", "b"]);
    await removeAccountsFromList(context, "list/one", ["b"]);
    await getListTimeline(context, "list/one", "older-status");
    await deleteList(context, "list/one");

    const origin = FEDIVERSE_SERVERS[family].origin;
    expect(mockFetch.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      [`${origin}/api/v1/lists`, undefined],
      [`${origin}/api/v1/lists`, "POST"],
      [`${origin}/api/v1/lists/list%2Fone`, "PUT"],
      [`${origin}/api/v1/lists/list%2Fone/accounts?limit=80&max_id=older`, undefined],
      [`${origin}/api/v1/lists/list%2Fone/accounts`, "POST"],
      [`${origin}/api/v1/lists/list%2Fone/accounts`, "DELETE"],
      [`${origin}/api/v1/timelines/list/list%2Fone?limit=30&max_id=older-status`, undefined],
      [`${origin}/api/v1/lists/list%2Fone`, "DELETE"],
    ]);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
      exclusive: true,
      replies_policy: "followed",
      title: "Friends",
    });
    expect(JSON.parse(mockFetch.mock.calls[4][1].body)).toEqual({
      account_ids: ["a", "b"],
    });
    mockFetch.mockReset();
  });

  test("validates list names and member selections before a request", async () => {
    expect(() => createList(makeContext(), { title: "" })).toThrow(
      "Enter a name",
    );
    await expect(
      addAccountsToList(makeContext(), "list", []),
    ).rejects.toThrow("Choose at least one");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("retries a Pleroma list without Mastodon-only extensions", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Invalid list parameters",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "portable", title: "Portable" }),
      });

    await expect(createList(makeContext("pleroma"), {
      exclusive: true,
      repliesPolicy: "none",
      title: "Portable",
    })).resolves.toMatchObject({ id: "portable" });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
      exclusive: true,
      replies_policy: "none",
      title: "Portable",
    });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
      title: "Portable",
    });
  });

  test("does not retry a list after an authorization failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "",
    });

    await expect(createList(makeContext("pleroma"), {
      title: "Private",
    })).rejects.toThrow("403");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("reads, creates, updates, and deletes a current v2 filter", async () => {
    const current = {
      context: ["home", "notifications"],
      expires_at: null,
      filter_action: "warn",
      id: "filter/one",
      keywords: [
        { id: "keyword-1", keyword: "spoiler", whole_word: true },
        { id: "keyword-2", keyword: "ending", whole_word: false },
      ],
      statuses: [{ id: "binding-1", status_id: "status-1" }],
      title: "Book spoilers",
    };
    const updated = {
      ...current,
      filter_action: "hide",
      keywords: [{ id: "keyword-1", keyword: "spoiler", whole_word: true }],
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [current] })
      .mockResolvedValueOnce({ ok: true, json: async () => current })
      .mockResolvedValueOnce({ ok: true, json: async () => updated })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const context = makeContext("mastodon");
    const filters = await getFilters(context);

    expect(filters[0]).toMatchObject({
      action: "warn",
      apiVersion: 2,
      contexts: ["home", "notifications"],
      statuses: ["status-1"],
    });
    await createFilter(context, {
      action: "warn",
      contexts: ["home", "home", "notifications"],
      expiresIn: 3_600,
      keywords: [
        { keyword: " spoiler ", wholeWord: true },
        { keyword: "ending", wholeWord: false },
      ],
      title: "Book spoilers",
    });
    await updateFilter(context, filters[0], {
      action: "hide",
      contexts: ["home"],
      keywords: [{ id: "keyword-1", keyword: "spoiler", wholeWord: true }],
      title: "Hide spoilers",
    });
    await deleteFilter(context, filters[0]);

    expect(mockFetch.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      ["https://mastodon.example/api/v2/filters", undefined],
      ["https://mastodon.example/api/v2/filters", "POST"],
      ["https://mastodon.example/api/v2/filters/filter%2Fone", "PUT"],
      ["https://mastodon.example/api/v2/filters/filter%2Fone", "DELETE"],
    ]);
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toMatchObject({
      filter_action: "hide",
      keywords_attributes: [
        { id: "keyword-1", keyword: "spoiler", whole_word: true },
        { _destroy: true, id: "keyword-2" },
      ],
      title: "Hide spoilers",
    });
  });

  test.each(["akkoma", "pleroma", "rebased"] as const)(
    "falls back to the legacy v1 filter API on %s only when v2 is unavailable",
    async family => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: async () => "Not found",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{
            context: ["home"],
            expires_at: null,
            id: "legacy-1",
            irreversible: false,
            phrase: "legacy phrase",
            whole_word: true,
          }],
        });

      await expect(getFilters(makeContext(family))).resolves.toEqual([
        expect.objectContaining({
          apiVersion: 1,
          keywords: [{ keyword: "legacy phrase", wholeWord: true }],
        }),
      ]);
      expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
        `${FEDIVERSE_SERVERS[family].origin}/api/v2/filters`,
        `${FEDIVERSE_SERVERS[family].origin}/api/v1/filters`,
      ]);
    },
  );

  test("does not hide authorization or gateway failures behind a v1 filter retry", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "",
    });

    await expect(getFilters(makeContext("unfathomably"))).rejects.toThrow("502");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("matches active legacy warning and hide filters with whole-word semantics", () => {
    const status = makeStatus("pleroma", {
      content: "<p>A book spoiler, but not spoilery.</p>",
    });
    const filters = [
      {
        action: "warn" as const,
        apiVersion: 1 as const,
        contexts: ["home" as const],
        id: "one",
        keywords: [{ keyword: "spoiler", wholeWord: true }],
        statuses: [],
        title: "Spoilers",
      },
      {
        action: "hide" as const,
        apiVersion: 1 as const,
        contexts: ["notifications" as const],
        id: "two",
        keywords: [{ keyword: "book", wholeWord: false }],
        statuses: [],
        title: "Notification books",
      },
    ];

    expect(matchLegacyFilters(status, filters, "home").map(filter => filter.id)).toEqual([
      "one",
    ]);
  });

  test.each(families)("translates and reports through the selected %s server", async family => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "<p>Translated</p>",
          detected_source_language: "fr",
          provider: "server translator",
          spoiler_text: "Translated warning",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "report-1" }),
      });
    const context = makeContext(family);

    await expect(translateStatus(context, "status/one", " en ")).resolves.toEqual({
      content: "<p>Translated</p>",
      detectedSourceLanguage: "fr",
      provider: "server translator",
      spoilerText: "Translated warning",
    });
    await reportAccountOrStatus(context, {
      accountId: "account/one",
      category: "violation",
      comment: ` ${"x".repeat(1_100)} `,
      forward: true,
      ruleIds: ["rule-1", "rule-1", "rule-2"],
      statusIds: ["status/one", "status/one"],
    });

    const origin = FEDIVERSE_SERVERS[family].origin;
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${origin}/api/v1/statuses/status%2Fone/translate`,
      `${origin}/api/v1/reports`,
    ]);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      target_language: "en",
    });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toMatchObject({
      account_id: "account/one",
      category: "violation",
      forward: true,
      rule_ids: ["rule-1", "rule-2"],
      status_ids: ["status/one"],
    });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).comment).toHaveLength(1_000);
    mockFetch.mockReset();
  });

  test("explains an unavailable translation without retrying another service", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 501,
      statusText: "Not Implemented",
      text: async () => "",
    });

    await expect(
      translateStatus(makeContext("pleroma"), "status", "en"),
    ).rejects.toThrow("not available on this server");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("explains when a post has no source language to translate", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({ error: "Language not specified" }),
    });

    await expect(
      translateStatus(makeContext("pleroma"), "status", "fr"),
    ).rejects.toThrow("does not specify one");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test.each(families)("updates a %s profile with multipart credentials", async family => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeAccount(family, { display_name: "Updated" }),
    });

    await updateProfile(makeContext(family), {
      avatar: {
        mimeType: "image/png",
        name: "avatar.png",
        uri: "file:///private/avatar.png",
      },
      bot: false,
      discoverable: true,
      displayName: "Updated",
      fields: [{ name: "Website", value: "https://example.com" }],
      locked: true,
      note: "Updated biography",
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${FEDIVERSE_SERVERS[family].origin}/api/v1/accounts/update_credentials`,
    );
    expect(init.method).toBe("PATCH");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    mockFetch.mockReset();
  });
});

/* end of UnfathomablyPowerToolsService.test.ts */
