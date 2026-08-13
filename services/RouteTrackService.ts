/*
    Project: Hoot Unfathomably
    --------------------------

    File: RouteTrackService.ts

    Purpose:

        Maintain private on-device GPS route drafts and GPX documents.

    Responsibilities:

        - Validate and filter foreground location fixes
        - Derive distance, elevation, timing, and preview geometry
        - Parse and generate bounded GPX 1.1 documents
        - Recover an unfinished route draft for the active account

    This file intentionally does NOT contain:

        - location permission prompts or subscriptions
        - network uploads or ActivityPub publication
        - background location tracking
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

export const MAX_ROUTE_POINT_COUNT = 100_000;
export const MAX_ROUTE_FILE_BYTES = 8 * 1024 * 1024;

const MAX_ACCEPTED_ACCURACY_METRES = 100;
const MAX_PLAUSIBLE_SPEED_METRES_PER_SECOND = 150;
const MIN_POINT_DISTANCE_METRES = 2;
const MAX_STATIONARY_INTERVAL_MS = 15_000;
const DRAFT_KEY_PREFIX = "@hoot_unfathomably_route_draft_v1:";

export type RoutePoint = {
  accuracy?: number;
  elevation?: number;
  latitude: number;
  longitude: number;
  startsSegment?: boolean;
  timestamp: number;
};

export type RouteTrackMetrics = {
  distanceMetres: number;
  durationSeconds: number;
  elevationGainMetres: number;
  elevationLossMetres: number;
  pointCount: number;
  startedAt?: string;
};

export type RouteTrackDraft = {
  fileName?: string;
  points: RoutePoint[];
  title?: string;
};

type LocationFix = {
  coords?: {
    accuracy?: number | null;
    altitude?: number | null;
    latitude?: number;
    longitude?: number;
  };
  timestamp?: number;
};

/* ------------------------------------------------------------------------- */
/* Point validation and metrics                                              */
/* ------------------------------------------------------------------------- */

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizedPoint(value: unknown): RoutePoint | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const point = value as Record<string, unknown>;
  const latitude = finiteNumber(point.latitude);
  const longitude = finiteNumber(point.longitude);
  const timestamp = finiteNumber(point.timestamp);
  const elevation = finiteNumber(point.elevation);
  const accuracy = finiteNumber(point.accuracy);

  if (
    latitude === undefined || latitude < -90 || latitude > 90 ||
    longitude === undefined || longitude < -180 || longitude > 180 ||
    timestamp === undefined || timestamp < 0 || timestamp > 8_640_000_000_000_000
  ) {
    return undefined;
  }

  return {
    latitude,
    longitude,
    timestamp,
    ...(elevation !== undefined && elevation >= -12_000 && elevation <= 12_000
      ? { elevation }
      : {}),
    ...(accuracy !== undefined && accuracy >= 0 && accuracy <= 10_000
      ? { accuracy }
      : {}),
    ...(point.startsSegment === true ? { startsSegment: true } : {}),
  };
}

export function routePointFromLocation(fix: LocationFix): RoutePoint | undefined {
  return normalizedPoint({
    accuracy: fix.coords?.accuracy,
    elevation: fix.coords?.altitude,
    latitude: fix.coords?.latitude,
    longitude: fix.coords?.longitude,
    timestamp: fix.timestamp ?? Date.now(),
  });
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function distanceBetweenRoutePoints(
  left: RoutePoint,
  right: RoutePoint,
): number {
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const chord = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) *
    Math.sin(longitudeDelta / 2) ** 2;

  /* Mean Earth radius used by the upstream web route metadata parser. */
  return 6_371_000 * 2 * Math.atan2(
    Math.sqrt(chord),
    Math.sqrt(Math.max(0, 1 - chord)),
  );
}

export function appendRoutePoint(
  points: RoutePoint[],
  candidate: RoutePoint | undefined,
): RoutePoint[] {
  if (!candidate || points.length >= MAX_ROUTE_POINT_COUNT) return points;
  if (
    candidate.accuracy !== undefined &&
    candidate.accuracy > MAX_ACCEPTED_ACCURACY_METRES
  ) {
    return points;
  }

  const previous = points.at(-1);
  if (!previous) return [candidate];
  const elapsedMs = candidate.timestamp - previous.timestamp;
  if (elapsedMs <= 0) return points;

  /*
      A fresh recording segment follows an explicit stop and resume. It must
      not be joined to the previous fix because the phone may have moved while
      location recording was off.
  */
  if (candidate.startsSegment) return [...points, candidate];

  const distance = distanceBetweenRoutePoints(previous, candidate);
  if (distance < MIN_POINT_DISTANCE_METRES && elapsedMs < MAX_STATIONARY_INTERVAL_MS) {
    return points;
  }

  const speed = distance / (elapsedMs / 1_000);
  if (speed > MAX_PLAUSIBLE_SPEED_METRES_PER_SECOND) return points;

  return [...points, candidate];
}

export function getRouteTrackMetrics(points: RoutePoint[]): RouteTrackMetrics {
  let distanceMetres = 0;
  let elevationGainMetres = 0;
  let elevationLossMetres = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.startsSegment) continue;
    distanceMetres += distanceBetweenRoutePoints(previous, current);

    if (previous.elevation !== undefined && current.elevation !== undefined) {
      const change = current.elevation - previous.elevation;
      /* Sub-metre fluctuations are usually GPS altitude noise. */
      if (change >= 1) elevationGainMetres += change;
      if (change <= -1) elevationLossMetres += Math.abs(change);
    }
  }

  const startedAt = points[0]?.timestamp;
  let durationSeconds = 0;

  for (let index = 1; index < points.length; index += 1) {
    if (points[index].startsSegment) continue;
    durationSeconds += Math.max(0, points[index].timestamp - points[index - 1].timestamp) / 1_000;
  }

  return {
    distanceMetres,
    durationSeconds: Math.round(durationSeconds),
    elevationGainMetres,
    elevationLossMetres,
    pointCount: points.length,
    startedAt: startedAt !== undefined ? new Date(startedAt).toISOString() : undefined,
  };
}

/* ------------------------------------------------------------------------- */
/* GPX parsing and generation                                                */
/* ------------------------------------------------------------------------- */

function decodeXmlText(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (named[normalized]) return named[normalized];
    const hexadecimal = normalized.startsWith("#x");
    const numberText = normalized.slice(hexadecimal ? 2 : 1);
    const codePoint = Number.parseInt(numberText, hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

function xmlText(body: string, localName: string): string | undefined {
  const match = body.match(
    new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${localName}>`, "i"),
  );
  return match ? decodeXmlText(match[1].replace(/<[^>]*>/g, "").trim()) : undefined;
}

function xmlAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"),
  );
  return match ? decodeXmlText(match[2]) : undefined;
}

function utf8ByteLength(value: string): number {
  /*
      TextEncoder is not consistently present in every Hermes runtime. Count
      UTF-8 bytes directly so file limits do not depend on a platform polyfill.
  */
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800 && codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      /* Lone UTF-16 surrogates are encoded as the replacement character. */
      bytes += 3;
    }
  }

  return bytes;
}

function parseGpxPoints(source: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  const segmentPattern = /<(?:(?:[A-Za-z_][\w.-]*):)?trkseg\b[^>]*>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?trkseg>/gi;
  const segments = Array.from(source.matchAll(segmentPattern), match => match[1]);
  const pointGroups = segments.length > 0 ? segments : [source];
  const pointPattern = /<(?:(?:[A-Za-z_][\w.-]*):)?(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?(?:trkpt|rtept)>/gi;

  pointGroups.forEach((body, segmentIndex) => {
    let match: RegExpExecArray | null;
    let pointIndex = 0;
    pointPattern.lastIndex = 0;

    while ((match = pointPattern.exec(body)) !== null) {
      if (points.length >= MAX_ROUTE_POINT_COUNT) {
        throw new Error("The GPX file contains more than 100,000 route points.");
      }

      const latitude = Number(xmlAttribute(match[1], "lat"));
      const longitude = Number(xmlAttribute(match[1], "lon"));
      const elevationText = xmlText(match[2], "ele");
      const timeText = xmlText(match[2], "time");
      const timestamp = timeText ? Date.parse(timeText) : Number.NaN;
      const point = normalizedPoint({
        elevation: elevationText === undefined ? undefined : Number(elevationText),
        latitude,
        longitude,
        startsSegment: segmentIndex > 0 && pointIndex === 0,
        timestamp: Number.isFinite(timestamp)
          ? timestamp
          : (points.at(-1)?.timestamp ?? Date.now()) + 1_000,
      });
      if (point) {
        points.push(point);
        pointIndex += 1;
      }
    }
  });

  return points;
}

export function parseGpx(source: string): RouteTrackDraft {
  if (utf8ByteLength(source) > MAX_ROUTE_FILE_BYTES) {
    throw new Error("The GPX file is larger than 8 MB.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error("GPX files containing document type or entity declarations are not supported.");
  }
  if (!/<(?:(?:[A-Za-z_][\w.-]*):)?gpx\b/i.test(source)) {
    throw new Error("The selected file is not a GPX document.");
  }

  const points = parseGpxPoints(source);

  if (points.length < 2) {
    throw new Error("The GPX file must contain at least two valid track or route points.");
  }

  const metadataBody = source.match(/<(?:(?:[A-Za-z_][\w.-]*):)?(?:metadata|trk|rte)\b[^>]*>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?(?:metadata|trk|rte)>/i)?.[1] || "";

  return {
    points,
    title: xmlText(metadataBody, "name")?.slice(0, 200),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createGpx(points: RoutePoint[], title: string): string {
  if (points.length < 2 || points.length > MAX_ROUTE_POINT_COUNT) {
    throw new Error("A GPX route needs between 2 and 100,000 points.");
  }

  const segments: RoutePoint[][] = [];
  points.forEach((point, index) => {
    if (index === 0 || point.startsSegment) segments.push([]);
    segments[segments.length - 1].push(point);
  });
  const trackSegments = segments.map(segment => {
    const trackPoints = segment.map(point => {
      const elevation = point.elevation === undefined
        ? ""
        : `<ele>${point.elevation.toFixed(1)}</ele>`;
      return `      <trkpt lat="${point.latitude.toFixed(6)}" lon="${point.longitude.toFixed(6)}">${elevation}<time>${new Date(point.timestamp).toISOString()}</time></trkpt>`;
    }).join("\n");
    return ["    <trkseg>", trackPoints, "    </trkseg>"].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Hoot Unfathomably" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    `    <name>${escapeXml(title.trim().slice(0, 200) || "Recorded route")}</name>`,
    `    <time>${new Date(points[0].timestamp).toISOString()}</time>`,
    "  </metadata>",
    "  <trk>",
    `    <name>${escapeXml(title.trim().slice(0, 200) || "Recorded route")}</name>`,
    trackSegments,
    "  </trk>",
    "</gpx>",
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------------- */
/* Draft persistence                                                         */
/* ------------------------------------------------------------------------- */

function draftKey(accountId: string): string {
  return `${DRAFT_KEY_PREFIX}${accountId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 255)}`;
}

export async function saveRouteTrackDraft(
  accountId: string,
  draft: RouteTrackDraft,
): Promise<void> {
  const points = draft.points
    .slice(0, MAX_ROUTE_POINT_COUNT)
    .flatMap(point => {
      const normalized = normalizedPoint(point);
      return normalized ? [normalized] : [];
    });

  await AsyncStorage.setItem(draftKey(accountId), JSON.stringify({
    fileName: draft.fileName?.slice(0, 255),
    points,
    title: draft.title?.slice(0, 200),
    version: 1,
  }));
}

export async function readRouteTrackDraft(
  accountId: string,
): Promise<RouteTrackDraft | undefined> {
  const serialized = await AsyncStorage.getItem(draftKey(accountId));
  if (!serialized) return undefined;

  try {
    const value = JSON.parse(serialized) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    const draft = value as Record<string, unknown>;
    if (draft.version !== 1 || !Array.isArray(draft.points)) throw new Error();

    const points = draft.points
      .slice(0, MAX_ROUTE_POINT_COUNT)
      .flatMap(point => {
        const normalized = normalizedPoint(point);
        return normalized ? [normalized] : [];
      });
    if (points.length === 0) return undefined;

    return {
      fileName: typeof draft.fileName === "string" ? draft.fileName.slice(0, 255) : undefined,
      points,
      title: typeof draft.title === "string" ? draft.title.slice(0, 200) : undefined,
    };
  } catch {
    await AsyncStorage.removeItem(draftKey(accountId));
    return undefined;
  }
}

export function removeRouteTrackDraft(accountId: string): Promise<void> {
  return AsyncStorage.removeItem(draftKey(accountId));
}

/* end of RouteTrackService.ts */
