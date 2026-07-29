/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseFeedScreens.test.tsx

    Purpose:

        Verify the active home and group feeds against supported Fediverse
        server families.

    Responsibilities:

        - Load Unfathomably, Rebased, and Pleroma home timelines
        - Keep group-feed requests on the dedicated group endpoint
        - Render recoverable errors when an extension is unavailable

    This file intentionally does NOT contain:

        - Deprecated feed sorting or pagination fixtures
        - Live timeline requests
*/

import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import UnfathomablyFeedScreen from "../UnfathomablyFeedScreen";
import UnfathomablyGroupFeedScreen from "../UnfathomablyGroupFeedScreen";
import {
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockGetGroupTimeline = jest.fn();
const mockGetHomeTimeline = jest.fn();
let mockCurrentContext: LotideContext | undefined;

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../services/UnfathomablyService", () => ({
  getGroupTimeline: (...args: unknown[]) => mockGetGroupTimeline(...args),
  getHomeTimeline: (...args: unknown[]) => mockGetHomeTimeline(...args),
}));

jest.mock("../../components/StatusCard", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");

  return function MockStatusCard({
    status,
  }: {
    status: { id: string };
  }) {
    return React.createElement(Text, null, `status:${status.id}`);
  };
});

jest.mock("../../components/SuggestLogin", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");

  return function MockSuggestLogin() {
    return React.createElement(Text, null, "Sign in to continue");
  };
});

describe("Fediverse feed screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentContext = makeContext("unfathomably");
    mockGetGroupTimeline.mockResolvedValue([]);
    mockGetHomeTimeline.mockResolvedValue([]);
  });

  test.each([
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)("loads a %s home timeline", async (_label, family) => {
    mockCurrentContext = makeContext(family);
    mockGetHomeTimeline.mockResolvedValue([makeStatus(family)]);
    const screen = await render(
      <UnfathomablyFeedScreen navigation={{ navigate: jest.fn() }} />,
    );

    await waitFor(() => {
      expect(mockGetHomeTimeline).toHaveBeenCalledWith(
        makeContext(family),
      );
      expect(
        screen.getByText(`status:${family}-status-1`),
      ).toBeTruthy();
    });
    expect(mockGetGroupTimeline).not.toHaveBeenCalled();
  });

  test("uses the Unfathomably group feed instead of substituting home posts", async () => {
    mockCurrentContext = makeContext("unfathomably");
    mockGetHomeTimeline.mockResolvedValue([makeStatus("pleroma")]);
    mockGetGroupTimeline.mockResolvedValue([
      makeStatus("unfathomably"),
    ]);
    const screen = await render(
      <UnfathomablyGroupFeedScreen
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await waitFor(() => {
      expect(mockGetGroupTimeline).toHaveBeenCalledWith(
        makeContext("unfathomably"),
      );
      expect(
        screen.getByText("status:unfathomably-status-1"),
      ).toBeTruthy();
    });
    expect(screen.queryByText("status:pleroma-status-1")).toBeNull();
    expect(mockGetHomeTimeline).not.toHaveBeenCalled();
  });

  test("shows a retry state when Pleroma does not provide the group extension", async () => {
    mockCurrentContext = makeContext("pleroma");
    mockGetGroupTimeline.mockRejectedValue(
      new Error("Group timelines are not available on this server."),
    );
    const screen = await render(
      <UnfathomablyGroupFeedScreen
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Group timelines are not available on this server.",
        ),
      ).toBeTruthy();
    });

    mockGetGroupTimeline.mockResolvedValue([
      makeStatus("unfathomably"),
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetGroupTimeline).toHaveBeenCalledTimes(2);
    });
  });

  test("requires a signed-in account before loading either feed", async () => {
    mockCurrentContext = undefined;
    const screen = await render(
      <UnfathomablyFeedScreen navigation={{ navigate: jest.fn() }} />,
    );

    expect(screen.getByText("Sign in to continue")).toBeTruthy();
    expect(mockGetHomeTimeline).not.toHaveBeenCalled();
    expect(mockGetGroupTimeline).not.toHaveBeenCalled();
  });
});

/* end of FediverseFeedScreens.test.tsx */
