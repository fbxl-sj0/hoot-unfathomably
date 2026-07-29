/*
    Project: Hoot Mobile
    -------------------

    File: useComment.test.tsx

    Purpose:

        Validate single-comment loading behavior independent of screen UI.

    Responsibilities:

        - Verify missing comments are fetched from Lotide
        - Verify stale in-flight comment loads cannot overwrite newer reloads
        - Verify pending loads are ignored after unmount

    This file intentionally does NOT contain:

        - Comment tree pagination tests
        - Comment rendering tests
        - Live Lotide network tests
*/

import * as React from "react";
import { Text } from "react-native";
import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";

import useComment from "../useComment";
import commentReducer from "../../slices/commentSlice";
import lotideReducer, { setCtx } from "../../slices/lotideSlice";
import postReducer from "../../slices/postSlice";
import settingsReducer from "../../slices/settingsSlice";

import * as LotideService from "../../services/LotideService";

/* ------------------------------------------------------------------------- */
/* Test Harness                                                              */
/* ------------------------------------------------------------------------- */

const mockGetComment = LotideService.getComment as jest.Mock;

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  getComment: jest.fn(),
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

function comment(id: CommentId, text: string): Comment {
  return {
    id,
    content_html: `<p>${text}</p>`,
    content_text: text,
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

function CommentHarness({
  commentId,
  reloadId,
}: {
  commentId: CommentId;
  reloadId?: number;
}) {
  const loadedComment = useComment(commentId, reloadId);

  return (
    <Text testID="comment-text">{loadedComment?.content_text ?? "none"}</Text>
  );
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe("useComment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loads a missing comment", async () => {
    mockGetComment.mockResolvedValue([comment(11, "Loaded comment")]);

    const store = makeStore();
    const screen = await render(
      <Provider store={store}>
        <CommentHarness commentId={11} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetComment).toHaveBeenCalledWith(expect.any(Object), 11);
      expect(screen.getByTestId("comment-text").props.children).toBe(
        "Loaded comment",
      );
    });
  });

  test("ignores stale comment responses after a newer reload", async () => {
    const firstRequest = deferred<Comment[]>();
    const secondRequest = deferred<Comment[]>();

    mockGetComment
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const store = makeStore();
    const screen = await render(
      <Provider store={store}>
        <CommentHarness commentId={11} reloadId={0} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetComment).toHaveBeenCalledTimes(1);
    });

    await screen.rerender(
      <Provider store={store}>
        <CommentHarness commentId={11} reloadId={1} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetComment).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondRequest.resolve([comment(11, "fresh comment")]);
      await secondRequest.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("comment-text").props.children).toBe(
        "fresh comment",
      );
    });

    await act(async () => {
      firstRequest.resolve([comment(11, "stale comment")]);
      await firstRequest.promise;
    });

    expect(screen.getByTestId("comment-text").props.children).toBe(
      "fresh comment",
    );
    expect(store.getState().comments.comments[11].content_text).toBe(
      "fresh comment",
    );
  });

  test("ignores comment responses after unmount", async () => {
    const request = deferred<Comment[]>();

    mockGetComment.mockReturnValueOnce(request.promise);

    const store = makeStore();
    const screen = await render(
      <Provider store={store}>
        <CommentHarness commentId={11} />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockGetComment).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      screen.unmount();
    });

    await act(async () => {
      request.resolve([comment(11, "late comment")]);
      await request.promise;
    });

    expect(store.getState().comments.comments[11]).toBeUndefined();
  });
});

/* end of useComment.test.tsx */
