/*
    Project: Hoot Mobile
    -------------------

    File: usePost.test.tsx

    Purpose:

        Validate single-post loading behavior independent of screen UI.

    Responsibilities:

        - Verify missing posts are fetched from Lotide
        - Verify stale in-flight post loads cannot overwrite newer reloads
        - Verify pending loads are ignored after unmount

    This file intentionally does NOT contain:

        - Post rendering tests
        - Feed pagination tests
        - Live Lotide network tests
*/

import * as React from "react";
import { Text } from "react-native";
import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";

import usePost from "../usePost";
import commentReducer from "../../slices/commentSlice";
import lotideReducer, { setCtx } from "../../slices/lotideSlice";
import postReducer from "../../slices/postSlice";
import settingsReducer from "../../slices/settingsSlice";

import * as LotideService from "../../services/LotideService";

/* ------------------------------------------------------------------------- */
/* Test Harness                                                              */
/* ------------------------------------------------------------------------- */

const mockGetPost = LotideService.getPost as jest.Mock;

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  getPost: jest.fn(),
}));

const ctx: LotideContext = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
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

function post(id: PostId, title: string): Post {
  return {
    id,
    title,
    created: "2026-06-24T00:00:00Z",
    replies_count_total: 0,
    score: 0,
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

function makeStore() {
  const store = configureStore({
    reducer: {
      comments: commentReducer,
      lotide: lotideReducer,
      posts: postReducer,
      settings: settingsReducer,
    },
  });

  store.dispatch(setCtx(ctx));

  return store;
}

function PostHarness({
  postId,
  reloadId,
}: {
  postId: PostId;
  reloadId?: number;
}) {
  const loadedPost = usePost(postId, reloadId);

  return <Text testID="post-title">{loadedPost?.title ?? "none"}</Text>;
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe("usePost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loads a missing post", async () => {
    mockGetPost.mockResolvedValue(post(7, "Loaded post"));

    const store = makeStore();
    const screen = await render(
      <Provider store={store}>
        <PostHarness postId={7} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetPost).toHaveBeenCalledWith(expect.any(Object), 7);
      expect(screen.getByTestId("post-title").props.children).toBe(
        "Loaded post",
      );
    });
  });

  test("ignores stale post responses after a newer reload", async () => {
    const firstRequest = deferred<Post>();
    const secondRequest = deferred<Post>();

    mockGetPost
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const store = makeStore();
    const screen = await render(
      <Provider store={store}>
        <PostHarness postId={7} reloadId={0} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetPost).toHaveBeenCalledTimes(1);
    });

    await screen.rerender(
      <Provider store={store}>
        <PostHarness postId={7} reloadId={1} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetPost).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondRequest.resolve(post(7, "fresh post"));
      await secondRequest.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("post-title").props.children).toBe(
        "fresh post",
      );
    });

    await act(async () => {
      firstRequest.resolve(post(7, "stale post"));
      await firstRequest.promise;
    });

    expect(screen.getByTestId("post-title").props.children).toBe("fresh post");
    expect(store.getState().posts.posts[7].title).toBe("fresh post");
  });

  test("ignores post responses after unmount", async () => {
    const request = deferred<Post>();

    mockGetPost.mockReturnValueOnce(request.promise);

    const store = makeStore();
    const screen = await render(
      <Provider store={store}>
        <PostHarness postId={7} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetPost).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      screen.unmount();
    });

    await act(async () => {
      request.resolve(post(7, "late post"));
      await request.promise;
    });

    expect(store.getState().posts.posts[7]).toBeUndefined();
  });
});

/* end of usePost.test.tsx */
