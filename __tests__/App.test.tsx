/*
    Project: Hoot Mobile
    -------------------

    File: App.test.tsx

    Purpose:

        Validate root application startup and session recovery behavior.

    Responsibilities:

        - Verify stored context load failures are logged instead of becoming
          unhandled startup errors
        - Verify expired logins clear the active context even when saved-profile
          bookkeeping fails

    This file intentionally does NOT contain:

        - Navigation integration tests
        - Native notification delivery tests
        - Live Lotide API tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

import AppRoot from "../App";

const mockDispatch = jest.fn();
const mockLotideContextQuery = jest.fn();
const mockLotideContextStore = jest.fn();
const mockLotideContextKVStore = jest.fn();
const mockLotideContextKVLogout = jest.fn();
const mockAppSettingsQuery = jest.fn();
const mockGetInstanceInfo = jest.fn();
const mockGetUserData = jest.fn();
const mockIsAuthenticationError = jest.fn();
const mockRegisterNotificationPollTask = jest.fn();
const mockPollNotificationsNow = jest.fn();
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
    query: (...args: unknown[]) => mockLotideContextQuery(...args),
    store: (...args: unknown[]) => mockLotideContextStore(...args),
  },
  lotideContextKV: {
    store: (...args: unknown[]) => mockLotideContextKVStore(...args),
    logout: (...args: unknown[]) => mockLotideContextKVLogout(...args),
  },
  appSettings: {
    defaults: {
      defaultFeedSort: "hot",
    },
    query: (...args: unknown[]) => mockAppSettingsQuery(...args),
  },
}));

jest.mock("../services/LotideService", () => ({
  __esModule: true,
  getInstanceInfo: (...args: unknown[]) => mockGetInstanceInfo(...args),
  getUserData: (...args: unknown[]) => mockGetUserData(...args),
  isAuthenticationError: (...args: unknown[]) =>
    mockIsAuthenticationError(...args),
}));

jest.mock("../services/LotideNotificationPoller", () => ({
  __esModule: true,
  registerNotificationPollTask: (...args: unknown[]) =>
    mockRegisterNotificationPollTask(...args),
  pollNotificationsNow: (...args: unknown[]) =>
    mockPollNotificationsNow(...args),
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
    mockLotideContextQuery.mockResolvedValue(undefined);
    mockLotideContextStore.mockResolvedValue(undefined);
    mockLotideContextKVStore.mockResolvedValue(undefined);
    mockLotideContextKVLogout.mockResolvedValue(undefined);
    mockAppSettingsQuery.mockResolvedValue({ defaultFeedSort: "hot" });
    mockGetInstanceInfo.mockResolvedValue({
      apiVersion: 18,
      software: { name: "Lotide", version: "0.18.0" },
    });
    mockGetUserData.mockResolvedValue({
      id: 1,
      username: "sj_zero",
      host: "lotide.fbxl.net",
      local: true,
    });
    mockIsAuthenticationError.mockReturnValue(false);
    mockRegisterNotificationPollTask.mockResolvedValue("unchanged");
    mockPollNotificationsNow.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("logs stored context load failures during startup", async () => {
    mockLotideContextQuery.mockRejectedValue(new Error("storage down"));

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockLogWarning).toHaveBeenCalledWith(
        "Failed to load stored Lotide context",
        "storage down",
      );
    });
  });

  test("expires the active login when saved account expiry fails", async () => {
    mockCurrentCtx = {
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 18,
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "sj_zero",
          host: "lotide.fbxl.net",
          local: true,
        },
      },
    };
    mockGetUserData.mockRejectedValue(new Error("auth expired"));
    mockIsAuthenticationError.mockReturnValue(true);
    mockLotideContextKVLogout.mockRejectedValue(new Error("profile store down"));

    await render(<AppRoot />);

    await waitFor(() => {
      expect(mockLogWarning).toHaveBeenCalledWith(
        "Failed to expire saved Lotide login",
        "profile store down",
      );
      expect(mockLotideContextStore).toHaveBeenCalledWith({
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        apiVersion: 18,
      });
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lotide/setCtx",
          payload: {
            apiUrl: "https://lotide.fbxl.net/api/unstable",
            apiVersion: 18,
          },
        }),
      );
    });
  });
});

/* end of App.test.tsx */
