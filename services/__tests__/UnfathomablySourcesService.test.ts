/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablySourcesService.test.ts

    Purpose:

        Verify Unfathomably feed and source API compatibility.

    Responsibilities:

        - Exercise source lists, search, detail, items, relationships, and feed
        - Verify response validation and URL safety
        - Verify clean degradation on Rebased and Pleroma servers

    This file intentionally does NOT contain:

        - live RSS or ActivityPub requests
        - source screen rendering
        - provider discovery tests
*/

import {
  getSource,
  getSourceItems,
  getSources,
  getSourcesTimeline,
  searchSources,
  setSourceFollowed,
} from "../UnfathomablySourcesService";
import {
  FEDIVERSE_SERVERS,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function sourceResponse() {
  return {
    acct: "release-notes@feeds.example",
    actor_type: "Service",
    ap_id: "https://feeds.example/source/release-notes",
    avatar: "https://feeds.example/icon.png",
    capabilities: ["follow", "preview"],
    display_name: "Release notes",
    domain: "feeds.example",
    header: "https://feeds.example/header.png",
    id: "source-1",
    note: "Project release feeds.",
    platform: "rss",
    platform_family: "feed",
    platform_label: "RSS",
    relationship: { following: true, id: "source-1", requested: false },
    source_kind: "rss_feed",
    source_kind_label: "RSS feed",
    uri: "https://feeds.example/source/release-notes",
    url: "https://feeds.example/releases.xml",
    username: "release-notes",
  };
}

describe("UnfathomablySourcesService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("lists and searches normalized feeds on the selected server", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [sourceResponse()] })
      .mockResolvedValueOnce({ ok: true, json: async () => [sourceResponse()] });
    const ctx = makeContext("unfathomably");

    await expect(getSources(ctx)).resolves.toEqual([
      expect.objectContaining({
        display_name: "Release notes",
        platform: "rss",
        relationship: expect.objectContaining({ following: true }),
        source_kind: "rss_feed",
      }),
    ]);
    await expect(searchSources(ctx, "release engineering", 24)).resolves.toHaveLength(1);
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/feeds?limit=24&offset=0`,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/feeds/search?limit=24&offset=24&q=release+engineering`,
    ]);
  });

  test("loads source detail and normalized status and resource items", async () => {
    const status = makeStatus("unfathomably", { id: "source-status" });
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => sourceResponse() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              capabilities: ["reply", "favourite"],
              id: "status-item",
              platform: "rss",
              platform_label: "RSS",
              source_kind: "rss_feed",
              source_kind_label: "RSS feed",
              status,
              title: "A local status wrapper",
              type: "Article",
            },
            {
              id: "resource-item",
              platform: "rss",
              platform_label: "RSS",
              source_kind: "rss_feed",
              source_kind_label: "RSS feed",
              summary: "A remote entry preview.",
              thumbnail_url: "https://feeds.example/preview.jpg",
              title: "Remote release",
              type: "Article",
              url: "https://feeds.example/releases/1",
            },
            { title: "Invalid without an identifier" },
          ],
          next: "https://unfathomably.example/api/v1/feeds/source-1/items?page=2",
          total_items: 2,
        }),
      });
    const ctx = makeContext("unfathomably");

    await expect(getSource(ctx, "source/one")).resolves.toMatchObject({
      id: "source-1",
      platform_label: "RSS",
    });
    await expect(getSourceItems(ctx, "source/one")).resolves.toEqual({
      items: [
        expect.objectContaining({ id: "status-item", status }),
        expect.objectContaining({
          id: "resource-item",
          thumbnailUrl: "https://feeds.example/preview.jpg",
          url: "https://feeds.example/releases/1",
        }),
      ],
      next: "https://unfathomably.example/api/v1/feeds/source-1/items?page=2",
      totalItems: 2,
    });
  });

  test("follows feeds and loads only valid statuses from the aggregate timeline", async () => {
    const status = makeStatus("unfathomably", { id: "feed-status" });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ following: true, id: "source-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [status, { id: "invalid-status" }],
      });
    const ctx = makeContext("unfathomably");

    await expect(setSourceFollowed(ctx, "source/one", true)).resolves.toEqual({
      blocked_by: false,
      federation_blocked: false,
      following: true,
      id: "source-1",
      muting: null,
      notifying: null,
      requested: false,
    });
    await expect(getSourcesTimeline(ctx, "older")).resolves.toEqual([status]);
    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/feeds/source%2Fone/follow`,
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/timelines/feeds?limit=30&max_id=older`,
    ]);
  });

  test.each(["rebased", "pleroma"] as const)(
    "degrades cleanly when %s does not expose feeds",
    async family => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });
      await expect(getSources(makeContext(family))).rejects.toThrow(
        "Feeds are not available on this server.",
      );
    },
  );
});

/* end of UnfathomablySourcesService.test.ts */
