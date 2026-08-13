/*
    Project: Hoot Unfathomably
    --------------------------

    File: useUnfathomablyStream.ts

    Purpose:

        Bind a live server stream to the focused foreground screen.

    Responsibilities:

        - Start streaming only while the navigation screen is focused
        - Close sockets while Android backgrounds the JavaScript runtime
        - Request a REST catch-up after focus, resume, or reconnect gaps
        - Preserve current event callbacks without reconnecting on each render

    This file intentionally does NOT contain:

        - WebSocket protocol parsing
        - timeline mutation policy
        - background notification scheduling
*/

import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import {
  connectToUnfathomablyStream,
  UnfathomablyStreamCallbacks,
  UnfathomablyStreamConnection,
  UnfathomablyStreamDescriptor,
} from "../services/UnfathomablyStreamingService";

export type UseUnfathomablyStreamCallbacks = Pick<
  UnfathomablyStreamCallbacks,
  "onEvent"
> & {
  onCatchUp?: () => void;
};

function appStateAllowsStreaming(state: AppStateStatus | null): boolean {
  return state === null || state === "active";
}

export function streamDescriptorKey(
  descriptor: UnfathomablyStreamDescriptor | undefined,
): string {
  if (!descriptor) return "";
  return Object.entries(descriptor)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

export default function useUnfathomablyStream(
  ctx: LotideContext | null | undefined,
  descriptor: UnfathomablyStreamDescriptor | undefined,
  callbacks: UseUnfathomablyStreamCallbacks,
  enabled = true,
): void {
  const callbacksRef = useRef(callbacks);
  const contextRef = useRef(ctx);
  const descriptorRef = useRef(descriptor);
  const connectedBeforeRef = useRef(false);

  const descriptorKey = streamDescriptorKey(descriptor);
  const apiUrl = ctx?.apiUrl;
  const token = ctx?.login?.token;
  const connectionIdentity = `${apiUrl || ""}\u0000${token || ""}\u0000${descriptorKey}`;

  useEffect(() => {
    callbacksRef.current = callbacks;
    contextRef.current = ctx;
    descriptorRef.current = descriptor;
  }, [callbacks, ctx, descriptor]);

  useEffect(() => {
    connectedBeforeRef.current = false;
  }, [apiUrl, descriptorKey, token]);

  useFocusEffect(useCallback(() => {
    const activeContext = contextRef.current;
    const activeDescriptor = descriptorRef.current;
    if (
      !enabled ||
      !connectionIdentity ||
      !activeContext?.login ||
      !activeDescriptor
    ) {
      return undefined;
    }

    let connection: UnfathomablyStreamConnection | undefined;
    let closed = false;

    const stop = () => {
      connection?.close();
      connection = undefined;
    };

    const start = () => {
      if (closed || connection || !appStateAllowsStreaming(AppState.currentState)) {
        return;
      }

      const catchUpWhenConnected = connectedBeforeRef.current;
      connection = connectToUnfathomablyStream(activeContext, activeDescriptor, {
        onConnect() {
          if (catchUpWhenConnected) callbacksRef.current.onCatchUp?.();
          connectedBeforeRef.current = true;
        },
        onEvent(event) {
          callbacksRef.current.onEvent(event);
        },
        onReconnect() {
          callbacksRef.current.onCatchUp?.();
        },
      });
    };

    const appStateSubscription = AppState.addEventListener(
      "change",
      nextState => {
        if (appStateAllowsStreaming(nextState)) start();
        else stop();
      },
    );

    start();

    return () => {
      closed = true;
      appStateSubscription.remove();
      stop();
    };
  }, [connectionIdentity, enabled]));
}

/* end of useUnfathomablyStream.ts */
