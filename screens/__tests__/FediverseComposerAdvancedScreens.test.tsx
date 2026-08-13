/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseComposerAdvancedScreens.test.tsx

    Purpose:

        Verify advanced composer, draft, edit, schedule, and multi-account UI.

    Responsibilities:

        - Save and restore complete local drafts
        - Schedule through the standard status contract
        - Publish an ordinary post from multiple explicit accounts
        - Load source text and update an existing post
        - Reschedule and cancel pending server-side posts

    This file intentionally does NOT contain:

        - live server mutations
        - native date-picker rendering tests
        - Android screenshot assertions
*/

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import { Alert } from "react-native";
import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import ComposeStatusScreen from "../ComposeStatusScreen";
import ScheduledPostsScreen from "../ScheduledPostsScreen";
import {
  composeDrafts,
} from "../../services/ComposeDraftService";
import {
  makeAccount,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockCreateStatus = jest.fn();
const mockGetGroups = jest.fn();
const mockGetSavedAccounts = jest.fn();
const mockGetScheduledStatuses = jest.fn();
const mockGetStatus = jest.fn();
const mockGetStatusSource = jest.fn();
const mockUpdateScheduledStatus = jest.fn();
const mockCancelScheduledStatus = jest.fn();
const mockUpdateStatus = jest.fn();
const mockUploadMedia = jest.fn();
const mockUpdateMediaDescription = jest.fn();
let mockCurrentContext: LotideContext | undefined;

jest.mock("@react-native-community/datetimepicker", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return function MockDateTimePicker() {
    return React.createElement(View, { testID: "date-time-picker" });
  };
});

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const React = jest.requireActual("react");
  return {
    ...actual,
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(effect, [effect]);
    },
  };
});

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    onSecondaryTint: "#fff",
    onTint: "#fff",
    red: "#b00",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    secondaryTint: "#067",
    tertiaryBackground: "#ddd",
    text: "#111",
    tint: "#700",
  }),
}));

jest.mock("../../services/SavedAccountService", () => {
  const actual = jest.requireActual("../../services/SavedAccountService");
  return {
    ...actual,
    getSavedAuthenticatedAccounts: (...args: unknown[]) =>
      mockGetSavedAccounts(...args),
  };
});

jest.mock("../../services/UnfathomablyService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyService");
  return {
    ...actual,
    cancelScheduledStatus: (...args: unknown[]) =>
      mockCancelScheduledStatus(...args),
    createStatus: (...args: unknown[]) => mockCreateStatus(...args),
    getGroups: (...args: unknown[]) => mockGetGroups(...args),
    getScheduledStatuses: (...args: unknown[]) =>
      mockGetScheduledStatuses(...args),
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    getStatusSource: (...args: unknown[]) => mockGetStatusSource(...args),
    updateScheduledStatus: (...args: unknown[]) =>
      mockUpdateScheduledStatus(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    uploadMedia: (...args: unknown[]) => mockUploadMedia(...args),
    updateMediaDescription: (...args: unknown[]) => mockUpdateMediaDescription(...args),
  };
});

function savedAccount(family: "pleroma" | "unfathomably", active: boolean) {
  const context = makeContext(family);
  return {
    account: makeAccount(family),
    context,
    isActive: active,
    key: `alice@${context.apiUrl}`,
  };
}

describe("advanced Fediverse composer screens", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockCurrentContext = makeContext("unfathomably");
    mockGetGroups.mockResolvedValue([]);
    mockGetSavedAccounts.mockResolvedValue([
      savedAccount("unfathomably", true),
    ]);
    mockGetStatus.mockResolvedValue(makeStatus("unfathomably"));
    mockCreateStatus.mockResolvedValue(makeStatus("unfathomably", {
      id: "published-status",
    }));
    mockUpdateStatus.mockResolvedValue(makeStatus("unfathomably", {
      id: "edited-status",
    }));
    mockUploadMedia.mockResolvedValue({
      id: "uploaded-media",
      type: "image",
      url: "https://unfathomably.example/media/uploaded.jpg",
    });
    mockUpdateMediaDescription.mockResolvedValue(undefined);
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("saves a complete draft and restores it in a later composer", async () => {
    const navigation = { navigate: jest.fn(), setParams: jest.fn() };
    const screen = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{ params: { composeIntentId: "persistent-draft" } }}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Post text")).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText("Post text"), "Finish this later");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Content warning" }));
    await fireEvent.changeText(screen.getByLabelText("Content warning text"), "Spoiler");
    await fireEvent.changeText(screen.getByLabelText("Post language"), "fr");
    await fireEvent.press(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Draft saved",
        expect.any(String),
      );
    });
    await expect(
      composeDrafts.query(mockCurrentContext!, "persistent-draft"),
    ).resolves.toMatchObject({
      content: "Finish this later",
      contentWarning: "Spoiler",
      contentWarningEnabled: true,
      language: "fr",
    });

    await screen.unmount();
    const reopened = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{ params: { draftId: "persistent-draft" } }}
      />,
    );
    await waitFor(() => {
      expect(reopened.getByLabelText("Post text").props.value).toBe(
        "Finish this later",
      );
      expect(reopened.getByLabelText("Content warning text").props.value).toBe(
        "Spoiler",
      );
      expect(reopened.getByLabelText("Post language").props.value).toBe("fr");
    });
  });

  test("schedules a post and opens the scheduled-post manager", async () => {
    mockCreateStatus.mockResolvedValue({
      id: "schedule-1",
      media_attachments: [],
      params: { text: "Tomorrow" },
      scheduled_at: "2030-01-01T09:00:00.000Z",
    });
    const navigation = { navigate: jest.fn(), setParams: jest.fn() };
    const screen = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{ params: { composeIntentId: "schedule-draft" } }}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Post text")).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText("Post text"), "Tomorrow");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Schedule this post" }));
    await fireEvent.press(screen.getByRole("button", { name: "Tomorrow morning" }));
    await fireEvent.press(screen.getByRole("button", { name: "Schedule" }));

    await waitFor(() => {
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "Tomorrow",
        expect.objectContaining({
          idempotencyKey: "schedule-draft:alice@https://unfathomably.example",
          scheduledAt: expect.stringMatching(/Z$/),
        }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("ScheduledPosts");
    });
  });

  test("publishes a portable post from two explicitly selected accounts", async () => {
    const unfathomably = savedAccount("unfathomably", true);
    const pleroma = savedAccount("pleroma", false);
    mockGetSavedAccounts.mockResolvedValue([unfathomably, pleroma]);
    mockCreateStatus.mockImplementation(async (context: LotideContext) =>
      makeStatus(context.apiUrl?.includes("pleroma") ? "pleroma" : "unfathomably"),
    );
    const screen = await render(
      <ComposeStatusScreen
        navigation={{ navigate: jest.fn(), setParams: jest.fn() }}
        route={{ params: { composeIntentId: "cross-account" } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("checkbox", {
        name: "Add alice@pleroma.example on pleroma.example",
      })).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Add alice@pleroma.example on pleroma.example",
    }));
    await fireEvent.changeText(screen.getByLabelText("Post text"), "Both accounts");
    await fireEvent.press(screen.getByRole("button", {
      name: "Publish to 2 accounts",
    }));

    await waitFor(() => expect(mockCreateStatus).toHaveBeenCalledTimes(2));
    expect(mockCreateStatus.mock.calls.map(call => call[0].apiUrl)).toEqual([
      "https://unfathomably.example",
      "https://pleroma.example",
    ]);
    expect(mockCreateStatus.mock.calls.map(call => call[2].idempotencyKey)).toEqual([
      "cross-account:alice@https://unfathomably.example",
      "cross-account:alice@https://pleroma.example",
    ]);
  });

  test("uploads a media-only post with its image description", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{
        fileName: "diagram.png",
        mimeType: "image/png",
        type: "image",
        uri: "file:///private/diagram.png",
      }],
    });
    const navigation = { navigate: jest.fn(), setParams: jest.fn() };
    const screen = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{ params: { composeIntentId: "media-only" } }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Add image or video" })).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Add image or video" }));
    await waitFor(() => expect(screen.getByLabelText("Description for attachment 1")).toBeTruthy());
    await fireEvent.changeText(
      screen.getByLabelText("Description for attachment 1"),
      "A labelled architecture diagram",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(mockUploadMedia).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        {
          description: "A labelled architecture diagram",
          mimeType: "image/png",
          name: "diagram.png",
          uri: expect.stringMatching(/^file:\/\/\/documents\/hoot-compose-media\//),
        },
      );
      expect(mockCreateStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "",
        expect.objectContaining({ mediaIds: ["uploaded-media"] }),
      );
    });
  });

  test("loads source text and edits an existing post without rendered HTML", async () => {
    mockGetStatusSource.mockResolvedValue({
      id: "editable",
      spoiler_text: "Original warning",
      text: "Original source text",
    });
    mockGetStatus.mockResolvedValue(makeStatus("unfathomably", {
      id: "editable",
      media_attachments: [{
        description: "Original alt text",
        id: "media-1",
        type: "image",
        url: "https://unfathomably.example/media/1.jpg",
      }],
      sensitive: true,
    }));
    const navigation = { navigate: jest.fn(), replace: jest.fn() };
    const screen = await render(
      <ComposeStatusScreen
        navigation={navigation}
        route={{ params: { editStatusId: "editable" } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Post text").props.value).toBe(
        "Original source text",
      );
      expect(screen.getByLabelText("Content warning text").props.value).toBe(
        "Original warning",
      );
    });
    await fireEvent.changeText(screen.getByLabelText("Post text"), "Revised source");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "editable",
        "Revised source",
        expect.objectContaining({
          contentWarning: "Original warning",
          mediaIds: ["media-1"],
          sensitive: true,
        }),
      );
      expect(navigation.replace).toHaveBeenCalledWith("Status", {
        statusId: "edited-status",
      });
    });
  });

  test("reschedules and confirms cancellation of a pending post", async () => {
    const scheduled = {
      id: "scheduled-1",
      media_attachments: [],
      params: { text: "Pending post" },
      scheduled_at: "2030-01-01T09:00:00.000Z",
    };
    mockGetScheduledStatuses.mockResolvedValue([scheduled]);
    mockUpdateScheduledStatus.mockImplementation(
      async (_ctx: LotideContext, _id: string, scheduledAt: string) => ({
        ...scheduled,
        scheduled_at: scheduledAt,
      }),
    );
    mockCancelScheduledStatus.mockResolvedValue(scheduled);
    const screen = await render(<ScheduledPostsScreen />);

    await waitFor(() => expect(screen.getByText("Pending post")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", {
      name: "Change scheduled publication time",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Tomorrow evening" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save new time" }));

    await waitFor(() => {
      expect(mockUpdateScheduledStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "scheduled-1",
        expect.stringMatching(/Z$/),
      );
    });

    await fireEvent.press(screen.getByRole("button", { name: "Cancel scheduled post" }));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2];
    buttons[1].onPress();
    await waitFor(() => {
      expect(mockCancelScheduledStatus).toHaveBeenCalledWith(
        makeContext("unfathomably"),
        "scheduled-1",
      );
    });
  });
});

/* end of FediverseComposerAdvancedScreens.test.tsx */
