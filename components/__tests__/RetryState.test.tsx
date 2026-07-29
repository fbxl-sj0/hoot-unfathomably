/*
    Project: Hoot Mobile
    -------------------

    File: RetryState.test.tsx

    Purpose:

        Validate the shared retry UI used by failed screen and list loads.

    Responsibilities:

        • Verify the failure message is visible
        • Verify the retry action is accessible
        • Verify pressing retry calls the supplied recovery callback

    This file intentionally does NOT contain:

        • Screen-specific API retry tests
        • Visual snapshot tests
*/

import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import RetryState from "../RetryState";

jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#000",
    secondaryText: "#aaa",
    tint: "#f5a524",
  }),
}));

describe("RetryState", () => {
  test("renders an accessible retry action", async () => {
    const onRetry = jest.fn();

    const screen = await render(
      <RetryState message="Cannot load posts" onRetry={onRetry} />,
    );

    expect(screen.getByText("Cannot load posts")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

/* end of RetryState.test.tsx */
