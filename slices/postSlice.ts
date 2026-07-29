/*
    Project: Hoot Mobile
    -------------------

    File: postSlice.ts

    Purpose:

        Store normalized post state in Redux.

    Responsibilities:

        - Upsert posts from feeds and details
        - Patch post fields after child loads
        - Update optimistic post votes

    This file intentionally does NOT contain:

        - network requests
        - component rendering
*/

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface PostState {
  posts: { [key: PostId]: Post };
}

const initialState: PostState = { posts: {} };

export const postSlice = createSlice({
  name: "posts",
  initialState,
  reducers: {
    setPost: (state, action: PayloadAction<{ post: Post }>) => {
      const p = action.payload;
      state.posts[p.post.id] = p.post;
    },
    setPostMulti: (state, action: PayloadAction<{ posts: Post[] }>) => {
      action.payload.posts.forEach(post => {
        state.posts[post.id] = post;
      });
    },
    editPost: (
      state,
      action: PayloadAction<{
        id: PostId;
        post: Partial<Post>;
      }>,
    ) => {
      const p = action.payload;
      const post = state.posts[p.id];
      state.posts[p.id] = {
        ...post,
        ...p.post,
      };
    },
    clearPosts: state => {
      state.posts = {};
    },
    setPostVote: (
      state,
      action: PayloadAction<{ id: PostId; vote: boolean }>,
    ) => {
      const p = action.payload;
      const post = state.posts[p.id];
      if (!post) return;

      if (post.your_vote !== p.vote) {
        post.your_vote = p.vote;
        if (p.vote) {
          post.score += 1;
        } else {
          post.score -= 1;
        }
      }
    },
  },
});

// Action creators are generated for each case reducer function
export const { setPost, setPostMulti, editPost, clearPosts, setPostVote } =
  postSlice.actions;

export default postSlice.reducer;

/* end of postSlice.ts */
