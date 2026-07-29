/*
    Project: Hoot Mobile
    -------------------

    File: externalLink.test.ts

    Purpose:

        Validate guarded external-link opening behavior.

    Responsibilities:

        - Verify URL normalization for platform handoff
        - Verify unsupported schemes show a fallback instead of opening
        - Verify platform failures preserve the original link for the user

    This file intentionally does NOT contain:

        - HTML renderer tests
        - React Navigation tests
        - Live browser integration tests
*/

import { Alert } from "react-native";
import { openURL } from "expo-linking";

import {
  getOpenableExternalUrl,
  openExternalLink,
} from "../externalLink";

const mockedOpenURL = openURL as jest.MockedFunction<typeof openURL>;
const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

describe("externalLink", () => {
  beforeEach(() => {
    mockedOpenURL.mockReset();
    mockedOpenURL.mockResolvedValue(true);
    alertSpy.mockClear();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  test("keeps supported URL schemes unchanged", () => {
    expect(getOpenableExternalUrl(" https://example.com/read ")).toBe(
      "https://example.com/read",
    );
    expect(getOpenableExternalUrl("http://example.com/read")).toBe(
      "http://example.com/read",
    );
    expect(getOpenableExternalUrl("mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
  });

  test("normalizes obvious web domains", () => {
    expect(getOpenableExternalUrl("example.com/read")).toBe(
      "https://example.com/read",
    );
    expect(getOpenableExternalUrl("www.example.com")).toBe(
      "https://www.example.com",
    );
  });

  test("rejects blank and unsupported schemes", () => {
    expect(getOpenableExternalUrl("   ")).toBeUndefined();
    expect(getOpenableExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(getOpenableExternalUrl("lotide://post/1")).toBeUndefined();
  });

  test("opens normalized links", async () => {
    await expect(openExternalLink("example.com/read")).resolves.toBe(true);

    expect(mockedOpenURL).toHaveBeenCalledWith("https://example.com/read");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("shows unsupported links without opening them", async () => {
    await expect(openExternalLink("javascript:alert(1)")).resolves.toBe(false);

    expect(mockedOpenURL).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      "Link",
      "javascript:alert(1)",
      undefined,
      { cancelable: true },
    );
  });

  test("shows the original link when platform opening fails", async () => {
    mockedOpenURL.mockRejectedValueOnce(new Error("No browser"));

    await expect(openExternalLink("example.com/read")).resolves.toBe(false);

    expect(mockedOpenURL).toHaveBeenCalledWith("https://example.com/read");
    expect(alertSpy).toHaveBeenCalledWith(
      "Link",
      "example.com/read",
      undefined,
      { cancelable: true },
    );
  });
});

/* end of externalLink.test.ts */
