/*
    Project: Hoot Mobile
    -------------------

    File: index.tsx

    Purpose:

        Define the app navigation tree and tab/drawer actions.

    Responsibilities:

        - Configure root, tab, drawer, and stack navigators
        - Wire feed sorting controls
        - Register profile, moderation, and settings screens

    This file intentionally does NOT contain:

        - deep link path mapping
        - screen implementations
*/

/**
 * If you are not familiar with React Navigation, refer to the "Fundamentals" guide:
 * https://reactnavigation.org/docs/getting-started
 *
 */
import React, { useCallback, useEffect, useRef } from "react";
import Icon from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DefaultTheme,
  DarkTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  ActionSheetIOS,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";

import Colors from "../constants/Colors";
import useColorScheme, { AppColorScheme } from "../hooks/useColorScheme";
import {
  RootStackParamList,
  RootStackScreenProps,
  RootTabParamList,
} from "../types";
import { RootState } from "../store/reduxStore";
import { setActiveFeedSort } from "../slices/settingsSlice";
import LinkingConfiguration from "./LinkingConfiguration";

import TimelineScreen from "../screens/UnfathomablyFeedScreen";
import GroupFeedScreen from "../screens/UnfathomablyGroupFeedScreen";
import GroupsScreen from "../screens/GroupsScreen";
import ProfileScreen from "../screens/UnfathomablyProfileScreen";
import OptionsScreen from "../screens/OptionsScreen";
import NewPostScreen from "../screens/ComposeStatusScreen";
import SettingsScreen from "../screens/SettingsScreen/SettingsScreen";
import CommunityScreen from "../screens/CommunityScreen";
import CommentScreen from "../screens/CommentScreen";
import ModalScreen from "../screens/ModalScreen";
import NotFoundScreen from "../screens/NotFoundScreen";
import NotificationScreen from "../screens/UnfathomablyNotificationsScreen";
import StatusThreadScreen from "../screens/StatusThreadScreen";
import ImageViewerScreen from "../screens/ImageViewerScreen";
import GroupScreen from "../screens/GroupScreen";
import NewCommunityScreen from "../screens/NewCommunity";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import EditCommunityScreen from "../screens/EditCommunityScreen";
import ProfileActivityScreen from "../screens/ProfileActivityScreen";
import ModerationScreen from "../screens/ModerationScreen";
import SourceListScreen from "../screens/SourceListScreen";
import SourceScreen from "../screens/SourceScreen";
import SourceItemScreen from "../screens/SourceItemScreen";
import MessageListScreen from "../screens/MessageListScreen";
import MessageThreadScreen from "../screens/MessageThreadScreen";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { createDrawerNavigator } from "@react-navigation/drawer";
import * as LotideNotificationPoller from "../services/LotideNotificationPoller";
import {
  supportsCollectionTargets,
  supportsPrivateMessages,
} from "../constants/LotideApi";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";

type RootNavigation = RootStackScreenProps<"Root">["navigation"];
type SortIconName = React.ComponentProps<typeof Icon>["name"];

const bottomTabSortIcons: Record<SortOption, SortIconName> = {
  hot: "flame-outline",
  new: "time-outline",
  top: "trophy-outline",
};

const drawerSortIcons: Record<SortOption, SortIconName> = {
  hot: "flame-outline",
  new: "time-outline",
  top: "arrow-up-outline",
};

function normalizeSortForServer(
  sort: SortOption,
  supportsTop: boolean,
): SortOption {
  if (!supportsTop && sort === "top") return "hot";

  return sort;
}

function useFeedSort(
  navigation: RootNavigation,
  supportsTop: boolean,
): {
  safeSort: SortOption;
  changeSort: (requestedSort: SortOption) => void;
} {
  const dispatch = useDispatch();
  const activeFeedSort = useSelector(
    (state: RootState) => state.settings.activeFeedSort,
  );
  const safeSort = normalizeSortForServer(activeFeedSort, supportsTop);
  const previousSafeSort = useRef<SortOption>(safeSort);

  /*
      The saved preference and the current feed sort are separate.  Header sort
      changes should affect the visible feed immediately without rewriting what
      the app should use on the next launch.
  */
  useEffect(() => {
    if (previousSafeSort.current === safeSort) return;

    previousSafeSort.current = safeSort;
    navigation.navigate("FeedScreen", { sort: safeSort });
  }, [navigation, safeSort]);

  const changeSort = useCallback(
    (requestedSort: SortOption) => {
      dispatch(setActiveFeedSort(
        normalizeSortForServer(requestedSort, supportsTop),
      ));
    },
    [dispatch, supportsTop],
  );

  return {
    safeSort,
    changeSort,
  };
}

export default function Navigation({
  colorScheme,
}: {
  colorScheme: AppColorScheme;
}) {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const pendingNotificationTarget =
    useRef<LotideNotificationPoller.NotificationNavigationTarget | undefined>(
      undefined,
    );
  const navigationTheme = {
    ...(colorScheme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(colorScheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      primary: Colors[colorScheme].tint,
      background: Colors[colorScheme].background,
      card: Colors[colorScheme].tabBar,
      text: Colors[colorScheme].text,
      border: Colors[colorScheme].tertiaryBackground,
      notification: Colors[colorScheme].tint,
    },
  };

  const navigateToNotificationTarget = useCallback(
    (target: LotideNotificationPoller.NotificationNavigationTarget) => {
      if (!navigationRef.isReady()) {
        pendingNotificationTarget.current = target;
        return;
      }

      switch (target.screen) {
        case "Post":
          navigationRef.navigate("Post", target.params);
          break;
        case "Notifications":
          navigationRef.navigate("Root", { screen: "NotificationScreen" });
          break;
        case "MessageThread":
          navigationRef.navigate("MessageThread", target.params);
          break;
      }

      pendingNotificationTarget.current = undefined;
      LotideNotificationPoller.clearLastNotificationResponse();
    },
    [navigationRef],
  );

  const flushPendingNotificationTarget = useCallback(() => {
    const target =
      pendingNotificationTarget.current ??
      LotideNotificationPoller.getLastNotificationNavigationTarget();

    if (target) {
      navigateToNotificationTarget(target);
    }
  }, [navigateToNotificationTarget]);

  useEffect(() => {
    flushPendingNotificationTarget();

    const subscription =
      LotideNotificationPoller.addNotificationResponseReceivedListener(
        navigateToNotificationTarget,
      );

    return () => subscription.remove();
  }, [flushPendingNotificationTarget, navigateToNotificationTarget]);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={LinkingConfiguration}
      onReady={flushPendingNotificationTarget}
      theme={navigationTheme}
    >
      <RootNavigator />
    </NavigationContainer>
  );
}

/**
 * A root stack navigator is often used for displaying modals on top of all other content.
 * https://reactnavigation.org/docs/modal
 */
const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const dimensions = useWindowDimensions();
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Root"
        component={
          dimensions.width < 1200 ? BottomTabNavigator : DrawerNavigator
        }
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Post" component={ModalScreen} />
      <Stack.Screen name="Status" component={StatusThreadScreen} options={{ title: "Discussion" }} />
      <Stack.Screen name="ImageViewer" component={ImageViewerScreen} options={{ title: "Image" }} />
      <Stack.Screen name="Group" component={GroupScreen} options={({ route }) => ({ title: route.params.title || "Group" })} />
      <Stack.Screen name="AccountProfile" component={ProfileScreen} options={{ title: "Your profile" }} />
      <Stack.Screen name="Comment" component={CommentScreen} />
      <Stack.Screen name="Community" component={CommunityScreen} />
      <Stack.Screen
        name="CollectionTarget"
        component={SourceScreen}
        options={{ title: "Feed" }}
      />
      <Stack.Screen
        name="CollectionTargetItem"
        component={SourceItemScreen}
        options={({ route }) => ({
          title: route.params?.title || "Feed Item",
        })}
      />
      <Stack.Screen
        name="MessageThread"
        component={MessageThreadScreen}
        options={({ route }) => ({
          title: route.params?.username
            ? `Messages with ${route.params.username}`
            : "Messages",
        })}
      />
      <Stack.Screen name="NewCommunity" component={NewCommunityScreen} />
      <Stack.Screen name="EditCommunity" component={EditCommunityScreen} />
      <Stack.Screen
        name="ProfileActivity"
        component={ProfileActivityScreen}
        options={({ route }) => ({
          title: route.params?.username
            ? `${route.params.username}'s Activity`
            : "Activity",
        })}
      />
      <Stack.Screen
        name="Moderation"
        component={ModerationScreen}
        options={{ title: "Moderation" }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ title: "Forgot Password" }}
      />
      <Stack.Screen
        name="NotFound"
        component={NotFoundScreen}
        options={{ title: "Oops!" }}
      />
      <Stack.Group screenOptions={{ presentation: "modal" }}>
        <Stack.Screen name="Modal" component={ModalScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}

/**
 * A bottom tab navigator displays tab buttons on the bottom of the display to switch screens.
 * https://reactnavigation.org/docs/bottom-tab-navigator
 */
const BottomTab = createBottomTabNavigator<RootTabParamList>();

function BottomTabNavigator({ navigation }: { navigation: RootNavigation }) {
  const ctx = useLotideCtx();
  const colorScheme = useColorScheme();
  const supportsTop = (ctx?.apiVersion || 0) >= 10;
  const supportsSources = supportsCollectionTargets(ctx?.apiVersion);
  const supportsMessages = supportsPrivateMessages(ctx?.apiVersion);
  const { safeSort, changeSort } = useFeedSort(navigation, supportsTop);

  const sortMenu = [
    safeSort,
    "hot",
    "new",
    ...(supportsTop ? (["top"] as SortOption[]) : []),
  ].filter(
    (value, i, arr): value is SortOption => arr.indexOf(value) === i,
  );

  return (
    <BottomTab.Navigator
      initialRouteName="FeedScreen"
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarShowLabel: false,
      }}
    >
      <BottomTab.Screen
        name="FeedScreen"
        component={TimelineScreen}
        initialParams={{ sort: safeSort }}
        options={() => ({
          title: "Timeline",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="home-outline" color={color} />
          ),
          headerRight: () => (
            <Pressable
              accessibilityLabel="Change feed sort"
              accessibilityRole="button"
              hitSlop={TOUCH_TARGET_HIT_SLOP}
              onPress={() => {
                if (Platform.OS === "ios") {
                  ActionSheetIOS.showActionSheetWithOptions(
                    {
                      options: [
                        "Cancel",
                        ...sortMenu.map(value => value.replace("top", "Top")),
                      ],
                      title: "Sort by:",
                      cancelButtonIndex: 0,
                    },
                    buttonIndex => {
                      const buttonSelected = buttonIndex - 1;
                      const newSort = sortMenu[buttonSelected];
                      if (!newSort) return;
                      changeSort(newSort);
                    },
                  );
                } else {
                  const sortSwitch: Partial<Record<SortOption, SortOption>> = {
                    hot: "new",
                    new: supportsTop ? "top" : "hot",
                  };
                  const newSort = sortSwitch[safeSort];
                  if (newSort) {
                    changeSort(newSort);
                  }
                }
              }}
              style={({ pressed }) => [
                styles.headerIconButton,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Icon
                name={bottomTabSortIcons[safeSort]}
                size={25}
                color={Colors[colorScheme].tint}
              />
            </Pressable>
          ),
        })}
      />
      <BottomTab.Screen
        name="GroupFeedScreen"
        component={GroupFeedScreen}
        options={{
          title: "Group feed",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="chatbubbles-outline" color={color} />
          ),
        }}
      />
      <BottomTab.Screen
        name="SearchScreen"
        component={GroupsScreen}
        options={{
          title: "Groups",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="people-outline" color={color} />
          ),
        }}
      />
      {supportsSources && (
        <BottomTab.Screen
          name="SourceListScreen"
          component={SourceListScreen}
          options={{
            title: "Feeds",
            tabBarIcon: ({ color }) => (
              <TabBarIcon name="radio-outline" color={color} />
            ),
          }}
        />
      )}
      <BottomTab.Screen
        name="NewPostScreen"
        component={NewPostScreen}
        initialParams={{ community: undefined }}
        options={{
          title: "New post",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="add-outline" color={color} size={40} />
          ),
        }}
      />
      <BottomTab.Screen
        name="NotificationScreen"
        component={NotificationScreen}
        options={{
          title: "Notifications",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="notifications-outline" color={color} />
          ),
        }}
      />
      {supportsMessages && (
        <BottomTab.Screen
          name="MessageListScreen"
          component={MessageListScreen}
          options={{
            title: "Messages",
            tabBarIcon: ({ color }) => (
              <TabBarIcon name="mail-outline" color={color} />
            ),
          }}
        />
      )}
      <BottomTab.Screen
        name="OptionsScreen"
        component={OptionsScreen}
        options={{
          title: "Options",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="settings-outline" color={color} />
          ),
        }}
      />
    </BottomTab.Navigator>
  );
}

const Drawer = createDrawerNavigator<RootTabParamList>();

function DrawerNavigator({ navigation }: { navigation: RootNavigation }) {
  const ctx = useLotideCtx();
  const colorScheme = useColorScheme();
  const supportsTop = (ctx?.apiVersion || 0) >= 10;
  const supportsSources = supportsCollectionTargets(ctx?.apiVersion);
  const supportsMessages = supportsPrivateMessages(ctx?.apiVersion);
  const { safeSort, changeSort } = useFeedSort(navigation, supportsTop);

  return (
    <Drawer.Navigator
      initialRouteName="FeedScreen"
      screenOptions={{
        drawerActiveTintColor: Colors[colorScheme].tint,
        drawerInactiveTintColor: Colors[colorScheme].text,
        drawerType: "permanent",
      }}
    >
      <Drawer.Screen
        name="FeedScreen"
        component={TimelineScreen}
        initialParams={{ sort: safeSort }}
        options={({ navigation }) => ({
          title: "Timeline",
          drawerIcon: ({ color }) => (
            <TabBarIcon name="home-outline" color={color} />
          ),
          headerRight: () => (
            <Pressable
              accessibilityLabel="Change feed sort"
              accessibilityRole="button"
              hitSlop={TOUCH_TARGET_HIT_SLOP}
              onPress={() => {
                const sortSwitch: Record<SortOption, SortOption> = {
                  top: "hot",
                  hot: "new",
                  new: supportsTop ? "top" : "hot",
                };
                changeSort(sortSwitch[safeSort]);
              }}
              style={({ pressed }) => [
                styles.headerIconButton,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Icon
                name={drawerSortIcons[safeSort]}
                size={25}
                color={Colors[colorScheme].tint}
              />
            </Pressable>
          ),
        })}
      />
      <Drawer.Screen
        name="GroupFeedScreen"
        component={GroupFeedScreen}
        options={{
          title: "Group feed",
          drawerIcon: ({ color }) => (
            <TabBarIcon name="chatbubbles-outline" color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="SearchScreen"
        component={GroupsScreen}
        options={{
          title: "Groups",
          drawerIcon: ({ color }) => (
            <TabBarIcon name="people-outline" color={color} />
          ),
        }}
      />
      {supportsSources && (
        <Drawer.Screen
          name="SourceListScreen"
          component={SourceListScreen}
          options={{
            title: "Feeds",
            drawerIcon: ({ color }) => (
              <TabBarIcon name="radio-outline" color={color} />
            ),
          }}
        />
      )}
      <Drawer.Screen
        name="NewPostScreen"
        component={NewPostScreen}
        initialParams={{ community: undefined }}
        options={{
          title: "New Post",
          drawerIcon: ({ color }) => (
            <TabBarIcon name="add-outline" color={color} size={40} />
          ),
        }}
      />
      <Drawer.Screen
        name="NotificationScreen"
        component={NotificationScreen}
        options={{
          title: "Notifications",
          drawerIcon: ({ color }) => (
            <TabBarIcon name="notifications-outline" color={color} />
          ),
        }}
      />
      {supportsMessages && (
        <Drawer.Screen
          name="MessageListScreen"
          component={MessageListScreen}
          options={{
            title: "Messages",
            drawerIcon: ({ color }) => (
              <TabBarIcon name="mail-outline" color={color} />
            ),
          }}
        />
      )}
      <Drawer.Screen
        name="OptionsScreen"
        component={OptionsScreen}
        options={{
          title: "Options",
          drawerIcon: ({ color }) => (
            <TabBarIcon name="settings-outline" color={color} />
          ),
          headerRight: () => (
            <Pressable
              accessibilityLabel="Open app settings"
              accessibilityRole="button"
              hitSlop={TOUCH_TARGET_HIT_SLOP}
              onPress={() => {
                navigation.navigate("Settings");
              }}
              style={({ pressed }) => [
                styles.headerIconButton,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Icon
                name="settings-outline"
                size={25}
                color={Colors[colorScheme].secondaryText}
              />
            </Pressable>
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

/**
 * You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
 */
function TabBarIcon(props: {
  name: React.ComponentProps<typeof Icon>["name"];
  color: string;
  size?: number;
}) {
  const size = props.size || 30;
  return (
    <Icon
      size={size}
      style={{
        marginBottom: -3,
        height: size,
        width: size,
      }}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  headerIconButton: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: MINIMUM_TOUCH_TARGET_SIZE,
  },
});

/* end of index.tsx */
