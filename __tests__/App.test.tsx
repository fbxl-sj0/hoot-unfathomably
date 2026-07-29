/*
    Project: Hoot Unfathomably
    --------------------------

    Validate account restoration, settings restoration, server refresh
    errors, and background notification registration at application startup.
*/

import * as React from "react";
import { Alert } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

import AppRoot from "../App";

const mockDispatch = jest.fn();
const mockAccountContextQuery = jest.fn();
const mockAccountContextStore = jest.fn();
const mockAccountProfilesStore = jest.fn();
const mockAppSettingsQuery = jest.fn();
const mockGetInstance = jest.fn();
const mockRegisterNotificationPollTask = jest.fn();
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
  registerNotificationPollTask: (...args: unknown[]) =>
    mockRegisterNotificationPollTask(...args),
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
    mockRegisterNotificationPollTask.mockResolvedValue("unchanged");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("restores a current Unfathomably account and app settings", async () => {
    const storedContext = {
      apiUrl: "https://social.example",
      login: {
        token: "token-1",
        user: {
          id: "42",
          username: "alice",
        },
      },
    } as unknown as LotideContext;
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
  });

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
    mockCurrentCtx = {
      apiUrl: "https://social.example",
      login: {
        token: "token-1",
        user: { id: 42, username: "alice" } as Profile,
      },
    };

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockRegisterNotificationPollTask).toHaveBeenCalledTimes(1);
      expect(mockGetInstance).toHaveBeenCalledWith(
        "https://social.example",
      );
    });
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
    mockCurrentCtx = {
      apiUrl: "https://social.example",
      login: {
        token: "token-1",
        user: { id: 42, username: "alice" } as Profile,
      },
    };
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
