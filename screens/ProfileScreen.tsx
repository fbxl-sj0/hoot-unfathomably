/*
    Project: Hoot Mobile
    -------------------

    File: ProfileScreen.tsx

    Purpose:

        Show the logged-in user profile and account actions.

    Responsibilities:

        - Load profile and followed communities
        - Render profile description and account rows
        - Handle logout and navigation to activity/moderation/settings
        - Keep persisted account changes ordered and duplicate-safe

    This file intentionally does NOT contain:

        - profile editing
        - moderation flag detail
*/

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from "react-native";
import { View, Text } from "../components/Themed";
import { getUserData } from "../services/LotideService";
import { RootTabScreenProps } from "../types";
import SuggestLogin from "../components/SuggestLogin";
import * as LotideService from "../services/LotideService";
import * as StorageService from "../services/StorageService";
import useTheme from "../hooks/useTheme";
import ActorDisplayComponent from "../components/ActorDisplay";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { useDispatch } from "react-redux";
import { setCtx } from "../slices/lotideSlice";
import { TappableList } from "../components/TappableList";
import ContentDisplay from "../components/ContentDisplay";
import RetryState from "../components/RetryState";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";
import { getErrorMessage } from "../utils/error";
import { logWarning } from "../utils/debugLog";

type ProfileLoadState = {
  profile?: Profile;
  loadError: string;
  scopeKey?: string;
  hasLoaded: boolean;
  isLoading: boolean;
};

type FollowedCommunitiesState = {
  communities: Community[];
  loadError: string;
  scopeKey?: string;
  isLoading: boolean;
};

type AccountAction = "switch" | "logout";

export default function ProfileScreen({
  navigation,
}: RootTabScreenProps<"ProfileScreen">) {
  const [profileState, setProfileState] = useState<ProfileLoadState>({
    loadError: "",
    hasLoaded: false,
    isLoading: true,
  });
  const [followedCommunitiesState, setFollowedCommunitiesState] =
    useState<FollowedCommunitiesState>({
      communities: [],
      loadError: "",
      isLoading: true,
    });
  const [focusId, setFocusId] = useState(0);
  const [pendingAccountAction, setPendingAccountAction] =
    useState<AccountAction | null>(null);
  const isMountedRef = useRef(true);
  const pendingAccountActionRef = useRef<AccountAction | null>(null);
  const logoutPromptOpenRef = useRef(false);
  const theme = useTheme();
  const ctx = useLotideCtx();
  const dispatch = useDispatch();
  const userId = ctx?.login?.user?.id;
  const profileScopeKey =
    `${ctx?.apiUrl ?? ""}::${ctx?.login?.token ?? ""}::${userId ?? ""}`;
  const isCurrentProfileScope = profileState.scopeKey === profileScopeKey;
  const isCurrentCommunitiesScope =
    followedCommunitiesState.scopeKey === profileScopeKey;
  const profile = isCurrentProfileScope ? profileState.profile : undefined;
  const profileLoadError = isCurrentProfileScope ? profileState.loadError : "";
  const hasLoadedProfile = isCurrentProfileScope
    ? profileState.hasLoaded
    : false;
  const communities = isCurrentCommunitiesScope
    ? followedCommunitiesState.communities
    : [];
  const communitiesLoadError = isCurrentCommunitiesScope
    ? followedCommunitiesState.loadError
    : "";
  const isRefreshing =
    (isCurrentProfileScope && profileState.isLoading && !!profile) ||
    (isCurrentCommunitiesScope &&
      followedCommunitiesState.isLoading &&
      communities.length > 0);

  useEffect(
    () => navigation.addListener("focus", () => setFocusId(x => x + 1)),
    [navigation],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      logoutPromptOpenRef.current = false;
      pendingAccountActionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ctx?.login) return;

    let isActive = true;
    const requestScopeKey = profileScopeKey;

    LotideService.getAllCommunities(ctx, true)
      .then(communities => {
        if (!isActive) return;

        setFollowedCommunitiesState({
          communities,
          loadError: "",
          scopeKey: requestScopeKey,
          isLoading: false,
        });
      })
      .catch(() => {
        if (!isActive) return;

        setFollowedCommunitiesState(previousState => ({
          communities:
            previousState.scopeKey === requestScopeKey
              ? previousState.communities
              : [],
          loadError: "Cannot load followed communities",
          scopeKey: requestScopeKey,
          isLoading: false,
        }));
      });

    return () => {
      isActive = false;
    };
  }, [ctx, focusId, profileScopeKey]);

  useEffect(() => {
    if (!ctx?.login) return;

    if (!userId) {
      return;
    }

    let isActive = true;
    const requestScopeKey = profileScopeKey;

    getUserData(ctx, userId)
      .then(profileData => {
        if (!isActive) return;

        setProfileState({
          profile: profileData,
          loadError: "",
          scopeKey: requestScopeKey,
          hasLoaded: true,
          isLoading: false,
        });
      })
      .catch(() => {
        if (!isActive) return;

        setProfileState(previousState => ({
          profile:
            previousState.scopeKey === requestScopeKey
              ? previousState.profile
              : undefined,
          loadError: "Cannot load profile",
          scopeKey: requestScopeKey,
          hasLoaded: true,
          isLoading: false,
        }));
      });

    return () => {
      isActive = false;
    };
  }, [ctx, focusId, profileScopeKey, userId]);

  if (!ctx?.login) {
    return <SuggestLogin />;
  }

  const activeCtx = ctx;

  const retryProfileLoad = () => {
    setProfileState(previousState => ({
      ...previousState,
      loadError: "",
      hasLoaded: previousState.profile ? previousState.hasLoaded : false,
      isLoading: true,
    }));
    setFollowedCommunitiesState(previousState => ({
      ...previousState,
      loadError: "",
      isLoading: true,
    }));
    setFocusId(x => x + 1);
  };

  if (!ctx.login.user?.id) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <RetryState
          message="Cannot load profile"
          onRetry={retryProfileLoad}
        />
      </View>
    );
  }

  if (!profile && profileLoadError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <RetryState message={profileLoadError} onRetry={retryProfileLoad} />
      </View>
    );
  }

  if (!profile && hasLoadedProfile) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <RetryState
          message="Cannot load profile"
          onRetry={retryProfileLoad}
        />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={styles.loadingText}>Loading profile</Text>
      </View>
    );
  }

  function alertIfMounted(title: string, message: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  function beginAccountAction(action: AccountAction): boolean {
    if (pendingAccountActionRef.current) return false;

    pendingAccountActionRef.current = action;

    if (isMountedRef.current) {
      setPendingAccountAction(action);
    }

    return true;
  }

  function finishAccountAction(action: AccountAction) {
    if (pendingAccountActionRef.current === action) {
      pendingAccountActionRef.current = null;
    }

    if (isMountedRef.current) {
      setPendingAccountAction(currentAction =>
        currentAction === action ? null : currentAction,
      );
    }
  }

  const clearActiveContext = async () => {
    await StorageService.lotideContext.remove();
    dispatch(setCtx({}));
  };

  async function switchAccount() {
    if (!beginAccountAction("switch")) return;

    try {
      await clearActiveContext();
    } catch (error) {
      alertIfMounted("Cannot switch account", getErrorMessage(error));
    } finally {
      finishAccountAction("switch");
    }
  }

  async function finishLogout(updateStoredAccount: () => Promise<unknown>) {
    if (!beginAccountAction("logout")) return;

    try {
      try {
        await updateStoredAccount();
      } catch (error) {
        logWarning("Failed to update saved Lotide account", getErrorMessage(error));
      }

      try {
        await LotideService.logout(activeCtx);
      } catch (error) {
        logWarning("Failed to invalidate Lotide login", getErrorMessage(error));
      }

      try {
        await clearActiveContext();
      } catch (error) {
        alertIfMounted("Cannot clear active account", getErrorMessage(error));
      }
    } finally {
      finishAccountAction("logout");
    }
  }

  function closeLogoutPrompt() {
    logoutPromptOpenRef.current = false;
  }

  function logout() {
    if (!activeCtx.login) return;
    if (pendingAccountActionRef.current || logoutPromptOpenRef.current) return;

    const accountKey = activeCtx.login.user
      ? `${activeCtx.login.user.username}@${activeCtx.apiUrl}`
      : undefined;
    const removeStoredAccount = () =>
      accountKey
        ? StorageService.lotideContextKV.remove(accountKey)
        : Promise.resolve(undefined);

    if (Platform.OS === "web") {
      void finishLogout(removeStoredAccount);
      return;
    }

    logoutPromptOpenRef.current = true;
    Alert.alert(
      "Log out",
      "Would you like to keep the login profile handy for later?",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: closeLogoutPrompt,
        },
        {
          text: "Remove",
          onPress: () => {
            closeLogoutPrompt();
            void finishLogout(removeStoredAccount);
          },
        },
        {
          text: "Keep",
          style: "default",
          onPress: () => {
            closeLogoutPrompt();
            void finishLogout(() => StorageService.lotideContextKV.logout(activeCtx));
          },
        },
      ],
      { cancelable: true },
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      testID="profile-scroll"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={retryProfileLoad}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <ActorDisplayComponent
            name={profile.username}
            host={profile.host}
            local={true}
            showHost="always"
            colorize="never"
            newLine
            style={{ fontSize: 18 }}
          />
          {!!profile.avatar && <Text>{profile.avatar.url}</Text>}
          {typeof profile.description === "string" ? (
            <Text>{profile.description}</Text>
          ) : (
            profile.description && (
              <ContentDisplay
                contentHtml={profile.description?.content_html}
                contentMarkdown={profile.description?.content_markdown}
                contentText={profile.description?.content_text}
              />
            )
          )}
        </View>
      </View>
      {profileLoadError ? (
        <RetryState
          compact
          message={profileLoadError}
          onRetry={retryProfileLoad}
          style={styles.inlineError}
        />
      ) : null}
      <TappableList
        items={[
          {
            title: "Your Activity",
            icon: "reader-outline",
            onPress: () =>
              navigation.navigate("ProfileActivity", {
                userId: profile.id || ctx.login?.user?.id,
                username: profile.username,
              }),
          },
          {
            title: "Moderation",
            icon: "shield-outline",
            onPress: () => navigation.navigate("Moderation"),
          },
          {
            title: pendingAccountAction === "switch"
              ? "Switching Account..."
              : "Switch Account",
            icon: "person-add-outline",
            disabled: !!pendingAccountAction,
            onPress: () => {
              void switchAccount();
            },
          },
          {
            title: pendingAccountAction === "logout"
              ? "Logging Out..."
              : "Log Out",
            icon: "log-out-outline",
            disabled: !!pendingAccountAction,
            onPress: () => logout(),
          },
          {
            title: "App Settings",
            icon: "settings-outline",
            onPress: () => navigation.navigate("Settings"),
          },
          {
            title: "New Community",
            icon: "people-outline",
            onPress: () => navigation.navigate("NewCommunity"),
          },
        ]}
        style={{ marginHorizontal: 20 }}
      />

      <Text style={styles.followingTitle}>Communities You Follow:</Text>
      {communitiesLoadError ? (
        <RetryState
          compact
          message={communitiesLoadError}
          onRetry={retryProfileLoad}
          style={styles.inlineError}
        />
      ) : null}
      {communities.map(community => (
        <View
          key={community.id}
          style={[
            styles.altProfileButton,
            { borderColor: theme.secondaryBackground },
          ]}
        >
          <ActorDisplayComponent
            name={community.name}
            host={community.host}
            local={community.local}
            showHost={"always"}
            colorize={"always"}
            newLine={true}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    height: "100%",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  followingTitle: {
    fontSize: 18,
    fontWeight: "500",
    padding: 20,
  },
  editView: {
    margin: 20,
  },
  editViewText: {
    marginBottom: 15,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  editViewActionButtons: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-around",
  },
  buttonView: {
    display: "flex",
    alignItems: "center",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: "80%",
  },
  inputContainer: {
    width: "100%",
    padding: 20,
  },
  input: {
    borderWidth: 1,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingVertical: 10,
    paddingHorizontal: 20,
    width: "100%",
    borderRadius: 8,
  },
  altProfileButton: {
    marginHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  loadingText: {
    padding: 20,
  },
  inlineError: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
});

/* end of ProfileScreen.tsx */
