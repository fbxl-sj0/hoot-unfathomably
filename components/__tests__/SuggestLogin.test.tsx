/*
    Project: Hoot Unfathomably
    --------------------------

    File: SuggestLogin.test.tsx

    Purpose:

        Verify public instance themes can preview before authentication.

    Responsibilities:

        - Select a server without manufacturing login credentials
        - Clear the temporary server context when returning to the host list

    This file intentionally does NOT contain:

        - Network requests
        - Login or token persistence
*/

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import SuggestLogin from "../SuggestLogin";

const mockDispatch = jest.fn();

jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock("../HostList", () => ({
  __esModule: true,
  default: ({ onSelect }: { onSelect: (domain: string, name: string) => void }) => {
    const ReactModule = jest.requireActual("react") as typeof React;
    const { Pressable } = jest.requireActual("react-native") as
      typeof import("react-native");

    return ReactModule.createElement(Pressable, {
      accessibilityLabel: "Select test server",
      accessibilityRole: "button",
      onPress: () => onSelect("https://pleroma.example", "Pleroma Example"),
    });
  },
}));

jest.mock("../Login", () => ({
  __esModule: true,
  default: ({
    domain,
    onGoBack,
  }: {
    domain: string;
    onGoBack: () => void;
  }) => {
    const ReactModule = jest.requireActual("react") as typeof React;
    const { Pressable, Text } = jest.requireActual("react-native") as
      typeof import("react-native");

    return ReactModule.createElement(
      ReactModule.Fragment,
      null,
      ReactModule.createElement(Text, null, domain),
      ReactModule.createElement(Pressable, {
        accessibilityLabel: "Back to servers",
        accessibilityRole: "button",
        onPress: onGoBack,
      }),
    );
  },
}));

describe("SuggestLogin", () => {
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  test("previews and clears the selected server without a login", async () => {
    const view = await render(<SuggestLogin />);

    await fireEvent.press(
      view.getByRole("button", { name: "Select test server" }),
    );

    expect(view.getByText("https://pleroma.example")).toBeTruthy();
    expect(mockDispatch).toHaveBeenLastCalledWith({
      payload: { apiUrl: "https://pleroma.example" },
      type: "lotide/setCtx",
    });

    await fireEvent.press(
      view.getByRole("button", { name: "Back to servers" }),
    );

    expect(view.getByRole("button", { name: "Select test server" })).toBeTruthy();
    expect(mockDispatch).toHaveBeenLastCalledWith({
      payload: {},
      type: "lotide/setCtx",
    });
  });
});

/* end of SuggestLogin.test.tsx */
