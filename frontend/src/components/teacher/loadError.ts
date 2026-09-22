// ─── Naming a failed dashboard load ─────────────────────────────────────────
//
// "We couldn't load your dashboard" is true of every failure mode and useful
// for none of them. A teacher seeing it can't tell whether to wait, retry, or
// call someone; and nobody looking at a screenshot of it can tell either —
// which is exactly the position this page left us in.
//
// Each mode gets its own sentence, plus a short technical tail that names the
// status or code so a screenshot is enough to diagnose the next one.
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadFailure {
  /** What the teacher should understand and do. */
  message: string;
  /** Status/code, for a screenshot to be worth something. */
  detail: string;
  /** Whether retrying stands a reasonable chance. */
  retryable: boolean;
}

export const describeLoadError = (error: unknown): LoadFailure => {
  const err = error as {
    code?: string;
    message?: string;
    response?: { status?: number };
  };
  const status = err?.response?.status;

  // Axios aborts on its own timeout with ECONNABORTED and no response.
  if (
    !status &&
    (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message ?? ""))
  ) {
    return {
      message:
        "Your dashboard took too long to build. The server is busy — try again in a moment.",
      detail: "request timed out",
      retryable: true,
    };
  }

  if (!status) {
    return {
      message:
        "We couldn't reach the server. Check your connection and try again.",
      detail: err?.code ? `network error (${err.code})` : "network error",
      retryable: true,
    };
  }

  if (status === 404) {
    // Almost always a half-finished deploy: the app is newer than the API.
    return {
      message:
        "This server doesn't have the teacher dashboard yet. It needs the matching backend release.",
      detail: "404 — endpoint not found",
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      message: "Your account doesn't have access to the teacher dashboard.",
      detail: "403 — forbidden",
      retryable: false,
    };
  }

  // 401 never reaches here: the shared axios interceptor clears the token and
  // sends the browser to the login page instead.
  if (status >= 500) {
    return {
      message:
        "The server hit an error building your dashboard. If it keeps happening, report it.",
      detail: `${status} — server error`,
      retryable: true,
    };
  }

  return {
    message: "We couldn't load your dashboard.",
    detail: `${status}`,
    retryable: true,
  };
};
