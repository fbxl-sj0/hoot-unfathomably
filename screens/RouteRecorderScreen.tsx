/*
    Project: Hoot Unfathomably
    --------------------------

    File: RouteRecorderScreen.tsx

    Purpose:

        Record, import, review, and publish a GPS path from an Android phone.

    Responsibilities:

        - Request foreground location only after an explicit recording action
        - Keep and recover an unfinished private route draft on the device
        - Import and export bounded GPX tracks through Android system pickers
        - Upload and publish a confirmed route through Unfathomably

    This file intentionally does NOT contain:

        - background or always-on location tracking
        - direct Wanderer requests
        - hidden publication or automatic reverse geocoding
*/

import Icon from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { useKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

import AppButton from "../components/AppButton";
import RouteTrackPreview from "../components/RouteTrackPreview";
import SuggestLogin from "../components/SuggestLogin";
import { Text, TextInput, View } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { useLotideCtx } from "../hooks/useLotideCtx";
import {
  appendRoutePoint,
  getRouteTrackMetrics,
  MAX_ROUTE_FILE_BYTES,
  parseGpx,
  readRouteTrackDraft,
  removeRouteTrackDraft,
  RoutePoint,
  routePointFromLocation,
  saveRouteTrackDraft,
} from "../services/RouteTrackService";
import {
  publishRoute,
  readRouteGpxFile,
  ROUTE_DIFFICULTIES,
  ROUTE_KINDS,
  RouteDifficulty,
  RouteKind,
  uploadRouteGpx,
  writeRouteGpxFile,
} from "../services/UnfathomablyRoutesService";
import type { RootStackScreenProps } from "../types";
import { getErrorMessage } from "../utils/error";
import { openExternalLink } from "../utils/externalLink";

type RouteVisibility = "private" | "public" | "unlisted";

function ActiveRecorderKeepAwake() {
  useKeepAwake();
  return null;
}

function accountStorageId(ctx: LotideContext): string {
  const user = ctx.login?.user as unknown as { id?: string | number; username?: string } | undefined;
  return String(user?.id ?? user?.username ?? "active");
}

function formatDistance(metres: number): string {
  if (metres >= 1_000) return `${(metres / 1_000).toFixed(metres >= 10_000 ? 1 : 2)} km`;
  return `${Math.round(metres)} m`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function friendlyEnum(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

/* ------------------------------------------------------------------------- */
/* Screen                                                                    */
/* ------------------------------------------------------------------------- */

export default function RouteRecorderScreen({
  navigation,
}: RootStackScreenProps<"RouteRecorder">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const subscription = useRef<Location.LocationSubscription | undefined>(undefined);
  const pointsRef = useRef<RoutePoint[]>([]);
  const nextPointStartsSegment = useRef(false);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [recording, setRecording] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [routeKind, setRouteKind] = useState<RouteKind>("trail");
  const [difficulty, setDifficulty] = useState<RouteDifficulty>();
  const [locationName, setLocationName] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<RouteVisibility>("public");
  const [spoilerEnabled, setSpoilerEnabled] = useState(false);
  const [spoilerText, setSpoilerText] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");

  const storageId = ctx?.login ? accountStorageId(ctx as LotideContext) : "";
  const metrics = useMemo(() => getRouteTrackMetrics(points), [points]);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    if (!storageId) return;
    let active = true;
    const timer = setTimeout(() => {
      /*
          A stack screen may survive an account switch. Clear every prior
          account coordinate before reading the newly selected account draft.
      */
      subscription.current?.remove();
      subscription.current = undefined;
      pointsRef.current = [];
      setPoints([]);
      setTitle("");
      setContent("");
      setRecording(false);
      setRestoring(true);
      setStatusText("");

      void readRouteTrackDraft(storageId)
        .then(draft => {
          if (!active || !draft) return;
          pointsRef.current = draft.points;
          setPoints(draft.points);
          setTitle(draft.title || "");
          setStatusText("Recovered an unfinished route stored on this device.");
        })
        .finally(() => {
          if (active) setRestoring(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [storageId]);

  useEffect(() => {
    if (!storageId || restoring || points.length === 0) return;
    const timer = setTimeout(() => {
      void saveRouteTrackDraft(storageId, { points, title }).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [points, restoring, storageId, title]);

  const stopRecording = useCallback(() => {
    subscription.current?.remove();
    subscription.current = undefined;
    setRecording(false);
  }, []);

  useEffect(() => () => {
    subscription.current?.remove();
    subscription.current = undefined;
  }, []);

  if (!ctx?.login) return <SuggestLogin />;

  /* ----------------------------------------------------------------------- */
  /* Recording and file actions                                              */
  /* ----------------------------------------------------------------------- */

  async function startRecording() {
    if (recording || busy) return;
    setBusy(true);
    setStatusText("");
    try {
      if (!await Location.hasServicesEnabledAsync()) {
        throw new Error("Turn on device location services before recording a route.");
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error("Location permission is required only while the route recorder is open.");
      }

      nextPointStartsSegment.current = pointsRef.current.length > 0;

      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 3_000,
        },
        fix => {
          const locationPoint = routePointFromLocation(fix);
          const candidate = locationPoint && nextPointStartsSegment.current
            ? { ...locationPoint, startsSegment: true }
            : locationPoint;
          const next = appendRoutePoint(pointsRef.current, candidate);
          if (next === pointsRef.current) return;
          nextPointStartsSegment.current = false;
          pointsRef.current = next;
          setPoints(next);
          setStatusText(next.length < 2 ? "GPS fix received. Move a little to draw the route." : "Recording GPS path on this device.");
        },
        reason => {
          setStatusText(`Location service: ${reason}`);
        },
      );
      setRecording(true);
      setStatusText("Waiting for a precise GPS fix...");
    } catch (reason) {
      Alert.alert("Could not start recording", getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function importGpx() {
    if (recording || busy) return;
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*",
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset || !asset.name.toLowerCase().endsWith(".gpx")) {
        throw new Error("Choose a GPX file ending in .gpx.");
      }
      if (typeof asset.size === "number" && asset.size > MAX_ROUTE_FILE_BYTES) {
        throw new Error("The GPX file is larger than 8 MB.");
      }
      const imported = parseGpx(await readRouteGpxFile(asset.uri));
      pointsRef.current = imported.points;
      setPoints(imported.points);
      if (!title.trim()) setTitle(imported.title || asset.name.replace(/\.gpx$/i, ""));
      setStatusText(`Imported ${imported.points.length.toLocaleString()} GPX points.`);
    } catch (reason) {
      Alert.alert("Could not import GPX", getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function shareGpx() {
    if (points.length < 2 || busy) return;
    setBusy(true);
    try {
      if (!await Sharing.isAvailableAsync()) {
        throw new Error("File sharing is not available on this device.");
      }
      const file = await writeRouteGpxFile(points, title || "Recorded route");
      await Sharing.shareAsync(file.uri, {
        dialogTitle: "Export GPS route",
        mimeType: "application/gpx+xml",
      });
    } catch (reason) {
      Alert.alert("Could not export GPX", getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function confirmDiscard() {
    if (points.length === 0 || busy) return;
    Alert.alert(
      "Discard this GPS path?",
      "The private on-device draft will be removed. Nothing will be deleted from the server.",
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Discard",
          onPress: () => {
            stopRecording();
            pointsRef.current = [];
            setPoints([]);
            setTitle("");
            setContent("");
            setStatusText("");
            void removeRouteTrackDraft(storageId);
          },
        },
      ],
    );
  }

  function openStartOnMap() {
    const start = points[0];
    if (!start) return;
    const latitude = start.latitude.toFixed(6);
    const longitude = start.longitude.toFixed(6);
    void openExternalLink(`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`);
  }

  /* ----------------------------------------------------------------------- */
  /* Publication                                                             */
  /* ----------------------------------------------------------------------- */

  async function executePublish() {
    if (busy || points.length < 2) return;
    setBusy(true);
    setStatusText("Preparing GPX track...");
    try {
      const file = await writeRouteGpxFile(points, title);
      setStatusText("Uploading GPX track...");
      const mediaId = await uploadRouteGpx(ctx as LotideContext, file);
      setStatusText("Publishing route...");
      const status = await publishRoute(ctx as LotideContext, {
        content,
        difficulty,
        location: locationName,
        mediaId,
        points,
        routeKind,
        spoilerText: spoilerEnabled ? spoilerText : undefined,
        tags,
        title,
        visibility,
      });
      await removeRouteTrackDraft(storageId);
      pointsRef.current = [];
      setPoints([]);
      navigation.replace("Status", { statusId: status.id });
    } catch (reason) {
      setStatusText("The local route draft is still available.");
      Alert.alert("Could not publish route", getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function confirmPublish() {
    if (busy) return;
    Alert.alert(
      "Publish this GPS path?",
      `This will upload ${points.length.toLocaleString()} precise location points and publish them with ${visibility === "private" ? "followers-only" : visibility} visibility.`,
      [
        { style: "cancel", text: "Cancel" },
        { text: "Publish", onPress: () => { void executePublish(); } },
      ],
    );
  }

  const cannotPublish =
    busy ||
    recording ||
    points.length < 2 ||
    !title.trim() ||
    !content.trim() ||
    (spoilerEnabled && !spoilerText.trim());

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      {recording ? <ActiveRecorderKeepAwake /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>GPS paths</Text>
        <Text secondary style={styles.privacy}>
          Recording runs only while this screen and the app are open. The path stays private on this device until you explicitly publish it.
        </Text>

        {points.length > 0 ? <RouteTrackPreview points={points} /> : (
          <View style={[styles.emptyPreview, { backgroundColor: theme.secondaryBackground }]}>
            <Icon color={theme.tint} name="map-outline" size={43} />
            <Text style={styles.emptyTitle}>No GPS path yet</Text>
            <Text secondary style={styles.emptyText}>Record with this phone or import an existing GPX track.</Text>
          </View>
        )}

        <View style={styles.recordActions}>
          <AppButton
            color={recording ? "#b43b3b" : theme.tint}
            disabled={busy}
            onPress={recording ? stopRecording : () => { void startRecording(); }}
            title={recording ? "Stop recording" : points.length ? "Resume recording" : "Start recording"}
          />
          <Pressable accessibilityLabel="Import a GPX route" accessibilityRole="button" disabled={busy || recording} onPress={() => { void importGpx(); }} style={styles.iconAction}>
            <Icon color={theme.tint} name="folder-open-outline" size={23} />
            <Text tint>Import GPX</Text>
          </Pressable>
        </View>

        {statusText ? <Text secondary style={styles.status}>{statusText}</Text> : null}

        {points.length > 0 ? (
          <>
            <View style={styles.metrics}>
              <Metric label="Distance" value={formatDistance(metrics.distanceMetres)} />
              <Metric label="Duration" value={formatDuration(metrics.durationSeconds)} />
              <Metric label="Points" value={metrics.pointCount.toLocaleString()} />
              <Metric label="Elevation" value={`+${Math.round(metrics.elevationGainMetres)} / -${Math.round(metrics.elevationLossMetres)} m`} />
            </View>
            <View style={styles.trackActions}>
              <Pressable accessibilityRole="button" onPress={openStartOnMap} style={styles.iconAction}>
                <Icon color={theme.tint} name="navigate-outline" size={21} />
                <Text tint>Open start on map</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy || points.length < 2} onPress={() => { void shareGpx(); }} style={styles.iconAction}>
                <Icon color={theme.tint} name="share-outline" size={21} />
                <Text tint>Export GPX</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={confirmDiscard} style={styles.iconAction}>
                <Icon color="#b43b3b" name="trash-outline" size={21} />
                <Text style={styles.discardText}>Discard</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {points.length >= 2 ? (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Route details</Text>
            <TextInput accessibilityLabel="Route title" maxLength={200} onChangeText={setTitle} placeholder="Route title" style={styles.input} value={title} />
            <TextInput accessibilityLabel="Route description" maxLength={100000} multiline onChangeText={setContent} placeholder="Describe the terrain, access, conditions, and anything people should know" style={styles.description} value={content} />

            <Text secondary style={styles.label}>Route type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
              {ROUTE_KINDS.map(kind => (
                <ChoicePill key={kind} label={friendlyEnum(kind)} selected={routeKind === kind} onPress={() => setRouteKind(kind)} />
              ))}
            </ScrollView>

            <Text secondary style={styles.label}>Difficulty, optional</Text>
            <View style={styles.pills}>
              <ChoicePill label="Not set" selected={difficulty === undefined} onPress={() => setDifficulty(undefined)} />
              {ROUTE_DIFFICULTIES.map(value => (
                <ChoicePill key={value} label={friendlyEnum(value)} selected={difficulty === value} onPress={() => setDifficulty(value)} />
              ))}
            </View>

            <TextInput accessibilityLabel="Route location name" maxLength={160} onChangeText={setLocationName} placeholder="Location name, optional" style={styles.input} value={locationName} />
            <TextInput accessibilityLabel="Route tags" maxLength={200} onChangeText={setTags} placeholder="Tags, comma separated" style={styles.input} value={tags} />

            <Text secondary style={styles.label}>Visibility</Text>
            <View style={styles.pills}>
              {([
                { id: "public", label: "Public" },
                { id: "unlisted", label: "Quiet public" },
                { id: "private", label: "Followers" },
              ] as { id: RouteVisibility; label: string }[]).map(option => (
                <ChoicePill key={option.id} label={option.label} selected={visibility === option.id} onPress={() => setVisibility(option.id)} />
              ))}
            </View>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: spoilerEnabled }} onPress={() => setSpoilerEnabled(value => !value)} style={[styles.warningToggle, spoilerEnabled && { backgroundColor: theme.secondaryBackground }]}>
              <Icon color={theme.tint} name="warning-outline" size={20} />
              <Text>Content warning</Text>
            </Pressable>
            {spoilerEnabled ? <TextInput accessibilityLabel="Route content warning" maxLength={500} onChangeText={setSpoilerText} placeholder="Brief content warning" style={styles.input} value={spoilerText} /> : null}

            <Text secondary style={styles.publishNotice}>
              Publishing uploads the precise GPX track to your server and creates a federated Routes post. Review the visibility before continuing.
            </Text>
            <AppButton color={theme.tint} disabled={cannotPublish} fullWidth onPress={confirmPublish} title={busy ? "Working..." : recording ? "Stop recording to publish" : "Review and publish route"} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------------- */
/* Small presentation helpers                                                */
/* ------------------------------------------------------------------------- */

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: theme.secondaryBackground }]}>
      <Text secondary style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ChoicePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.pill, selected && { backgroundColor: theme.tint }]}>
      <Text style={selected ? { color: theme.background } : undefined}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 13, padding: 16 },
  heading: { fontSize: 25, fontWeight: "700" },
  privacy: { fontSize: 14, lineHeight: 20 },
  emptyPreview: { alignItems: "center", borderRadius: 12, gap: 7, minHeight: 180, justifyContent: "center", padding: 20 },
  emptyTitle: { fontSize: 19, fontWeight: "700" },
  emptyText: { textAlign: "center" },
  recordActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 11 },
  iconAction: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 48, paddingHorizontal: 7 },
  status: { fontSize: 13 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { borderRadius: 9, flexBasis: 135, flexGrow: 1, gap: 2, padding: 10 },
  metricLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  metricValue: { fontSize: 17, fontWeight: "700" },
  trackActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  discardText: { color: "#b43b3b" },
  form: { gap: 11, paddingTop: 7 },
  sectionTitle: { fontSize: 21, fontWeight: "700" },
  input: { minHeight: 48 },
  description: { minHeight: 150, textAlignVertical: "top" },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pill: { borderRadius: 18, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  warningToggle: { alignItems: "center", alignSelf: "flex-start", borderRadius: 9, flexDirection: "row", gap: 7, minHeight: 48, paddingHorizontal: 12 },
  publishNotice: { fontSize: 13, lineHeight: 19 },
});

/* end of RouteRecorderScreen.tsx */
