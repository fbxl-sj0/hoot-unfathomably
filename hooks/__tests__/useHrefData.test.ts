/*
    Project: Hoot Mobile
    -------------------

    File: useHrefData.test.ts

    Purpose:

        Validate external URL preview metadata parsing.

    Responsibilities:

        - Verify direct image URLs remain openable links
        - Verify video URLs expose a preview image and original link
        - Verify unsupported schemes are not treated as images

    This file intentionally does NOT contain:

        - Link opening tests
        - Post card rendering tests
        - Live metadata fetching tests
*/

import { getHrefData } from "../useHrefData";

describe("getHrefData", () => {
  test("returns empty metadata for blank input", () => {
    expect(getHrefData("   ")).toEqual({});
  });

  test("keeps direct image URLs openable", () => {
    expect(getHrefData("https://example.com/image.png")).toEqual({
      imageUrl: "https://example.com/image.png",
      linkUrl: "https://example.com/image.png",
    });
  });

  test("detects image extensions with query strings, fragments, and case", () => {
    expect(getHrefData("https://example.com/pic.JPG?size=large#view")).toEqual({
      imageUrl: "https://example.com/pic.JPG?size=large#view",
      linkUrl: "https://example.com/pic.JPG?size=large#view",
    });
  });

  test("detects Lotide stable post href image endpoints", () => {
    expect(
      getHrefData("http://lotide.test/api/stable/posts/12/href?cache=1"),
    ).toEqual({
      imageUrl: "http://lotide.test/api/stable/posts/12/href?cache=1",
      linkUrl: "http://lotide.test/api/stable/posts/12/href?cache=1",
    });
  });

  test("does not treat unsupported schemes as images", () => {
    expect(getHrefData("javascript:alert.png")).toEqual({
      linkUrl: "javascript:alert.png",
    });
  });

  test("detects YouTube video preview metadata", () => {
    expect(getHrefData("youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      imageUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      linkUrl: "youtube.com/watch?v=dQw4w9WgXcQ",
      isVideo: true,
    });
  });

  test("falls back to a plain link", () => {
    expect(getHrefData("https://example.com/read")).toEqual({
      linkUrl: "https://example.com/read",
    });
  });
});

/* end of useHrefData.test.ts */
