/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyStreamingService.ts

    Purpose:

        Connect mobile screens to Mastodon-compatible live update streams.

    Responsibilities:

        - Discover and validate the server-advertised streaming origin
        - Build current Unfathomably, Rebased, and Pleroma stream paths
        - Authenticate WebSockets without placing access tokens in URLs
        - Parse bounded event envelopes and recover failed connections

    This file intentionally does NOT contain:

        - React or navigation lifecycle state
        - background Android notification delivery
        - timeline rendering or screen-specific filtering
*/

import {
  getSupportedServerUrl,
  request,
  UnfathomablyNotification,
  UnfathomablyStatus,
} from "./UnfathomablyService";
import { logWarning } from "../utils/debugLog";

/* ------------------------------------------------------------------------- */
/* Protocol model                                                            */
/* ------------------------------------------------------------------------- */

export type UnfathomablyStreamDescriptor =
  | { stream: "direct" }
  | { stream: "group"; group: string }
  | { stream: "hashtag" | "hashtag:local"; tag: string }
  | { stream: "list"; list: string }
  | { stream: "public" | "public:local" | "public:media" | "public:local:media" }
  | { stream: "public:remote" | "public:remote:media"; instance: string }
  | { stream: "source"; source: string }
  | { stream: "user" | "user:groups" | "user:notification" | "user:pleroma_chat" | "user:sources" };

export type UnfathomablyStreamingEvent = {
  event: string;
  payload: unknown;
  stream: string[];
};

export type UnfathomablyStreamCallbacks = {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onEvent: (event: UnfathomablyStreamingEvent) => void;
  onReconnect?: () => void;
};

export type UnfathomablyStreamConnection = {
  close: () => void;
};

type StreamingInstanceResponse = {
  configuration?: {
    urls?: {
      streaming?: unknown;
    };
  };
  urls?: {
    streaming_api?: unknown;
  };
};

const STREAMING_PATH = "/api/v1/streaming";
const MAX_STREAM_PARAMETER_LENGTH = 2_048;
const MAX_STREAM_EVENT_NAME_LENGTH = 120;
const MAX_STREAM_MESSAGE_LENGTH = 2 * 1_024 * 1_024;
const MAX_STREAM_LABELS = 8;
const STREAM_CONNECT_TIMEOUT_MS = 15_000;
const STREAM_STABLE_CONNECTION_MS = 30_000;
const STREAM_RECONNECT_BASE_MS = 1_000;
const STREAM_RECONNECT_MAX_MS = 30_000;
const STREAM_RECONNECT_JITTER_MS = 750;
const MAX_TIMELINE_ITEMS = 200;

const LOCAL_STREAMING_HOSTS = new Set([
  "127.0.0.1",
  "10.0.2.2",
  "localhost",
  "::1",
]);

const STRUCTURED_PAYLOAD_EVENTS = new Set([
  "announcement",
  "announcement.reaction",
  "chat_message.created",
  "chat_message.deleted",
  "chat_message.reaction",
  "chat_message.read",
  "conversation",
  "marker",
  "notification",
  "pleroma:chat_update",
  "pleroma:follow_relationships_update",
  "pleroma:respond",
  "status.update",
  "update",
]);

const streamingOriginCache = new Map<string, Promise<string>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredStreamParameter(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`The ${name} stream identifier is missing.`);
  }
  if (normalized.length > MAX_STREAM_PARAMETER_LENGTH) {
    throw new Error(`The ${name} stream identifier is too long.`);
  }
  return normalized;
}

function isLocalStreamingHost(hostname: string): boolean {
  return LOCAL_STREAMING_HOSTS.has(
    hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, ""),
  );
}

function normalizeStreamingOrigin(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || !parsed.hostname) return undefined;

    const protocol = parsed.protocol === "https:"
      ? "wss:"
      : parsed.protocol === "http:"
        ? "ws:"
        : parsed.protocol;

    if (protocol !== "ws:" && protocol !== "wss:") {
      return undefined;
    }
    if (protocol === "ws:" && !isLocalStreamingHost(parsed.hostname)) {
      return undefined;
    }

    return `${protocol}//${parsed.host}/`;
  } catch {
    return undefined;
  }
}

function advertisedStreamingUrl(value: unknown): string | undefined {
  return typeof value === "string"
    ? normalizeStreamingOrigin(value)
    : undefined;
}

/* ------------------------------------------------------------------------- */
/* URL discovery and construction                                            */
/* ------------------------------------------------------------------------- */

async function discoverStreamingOrigin(ctx: LotideContext): Promise<string> {
  const apiOrigin = getSupportedServerUrl(ctx.apiUrl || "");
  if (!apiOrigin) {
    throw new Error("A valid server is required for live updates.");
  }

  try {
    const instance = await request<StreamingInstanceResponse>(
      ctx,
      "/api/v2/instance",
    );
    const configured = advertisedStreamingUrl(
      instance.configuration?.urls?.streaming,
    );
    if (configured) return configured;
  } catch {
    /*
        Pleroma and older Rebased releases may omit the Mastodon v2 instance
        endpoint. Their v1 response advertises the same transport separately.
    */
  }

  try {
    const instance = await request<StreamingInstanceResponse>(
      ctx,
      "/api/v1/instance",
    );
    const configured = advertisedStreamingUrl(instance.urls?.streaming_api);
    if (configured) return configured;
  } catch {
    /*
        Streaming is an enhancement. If discovery is unavailable, the API
        origin remains the compatible Mastodon default and REST still fills
        any missed timeline data.
    */
  }

  const fallback = normalizeStreamingOrigin(apiOrigin);
  if (!fallback) {
    throw new Error("The selected server does not provide a safe streaming URL.");
  }
  return fallback;
}

export function resolveStreamingOrigin(ctx: LotideContext): Promise<string> {
  const cacheKey = getSupportedServerUrl(ctx.apiUrl || "");
  if (!cacheKey) {
    return Promise.reject(
      new Error("A valid server is required for live updates."),
    );
  }

  const existing = streamingOriginCache.get(cacheKey);
  if (existing) return existing;

  const pending = discoverStreamingOrigin(ctx).catch(error => {
    streamingOriginCache.delete(cacheKey);
    throw error;
  });
  streamingOriginCache.set(cacheKey, pending);
  return pending;
}

export function clearStreamingOriginCache(): void {
  streamingOriginCache.clear();
}

export function buildStreamingUrl(
  streamingOrigin: string,
  descriptor: UnfathomablyStreamDescriptor,
): string {
  const base = normalizeStreamingOrigin(streamingOrigin);
  if (!base) throw new Error("The server returned an unsafe streaming URL.");

  const params = new URLSearchParams();
  let path: string;

  switch (descriptor.stream) {
    case "direct":
      path = `${STREAMING_PATH}/direct`;
      break;
    case "group":
      path = `${STREAMING_PATH}/group/${encodeURIComponent(
        requiredStreamParameter(descriptor.group, "group"),
      )}`;
      break;
    case "hashtag":
    case "hashtag:local":
      path = descriptor.stream === "hashtag"
        ? `${STREAMING_PATH}/hashtag`
        : `${STREAMING_PATH}/hashtag/local`;
      params.set("tag", requiredStreamParameter(descriptor.tag, "hashtag"));
      break;
    case "list":
      path = `${STREAMING_PATH}/list`;
      params.set("list", requiredStreamParameter(descriptor.list, "list"));
      break;
    case "public":
    case "public:media":
      path = `${STREAMING_PATH}/public`;
      if (descriptor.stream === "public:media") params.set("only_media", "true");
      break;
    case "public:local":
    case "public:local:media":
      path = `${STREAMING_PATH}/public/local`;
      if (descriptor.stream === "public:local:media") params.set("only_media", "true");
      break;
    case "public:remote":
    case "public:remote:media":
      path = `${STREAMING_PATH}/public/remote`;
      params.set(
        "instance",
        requiredStreamParameter(descriptor.instance, "remote instance"),
      );
      if (descriptor.stream === "public:remote:media") params.set("only_media", "true");
      break;
    case "source":
      path = `${STREAMING_PATH}/source/${encodeURIComponent(
        requiredStreamParameter(descriptor.source, "source"),
      )}`;
      break;
    case "user":
      path = `${STREAMING_PATH}/user`;
      break;
    case "user:groups":
      path = `${STREAMING_PATH}/user/groups`;
      break;
    case "user:notification":
      path = `${STREAMING_PATH}/user/notification`;
      break;
    case "user:sources":
      path = `${STREAMING_PATH}/user/sources`;
      break;
    case "user:pleroma_chat":
      /* No dedicated path exists for this older Pleroma stream. */
      path = STREAMING_PATH;
      params.set("stream", descriptor.stream);
      break;
  }

  const url = new URL(path, base);
  params.forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
}

/* ------------------------------------------------------------------------- */
/* Event validation                                                          */
/* ------------------------------------------------------------------------- */

function parseStructuredPayload(event: string, payload: unknown): unknown {
  if (!STRUCTURED_PAYLOAD_EVENTS.has(event) || typeof payload !== "string") {
    return payload;
  }
  if (payload.length > MAX_STREAM_MESSAGE_LENGTH) return undefined;

  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
}

export function parseStreamingEvent(
  value: unknown,
): UnfathomablyStreamingEvent | undefined {
  let envelope: unknown = value;

  if (typeof value === "string") {
    if (!value || value.length > MAX_STREAM_MESSAGE_LENGTH) return undefined;
    try {
      envelope = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  if (!isRecord(envelope)) return undefined;
  if (
    typeof envelope.event !== "string" ||
    !envelope.event ||
    envelope.event.length > MAX_STREAM_EVENT_NAME_LENGTH
  ) {
    return undefined;
  }

  const payload = parseStructuredPayload(envelope.event, envelope.payload);
  if (STRUCTURED_PAYLOAD_EVENTS.has(envelope.event) && payload === undefined) {
    return undefined;
  }

  const stream = Array.isArray(envelope.stream)
    ? envelope.stream
      .filter((item): item is string => typeof item === "string")
      .slice(0, MAX_STREAM_LABELS)
    : [];

  return {
    event: envelope.event,
    payload,
    stream,
  };
}

export function getStreamedStatus(
  event: UnfathomablyStreamingEvent,
): UnfathomablyStatus | undefined {
  if (event.event !== "update" && event.event !== "status.update") {
    return undefined;
  }
  if (!isRecord(event.payload) || !isRecord(event.payload.account)) {
    return undefined;
  }
  return typeof event.payload.id === "string"
    ? event.payload as UnfathomablyStatus
    : undefined;
}

export function getStreamedNotification(
  event: UnfathomablyStreamingEvent,
): UnfathomablyNotification | undefined {
  if (event.event !== "notification") return undefined;
  if (!isRecord(event.payload) || !isRecord(event.payload.account)) {
    return undefined;
  }
  return typeof event.payload.id === "string"
    ? event.payload as UnfathomablyNotification
    : undefined;
}

export function applyStatusStreamingEvent(
  current: UnfathomablyStatus[],
  event: UnfathomablyStreamingEvent,
  acceptsStatus: (status: UnfathomablyStatus) => boolean = () => true,
): UnfathomablyStatus[] {
  if (event.event === "delete" && typeof event.payload === "string") {
    return current.filter(status =>
      status.id !== event.payload && status.reblog?.id !== event.payload,
    );
  }

  const status = getStreamedStatus(event);
  if (!status) return current;

  const existingIndex = current.findIndex(item => item.id === status.id);
  if (event.event === "status.update") {
    if (existingIndex < 0) return current;
    return current.map(item => item.id === status.id ? status : item);
  }

  if (!acceptsStatus(status)) return current;
  const withoutOldCopy = current.filter(item => item.id !== status.id);
  return [status, ...withoutOldCopy].slice(0, MAX_TIMELINE_ITEMS);
}

/* ------------------------------------------------------------------------- */
/* Connection lifecycle                                                      */
/* ------------------------------------------------------------------------- */

export function reconnectDelay(
  attempt: number,
  randomValue = Math.random(),
): number {
  const normalizedAttempt = Math.max(0, Math.min(Math.trunc(attempt), 10));
  const exponential = Math.min(
    STREAM_RECONNECT_BASE_MS * (2 ** normalizedAttempt),
    STREAM_RECONNECT_MAX_MS,
  );
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1)
    : 0;
  return exponential + Math.floor(normalizedRandom * STREAM_RECONNECT_JITTER_MS);
}

export function connectToUnfathomablyStream(
  ctx: LotideContext,
  descriptor: UnfathomablyStreamDescriptor,
  callbacks: UnfathomablyStreamCallbacks,
): UnfathomablyStreamConnection {
  const token = ctx.login?.token;
  let socket: WebSocket | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stabilityTimer: ReturnType<typeof setTimeout> | undefined;
  let connectionEpoch = 0;
  let reconnectAttempt = 0;
  let connectedOnce = false;
  let closed = false;
  let warnedForFailure = false;

  function clearTimers() {
    if (connectTimer !== undefined) clearTimeout(connectTimer);
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    if (stabilityTimer !== undefined) clearTimeout(stabilityTimer);
    connectTimer = undefined;
    reconnectTimer = undefined;
    stabilityTimer = undefined;
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer !== undefined) return;
    const delay = reconnectDelay(reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  }

  async function connect() {
    if (closed) return;
    const epoch = connectionEpoch + 1;
    connectionEpoch = epoch;

    try {
      const origin = await resolveStreamingOrigin(ctx);
      if (closed || epoch !== connectionEpoch) return;
      const url = buildStreamingUrl(origin, descriptor);

      /*
          The backend reads the first WebSocket subprotocol as the OAuth token
          and echoes it during the handshake. This keeps credentials out of
          proxy logs, browser history, crash reports, and diagnostic strings.
      */
      socket = token
        ? new WebSocket(url, [token])
        : new WebSocket(url);

      connectTimer = setTimeout(() => {
        if (socket?.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }, STREAM_CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        if (closed || epoch !== connectionEpoch) return;
        if (connectTimer !== undefined) clearTimeout(connectTimer);
        connectTimer = undefined;
        warnedForFailure = false;
        stabilityTimer = setTimeout(() => {
          reconnectAttempt = 0;
          stabilityTimer = undefined;
        }, STREAM_STABLE_CONNECTION_MS);

        if (connectedOnce) callbacks.onReconnect?.();
        else callbacks.onConnect?.();
        connectedOnce = true;
      };

      socket.onmessage = message => {
        if (closed || epoch !== connectionEpoch) return;
        const event = parseStreamingEvent(message.data);
        if (event) callbacks.onEvent(event);
      };

      socket.onerror = () => {
        if (closed || epoch !== connectionEpoch || warnedForFailure) return;
        warnedForFailure = true;
        logWarning(
          "Live updates are temporarily unavailable; REST refresh remains active",
          descriptor.stream,
        );
      };

      socket.onclose = () => {
        if (epoch !== connectionEpoch) return;
        if (connectTimer !== undefined) clearTimeout(connectTimer);
        if (stabilityTimer !== undefined) clearTimeout(stabilityTimer);
        connectTimer = undefined;
        stabilityTimer = undefined;
        socket = undefined;
        if (closed) return;
        if (connectedOnce) callbacks.onDisconnect?.();
        scheduleReconnect();
      };
    } catch (error) {
      if (closed || epoch !== connectionEpoch) return;
      if (!warnedForFailure) {
        warnedForFailure = true;
        logWarning(
          "Could not start live updates; REST refresh remains active",
          descriptor.stream,
          error,
        );
      }
      scheduleReconnect();
    }
  }

  void connect();

  return {
    close() {
      if (closed) return;
      closed = true;
      connectionEpoch += 1;
      clearTimers();
      const activeSocket = socket;
      socket = undefined;
      if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) {
        activeSocket.close(1000, "Screen is no longer active");
      }
    },
  };
}

/* end of UnfathomablyStreamingService.ts */
