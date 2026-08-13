/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyRoutesService.ts

    Purpose:

        Upload and publish GPS routes through Unfathomably's native-object API.

    Responsibilities:

        - Write a bounded GPX track into temporary app storage
        - Upload the GPX file through the normal Mastodon media endpoint
        - Publish a route with server-supported metadata fields
        - Validate returned media and status envelopes

    This file intentionally does NOT contain:

        - device location subscriptions or permission prompts
        - route draft persistence
        - direct Wanderer requests
*/

import * as FileSystem from "expo-file-system/legacy";

import {
  getSupportedServerUrl,
  request,
  UnfathomablyStatus,
} from "./UnfathomablyService";
import {
  createGpx,
  getRouteTrackMetrics,
  RoutePoint,
} from "./RouteTrackService";

const ROUTE_UPLOAD_TIMEOUT_MS = 120_000;
const UNAVAILABLE_STATUSES = new Set([404, 405, 410, 501]);

export const ROUTE_KINDS = [
  "trail",
  "hike",
  "run",
  "ride",
  "walk",
  "paddle",
  "other",
] as const;

export const ROUTE_DIFFICULTIES = [
  "easy",
  "moderate",
  "hard",
  "expert",
] as const;

export type RouteKind = typeof ROUTE_KINDS[number];
export type RouteDifficulty = typeof ROUTE_DIFFICULTIES[number];

export type PublishRouteInput = {
  content: string;
  difficulty?: RouteDifficulty;
  location?: string;
  mediaId: string;
  points: RoutePoint[];
  routeKind: RouteKind;
  spoilerText?: string;
  tags?: string;
  title: string;
  visibility: "private" | "public" | "unlisted";
};

export type RouteFile = {
  name: string;
  uri: string;
};

type MediaUploadResponse = {
  id?: unknown;
};

function boundedText(value: string | undefined, maximum: number): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, maximum) : undefined;
}

function rethrowRoutesUnavailable(error: unknown): never {
  const status = (error as Error & { status?: number })?.status;
  if (status && UNAVAILABLE_STATUSES.has(status)) {
    throw new Error("GPS route publishing is not available on this server.");
  }
  throw error;
}

function safeFileStem(title: string): string {
  const stem = title
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return stem || "recorded-route";
}

export async function writeRouteGpxFile(
  points: RoutePoint[],
  title: string,
): Promise<RouteFile> {
  if (!FileSystem.cacheDirectory) {
    throw new Error("Temporary file storage is not available on this device.");
  }

  const name = `${safeFileStem(title)}-${Date.now()}.gpx`;
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, createGpx(points, title), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { name, uri };
}

export async function readRouteGpxFile(uri: string): Promise<string> {
  if (!uri.startsWith("file://")) {
    throw new Error("The selected GPX file was not copied into app storage.");
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function uploadRouteGpx(
  ctx: LotideContext,
  file: RouteFile,
): Promise<string> {
  if (!getSupportedServerUrl(ctx.apiUrl || "")) {
    throw new Error("Choose a supported Unfathomably server before uploading.");
  }
  if (!file.uri.startsWith("file://") || !file.name.toLowerCase().endsWith(".gpx")) {
    throw new Error("Only a local GPX route can be uploaded here.");
  }

  const form = new FormData();
  /*
      React Native's FormData bridge accepts the documented local-file tuple.
      TypeScript's browser FormData declaration knows only Blob and string, so
      the cast is isolated at this native transport boundary.
  */
  form.append("file", {
    name: file.name.slice(0, 255),
    type: "application/gpx+xml",
    uri: file.uri,
  } as unknown as Blob);
  form.append("description", "GPX track for this route");

  try {
    const response = await request<MediaUploadResponse>(
      ctx,
      "/api/v1/media",
      { body: form, method: "POST" },
      ROUTE_UPLOAD_TIMEOUT_MS,
    );
    if (typeof response.id !== "string" || !response.id.trim()) {
      throw new Error("The media server returned an invalid GPX attachment.");
    }
    return response.id;
  } catch (error) {
    rethrowRoutesUnavailable(error);
  }
}

export async function publishRoute(
  ctx: LotideContext,
  input: PublishRouteInput,
): Promise<UnfathomablyStatus> {
  const title = boundedText(input.title, 200);
  const content = boundedText(input.content, 100_000) || title;
  if (!title || !content) throw new Error("Add a title and description before publishing.");
  if (!ROUTE_KINDS.includes(input.routeKind)) throw new Error("Choose a supported route type.");
  if (input.difficulty && !ROUTE_DIFFICULTIES.includes(input.difficulty)) {
    throw new Error("Choose a supported route difficulty.");
  }
  if (!input.mediaId.trim()) throw new Error("Upload the GPX track before publishing.");

  const metrics = getRouteTrackMetrics(input.points);
  if (metrics.pointCount < 2) throw new Error("Record or import at least two route points.");

  const fields: Record<string, string> = {
    distance: metrics.distanceMetres.toFixed(0),
    distance_unit: "m",
    duration: String(metrics.durationSeconds),
    elevation_gain: metrics.elevationGainMetres.toFixed(0),
    elevation_loss: metrics.elevationLossMetres.toFixed(0),
    route_kind: input.routeKind,
  };
  if (input.difficulty) fields.difficulty = input.difficulty;
  const location = boundedText(input.location, 160);
  const tags = boundedText(input.tags, 200);
  if (location) fields.location = location;
  if (tags) fields.tags = tags;
  if (metrics.startedAt) fields.start_time = metrics.startedAt;

  try {
    const status = await request<UnfathomablyStatus>(
      ctx,
      "/api/v1/discovery/native-objects",
      {
        method: "POST",
        body: JSON.stringify({
          template: "routes",
          title,
          content,
          fields,
          media_ids: [input.mediaId],
          spoiler_text: boundedText(input.spoilerText, 500),
          visibility: input.visibility,
        }),
      },
      ROUTE_UPLOAD_TIMEOUT_MS,
    );
    if (!status || typeof status.id !== "string") {
      throw new Error("The server returned an invalid route status.");
    }
    return status;
  } catch (error) {
    rethrowRoutesUnavailable(error);
  }
}

/* end of UnfathomablyRoutesService.ts */
