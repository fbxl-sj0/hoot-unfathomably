/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeDraftMediaService.test.ts

    Purpose:

        Verify durable draft-media path and cleanup safety rules.

    Responsibilities:

        - Sanitize picker-provided file extensions
        - Copy cache files into account-scoped app documents
        - Avoid copying an already-persisted attachment twice
        - Refuse non-file picker addresses and ignore remote cleanup targets

    This file intentionally does NOT contain:

        - native filesystem integration
        - media uploads
        - image-picker behavior
*/

import {
  persistComposeDraftMedia,
  removeComposeDraftMedia,
  safeMediaExtension,
} from "../ComposeDraftMediaService";
import { makeContext } from "../../testing/fediverseFixtures";

describe("ComposeDraftMediaService", () => {
  test("accepts only short alphanumeric file extensions", () => {
    expect(safeMediaExtension("photo.JPEG")).toBe(".jpeg");
    expect(safeMediaExtension("archive.tar.gz")).toBe(".gz");
    expect(safeMediaExtension("../../unsafe" )).toBe(".bin");
    expect(safeMediaExtension("file.reallylongextension")).toBe(".bin");
  });

  test("copies a picker file into account-scoped documents", async () => {
    const persisted = await persistComposeDraftMedia(makeContext("unfathomably"), {
      description: "A diagram",
      mimeType: "image/png",
      name: "diagram.png",
      uri: "file:///cache/diagram.png",
    });

    expect(persisted).toMatchObject({
      description: "A diagram",
      mimeType: "image/png",
      name: "diagram.png",
    });
    expect(persisted.uri).toMatch(/^file:\/\/\/documents\/hoot-compose-media\/[a-f0-9]{8}\//);
    expect(persisted.uri).toMatch(/\.png$/);
  });

  test("returns an already-persisted attachment unchanged", async () => {
    const media = {
      description: "",
      uri: "file:///documents/hoot-compose-media/12345678/existing.jpg",
    };
    await expect(
      persistComposeDraftMedia(makeContext("unfathomably"), media),
    ).resolves.toBe(media);
  });

  test("rejects provider URLs that are not readable local files", async () => {
    await expect(persistComposeDraftMedia(makeContext("unfathomably"), {
      description: "",
      uri: "content://external/picker/one",
    })).rejects.toThrow("readable file");
  });

  test("does not remove remote media while cleaning a draft", () => {
    expect(() => removeComposeDraftMedia({
      description: "",
      uri: "https://example.test/media/one.jpg",
    })).not.toThrow();
  });
});

/* end of ComposeDraftMediaService.test.ts */
