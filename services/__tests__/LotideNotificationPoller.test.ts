/*
    Project: Hoot Mobile
    -------------------

    File: LotideNotificationPoller.test.ts

    Purpose:

        Validate the local mobile notification polling policy.

    Responsibilities:

        - Verify enabling notifications creates a local baseline
        - Verify notification dedupe state remains bounded and current-page first
        - Verify large notification batches are summarized instead of flooding
        - Verify mobile notifications do not depend only on Lotide's
          globally consumed unseen flag
        - Verify first-run polling does not alert for old notification history

    This file intentionally does NOT contain:

        - Native scheduler integration tests
        - Live Lotide network tests
        - React component rendering tests
*/

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import * as LotideService from "../LotideService";
import {
  clearLastNotificationResponse,
  getNotificationDiagnostics,
  getLastNotificationNavigationTarget,
  getNotificationNavigationTarget,
  getNotificationNavigationTargetFromResponse,
  pollNotificationsNow,
  sendTestNotification,
  setNotificationEnabled,
} from "../LotideNotificationPoller";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      __store: store,
      getItem: jest.fn((key: string) =>
        Promise.resolve(store.has(key) ? store.get(key) || null : null),
      ),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    },
  };
});

jest.mock("../LotideService", () => ({
  __esModule: true,
  getPrivateMessagePartner: jest.fn((message: PrivateMessage, loginUserId?: UserId) =>
    message.author.id === loginUserId ? message.recipient : message.author,
  ),
  getNotifications: jest.fn(),
}));

const mockGetNotifications = LotideService.getNotifications as jest.Mock;
const mockGetBackgroundTaskStatus = BackgroundTask.getStatusAsync as jest.Mock;
const mockRegisterTask = BackgroundTask.registerTaskAsync as jest.Mock;
const mockIsTaskRegistered = TaskManager.isTaskRegisteredAsync as jest.Mock;
const notificationTaskHandler = (TaskManager.defineTask as jest.Mock).mock
  .calls[0]?.[1] as (() => Promise<unknown>) | undefined;
const mockScheduleNotification =
  Notifications.scheduleNotificationAsync as jest.Mock;
const mockSetNotificationChannel =
  Notifications.setNotificationChannelAsync as jest.Mock;
const mockGetNotificationPermissions =
  Notifications.getPermissionsAsync as jest.Mock;
const mockRequestNotificationPermissions =
  Notifications.requestPermissionsAsync as jest.Mock;
const mockGetLastNotificationResponse =
  Notifications.getLastNotificationResponse as jest.Mock;
const mockClearLastNotificationResponse =
  Notifications.clearLastNotificationResponse as jest.Mock;

const notificationChannelId = "lotide-notifications-v2";
const notificationStateKey = "@lotide_notification_poll_state";
const notificationSettingKey = "@lotide_notification_background_enabled";

const ctx: LotideContext = {
  apiUrl: "https://lotide.fbxl.net/api/unstable",
  login: {
    token: "token-1",
    user: {
      id: 1,
      username: "sj_zero",
      host: "lotide.fbxl.net",
      local: true,
    },
  },
};

function replyNotification(
  postId: PostId,
  commentId: CommentId,
  unseen: boolean,
  overrides: Partial<ReplyNotification> = {},
): ReplyNotification {
  return {
    unseen,
    commentId,
    origin: {
      type: "post",
      id: postId,
    },
    postId,
    ...overrides,
  };
}

function replyFingerprint(postId: PostId, commentId: CommentId): string {
  return `reply:post:${postId}:${commentId}:${postId}`;
}

function replyNotifications(
  count: number,
  firstPostId: PostId,
): ReplyNotification[] {
  const notifications: ReplyNotification[] = [];

  for (let index = 0; index < count; index++) {
    const postId = firstPostId + index;
    notifications.push(replyNotification(postId, postId + 1000, false));
  }

  return notifications;
}

function accountKeyForContext(context: LotideContext): string {
  return `${context.apiUrl}::${context.login?.user?.username}`;
}

async function storedNotificationIds(
  context: LotideContext,
): Promise<string[]> {
  const stored = await AsyncStorage.getItem(notificationStateKey);
  const state = JSON.parse(stored ?? "{}") as Record<string, {
    ids?: unknown;
  }>;
  const ids = state[accountKeyForContext(context)]?.ids;

  return Array.isArray(ids)
    ? ids.filter((item: unknown): item is string => typeof item === "string")
    : [];
}

function profile(
  id: UserId,
  username: string,
  host = "remote.example",
): Profile {
  return {
    id,
    username,
    host,
    local: false,
  };
}

function postSnapshot(
  id: PostId,
  title: string,
  overrides: Partial<Post> = {},
): Post {
  return {
    id,
    title,
    author: profile(100 + id, "post_author"),
    created: "2026-06-18T12:00:00Z",
    replies_count_total: 0,
    score: 0,
    sensitive: false,
    ...overrides,
  };
}

function commentSnapshot(
  id: CommentId,
  username: string,
  contentText: string,
  overrides: Partial<Comment> = {},
): Comment {
  return {
    id,
    author: profile(200 + id, username),
    created: "2026-06-18T12:00:00Z",
    score: 0,
    content_text: contentText,
    sensitive: false,
    ...overrides,
  };
}

function privateMessageNotification(
  overrides: Partial<PrivateMessage> = {},
): PrivateMessageNotification {
  return {
    unseen: true,
    kind: "private_message",
    message: {
      id: 33,
      author: {
        id: 2,
        username: "remote",
        local: false,
        host: "remote.example",
      },
      recipient: {
        id: 1,
        username: "sj_zero",
        local: true,
        host: "lotide.fbxl.net",
      },
      created: "2026-06-18T12:00:00Z",
      local: false,
      content_text: "hello",
      content_markdown: null,
      content_html: "<p>hello</p>",
      in_reply_to: null,
      sensitive: false,
      ...overrides,
    },
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
        content: {
          data,
        },
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

describe("LotideNotificationPoller", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage as unknown as { __store: Map<string, string> }).__store.clear();
    mockGetBackgroundTaskStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Available,
    );
    mockIsTaskRegistered.mockResolvedValue(false);
    mockGetNotifications.mockResolvedValue([]);
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

  test("creates a notification baseline when notifications are enabled", async () => {
    mockGetNotifications.mockResolvedValue([
      replyNotification(10, 20, false),
    ]);

    await setNotificationEnabled(true, ctx);

    expect(mockGetNotifications).toHaveBeenCalledWith(ctx);
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  test("keeps notification baselines bounded and current-page first", async () => {
    mockGetNotifications.mockResolvedValue(replyNotifications(260, 1000));

    await setNotificationEnabled(true, ctx);

    const ids = await storedNotificationIds(ctx);
    expect(ids).toHaveLength(250);
    expect(ids[0]).toBe(replyFingerprint(1000, 2000));
    expect(ids).toContain(replyFingerprint(1249, 2249));
    expect(ids).not.toContain(replyFingerprint(1250, 2250));
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  test("requests OS notification permission while enabling notifications", async () => {
    mockGetNotificationPermissions.mockResolvedValue({
      canAskAgain: true,
      granted: false,
      status: "undetermined",
    });
    mockRequestNotificationPermissions.mockResolvedValue({
      canAskAgain: false,
      granted: true,
      status: "granted",
    });

    await setNotificationEnabled(true, ctx);

    expect(mockRequestNotificationPermissions).toHaveBeenCalledWith({
      android: {},
    });
    await expect(
      AsyncStorage.getItem("@lotide_notification_background_enabled"),
    ).resolves.toBe(JSON.stringify(true));
  });

  test("notifies for a phone-new item even when another client cleared unseen", async () => {
    mockGetNotifications.mockResolvedValue([
      replyNotification(10, 20, false),
    ]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      replyNotification(11, 21, false),
      replyNotification(10, 20, false),
    ]);

    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(1);
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: expect.objectContaining({
            lotidePostId: 11,
            lotideCommentId: 21,
          }),
        }),
      }),
    );
  });

  test("notifies for a phone-new item after an intentionally empty baseline", async () => {
    mockGetNotifications.mockResolvedValue([]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      replyNotification(11, 21, false),
    ]);

    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(1);
    expect(mockSetNotificationChannel).toHaveBeenCalledWith(
      notificationChannelId,
      expect.objectContaining({
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      }),
    );
    expect(mockScheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          sound: "default",
          data: expect.objectContaining({
            lotidePostId: 11,
            lotideCommentId: 21,
          }),
        }),
        trigger: { channelId: notificationChannelId },
      }),
    );

    await expect(getNotificationDiagnostics()).resolves.toEqual(
      expect.objectContaining({
        poll: expect.objectContaining({
          lastAttemptAt: expect.any(String),
          lastSuccessAt: expect.any(String),
          lastScheduledAt: expect.any(String),
          lastScheduledCount: 1,
          lastError: undefined,
        }),
      }),
    );
  });

  test("formats reply notifications with the actor, post title, and preview", async () => {
    mockGetNotifications.mockResolvedValue([]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      replyNotification(11, 21, false, {
        notificationType: "post_reply",
        post: postSnapshot(11, "Release notes"),
        reply: commentSnapshot(21, "alex", "This fixed the Android alert."),
      }),
    ]);

    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(1);
    expect(mockScheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "alex replied to your post",
          body: "Release notes: This fixed the Android alert.",
        }),
      }),
    );
  });

  test("formats comment mentions with the mentioned comment preview", async () => {
    const comment = commentSnapshot(
      22,
      "mira",
      "@sj_zero this is the bit to look at.",
    );

    mockGetNotifications.mockResolvedValue([]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      replyNotification(12, 22, false, {
        notificationType: "comment_mention",
        origin: {
          type: "comment",
          id: 22,
        },
        post: postSnapshot(12, "Mention thread"),
        comment,
        reply: comment,
      }),
    ]);

    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(1);
    expect(mockScheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "mira mentioned you in a comment",
          body: "Mention thread: @sj_zero this is the bit to look at.",
        }),
      }),
    );
  });

  test("does not expose sensitive private message text in notifications", async () => {
    mockGetNotifications.mockResolvedValue([]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      privateMessageNotification({
        content_text: "keep this off the lock screen",
        content_html: "<p>keep this off the lock screen</p>",
        sensitive: true,
      }),
    ]);

    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(1);
    expect(mockScheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "remote sent you a message",
          body: "Sensitive message",
        }),
      }),
    );
  });

  test("keeps the latest fetched notification page before older tracked ids", async () => {
    const olderIds = replyNotifications(20, 10).map(item =>
      replyFingerprint(item.postId, item.commentId),
    );

    await AsyncStorage.setItem(
      notificationSettingKey,
      JSON.stringify(true),
    );
    await AsyncStorage.setItem(
      notificationStateKey,
      JSON.stringify({
        [accountKeyForContext(ctx)]: {
          initialized: true,
          ids: olderIds,
        },
      }),
    );
    mockGetNotifications.mockResolvedValue(replyNotifications(260, 1000));

    const count = await pollNotificationsNow(ctx);

    const ids = await storedNotificationIds(ctx);
    expect(count).toBe(6);
    expect(mockScheduleNotification).toHaveBeenCalledTimes(6);
    expect(mockScheduleNotification).toHaveBeenLastCalledWith({
      content: {
        title: "New Lotide notifications",
        body: "255 more new notifications are waiting in Hoot.",
        sound: "default",
        data: {
          lotideKind: "notification_summary",
        },
      },
      trigger: { channelId: notificationChannelId },
    });

    expect(ids).toHaveLength(250);
    expect(ids[0]).toBe(replyFingerprint(1000, 2000));
    expect(ids).toContain(replyFingerprint(1249, 2249));
    expect(ids).not.toContain(replyFingerprint(1250, 2250));
    expect(ids).not.toContain(olderIds[0]);
  });

  test("routes private message notifications to the conversation thread", async () => {
    mockGetNotifications.mockResolvedValue([]);
    await setNotificationEnabled(true, ctx);

    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      privateMessageNotification(),
    ]);

    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(1);
    expect(mockScheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "remote sent you a message",
          body: "hello",
          data: expect.objectContaining({
            lotideKind: "private_message",
            lotideMessageId: 33,
            lotidePartnerId: 2,
            lotidePartnerUsername: "remote",
          }),
        }),
      }),
    );
    expect(getNotificationNavigationTarget({
      lotideKind: "private_message",
      lotidePartnerId: 2,
      lotidePartnerUsername: "remote",
    })).toEqual({
      screen: "MessageThread",
      params: {
        userId: 2,
        username: "remote",
      },
    });
  });

  test("does not alert old history on the first poll without a baseline", async () => {
    await AsyncStorage.setItem(
      "@lotide_notification_background_enabled",
      JSON.stringify(true),
    );
    mockScheduleNotification.mockClear();
    mockGetNotifications.mockResolvedValue([
      replyNotification(10, 20, false),
    ]);

    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(0);
    expect(mockScheduleNotification).not.toHaveBeenCalled();

    mockGetNotifications.mockResolvedValue([
      replyNotification(10, 20, false),
    ]);

    await pollNotificationsNow(ctx);

    expect(mockScheduleNotification).not.toHaveBeenCalled();

    mockGetNotifications.mockResolvedValue([
      replyNotification(11, 21, false),
      replyNotification(10, 20, false),
    ]);

    await pollNotificationsNow(ctx);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });

  test("records poll diagnostics when polling is skipped by setting", async () => {
    const count = await pollNotificationsNow(ctx);

    expect(count).toBe(0);
    expect(mockGetNotifications).not.toHaveBeenCalled();

    await expect(getNotificationDiagnostics()).resolves.toEqual(
      expect.objectContaining({
        poll: expect.objectContaining({
          lastAttemptAt: expect.any(String),
          lastSuccessAt: expect.any(String),
          lastScheduledCount: 0,
          lastSkippedReason: "disabled",
          lastError: undefined,
        }),
      }),
    );
  });

  test("records poll diagnostics when a background wake has no signed-in context", async () => {
    if (!notificationTaskHandler) {
      throw new Error("Notification background task was not registered.");
    }

    const result = await notificationTaskHandler();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(mockGetNotifications).not.toHaveBeenCalled();
    await expect(getNotificationDiagnostics()).resolves.toEqual(
      expect.objectContaining({
        poll: expect.objectContaining({
          lastAttemptAt: expect.any(String),
          lastSuccessAt: expect.any(String),
          lastScheduledCount: 0,
          lastSkippedReason: "no_context",
          lastError: undefined,
        }),
      }),
    );
  });

  test("records poll diagnostics when a poll fails", async () => {
    await AsyncStorage.setItem(
      "@lotide_notification_background_enabled",
      JSON.stringify(true),
    );
    mockGetNotifications.mockRejectedValue(new Error("network down"));

    await expect(pollNotificationsNow(ctx)).rejects.toThrow("network down");

    await expect(getNotificationDiagnostics()).resolves.toEqual(
      expect.objectContaining({
        poll: expect.objectContaining({
          lastAttemptAt: expect.any(String),
          lastScheduledCount: 0,
          lastError: "network down",
        }),
      }),
    );
  });

  test("does not leave notifications enabled when baseline creation fails", async () => {
    mockGetNotifications.mockRejectedValue(new Error("server unavailable"));

    await expect(setNotificationEnabled(true, ctx)).rejects.toThrow(
      "server unavailable",
    );

    await expect(
      AsyncStorage.getItem("@lotide_notification_background_enabled"),
    ).resolves.toBeNull();
  });

  test("does not leave notifications enabled when task registration is unavailable", async () => {
    mockGetBackgroundTaskStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Restricted,
    );

    await expect(setNotificationEnabled(true, ctx)).rejects.toThrow(
      "not available",
    );

    await expect(
      AsyncStorage.getItem("@lotide_notification_background_enabled"),
    ).resolves.toBe(JSON.stringify(false));
    expect(mockRegisterTask).not.toHaveBeenCalled();
  });

  test("does not enable notifications when OS permission is denied", async () => {
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
      "Allow notifications",
    );

    expect(mockRequestNotificationPermissions).toHaveBeenCalledWith({
      android: {},
    });
    expect(mockGetNotifications).not.toHaveBeenCalled();
    expect(mockRegisterTask).not.toHaveBeenCalled();
    await expect(
      AsyncStorage.getItem("@lotide_notification_background_enabled"),
    ).resolves.toBeNull();
  });

  test("reports notification diagnostics without prompting permission", async () => {
    await AsyncStorage.setItem(
      "@lotide_notification_background_enabled",
      JSON.stringify(true),
    );
    mockGetNotificationPermissions.mockResolvedValue({
      canAskAgain: false,
      granted: false,
      status: "denied",
    });
    mockGetBackgroundTaskStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Available,
    );
    mockIsTaskRegistered.mockResolvedValue(true);

    const diagnostics = await getNotificationDiagnostics();

    expect(diagnostics).toEqual({
      supported: true,
      enabled: true,
      permissionCanAskAgain: false,
      permissionGranted: false,
      permissionStatus: "denied",
      backgroundAvailable: true,
      backgroundStatus: BackgroundTask.BackgroundTaskStatus.Available,
      taskRegistered: true,
      channelId: notificationChannelId,
      poll: {
        lastScheduledCount: 0,
      },
      error: undefined,
    });
    expect(mockRequestNotificationPermissions).not.toHaveBeenCalled();
  });

  test("includes diagnostics errors without hiding successful checks", async () => {
    mockGetNotificationPermissions.mockRejectedValue(new Error("bridge down"));
    mockGetBackgroundTaskStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Restricted,
    );
    mockIsTaskRegistered.mockResolvedValue(false);

    const diagnostics = await getNotificationDiagnostics();

    expect(diagnostics.permissionGranted).toBe(false);
    expect(diagnostics.permissionCanAskAgain).toBe(false);
    expect(diagnostics.permissionStatus).toBe("unknown");
    expect(diagnostics.backgroundAvailable).toBe(false);
    expect(diagnostics.backgroundStatus).toBe(
      BackgroundTask.BackgroundTaskStatus.Restricted,
    );
    expect(diagnostics.taskRegistered).toBe(false);
    expect(diagnostics.poll).toEqual({
      lastScheduledCount: 0,
    });
    expect(diagnostics.error).toContain("permission check failed: bridge down");
  });

  test("reports diagnostics when the stored setting cannot be read", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("storage down"),
    );

    const diagnostics = await getNotificationDiagnostics();

    expect(diagnostics.enabled).toBe(false);
    expect(diagnostics.supported).toBe(true);
    expect(diagnostics.poll).toEqual({
      lastScheduledCount: 0,
    });
    expect(diagnostics.error).toContain("setting read failed: storage down");
  });

  test("reports whether notification permission can still be requested", async () => {
    mockGetNotificationPermissions.mockResolvedValue({
      canAskAgain: true,
      granted: false,
      status: "undetermined",
    });

    const diagnostics = await getNotificationDiagnostics();

    expect(diagnostics.permissionGranted).toBe(false);
    expect(diagnostics.permissionCanAskAgain).toBe(true);
    expect(diagnostics.permissionStatus).toBe("undetermined");
    expect(mockRequestNotificationPermissions).not.toHaveBeenCalled();
  });

  test("sends a local test notification through the Lotide channel", async () => {
    const notificationId = await sendTestNotification();

    expect(notificationId).toBe("notification-id");
    expect(mockSetNotificationChannel).toHaveBeenCalledWith(
      notificationChannelId,
      expect.objectContaining({
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      }),
    );
    expect(mockScheduleNotification).toHaveBeenCalledWith({
      content: {
        title: "Hoot notification test",
        body: "Local Android notifications are working.",
        sound: "default",
        data: {
          lotideKind: "diagnostic_test",
        },
      },
      trigger: { channelId: notificationChannelId },
    });
  });

  test("requests permission before sending a local test notification", async () => {
    mockGetNotificationPermissions.mockResolvedValue({
      canAskAgain: true,
      granted: false,
      status: "undetermined",
    });
    mockRequestNotificationPermissions.mockResolvedValue({
      canAskAgain: false,
      granted: true,
      status: "granted",
    });

    await sendTestNotification();

    expect(mockRequestNotificationPermissions).toHaveBeenCalledWith({
      android: {},
    });
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
  });

  test("requires a signed-in context before enabling notifications", async () => {
    await expect(setNotificationEnabled(true)).rejects.toThrow(
      "Sign in before enabling",
    );

    await expect(
      AsyncStorage.getItem("@lotide_notification_background_enabled"),
    ).resolves.toBeNull();
  });

  test("builds post navigation targets from notification data", () => {
    expect(
      getNotificationNavigationTarget({
        lotidePostId: "10",
        lotideCommentId: 20,
      }),
    ).toEqual({
      screen: "Post",
      params: {
        postId: 10,
        highlightedComments: [20],
      },
    });
  });

  test("routes user follow notifications to the notification list", () => {
    expect(
      getNotificationNavigationTarget({
        lotideKind: "user_follow",
        lotideActorId: 5,
      }),
    ).toEqual({
      screen: "Notifications",
    });
  });

  test("routes summary notifications to the notification list", () => {
    expect(
      getNotificationNavigationTarget({
        lotideKind: "notification_summary",
      }),
    ).toEqual({
      screen: "Notifications",
    });
  });

  test("ignores non-default notification actions", () => {
    expect(
      getNotificationNavigationTargetFromResponse(
        notificationResponse({ lotidePostId: 10 }, "custom-action"),
      ),
    ).toBeUndefined();
  });

  test("builds cold-start navigation targets from the last notification response", () => {
    mockGetLastNotificationResponse.mockReturnValue(
      notificationResponse({
        lotideKind: "private_message",
        lotidePartnerId: "2",
        lotidePartnerUsername: "remote",
      }),
    );

    expect(getLastNotificationNavigationTarget()).toEqual({
      screen: "MessageThread",
      params: {
        userId: 2,
        username: "remote",
      },
    });
  });

  test("ignores unavailable native cold-start notification response caches", () => {
    mockGetLastNotificationResponse.mockImplementation(() => {
      throw new Error("native module unavailable");
    });

    expect(getLastNotificationNavigationTarget()).toBeUndefined();
  });

  test("clears native notification responses defensively", () => {
    clearLastNotificationResponse();

    expect(mockClearLastNotificationResponse).toHaveBeenCalledTimes(1);

    mockClearLastNotificationResponse.mockImplementation(() => {
      throw new Error("native module unavailable");
    });

    expect(() => clearLastNotificationResponse()).not.toThrow();
  });
});

/* end of LotideNotificationPoller.test.ts */
