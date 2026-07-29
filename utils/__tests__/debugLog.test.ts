/*
    Project: Hoot Mobile
    -------------------

    File: debugLog.test.ts

    Purpose:

        Validate centralized diagnostic logging behavior.

    Responsibilities:

        - Verify stable Hoot log prefixes
        - Verify warning and error routing
        - Verify logging failures do not escape to app code

    This file intentionally does NOT contain:

        - Remote telemetry tests
        - React Native rendering tests
        - adb logcat integration tests
*/

import { logError, logWarning } from "../debugLog";

describe("debugLog", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("prefixes warning diagnostics", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    logWarning("Failed to refresh profile", "offline");

    expect(warnSpy).toHaveBeenCalledWith(
      "[Hoot] Failed to refresh profile",
      "offline",
    );
  });

  test("prefixes error diagnostics and ignores logger failures", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      throw new Error("logger failed");
    });

    expect(() => logError("Uncaught render error", new Error("boom")))
      .not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      "[Hoot] Uncaught render error",
      expect.any(Error),
    );
  });
});

/* end of debugLog.test.ts */
