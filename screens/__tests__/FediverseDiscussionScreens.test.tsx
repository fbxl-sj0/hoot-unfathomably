/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseDiscussionScreens.test.tsx

    Purpose:

        Verify composing and reading discussions with Mastodon-compatible
        status contracts and Unfathomably/Rebased extensions.

    Responsibilities:

        - Publish Pleroma-compatible replies
        - Publish Rebased quote reposts
        - Publish Unfathomably group posts
        - Load status ancestors and descendants

    This file intentionally does NOT contain:

        - Deprecated comment-tree fixtures
        - Live publishing
*/

import * as React from "react";
import { Alert } from "react-native";
import {
  act,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import ComposeStatusScreen from "../ComposeStatusScreen";
import StatusThreadScreen from "../StatusThreadScreen";
import {
  makeContext,
  makeGroup,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockCreateStatus = jest.fn();
const mockGetGroups = jest.fn();
const mockGetStatus = jest.fn();
const mockGetStatusAncestors = jest.fn();
const mockGetStatusContextWindow = jest.fn();
const mockGetStatusDescendants = jest.fn();
let mockCurrentContext: LotideContext | undefined;

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    text: "#111",
    tint: "#d87900",
  }),
}));

jest.mock("../../services/UnfathomablyService", () => ({
  createStatus: (...args: unknown[]) => mockCreateStatus(...args),
  getGroups: (...args: unknown[]) => mockGetGroups(...args),
  getStatus: (...args: unknown[]) => mockGetStatus(...args),
  getStatusAncestors: (...args: unknown[]) =>
    mockGetStatusAncestors(...args),
  getStatusContextWindow: (...args: unknown[]) =>
    mockGetStatusContextWindow(...args),
  getStatusDescendants: (...args: unknown[]) =>
    mockGetStatusDescendants(...args),
}));

jest.mock("../../components/StatusCard", () => {
  const actual = jest.requireActual("../../components/StatusCard");
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");

  return {
    __esModule: true,
    ...actual,
    default: function MockStatusCard({
      compact,
      status,
    }: {
      compact?: boolean;
      status: { id: string };
    }) {
      return React.createElement(
        Text,
        null,
        `${compact ? "compact" : "status"}:${status.id}`,
      );
    },
  };
});

describe("Fediverse discussion screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCurrentContext = makeContext("unfathomably");
    mockGetGroups.mockResolvedValue([]);
    mockGetStatus.mockResolvedValue(makeStatus("unfathomably"));
    mockGetStatusContextWindow.mockResolvedValue({
      ancestors: [],
      descendants: [],
      hasMoreAncestors: false,
      hasMoreDescendants: false,
      mode: "paged",
    });
    mockGetStatusAncestors.mockResolvedValue({
      statuses: [],
      hasMore: false,
    });
    mockGetStatusDescendants.mockResolvedValue({
      statuses: [],
      hasMore: false,
    });
    mockCreateStatus.mockResolvedValue(makeStatus("unfathomably"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("publishes a Pleroma-compatible reply with the selected server context", async () => {
    mockCurrentContext = makeContext("pleroma");
    const target = makeStatus("pleroma");
    const created = makeStatus("pleroma", { id: "pleroma-reply-2" });
    mockGetStatus.mockResolvedValue(target);
    mockCreateStatus.mockResolvedValue(created);
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{ params: { inReplyToId: target.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Pleroma Alice")).toBeTruthy();
      expect(screen.getByText("Hello from Pleroma.")).toBeTruthy();
    });
    await fireEvent.changeText(
      screen.getByPlaceholderText("Write a reply"),
      " A compatible reply ",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Reply" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("pleroma"),
        "A compatible reply",
        {
          contentWarning: undefined,
          groupId: undefined,
          inReplyToId: target.id,
          poll: undefined,
          quoteId: undefined,
          sensitive: false,
          visibility: "public",
        },
      );
      expect(navigation.navigate).toHaveBeenCalledWith("Status", {
        statusId: "pleroma-reply-2",
      });
    });
  });

  test("publishes a Rebased quote repost with a selected group", async () => {
    mockCurrentContext = makeContext("rebased");
    const target = makeStatus("rebased");
    const group = makeGroup("rebased");
    mockGetStatus.mockResolvedValue(target);
    mockGetGroups.mockResolvedValue([group]);
    mockCreateStatus.mockResolvedValue(
      makeStatus("rebased", { id: "rebased-quote-2" }),
    );
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { quoteId: target.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(group.display_name)).toBeTruthy();
      expect(screen.getByText("Hello from Rebased.")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText(group.display_name));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Add your thoughts"),
      "Worth sharing",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Publish quote" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("rebased"),
        "Worth sharing",
        {
          contentWarning: undefined,
          groupId: group.id,
          inReplyToId: undefined,
          poll: undefined,
          quoteId: target.id,
          sensitive: false,
          visibility: "unlisted",
        },
      );
    });
  });

  test("publishes directly into an Unfathomably group", async () => {
    const group = makeGroup("unfathomably");
    mockGetGroups.mockResolvedValue([group]);
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn() }}
        route={{
          params: {
            groupId: group.id,
            groupName: group.display_name,
          },
        }}
      />,
    );

    expect(screen.getByText("New group post")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByPlaceholderText("What's happening?"),
      "Group release notes",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Publish" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "Group release notes",
        {
          contentWarning: undefined,
          groupId: group.id,
          inReplyToId: undefined,
          poll: undefined,
          quoteId: undefined,
          sensitive: false,
          visibility: "unlisted",
        },
      );
    });
  });

  test("publishes an Unfathomably poll with visibility and a content warning", async () => {
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn(), setParams: jest.fn() }}
        route={{ params: { composeIntentId: "poll-intent" } }}
      />,
    );

    await fireEvent.press(screen.getByRole("checkbox", { name: "Poll" }));
    await fireEvent.press(
      screen.getByRole("checkbox", { name: "Content warning" }),
    );
    await fireEvent.press(
      screen.getByRole("checkbox", { name: "Sensitive media" }),
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Followers" }));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Brief content warning"),
      "Release planning",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("What's happening?"),
      "Which day works?",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Poll option 1"),
      "Monday",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Poll option 2"),
      "Friday",
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "Choose several" }),
    );
    await fireEvent.press(screen.getByRole("radio", { name: "7 days" }));
    await fireEvent.press(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "Which day works?",
        {
          contentWarning: "Release planning",
          groupId: undefined,
          inReplyToId: undefined,
          poll: {
            expiresIn: 604_800,
            multiple: true,
            options: ["Monday", "Friday"],
          },
          quoteId: undefined,
          sensitive: true,
          visibility: "private",
        },
      );
    });
  });

  test("does not carry a community into a later ordinary reply", async () => {
    const group = makeGroup("unfathomably");
    const replyTarget = makeStatus("unfathomably", {
      group: null,
      id: "ordinary-parent",
    });
    mockGetGroups.mockResolvedValue([group]);
    mockGetStatus.mockResolvedValue(replyTarget);
    mockCreateStatus
      .mockResolvedValueOnce(
        makeStatus("unfathomably", { id: "created-group-post" }),
      )
      .mockResolvedValueOnce(
        makeStatus("unfathomably", { id: "created-reply" }),
      );
    const navigation = {
      navigate: jest.fn(),
      setParams: jest.fn(),
    };
    const screen = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{
          params: {
            composeIntentId: "group-post-intent",
            groupId: group.id,
            groupName: group.display_name,
          },
        }}
      />,
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText("What's happening?"),
      "A community post",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Publish" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenNthCalledWith(
        1,
        makeContext("unfathomably"),
        "A community post",
        {
          contentWarning: undefined,
          groupId: group.id,
          inReplyToId: undefined,
          poll: undefined,
          quoteId: undefined,
          sensitive: false,
          visibility: "unlisted",
        },
      );
      expect(navigation.setParams).toHaveBeenCalledWith({
        composeIntentId: undefined,
        groupId: undefined,
        groupName: undefined,
        inReplyToId: undefined,
        quoteId: undefined,
      });
    });

    await act(async () => {
      screen.rerender(
        <ComposeStatusScreen
          navigation={navigation}
          route={{
            params: {
              composeIntentId: "ordinary-reply-intent",
              inReplyToId: replyTarget.id,
            },
          }}
        />,
      );
    });

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Write a reply").props.value,
      ).toBe("");
    });
    await fireEvent.changeText(
      screen.getByPlaceholderText("Write a reply"),
      "An ordinary reply",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Reply" }),
    );

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenNthCalledWith(
        2,
        makeContext("unfathomably"),
        "An ordinary reply",
        {
          contentWarning: undefined,
          groupId: undefined,
          inReplyToId: replyTarget.id,
          poll: undefined,
          quoteId: undefined,
          sensitive: false,
          visibility: "public",
        },
      );
    });
  });

  test("starts a fresh direct-post intent without an old draft or group", async () => {
    const group = makeGroup("unfathomably");
    mockGetGroups.mockResolvedValue([group]);
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { composeIntentId: "direct-post-1" } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(group.display_name)).toBeTruthy();
    });
    await fireEvent.press(screen.getByText(group.display_name));
    await fireEvent.changeText(
      screen.getByPlaceholderText("What's happening?"),
      "Abandoned group draft",
    );

    await act(async () => {
      screen.rerender(
        <ComposeStatusScreen
          navigation={{ navigate: jest.fn() }}
          route={{ params: { composeIntentId: "direct-post-2" } }}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("New post")).toBeTruthy();
      expect(
        screen.getByPlaceholderText("What's happening?").props.value,
      ).toBe("");
    });
  });

  test("ignores a stale parent request after the compose target changes", async () => {
    let resolveFirstTarget: (
      status: ReturnType<typeof makeStatus>,
    ) => void = () => undefined;
    const firstTargetRequest = new Promise<ReturnType<typeof makeStatus>>(
      resolve => { resolveFirstTarget = resolve; },
    );
    const firstTarget = makeStatus("rebased", {
      content: "<p>Old target</p>",
      id: "old-target",
    });
    const secondTarget = makeStatus("rebased", {
      content: "<p>Current target</p>",
      id: "current-target",
    });
    mockCurrentContext = makeContext("rebased");
    mockGetStatus
      .mockReturnValueOnce(firstTargetRequest)
      .mockResolvedValueOnce(secondTarget);
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn() }}
        route={{
          params: {
            composeIntentId: "old-reply-intent",
            inReplyToId: firstTarget.id,
          },
        }}
      />,
    );

    await act(async () => {
      screen.rerender(
        <ComposeStatusScreen
          navigation={{ navigate: jest.fn() }}
          route={{
            params: {
              composeIntentId: "current-reply-intent",
              inReplyToId: secondTarget.id,
            },
          }}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Current target")).toBeTruthy();
    });
    await act(async () => {
      resolveFirstTarget(firstTarget);
      await firstTargetRequest;
    });

    expect(screen.queryByText("Old target")).toBeNull();
    expect(screen.getByText("Current target")).toBeTruthy();
  });

  test("loads a Rebased thread with ancestors and descendants", async () => {
    mockCurrentContext = makeContext("rebased");
    const current = makeStatus("rebased", { id: "current-status" });
    const ancestor = makeStatus("rebased", { id: "ancestor-status" });
    const descendant = makeStatus("rebased", {
      id: "descendant-status",
    });
    mockGetStatus.mockResolvedValue(current);
    mockGetStatusContextWindow.mockResolvedValue({
      ancestors: [ancestor],
      descendants: [descendant],
      hasMoreAncestors: false,
      hasMoreDescendants: false,
      mode: "paged",
    });
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <StatusThreadScreen
        navigation={navigation}
        route={{ params: { statusId: current.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("compact:ancestor-status")).toBeTruthy();
      expect(screen.getByText("status:current-status")).toBeTruthy();
      expect(screen.getByText("status:descendant-status")).toBeTruthy();
    });
    expect(mockGetStatus).toHaveBeenCalledWith(
      makeContext("rebased"),
      current.id,
    );
    expect(mockGetStatusContextWindow).toHaveBeenCalledWith(
      makeContext("rebased"),
      current.id,
    );

    await fireEvent.press(screen.getByText(/Reply/));
    expect(navigation.navigate).toHaveBeenCalledWith("Root", {
      screen: "NewPostScreen",
      params: {
        composeIntentId: expect.any(String),
        groupId: undefined,
        groupName: undefined,
        inReplyToId: current.id,
        quoteId: undefined,
      },
    });
  });

  test("shows the selected post while a very large context is still loading", async () => {
    const current = makeStatus("unfathomably", {
      id: "notification-status",
    });
    let resolveContext:
      | ((value: {
          ancestors: ReturnType<typeof makeStatus>[];
          descendants: ReturnType<typeof makeStatus>[];
          hasMoreAncestors: boolean;
          hasMoreDescendants: boolean;
          mode: "paged" | "legacy";
        }) => void)
      | undefined;
    mockGetStatus.mockResolvedValue(current);
    mockGetStatusContextWindow.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveContext = resolve;
        }),
    );
    const screen = await render(
      <StatusThreadScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { statusId: current.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("status:notification-status")).toBeTruthy();
      expect(
        screen.getByText("Loading the rest of this discussion…"),
      ).toBeTruthy();
    });

    await act(async () => {
      resolveContext?.({
        ancestors: [],
        descendants: [],
        hasMoreAncestors: false,
        hasMoreDescendants: false,
        mode: "paged",
      });
      await Promise.resolve();
    });
  });

  test("keeps the selected post usable when context loading fails", async () => {
    const current = makeStatus("pleroma", {
      id: "large-thread-status",
    });
    mockGetStatus.mockResolvedValue(current);
    mockGetStatusContextWindow.mockRejectedValue(
      new Error(
        "The Unfathomably server did not respond within 120 seconds.",
      ),
    );
    const screen = await render(
      <StatusThreadScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { statusId: current.id } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("status:large-thread-status")).toBeTruthy();
      expect(
        screen.getByText(
          /Could not load the rest of this discussion/,
        ),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });
  });

  test("bounds the retained statuses in an exceptionally large thread", async () => {
    const current = makeStatus("unfathomably", {
      id: "large-context-status",
    });
    const ancestors = Array.from({ length: 120 }, (_value, index) =>
      makeStatus("unfathomably", { id: `ancestor-${index}` }),
    );
    const descendants = Array.from({ length: 260 }, (_value, index) =>
      makeStatus("unfathomably", { id: `descendant-${index}` }),
    );
    mockGetStatus.mockResolvedValue(current);
    mockGetStatusContextWindow.mockResolvedValue({
      ancestors,
      descendants,
      hasMoreAncestors: false,
      hasMoreDescendants: false,
      mode: "legacy",
    });
    const screen = await render(
      <StatusThreadScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { statusId: current.id } }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Earlier in this discussion (showing 100 of 120)",
        ),
      ).toBeTruthy();
      expect(
        screen.getByText("Showing 250 of 260 replies."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("compact:ancestor-19")).toBeNull();
    expect(screen.getByText("compact:ancestor-20")).toBeTruthy();
    expect(screen.getByText("status:descendant-249")).toBeTruthy();
    expect(screen.queryByText("status:descendant-250")).toBeNull();
  });

  test("loads older and newer thread pages only when requested", async () => {
    const current = makeStatus("unfathomably", {
      id: "paged-current",
    });
    const nearAncestor = makeStatus("unfathomably", {
      id: "near-ancestor",
    });
    const olderAncestor = makeStatus("unfathomably", {
      id: "older-ancestor",
    });
    const firstReply = makeStatus("unfathomably", {
      id: "first-reply",
    });
    const laterReply = makeStatus("unfathomably", {
      id: "later-reply",
    });
    mockGetStatus.mockResolvedValue(current);
    mockGetStatusContextWindow.mockResolvedValue({
      ancestors: [nearAncestor],
      descendants: [firstReply],
      hasMoreAncestors: true,
      hasMoreDescendants: true,
      mode: "paged",
    });
    mockGetStatusAncestors.mockResolvedValue({
      statuses: [olderAncestor],
      hasMore: false,
    });
    mockGetStatusDescendants.mockResolvedValue({
      statuses: [laterReply],
      hasMore: false,
    });
    const screen = await render(
      <StatusThreadScreen
        navigation={{ navigate: jest.fn() }}
        route={{ params: { statusId: current.id } }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Load earlier posts" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Load more replies" }),
      ).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Load earlier posts" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Load more replies" }),
    );

    await waitFor(() => {
      expect(screen.getByText("compact:older-ancestor")).toBeTruthy();
      expect(screen.getByText("status:later-reply")).toBeTruthy();
    });
    expect(mockGetStatusAncestors).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      current.id,
      nearAncestor.id,
    );
    expect(mockGetStatusDescendants).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      current.id,
      firstReply.id,
    );
    expect(
      screen.queryByRole("button", { name: "Load earlier posts" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Load more replies" }),
    ).toBeNull();
  });
});

/* end of FediverseDiscussionScreens.test.tsx */
