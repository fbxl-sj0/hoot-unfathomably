/*
    Project: Hoot Unfathomably
    --------------------------

    File: SettingsScreen.tsx

    Purpose:

        Provides a user interface for configuring application settings,
        including the Fediverse server, feed sorting, and notifications.

    Responsibilities:

        • Display and edit the active Fediverse server URL
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
import * as NotificationPoller from "../../services/NotificationPoller";
import {
  getSupportedServerUrl,
  normalizeServerUrl,
} from "../../services/UnfathomablyService";
import { getErrorMessage } from "../../utils/error";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  SCROLL_FORM_BOTTOM_PADDING,
} from "../../constants/TouchTargets";

/* ------------------------------------------------------------------------- */
/* Settings Screen Component                                                 */
/* ------------------------------------------------------------------------- */

const feedSortOptions: { label: string; value: SortOption }[] = [
  { label: "Hot", value: "hot" },
  { label: "New", value: "new" },
  { label: "Top", value: "top" },
];

function notificationPermissionText(
  diagnostics?: NotificationPoller.NotificationDiagnostics,
): string {
  if (!diagnostics) return "Checking";
  if (!diagnostics.supported) return "Unsupported";
  if (diagnostics.permissionGranted) return "Allowed";
  if (!diagnostics.permissionCanAskAgain) return "Blocked in Android settings";

  return `Needs permission (${diagnostics.permissionStatus})`;
}

function notificationBackgroundText(
  diagnostics?: NotificationPoller.NotificationDiagnostics,
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
  diagnostics?: NotificationPoller.NotificationDiagnostics,
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
  diagnostics?: NotificationPoller.NotificationDiagnostics,
): string {
  if (!diagnostics) return "Checking";
  if (diagnostics.poll.lastScheduledCount < 1) return "None";

  return `${diagnostics.poll.lastScheduledCount} at ${formatDiagnosticTime(
    diagnostics.poll.lastScheduledAt,
  )}`;
}

function shouldOfferNotificationSettings(
  diagnostics?: NotificationPoller.NotificationDiagnostics,
): boolean {
  if (!diagnostics) return false;
  if (!diagnostics.supported) return false;
  if (diagnostics.permissionGranted) return false;

  return (
    !diagnostics.permissionCanAskAgain ||
    diagnostics.permissionStatus === "denied"
  );
}

function isSupportedApiUrl(value: string): boolean {
  return getSupportedServerUrl(value) !== undefined;
}

export default function SettingsScreen({ navigation }: { navigation?: any }) {
  const theme = useTheme();
  const ctx = useLotideCtx();
  const dispatch = useDispatch();
  const defaultFeedSort = useSelector(
    (state: RootState) => state.settings.defaultFeedSort,
  );
  const storedSettings = useSelector((state: RootState) => state.settings);
  const accessibilitySettings = {
    alwaysExpandContentWarnings:
      storedSettings.alwaysExpandContentWarnings ?? false,
    highContrast: storedSettings.highContrast ?? false,
    locale: storedSettings.locale ?? "system",
    reduceMotion: storedSettings.reduceMotion ?? false,
    showMediaDescriptions: storedSettings.showMediaDescriptions ?? false,
    textScale: storedSettings.textScale ?? 1,
  };

  const [apiUrl, setApiUrl] = useState(ctx?.apiUrl || "");
  const [updatingDefaultFeedSort, setUpdatingDefaultFeedSort] = useState(false);
  const [notificationEnabled, setNotificationEnabledState] = useState(false);
  const [updatingNotificationSetting, setUpdatingNotificationSetting] =
    useState(false);
  const [sendingTestNotification, setSendingTestNotification] = useState(false);
  const [checkingNotificationsNow, setCheckingNotificationsNow] =
    useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [updatingAccessibility, setUpdatingAccessibility] = useState(false);
  const [openingNotificationSettings, setOpeningNotificationSettings] =
    useState(false);
  const [notificationDiagnostics, setNotificationDiagnostics] = useState<
    NotificationPoller.NotificationDiagnostics | undefined
  >();
  const isMountedRef = useRef(true);
  const defaultFeedSortRequestRef = useRef(false);
  const notificationSettingRequestRef = useRef(false);
  const testNotificationRequestRef = useRef(false);
  const checkNotificationsRequestRef = useRef(false);
  const openNotificationSettingsRequestRef = useRef(false);
  const saveSettingsRequestRef = useRef(false);
  const accessibilityRequestRef = useRef(false);
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
      accessibilityRequestRef.current = false;
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

    let diagnostics: NotificationPoller.NotificationDiagnostics;

    try {
      diagnostics = await NotificationPoller.getNotificationDiagnostics();
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

    const nextApiUrl = normalizeServerUrl(apiUrl);

    if (!isSupportedApiUrl(nextApiUrl)) {
      alertIfMounted(
        "Invalid URL",
        "Enter a valid HTTPS server URL. HTTP is allowed only for local development.",
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
      await NotificationPoller.setNotificationEnabled(
        nextValue,
        ctx ?? undefined,
      );
      if (isMountedRef.current) {
        setNotificationEnabledState(nextValue);
      }
      await refreshNotificationDiagnostics();
    } catch (error) {
      const current = await NotificationPoller.getNotificationEnabled();
      if (isMountedRef.current) {
        setNotificationEnabledState(current);
      }
      await refreshNotificationDiagnostics();
      alertIfMounted(
        nextValue
          ? "Cannot enable notifications"
          : "Cannot update notifications",
        getErrorMessage(error),
      );
    } finally {
      notificationSettingRequestRef.current = false;

      if (isMountedRef.current) {
        setUpdatingNotificationSetting(false);
      }
    }
  };

  const updateAccessibilitySettings = async (
    patch: Partial<StorageService.AppSettings>,
  ) => {
    if (accessibilityRequestRef.current) return;
    accessibilityRequestRef.current = true;
    setUpdatingAccessibility(true);
    try {
      const settings = await StorageService.appSettings.update(patch);
      dispatch(setAppSettings(settings));
    } catch (error) {
      alertIfMounted(
        "Cannot save accessibility settings",
        getErrorMessage(error),
      );
    } finally {
      accessibilityRequestRef.current = false;
      if (isMountedRef.current) setUpdatingAccessibility(false);
    }
  };

  const handleSendTestNotification = async () => {
    if (Platform.OS !== "android") return;
    if (testNotificationRequestRef.current) return;

    testNotificationRequestRef.current = true;
    setSendingTestNotification(true);

    try {
      await NotificationPoller.sendTestNotification();
      await refreshNotificationDiagnostics();
      alertIfMounted(
        "Test notification sent",
        "A local Hoot Unfathomably notification was scheduled.",
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
        "Sign in to an Unfathomably account before checking notifications.",
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
      const count = await NotificationPoller.pollNotificationsNow(ctx);
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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.section}>
        <Text style={styles.header}>SERVER SETTINGS</Text>
        <Text style={[styles.label, { color: theme.secondaryText }]}>
          Fediverse server URL
        </Text>
        <TextInput
          accessibilityLabel="Fediverse server URL"
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.secondaryBackground,
              borderColor: theme.tertiaryBackground,
            },
          ]}
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder="https://social.example"
          placeholderTextColor={theme.placeholderText}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={[styles.hint, { color: theme.secondaryText }]}>
          Server used by the active account. Sign in again after changing
          servers so the saved access token belongs to the selected server.
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

      <View style={styles.section}>
        <Text style={styles.header}>ACCESSIBILITY AND LANGUAGE</Text>
        <Text style={[styles.label, { color: theme.secondaryText }]}>
          Text size
        </Text>
        <View style={styles.sortOptions}>
          {(
            [
              [1, "Standard"],
              [1.15, "Large"],
              [1.3, "Extra large"],
            ] as [1 | 1.15 | 1.3, string][]
          ).map(([value, label]) => {
            const selected = accessibilitySettings.textScale === value;
            return (
              <Pressable
                accessibilityLabel={`Use ${label.toLowerCase()} app text`}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: selected,
                  disabled: updatingAccessibility,
                }}
                disabled={updatingAccessibility}
                key={value}
                onPress={() =>
                  void updateAccessibilitySettings({ textScale: value })
                }
                style={[
                  styles.sortOption,
                  {
                    backgroundColor: selected
                      ? theme.tint
                      : theme.secondaryBackground,
                    borderColor: selected
                      ? theme.tint
                      : theme.tertiaryBackground,
                  },
                ]}
              >
                <Text style={{ color: selected ? theme.onTint : theme.text }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <AccessibilitySwitch
          disabled={updatingAccessibility}
          label="High contrast colors"
          onChange={highContrast =>
            void updateAccessibilitySettings({ highContrast })
          }
          value={accessibilitySettings.highContrast}
        />
        <AccessibilitySwitch
          disabled={updatingAccessibility}
          label="Reduce motion"
          onChange={reduceMotion =>
            void updateAccessibilitySettings({ reduceMotion })
          }
          value={accessibilitySettings.reduceMotion}
        />
        <AccessibilitySwitch
          disabled={updatingAccessibility}
          label="Always expand content warnings"
          onChange={alwaysExpandContentWarnings =>
            void updateAccessibilitySettings({ alwaysExpandContentWarnings })
          }
          value={accessibilitySettings.alwaysExpandContentWarnings}
        />
        <AccessibilitySwitch
          disabled={updatingAccessibility}
          label="Show image descriptions below media"
          onChange={showMediaDescriptions =>
            void updateAccessibilitySettings({ showMediaDescriptions })
          }
          value={accessibilitySettings.showMediaDescriptions}
        />
        <Text style={[styles.label, { color: theme.secondaryText }]}>
          App language
        </Text>
        <View style={styles.sortOptions}>
          {(
            [
              ["system", "Device"],
              ["en", "English"],
              ["fr", "Français"],
              ["es", "Español"],
            ] as [StorageService.AppSettings["locale"], string][]
          ).map(([value, label]) => {
            const selected = accessibilitySettings.locale === value;
            return (
              <Pressable
                accessibilityLabel={`Use ${label} language`}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: selected,
                  disabled: updatingAccessibility,
                }}
                disabled={updatingAccessibility}
                key={value}
                onPress={() =>
                  void updateAccessibilitySettings({ locale: value })
                }
                style={[
                  styles.sortOption,
                  {
                    backgroundColor: selected
                      ? theme.tint
                      : theme.secondaryBackground,
                    borderColor: selected
                      ? theme.tint
                      : theme.tertiaryBackground,
                  },
                ]}
              >
                <Text style={{ color: selected ? theme.onTint : theme.text }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: theme.secondaryText }]}>
          Device font scaling remains enabled in every text-size mode.
        </Text>
      </View>

      {Platform.OS === "android" ? (
        <View style={styles.section}>
          <Text style={styles.header}>NOTIFICATIONS</Text>
          <View
            style={[
              styles.row,
              { borderBottomColor: theme.tertiaryBackground },
            ]}
          >
            <Text style={{ color: theme.text }}>Background notifications</Text>
            <Switch
              value={notificationEnabled}
              onValueChange={handleNotificationSettingChange}
              disabled={updatingNotificationSetting}
            />
          </View>
          <Text style={[styles.hint, { color: theme.secondaryText }]}>
            Checks your Unfathomably account in the background when Android
            allows it and shows local alerts this phone has not already
            surfaced.
          </Text>
          <AppButton
            title="Customize notification alerts"
            onPress={() => navigation?.navigate("NotificationPreferences")}
            color={theme.secondaryTint}
            disabled={!ctx?.login || !navigation}
            fullWidth
            style={styles.notificationButton}
          />
          <View
            style={[
              styles.statusRow,
              { borderBottomColor: theme.tertiaryBackground },
            ]}
          >
            <Text style={[styles.statusLabel, { color: theme.secondaryText }]}>
              Local alerts
            </Text>
            <Text style={[styles.statusValue, { color: theme.text }]}>
              {notificationPermissionText(notificationDiagnostics)}
            </Text>
          </View>
          <View
            style={[
              styles.statusRow,
              { borderBottomColor: theme.tertiaryBackground },
            ]}
          >
            <Text style={[styles.statusLabel, { color: theme.secondaryText }]}>
              Background polling
            </Text>
            <Text style={[styles.statusValue, { color: theme.text }]}>
              {notificationBackgroundText(notificationDiagnostics)}
            </Text>
          </View>
          <View
            style={[
              styles.statusRow,
              { borderBottomColor: theme.tertiaryBackground },
            ]}
          >
            <Text style={[styles.statusLabel, { color: theme.secondaryText }]}>
              Last check
            </Text>
            <Text style={[styles.statusValue, { color: theme.text }]}>
              {notificationLastCheckText(notificationDiagnostics)}
            </Text>
          </View>
          <View
            style={[
              styles.statusRow,
              { borderBottomColor: theme.tertiaryBackground },
            ]}
          >
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
              disabled={
                openingNotificationSettings || updatingNotificationSetting
              }
              fullWidth
              style={styles.notificationButton}
            />
          ) : null}
          <AppButton
            title={
              checkingNotificationsNow
                ? "Checking..."
                : "Check Notifications Now"
            }
            onPress={handleCheckNotificationsNow}
            color={theme.tint}
            disabled={checkingNotificationsNow || updatingNotificationSetting}
            fullWidth
            style={styles.notificationButton}
            testID="settings-check-notifications-now"
          />
          <AppButton
            title={
              sendingTestNotification ? "Sending..." : "Send Test Notification"
            }
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

function AccessibilitySwitch({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onChange}
        value={value}
      />
    </View>
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
    paddingBottom: SCROLL_FORM_BOTTOM_PADDING,
  },
});

/* end of SettingsScreen.tsx */
