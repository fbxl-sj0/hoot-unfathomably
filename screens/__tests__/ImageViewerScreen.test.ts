/*
    Project: Hoot Unfathomably
    --------------------------

    File: ImageViewerScreen.test.ts

    Purpose:

        Verify full-screen image candidate validation and fallback ordering.

    Responsibilities:

        - Preserve the preferred original media URL.
        - Deduplicate fallback URLs without changing their priority.
        - Reject local and executable URL schemes from navigation parameters.

    This file intentionally does NOT contain:

        - Native gesture simulation.
        - Remote media requests.
        - Android image codec tests.
*/

import { getImageCandidates } from "../ImageViewerScreen";

jest.mock("react-native-gesture-handler", () => ({
  Gesture: {},
  GestureDetector: () => null,
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { Image: () => null },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
}));

describe("ImageViewerScreen", () => {
  test("keeps safe image fallbacks in priority order", () => {
    expect(
      getImageCandidates(
        "https://proxy.example/full.jpg",
        [
          "https://remote.example/original.jpg",
          "https://proxy.example/full.jpg",
          "http://legacy.example/preview.jpg",
        ],
        "https://proxy.example/preview.jpg",
      ),
    ).toEqual([
      "https://proxy.example/full.jpg",
      "https://remote.example/original.jpg",
      "http://legacy.example/preview.jpg",
      "https://proxy.example/preview.jpg",
    ]);
  });

  test("rejects non-network image schemes", () => {
    expect(
      getImageCandidates(
        "file:///private/account-data",
        ["javascript:alert(1)", "content://private/image"],
      ),
    ).toEqual([]);
  });
});

/* end of ImageViewerScreen.test.ts */
