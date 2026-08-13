/*
    Project: Hoot Unfathomably
    --------------------------

    File: OfflineCacheService.ts

    Purpose:

        Keep bounded account-specific timeline and notification snapshots for
        useful startup and reading when the selected server is unreachable.

    Responsibilities:

        - Isolate cached social data by canonical server and account identity
        - Validate and repair long-lived cache records before returning them
        - Bound both item counts and serialized storage use
        - Remove one account's snapshots without touching saved credentials

    This file intentionally does NOT contain:

        - bearer tokens or other credentials
        - network requests
        - screen state or refresh policy
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

import { accountStoreKeyForContext } from "./StorageService";
import type {
  UnfathomablyNotification,
  UnfathomablyStatus,
} from "./UnfathomablyService";

export type TimelineCacheScope =
  | "groups"
  | "home"
  | `group:${string}`
  | `list:${string}`
  | `source:${string}`;

export type OfflineSnapshot<T> = {
  items: T[];
  storedAt: number;
};

type StoredSnapshot = {
  items: unknown[];
  storedAt: number;
  version: number;
};

const CACHE_KEY_PREFIX = "@hoot.offline.v1.";
const CACHE_VERSION = 1;
const MAX_TIMELINE_ITEMS = 120;
const MAX_NOTIFICATION_ITEMS = 120;

/*
    AsyncStorage is app-private but device storage remains finite. A 2 MiB
    ceiling per snapshot leaves room for long posts and attachment metadata
    while ensuring a pathological server response cannot fill the application
    data partition. Items are dropped oldest-first until the snapshot fits.
*/
const MAX_SNAPSHOT_CHARACTERS = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCacheItem(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0;
}

function accountPrefix(ctx: LotideContext): string | undefined {
  const accountKey = accountStoreKeyForContext(ctx);
  if (!accountKey) return undefined;

  return `${CACHE_KEY_PREFIX}${encodeURIComponent(accountKey)}.`;
}

function cacheKey(
  ctx: LotideContext,
  kind: "notifications" | "timeline",
  scope = "all",
): string | undefined {
  const prefix = accountPrefix(ctx);
  if (!prefix) return undefined;

  return `${prefix}${kind}.${encodeURIComponent(scope)}`;
}

function deduplicate<T extends { id: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!isCacheItem(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}

function encodeSnapshot<T extends { id: string }>(
  items: T[],
  limit: number,
  storedAt: number,
): string {
  const bounded = deduplicate(items, limit);

  while (true) {
    const encoded = JSON.stringify({
      items: bounded,
      storedAt,
      version: CACHE_VERSION,
    } satisfies StoredSnapshot);

    if (
      encoded.length <= MAX_SNAPSHOT_CHARACTERS ||
      bounded.length === 0
    ) {
      return encoded;
    }

    bounded.pop();
  }
}

async function readSnapshot<T extends { id: string }>(
  key: string | undefined,
  limit: number,
): Promise<OfflineSnapshot<T> | undefined> {
  if (!key) return undefined;

  const encoded = await AsyncStorage.getItem(key);
  if (encoded === null) return undefined;

  try {
    const parsed = JSON.parse(encoded) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== CACHE_VERSION ||
      typeof parsed.storedAt !== "number" ||
      !Number.isFinite(parsed.storedAt) ||
      !Array.isArray(parsed.items)
    ) {
      throw new Error("Invalid offline snapshot.");
    }

    const items = deduplicate(
      parsed.items.filter(isCacheItem) as T[],
      limit,
    );
    return { items, storedAt: parsed.storedAt };
  } catch {
    await AsyncStorage.removeItem(key);
    return undefined;
  }
}

async function writeSnapshot<T extends { id: string }>(
  key: string | undefined,
  items: T[],
  limit: number,
): Promise<void> {
  if (!key) return;

  await AsyncStorage.setItem(
    key,
    encodeSnapshot(items, limit, Date.now()),
  );
}

/* ------------------------------------------------------------------------- */
/* Timeline snapshots                                                        */
/* ------------------------------------------------------------------------- */

export const offlineTimelines = {
  async query(
    ctx: LotideContext,
    scope: TimelineCacheScope,
  ): Promise<OfflineSnapshot<UnfathomablyStatus> | undefined> {
    return readSnapshot<UnfathomablyStatus>(
      cacheKey(ctx, "timeline", scope),
      MAX_TIMELINE_ITEMS,
    );
  },

  async store(
    ctx: LotideContext,
    scope: TimelineCacheScope,
    statuses: UnfathomablyStatus[],
  ): Promise<void> {
    await writeSnapshot(
      cacheKey(ctx, "timeline", scope),
      statuses,
      MAX_TIMELINE_ITEMS,
    );
  },

  async remove(ctx: LotideContext, scope: TimelineCacheScope): Promise<void> {
    const key = cacheKey(ctx, "timeline", scope);
    if (key) await AsyncStorage.removeItem(key);
  },
};

/* ------------------------------------------------------------------------- */
/* Notification snapshots                                                    */
/* ------------------------------------------------------------------------- */

export const offlineNotifications = {
  async query(
    ctx: LotideContext,
  ): Promise<OfflineSnapshot<UnfathomablyNotification> | undefined> {
    return readSnapshot<UnfathomablyNotification>(
      cacheKey(ctx, "notifications"),
      MAX_NOTIFICATION_ITEMS,
    );
  },

  async store(
    ctx: LotideContext,
    notifications: UnfathomablyNotification[],
  ): Promise<void> {
    await writeSnapshot(
      cacheKey(ctx, "notifications"),
      notifications,
      MAX_NOTIFICATION_ITEMS,
    );
  },
};

/* ------------------------------------------------------------------------- */
/* Cache removal                                                             */
/* ------------------------------------------------------------------------- */

export async function clearOfflineDataForAccount(
  ctx: LotideContext,
): Promise<void> {
  const prefix = accountPrefix(ctx);
  if (!prefix) return;

  const keys = (await AsyncStorage.getAllKeys()).filter(key =>
    key.startsWith(prefix),
  );
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

export async function clearAllOfflineData(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key =>
    key.startsWith(CACHE_KEY_PREFIX),
  );
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

/* end of OfflineCacheService.ts */
