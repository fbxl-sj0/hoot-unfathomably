/*
    Project: Hoot Unfathomably
    --------------------------

    File: MediaViewerScreen.test.tsx

    Purpose:

        Verify the static attachment playback document.

    Responsibilities:

        - Keep arbitrary script disabled in generated media documents
        - Escape untrusted media and poster URL attributes
        - Preserve native controls for audio and video

    This file intentionally does NOT contain:

        - device codec tests
        - network playback
        - WebView integration tests
*/

import { mediaDocument } from "../MediaViewerScreen";

jest.mock("react-native-webview", () => ({
  WebView: () => null,
}));

describe("MediaViewerScreen", () => {
  test("creates a script-free controlled video document", () => {
    const document = mediaDocument(
      "https://media.example/video.mp4?name=\"demo\"&part=1",
      "video",
      "https://media.example/poster.jpg?label=<preview>",
    );

    expect(document).toContain("<video controls playsinline");
    expect(document).toContain("&quot;demo&quot;&amp;part=1");
    expect(document).toContain("label=&lt;preview&gt;");
    expect(document).toContain("default-src 'none'");
    expect(document).not.toContain("<script");
  });

  test("creates an audio document without a poster or autoplay", () => {
    const document = mediaDocument(
      "https://media.example/audio.ogg",
      "audio",
    );

    expect(document).toContain("<audio controls preload=\"metadata\"");
    expect(document).not.toContain("autoplay");
    expect(document).not.toContain(" poster=");
  });
});

/* end of MediaViewerScreen.test.tsx */
