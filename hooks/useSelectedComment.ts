/*
    Project: Hoot Mobile
    -------------------

    File: useSelectedComment.ts

    Purpose:

        Store the currently expanded comment action target.

    Responsibilities:

        - Read selected comment id from Redux
        - Dispatch selection changes

    This file intentionally does NOT contain:

        - comment fetching
        - navigation
*/

import { useDispatch, useSelector } from "react-redux";
import { setSelectedComment } from "../slices/commentSlice";
import { RootState } from "../store/reduxStore";

export default function useSelectedComment(): [
  CommentId | undefined,
  (id?: CommentId) => void,
] {
  const dispatch = useDispatch();

  const selectedComment = useSelector(
    (state: RootState) => state.comments.selectedComment,
  );

  function set(id?: CommentId) {
    dispatch(setSelectedComment(id));
  }

  return [selectedComment, set];
}

/* end of useSelectedComment.ts */
