/*
    Project: Hoot Mobile
    -------------------

    File: useComments.test.tsx

    Purpose:

        Validate paged comment loading behavior independent of the comment UI.

    Responsibilities:

        - Verify overlapping post comment pages do not duplicate rows
        - Verify overlapping nested comment reply pages do not duplicate rows
        - Verify stale in-flight loads cannot overwrite newer reply state
        - Verify pending comment loads are ignored after unmount

    This file intentionally does NOT contain:

        - Comment tree rendering tests
        - Live Lotide network requests
        - Comment submission tests
*/

import * as React from "react";
import { Button, Text } from "react-native";
import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";

import useComments from "../useComments";
import commentReducer, { setComment } from "../../slices/commentSlice";
import lotideReducer, { setCtx } from "../../slices/lotideSlice";
import postReducer, { setPost } from "../../slices/postSlice";
import settingsReducer from "../../slices/settingsSlice";

import * as LotideService from "../../services/LotideService";

/* ------------------------------------------------------------------------- */
/* Test Harness                                                              */
/* ------------------------------------------------------------------------- */

const mockGetPostComments = LotideService.getPostComments as jest.Mock;
const mockGetCommentComments = LotideService.getCommentComments as jest.Mock;
type CommentResponse = [Paged<CommentId>, Comment[]];

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  getCommentComments: jest.fn(),
  getPostComments: jest.fn(),
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

function comment(id: CommentId): Comment {
  return {
    id,
    author: {
      id: id + 100,
      username: `user_${id}`,
      host: "lotide.fbxl.net",
      local: true,
    },
    content_html: `<p>Comment ${id}</p>`,
    content_text: `Comment ${id}`,
    created: "2026-06-24T00:00:00Z",
    replies_count_total: 0,
    score: 0,
  };
}

function post(id: PostId): Post {
  return {
    id,
    title: `Post ${id}`,
    created: "2026-06-24T00:00:00Z",
    replies_count_total: 0,
    score: 0,
  };
}

function page(
  items: CommentId[],
  nextPage: string | null,
): Paged<CommentId> {
  return {
    items,
    next_page: nextPage,
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
  store.dispatch(setPost({ post: post(7) }));
  store.dispatch(setComment(comment(11)));

  return store;
}

function CommentsHarness({
  id,
  type,
}: {
  id: number;
  type: ContentType;
}) {
  const {
    comments,
    loadNextPage,
    loadError,
    refreshComments,
  } = useComments(type, id);

  return (
    <>
      <Text testID="comment-ids">
        {comments?.items.join(",") || "none"}
      </Text>
      <Text testID="comment-next-page">
        {comments?.next_page || "none"}
      </Text>
      <Text testID="comment-load-error">{loadError || "ok"}</Text>
      <Button title="next" onPress={loadNextPage} />
      <Button title="refresh" onPress={refreshComments} />
    </>
  );
}

async function renderHarness(type: ContentType, id: number) {
  const store = makeStore();
  const screen = await render(
    <Provider store={store}>
      <CommentsHarness id={id} type={type} />
    </Provider>,
  );

  return {
    screen,
    store,
  };
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe("useComments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostComments.mockResolvedValue([page([], null), []]);
    mockGetCommentComments.mockResolvedValue([page([], null), []]);
  });

  test("deduplicates overlapping post comment pages", async () => {
    mockGetPostComments
      .mockResolvedValueOnce([page([1, 2], "next-page"), [comment(1), comment(2)]])
      .mockResolvedValueOnce([page([2, 3], null), [comment(2), comment(3)]]);

    const { screen } = await renderHarness("post", 7);

    await waitFor(() => {
      expect(screen.getByTestId("comment-ids").props.children).toBe("1,2");
      expect(screen.getByTestId("comment-next-page").props.children).toBe(
        "next-page",
      );
    });

    await fireEvent.press(screen.getByText("next"));

    await waitFor(() => {
      expect(mockGetPostComments).toHaveBeenCalledWith(
        expect.any(Object),
        7,
        "next-page",
      );
      expect(screen.getByTestId("comment-ids").props.children).toBe("1,2,3");
      expect(screen.getByTestId("comment-next-page").props.children).toBe(
        "none",
      );
    });
  });

  test("deduplicates overlapping nested reply pages", async () => {
    mockGetCommentComments
      .mockResolvedValueOnce([page([21, 22], "next-page"), [
        comment(21),
        comment(22),
      ]])
      .mockResolvedValueOnce([page([22, 23], null), [
        comment(22),
        comment(23),
      ]]);

    const { screen } = await renderHarness("comment", 11);

    await fireEvent.press(screen.getByText("next"));

    await waitFor(() => {
      expect(screen.getByTestId("comment-ids").props.children).toBe("21,22");
    });

    await fireEvent.press(screen.getByText("next"));

    await waitFor(() => {
      expect(mockGetCommentComments).toHaveBeenCalledWith(
        expect.any(Object),
        11,
        "next-page",
      );
      expect(screen.getByTestId("comment-ids").props.children).toBe(
        "21,22,23",
      );
    });
  });

  test("ignores stale post comment responses after refresh", async () => {
    const firstRequest = deferred<CommentResponse>();
    const secondRequest = deferred<CommentResponse>();

    mockGetPostComments
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { screen } = await renderHarness("post", 7);

    await waitFor(() => {
      expect(mockGetPostComments).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByText("refresh"));

    await waitFor(() => {
      expect(mockGetPostComments).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondRequest.resolve([page([2], null), [comment(2)]]);
      await secondRequest.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("comment-ids").props.children).toBe("2");
    });

    await act(async () => {
      firstRequest.resolve([page([1], null), [comment(1)]]);
      await firstRequest.promise;
    });

    expect(screen.getByTestId("comment-ids").props.children).toBe("2");
  });

  test("ignores stale nested reply failures after a newer success", async () => {
    const firstRequest = deferred<CommentResponse>();
    const secondRequest = deferred<CommentResponse>();

    mockGetCommentComments
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { screen } = await renderHarness("comment", 11);

    fireEvent.press(screen.getByText("next"));

    await waitFor(() => {
      expect(mockGetCommentComments).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByText("next"));

    await waitFor(() => {
      expect(mockGetCommentComments).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondRequest.resolve([page([21], null), [comment(21)]]);
      await secondRequest.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("comment-ids").props.children).toBe("21");
    });

    await act(async () => {
      firstRequest.reject(new Error("Older request failed"));
      await firstRequest.promise.catch(() => undefined);
    });

    expect(screen.getByTestId("comment-load-error").props.children).toBe("ok");
  });

  test("ignores post comment responses after unmount", async () => {
    const request = deferred<CommentResponse>();

    mockGetPostComments.mockReturnValueOnce(request.promise);

    const { screen, store } = await renderHarness("post", 7);

    await waitFor(() => {
      expect(mockGetPostComments).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      screen.unmount();
    });

    await act(async () => {
      request.resolve([page([31], null), [comment(31)]]);
      await request.promise;
    });

    expect(store.getState().posts.posts[7].replies).toBeUndefined();
    expect(store.getState().comments.comments[31]).toBeUndefined();
  });

  test("ignores nested reply responses after unmount", async () => {
    const request = deferred<CommentResponse>();

    mockGetCommentComments.mockReturnValueOnce(request.promise);

    const { screen, store } = await renderHarness("comment", 11);

    fireEvent.press(screen.getByText("next"));

    await waitFor(() => {
      expect(mockGetCommentComments).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      screen.unmount();
    });

    await act(async () => {
      request.resolve([page([41], null), [comment(41)]]);
      await request.promise;
    });

    expect(store.getState().comments.comments[11].replies).toBeUndefined();
    expect(store.getState().comments.comments[41]).toBeUndefined();
  });
});

/* end of useComments.test.tsx */
