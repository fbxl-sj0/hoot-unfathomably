/*
    Project: Hoot Mobile
    --------------------------

    File: ImageViewerScreen.tsx

    Purpose:

        View an attached status image at full size with touch zoom and pan.
*/

import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Text, View } from "../components/Themed";
import { RootStackScreenProps } from "../types";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clampScale(value: number) {
  "worklet";
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export default function ImageViewerScreen({ route }: RootStackScreenProps<"ImageViewer">) {
  const [imageUri, setImageUri] = useState(route.params.uri);
  const scale = useSharedValue(MIN_SCALE);
  const savedScale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate(event => {
      scale.value = clampScale(savedScale.value * event.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value === MIN_SCALE) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate(event => {
      if (scale.value <= MIN_SCALE) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const nextScale = scale.value > MIN_SCALE ? MIN_SCALE : 2.5;
      scale.value = withSpring(nextScale);
      savedScale.value = nextScale;
      if (nextScale === MIN_SCALE) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return <View style={styles.root}>
    <GestureDetector gesture={Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan))}>
      <Animated.Image source={{ uri: imageUri }} resizeMode="contain" style={[styles.image, imageStyle]} accessibilityLabel={route.params.description || "Status image"} onError={() => { if (route.params.fallbackUri && imageUri !== route.params.fallbackUri) setImageUri(route.params.fallbackUri); }} />
    </GestureDetector>
    <Text secondary style={styles.hint}>Pinch to zoom · drag to pan · double tap to toggle zoom</Text>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#000" }, image: { flex: 1, height: "100%", width: "100%" }, hint: { padding: 14, textAlign: "center" } });

/* end of ImageViewerScreen.tsx */
