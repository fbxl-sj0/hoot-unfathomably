/*
    Project: Hoot Mobile
    -------------------

    File: AppErrorBoundary.test.tsx

    Purpose:

        Validate the root-level React render recovery boundary.

    Responsibilities:

        - Verify children render normally when no error occurs
        - Verify render errors show a friendly recovery state
        - Verify the retry action can re-render recovered children

    This file intentionally does NOT contain:

        - Native crash tests
        - Navigation integration tests
        - Async task error handling tests
*/

import * as React from "react";
import {
  act,
  fireEvent,
  render,
} from "@testing-library/react-native";
import { Text } from "react-native";

import AppErrorBoundary from "../AppErrorBoundary";

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#000",
    secondaryBackground: "#181818",
    secondaryText: "#aaa",
    text: "#fff",
    tint: "#f5a524",
    tertiaryBackground: "#242424",
  }),
}));

function HealthyChild() {
  return <Text>Healthy app</Text>;
}

describe("AppErrorBoundary", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test("renders children when no render error occurs", async () => {
    const screen = await render(
      <AppErrorBoundary>
        <HealthyChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Healthy app")).toBeTruthy();
  });

  test("shows a recovery state when a child render throws", async () => {
    const onError = jest.fn();

    function BrokenChild(): React.ReactElement {
      throw new Error("profile card failed");
    }

    const screen = await render(
      <AppErrorBoundary onError={onError}>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Hoot hit a problem")).toBeTruthy();
    expect(screen.getByText("profile card failed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("retries the child tree after a recovered render error", async () => {
    let shouldThrow = true;

    function RecoveringChild(): React.ReactElement {
      if (shouldThrow) {
        throw new Error("temporary render failure");
      }

      return <Text>Recovered app</Text>;
    }

    const screen = await render(
      <AppErrorBoundary>
        <RecoveringChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("temporary render failure")).toBeTruthy();

    shouldThrow = false;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
      await Promise.resolve();
    });

    expect(screen.getByText("Recovered app")).toBeTruthy();
  });
});

/* end of AppErrorBoundary.test.tsx */
