/*
    Project: Hoot Mobile
    -------------------

    File: SearchScreen.test.tsx

    Purpose:

        Validate the Communities tab screen.

    Responsibilities:

        • Verify the screen defaults to followed communities
        • Verify switching tabs loads the full community list
        • Verify selected communities still navigate to the detail screen

    This file intentionally does NOT contain:

        • Community detail screen tests
        • Live Lotide network tests
        • New community creation tests
*/

import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import configureStoreMock from "redux-mock-store";

import SearchScreen from "../SearchScreen";

const mockGetAllCommunities = jest.fn();

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryText: "#333",
    placeholderText: "#999",
    text: "#000",
    secondaryTint: "#090",
    tertiaryBackground: "#eee",
  }),
}));

jest.mock("../../services/LotideService", () => ({
  __esModule: true,
  ...jest.requireActual("../../services/LotideService"),
  getAllCommunities: (...args: unknown[]) => mockGetAllCommunities(...args),
}));

const mockStore = configureStoreMock([]);

function renderWithStore(ui: React.ReactElement, ctx: LotideContext) {
  return render(<Provider store={mockStore({ lotide: { ctx } })}>{ui}</Provider>);
}

async function renderSearchScreen() {
  const navigation = {
    addListener: jest.fn(() => jest.fn()),
    navigate: jest.fn(),
  };

  const screen = await renderWithStore(
    <SearchScreen navigation={navigation as never} route={{} as never} />,
    { login: { token: "token-1" } },
  );

  return {
    navigation,
    screen,
  };
}

describe("SearchScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllCommunities.mockImplementation(
      (_ctx: LotideContext, onlyFollowing: boolean) =>
        Promise.resolve(
          onlyFollowing
            ? [
              {
                id: 1,
                name: "lotide",
                host: "lotide.fbxl.net",
                local: false,
                your_follow: { accepted: true },
              },
            ]
            : [
              {
                id: 1,
                name: "lotide",
                host: "lotide.fbxl.net",
                local: false,
                your_follow: { accepted: true },
              },
              {
                id: 2,
                name: "narwhal",
                host: "narwhal.city",
                local: false,
              },
            ],
        ),
    );
  });

  test("defaults to followed communities", async () => {
    const { screen } = await renderSearchScreen();

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenCalledWith(
        expect.objectContaining({
          login: { token: "token-1" },
        }),
        true,
      );
      expect(screen.getByText("lotide")).toBeTruthy();
    });

    expect(screen.queryByText("narwhal")).toBeNull();
  });

  test("switches from followed communities to every community", async () => {
    const { screen } = await renderSearchScreen();

    await waitFor(() => {
      expect(screen.getByText("lotide")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Show every community" }),
    );

    await waitFor(() => {
      expect(mockGetAllCommunities).toHaveBeenLastCalledWith(
        expect.objectContaining({
          login: { token: "token-1" },
        }),
        false,
      );
      expect(screen.getByText("narwhal")).toBeTruthy();
    });
  });

  test("opens selected communities from the active tab", async () => {
    const { navigation, screen } = await renderSearchScreen();

    await waitFor(() => {
      expect(screen.getByText("lotide")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Select community lotide@lotide.fbxl.net",
      }),
    );

    expect(navigation.navigate).toHaveBeenCalledWith("Community", {
      community: expect.objectContaining({
        id: 1,
        name: "lotide",
      }),
    });
  });
});

/* end of SearchScreen.test.tsx */
