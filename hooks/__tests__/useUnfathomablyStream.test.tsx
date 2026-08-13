/*
    Project: Hoot Unfathomably
    --------------------------

    File: useUnfathomablyStream.test.tsx

    Purpose:

        Verify mobile foreground lifecycle handling for live server streams.

    Responsibilities:

        - Connect only with an authenticated context
        - Close streams when Android backgrounds the app
        - Reconnect and request a REST catch-up after a foreground gap
        - Forward server reconnect and event callbacks without stale handlers

    This file intentionally does NOT contain:

        - WebSocket protocol tests
        - live network requests
        - navigation stack rendering
*/

import React from "react";
import { AppState, AppStateStatus } from "react-native";
import { act, render } from "@testing-library/react-native";

import useUnfathomablyStream from "../useUnfathomablyStream";
import { makeContext } from "../../testing/fediverseFixtures";
import type {
  UnfathomablyStreamCallbacks,
  UnfathomablyStreamDescriptor,
} from "../../services/UnfathomablyStreamingService";

const mockClose = jest.fn();
const mockConnect = jest.fn();

jest.mock("@react-navigation/native", () => {
  const React = jest.requireActual("react");
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(effect, [effect]);
    },
  };
});

jest.mock("../../services/UnfathomablyStreamingService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyStreamingService");
  return {
    __esModule: true,
    ...actual,
    connectToUnfathomablyStream: (...args: unknown[]) => mockConnect(...args),
  };
});

type HarnessProps = {
  callbacks: {
    onCatchUp?: () => void;
    onEvent: (event: { event: string; payload: unknown; stream: string[] }) => void;
  };
  ctx?: LotideContext;
  descriptor?: UnfathomablyStreamDescriptor;
  enabled?: boolean;
};

function Harness({ callbacks, ctx, descriptor, enabled = true }: HarnessProps) {
  useUnfathomablyStream(ctx, descriptor, callbacks, enabled);
  return null;
}

describe("useUnfathomablyStream", () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let appStateSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = undefined;
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active",
    });
    appStateSpy = jest.spyOn(AppState, "addEventListener").mockImplementation(
      (_type, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() } as never;
      },
    );
    mockConnect.mockReturnValue({ close: mockClose });
  });

  afterEach(() => {
    appStateSpy.mockRestore();
  });

  test("closes in the background and catches up after foreground reconnect", async () => {
    const onCatchUp = jest.fn();
    const onEvent = jest.fn();
    const ctx = makeContext("unfathomably");
    await render(
      <Harness
        callbacks={{ onCatchUp, onEvent }}
        ctx={ctx}
        descriptor={{ stream: "user:groups" }}
      />,
    );

    expect(mockConnect).toHaveBeenCalledTimes(1);
    const firstCallbacks = mockConnect.mock.calls[0][2] as UnfathomablyStreamCallbacks;
    await act(async () => firstCallbacks.onConnect?.());

    await act(async () => appStateListener?.("background"));
    expect(mockClose).toHaveBeenCalledTimes(1);

    await act(async () => appStateListener?.("active"));
    expect(mockConnect).toHaveBeenCalledTimes(2);
    const secondCallbacks = mockConnect.mock.calls[1][2] as UnfathomablyStreamCallbacks;
    await act(async () => secondCallbacks.onConnect?.());
    expect(onCatchUp).toHaveBeenCalledTimes(1);

    await act(async () => secondCallbacks.onReconnect?.());
    expect(onCatchUp).toHaveBeenCalledTimes(2);
    const event = { event: "delete", payload: "status-1", stream: ["user:groups"] };
    await act(async () => secondCallbacks.onEvent(event));
    expect(onEvent).toHaveBeenCalledWith(event);
  });

  test("does not connect without an account or while disabled", async () => {
    const callbacks = { onEvent: jest.fn() };
    const first = await render(
      <Harness callbacks={callbacks} descriptor={{ stream: "user" }} />,
    );
    expect(mockConnect).not.toHaveBeenCalled();

    await act(async () => first.unmount());
    await render(
      <Harness
        callbacks={callbacks}
        ctx={makeContext("pleroma")}
        descriptor={{ stream: "user" }}
        enabled={false}
      />,
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

/* end of useUnfathomablyStream.test.tsx */
