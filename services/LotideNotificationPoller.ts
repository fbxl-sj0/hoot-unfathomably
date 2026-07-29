/*
    Project: Hoot Mobile
    -------------------

    File: LotideNotificationPoller.ts

    Purpose:

        Poll Lotide notifications in the background and raise local
        Android notifications for items Hoot has not already surfaced.

    Responsibilities:

        • Register and execute a background task for periodic polling
        • Keep a short-lived local dedupe set so the same notification
          is not surfaced multiple times
        • Send local notifications when polling discovers locally new items

    This file intentionally does NOT contain:

        • UI elements for notification settings
        • Notification list rendering or user-facing notification filters
*/

import { Platform } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import * as LotideService from "./LotideService";
import * as StorageService from "./StorageService";
import { logError } from "../utils/debugLog";

/* ------------------------------------------------------------------------- */
/* Constants and Types                                                      */
/* ------------------------------------------------------------------------- */

const POLL_TASK_NAME = "hoot-mobile-lotide-notification-poll";
const POLL_INTERVAL_MINUTES = 15;
const SETTINGS_KEY = "@lotide_notification_background_enabled";
const STATE_KEY = "@lotide_notification_poll_state";
const POLL_DIAGNOSTICS_KEY = "@lotide_notification_poll_diagnostics";
const MAX_TRACKED_NOTIFICATION_IDS = 250;
const MAX_INDIVIDUAL_NOTIFICATIONS_PER_POLL = 5;
const NOTIFICATION_TITLE_MAX_LENGTH = 80;
const NOTIFICATION_BODY_MAX_LENGTH = 180;

/*
    Android preserves a channel's user-facing importance and sound after the
    channel exists. The v2 suffix intentionally gives upgraded installs a fresh
    high-importance channel instead of reusing the earlier default channel.
*/
const NOTIFICATION_CHANNEL_ID = "lotide-notifications-v2";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type NotificationStateEntry = {
  initialized: boolean;
  ids: string[];
};

type NotificationState = {
  [accountKey: string]: NotificationStateEntry;
};

export type NotificationPollDiagnostics = {
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastScheduledAt?: string;
  lastScheduledCount: number;
  lastSkippedReason?: string;
};

type NotificationPollSkippedReason =
  | "disabled"
  | "no_context"
  | "permission_denied";

export type NotificationPollTaskRegistrationResult =
  | "registered"
  | "unregistered"
  | "unchanged"
  | "unavailable"
  | "skipped";

type NotificationPollTaskRegistrationOptions = {
  requireAvailable?: boolean;
};

type NotificationTextSource = {
  content_text?: string | null;
  content_markdown?: string | null;
  content_html?: string | null;
  sensitive?: boolean;
};

export type NotificationDiagnostics = {
  supported: boolean;
  enabled: boolean;
  permissionCanAskAgain: boolean;
  permissionGranted: boolean;
  permissionStatus: string;
  backgroundAvailable: boolean;
  backgroundStatus: string;
  taskRegistered: boolean;
  channelId: string;
  poll: NotificationPollDiagnostics;
  error?: string;
};

export type NotificationNavigationTarget =
  | {
    screen: "Post";
    params: {
      postId: PostId;
      highlightedComments?: CommentId[];
    };
  }
  | {
    screen: "Notifications";
  }
  | {
    screen: "MessageThread";
    params: {
      userId: UserId;
      username?: string;
    };
  };

/* ------------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ------------------------------------------------------------------------- */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (value === null) return {};

  try {
    const data = JSON.parse(value) as unknown;
    return isObject(data) ? data : {};
  } catch {
    return {};
  }
}

function buildAccountKey(ctx: LotideContext): string {
  const username = ctx.login?.user?.username;
  const api = ctx.apiUrl ?? "unknown-api";
  const userTag = username ?? `user-${ctx.login?.user?.id ?? "unknown"}`;
  return `${api}::${userTag}`;
}

function notificationFingerprint(notification: FullNotification): string {
  if (notification.kind === "user_follow") {
    return `user_follow:${notification.actor?.id ?? notification.actor?.username ?? "unknown"}`;
  }

  if (notification.kind === "private_message") {
    return `private_message:${notification.message.id}`;
  }

  return `reply:${notification.origin.type}:${notification.postId}:${notification.commentId}:${notification.origin.id}`;
}

function trackedNotificationIdsForPage(
  currentIds: string[],
  previousIds: string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  /*
      The server page just fetched is more useful than older local history.

      Lotide usually sends the newest notification page first, but the important
      contract here is simpler: keep the current page before older cache entries
      so a bounded AsyncStorage record cannot immediately forget items we just
      observed.
  */
  const appendIds = (ids: string[]) => {
    for (const id of ids) {
      if (out.length >= MAX_TRACKED_NOTIFICATION_IDS) break;
      if (seen.has(id)) continue;

      seen.add(id);
      out.push(id);
    }
  };

  appendIds(currentIds);
  appendIds(previousIds);

  return out;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateNotificationText(value: string, maxLength: number): string {
  const text = collapseWhitespace(value);
  if (text.length <= maxLength) return text;

  const suffix = "...";
  if (maxLength <= suffix.length) {
    return text.slice(0, maxLength);
  }

  return `${text.slice(0, maxLength - suffix.length).trimEnd()}${suffix}`;
}

function decodeHtmlEntity(entity: string): string | undefined {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  const lower = entity.toLowerCase();

  if (Object.prototype.hasOwnProperty.call(namedEntities, lower)) {
    return namedEntities[lower];
  }

  if (/^#[0-9]+$/.test(lower)) {
    const codePoint = Number.parseInt(lower.slice(1), 10);
    if (!Number.isFinite(codePoint)) return undefined;

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return undefined;
    }
  }

  if (/^#x[0-9a-f]+$/.test(lower)) {
    const codePoint = Number.parseInt(lower.slice(2), 16);
    if (!Number.isFinite(codePoint)) return undefined;

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function decodeBasicHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) =>
    decodeHtmlEntity(entity) ?? match,
  );
}

function htmlToNotificationText(value: string): string {
  return decodeBasicHtmlEntities(
    value
      .replace(/<\s*br\s*\/?\s*>/gi, " ")
      .replace(/<\/\s*(blockquote|div|h[1-6]|li|p)\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  );
}

function markdownToNotificationText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#]/g, "")
    .replace(/^-+\s*/gm, "");
}

function firstNotificationText(
  values: (string | null | undefined)[],
): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;

    const text = collapseWhitespace(value);
    if (text.length > 0) return text;
  }

  return undefined;
}

function notificationPreviewText(
  source: NotificationTextSource | undefined,
  sensitiveLabel: string,
): string | undefined {
  if (!source) return undefined;
  if (source.sensitive === true) return sensitiveLabel;

  const text = firstNotificationText([
    source.content_text,
    typeof source.content_markdown === "string"
      ? markdownToNotificationText(source.content_markdown)
      : undefined,
    typeof source.content_html === "string"
      ? htmlToNotificationText(source.content_html)
      : undefined,
  ]);

  return text
    ? truncateNotificationText(text, NOTIFICATION_BODY_MAX_LENGTH)
    : undefined;
}

function profileDisplayName(profile: Profile | undefined): string {
  const username = typeof profile?.username === "string"
    ? collapseWhitespace(profile.username)
    : "";

  return username.length > 0
    ? truncateNotificationText(username, NOTIFICATION_TITLE_MAX_LENGTH)
    : "Someone";
}

function profileHandle(profile: Profile | undefined): string | undefined {
  const username = typeof profile?.username === "string"
    ? collapseWhitespace(profile.username)
    : "";
  if (username.length === 0) return undefined;

  const host = typeof profile?.host === "string"
    ? collapseWhitespace(profile.host)
    : "";

  return host.length > 0 ? `${username}@${host}` : username;
}

function notificationPostTitle(
  notification: ReplyNotification,
): string | undefined {
  const title = typeof notification.post?.title === "string"
    ? collapseWhitespace(notification.post.title)
    : "";

  return title.length > 0
    ? truncateNotificationText(title, NOTIFICATION_BODY_MAX_LENGTH)
    : undefined;
}

function contextualNotificationBody(
  context: string | undefined,
  preview: string | undefined,
  fallback: string,
): string {
  if (context && preview && context !== preview) {
    return truncateNotificationText(
      `${context}: ${preview}`,
      NOTIFICATION_BODY_MAX_LENGTH,
    );
  }

  return truncateNotificationText(
    preview ?? context ?? fallback,
    NOTIFICATION_BODY_MAX_LENGTH,
  );
}

function notificationContent(notification: FullNotification) {
  if (notification.kind === "user_follow") {
    const actor = profileDisplayName(notification.actor);
    const handle = profileHandle(notification.actor);

    return {
      title: truncateNotificationText(
        `${actor} followed you`,
        NOTIFICATION_TITLE_MAX_LENGTH,
      ),
      body: truncateNotificationText(
        handle ?? "Open Hoot to view their profile.",
        NOTIFICATION_BODY_MAX_LENGTH,
      ),
      sound: "default" as const,
    };
  }

  if (notification.kind === "private_message") {
    const actor = profileDisplayName(notification.message.author);
    const preview = notificationPreviewText(
      notification.message,
      "Sensitive message",
    );

    return {
      title: truncateNotificationText(
        `${actor} sent you a message`,
        NOTIFICATION_TITLE_MAX_LENGTH,
      ),
      body: preview ?? "Open Hoot to view the message.",
      sound: "default" as const,
    };
  }

  if (notification.notificationType === "post_mention") {
    const actor = profileDisplayName(notification.post?.author);
    const title = notificationPostTitle(notification);
    const preview = notificationPreviewText(
      notification.post,
      "Sensitive post",
    );

    return {
      title: truncateNotificationText(
        `${actor} mentioned you in a post`,
        NOTIFICATION_TITLE_MAX_LENGTH,
      ),
      body: contextualNotificationBody(
        title,
        preview,
        "Open Hoot to view the post that mentioned you.",
      ),
      sound: "default" as const,
    };
  }

  if (notification.notificationType === "comment_mention") {
    const mentionedComment = notification.comment ?? notification.reply;
    const actor = profileDisplayName(mentionedComment?.author);
    const title = notificationPostTitle(notification);
    const preview = notificationPreviewText(
      mentionedComment,
      "Sensitive comment",
    );

    return {
      title: truncateNotificationText(
        `${actor} mentioned you in a comment`,
        NOTIFICATION_TITLE_MAX_LENGTH,
      ),
      body: contextualNotificationBody(
        title,
        preview,
        "Open Hoot to view the comment that mentioned you.",
      ),
      sound: "default" as const,
    };
  }

  const isComment = notification.origin.type === "comment";
  const actor = profileDisplayName(notification.reply?.author);
  const title = notificationPostTitle(notification);
  const preview = notificationPreviewText(
    notification.reply,
    "Sensitive reply",
  );

  return {
    title: truncateNotificationText(
      isComment
        ? `${actor} replied to your comment`
        : `${actor} replied to your post`,
      NOTIFICATION_TITLE_MAX_LENGTH,
    ),
    body: contextualNotificationBody(
      title,
      preview,
      "Open Hoot to view your latest notifications.",
    ),
    sound: "default" as const,
  };
}

function summaryNotificationContent(extraCount: number) {
  const suffix = extraCount === 1
    ? "1 more new notification is"
    : `${extraCount} more new notifications are`;

  return {
    title: "New Lotide notifications",
    body: `${suffix} waiting in Hoot.`,
    sound: "default" as const,
    data: {
      lotideKind: "notification_summary",
    },
  };
}

function notificationData(
  notification: FullNotification,
  ctx: LotideContext,
): Record<string, unknown> {
  if (notification.kind === "user_follow") {
    return {
      lotideKind: notification.kind,
      lotideActorId: notification.actor?.id,
    };
  }

  if (notification.kind === "private_message") {
    const loginUserId = ctx.login?.user?.id;
    const partner = LotideService.getPrivateMessagePartner(
      notification.message,
      loginUserId,
    );

    return {
      lotideKind: notification.kind,
      lotideMessageId: notification.message.id,
      lotidePartnerId: partner.id,
      lotidePartnerUsername: partner.username,
    };
  }

  return {
    lotidePostId: notification.postId,
    lotideCommentId: notification.commentId,
    lotideKind: notification.kind ?? "reply",
    lotideOriginType: notification.origin.type,
  };
}

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    return Number(value);
  }

  return undefined;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    return Number(value);
  }

  return undefined;
}

function asIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (Number.isNaN(Date.parse(value))) return undefined;

  return value;
}

export function getNotificationNavigationTarget(
  data: Record<string, unknown>,
): NotificationNavigationTarget | undefined {
  const postId = asPositiveInteger(data.lotidePostId);
  if (postId !== undefined) {
    const commentId = asPositiveInteger(data.lotideCommentId);

    return {
      screen: "Post",
      params: {
        postId,
        highlightedComments: commentId !== undefined ? [commentId] : undefined,
      },
    };
  }

  if (data.lotideKind === "user_follow") {
    return {
      screen: "Notifications",
    };
  }

  if (data.lotideKind === "notification_summary") {
    return {
      screen: "Notifications",
    };
  }

  if (data.lotideKind === "private_message") {
    const userId = asPositiveInteger(data.lotidePartnerId);
    if (userId === undefined) return undefined;

    return {
      screen: "MessageThread",
      params: {
        userId,
        username:
          typeof data.lotidePartnerUsername === "string"
            ? data.lotidePartnerUsername
            : undefined,
      },
    };
  }

  return undefined;
}

export function getNotificationNavigationTargetFromResponse(
  response: Notifications.NotificationResponse | null,
): NotificationNavigationTarget | undefined {
  if (!response) return undefined;
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return undefined;
  }

  const data = response.notification.request.content.data;
  if (!data) return undefined;

  return getNotificationNavigationTarget(data);
}

export function getLastNotificationNavigationTarget():
  NotificationNavigationTarget | undefined {
  try {
    return getNotificationNavigationTargetFromResponse(
      Notifications.getLastNotificationResponse(),
    );
  } catch {
    return undefined;
  }
}

export function addNotificationResponseReceivedListener(
  listener: (target: NotificationNavigationTarget) => void,
): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener(response => {
    const target = getNotificationNavigationTargetFromResponse(response);
    if (target) {
      listener(target);
    }
  });
}

export function clearLastNotificationResponse() {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    /*
        The notification response cache is native-only. Some test and web
        environments do not expose it, and a failed clear should not prevent
        navigation after a user tapped a notification.
    */
  }
}

function normalizeNotificationStateEntry(
  value: unknown,
): NotificationStateEntry | undefined {
  if (Array.isArray(value)) {
    return {
      initialized: true,
      ids: value.filter(
        (item: unknown): item is string => typeof item === "string",
      ),
    };
  }

  if (!isObject(value)) return undefined;

  const ids = Array.isArray(value.ids)
    ? value.ids.filter(
      (item: unknown): item is string => typeof item === "string",
    )
    : [];

  return {
    initialized: value.initialized === true,
    ids,
  };
}

async function loadNotificationState(): Promise<NotificationState> {
  const stored = await AsyncStorage.getItem(STATE_KEY);
  const raw = parseJsonObject(stored);
  const out: NotificationState = {};

  Object.keys(raw).forEach(key => {
    const entry = normalizeNotificationStateEntry(raw[key]);
    if (entry) {
      out[key] = entry;
    }
  });

  return out;
}

async function getNotificationStateEntry(
  accountKey: string,
): Promise<NotificationStateEntry> {
  const state = await loadNotificationState();
  return state[accountKey] ?? {
    initialized: false,
    ids: [],
  };
}

async function setNotificationStateEntry(
  accountKey: string,
  entry: NotificationStateEntry,
): Promise<void> {
  const state = await loadNotificationState();
  const nextState = {
    ...state,
    [accountKey]: entry,
  };

  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(nextState));
}

async function storeCurrentNotificationBaseline(
  ctx: LotideContext,
): Promise<void> {
  const notifications = await LotideService.getNotifications(ctx);
  const ids = notifications.map(notificationFingerprint);
  await setNotificationStateEntry(buildAccountKey(ctx), {
    initialized: true,
    ids: trackedNotificationIdsForPage(ids),
  });
}

function normalizePollDiagnostics(
  value: unknown,
): NotificationPollDiagnostics {
  if (!isObject(value)) {
    return {
      lastScheduledCount: 0,
    };
  }

  return {
    lastAttemptAt: asIsoTimestamp(value.lastAttemptAt),
    lastSuccessAt: asIsoTimestamp(value.lastSuccessAt),
    lastError: typeof value.lastError === "string"
      ? value.lastError
      : undefined,
    lastScheduledAt: asIsoTimestamp(value.lastScheduledAt),
    lastScheduledCount: asNonNegativeInteger(value.lastScheduledCount) ?? 0,
    lastSkippedReason: typeof value.lastSkippedReason === "string"
      ? value.lastSkippedReason
      : undefined,
  };
}

async function loadPollDiagnostics(): Promise<NotificationPollDiagnostics> {
  const stored = await AsyncStorage.getItem(POLL_DIAGNOSTICS_KEY);
  return normalizePollDiagnostics(parseJsonObject(stored));
}

async function updatePollDiagnostics(
  patch: Partial<NotificationPollDiagnostics>,
): Promise<void> {
  const existing = await loadPollDiagnostics();
  const next = {
    ...existing,
    ...patch,
  };

  await AsyncStorage.setItem(POLL_DIAGNOSTICS_KEY, JSON.stringify(next));
}

async function recordPollSuccess(
  attemptAt: string,
  scheduledCount: number,
  skippedReason?: NotificationPollSkippedReason,
): Promise<void> {
  const patch: Partial<NotificationPollDiagnostics> = {
    lastSuccessAt: attemptAt,
    lastError: undefined,
    lastScheduledCount: scheduledCount,
    lastSkippedReason: skippedReason,
  };

  if (scheduledCount > 0) {
    patch.lastScheduledAt = attemptAt;
  }

  await updatePollDiagnostics(patch);
}

async function recordPollSkipped(
  skippedReason: NotificationPollSkippedReason,
): Promise<void> {
  const attemptAt = new Date().toISOString();

  await updatePollDiagnostics({
    lastAttemptAt: attemptAt,
    lastSuccessAt: attemptAt,
    lastError: undefined,
    lastScheduledCount: 0,
    lastSkippedReason: skippedReason,
  });
}

async function recordPollFailure(
  error: unknown,
): Promise<void> {
  await updatePollDiagnostics({
    lastError: getErrorText(error),
    lastScheduledCount: 0,
  });
}

async function readEnabledSetting(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!stored) return false;

  try {
    return JSON.parse(stored) === true;
  } catch {
    return false;
  }
}

function permissionAllowsNotifications(
  permission: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>,
): boolean {
  return permission.granted || permission.status === "granted";
}

function permissionCanAskAgain(
  permission: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>,
): boolean {
  return permission.canAskAgain === true;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function permissionStatusText(
  permission: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>,
): string {
  if (typeof permission.status === "string") {
    return permission.status;
  }

  return permission.granted ? "granted" : "unknown";
}

async function ensureChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(
    NOTIFICATION_CHANNEL_ID,
    {
      name: "Lotide notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    },
  );
}

async function ensureNotificationActivationReady(): Promise<void> {
  await ensureChannel();

  const granted = await requestNotificationPermission();
  if (!granted) {
    throw new Error(
      "Allow notifications in system settings to enable Lotide background alerts.",
    );
  }
}

async function runPollAndNotifyForContext(ctx: LotideContext): Promise<number> {
  const attemptAt = new Date().toISOString();
  await updatePollDiagnostics({
    lastAttemptAt: attemptAt,
    lastError: undefined,
  });

  try {
    const enabled = await readEnabledSetting();
    if (!enabled) {
      await recordPollSuccess(attemptAt, 0, "disabled");
      return 0;
    }

    const permission = await Notifications.getPermissionsAsync();
    const canNotify = permissionAllowsNotifications(permission);
    if (!canNotify) {
      await recordPollSuccess(attemptAt, 0, "permission_denied");
      return 0;
    }

    const accountKey = buildAccountKey(ctx);
    const accountState = await getNotificationStateEntry(accountKey);
    const known = new Set(accountState.ids);
    const notifications = await LotideService.getNotifications(ctx);
    const currentIds = notifications.map(notificationFingerprint);
    const nextTrackedIds = trackedNotificationIdsForPage(
      currentIds,
      accountState.ids,
    );
    const candidates = accountState.initialized
      ? notifications.filter(item => !known.has(notificationFingerprint(item)))
      : notifications.filter(item => item.unseen);

    if (!accountState.initialized && notifications.length === 0) {
      await setNotificationStateEntry(accountKey, {
        initialized: true,
        ids: [],
      });
      await recordPollSuccess(attemptAt, 0);
      return 0;
    }

    if (candidates.length === 0) {
      await setNotificationStateEntry(accountKey, {
        initialized: true,
        ids: nextTrackedIds,
      });
      await recordPollSuccess(attemptAt, 0);
      return 0;
    }

    await ensureChannel();

    const individualCandidates =
      candidates.slice(0, MAX_INDIVIDUAL_NOTIFICATIONS_PER_POLL);
    const hiddenCandidateCount = candidates.length - individualCandidates.length;
    const scheduleRequests = individualCandidates.map(item =>
      Notifications.scheduleNotificationAsync({
        content: {
          ...notificationContent(item),
          data: notificationData(item, ctx),
        },
        trigger: { channelId: NOTIFICATION_CHANNEL_ID },
      }),
    );

    if (hiddenCandidateCount > 0) {
      scheduleRequests.push(
        Notifications.scheduleNotificationAsync({
          content: summaryNotificationContent(hiddenCandidateCount),
          trigger: { channelId: NOTIFICATION_CHANNEL_ID },
        }),
      );
    }

    await Promise.all(scheduleRequests);

    await setNotificationStateEntry(accountKey, {
      initialized: true,
      ids: nextTrackedIds,
    });
    await recordPollSuccess(attemptAt, scheduleRequests.length);
    return scheduleRequests.length;
  } catch (error) {
    await recordPollFailure(error);
    throw error;
  }
}

/* ------------------------------------------------------------------------- */
/* Background Task Registration and Execution                                */
/* ------------------------------------------------------------------------- */

TaskManager.defineTask(POLL_TASK_NAME, async () => {
  try {
    const ctx = await StorageService.lotideContext.query();
    if (!ctx?.login) {
      await recordPollSkipped("no_context");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    await runPollAndNotifyForContext(ctx);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    logError("Lotide notification poll failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerNotificationPollTask(
  options: NotificationPollTaskRegistrationOptions = {},
): Promise<NotificationPollTaskRegistrationResult> {
  if (Platform.OS !== "android") return "skipped";

  const enabled = await readEnabledSetting();
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(POLL_TASK_NAME);

  if (!enabled) {
    if (alreadyRegistered) {
      await BackgroundTask.unregisterTaskAsync(POLL_TASK_NAME);
      return "unregistered";
    }
    return "unchanged";
  }

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    if (options.requireAvailable) {
      throw new Error(
        "Background notification tasks are not available on this device.",
      );
    }

    return "unavailable";
  }

  if (alreadyRegistered) {
    await BackgroundTask.unregisterTaskAsync(POLL_TASK_NAME);
  }

  await BackgroundTask.registerTaskAsync(POLL_TASK_NAME, {
    minimumInterval: POLL_INTERVAL_MINUTES,
  });
  return "registered";
}

export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (permissionAllowsNotifications(existing)) {
    return true;
  }

  const next = await Notifications.requestPermissionsAsync(
    Platform.OS === "android" ? { android: {} } : undefined,
  );
  return permissionAllowsNotifications(next);
}

export async function getNotificationEnabled(): Promise<boolean> {
  return readEnabledSetting();
}

export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  const errors: string[] = [];
  let enabled = false;
  let poll: NotificationPollDiagnostics = {
    lastScheduledCount: 0,
  };

  try {
    enabled = await readEnabledSetting();
  } catch (error) {
    errors.push(`setting read failed: ${getErrorText(error)}`);
  }

  try {
    poll = await loadPollDiagnostics();
  } catch (error) {
    errors.push(`poll diagnostics read failed: ${getErrorText(error)}`);
  }

  if (Platform.OS !== "android") {
    return {
      supported: false,
      enabled,
      permissionCanAskAgain: false,
      permissionGranted: false,
      permissionStatus: "unsupported",
      backgroundAvailable: false,
      backgroundStatus: "unsupported",
      taskRegistered: false,
      channelId: NOTIFICATION_CHANNEL_ID,
      poll,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  }

  let canAskPermissionAgain = false;
  let permissionGranted = false;
  let permissionStatus = "unknown";
  let backgroundAvailable = false;
  let backgroundStatus = "unknown";
  let taskRegistered = false;

  try {
    const permission = await Notifications.getPermissionsAsync();
    canAskPermissionAgain = permissionCanAskAgain(permission);
    permissionGranted = permissionAllowsNotifications(permission);
    permissionStatus = permissionStatusText(permission);
  } catch (error) {
    errors.push(`permission check failed: ${getErrorText(error)}`);
  }

  try {
    const status = await BackgroundTask.getStatusAsync();
    backgroundAvailable =
      status === BackgroundTask.BackgroundTaskStatus.Available;
    backgroundStatus = String(status);
  } catch (error) {
    errors.push(`background status failed: ${getErrorText(error)}`);
  }

  try {
    taskRegistered = await TaskManager.isTaskRegisteredAsync(POLL_TASK_NAME);
  } catch (error) {
    errors.push(`task registration check failed: ${getErrorText(error)}`);
  }

  return {
    supported: true,
    enabled,
    permissionCanAskAgain: canAskPermissionAgain,
    permissionGranted,
    permissionStatus,
    backgroundAvailable,
    backgroundStatus,
    taskRegistered,
    channelId: NOTIFICATION_CHANNEL_ID,
    poll,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

export async function setNotificationEnabled(
  enabled: boolean,
  ctx?: LotideContext,
): Promise<void> {
  if (!enabled) {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(false));
    await registerNotificationPollTask();
    return;
  }

  if (!ctx?.login) {
    throw new Error("Sign in before enabling Lotide notifications.");
  }

  await ensureNotificationActivationReady();

  await storeCurrentNotificationBaseline(ctx);

  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(true));

  try {
    await registerNotificationPollTask({ requireAvailable: true });
  } catch (error) {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(false));
    throw error;
  }
}

export async function sendTestNotification(): Promise<string> {
  if (Platform.OS !== "android") {
    throw new Error("Local notification tests are only available on Android.");
  }

  await ensureNotificationActivationReady();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Hoot notification test",
      body: "Local Android notifications are working.",
      sound: "default",
      data: {
        lotideKind: "diagnostic_test",
      },
    },
    trigger: { channelId: NOTIFICATION_CHANNEL_ID },
  });
}

export async function pollNotificationsNow(ctx: LotideContext): Promise<number> {
  if (Platform.OS !== "android") {
    return 0;
  }

  return runPollAndNotifyForContext(ctx);
}

/* end of LotideNotificationPoller.ts */
