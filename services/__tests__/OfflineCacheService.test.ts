/*
    Project: Hoot Unfathomably
    --------------------------

    File: OfflineCacheService.test.ts

    Purpose:

        Verify bounded, account-isolated offline social data persistence.

    Responsibilities:

        - Exercise timeline and notification snapshot round trips
        - Prove accounts and servers cannot read each other's snapshots
        - Verify corrupt and excessive data is repaired safely
        - Verify account-specific and global cache removal

    This file intentionally does NOT contain:

        - network requests
        - React screen tests
        - bearer token persistence tests
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  clearAllOfflineData,
  clearOfflineDataForAccount,
  offlineNotifications,
  offlineTimelines,
} from "../OfflineCacheService";
import {
  makeContext,
  makeNotification,
  makeStatus,
} from "../../testing/fediverseFixtures";

describe("OfflineCacheService", () => {
  beforeEach(async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_786_550_400_000);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    "akkoma",
    "mastodon",
    "pleroma",
    "rebased",
    "unfathomably",
  ] as const)("round trips a %s home timeline", async family => {
    const context = makeContext(family);
    const status = makeStatus(family);

    await offlineTimelines.store(context, "home", [status]);

    await expect(offlineTimelines.query(context, "home")).resolves.toEqual({
      items: [status],
      storedAt: 1_786_550_400_000,
    });
  });

  test("isolates scopes, accounts, and servers", async () => {
    const alice = makeContext("unfathomably");
    const bob = makeContext("unfathomably");
    bob.login.user!.username = "bob";
    const otherServer = makeContext("pleroma");
    const status = makeStatus("unfathomably");

    await offlineTimelines.store(alice, "home", [status]);

    await expect(offlineTimelines.query(alice, "groups")).resolves.toBeUndefined();
    await expect(offlineTimelines.query(bob, "home")).resolves.toBeUndefined();
    await expect(offlineTimelines.query(otherServer, "home")).resolves.toBeUndefined();
  });

  test("deduplicates and bounds a snapshot at the newest edge", async () => {
    const context = makeContext("mastodon");
    const statuses = Array.from({ length: 180 }, (_unused, index) =>
      makeStatus("mastodon", {
        content: `<p>${"x".repeat(30_000)}</p>`,
        id: `status-${index}`,
      }),
    );

    await offlineTimelines.store(context, "home", [
      statuses[0],
      statuses[0],
      ...statuses.slice(1),
    ]);

    const snapshot = await offlineTimelines.query(context, "home");
    expect(snapshot?.items[0].id).toBe("status-0");
    expect(snapshot?.items.length).toBeGreaterThan(0);
    expect(snapshot?.items.length).toBeLessThanOrEqual(120);
    expect(new Set(snapshot?.items.map(item => item.id)).size).toBe(
      snapshot?.items.length,
    );

    const stored = (await AsyncStorage.getAllKeys()).find(key =>
      key.includes("timeline.home"),
    );
    expect(stored).toBeDefined();
    expect((await AsyncStorage.getItem(stored!))?.length).toBeLessThanOrEqual(
      2 * 1024 * 1024,
    );
  });

  test("repairs a corrupt snapshot without affecting another scope", async () => {
    const context = makeContext("pleroma");
    await offlineTimelines.store(context, "groups", [makeStatus("pleroma")]);
    const homeKey = (await AsyncStorage.getAllKeys()).find(key =>
      key.includes("timeline.groups"),
    )!.replace("timeline.groups", "timeline.home");
    await AsyncStorage.setItem(homeKey, "{not-json");

    await expect(offlineTimelines.query(context, "home")).resolves.toBeUndefined();
    await expect(AsyncStorage.getItem(homeKey)).resolves.toBeNull();
    await expect(offlineTimelines.query(context, "groups")).resolves.toBeDefined();
  });

  test("stores notifications separately from timelines", async () => {
    const context = makeContext("akkoma");
    const notification = makeNotification("akkoma");

    await offlineNotifications.store(context, [notification]);

    await expect(offlineNotifications.query(context)).resolves.toEqual({
      items: [notification],
      storedAt: 1_786_550_400_000,
    });
    await expect(offlineTimelines.query(context, "home")).resolves.toBeUndefined();
  });

  test("refuses to persist data without an authenticated account identity", async () => {
    const context: LotideContext = { apiUrl: "https://mastodon.example" };

    await offlineTimelines.store(context, "home", [makeStatus("mastodon")]);

    await expect(AsyncStorage.getAllKeys()).resolves.toEqual([]);
    await expect(offlineTimelines.query(context, "home")).resolves.toBeUndefined();
  });

  test("clears only the requested account before a global clear", async () => {
    const alice = makeContext("unfathomably");
    const bob = makeContext("mastodon");
    await offlineTimelines.store(alice, "home", [makeStatus("unfathomably")]);
    await offlineNotifications.store(alice, [makeNotification("unfathomably")]);
    await offlineTimelines.store(bob, "home", [makeStatus("mastodon")]);

    await clearOfflineDataForAccount(alice);

    await expect(offlineTimelines.query(alice, "home")).resolves.toBeUndefined();
    await expect(offlineNotifications.query(alice)).resolves.toBeUndefined();
    await expect(offlineTimelines.query(bob, "home")).resolves.toBeDefined();

    await clearAllOfflineData();
    await expect(offlineTimelines.query(bob, "home")).resolves.toBeUndefined();
  });
});

/* end of OfflineCacheService.test.ts */
