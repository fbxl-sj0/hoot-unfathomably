/*
    Project: Hoot Mobile
    -------------------

    File: settingsSlice.ts

    Purpose:

        Store app-wide preferences that affect multiple screens.

    Responsibilities:

        - Hold the default feed sort used by navigation
        - Hold the current feed sort used by the active navigator
        - Apply settings loaded from persistent storage
        - Allow SettingsScreen to update preferences immediately

    This file intentionally does NOT contain:

        - persistent storage
        - network requests
        - UI rendering
*/

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AppSettings, appSettings } from "../services/StorageService";

export type SettingsState = AppSettings & {
  activeFeedSort: SortOption;
};

const initialState: SettingsState = {
  ...appSettings.defaults,
  activeFeedSort: appSettings.defaults.defaultFeedSort,
};

export const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setAppSettings: (state, action: PayloadAction<AppSettings>) => {
      state.defaultFeedSort = action.payload.defaultFeedSort;
      state.activeFeedSort = action.payload.defaultFeedSort;
    },
    setDefaultFeedSort: (state, action: PayloadAction<SortOption>) => {
      state.defaultFeedSort = action.payload;
      state.activeFeedSort = action.payload;
    },
    setActiveFeedSort: (state, action: PayloadAction<SortOption>) => {
      state.activeFeedSort = action.payload;
    },
  },
});

export const { setActiveFeedSort, setAppSettings, setDefaultFeedSort } =
  settingsSlice.actions;

export default settingsSlice.reducer;

/* end of settingsSlice.ts */
