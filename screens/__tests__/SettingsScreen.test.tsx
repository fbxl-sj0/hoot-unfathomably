/*
    Project: Hoot Mobile
    -------------------

    File: SettingsScreen.test.tsx

    Purpose:

        Validate the settings UI around Android notification diagnostics.

    Responsibilities:

        - Verify notification health is shown from the poller diagnostics
        - Verify the test-notification action calls the poller service
        - Verify settings actions reject invalid input and duplicate taps

    This file intentionally does NOT contain:

        - Native Android notification delivery tests
        - Live Lotide server requests
*/

import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Alert, Linking, Platform } from "react-native";
import {
  act,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import SettingsScreen from "../SettingsScreen/SettingsScreen";

const mockGetNotificationDiagnostics = jest.fn();
const mockSendTestNotification = jest.fn();
const mockSetNotificationEnabled = jest.fn();
const mockGetNotificationEnabled = jest.fn();
const mockPollNotificationsNow = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    tertiaryBackground: "#ddd",
    text: "#000",
    secondaryText: "#333",
    placeholderText: "#999",
    tint: "#f5a524",
    secondaryTint: "#ff9f43",
    red: "#f00",
  }),
}));

jest.mock("../../services/LotideNotificationPoller", () => ({
  __esModule: true,
  getNotificationDiagnostics: (...args: unknown[]) =>
    mockGetNotificationDiagnostics(...args),
  getNotificationEnabled: (...args: unknown[]) =>
    mockGetNotificationEnabled(...args),
  pollNotificationsNow: (...args: unknown[]) =>
    mockPollNotificationsNow(...args),
  sendTestNotification: (...args: unknown[]) =>
    mockSendTestNotification(...args),
  setNotificationEnabled: (...args: unknown[]) =>
    mockSetNotificationEnabled(...args),
}));

const mockStore = configureStoreMock([]);

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Deferred promise was resolved before initialization.");
  };
  let reject: (reason?: unknown) => void = () => {
    throw new Error("Deferred promise was rejected before initialization.");
  };

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

async function renderSettingsScreen() {
  const store = mockStore({
    lotide: {
      ctx: {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "sj_zero",
            host: "lotide.fbxl.net",
            local: true,
          },
        },
      },
    },
    settings: {
      activeFeedSort: "hot",
      defaultFeedSort: "hot",
    },
  });

  return await render(
    <Provider store={store}>
      <SettingsScreen />
    </Provider>,
  );
}

describe("SettingsScreen", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(Linking, "openSettings").mockResolvedValue();
    mockGetNotificationDiagnostics.mockResolvedValue({
      supported: true,
      enabled: true,
      permissionCanAskAgain: false,
      permissionGranted: true,
      permissionStatus: "granted",
      backgroundAvailable: true,
      backgroundStatus: "available",
      taskRegistered: true,
      channelId: "lotide-notifications-v2",
      poll: {
        lastAttemptAt: "2026-06-23T18:30:00.000Z",
        lastSuccessAt: "2026-06-23T18:30:00.000Z",
        lastScheduledAt: "2026-06-23T18:30:00.000Z",
        lastScheduledCount: 2,
      },
    });
    mockGetNotificationEnabled.mockResolvedValue(true);
    mockPollNotificationsNow.mockResolvedValue(0);
    mockSendTestNotification.mockResolvedValue("notification-id");
    mockSetNotificationEnabled.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("shows Android notification health", async () => {
    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByText("Local alerts")).toBeTruthy();
      expect(screen.getByText("Allowed")).toBeTruthy();
      expect(screen.getByText("Background polling")).toBeTruthy();
      expect(screen.getByText("Ready")).toBeTruthy();
      expect(screen.getByText("Last check")).toBeTruthy();
      expect(screen.getByText("Last local alert")).toBeTruthy();
    });
  });

  test("shows signed-out background notification wakes", async () => {
    mockGetNotificationDiagnostics.mockResolvedValue({
      supported: true,
      enabled: true,
      permissionCanAskAgain: false,
      permissionGranted: true,
      permissionStatus: "granted",
      backgroundAvailable: true,
      backgroundStatus: "available",
      taskRegistered: true,
      channelId: "lotide-notifications-v2",
      poll: {
        lastAttemptAt: "2026-06-23T18:30:00.000Z",
        lastSuccessAt: "2026-06-23T18:30:00.000Z",
        lastScheduledCount: 0,
        lastSkippedReason: "no_context",
      },
    });

    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByText("Skipped, signed out")).toBeTruthy();
    });
  });

  test("ignores Android notification diagnostic failures after unmount", async () => {
    const diagnostics = createDeferred<never>();
    mockGetNotificationDiagnostics.mockReturnValueOnce(diagnostics.promise);

    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(mockGetNotificationDiagnostics).toHaveBeenCalledTimes(1);
    });

    screen.unmount();

    const drainedDiagnostics = diagnostics.promise.catch(() => undefined);
    diagnostics.reject(new Error("late diagnostics failure"));

    await drainedDiagnostics;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Cannot check notifications",
      "late diagnostics failure",
    );
  });

  test("persists the default feed sort", async () => {
    const screen = await renderSettingsScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Set default sort to New",
    }));

    await waitFor(async () => {
      await expect(AsyncStorage.getItem("@hoot_app_settings")).resolves.toBe(
        JSON.stringify({
          defaultFeedSort: "new",
        }),
      );
    });
  });

  test("rejects malformed API URLs before persisting settings", async () => {
    const screen = await renderSettingsScreen();

    await fireEvent.changeText(
      screen.getByPlaceholderText("https://narwhal.city/api/unstable"),
      "httpnot-a-url",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save Changes" }));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Invalid URL",
      "API URL must start with http:// or https://",
    );
    await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.toBeNull();
  });

  test("normalizes valid API URLs before persisting settings", async () => {
    const screen = await renderSettingsScreen();

    await fireEvent.changeText(
      screen.getByPlaceholderText("https://narwhal.city/api/unstable"),
      "  https://example.lotide.test/api/unstable///  ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(async () => {
      await expect(AsyncStorage.getItem("@lotide_ctx")).resolves.toBe(
        JSON.stringify({
          apiUrl: "https://example.lotide.test/api/unstable",
          login: {
            user: {
              id: 1,
              username: "sj_zero",
              host: "lotide.fbxl.net",
              local: true,
            },
          },
        }),
      );
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringContaining("hoot.auth.token."), "token-1");
  });

  test("checks Lotide notifications from settings", async () => {
    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByText("Ready")).toBeTruthy();
      expect(screen.getByRole("button", {
        name: "Check Notifications Now",
      })).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Check Notifications Now",
    }));

    await waitFor(() => {
      expect(mockPollNotificationsNow).toHaveBeenCalledTimes(1);
      expect(mockPollNotificationsNow).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        }),
      );
      expect(Alert.alert).toHaveBeenCalledWith(
        "Notification check complete",
        "0 local alerts were scheduled.",
      );
    });
  });

  test("blocks duplicate immediate notification checks while one is pending", async () => {
    const pendingPoll = createDeferred<number>();
    mockPollNotificationsNow.mockReturnValue(pendingPoll.promise);
    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByText("Ready")).toBeTruthy();
      expect(screen.getByRole("button", {
        name: "Check Notifications Now",
      })).toBeTruthy();
    });

    const checkButton = screen.getByTestId("settings-check-notifications-now");
    const pressCheckNotifications =
      checkButton.props.onClick as () => void | Promise<void>;

    await act(async () => {
      void pressCheckNotifications();
      void pressCheckNotifications();
      await Promise.resolve();
    });

    expect(mockPollNotificationsNow).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Checking..." }).props
      .accessibilityState.disabled).toBe(true);

    await act(async () => {
      pendingPoll.resolve(1);
      await pendingPoll.promise;
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Notification check complete",
        "1 local alert was scheduled.",
      );
    });
  });

  test("sends a local notification test from settings", async () => {
    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByRole("button", {
        name: "Send Test Notification",
      })).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Send Test Notification",
    }));

    await waitFor(() => {
      expect(mockSendTestNotification).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        "Test notification sent",
        "A local Hoot notification was scheduled.",
      );
    });
  });

  test("blocks duplicate local notification tests while one is pending", async () => {
    const pendingNotification = createDeferred<string>();
    mockSendTestNotification.mockReturnValue(pendingNotification.promise);
    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByRole("button", {
        name: "Send Test Notification",
      })).toBeTruthy();
    });

    const testButton = screen.getByTestId("settings-send-test-notification");
    const pressTestNotification =
      testButton.props.onClick as () => void | Promise<void>;

    await act(async () => {
      void pressTestNotification();
      void pressTestNotification();
      await Promise.resolve();
    });

    expect(mockSendTestNotification).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sending..." }).props
      .accessibilityState.disabled).toBe(true);

    await act(async () => {
      pendingNotification.resolve("notification-id");
      await pendingNotification.promise;
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Test notification sent",
        "A local Hoot notification was scheduled.",
      );
    });
  });

  test("opens Android notification settings when permission is blocked", async () => {
    mockGetNotificationDiagnostics.mockResolvedValue({
      supported: true,
      enabled: true,
      permissionCanAskAgain: false,
      permissionGranted: false,
      permissionStatus: "denied",
      backgroundAvailable: true,
      backgroundStatus: "available",
      taskRegistered: true,
      channelId: "lotide-notifications-v2",
      poll: {
        lastScheduledCount: 0,
      },
    });

    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByText("Blocked in Android settings")).toBeTruthy();
      expect(screen.getByRole("button", {
        name: "Open Notification Settings",
      })).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Open Notification Settings",
    }));

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  test("does not offer Android settings while permission can still be requested", async () => {
    mockGetNotificationDiagnostics.mockResolvedValue({
      supported: true,
      enabled: false,
      permissionCanAskAgain: true,
      permissionGranted: false,
      permissionStatus: "undetermined",
      backgroundAvailable: true,
      backgroundStatus: "available",
      taskRegistered: false,
      channelId: "lotide-notifications-v2",
      poll: {
        lastScheduledCount: 0,
      },
    });

    const screen = await renderSettingsScreen();

    await waitFor(() => {
      expect(screen.getByText("Needs permission (undetermined)")).toBeTruthy();
    });

    expect(screen.queryByRole("button", {
      name: "Open Notification Settings",
    })).toBeNull();
  });
});

/* end of SettingsScreen.test.tsx */
