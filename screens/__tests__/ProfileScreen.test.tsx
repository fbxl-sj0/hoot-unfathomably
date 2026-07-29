/*
    Project: Hoot Mobile
    -------------------

    File: ProfileScreen.test.tsx

    Purpose:

        Validate the logged-in profile screen and its action list.

    Responsibilities:

        • Verify Lotide profile data and followed communities render
        • Verify profile load failures show a friendly error
        • Verify implemented profile actions navigate or dispatch correctly
        • Verify account switching and logout are duplicate-safe

    This file intentionally does NOT contain:

        • Login form tests
        • Storage logout persistence tests
        • Live Lotide profile tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { configureStore } from "redux-mock-store";
import { Provider } from "react-redux";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import ProfileScreen from "../ProfileScreen";

const mockGetUserData = jest.fn();
const mockGetAllCommunities = jest.fn();
const mockLogout = jest.fn();
const mockLotideContextRemove = jest.fn();
const mockLotideContextKVRemove = jest.fn();
const mockLotideContextKVLogout = jest.fn();
const mockLogWarning = jest.fn();
const mockEmitter = {
  addListener: jest.fn(),
};

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    text: "#111",
    secondaryText: "#444",
    secondaryBackground: "#eee",
    tertiaryBackground: "#ddd",
    tint: "#09f",
    secondaryTint: "#999",
    placeholderText: "#999",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  getUserData: (...args: unknown[]) => mockGetUserData(...args),
  getAllCommunities: (...args: unknown[]) => mockGetAllCommunities(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
}));

jest.mock("../../services/StorageService", () => ({
  __esModule: true,
  lotideContext: {
    remove: (...args: unknown[]) => mockLotideContextRemove(...args),
  },
  lotideContextKV: {
    remove: (...args: unknown[]) => mockLotideContextKVRemove(...args),
    logout: (...args: unknown[]) => mockLotideContextKVLogout(...args),
  },
}));

jest.mock("../../utils/debugLog", () => ({
  __esModule: true,
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
}));

jest.mock("react-native/Libraries/EventEmitter/NativeEventEmitter", () => {
  return jest.fn(() => mockEmitter);
});

const mockStore = configureStore([]);

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {
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

describe("ProfileScreen", () => {
  const baseRoute = {
    key: "profile",
    name: "ProfileScreen",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
    mockLotideContextRemove.mockResolvedValue(undefined);
    mockLotideContextKVRemove.mockResolvedValue(undefined);
    mockLotideContextKVLogout.mockResolvedValue(undefined);
    mockGetUserData.mockResolvedValue({
      id: 1,
      username: "sj_zero",
      host: "lotide.fbxl.net",
      local: true,
      description: {
        content_text: "I use Lotide everywhere.",
      },
    });
    mockGetAllCommunities.mockResolvedValue([
      {
        id: 1,
        name: "lotide",
        host: "lotide.fbxl.net",
        local: false,
      },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createProfileStore() {
    return mockStore({
      lotide: {
        ctx: {
          apiUrl: "https://lotide.fbxl.net/api/unstable",
          login: {
            token: "token-1",
            user: {
              id: 1,
              username: "sj_zero",
              host: "lotide.fbxl.net",
            },
          },
        },
      },
    });
  }

  async function renderWithContext(ui: React.ReactElement) {
    const store = createProfileStore();
    const screen = await render(<Provider store={store}>{ui}</Provider>);

    return Object.assign(screen, { reduxStore: store });
  }

  test("renders profile data when user data loads", async () => {
    const navigation = { addListener: jest.fn() } as never;

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: "https://lotide.fbxl.net/api/unstable" }),
        1,
      );
    });

    expect(screen.getByText("sj_zero")).toBeTruthy();
    expect(screen.getByText("I use Lotide everywhere.")).toBeTruthy();
    expect(mockGetAllCommunities).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: "https://lotide.fbxl.net/api/unstable" }),
      true,
    );
    expect(screen.getByText("lotide")).toBeTruthy();
  });

  test("renders every followed community returned by the service", async () => {
    const navigation = { addListener: jest.fn() } as never;
    mockGetAllCommunities.mockResolvedValueOnce([
      {
        id: 1,
        name: "lotide",
        host: "lotide.fbxl.net",
        local: false,
      },
      {
        id: 2,
        name: "announcements",
        host: "lotide.fbxl.net",
        local: true,
      },
    ]);

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenCalledTimes(1);
    });

    expect(mockGetAllCommunities).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: "https://lotide.fbxl.net/api/unstable" }),
      true,
    );
    expect(screen.getByText("lotide")).toBeTruthy();
    expect(screen.getByText("announcements")).toBeTruthy();
  });

  test("shows a friendly load error when profile request fails", async () => {
    const navigation = { addListener: jest.fn() } as never;
    mockGetUserData.mockRejectedValue(new Error("cannot connect"));

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Cannot load profile")).toBeTruthy();
    });
  });

  test("keeps visible profile data when a refresh fails", async () => {
    const navigation = { addListener: jest.fn() } as never;
    mockGetUserData
      .mockResolvedValueOnce({
        id: 1,
        username: "sj_zero",
        host: "lotide.fbxl.net",
        local: true,
        description: {
          content_text: "I use Lotide everywhere.",
        },
      })
      .mockRejectedValueOnce(new Error("cannot connect"));
    mockGetAllCommunities
      .mockResolvedValueOnce([
        {
          id: 1,
          name: "lotide",
          host: "lotide.fbxl.net",
          local: false,
        },
      ])
      .mockRejectedValueOnce(new Error("cannot connect"));

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("sj_zero")).toBeTruthy();
      expect(screen.getByText("I use Lotide everywhere.")).toBeTruthy();
      expect(screen.getByText("lotide")).toBeTruthy();
    });
    expect(
      screen.getByTestId("profile-scroll").props.refreshControl.props.refreshing,
    ).toBe(false);

    await act(async () => {
      screen.getByTestId("profile-scroll").props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalledTimes(2);
      expect(mockGetAllCommunities).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Cannot load profile")).toBeTruthy();
      expect(screen.getByText("Cannot load followed communities")).toBeTruthy();
      expect(screen.getByText("sj_zero")).toBeTruthy();
      expect(screen.getByText("I use Lotide everywhere.")).toBeTruthy();
      expect(screen.getByText("lotide")).toBeTruthy();
      expect(
        screen.getByTestId("profile-scroll").props.refreshControl.props.refreshing,
      ).toBe(false);
    });
  });

  test("shows implemented profile actions", async () => {
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("App Settings")).toBeTruthy();
    });

    expect(screen.queryByText("Edit Account")).toBeNull();
    expect(screen.queryByText("Your Posts / Comments")).toBeNull();
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.queryByText("Coming soon")).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", { name: "Your Activity" }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("ProfileActivity", {
      userId: 1,
      username: "sj_zero",
    });

    await fireEvent.press(screen.getByRole("button", { name: "Moderation" }));
    expect(navigation.navigate).toHaveBeenCalledWith("Moderation");

    await fireEvent.press(screen.getByRole("button", { name: "App Settings" }));
    expect(navigation.navigate).toHaveBeenCalledWith("Settings");
  });

  test("clears the persisted active account before switching accounts", async () => {
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Switch Account")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Switch Account" }));

    await waitFor(() => {
      expect(mockLotideContextRemove).toHaveBeenCalledTimes(1);
    });
    expect(screen.reduxStore.getActions()).toContainEqual({
      type: "lotide/setCtx",
      payload: {},
    });
  });

  test("blocks duplicate account switches while clearing storage", async () => {
    const clearActive = createDeferred<void>();
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };
    mockLotideContextRemove.mockReturnValueOnce(clearActive.promise);

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Switch Account")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Switch Account" }));

    await waitFor(() => {
      expect(mockLotideContextRemove).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Switching Account...")).toBeTruthy();
      expect(screen.getByRole("button", {
        name: "Switching Account...",
      }).props.accessibilityState.disabled).toBe(true);
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Switching Account..." }),
    );
    expect(mockLotideContextRemove).toHaveBeenCalledTimes(1);

    await act(async () => {
      clearActive.resolve(undefined);
      await clearActive.promise;
    });

    await waitFor(() => {
      expect(screen.reduxStore.getActions()).toContainEqual({
        type: "lotide/setCtx",
        payload: {},
      });
    });
  });

  test("ignores late account-switch failures after leaving the profile", async () => {
    const clearActive = createDeferred<void>();
    const drainedClearActive = clearActive.promise.catch(() => undefined);
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockLotideContextRemove.mockReturnValueOnce(clearActive.promise);

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Switch Account")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Switch Account" }));
    screen.unmount();

    clearActive.reject(new Error("storage busy"));
    await drainedClearActive;
    await Promise.resolve();

    expect(alert).not.toHaveBeenCalledWith(
      "Cannot switch account",
      "storage busy",
    );
  });

  test("does not open duplicate logout prompts", async () => {
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Log Out")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Log Out" }));
    await fireEvent.press(screen.getByRole("button", { name: "Log Out" }));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "Log out",
      "Would you like to keep the login profile handy for later?",
      expect.any(Array),
      { cancelable: true },
    );
  });

  test("clears the active account after keeping a logged-out profile", async () => {
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        const keepButton = Array.isArray(buttons)
          ? buttons.find(button => button.text === "Keep")
          : undefined;
        keepButton?.onPress?.();
      });

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Log Out")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => {
      expect(mockLotideContextKVLogout).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        }),
      );
      expect(mockLotideContextRemove).toHaveBeenCalledTimes(1);
    });
    expect(mockLogout).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://lotide.fbxl.net/api/unstable",
      }),
    );
    expect(screen.reduxStore.getActions()).toContainEqual({
      type: "lotide/setCtx",
      payload: {},
    });
    alert.mockRestore();
  });

  test("blocks duplicate logout runs after a keep-profile choice", async () => {
    const keepProfile = createDeferred<unknown>();
    let keepButton: { onPress?: () => void } | undefined;
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };
    jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        keepButton = Array.isArray(buttons)
          ? buttons.find(button => button.text === "Keep")
          : undefined;
      });
    mockLotideContextKVLogout.mockReturnValueOnce(keepProfile.promise);

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Log Out")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Log Out" }));

    await act(async () => {
      keepButton?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockLotideContextKVLogout).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Logging Out...")).toBeTruthy();
      expect(screen.getByRole("button", {
        name: "Logging Out...",
      }).props.accessibilityState.disabled).toBe(true);
    });

    await fireEvent.press(screen.getByRole("button", { name: "Logging Out..." }));
    expect(mockLotideContextKVLogout).toHaveBeenCalledTimes(1);

    await act(async () => {
      keepProfile.resolve(undefined);
      await keepProfile.promise;
    });

    await waitFor(() => {
      expect(mockLotideContextRemove).toHaveBeenCalledTimes(1);
      expect(screen.reduxStore.getActions()).toContainEqual({
        type: "lotide/setCtx",
        payload: {},
      });
    });
  });

  test("clears the active account when remote logout fails", async () => {
    const navigation = {
      addListener: jest.fn(),
      navigate: jest.fn(),
    };
    jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons) => {
      const removeButton = Array.isArray(buttons)
        ? buttons.find(button => button.text === "Remove")
        : undefined;
      removeButton?.onPress?.();
    });
    mockLogout.mockRejectedValueOnce(new Error("offline"));

    const screen = await renderWithContext(
      <ProfileScreen navigation={navigation as never} route={baseRoute as never} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Log Out")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => {
      expect(mockLotideContextKVRemove).toHaveBeenCalledWith(
        "sj_zero@https://lotide.fbxl.net/api/unstable",
      );
      expect(mockLotideContextRemove).toHaveBeenCalledTimes(1);
    });
    expect(mockLogWarning).toHaveBeenCalledWith(
      "Failed to invalidate Lotide login",
      "offline",
    );
    expect(screen.reduxStore.getActions()).toContainEqual({
      type: "lotide/setCtx",
      payload: {},
    });
  });
});

/* end of ProfileScreen.test.tsx */
