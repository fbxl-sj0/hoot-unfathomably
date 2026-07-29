/*
    Project: Hoot Mobile
    -------------------

    File: useRefreshableData.test.ts

    Purpose:

        Validate shared refresh hook behavior so data loading can safely
        be retried and re-run when dependencies change.

    Responsibilities:

        • Ensure refreshable effects are run once after mount
        • Ensure manual refresh calls trigger a second load
        • Ensure dependency changes trigger a second load
        • Ensure replaced effects are cleaned up

    This file intentionally does NOT contain:

        • Assertions for API payload shapes
        • UI behavior for any specific screen
*/

import * as React from "react";
import { Button, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { useRefreshableData } from "../useRefreshableData";

function RenderHookHarness({
  effect,
  deps,
}: {
  effect: (stopLoading: () => void) => void | (() => void);
  deps: unknown[];
}) {
  const [isLoading, refresh] = useRefreshableData(effect, deps);

  return (
    <>
      <Text>{isLoading ? "loading" : "idle"}</Text>
      <Button title="refresh" onPress={refresh} />
    </>
  );
}

describe("useRefreshableData", () => {
  test("runs the effect on mount and again after manual refresh", async () => {
    const mockEffect = jest.fn((stopLoading: () => void) => stopLoading());

    const screen = await render(
      <RenderHookHarness effect={mockEffect} deps={["https://lotide.fbxl.net"]} />,
    );

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("idle")).toBeTruthy();

    await fireEvent.press(screen.getByText("refresh"));

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(2);
    });
  });

  test("runs again when dependency key changes", async () => {
    const mockEffect = jest.fn((stopLoading: () => void) => stopLoading());

    const { rerender, getByText } = await render(
      <RenderHookHarness effect={mockEffect} deps={["https://lotide.fbxl.net"]} />,
    );

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(1);
    });

    rerender(
      <RenderHookHarness
        effect={mockEffect}
        deps={["https://narwhal.city"]}
      />,
    );

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(2);
    });
    expect(getByText("idle")).toBeTruthy();
  });

  test("keeps loading true until the effect calls stopLoading", async () => {
    let stopLoading: (() => void) | undefined;
    const mockEffect = jest.fn((stop: () => void) => {
      stopLoading = stop;
    });

    const screen = await render(
      <RenderHookHarness effect={mockEffect} deps={["https://lotide.fbxl.net"]} />,
    );

    expect(screen.getByText("loading")).toBeTruthy();
    expect(mockEffect).toHaveBeenCalledTimes(1);

    await act(() => {
      stopLoading?.();
    });

    await waitFor(() => {
      expect(screen.getByText("idle")).toBeTruthy();
    });
  });

  test("runs effect cleanup before refresh replacement and unmount", async () => {
    const cleanup = jest.fn();
    const mockEffect = jest.fn(() => cleanup);

    const screen = await render(
      <RenderHookHarness effect={mockEffect} deps={["https://lotide.fbxl.net"]} />,
    );

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByText("refresh"));

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(2);
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      screen.unmount();
    });

    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  test("ignores stopLoading from a replaced effect", async () => {
    const stopLoadingCallbacks: (() => void)[] = [];
    const mockEffect = jest.fn((stopLoading: () => void) => {
      stopLoadingCallbacks.push(stopLoading);
    });

    const screen = await render(
      <RenderHookHarness effect={mockEffect} deps={["https://lotide.fbxl.net"]} />,
    );

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByText("refresh"));

    await waitFor(() => {
      expect(mockEffect).toHaveBeenCalledTimes(2);
    });

    await act(() => {
      stopLoadingCallbacks[0]?.();
    });

    expect(screen.getByText("loading")).toBeTruthy();

    await act(() => {
      stopLoadingCallbacks[1]?.();
    });

    await waitFor(() => {
      expect(screen.getByText("idle")).toBeTruthy();
    });
  });
});

/* end of useRefreshableData.test.tsx */
