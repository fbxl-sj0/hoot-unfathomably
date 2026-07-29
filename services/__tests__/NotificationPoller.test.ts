/*
    Project: Hoot Unfathomably
    --------------------------

    Validate Mastodon-compatible notification polling, migration, local
    delivery, diagnostics, and notification-tap routing.
*/

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import * as UnfathomablyService from "../UnfathomablyService";
import {
  FEDIVERSE_SERVERS,
  makeAccount,
  makeContext,
  makeNotification,
} from "../../testing/fediverseFixtures";
import {
  clearLastNotificationResponse,
  getLastNotificationNavigationTarget,
  getNotificationDiagnostics,
  getNotificationEnabled,
  getNotificationOnboardingPrompted,
  getNotificationNavigationTarget,
  getNotificationNavigationTargetFromResponse,
  markNotificationOnboardingPrompted,
  pollNotificationsNow,
  sendTestNotification,
  setNotificationEnabled,
} from "../NotificationPoller";

const mockStoredContextQuery = jest.fn();

jest.mock("../StorageService", () => ({
  __esModule: true,
  lotideContext: {
    query: (...args: unknown[]) => mockStoredContextQuery(...args),
  },
}));

jest.mock("../UnfathomablyService", () => ({
  __esModule: true,
  getNotifications: jest.fn(),
}));

const mockGetNotifications =
  UnfathomablyService.getNotifications as jest.Mock;
const mockGetBackgroundTaskStatus =
  BackgroundTask.getStatusAsync as jest.Mock;
const mockRegisterTask = BackgroundTask.registerTaskAsync as jest.Mock;
const mockUnregisterTask = BackgroundTask.unregisterTaskAsync as jest.Mock;
const mockIsTaskRegistered =
  TaskManager.isTaskRegisteredAsync as jest.Mock;
const mockScheduleNotification =
  Notifications.scheduleNotificationAsync as jest.Mock;
const mockSetNotificationChannel =
  Notifications.setNotificationChannelAsync as jest.Mock;
const mockDeleteNotificationChannel =
  Notifications.deleteNotificationChannelAsync as jest.Mock;
const mockGetNotificationPermissions =
  Notifications.getPermissionsAsync as jest.Mock;
const mockRequestNotificationPermissions =
  Notifications.requestPermissionsAsync as jest.Mock;
const mockGetLastNotificationResponse =
  Notifications.getLastNotificationResponse as jest.Mock;
const mockClearLastNotificationResponse =
  Notifications.clearLastNotificationResponse as jest.Mock;
const notificationTaskHandler = (TaskManager.defineTask as jest.Mock).mock
  .calls[0]?.[1] as (() => Promise<unknown>) | undefined;

const channelId = "hoot-unfathomably-notifications-v1";
const settingKey =
  "@hoot_unfathomably/notification_background_enabled";
const onboardingPromptedKey =
  "@hoot_unfathomably/notification_onboarding_prompted";
const stateKey = "@hoot_unfathomably/notification_poll_state";

const account = makeAccount("pleroma");
const ctx = makeContext("pleroma");

function notification(
  id: string,
  type = "mention",
  overrides: Partial<UnfathomablyService.UnfathomablyNotification> = {},
): UnfathomablyService.UnfathomablyNotification {
  return {
    id,
    type,
    created_at: "2026-07-29T12:00:00.000Z",
    account: {
      ...account,
      id: `actor-${id}`,
      username: "remote",
      acct: "remote@elsewhere.example",
      display_name: "Remote Person",
    },
    status: {
      id: `status-${id}`,
      created_at: "2026-07-29T12:00:00.000Z",
      content: "<p>Hello &amp; welcome</p>",
      replies_count: 0,
      reblogs_count: 0,
      favourites_count: 0,
      sensitive: false,
      spoiler_text: "",
      account,
      media_attachments: [],
    },
    ...overrides,
  };
}

function notificationResponse(
  data: Record<string, unknown>,
  actionIdentifier = Notifications.DEFAULT_ACTION_IDENTIFIER,
): Notifications.NotificationResponse {
  return {
    actionIdentifier,
    notification: {
      request: {
        content: { data },
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

describe("NotificationPoller", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockGetNotifications.mockResolvedValue([]);
    mockStoredContextQuery.mockResolvedValue(undefined);
    mockGetBackgroundTaskStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Available,
    );
    mockIsTaskRegistered.mockResolvedValue(false);
    mockGetNotificationPermissions.mockResolvedValue({
      canAskAgain: false,
      granted: true,
      status: "granted",
    });
    mockRequestNotificationPermissions.mockResolvedValue({
      canAskAgain: false,
      granted: true,
      status: "granted",
    });
    mockGetLastNotificationResponse.mockReturnValue(null);
    mockClearLastNotificationResponse.mockImplementation(() => undefined);
  });

  test("persists notification onboarding after its first presentation", async () => {
    await expect(getNotificationOnboardingPrompted()).resolves.toBe(false);

    await markNotificationOnboardingPrompted();

    await expect(getNotificationOnboardingPrompted()).resolves.toBe(true);
    await expect(
      AsyncStorage.getItem(onboardingPromptedKey),
    ).resolves.toBe("true");
  });

  test.each([
    ["Unfathomably", "unfathomably"],
    ["Rebased", "rebased"],
    ["Pleroma", "pleroma"],
  ] as const)(
    "creates a baseline from the %s notification endpoint",
    async (_label, family) => {
      const familyContext = makeContext(family);
      mockGetNotifications.mockResolvedValue([
        makeNotification(family, { id: `${family}-100` }),
        makeNotification(family, { id: `${family}-99` }),
      ]);

      await setNotificationEnabled(true, familyContext);

      expect(mockGetNotifications).toHaveBeenCalledWith(familyContext);
      expect(mockScheduleNotification).not.toHaveBeenCalled();
      await expect(AsyncStorage.getItem(settingKey)).resolves.toBe("true");
      expect(mockRegisterTask).toHaveBeenCalledWith(
        "hoot-unfathomably-notification-poll",
        { minimumInterval: 15 },
      );
      expect(familyContext.apiUrl).toBe(FEDIVERSE_SERVERS[family].origin);
    },
  );

  test("delivers only notifications newer than the phone baseline", async () => {
    mockGetNotifications.mockResolvedValue([notification("100")]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      notification("101"),
      notification("100"),
    ]);

    await expect(pollNotificationsNow(ctx)).resolves.toBe(1);
    expect(mockScheduleNotification).toHaveBeenCalledWith({
      content: expect.objectContaining({
        title: "Remote Person mentioned you",
        body: "Hello & welcome",
        data: {
          hootNotificationId: "101",
          hootNotificationKind: "mention",
          hootStatusId: "status-101",
        },
      }),
      trigger: { channelId },
    });
  });

  test("does not alert old history if migrated settings have no baseline", async () => {
    await AsyncStorage.setItem(settingKey, "true");
    mockGetNotifications.mockResolvedValue([notification("100")]);

    await expect(pollNotificationsNow(ctx)).resolves.toBe(0);
    expect(mockScheduleNotification).not.toHaveBeenCalled();

    mockGetNotifications.mockResolvedValue([
      notification("101"),
      notification("100"),
    ]);
    await expect(pollNotificationsNow(ctx)).resolves.toBe(1);
  });

  test("bounds notification state and summarizes large batches", async () => {
    mockGetNotifications.mockResolvedValue([]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue(
      Array.from({ length: 260 }, (_, index) =>
        notification(String(1000 - index)),
      ),
    );

    await expect(pollNotificationsNow(ctx)).resolves.toBe(6);
    expect(mockScheduleNotification).toHaveBeenCalledTimes(6);
    expect(mockScheduleNotification).toHaveBeenLastCalledWith({
      content: {
        title: "New Hoot Unfathomably notifications",
        body: "255 more notifications are waiting.",
        sound: "default",
        data: {
          hootNotificationKind: "notification_summary",
        },
      },
      trigger: { channelId },
    });

    const rawState = JSON.parse(
      (await AsyncStorage.getItem(stateKey)) ?? "{}",
    ) as Record<string, { ids?: string[] }>;
    expect(Object.values(rawState)[0]?.ids).toHaveLength(250);
  });

  test("does not expose sensitive post text in a local alert", async () => {
    mockGetNotifications.mockResolvedValue([]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      notification("101", "mention", {
        status: {
          ...notification("101").status!,
          content: "<p>private details</p>",
          sensitive: true,
          spoiler_text: "Spoilers",
        },
      }),
    ]);

    await pollNotificationsNow(ctx);

    expect(mockScheduleNotification).toHaveBeenCalledWith({
      content: expect.objectContaining({
        body: "Content warning: Spoilers",
      }),
      trigger: { channelId },
    });
  });

  test("does not enable polling when Android notifications are blocked", async () => {
    mockGetNotificationPermissions.mockResolvedValue({
      canAskAgain: false,
      granted: false,
      status: "denied",
    });
    mockRequestNotificationPermissions.mockResolvedValue({
      canAskAgain: false,
      granted: false,
      status: "denied",
    });

    await expect(setNotificationEnabled(true, ctx)).rejects.toThrow(
      "Notifications are blocked for Hoot Unfathomably",
    );
    expect(mockGetNotifications).not.toHaveBeenCalled();
    await expect(AsyncStorage.getItem(settingKey)).resolves.toBeNull();
  });

  test("rolls back the enabled setting when background tasks are restricted", async () => {
    mockGetBackgroundTaskStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Restricted,
    );

    await expect(setNotificationEnabled(true, ctx)).rejects.toThrow(
      "Android background tasks are restricted",
    );
    await expect(AsyncStorage.getItem(settingKey)).resolves.toBe("false");
  });

  test("migrates the old enabled preference without migrating stale ids", async () => {
    await AsyncStorage.setItem(
      "@lotide_notification_background_enabled",
      "true",
    );
    await AsyncStorage.setItem(
      "@lotide_notification_poll_state",
      JSON.stringify({ legacy: { initialized: true, ids: ["old"] } }),
    );

    await expect(getNotificationEnabled()).resolves.toBe(true);
    await expect(AsyncStorage.getItem(settingKey)).resolves.toBe("true");
    await expect(
      AsyncStorage.getItem("@lotide_notification_background_enabled"),
    ).resolves.toBeNull();

    await setNotificationEnabled(false, ctx);
    await expect(
      AsyncStorage.getItem("@lotide_notification_poll_state"),
    ).resolves.toBeNull();
  });

  test("unregisters the legacy task and removes legacy channels", async () => {
    mockIsTaskRegistered.mockImplementation((taskName: string) =>
      Promise.resolve(taskName === "hoot-mobile-lotide-notification-poll"),
    );

    await setNotificationEnabled(false, ctx);

    expect(mockUnregisterTask).toHaveBeenCalledWith(
      "hoot-mobile-lotide-notification-poll",
    );
    expect(mockDeleteNotificationChannel).toHaveBeenCalledWith(
      "lotide-notifications",
    );
    expect(mockDeleteNotificationChannel).toHaveBeenCalledWith(
      "lotide-notifications-v2",
    );
  });

  test("reports permission, task, and poll diagnostics", async () => {
    await AsyncStorage.setItem(settingKey, "true");
    mockIsTaskRegistered.mockImplementation((taskName: string) =>
      Promise.resolve(taskName === "hoot-unfathomably-notification-poll"),
    );

    await expect(getNotificationDiagnostics()).resolves.toEqual({
      supported: true,
      enabled: true,
      permissionCanAskAgain: false,
      permissionGranted: true,
      permissionStatus: "granted",
      backgroundAvailable: true,
      backgroundStatus: BackgroundTask.BackgroundTaskStatus.Available,
      taskRegistered: true,
      channelId,
      poll: { lastScheduledCount: 0 },
      error: undefined,
    });
    expect(mockRequestNotificationPermissions).not.toHaveBeenCalled();
  });

  test("records a signed-out background wake without failing the task", async () => {
    if (!notificationTaskHandler) {
      throw new Error("Notification background task was not defined.");
    }

    await expect(notificationTaskHandler()).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Success,
    );
    expect(mockGetNotifications).not.toHaveBeenCalled();
    await expect(getNotificationDiagnostics()).resolves.toEqual(
      expect.objectContaining({
        poll: expect.objectContaining({
          lastSkippedReason: "no_context",
          lastScheduledCount: 0,
        }),
      }),
    );
  });

  test("sends a test alert through the renamed channel", async () => {
    await expect(sendTestNotification()).resolves.toBe("notification-id");

    expect(mockSetNotificationChannel).toHaveBeenCalledWith(channelId, {
      name: "Hoot Unfathomably notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
    expect(mockScheduleNotification).toHaveBeenCalledWith({
      content: {
        title: "Hoot Unfathomably notification test",
        body: "Local Android notifications are working.",
        sound: "default",
        data: {
          hootNotificationKind: "diagnostic_test",
        },
      },
      trigger: { channelId },
    });
  });

  test("routes status alerts and summaries to the current navigation tree", () => {
    expect(
      getNotificationNavigationTarget({
        hootNotificationKind: "mention",
        hootStatusId: "status-101",
      }),
    ).toEqual({
      screen: "Status",
      params: { statusId: "status-101" },
    });
    expect(
      getNotificationNavigationTarget({
        hootNotificationKind: "notification_summary",
      }),
    ).toEqual({ screen: "Notifications" });
  });

  test("ignores diagnostic and non-default notification taps", () => {
    expect(
      getNotificationNavigationTarget({
        hootNotificationKind: "diagnostic_test",
      }),
    ).toBeUndefined();
    expect(
      getNotificationNavigationTargetFromResponse(
        notificationResponse(
          { hootStatusId: "status-101" },
          "custom-action",
        ),
      ),
    ).toBeUndefined();
  });

  test("handles cold-start notification responses defensively", () => {
    mockGetLastNotificationResponse.mockReturnValue(
      notificationResponse({
        hootNotificationKind: "mention",
        hootStatusId: "status-101",
      }),
    );
    expect(getLastNotificationNavigationTarget()).toEqual({
      screen: "Status",
      params: { statusId: "status-101" },
    });

    clearLastNotificationResponse();
    expect(mockClearLastNotificationResponse).toHaveBeenCalledTimes(1);

    mockClearLastNotificationResponse.mockImplementation(() => {
      throw new Error("native cache unavailable");
    });
    expect(() => clearLastNotificationResponse()).not.toThrow();
  });
});

/* end of NotificationPoller.test.ts */
