/*
    Project: Hoot Mobile
    -------------------

    File: useLotideCtx.ts

    Purpose:

        Read the active Lotide connection context.

    Responsibilities:

        - Select the current API URL and login state from Redux

    This file intentionally does NOT contain:

        - context persistence
        - login/logout actions
*/

import { useSelector } from "react-redux";
import { RootState } from "../store/reduxStore";

export function useLotideCtx() {
  const ctx = useSelector((state: RootState) => state.lotide.ctx);
  return ctx;
}

/* end of useLotideCtx.ts */
