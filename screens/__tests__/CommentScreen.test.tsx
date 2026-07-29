/*
    Project: Hoot Mobile
    -------------------

    File: CommentScreen.test.tsx

    Purpose:

        Validate the regular Lotide post/comment reply composer.

    Responsibilities:

        - Verify reply drafts are trimmed before submission
        - Verify successful replies return to the post with the new comment highlighted
        - Verify failed submissions keep the user's draft visible

    This file intentionally does NOT contain:

        - Comment tree rendering tests
        - Live Lotide API tests
        - Native keyboard behavior tests
*/

import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CommentScreen from "../CommentScreen";
import { RootStackScreenProps } from "../../types";

const mockCommentOnPost = jest.fn();
const mockCommentOnComment = jest.fn();
const mockUseLotideCtx = jest.fn();

jest.mock("../../components/ContentDisplay", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    placeholderText: "#999",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    tertiaryBackground: "#ddd",
    text: "#000",
    tint: "#f5a524",
  }),
}));

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockUseLotideCtx(),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  commentOnPost: (...args: unknown[]) => mockCommentOnPost(...args),
  commentOnComment: (...args: unknown[]) => mockCommentOnComment(...args),
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

async function renderCommentScreen(
  params: RootStackScreenProps<"Comment">["route"]["params"],
) {
  const navigation = {
    navigate: jest.fn(),
    pop: jest.fn(),
  };

  return {
    navigation,
    screen: await render(
      <CommentScreen
        navigation={navigation as never}
        route={
          {
            key: "comment",
            name: "Comment",
            params,
          } as never
        }
      />,
    ),
  };
}

describe("CommentScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLotideCtx.mockReturnValue(ctx);
    mockCommentOnPost.mockResolvedValue({ id: 91 });
    mockCommentOnComment.mockResolvedValue(92);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("submits a post reply and highlights the accepted comment", async () => {
    const { navigation, screen } = await renderCommentScreen({
      id: 42,
      postId: 42,
      title: "Post title",
      html: "<p>Post body</p>",
      type: "post",
    });

    expect(
      screen.getByRole("button", { name: "Submit comment" }).props
        .accessibilityState.disabled,
    ).toBe(true);

    await fireEvent.changeText(screen.getByLabelText("Comment"), "  hello  ");
    await fireEvent.press(screen.getByRole("button", { name: "Submit comment" }));

    await waitFor(() => {
      expect(mockCommentOnPost).toHaveBeenCalledWith(ctx, 42, "hello");
      expect(navigation.navigate).toHaveBeenCalledWith("Post", {
        postId: 42,
        highlightedComments: [91],
      });
    });
    expect(navigation.pop).not.toHaveBeenCalled();
  });

  test("submits a comment reply back to its post when post context is present", async () => {
    const { navigation, screen } = await renderCommentScreen({
      id: 21,
      postId: 42,
      title: "commenter",
      html: "<p>Comment body</p>",
      type: "comment",
    });

    await fireEvent.changeText(screen.getByLabelText("Comment"), "nested reply");
    await fireEvent.press(screen.getByRole("button", { name: "Submit comment" }));

    await waitFor(() => {
      expect(mockCommentOnComment).toHaveBeenCalledWith(ctx, 21, "nested reply");
      expect(navigation.navigate).toHaveBeenCalledWith("Post", {
        postId: 42,
        highlightedComments: [92],
      });
    });
  });

  test("blocks duplicate reply submissions while one is pending", async () => {
    const submission = createDeferred<{ id: CommentId }>();
    mockCommentOnPost.mockReturnValue(submission.promise);
    const { navigation, screen } = await renderCommentScreen({
      id: 42,
      postId: 42,
      title: "Post title",
      html: "<p>Post body</p>",
      type: "post",
    });

    await fireEvent.changeText(screen.getByLabelText("Comment"), "first reply");
    await fireEvent.press(screen.getByRole("button", { name: "Submit comment" }));

    await waitFor(() => {
      expect(mockCommentOnPost).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Submitting...")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Submit comment" }).props
          .accessibilityState.disabled,
      ).toBe(true);
    });

    await fireEvent.press(screen.getByText("Submitting..."));

    expect(mockCommentOnPost).toHaveBeenCalledTimes(1);

    await act(async () => {
      submission.resolve({ id: 91 });
      await submission.promise;
    });

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith("Post", {
        postId: 42,
        highlightedComments: [91],
      });
    });
  });

  test("ignores accepted replies after leaving the composer", async () => {
    const submission = createDeferred<{ id: CommentId }>();
    mockCommentOnPost.mockReturnValue(submission.promise);
    const { navigation, screen } = await renderCommentScreen({
      id: 42,
      postId: 42,
      title: "Post title",
      html: "<p>Post body</p>",
      type: "post",
    });

    await fireEvent.changeText(screen.getByLabelText("Comment"), "leaving now");
    await fireEvent.press(screen.getByRole("button", { name: "Submit comment" }));

    await waitFor(() => {
      expect(mockCommentOnPost).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedSubmission = submission.promise.then(() => undefined);
    submission.resolve({ id: 91 });

    await drainedSubmission;
    await Promise.resolve();

    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.pop).not.toHaveBeenCalled();
  });

  test("ignores reply failures after leaving the composer", async () => {
    const submission = createDeferred<{ id: CommentId }>();
    mockCommentOnPost.mockReturnValue(submission.promise);
    const { screen } = await renderCommentScreen({
      id: 42,
      postId: 42,
      title: "Post title",
      html: "<p>Post body</p>",
      type: "post",
    });

    await fireEvent.changeText(screen.getByLabelText("Comment"), "leaving now");
    await fireEvent.press(screen.getByRole("button", { name: "Submit comment" }));

    await waitFor(() => {
      expect(mockCommentOnPost).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.unmount();
    });

    const drainedSubmission = submission.promise.catch(() => undefined);
    submission.reject(new Error("late reply failure"));

    await drainedSubmission;
    await Promise.resolve();

    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Could not submit comment",
      "late reply failure",
    );
  });

  test("keeps the draft and reports the server reason when submit fails", async () => {
    mockCommentOnPost.mockRejectedValue(new Error("reply rejected"));

    const { navigation, screen } = await renderCommentScreen({
      id: 42,
      postId: 42,
      title: "Post title",
      html: "<p>Post body</p>",
      type: "post",
    });

    await fireEvent.changeText(screen.getByLabelText("Comment"), "try again");
    await fireEvent.press(screen.getByRole("button", { name: "Submit comment" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Could not submit comment",
        "reply rejected",
      );
      expect(screen.getByLabelText("Comment").props.value).toBe("try again");
      expect(
        screen.getByRole("button", { name: "Submit comment" }).props
          .accessibilityState.disabled,
      ).toBe(false);
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

/* end of CommentScreen.test.tsx */
