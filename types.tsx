/*
    Project: Hoot Mobile
    -------------------

    File: types.tsx

    Purpose:

        Define React Navigation route and screen prop types.

    Responsibilities:

        - Describe root stack and tab route parameters
        - Register the app route map with React Navigation's global types
        - Export screen prop helper types used by Hoot screens

    This file intentionally does NOT contain:

        - navigation component setup
        - deep-link path mapping
        - Lotide API response shapes
*/

import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

declare global {
  namespace ReactNavigation {
    // React Navigation uses this empty interface for global route merging.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

export type RootStackParamList = {
  Root: NavigatorScreenParams<RootTabParamList> | undefined;
  Modal: { postId: PostId; highlightedComments?: CommentId[] };
  Post: { postId: PostId; highlightedComments?: CommentId[] };
  Status: { statusId: string };
  Group: { groupId: string; title?: string };
  ImageViewer: { uri: string; fallbackUri?: string; description?: string };
  AccountProfile: undefined;
  NotFound: undefined;
  Comment: {
    id: number;
    postId?: PostId;
    title?: string;
    html: string;
    type: "post" | "comment";
  };
  Settings: undefined;
  Community: {
    community?: Community | { id: CommunityId };
    id?: CommunityId | string;
  };
  NewCommunity: undefined;
  EditCommunity: { community: Community };
  ForgotPassword: { node: string };
  ProfileActivity: { userId?: UserId; username?: string };
  Moderation: undefined;
  CollectionTarget: {
    id: CollectionTargetId | string;
    source?: Partial<CollectionTarget> | Partial<CollectionTargetListItem>;
  };
  CollectionTargetItem: {
    collectionTargetId: CollectionTargetId | string;
    itemId: CollectionTargetItemId | string;
    title?: string;
  };
  MessageThread: {
    userId: UserId | string;
    username?: string;
  };

  FeedScreen: { sort: SortOption };
  GroupFeedScreen: undefined;
  SearchScreen: undefined;
  SourceListScreen: undefined;
  MessageListScreen: undefined;
  NewPostScreen: { community?: Community; composeIntentId?: string; groupId?: string; groupName?: string; inReplyToId?: string; quoteId?: string };
  NotificationScreen: undefined;
  OptionsScreen: undefined;
  // Retained for the legacy profile screen; the Unfathomably UI opens it from Options.
  ProfileScreen: undefined;
};

export type RootStackScreenProps<Screen extends keyof RootStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<RootStackParamList, Screen>,
    BottomTabScreenProps<RootTabParamList>
  >;

export type RootTabParamList = {
  FeedScreen: { sort: SortOption };
  GroupFeedScreen: undefined;
  SearchScreen: undefined;
  SourceListScreen: undefined;
  MessageListScreen: undefined;
  NewPostScreen: { community?: Community; composeIntentId?: string; groupId?: string; groupName?: string; inReplyToId?: string; quoteId?: string };
  NotificationScreen: undefined;
  OptionsScreen: undefined;
  ProfileScreen: undefined;
};

export type RootTabScreenProps<Screen extends keyof RootTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<RootTabParamList, Screen>,
    NativeStackScreenProps<RootStackParamList>
  >;

/* end of types.tsx */
