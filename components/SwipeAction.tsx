/*
    Project: Hoot Mobile
    -------------------

    File: SwipeAction.tsx

    Purpose:

        Wrap content with left and right swipe actions.

    Responsibilities:

        - Track drag distance and release thresholds
        - Invoke configured swipe callbacks
        - Render action background colors

    This file intentionally does NOT contain:

        - vote semantics
        - screen navigation rules
*/

import React, {
  ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import Icon from "@expo/vector-icons/Ionicons";
import {
  ColorValue,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "../services/HapticService";

export type Glyph = keyof typeof Icon.glyphMap;

export type SwipeActionProps = {
  iconLeftSide: [Glyph, Glyph];
  iconRightSide: [Glyph, Glyph];
  colorLeftSide: ColorValue;
  colorRightSide: ColorValue;
  backgroundColor?: ColorValue;
  onLeftSide: () => void;
  onRightSide: () => void;
  onReturnToCenter?: () => void;
  children: ReactNode;
  distanceToActivate?: number;
  style?: ViewStyle;
};

export default function SwipeAction(props: SwipeActionProps) {
  const {
    iconLeftSide,
    iconRightSide,
    colorLeftSide,
    colorRightSide,
    backgroundColor,
    onLeftSide,
    onRightSide,
    onReturnToCenter,
    children,
    distanceToActivate: distanceToActivateProp,
    style,
  } = props;

  const distanceToActivate = distanceToActivateProp || 60;
  const rightActivationPoint = distanceToActivate * 2;

  const [isScrolling, setIsScrolling] = useState(false);
  const [isLeft, setIsLeft] = useState(false);
  const [isRight, setIsRight] = useState(false);
  const [isCommitted, setIsCommitted] = useState(false);
  const dimensions = useWindowDimensions();
  const [width, setWidth] = useState<number>(dimensions.width);
  const scrollRef = useRef<ScrollView>(null);

  const evaluateSwipe = useCallback(
    (nextScroll: number) => {
      if (nextScroll < 0 && !isLeft) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsLeft(true);
      } else if (nextScroll >= 0 && isLeft) {
        setIsLeft(false);
        if (!isScrolling) {
          setIsCommitted(true);
          onLeftSide();
        }
      }

      if (nextScroll >= rightActivationPoint && !isRight) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsRight(true);
      } else if (nextScroll < rightActivationPoint && isRight) {
        setIsRight(false);
        if (!isScrolling) {
          setIsCommitted(true);
          onRightSide();
        }
      }

      if (nextScroll === distanceToActivate) {
        onReturnToCenter?.();
        setIsRight(false);
        setIsLeft(false);
        setIsCommitted(false);
      }
    },
    [distanceToActivate, isLeft, isRight, isScrolling, onLeftSide, onRightSide, onReturnToCenter, rightActivationPoint],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextScroll = event?.nativeEvent?.contentOffset?.x;
      if (nextScroll === undefined) return;
      evaluateSwipe(nextScroll);
    },
    [evaluateSwipe],
  );

  const onScrollBeginDrag = useCallback(() => setIsScrolling(true), []);
  const onScrollEndDrag = useCallback(() => {
    scrollRef.current?.scrollTo({ x: distanceToActivate });
    setIsScrolling(false);
  }, [distanceToActivate]);

  if (Platform.OS !== "ios") {
    return <View style={style}>{children}</View>;
  }

  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={{ width: "100%" }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        snapToOffsets={[distanceToActivate, distanceToActivate + width]}
        snapToStart={false}
        snapToEnd={false}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        contentOffset={{ x: distanceToActivate, y: 0 }}
        onScroll={onScroll}
        scrollEventThrottle={100}
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor, ...style }}
        overScrollMode="always"
      >
        <View
          style={{
            width: distanceToActivate,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon
            name={iconLeftSide[+isLeft || +isCommitted]}
            color={colorLeftSide}
            size={25}
          />
        </View>
        <View style={{ width: width }}>{children}</View>
        <View
          style={{
            width: distanceToActivate,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon
            name={iconRightSide[+isRight || +isCommitted]}
            color={colorRightSide}
            size={25}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/* end of SwipeAction.tsx */
