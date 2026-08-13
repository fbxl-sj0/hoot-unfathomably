/*
    Project: Hoot Unfathomably
    --------------------------

    File: HostList.tsx

    Purpose:

        Render compatible and stored Fediverse hosts for login.

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
import BrandMark from "./BrandMark";

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
  const serverUrl = normalizeServerSelection(input);
  if (!serverUrl) return "";

  return new URL(serverUrl).host.toLowerCase();
}

export function normalizeServerSelection(input: string): string {
  return UnfathomablyService.getSupportedServerUrl(input) ?? "";
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

        const software = UnfathomablyService.getInstanceSoftware(instance);

        setKnownHosts(hosts =>
          updateKnownHostInstanceInfo(hosts, host.domain, {
            apiVersion: 1,
            description: instance.description,
            software: {
              name: software.name,
              version: software.version,
            },
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
    const serverUrl = normalizeServerSelection(hostText);

    if (!serverUrl) {
      Alert.alert(
        "Enter a server",
        "Enter a valid HTTPS Unfathomably, Rebased, Pleroma, Akkoma, or Mastodon server.",
      );
      return;
    }

    props.onSelect(serverUrl);
  };

  const renderItem = ({ item }: { item: HostData }) => {
    const enabled =
      item.instanceInfo !== undefined && item.instanceInfo !== null;
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
          onPress={() => props.onSelect(`https://${item.domain}`, item.name)}
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
      <View style={styles.brandIdentity}>
        <BrandMark size={76} />
        <Text style={styles.brandName}>Hoot Unfathomably</Text>
        <Text secondary style={styles.brandDescription}>
          A native window into Unfathomably and the wider Fediverse
        </Text>
      </View>
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
                props.onSelect(
                  p[1].apiUrl || `https://${host.toLowerCase()}`,
                  undefined,
                  username,
                );
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
          : "Enter any compatible server or select one below"}
      </Text>
      <Text style={[styles.serverHint, { color: theme.secondaryText }]}>
        FBXL Social is only a shortcut. You can enter another Unfathomably,
        Pleroma, Rebased, or Mastodon-compatible server.
      </Text>
      <TextInput
        placeholder="Server domain, e.g. example.social"
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
  brandIdentity: {
    alignItems: "center",
    gap: 5,
    marginBottom: 22,
  },
  brandName: {
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
  },
  brandDescription: {
    maxWidth: 330,
    textAlign: "center",
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
  serverHint: {
    marginBottom: 10,
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
