/*
    Project: Hoot Mobile
    -------------------

    File: ModerationScreen.test.tsx

    Purpose:

        Protect the moderation dashboard backed by the Lotide
        moderator community and flag APIs.

    Responsibilities:

        • Verify moderated communities are loaded
        • Verify flags are loaded for the selected community
        • Verify flagged posts navigate to their post screen
        • Verify flag dismissal behavior is request-safe

    This file intentionally does NOT contain:

        • Flag approval behavior
        • Site administration behavior
        • API transport tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import ModerationScreen from "../ModerationScreen";

const mockGetModeratedCommunities = jest.fn();
const mockGetCommunityFlags = jest.fn();
const mockDismissCommunityFlag = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    text: "#111",
    secondaryText: "#444",
    secondaryBackground: "#eee",
    tint: "#f90",
    green: "#0a0",
    blue: "#00f",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  getModeratedCommunities: (...args: unknown[]) =>
    mockGetModeratedCommunities(...args),
  getCommunityFlags: (...args: unknown[]) => mockGetCommunityFlags(...args),
  dismissCommunityFlag: (...args: unknown[]) =>
    mockDismissCommunityFlag(...args),
}));

const mockStore = configureStoreMock([]);

function renderWithStore(ui: React.ReactElement) {
  return render(
    <Provider
      store={mockStore({
        lotide: {
          ctx: {
            apiUrl: "https://lotide.fbxl.net/api/unstable",
            login: {
              token: "token-1",
              user: { id: 1, username: "sj_zero", host: "lotide.fbxl.net" },
            },
          },
        },
      })}
    >
      {ui}
    </Provider>,
  );
}

function deferred<T>() {
  let resolveValue: (value: T | PromiseLike<T>) => void = () => undefined;
  let rejectValue: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });

  return {
    promise,
    resolve: resolveValue,
    reject: rejectValue,
  };
}

describe("ModerationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockGetModeratedCommunities.mockResolvedValue({
      items: [
        {
          id: 7,
          name: "lotide",
          host: "lotide.fbxl.net",
          local: true,
        },
      ],
      next_page: null,
    });
    mockGetCommunityFlags.mockResolvedValue({
      items: [
        {
          id: 55,
          flagger: {
            id: 2,
            username: "mod-helper",
            host: "lotide.fbxl.net",
            local: true,
          },
          content: {
            content_text: "Needs review",
          },
          post: {
            id: 99,
            title: "Reported post",
          },
        },
      ],
      next_page: null,
    });
    mockDismissCommunityFlag.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads moderated communities, opens flagged posts, and dismisses flags", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "moderation",
      name: "Moderation",
      params: undefined,
    };

    const screen = await renderWithStore(
      <ModerationScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(mockGetModeratedCommunities).toHaveBeenCalledTimes(1);
      expect(mockGetCommunityFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        }),
        7,
      );
      expect(screen.getByText("Reported post")).toBeTruthy();
      expect(screen.getByText("Needs review")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Open flagged post Reported post" }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Post", { postId: 99 });

    await fireEvent.press(screen.getByText("Dismiss"));
    await waitFor(() => {
      expect(mockDismissCommunityFlag).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        }),
        55,
      );
      expect(screen.queryByText("Reported post")).toBeNull();
    });
  });

  test("shows an empty state when no moderated communities exist", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "moderation",
      name: "Moderation",
      params: undefined,
    };
    mockGetModeratedCommunities.mockResolvedValue({
      items: [],
      next_page: null,
    });

    const screen = await renderWithStore(
      <ModerationScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No moderated communities")).toBeTruthy();
    });
    expect(mockGetCommunityFlags).not.toHaveBeenCalled();
  });

  test("shows a friendly error when moderated communities cannot load", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "moderation",
      name: "Moderation",
      params: undefined,
    };
    mockGetModeratedCommunities.mockRejectedValue(
      new Error("server unavailable"),
    );

    const screen = await renderWithStore(
      <ModerationScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Cannot load moderated communities")).toBeTruthy();
    });
    expect(mockGetCommunityFlags).not.toHaveBeenCalled();
  });

  test("blocks duplicate flag dismissals while one is pending", async () => {
    const pendingDismiss = deferred<void>();
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "moderation",
      name: "Moderation",
      params: undefined,
    };

    mockDismissCommunityFlag.mockReturnValue(pendingDismiss.promise);

    const screen = await renderWithStore(
      <ModerationScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Reported post")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Dismissing..." }),
    );

    await waitFor(() => {
      expect(mockDismissCommunityFlag).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Dismissing...")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Dismissing..." }).props
        .accessibilityState.disabled).toBe(true);
    });

    await act(async () => {
      pendingDismiss.resolve(undefined);
      await pendingDismiss.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Reported post")).toBeNull();
    });
  });

  test("reports flag dismissal failures and reenables the action", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "moderation",
      name: "Moderation",
      params: undefined,
    };

    mockDismissCommunityFlag.mockRejectedValue(new Error("still under review"));

    const screen = await renderWithStore(
      <ModerationScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Reported post")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Failed to dismiss flag",
        "still under review",
      );
      expect(screen.getByText("Reported post")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Dismiss" }).props
        .accessibilityState.disabled).toBe(false);
    });
  });

  test("ignores flag dismissal failures after leaving the moderation screen", async () => {
    const pendingDismiss = deferred<void>();
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "moderation",
      name: "Moderation",
      params: undefined,
    };

    mockDismissCommunityFlag.mockReturnValue(pendingDismiss.promise);

    const screen = await renderWithStore(
      <ModerationScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Reported post")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(mockDismissCommunityFlag).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedDismiss = pendingDismiss.promise.catch(() => undefined);
    pendingDismiss.reject(new Error("late moderation failure"));

    await drainedDismiss;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Failed to dismiss flag",
      "late moderation failure",
    );
  });
});

/* end of ModerationScreen.test.tsx */
