/*
    Project: Hoot Mobile
    -------------------

    File: usePost.ts

    Purpose:

        Read and refresh a single post from Redux and Lotide.

    Responsibilities:

        - Select cached post data
        - Fetch missing posts
        - Support explicit reload attempts
        - Ignore stale responses from replaced requests
        - Ignore responses after the hook unmounts

    This file intentionally does NOT contain:

        - feed pagination
        - comment loading
*/

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/reduxStore";
import * as LotideService from "../services/LotideService";
import { useLotideCtx } from "./useLotideCtx";
import { setPost } from "../slices/postSlice";

export default function usePost(
  postId: PostId,
  reloadId = 0,
): Post | undefined {
  const dispatch = useDispatch();
  const ctx = useLotideCtx();
  const post: Post | undefined = useSelector(
    (state: RootState) => state.posts.posts[postId],
  );
  const loadKey = `${postId}:${reloadId}`;
  const requestScopeKey = [
    ctx?.apiUrl ?? "",
    ctx?.login?.token ?? "anonymous",
    loadKey,
  ].join("|");
  const lastRequestedLoadKey = useRef("");
  const activeRequestKey = useRef("");

  useEffect(() => {
    if (!ctx) {
      activeRequestKey.current = "";
      return;
    }

    if (post && reloadId === 0) {
      lastRequestedLoadKey.current = loadKey;
      activeRequestKey.current = "";
      return;
    }

    if (post && lastRequestedLoadKey.current === loadKey) return;

    lastRequestedLoadKey.current = loadKey;
    activeRequestKey.current = requestScopeKey;

    LotideService.getPost(ctx, postId)
      .then(post => {
        if (activeRequestKey.current !== requestScopeKey) return;
        dispatch(setPost({ post }));
      })
      .catch(() => null);

    return () => {
      if (activeRequestKey.current === requestScopeKey) {
        activeRequestKey.current = "";
      }
    };
  }, [ctx, dispatch, loadKey, post, postId, reloadId, requestScopeKey]);

  return post;
}

/* end of usePost.ts */
