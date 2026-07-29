/*
    Project: Hoot Mobile
    -------------------

    File: SourceListScreen.test.tsx

    Purpose:

        Validate the Lotide source-feed list screen.

    Responsibilities:

        - Verify source-feed lists load for Lotide 0.18 accounts
        - Verify source-feed rows open the selected source
        - Verify pull-to-refresh reports progress and preserves visible rows

    This file intentionally does NOT contain:

        - Source-feed detail rendering tests
        - Source item reader tests
        - Live Lotide network tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import SourceListScreen from "../SourceListScreen";

const mockGetCollectionTargets = jest.fn();
const mockFollowCollectionTarget = jest.fn();
const mockSuggestLoginRender = jest.fn();
const mockUnfollowCollectionTarget = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    placeholderText: "#999",
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
  getCollectionTargets: (...args: unknown[]) => mockGetCollectionTargets(...args),
  unfollowCollectionTarget: (...args: unknown[]) =>
    mockUnfollowCollectionTarget(...args),
}));

jest.mock("../../components/SuggestLogin", () => ({
  __esModule: true,
  default: () => {
    mockSuggestLoginRender();
    return null;
  },
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

function sourceFeed(
  overrides: Partial<CollectionTargetListItem> = {},
): CollectionTargetListItem {
  return {
    id: 12,
    type: "actor_feed",
    software: "castopod",
    name: "Feed One",
    remote_url: "https://feeds.example/@one",
    owner: {
      remote_url: "https://feeds.example/@one",
    },
    total_items: 42,
    preview_item_count: 3,
    latest_preview_item: "Episode 1",
    latest_preview_published: "2026-06-18T12:00:00Z",
    latest_preview_url: "https://feeds.example/items/1",
    summary_excerpt: "A compact source summary",
    your_follow: {
      accepted: true,
      federation_status: "received",
    },
    latest_unfollow_status: undefined,
    ...overrides,
  };
}

function sourcePage(items: CollectionTargetListItem[]): CollectionTargetList {
  return {
    items,
    next_page: null,
    total_count: items.length,
    scope_total_count: items.length,
    software_counts: [],
  };
}

function getSourceList(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByTestId("source-list");
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

async function renderSourceList(lotideCtx: LotideContext = ctx) {
  const navigation = {
    navigate: jest.fn(),
  };

  return {
    navigation,
    screen: await renderWithStore(
      <SourceListScreen
        navigation={navigation as never}
        route={{} as never}
      />,
      lotideCtx,
    ),
  };
}

describe("SourceListScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFollowCollectionTarget.mockReset();
    mockGetCollectionTargets.mockReset();
    mockUnfollowCollectionTarget.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockFollowCollectionTarget.mockResolvedValue({
      accepted: true,
      federation_status: "sent",
    });
    mockGetCollectionTargets.mockResolvedValue(sourcePage([sourceFeed()]));
    mockUnfollowCollectionTarget.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads source feeds and opens a selected source", async () => {
    const { navigation, screen } = await renderSourceList();

    await waitFor(() => {
      expect(mockGetCollectionTargets).toHaveBeenCalledWith(ctx, {
        scope: "mine",
        software: "all",
        sort: "alphabetic",
        search: "",
        pageNumber: 1,
      });
      expect(screen.getByText("Feed One")).toBeTruthy();
      expect(screen.getByText("A compact source summary")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Open source feed Feed One" }),
    );

    expect(navigation.navigate).toHaveBeenCalledWith("CollectionTarget", {
      id: 12,
      source: expect.objectContaining({
        id: 12,
        name: "Feed One",
      }),
    });
  });

  test("shows a retry action when source feeds fail to load", async () => {
    mockGetCollectionTargets.mockRejectedValue(new Error("offline"));

    const { screen } = await renderSourceList();

    await waitFor(() => {
      expect(screen.getByText("Cannot load source feeds")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetCollectionTargets).toHaveBeenCalledTimes(2);
    });
  });

  test("shows pull-to-refresh progress while source feeds reload", async () => {
    let resolveReload: (value: CollectionTargetList) => void = () => {};
    const reloadPromise = new Promise<CollectionTargetList>(resolve => {
      resolveReload = resolve;
    });

    mockGetCollectionTargets
      .mockResolvedValueOnce(sourcePage([sourceFeed()]))
      .mockReturnValueOnce(reloadPromise);

    const { screen } = await renderSourceList();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });
    expect(getSourceList(screen).props.refreshing).toBe(false);

    await act(async () => {
      getSourceList(screen).props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetCollectionTargets).toHaveBeenCalledTimes(2);
    });
    expect(getSourceList(screen).props.refreshing).toBe(true);

    await act(async () => {
      resolveReload(sourcePage([
        sourceFeed({
          id: 13,
          name: "Feed Two",
          remote_url: "https://feeds.example/@two",
          summary_excerpt: "Fresh source summary",
        }),
      ]));
    });

    await waitFor(() => {
      expect(screen.getByText("Feed Two")).toBeTruthy();
      expect(screen.queryByText("Feed One")).toBeNull();
      expect(getSourceList(screen).props.refreshing).toBe(false);
    });
  });

  test("keeps visible source feeds when a refresh fails", async () => {
    mockGetCollectionTargets
      .mockResolvedValueOnce(sourcePage([sourceFeed()]))
      .mockRejectedValueOnce(new Error("offline"));

    const { screen } = await renderSourceList();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });

    await act(async () => {
      getSourceList(screen).props.onRefresh();
    });

    await waitFor(() => {
      expect(mockGetCollectionTargets).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Cannot load source feeds")).toBeTruthy();
      expect(screen.getByText("Feed One")).toBeTruthy();
      expect(getSourceList(screen).props.refreshing).toBe(false);
    });
  });

  test("keeps older servers on the unsupported state", async () => {
    const { screen } = await renderSourceList({
      ...ctx,
      apiVersion: 17,
    });

    expect(
      screen.getByText("This Lotide server does not provide source feeds yet."),
    ).toBeTruthy();
    expect(mockGetCollectionTargets).not.toHaveBeenCalled();
  });

  test("prevents duplicate source-feed unfollow requests while pending", async () => {
    const pendingUnfollow = createDeferred<void>();
    mockUnfollowCollectionTarget.mockReturnValue(pendingUnfollow.promise);
    const { screen } = await renderSourceList();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Unfollow Feed One" }));
    await fireEvent.press(screen.getByRole("button", { name: "Unfollow Feed One" }));

    await waitFor(() => {
      expect(mockUnfollowCollectionTarget).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Unfollowing...")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Unfollow Feed One" }).props
          .accessibilityState.disabled,
      ).toBe(true);
    });

    await act(async () => {
      pendingUnfollow.resolve(undefined);
      await pendingUnfollow.promise;
    });

    await waitFor(() => {
      expect(mockGetCollectionTargets).toHaveBeenCalledTimes(2);
    });
  });

  test("ignores source-feed unfollow failures after leaving the list", async () => {
    const pendingUnfollow = createDeferred<void>();
    mockUnfollowCollectionTarget.mockReturnValue(pendingUnfollow.promise);
    const { screen } = await renderSourceList();

    await waitFor(() => {
      expect(screen.getByText("Feed One")).toBeTruthy();
    });

    await fireEvent.press(screen.getByRole("button", { name: "Unfollow Feed One" }));

    await waitFor(() => {
      expect(mockUnfollowCollectionTarget).toHaveBeenCalledTimes(1);
    });

    await screen.unmount();

    const drainedUnfollow = pendingUnfollow.promise.catch(() => undefined);
    pendingUnfollow.reject(new Error("late unfollow failure"));

    await drainedUnfollow;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith("Failed to unfollow feed");
    expect(mockGetCollectionTargets).toHaveBeenCalledTimes(1);
  });

  test("uses the sign-in prompt when no server is active", async () => {
    await renderSourceList({});

    expect(mockSuggestLoginRender).toHaveBeenCalled();
    expect(mockGetCollectionTargets).not.toHaveBeenCalled();
  });
});

/* end of SourceListScreen.test.tsx */
