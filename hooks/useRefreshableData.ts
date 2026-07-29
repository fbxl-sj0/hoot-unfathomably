/*
    Project: Hoot Mobile
    -------------------

    File: useRefreshableData.ts

    Purpose:

        Coordinate pull-to-refresh style loading state.

    Responsibilities:

        - Track refresh requests
        - Protect state updates after unmount
        - Run caller cleanup when refresh/dependency changes replace a load
        - Expose a reusable refreshing flag

    This file intentionally does NOT contain:

        - screen-specific API calls
        - Redux storage
*/

import { useCallback, useState, useEffect, useRef } from "react";

type RefreshEffectCleanup = () => void;
type RefreshEffect = (
  stopLoading: () => void,
) => void | RefreshEffectCleanup;

export function useRefreshableData(
  effect: RefreshEffect,
  deps: unknown[],
): [boolean, () => void] {
  const [refreshCount, setRefreshCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const depsKey = JSON.stringify(deps);
  const effectRef = useRef(effect);

  useEffect(() => {
    effectRef.current = effect;
  }, [effect]);

  useEffect(() => {
    let isActive = true;
    const cleanup = effectRef.current(() => {
      if (isActive) setIsLoading(false);
    });

    return () => {
      isActive = false;
      cleanup?.();
    };
  }, [refreshCount, depsKey]);

  const refresh = useCallback(() => {
    setRefreshCount(c => c + 1);
    setIsLoading(true);
  }, []);

  return [isLoading, refresh];
}

/* end of useRefreshableData.ts */
