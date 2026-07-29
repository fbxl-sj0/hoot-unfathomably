/*
    Project: Hoot Unfathomably
    --------------------------

    Validate account restoration, settings restoration, server refresh
    errors, and background notification registration at application startup.
*/

import * as React from "react";
import { Alert, Platform } from "react-native";
import {
  act,
  render,
  waitFor,
} from "@testing-library/react-native";

import AppRoot from "../App";
import {
  FEDIVERSE_SERVERS,
  makeContext,
} from "../testing/fediverseFixtures";

const mockDispatch = jest.fn();
const mockAccountContextQuery = jest.fn();
const mockAccountContextStore = jest.fn();
const mockAccountProfilesStore = jest.fn();
const mockAppSettingsQuery = jest.fn();
const mockGetInstance = jest.fn();
const mockGetNotificationEnabled = jest.fn();
const mockGetNotificationOnboardingPrompted = jest.fn();
const mockMarkNotificationOnboardingPrompted = jest.fn();
const mockRegisterNotificationPollTask = jest.fn();
const mockSetNotificationEnabled = jest.fn();
const mockLogWarning = jest.fn();

let mockCurrentCtx: LotideContext | null | undefined;

jest.mock("react-redux", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDispatch: () => mockDispatch,
}));

jest.mock("../hooks/useCachedResources", () => ({
  __esModule: true,
  default: () => true,
}));

jest.mock("../hooks/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

jest.mock("../hooks/useLotideCtx", () => ({
  __esModule: true,
  useLotideCtx: () => mockCurrentCtx,
}));

jest.mock("../navigation", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../components/AppErrorBoundary", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("../services/StorageService", () => ({
  __esModule: true,
  lotideContext: {
    query: (...args: unknown[]) => mockAccountContextQuery(...args),
    store: (...args: unknown[]) => mockAccountContextStore(...args),
  },
  lotideContextKV: {
    store: (...args: unknown[]) => mockAccountProfilesStore(...args),
  },
  appSettings: {
    defaults: {
      defaultFeedSort: "hot",
    },
    query: (...args: unknown[]) => mockAppSettingsQuery(...args),
  },
}));

jest.mock("../services/UnfathomablyService", () => ({
  __esModule: true,
  getInstance: (...args: unknown[]) => mockGetInstance(...args),
}));

jest.mock("../services/NotificationPoller", () => ({
  __esModule: true,
  getNotificationEnabled: (...args: unknown[]) =>
    mockGetNotificationEnabled(...args),
  getNotificationOnboardingPrompted: (...args: unknown[]) =>
    mockGetNotificationOnboardingPrompted(...args),
  markNotificationOnboardingPrompted: (...args: unknown[]) =>
    mockMarkNotificationOnboardingPrompted(...args),
  registerNotificationPollTask: (...args: unknown[]) =>
    mockRegisterNotificationPollTask(...args),
  setNotificationEnabled: (...args: unknown[]) =>
    mockSetNotificationEnabled(...args),
}));

jest.mock("../store/reduxStore", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("../utils/debugLog", () => ({
  __esModule: true,
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
}));

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

describe("AppRoot", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCurrentCtx = undefined;
    mockAccountContextQuery.mockResolvedValue(undefined);
    mockAccountContextStore.mockResolvedValue(undefined);
    mockAccountProfilesStore.mockResolvedValue(undefined);
    mockAppSettingsQuery.mockResolvedValue({ defaultFeedSort: "hot" });
    mockGetInstance.mockResolvedValue({
      title: "Social",
      version: "1.0",
    });
    mockGetNotificationEnabled.mockResolvedValue(false);
    mockGetNotificationOnboardingPrompted.mockResolvedValue(true);
    mockMarkNotificationOnboardingPrompted.mockResolvedValue(undefined);
    mockRegisterNotificationPollTask.mockResolvedValue("unchanged");
    mockSetNotificationEnabled.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)(
    "restores a current %s account and app settings",
    async (_label, family) => {
      const storedContext = makeContext(family);
      mockAccountContextQuery.mockResolvedValue(storedContext);

      await render(<AppRoot />);

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "lotide/setCtx",
            payload: storedContext,
          }),
        );
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "settings/setAppSettings",
            payload: { defaultFeedSort: "hot" },
          }),
        );
      });
      expect(storedContext.apiUrl).toBe(FEDIVERSE_SERVERS[family].origin);
    },
  );

  test("clears a pre-migration Lotide API context", async () => {
    mockAccountContextQuery.mockResolvedValue({
      apiUrl: "https://legacy.example/api/unstable",
      login: {
        token: "old-token",
        user: { id: 1, username: "alice" },
      },
    });

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockAccountContextStore).toHaveBeenCalledWith({});
      expect(mockAccountProfilesStore).toHaveBeenCalledWith({});
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lotide/setCtx",
          payload: {},
        }),
      );
    });
  });

  test("logs stored account failures without crashing startup", async () => {
    mockAccountContextQuery.mockRejectedValue(new Error("storage down"));

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockLogWarning).toHaveBeenCalledWith(
        "Failed to load stored account context",
        "storage down",
      );
    });
  });

  test("restores background notification registration", async () => {
    mockCurrentCtx = makeContext("rebased");

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockRegisterNotificationPollTask).toHaveBeenCalledTimes(1);
      expect(mockGetInstance).toHaveBeenCalledWith(
        "https://rebased.example",
      );
    });
  });

  test("offers notification activation after the first account becomes active", async () => {
    const currentContext = makeContext("unfathomably");
    mockCurrentCtx = currentContext;
    mockGetNotificationOnboardingPrompted.mockResolvedValue(false);

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockMarkNotificationOnboardingPrompted).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        "Turn on notifications?",
        expect.stringContaining("check your account in the background"),
        expect.arrayContaining([
          expect.objectContaining({
            style: "cancel",
            text: "Not now",
          }),
          expect.objectContaining({
            text: "Enable notifications",
          }),
        ]),
      );
    });

    const promptCall = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]) => title === "Turn on notifications?",
    );
    const enableButton = promptCall?.[2].find(
      (button: { text?: string }) =>
        button.text === "Enable notifications",
    );

    await act(async () => {
      enableButton?.onPress();
      await Promise.resolve();
    });

    expect(mockSetNotificationEnabled).toHaveBeenCalledWith(
      true,
      currentContext,
    );
  });

  test("does not offer notification activation before sign-in", async () => {
    mockCurrentCtx = undefined;
    mockGetNotificationOnboardingPrompted.mockResolvedValue(false);

    await render(<AppRoot />);
    await Promise.resolve();

    expect(mockGetNotificationOnboardingPrompted).not.toHaveBeenCalled();
    expect(mockMarkNotificationOnboardingPrompted).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Turn on notifications?",
      expect.anything(),
      expect.anything(),
    );
  });

  test("records onboarding without interrupting an already-enabled account", async () => {
    mockCurrentCtx = makeContext("rebased");
    mockGetNotificationOnboardingPrompted.mockResolvedValue(false);
    mockGetNotificationEnabled.mockResolvedValue(true);

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockMarkNotificationOnboardingPrompted).toHaveBeenCalledTimes(1);
    });
    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Turn on notifications?",
      expect.anything(),
      expect.anything(),
    );
    expect(mockSetNotificationEnabled).not.toHaveBeenCalled();
  });

  test("reports notification activation failures without repeating onboarding", async () => {
    mockCurrentCtx = makeContext("pleroma");
    mockGetNotificationOnboardingPrompted.mockResolvedValue(false);
    mockSetNotificationEnabled.mockRejectedValue(
      new Error("permission denied"),
    );

    await render(<AppRoot />);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Turn on notifications?",
        expect.any(String),
        expect.any(Array),
      );
    });

    const promptCall = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]) => title === "Turn on notifications?",
    );
    const enableButton = promptCall?.[2].find(
      (button: { text?: string }) =>
        button.text === "Enable notifications",
    );

    await act(async () => {
      enableButton?.onPress();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Cannot enable notifications",
        "permission denied",
      );
    });
    expect(mockMarkNotificationOnboardingPrompted).toHaveBeenCalledTimes(1);
  });

  test("reports notification restoration failures diagnostically", async () => {
    mockRegisterNotificationPollTask.mockRejectedValue(
      new Error("scheduler unavailable"),
    );

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockLogWarning).toHaveBeenCalledWith(
        "Failed to restore background notifications",
        "scheduler unavailable",
      );
    });
  });

  test("shows a server refresh error for the active account", async () => {
    mockCurrentCtx = makeContext("rebased");
    mockGetInstance.mockRejectedValue(new Error("server unavailable"));

    await render(<AppRoot />);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Cannot refresh server info",
        "server unavailable",
      );
    });
  });
});

/* end of App.test.tsx */
