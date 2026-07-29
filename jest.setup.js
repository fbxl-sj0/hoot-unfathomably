/*
    Project: Hoot Mobile
    -------------------

    File: jest.setup.js

    Purpose:

        Provides test-only setup for React Native components that schedule
        native list work outside the normal React test renderer lifecycle.

    Responsibilities:

        • Mock AsyncStorage before app modules import StorageService
        • Mock VirtualizedList with a synchronous renderer for unit tests
        • Preserve list refresh props so pull-to-refresh tests inspect them
        • Keep FlatList-based screen tests free of asynchronous act warnings

    This file intentionally does NOT contain:

        • Application runtime code
        • Network mocks for individual services
        • Test assertions
*/

global.IS_REACT_ACT_ENVIRONMENT = true;
global.IS_REACT_NATIVE_TEST_ENVIRONMENT = true;

/*
    AsyncStorage exposes a native module at runtime.

    Jest runs without the React Native bridge, so the package intentionally
    throws during import unless tests install its documented mock first.
*/
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  const { Text } = require("react-native");

  function Icon({ name }) {
    return React.createElement(Text, null, name || "icon");
  }

  Icon.font = {};

  return {
    __esModule: true,
    default: Icon,
  };
});

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");

  function Icon({ name }) {
    return React.createElement(Text, null, name || "icon");
  }

  Icon.font = {};

  return {
    __esModule: true,
    FontAwesome: Icon,
    Ionicons: Icon,
  };
});

jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: {
    Success: "success",
    Failed: "failed",
  },
  BackgroundTaskStatus: {
    Available: "available",
    Restricted: "restricted",
  },
  getStatusAsync: jest.fn(() => Promise.resolve("available")),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-font", () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
  impactAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-linking", () => ({
  createURL: jest.fn(path => `hoot://${path}`),
  openURL: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-secure-store", () => {
  const values = new Map();
  return {
    __reset: () => values.clear(),
    deleteItemAsync: jest.fn(key => {
      values.delete(key);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn(key => Promise.resolve(values.get(key) || null)),
    setItemAsync: jest.fn((key, value) => {
      values.set(key, value);
      return Promise.resolve();
    }),
  };
});

jest.mock("expo-notifications", () => ({
  AndroidImportance: {
    DEFAULT: "default",
    HIGH: "high",
  },
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({
      granted: true,
    }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({
      granted: true,
    }),
  ),
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  clearLastNotificationResponse: jest.fn(),
  getLastNotificationResponse: jest.fn(() => null),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("notification-id")),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(),
}));

jest.mock("expo-splash-screen", () => ({
  hideAsync: jest.fn(() => Promise.resolve()),
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-status-bar", () => {
  const React = require("react");

  return {
    StatusBar: () => React.createElement(React.Fragment, null),
  };
});

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
}));

jest.mock("@react-native/virtualized-lists/Lists/VirtualizedList", () => {
  const React = require("react");
  const { View } = require("react-native");

  function renderOptionalComponent(component) {
    if (!component) return null;
    if (typeof component === "function") {
      return React.createElement(component);
    }

    return component;
  }

  function VirtualizedList({
    data,
    getItem,
    getItemCount,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    onEndReached,
    onRefresh,
    refreshing,
    testID,
  }) {
    const itemCount = getItemCount ? getItemCount(data) : data?.length || 0;
    const items = [];

    for (let index = 0; index < itemCount; index++) {
      const item = getItem ? getItem(data, index) : data[index];
      items.push(
        React.createElement(React.Fragment, { key: index }, renderItem({
          item,
          index,
          separators: {},
        })),
      );
    }

    return React.createElement(
      View,
      {
        onEndReached,
        onRefresh,
        refreshing,
        testID,
      },
      renderOptionalComponent(ListHeaderComponent),
      itemCount > 0 ? items : renderOptionalComponent(ListEmptyComponent),
    );
  }

  return {
    __esModule: true,
    default: VirtualizedList,
  };
});

/* end of jest.setup.js */
