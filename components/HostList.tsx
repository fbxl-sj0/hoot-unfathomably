/*
    Project: Hoot Mobile
    -------------------

    File: HostList.tsx

    Purpose:

        Render known and stored Lotide hosts for login.

    Responsibilities:

        - Probe seeded hosts for instance metadata
        - List stored account profiles
        - Select custom or known host domains

    This file intentionally does NOT contain:

        - login form fields
        - network discovery beyond the seeded list
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet } from "react-native";
import Icon from "@expo/vector-icons/Ionicons";
import KnownHosts from "../constants/KnownHosts";
import ActorDisplayComponent from "./ActorDisplay";
import { Text, TextInput, View } from "./Themed";
import AppButton from "./AppButton";
import * as UnfathomablyService from "../services/UnfathomablyService";
import useTheme from "../hooks/useTheme";
import { lotideContext, lotideContextKV } from "../services/StorageService";
import { setCtx } from "../slices/lotideSlice";
import { useDispatch } from "react-redux";
import ContentDisplay from "./ContentDisplay";
import RetryState from "./RetryState";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";
import { getErrorMessage } from "../utils/error";

export interface HostListProps {
  onSelect: (domain: string, name?: string, username?: string) => void;
}

export interface HostData {
  name: string;
  domain: string;
  instanceInfo?: InstanceInfo | null;
}

export function updateKnownHostInstanceInfo(
  hosts: HostData[],
  domain: string,
  instanceInfo: HostData["instanceInfo"],
): HostData[] {
  return hosts.map(hostData =>
    domain !== hostData.domain
      ? hostData
      : {
        name: hostData.name,
        domain: hostData.domain,
        instanceInfo,
      },
  );
}

export function normalizeHostDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  const host = withoutScheme.split(/[/?#]/)[0];

  return host.replace(/\/+$/, "");
}

export default function HostList(props: HostListProps) {
  const [hostText, setHostText] = useState("");
  const [knownHosts, setKnownHosts] = useState<HostData[]>(KnownHosts);
  const [existingProfiles, setExistingProfiles] = useState<
    [string, LotideContext][]
  >([]);
  const [activatingProfileKey, setActivatingProfileKey] = useState<string | null>(
    null,
  );
  const mountedRef = useRef(true);
  const activatingProfileKeyRef = useRef<string | null>(null);
  const hostRequestIdsRef = useRef<Record<string, number>>({});
  const nextHostRequestIdRef = useRef(0);
  const theme = useTheme();
  const dispatch = useDispatch();

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const activateExistingProfile = useCallback(
    (profileKey: string, ctx: LotideContext) => {
      if (activatingProfileKeyRef.current !== null) return;

      activatingProfileKeyRef.current = profileKey;
      setActivatingProfileKey(profileKey);

      lotideContextKV
        .store(ctx)
        .then(() => lotideContext.store(ctx))
        .then(() => {
          if (
            mountedRef.current &&
            activatingProfileKeyRef.current === profileKey
          ) {
            dispatch(setCtx(ctx));
          }
        })
        .catch(error => {
          if (
            mountedRef.current &&
            activatingProfileKeyRef.current === profileKey
          ) {
            Alert.alert("Cannot switch account", getErrorMessage(error));
          }
        })
        .finally(() => {
          if (activatingProfileKeyRef.current !== profileKey) return;

          activatingProfileKeyRef.current = null;

          if (mountedRef.current) {
            setActivatingProfileKey(null);
          }
        });
    },
    [dispatch],
  );

  const loadKnownHostInfo = useCallback((host: HostData) => {
    const requestId = nextHostRequestIdRef.current + 1;
    nextHostRequestIdRef.current = requestId;
    hostRequestIdsRef.current[host.domain] = requestId;

    if (mountedRef.current) {
      setKnownHosts(hosts =>
        updateKnownHostInstanceInfo(hosts, host.domain, undefined),
      );
    }

    UnfathomablyService.getInstance(`https://${host.domain}`)
      .then(instance => {
        if (
          !mountedRef.current ||
          hostRequestIdsRef.current[host.domain] !== requestId
        ) {
          return;
        }

        setKnownHosts(hosts =>
          updateKnownHostInstanceInfo(hosts, host.domain, {
            apiVersion: 1,
            description: instance.description,
            software: { name: "Unfathomably", version: instance.version || "Mastodon API" },
            site_name: instance.title || host.name,
          } as InstanceInfo),
        );
      })
      .catch(() => {
        if (
          !mountedRef.current ||
          hostRequestIdsRef.current[host.domain] !== requestId
        ) {
          return;
        }

        setKnownHosts(hosts =>
          updateKnownHostInstanceInfo(hosts, host.domain, null),
        );
      });
  }, []);

  useEffect(() => {
    KnownHosts.forEach(loadKnownHostInfo);
  }, [loadKnownHostInfo]);

  useEffect(() => {
    let isCurrent = true;

    lotideContextKV
      .getStore()
      .then(object => Object.entries(object))
      .then(profiles => {
        if (isCurrent && mountedRef.current) {
          setExistingProfiles(profiles);
        }
      })
      .catch(error => {
        if (isCurrent && mountedRef.current) {
          Alert.alert("Cannot load saved profiles", getErrorMessage(error));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const selectCustomHost = () => {
    const domain = normalizeHostDomain(hostText);

    if (!domain) {
      Alert.alert("Enter a server", "Type an Unfathomably, Pleroma, or Rebased server domain before continuing.");
      return;
    }

    props.onSelect(domain);
  };

  const renderItem = ({ item }: { item: HostData }) => {
    const enabled = item.instanceInfo !== null;
    const color = enabled ? theme.text : theme.secondaryText;
    const description = item.instanceInfo?.description;
    return (
      <View
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth || 1,
          borderColor: theme.secondaryText,
          paddingVertical: 25,
        }}
      >
        <Pressable
          accessibilityLabel={`Select host ${item.name}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !enabled }}
          disabled={!enabled}
          onPress={() => props.onSelect(item.domain, item.name)}
        >
          <ActorDisplayComponent
            name={item.name}
            host={item.domain}
            local={false}
            newLine={true}
            styleName={{
              fontSize: 24,
              fontWeight: "300",
              fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
              color,
            }}
          />
          {item.instanceInfo ? (
            <>
              <Text style={{ color: theme.secondaryText }}>
                {item.instanceInfo.software.name}{" "}
                {item.instanceInfo.software.version}
                {!enabled && " - Out of date"}
              </Text>
              {!!description &&
                (typeof description === "string" ? (
                  <Text style={{ color }}>{description}</Text>
                ) : (
                  <ContentDisplay
                    contentHtml={description.content_html}
                    contentMarkdown={description.content_markdown}
                    contentText={description.content_text}
                  />
                ))}
            </>
          ) : item.instanceInfo === null ? null : (
            <Text style={{ color }}>Loading...</Text>
          )}
        </Pressable>
        {item.instanceInfo === null ? (
          <RetryState
            compact
            actionLabel="Retry host"
            message="Failed to load info"
            onRetry={() => loadKnownHostInfo(item)}
            style={styles.hostRetry}
          />
        ) : null}
      </View>
    );
  };
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.title}>Login to continue</Text>
      {existingProfiles.length > 0 && (
        <Text style={styles.subtitle}>Select an existing profile</Text>
      )}
      {existingProfiles.map(p => {
        const [username, url] = p[0].split("@");
        const isUnlocked = !!p[1].login;
        const isActivating = activatingProfileKey === p[0];
        const isProfileActionDisabled = activatingProfileKey !== null;
        const color = isUnlocked ? theme.text : theme.secondaryText;
        const host = url
          .replace("http://", "")
          .replace("https://", "")
          .split(/[/?#]/)[0];
        const hostName = KnownHosts.find(x => x.domain === host)?.name;
        return (
          <Pressable
            key={p[0]}
            accessibilityLabel={`Select profile ${username}@${host}`}
            accessibilityRole="button"
            accessibilityState={{
              busy: isActivating,
              disabled: isProfileActionDisabled,
            }}
            disabled={isProfileActionDisabled}
            onPress={() => {
              if (isUnlocked) {
                activateExistingProfile(p[0], p[1]);
              } else {
                props.onSelect(host.toLowerCase(), undefined, username);
              }
            }}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              minHeight: MINIMUM_TOUCH_TARGET_SIZE,
              opacity: isProfileActionDisabled && !isActivating ? 0.6 : 1,
            }}
          >
            <Icon
              name={isUnlocked ? "lock-open-outline" : "lock-closed-outline"}
              color={color}
              style={{ marginRight: 10 }}
              size={20}
            />
            <ActorDisplayComponent
              name={username}
              host={host}
              local={true}
              showHost={"always"}
              newLine={true}
              style={{ paddingVertical: 15, paddingBottom: 10 }}
              styleName={{ color }}
            />
            <View style={{ flex: 1 }} />
            <Text
              style={{
                fontSize: 16,
                color,
                fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
              }}
            >
              {isActivating ? "Activating..." : hostName}
            </Text>
          </Pressable>
        );
      })}
      <Text style={styles.subtitle}>
        {existingProfiles.length > 0
          ? "Or sign into a new account"
          : "Enter a host or select one below"}
      </Text>
      <TextInput
        placeholder="Host domain"
        style={styles.hostInput}
        value={hostText}
        onChangeText={setHostText}
        onSubmitEditing={selectCustomHost}
        keyboardType="url"
        returnKeyType="next"
      />
      <AppButton
        title="Continue"
        onPress={selectCustomHost}
        fullWidth
        disabled={!normalizeHostDomain(hostText)}
        style={styles.continueButton}
      />
      {knownHosts
        .filter(
          x =>
            hostText === "" ||
            x.domain.includes(normalizeHostDomain(hostText)) ||
            x.name.toLowerCase().includes(hostText.trim().toLowerCase()),
        )
        .map((item, index) => (
          <View key={item.domain}>{renderItem({ item })}</View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontWeight: "300",
    marginBottom: 10,
    marginTop: 15,
    textAlign: "center",
  },
  hostRetry: {
    marginTop: 10,
  },
  hostInput: {
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  continueButton: {
    marginTop: 10,
  },
});

/* end of HostList.tsx */
