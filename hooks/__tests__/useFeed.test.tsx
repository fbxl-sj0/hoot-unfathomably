/*
    Project: Hoot Mobile
    -------------------

    File: useFeed.test.tsx

    Purpose:

        Validate feed loading behavior independent of the feed screen UI.

    Responsibilities:

        - Verify route/sort changes reset the visible feed
        - Verify stale in-flight requests cannot append into a newer feed
        - Verify pending feed loads are ignored after unmount
        - Verify next-page loading appends unique post ids

    This file intentionally does NOT contain:

        - post rendering tests
        - live Lotide network tests
        - navigation tests
*/

import * as React from "react";
import { Button, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import useFeed from "../useFeed";

const mockGetPosts = jest.fn();

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  getPosts: (...args: unknown[]) => mockGetPosts(...args),
}));

const mockStore = configureStoreMock([]);

function post(id: PostId): Post {
  return {
    id,
    title: `Post ${id}`,
    created: "2026-06-18T00:00:00Z",
    replies_count_total: 0,
    score: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function FeedHarness({
  sort,
  inYourFollows,
}: {
  sort: SortOption;
  inYourFollows?: boolean;
}) {
  const [postIds, loadNextPage, , loadError] = useFeed({
    sort,
    inYourFollows,
  });

  return (
    <>
      <Text testID="post-ids">{postIds.join(",") || "none"}</Text>
      <Text testID="load-error">{loadError || "ok"}</Text>
      <Button title="next" onPress={loadNextPage} />
    </>
  );
}

async function renderWithStore(ui: React.ReactElement) {
  const store = mockStore({
    lotide: {
      ctx: {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "alice",
            host: "lotide.fbxl.net",
          },
        },
      },
    },
  });

  return {
    store,
    screen: await render(<Provider store={store}>{ui}</Provider>),
  };
}

describe("useFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ignores stale results after the sort changes", async () => {
    const hot = deferred<Paged<Post>>();
    const newest = deferred<Paged<Post>>();
    mockGetPosts.mockImplementation(
      (_ctx, _page, sort: SortOption) =>
        sort === "new" ? newest.promise : hot.promise,
    );

    const { screen, store } = await renderWithStore(
      <FeedHarness sort="hot" inYourFollows={true} />,
    );

    await waitFor(() => {
      expect(mockGetPosts).toHaveBeenCalledWith(
        expect.any(Object),
        null,
        "hot",
        true,
        undefined,
      );
    });

    await screen.rerender(
      <Provider store={store}>
            <FeedHarness sort="new" inYourFollows={true} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetPosts).toHaveBeenCalledWith(
        expect.any(Object),
        null,
        "new",
        true,
        undefined,
      );
    });

    await act(async () => {
      hot.resolve({
        items: [post(1)],
        next_page: null,
      });
    });

    await act(async () => {
      newest.resolve({
        items: [post(2)],
        next_page: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("post-ids").props.children).toBe("2");
    });
  });

  test("appends unique ids when loading the next page", async () => {
    mockGetPosts
      .mockResolvedValueOnce({
        items: [post(1), post(2)],
        next_page: "2",
      })
      .mockResolvedValueOnce({
        items: [post(2), post(3)],
        next_page: null,
      });

    const { screen } = await renderWithStore(
      <FeedHarness sort="hot" inYourFollows={true} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("post-ids").props.children).toBe("1,2");
    });

    await fireEvent.press(screen.getByText("next"));

    await waitFor(() => {
      expect(mockGetPosts).toHaveBeenCalledWith(
        expect.any(Object),
        "2",
        "hot",
        true,
        undefined,
      );
      expect(screen.getByTestId("post-ids").props.children).toBe("1,2,3");
    });
  });

  test("reloads when the follow filter changes from unspecified to false", async () => {
    mockGetPosts.mockResolvedValue({
      items: [],
      next_page: null,
    });

    const { screen, store } = await renderWithStore(
      <FeedHarness sort="hot" inYourFollows={undefined} />,
    );

    await waitFor(() => {
      expect(mockGetPosts).toHaveBeenCalledWith(
        expect.any(Object),
        null,
        "hot",
        undefined,
        undefined,
      );
    });

    await screen.rerender(
      <Provider store={store}>
        <FeedHarness sort="hot" inYourFollows={false} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetPosts).toHaveBeenCalledWith(
        expect.any(Object),
        null,
        "hot",
        false,
        undefined,
      );
    });
  });

  test("ignores feed responses after unmount", async () => {
    const request = deferred<Paged<Post>>();

    mockGetPosts.mockReturnValueOnce(request.promise);

    const { screen, store } = await renderWithStore(
      <FeedHarness sort="hot" inYourFollows={true} />,
    );

    await waitFor(() => {
      expect(mockGetPosts).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      screen.unmount();
    });

    await act(async () => {
      request.resolve({
        items: [post(99)],
        next_page: null,
      });
      await request.promise;
    });

    expect(store.getActions()).toEqual([]);
  });
});

/* end of useFeed.test.tsx */
