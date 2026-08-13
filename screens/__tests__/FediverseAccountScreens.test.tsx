/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseAccountScreens.test.tsx

    Purpose:

        Verify notifications and the signed-in profile against current
        Fediverse account and status contracts.

    Responsibilities:

        - Render Pleroma/Rebased/Unfathomably notification types
        - Paginate notifications with Mastodon cursors
        - Load account statuses from the selected host
        - Remove the active account safely on logout

    This file intentionally does NOT contain:

        - Deprecated notification variants
        - Live account data
*/

import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import UnfathomablyNotificationsScreen from "../UnfathomablyNotificationsScreen";
import UnfathomablyProfileScreen from "../UnfathomablyProfileScreen";
import {
  makeContext,
  makeNotification,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockDispatch = jest.fn();
const mockGetAccountStatuses = jest.fn();
const mockGetNotifications = jest.fn();
const mockLogout = jest.fn();
const mockRemoveActiveContext = jest.fn();
const mockUseStream = jest.fn();
let mockCurrentContext: LotideContext | undefined;

jest.mock("@react-navigation/native", () => {
  const React = jest.requireActual("react");

  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(effect, [effect]);
    },
  };
});

jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../hooks/useUnfathomablyStream", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseStream(...args),
}));

jest.mock("../../services/StorageService", () => ({
  lotideContext: {
    remove: (...args: unknown[]) => mockRemoveActiveContext(...args),
  },
  lotideContextKV: {
    logout: (...args: unknown[]) => mockLogout(...args),
  },
}));

jest.mock("../../services/UnfathomablyService", () => ({
  getAccountStatuses: (...args: unknown[]) =>
    mockGetAccountStatuses(...args),
  getNotifications: (...args: unknown[]) =>
    mockGetNotifications(...args),
}));

jest.mock("../../components/StatusCard", () => {
  const actual = jest.requireActual("../../components/StatusCard");
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");

  return {
    __esModule: true,
    ...actual,
    default: function MockStatusCard({
      status,
    }: {
      status: { id: string };
    }) {
      return React.createElement(Text, null, `status:${status.id}`);
    },
  };
});

describe("Fediverse account screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentContext = makeContext("unfathomably");
    mockGetAccountStatuses.mockResolvedValue([]);
    mockGetNotifications.mockResolvedValue([]);
    mockLogout.mockResolvedValue(undefined);
    mockRemoveActiveContext.mockResolvedValue(undefined);
  });

  test.each([
    ["Akkoma", "akkoma", "pleroma:emoji_reaction", "reacted to your post"],
    ["Mastodon", "mastodon", "follow", "followed you"],
    ["Unfathomably", "unfathomably", "favourite", "favourited your post"],
    ["Rebased", "rebased", "reblog", "boosted your post"],
    ["Pleroma", "pleroma", "mention", "mentioned you"],
  ] as const)(
    "renders a %s notification",
    async (_label, family, type, actionLabel) => {
      mockCurrentContext = makeContext(family);
      const notification = makeNotification(family, { type });
      mockGetNotifications.mockResolvedValue([notification]);
      const navigation = { navigate: jest.fn() };
      const screen = await render(
        <UnfathomablyNotificationsScreen navigation={navigation} />,
      );

      await waitFor(() => {
        expect(screen.getByText(new RegExp(actionLabel))).toBeTruthy();
        expect(
          screen.getByText(`Hello from ${_label}.`),
        ).toBeTruthy();
      });
      expect(mockGetNotifications).toHaveBeenCalledWith(
        makeContext(family),
      );
      expect(mockUseStream).toHaveBeenCalledWith(
        makeContext(family),
        { stream: "user:notification" },
        expect.objectContaining({ onEvent: expect.any(Function) }),
      );

      await fireEvent.press(
        screen.getByText(new RegExp(actionLabel)),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("Status", {
        statusId: `${family}-status-1`,
      });
    },
  );

  test("paginates Pleroma notifications without duplicating existing items", async () => {
    mockCurrentContext = makeContext("pleroma");
    const first = makeNotification("pleroma", { id: "notice-1" });
    const duplicate = makeNotification("pleroma", { id: "notice-1" });
    const second = makeNotification("pleroma", { id: "notice-2" });
    mockGetNotifications
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([duplicate, second]);
    const screen = await render(
      <UnfathomablyNotificationsScreen
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(1);
    });
    await fireEvent(
      screen.getByTestId("fediverse-notifications-list"),
      "endReached",
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenLastCalledWith(
        makeContext("pleroma"),
        "notice-1",
      );
      expect(mockGetNotifications).toHaveBeenCalledTimes(2);
    });
  });

  test.each([
    ["Akkoma", "akkoma"],
    ["Mastodon", "mastodon"],
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)("loads the signed-in %s profile", async (_label, family) => {
    mockCurrentContext = makeContext(family);
    mockGetAccountStatuses.mockResolvedValue([makeStatus(family)]);
    const screen = await render(
      <UnfathomablyProfileScreen
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(`${_label} Alice`)).toBeTruthy();
      expect(
        screen.getByText(`Testing ${_label} compatibility.`),
      ).toBeTruthy();
      expect(
        screen.getByText(`status:${family}-status-1`),
      ).toBeTruthy();
    });
    expect(mockGetAccountStatuses).toHaveBeenCalledWith(
      makeContext(family),
      `${family}-account-1`,
    );
    expect(mockUseStream).toHaveBeenCalledWith(
      makeContext(family),
      { stream: "user" },
      expect.objectContaining({ onCatchUp: expect.any(Function) }),
    );
  });

  test("logs out only the active Unfathomably account", async () => {
    mockCurrentContext = makeContext("unfathomably");
    mockGetAccountStatuses.mockResolvedValue([
      makeStatus("unfathomably", { id: "logout-profile-status" }),
    ]);
    const screen = await render(
      <UnfathomablyProfileScreen
        navigation={{ navigate: jest.fn() }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("status:logout-profile-status")).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Log out" }),
    );

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledWith(
        makeContext("unfathomably"),
      );
      expect(mockRemoveActiveContext).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lotide/setCtx",
          payload: {},
        }),
      );
    });
  });
});

/* end of FediverseAccountScreens.test.tsx */
