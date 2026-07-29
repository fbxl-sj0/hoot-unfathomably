/*
    Project: Hoot Mobile
    -------------------

    File: ForgotPasswordScreen.tsx

    Purpose:

        Handle Lotide password reset requests.

    Responsibilities:

        - Request reset keys by email
        - Submit reset key and new password
        - Show recoverable errors

    This file intentionally does NOT contain:

        - login persistence
        - host selection
*/

import React, { useLayoutEffect, useRef, useState } from "react";
import { RootStackScreenProps } from "../types";
import { Text, TextInput, View } from "../components/Themed";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";
import AppButton from "../components/AppButton";
import useTheme from "../hooks/useTheme";
import * as LotideService from "../services/LotideService";
import { getErrorMessage } from "../utils/error";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";

function getResetContext(node: string): LotideContext {
  return {
    apiUrl: `https://${node}/api/unstable`,
  };
}

export default function ForgotPasswordScreen({
  navigation,
  route,
}: RootStackScreenProps<"ForgotPassword">) {
  const [isAwaitingKey, setIsAwaitingKey] = useState(false);
  const [isRequestingKey, setIsRequestingKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [validKey, setValidKey] = useState<string>();
  const [keyRejected, setKeyRejected] = useState(false);
  const [password, setPassword] = useState("");
  const keyRequestId = useRef(0);
  const isRequestingKeyRef = useRef(false);
  const isResettingPasswordRef = useRef(false);
  const isMountedRef = useRef(true);
  const theme = useTheme();

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      keyRequestId.current += 1;
      isRequestingKeyRef.current = false;
      isResettingPasswordRef.current = false;
    };
  }, []);

  function alertIfMounted(title: string, message?: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  function isCurrentKeyRequest(requestId: number) {
    return isMountedRef.current && requestId === keyRequestId.current;
  }

  function resetKeyEntryState() {
    keyRequestId.current += 1;
    setIsCheckingKey(false);
    setKeyRejected(false);
    setPassword("");
    setValidKey(undefined);
  }

  function submitEmail() {
    if (isRequestingKeyRef.current) return;

    const trimmedEmail = email.trim();

    if (!trimmedEmail)
      return alertIfMounted(
        "Email address required",
        "Enter the email address for your Lotide account.",
      );

    resetKeyEntryState();
    isRequestingKeyRef.current = true;
    setIsRequestingKey(true);
    LotideService.forgotPasswordRequestKey(
      getResetContext(route.params.node),
      trimmedEmail,
    )
      .then(() => {
        if (!isMountedRef.current) return;

        setIsAwaitingKey(true);
        setEmail(trimmedEmail);
      })
      .catch(e => {
        alertIfMounted("Failed to send reset key", getErrorMessage(e));
      })
      .finally(() => {
        if (isMountedRef.current) {
          isRequestingKeyRef.current = false;
          setIsRequestingKey(false);
        }
      });
  }

  function submitPassword() {
    if (isResettingPasswordRef.current) return;

    if (!password) return alertIfMounted("Password required");
    if (!validKey) {
      return alertIfMounted(
        "Reset key required",
        "Enter the reset key from your email before choosing a new password.",
      );
    }

    isResettingPasswordRef.current = true;
    setIsResettingPassword(true);
    LotideService.forgotPasswordReset(
      getResetContext(route.params.node),
      validKey,
      password,
    )
      .then(() => {
        if (!isMountedRef.current) return;

        navigation.popToTop();
      })
      .catch(error => {
        alertIfMounted("Failed to reset password", getErrorMessage(error));
      })
      .finally(() => {
        if (isMountedRef.current) {
          isResettingPasswordRef.current = false;
          setIsResettingPassword(false);
        }
      });
  }

  function keyChange(key: string) {
    const trimmedKey = key.trim();

    keyRequestId.current += 1;
    const requestId = keyRequestId.current;
    setValidKey(undefined);
    setKeyRejected(false);

    if (trimmedKey.length < 6) {
      setIsCheckingKey(false);
      return;
    }

    setIsCheckingKey(true);
    LotideService.forgotPasswordTestKey(
      getResetContext(route.params.node),
      trimmedKey,
    )
      .then(() => {
        if (isCurrentKeyRequest(requestId)) {
          setValidKey(trimmedKey);
          setKeyRejected(false);
        }
      })
      .catch(() => {
        if (isCurrentKeyRequest(requestId)) {
          setValidKey(undefined);
          setKeyRejected(true);
        }
      })
      .finally(() => {
        if (isCurrentKeyRequest(requestId)) {
          setIsCheckingKey(false);
        }
      });
  }

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={() => Platform.OS !== "web" && Keyboard.dismiss()}
    >
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Text style={styles.nodeText}>{route.params.node}</Text>
        {!isAwaitingKey ? (
          <>
            <TextInput
              accessibilityLabel="Email address"
              style={[
                styles.input,
                {
                  borderColor: theme.tertiaryBackground,
                  color: theme.text,
                },
              ]}
              placeholder="Email Address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="go"
              autoCapitalize="none"
              onSubmitEditing={submitEmail}
            />
            <AppButton
              title={isRequestingKey ? "Sending..." : "Send Reset Key"}
              onPress={submitEmail}
              color={theme.tint}
              disabled={isRequestingKey}
              fullWidth
              style={styles.singleButton}
            />
          </>
        ) : (
          <>
            {validKey ? (
              <>
                <TextInput
                  accessibilityLabel="New password"
                  placeholder="New Password"
                  style={[
                    styles.input,
                    {
                      borderColor: theme.tertiaryBackground,
                      color: theme.text,
                    },
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  secureTextEntry={true}
                  textContentType="password"
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={submitPassword}
                />
                <View style={styles.actionButtons}>
                  <AppButton
                    title="Change Email"
                    onPress={() => {
                      resetKeyEntryState();
                      setIsAwaitingKey(false);
                    }}
                    color={theme.secondaryTint}
                    disabled={isResettingPassword}
                    style={styles.actionButton}
                  />
                  <AppButton
                    title={isResettingPassword ? "Resetting..." : "Reset Password"}
                    onPress={submitPassword}
                    color={theme.tint}
                    disabled={isResettingPassword}
                    style={styles.actionButton}
                  />
                </View>
              </>
            ) : (
              <>
                <TextInput
                  accessibilityLabel="Reset key"
                  placeholder="Key"
                  style={[
                    styles.input,
                    {
                      borderColor: theme.tertiaryBackground,
                      color: theme.text,
                    },
                  ]}
                  onChangeText={keyChange}
                  autoCapitalize="none"
                  returnKeyType="done"
                />
                {isCheckingKey ? (
                  <Text style={[styles.statusText, { color: theme.secondaryText }]}>
                    Checking reset key...
                  </Text>
                ) : null}
                {keyRejected ? (
                  <Text style={[styles.statusText, { color: theme.red }]}>
                    This reset key was not accepted.
                  </Text>
                ) : null}
              </>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    fontSize: 16,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginTop: 15,
  },
  nodeText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  statusText: {
    alignSelf: "flex-start",
    fontSize: 13,
    marginTop: 8,
  },
  actionButtons: {
    alignItems: "center",
    display: "flex",
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    marginTop: 15,
  },
  actionButton: {
    flexGrow: 1,
  },
  singleButton: {
    marginTop: 15,
  },
});

/* end of ForgotPasswordScreen.tsx */
