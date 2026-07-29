/*
    Project: Hoot Mobile
    -------------------

    File: MessageListScreen.test.tsx

    Purpose:

        Validate the Lotide private-message conversation list screen.

    Responsibilities:

        - Verify conversation previews load for Lotide 0.18 accounts
        - Verify conversation pages append without duplicate rows or requests
        - Verify conversation rows open the related thread
        - Verify load failures and dismissed conversations are recoverable

    This file intentionally does NOT contain:

        - Private-message thread composition tests
        - Live Lotide network tests
        - Native notification routing tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import MessageListScreen from "../MessageListScreen";

const mockDismissPrivateMessageConversation = jest.fn();
const mockGetPrivateMessageConversations = jest.fn();
const mockSuggestLoginRender = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    tertiaryBackground: "#ddd",
    text: "#000",
    tint: "#f5a524",
    secondaryTint: "#ff9f43",
    blue: "#00f",
    green: "#080",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  dismissPrivateMessageConversation: (...args: unknown[]) =>
    mockDismissPrivateMessageConversation(...args),
  getPrivateMessageConversations: (...args: unknown[]) =>
    mockGetPrivateMessageConversations(...args),
}));

jest.mock("../../components/SuggestLogin", () => ({
  __esModule: true,
  default: () => {
    mockSuggestLoginRender();
    return null;
  },
}));

const mockStore = configureStoreMock([]);

const me: Profile = {
  id: 1,
  username: "sj_zero",
  host: "lotide.fbxl.net",
  local: true,
};

const remoteUser: Profile = {
  id: 2,
  username: "remote",
  host: "remote.example",
  local: false,
};

const secondRemoteUser: Profile = {
  id: 3,
  username: "second_remote",
  host: "remote.example",
  local: false,
};

const ctx: LotideContext = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
  apiVersion: 18,
  login: {
    token: "token-1",
    user: me,
  },
};

function message(overrides: Partial<PrivateMessage> = {}): PrivateMessage {
  return {
    id: 33,
    author: remoteUser,
    recipient: me,
    created: "2026-06-18T12:00:00Z",
    local: false,
    content_text: "hello from the other side",
    content_markdown: null,
    content_html: "<p>hello from the other side</p>",
    in_reply_to: null,
    sensitive: false,
    ...overrides,
  };
}

function privateMessagePage(items: PrivateMessage[]) {
  return {
    items,
    next_page: null,
  };
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

function getMessageList(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByTestId("message-list");
}

async function renderWithStore(
  ui: React.ReactElement,
  lotideCtx: LotideContext = ctx,
) {
  return await render(
    <Provider store={mockStore({ lotide: { ctx: lotideCtx } })}>
      {ui}
    </Provider>,
  );
}

async function renderMessageList(lotideCtx: LotideContext = ctx) {
  const navigation = {
    addListener: jest.fn(() => jest.fn()),
    navigate: jest.fn(),
  };

  return {
    navigation,
    screen: await renderWithStore(
      <MessageListScreen
        navigation={navigation as never}
        route={{} as never}
      />,
      lotideCtx,
    ),
  };
}

describe("MessageListScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDismissPrivateMessageConversation.mockReset();
    mockGetPrivateMessageConversations.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGetPrivateMessageConversations.mockResolvedValue(
      privateMessagePage([message()]),
    );
    mockDismissPrivateMessageConversation.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads conversations and opens a selected thread", async () => {
    const { navigation, screen } = await renderMessageList();

    await waitFor(() => {
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledWith(ctx);
      expect(screen.getByText("remote")).toBeTruthy();
      expect(screen.getByText("hello from the other side")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Open conversation with remote",
      }),
    );

    expect(navigation.navigate).toHaveBeenCalledWith("MessageThread", {
      userId: 2,
      username: "remote",
    });
  });

  test("shows a retry action when conversations fail to load", async () => {
    mockGetPrivateMessageConversations.mockRejectedValue(new Error("offline"));

    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("Cannot load messages")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(2);
    });
  });

  test("shows pull-to-refresh progress while conversations reload", async () => {
    let resolveReload: (value: ReturnType<typeof privateMessagePage>) => void =
      () => {};
    const reloadPromise = new Promise<ReturnType<typeof privateMessagePage>>(
      resolve => {
        resolveReload = resolve;
      },
    );

    mockGetPrivateMessageConversations
      .mockResolvedValueOnce(privateMessagePage([message()]))
      .mockReturnValueOnce(reloadPromise);

    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("remote")).toBeTruthy();
    });
    expect(getMessageList(screen).props.refreshing).toBe(false);

    await act(async () => {
      getMessageList(screen).props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(2);
    });
    expect(getMessageList(screen).props.refreshing).toBe(true);

    await act(async () => {
      resolveReload(privateMessagePage([
        message({
          content_text: "fresh reply",
          content_html: "<p>fresh reply</p>",
        }),
      ]));
    });

    await waitFor(() => {
      expect(screen.getByText("fresh reply")).toBeTruthy();
      expect(getMessageList(screen).props.refreshing).toBe(false);
    });
  });

  test("keeps visible conversations when a refresh fails", async () => {
    mockGetPrivateMessageConversations
      .mockResolvedValueOnce(privateMessagePage([message()]))
      .mockRejectedValueOnce(new Error("offline"));

    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("hello from the other side")).toBeTruthy();
    });

    await act(async () => {
      getMessageList(screen).props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Cannot load messages")).toBeTruthy();
      expect(screen.getByText("hello from the other side")).toBeTruthy();
      expect(getMessageList(screen).props.refreshing).toBe(false);
    });
  });

  test("loads each conversation page once and deduplicates overlap", async () => {
    const nextPage = deferred<ReturnType<typeof privateMessagePage>>();

    mockGetPrivateMessageConversations
      .mockResolvedValueOnce({
        items: [
          message({
            id: 33,
            content_text: "first conversation",
            content_html: "<p>first conversation</p>",
          }),
        ],
        next_page: "page-2",
      })
      .mockReturnValueOnce(nextPage.promise);

    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("first conversation")).toBeTruthy();
    });

    await act(async () => {
      getMessageList(screen).props.onEndReached();
      getMessageList(screen).props.onEndReached();
    });

    await waitFor(() => {
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(2);
      expect(mockGetPrivateMessageConversations).toHaveBeenLastCalledWith(
        ctx,
        "page-2",
      );
    });

    await act(async () => {
      nextPage.resolve(privateMessagePage([
        message({
          id: 34,
          content_text: "first conversation",
          content_html: "<p>first conversation</p>",
        }),
        message({
          id: 35,
          author: secondRemoteUser,
          recipient: me,
          content_text: "second conversation",
          content_html: "<p>second conversation</p>",
        }),
      ]));
      await nextPage.promise;
    });

    await waitFor(() => {
      expect(screen.getAllByText("first conversation")).toHaveLength(1);
      expect(screen.getByText("second conversation")).toBeTruthy();
    });
  });

  test("dismisses a conversation and refreshes the list", async () => {
    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("remote")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Dismiss conversation with remote",
      }),
    );

    await waitFor(() => {
      expect(mockDismissPrivateMessageConversation).toHaveBeenCalledWith(ctx, 2);
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(2);
    });
  });

  test("blocks duplicate dismissals and keeps stale dismissed previews hidden", async () => {
    const pendingDismiss = deferred<boolean>();

    mockDismissPrivateMessageConversation.mockReturnValue(
      pendingDismiss.promise,
    );
    mockGetPrivateMessageConversations
      .mockResolvedValueOnce(privateMessagePage([message({ id: 33 })]))
      .mockResolvedValueOnce(privateMessagePage([message({ id: 33 })]))
      .mockResolvedValueOnce(privateMessagePage([
        message({
          id: 44,
          content_text: "new activity",
          content_html: "<p>new activity</p>",
        }),
      ]));

    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("remote")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Dismiss conversation with remote",
      }),
    );
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Dismiss conversation with remote",
      }),
    );

    await waitFor(() => {
      expect(mockDismissPrivateMessageConversation).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Dismissing...")).toBeTruthy();
      expect(
        screen.getByRole("button", {
          name: "Dismiss conversation with remote",
        }).props.accessibilityState.disabled,
      ).toBe(true);
    });

    await act(async () => {
      pendingDismiss.resolve(true);
      await pendingDismiss.promise;
    });

    await waitFor(() => {
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("hello from the other side")).toBeNull();
      expect(screen.getByText("No messages yet")).toBeTruthy();
    });

    await act(async () => {
      getMessageList(screen).props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(3);
      expect(screen.getByText("new activity")).toBeTruthy();
    });
  });

  test("reports dismiss failures with the server reason and reenables the action", async () => {
    mockDismissPrivateMessageConversation.mockRejectedValue(
      new Error("cannot dismiss yet"),
    );

    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("remote")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Dismiss conversation with remote",
      }),
    );

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Could not dismiss conversation",
        "cannot dismiss yet",
      );
      expect(screen.getByText("Dismiss")).toBeTruthy();
      expect(
        screen.getByRole("button", {
          name: "Dismiss conversation with remote",
        }).props.accessibilityState.disabled,
      ).toBe(false);
    });
  });

  test("ignores dismiss failures after leaving the conversation list", async () => {
    const pendingDismiss = deferred<boolean>();

    mockDismissPrivateMessageConversation.mockReturnValue(
      pendingDismiss.promise,
    );

    const { screen } = await renderMessageList();

    await waitFor(() => {
      expect(screen.getByText("remote")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Dismiss conversation with remote",
      }),
    );

    await waitFor(() => {
      expect(mockDismissPrivateMessageConversation).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedDismiss = pendingDismiss.promise.catch(() => undefined);
    pendingDismiss.reject(new Error("late dismissal failure"));

    await drainedDismiss;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Could not dismiss conversation",
      "late dismissal failure",
    );
    expect(mockGetPrivateMessageConversations).toHaveBeenCalledTimes(1);
  });

  test("keeps older servers on the unsupported state", async () => {
    const { screen } = await renderMessageList({
      ...ctx,
      apiVersion: 17,
    });

    expect(
      screen.getByText("This Lotide server does not provide private messages yet."),
    ).toBeTruthy();
    expect(mockGetPrivateMessageConversations).not.toHaveBeenCalled();
  });

  test("uses the sign-in prompt when no account is active", async () => {
    await renderMessageList({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 18,
    });

    expect(mockSuggestLoginRender).toHaveBeenCalled();
    expect(mockGetPrivateMessageConversations).not.toHaveBeenCalled();
  });
});

/* end of MessageListScreen.test.tsx */
