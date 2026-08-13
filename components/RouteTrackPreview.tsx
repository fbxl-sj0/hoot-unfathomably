/*
    Project: Hoot Unfathomably
    --------------------------

    File: RouteTrackPreview.tsx

    Purpose:

        Draw a private local preview of a recorded or imported GPS track.

    Responsibilities:

        - Fit a bounded sample of route points into a phone-sized viewport
        - Mark the start and finish without loading third-party map tiles
        - Keep coordinate rendering independent from route publication

    This file intentionally does NOT contain:

        - location recording or GPX parsing
        - network map requests
        - upload or publication controls
*/

import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import useTheme from "../hooks/useTheme";
import type { RoutePoint } from "../services/RouteTrackService";
import { Text, View } from "./Themed";

const PREVIEW_WIDTH = 340;
const PREVIEW_HEIGHT = 190;
const PREVIEW_PADDING = 14;
const MAX_PREVIEW_POINTS = 700;

export type RoutePreviewGeometry = {
  finish: { x: number; y: number };
  paths: string[];
  start: { x: number; y: number };
};

function sampledPoints(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= MAX_PREVIEW_POINTS) return points;
  const step = (points.length - 1) / (MAX_PREVIEW_POINTS - 1);
  let previousSourceIndex = -1;
  return Array.from({ length: MAX_PREVIEW_POINTS }, (_value, index) => {
    const sourceIndex = Math.min(points.length - 1, Math.round(index * step));
    const sampled = points[sourceIndex];
    const crossedSegmentBoundary = points
      .slice(previousSourceIndex + 1, sourceIndex + 1)
      .some(point => point.startsSegment);
    previousSourceIndex = sourceIndex;
    return crossedSegmentBoundary ? { ...sampled, startsSegment: true } : sampled;
  });
}

export function createRoutePreviewGeometry(
  points: RoutePoint[],
  width = PREVIEW_WIDTH,
  height = PREVIEW_HEIGHT,
): RoutePreviewGeometry | undefined {
  const sampled = sampledPoints(points);
  if (sampled.length < 2 || width <= PREVIEW_PADDING * 2 || height <= PREVIEW_PADDING * 2) {
    return undefined;
  }

  const meanLatitude = sampled.reduce((total, point) => total + point.latitude, 0) / sampled.length;
  const longitudeScale = Math.max(0.01, Math.cos(meanLatitude * Math.PI / 180));
  const projected = sampled.map(point => ({
    x: point.longitude * longitudeScale,
    y: point.latitude,
  }));
  const xs = projected.map(point => point.x);
  const ys = projected.map(point => point.y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  const xRange = maximumX - minimumX || 1;
  const yRange = maximumY - minimumY || 1;
  const availableWidth = width - PREVIEW_PADDING * 2;
  const availableHeight = height - PREVIEW_PADDING * 2;
  const scale = Math.min(availableWidth / xRange, availableHeight / yRange);
  const renderedWidth = xRange * scale;
  const renderedHeight = yRange * scale;
  const offsetX = PREVIEW_PADDING + (availableWidth - renderedWidth) / 2;
  const offsetY = PREVIEW_PADDING + (availableHeight - renderedHeight) / 2;
  const fitted = projected.map(point => ({
    x: offsetX + (point.x - minimumX) * scale,
    y: offsetY + (maximumY - point.y) * scale,
  }));
  const paths: string[][] = [];
  fitted.forEach((point, index) => {
    if (index === 0 || sampled[index].startsSegment) paths.push([]);
    paths[paths.length - 1].push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  });

  return {
    finish: fitted[fitted.length - 1],
    paths: paths.filter(path => path.length > 1).map(path => path.join(" ")),
    start: fitted[0],
  };
}

export default function RouteTrackPreview({ points }: { points: RoutePoint[] }) {
  const theme = useTheme();
  const geometry = useMemo(() => createRoutePreviewGeometry(points), [points]);

  if (!geometry) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.secondaryBackground }]}>
        <Text secondary>Waiting for enough GPS points to draw the path.</Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`GPS track preview with ${points.length} points`}
      style={[styles.root, { backgroundColor: theme.secondaryBackground }]}
    >
      <Svg
        accessibilityRole="image"
        height="100%"
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        width="100%"
      >
        {geometry.paths.map((path, index) => (
          <Polyline
            key={`${index}:${path.slice(0, 24)}`}
            fill="none"
            points={path}
            stroke={theme.tint as string}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeWidth={4}
          />
        ))}
        <Circle cx={geometry.start.x} cy={geometry.start.y} fill="#24915f" r={6} />
        <Circle cx={geometry.finish.x} cy={geometry.finish.y} fill="#b43b3b" r={6} />
      </Svg>
      <View style={[styles.legend, { backgroundColor: theme.secondaryBackground }]}>
        <Text secondary style={styles.legendText}>Green start · red finish</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 12, height: PREVIEW_HEIGHT, overflow: "hidden", width: "100%" },
  empty: { alignItems: "center", borderRadius: 12, height: 130, justifyContent: "center", padding: 20 },
  legend: { bottom: 6, opacity: 0.88, paddingHorizontal: 7, paddingVertical: 3, position: "absolute", right: 7 },
  legendText: { fontSize: 11 },
});

/* end of RouteTrackPreview.tsx */
