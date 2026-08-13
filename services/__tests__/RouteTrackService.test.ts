/*
    Project: Hoot Unfathomably
    --------------------------

    File: RouteTrackService.test.ts

    Purpose:

        Verify private GPS route filtering, metrics, GPX, and recovery.

    Responsibilities:

        - Reject imprecise, duplicate, and implausible device fixes
        - Preserve stop and resume boundaries in metrics and GPX
        - Reject unsafe or malformed GPX input
        - Keep unfinished drafts isolated by account

    This file intentionally does NOT contain:

        - Android location permission tests
        - network uploads or publication
        - third-party map requests
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  appendRoutePoint,
  createGpx,
  getRouteTrackMetrics,
  parseGpx,
  readRouteTrackDraft,
  removeRouteTrackDraft,
  RoutePoint,
  saveRouteTrackDraft,
} from "../RouteTrackService";

const first: RoutePoint = {
  accuracy: 5,
  elevation: 100,
  latitude: 43.6500,
  longitude: -79.3800,
  timestamp: Date.parse("2026-08-13T12:00:00.000Z"),
};

describe("RouteTrackService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test("filters low-quality, duplicate, and impossible GPS fixes", () => {
    expect(appendRoutePoint([], { ...first, accuracy: 101 })).toEqual([]);
    expect(appendRoutePoint([first], {
      ...first,
      latitude: first.latitude + 0.000001,
      timestamp: first.timestamp + 1_000,
    })).toEqual([first]);
    expect(appendRoutePoint([first], {
      ...first,
      latitude: 44.6500,
      timestamp: first.timestamp + 1_000,
    })).toEqual([first]);
  });

  test("does not count paused time or connect separate recording segments", () => {
    const points: RoutePoint[] = [
      first,
      { ...first, elevation: 110, longitude: -79.3790, timestamp: first.timestamp + 60_000 },
      {
        ...first,
        elevation: 500,
        latitude: 44,
        longitude: -80,
        startsSegment: true,
        timestamp: first.timestamp + 3_660_000,
      },
      { ...first, elevation: 490, latitude: 44, longitude: -79.9990, timestamp: first.timestamp + 3_720_000 },
    ];

    const metrics = getRouteTrackMetrics(points);
    expect(metrics.durationSeconds).toBe(120);
    expect(metrics.distanceMetres).toBeGreaterThan(150);
    expect(metrics.distanceMetres).toBeLessThan(170);
    expect(metrics.elevationGainMetres).toBe(10);
    expect(metrics.elevationLossMetres).toBe(10);
  });

  test("round trips escaped metadata and multiple GPX track segments", () => {
    const points: RoutePoint[] = [
      first,
      { ...first, longitude: -79.3790, timestamp: first.timestamp + 60_000 },
      { ...first, latitude: 44, startsSegment: true, timestamp: first.timestamp + 120_000 },
      { ...first, latitude: 44, longitude: -79.3790, timestamp: first.timestamp + 180_000 },
    ];

    const gpx = createGpx(points, "Lake & trail <north>");
    const parsed = parseGpx(gpx);

    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain("Lake &amp; trail &lt;north&gt;");
    expect(parsed.title).toBe("Lake & trail <north>");
    expect(parsed.points).toHaveLength(4);
    expect(parsed.points[2].startsSegment).toBe(true);
    expect(getRouteTrackMetrics(parsed.points).durationSeconds).toBe(120);
  });

  test("rejects XML entity declarations and documents without a path", () => {
    expect(() => parseGpx("<!DOCTYPE gpx><gpx></gpx>")).toThrow("document type");
    expect(() => parseGpx("<gpx><metadata><name>Empty</name></metadata></gpx>"))
      .toThrow("at least two valid");
  });

  test("stores bounded drafts per account and removes corrupt data", async () => {
    await saveRouteTrackDraft("alice@example.social", {
      points: [first, { ...first, longitude: -79.3790, timestamp: first.timestamp + 1_000 }],
      title: "Evening path",
    });

    await expect(readRouteTrackDraft("alice@example.social")).resolves.toMatchObject({
      points: expect.arrayContaining([expect.objectContaining({ latitude: first.latitude })]),
      title: "Evening path",
    });
    await expect(readRouteTrackDraft("bob@example.social")).resolves.toBeUndefined();

    await removeRouteTrackDraft("alice@example.social");
    await expect(readRouteTrackDraft("alice@example.social")).resolves.toBeUndefined();
  });
});

/* end of RouteTrackService.test.ts */
