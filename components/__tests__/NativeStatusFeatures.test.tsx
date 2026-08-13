/*
    Project: Hoot Unfathomably
    --------------------------

    File: NativeStatusFeatures.test.tsx

    Purpose:

        Verify native metadata, polls, and rich media on status cards.

    Responsibilities:

        - Present the latest Unfathomably native status envelope
        - Submit valid poll choices through the local server context
        - Route audio and video attachments to the guarded media viewer

    This file intentionally does NOT contain:

        - live voting or media playback
        - provider discovery
        - ordinary degraded status coverage
*/

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { openURL } from "expo-linking";

import StatusCard from "../StatusCard";
import * as UnfathomablyService from "../../services/UnfathomablyService";
import {
  makeContext,
  makeNativeStatus,
} from "../../testing/fediverseFixtures";

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    tertiaryBackground: "#ddd",
    text: "#111",
    tint: "#d87900",
  }),
}));

jest.mock("../../services/UnfathomablyService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyService");
  return {
    __esModule: true,
    ...actual,
    setEventJoined: jest.fn(),
    voteOnPoll: jest.fn(),
  };
});

const mockVoteOnPoll = UnfathomablyService.voteOnPoll as jest.MockedFunction<
  typeof UnfathomablyService.voteOnPoll
>;
const mockSetEventJoined = UnfathomablyService.setEventJoined as jest.MockedFunction<
  typeof UnfathomablyService.setEventJoined
>;

describe("native status features", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders native facts and opens the authoritative object", async () => {
    const screen = await render(
      <StatusCard
        ctx={makeContext("unfathomably")}
        navigation={{ navigate: jest.fn() }}
        status={makeNativeStatus()}
      />,
    );

    expect(screen.getByText("Photography")).toBeTruthy();
    expect(screen.getByText("Summer shoreline")).toBeTruthy();
    expect(screen.getByText("CC BY-SA 4.0")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("link", { name: "Open original resource" }),
      { stopPropagation: jest.fn() },
    );
    await waitFor(() => {
      expect(openURL).toHaveBeenCalledWith(
        "https://unfathomably.example/objects/photo-1",
      );
    });
  });

  test("submits a multiple-choice poll and displays returned results", async () => {
    mockVoteOnPoll.mockResolvedValue({
      expired: false,
      id: "poll-1",
      multiple: true,
      options: [
        { title: "Monday", votes_count: 3 },
        { title: "Friday", votes_count: 1 },
      ],
      own_votes: [0, 1],
      voted: true,
      voters_count: 3,
      votes_count: 4,
    });
    const status = makeNativeStatus({
      poll: {
        expired: false,
        id: "poll-1",
        multiple: true,
        options: [{ title: "Monday" }, { title: "Friday" }],
        voted: false,
        votes_count: 0,
      },
    });
    const screen = await render(
      <StatusCard
        ctx={makeContext("unfathomably")}
        navigation={{ navigate: jest.fn() }}
        status={status}
      />,
    );

    await fireEvent.press(screen.getByRole("checkbox", { name: "Monday" }), {
      stopPropagation: jest.fn(),
    });
    await fireEvent.press(screen.getByRole("checkbox", { name: "Friday" }), {
      stopPropagation: jest.fn(),
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Submit poll vote" }),
      { stopPropagation: jest.fn() },
    );

    await waitFor(() => {
      expect(mockVoteOnPoll).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "poll-1",
        [0, 1],
      );
      expect(screen.getByText("75%")).toBeTruthy();
      expect(screen.getByText("25%")).toBeTruthy();
    });
  });

  test("opens a video attachment in the guarded media viewer", async () => {
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <StatusCard
        ctx={makeContext("unfathomably")}
        navigation={navigation}
        status={makeNativeStatus({
          media_attachments: [{
            description: "Release demonstration",
            id: "video-1",
            preview_url: "https://unfathomably.example/media/video.jpg",
            type: "video",
            url: "https://unfathomably.example/media/video.mp4",
          }],
        })}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Open video" }), {
      stopPropagation: jest.fn(),
    });
    expect(navigation.navigate).toHaveBeenCalledWith("MediaViewer", {
      description: "Release demonstration",
      posterUri: "https://unfathomably.example/media/video.jpg",
      type: "video",
      uri: "https://unfathomably.example/media/video.mp4",
    });
  });

  test("joins an event only after an explicit user action", async () => {
    const event = {
      end_time: "2026-09-10T21:00:00.000Z",
      join_mode: "free" as const,
      join_state: null,
      location: { locality: "Toronto", name: "Community hall" },
      name: "Federation meetup",
      participants_count: 12,
      start_time: "2026-09-10T19:00:00.000Z",
    };
    mockSetEventJoined.mockResolvedValue(
      makeNativeStatus({
        pleroma: {
          event: { ...event, join_state: "accept" },
          native: makeNativeStatus().pleroma?.native,
        },
      }),
    );
    const status = makeNativeStatus({
      id: "event-status",
      pleroma: {
        event,
        native: makeNativeStatus().pleroma?.native,
      },
    });
    const screen = await render(
      <StatusCard
        ctx={makeContext("unfathomably")}
        navigation={{ navigate: jest.fn() }}
        status={status}
      />,
    );

    expect(screen.getByText("Federation meetup")).toBeTruthy();
    expect(screen.getByText(/12 participants/)).toBeTruthy();
    expect(mockSetEventJoined).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: "Join event" }),
      { stopPropagation: jest.fn() },
    );
    await waitFor(() => {
      expect(mockSetEventJoined).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "event-status",
        true,
      );
      expect(screen.getByRole("button", { name: "Leave event" })).toBeTruthy();
    });
  });
});

/* end of NativeStatusFeatures.test.tsx */
