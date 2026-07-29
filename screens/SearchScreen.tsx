/*
    Project: Hoot Mobile
    -------------------

    File: SearchScreen.tsx

    Purpose:

        Browse communities from the search tab.

    Responsibilities:

        - Switch between followed and global community lists
        - Navigate to selected community details

    This file intentionally does NOT contain:

        - host login
        - post search
*/

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { RootTabScreenProps } from "../types";
import SuggestLogin from "../components/SuggestLogin";
import CommunityFinder from "../components/CommunityFinder";
import { useLotideCtx } from "../hooks/useLotideCtx";
import { Text } from "../components/Themed";
import useTheme from "../hooks/useTheme";
import { MINIMUM_TOUCH_TARGET_SIZE } from "../constants/TouchTargets";

type CommunityTab = "mine" | "everything";

export default function SearchScreen({
  navigation,
}: RootTabScreenProps<"SearchScreen">) {
  const [focusId, setFocusId] = useState(0);
  const [selectedTab, setSelectedTab] = useState<CommunityTab>("mine");
  const ctx = useLotideCtx();
  const theme = useTheme();

  useEffect(
    () => navigation.addListener("focus", () => setFocusId(x => x + 1)),
    [navigation],
  );

  if (!ctx?.login) return <SuggestLogin />;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.tabs}>
        <Pressable
          accessibilityLabel="Show communities I follow"
          accessibilityRole="button"
          accessibilityState={{ selected: selectedTab === "mine" }}
          onPress={() => setSelectedTab("mine")}
          style={[
            styles.tab,
            selectedTab === "mine" && {
              backgroundColor: theme.secondaryTint,
            },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  selectedTab === "mine"
                    ? theme.background
                    : theme.secondaryText,
              },
            ]}
          >
            Mine
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Show every community"
          accessibilityRole="button"
          accessibilityState={{ selected: selectedTab === "everything" }}
          onPress={() => setSelectedTab("everything")}
          style={[
            styles.tab,
            selectedTab === "everything" && {
              backgroundColor: theme.secondaryTint,
            },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  selectedTab === "everything"
                    ? theme.background
                    : theme.secondaryText,
              },
            ]}
          >
            Everything
          </Text>
        </Pressable>
      </View>
      <CommunityFinder
        onSelect={community => navigation.navigate("Community", { community })}
        focusId={focusId}
        onlyFollowing={selectedTab === "mine"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  tab: {
    alignItems: "center",
    borderRadius: 6,
    justifyContent: "center",
    marginRight: 10,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
  },
});

/* end of SearchScreen.tsx */
