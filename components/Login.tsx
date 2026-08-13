/*
    Project: Hoot Unfathomably
    --------------------------

    File: Login.tsx

    Purpose:

        Authenticate with a selected Mastodon-compatible host.

    Responsibilities:

        - Prefer the selected server's browser-based OAuth flow
        - Offer direct password login for compatible server software
        - Persist successful login context
        - Open the selected server for registration and password recovery

    This file intentionally does NOT contain:

        - host selection
        - global app bootstrapping
*/

import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput as DefaultTextInput,
} from "react-native";
import AppButton from "./AppButton";
import { Text, TextInput, View } from "./Themed";
import * as UnfathomablyService from "../services/UnfathomablyService";
import * as StorageService from "../services/StorageService";
import useTheme from "../hooks/useTheme";
import { useDispatch } from "react-redux";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { v4 as uuidv4 } from "uuid";
import { setCtx } from "../slices/lotideSlice";
import { getErrorMessage } from "../utils/error";
import { TOUCH_TARGET_HIT_SLOP } from "../constants/TouchTargets";
import BrandMark from "./BrandMark";

export interface LoginProps {
  hostName?: string;
  domain: string;
  username?: string;
  onGoBack: () => void;
}

export default function Login(props: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState(props.username || "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrowserLoginSubmitting, setIsBrowserLoginSubmitting] =
    useState(false);
  const usernameRef = useRef<DefaultTextInput>(null);
  const passwordRef = useRef<DefaultTextInput>(null);
  const theme = useTheme();
  const dispatch = useDispatch();
  const isMountedRef = useRef(true);

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function alertIfMounted(title: string, message: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  function fail(message: string) {
    alertIfMounted("Failed to submit", message);
  }

  async function activateContext(ctx: LotideContext): Promise<boolean> {
    if (!isMountedRef.current) return false;

    await StorageService.lotideContextKV.store(ctx);

    if (!isMountedRef.current) return false;

    await StorageService.lotideContext.store(ctx);

    if (!isMountedRef.current) return false;

    dispatch(setCtx(ctx));

    return true;
  }

  async function register() {
    const apiUrl = UnfathomablyService.getSupportedServerUrl(props.domain);
    if (!apiUrl) {
      return alertIfMounted(
        "Invalid server",
        "Choose a valid HTTPS server before creating an account.",
      );
    }

    setIsSubmitting(true);

    try {
      await WebBrowser.openBrowserAsync(apiUrl);
    } catch (e) {
      alertIfMounted("Failed to open server", getErrorMessage(e));
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }

  async function login() {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) return fail("Please enter a username");
    if (!password) return fail("Enter a password");

    setIsSubmitting(true);

    try {
      const apiUrl = UnfathomablyService.normalizeServerUrl(props.domain);
      const data = await UnfathomablyService.loginWithPassword(
        apiUrl,
        trimmedUsername,
        password,
      );
      if (!isMountedRef.current) return;

      await activateContext({
        apiUrl,
        login: {
          token: data.token,
          user: data.account as unknown as Profile,
        },
      });
    } catch (e) {
      alertIfMounted("Failed to login", getErrorMessage(e));
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  async function loginWithServer() {
    if (isSubmitting) return;

    const apiUrl = UnfathomablyService.getSupportedServerUrl(props.domain);
    if (!apiUrl) {
      return alertIfMounted(
        "Invalid server",
        "Choose a valid HTTPS server before signing in.",
      );
    }

    setIsSubmitting(true);
    setIsBrowserLoginSubmitting(true);

    try {
      const redirectUri = Linking.createURL("oauth/callback");
      const state = uuidv4();
      const application =
        await UnfathomablyService.registerOAuthApplication(
          apiUrl,
          redirectUri,
        );
      if (!isMountedRef.current) return;

      const authorizationUrl =
        UnfathomablyService.buildOAuthAuthorizationUrl(
          apiUrl,
          application,
          redirectUri,
          state,
        );
      const result = await WebBrowser.openAuthSessionAsync(
        authorizationUrl,
        redirectUri,
      );
      if (!isMountedRef.current || result.type !== "success") return;

      const code = UnfathomablyService.readOAuthAuthorizationCode(
        result.url,
        state,
      );
      const data =
        await UnfathomablyService.loginWithAuthorizationCode(
          apiUrl,
          application,
          redirectUri,
          code,
        );
      if (!isMountedRef.current) return;

      await activateContext({
        apiUrl,
        login: {
          token: data.token,
          user: data.account as unknown as Profile,
        },
      });
    } catch (error) {
      alertIfMounted("Failed to login", getErrorMessage(error));
    } finally {
      if (isMountedRef.current) {
        setIsBrowserLoginSubmitting(false);
        setIsSubmitting(false);
      }
    }
  }

  function submit() {
    if (isSubmitting) return;

    if (isRegistering) {
      void register();
    } else {
      void login();
    }
  }

  function submitTitle() {
    if (isSubmitting && isRegistering) return "Opening Server...";
    if (isSubmitting) return "Logging in...";

    return isRegistering ? "Open Server" : "Login";
  }

  function openPasswordRecovery() {
    const apiUrl = UnfathomablyService.getSupportedServerUrl(props.domain);
    if (!apiUrl) {
      alertIfMounted(
        "Invalid server",
        "Choose a valid HTTPS server before recovering your password.",
      );
      return;
    }

    void WebBrowser.openBrowserAsync(apiUrl).catch(error => {
      alertIfMounted("Failed to open server", getErrorMessage(error));
    });
  }

  return (
    <Pressable
      accessible={false}
      style={{ flex: 1 }}
      onPress={() => Platform.OS !== "web" && Keyboard.dismiss()}
    >
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <BrandMark size={66} style={styles.brandMark} />
        {props.hostName ? (
          <View style={styles.hostHeader}>
            <Text style={styles.name}>{props.hostName}</Text>
            <Text style={[styles.domain, { color: theme.secondaryText }]}>
              {props.domain}
            </Text>
          </View>
        ) : (
          <View style={styles.hostHeader}>
            <Text style={{ fontSize: 24 }}>{props.domain}</Text>
          </View>
        )}
        <AppButton
          title={
            isBrowserLoginSubmitting
              ? "Opening Server..."
              : "Sign in with Server"
          }
          onPress={() => void loginWithServer()}
          color={theme.tint}
          fullWidth
          disabled={isSubmitting}
          style={styles.serverLoginButton}
        />
        <Text style={[styles.serverLoginHint, { color: theme.secondaryText }]}>
          Recommended for any compatible host. Your selected server handles the
          sign-in in your browser.
        </Text>
        <Text style={[styles.directLoginLabel, { color: theme.secondaryText }]}>
          Or use direct password login
        </Text>
        <Pressable
          accessibilityLabel={
            isRegistering ? "Switch to login" : "Switch to registration"
          }
          accessibilityRole="button"
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          disabled={isSubmitting}
          onPress={() => setIsRegistering(x => !x)}
        >
          <Text style={[styles.loginRegister, { color: theme.secondaryText }]}>
            <Text
              style={{
                color: isRegistering
                  ? theme.secondaryText
                  : theme.secondaryTint,
              }}
            >
              Login
            </Text>
            {" | "}
            <Text
              style={{
                color: isRegistering
                  ? theme.secondaryTint
                  : theme.secondaryText,
              }}
            >
              Create Account
            </Text>
          </Text>
        </Pressable>
        {isRegistering && (
          <Text style={[styles.serverLoginHint, { color: theme.secondaryText }]}>
            Account creation is managed by the selected server and will open in
            your browser.
          </Text>
        )}
        {!isRegistering && (
          <>
            <TextInput
              ref={usernameRef}
              style={styles.input}
              placeholder="Username"
              value={username}
              onChangeText={setUsername}
              editable={!isSubmitting}
              keyboardType="ascii-capable"
              textContentType="username"
              autoComplete="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              editable={!isSubmitting}
              secureTextEntry={true}
              textContentType="password"
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Pressable
              accessibilityLabel="Reset forgotten password"
              style={{ padding: 15 }}
              accessibilityRole="button"
              onPress={openPasswordRecovery}
            >
              <Text secondary>Forgot Password</Text>
            </Pressable>
          </>
        )}
        <View style={styles.actionButtons}>
          <AppButton
            title="Change Host"
            onPress={props.onGoBack}
            color={theme.secondaryTint}
            disabled={isSubmitting}
            style={styles.actionButton}
          />
          <AppButton
            title={submitTitle()}
            onPress={submit}
            color={theme.tint}
            disabled={isSubmitting}
            style={styles.actionButton}
          />
        </View>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 35,
  },
  name: {
    fontSize: 50,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  domain: {
    fontWeight: "300",
  },
  hostHeader: {
    alignItems: "center",
  },
  brandMark: {
    marginBottom: 14,
  },
  loginRegister: {
    padding: 15,
  },
  serverLoginButton: {
    marginTop: 20,
  },
  serverLoginHint: {
    marginTop: 8,
    textAlign: "center",
  },
  directLoginLabel: {
    marginTop: 20,
  },
  input: {
    width: "100%",
    marginVertical: 5,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  actionButtons: {
    width: "100%",
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  actionButton: {
    flexGrow: 1,
  },
});

/* end of Login.tsx */
