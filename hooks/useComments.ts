/*
    Project: Hoot Mobile
    -------------------

    File: useComments.ts

    Purpose:

        Load paged replies for a post or comment.

    Responsibilities:

        - Fetch first and next reply pages
        - Store returned comment records
        - Expose loading and failure state
        - Ignore responses after replacement or unmount

    This file intentionally does NOT contain:

        - comment composition
        - post list loading
*/

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/reduxStore";
import { useLotideCtx } from "./useLotideCtx";
import * as LotideService from "../services/LotideService";
import { editComment, setCommentMulti } from "../slices/commentSlice";
import { editPost } from "../slices/postSlice";

/**
 * Gets child comment IDs
 */
export default function useComments(
  type: ContentType,
  id: number,
  reloadId = 0,
): {
  comments?: Paged<CommentId>;
  isLoading: boolean;
  loadError: string;
  loadNextPage: () => void;
  refreshComments: () => void;
} {
  const dispatch = useDispatch();
  const comments = useSelector(
    (state: RootState) =>
      type === "post"
        ? state.posts.posts[id]?.replies
        : state.comments.comments[id]?.replies,
  ) as Paged<CommentId> | undefined;
  const ctx = useLotideCtx();
  const shouldLoadOnMount = type === "post" && !comments;
  const loadKey = `${type}:${id}`;
  const initialLoadKey = useRef<string | null>(null);
  const refreshLoadKey = useRef<string | null>(null);
  const requestId = useRef(0);
  const [loadErrorState, setLoadErrorState] = useState({
    key: "",
    message: "",
  });
  const loadError =
    loadErrorState.key === loadKey ? loadErrorState.message : "";
  const isLoading = !comments && loadError === "";

  const loadPage = useCallback((replaceExistingPage: boolean) => {
    if (!ctx) return;
    if (!replaceExistingPage && comments && comments.next_page === null) {
      return;
    }

    const nextPage = replaceExistingPage
      ? undefined
      : comments?.next_page ?? undefined;
    const activeRequestId = requestId.current + 1;

    requestId.current = activeRequestId;

    switch (type) {
      case "post":
        LotideService.getPostComments(ctx, id, nextPage).then(newComments => {
          if (activeRequestId !== requestId.current) return;

          dispatch(setCommentMulti(newComments[1]));
          dispatch(
            editPost({
              id,
              post: {
                replies: mergeCommentIds(
                  comments,
                  newComments[0],
                  replaceExistingPage,
                ),
              },
            }),
          );
          setLoadErrorState({ key: loadKey, message: "" });
        }).catch(() => {
          if (activeRequestId !== requestId.current) return;

          setLoadErrorState({ key: loadKey, message: "Cannot load comments" });
        });
        break;
      case "comment":
        LotideService.getCommentComments(ctx, id, nextPage).then(newComments => {
          if (activeRequestId !== requestId.current) return;

          dispatch(setCommentMulti(newComments[1]));
          dispatch(
            editComment({
              id,
              comment: {
                replies: mergeCommentIds(
                  comments,
                  newComments[0],
                  replaceExistingPage,
                ),
              },
            }),
          );
          setLoadErrorState({ key: loadKey, message: "" });
        }).catch(() => {
          if (activeRequestId !== requestId.current) return;

          setLoadErrorState({ key: loadKey, message: "Cannot load comments" });
        });
        break;
    }
  }, [ctx, comments, dispatch, id, loadKey, type]);

  const loadNextPage = useCallback(() => {
    loadPage(false);
  }, [loadPage]);

  const refreshComments = useCallback(() => {
    loadPage(true);
  }, [loadPage]);

  useEffect(() => () => {
    requestId.current += 1;
  }, [loadKey]);

  useEffect(() => {
    if (ctx && shouldLoadOnMount && initialLoadKey.current !== loadKey) {
      initialLoadKey.current = loadKey;
      loadNextPage();
    }
  }, [ctx, loadKey, loadNextPage, shouldLoadOnMount]);

  useEffect(() => {
    const nextRefreshLoadKey = `${loadKey}:${reloadId}`;

    if (!ctx) return;
    if (reloadId <= 0) return;
    if (refreshLoadKey.current === nextRefreshLoadKey) return;

    refreshLoadKey.current = nextRefreshLoadKey;
    refreshComments();
  }, [ctx, loadKey, refreshComments, reloadId]);

  return {
    comments,
    isLoading,
    loadError,
    loadNextPage,
    refreshComments,
  };
}

function mergeCommentIds(
  current: Paged<CommentId> | undefined,
  incoming: Paged<CommentId> | undefined,
  replaceExistingPage: boolean,
): Paged<CommentId> {
  const baseIds = replaceExistingPage ? [] : current?.items ?? [];
  const seen = new Set<CommentId>();
  const items: CommentId[] = [];

  [...baseIds, ...(incoming?.items ?? [])].forEach(id => {
    if (!seen.has(id)) {
      seen.add(id);
      items.push(id);
    }
  });

  return {
    items,
    next_page: incoming?.next_page || null,
  };
}

/* end of useComments.ts */
