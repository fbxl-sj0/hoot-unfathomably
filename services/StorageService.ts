/*
    Project: Hoot Mobile
    -------------------

    File: StorageService.ts

    Purpose:

        Persist Lotide context, saved account records, and app settings.

    Responsibilities:

        - Read and write the active context
        - Maintain keyed account storage
        - Support account removal and logout persistence
        - Keep small app preferences defensively parsed

    This file intentionally does NOT contain:

        - network requests
        - Redux reducers
*/

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { normalizeLotideApiUrl } from "./LotideService/util";

const ACTIVE_CONTEXT_KEY = "@lotide_ctx";
const ACCOUNT_CONTEXTS_KEY = "@lotide_ctx_arr";
const TOKEN_KEY_PREFIX = "hoot.auth.token.";

/* ------------------------------------------------------------------------- */
/* JSON Storage Helpers                                                      */
/* ------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  const storeStr = await AsyncStorage.getItem(path);
  if (storeStr === null) return {};

  try {
    const parsed = JSON.parse(storeStr) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    /*
        Mobile storage is long-lived and can outlast several app versions.

        If a value is corrupt, deleting that one value lets the app recover to
        a clean signed-out state instead of crashing during startup forever.
    */
  }

  await AsyncStorage.removeItem(path);
  return {};
}

function asLotideContext(value: unknown): LotideContext | undefined {
  return isRecord(value) ? normalizeLotideContext(value as LotideContext) : undefined;
}

function asLotideContextStore(
  value: Record<string, unknown>,
): { [key: string]: LotideContext } {
  const out: { [key: string]: LotideContext } = {};

  Object.entries(value).forEach(([key, ctx]) => {
    const context = asLotideContext(ctx);
    if (!context) return;

    const normalizedKey = accountStoreKeyForContext(context) ??
      normalizeAccountStoreKey(key);

    /*
        Old stores can contain both locked and unlocked copies of the same
        account under cosmetically different API URLs. Prefer the unlocked copy
        when entries collapse to the same canonical key.
    */
    if (out[normalizedKey]?.login && !context.login) return;

    out[normalizedKey] = context;
  });

  return out;
}

function normalizeLotideContext(ctx: LotideContext): LotideContext {
  if (!ctx.apiUrl) return ctx;

  const apiUrl = normalizeLotideApiUrl(ctx.apiUrl);
  return apiUrl === ctx.apiUrl ? ctx : { ...ctx, apiUrl };
}

function contextTokenKey(ctx: LotideContext): string | undefined {
  if (!ctx.apiUrl) return undefined;

  const user = ctx.login?.user as unknown as { id?: string | number; username?: string } | undefined;
  const identity = user?.username || (user?.id !== undefined ? String(user.id) : "active");
  return `${TOKEN_KEY_PREFIX}${encodeURIComponent(`${normalizeLotideApiUrl(ctx.apiUrl)}:${identity}`)}`;
}

function withoutToken(ctx: LotideContext): LotideContext {
  const normalized = normalizeLotideContext(ctx);
  if (!normalized.login?.token) return normalized;

  const { token: _token, ...login } = normalized.login;
  // The serialized shape intentionally omits the bearer token. It is restored
  // from Secure Store before a context reaches application code.
  return { ...normalized, login: login as Login };
}

async function secureContext(ctx: LotideContext): Promise<LotideContext> {
  const normalized = normalizeLotideContext(ctx);
  const tokenKey = contextTokenKey(normalized);
  const token = normalized.login?.token;

  if (token && tokenKey) {
    await SecureStore.setItemAsync(tokenKey, token);
  }

  return withoutToken(normalized);
}

async function hydrateContext(ctx: LotideContext): Promise<LotideContext> {
  const normalized = normalizeLotideContext(ctx);
  const tokenKey = contextTokenKey(normalized);
  const token = normalized.login?.token || (tokenKey ? await SecureStore.getItemAsync(tokenKey) : null);

  if (!token || !normalized.login) return withoutToken(normalized);
  return { ...withoutToken(normalized), login: { ...withoutToken(normalized).login, token } };
}

async function removeContextToken(ctx: LotideContext): Promise<void> {
  const tokenKey = contextTokenKey(normalizeLotideContext(ctx));
  if (tokenKey) await SecureStore.deleteItemAsync(tokenKey);
}

function accountStoreKeyForContext(ctx: LotideContext): string | undefined {
  if (!ctx.apiUrl || !ctx.login?.user?.username) return undefined;

  return `${ctx.login.user.username}@${normalizeLotideApiUrl(ctx.apiUrl)}`;
}

function normalizeAccountStoreKey(key: string): string {
  const separator = key.indexOf("@");
  if (separator < 0) return key;

  const username = key.slice(0, separator);
  const apiUrl = key.slice(separator + 1);

  if (!username || !apiUrl) return key;

  return `${username}@${normalizeLotideApiUrl(apiUrl)}`;
}

async function writeLotideContextStore(
  store: { [key: string]: LotideContext },
): Promise<void> {
  await AsyncStorage.setItem(ACCOUNT_CONTEXTS_KEY, JSON.stringify(store));
}

function asSortOption(value: unknown): SortOption | undefined {
  if (value === "hot" || value === "new" || value === "top") {
    return value;
  }

  return undefined;
}

/* ------------------------------------------------------------------------- */
/* Active Context Storage                                                    */
/* ------------------------------------------------------------------------- */

export const lotideContext = {
  async store(ctx: LotideContext) {
    if (!ctx.apiUrl) return lotideContext.remove();
    const persisted = await secureContext(ctx);
    return AsyncStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify(persisted));
  },
  async remove() {
    const existing = await readJsonRecord(ACTIVE_CONTEXT_KEY);
    const context = asLotideContext(existing);
    if (context) await removeContextToken(context);
    return AsyncStorage.removeItem(ACTIVE_CONTEXT_KEY);
  },
  async query(): Promise<LotideContext | undefined> {
    const raw = await readJsonRecord(ACTIVE_CONTEXT_KEY);
    if (Object.keys(raw).length === 0) return undefined;

    const context = normalizeLotideContext(raw as LotideContext);
    const hydrated = await hydrateContext(context);
    // Migrate older installs that wrote bearer tokens in AsyncStorage.
    if (context.login?.token || JSON.stringify(context) !== JSON.stringify(withoutToken(context))) {
      await lotideContext.store(hydrated);
    }
    return hydrated;
  },
};

/* ------------------------------------------------------------------------- */
/* Saved Account Storage                                                     */
/* ------------------------------------------------------------------------- */

export const lotideContextKV = {
  async store(ctx: LotideContext) {
    const normalizedCtx = normalizeLotideContext(ctx);
    const name = accountStoreKeyForContext(normalizedCtx);
    if (!name) return;

    const store = asLotideContextStore(await readJsonRecord(ACCOUNT_CONTEXTS_KEY));
    store[name] = await secureContext(normalizedCtx);
    await writeLotideContextStore(store);
  },
  async query(k: string): Promise<LotideContext | undefined> {
    const store = await lotideContextKV.getStore();
    return store[normalizeAccountStoreKey(k)];
  },
  async listKeys(): Promise<string[]> {
    return Object.keys(asLotideContextStore(await readJsonRecord(ACCOUNT_CONTEXTS_KEY)));
  },
  async remove(k: string): Promise<LotideContext | undefined> {
    const normalizedKey = normalizeAccountStoreKey(k);
    const rawStore = await readJsonRecord(ACCOUNT_CONTEXTS_KEY);
    const store = asLotideContextStore(rawStore);
    const removed = store[normalizedKey] ? await hydrateContext(store[normalizedKey]) : undefined;

    Object.keys(rawStore).forEach(key => {
      if (normalizeAccountStoreKey(key) === normalizedKey) {
        delete rawStore[key];
      }
    });
    delete store[normalizedKey];

    if (removed) await removeContextToken(removed);
    await writeLotideContextStore(asLotideContextStore(rawStore));
    return removed;
  },
  async logout(ctx: LotideContext) {
    const normalizedCtx = normalizeLotideContext(ctx);
    const name = accountStoreKeyForContext(normalizedCtx);
    if (!name) return;

    const store = asLotideContextStore(await readJsonRecord(ACCOUNT_CONTEXTS_KEY));
    store[name] = { apiUrl: normalizedCtx.apiUrl };
    await removeContextToken(normalizedCtx);
    await writeLotideContextStore(store);
  },
  async getStore(): Promise<{ [key: string]: LotideContext }> {
    const rawStore = await readJsonRecord(ACCOUNT_CONTEXTS_KEY);
    const stored = asLotideContextStore(rawStore);
    const persisted: { [key: string]: LotideContext } = {};
    const hydrated: { [key: string]: LotideContext } = {};

    for (const [key, context] of Object.entries(stored)) {
      persisted[key] = await secureContext(context);
      hydrated[key] = await hydrateContext(context);
    }

    if (JSON.stringify(rawStore) !== JSON.stringify(persisted)) {
      await writeLotideContextStore(persisted);
    }
    return hydrated;
  },
};

/* ------------------------------------------------------------------------- */
/* App Settings Storage                                                      */
/* ------------------------------------------------------------------------- */

export type AppSettings = {
  defaultFeedSort: SortOption;
};

const defaultAppSettings: AppSettings = {
  defaultFeedSort: "hot",
};

function normalizeAppSettings(value: Record<string, unknown>): AppSettings {
  return {
    defaultFeedSort:
      asSortOption(value.defaultFeedSort) ??
      defaultAppSettings.defaultFeedSort,
  };
}

export const appSettings = {
  defaults: defaultAppSettings,

  async store(settings: AppSettings) {
    await AsyncStorage.setItem("@hoot_app_settings", JSON.stringify(settings));
  },

  async query(): Promise<AppSettings> {
    return normalizeAppSettings(await readJsonRecord("@hoot_app_settings"));
  },

  async update(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await appSettings.query();
    const next = normalizeAppSettings({
      ...current,
      ...settings,
    });

    await appSettings.store(next);
    return next;
  },
};

/* end of StorageService.ts */
