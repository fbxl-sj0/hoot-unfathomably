/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeDraftService.test.ts

    Purpose:

        Verify complete and defensive persistence of composer drafts.

    Responsibilities:

        - Prove all compose fields survive a round trip
        - Prove account isolation and update ordering
        - Exercise malformed, duplicate, excessive, and empty drafts
        - Ensure no credential is copied into draft storage

    This file intentionally does NOT contain:

        - React composer behavior
        - live server scheduling
        - attachment uploads
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  composeDrafts,
  createComposeDraft,
  isMeaningfulComposeDraft,
  normalizeComposeDraft,
} from "../ComposeDraftService";
import { makeContext } from "../../testing/fediverseFixtures";

describe("ComposeDraftService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(Date, "now").mockReturnValue(1_786_550_400_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("round trips every composer field without a bearer token", async () => {
    const context = makeContext("unfathomably");
    const draft = createComposeDraft("draft-1", {
      content: "A complete post",
      contentWarning: "Book spoiler",
      contentWarningEnabled: true,
      groupId: "group-7",
      groupName: "Readers",
      inReplyToId: "parent-2",
      language: "fr",
      media: [{
        description: "A red book on a table",
        mimeType: "image/jpeg",
        name: "book.jpg",
        uri: "file:///private/book.jpg",
      }],
      poll: {
        expiresIn: 604_800,
        multiple: true,
        options: ["One", "Two"],
      },
      pollEnabled: true,
      quoteId: "quote-3",
      quoteParameter: "quote_id",
      scheduledAt: "2026-08-14T14:00:00.000Z",
      sensitive: true,
      targetAccountKeys: [
        "alice@https://unfathomably.example",
        "alice@https://pleroma.example",
      ],
      visibility: "unlisted",
    });

    await composeDrafts.store(context, draft);

    await expect(composeDrafts.query(context, "draft-1")).resolves.toEqual(
      draft,
    );
    const encoded = (await Promise.all(
      (await AsyncStorage.getAllKeys()).map(key => AsyncStorage.getItem(key)),
    )).join("");
    expect(encoded).not.toContain("unfathomably-access-token");
  });

  test("isolates drafts by account and server", async () => {
    const owner = makeContext("unfathomably");
    const otherAccount = makeContext("unfathomably");
    otherAccount.login.user!.username = "bob";
    const otherServer = makeContext("pleroma");

    await composeDrafts.store(
      owner,
      createComposeDraft("private-draft", { content: "Owner only" }),
    );

    await expect(composeDrafts.list(owner)).resolves.toHaveLength(1);
    await expect(composeDrafts.list(otherAccount)).resolves.toEqual([]);
    await expect(composeDrafts.list(otherServer)).resolves.toEqual([]);
  });

  test("updates a draft in place and orders most recently updated first", async () => {
    const context = makeContext("mastodon");
    const first = createComposeDraft("first", { content: "First" }, 10);
    const second = createComposeDraft("second", { content: "Second" }, 20);

    jest.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);
    await composeDrafts.store(context, first);
    await composeDrafts.store(context, second);
    jest.spyOn(Date, "now").mockReturnValue(300);
    await composeDrafts.store(context, { ...first, content: "Revised" });

    const drafts = await composeDrafts.list(context);
    expect(drafts.map(draft => draft.id)).toEqual(["first", "second"]);
    expect(drafts[0].content).toBe("Revised");
    expect(drafts).toHaveLength(2);
  });

  test("bounds untrusted draft fields and rejects missing identifiers", () => {
    expect(normalizeComposeDraft({ content: "missing id" })).toBeUndefined();

    const normalized = normalizeComposeDraft({
      content: "x".repeat(6_000),
      contentWarning: "w".repeat(700),
      createdAt: -1,
      id: "draft",
      media: Array.from({ length: 10 }, (_unused, index) => ({
        description: "d".repeat(2_000),
        uri: `file:///image-${index}.jpg`,
      })),
      poll: {
        expiresIn: Number.POSITIVE_INFINITY,
        options: ["1", "2", "3", "4", "5"],
      },
      targetAccountKeys: Array.from(
        { length: 20 },
        (_unused, index) => `user-${index}@https://example.com`,
      ),
      updatedAt: Number.NaN,
      visibility: "world-readable-and-beyond",
    }, 42)!;

    expect(normalized.content).toHaveLength(5_000);
    expect(normalized.contentWarning).toHaveLength(500);
    expect(normalized.createdAt).toBe(42);
    expect(normalized.media).toHaveLength(4);
    expect(normalized.media[0].description).toHaveLength(1_500);
    expect(normalized.poll.expiresIn).toBe(86_400);
    expect(normalized.poll.options).toHaveLength(4);
    expect(normalized.targetAccountKeys).toHaveLength(10);
    expect(normalized.updatedAt).toBe(42);
    expect(normalized.visibility).toBe("public");
  });

  test("repairs corrupt storage and remains writable", async () => {
    const context = makeContext("akkoma");
    const key = "@hoot.compose_drafts.v1.alice%40https%3A%2F%2Fakkoma.example";
    await AsyncStorage.setItem(key, "{broken");

    await expect(composeDrafts.list(context)).resolves.toEqual([]);
    await expect(AsyncStorage.getItem(key)).resolves.toBeNull();

    await composeDrafts.store(
      context,
      createComposeDraft("recovered", { content: "Recovered" }),
    );
    await expect(composeDrafts.query(context, "recovered")).resolves.toBeDefined();
  });

  test("bounds the draft count and removes one draft or all drafts", async () => {
    const context = makeContext("pleroma");

    for (let index = 0; index < 55; index += 1) {
      jest.spyOn(Date, "now").mockReturnValue(index + 1);
      await composeDrafts.store(
        context,
        createComposeDraft(`draft-${index}`, { content: String(index) }),
      );
    }

    await expect(composeDrafts.list(context)).resolves.toHaveLength(50);
    await composeDrafts.remove(context, "draft-54");
    await expect(composeDrafts.query(context, "draft-54")).resolves.toBeUndefined();
    await composeDrafts.clear(context);
    await expect(composeDrafts.list(context)).resolves.toEqual([]);
  });

  test("recognizes meaningful text, warnings, polls, and media", () => {
    const empty = createComposeDraft("empty");
    expect(isMeaningfulComposeDraft(empty)).toBe(false);
    expect(isMeaningfulComposeDraft({ ...empty, content: " text " })).toBe(true);
    expect(isMeaningfulComposeDraft({
      ...empty,
      contentWarning: "warning",
    })).toBe(true);
    expect(isMeaningfulComposeDraft({
      ...empty,
      pollEnabled: true,
      poll: { ...empty.poll, options: ["choice", ""] },
    })).toBe(true);
    expect(isMeaningfulComposeDraft({
      ...empty,
      media: [{ description: "", uri: "file:///image.jpg" }],
    })).toBe(true);
  });
});

/* end of ComposeDraftService.test.ts */
