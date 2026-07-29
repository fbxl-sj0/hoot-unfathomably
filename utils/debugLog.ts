/*
    Project: Hoot Mobile
    -------------------

    File: debugLog.ts

    Purpose:

        Centralize app diagnostic logging.

    Responsibilities:

        - Route app warnings and errors through one formatting point
        - Keep diagnostic output easy to find in adb logcat and test logs
        - Protect app behavior if the host logger itself fails

    This file intentionally does NOT contain:

        - User-facing alerts
        - Remote telemetry transport
        - Persistent log storage
*/

type DiagnosticLevel = "warning" | "error";

export function logWarning(message: string, ...details: unknown[]) {
  logDiagnostic("warning", message, details);
}

export function logError(message: string, ...details: unknown[]) {
  logDiagnostic("error", message, details);
}

function logDiagnostic(
  level: DiagnosticLevel,
  message: string,
  details: unknown[],
) {
  const label = message.trim() || "Diagnostic message";
  const output: unknown[] = [`[Hoot] ${label}`, ...details];

  try {
    if (level === "warning") {
      console.warn(...output);
      return;
    }

    console.error(...output);
  } catch {
    /*
        Diagnostic logging is deliberately best-effort. A broken console
        implementation must not break startup, background polling, or recovery.
    */
  }
}

/* end of debugLog.ts */
