/*
    Project: Hoot Mobile
    -------------------

    File: useVote.test.tsx

    Purpose:

        Validate shared post and comment voting behavior.

    Responsibilities:

        - Verify votes update cached Redux state optimistically
        - Verify duplicate pending vote submissions are ignored
        - Verify failed votes roll cached state back safely
        - Verify late failures after unmount do not alert stale screens

    This file intentionally does NOT contain:

        - Vote button presentation tests
        - Live Lotide network tests
*/

import * as React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider, useSelector } from "react-redux";

import useVote from "../useVote";
import commentReducer, { setComment } from "../../slices/commentSlice";
import lotideReducer, { setCtx } from "../../slices/lotideSlice";
import postReducer, { setPost } from "../../slices/postSlice";
import settingsReducer from "../../slices/settingsSlice";
import { RootState } from "../../store/reduxStore";

import * as LotideService from "../../services/LotideService";

/* ------------------------------------------------------------------------- */
/* Test Harness                                                              */
/* ------------------------------------------------------------------------- */

const mockApplyVote = LotideService.applyVote as jest.Mock;
const mockRemoveCommentVote = LotideService.removeCommentVote as jest.Mock;

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  applyCommentVote: jest.fn(),
  applyVote: jest.fn(),
  removeCommentVote: jest.fn(),
  removeVote: jest.fn(),
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

function post(vote: boolean | undefined = undefined): Post {
  return {
    id: 7,
    title: "Vote test post",
    created: "2026-06-24T00:00:00Z",
    replies_count_total: 0,
    score: vote ? 1 : 0,
    your_vote: vote,
  };
}

function comment(vote = true): Comment {
  return {
    id: 11,
    content_text: "Vote test comment",
    created: "2026-06-24T00:00:00Z",
    score: vote ? 5 : 4,
    your_vote: vote,
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

function PostVoteHarness({ postId }: { postId: PostId }) {
  const cachedPost = useSelector(
    (state: RootState) => state.posts.posts[postId],
  );
  const vote = useVote("post", cachedPost || { ...post(), id: postId });

  if (!cachedPost) return <Text testID="post-missing">missing</Text>;

  return (
    <View>
      <Text testID="post-score">{String(cachedPost.score)}</Text>
      <Text testID="post-voted">{String(vote.isUpvoted)}</Text>
      <Text testID="post-pending">{String(vote.isVoting)}</Text>
      <Pressable
        accessibilityLabel="Add post vote"
        accessibilityRole="button"
        onPress={vote.addVote}
      >
        <Text>Add</Text>
      </Pressable>
    </View>
  );
}

function CommentVoteHarness({ commentId }: { commentId: CommentId }) {
  const cachedComment = useSelector(
    (state: RootState) => state.comments.comments[commentId],
  );
  const vote = useVote(
    "comment",
    cachedComment || { ...comment(false), id: commentId },
  );

  if (!cachedComment) return <Text testID="comment-missing">missing</Text>;

  return (
    <View>
      <Text testID="comment-score">{String(cachedComment.score)}</Text>
      <Text testID="comment-voted">{String(vote.isUpvoted)}</Text>
      <Pressable
        accessibilityLabel="Remove comment vote"
        accessibilityRole="button"
        onPress={vote.removeVote}
      >
        <Text>Remove</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe("useVote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("optimistically applies a post vote and ignores duplicate pending taps", async () => {
    const request = deferred<unknown>();
    mockApplyVote.mockReturnValueOnce(request.promise);

    const store = makeStore();
    store.dispatch(setPost({ post: post() }));

    const screen = await render(
      <Provider store={store}>
        <PostVoteHarness postId={7} />
      </Provider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Add post vote" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add post vote" }));

    expect(mockApplyVote).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByTestId("post-score").props.children).toBe("1");
      expect(screen.getByTestId("post-voted").props.children).toBe("true");
      expect(screen.getByTestId("post-pending").props.children).toBe("true");
    });

    await act(async () => {
      request.resolve(undefined);
      await request.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("post-pending").props.children).toBe("false");
    });
    expect(store.getState().posts.posts[7].score).toBe(1);
    expect(store.getState().posts.posts[7].your_vote).toBe(true);
  });

  test("rolls back an optimistic post vote when Lotide rejects it", async () => {
    const request = deferred<unknown>();
    mockApplyVote.mockReturnValueOnce(request.promise);

    const store = makeStore();
    store.dispatch(setPost({ post: post() }));

    const screen = await render(
      <Provider store={store}>
        <PostVoteHarness postId={7} />
      </Provider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Add post vote" }));

    await waitFor(() => {
      expect(screen.getByTestId("post-score").props.children).toBe("1");
    });

    await act(async () => {
      request.reject(new Error("Lotide refused the vote"));
      await request.promise.catch(() => undefined);
    });

    await waitFor(() => {
      expect(screen.getByTestId("post-pending").props.children).toBe("false");
    });
    expect(screen.getByTestId("post-score").props.children).toBe("0");
    expect(screen.getByTestId("post-voted").props.children).toBe("false");
    expect(Alert.alert).toHaveBeenCalledWith(
      "Vote failed",
      "Lotide refused the vote",
    );
  });

  test("rolls back a late failed comment vote without alerting after unmount", async () => {
    const request = deferred<unknown>();
    mockRemoveCommentVote.mockReturnValueOnce(request.promise);

    const store = makeStore();
    store.dispatch(setComment(comment()));

    const screen = await render(
      <Provider store={store}>
        <CommentVoteHarness commentId={11} />
      </Provider>,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Remove comment vote" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("comment-score").props.children).toBe("4");
      expect(screen.getByTestId("comment-voted").props.children).toBe("false");
    });

    await act(async () => {
      screen.unmount();
      await Promise.resolve();
    });

    await act(async () => {
      request.reject(new Error("late failure"));
      await request.promise.catch(() => undefined);
    });

    expect(store.getState().comments.comments[11].score).toBe(5);
    expect(store.getState().comments.comments[11].your_vote).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

/* end of useVote.test.tsx */
