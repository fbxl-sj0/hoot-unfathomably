/*
    Project: Hoot Mobile
    -------------------

    File: NotFoundScreen.test.tsx

    Purpose:

        Validate the fallback route screen.

    Responsibilities:

        - Verify the fallback screen renders a recoverable state
        - Verify the home action replaces the missing route

    This file intentionally does NOT contain:

        - Deep link parser tests
        - Navigation container integration tests
*/

import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import NotFoundScreen from "../NotFoundScreen";

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryText: "#333",
    tertiaryBackground: "#ddd",
    text: "#000",
    tint: "#f5a524",
  }),
}));

describe("NotFoundScreen", () => {
  test("offers a route back home", async () => {
    const navigation = {
      replace: jest.fn(),
    };

    const screen = await render(
      <NotFoundScreen
        navigation={navigation as never}
        route={
          {
            key: "not-found",
            name: "NotFound",
          } as never
        }
      />,
    );

    expect(screen.getByText("Screen not found")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Go Home" }));

    expect(navigation.replace).toHaveBeenCalledWith("Root");
  });
});

/* end of NotFoundScreen.test.tsx */
