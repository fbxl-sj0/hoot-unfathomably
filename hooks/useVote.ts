/*
    Project: Hoot Mobile
    -------------------

    File: useVote.ts

    Purpose:

        Manage optimistic post and comment voting.

    Responsibilities:

        - Determine current vote state
        - Apply and remove votes through Lotide
        - Update Redux score state optimistically

    This file intentionally does NOT contain:

        - vote button presentation
        - authentication prompts
*/

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Alert } from "react-native";
import { setPostVote } from "../slices/postSlice";
import { AppDispatch } from "../store/reduxStore";
import * as LotideService from "../services/LotideService";
import { useLotideCtx } from "./useLotideCtx";
import { setCommentVote } from "../slices/commentSlice";
import { getErrorMessage } from "../utils/error";

export default function useVote(type: ContentType, content: Post | Comment) {
  const isUpvoted = !!content.your_vote;
  const dispatch = useDispatch<AppDispatch>();
  const ctx = useLotideCtx();
  const isMountedRef = useRef(true);
  const isVotePendingRef = useRef(false);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const dispatchVote = useCallback(
    (vote: boolean) => {
      if (type === "post") {
        dispatch(setPostVote({ id: content.id, vote }));
      } else {
        dispatch(setCommentVote({ id: content.id, vote }));
      }
    },
    [content.id, dispatch, type],
  );

  const setPending = useCallback((pending: boolean) => {
    isVotePendingRef.current = pending;

    if (isMountedRef.current) {
      setIsVoting(pending);
    }
  }, []);

  const submitVote = useCallback(
    (vote: boolean) => {
      if (!ctx?.login || isVotePendingRef.current) return;

      const previousVote = isUpvoted;

      setPending(true);
      dispatchVote(vote);

      const request =
        type === "post"
          ? vote
            ? LotideService.applyVote(ctx, content.id)
            : LotideService.removeVote(ctx, content.id)
          : vote
            ? LotideService.applyCommentVote(ctx, content.id)
            : LotideService.removeCommentVote(ctx, content.id);

      request
        .catch(error => {
          /*
              Voting is intentionally optimistic because the gesture is tiny
              and frequent. If Lotide rejects the mutation, put the cached
              score back where it was. A late failure after unmount still
              rolls back global state, but it should not surface an alert on
              a screen the user has already left.
          */
          dispatchVote(previousVote);

          if (isMountedRef.current) {
            Alert.alert("Vote failed", getErrorMessage(error));
          }
        })
        .finally(() => {
          setPending(false);
        });
    },
    [content.id, ctx, dispatchVote, isUpvoted, setPending, type],
  );

  function addVote() {
    submitVote(true);
  }

  function removeVote() {
    submitVote(false);
  }

  return {
    isUpvoted,
    isVoting,
    addVote,
    removeVote,
  };
}

/* end of useVote.ts */
