/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyRoutesService.test.ts

    Purpose:

        Protect the GPX upload and route-publication API contracts.

    Responsibilities:

        - Verify GPX uses the standard authenticated media endpoint
        - Verify route metadata matches Unfathomably native objects
        - Verify invalid local files are rejected before network activity
        - Verify older Rebased and Pleroma servers fail cleanly

    This file intentionally does NOT contain:

        - live publication
        - device location subscriptions
        - React screen rendering
*/

import {
  publishRoute,
  uploadRouteGpx,
} from "../UnfathomablyRoutesService";
import {
  FEDIVERSE_SERVERS,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { UTF8: "utf8" },
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const points = [
  { elevation: 10, latitude: 43.65, longitude: -79.38, timestamp: 1_786_622_400_000 },
  { elevation: 16, latitude: 43.651, longitude: -79.38, timestamp: 1_786_622_460_000 },
];

describe("UnfathomablyRoutesService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test("uploads a local GPX document through the media API", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "media-gpx-1" }) });

    await expect(uploadRouteGpx(makeContext(), {
      name: "harbour-path.gpx",
      uri: "file:///cache/harbour-path.gpx",
    })).resolves.toBe("media-gpx-1");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/media`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  test("publishes derived metrics through the routes native-object template", async () => {
    const status = makeStatus("unfathomably", { id: "route-1" });
    mockFetch.mockResolvedValue({ ok: true, json: async () => status });

    await expect(publishRoute(makeContext(), {
      content: "A short waterfront walk.",
      difficulty: "easy",
      location: "Toronto waterfront",
      mediaId: "media-gpx-1",
      points,
      routeKind: "walk",
      tags: "waterfront, accessible",
      title: "Harbour path",
      visibility: "public",
    })).resolves.toEqual(status);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${FEDIVERSE_SERVERS.unfathomably.origin}/api/v1/discovery/native-objects`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      content: "A short waterfront walk.",
      fields: {
        difficulty: "easy",
        distance_unit: "m",
        duration: "60",
        elevation_gain: "6",
        elevation_loss: "0",
        location: "Toronto waterfront",
        route_kind: "walk",
        tags: "waterfront, accessible",
      },
      media_ids: ["media-gpx-1"],
      template: "routes",
      title: "Harbour path",
      visibility: "public",
    });
  });

  test("rejects non-local and non-GPX uploads before contacting a server", async () => {
    await expect(uploadRouteGpx(makeContext(), {
      name: "route.txt",
      uri: "https://files.example/route.txt",
    })).rejects.toThrow("Only a local GPX");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test.each(["rebased", "pleroma"] as const)(
    "degrades cleanly when %s has no route extension",
    async family => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });

      await expect(publishRoute(makeContext(family), {
        content: "A path.",
        mediaId: "media-gpx-1",
        points,
        routeKind: "walk",
        title: "Path",
        visibility: "private",
      })).rejects.toThrow("GPS route publishing is not available on this server.");
    },
  );
});

/* end of UnfathomablyRoutesService.test.ts */
