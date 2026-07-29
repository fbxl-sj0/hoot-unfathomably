/*
    Project: Hoot Mobile
    --------------------------

    File: UnfathomablyGroupFeedScreen.tsx

    Purpose:

        Show the combined timeline for the groups the signed-in account follows.
*/

import React from "react";

import TimelineScreen from "./UnfathomablyFeedScreen";

export default function UnfathomablyGroupFeedScreen({ navigation }: { navigation: any }) {
  return <TimelineScreen navigation={navigation} scope="groups" />;
}

/* end of UnfathomablyGroupFeedScreen.tsx */
