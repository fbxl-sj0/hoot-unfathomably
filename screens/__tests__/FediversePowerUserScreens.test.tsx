/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediversePowerUserScreens.test.tsx

    Purpose:

        Verify the complete user-facing workflows for advanced Fediverse tools.

    Responsibilities:

        - Exercise translation and native report navigation
        - Submit an explicit report with category and forwarding choices
        - Resolve and react to one post from multiple saved accounts
        - Save account-scoped notification delivery preferences
        - Create a list and an advanced content filter

    This file intentionally does NOT contain:

        - live server mutations
        - native image-picker behavior
        - service URL contract assertions
*/

import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import CrossAccountActionScreen from "../CrossAccountActionScreen";
import EditProfileScreen from "../EditProfileScreen";
import FilterEditorScreen from "../FilterEditorScreen";
import ListEditorScreen from "../ListEditorScreen";
import NotificationPreferencesScreen from "../NotificationPreferencesScreen";
import ReportScreen from "../ReportScreen";
import StatusActionsScreen from "../StatusActionsScreen";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../services/NotificationPoller";
import {
  makeAccount,
  makeContext,
  makeStatus,
} from "../../testing/fediverseFixtures";

const mockCreateFilter = jest.fn();
const mockCreateList = jest.fn();
const mockDispatch = jest.fn();
const mockFavourite = jest.fn();
const mockGetNotificationPreferences = jest.fn();
const mockGetSavedAccounts = jest.fn();
const mockGetStatus = jest.fn();
const mockReport = jest.fn();
const mockResolveSelectedAccounts = jest.fn();
const mockResolveStatus = jest.fn();
const mockSetNotificationPreferences = jest.fn();
const mockTranslate = jest.fn();
const mockUpdateProfile = jest.fn();
const mockStoreActiveContext = jest.fn();
const mockStoreSavedContext = jest.fn();
let mockCurrentContext: LotideContext | undefined;

jest.mock("../../hooks/useLotideCtx", () => ({
  useLotideCtx: () => mockCurrentContext,
}));

jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock("../../services/StorageService", () => ({
  accountStoreKeyForContext: (ctx: LotideContext) =>
    ctx.apiUrl && ctx.login?.user?.username
      ? `${ctx.login.user.username}@${ctx.apiUrl}`
      : undefined,
  lotideContext: { store: (...args: unknown[]) => mockStoreActiveContext(...args) },
  lotideContextKV: { store: (...args: unknown[]) => mockStoreSavedContext(...args) },
}));

jest.mock("../../services/UnfathomablyProfileService", () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

jest.mock("../../hooks/useTheme", () => ({
  __esModule: true,
  default: () => ({
    background: "#fff",
    onSecondaryTint: "#fff",
    onTint: "#fff",
    orange: "#b60",
    placeholderText: "#777",
    red: "#b00",
    secondaryBackground: "#eee",
    secondaryText: "#555",
    secondaryTint: "#067",
    tertiaryBackground: "#ddd",
    text: "#111",
    tint: "#700",
  }),
}));

jest.mock("../../services/UnfathomablySafetyService", () => ({
  reportAccountOrStatus: (...args: unknown[]) => mockReport(...args),
  translateStatus: (...args: unknown[]) => mockTranslate(...args),
}));

jest.mock("../../services/UnfathomablyService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyService");
  return {
    ...actual,
    favouriteStatus: (...args: unknown[]) => mockFavourite(...args),
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    resolveStatusByUrl: (...args: unknown[]) => mockResolveStatus(...args),
  };
});

jest.mock("../../services/SavedAccountService", () => ({
  getSavedAuthenticatedAccounts: (...args: unknown[]) => mockGetSavedAccounts(...args),
  resolveSelectedAccountContexts: (...args: unknown[]) => mockResolveSelectedAccounts(...args),
}));

jest.mock("../../services/NotificationPoller", () => {
  const actual = jest.requireActual("../../services/NotificationPoller");
  return {
    ...actual,
    getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
    setNotificationPreferences: (...args: unknown[]) => mockSetNotificationPreferences(...args),
  };
});

jest.mock("../../services/UnfathomablyListsService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyListsService");
  return {
    ...actual,
    createList: (...args: unknown[]) => mockCreateList(...args),
  };
});

jest.mock("../../services/UnfathomablyFiltersService", () => {
  const actual = jest.requireActual("../../services/UnfathomablyFiltersService");
  return {
    ...actual,
    createFilter: (...args: unknown[]) => mockCreateFilter(...args),
  };
});

function savedAccount(family: "mastodon" | "unfathomably", active: boolean) {
  const context = makeContext(family);
  return {
    account: makeAccount(family),
    context,
    isActive: active,
    key: `alice@${context.apiUrl}`,
  };
}

describe("Fediverse power-user screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentContext = makeContext("unfathomably");
    mockGetStatus.mockResolvedValue(makeStatus("unfathomably"));
    mockTranslate.mockResolvedValue({
      content: "<p>Texte traduit</p>",
      detectedSourceLanguage: "en",
      provider: "server translator",
    });
    mockReport.mockResolvedValue({ id: "report-1" });
    mockGetNotificationPreferences.mockResolvedValue(DEFAULT_NOTIFICATION_PREFERENCES);
    mockSetNotificationPreferences.mockImplementation((_ctx, value) => Promise.resolve(value));
    mockCreateList.mockResolvedValue({ id: "list-1", title: "Friends" });
    mockCreateFilter.mockResolvedValue({ id: "filter-1", title: "Spoilers" });
    mockFavourite.mockResolvedValue(makeStatus("mastodon", { favourited: true }));
    mockUpdateProfile.mockResolvedValue(makeAccount("unfathomably", {
      display_name: "Updated Alice",
    }));
    mockStoreActiveContext.mockResolvedValue(undefined);
    mockStoreSavedContext.mockResolvedValue(undefined);
    mockResolveStatus.mockImplementation((context: LotideContext) => Promise.resolve(
      makeStatus(context.apiUrl?.includes("mastodon") ? "mastodon" : "unfathomably"),
    ));
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("translates a post and opens editing, reporting, and cross-account actions", async () => {
    const navigation = { navigate: jest.fn() };
    const screen = await render(
      <StatusActionsScreen
        navigation={navigation as never}
        route={{ params: { statusId: "unfathomably-status-1" } } as never}
      />,
    );

    await waitFor(() => expect(screen.getByText("Translate")).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText("Translation target language"), "fr");
    await fireEvent.press(screen.getByRole("button", { name: "Translate post" }));
    await waitFor(() => expect(screen.getByText("Texte traduit")).toBeTruthy());
    expect(mockTranslate).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      "unfathomably-status-1",
      "fr",
    );

    await fireEvent.press(screen.getByRole("button", { name: "Edit this post" }));
    expect(navigation.navigate).toHaveBeenCalledWith(
      "Root",
      expect.objectContaining({
        params: expect.objectContaining({ editStatusId: "unfathomably-status-1" }),
        screen: "NewPostScreen",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Report this post" }));
    expect(navigation.navigate).toHaveBeenCalledWith("Report", expect.objectContaining({
      statusId: "unfathomably-status-1",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "React from another account" }));
    expect(navigation.navigate).toHaveBeenCalledWith("CrossAccountAction", {
      statusId: "unfathomably-status-1",
    });
  });

  test("submits a forwarded spam report only after confirmation", async () => {
    const navigation = { goBack: jest.fn() };
    const screen = await render(
      <ReportScreen
        navigation={navigation as never}
        route={{
          params: {
            accountId: "remote-account",
            accountLabel: "remote@example.test",
            statusId: "status-9",
          },
        } as never}
      />,
    );

    await fireEvent.press(screen.getByRole("radio", { name: "Spam" }));
    await fireEvent.changeText(screen.getByLabelText("Notes for moderators"), "Repeated unsolicited advertising");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Forward report to the remote server" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(mockReport).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      {
        accountId: "remote-account",
        category: "spam",
        comment: "Repeated unsolicited advertising",
        forward: true,
        statusIds: ["status-9"],
      },
    ));
  });

  test("resolves and reacts through each selected account's home server", async () => {
    const accounts = [
      savedAccount("unfathomably", true),
      savedAccount("mastodon", false),
    ];
    mockGetSavedAccounts.mockResolvedValue(accounts);
    mockResolveSelectedAccounts.mockImplementation((_ctx, keys: string[]) => Promise.resolve(
      accounts.filter(account => keys.includes(account.key)),
    ));
    const screen = await render(
      <CrossAccountActionScreen
        navigation={{} as never}
        route={{ params: { statusId: "unfathomably-status-1" } } as never}
      />,
    );

    await waitFor(() => expect(screen.getByText("Mastodon Alice")).toBeTruthy());
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Add alice@mastodon.example on mastodon.example",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Apply selected action" }));

    await waitFor(() => {
      expect(mockResolveStatus).toHaveBeenCalledTimes(2);
      expect(mockResolveStatus).toHaveBeenNthCalledWith(
        1,
        accounts[0].context,
        "https://unfathomably.example/objects/unfathomably-status-1",
      );
      expect(mockResolveStatus).toHaveBeenNthCalledWith(
        2,
        accounts[1].context,
        "https://unfathomably.example/objects/unfathomably-status-1",
      );
      expect(mockFavourite).toHaveBeenCalledTimes(2);
    });
  });

  test("saves category, digest, preview, sound, and quiet-hour preferences", async () => {
    const screen = await render(<NotificationPreferencesScreen />);
    await waitFor(() => expect(screen.getByText("Alert categories")).toBeTruthy());
    await waitFor(() => {
      expect(screen.getByLabelText("Local alerts for Reactions").props.disabled).toBe(false);
    });
    await fireEvent(screen.getByLabelText("Local alerts for Reactions"), "valueChange", false);
    await fireEvent.press(screen.getByRole("radio", { name: "One digest per check" }));
    await fireEvent(screen.getByLabelText("Play notification sound"), "valueChange", false);
    await fireEvent(screen.getByLabelText("Show post text in alerts"), "valueChange", false);
    await fireEvent(screen.getByLabelText("Defer alerts during quiet hours"), "valueChange", true);
    await fireEvent.changeText(screen.getByLabelText("Quiet hours start time"), "21:30");
    await fireEvent.changeText(screen.getByLabelText("Quiet hours end time"), "06:45");
    await fireEvent.press(screen.getByRole("button", { name: "Save notification preferences" }));

    await waitFor(() => expect(mockSetNotificationPreferences).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      expect.objectContaining({
        categories: expect.objectContaining({ reactions: false }),
        deliveryMode: "digest",
        quietHoursEnabled: true,
        quietHoursEnd: "06:45",
        quietHoursStart: "21:30",
        showPostPreview: false,
        sound: false,
      }),
    ));
  });

  test("creates a standard list with advanced reply and exclusivity settings", async () => {
    const navigation = { goBack: jest.fn() };
    const screen = await render(
      <ListEditorScreen navigation={navigation} route={{}} />,
    );
    await fireEvent.changeText(screen.getByLabelText("List name"), "Friends");
    await fireEvent.press(screen.getByRole("radio", { name: "Followed by you" }));
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Keep accounts in this list out of the home timeline",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Create list" }));

    await waitFor(() => expect(mockCreateList).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      { exclusive: true, repliesPolicy: "followed", title: "Friends" },
    ));
  });

  test("creates a multi-keyword whole-word hide filter", async () => {
    const navigation = { goBack: jest.fn() };
    const screen = await render(
      <FilterEditorScreen navigation={navigation} route={{}} />,
    );
    await fireEvent.changeText(screen.getByLabelText("Filter name"), "Book spoilers");
    await fireEvent.press(screen.getByRole("radio", { name: "Hide the post" }));
    await fireEvent.changeText(screen.getByLabelText("Filter keyword 1"), "spoiler");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Match keyword 1 as a whole word" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add another keyword" }));
    await fireEvent.changeText(screen.getByLabelText("Filter keyword 2"), "ending");
    await fireEvent.press(screen.getByRole("button", { name: "Create filter" }));

    await waitFor(() => expect(mockCreateFilter).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      expect.objectContaining({
        action: "hide",
        keywords: [
          { keyword: "spoiler", wholeWord: true },
          { keyword: "ending", wholeWord: false },
        ],
        title: "Book spoilers",
      }),
    ));
  });

  test("updates profile text, metadata, and privacy flags then refreshes local state", async () => {
    const navigation = { goBack: jest.fn() };
    const screen = await render(
      <EditProfileScreen navigation={navigation as never} route={{} as never} />,
    );
    await fireEvent.changeText(screen.getByLabelText("Display name"), "Updated Alice");
    await fireEvent.changeText(screen.getByLabelText("Profile bio"), "A clearer biography");
    await fireEvent.changeText(screen.getByLabelText("Profile field 1 name"), "Website");
    await fireEvent.changeText(screen.getByLabelText("Profile field 1 value"), "https://alice.example");
    await fireEvent(screen.getByLabelText("Manually approve followers"), "valueChange", true);
    await fireEvent(screen.getByLabelText("This is an automated account"), "valueChange", true);
    await fireEvent(screen.getByLabelText("Suggest this profile to others"), "valueChange", false);
    await fireEvent.press(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith(
      makeContext("unfathomably"),
      expect.objectContaining({
        bot: true,
        discoverable: false,
        displayName: "Updated Alice",
        fields: [{ name: "Website", value: "https://alice.example" }],
        locked: true,
        note: "A clearer biography",
      }),
    ));
    expect(mockStoreActiveContext).toHaveBeenCalledWith(expect.objectContaining({
      login: expect.objectContaining({
        user: expect.objectContaining({ display_name: "Updated Alice" }),
      }),
    }));
    expect(mockStoreSavedContext).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });
});

/* end of FediversePowerUserScreens.test.tsx */
