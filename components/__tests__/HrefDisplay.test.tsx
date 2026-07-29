/*
    Project: Hoot Mobile
    -------------------

    File: HrefDisplay.test.tsx

    Purpose:

        Validate external link preview behavior.

    Responsibilities:

        - Verify post preview links open through Expo Linking
        - Verify unsupported links are shown to the user instead of ignored
        - Verify malformed image dimensions cannot poison preview layout

    This file intentionally does NOT contain:

        - Lotide API metadata tests
        - Post card rendering tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { openURL } from "expo-linking";

import HrefDisplay, { getSafeImageAspect } from "../HrefDisplay";

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    secondaryBackground: "#222",
  }),
}));

const mockedOpenURL = openURL as jest.MockedFunction<typeof openURL>;
const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

describe("HrefDisplay", () => {
  beforeEach(() => {
    mockedOpenURL.mockReset();
    mockedOpenURL.mockResolvedValue(true);
    alertSpy.mockClear();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  test("opens normal HTTPS links", async () => {
    const screen = await render(<HrefDisplay href="https://example.com/post" />);

    await fireEvent.press(
      screen.getByRole("link", {
        name: "Open link https://example.com/post",
      }),
    );

    expect(mockedOpenURL).toHaveBeenCalledWith("https://example.com/post");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("normalizes obvious web URLs before opening them", async () => {
    const href = "youtube.com/watch?v=dQw4w9WgXcQ";
    const screen = await render(<HrefDisplay href={href} />);

    await fireEvent.press(
      screen.getByRole("link", { name: `Open link ${href}` }),
    );

    expect(mockedOpenURL).toHaveBeenCalledWith(`https://${href}`);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("shows unsupported schemes instead of trying to open them", async () => {
    const screen = await render(<HrefDisplay href="javascript:alert(1)" />);

    await fireEvent.press(
      screen.getByRole("link", {
        name: "Open link javascript:alert(1)",
      }),
    );

    expect(mockedOpenURL).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      "Link",
      "javascript:alert(1)",
      undefined,
      { cancelable: true },
    );
  });

  test("shows the original link when the platform browser rejects it", async () => {
    mockedOpenURL.mockRejectedValueOnce(new Error("No browser"));

    const screen = await render(<HrefDisplay href="https://example.com/post" />);

    await fireEvent.press(
      screen.getByRole("link", {
        name: "Open link https://example.com/post",
      }),
    );

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Link",
        "https://example.com/post",
        undefined,
        { cancelable: true },
      );
    });
  });

  test("opens direct image previews", async () => {
    const href = "https://example.com/image.png";
    const screen = await render(<HrefDisplay href={href} />);

    await fireEvent.press(
      screen.getByRole("link", { name: `Open image link ${href}` }),
    );

    expect(mockedOpenURL).toHaveBeenCalledWith(href);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("clamps unsafe image aspect ratios", () => {
    expect(getSafeImageAspect({ width: 100, height: 400 })).toBe(0.5);
    expect(getSafeImageAspect({ width: 800, height: 200 })).toBe(4);
    expect(getSafeImageAspect({ width: 100, height: 0 })).toBe(1);
    expect(getSafeImageAspect({ width: Number.NaN, height: 200 })).toBe(1);
  });
});

/* end of HrefDisplay.test.tsx */
