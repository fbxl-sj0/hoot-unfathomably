/*
    Project: Hoot Mobile
    -------------------

    File: NotificationScreen.test.tsx

    Purpose:

        Validate notification screen loading, login gating, and defensive
        rendering behavior.

    Responsibilities:

        • Verify notifications load when a Lotide context is available
        • Verify unauthenticated users see the sign-in prompt
        • Verify partial notification-related records do not crash rendering

    This file intentionally does NOT contain:

        • Live network tests
        • Push notification registration tests
        • Deep navigation integration tests
*/

import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import NotificationScreen, {
  refreshNotificationsForScreen,
} from "../NotificationScreen";

const mockUsePost = jest.fn();
const mockUseComment = jest.fn();
const mockGetNotifications = jest.fn();
const mockSuggestLoginRender = jest.fn();
const mockNavigate = jest.fn();

jest.mock("@react-navigation/core", () => ({
  __esModule: true,
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    text: "#000",
    tint: "#c84",
  }),
}));

jest.mock("../../hooks/usePost", () => ({
  __esModule: true,
  default: (id: unknown) => mockUsePost(id),
}));

jest.mock("../../hooks/useComment", () => ({
  __esModule: true,
  default: (id: unknown) => mockUseComment(id),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  getNotifications: (...args: unknown[]) =>
    mockGetNotifications(...args),
}));

jest.mock("../../components/SuggestLogin", () => ({
  __esModule: true,
  default: () => {
    mockSuggestLoginRender();
    return null;
  },
}));

const mockStore = configureStoreMock([]);

function renderWithStore(ui: React.ReactElement, ctx: LotideContext = {}) {
  return render(<Provider store={mockStore({ lotide: { ctx } })}>{ui}</Provider>);
}

function deferred<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

describe("NotificationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNotifications.mockResolvedValue([]);
  });

  test("loads notifications immediately once context is present", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue(undefined);
    mockUseComment.mockReturnValue(undefined);
    mockGetNotifications.mockResolvedValue([]);

    await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(1);
    });
    expect(addListener).toHaveBeenCalledWith("focus", expect.any(Function));
  });

  test("ignores notification responses after refresh cleanup", async () => {
    const request = deferred<FullNotification[]>();
    const setNotifications = jest.fn();
    const setLoadError = jest.fn();
    const stopLoading = jest.fn();

    mockGetNotifications.mockReturnValueOnce(request.promise);

    const cleanup = refreshNotificationsForScreen(
      { login: { token: "token-1" } },
      {
        setNotifications,
        setLoadError,
        stopLoading,
      },
    );

    expect(setLoadError).toHaveBeenCalledWith("");
    setLoadError.mockClear();
    cleanup();

    request.resolve([
      {
        unseen: true,
        kind: "user_follow",
        actor: {
          id: 45,
          username: "latefollower",
          host: "example.com",
          local: false,
          is_bot: false,
          remote_url: "https://example.com/@latefollower",
        },
      },
    ]);
    await request.promise;
    await Promise.resolve();

    expect(setNotifications).not.toHaveBeenCalled();
    expect(setLoadError).not.toHaveBeenCalled();
    expect(stopLoading).not.toHaveBeenCalled();
  });

  test("ignores notification errors after refresh cleanup", async () => {
    const request = deferred<FullNotification[]>();
    const setNotifications = jest.fn();
    const setLoadError = jest.fn();
    const stopLoading = jest.fn();

    mockGetNotifications.mockReturnValueOnce(request.promise);

    const cleanup = refreshNotificationsForScreen(
      { login: { token: "token-1" } },
      {
        setNotifications,
        setLoadError,
        stopLoading,
      },
    );

    expect(setLoadError).toHaveBeenCalledWith("");
    setLoadError.mockClear();
    cleanup();

    request.reject(new Error("offline"));
    await request.promise.catch(() => undefined);
    await Promise.resolve();

    expect(setNotifications).not.toHaveBeenCalled();
    expect(setLoadError).not.toHaveBeenCalled();
    expect(stopLoading).not.toHaveBeenCalled();
  });

  test("stays on Sign in prompt when no context exists", async () => {
    const addListener = jest.fn();
    const navigation = { addListener } as { addListener: typeof addListener };

    await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
    );

    expect(mockSuggestLoginRender).toHaveBeenCalled();
    expect(mockGetNotifications).not.toHaveBeenCalled();
  });

  test("shows empty state when there are no notifications", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue({
      id: 1,
      title: "Post title",
      author: { id: 1, username: "poster", host: "example.com", local: true },
    } as unknown as Post);
    mockUseComment.mockReturnValue({
      id: 1,
      author: { id: 1, username: "commenter", host: "example.com", local: true },
    } as unknown as Comment);
    mockGetNotifications.mockResolvedValue([]);

    const { getByText } = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(1);
      expect(getByText("No notifications yet")).toBeTruthy();
    });
  });

  test("shows a retry action when notifications fail to load", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue(undefined);
    mockUseComment.mockReturnValue(undefined);
    mockGetNotifications.mockRejectedValue(new Error("offline"));

    const screen = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(screen.getByText("Cannot load notifications")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(2);
    });
  });

  test("keeps visible notifications when a refresh fails", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue(undefined);
    mockUseComment.mockReturnValue(undefined);
    mockGetNotifications
      .mockResolvedValueOnce([
        {
          unseen: true,
          kind: "user_follow",
          actor: {
            id: 44,
            username: "newfollower",
            host: "example.com",
            local: false,
            is_bot: false,
            remote_url: "https://example.com/@alice",
          },
        },
      ])
      .mockRejectedValueOnce(new Error("offline"));

    const screen = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(screen.getByText("newfollower")).toBeTruthy();
    });

    await act(async () => {
      screen.getByTestId("notification-list").props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Cannot load notifications")).toBeTruthy();
      expect(screen.getByText("newfollower")).toBeTruthy();
      expect(
        screen.getByTestId("notification-list").props.refreshing,
      ).toBe(false);
    });
  });

  test("renders notification records with missing authors safely", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue({
      id: 9,
      title: "Post title",
      author: undefined,
      community: undefined,
    } as unknown as Post);
    mockUseComment.mockImplementation((id: number | undefined) => {
      if (id === 30) {
        return {
          id: 30,
          author: undefined,
          content_text: "Original comment",
        } as unknown as Comment;
      }

      if (id === 31) {
        return {
          id: 31,
          author: undefined,
          content_text: "Reply comment",
        } as unknown as Comment;
      }

      return undefined;
    });
    mockGetNotifications.mockResolvedValue([
      {
        unseen: true,
        commentId: 31,
        origin: {
          type: "comment",
          id: 30,
        },
        postId: 9,
      },
    ]);

    const screen = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Post title")).toBeTruthy();
      expect(screen.getAllByText("Unknown author").length).toBeGreaterThan(0);
    });
  });

  test("renders embedded notification records before cache fetches complete", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue(undefined);
    mockUseComment.mockReturnValue(undefined);
    mockGetNotifications.mockResolvedValue([
      {
        unseen: true,
        notificationType: "post_reply",
        commentId: 31,
        origin: {
          type: "post",
          id: 9,
        },
        postId: 9,
        post: {
          id: 9,
          title: "Embedded notification target",
          author: undefined,
          community: undefined,
        },
        reply: {
          id: 31,
          author: {
            id: 2,
            username: "commenter",
            host: "lotide.fbxl.net",
            local: true,
          },
          content_text: "Fresh embedded reply",
        },
      },
    ]);

    const screen = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Embedded notification target")).toBeTruthy();
      expect(screen.getByText("Fresh embedded reply")).toBeTruthy();
    });
  });

  test("opens the related post with highlighted notification comments", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue({
      id: 9,
      title: "Notification target",
      author: { id: 1, username: "poster", host: "lotide.fbxl.net", local: true },
    } as unknown as Post);
    mockUseComment.mockImplementation((id: number | undefined) => {
      if (id === 30 || id === 31) {
        return {
          id,
          author: {
            id: 2,
            username: "commenter",
            host: "lotide.fbxl.net",
            local: true,
          },
          content_text: `Comment ${id}`,
        } as unknown as Comment;
      }

      return undefined;
    });
    mockGetNotifications.mockResolvedValue([
      {
        unseen: true,
        commentId: 31,
        origin: {
          type: "comment",
          id: 30,
        },
        postId: 9,
      },
    ]);

    const screen = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(screen.getByText("Notification target")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Open notification for Notification target",
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("Post", {
      postId: 9,
      highlightedComments: [30, 31],
    });
  });

  test("renders follow notifications from hitide 0.17+", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue(undefined);
    mockUseComment.mockReturnValue(undefined);
    mockGetNotifications.mockResolvedValue([
      {
        unseen: true,
        kind: "user_follow",
        actor: {
          id: 44,
          username: "newfollower",
          host: "example.com",
          local: false,
          is_bot: false,
          remote_url: "https://example.com/@alice",
        },
      },
    ]);

    const screen = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      { login: { token: "token-1" } },
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(1);
      expect(screen.getByText("New follower")).toBeTruthy();
      expect(screen.getByText("newfollower")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Open profile for newfollower",
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("ProfileActivity", {
      userId: 44,
      username: "newfollower",
    });
  });

  test("opens private message notifications as conversation threads", async () => {
    const addListener = jest.fn().mockReturnValue(() => {});
    const navigation = { addListener } as { addListener: typeof addListener };
    mockUsePost.mockReturnValue(undefined);
    mockUseComment.mockReturnValue(undefined);
    mockGetNotifications.mockResolvedValue([
      {
        unseen: true,
        kind: "private_message",
        message: {
          id: 33,
          author: {
            id: 44,
            username: "sender",
            host: "example.com",
            local: false,
          },
          recipient: {
            id: 1,
            username: "sj_zero",
            host: "lotide.fbxl.net",
            local: true,
          },
          created: "2026-06-18T12:00:00Z",
          local: false,
          content_text: "hello by message",
          content_html: "<p>hello by message</p>",
          sensitive: false,
        },
      },
    ]);

    const screen = await renderWithStore(
      <NotificationScreen
        navigation={navigation as never}
        route={
          {
            key: "NotificationScreen",
            name: "NotificationScreen",
            params: undefined,
          } as never
        }
      />,
      {
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "sj_zero",
            host: "lotide.fbxl.net",
          },
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("New private message")).toBeTruthy();
      expect(screen.getByText("hello by message")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Open message from sender",
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("MessageThread", {
      userId: 44,
      username: "sender",
    });
  });
});

/* end of NotificationScreen.test.tsx */
