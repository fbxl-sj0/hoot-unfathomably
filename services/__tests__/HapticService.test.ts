/*
    Project: Hoot Mobile
    -------------------

    File: HapticService.test.ts

    Purpose:

        Validate the app-level haptic feedback wrapper.

    Responsibilities:

        - Verify web builds skip native haptic calls
        - Verify native haptic feedback is delegated to Expo
        - Verify native haptic failures are diagnostic-only

    This file intentionally does NOT contain:

        - Gesture handling tests
        - Device vibration integration tests
        - UI component tests
*/

import { Platform } from "react-native";
import * as ExpoHaptics from "expo-haptics";

import * as HapticService from "../HapticService";
import * as DebugLog from "../../utils/debugLog";

const expoImpactAsync = ExpoHaptics.impactAsync as jest.MockedFunction<
  typeof ExpoHaptics.impactAsync
>;

function setPlatformOS(os: string) {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: os,
  });
}

describe("HapticService", () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    expoImpactAsync.mockReset();
    expoImpactAsync.mockResolvedValue(undefined);
    setPlatformOS("ios");
  });

  afterEach(() => {
    setPlatformOS(originalOS);
    jest.restoreAllMocks();
  });

  test("skips native haptics on web", async () => {
    setPlatformOS("web");

    await HapticService.impactAsync(HapticService.ImpactFeedbackStyle.Light);

    expect(expoImpactAsync).not.toHaveBeenCalled();
  });

  test("delegates native haptics to Expo", async () => {
    await HapticService.impactAsync(HapticService.ImpactFeedbackStyle.Medium);

    expect(expoImpactAsync).toHaveBeenCalledWith(
      HapticService.ImpactFeedbackStyle.Medium,
    );
  });

  test("logs native haptic failures without rejecting", async () => {
    const error = new Error("Haptics unavailable");
    const warningSpy = jest
      .spyOn(DebugLog, "logWarning")
      .mockImplementation(() => undefined);
    expoImpactAsync.mockRejectedValueOnce(error);

    await expect(
      HapticService.impactAsync(HapticService.ImpactFeedbackStyle.Heavy),
    ).resolves.toBeUndefined();

    expect(warningSpy).toHaveBeenCalledWith("Haptic feedback failed", error);
  });
});

/* end of HapticService.test.ts */
