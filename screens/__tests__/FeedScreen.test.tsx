/*
    Project: Hoot Mobile
    -------------------

    File: FeedScreen.test.tsx

    Purpose:

        Validate feed-row interaction behavior.

    Responsibilities:

        - Verify visible feed rows expose an accessible open-post action
        - Verify the accessible action navigates to the selected post

    This file intentionally does NOT contain:

        - Feed pagination hook tests
        - Post rendering detail tests
        - Vote mutation tests
*/

import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import FeedScreen from "../FeedScreen";

/* ------------------------------------------------------------------------- */
/* Test setup                                                                */
/* ------------------------------------------------------------------------- */

const mockNavigate = jest.fn();
const mockUseFeed = jest.fn();
const mockUseLotideCtx = jest.fn();

jest.mock("../../hooks/useFeed", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeed(...args),
}));

jest.mock("../../hooks/useLotideCtx", () => ({
  __esModule: true,
  useLotideCtx: () => mockUseLotideCtx(),
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    blue: "#00f",
    red: "#f00",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    text: "#000",
  }),
}));

jest.mock("../../hooks/useVote", () => ({
  __esModule: true,
  default: () => ({
    addVote: jest.fn(),
    isUpvoted: false,
    removeVote: jest.fn(),
  }),
}));

jest.mock("@react-navigation/core", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock("../../components/SwipeAction", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockStore = configureStoreMock([]);

function post(id: PostId): Post {
  return {
    id,
    title: "Accessible post",
    created: "2026-06-24T00:00:00Z",
    replies_count_total: 0,
    score: 0,
  };
}

async function renderFeed() {
  const store = mockStore({
    lotide: {
      ctx: {
        apiUrl: "https://lotide.fbxl.net/api/unstable",
        login: {
          token: "token-1",
          user: {
            id: 1,
            username: "sj_zero",
            host: "lotide.fbxl.net",
          },
        },
      },
    },
    posts: {
      posts: {
        42: post(42),
      },
    },
  });

  return await render(
    <Provider store={store}>
      <FeedScreen
        navigation={{} as never}
        route={{
          key: "FeedScreen",
          name: "FeedScreen",
          params: { sort: "hot" },
        } as never}
      />
    </Provider>,
  );
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                     */
/* ------------------------------------------------------------------------- */

describe("FeedScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeed.mockReturnValue([[42], jest.fn(), jest.fn(), ""]);
    mockUseLotideCtx.mockReturnValue({
      apiUrl: "https://lotide.fbxl.net/api/unstable",
      login: {
        token: "token-1",
        user: {
          id: 1,
          username: "sj_zero",
          host: "lotide.fbxl.net",
        },
      },
    });
  });

  test("opens a feed post through an accessible row action", async () => {
    const screen = await renderFeed();

    const row = screen.getByRole("button", {
      name: "Open post Accessible post",
    });
    await fireEvent.press(row);

    expect(mockNavigate).toHaveBeenCalledWith("Post", { postId: 42 });
  });
});

/* end of FeedScreen.test.tsx */
