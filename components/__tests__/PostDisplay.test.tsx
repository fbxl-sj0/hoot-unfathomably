/*
    Project: Hoot Mobile
    -------------------

    File: PostDisplay.test.tsx

    Purpose:

        Validate rendering behavior for cached post data.

    Responsibilities:

        • Verify post title, author, community, and content render from Redux
        • Verify community rows navigate only when community data is usable
        • Verify partial post records degrade to friendly fallback text

    This file intentionally does NOT contain:

        • Lotide API fetch tests
        • Full feed screen tests
        • Vote mutation tests
*/

import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import PostDisplay from "../PostDisplay";

jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => ({
    login: { token: "test-token" },
    apiUrl: "https://test.com",
  }),
}));

const mockStore = configureStoreMock([]);

async function renderPost(post: Partial<Post>, navigation = { navigate: jest.fn() }) {
  const store = mockStore({
    posts: {
      posts: {
        [post.id || 1]: post,
      },
    },
    lotide: { ctx: { apiUrl: "https://test.com" } },
  });

  return {
    navigation,
    screen: await render(
      <Provider store={store}>
        <PostDisplay postId={(post.id || 1) as PostId} navigation={navigation} />
      </Provider>,
    ),
  };
}

describe("PostDisplay", () => {
  test("renders cached post details and opens a known community", async () => {
    const { navigation, screen } = await renderPost({
      id: 1,
      title: "Test Post",
      author: {
        id: 2,
        username: "jules",
        host: "lotide.fbxl.net",
        local: true,
      } as Profile,
      community: {
        id: 3,
        name: "tech",
        host: "lotide.fbxl.net",
        local: true,
      } as Community,
      content_html: "<p>Hello World</p>",
      content_text: "Hello World",
      score: 10,
      replies_count_total: 2,
      created: new Date().toISOString(),
      your_vote: true,
    });

    expect(screen.getByText("Test Post")).toBeTruthy();
    expect(screen.getByText("jules")).toBeTruthy();
    expect(screen.getByText("Hello World")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Open community tech@lotide.fbxl.net",
      }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Community", {
      community: expect.objectContaining({
        id: 3,
        name: "tech",
      }),
    });
  });

  test("renders friendly fallbacks for partial cached post records", async () => {
    const { navigation, screen } = await renderPost({
      id: 2,
      title: "Partial Post",
      author: undefined,
      community: undefined,
      content_html: "<p>Hello World</p>",
      score: 0,
      replies_count_total: 0,
      created: new Date().toISOString(),
    });

    expect(screen.getByText("Partial Post")).toBeTruthy();
    expect(screen.getByText("Unknown author")).toBeTruthy();
    expect(screen.getByText("Unknown community")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Unknown community" }).props
        .accessibilityState,
    ).toEqual({ disabled: true });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

/* end of PostDisplay.test.tsx */
