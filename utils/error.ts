/*
    Project: Hoot Mobile
    -------------------

    File: error.ts

    Purpose:

        Convert unknown thrown values into user-facing error text.

    Responsibilities:

        - Preserve normal Error messages
        - Extract message fields from structured thrown values
        - Provide a stable fallback for undefined or primitive values

    This file intentionally does NOT contain:

        - alert presentation
        - logging policy
        - Lotide API response validation
*/

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;

  if (error instanceof Error) return error.message || "Unknown error";

  if (error && typeof error === "object") {
    if (typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }

    return JSON.stringify(error);
  }

  if (error === undefined) return "Unknown error";

  return `${error}`;
}

/* end of error.ts */
