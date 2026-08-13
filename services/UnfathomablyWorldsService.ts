/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyWorldsService.ts

    Purpose:

        Provide the mobile client boundary for Unfathomably Worlds.

    Responsibilities:

        - Load bounded native-object timelines and discovery results
        - Validate the provider-neutral discovery envelopes
        - Resolve an explicitly selected public object for local viewing
        - Load the server-owned workflow capability manifest

    This file intentionally does NOT contain:

        - React state or presentation code
        - direct provider or federation requests
        - native-object authoring forms
*/

import {
  isWorldFamily,
  WorldFamily,
} from "../constants/Worlds";
import {
  query,
  request,
  UnfathomablyStatus,
} from "./UnfathomablyService";

const WORLD_PAGE_SIZE = 20;
const DISCOVERY_PAGE_SIZE = 12;
const MAX_DISCOVERY_OFFSET = 10_000;
const MAX_DISCOVERY_TEXT_LENGTH = 2_048;
const UNAVAILABLE_STATUSES = new Set([404, 405, 410, 501]);

export type WorldDiscoveryField =
  | string
  | number
  | boolean
  | (string | number | boolean)[];

export type WorldDiscoveryItem = {
  id: string;
  family: string;
  kind: string;
  title: string;
  summary?: string;
  url: string;
  activitypubUrl?: string;
  imageUrl?: string;
  sourceHost?: string;
  statusId?: string;
  fields: Record<string, WorldDiscoveryField>;
};

export type WorldDiscoveryProvider = {
  host?: string;
  status: "ready" | "unavailable";
  type?: string;
};

export type WorldDiscoveryPage = {
  items: WorldDiscoveryItem[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
  providers: WorldDiscoveryProvider[];
};

export type WorldWorkflow = {
  family: Exclude<WorldFamily, "all">;
  actions: string[];
  creation: string[];
  objects: string[];
  platforms: string[];
};

export type WorldWorkflowManifest = {
  version: number;
  workflows: WorldWorkflow[];
};

export type NativeResolvedResource = {
  canonicalUrl: string;
  family: string;
  fields: Record<string, WorldDiscoveryField>;
  kind?: string;
  platform: string;
  sourceHost: string;
  sourceUrl: string;
  summary?: string;
  title: string;
  type: string;
};

export type NativeObjectResolution =
  | { resultType: "status"; status: UnfathomablyStatus }
  | { resultType: "resource"; resource: NativeResolvedResource };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  maxLength = MAX_DISCOVERY_TEXT_LENGTH,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function safeHttpUrl(value: unknown): string | undefined {
  const text = boundedString(value);
  if (!text) return undefined;

  try {
    const parsed = new URL(text);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeFieldValue(value: unknown): WorldDiscoveryField | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string"
      ? value.slice(0, MAX_DISCOVERY_TEXT_LENGTH)
      : value;
  }

  if (!Array.isArray(value)) return undefined;
  const values = value
    .filter((item): item is string | number | boolean =>
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
    )
    .map(item => typeof item === "string" ? item.slice(0, 300) : item)
    .slice(0, 20);
  return values.length > 0 ? values : undefined;
}

function normalizeFields(value: unknown): Record<string, WorldDiscoveryField> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, WorldDiscoveryField>>(
    (fields, [key, field]) => {
      if (key.length > 80) return fields;
      const normalized = normalizeFieldValue(field);
      if (normalized !== undefined) fields[key] = normalized;
      return fields;
    },
    {},
  );
}

function normalizeDiscoveryItem(value: unknown): WorldDiscoveryItem | undefined {
  if (!isRecord(value)) return undefined;

  const id = boundedString(value.id, 300);
  const title = boundedString(value.title, 500);
  const url = safeHttpUrl(value.url);
  if (!id || !title || !url) return undefined;

  const fields = normalizeFields(value.fields);
  const knownFactKeys = [
    "artist",
    "author",
    "category",
    "condition",
    "distance",
    "duration",
    "license",
    "location",
    "price",
    "rating",
    "repository",
    "state",
    "year",
  ];

  for (const key of knownFactKeys) {
    const normalized = normalizeFieldValue(value[key]);
    if (normalized !== undefined && fields[key] === undefined) {
      fields[key] = normalized;
    }
  }

  return {
    id,
    family: boundedString(value.family, 80) || "unknown",
    kind: boundedString(value.kind, 120) || "item",
    title,
    summary: boundedString(value.summary, 2_000),
    url,
    activitypubUrl:
      safeHttpUrl(value.activitypub_url) ||
      safeHttpUrl(value.canonical_object_url),
    imageUrl:
      safeHttpUrl(value.thumbnail_url) ||
      safeHttpUrl(value.preview_url) ||
      safeHttpUrl(value.image_url),
    sourceHost: boundedString(value.source_host, 255),
    statusId:
      boundedString(value.current_status_id, 200) ||
      boundedString(value.status_id, 200),
    fields,
  };
}

function normalizeProvider(value: unknown): WorldDiscoveryProvider | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status === "ready" || value.status === "unavailable"
    ? value.status
    : undefined;
  if (!status) return undefined;

  return {
    host: boundedString(value.host, 255),
    status,
    type: boundedString(value.type, 120),
  };
}

function normalizeDiscoveryPage(value: unknown): WorldDiscoveryPage {
  if (!isRecord(value)) {
    throw new Error("The server returned an invalid Worlds response.");
  }

  const items = Array.isArray(value.items)
    ? value.items.flatMap(item => {
        const normalized = normalizeDiscoveryItem(item);
        return normalized ? [normalized] : [];
      })
    : [];
  const providers = Array.isArray(value.providers)
    ? value.providers.flatMap(provider => {
        const normalized = normalizeProvider(provider);
        return normalized ? [normalized] : [];
      })
    : [];
  const total =
    typeof value.total === "number" && Number.isFinite(value.total)
      ? Math.max(0, Math.trunc(value.total))
      : items.length;
  const nextOffset =
    typeof value.next_offset === "number" &&
    Number.isInteger(value.next_offset) &&
    value.next_offset >= 0 &&
    value.next_offset <= MAX_DISCOVERY_OFFSET
      ? value.next_offset
      : undefined;

  return {
    items,
    total,
    hasMore: value.has_more === true && nextOffset !== undefined,
    nextOffset,
    providers,
  };
}

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap(item => {
      const normalized = boundedString(item, 300);
      return normalized ? [normalized] : [];
    })
    .slice(0, limit);
}

function normalizeWorkflowManifest(value: unknown): WorldWorkflowManifest {
  if (!isRecord(value) || !Array.isArray(value.workflows)) {
    throw new Error("The server returned an invalid Worlds manifest.");
  }

  const workflows = value.workflows.flatMap(workflow => {
    if (!isRecord(workflow) || !isWorldFamily(workflow.family)) return [];
    if (workflow.family === "all") return [];

    return [{
      family: workflow.family,
      actions: normalizeStringList(workflow.actions || workflow.participation, 20),
      creation: normalizeStringList(workflow.creation, 20),
      objects: normalizeStringList(workflow.objects, 30),
      platforms: normalizeStringList(workflow.platforms, 30),
    }];
  });

  return {
    version:
      typeof value.version === "number" && Number.isInteger(value.version)
        ? Math.max(1, value.version)
        : 1,
    workflows,
  };
}

function normalizeResource(value: unknown): NativeResolvedResource | undefined {
  if (!isRecord(value)) return undefined;

  const canonicalUrl = safeHttpUrl(value.canonical_url);
  const sourceUrl = safeHttpUrl(value.source_url);
  const family = boundedString(value.family, 80);
  const platform = boundedString(value.platform, 120);
  const sourceHost = boundedString(value.source_host, 255);
  const title = boundedString(value.title, 500);
  const type = boundedString(value.type, 160);
  if (
    !canonicalUrl ||
    !sourceUrl ||
    !family ||
    !platform ||
    !sourceHost ||
    !title ||
    !type
  ) {
    return undefined;
  }

  return {
    canonicalUrl,
    family,
    fields: normalizeFields(value.fields),
    kind: boundedString(value.kind, 120),
    platform,
    sourceHost,
    sourceUrl,
    summary: boundedString(value.summary, 2_000),
    title,
    type,
  };
}

function rethrowWorldsUnavailable(error: unknown): never {
  const status = (error as Error & { status?: number })?.status;
  if (status && UNAVAILABLE_STATUSES.has(status)) {
    throw new Error("Worlds are not available on this server.");
  }
  throw error;
}

export async function getWorldTimeline(
  ctx: LotideContext,
  family: WorldFamily,
  maxId?: string,
): Promise<UnfathomablyStatus[]> {
  try {
    const endpoint = family === "groups"
      ? "/api/v1/timelines/groups"
      : "/api/v1/timelines/public";
    const statuses = await request<UnfathomablyStatus[]>(
      ctx,
      `${endpoint}${query({
        discover: family === "groups" || undefined,
        limit: WORLD_PAGE_SIZE,
        max_id: maxId,
        native_family:
          family !== "all" && family !== "groups" ? family : undefined,
        only_native: family !== "groups" || undefined,
      })}`,
    );

    if (!Array.isArray(statuses)) {
      throw new Error("The server returned an invalid Worlds timeline.");
    }

    return statuses.filter(status => {
      if (!status || typeof status.id !== "string") return false;
      if (family === "groups") return !!(status.group || status.reblog?.group);
      const visible = status.reblog || status;
      return !!visible.pleroma?.native;
    });
  } catch (error) {
    rethrowWorldsUnavailable(error);
  }
}

export async function searchWorlds(
  ctx: LotideContext,
  family: WorldFamily,
  search: string,
  offset = 0,
): Promise<WorldDiscoveryPage> {
  const boundedOffset = Number.isFinite(offset)
    ? Math.max(0, Math.min(Math.trunc(offset), MAX_DISCOVERY_OFFSET))
    : 0;

  try {
    const response = await request<unknown>(
      ctx,
      `/api/v1/discovery/native${query({
        family,
        limit: DISCOVERY_PAGE_SIZE,
        offset: boundedOffset,
        q: search.trim().slice(0, 200),
      })}`,
    );
    return normalizeDiscoveryPage(response);
  } catch (error) {
    rethrowWorldsUnavailable(error);
  }
}

export async function getWorldWorkflows(
  ctx: LotideContext,
): Promise<WorldWorkflowManifest> {
  try {
    return normalizeWorkflowManifest(
      await request<unknown>(ctx, "/api/v1/discovery/native/workflows"),
    );
  } catch (error) {
    rethrowWorldsUnavailable(error);
  }
}

export async function resolveNativeObject(
  ctx: LotideContext,
  url: string,
): Promise<NativeObjectResolution> {
  const supportedUrl = safeHttpUrl(url);
  if (!supportedUrl) {
    throw new Error("Enter a complete HTTP or HTTPS object URL.");
  }

  try {
    const response = await request<unknown>(
      ctx,
      `/api/v1/discovery/native-objects/resolve${query({ q: supportedUrl })}`,
    );
    if (!isRecord(response)) {
      throw new Error("The server returned an invalid native object.");
    }

    if (
      response.result_type === "status" &&
      isRecord(response.status) &&
      typeof response.status.id === "string" &&
      isRecord(response.status.account)
    ) {
      return {
        resultType: "status",
        status: response.status as UnfathomablyStatus,
      };
    }

    if (response.result_type === "resource") {
      const resource = normalizeResource(response.resource);
      if (resource) return { resultType: "resource", resource };
    }

    throw new Error("The server returned an invalid native object.");
  } catch (error) {
    rethrowWorldsUnavailable(error);
  }
}

/* end of UnfathomablyWorldsService.ts */
