/*
    Project: Hoot Mobile
    -------------------

    File: ProfileActivityScreen.test.tsx

    Purpose:

        Protect the profile activity screen backed by the Lotide
        users/{id}/things API.

    Responsibilities:

        • Verify profile activity loads from the service layer
        • Verify paged activity appends without duplicate rows or requests
        • Verify comment activity navigates to the related post
        • Verify empty activity renders without crashing

    This file intentionally does NOT contain:

        • API transport tests
        • Account login tests
        • Moderation dashboard tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import ProfileActivityScreen from "../ProfileActivityScreen";

const mockGetUserThings = jest.fn();
const mockGetUserData = jest.fn();
const mockFollowUser = jest.fn();
const mockUnfollowUser = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    text: "#111",
    secondaryText: "#444",
    secondaryBackground: "#eee",
    tint: "#f90",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  followUser: (...args: unknown[]) => mockFollowUser(...args),
  getUserData: (...args: unknown[]) => mockGetUserData(...args),
  getUserThings: (...args: unknown[]) => mockGetUserThings(...args),
  unfollowUser: (...args: unknown[]) => mockUnfollowUser(...args),
}));

const mockStore = configureStoreMock([]);

function renderWithStore(ui: React.ReactElement) {
  return render(
    <Provider
      store={mockStore({
        lotide: {
            ctx: {
              apiUrl: "https://lotide.fbxl.net/api/unstable",
              apiVersion: 18,
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

describe("ProfileActivityScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserThings.mockResolvedValue({
      items: [
        {
          type: "comment",
          id: 44,
          content_html: "<p>Useful reply</p>",
          created: "2026-06-04T09:18:08.311607+00:00",
          post: {
            id: 12,
            title: "Parent post",
          },
        },
      ],
      next_page: null,
    });
    mockGetUserData.mockResolvedValue({
      id: 1,
      username: "sj_zero",
      host: "lotide.fbxl.net",
      local: true,
      description: {
        content_text: "I use Lotide.",
        content_markdown: null,
        content_html: null,
      },
    });
    mockFollowUser.mockResolvedValue({
      accepted: false,
      federation_status: "sent",
    });
    mockUnfollowUser.mockResolvedValue(undefined);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads activity and opens the related post for comments", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 1, username: "sj_zero" },
    };

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(mockGetUserThings).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        }),
        1,
      );
      expect(screen.getByText("Parent post")).toBeTruthy();
      expect(screen.getByText("Useful reply")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Open comment on Parent post" }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Post", {
      postId: 12,
      highlightedComments: [44],
    });
  });

  test("opens post activity directly", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 1, username: "sj_zero" },
    };
    mockGetUserThings.mockResolvedValue({
      items: [
        {
          type: "post",
          id: 55,
          title: "Original post",
          author: {
            id: 1,
            username: "sj_zero",
            host: "lotide.fbxl.net",
            local: true,
          },
          community: {
            id: 7,
            name: "lotide",
            host: "lotide.fbxl.net",
            local: true,
          },
        },
      ],
      next_page: null,
    });

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Original post")).toBeTruthy();
      expect(screen.getByText("lotide")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Open post Original post" }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Post", {
      postId: 55,
    });
  });

  test("shows an empty state when the activity list is empty", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 1 },
    };
    mockGetUserThings.mockResolvedValue({
      items: [],
      next_page: null,
    });

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No activity yet")).toBeTruthy();
    });
  });

  test("shows a friendly error when activity cannot be loaded", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 1 },
    };
    mockGetUserThings.mockRejectedValue(new Error("server unavailable"));

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Cannot load activity")).toBeTruthy();
    });
  });

  test("keeps visible profile activity when a refresh fails", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 1, username: "sj_zero" },
    };
    mockGetUserThings
      .mockResolvedValueOnce({
        items: [
          {
            type: "comment",
            id: 44,
            content_html: "<p>Useful reply</p>",
            created: "2026-06-04T09:18:08.311607+00:00",
            post: {
              id: 12,
              title: "Parent post",
            },
          },
        ],
        next_page: null,
      })
      .mockRejectedValueOnce(new Error("offline"));
    mockGetUserData
      .mockResolvedValueOnce({
        id: 1,
        username: "sj_zero",
        host: "lotide.fbxl.net",
        local: true,
        description: {
          content_text: "I use Lotide.",
          content_markdown: null,
          content_html: null,
        },
      })
      .mockRejectedValueOnce(new Error("offline"));

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Parent post")).toBeTruthy();
      expect(screen.getByText("Useful reply")).toBeTruthy();
      expect(screen.getByText("sj_zero")).toBeTruthy();
    });
    expect(screen.getByTestId("profile-activity-list").props.refreshing)
      .toBe(false);

    await act(async () => {
      screen.getByTestId("profile-activity-list").props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetUserThings).toHaveBeenCalledTimes(2);
      expect(mockGetUserData).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Cannot load activity")).toBeTruthy();
      expect(screen.getByText("Cannot load profile")).toBeTruthy();
      expect(screen.getByText("Parent post")).toBeTruthy();
      expect(screen.getByText("Useful reply")).toBeTruthy();
      expect(screen.getByText("sj_zero")).toBeTruthy();
      expect(screen.getByTestId("profile-activity-list").props.refreshing)
        .toBe(false);
    });
  });

  test("loads each profile activity page once and deduplicates overlap", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 1, username: "sj_zero" },
    };
    const nextPage = deferred<{
      items: Record<string, unknown>[];
      next_page: string | null;
    }>();

    mockGetUserThings
      .mockResolvedValueOnce({
        items: [
          {
            type: "comment",
            id: 44,
            content_html: "<p>First page reply</p>",
            created: "2026-06-04T09:18:08.311607+00:00",
            post: {
              id: 12,
              title: "Parent post",
            },
          },
        ],
        next_page: "page-2",
      })
      .mockReturnValueOnce(nextPage.promise);

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("First page reply")).toBeTruthy();
    });

    await act(async () => {
      screen.getByTestId("profile-activity-list").props.onEndReached();
      screen.getByTestId("profile-activity-list").props.onEndReached();
    });

    await waitFor(() => {
      expect(mockGetUserThings).toHaveBeenCalledTimes(2);
      expect(mockGetUserThings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          apiUrl: "https://lotide.fbxl.net/api/unstable",
        }),
        1,
        "page-2",
      );
    });

    await act(async () => {
      nextPage.resolve({
        items: [
          {
            type: "comment",
            id: 44,
            content_html: "<p>First page reply</p>",
            created: "2026-06-04T09:18:08.311607+00:00",
            post: {
              id: 12,
              title: "Parent post",
            },
          },
          {
            type: "post",
            id: 55,
            title: "Second page post",
            author: {
              id: 1,
              username: "sj_zero",
              host: "lotide.fbxl.net",
              local: true,
            },
            community: {
              id: 7,
              name: "lotide",
              host: "lotide.fbxl.net",
              local: true,
            },
          },
        ],
        next_page: null,
      });
      await nextPage.promise;
    });

    await waitFor(() => {
      expect(screen.getAllByText("First page reply")).toHaveLength(1);
      expect(screen.getByText("Second page post")).toBeTruthy();
    });
  });

  test("offers follow and message actions for other users on Lotide 0.18", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 2, username: "remote" },
    };
    mockGetUserThings.mockResolvedValue({
      items: [],
      next_page: null,
    });
    mockGetUserData.mockResolvedValue({
      id: 2,
      username: "remote",
      host: "remote.example",
      local: false,
      your_follow: undefined,
    });

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("remote")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Follow remote" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Message remote" })).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Follow remote" }));
    await waitFor(() => {
      expect(mockFollowUser).toHaveBeenCalledWith(
        expect.objectContaining({ apiVersion: 18 }),
        2,
      );
    });

    await fireEvent.press(screen.getByRole("button", { name: "Message remote" }));
    expect(navigation.navigate).toHaveBeenCalledWith("MessageThread", {
      userId: 2,
      username: "remote",
    });
  });

  test("prevents duplicate profile unfollow requests while pending", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 2, username: "remote" },
    };
    const pendingUnfollow = deferred<void>();
    mockGetUserThings.mockResolvedValue({
      items: [],
      next_page: null,
    });
    mockGetUserData.mockResolvedValue({
      id: 2,
      username: "remote",
      host: "remote.example",
      local: false,
      your_follow: {
        accepted: true,
        federation_status: "received",
      },
    });
    mockUnfollowUser.mockReturnValue(pendingUnfollow.promise);

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unfollow remote" }))
        .toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Unfollow remote" }));
    await fireEvent.press(screen.getByRole("button", { name: "Unfollow remote" }));

    await waitFor(() => {
      expect(mockUnfollowUser).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Unfollowing...")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Unfollow remote" }).props
          .accessibilityState.disabled,
      ).toBe(true);
    });

    await act(async () => {
      pendingUnfollow.resolve(undefined);
      await pendingUnfollow.promise;
    });

    await waitFor(() => {
      expect(mockGetUserThings).toHaveBeenCalledTimes(2);
      expect(mockGetUserData).toHaveBeenCalledTimes(2);
    });
  });

  test("ignores profile unfollow failures after leaving the screen", async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      key: "profile-activity",
      name: "ProfileActivity",
      params: { userId: 2, username: "remote" },
    };
    const pendingUnfollow = deferred<void>();
    mockGetUserThings.mockResolvedValue({
      items: [],
      next_page: null,
    });
    mockGetUserData.mockResolvedValue({
      id: 2,
      username: "remote",
      host: "remote.example",
      local: false,
      your_follow: {
        accepted: true,
        federation_status: "received",
      },
    });
    mockUnfollowUser.mockReturnValue(pendingUnfollow.promise);

    const screen = await renderWithStore(
      <ProfileActivityScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unfollow remote" }))
        .toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Unfollow remote" }));

    await waitFor(() => {
      expect(mockUnfollowUser).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedUnfollow = pendingUnfollow.promise.catch(() => undefined);
    pendingUnfollow.reject(new Error("late unfollow failure"));

    await drainedUnfollow;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith("Failed to unfollow user");
    expect(mockGetUserThings).toHaveBeenCalledTimes(1);
    expect(mockGetUserData).toHaveBeenCalledTimes(1);
  });
});

/* end of ProfileActivityScreen.test.tsx */
