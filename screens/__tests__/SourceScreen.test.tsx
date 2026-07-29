/*
    Project: Hoot Mobile
    -------------------

    File: SourceScreen.test.tsx

    Purpose:

        Validate source-feed detail refresh behavior.

    Responsibilities:

        - Verify the source detail screen exposes pull-to-refresh
        - Verify source detail refresh preserves the last good source on error
        - Keep Lotide 0.18 source-feed reader behavior covered by unit tests

    This file intentionally does NOT contain:

        - Live Lotide API tests
        - Source item reader tests
        - Native gesture integration tests
*/

import * as MockReact from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Text as MockTextComponent } from "react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import SourceScreen from "../SourceScreen";

const mockGetCollectionTarget = jest.fn();
const mockFollowCollectionTarget = jest.fn();
const mockUnfollowCollectionTarget = jest.fn();
const mockApplyCollectionTargetItemVote = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock("../../components/ContentDisplay", () => ({
  __esModule: true,
  default: ({ contentHtml }: { contentHtml?: string | null }) =>
    MockReact.createElement(MockTextComponent, null, contentHtml || ""),
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
  followCollectionTarget: (...args: unknown[]) =>
    mockFollowCollectionTarget(...args),
  applyCollectionTargetItemVote: (...args: unknown[]) =>
    mockApplyCollectionTargetItemVote(...args),
  getCollectionTarget: (...args: unknown[]) =>
    mockGetCollectionTarget(...args),
  unfollowCollectionTarget: (...args: unknown[]) =>
    mockUnfollowCollectionTarget(...args),
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
  key: "CollectionTarget",
  name: "CollectionTarget",
  params: {
    id: 12,
  },
};

function sourceFeed(overrides: Partial<CollectionTarget> = {}): CollectionTarget {
  return {
    id: 12,
    type: "actor_feed",
    software: "castopod",
    name: "Feed One",
    remote_url: "https://feeds.example/@one",
    owner: {
      remote_url: "https://feeds.example/@one",
    },
    followers: null,
    first_page: null,
    last_page: null,
    summary_html: "<p>A source summary</p>",
    total_items: 42,
    your_follow: {
      accepted: true,
      federation_status: "received",
    },
    latest_unfollow_status: undefined,
    preview_item_likes_supported: true,
    preview_items: [
      {
        id: 44,
        ap_id: "https://feeds.example/items/44",
        type: "Article",
        name: "Preview item",
        url: "https://feeds.example/items/44",
        published: "2026-06-18T12:00:00Z",
      },
    ],
    ...overrides,
  };
}

async function renderSourceScreen() {
  return await render(
    <Provider store={mockStore({ lotide: { ctx } })}>
      <SourceScreen
        navigation={mockNavigation as never}
        route={route as never}
      />
    </Provider>,
  );
}

function getSourceScroll(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByTestId("source-detail-scroll");
}

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

describe("SourceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyCollectionTargetItemVote.mockReset();
    mockFollowCollectionTarget.mockReset();
    mockGetCollectionTarget.mockReset();
    mockUnfollowCollectionTarget.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockApplyCollectionTargetItemVote.mockResolvedValue(undefined);
    mockFollowCollectionTarget.mockResolvedValue({
      accepted: true,
      federation_status: "sent",
    });
    mockGetCollectionTarget.mockResolvedValue(sourceFeed());
    mockUnfollowCollectionTarget.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("shows pull-to-refresh progress while source details reload", async () => {
    let resolveReload: (value: CollectionTarget) => void = () => {};
    const reloadPromise = new Promise<CollectionTarget>(resolve => {
      resolveReload = resolve;
    });

    mockGetCollectionTarget
      .mockResolvedValueOnce(sourceFeed())
      .mockReturnValueOnce(reloadPromise);

    const screen = await renderSourceScreen();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });
    expect(getSourceScroll(screen).props.refreshControl.props.refreshing).toBe(
      false,
    );

    await act(async () => {
      getSourceScroll(screen).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetCollectionTarget).toHaveBeenCalledTimes(2);
    });
    expect(getSourceScroll(screen).props.refreshControl.props.refreshing).toBe(
      true,
    );

    await act(async () => {
      resolveReload(sourceFeed({ name: "Feed Two" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Feed Two")).toBeTruthy();
      expect(getSourceScroll(screen).props.refreshControl.props.refreshing).toBe(
        false,
      );
    });
  });

  test("keeps visible source details when a refresh fails", async () => {
    mockGetCollectionTarget
      .mockResolvedValueOnce(sourceFeed())
      .mockRejectedValueOnce(new Error("offline"));

    const screen = await renderSourceScreen();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });

    await act(async () => {
      getSourceScroll(screen).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetCollectionTarget).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Cannot load source feed")).toBeTruthy();
      expect(screen.getByText("Feed One")).toBeTruthy();
      expect(screen.getByText("Preview item")).toBeTruthy();
      expect(getSourceScroll(screen).props.refreshControl.props.refreshing).toBe(
        false,
      );
    });
  });

  test("prevents duplicate source detail unfollow requests while pending", async () => {
    const pendingUnfollow = createDeferred<void>();
    mockUnfollowCollectionTarget.mockReturnValue(pendingUnfollow.promise);
    const screen = await renderSourceScreen();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Unfollow source feed" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Unfollow source feed" }),
    );

    await waitFor(() => {
      expect(mockUnfollowCollectionTarget).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Unfollowing...")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Unfollow source feed" }).props
          .accessibilityState.disabled,
      ).toBe(true);
    });

    await act(async () => {
      pendingUnfollow.resolve(undefined);
      await pendingUnfollow.promise;
    });

    await waitFor(() => {
      expect(mockGetCollectionTarget).toHaveBeenCalledTimes(2);
    });
  });

  test("prevents duplicate source preview like requests while pending", async () => {
    const pendingVote = createDeferred<void>();
    mockApplyCollectionTargetItemVote.mockReturnValue(pendingVote.promise);
    const screen = await renderSourceScreen();

    await waitFor(() => {
      expect(screen.getByText("Preview item")).toBeTruthy();
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
      expect(
        screen.getByRole("button", { name: "Like source item" }).props
          .accessibilityState.disabled,
      ).toBe(true);
    });

    await act(async () => {
      pendingVote.resolve(undefined);
      await pendingVote.promise;
    });

    await waitFor(() => {
      expect(mockGetCollectionTarget).toHaveBeenCalledTimes(2);
    });
  });

  test("ignores source preview like failures after leaving the screen", async () => {
    const pendingVote = createDeferred<void>();
    mockApplyCollectionTargetItemVote.mockReturnValue(pendingVote.promise);
    const screen = await renderSourceScreen();

    await waitFor(() => {
      expect(screen.getByText("Preview item")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Like source item" }),
    );

    await waitFor(() => {
      expect(mockApplyCollectionTargetItemVote).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedVote = pendingVote.promise.catch(() => undefined);
    pendingVote.reject(new Error("late source like failure"));

    await drainedVote;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Vote failed",
      "late source like failure",
    );
    expect(mockGetCollectionTarget).toHaveBeenCalledTimes(1);
  });

  test("ignores source detail unfollow failures after leaving the screen", async () => {
    const pendingUnfollow = createDeferred<void>();
    mockUnfollowCollectionTarget.mockReturnValue(pendingUnfollow.promise);
    const screen = await renderSourceScreen();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Unfollow source feed" }),
    );

    await waitFor(() => {
      expect(mockUnfollowCollectionTarget).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedUnfollow = pendingUnfollow.promise.catch(() => undefined);
    pendingUnfollow.reject(new Error("late unfollow failure"));

    await drainedUnfollow;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith("Failed to unfollow feed");
    expect(mockGetCollectionTarget).toHaveBeenCalledTimes(1);
  });
});

/* end of SourceScreen.test.tsx */
