/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeDraftService.ts

    Purpose:

        Persist complete, account-scoped composer drafts on the device.

    Responsibilities:

        - Model every portable composer field required to resume work
        - Defensively parse and bound long-lived draft records
        - Keep drafts isolated from credentials and other saved accounts
        - Provide deterministic create, update, list, and remove operations

    This file intentionally does NOT contain:

        - network publishing or scheduling
        - React state
        - media file contents
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

import { accountStoreKeyForContext } from "./StorageService";
import type { QuoteParameter } from "./UnfathomablyService";

export type ComposeDraftPoll = {
  expiresIn: number;
  multiple: boolean;
  options: string[];
};

export type ComposeDraftMedia = {
  description: string;
  id?: string;
  mimeType?: string;
  name?: string;
  uri?: string;
};

export type ComposeDraft = {
  id: string;
  content: string;
  contentWarning: string;
  contentWarningEnabled: boolean;
  createdAt: number;
  groupId?: string;
  groupName?: string;
  inReplyToId?: string;
  language?: string;
  media: ComposeDraftMedia[];
  poll: ComposeDraftPoll;
  pollEnabled: boolean;
  quoteId?: string;
  quoteParameter?: QuoteParameter;
  scheduledAt?: string;
  sensitive: boolean;
  targetAccountKeys: string[];
  updatedAt: number;
  visibility: string;
};

type StoredDrafts = {
  drafts: unknown[];
  version: number;
};

const DRAFT_KEY_PREFIX = "@hoot.compose_drafts.v1.";
const DRAFT_VERSION = 1;
const MAX_DRAFTS_PER_ACCOUNT = 50;
const MAX_CONTENT_LENGTH = 5_000;
const MAX_CONTENT_WARNING_LENGTH = 500;
const MAX_IDENTIFIER_LENGTH = 512;
const MAX_LANGUAGE_LENGTH = 16;
const MAX_MEDIA_ITEMS = 4;
const MAX_MEDIA_DESCRIPTION_LENGTH = 1_500;
const MAX_POLL_OPTIONS = 4;
const MAX_POLL_OPTION_LENGTH = 500;
const MAX_TARGET_ACCOUNTS = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function optionalString(value: unknown, maximum: number): string | undefined {
  const bounded = boundedString(value, maximum).trim();
  return bounded || undefined;
}

function boundedTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : fallback;
}

function normalizeVisibility(value: unknown): string {
  return value === "direct" ||
    value === "private" ||
    value === "unlisted" ||
    value === "public"
    ? value
    : "public";
}

function normalizePoll(value: unknown): ComposeDraftPoll {
  const poll = isRecord(value) ? value : {};
  const options = Array.isArray(poll.options)
    ? poll.options
        .filter((option): option is string => typeof option === "string")
        .slice(0, MAX_POLL_OPTIONS)
        .map(option => option.slice(0, MAX_POLL_OPTION_LENGTH))
    : ["", ""];

  while (options.length < 2) options.push("");

  const rawExpiry = typeof poll.expiresIn === "number" &&
    Number.isFinite(poll.expiresIn)
    ? poll.expiresIn
    : 86_400;

  return {
    expiresIn: Math.max(300, Math.min(Math.trunc(rawExpiry), 2_592_000)),
    multiple: poll.multiple === true,
    options,
  };
}

function normalizeMedia(value: unknown): ComposeDraftMedia[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .slice(0, MAX_MEDIA_ITEMS)
    .map(item => ({
      description: boundedString(
        item.description,
        MAX_MEDIA_DESCRIPTION_LENGTH,
      ),
      id: optionalString(item.id, MAX_IDENTIFIER_LENGTH),
      mimeType: optionalString(item.mimeType, 200),
      name: optionalString(item.name, 500),
      uri: optionalString(item.uri, 4_096),
    }))
    .filter(item => item.id !== undefined || item.uri !== undefined);
}

function normalizeTargetAccounts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim().slice(0, 1_024))
      .filter(Boolean),
  )).slice(0, MAX_TARGET_ACCOUNTS);
}

export function normalizeComposeDraft(
  value: unknown,
  now = Date.now(),
): ComposeDraft | undefined {
  if (!isRecord(value)) return undefined;

  const id = optionalString(value.id, MAX_IDENTIFIER_LENGTH);
  if (!id) return undefined;

  const createdAt = boundedTimestamp(value.createdAt, now);
  const quoteParameter = value.quoteParameter === "quoted_status_id"
    ? "quoted_status_id"
    : value.quoteParameter === "quote_id"
      ? "quote_id"
      : undefined;
  const scheduledAt = optionalString(value.scheduledAt, 64);

  return {
    id,
    content: boundedString(value.content, MAX_CONTENT_LENGTH),
    contentWarning: boundedString(
      value.contentWarning,
      MAX_CONTENT_WARNING_LENGTH,
    ),
    contentWarningEnabled: value.contentWarningEnabled === true,
    createdAt,
    groupId: optionalString(value.groupId, MAX_IDENTIFIER_LENGTH),
    groupName: optionalString(value.groupName, 500),
    inReplyToId: optionalString(value.inReplyToId, MAX_IDENTIFIER_LENGTH),
    language: optionalString(value.language, MAX_LANGUAGE_LENGTH),
    media: normalizeMedia(value.media),
    poll: normalizePoll(value.poll),
    pollEnabled: value.pollEnabled === true,
    quoteId: optionalString(value.quoteId, MAX_IDENTIFIER_LENGTH),
    quoteParameter,
    scheduledAt,
    sensitive: value.sensitive === true,
    targetAccountKeys: normalizeTargetAccounts(value.targetAccountKeys),
    updatedAt: boundedTimestamp(value.updatedAt, createdAt),
    visibility: normalizeVisibility(value.visibility),
  };
}

function draftKey(ctx: LotideContext): string | undefined {
  const accountKey = accountStoreKeyForContext(ctx);
  return accountKey
    ? `${DRAFT_KEY_PREFIX}${encodeURIComponent(accountKey)}`
    : undefined;
}

async function readDrafts(ctx: LotideContext): Promise<ComposeDraft[]> {
  const key = draftKey(ctx);
  if (!key) return [];

  const encoded = await AsyncStorage.getItem(key);
  if (encoded === null) return [];

  try {
    const parsed = JSON.parse(encoded) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== DRAFT_VERSION ||
      !Array.isArray(parsed.drafts)
    ) {
      throw new Error("Invalid composer draft store.");
    }

    const seen = new Set<string>();
    return parsed.drafts
      .map(item => normalizeComposeDraft(item))
      .filter((item): item is ComposeDraft => {
        if (!item || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_DRAFTS_PER_ACCOUNT);
  } catch {
    await AsyncStorage.removeItem(key);
    return [];
  }
}

async function writeDrafts(
  ctx: LotideContext,
  drafts: ComposeDraft[],
): Promise<void> {
  const key = draftKey(ctx);
  if (!key) return;

  await AsyncStorage.setItem(key, JSON.stringify({
    drafts: drafts.slice(0, MAX_DRAFTS_PER_ACCOUNT),
    version: DRAFT_VERSION,
  } satisfies StoredDrafts));
}

/* ------------------------------------------------------------------------- */
/* Public draft operations                                                   */
/* ------------------------------------------------------------------------- */

export function createComposeDraft(
  id: string,
  initial: Partial<ComposeDraft> = {},
  now = Date.now(),
): ComposeDraft {
  const draft = normalizeComposeDraft({
    content: "",
    contentWarning: "",
    contentWarningEnabled: false,
    createdAt: now,
    id,
    media: [],
    poll: {
      expiresIn: 86_400,
      multiple: false,
      options: ["", ""],
    },
    pollEnabled: false,
    sensitive: false,
    targetAccountKeys: [],
    updatedAt: now,
    visibility: initial.groupId ? "unlisted" : "public",
    ...initial,
  }, now);

  if (!draft) throw new Error("A composer draft requires an identifier.");
  return draft;
}

export function isMeaningfulComposeDraft(draft: ComposeDraft): boolean {
  return draft.content.trim().length > 0 ||
    draft.contentWarning.trim().length > 0 ||
    draft.media.length > 0 ||
    (draft.pollEnabled && draft.poll.options.some(option => option.trim()));
}

export const composeDrafts = {
  async list(ctx: LotideContext): Promise<ComposeDraft[]> {
    return readDrafts(ctx);
  },

  async query(
    ctx: LotideContext,
    id: string,
  ): Promise<ComposeDraft | undefined> {
    const normalizedId = id.trim().slice(0, MAX_IDENTIFIER_LENGTH);
    if (!normalizedId) return undefined;
    return (await readDrafts(ctx)).find(draft => draft.id === normalizedId);
  },

  async store(
    ctx: LotideContext,
    draft: ComposeDraft,
  ): Promise<ComposeDraft> {
    const now = Date.now();
    const normalized = normalizeComposeDraft({
      ...draft,
      updatedAt: now,
    }, now);
    if (!normalized) throw new Error("Cannot save a draft without an identifier.");

    const existing = await readDrafts(ctx);
    await writeDrafts(ctx, [
      normalized,
      ...existing.filter(item => item.id !== normalized.id),
    ]);
    return normalized;
  },

  async remove(ctx: LotideContext, id: string): Promise<void> {
    const existing = await readDrafts(ctx);
    await writeDrafts(
      ctx,
      existing.filter(item => item.id !== id),
    );
  },

  async clear(ctx: LotideContext): Promise<void> {
    const key = draftKey(ctx);
    if (key) await AsyncStorage.removeItem(key);
  },
};

/* end of ComposeDraftService.ts */
