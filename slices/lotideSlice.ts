/*
    Project: Hoot Mobile
    -------------------

    File: lotideSlice.ts

    Purpose:

        Store the active Lotide connection context.

    Responsibilities:

        - Hold API URL and login state
        - Expose context update actions

    This file intentionally does NOT contain:

        - persistent storage
        - network requests
*/

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type LotideState = {
  ctx: LotideContext | null;
};

const initialState: LotideState = {
  ctx: null,
};

export const voteSlice = createSlice({
  name: "lotide",
  initialState,
  reducers: {
    setCtx: (state, action: PayloadAction<LotideContext>) => {
      state.ctx = action.payload;
    },
  },
});

// Action creators are generated for each case reducer function
export const { setCtx } = voteSlice.actions;

export default voteSlice.reducer;

/* end of lotideSlice.ts */
