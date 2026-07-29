/*
    Project: Hoot Mobile
    -------------------

    File: useComment.ts

    Purpose:

        Read and refresh a single comment from Redux and Lotide.

    Responsibilities:

        - Select cached comment data
        - Fetch missing comments
        - Support explicit reload attempts
        - Ignore stale responses from replaced requests
        - Ignore responses after the hook unmounts

    This file intentionally does NOT contain:

        - comment child pagination
        - post fetching
*/

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/reduxStore";
import { useLotideCtx } from "./useLotideCtx";
import * as LotideService from "../services/LotideService";
import { setCommentMulti } from "../slices/commentSlice";

/**
 * Gets a single comment
 *
 * For child comments, see useComments
 */
export default function useComment(
  commentId?: CommentId,
  reloadId = 0,
): Comment | undefined {
  const dispatch = useDispatch();
  const comment: Comment | undefined = useSelector((state: RootState) =>
    commentId ? state.comments.comments[commentId] : undefined,
  );
  const ctx = useLotideCtx();
  const loadKey = `${commentId ?? "none"}:${reloadId}`;
  const requestScopeKey = [
    ctx?.apiUrl ?? "",
    ctx?.login?.token ?? "anonymous",
    loadKey,
  ].join("|");
  const lastRequestedLoadKey = useRef("");
  const activeRequestKey = useRef("");

  useEffect(() => {
    if (!ctx || !commentId) {
      activeRequestKey.current = "";
      return;
    }

    if (comment && reloadId === 0) {
      lastRequestedLoadKey.current = loadKey;
      activeRequestKey.current = "";
      return;
    }

    if (comment && lastRequestedLoadKey.current === loadKey) return;

    lastRequestedLoadKey.current = loadKey;
    activeRequestKey.current = requestScopeKey;

    LotideService.getComment(ctx, commentId)
      .then(comments => {
        if (activeRequestKey.current !== requestScopeKey) return;
        dispatch(setCommentMulti(comments));
      })
      .catch(() => undefined);

    return () => {
      if (activeRequestKey.current === requestScopeKey) {
        activeRequestKey.current = "";
      }
    };
  }, [comment, commentId, ctx, dispatch, loadKey, reloadId, requestScopeKey]);

  return (
    comment && {
      ...comment,
      replies: undefined,
    }
  );
}

/* end of useComment.ts */
