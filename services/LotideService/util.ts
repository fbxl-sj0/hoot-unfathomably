/*
    Project: Hoot Mobile
    -------------------

    File: util.ts

    Purpose:

        Provides core utility functions and types for interacting with
        the Lotide API, including request handling and authentication.

    Responsibilities:

        • Define core request methods and types
        • Implement the base API request function (lotideRequest)
        • Handle authentication header generation
        • Bound stalled requests so screens can recover
        • Provide error logging for API interactions

    This file intentionally does NOT contain:

        • Specific API endpoint implementations (see Post.ts, User.ts, etc.)
        • Business logic or state management
*/

import { logError } from "../../utils/debugLog";

/* ------------------------------------------------------------------------- */
/* Types and Interfaces                                                      */
/* ------------------------------------------------------------------------- */

export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type LotideError = Error & {
  body?: string;
  status?: number;
  path?: string;
  method?: RequestMethod;
};

export type JsonResponse = Response & {
  json(): Promise<unknown>;
};

/*
    Mobile radios and federated servers can leave a fetch promise pending for a
    very long time. Thirty seconds keeps slow real-world requests possible while
    still letting screens leave their loading state and expose retry UI.
*/
export const LOTIDE_REQUEST_TIMEOUT_MS = 30_000;

type RequestTimeout = {
  error: LotideError;
  promise: Promise<never>;
  signal?: AbortSignal;
  clear: () => void;
  didTimeout: () => boolean;
};

/* ------------------------------------------------------------------------- */
/* Core Logic                                                                */
/* ------------------------------------------------------------------------- */

/**
    Checks if the current context has both an API URL and login information.
*/
export function hasLogin(ctx: LotideContext): boolean {
  return !!ctx.apiUrl && !!ctx.login;
}

export function isLotideHttpError(error: unknown): error is LotideError {
  if (!(error instanceof Error)) return false;

  const status = (error as LotideError).status;
  return typeof status === "number";
}

export function isAuthenticationError(error: unknown): boolean {
  if (!isLotideHttpError(error)) return false;

  return error.status === 401 || error.status === 403;
}

/**
    Performs a request to the Lotide API.

    Authentication:
        By default, requests include a Bearer token in the Authorization header.
        This can be bypassed by setting noLogin to true for public endpoints.

    Error Handling:
        If the response is not OK, the function throws the response text.
        Errors are routed through the central diagnostic logger with request
        details that are useful in device logs.

    Timeout:
        Fetch does not guarantee that a stalled request will ever reject. Hoot
        therefore races each request against a timer and uses AbortController
        when the platform provides it so the underlying request can be stopped.
*/
export async function lotideRequest(
  ctx: LotideContext,
  method: RequestMethod,
  path: string,
  body?: unknown,
  noLogin: boolean = false,
): Promise<JsonResponse> {
  if (!ctx.apiUrl) throw new Error("No API url");
  if (!noLogin && !ctx.login?.token) throw new Error("Not logged in");

  const url = buildLotideEndpointUrl(ctx.apiUrl, path);
  const requestTimeout = createRequestTimeout(url, method);
  const requestOptions: RequestInit = {
    method,
    headers: buildHeaders(ctx),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  if (requestTimeout.signal) {
    requestOptions.signal = requestTimeout.signal;
  }

  /*
     Fetch API interaction
     The Lotide API expects JSON bodies and returns JSON responses.
  */
  const requestPromise = fetch(url, requestOptions)
    .then(async res => {
      if (res.ok) {
        return res;
      } else {
        const errorBody = await res.text();
        const err = new Error(errorBody || "Request failed") as LotideError;
        err.status = res.status;
        err.body = errorBody;
        err.path = url;
        err.method = method;
        throw err;
      }
    });

  return Promise.race([
    requestPromise,
    requestTimeout.promise,
  ])
    .catch(e => {
      const error = requestTimeout.didTimeout() ? requestTimeout.error : e;

      logError(`Lotide service request failed: ${method} ${url}`, error);
      throw error;
    })
    .finally(() => {
      requestTimeout.clear();
    });
}

/* ------------------------------------------------------------------------- */
/* Helper Functions                                                          */
/* ------------------------------------------------------------------------- */

/**
    Builds the standard headers for a Lotide API request.
*/
export function buildHeaders(ctx: LotideContext): HeadersInit | undefined {
  return ctx.login?.token !== undefined
    ? {
        Authorization: `Bearer ${ctx.login.token}`,
        "Content-Type": "application/json",
      }
    : undefined;
}

export function normalizeLotideApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, "");
}

function buildLotideEndpointUrl(apiUrl: string, path: string): string {
  const normalizedApiUrl = normalizeLotideApiUrl(apiUrl);
  const normalizedPath = path.replace(/^\/+/, "");

  return `${normalizedApiUrl}/${normalizedPath}`;
}

function createRequestTimeout(
  url: string,
  method: RequestMethod,
): RequestTimeout {
  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : undefined;
  let didTimeout = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const error = new Error(
    "The Lotide server did not respond within 30 seconds.",
  ) as LotideError;

  error.path = url;
  error.method = method;

  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      didTimeout = true;
      controller?.abort();
      reject(error);
    }, LOTIDE_REQUEST_TIMEOUT_MS);
  });

  return {
    error,
    promise,
    signal: controller?.signal,
    clear: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    didTimeout: () => didTimeout,
  };
}

export async function readJson(response: JsonResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("The Lotide server returned invalid JSON.");
  }
}

/* end of util.ts */
