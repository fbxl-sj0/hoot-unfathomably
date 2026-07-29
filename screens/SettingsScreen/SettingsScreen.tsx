/*
    Project: Hoot Mobile
    -------------------

    File: SettingsScreen.tsx

    Purpose:

        Provides a user interface for configuring application settings,
        such as the Lotide API URL and default feed sorting.

    Responsibilities:

        • Display and edit the API URL in the Lotide context
        • Configure default sorting preferences
        • Persist settings changes to local storage and Redux state
        • Manage Android notification diagnostics and test actions

    This file intentionally does NOT contain:

        • User profile management (see ProfileScreen.tsx)
        • Direct API requests (other than context updates)
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Platform,
  Switch,
} from "react-native";
import AppButton from "../../components/AppButton";
import { View, Text } from "../../components/Themed";
import useTheme from "../../hooks/useTheme";
import { useLotideCtx } from "../../hooks/useLotideCtx";
import { useDispatch, useSelector } from "react-redux";
import { setCtx } from "../../slices/lotideSlice";
import { setAppSettings, setDefaultFeedSort } from "../../slices/settingsSlice";
import { RootState } from "../../store/reduxStore";
import * as StorageService from "../../services/StorageService";
import * as LotideNotificationPoller from "../../services/LotideNotificationPoller";
import { normalizeLotideApiUrl } from "../../services/LotideService";
import { getErrorMessage } from "../../utils/error";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../../constants/TouchTargets";

/* ------------------------------------------------------------------------- */
/* Settings Screen Component                                                 */
/* ------------------------------------------------------------------------- */

const feedSortOptions: { label: string; value: SortOption }[] = [
  { label: "Hot", value: "hot" },
  { label: "New", value: "new" },
  { label: "Top", value: "top" },
];

function notificationPermissionText(
  diagnostics?: LotideNotificationPoller.NotificationDiagnostics,
): string {
  if (!diagnostics) return "Checking";
  if (!diagnostics.supported) return "Unsupported";
  if (diagnostics.permissionGranted) return "Allowed";
  if (!diagnostics.permissionCanAskAgain) return "Blocked in Android settings";

  return `Needs permission (${diagnostics.permissionStatus})`;
}

function notificationBackgroundText(
  diagnostics?: LotideNotificationPoller.NotificationDiagnostics,
): string {
  if (!diagnostics) return "Checking";
  if (!diagnostics.supported) return "Unsupported";
  if (!diagnostics.enabled) return "Off";
  if (!diagnostics.backgroundAvailable) {
    return `Unavailable (${diagnostics.backgroundStatus})`;
  }

  return diagnostics.taskRegistered ? "Ready" : "Not registered";
}

function formatDiagnosticTime(value?: string): string {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString();
}

function notificationLastCheckText(
  diagnostics?: LotideNotificationPoller.NotificationDiagnostics,
): string {
  if (!diagnostics) return "Checking";
  if (diagnostics.poll.lastError) return "Failed";
  if (diagnostics.poll.lastSkippedReason === "disabled") return "Skipped, off";
  if (diagnostics.poll.lastSkippedReason === "permission_denied") {
    return "Skipped, permission denied";
  }
  if (diagnostics.poll.lastSkippedReason === "no_context") {
    return "Skipped, signed out";
  }

  return formatDiagnosticTime(
    diagnostics.poll.lastSuccessAt ?? diagnostics.poll.lastAttemptAt,
  );
}

function notificationLastAlertText(
  diagnostics?: LotideNotificationPoller.NotificationDiagnostics,
): string {
  if (!diagnostics) return "Checking";
  if (diagnostics.poll.lastScheduledCount < 1) return "None";

  return `${diagnostics.poll.lastScheduledCount} at ${formatDiagnosticTime(
    diagnostics.poll.lastScheduledAt,
  )}`;
}

function shouldOfferNotificationSettings(
  diagnostics?: LotideNotificationPoller.NotificationDiagnostics,
): boolean {
  if (!diagnostics) return false;
  if (!diagnostics.supported) return false;
  if (diagnostics.permissionGranted) return false;

  return !diagnostics.permissionCanAskAgain ||
    diagnostics.permissionStatus === "denied";
}

function isSupportedApiUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;

  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

export default function SettingsScreen() {
  const theme = useTheme();
  const ctx = useLotideCtx();
  const dispatch = useDispatch();
  const defaultFeedSort = useSelector(
    (state: RootState) => state.settings.defaultFeedSort,
  );

  const [apiUrl, setApiUrl] = useState(ctx?.apiUrl || "https://narwhal.city/api/unstable");
  const [updatingDefaultFeedSort, setUpdatingDefaultFeedSort] = useState(false);
  const [notificationEnabled, setNotificationEnabledState] = useState(false);
  const [updatingNotificationSetting, setUpdatingNotificationSetting] = useState(false);
  const [sendingTestNotification, setSendingTestNotification] = useState(false);
  const [checkingNotificationsNow, setCheckingNotificationsNow] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [openingNotificationSettings, setOpeningNotificationSettings] =
    useState(false);
  const [notificationDiagnostics, setNotificationDiagnostics] =
    useState<LotideNotificationPoller.NotificationDiagnostics | undefined>();
  const isMountedRef = useRef(true);
  const defaultFeedSortRequestRef = useRef(false);
  const notificationSettingRequestRef = useRef(false);
  const testNotificationRequestRef = useRef(false);
  const checkNotificationsRequestRef = useRef(false);
  const openNotificationSettingsRequestRef = useRef(false);
  const saveSettingsRequestRef = useRef(false);
  const notificationDiagnosticsRequestId = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      defaultFeedSortRequestRef.current = false;
      notificationSettingRequestRef.current = false;
      testNotificationRequestRef.current = false;
      checkNotificationsRequestRef.current = false;
      openNotificationSettingsRequestRef.current = false;
      saveSettingsRequestRef.current = false;
      notificationDiagnosticsRequestId.current += 1;
    };
  }, []);

  const alertIfMounted = useCallback((title: string, message: string) => {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }, []);

  const refreshNotificationDiagnostics = useCallback(async () => {
    if (Platform.OS !== "android") return;

    const requestId = notificationDiagnosticsRequestId.current + 1;

    notificationDiagnosticsRequestId.current = requestId;

    let diagnostics: LotideNotificationPoller.NotificationDiagnostics;

    try {
      diagnostics = await LotideNotificationPoller.getNotificationDiagnostics();
    } catch (error) {
      if (
        !isMountedRef.current ||
        requestId !== notificationDiagnosticsRequestId.current
      ) {
        return;
      }

      throw error;
    }

    if (
      !isMountedRef.current ||
      requestId !== notificationDiagnosticsRequestId.current
    ) {
      return;
    }

    setNotificationDiagnostics(diagnostics);
    setNotificationEnabledState(diagnostics.enabled);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const timer = setTimeout(() => {
      refreshNotificationDiagnostics().catch(error => {
        alertIfMounted("Cannot check notifications", getErrorMessage(error));
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [alertIfMounted, refreshNotificationDiagnostics]);

  /* ------------------------------------------------------------------------- */
  /* Actions                                                                   */
  /* ------------------------------------------------------------------------- */

  /**
      Saves the updated API URL and persists it to storage.
  */
  const handleSave = async () => {
    if (saveSettingsRequestRef.current) return;

    const nextApiUrl = normalizeLotideApiUrl(apiUrl);

    if (!isSupportedApiUrl(nextApiUrl)) {
      alertIfMounted(
        "Invalid URL",
        "API URL must start with http:// or https://",
      );
      return;
    }

    saveSettingsRequestRef.current = true;
    setSavingSettings(true);

    try {
      const newCtx = { ...ctx, apiUrl: nextApiUrl };
      await StorageService.lotideContext.store(newCtx);
      dispatch(setCtx(newCtx));
      if (isMountedRef.current) {
        setApiUrl(nextApiUrl);
      }
      alertIfMounted("Success", "Settings saved successfully");
    } catch {
      alertIfMounted("Error", "Failed to save settings");
    } finally {
      saveSettingsRequestRef.current = false;

      if (isMountedRef.current) {
        setSavingSettings(false);
      }
    }
  };

  const handleDefaultFeedSortChange = async (nextSort: SortOption) => {
    if (nextSort === defaultFeedSort) return;
    if (defaultFeedSortRequestRef.current) return;

    defaultFeedSortRequestRef.current = true;
    setUpdatingDefaultFeedSort(true);
    dispatch(setDefaultFeedSort(nextSort));

    try {
      const settings = await StorageService.appSettings.update({
        defaultFeedSort: nextSort,
      });
      dispatch(setAppSettings(settings));
    } catch (error) {
      dispatch(setDefaultFeedSort(defaultFeedSort));
      alertIfMounted("Cannot save default sort", getErrorMessage(error));
    } finally {
      defaultFeedSortRequestRef.current = false;

      if (isMountedRef.current) {
        setUpdatingDefaultFeedSort(false);
      }
    }
  };

  const handleNotificationSettingChange = async (nextValue: boolean) => {
    if (Platform.OS !== "android") return;
    if (notificationSettingRequestRef.current) return;

    notificationSettingRequestRef.current = true;
    setUpdatingNotificationSetting(true);

    try {
      await LotideNotificationPoller.setNotificationEnabled(
        nextValue,
        ctx ?? undefined,
      );
      if (isMountedRef.current) {
        setNotificationEnabledState(nextValue);
      }
      await refreshNotificationDiagnostics();
    } catch (error) {
      const current =
        await LotideNotificationPoller.getNotificationEnabled();
      if (isMountedRef.current) {
        setNotificationEnabledState(current);
      }
      await refreshNotificationDiagnostics();
      alertIfMounted(
        nextValue ? "Cannot enable notifications" : "Cannot update notifications",
        getErrorMessage(error),
      );
    } finally {
      notificationSettingRequestRef.current = false;

      if (isMountedRef.current) {
        setUpdatingNotificationSetting(false);
      }
    }
  };

  const handleSendTestNotification = async () => {
    if (Platform.OS !== "android") return;
    if (testNotificationRequestRef.current) return;

    testNotificationRequestRef.current = true;
    setSendingTestNotification(true);

    try {
      await LotideNotificationPoller.sendTestNotification();
      await refreshNotificationDiagnostics();
      alertIfMounted(
        "Test notification sent",
        "A local Hoot notification was scheduled.",
      );
    } catch (error) {
      await refreshNotificationDiagnostics();
      alertIfMounted("Cannot send test notification", getErrorMessage(error));
    } finally {
      testNotificationRequestRef.current = false;

      if (isMountedRef.current) {
        setSendingTestNotification(false);
      }
    }
  };

  const handleCheckNotificationsNow = async () => {
    if (Platform.OS !== "android") return;
    if (checkNotificationsRequestRef.current) return;

    if (!ctx?.login) {
      alertIfMounted(
        "Sign in required",
        "Sign in before checking Lotide notifications.",
      );
      return;
    }

    if (!notificationEnabled) {
      alertIfMounted(
        "Notifications are off",
        "Turn on background notifications before checking for local alerts.",
      );
      return;
    }

    checkNotificationsRequestRef.current = true;
    setCheckingNotificationsNow(true);

    try {
      const count = await LotideNotificationPoller.pollNotificationsNow(ctx);
      await refreshNotificationDiagnostics();
      alertIfMounted(
        "Notification check complete",
        count === 1
          ? "1 local alert was scheduled."
          : `${count} local alerts were scheduled.`,
      );
    } catch (error) {
      await refreshNotificationDiagnostics();
      alertIfMounted("Cannot check notifications", getErrorMessage(error));
    } finally {
      checkNotificationsRequestRef.current = false;

      if (isMountedRef.current) {
        setCheckingNotificationsNow(false);
      }
    }
  };

  const handleOpenNotificationSettings = async () => {
    if (openNotificationSettingsRequestRef.current) return;

    openNotificationSettingsRequestRef.current = true;
    setOpeningNotificationSettings(true);

    try {
      await Linking.openSettings();
    } catch (error) {
      alertIfMounted("Cannot open settings", getErrorMessage(error));
    } finally {
      openNotificationSettingsRequestRef.current = false;

      if (isMountedRef.current) {
        setOpeningNotificationSettings(false);
      }
    }
  };

  /* ------------------------------------------------------------------------- */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------- */

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.section}>
        <Text style={styles.header}>SERVER SETTINGS</Text>
        <Text style={[styles.label, { color: theme.secondaryText }]}>Lotide API URL</Text>
        <TextInput
          accessibilityLabel="Lotide API URL"
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.secondaryBackground,
              borderColor: theme.tertiaryBackground
            }
          ]}
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder="https://narwhal.city/api/unstable"
          placeholderTextColor={theme.placeholderText}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={[styles.hint, { color: theme.secondaryText }]}>
          Changes the Lotide node your app connects to. Defaults to narwhal.city.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.header}>FEED SETTINGS</Text>
        <View
          style={[
            styles.row,
            styles.sortRow,
            { borderBottomColor: theme.tertiaryBackground },
          ]}
        >
          <Text style={[styles.rowLabel, { color: theme.text }]}>
            Default Sort
          </Text>
          <View style={styles.sortOptions}>
            {feedSortOptions.map(option => {
              const selected = option.value === defaultFeedSort;

              return (
                <Pressable
                  accessibilityLabel={`Set default sort to ${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: updatingDefaultFeedSort,
                    selected,
                  }}
                  disabled={updatingDefaultFeedSort}
                  key={option.value}
                  onPress={() => {
                    handleDefaultFeedSortChange(option.value).catch(error => {
                      Alert.alert(
                        "Cannot save default sort",
                        getErrorMessage(error),
                      );
                    });
                  }}
                  style={({ pressed }) => [
                    styles.sortOption,
                    {
                      backgroundColor: selected
                        ? theme.tint
                        : theme.secondaryBackground,
                      borderColor: selected
                        ? theme.tint
                        : theme.tertiaryBackground,
                      opacity: pressed && !updatingDefaultFeedSort ? 0.74 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      { color: selected ? "#111827" : theme.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {Platform.OS === "android" ? (
        <View style={styles.section}>
          <Text style={styles.header}>NOTIFICATIONS</Text>
          <View style={[styles.row, { borderBottomColor: theme.tertiaryBackground }]}>
            <Text style={{ color: theme.text }}>Background notifications</Text>
            <Switch
              value={notificationEnabled}
              onValueChange={handleNotificationSettingChange}
              disabled={updatingNotificationSetting}
            />
          </View>
          <Text style={[styles.hint, { color: theme.secondaryText }]}>
            Checks Lotide in the background when the operating system allows it
            and shows local alerts for notifications this phone has not already
            surfaced.
          </Text>
          <View style={[styles.statusRow, { borderBottomColor: theme.tertiaryBackground }]}>
            <Text style={[styles.statusLabel, { color: theme.secondaryText }]}>
              Local alerts
            </Text>
            <Text style={[styles.statusValue, { color: theme.text }]}>
              {notificationPermissionText(notificationDiagnostics)}
            </Text>
          </View>
          <View style={[styles.statusRow, { borderBottomColor: theme.tertiaryBackground }]}>
            <Text style={[styles.statusLabel, { color: theme.secondaryText }]}>
              Background polling
            </Text>
            <Text style={[styles.statusValue, { color: theme.text }]}>
              {notificationBackgroundText(notificationDiagnostics)}
            </Text>
          </View>
          <View style={[styles.statusRow, { borderBottomColor: theme.tertiaryBackground }]}>
            <Text style={[styles.statusLabel, { color: theme.secondaryText }]}>
              Last check
            </Text>
            <Text style={[styles.statusValue, { color: theme.text }]}>
              {notificationLastCheckText(notificationDiagnostics)}
            </Text>
          </View>
          <View style={[styles.statusRow, { borderBottomColor: theme.tertiaryBackground }]}>
            <Text style={[styles.statusLabel, { color: theme.secondaryText }]}>
              Last local alert
            </Text>
            <Text style={[styles.statusValue, { color: theme.text }]}>
              {notificationLastAlertText(notificationDiagnostics)}
            </Text>
          </View>
          {notificationDiagnostics?.error ? (
            <Text style={[styles.hint, { color: theme.red }]}>
              {notificationDiagnostics.error}
            </Text>
          ) : null}
          {notificationDiagnostics?.poll.lastError ? (
            <Text style={[styles.hint, { color: theme.red }]}>
              {notificationDiagnostics.poll.lastError}
            </Text>
          ) : null}
          {shouldOfferNotificationSettings(notificationDiagnostics) ? (
            <AppButton
              title={
                openingNotificationSettings
                  ? "Opening Settings..."
                  : "Open Notification Settings"
              }
              onPress={handleOpenNotificationSettings}
              color={theme.secondaryTint}
              disabled={openingNotificationSettings || updatingNotificationSetting}
              fullWidth
              style={styles.notificationButton}
            />
          ) : null}
          <AppButton
            title={checkingNotificationsNow ? "Checking..." : "Check Notifications Now"}
            onPress={handleCheckNotificationsNow}
            color={theme.tint}
            disabled={checkingNotificationsNow || updatingNotificationSetting}
            fullWidth
            style={styles.notificationButton}
            testID="settings-check-notifications-now"
          />
          <AppButton
            title={sendingTestNotification ? "Sending..." : "Send Test Notification"}
            onPress={handleSendTestNotification}
            color={theme.secondaryTint}
            disabled={sendingTestNotification || updatingNotificationSetting}
            fullWidth
            style={styles.notificationButton}
            testID="settings-send-test-notification"
          />
        </View>
      ) : null}

      <View style={styles.buttonContainer}>
        <AppButton
          title={savingSettings ? "Saving..." : "Save Changes"}
          onPress={handleSave}
          color={theme.tint}
          disabled={savingSettings}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------------- */
/* Styles                                                                    */
/* ------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 5,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    paddingHorizontal: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  sortRow: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  sortOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  sortOption: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    marginBottom: 8,
    marginRight: 8,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: 84,
    paddingHorizontal: 14,
  },
  sortOptionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  statusRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  statusLabel: {
    flex: 1,
    fontSize: 13,
    paddingRight: 12,
  },
  statusValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  notificationButton: {
    marginTop: 14,
  },
  buttonContainer: {
    marginTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
});

/* end of SettingsScreen.tsx */
