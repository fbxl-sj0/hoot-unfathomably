/*
    Project: Hoot Mobile
    -------------------

    File: useFeed.ts

    Purpose:

        Load paged post feeds from Lotide.

    Responsibilities:

        - Fetch feed pages for sort, community, and follow filters
        - Store returned posts
        - Expose refresh and failure state
        - Ignore responses after replacement or unmount

    This file intentionally does NOT contain:

        - post display
        - comment loading
*/

import { useEffect, useMemo, useRef, useState } from "react";
import { useLotideCtx } from "./useLotideCtx";
import * as LotideService from "../services/LotideService";
import { useDispatch } from "react-redux";
import { setPostMulti } from "../slices/postSlice";

export type UseFeedParams = {
  sort?: SortOption;
  inYourFollows?: boolean;
  communityId?: CommunityId;
  enabled?: boolean;
};

type FeedState = {
  key: string;
  postIds: PostId[];
  page: string | null;
  nextPage: string | null;
  resetId: number;
  loadError: string;
};

export default function useFeed(
  params: UseFeedParams,
): [PostId[], () => void, () => void, string] {
  const dispatch = useDispatch();
  const ctx = useLotideCtx();
  const feedKey = useMemo(
    () =>
      [
        ctx?.apiUrl ?? "",
        ctx?.login?.user?.id ?? "anonymous",
        params.sort ?? "hot",
        feedFollowFilterKey(params.inYourFollows),
        params.communityId ?? "no-community",
        params.enabled === false ? "disabled" : "enabled",
      ].join("|"),
    [
      ctx?.apiUrl,
      ctx?.login?.user?.id,
      params.communityId,
      params.enabled,
      params.inYourFollows,
      params.sort,
    ],
  );
  const [feedState, setFeedState] = useState<FeedState>(() =>
    emptyFeedState(feedKey),
  );
  const activeFeedState =
    feedState.key === feedKey ? feedState : emptyFeedState(feedKey);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!ctx) return;
    if (params.enabled === false) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const page = activeFeedState.page;

    LotideService.getPosts(
      ctx,
      page,
      params.sort,
      params.inYourFollows,
      params.communityId,
    ).then(posts => {
      if (requestId !== requestIdRef.current) return;

      dispatch(setPostMulti({ posts: posts.items }));
      setFeedState(current => {
        const base =
          current.key === feedKey ? current : emptyFeedState(feedKey);

        return {
          ...base,
          postIds: mergePostIds(
            base.postIds,
            posts.items.map(p => p.id),
            page === null,
          ),
          nextPage: posts.next_page,
          loadError: "",
        };
      });
    }).catch(() => {
      if (requestId !== requestIdRef.current) return;

      setFeedState(current => ({
        ...(current.key === feedKey ? current : emptyFeedState(feedKey)),
        nextPage: null,
        loadError: "Cannot load posts",
      }));
    });

    return () => {
      if (requestIdRef.current === requestId) {
        requestIdRef.current = requestId + 1;
      }
    };
  }, [
    activeFeedState.page,
    activeFeedState.resetId,
    ctx,
    dispatch,
    feedKey,
    params.enabled,
    params.communityId,
    params.inYourFollows,
    params.sort,
  ]);

  function loadNextPage() {
    setFeedState(current => {
      const base = current.key === feedKey ? current : emptyFeedState(feedKey);
      if (base.nextPage === null) return current;

      return {
        ...base,
        page: base.nextPage,
        nextPage: null,
      };
    });
  }

  function reset() {
    requestIdRef.current += 1;
    setFeedState(current => ({
      ...emptyFeedState(feedKey),
      resetId: current.key === feedKey ? current.resetId + 1 : 1,
    }));
  }

  return [
    activeFeedState.postIds,
    loadNextPage,
    reset,
    activeFeedState.loadError,
  ];
}

function feedFollowFilterKey(value: boolean | undefined): string {
  if (value === true) return "follows";
  if (value === false) return "not-follows";
  return "unspecified";
}

function emptyFeedState(key: string): FeedState {
  return {
    key,
    postIds: [],
    page: null,
    nextPage: null,
    resetId: 0,
    loadError: "",
  };
}

function mergePostIds(
  currentIds: PostId[],
  incomingIds: PostId[],
  replace: boolean,
): PostId[] {
  if (replace) return incomingIds;

  const seen = new Set(currentIds);
  const out = [...currentIds];

  incomingIds.forEach(id => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  });

  return out;
}

/* end of useFeed.ts */
