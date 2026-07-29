/*
    Project: Hoot Mobile
    -------------------

    File: TappableList.test.tsx

    Purpose:

        Validate the shared tappable settings/action list component.

    Responsibilities:

        • Verify enabled rows invoke their action
        • Verify disabled rows do not invoke their action
        • Verify disabled rows expose accessible disabled state

    This file intentionally does NOT contain:

        • Screen-specific navigation tests
        • Icon rendering tests
        • Theme color snapshot tests
*/

import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { TappableList } from "../TappableList";

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    text: "#111",
    secondaryText: "#444",
    secondaryBackground: "#eee",
    tertiaryBackground: "#999",
  }),
}));

jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: () => null,
}));

describe("TappableList", () => {
  test("calls onPress for enabled items", async () => {
    const onPress = jest.fn();

    const screen = await render(
      <TappableList
        items={[
          {
            title: "Enabled",
            onPress,
          },
        ]}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Enabled" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("does not call onPress for disabled items", async () => {
    const onPress = jest.fn();

    const screen = await render(
      <TappableList
        items={[
          {
            title: "Disabled",
            disabled: true,
            onPress,
          },
        ]}
      />,
    );

    const disabledButton = screen.getByRole("button", { name: "Disabled" });

    expect(disabledButton.props.accessibilityState).toEqual({
      disabled: true,
    });
    await fireEvent.press(disabledButton);
    expect(onPress).not.toHaveBeenCalled();
  });
});

/* end of TappableList.test.tsx */
