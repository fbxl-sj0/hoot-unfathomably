/*
    Project: Hoot Unfathomably
    --------------------------

    Poll the signed-in Unfathomably account for Mastodon-compatible
    notifications and surface newly observed items as local Android alerts.
*/

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import * as StorageService from "./StorageService";
import * as UnfathomablyService from "./UnfathomablyService";
import { logError } from "../utils/debugLog";

const POLL_TASK_NAME = "hoot-unfathomably-notification-poll";
const SETTINGS_KEY = "@hoot_unfathomably/notification_background_enabled";
const STATE_KEY = "@hoot_unfathomably/notification_poll_state";
const DIAGNOSTICS_KEY = "@hoot_unfathomably/notification_poll_diagnostics";
const NOTIFICATION_CHANNEL_ID = "hoot-unfathomably-notifications-v1";

const LEGACY_POLL_TASK_NAME = "hoot-mobile-lotide-notification-poll";
const LEGACY_SETTINGS_KEY = "@lotide_notification_background_enabled";
const LEGACY_STATE_KEY = "@lotide_notification_poll_state";
const LEGACY_DIAGNOSTICS_KEY = "@lotide_notification_poll_diagnostics";
const LEGACY_CHANNEL_IDS = [
  "lotide-notifications",
  "lotide-notifications-v2",
] as const;

const POLL_INTERVAL_MINUTES = 15;
const MAX_TRACKED_NOTIFICATION_IDS = 250;
const MAX_INDIVIDUAL_NOTIFICATIONS_PER_POLL = 5;
const NOTIFICATION_TITLE_MAX_LENGTH = 80;
const NOTIFICATION_BODY_MAX_LENGTH = 180;

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

type NotificationState = Record<string, NotificationStateEntry>;

export type NotificationPollDiagnostics = {
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastScheduledAt?: string;
  lastScheduledCount: number;
  lastSkippedReason?: "disabled" | "no_context" | "permission_denied";
};

export type NotificationPollTaskRegistrationResult =
  | "registered"
  | "unregistered"
  | "unchanged"
  | "unavailable"
  | "skipped";

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
      screen: "Status";
      params: { statusId: string };
    }
  | {
      screen: "Notifications";
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (value === null) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseBoolean(value: string | null): boolean {
  if (value === null) return false;

  try {
    return JSON.parse(value) === true;
  } catch {
    return false;
  }
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return undefined;
  }

  return value;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return undefined;
}

function normalizePollDiagnostics(
  value: unknown,
): NotificationPollDiagnostics {
  if (!isObject(value)) return { lastScheduledCount: 0 };

  const skippedReason =
    value.lastSkippedReason === "disabled" ||
    value.lastSkippedReason === "no_context" ||
    value.lastSkippedReason === "permission_denied"
      ? value.lastSkippedReason
      : undefined;

  return {
    lastAttemptAt: asIsoTimestamp(value.lastAttemptAt),
    lastSuccessAt: asIsoTimestamp(value.lastSuccessAt),
    lastError:
      typeof value.lastError === "string" ? value.lastError : undefined,
    lastScheduledAt: asIsoTimestamp(value.lastScheduledAt),
    lastScheduledCount:
      asNonNegativeInteger(value.lastScheduledCount) ?? 0,
    lastSkippedReason: skippedReason,
  };
}

async function loadPollDiagnostics(): Promise<NotificationPollDiagnostics> {
  return normalizePollDiagnostics(
    parseJsonObject(await AsyncStorage.getItem(DIAGNOSTICS_KEY)),
  );
}

async function updatePollDiagnostics(
  patch: Partial<NotificationPollDiagnostics>,
): Promise<void> {
  const next = {
    ...(await loadPollDiagnostics()),
    ...patch,
  };

  await AsyncStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next));
}

async function recordPollResult(
  attemptAt: string,
  scheduledCount: number,
  skippedReason?: NotificationPollDiagnostics["lastSkippedReason"],
): Promise<void> {
  await updatePollDiagnostics({
    lastAttemptAt: attemptAt,
    lastSuccessAt: attemptAt,
    lastError: undefined,
    lastScheduledCount: scheduledCount,
    lastScheduledAt:
      scheduledCount > 0
        ? attemptAt
        : (await loadPollDiagnostics()).lastScheduledAt,
    lastSkippedReason: skippedReason,
  });
}

async function recordPollFailure(
  attemptAt: string,
  error: unknown,
): Promise<void> {
  await updatePollDiagnostics({
    lastAttemptAt: attemptAt,
    lastError: getErrorText(error),
    lastScheduledCount: 0,
    lastSkippedReason: undefined,
  });
}

async function readEnabledSetting(): Promise<boolean> {
  const current = await AsyncStorage.getItem(SETTINGS_KEY);
  if (current !== null) return parseBoolean(current);

  const legacy = await AsyncStorage.getItem(LEGACY_SETTINGS_KEY);
  if (legacy === null) return false;

  const enabled = parseBoolean(legacy);
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(enabled));
  await AsyncStorage.removeItem(LEGACY_SETTINGS_KEY);
  return enabled;
}

async function cleanupLegacyNotificationArtifacts(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(LEGACY_POLL_TASK_NAME)) {
      await BackgroundTask.unregisterTaskAsync(LEGACY_POLL_TASK_NAME);
    }
  } catch {
    // A stale task must not prevent the replacement task from registering.
  }

  await Promise.all([
    AsyncStorage.removeItem(LEGACY_STATE_KEY),
    AsyncStorage.removeItem(LEGACY_DIAGNOSTICS_KEY),
  ]);

  if (Platform.OS !== "android") return;

  await Promise.all(
    LEGACY_CHANNEL_IDS.map(async channelId => {
      try {
        await Notifications.deleteNotificationChannelAsync(channelId);
      } catch {
        // Missing or OS-managed legacy channels are harmless.
      }
    }),
  );
}

function buildAccountKey(ctx: LotideContext): string {
  const user = ctx.login?.user as unknown as
    | UnfathomablyService.UnfathomablyAccount
    | undefined;
  const identity = user?.id || user?.acct || user?.username || "unknown";
  return `${ctx.apiUrl || "unknown-server"}::${identity}`;
}

function normalizeNotificationStateEntry(
  value: unknown,
): NotificationStateEntry | undefined {
  if (!isObject(value)) return undefined;

  return {
    initialized: value.initialized === true,
    ids: Array.isArray(value.ids)
      ? value.ids.filter(
          (item: unknown): item is string => typeof item === "string",
        )
      : [],
  };
}

async function loadNotificationState(): Promise<NotificationState> {
  const raw = parseJsonObject(await AsyncStorage.getItem(STATE_KEY));
  const state: NotificationState = {};

  for (const [key, value] of Object.entries(raw)) {
    const entry = normalizeNotificationStateEntry(value);
    if (entry) state[key] = entry;
  }

  return state;
}

async function getNotificationStateEntry(
  accountKey: string,
): Promise<NotificationStateEntry> {
  const state = await loadNotificationState();
  return state[accountKey] ?? { initialized: false, ids: [] };
}

async function setNotificationStateEntry(
  accountKey: string,
  entry: NotificationStateEntry,
): Promise<void> {
  const state = await loadNotificationState();
  state[accountKey] = entry;
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function trackedNotificationIds(
  currentIds: string[],
  previousIds: string[] = [],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const id of [...currentIds, ...previousIds]) {
    if (ids.length >= MAX_TRACKED_NOTIFICATION_IDS) break;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

async function storeCurrentNotificationBaseline(
  ctx: LotideContext,
): Promise<void> {
  const notifications = await UnfathomablyService.getNotifications(ctx);
  await setNotificationStateEntry(buildAccountKey(ctx), {
    initialized: true,
    ids: trackedNotificationIds(notifications.map(item => item.id)),
  });
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (match, entity: string) => {
      const lower = entity.toLowerCase();
      if (entities[lower] !== undefined) return entities[lower];

      const radix = lower.startsWith("#x") ? 16 : 10;
      const numberText = lower.startsWith("#x")
        ? lower.slice(2)
        : lower.startsWith("#")
          ? lower.slice(1)
          : "";
      if (!numberText) return match;

      const codePoint = Number.parseInt(numberText, radix);
      if (!Number.isFinite(codePoint)) return match;

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    },
  );
}

function plainStatusText(status?: UnfathomablyService.UnfathomablyStatus) {
  if (!status) return undefined;
  if (status.sensitive) {
    const warning = collapseWhitespace(status.spoiler_text || "");
    return warning ? `Content warning: ${warning}` : "Sensitive post";
  }

  const text = decodeHtmlEntities(
    status.content
      .replace(/<\s*br\s*\/?\s*>/gi, " ")
      .replace(/<\/\s*(blockquote|div|h[1-6]|li|p)\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  );
  const collapsed = collapseWhitespace(text);
  if (!collapsed) return undefined;

  return collapsed.length <= NOTIFICATION_BODY_MAX_LENGTH
    ? collapsed
    : `${collapsed
        .slice(0, NOTIFICATION_BODY_MAX_LENGTH - 3)
        .trimEnd()}...`;
}

function actorName(
  account: UnfathomablyService.UnfathomablyAccount,
): string {
  const name = collapseWhitespace(
    account.display_name || account.acct || account.username || "Someone",
  );
  return name.length <= NOTIFICATION_TITLE_MAX_LENGTH
    ? name
    : `${name.slice(0, NOTIFICATION_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

function notificationContent(
  notification: UnfathomablyService.UnfathomablyNotification,
) {
  const actor = actorName(notification.account);
  const titles: Record<string, string> = {
    favourite: `${actor} favourited your post`,
    follow: `${actor} followed you`,
    follow_request: `${actor} requested to follow you`,
    group_follow: `${actor} followed your group`,
    mention: `${actor} mentioned you`,
    poll: "A poll you participated in has ended",
    reblog: `${actor} boosted your post`,
    status: `${actor} posted a new status`,
  };
  const readableType = notification.type.replace(/[_-]+/g, " ");

  return {
    title:
      titles[notification.type] ??
      `New ${readableType || "account"} notification`,
    body:
      plainStatusText(notification.status) ??
      `Open Hoot Unfathomably to view activity from @${notification.account.acct}.`,
    sound: "default" as const,
    data: {
      hootNotificationId: notification.id,
      hootNotificationKind: notification.type,
      hootStatusId: notification.status?.id,
    },
  };
}

function summaryNotificationContent(extraCount: number) {
  return {
    title: "New Hoot Unfathomably notifications",
    body:
      extraCount === 1
        ? "1 more notification is waiting."
        : `${extraCount} more notifications are waiting.`,
    sound: "default" as const,
    data: {
      hootNotificationKind: "notification_summary",
    },
  };
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

function permissionStatusText(
  permission: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>,
): string {
  return typeof permission.status === "string"
    ? permission.status
    : permission.granted
      ? "granted"
      : "unknown";
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: "Hoot Unfathomably notifications",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (permissionAllowsNotifications(existing)) return true;

  const requested = await Notifications.requestPermissionsAsync(
    Platform.OS === "android" ? { android: {} } : undefined,
  );
  return permissionAllowsNotifications(requested);
}

async function ensureNotificationActivationReady(): Promise<void> {
  await ensureChannel();

  if (!(await requestNotificationPermission())) {
    throw new Error(
      "Notifications are blocked for Hoot Unfathomably. Open Android notification settings, allow notifications, then try again.",
    );
  }
}

async function runPollAndNotifyForContext(
  ctx: LotideContext,
): Promise<number> {
  const attemptAt = new Date().toISOString();

  try {
    if (!(await readEnabledSetting())) {
      await recordPollResult(attemptAt, 0, "disabled");
      return 0;
    }

    const permission = await Notifications.getPermissionsAsync();
    if (!permissionAllowsNotifications(permission)) {
      await recordPollResult(attemptAt, 0, "permission_denied");
      return 0;
    }

    const accountKey = buildAccountKey(ctx);
    const accountState = await getNotificationStateEntry(accountKey);
    const knownIds = new Set(accountState.ids);
    const notifications = await UnfathomablyService.getNotifications(ctx);
    const currentIds = notifications.map(item => item.id);
    const nextIds = trackedNotificationIds(currentIds, accountState.ids);
    const candidates = accountState.initialized
      ? notifications.filter(item => !knownIds.has(item.id))
      : [];

    await setNotificationStateEntry(accountKey, {
      initialized: true,
      ids: nextIds,
    });

    if (candidates.length === 0) {
      await recordPollResult(attemptAt, 0);
      return 0;
    }

    await ensureChannel();

    const individualCandidates = candidates.slice(
      0,
      MAX_INDIVIDUAL_NOTIFICATIONS_PER_POLL,
    );
    const requests = individualCandidates.map(notification =>
      Notifications.scheduleNotificationAsync({
        content: notificationContent(notification),
        trigger: { channelId: NOTIFICATION_CHANNEL_ID },
      }),
    );
    const hiddenCount = candidates.length - individualCandidates.length;

    if (hiddenCount > 0) {
      requests.push(
        Notifications.scheduleNotificationAsync({
          content: summaryNotificationContent(hiddenCount),
          trigger: { channelId: NOTIFICATION_CHANNEL_ID },
        }),
      );
    }

    await Promise.all(requests);
    await recordPollResult(attemptAt, requests.length);
    return requests.length;
  } catch (error) {
    await recordPollFailure(attemptAt, error);
    throw error;
  }
}

TaskManager.defineTask(POLL_TASK_NAME, async () => {
  try {
    const ctx = await StorageService.lotideContext.query();
    if (!ctx?.login) {
      await recordPollResult(new Date().toISOString(), 0, "no_context");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    await runPollAndNotifyForContext(ctx);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    logError("Hoot Unfathomably notification poll failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerNotificationPollTask(
  options: { requireAvailable?: boolean } = {},
): Promise<NotificationPollTaskRegistrationResult> {
  if (Platform.OS !== "android") return "skipped";

  await cleanupLegacyNotificationArtifacts();
  const enabled = await readEnabledSetting();
  const alreadyRegistered =
    await TaskManager.isTaskRegisteredAsync(POLL_TASK_NAME);

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
        "Android background tasks are restricted for Hoot Unfathomably. Check the app's battery settings and try again.",
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

export async function getNotificationEnabled(): Promise<boolean> {
  return readEnabledSetting();
}

export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  const errors: string[] = [];
  let enabled = false;
  let poll: NotificationPollDiagnostics = { lastScheduledCount: 0 };

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

  let permissionCanAsk = false;
  let permissionGranted = false;
  let permissionStatus = "unknown";
  let backgroundAvailable = false;
  let backgroundStatus = "unknown";
  let taskRegistered = false;

  try {
    const permission = await Notifications.getPermissionsAsync();
    permissionCanAsk = permissionCanAskAgain(permission);
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
    permissionCanAskAgain: permissionCanAsk,
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
    throw new Error(
      "Sign in to an Unfathomably account before enabling notifications.",
    );
  }

  await cleanupLegacyNotificationArtifacts();
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

  await cleanupLegacyNotificationArtifacts();
  await ensureNotificationActivationReady();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Hoot Unfathomably notification test",
      body: "Local Android notifications are working.",
      sound: "default",
      data: {
        hootNotificationKind: "diagnostic_test",
      },
    },
    trigger: { channelId: NOTIFICATION_CHANNEL_ID },
  });
}

export async function pollNotificationsNow(
  ctx: LotideContext,
): Promise<number> {
  if (Platform.OS !== "android") return 0;
  return runPollAndNotifyForContext(ctx);
}

function stringDataValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getNotificationNavigationTarget(
  data: Record<string, unknown>,
): NotificationNavigationTarget | undefined {
  const statusId = stringDataValue(data.hootStatusId);
  if (statusId) {
    return {
      screen: "Status",
      params: { statusId },
    };
  }

  const kind = stringDataValue(data.hootNotificationKind);
  if (kind && kind !== "diagnostic_test") {
    return { screen: "Notifications" };
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
  return data ? getNotificationNavigationTarget(data) : undefined;
}

export function getLastNotificationNavigationTarget():
  | NotificationNavigationTarget
  | undefined {
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
    if (target) listener(target);
  });
}

export function clearLastNotificationResponse(): void {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // The native response cache is unavailable in some test/web environments.
  }
}

/* end of NotificationPoller.ts */
