/*
    Project: Hoot Mobile
    -------------------

    File: Login.tsx

    Purpose:

        Collect Lotide login credentials for a selected host.

    Responsibilities:

        - Submit username and password to the Lotide login API
        - Persist successful login context
        - Offer registration and password reset navigation

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
import { useNavigation } from "@react-navigation/core";
import { useDispatch } from "react-redux";
import { setCtx } from "../slices/lotideSlice";
import { getErrorMessage } from "../utils/error";
import { RootStackScreenProps } from "../types";
import { TOUCH_TARGET_HIT_SLOP } from "../constants/TouchTargets";

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
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameRef = useRef<DefaultTextInput>(null);
  const passwordRef = useRef<DefaultTextInput>(null);
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigation = useNavigation<RootStackScreenProps<"ForgotPassword">["navigation"]>();
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
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUsername) return fail("Please enter a username");
    if (!password) return fail("Enter a password");
    if (!trimmedEmail) return fail("Please enter an email address");

    setIsSubmitting(true);

    try {
      void trimmedEmail;
      alertIfMounted(
        "Registration is handled by the server",
        "Open your Unfathomably server in a browser to create an account, then sign in here.",
      );
    } catch (e) {
      alertIfMounted("Failed to register", getErrorMessage(e));
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

  function submit() {
    if (isSubmitting) return;

    if (isRegistering) {
      void register();
    } else {
      void login();
    }
  }

  function submitTitle() {
    if (isSubmitting && isRegistering) return "Registering...";
    if (isSubmitting) return "Logging in...";

    return isRegistering ? "Register" : "Login";
  }

  return (
    <Pressable
      accessible={false}
      style={{ flex: 1 }}
      onPress={() => Platform.OS !== "web" && Keyboard.dismiss()}
    >
      <KeyboardAvoidingView style={styles.root} behavior="padding">
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
              Register
            </Text>
          </Text>
        </Pressable>
        {isRegistering && (
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={email}
            onChangeText={setEmail}
            editable={!isSubmitting}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => usernameRef.current?.focus()}
          />
        )}
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
          textContentType={isRegistering ? "newPassword" : "password"}
          autoComplete="password"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {!isRegistering && (
          <Pressable
            accessibilityLabel="Reset forgotten password"
            style={{ padding: 15 }}
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate("ForgotPassword", {
                node: props.domain,
              })
            }
          >
            <Text secondary>Forgot Password</Text>
          </Pressable>
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
  loginRegister: {
    padding: 15,
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
