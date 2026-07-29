/**
    Project: Hoot Mobile
    -------------------

    File: LinkingConfiguration.ts

    Purpose:

        Configures deep linking for the application, mapping URL paths
        to specific screens and their parameters.

    Responsibilities:

        • Define URL prefixes for the application
        • Map URL paths to navigation stack/tab routes
        • Configure parameter parsing for deep linked routes

    This file intentionally does NOT contain:

        • Navigation structure definitions (see navigation/index.tsx)
        • Screen implementations
*/

import {
  getStateFromPath,
  LinkingOptions,
} from '@react-navigation/native';
import * as Linking from 'expo-linking';

import { RootStackParamList } from '../types';

/* ------------------------------------------------------------------------- */
/* Deep Linking Configuration                                                */
/* ------------------------------------------------------------------------- */

function parseSortOption(sort: string): SortOption {
  return sort === "hot" || sort === "new" || sort === "top" ? sort : "hot";
}

export function isOAuthCallbackPath(path: string): boolean {
  return path
    .replace(/^\/+/, "")
    .split(/[?#]/, 1)[0]
    .replace(/\/+$/, "") === "oauth/callback";
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/')],
  getStateFromPath: (path, options) =>
    isOAuthCallbackPath(path)
      ? undefined
      : getStateFromPath(path, options),
  config: {
    screens: {
      Root: {
        screens: {
          FeedScreen: {
            path: 'feed/:sort',
            parse: {
              sort: parseSortOption,
            },
          },
          GroupFeedScreen: 'group-feed',
          SearchScreen: 'groups',
          NewPostScreen: 'new-post',
          NotificationScreen: 'notifications',
          OptionsScreen: 'options',
        },
      },
      Status: 'status/:statusId',
      Group: 'groups/:groupId',
      AccountProfile: 'profile',
      ImageViewer: 'image',
      Settings: 'settings',
      NotFound: '*',
    },
  },
};

export default linking;

/* end of LinkingConfiguration.ts */
