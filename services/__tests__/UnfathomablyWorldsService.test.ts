/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyWorldsService.test.ts

    Purpose:

        Verify the Unfathomably 3.5 Worlds API boundary.

    Responsibilities:

        - Exercise native timelines, discovery, workflows, and resolution
        - Reject malformed provider-neutral data at the client boundary
        - Verify clean degradation when a compatible server lacks Worlds

    This file intentionally does NOT contain:

        - live provider requests
        - React Native presentation tests
        - native-object mutation tests
*/

import {
  getWorldTimeline,
  getWorldWorkflows,
  resolveNativeObject,
  searchWorlds,
} from "../UnfathomablyWorldsService";
import {
  FEDIVERSE_SERVERS,
  makeContext,
  makeNativeStatus,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("UnfathomablyWorldsService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("keeps only native statuses in a selected World timeline", async () => {
    const photo = makeNativeStatus();
    const ordinary = makeStatus("unfathomably", { group: null, pleroma: undefined });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [photo, ordinary],
    });

    await expect(
      getWorldTimeline(makeContext("unfathomably"), "photo", "older"),
    ).resolves.toEqual([photo]);
    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/timelines/public?limit=20&max_id=older&native_family=photo&only_native=true`,
      expect.any(Object),
    );
  });

  test("uses the discoverable group timeline for the Communities World", async () => {
    const groupStatus = makeStatus("unfathomably");
    const ordinary = makeStatus("unfathomably", { id: "ordinary", group: null });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [groupStatus, ordinary],
    });

    await expect(
      getWorldTimeline(makeContext("unfathomably"), "groups"),
    ).resolves.toEqual([groupStatus]);
    expect(mockFetch).toHaveBeenCalledWith(
      `${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/timelines/groups?discover=true&limit=20`,
      expect.any(Object),
    );
  });

  test("normalizes bounded discovery items and provider state", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        has_more: true,
        items: [
          {
            activitypub_url: "https://books.example/activity/1",
            author: "Octavia Butler",
            family: "books",
            fields: { genres: ["Science fiction", "Afrofuturism"] },
            id: "book-1",
            kind: "book",
            source_host: "books.example",
            summary: "A federated book result.",
            thumbnail_url: "https://books.example/covers/1.jpg",
            title: "Parable of the Sower",
            url: "https://books.example/books/1",
          },
          { id: "invalid-without-url", title: "Invalid" },
        ],
        next_offset: 12,
        providers: [
          { host: "books.example", status: "ready", type: "bookwyrm" },
          { status: "broken" },
        ],
        total: 27,
      }),
    });

    await expect(
      searchWorlds(makeContext("unfathomably"), "books", "parable"),
    ).resolves.toEqual({
      hasMore: true,
      items: [{
        activitypubUrl: "https://books.example/activity/1",
        family: "books",
        fields: {
          author: "Octavia Butler",
          genres: ["Science fiction", "Afrofuturism"],
        },
        id: "book-1",
        imageUrl: "https://books.example/covers/1.jpg",
        kind: "book",
        sourceHost: "books.example",
        summary: "A federated book result.",
        title: "Parable of the Sower",
        url: "https://books.example/books/1",
      }],
      nextOffset: 12,
      providers: [{ host: "books.example", status: "ready", type: "bookwyrm" }],
      total: 27,
    });
  });

  test("loads the workflow manifest and resolves local statuses and resources", async () => {
    const status = makeNativeStatus({ id: "resolved-status" });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: 2,
          workflows: [{
            actions: ["open", "review"],
            creation: ["review"],
            family: "books",
            objects: ["Book", "Review"],
            platforms: ["BookWyrm"],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result_type: "status", status }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resource: {
            canonical_url: "https://routes.example/trail/1",
            family: "routes",
            fields: { distance: "8 km" },
            kind: "trail",
            platform: "Mobilizon",
            source_host: "routes.example",
            source_url: "https://routes.example/trail/1",
            summary: "A lakeside trail.",
            title: "Harbour trail",
            type: "Route",
          },
          result_type: "resource",
        }),
      });
    const ctx = makeContext("unfathomably");

    await expect(getWorldWorkflows(ctx)).resolves.toMatchObject({
      version: 2,
      workflows: [{ family: "books", objects: ["Book", "Review"] }],
    });
    await expect(
      resolveNativeObject(ctx, "https://photo.example/p/1"),
    ).resolves.toEqual({ resultType: "status", status });
    await expect(
      resolveNativeObject(ctx, "https://routes.example/trail/1"),
    ).resolves.toEqual({
      resultType: "resource",
      resource: {
        canonicalUrl: "https://routes.example/trail/1",
        family: "routes",
        fields: { distance: "8 km" },
        kind: "trail",
        platform: "Mobilizon",
        sourceHost: "routes.example",
        sourceUrl: "https://routes.example/trail/1",
        summary: "A lakeside trail.",
        title: "Harbour trail",
        type: "Route",
      },
    });
  });

  test("rejects unsafe resolution URLs before making a request", async () => {
    await expect(
      resolveNativeObject(makeContext("unfathomably"), "file:///etc/passwd"),
    ).rejects.toThrow("complete HTTP or HTTPS");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("degrades cleanly on a Pleroma server without Worlds", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    await expect(
      getWorldWorkflows(makeContext("pleroma")),
    ).rejects.toThrow("Worlds are not available on this server.");
  });
});

/* end of UnfathomablyWorldsService.test.ts */
