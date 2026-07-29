/*
    Project: Hoot Mobile
    -------------------

    File: SourceListScreen.tsx

    Purpose:

        Browse Lotide collection target source feeds.

    Responsibilities:

        - Gate the screen behind the Lotide 0.18 source-feed capability
        - Load source feed lists with scope, search, and sort filters
        - Navigate to source detail pages
        - Follow and unfollow source feeds from the list

    This file intentionally does NOT contain:

        - Community list fallback behavior
        - Source item reader rendering
        - Private message handling
*/

import Icon from "@expo/vector-icons/Ionicons";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
} from "react-native";
import { Text, View } from "../components/Themed";
import RetryState from "../components/RetryState";
import SuggestLogin from "../components/SuggestLogin";
import {
  supportsCollectionTargets,
} from "../constants/LotideApi";
import {
  MINIMUM_TOUCH_TARGET_SIZE,
  TOUCH_TARGET_HIT_SLOP,
} from "../constants/TouchTargets";
import { useLotideCtx } from "../hooks/useLotideCtx";
import useTheme from "../hooks/useTheme";
import * as LotideService from "../services/LotideService";
import { RootTabScreenProps } from "../types";
import { sourceKindLabel, sourceSoftwareLabel } from "../utils/sourceLabels";

type SourceListState = {
  items: CollectionTargetListItem[];
  pageNumber: number;
  nextPage: string | null;
  totalCount: number;
  scopeTotalCount: number;
  softwareCounts: CollectionTargetSoftwareCount[];
  loadError: string;
  hasLoaded: boolean;
};

const sourceSorts: CollectionTargetSort[] = [
  "alphabetic",
  "latest",
  "items",
  "software",
];

export default function SourceListScreen({
  navigation,
}: RootTabScreenProps<"SourceListScreen">) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [scope, setScope] = useState<CollectionTargetScope>(
    ctx?.login ? "mine" : "everything",
  );
  const [sort, setSort] = useState<CollectionTargetSort>("alphabetic");
  const [software, setSoftware] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [reloadId, setReloadId] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [state, setState] = useState<SourceListState>(() =>
    emptySourceListState(),
  );
  const isRequestingRef = useRef(false);
  const canUseSources = supportsCollectionTargets(ctx?.apiVersion);
  const effectiveScope: CollectionTargetScope =
    ctx?.login || scope !== "mine" ? scope : "everything";

  const loadKey = useMemo(
    () =>
      [
        ctx?.apiUrl ?? "",
        ctx?.login?.user?.id ?? "anonymous",
        canUseSources ? "sources" : "no-sources",
        effectiveScope,
        sort,
        software,
        activeSearch,
        state.pageNumber,
        reloadId,
      ].join("|"),
    [
      activeSearch,
      canUseSources,
      ctx?.apiUrl,
      ctx?.login?.user?.id,
      effectiveScope,
      reloadId,
      software,
      sort,
      state.pageNumber,
    ],
  );

  useEffect(() => {
    if (!ctx?.apiUrl || !canUseSources) return;

    let isActive = true;
    isRequestingRef.current = true;

    LotideService.getCollectionTargets(ctx, {
      scope: effectiveScope,
      software,
      sort,
      search: activeSearch,
      pageNumber: state.pageNumber,
    })
      .then(data => {
        if (!isActive) return;

        setState(current => ({
          ...current,
          items: mergeSourceRows(
            current.items,
            data.items,
            state.pageNumber === 1,
          ),
          nextPage: data.next_page,
          totalCount: data.total_count,
          scopeTotalCount: data.scope_total_count,
          softwareCounts: data.software_counts,
          loadError: "",
          hasLoaded: true,
        }));
      })
      .catch(() => {
        if (!isActive) return;

        setState(current => ({
          ...current,
          nextPage: null,
          loadError: "Cannot load source feeds",
          hasLoaded: true,
        }));
      })
      .finally(() => {
        if (isActive) {
          isRequestingRef.current = false;
          setIsRefreshing(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    activeSearch,
    canUseSources,
    ctx,
    effectiveScope,
    loadKey,
    software,
    sort,
    state.pageNumber,
  ]);

  if (!ctx?.apiUrl) {
    return <SuggestLogin />;
  }

  if (!canUseSources) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.secondaryText }}>
          This Lotide server does not provide source feeds yet.
        </Text>
      </View>
    );
  }

  function resetAndLoad(next: {
    scope?: CollectionTargetScope;
    sort?: CollectionTargetSort;
    software?: string;
    search?: string;
  }) {
    if (next.scope) setScope(next.scope);
    if (next.sort) setSort(next.sort);
    if (next.software) setSoftware(next.software);
    if (next.search !== undefined) setActiveSearch(next.search.trim());
    setState(emptySourceListState());
  }

  function refresh() {
    setIsRefreshing(true);
    setState(current => ({
      ...current,
      pageNumber: 1,
      nextPage: null,
      loadError: "",
      hasLoaded: current.hasLoaded || current.items.length > 0,
    }));
    setReloadId(x => x + 1);
  }

  function loadNextPage() {
    if (isRequestingRef.current || !state.nextPage) return;
    setState(current => ({
      ...current,
      pageNumber: current.pageNumber + 1,
      nextPage: null,
    }));
  }

  function renderItem({ item }: { item: CollectionTargetListItem }) {
    return (
      <SourceRow
        item={item}
        onOpen={() =>
          navigation.navigate("CollectionTarget", {
            id: item.id,
            source: item,
          })
        }
        onChanged={refresh}
      />
    );
  }

  return (
    <FlatList
      testID="source-list"
      style={[styles.root, { backgroundColor: theme.background }]}
      data={state.items}
      keyExtractor={item => String(item.id)}
      renderItem={renderItem}
      refreshing={isRefreshing}
      onRefresh={refresh}
      onEndReachedThreshold={1.2}
      onEndReached={loadNextPage}
      ListHeaderComponent={
        <View style={styles.header}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.secondaryBackground,
                borderColor: theme.tertiaryBackground,
              },
            ]}
          >
            <TextInput
              accessibilityLabel="Search source feeds"
              placeholder="Search feeds"
              placeholderTextColor={theme.placeholderText}
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={() => resetAndLoad({ search: searchText })}
              style={[styles.searchInput, { color: theme.text }]}
            />
            <Pressable
              accessibilityLabel="Search"
              accessibilityRole="button"
              hitSlop={TOUCH_TARGET_HIT_SLOP}
              onPress={() => resetAndLoad({ search: searchText })}
              style={styles.searchButton}
            >
              <Icon name="search-outline" size={22} color={theme.tint} />
            </Pressable>
          </View>
          <SegmentedControls
            scope={effectiveScope}
            sort={sort}
            software={software}
            softwareCounts={state.softwareCounts}
            showMine={!!ctx.login}
            onScope={nextScope => resetAndLoad({ scope: nextScope })}
            onSoftware={nextSoftware =>
              resetAndLoad({ software: nextSoftware })}
            onSort={nextSort => resetAndLoad({ sort: nextSort })}
          />
          <Text style={[styles.countText, { color: theme.secondaryText }]}>
            {sourceCountText(effectiveScope, state.totalCount, !!activeSearch)}
          </Text>
          {state.items.length > 0 && state.loadError ? (
            <RetryState
              compact
              message={state.loadError}
              onRetry={refresh}
              style={styles.inlineError}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        state.hasLoaded ? (
          <View style={styles.empty}>
            {state.loadError ? (
              <RetryState compact message={state.loadError} onRetry={refresh} />
            ) : (
              <Text style={{ color: theme.secondaryText }}>No source feeds yet</Text>
            )}
          </View>
        ) : null
      }
    />
  );
}

function SourceRow({
  item,
  onOpen,
  onChanged,
}: {
  item: CollectionTargetListItem;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const ctx = useLotideCtx();
  const theme = useTheme();
  const [isFollowActionPending, setIsFollowActionPending] = useState(false);
  const isMountedRef = useRef(true);
  const followActionPendingRef = useRef(false);
  const isFollowing = !!item.your_follow;
  const followLabel = item.your_follow?.accepted ? "Unfollow" : "Cancel";
  const pendingFollowLabel = isFollowing
    ? item.your_follow?.accepted
      ? "Unfollowing..."
      : "Canceling..."
    : "Following...";

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      followActionPendingRef.current = false;
    };
  }, []);

  function alertIfMounted(title: string, message?: string) {
    if (!isMountedRef.current) return;

    Alert.alert(title, message);
  }

  function startFollowAction() {
    if (followActionPendingRef.current) return false;

    followActionPendingRef.current = true;
    setIsFollowActionPending(true);
    return true;
  }

  function finishFollowAction() {
    followActionPendingRef.current = false;

    if (isMountedRef.current) {
      setIsFollowActionPending(false);
    }
  }

  async function followOrUnfollow() {
    if (!ctx?.login) return;
    if (!startFollowAction()) return;

    try {
      if (isFollowing) {
        await LotideService.unfollowCollectionTarget(ctx, item.id);

        if (isMountedRef.current) {
          onChanged();
        }
        return;
      }

      const result = await LotideService.followCollectionTarget(ctx, item.id);

      if (!isMountedRef.current) return;

      if (result.accepted === false) {
        alertIfMounted(
          "Follow request sent",
          "The remote feed has not accepted the follow yet.",
        );
      }

      if (isMountedRef.current) {
        onChanged();
      }
    } catch {
      alertIfMounted(
        isFollowing ? "Failed to unfollow feed" : "Failed to follow feed",
      );
    } finally {
      finishFollowAction();
    }
  }

  return (
    <Pressable
      accessibilityLabel={`Open source feed ${item.name}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={[
        styles.row,
        {
          borderBottomColor: theme.secondaryBackground,
        },
      ]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{item.name}</Text>
        <Text style={{ color: theme.secondaryText }}>
          {sourceSoftwareLabel(item.software)} · {sourceKindLabel(item.type)}
        </Text>
        {!!item.summary_excerpt && (
          <Text
            numberOfLines={2}
            style={[styles.summary, { color: theme.secondaryText }]}
          >
            {item.summary_excerpt}
          </Text>
        )}
        <Text style={[styles.meta, { color: theme.secondaryText }]}>
          {sourceItemCountText(item)}
        </Text>
        {!!item.latest_preview_item && (
          <Text
            numberOfLines={1}
            style={[styles.meta, { color: theme.secondaryTint }]}
          >
            Latest: {item.latest_preview_item}
          </Text>
        )}
      </View>
      {!!ctx?.login && (
        <Pressable
          accessibilityLabel={
            isFollowing ? `Unfollow ${item.name}` : `Follow ${item.name}`
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: isFollowActionPending }}
          disabled={isFollowActionPending}
          hitSlop={TOUCH_TARGET_HIT_SLOP}
          onPress={() => {
            void followOrUnfollow();
          }}
          style={[
            styles.actionButton,
            {
              backgroundColor: isFollowing
                ? theme.secondaryBackground
                : theme.tint,
              opacity: isFollowActionPending ? 0.72 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: isFollowing ? theme.text : "#111827",
              fontWeight: "600",
            }}
          >
            {isFollowActionPending
              ? pendingFollowLabel
              : isFollowing
                ? followLabel
                : "Follow"}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function SegmentedControls({
  scope,
  sort,
  software,
  softwareCounts,
  showMine,
  onScope,
  onSoftware,
  onSort,
}: {
  scope: CollectionTargetScope;
  sort: CollectionTargetSort;
  software: string;
  softwareCounts: CollectionTargetSoftwareCount[];
  showMine: boolean;
  onScope: (scope: CollectionTargetScope) => void;
  onSoftware: (software: string) => void;
  onSort: (sort: CollectionTargetSort) => void;
}) {
  const theme = useTheme();
  const scopes: CollectionTargetScope[] = showMine
    ? ["mine", "everything"]
    : ["everything"];

  return (
    <>
      <View style={styles.segmentRow}>
        {scopes.map(value => (
          <FilterChip
            key={value}
            label={value === "mine" ? "Mine" : "Everything"}
            selected={scope === value}
            onPress={() => onScope(value)}
          />
        ))}
      </View>
      <View style={styles.segmentRow}>
        {sourceSorts.map(value => (
          <FilterChip
            key={value}
            label={sourceSortLabel(value)}
            selected={sort === value}
            onPress={() => onSort(value)}
          />
        ))}
      </View>
      {softwareCounts.length > 0 ? (
        <View style={styles.segmentRow}>
          <FilterChip
            label="All software"
            selected={software === "all"}
            onPress={() => onSoftware("all")}
          />
          {softwareCounts.map(value => (
            <FilterChip
              key={value.software}
              label={`${sourceSoftwareLabel(value.software)} (${value.count})`}
              selected={software === value.software}
              onPress={() => onSoftware(value.software)}
            />
          ))}
        </View>
      ) : null}
      <View
        style={[
          styles.rule,
          { backgroundColor: theme.secondaryBackground },
        ]}
      />
    </>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected
            ? theme.tint
            : theme.secondaryBackground,
        },
      ]}
    >
      <Text style={{ color: selected ? "#111827" : theme.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

function emptySourceListState(): SourceListState {
  return {
    items: [],
    pageNumber: 1,
    nextPage: null,
    totalCount: 0,
    scopeTotalCount: 0,
    softwareCounts: [],
    loadError: "",
    hasLoaded: false,
  };
}

function mergeSourceRows(
  current: CollectionTargetListItem[],
  incoming: CollectionTargetListItem[],
  replace: boolean,
) {
  if (replace) return incoming;

  const seen = new Set(current.map(item => item.id));
  const out = [...current];

  incoming.forEach(item => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  });

  return out;
}

function sourceCountText(
  scope: CollectionTargetScope,
  count: number,
  searchActive: boolean,
) {
  if (scope === "mine") {
    if (count === 1) return searchActive ? "1 matching followed feed" : "1 followed feed";
    return searchActive
      ? `${count} matching followed feeds`
      : `${count} followed feeds`;
  }

  if (count === 1) return searchActive ? "1 matching feed" : "1 feed";
  return searchActive ? `${count} matching feeds` : `${count} feeds`;
}

function sourceItemCountText(item: CollectionTargetListItem) {
  if (item.total_items === 1) return "1 reported item";
  if (typeof item.total_items === "number" && item.total_items > 1) {
    return `${item.total_items} reported items`;
  }

  return `${Math.max(0, item.preview_item_count)} preview items cached`;
}

function sourceSortLabel(sort: CollectionTargetSort) {
  switch (sort) {
    case "latest":
      return "Latest";
    case "items":
      return "Items";
    case "software":
      return "Software";
    case "alphabetic":
    default:
      return "A-Z";
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    padding: 16,
  },
  searchBar: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth || 1,
    flexDirection: "row",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
  },
  searchButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: MINIMUM_TOUCH_TARGET_SIZE,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rule: {
    height: StyleSheet.hairlineWidth || 1,
    marginTop: 16,
  },
  countText: {
    marginTop: 14,
  },
  row: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth || 1,
    flexDirection: "row",
    padding: 16,
  },
  rowMain: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  summary: {
    lineHeight: 20,
    marginTop: 8,
  },
  meta: {
    fontSize: 13,
    marginTop: 6,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET_SIZE,
    minWidth: 78,
    paddingHorizontal: 12,
  },
  empty: {
    padding: 24,
  },
  inlineError: {
    marginTop: 14,
  },
});

/* end of SourceListScreen.tsx */
