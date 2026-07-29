/*
    Project: Hoot Mobile
    -------------------

    File: reduxStore.ts

    Purpose:

        Create the Redux store used by the app.

    Responsibilities:

        - Combine post, comment, settings, and Lotide reducers
        - Export typed store state and dispatch types

    This file intentionally does NOT contain:

        - persistence
        - API calls
*/

import { configureStore } from "@reduxjs/toolkit";
import postReducer from "../slices/postSlice";
import lotideReducer from "../slices/lotideSlice";
import commentReducer from "../slices/commentSlice";
import settingsReducer from "../slices/settingsSlice";

const store = configureStore({
  reducer: {
    lotide: lotideReducer,
    posts: postReducer,
    comments: commentReducer,
    settings: settingsReducer,
  },
});

export default store;

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;

/* end of reduxStore.ts */
