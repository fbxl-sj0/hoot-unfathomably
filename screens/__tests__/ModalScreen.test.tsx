/*
    Project: Hoot Mobile
    -------------------

    File: ModalScreen.test.tsx

    Purpose:

        Validate post-detail screen refresh behavior.

    Responsibilities:

        - Verify the post detail scroll view exposes pull-to-refresh
        - Verify refresh requests reload both the post and comment tree

    This file intentionally does NOT contain:

        - Live Lotide API tests
        - Comment tree rendering tests
        - Native gesture integration tests
*/

import * as React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { Text as MockTextComponent } from "react-native";

import ModalScreen from "../ModalScreen";

function mockText(props: Record<string, unknown>, children: React.ReactNode) {
  return React.createElement(MockTextComponent, props, children);
}

const mockUsePost = jest.fn();
const mockCommentsDisplay = jest.fn(
  ({ reloadId }: { reloadId?: number }) => (
    mockText({ testID: "comments-reload-id" }, reloadId ?? 0)
  ),
);

jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../components/PostDisplay", () => ({
  __esModule: true,
  default: () => mockText({}, "Post body"),
}));

jest.mock("../../components/CommentsDisplay", () => ({
  __esModule: true,
  default: (props: { reloadId?: number }) => mockCommentsDisplay(props),
}));

jest.mock("../../hooks/usePost", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUsePost(...args),
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    text: "#000",
    tint: "#c84",
  }),
}));

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => ({ apiUrl: "https://lotide.fbxl.net/api/unstable" }),
}));

jest.mock("../../services/HapticService", () => ({
  ImpactFeedbackStyle: {
    Medium: "Medium",
  },
  impactAsync: jest.fn(),
}));

const navigation = {
  navigate: jest.fn(),
};

const route = {
  key: "Post",
  name: "Post",
  params: {
    postId: 42,
  },
};

describe("ModalScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePost.mockReturnValue({
      id: 42,
      title: "Refreshable post",
      content_html: "<p>Hello</p>",
      replies_count_total: 0,
      score: 0,
      created: "2026-06-23T00:00:00Z",
    } as Post);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("pull-to-refresh reloads the post and its comment tree", async () => {
    jest.useFakeTimers();

    const screen = await render(
      <ModalScreen navigation={navigation as never} route={route as never} />,
    );

    expect(mockUsePost).toHaveBeenCalledWith(42, 0);
    expect(screen.getByTestId("comments-reload-id").props.children).toBe(0);

    await act(async () => {
      screen
        .getByTestId("post-detail-scroll")
        .props
        .refreshControl
        .props
        .onRefresh();
    });

    await waitFor(() => {
      expect(mockUsePost).toHaveBeenLastCalledWith(42, 1);
      expect(screen.getByTestId("comments-reload-id").props.children).toBe(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(900);
    });
  });

  test("reloads comments when navigation highlights a submitted comment", async () => {
    const screen = await render(
      <ModalScreen navigation={navigation as never} route={route as never} />,
    );

    await waitFor(() => {
      expect(mockCommentsDisplay).toHaveBeenLastCalledWith(
        expect.objectContaining({
          highlightedComments: undefined,
          reloadId: 0,
        }),
      );
    });

    await act(async () => {
      screen.rerender(
        <ModalScreen
          navigation={navigation as never}
          route={
            {
              ...route,
              params: {
                postId: 42,
                highlightedComments: [91],
              },
            } as never
          }
        />,
      );
    });

    await waitFor(() => {
      expect(mockCommentsDisplay).toHaveBeenLastCalledWith(
        expect.objectContaining({
          highlightedComments: [91],
          reloadId: 91,
        }),
      );
    });
  });
});

/* end of ModalScreen.test.tsx */
