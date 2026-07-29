/*
    Project: Hoot Mobile
    -------------------

    File: SourceItemScreen.test.tsx

    Purpose:

        Validate source-feed item reader refresh behavior.

    Responsibilities:

        - Verify the source item reader exposes pull-to-refresh
        - Verify source item refresh preserves the last good item on error
        - Verify source comment submission preserves accepted comments and drafts
        - Keep Lotide 0.18 cached source-item reading covered by unit tests

    This file intentionally does NOT contain:

        - Live Lotide API tests
        - Source-feed list tests
        - Native gesture integration tests
*/

import * as MockReact from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Text as MockTextComponent } from "react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import SourceItemScreen from "../SourceItemScreen";

const mockGetCollectionTargetItem = jest.fn();
const mockCommentOnCollectionTargetItem = jest.fn();
const mockApplyCollectionTargetItemVote = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock("../../components/ActorDisplay", () => ({
  ActorDisplay: ({ name }: { name: string }) =>
    MockReact.createElement(MockTextComponent, null, name),
}));

jest.mock("../../components/ContentDisplay", () => ({
  __esModule: true,
  default: ({
    contentHtml,
    contentMarkdown,
    contentText,
  }: {
    contentHtml?: string | null;
    contentMarkdown?: string | null;
    contentText?: string | null;
  }) =>
    MockReact.createElement(
      MockTextComponent,
      null,
      contentHtml || contentMarkdown || contentText || "",
    ),
}));

jest.mock("../../components/ElapsedTime", () => ({
  __esModule: true,
  default: () => MockReact.createElement(MockTextComponent, null, "now"),
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    blue: "#38bdf8",
    placeholderText: "#999",
    red: "#ef4444",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    secondaryTint: "#ff9f43",
    tertiaryBackground: "#ddd",
    text: "#000",
    tint: "#f5a524",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  getCollectionTargetItem: (...args: unknown[]) =>
    mockGetCollectionTargetItem(...args),
  commentOnCollectionTargetItem: (...args: unknown[]) =>
    mockCommentOnCollectionTargetItem(...args),
  applyCollectionTargetItemVote: (...args: unknown[]) =>
    mockApplyCollectionTargetItemVote(...args),
}));

const mockStore = configureStoreMock([]);

const ctx: LotideContext = {
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

const route = {
  key: "CollectionTargetItem",
  name: "CollectionTargetItem",
  params: {
    collectionTargetId: 12,
    itemId: 44,
  },
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function sourceItem(
  overrides: Partial<CollectionTargetItem> = {},
): CollectionTargetItem {
  return {
    collection: {
      id: 12,
      type: "actor_feed",
      software: "castopod",
      name: "Feed One",
      remote_url: "https://feeds.example/@one",
      owner: {
        remote_url: "https://feeds.example/@one",
      },
      preview_item_likes_supported: true,
      preview_item_replies_supported: true,
      can_reply: true,
    },
    item: {
      id: 44,
      ap_id: "https://feeds.example/items/44",
      type: "Article",
      name: "Source item one",
      url: "https://feeds.example/items/44",
      attributed_to: null,
      content_html: "<p>Cached source body</p>",
      summary_html: null,
      image_url: null,
      published: "2026-06-18T12:00:00Z",
      your_vote: false,
    },
    comments: [
      {
        id: 90,
        content_text: "Cached source comment",
        content_markdown: null,
        content_html: null,
        created: "2026-06-18T13:00:00Z",
        local: true,
        sensitive: false,
      },
    ],
    ...overrides,
  };
}

async function renderSourceItemScreen() {
  return await render(
    <Provider store={mockStore({ lotide: { ctx } })}>
      <SourceItemScreen
        navigation={mockNavigation as never}
        route={route as never}
      />
    </Provider>,
  );
}

function getSourceItemScroll(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByTestId("source-item-scroll");
}

describe("SourceItemScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyCollectionTargetItemVote.mockReset();
    mockGetCollectionTargetItem.mockReset();
    mockCommentOnCollectionTargetItem.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockApplyCollectionTargetItemVote.mockResolvedValue(undefined);
    mockGetCollectionTargetItem.mockResolvedValue(sourceItem());
    mockCommentOnCollectionTargetItem.mockResolvedValue({ id: 91 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("shows pull-to-refresh progress while a source item reloads", async () => {
    let resolveReload: (value: CollectionTargetItem) => void = () => {};
    const reloadPromise = new Promise<CollectionTargetItem>(resolve => {
      resolveReload = resolve;
    });

    mockGetCollectionTargetItem
      .mockResolvedValueOnce(sourceItem())
      .mockReturnValueOnce(reloadPromise);

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });
    expect(
      getSourceItemScroll(screen).props.refreshControl.props.refreshing,
    ).toBe(false);

    await act(async () => {
      getSourceItemScroll(screen).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetCollectionTargetItem).toHaveBeenCalledTimes(2);
    });
    expect(
      getSourceItemScroll(screen).props.refreshControl.props.refreshing,
    ).toBe(true);

    await act(async () => {
      resolveReload(sourceItem({
        item: {
          ...sourceItem().item,
          name: "Source item two",
        },
      }));
    });

    await waitFor(() => {
      expect(screen.getByText("Source item two")).toBeTruthy();
      expect(
        getSourceItemScroll(screen).props.refreshControl.props.refreshing,
      ).toBe(false);
    });
  });

  test("keeps visible source item data when a refresh fails", async () => {
    mockGetCollectionTargetItem
      .mockResolvedValueOnce(sourceItem())
      .mockRejectedValueOnce(new Error("offline"));

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await act(async () => {
      getSourceItemScroll(screen).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetCollectionTargetItem).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Cannot load source item")).toBeTruthy();
      expect(screen.getByText("Source item one")).toBeTruthy();
      expect(screen.getByText("<p>Cached source body</p>")).toBeTruthy();
      expect(screen.getByText("Cached source comment")).toBeTruthy();
      expect(
        getSourceItemScroll(screen).props.refreshControl.props.refreshing,
      ).toBe(false);
    });
  });

  test("keeps an accepted source comment visible when reload after submit fails", async () => {
    mockGetCollectionTargetItem
      .mockResolvedValueOnce(sourceItem())
      .mockRejectedValueOnce(new Error("offline"));
    mockCommentOnCollectionTargetItem.mockResolvedValue({ id: 91 });

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await fireEvent.changeText(
      screen.getByLabelText("Comment"),
      "Accepted source comment",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send comment" }));

    await waitFor(() => {
      expect(mockCommentOnCollectionTargetItem).toHaveBeenCalledWith(
        ctx,
        12,
        44,
        "Accepted source comment",
      );
      expect(mockGetCollectionTargetItem).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Accepted source comment")).toBeTruthy();
      expect(screen.getByText("Cannot load source item")).toBeTruthy();
      expect(screen.getByLabelText("Comment").props.value).toBe("");
    });
  });

  test("blocks duplicate source comment submissions while one is pending", async () => {
    const submission = createDeferred<{ id: CommentId }>();
    mockCommentOnCollectionTargetItem.mockReturnValue(submission.promise);

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await fireEvent.changeText(
      screen.getByLabelText("Comment"),
      "Pending source comment",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send comment" }));

    await waitFor(() => {
      expect(mockCommentOnCollectionTargetItem).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Sending...")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Send comment" }).props
        .accessibilityState.disabled).toBe(true);
    });

    await fireEvent.press(screen.getByText("Sending..."));

    expect(mockCommentOnCollectionTargetItem).toHaveBeenCalledTimes(1);

    await act(async () => {
      submission.resolve({ id: 91 });
      await submission.promise;
    });

    await waitFor(() => {
      expect(mockGetCollectionTargetItem).toHaveBeenCalledTimes(2);
    });
  });

  test("blocks duplicate source item likes while one is pending", async () => {
    const pendingVote = createDeferred<void>();
    mockApplyCollectionTargetItemVote.mockReturnValue(pendingVote.promise);

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Like source item" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Like source item" }),
    );

    await waitFor(() => {
      expect(mockApplyCollectionTargetItemVote).toHaveBeenCalledTimes(1);
      expect(mockApplyCollectionTargetItemVote).toHaveBeenCalledWith(
        ctx,
        12,
        44,
      );
      expect(screen.getByText("Liking...")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Like source item" }).props
        .accessibilityState.disabled).toBe(true);
    });

    await act(async () => {
      pendingVote.resolve(undefined);
      await pendingVote.promise;
    });

    await waitFor(() => {
      expect(mockGetCollectionTargetItem).toHaveBeenCalledTimes(2);
    });
  });

  test("ignores source item like failures after leaving the item reader", async () => {
    const pendingVote = createDeferred<void>();
    mockApplyCollectionTargetItemVote.mockReturnValue(pendingVote.promise);

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Like source item" }),
    );

    await waitFor(() => {
      expect(mockApplyCollectionTargetItemVote).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedVote = pendingVote.promise.catch(() => undefined);
    pendingVote.reject(new Error("late source item like failure"));

    await drainedVote;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Vote failed",
      "late source item like failure",
    );
    expect(mockGetCollectionTargetItem).toHaveBeenCalledTimes(1);
  });

  test("ignores accepted source comments after leaving the item reader", async () => {
    const submission = createDeferred<{ id: CommentId }>();
    mockCommentOnCollectionTargetItem.mockReturnValue(submission.promise);

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await fireEvent.changeText(
      screen.getByLabelText("Comment"),
      "Leaving source comment",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send comment" }));

    await waitFor(() => {
      expect(mockCommentOnCollectionTargetItem).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedSubmission = submission.promise.then(() => undefined);
    submission.resolve({ id: 91 });

    await drainedSubmission;
    await Promise.resolve();

    expect(mockGetCollectionTargetItem).toHaveBeenCalledTimes(1);
  });

  test("ignores source comment failures after leaving the item reader", async () => {
    const submission = createDeferred<{ id: CommentId }>();
    mockCommentOnCollectionTargetItem.mockReturnValue(submission.promise);

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await fireEvent.changeText(
      screen.getByLabelText("Comment"),
      "Leaving source comment",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send comment" }));

    await waitFor(() => {
      expect(mockCommentOnCollectionTargetItem).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedSubmission = submission.promise.catch(() => undefined);
    submission.reject(new Error("late source comment failure"));

    await drainedSubmission;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Could not submit comment",
      "late source comment failure",
    );
  });

  test("keeps the source comment draft and reports the server reason when submit fails", async () => {
    mockCommentOnCollectionTargetItem.mockRejectedValue(new Error("no inbox"));

    const screen = await renderSourceItemScreen();

    await waitFor(() => {
      expect(screen.getByText("Source item one")).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByLabelText("Comment"), "try again");
    await fireEvent.press(screen.getByRole("button", { name: "Send comment" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Could not submit comment",
        "no inbox",
      );
      expect(screen.getByLabelText("Comment").props.value).toBe("try again");
    });
  });
});

/* end of SourceItemScreen.test.tsx */
