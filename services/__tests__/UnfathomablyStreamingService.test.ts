/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyStreamingService.test.ts

    Purpose:

        Verify current Mastodon and Unfathomably WebSocket compatibility.

    Responsibilities:

        - Cover every supported path-style streaming endpoint
        - Verify token-safe connection authentication and host discovery
        - Reject malformed or unbounded event envelopes
        - Exercise timeline updates, edits, deletes, and reconnect recovery

    This file intentionally does NOT contain:

        - live public-instance connections
        - background Android notification tests
        - screen rendering assertions
*/

import {
  applyStatusStreamingEvent,
  buildStreamingUrl,
  clearStreamingOriginCache,
  connectToUnfathomablyStream,
  getStreamedNotification,
  parseStreamingEvent,
  reconnectDelay,
  resolveStreamingOrigin,
} from "../UnfathomablyStreamingService";
import { makeContext, makeNotification, makeStatus } from "../../testing/fediverseFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly protocols?: string | string[];
  readyState = MockWebSocket.CONNECTING;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  receive(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  serverClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }
}

const originalWebSocket = global.WebSocket;

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("UnfathomablyStreamingService", () => {
  beforeAll(() => {
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterAll(() => {
    global.WebSocket = originalWebSocket;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    MockWebSocket.instances = [];
    clearStreamingOriginCache();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        configuration: { urls: { streaming: "wss://stream.unfathomably.example/socket" } },
      }),
    });
  });

  test("builds every current path-style stream without putting tokens in URLs", () => {
    const base = "wss://social.example/socket";
    expect(buildStreamingUrl(base, { stream: "user" })).toBe(
      "wss://social.example/api/v1/streaming/user",
    );
    expect(buildStreamingUrl(base, { stream: "user:notification" })).toBe(
      "wss://social.example/api/v1/streaming/user/notification",
    );
    expect(buildStreamingUrl(base, { stream: "user:groups" })).toBe(
      "wss://social.example/api/v1/streaming/user/groups",
    );
    expect(buildStreamingUrl(base, { stream: "user:sources" })).toBe(
      "wss://social.example/api/v1/streaming/user/sources",
    );
    expect(buildStreamingUrl(base, { stream: "direct" })).toBe(
      "wss://social.example/api/v1/streaming/direct",
    );
    expect(buildStreamingUrl(base, { stream: "group", group: "group/one" })).toBe(
      "wss://social.example/api/v1/streaming/group/group%2Fone",
    );
    expect(buildStreamingUrl(base, { stream: "source", source: "source/one" })).toBe(
      "wss://social.example/api/v1/streaming/source/source%2Fone",
    );
    expect(buildStreamingUrl(base, { stream: "hashtag:local", tag: "3d printing" })).toBe(
      "wss://social.example/api/v1/streaming/hashtag/local?tag=3d+printing",
    );
    expect(buildStreamingUrl(base, { stream: "list", list: "friends" })).toBe(
      "wss://social.example/api/v1/streaming/list?list=friends",
    );
    expect(buildStreamingUrl(base, { stream: "public:media" })).toBe(
      "wss://social.example/api/v1/streaming/public?only_media=true",
    );
    expect(buildStreamingUrl(base, { stream: "public:local:media" })).toBe(
      "wss://social.example/api/v1/streaming/public/local?only_media=true",
    );
    expect(buildStreamingUrl(base, { stream: "public:remote:media", instance: "remote.example" })).toBe(
      "wss://social.example/api/v1/streaming/public/remote?instance=remote.example&only_media=true",
    );
    expect(buildStreamingUrl(base, { stream: "user:pleroma_chat" })).toBe(
      "wss://social.example/api/v1/streaming?stream=user%3Apleroma_chat",
    );
  });

  test("builds Pleroma, Akkoma, and Rebased unified stream queries", () => {
    const base = "wss://pleroma.example";

    expect(buildStreamingUrl(
      base,
      { stream: "user" },
      "query",
    )).toBe(
      "wss://pleroma.example/api/v1/streaming?stream=user",
    );
    expect(buildStreamingUrl(
      base,
      { stream: "user:notification" },
      "query",
    )).toBe(
      "wss://pleroma.example/api/v1/streaming?stream=user%3Anotifications",
    );
    expect(buildStreamingUrl(
      base,
      { stream: "hashtag:local", tag: "release engineering" },
      "query",
    )).toBe(
      "wss://pleroma.example/api/v1/streaming?stream=hashtag%3Alocal&tag=release+engineering",
    );
    expect(buildStreamingUrl(
      base,
      { stream: "public:remote:media", instance: "remote.example" },
      "query",
    )).toBe(
      "wss://pleroma.example/api/v1/streaming?stream=public%3Aremote%3Amedia&instance=remote.example",
    );
  });

  test("uses v2 discovery, then the v1 advertisement, then the API origin", async () => {
    const ctx = makeContext("unfathomably");
    await expect(resolveStreamingOrigin(ctx)).resolves.toBe(
      "wss://stream.unfathomably.example/",
    );

    clearStreamingOriginCache();
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "missing" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ urls: { streaming_api: "wss://legacy.example/websocket" } }),
      });
    await expect(resolveStreamingOrigin(ctx)).resolves.toBe(
      "wss://legacy.example/",
    );

    clearStreamingOriginCache();
    mockFetch.mockRejectedValue(new Error("offline"));
    await expect(resolveStreamingOrigin(ctx)).resolves.toBe(
      "wss://unfathomably.example/",
    );
  });

  test("parses current status and notification envelopes defensively", () => {
    const status = makeStatus("unfathomably", { id: "live-status" });
    const update = parseStreamingEvent(JSON.stringify({
      event: "update",
      payload: JSON.stringify(status),
      stream: ["user", 14, "ignored-after-validation"],
    }));
    expect(update).toEqual({
      event: "update",
      payload: status,
      stream: ["user", "ignored-after-validation"],
    });

    const notification = makeNotification("unfathomably", { id: "live-notice" });
    const notificationEvent = parseStreamingEvent({
      event: "notification",
      payload: JSON.stringify(notification),
    });
    expect(notificationEvent && getStreamedNotification(notificationEvent)).toEqual(notification);

    expect(parseStreamingEvent("not json")).toBeUndefined();
    expect(parseStreamingEvent({ event: "update", payload: "not json" })).toBeUndefined();
    expect(parseStreamingEvent("x".repeat(2 * 1_024 * 1_024 + 1))).toBeUndefined();
  });

  test("inserts updates, replaces edits, and removes deletes from timelines", () => {
    const first = makeStatus("unfathomably", { id: "first" });
    const second = makeStatus("unfathomably", { id: "second" });
    const update = parseStreamingEvent({
      event: "update",
      payload: JSON.stringify(second),
    })!;
    expect(applyStatusStreamingEvent([first], update).map(item => item.id)).toEqual([
      "second",
      "first",
    ]);

    const edited = { ...second, content: "<p>Edited</p>" };
    const edit = parseStreamingEvent({
      event: "status.update",
      payload: JSON.stringify(edited),
    })!;
    expect(applyStatusStreamingEvent([second, first], edit)[0].content).toBe(
      "<p>Edited</p>",
    );

    expect(applyStatusStreamingEvent([second, first], {
      event: "delete",
      payload: "second",
      stream: ["user"],
    })).toEqual([first]);
  });

  test("authenticates through the WebSocket protocol and reconnects after gaps", async () => {
    const callbacks = {
      onConnect: jest.fn(),
      onDisconnect: jest.fn(),
      onEvent: jest.fn(),
      onReconnect: jest.fn(),
    };
    const ctx = makeContext("unfathomably");
    await resolveStreamingOrigin(ctx);
    jest.useFakeTimers();
    const connection = connectToUnfathomablyStream(
      ctx,
      { stream: "user:groups" },
      callbacks,
    );
    await flushPromises();

    const first = MockWebSocket.instances[0];
    expect(first.url).toBe(
      "wss://stream.unfathomably.example/api/v1/streaming/user/groups",
    );
    expect(first.protocols).toEqual([ctx.login.token]);
    expect(first.url).not.toContain(ctx.login.token);

    first.open();
    expect(callbacks.onConnect).toHaveBeenCalledTimes(1);
    first.receive(JSON.stringify({
      event: "update",
      payload: JSON.stringify(makeStatus("unfathomably")),
      stream: ["user:groups"],
    }));
    expect(callbacks.onEvent).toHaveBeenCalledTimes(1);

    first.serverClose();
    expect(callbacks.onDisconnect).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(reconnectDelay(0, 1));
    await flushPromises();
    const second = MockWebSocket.instances[1];
    second.open();
    expect(callbacks.onReconnect).toHaveBeenCalledTimes(1);

    connection.close();
    expect(second.readyState).toBe(MockWebSocket.CLOSED);
  });

  test("selects the unified query contract from Pleroma instance metadata", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        configuration: {
          urls: { streaming: "wss://stream.pleroma.example" },
        },
        version: "2.7.2 (compatible; Pleroma 2.10.2)",
      }),
    });
    const ctx = makeContext("pleroma");
    await resolveStreamingOrigin(ctx);
    jest.useFakeTimers();
    const connection = connectToUnfathomablyStream(
      ctx,
      { stream: "user:notification" },
      { onEvent: jest.fn() },
    );
    await flushPromises();

    expect(MockWebSocket.instances[0].url).toBe(
      "wss://stream.pleroma.example/api/v1/streaming?stream=user%3Anotifications",
    );
    expect(MockWebSocket.instances[0].protocols).toEqual([
      "pleroma-access-token",
    ]);

    connection.close();
  });

  test("bounds reconnect backoff and rejects unsafe stream inputs", () => {
    expect(reconnectDelay(0, 0)).toBe(1_000);
    expect(reconnectDelay(20, 1)).toBe(30_750);
    expect(() => buildStreamingUrl("ws://public.example", { stream: "user" }))
      .toThrow("unsafe streaming URL");
    expect(() => buildStreamingUrl("wss://social.example", { stream: "group", group: " " }))
      .toThrow("identifier is missing");
  });
});

/* end of UnfathomablyStreamingService.test.ts */
