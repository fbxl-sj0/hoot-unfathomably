/*
    Project: Hoot Mobile
    -------------------

    File: Hoverable.tsx

    Purpose:

        Expose a small render-prop wrapper for hover state.

    Responsibilities:

        - Normalize web hover events for child components
        - Clone child elements with pointer event handlers

    This file intentionally does NOT contain:

        - business logic
        - native gesture recognition
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

type BrowserDocument = {
  addEventListener?: (
    type: string,
    listener: () => void,
    useCapture?: boolean,
  ) => void;
  createElement?: unknown;
};

const browserDocument = (globalThis as { document?: BrowserDocument }).document;
const addDocumentEventListener = browserDocument?.addEventListener?.bind(
  browserDocument,
);
const canUseDOM =
  typeof browserDocument?.createElement === "function" &&
  typeof addDocumentEventListener === "function";

let isEnabled = false;

if (canUseDOM) {
  /**
   * Web browsers emulate mouse events (and hover states) after touch events.
   * This code infers when the currently-in-use modality supports hover
   * (including for multi-modality devices) and considers "hover" to be enabled
   * if a mouse movement occurs more than 1 second after the last touch event.
   * This threshold is long enough to account for longer delays between the
   * browser firing touch and mouse events on low-powered devices.
   */
  const HOVER_THRESHOLD_MS = 1000;
  let lastTouchTimestamp = 0;

  function enableHover() {
    if (isEnabled || Date.now() - lastTouchTimestamp < HOVER_THRESHOLD_MS) {
      return;
    }
    isEnabled = true;
  }

  function disableHover() {
    lastTouchTimestamp = Date.now();
    if (isEnabled) {
      isEnabled = false;
    }
  }

  addDocumentEventListener("touchstart", disableHover, true);
  addDocumentEventListener("touchmove", disableHover, true);
  addDocumentEventListener("mousemove", enableHover, true);
}

function isHoverEnabled(): boolean {
  return isEnabled;
}

export interface HoverableProps {
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  children: React.ReactElement<HoverableChildProps>;
}

type HoverableChildProps = {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onResponderGrant?: () => void;
  onResponderRelease?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
};

export default function Hoverable({
  onHoverIn,
  onHoverOut,
  children,
  onPressIn,
  onPressOut,
}: HoverableProps) {
  const [showHover, setShowHover] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const wasHovered = useRef(false);
  const pressIn = useRef(onPressIn);
  const pressOut = useRef(onPressOut);

  useEffect(() => {
    pressIn.current = onPressIn;
    pressOut.current = onPressOut;
  }, [onHoverOut, onPressIn, onPressOut]);

  useEffect(() => {
    const shouldShowHover = Platform.OS === "web" && showHover && isHovered;
    if (shouldShowHover !== wasHovered.current) {
      if (shouldShowHover && onHoverIn) {
        onHoverIn();
      } else if (!shouldShowHover && onHoverOut) {
        onHoverOut();
      }
      wasHovered.current = shouldShowHover;
    }
  }, [showHover, isHovered, onHoverIn, onHoverOut]);

  const handleMouseEnter = useCallback(() => {
    if (isHoverEnabled() && !isHovered) {
      setIsHovered(true);
    }
  }, [isHovered]);

  const handleMouseLeave = useCallback(() => {
    if (isHovered) {
      setIsHovered(false);
    }
  }, [isHovered]);

  const handleGrant = useCallback(() => {
    setShowHover(false);
    pressIn.current?.();
  }, []);

  const handleRelease = useCallback(() => {
    setShowHover(true);
    pressOut.current?.();
  }, []);

  let webProps: Partial<HoverableChildProps> = {};
  if (Platform.OS === "web") {
    webProps = {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      // prevent hover showing while responder
      onResponderGrant: handleGrant,
      onResponderRelease: handleRelease,
    };
  }

  return React.cloneElement(React.Children.only(children), {
    ...webProps,
    // if child is Touchable
    onPressIn: handleGrant,
    onPressOut: handleRelease,
  });
}

/* end of Hoverable.tsx */
