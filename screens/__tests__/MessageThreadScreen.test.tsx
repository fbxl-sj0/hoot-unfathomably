/*
    Project: Hoot Mobile
    -------------------

    File: MessageThreadScreen.test.tsx

    Purpose:

        Validate the Lotide private-message thread screen.

    Responsibilities:

        - Verify message threads load and render chronologically
        - Verify longer message threads can load later pages
        - Verify send operations reply to the latest known message
        - Verify failed thread loads expose a retry action

    This file intentionally does NOT contain:

        - Conversation-list dismissal tests
        - Live Lotide network tests
        - Push or local notification tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import MessageThreadScreen from "../MessageThreadScreen";

const mockGetPrivateMessageThread = jest.fn();
const mockSendPrivateMessage = jest.fn();
const mockSuggestLoginRender = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    tertiaryBackground: "#ddd",
    placeholderText: "#999",
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
  getPrivateMessageThread: (...args: unknown[]) =>
    mockGetPrivateMessageThread(...args),
  sendPrivateMessage: (...args: unknown[]) =>
    mockSendPrivateMessage(...args),
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
    content_text: "hello",
    content_markdown: null,
    content_html: "<p>hello</p>",
    in_reply_to: null,
    sensitive: false,
    ...overrides,
  };
}

function privateMessagePage(
  items: PrivateMessage[],
  nextPage: string | null = null,
) {
  return {
    items,
    next_page: nextPage,
  };
}

function deferred<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => {};
  let rejectPromise: (reason?: unknown) => void = () => {};
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

async function renderMessageThread(
  lotideCtx: LotideContext = ctx,
  params: { userId?: number | string; username?: string } = {
    userId: 2,
    username: "remote",
  },
) {
  return await renderWithStore(
    <MessageThreadScreen
      navigation={{} as never}
      route={
        {
          key: "message-thread",
          name: "MessageThread",
          params,
        } as never
      }
    />,
    lotideCtx,
  );
}

describe("MessageThreadScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrivateMessageThread.mockReset();
    mockSendPrivateMessage.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGetPrivateMessageThread.mockResolvedValue(
      privateMessagePage([
        message({
          id: 40,
          author: me,
          recipient: remoteUser,
          created: "2026-06-18T12:05:00Z",
          content_text: "second",
          content_html: "<p>second</p>",
        }),
        message({
          id: 39,
          author: remoteUser,
          recipient: me,
          created: "2026-06-18T12:00:00Z",
          content_text: "first",
          content_html: "<p>first</p>",
        }),
      ]),
    );
    mockSendPrivateMessage.mockResolvedValue(
      message({
        id: 41,
        author: me,
        recipient: remoteUser,
        content_text: "reply",
      }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads a private-message thread", async () => {
    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(mockGetPrivateMessageThread).toHaveBeenCalledWith(ctx, 2);
      expect(screen.getByText("first")).toBeTruthy();
      expect(screen.getByText("second")).toBeTruthy();
    });
  });

  test("sends replies to the latest known message", async () => {
    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("second")).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText("Message"), "new reply");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send message" }).props.disabled)
        .not.toBe(true);
    });

    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(mockSendPrivateMessage).toHaveBeenCalledWith(
        ctx,
        2,
        "new reply",
        40,
      );
      expect(mockGetPrivateMessageThread).toHaveBeenCalledTimes(2);
    });
  });

  test("keeps a server-accepted message visible when reload after send fails", async () => {
    mockGetPrivateMessageThread
      .mockResolvedValueOnce(privateMessagePage([
        message({
          id: 40,
          author: remoteUser,
          recipient: me,
          content_text: "first",
          content_html: "<p>first</p>",
        }),
      ]))
      .mockRejectedValueOnce(new Error("offline"));
    mockSendPrivateMessage.mockResolvedValue(
      message({
        id: 41,
        author: me,
        recipient: remoteUser,
        content_text: "accepted local message",
        content_html: "<p>accepted local message</p>",
      }),
    );

    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("first")).toBeTruthy();
    });

    await fireEvent.changeText(
      screen.getByLabelText("Message"),
      "accepted local message",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(mockSendPrivateMessage).toHaveBeenCalledWith(
        ctx,
        2,
        "accepted local message",
        40,
      );
      expect(mockGetPrivateMessageThread).toHaveBeenCalledTimes(2);
      expect(screen.getByText("accepted local message")).toBeTruthy();
      expect(screen.getByText("Cannot load conversation")).toBeTruthy();
      expect(screen.getByLabelText("Message").props.value).toBe("");
    });
  });

  test("keeps the draft and reports the server reason when send fails", async () => {
    mockSendPrivateMessage.mockRejectedValue(new Error("server unhappy"));

    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("second")).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText("Message"), "try again");
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Could not send message",
        "server unhappy",
      );
      expect(screen.getByLabelText("Message").props.value).toBe("try again");
    });
  });

  test("blocks duplicate sends while the first message is pending", async () => {
    const sendAttempt = deferred<PrivateMessage>();
    mockSendPrivateMessage.mockReturnValue(sendAttempt.promise);

    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("second")).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText("Message"), "one time");

    const sendButton = screen.getByRole("button", { name: "Send message" });

    await fireEvent.press(sendButton);
    await fireEvent.press(sendButton);

    await waitFor(() => {
      expect(mockSendPrivateMessage).toHaveBeenCalledTimes(1);
      expect(mockSendPrivateMessage).toHaveBeenCalledWith(
        ctx,
        2,
        "one time",
        40,
      );
      expect(
        screen.getByRole("button", { name: "Send message" }).props
          .accessibilityState,
      ).toEqual({ disabled: true });
    });

    await act(async () => {
      sendAttempt.resolve(message({
        id: 41,
        author: me,
        recipient: remoteUser,
        content_text: "one time",
        content_html: "<p>one time</p>",
      }));
      await sendAttempt.promise;
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Message").props.value).toBe("");
      expect(
        screen.getByRole("button", { name: "Send message" }).props
          .accessibilityState,
      ).toEqual({ disabled: true });
    });
  });

  test("ignores send failures after leaving the thread", async () => {
    const sendAttempt = deferred<PrivateMessage>();
    mockSendPrivateMessage.mockReturnValue(sendAttempt.promise);

    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("second")).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText("Message"), "leaving now");
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(mockSendPrivateMessage).toHaveBeenCalledWith(
        ctx,
        2,
        "leaving now",
        40,
      );
    });

    screen.unmount();

    const drainedSend = sendAttempt.promise.catch(() => undefined);
    sendAttempt.reject(new Error("too late"));

    await drainedSend;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Could not send message",
      "too late",
    );
  });

  test("shows a retry action when the thread cannot load", async () => {
    mockGetPrivateMessageThread.mockRejectedValue(new Error("offline"));

    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("Cannot load conversation")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetPrivateMessageThread).toHaveBeenCalledTimes(2);
    });
  });

  test("pull-to-refresh reloads the visible thread", async () => {
    let resolveReload: (value: ReturnType<typeof privateMessagePage>) => void =
      () => {};
    const reloadPromise = new Promise<ReturnType<typeof privateMessagePage>>(
      resolve => {
        resolveReload = resolve;
      },
    );

    mockGetPrivateMessageThread
      .mockResolvedValueOnce(privateMessagePage([
        message({
          id: 39,
          author: remoteUser,
          recipient: me,
          content_text: "first",
          content_html: "<p>first</p>",
        }),
      ]))
      .mockReturnValueOnce(reloadPromise);

    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("first")).toBeTruthy();
    });
    expect(
      screen.getByTestId("message-thread-scroll").props.refreshControl.props
        .refreshing,
    ).toBe(false);

    await act(async () => {
      screen
        .getByTestId("message-thread-scroll")
        .props
        .refreshControl
        .props
        .onRefresh();
    });

    await waitFor(() => {
      expect(mockGetPrivateMessageThread).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getByTestId("message-thread-scroll").props.refreshControl.props
        .refreshing,
    ).toBe(true);

    await act(async () => {
      resolveReload(privateMessagePage([
        message({
          id: 41,
          author: remoteUser,
          recipient: me,
          content_text: "new thread item",
          content_html: "<p>new thread item</p>",
        }),
      ]));
    });

    await waitFor(() => {
      expect(screen.getByText("new thread item")).toBeTruthy();
      expect(
        screen.getByTestId("message-thread-scroll").props.refreshControl.props
          .refreshing,
      ).toBe(false);
    });
  });

  test("loads each thread page once and deduplicates overlap", async () => {
    const laterPage = deferred<ReturnType<typeof privateMessagePage>>();

    mockGetPrivateMessageThread
      .mockResolvedValueOnce(privateMessagePage([
        message({
          id: 40,
          author: remoteUser,
          recipient: me,
          content_text: "newer message",
          content_html: "<p>newer message</p>",
        }),
      ], "page-2"))
      .mockReturnValueOnce(laterPage.promise);

    const screen = await renderMessageThread();

    await waitFor(() => {
      expect(screen.getByText("newer message")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Load earlier messages" }),
      ).toBeTruthy();
    });

    const loadEarlierButton = screen.getByRole("button", {
      name: "Load earlier messages",
    });

    await fireEvent.press(loadEarlierButton);
    await fireEvent.press(loadEarlierButton);

    await waitFor(() => {
      expect(mockGetPrivateMessageThread).toHaveBeenCalledTimes(2);
      expect(mockGetPrivateMessageThread).toHaveBeenLastCalledWith(
        ctx,
        2,
        "page-2",
      );
    });

    await act(async () => {
      laterPage.resolve(privateMessagePage([
        message({
          id: 40,
          author: remoteUser,
          recipient: me,
          content_text: "newer message",
          content_html: "<p>newer message</p>",
        }),
        message({
          id: 39,
          author: remoteUser,
          recipient: me,
          created: "2026-06-18T11:59:00Z",
          content_text: "older message",
          content_html: "<p>older message</p>",
        }),
      ]));
      await laterPage.promise;
    });

    await waitFor(() => {
      expect(screen.getAllByText("newer message")).toHaveLength(1);
      expect(screen.getByText("older message")).toBeTruthy();
    });
  });

  test("keeps older servers on the unsupported state", async () => {
    const screen = await renderMessageThread({
      ...ctx,
      apiVersion: 17,
    });

    expect(
      screen.getByText("This Lotide server does not provide private messages yet."),
    ).toBeTruthy();
    expect(mockGetPrivateMessageThread).not.toHaveBeenCalled();
  });

  test("uses the sign-in prompt when no account is active", async () => {
    await renderMessageThread({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      apiVersion: 18,
    });

    expect(mockSuggestLoginRender).toHaveBeenCalled();
    expect(mockGetPrivateMessageThread).not.toHaveBeenCalled();
  });
});

/* end of MessageThreadScreen.test.tsx */
